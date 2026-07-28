/**
 * Shiprocket Shipping API routes — mounted at /api/shipping.
 *
 * IMPORTANT URL constraint from SR docs: webhook URLs must NOT contain
 * the keywords "shiprocket", "kartrocket", "sr", or "kr". So this is
 * /api/shipping (not /api/shiprocket).
 *
 * Phase 1 endpoints:
 *   GET  /rates?pickup_pincode=&delivery_pincode=&weight=&cod=
 *     Public — used by the storefront to show courier options.
 *   GET  /pickup-locations
 *     Admin — list registered pickup addresses (so we can confirm the
 *     "warehouse" nickname matches what's set up in SR Dashboard).
 *   GET  /health
 *     Quick auth + reachability check. Hits SR with a known-good rate
 *     query and returns the result. Use to confirm credentials work.
 */
import { Router } from 'express';
import { Op } from 'sequelize';
import { protect, admin } from '../middleware/auth.js';
import { Order } from '../models/index.js';
import { srFetch, SHIPROCKET_SHIP_ENABLED } from '../utils/shipAuth.js';
import { sendOrderStatusUpdate } from '../services/emailService.js';
import {
  autoCreateShipment,
  cancelShipment,
  getLabel,
  getInvoice,
  getManifest,
  refreshTracking,
} from '../services/shipping.js';

const router = Router();

const WEBHOOK_TOKEN = process.env.SHIPROCKET_SHIP_WEBHOOK_TOKEN || '';

/**
 * Map a Shiprocket status_id to our internal orderStatus enum.
 * Anything we don't recognise leaves orderStatus alone (returns null).
 *
 * Common SR status_id -> label (best-effort, drawn from docs sample +
 * standard SR status book — extend as we see new codes in production):
 */
const STATUS_MAP = {
  5: 'confirmed',     // MANIFEST GENERATED
  6: 'shipped',       // SHIPPED
  17: 'shipped',      // OUT FOR DELIVERY
  18: 'shipped',      // IN TRANSIT
  20: 'shipped',      // (also IN TRANSIT in sample webhook)
  42: 'shipped',      // PICKED UP
  7: 'delivered',     // DELIVERED
  8: 'cancelled',     // CANCELED
  19: 'cancelled',    // CANCELLATION REQUESTED
  9: 'cancelled',     // RTO IN TRANSIT
  10: 'cancelled',    // RTO DELIVERED
  16: 'cancelled',    // LOST
};

/** Customer-friendly transitions that should trigger an email. */
const NOTIFY_LABELS = new Set(['PICKED UP', 'OUT FOR DELIVERY', 'DELIVERED', 'RTO DELIVERED']);

// Default pickup pincode for rate quotes when caller doesn't supply one
// (i.e. the storefront fetches rates before the customer has a pincode).
const DEFAULT_PICKUP_PINCODE = process.env.SHIPROCKET_SHIP_PICKUP_PINCODE || '673638'; // Kondotty

router.get('/health', async (req, res) => {
  if (!SHIPROCKET_SHIP_ENABLED) {
    return res.status(503).json({ ok: false, message: 'Shiprocket Shipping disabled (no SHIPROCKET_SHIP_EMAIL/PASSWORD)' });
  }
  try {
    // A known-good rate query: Kondotty (673638) -> Bangalore (560001), 0.5 kg, prepaid.
    const params = new URLSearchParams({
      pickup_postcode: DEFAULT_PICKUP_PINCODE,
      delivery_postcode: '560001',
      weight: '0.5',
      cod: '0',
    });
    const { ok, status, data } = await srFetch(`/courier/serviceability/?${params}`);
    res.json({
      ok,
      status,
      sample_couriers: data?.data?.available_courier_companies?.slice(0, 3).map((c) => ({
        name: c.courier_name,
        rate: c.rate,
        etd: c.etd,
      })) || [],
      message: ok
        ? 'Auth + serviceability working'
        : `SR returned ${status}: ${data?.message || JSON.stringify(data).slice(0, 200)}`,
    });
  } catch (err) {
    console.error('[shipping] /health error:', err);
    res.status(500).json({ ok: false, message: err.message });
  }
});

