/**
 * Shiprocket Shipping orchestration.
 *
 * High-level operations the rest of the codebase calls:
 *   autoCreateShipment(order)       — idempotent: create SR order, assign
 *                                     AWB (cheapest courier), schedule pickup,
 *                                     persist all of it on Order.shippingMeta
 *   cancelShipment(order)
 *   getLabel(order) / getInvoice(order) / getManifest(order)
 *   refreshTracking(order)
 *
 * autoCreateShipment is fire-and-forget at the call sites — failures log
 * to console but never throw upstream. Shipping issues should not break
 * the user-facing payment / order-placement flow.
 */
import { Op } from 'sequelize';
import { Order, Product } from '../models/index.js';
import { srFetch, SHIPROCKET_SHIP_ENABLED } from '../utils/shipAuth.js';
import { resolveItemWeight, DEFAULT_KG } from '../utils/productWeight.js';

const PICKUP_LOCATION = process.env.SHIPROCKET_SHIP_PICKUP_LOCATION || 'warehouse';
const BOX_L = parseFloat(process.env.SHIP_BOX_LENGTH_CM || '25');
const BOX_B = parseFloat(process.env.SHIP_BOX_BREADTH_CM || '20');
const BOX_H = parseFloat(process.env.SHIP_BOX_HEIGHT_CM || '10');
const DEFAULT_ITEM_WEIGHT_KG = DEFAULT_KG;

function num(...vals) {
  for (const v of vals) {
    if (v === null || v === undefined || v === '') continue;
    const n = parseFloat(v);
    if (!isNaN(n)) return n;
  }
  return 0;
}

/** Compose SR's adhoc-order body from one of our Order rows. */
async function buildAdhocPayload(order) {
  const o = order.toJSON ? order.toJSON() : order;
  const addr = o.shippingAddress || {};

  // Pre-fetch products so we can resolve per-variant weights (a 500g pack
  // and a 1kg pack of the same product must register differently).
  const productIds = (o.items || []).map((i) => i.productId).filter(Boolean);
  const products = productIds.length
    ? await Product.findAll({ where: { id: { [Op.in]: productIds } } })
    : [];
  const productMap = new Map(products.map((p) => [p.id, p]));

  const totalWeight = (o.items || []).reduce((sum, it) => {
    const product = it.productId ? productMap.get(it.productId) : null;
    const w = resolveItemWeight(it, product);
    return sum + w * (parseInt(it.quantity, 10) || 1);
  }, 0);

  // Split full name on the first space — SR wants first + last separately.
  const fullName = (addr.fullName || '').trim();
  const firstSpace = fullName.indexOf(' ');
  const firstName = firstSpace > 0 ? fullName.slice(0, firstSpace) : (fullName || 'Customer');
  const lastName = firstSpace > 0 ? fullName.slice(firstSpace + 1) : '';

  const orderItems = (o.items || []).map((it) => ({
    name: (it.name || '').slice(0, 200),
    sku: it.sku || (it.productId ? `P${it.productId}` : `SKU-${Date.now()}`),
    units: parseInt(it.quantity, 10) || 1,
    selling_price: num(it.price),
    discount: 0,
    tax: 0,
    hsn: it.hsnCode || 0,
  }));

  const subTotal = orderItems.reduce((s, it) => s + it.selling_price * it.units, 0);
  const isCod = (o.paymentMethod || '').toLowerCase() === 'cod';

  const customerEmail = (addr.email || o.guestEmail || '').toString();

  const orderDate = new Date(o.createdAt || Date.now())
    .toISOString().slice(0, 19).replace('T', ' ');

  // shippingAddress field names vary by source:
  //   legacy Checkout.jsx → { address, zipCode }
  //   WholesaleRequest.jsx → { line1, line2, postalCode }
  //   SR Checkout webhook → { line1, postalCode } (we normalised in shiprocket.js)
  const line1 = addr.line1 || addr.address || addr.address_1 || '';
  const line2 = addr.line2 || addr.address_2 || '';
  const pincode = addr.postalCode || addr.zipCode || addr.pincode || '';

  return {
    order_id: o.orderNumber, // our reference (SR returns its own order_id)
    order_date: orderDate,
    pickup_location: PICKUP_LOCATION,
    channel_id: '',
    comment: `Order placed via ${o.paymentMethod || 'web'}`,
    billing_customer_name: firstName,
    billing_last_name: lastName,
    billing_address: line1,
    billing_address_2: line2,
    billing_city: addr.city || '',
    billing_pincode: pincode,
    billing_state: addr.state || '',
    billing_country: addr.country || 'India',
    billing_email: customerEmail,
    billing_phone: addr.phone || '',
    shipping_is_billing: true,
    order_items: orderItems,
    payment_method: isCod ? 'COD' : 'Prepaid',
    shipping_charges: num(o.shippingCharge),
    giftwrap_charges: 0,
    transaction_charges: 0,
    total_discount: num(o.discount),
    sub_total: subTotal,
    length: BOX_L,
    breadth: BOX_B,
    height: BOX_H,
    weight: Math.max(0.1, parseFloat(totalWeight.toFixed(3))),
  };
}

