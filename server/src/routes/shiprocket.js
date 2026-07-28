/**
 * Shiprocket Checkout integration.
 *
 * Architecture (one direction at a time):
 *   us  -> SR catalog crawl    | GET /products, /products/by-collection, /collections
 *   us  -> SR per-update push  | services/shiprocketSync.js calls SR webhooks on save
 *   us  -> SR init checkout    | POST /init-checkout
 *   SR  -> us order completed  | POST /webhook/order (token-protected via query param)
 *
 * variant_id encoding (numeric — SR's validator rejects non-numeric strings):
 *   no variants : productId               (e.g. 5)
 *   with variants: productId * 10000 + idx (e.g. product 5 variant 0 -> 50000)
 * Decode: id < 10000 => base product, id >= 10000 => (id/10000, id%10000)
 * This assumes no product has id >= 10000 and no product has >= 10000 variants.
 *
 * Currency is INR. Weights are in kg (SR expects kg).
 */
const VARIANT_BASE = 10000;
export function encodeVariantId(productId, variantIdx) {
  if (variantIdx == null) return productId;
  return productId * VARIANT_BASE + variantIdx;
}
export function decodeVariantId(variantId) {
  const n = parseInt(variantId, 10);
  if (isNaN(n)) return { productId: null, variantIdx: null };
  if (n < VARIANT_BASE) return { productId: n, variantIdx: null };
  return { productId: Math.floor(n / VARIANT_BASE), variantIdx: n % VARIANT_BASE };
}
import { Router } from 'express';
import { Op } from 'sequelize';
import { Product, Category, Order, User } from '../models/index.js';
import { signedHeaders, SHIPROCKET_BASE } from '../utils/shiprocketAuth.js';
import { parseWeightFromOptions } from '../utils/productWeight.js';
import { sendOrderConfirmation, sendNewOrderNotification } from '../services/emailService.js';
import { autoCreateShipment } from '../services/shipping.js';

const router = Router();

const SITE_URL = (process.env.SITE_URL || process.env.CLIENT_URL || '').replace(/\/$/, '');
const WEBHOOK_TOKEN = process.env.SHIPROCKET_WEBHOOK_SECRET || '';
const DEFAULT_WEIGHT_KG = 0.1;

function absUrl(path) {
  if (!path) return '';
  if (/^https?:\/\//.test(path)) return path;
  return `${SITE_URL}${path.startsWith('/') ? '' : '/'}${path}`;
}

// Pick a numeric value with fallbacks. `??` only catches null/undefined, but
// our variants JSON often stores empty-string prices/weights for "use the
// product default", which would otherwise parse to NaN.
function num(...vals) {
  for (const v of vals) {
    if (v === null || v === undefined || v === '') continue;
    const n = parseFloat(v);
    if (!isNaN(n)) return n;
  }
  return 0;
}

/** Pack a Product into the Shopify-shaped object Shiprocket expects. */
function toShiprocketProduct(p) {
  const obj = p.toJSON ? p.toJSON() : p;
  const baseImage = obj.images?.[0] ? absUrl(obj.images[0]) : '';
  const hasVariants = Array.isArray(obj.variants) && obj.variants.length > 0;
  const cmpPrice = obj.comparePrice ? num(obj.comparePrice).toFixed(2) : null;

  // options[] is built from variantOptions ({ "Size": ["S","M"], "Color": [...] })
  // or — when only variants[] is set — from the unique values in each option key.
  let optionsArr = [];
  if (obj.variantOptions && typeof obj.variantOptions === 'object') {
    optionsArr = Object.entries(obj.variantOptions).map(([name, values]) => ({
      name,
      values: Array.isArray(values) ? values : [],
    }));
  } else if (hasVariants) {
    const keys = new Set();
    obj.variants.forEach((v) => Object.keys(v.options || {}).forEach((k) => keys.add(k)));
    optionsArr = [...keys].map((name) => ({
      name,
      values: [...new Set(obj.variants.map((v) => v.options?.[name]).filter(Boolean))],
    }));
  }

  const variantPayload = hasVariants
    ? obj.variants.map((v, idx) => {
        const wKg = num(v.weight, parseWeightFromOptions(v.options), obj.weight, DEFAULT_WEIGHT_KG);
        return {
          id: encodeVariantId(obj.id, idx),
          title: Object.values(v.options || {}).join(' / ') || `Variant ${idx + 1}`,
          price: num(v.price, obj.price).toFixed(2),
          compare_at_price: cmpPrice,
          sku: v.sku || obj.code || `P${obj.id}-V${idx}`,
          quantity: parseInt(num(v.stock, obj.stock, 0), 10),
          created_at: obj.createdAt,
          updated_at: obj.updatedAt,
          taxable: !!obj.taxable,
          option_values: v.options || {},
          grams: Math.round(wKg * 1000),
          image: { src: baseImage },
          weight: wKg,
          weight_unit: 'kg',
        };
      })
    : [(() => {
        const wKg = num(obj.weight, DEFAULT_WEIGHT_KG);
        return {
          id: encodeVariantId(obj.id, null),
          title: obj.name,
          price: num(obj.price).toFixed(2),
          compare_at_price: cmpPrice,
          sku: obj.code || `P${obj.id}`,
          quantity: parseInt(num(obj.stock, 0), 10),
          created_at: obj.createdAt,
          updated_at: obj.updatedAt,
          taxable: !!obj.taxable,
          option_values: {},
          grams: Math.round(wKg * 1000),
          image: { src: baseImage },
          weight: wKg,
          weight_unit: 'kg',
        };
      })()];

  return {
    id: obj.id,
    title: obj.name,
    body_html: obj.description || '',
    vendor: obj.brand || '',
    product_type: obj.category || '',
    created_at: obj.createdAt,
    handle: obj.slug || `product-${obj.id}`,
    updated_at: obj.updatedAt,
    tags: '',
    status: obj.active ? 'active' : 'draft',
    variants: variantPayload,
    image: { src: baseImage },
    options: optionsArr,
  };
}

function toShiprocketCollection(c) {
  const obj = c.toJSON ? c.toJSON() : c;
  return {
    id: obj.id,
    title: obj.name,
    body_html: '',
    updated_at: obj.updatedAt,
    image: { src: obj.image ? absUrl(obj.image) : '' },
  };
}

function parsePaging(req) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 100));
  return { page, limit, offset: (page - 1) * limit };
}