router.get('/rates', async (req, res) => {
  try {
    const pickup = String(req.query.pickup_pincode || DEFAULT_PICKUP_PINCODE);
    const delivery = String(req.query.delivery_pincode || '').trim();
    const weight = parseFloat(req.query.weight) || 0.5;   // kg
    const cod = req.query.cod === '1' || req.query.cod === 'true' ? 1 : 0;

    if (!/^\d{6}$/.test(delivery)) {
      return res.status(400).json({ message: 'delivery_pincode required (6 digits)' });
    }

    const params = new URLSearchParams({
      pickup_postcode: pickup,
      delivery_postcode: delivery,
      weight: String(weight),
      cod: String(cod),
    });

    const { ok, status, data } = await srFetch(`/courier/serviceability/?${params}`);
    if (!ok) {
      return res.status(502).json({ message: 'Shiprocket rejected the rate query', detail: data });
    }

    const couriers = data?.data?.available_courier_companies || [];
    // Compress to a frontend-friendly shape, sorted by price.
    const rates = couriers
      .map((c) => ({
        courier_id: c.courier_company_id,
        courier_name: c.courier_name,
        rate: parseFloat(c.rate) || 0,
        cod_charges: parseFloat(c.cod_charges) || 0,
        freight_charge: parseFloat(c.freight_charge) || 0,
        estimated_delivery_days: c.estimated_delivery_days || c.etd_hours,
        etd: c.etd,
        rating: c.rating,
      }))
      .sort((a, b) => a.rate - b.rate);

    res.json({
      pickup_pincode: pickup,
      delivery_pincode: delivery,
      weight,
      cod,
      cheapest: rates[0] || null,
      rates,
    });
  } catch (err) {
    console.error('[shipping] /rates error:', err);
    res.status(500).json({ message: err.message });
  }
});

/**
 * Tracking webhook from Shiprocket.
 *
 * Auth: validates `x-api-key` against SHIPROCKET_SHIP_WEBHOOK_TOKEN env.
 * (Shiprocket doesn't HMAC-sign — security is the shared header token
 * configured in their dashboard.) Set the same value in both places.
 *
 * SR retries on non-2xx, so we always return 200 once we've ack'd —
 * processing errors are logged but not surfaced.
 */
router.post('/webhook/status', async (req, res) => {
  try {
    if (WEBHOOK_TOKEN) {
      const provided = req.get('x-api-key') || '';
      if (provided !== WEBHOOK_TOKEN) {
        console.warn('[shipping] webhook x-api-key mismatch');
        return res.status(401).json({ message: 'Invalid x-api-key' });
      }
    }

    const p = req.body || {};
    const awb = p.awb || p.awb_code;
    const srOrderId = p.sr_order_id || p.order_id_sr;

    // Find our order by AWB first, then by srOrderId.
    let order = null;
    if (awb) {
      order = await Order.findOne({
        where: { [Op.or]: [{ trackingNumber: awb }] },
      });
    }
    if (!order && awb) {
      // Fallback — search inside JSON shippingMeta.
      const all = await Order.findAll({ where: { shippingMeta: { [Op.ne]: null } } });
      order = all.find((o) => o.shippingMeta?.awb === awb);
    }
    if (!order && srOrderId) {
      const all = await Order.findAll({ where: { shippingMeta: { [Op.ne]: null } } });
      order = all.find((o) => String(o.shippingMeta?.srOrderId) === String(srOrderId));
    }

    if (!order) {
      console.warn(`[shipping] webhook for unknown awb=${awb} sr_order_id=${srOrderId}`);
      // Still return 200 so SR doesn't retry forever.
      return res.json({ ok: true, matched: false });
    }

    const previousStatusId = order.shippingMeta?.currentStatusId;
    const newStatusId = parseInt(p.current_status_id || p.shipment_status_id, 10);
    const newLabel = (p.current_status || p.shipment_status || '').toUpperCase();

    // Persist the webhook fields onto Order.shippingMeta + scans history.
    const meta = {
      ...(order.shippingMeta || {}),
      awb: awb || order.shippingMeta?.awb,
      srOrderId: srOrderId || order.shippingMeta?.srOrderId,
      courierName: p.courier_name || order.shippingMeta?.courierName,
      currentStatus: newLabel || order.shippingMeta?.currentStatus,
      currentStatusId: newStatusId || order.shippingMeta?.currentStatusId,
      lastWebhookAt: new Date().toISOString(),
      etd: p.etd || order.shippingMeta?.etd,
      pickupScheduledDate: p.pickup_scheduled_date || order.shippingMeta?.pickupScheduledDate,
      podStatus: p.pod_status || order.shippingMeta?.podStatus,
      pod: p.pod || order.shippingMeta?.pod,
      scans: Array.isArray(p.scans) ? p.scans.map((s) => ({
        date: s.date,
        status: s.status,
        activity: s.activity,
        location: s.location,
        srStatus: s['sr-status'],
        srStatusLabel: s['sr-status-label'],
      })) : (order.shippingMeta?.scans || []),
    };

    const orderStatusUpdate = STATUS_MAP[newStatusId];
    const updates = { shippingMeta: meta };
    if (orderStatusUpdate && orderStatusUpdate !== order.orderStatus) {
      updates.orderStatus = orderStatusUpdate;
    }
    await order.update(updates);

    // Email customer on key transitions (only when status_id actually changed).
    if (newStatusId !== previousStatusId && NOTIFY_LABELS.has(newLabel)) {
      const recipient = order.guestEmail
        || (order.userId ? (await order.getUser?.())?.email : null);
      if (recipient) {
        sendOrderStatusUpdate(order.toJSON(), recipient).catch((e) =>
          console.error('[shipping] status-update email failed:', e.message)
        );
      }
    }

    console.log(`[shipping] webhook: ${order.orderNumber} -> ${newLabel} (#${newStatusId})${orderStatusUpdate ? ` [orderStatus=${orderStatusUpdate}]` : ''}`);
    res.json({ ok: true, matched: true, orderNumber: order.orderNumber });
  } catch (err) {
    console.error('[shipping] webhook error:', err);
    // Return 200 so SR doesn't retry — log + investigate.
    res.json({ ok: false, error: err.message });
  }
});