/** Create the SR adhoc order. Returns { srOrderId, shipmentId } on success. */
async function createOrderInSR(order) {
  const body = await buildAdhocPayload(order);
  const { ok, status, data } = await srFetch('/orders/create/adhoc', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!ok) throw new Error(`SR create order ${status}: ${data?.message || JSON.stringify(data).slice(0, 200)}`);

  const srOrderId = data.order_id || data.data?.order_id;
  const shipmentId = data.shipment_id || data.data?.shipment_id;
  if (!srOrderId || !shipmentId) {
    throw new Error(`SR create order returned unexpected shape: ${JSON.stringify(data).slice(0, 300)}`);
  }
  return { srOrderId, shipmentId };
}

/** One assign-AWB attempt. Returns assignment object on success, or
 * a structured failure with `reason` explaining why. Doesn't throw. */
async function tryAssignAwb(shipmentId, courierId) {
  const body = courierId ? { shipment_id: shipmentId, courier_id: courierId } : { shipment_id: shipmentId };
  const { ok, status, data } = await srFetch('/courier/assign/awb', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  if (!ok) {
    return { success: false, reason: `HTTP ${status}: ${data?.message || JSON.stringify(data).slice(0, 200)}` };
  }

  const inner = data?.response?.data || data?.data || data;
  let awb = inner?.awb_code;
  if (!awb && Array.isArray(inner?.packages)) {
    awb = inner.packages[0]?.waybill || null;
  }
  if (awb) {
    return {
      success: true,
      awb,
      courierId: inner.courier_company_id || inner.packages?.[0]?.courier_id || courierId,
      courierName: inner.courier_name || inner.packages?.[0]?.courier || '',
    };
  }

  const reason = inner?.awb_assign_error
    || inner?.message
    || inner?.packages?.[0]?.remarks?.[0]
    || inner?.rmk
    || data?.message
    || 'no awb_code returned';
  return { success: false, reason };
}

/** Get a serviceability-ranked courier list for a shipment. */
async function getCourierOptionsForShipment(order) {
  const o = order.toJSON ? order.toJSON() : order;
  const addr = o.shippingAddress || {};
  const pincode = addr.postalCode || addr.zipCode || addr.pincode || '';
  if (!pincode) return [];

  // Sum weights using the same variant-aware resolver as the adhoc payload.
  const productIds = (o.items || []).map((i) => i.productId).filter(Boolean);
  const products = productIds.length
    ? await Product.findAll({ where: { id: { [Op.in]: productIds } } })
    : [];
  const productMap = new Map(products.map((p) => [p.id, p]));
  const weight = Math.max(0.1, (o.items || []).reduce((s, it) =>
    s + resolveItemWeight(it, productMap.get(it.productId)) * (parseInt(it.quantity, 10) || 1), 0));

  const isCod = (o.paymentMethod || '').toLowerCase() === 'cod';
  const params = new URLSearchParams({
    pickup_postcode: process.env.SHIPROCKET_SHIP_PICKUP_PINCODE || '673638',
    delivery_postcode: pincode,
    weight: String(weight),
    cod: isCod ? '1' : '0',
  });
  const { ok, data } = await srFetch(`/courier/serviceability/?${params}`);
  if (!ok) return [];
  return (data?.data?.available_courier_companies || [])
    .map((c) => ({ id: c.courier_company_id, name: c.courier_name, rate: parseFloat(c.rate) || 0 }))
    .sort((a, b) => a.rate - b.rate);
}

/** Assign AWB with smart fallback: try cheapest courier first; on failure
 *  (capacity / Delhivery crash / no-AWB-returned) try the next one in
 *  price order. Stops on first success. */
async function assignAwbWithFallback(shipmentId, order) {
  const couriers = await getCourierOptionsForShipment(order);
  const attempts = [];

  // Always try "let SR pick" first — it's usually fine.
  const first = await tryAssignAwb(shipmentId);
  if (first.success) return { ...first, attempts: ['(cheapest)'] };
  attempts.push(`(cheapest): ${first.reason}`);

  // Fall back through serviceability list, skipping any courier that just
  // failed (we don't know the courier_id from the no-courier-id call).
  const tryList = couriers.slice(0, 5); // cap at 5 to avoid wasting budget
  for (const c of tryList) {
    const r = await tryAssignAwb(shipmentId, c.id);
    attempts.push(`${c.name} (#${c.id}): ${r.success ? 'OK awb=' + r.awb : r.reason}`);
    if (r.success) return { ...r, attempts };
  }
  throw new Error(`SR assign AWB failed across all couriers. Attempts:\n  - ${attempts.join('\n  - ')}`);
}

/** Request pickup for a shipment. Soft-fail — pickup is non-blocking. */
async function schedulePickup(shipmentId) {
  try {
    const { ok, status, data } = await srFetch('/courier/generate/pickup', {
      method: 'POST',
      body: JSON.stringify({ shipment_id: [shipmentId] }),
    });
    if (!ok) {
      console.warn(`[shipping] pickup ${status}: ${data?.message || JSON.stringify(data).slice(0, 200)}`);
      return null;
    }
    return data?.response?.pickup_scheduled_date || data?.pickup_scheduled_date || true;
  } catch (err) {
    console.warn('[shipping] pickup exception:', err.message);
    return null;
  }
}

/**
 * Top-level orchestrator. Idempotent: skips if shippingMeta.shipmentId
 * already set. Fail-silent — caller never sees an error.
 */
export async function autoCreateShipment(order) {
  if (!SHIPROCKET_SHIP_ENABLED) return;
  if (!order) return;

  // Reload to get the freshest copy in case the order was updated mid-flight.
  const fresh = order.shippingMeta != null && order.id ? order : await Order.findByPk(order.id);
  if (!fresh) return;
  if (fresh.shippingMeta?.shipmentId) {
    console.log(`[shipping] order ${fresh.orderNumber} already has shipment ${fresh.shippingMeta.shipmentId} — skipping`);
    return;
  }

  try {
    const { srOrderId, shipmentId } = await createOrderInSR(fresh);
    let assignment = null;
    let pickupAt = null;
    try {
      assignment = await assignAwbWithFallback(shipmentId, fresh);
      pickupAt = await schedulePickup(shipmentId);
    } catch (assignErr) {
      // Order created but AWB failed across all couriers — store what we
      // have. Admin can retry from the admin button (Phase 4).
      console.warn(`[shipping] AWB step failed for ${fresh.orderNumber}: ${assignErr.message}`);
    }

    const meta = {
      srOrderId,
      shipmentId,
      awb: assignment?.awb || null,
      courierId: assignment?.courierId || null,
      courierName: assignment?.courierName || null,
      pickupScheduledDate: typeof pickupAt === 'string' ? pickupAt : null,
      currentStatus: assignment?.awb ? 'AWB_ASSIGNED' : 'CREATED',
      lastSyncAt: new Date().toISOString(),
    };
    await fresh.update({
      shippingMeta: meta,
      trackingNumber: meta.awb || fresh.trackingNumber,
    });
    console.log(`[shipping] auto-created for ${fresh.orderNumber}: SR#${srOrderId} ship#${shipmentId} awb=${meta.awb || 'pending'}`);
    return meta;
  } catch (err) {
    console.error(`[shipping] auto-create failed for ${fresh.orderNumber}: ${err.message}`);
    await fresh.update({
      shippingMeta: { ...(fresh.shippingMeta || {}), lastError: err.message, lastErrorAt: new Date().toISOString() },
    });
  }
}

// ----------------------------------------------------------------------------
// Manual operations exposed via admin endpoints later (Phase 4)
// ----------------------------------------------------------------------------

export async function cancelShipment(order) {
  const meta = order.shippingMeta;
  if (!meta?.awb && !meta?.srOrderId) {
    throw new Error('No shipment to cancel');
  }
  // Cancel AWB first if present, else cancel the SR order.
  if (meta.awb) {
    const { ok, status, data } = await srFetch('/orders/cancel/shipment/awbs', {
      method: 'POST',
      body: JSON.stringify({ awbs: [meta.awb] }),
    });
    if (!ok) throw new Error(`SR cancel AWB ${status}: ${data?.message || ''}`);
  }
  if (meta.srOrderId) {
    const { ok, status, data } = await srFetch('/orders/cancel', {
      method: 'POST',
      body: JSON.stringify({ ids: [meta.srOrderId] }),
    });
    if (!ok) throw new Error(`SR cancel order ${status}: ${data?.message || ''}`);
  }
  await order.update({
    shippingMeta: { ...meta, currentStatus: 'CANCELLED', lastSyncAt: new Date().toISOString() },
  });
}

export async function getLabel(order) {
  const id = order.shippingMeta?.shipmentId;
  if (!id) throw new Error('No shipment yet');
  const { ok, status, data } = await srFetch('/courier/generate/label', {
    method: 'POST',
    body: JSON.stringify({ shipment_id: [id] }),
  });
  if (!ok) throw new Error(`SR label ${status}`);
  const url = data?.label_url || data?.data?.label_url;
  if (url) {
    await order.update({ shippingMeta: { ...order.shippingMeta, labelUrl: url } });
  }
  return url;
}

export async function getInvoice(order) {
  const id = order.shippingMeta?.srOrderId;
  if (!id) throw new Error('No SR order yet');
  const { ok, status, data } = await srFetch('/orders/print/invoice', {
    method: 'POST',
    body: JSON.stringify({ ids: [id] }),
  });
  if (!ok) throw new Error(`SR invoice ${status}`);
  const url = data?.invoice_url || data?.data?.invoice_url;
  if (url) {
    await order.update({ shippingMeta: { ...order.shippingMeta, invoiceUrl: url } });
  }
  return url;
}

export async function getManifest(order) {
  const id = order.shippingMeta?.shipmentId;
  if (!id) throw new Error('No shipment yet');
  const { ok, status, data } = await srFetch('/manifests/generate', {
    method: 'POST',
    body: JSON.stringify({ shipment_id: [id] }),
  });
  if (!ok) throw new Error(`SR manifest ${status}`);
  const url = data?.manifest_url || data?.data?.manifest_url;
  if (url) {
    await order.update({ shippingMeta: { ...order.shippingMeta, manifestUrl: url } });
  }
  return url;
}

export async function refreshTracking(order) {
  const awb = order.shippingMeta?.awb;
  if (!awb) throw new Error('No AWB');
  const { ok, status, data } = await srFetch(`/courier/track/awb/${awb}`);
  if (!ok) throw new Error(`SR track ${status}`);
  return data;
}