// =====================================================================
// Catalog sync — Shiprocket crawls these public read-only endpoints
// =====================================================================

router.get('/products', async (req, res) => {
  try {
    const { page, limit, offset } = parsePaging(req);
    const { rows, count } = await Product.findAndCountAll({
      where: { active: true },
      order: [['id', 'ASC']],
      offset,
      limit,
    });
    res.json({
      data: {
        total: count,
        products: rows.map(toShiprocketProduct),
        page,
        limit,
        has_more: offset + rows.length < count,
      },
    });
  } catch (err) {
    console.error('[shiprocket] /products:', err.message);
    res.status(500).json({ message: err.message });
  }
});

router.get('/products/by-collection', async (req, res) => {
  try {
    const { page, limit, offset } = parsePaging(req);
    const collectionId = parseInt(req.query.collection_id, 10);
    if (!collectionId) return res.status(400).json({ message: 'collection_id required' });

    const cat = await Category.findByPk(collectionId);
    if (!cat) return res.json({ data: { total: 0, products: [], page, limit, has_more: false } });

    const { rows, count } = await Product.findAndCountAll({
      where: { active: true, category: cat.name },
      order: [['id', 'ASC']],
      offset,
      limit,
    });
    res.json({
      data: {
        total: count,
        products: rows.map(toShiprocketProduct),
        page,
        limit,
        has_more: offset + rows.length < count,
      },
    });
  } catch (err) {
    console.error('[shiprocket] /products/by-collection:', err.message);
    res.status(500).json({ message: err.message });
  }
});