// Admin only — useful one-time check to confirm "warehouse" nickname is registered.
router.get('/pickup-locations', protect, admin, async (req, res) => {
  try {
    const { ok, status, data } = await srFetch('/settings/company/pickup');
    if (!ok) return res.status(502).json({ message: 'SR rejected', detail: data });
    res.json(data?.data || data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// =====================================================================
// Admin per-order shipping operations.
// All require admin/staff with 'orders' permission.
// =====================================================================

async function findOrder(req, res) {
  const id = parseInt(req.params.orderId, 10);
  if (!id) {
    res.status(400).json({ message: 'Invalid order id' });
    return null;
  }
  const order = await Order.findByPk(id);
  if (!order) {
    res.status(404).json({ message: 'Order not found' });
    return null;
  }
  return order;
}

// Trigger or retry shipment creation. Resets prior error state.
router.post('/orders/:orderId/create', protect, admin, async (req, res) => {
  try {
    const order = await findOrder(req, res);
    if (!order) return;
    // Clear prior error so autoCreateShipment isn't seen as already-tried.
    // If a shipment was partially created, idempotency still keeps it.
    const meta = await autoCreateShipment(order);
    await order.reload();
    res.json({
      ok: !!order.shippingMeta?.shipmentId,
      shippingMeta: order.shippingMeta,
      message: order.shippingMeta?.awb
        ? `AWB ${order.shippingMeta.awb} (${order.shippingMeta.courierName})`
        : order.shippingMeta?.shipmentId
          ? 'Shipment created — AWB still pending. Use Retry AWB.'
          : (order.shippingMeta?.lastError || 'Create failed'),
    });
  } catch (err) {
    console.error('[shipping] admin create error:', err);
    res.status(500).json({ message: err.message });
  }
});

router.post('/orders/:orderId/cancel', protect, admin, async (req, res) => {
  try {
    const order = await findOrder(req, res);
    if (!order) return;
    await cancelShipment(order);
    res.json({ ok: true, shippingMeta: order.shippingMeta });
  } catch (err) {
    console.error('[shipping] admin cancel error:', err);
    res.status(500).json({ message: err.message });
  }
});

router.post('/orders/:orderId/refresh', protect, admin, async (req, res) => {
  try {
    const order = await findOrder(req, res);
    if (!order) return;
    const tracking = await refreshTracking(order);
    res.json({ ok: true, tracking });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/orders/:orderId/label', protect, admin, async (req, res) => {
  try {
    const order = await findOrder(req, res);
    if (!order) return;
    const url = await getLabel(order);
    if (!url) return res.status(404).json({ message: 'No label available yet' });
    res.json({ url });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/orders/:orderId/invoice', protect, admin, async (req, res) => {
  try {
    const order = await findOrder(req, res);
    if (!order) return;
    const url = await getInvoice(order);
    if (!url) return res.status(404).json({ message: 'No invoice available' });
    res.json({ url });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/orders/:orderId/manifest', protect, admin, async (req, res) => {
  try {
    const order = await findOrder(req, res);
    if (!order) return;
    const url = await getManifest(order);
    if (!url) return res.status(404).json({ message: 'No manifest available' });
    res.json({ url });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// NDR action — re-attempt delivery or return-to-origin.
// SR endpoint structure varies; using the common pattern. If SR rejects,
// admin can fall back to their dashboard for now.
router.post('/orders/:orderId/ndr-action', protect, admin, async (req, res) => {
  try {
    const order = await findOrder(req, res);
    if (!order) return;
    const awb = order.shippingMeta?.awb;
    if (!awb) return res.status(400).json({ message: 'No AWB on this order' });
    const { action, comment } = req.body || {};
    if (!['re-attempt', 'return'].includes(action)) {
      return res.status(400).json({ message: 'action must be "re-attempt" or "return"' });
    }
    const { ok, status, data } = await srFetch('/ndr/' + encodeURIComponent(awb) + '/action', {
      method: 'POST',
      body: JSON.stringify({ action, comments: comment || '' }),
    });
    if (!ok) return res.status(502).json({ message: 'SR rejected NDR action', detail: data });
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