router.get('/collections', async (req, res) => {
  try {
    const { page, limit, offset } = parsePaging(req);
    const { rows, count } = await Category.findAndCountAll({
      where: { active: true },
      order: [['sortOrder', 'ASC'], ['id', 'ASC']],
      offset,
      limit,
    });
    res.json({
      data: {
        total: count,
        collections: rows.map(toShiprocketCollection),
        page,
        limit,
        has_more: offset + rows.length < count,
      },
    });
  } catch (err) {
    console.error('[shiprocket] /collections:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// =====================================================================
// Init checkout — frontend calls us, we proxy to Shiprocket so the key
// never leaves the server.
// =====================================================================

router.post('/init-checkout', async (req, res) => {
  try {
    const { items, redirectUrl } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'No items provided' });
    }

    // Translate our cart payload into Shiprocket's {variant_id, quantity}.
    // Frontend sends {productId, selectedVariant?, quantity}. We look up the
    // variant by matching options to compute the variant index.
    const productIds = [...new Set(items.map((i) => i.productId).filter(Boolean))];
    const products = productIds.length
      ? await Product.findAll({ where: { id: { [Op.in]: productIds } } })
      : [];
    const byId = new Map(products.map((p) => [p.id, p]));

    const resolvedItems = items.map((it) => {
      const product = byId.get(it.productId);
      let variantIdx = null;
      if (product && Array.isArray(product.variants) && product.variants.length > 0 && it.selectedVariant) {
        const idx = product.variants.findIndex((v) =>
          v.options && Object.entries(it.selectedVariant).every(([k, val]) => v.options[k] === val)
        );
        if (idx >= 0) variantIdx = idx;
      }
      return {
        variant_id: encodeVariantId(it.productId, variantIdx),
        quantity: parseInt(it.quantity, 10) || 1,
      };
    });

    const cart_data = { items: resolvedItems };

    const body = {
      cart_data,
      redirect_url: redirectUrl || `${SITE_URL}/order-success`,
      timestamp: new Date().toISOString(),
    };
    const bodyStr = JSON.stringify(body);

    console.log('[shiprocket] init-checkout sending:', bodyStr);

    const resp = await fetch(`${SHIPROCKET_BASE}/api/v1/access-token/checkout`, {
      method: 'POST',
      headers: signedHeaders(bodyStr),
      body: bodyStr,
    });
    const rawText = await resp.text();
    let data;
    try { data = JSON.parse(rawText); } catch { data = { _raw: rawText }; }

    console.log(`[shiprocket] init-checkout response: HTTP ${resp.status}`, JSON.stringify(data).slice(0, 600));

    if (!resp.ok || data?.ok === false) {
      console.error('[shiprocket] init-checkout error:', data);
      return res.status(502).json({ message: data?.error?.message || data?.message || 'Shiprocket rejected the request', detail: data });
    }

    // SR returns the token nested under result.token per the docs sample.
    const token = data?.result?.token || data?.token;
    if (!token) {
      console.error('[shiprocket] init-checkout missing token:', data);
      return res.status(502).json({ message: 'Shiprocket did not return a token' });
    }

    res.json({ token, raw: data });
  } catch (err) {
    console.error('[shiprocket] init-checkout exception:', err);
    res.status(500).json({ message: err.message });
  }
});

// =====================================================================
// Inbound order webhook — Shiprocket posts here when a customer pays.
// Protected with ?token=SHIPROCKET_WEBHOOK_SECRET since Shiprocket
// doesn't sign their outbound webhooks.
// =====================================================================

router.post('/webhook/order', async (req, res) => {
  try {
    if (!WEBHOOK_TOKEN || req.query.token !== WEBHOOK_TOKEN) {
      console.warn('[shiprocket] webhook token mismatch');
      return res.status(401).json({ message: 'Invalid webhook token' });
    }

    const payload = req.body || {};
    if (payload.status && payload.status !== 'SUCCESS') {
      // Non-success webhooks (failed/cancelled) — ack but don't create order.
      console.log('[shiprocket] webhook non-success:', payload.status, payload.order_id);
      return res.json({ ok: true, skipped: true });
    }

    // Resolve variant_ids back to our products via decodeVariantId.
    const items = Array.isArray(payload.cart_data?.items) ? payload.cart_data.items : [];
    const orderItems = [];
    for (const it of items) {
      const { productId, variantIdx } = decodeVariantId(it.variant_id);
      if (!productId) continue;
      const product = await Product.findByPk(productId);
      if (!product) continue;
      const qty = parseInt(it.quantity, 10) || 1;
      const variant = variantIdx != null && product.variants ? product.variants[variantIdx] : null;
      const unitPrice = variant?.price != null ? parseFloat(variant.price) : parseFloat(product.price);

      orderItems.push({
        productId: product.id,
        name: product.name + (variant ? ` (${Object.values(variant.options || {}).join('/')})` : ''),
        category: product.category,
        price: unitPrice,
        quantity: qty,
        image: product.images?.[0] || null,
        selectedVariant: variant?.options || null,
        sku: variant?.sku || product.code || null,
        taxable: product.taxable || false,
        taxRate: product.taxable ? parseFloat(product.taxRate || 0) : 0,
        hsnCode: product.hsnCode || null,
      });
    }

    if (orderItems.length === 0) {
      console.warn('[shiprocket] webhook had no resolvable items:', payload.order_id);
      return res.status(400).json({ message: 'No matchable items in order' });
    }

    // Map customer info from the payload. SR sends phone + email at top level
    // and may include a shipping_address block (full payload per docs).
    const customerEmail = (payload.email || '').toLowerCase().trim();
    const shippingAddress = payload.shipping_address || payload.address || {
      fullName: payload.name || payload.customer_name || '',
      phone: payload.phone || '',
      line1: payload.address_line_1 || '',
      line2: payload.address_line_2 || '',
      city: payload.city || '',
      state: payload.state || '',
      postalCode: payload.pincode || payload.postal_code || '',
      country: payload.country || 'India',
    };

    // Try to attach to an existing user by email. Guest otherwise.
    let user = null;
    if (customerEmail) user = await User.findOne({ where: { email: customerEmail } });

    const orderNumber = `SR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const paymentMethod = payload.payment_type === 'CASH_ON_DELIVERY' ? 'cod' : 'shiprocket';
    const totalAmount = parseFloat(payload.total_amount_payable || 0)
      || orderItems.reduce((s, i) => s + i.price * i.quantity, 0);

    const order = await Order.create({
      orderNumber,
      userId: user?.id || null,
      guestEmail: user ? null : (customerEmail || null),
      items: orderItems,
      totalAmount,
      shippingAddress,
      paymentMethod,
      paymentStatus: payload.payment_type === 'CASH_ON_DELIVERY' ? 'pending' : 'paid',
      orderStatus: 'confirmed',
      shippingCharge: parseFloat(payload.shipping_amount || 0),
      discount: parseFloat(payload.discount || 0),
      taxAmount: parseFloat(payload.tax_amount || 0),
      trackingNumber: payload.order_id, // Shiprocket's order id; useful to reconcile later
    });

    // Decrement stock for each item (Shiprocket orders are real sales).
    for (const it of orderItems) {
      await Product.increment({ stock: -it.quantity }, { where: { id: it.productId } });
    }

    // Fire emails async — don't block the webhook ack.
    if (customerEmail) {
      sendOrderConfirmation(order.toJSON(), customerEmail).catch((e) =>
        console.error('[shiprocket] order confirmation email failed:', e.message)
      );
    }
    sendNewOrderNotification(order.toJSON()).catch((e) =>
      console.error('[shiprocket] admin notification email failed:', e.message)
    );
    autoCreateShipment(order).catch((e) =>
      console.error('[shipping] auto-create after SR Checkout webhook failed:', e.message)
    );

    console.log(`[shiprocket] order created: ${orderNumber} (SR:${payload.order_id})`);
    res.json({ ok: true, order_number: orderNumber });
  } catch (err) {
    console.error('[shiprocket] webhook error:', err);
    // Return 200 anyway so SR doesn't retry — log + investigate.
    res.json({ ok: false, error: err.message });
  }
});

// =====================================================================
// Diagnostics — call from the VPS to debug auth + connectivity to SR.
// GET /api/shiprocket/debug?productId=1  — runs an access-token call
// using productId (no variant) and logs everything to pm2.
// =====================================================================

router.get('/debug', async (req, res) => {
  try {
    const productId = parseInt(req.query.productId, 10);
    if (!productId) return res.status(400).json({ message: 'productId query required' });
    const product = await Product.findByPk(productId);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    const hasVariants = Array.isArray(product.variants) && product.variants.length > 0;
    const variant_id = encodeVariantId(productId, hasVariants ? 0 : null);

    const body = {
      cart_data: { items: [{ variant_id, quantity: 1 }] },
      redirect_url: `${SITE_URL}/order-success`,
      timestamp: new Date().toISOString(),
    };
    const bodyStr = JSON.stringify(body);

    const resp = await fetch(`${SHIPROCKET_BASE}/api/v1/access-token/checkout`, {
      method: 'POST',
      headers: signedHeaders(bodyStr),
      body: bodyStr,
    });
    const text = await resp.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = { _raw: text }; }

    res.json({
      ok: resp.ok,
      status: resp.status,
      sent: body,
      receivedHeaders: Object.fromEntries(resp.headers.entries()),
      received: parsed,
      hint: !resp.ok
        ? 'Common causes: (1) SR has not crawled catalog yet, (2) variant_id not in their inventory, (3) HMAC mismatch (api key/secret typo), (4) account onboarding incomplete on SR side. Check pm2 logs for the request body that was sent.'
        : 'Looks good — the token in `received.result.token` is what the frontend would use.',
    });
  } catch (err) {
    console.error('[shiprocket] /debug exception:', err);
    res.status(500).json({ message: err.message });
  }
});

export default router;
