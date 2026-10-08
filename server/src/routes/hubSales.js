import { Router } from 'express';
import { Op } from 'sequelize';
import sequelize from '../config/database.js';
import { Counter, Order, OrderAuditLog, OrderReturn, Product, ProductStock, User } from '../models/index.js';
import { protect } from '../middleware/auth.js';
import { bad, can, hubLog, need, wrap as wrapAs } from '../hub/http.js';
import { loadAppSettings } from '../hub/settings.js';
import {
  applyStockDelta, hasVariants, recomputeAfter, skuFields, skuStock, stockLocationId,
} from '../hub/catalog.js';
import {
  CONTACT_EDITABLE_STATUSES, FIELD_LABELS, RETURN_REASONS, SALES_ORDER_STATUSES, SALES_PAYMENT_METHODS,
  SALES_PAYMENT_STATUSES, adoptLegacy, clean, computeTotals, customerCode, normalizePhone, round2, samePhone,
  syncLegacy, toSalesOrder,
} from '../hub/sales.js';

/**
 * FEMNIA Hub sales: New Sales Order, Sales Orders, Customers, Invoices &
 * Labels. Confirmation is the one action that deducts stock (through the
 * ledger, kind 'sale'); returns and cancellations put it back once.
 */
const router = Router();
router.use(protect);
const wrap = (fn) => wrapAs('hubSales', fn);

const VIEW_ORDERS = ['orders.view_all', 'orders.view_own', 'invoices.view', 'delivery.view', 'customers.history'];

// ── helpers ─────────────────────────────────────────────────────────
async function view(order, settings) {
  const s = settings || (await loadAppSettings());
  return toSalesOrder(order, { customerPrefix: s.customerPrefix });
}

async function findOrder(number, options = {}) {
  const order = await Order.findOne({ where: { orderNumber: number }, ...options });
  if (!order) throw bad('This order no longer exists.', 404);
  return order;
}

function canSeeOrder(req, order) {
  if (can(req, 'orders.view_all') || can(req, 'invoices.view') || can(req, 'delivery.view') || can(req, 'customers.history')) return true;
  return can(req, 'orders.view_own') && order.createdBy === req.user.id;
}

async function auditOrder(req, orderId, changes, transaction) {
  if (!changes.length) return;
  await OrderAuditLog.bulkCreate(changes.map((c) => ({
    orderId,
    field: c.field,
    oldValue: c.oldValue ?? null,
    newValue: c.newValue ?? null,
    changedBy: req.user.id,
    staffName: req.user.name || req.user.email || null,
  })), transaction ? { transaction } : undefined);
}

const str = (v) => (v === null || v === undefined || v === '' ? null : String(v));

/** Next hub order number, e.g. FEM-0001, from a locked counter. */
async function nextOrderNumber(transaction) {
  const { invoicePrefix } = await loadAppSettings();
  const row = await Counter.findByPk('hub_order', { transaction, lock: transaction.LOCK.UPDATE });
  let n = row ? Number(row.value) : 0;
  for (;;) {
    n += 1;
    const candidate = `${invoicePrefix}-${String(n).padStart(4, '0')}`;
    if (!(await Order.findOne({ where: { orderNumber: candidate }, attributes: ['id'], transaction }))) {
      if (row) await row.update({ value: n }, { transaction });
      else await Counter.create({ name: 'hub_order', value: n }, { transaction });
      return candidate;
    }
  }
}

/** Variant index for a stored line; legacy web lines only carry the chosen options. */
function lineVariantIndex(product, item) {
  if (item.variantIndex !== undefined && item.variantIndex !== null) return Number(item.variantIndex);
  if (!hasVariants(product)) return null;
  const sel = item.variant || item.selectedVariant;
  if (!sel) return null;
  const idx = product.variants.findIndex((v) => v && !v.archived && v.options
    && Object.entries(v.options).every(([k, val]) => sel[k] === val));
  return idx >= 0 ? idx : null;
}

const LEGACY_METHOD = {
  Cash: 'cash', Fawran: 'fawran', Card: 'card', 'Bank Transfer': 'bank_transfer', 'Online Payment': 'online',
  COD: 'cod', Other: 'other',
};

// ════════════════════════════════════════════════════════════════════
// Settings (read; the Settings screen arrives later)
// ════════════════════════════════════════════════════════════════════
router.get('/settings', wrap(async (req, res) => {
  res.json(await loadAppSettings());
}));

// ════════════════════════════════════════════════════════════════════
// Orders
// ════════════════════════════════════════════════════════════════════
router.get('/orders', need(...VIEW_ORDERS), wrap(async (req, res) => {
  const where = {};
  if (!can(req, 'orders.view_all') && !can(req, 'invoices.view') && !can(req, 'delivery.view') && !can(req, 'customers.history')) {
    where.createdBy = req.user.id;
  }
  const orders = await Order.findAll({ where, order: [['createdAt', 'DESC'], ['id', 'DESC']], limit: 400 });
  const settings = await loadAppSettings();
  res.set('Cache-Control', 'no-store');
  res.json(orders.map((o) => toSalesOrder(o, { customerPrefix: settings.customerPrefix })));
}));

router.get('/orders/:number', need(...VIEW_ORDERS), wrap(async (req, res) => {
  const order = await findOrder(req.params.number);
  if (!canSeeOrder(req, order)) throw bad('You do not have permission to view this order.', 403);
  const v = await view(order);
  // Product codes for the delivery label's item summary.
  const ids = [...new Set(v.items.map((i) => i.productId).filter(Boolean))];
  const products = ids.length ? await Product.findAll({ where: { id: ids } }) : [];
  const byId = new Map(products.map((p) => [p.id, p]));
  v.productCodes = {};
  (Array.isArray(order.items) ? order.items : []).forEach((it, idx) => {
    const p = byId.get(Number(it.productId));
    if (!p) return;
    const vi = lineVariantIndex(p, it);
    const code = skuFields(p, vi).productCode;
    if (code) v.productCodes[v.items[idx].sku] = code;
  });
  res.json(v);
}));

router.get('/orders/:number/audit', need('payments.audit', 'admin.view_audit'), wrap(async (req, res) => {
  const order = await findOrder(req.params.number, { attributes: ['id', 'orderNumber'] });
  const rows = await OrderAuditLog.findAll({ where: { orderId: order.id }, order: [['createdAt', 'DESC'], ['id', 'DESC']] });
  res.json(rows.map((r) => ({
    id: r.id, orderId: order.orderNumber, field: r.field, oldValue: r.oldValue, newValue: r.newValue,
    staffName: r.staffName, createdAt: r.createdAt,
  })));
}));

/**
 * Resolve the submitted lines ({key, quantity, unitPrice, discount,
 * consignment}) against the live catalogue into stored order lines.
 */
async function buildLines(rawItems, transaction) {
  if (!Array.isArray(rawItems) || !rawItems.length) throw bad('Add at least one product before confirming.');
  const lines = [];
  for (const raw of rawItems) {
    const m = String(raw.key || '').match(/^(\d+):(base|\d+)$/);
    if (!m) throw bad('One of the order lines is not a valid product.');
    const productId = parseInt(m[1], 10);
    const variantIndex = m[2] === 'base' ? null : parseInt(m[2], 10);
    const product = await Product.findByPk(productId, { transaction });
    if (!product || (variantIndex !== null && (!product.variants?.[variantIndex] || product.variants[variantIndex].archived))) {
      throw bad('A product in this order no longer exists.');
    }
    const f = skuFields(product, variantIndex);
    const quantity = parseInt(raw.quantity, 10);
    if (!Number.isInteger(quantity) || quantity < 1) throw bad(`${f.sku}: quantity must be at least 1.`);
    const c = raw.consignment;
    lines.push({
      productId,
      variantIndex,
      sku: f.sku,
      name: product.name,
      size: f.size,
      color: f.color,
      category: product.category || null,
      image: (Array.isArray(product.images) && product.images[0]) || null,
      quantity,
      unitPrice: round2(Math.max(Number(raw.unitPrice) || 0, 0)),
      discount: round2(Math.max(Number(raw.discount) || 0, 0)),
      costPrice: f.costPrice,
      isActive: f.isActive,
      consignment: c ? {
        partner: clean(c.partner, 120) || null,
        productCost: round2(Math.max(Number(c.productCost) || 0, 0)),
        opPercent: round2(Math.max(Number(c.opPercent) || 0, 0)),
        opMin: round2(Math.max(Number(c.opMin) || 0, 0)),
        otherCost: round2(Math.max(Number(c.otherCost) || 0, 0)),
      } : null,
    });
  }
  return lines;
}

const storedLine = (l) => ({
  productId: l.productId,
  variantIndex: l.variantIndex,
  sku: l.sku,
  name: l.name,
  size: l.size,
  color: l.color,
  category: l.category,
  image: l.image,
  quantity: l.quantity,
  price: l.unitPrice,           // legacy readers (P&L, receipts) use `price`
  unitPrice: l.unitPrice,
  discount: l.discount,
  lineTotal: l.lineTotal,
  costPrice: l.costPrice,
  returnedQty: l.returnedQty || 0,
  consignment: l.consignment || null,
});

/** Header fields shared by draft and confirm. */
function headerFrom(b, pickup, deliveryCharge) {
  return {
    customerName: clean(b.customerName, 120),
    customerPhone: clean(b.phone, 24),
    area: clean(b.area, 80) || null,
    address: clean(b.address) || null,
    landmark: clean(b.landmark, 200) || null,
    fulfilmentMethod: pickup ? 'Customer Pickup' : 'Delivery',
    shippingCharge: deliveryCharge,
    deliveryDate: !pickup ? b.deliveryDate || null : null,
    courier: !pickup ? clean(b.courier, 80) || null : null,
    trackingNumber: !pickup ? clean(b.trackingNumber, 80) || null : null,
    deliveryNotes: clean(b.deliveryNotes) || null,
    pickupDate: pickup ? b.pickupDate || null : null,
    pickupTime: pickup ? clean(b.pickupTime, 20) || null : null,
    pickupNotes: pickup ? clean(b.pickupNotes) || null : null,
    hubPaymentMode: SALES_PAYMENT_METHODS.includes(b.paymentMode) ? b.paymentMode : 'Cash',
    hubPaymentStatus: SALES_PAYMENT_STATUSES.includes(b.paymentStatus) ? b.paymentStatus : 'Pending',
    paymentDate: b.paymentDate || null,
    paymentTime: clean(b.paymentTime, 20) || null,
    paymentReference: clean(b.paymentReference, 80) || null,
    paymentNotes: clean(b.paymentNotes) || null,
    paymentHeldIn: clean(b.paymentHeldIn, 60) || null,
    paymentHolderDetails: clean(b.paymentHolderDetails, 200) || null,
  };
}

const shippingAddressFrom = (h) => ({
  fullName: h.customerName, phone: h.customerPhone, address: h.address || '', city: h.area || '', landmark: h.landmark || '',
});

async function customerUserId(raw, transaction) {
  const id = parseInt(raw, 10);
  if (!id) return null;
  const user = await User.findByPk(id, { attributes: ['id', 'role'], transaction });
  return user && user.role === 'customer' ? user.id : null;
}

// Draft save: no stock movement.
router.post('/orders/draft', need('orders.create'), wrap(async (req, res) => {
  const b = req.body || {};
  const pickup = b.fulfilmentMethod === 'Customer Pickup';
  const deliveryCharge = pickup ? 0 : round2(Math.max(Number(b.deliveryCharge) || 0, 0));
  const t = await sequelize.transaction();
  let order;
  try {
    const built = await buildLines(b.items, t);
    const { lines, grandTotal } = computeTotals(built, deliveryCharge);
    const header = headerFrom(b, pickup, deliveryCharge);
    header.customerName = header.customerName || 'Draft customer';
    header.customerPhone = header.customerPhone || '-';
    const fields = {
      userId: await customerUserId(b.customerId, t),
      items: lines.map(storedLine),
      totalAmount: grandTotal,
      shippingAddress: shippingAddressFrom(header),
      paymentMethod: LEGACY_METHOD[header.hubPaymentMode] || 'other',
      ...header,
      hubStatus: 'Draft',
      amountReceived: 0,
      stockState: 'none',
    };
    if (b.orderId) {
      order = await findOrder(b.orderId, { transaction: t, lock: t.LOCK.UPDATE });
      if (order.hubStatus !== 'Draft') throw bad(`Order ${order.orderNumber} is confirmed and cannot be edited.`);
      Object.assign(order, fields);
      order.changed('items', true);
    } else {
      order = Order.build({ ...fields, orderNumber: await nextOrderNumber(t), channel: 'staff', createdBy: req.user.id });
    }
    syncLegacy(order);
    await order.save({ transaction: t });
    if (!b.orderId) await auditOrder(req, order.id, [{ field: 'Status', oldValue: null, newValue: 'Draft' }], t);
    await t.commit();
  } catch (err) {
    if (!t.finished) await t.rollback();
    throw err;
  }
  await hubLog(req, 'Sales order draft saved', 'Sales Orders', order.orderNumber);
  res.json({ orderId: order.orderNumber });
}));

/**
 * The ONE action that deducts stock. Idempotent: the same key, a double
 * click, a refresh or a reopened draft never sells twice.
 */
router.post('/orders/confirm', need('orders.confirm'), wrap(async (req, res) => {
  const b = req.body || {};
  const key = clean(b.idempotencyKey, 120);
  if (!key) throw bad('Missing idempotency key.');
  const settings = await loadAppSettings();
  const prior = await Order.findOne({ where: { idempotencyKey: key } });
  if (prior) return res.json({ order: await view(prior, settings), duplicate: true });

  if (!clean(b.customerName) || !clean(b.phone)) throw bad('Customer name and mobile number are required before confirming.');
  const pickup = b.fulfilmentMethod === 'Customer Pickup';
  if (!pickup && !clean(b.address)) throw bad('A full delivery address is required for Delivery orders.');
  const deliveryCharge = pickup ? 0 : round2(Math.max(Number(b.deliveryCharge) || 0, 0));

  await stockLocationId();   // fail early, before anything is written
  const t = await sequelize.transaction();
  let order;
  let lines;
  try {
    let existing = null;
    if (b.orderId) {
      existing = await findOrder(b.orderId, { transaction: t, lock: t.LOCK.UPDATE });
      const v = toSalesOrder(existing);
      if (v.status !== 'Draft') throw bad(`Order ${existing.orderNumber} is already confirmed. Use Update Fulfilment & Payment instead.`);
      if (existing.channel === 'pos') throw bad('Till sales are managed at the till.');
    }

    // The form's lines are the confirmed snapshot (a reopened draft resubmits them).
    const built = await buildLines(b.items, t);
    const inactive = built.find((l) => l.isActive === false);
    if (inactive) throw bad(`${inactive.sku} is inactive and cannot be sold. Reactivate it first.`);

    const totals = computeTotals(built, deliveryCharge);
    ({ lines } = totals);
    const { grandTotal } = totals;

    // Server-side stock recheck per SKU, with the stock rows locked.
    const required = new Map();
    for (const l of lines) {
      const k = `${l.productId}:${l.variantIndex ?? 'base'}`;
      required.set(k, { line: l, qty: (required.get(k)?.qty || 0) + l.quantity });
    }
    const locationId = await stockLocationId();
    for (const { line, qty } of required.values()) {
      const row = await ProductStock.findOne({
        where: { productId: line.productId, variantIndex: line.variantIndex ?? { [Op.is]: null }, locationId },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      const total = await skuStock(line.productId, line.variantIndex, t);
      const available = Math.min(total, row ? row.quantity : 0);
      if (qty > available) {
        throw bad(`Insufficient stock for ${line.sku} (${line.name}). Requested ${qty}, available ${available}.`);
      }
    }

    const header = headerFrom(b, pickup, deliveryCharge);
    const amountReceived = round2(Math.min(Math.max(Number(b.amountReceived) || 0, 0), grandTotal));
    const fields = {
      ...header,
      userId: (await customerUserId(b.customerId, t)) ?? existing?.userId ?? null,
      items: lines.map(storedLine),
      totalAmount: grandTotal,
      discount: 0,
      shippingAddress: shippingAddressFrom(header),
      hubStatus: 'Confirmed',
      amountReceived,
      confirmedAt: new Date(),
      idempotencyKey: key,
      stockState: 'deducted',
    };
    if (existing) {
      order = existing;
      Object.assign(order, fields);
      order.changed('items', true);
    } else {
      order = Order.build({
        ...fields,
        orderNumber: await nextOrderNumber(t),
        paymentMethod: LEGACY_METHOD[header.hubPaymentMode] || 'other',
        channel: 'staff',
        createdBy: req.user.id,
      });
    }
    syncLegacy(order);
    await order.save({ transaction: t });

    for (const l of lines) {
      await applyStockDelta({
        productId: l.productId, variantIndex: l.variantIndex, delta: -l.quantity, transaction: t,
        ctx: { kind: 'sale', reference: order.orderNumber, orderId: order.id, createdBy: req.user.id },
      });
    }
    await auditOrder(req, order.id, [
      { field: 'Status', oldValue: existing ? 'Draft' : null, newValue: 'Confirmed' },
      { field: 'Fulfilment type', oldValue: null, newValue: order.fulfilmentMethod },
      { field: 'Grand total', oldValue: null, newValue: String(grandTotal) },
      { field: 'Payment status', oldValue: null, newValue: order.hubPaymentStatus },
    ], t);
    await t.commit();
  } catch (err) {
    if (!t.finished) await t.rollback();
    if (err.name === 'SequelizeUniqueConstraintError') {
      const again = await Order.findOne({ where: { idempotencyKey: key } });
      if (again) return res.json({ order: await view(again, settings), duplicate: true });
    }
    throw err;
  }
  await recomputeAfter(lines.map((l) => l.productId));
  await hubLog(req, 'Sales order confirmed', 'Sales Orders', order.orderNumber,
    `${order.fulfilmentMethod} · QAR ${order.totalAmount} · ${lines.length} line(s) · stock deducted`);
  res.json({ order: await view(order, settings), duplicate: false });
}));

/** Fulfilment and payment only — never stock. */
router.patch('/orders/:number/fulfilment', need('orders.update_delivery', 'payments.edit'), wrap(async (req, res) => {
  const b = req.body || {};
  const order = await findOrder(req.params.number);
  if (order.channel === 'pos') throw bad('Till sales are managed at the till.');
  const before = await view(order);
  if (before.status === 'Draft') throw bad('Confirm the order before updating fulfilment or payment.');
  adoptLegacy(order, before);

  const patch = {};
  const set = (col, value) => {
    if (value !== undefined) patch[col] = value;
  };
  if (can(req, 'orders.update_delivery')) {
    if (b.status !== undefined) {
      if (!SALES_ORDER_STATUSES.includes(b.status) || ['Draft', 'Cancelled', 'Returned'].includes(b.status)) {
        throw bad('Use Cancel or Return for that change.');
      }
      if (before.status === 'Cancelled') throw bad('Cancelled orders cannot be changed.');
      set('hubStatus', b.status);
    }
    set('deliveryDate', b.deliveryDate === undefined ? undefined : b.deliveryDate || null);
    set('courier', b.courier === undefined ? undefined : clean(b.courier, 80) || null);
    set('trackingNumber', b.trackingNumber === undefined ? undefined : clean(b.trackingNumber, 80) || null);
    set('deliveryNotes', b.deliveryNotes === undefined ? undefined : clean(b.deliveryNotes) || null);
    set('pickupDate', b.pickupDate === undefined ? undefined : b.pickupDate || null);
    set('pickupTime', b.pickupTime === undefined ? undefined : clean(b.pickupTime, 20) || null);
    set('pickupNotes', b.pickupNotes === undefined ? undefined : clean(b.pickupNotes) || null);
  }
  if (can(req, 'payments.edit')) {
    if (b.paymentMode !== undefined && SALES_PAYMENT_METHODS.includes(b.paymentMode)) set('hubPaymentMode', b.paymentMode);
    if (b.paymentStatus !== undefined && SALES_PAYMENT_STATUSES.includes(b.paymentStatus)) set('hubPaymentStatus', b.paymentStatus);
    if (b.amountReceived !== undefined) {
      const received = round2(Math.max(Number(b.amountReceived) || 0, 0));
      if (received > before.grandTotal) {
        throw bad(`Amount received (QAR ${received}) cannot exceed the grand total (QAR ${before.grandTotal}). Use a refund instead.`);
      }
      patch.amountReceived = received;
    }
    set('paymentDate', b.paymentDate === undefined ? undefined : b.paymentDate || null);
    set('paymentTime', b.paymentTime === undefined ? undefined : clean(b.paymentTime, 20) || null);
    set('paymentReference', b.paymentReference === undefined ? undefined : clean(b.paymentReference, 80) || null);
    set('paymentNotes', b.paymentNotes === undefined ? undefined : clean(b.paymentNotes) || null);
    set('paymentHeldIn', b.paymentHeldIn === undefined ? undefined : clean(b.paymentHeldIn, 60) || null);
    set('paymentHolderDetails', b.paymentHolderDetails === undefined ? undefined : clean(b.paymentHolderDetails, 200) || null);
  }

  const previous = {
    hubStatus: before.status, deliveryDate: before.deliveryDate, courier: before.courier,
    trackingNumber: before.trackingNumber, deliveryNotes: before.deliveryNotes, pickupDate: before.pickupDate,
    pickupTime: before.pickupTime, pickupNotes: before.pickupNotes, hubPaymentMode: before.paymentMode,
    hubPaymentStatus: before.paymentStatus, amountReceived: before.amountReceived, paymentDate: before.paymentDate,
    paymentTime: before.paymentTime, paymentReference: before.paymentReference, paymentNotes: before.paymentNotes,
    paymentHeldIn: before.paymentHeldIn, paymentHolderDetails: before.paymentHolderDetails,
  };
  const changes = Object.entries(patch)
    .filter(([col, value]) => String(previous[col] ?? '') !== String(value ?? ''))
    .map(([col, value]) => ({ field: FIELD_LABELS[col] ?? col, oldValue: str(previous[col]), newValue: str(value) }));
  Object.assign(order, patch);
  if (patch.hubPaymentStatus === 'Paid' && !order.paymentDate) order.paymentDate = new Date().toISOString().slice(0, 10);
  syncLegacy(order);
  await order.save();
  await auditOrder(req, order.id, changes);
  if (changes.length) {
    await hubLog(req, 'Sales order updated', 'Sales Orders', order.orderNumber,
      changes.map((c) => `${c.field}: ${c.oldValue ?? '—'} → ${c.newValue ?? '—'}`).join('; '));
  }
  res.json({ ok: true, changes: changes.length });
}));

async function updateCustomerFromOrder(order, fields) {
  if (!order.userId) return false;
  const user = await User.findByPk(order.userId);
  if (!user || user.role !== 'customer') return false;
  await user.update({
    name: fields.customerName, phone: fields.customerPhone, area: fields.area, address: fields.address,
    landmark: fields.landmark,
  });
  return true;
}

/** Customer / address snapshot only. Items, prices, payment and status never change here. */
router.patch('/orders/:number/contact', need('orders.update_delivery'), wrap(async (req, res) => {
  const b = req.body || {};
  const order = await findOrder(req.params.number);
  if (order.channel === 'pos') throw bad('Till sales are managed at the till.');
  const before = await view(order);
  const locked = !CONTACT_EDITABLE_STATUSES.includes(before.status);
  if (locked) {
    if (before.status === 'Cancelled') throw bad('Cancelled orders cannot be edited.');
    if (req.user.role !== 'admin') throw bad('This order is completed — only an Admin can correct these details.', 403);
    if (!clean(b.reason, 200)) throw bad('This order is completed — an Admin correction needs a reason.');
  }
  const name = clean(b.customerName, 120);
  const phone = clean(b.phone, 24);
  if (!name) throw bad('Customer name is required.');
  if (phone.replace(/\D/g, '').length < 6) throw bad('Enter a valid mobile number.');
  adoptLegacy(order, before);

  const pickup = before.fulfilmentMethod === 'Customer Pickup';
  const patch = {
    customerName: name, customerPhone: phone, area: clean(b.area, 80) || null, address: clean(b.address) || null,
    landmark: clean(b.landmark, 200) || null,
  };
  if (b.deliveryNotes !== undefined && !pickup) patch.deliveryNotes = clean(b.deliveryNotes) || null;
  if (b.deliveryDate !== undefined && !pickup) patch.deliveryDate = b.deliveryDate || null;
  if (pickup) {
    if (b.pickupDate !== undefined) patch.pickupDate = b.pickupDate || null;
    if (b.pickupTime !== undefined) patch.pickupTime = clean(b.pickupTime, 20) || null;
  }
  const previous = {
    customerName: before.customerName, customerPhone: before.phone, area: before.area, address: before.address,
    landmark: before.landmark, deliveryNotes: before.deliveryNotes, deliveryDate: before.deliveryDate,
    pickupDate: before.pickupDate, pickupTime: before.pickupTime,
  };
  const changes = Object.entries(patch)
    .filter(([col, value]) => String(previous[col] ?? '') !== String(value ?? ''))
    .map(([col, value]) => ({ field: FIELD_LABELS[col] ?? col, oldValue: str(previous[col]), newValue: str(value) }));
  if (locked && changes.length) changes.push({ field: 'Admin correction reason', oldValue: null, newValue: clean(b.reason, 200) });
  Object.assign(order, patch);
  order.shippingAddress = { ...(order.shippingAddress || {}), ...shippingAddressFrom(order) };
  await order.save();
  await auditOrder(req, order.id, changes);

  let customerUpdated = false;
  if (b.alsoUpdateCustomer) {
    if (!can(req, 'customers.edit')) throw bad('The order was corrected, but you do not have permission to update the customer profile.', 403);
    customerUpdated = await updateCustomerFromOrder(order, patch);
  }
  if (changes.length) {
    await hubLog(req, 'Order customer details corrected', 'Sales Orders', order.orderNumber,
      changes.map((c) => `${c.field}: ${c.oldValue ?? '—'} → ${c.newValue ?? '—'}`).join('; '));
  }
  res.json({ ok: true, changes: changes.length, customerUpdated });
}));

/** Prices, discounts and delivery charge on a confirmed order. Quantities and stock never change. */
router.post('/orders/:number/correct-prices', need('orders.edit_prices'), wrap(async (req, res) => {
  if (req.user.role !== 'admin') throw bad('Only an Admin can correct order prices.', 403);
  const b = req.body || {};
  const order = await findOrder(req.params.number);
  if (order.channel === 'pos') throw bad('Till sales are managed at the till.');
  const before = await view(order);
  if (before.status === 'Draft') throw bad('Edit the draft in New Sales Order instead.');
  if (before.status === 'Cancelled') throw bad('Cancelled orders cannot be corrected.');
  if (before.items.some((i) => i.returnedQty > 0)) throw bad('This order has returned items. Prices can no longer be corrected.');
  const reason = clean(b.reason, 200);
  if (!reason) throw bad('A reason is required for a price correction.');
  if (round2(b.expectedGrandTotal) !== round2(before.grandTotal)) {
    throw bad('This order changed while the form was open. Reopen it and enter the correction again.', 409);
  }
  adoptLegacy(order, before);

  const patches = Array.isArray(b.items) ? b.items : [];
  const lines = before.items.map((item) => {
    const p = patches.find((x) => String(x.id) === String(item.id));
    const unitPrice = round2(Math.max(p ? Number(p.unitPrice) || 0 : item.unitPrice, 0));
    const itemDiscount = round2(Math.max(p ? Number(p.discount) || 0 : item.discount, 0));
    const gross = round2(item.quantity * unitPrice);
    if (itemDiscount > gross) throw bad(`${item.name}: the item discount cannot be more than QAR ${gross.toFixed(2)}.`);
    return { item, unitPrice, itemDiscount, gross, net: round2(gross - itemDiscount) };
  });
  const netSubtotal = round2(lines.reduce((s, l) => s + l.net, 0));
  const value = Math.max(Number(b.orderDiscountValue) || 0, 0);
  const percent = b.orderDiscountType === 'percent';
  if (percent && value > 100) throw bad('An order discount percentage cannot be more than 100%.');
  const orderDiscount = percent ? round2((netSubtotal * value) / 100) : round2(value);
  if (orderDiscount > netSubtotal) throw bad('The order discount cannot be more than the item subtotal.');

  let allocated = 0;
  const finalLines = lines.map((l, index) => {
    const share = index === lines.length - 1
      ? round2(orderDiscount - allocated)
      : netSubtotal > 0 ? round2((orderDiscount * l.net) / netSubtotal) : 0;
    allocated = round2(allocated + share);
    const discount = round2(l.itemDiscount + Math.max(share, 0));
    return { ...l, discount, lineTotal: round2(Math.max(l.gross - discount, 0)) };
  });
  const subtotal = round2(finalLines.reduce((s, l) => s + l.lineTotal, 0));
  const deliveryCharge = before.fulfilmentMethod === 'Customer Pickup' ? 0 : round2(Math.max(Number(b.deliveryCharge) || 0, 0));
  const grandTotal = round2(subtotal + deliveryCharge);

  order.items = order.items.map((it, idx) => {
    const l = finalLines[idx];
    return { ...it, price: l.unitPrice, unitPrice: l.unitPrice, discount: l.discount, lineTotal: l.lineTotal };
  });
  order.changed('items', true);
  order.shippingCharge = deliveryCharge;
  order.totalAmount = grandTotal;
  await order.save();

  const changes = [];
  if (deliveryCharge !== before.deliveryCharge) changes.push({ field: 'Delivery charge', oldValue: String(before.deliveryCharge), newValue: String(deliveryCharge) });
  if (grandTotal !== before.grandTotal) changes.push({ field: 'Grand total', oldValue: String(before.grandTotal), newValue: String(grandTotal) });
  for (const l of finalLines) {
    if (l.unitPrice !== l.item.unitPrice) changes.push({ field: `Unit price · ${l.item.sku}`, oldValue: String(l.item.unitPrice), newValue: String(l.unitPrice) });
    if (l.discount !== l.item.discount) changes.push({ field: `Discount · ${l.item.sku}`, oldValue: String(l.item.discount), newValue: String(l.discount) });
  }
  if (orderDiscount > 0) {
    changes.push({ field: 'Order discount applied', oldValue: null, newValue: percent ? `${value}% (QAR ${orderDiscount})` : `QAR ${orderDiscount}` });
  }
  const overpaid = round2(Math.max(before.amountReceived - grandTotal, 0));
  if (overpaid > 0) changes.push({ field: 'Overpayment flagged', oldValue: null, newValue: `QAR ${overpaid} received above the new total` });
  changes.push({ field: 'Price correction reason', oldValue: null, newValue: reason });
  await auditOrder(req, order.id, changes);
  await hubLog(req, 'Order prices corrected', 'Sales Orders', order.orderNumber, `${reason} · new total QAR ${grandTotal}`);
  res.json({ ok: true, changes: changes.length, grandTotal, subtotal, orderDiscount, overpaid });
}));

/** Returns: restock only lines marked so, never more than was sold. */
router.post('/orders/:number/returns', need('orders.returns'), wrap(async (req, res) => {
  const b = req.body || {};
  const rows = (Array.isArray(b.lines) ? b.lines : []).filter((l) => (parseInt(l.quantity, 10) || 0) > 0);
  if (!rows.length) throw bad('Enter at least one returned quantity.');
  const t = await sequelize.transaction();
  let order;
  let restocked = 0;
  const touched = [];
  const reference = `RET-${req.params.number}-${Date.now().toString(36).toUpperCase()}`;
  try {
    order = await findOrder(req.params.number, { transaction: t, lock: t.LOCK.UPDATE });
    if (order.channel === 'pos') throw bad('Till sales are returned at the till.');
    const before = toSalesOrder(order);
    if (before.status === 'Draft') throw bad('Draft orders never deducted stock, so nothing to return.');
    if (before.status === 'Cancelled') throw bad('Cancelled orders cannot take returns.');
    adoptLegacy(order, before);
    const items = order.items.map((it) => ({ ...it }));
    for (const line of rows) {
      const idx = parseInt(line.lineIndex, 10);
      const item = items[idx];
      if (!item) throw bad('A returned line is not on this order.');
      const qty = parseInt(line.quantity, 10);
      const already = parseInt(item.returnedQty, 10) || 0;
      if (already + qty > item.quantity) throw bad(`${item.sku}: only ${item.quantity - already} unit(s) can still be returned on this order.`);
      const restock = Boolean(line.restock) && before.stockDeducted;
      let productId = item.productId ?? null;
      let variantIndex = null;
      if (productId) {
        const product = await Product.findByPk(productId, { transaction: t });
        if (product) variantIndex = lineVariantIndex(product, item);
        else productId = null;
      }
      if (restock && productId) {
        await applyStockDelta({
          productId, variantIndex, delta: qty, transaction: t,
          ctx: {
            kind: 'return', reference: `${reference}-${item.sku}`, orderId: order.id, reason: clean(line.reason, 120) || 'Other',
            notes: `Return restock · ${order.orderNumber}`, createdBy: req.user.id,
          },
        });
        touched.push(productId);
        restocked += 1;
      }
      await OrderReturn.create({
        orderId: order.id, lineIndex: idx, productId, variantIndex, sku: item.sku, quantity: qty,
        reason: RETURN_REASONS.includes(line.reason) ? line.reason : clean(line.reason, 120) || 'Other',
        restock: restock && Boolean(productId), notes: clean(line.notes) || null, createdBy: req.user.id,
      }, { transaction: t });
      item.returnedQty = already + qty;
    }
    order.items = items;
    order.changed('items', true);
    if (items.every((i) => (parseInt(i.returnedQty, 10) || 0) >= i.quantity)) order.hubStatus = 'Returned';
    syncLegacy(order);
    await order.save({ transaction: t });
    await auditOrder(req, order.id, rows.map((l) => {
      const item = items[parseInt(l.lineIndex, 10)];
      return { field: `Return · ${item.sku}`, oldValue: null, newValue: `${l.quantity} · ${l.reason}${l.restock ? ' · restocked' : ' · not restocked'}` };
    }), t);
    await t.commit();
  } catch (err) {
    if (!t.finished) await t.rollback();
    throw err;
  }
  await recomputeAfter(touched);
  await hubLog(req, 'Return processed', 'Sales Orders', order.orderNumber,
    rows.map((l) => `${order.items[l.lineIndex]?.sku} ×${l.quantity}${l.restock ? ' (restocked)' : ''}`).join(', '));
  res.json({ ok: true, reference, restocked });
}));

/** Controlled cancellation: optional, single restoration of the deducted stock. */
router.post('/orders/:number/cancel', need('orders.cancellations'), wrap(async (req, res) => {
  const reason = clean(req.body?.reason, 200);
  const restock = Boolean(req.body?.restock);
  const t = await sequelize.transaction();
  let order;
  let shouldRestore = false;
  let alreadyRestored = false;
  let fromStatus;
  const touched = [];
  try {
    order = await findOrder(req.params.number, { transaction: t, lock: t.LOCK.UPDATE });
    if (order.channel === 'pos') throw bad('Till sales are voided at the till.');
    const before = toSalesOrder(order);
    fromStatus = before.status;
    if (before.status === 'Cancelled') throw bad('This order is already cancelled.');
    adoptLegacy(order, before);
    alreadyRestored = Boolean(order.restockedAt) || order.stockState === 'restored';
    shouldRestore = restock && before.stockDeducted && !alreadyRestored;
    if (shouldRestore) {
      for (const it of order.items) {
        const qty = Math.max((parseInt(it.quantity, 10) || 0) - (parseInt(it.returnedQty, 10) || 0), 0);
        if (!qty || !it.productId) continue;
        const product = await Product.findByPk(it.productId, { transaction: t });
        if (!product) continue;
        await applyStockDelta({
          productId: product.id, variantIndex: lineVariantIndex(product, it), delta: qty, transaction: t,
          ctx: {
            kind: 'cancel_restock', reference: `CAN-${order.orderNumber}-${it.sku}`, orderId: order.id,
            reason: reason || 'Order cancelled', createdBy: req.user.id,
          },
        });
        touched.push(product.id);
      }
      order.restockedAt = new Date();
      order.stockState = 'restored';
    }
    order.hubStatus = 'Cancelled';
    order.cancelledAt = new Date();
    order.cancellationReason = reason || null;
    syncLegacy(order);
    await order.save({ transaction: t });
    await auditOrder(req, order.id, [
      { field: 'Status', oldValue: fromStatus, newValue: 'Cancelled' },
      { field: 'Cancellation reason', oldValue: null, newValue: reason || 'Not given' },
      { field: 'Stock restored', oldValue: null, newValue: shouldRestore ? 'Yes' : alreadyRestored ? 'Already restored earlier' : 'No' },
    ], t);
    await t.commit();
  } catch (err) {
    if (!t.finished) await t.rollback();
    throw err;
  }
  await recomputeAfter(touched);
  await hubLog(req, 'Sales order cancelled', 'Sales Orders', order.orderNumber, `${reason}${shouldRestore ? ' · stock restored' : ''}`);
  res.json({ ok: true, restored: shouldRestore });
}));

router.post('/orders/:number/invoice-print', need('invoices.print', 'invoices.download', 'invoices.view'), wrap(async (req, res) => {
  await hubLog(req, 'Invoice printed', 'Invoices & Labels', req.params.number, 'A4 invoice printed / saved as PDF');
  res.json({ ok: true });
}));

/** Print counter only — printing never changes stock. */
router.post('/orders/:number/label-print', need('invoices.labels_print', 'invoices.labels'), wrap(async (req, res) => {
  const size = req.body?.labelSize === '100x150' ? '100x150' : '100x130';
  const order = await findOrder(req.params.number);
  const next = (order.labelPrintCount || 0) + 1;
  await order.update({ labelPrintCount: next, labelSize: size });
  await hubLog(req, next === 1 ? 'Delivery label printed' : 'Delivery label reprinted', 'Invoices & Labels',
    order.orderNumber, `Label ${size} · print ${next}`);
  res.json({ printCount: next });
}));

// ════════════════════════════════════════════════════════════════════
// Customers (customer Users)
// ════════════════════════════════════════════════════════════════════
function mapCustomer(u, prefix, stats) {
  return {
    id: String(u.id),
    code: customerCode(u.id, prefix),
    name: u.name,
    phone: u.phone || '',
    altPhone: u.altPhone || null,
    area: u.area || null,
    address: u.address || null,
    landmark: u.landmark || null,
    notes: u.customerNotes || null,
    email: u.email || null,
    createdAt: u.createdAt,
    orderCount: stats?.count ?? 0,
    totalSpend: round2(stats?.spend ?? 0),
    lastOrderDate: stats?.last ?? null,
  };
}

async function allCustomers() {
  return User.findAll({ where: { role: 'customer' }, order: [['name', 'ASC']] });
}

async function findDuplicateByPhone(phone, excludeId) {
  if (!normalizePhone(phone)) return null;
  const users = await User.findAll({
    where: { role: 'customer', [Op.or]: [{ phone: { [Op.ne]: null } }, { altPhone: { [Op.ne]: null } }] },
  });
  return users.find((u) => u.id !== excludeId && (samePhone(u.phone, phone) || samePhone(u.altPhone, phone))) || null;
}

router.get('/customers', need('customers.view', 'orders.create'), wrap(async (req, res) => {
  const [settings, users, orders] = await Promise.all([
    loadAppSettings(),
    allCustomers(),
    Order.findAll({
      where: { userId: { [Op.ne]: null } },
      attributes: ['id', 'userId', 'totalAmount', 'createdAt', 'hubStatus', 'orderStatus', 'channel', 'paymentMethod',
        'paymentStatus', 'stockState'],
    }),
  ]);
  const stats = new Map();
  for (const o of orders) {
    const s = stats.get(o.userId) || { count: 0, spend: 0, last: null };
    s.count += 1;
    const status = toSalesOrder(o).status;
    if (status !== 'Cancelled' && status !== 'Draft') s.spend += parseFloat(o.totalAmount) || 0;
    const when = new Date(o.createdAt).toISOString();
    if (!s.last || when > s.last) s.last = when;
    stats.set(o.userId, s);
  }
  res.set('Cache-Control', 'no-store');
  res.json(users.map((u) => mapCustomer(u, settings.customerPrefix, stats.get(u.id))));
}));

router.get('/customers/lookup', need('orders.create', 'customers.view'), wrap(async (req, res) => {
  const match = await findDuplicateByPhone(req.query.phone || '');
  if (!match) return res.json(null);
  const settings = await loadAppSettings();
  res.json(mapCustomer(match, settings.customerPrefix));
}));

async function customerOrders(userId) {
  return Order.findAll({ where: { userId }, order: [['createdAt', 'DESC']] });
}

router.get('/customers/:id/history', need('customers.history'), wrap(async (req, res) => {
  const orders = (await customerOrders(parseInt(req.params.id, 10))).slice(0, 30);
  res.json(orders.map((o) => {
    const v = toSalesOrder(o);
    return {
      orderId: v.id, date: v.orderDate, status: v.status, grandTotal: v.grandTotal, paymentStatus: v.paymentStatus,
      itemCount: v.items.reduce((s, i) => s + i.quantity, 0),
    };
  }));
}));

router.get('/customers/:id/purchases', need('customers.history'), wrap(async (req, res) => {
  const settings = await loadAppSettings();
  const orders = await customerOrders(parseInt(req.params.id, 10));
  const returns = orders.length
    ? await OrderReturn.findAll({ where: { orderId: orders.map((o) => o.id) } })
    : [];
  res.json(orders.map((o) => ({
    order: toSalesOrder(o, { customerPrefix: settings.customerPrefix }),
    returns: returns.filter((r) => r.orderId === o.id).map((r) => ({
      sku: r.sku, quantity: r.quantity, reason: r.reason, restock: r.restock, createdAt: r.createdAt,
    })),
  })));
}));

function customerInput(b) {
  const name = clean(b.name, 120);
  const phone = clean(b.phone, 24);
  if (!name) throw bad('Customer name is required.');
  if (normalizePhone(phone).length < 6) throw bad('Enter a valid mobile number.');
  const altPhone = clean(b.altPhone, 24) || null;
  if (altPhone && samePhone(altPhone, phone)) throw bad('Alternate number must be different from the mobile number.');
  return {
    name, phone, altPhone, area: clean(b.area, 80) || null, address: clean(b.address) || null,
    landmark: clean(b.landmark, 200) || null, customerNotes: clean(b.notes) || null,
  };
}

/**
 * Create a customer. `reuse: true` (New Sales Order) returns an existing
 * customer with the same mobile number instead of failing on it.
 */
router.post('/customers', need('customers.add', 'orders.create'), wrap(async (req, res) => {
  const input = customerInput(req.body || {});
  const settings = await loadAppSettings();
  const duplicate = await findDuplicateByPhone(input.phone);
  if (duplicate) {
    if (req.body?.reuse) return res.json({ customer: mapCustomer(duplicate, settings.customerPrefix), existed: true });
    throw bad(`This mobile number already belongs to ${duplicate.name} (${customerCode(duplicate.id, settings.customerPrefix)}).`);
  }
  if (!req.body?.reuse && !can(req, 'customers.add')) throw bad('You do not have permission to add customers.', 403);
  const user = await User.create({ ...input, role: 'customer' });
  const code = customerCode(user.id, settings.customerPrefix);
  await hubLog(req, 'Customer created', 'Customers', code, `${input.name} · ${input.phone}`);
  res.status(201).json({ customer: mapCustomer(user, settings.customerPrefix), existed: false });
}));

router.put('/customers/:id', need('customers.edit'), wrap(async (req, res) => {
  const user = await User.findByPk(parseInt(req.params.id, 10));
  if (!user || user.role !== 'customer') throw bad('This customer no longer exists.', 404);
  const input = customerInput(req.body || {});
  const settings = await loadAppSettings();
  const duplicate = await findDuplicateByPhone(input.phone, user.id);
  if (duplicate) {
    throw bad(`This mobile number already belongs to ${duplicate.name} (${customerCode(duplicate.id, settings.customerPrefix)}).`);
  }
  const labels = [['name', 'Name'], ['phone', 'Mobile'], ['altPhone', 'Alternate mobile'], ['area', 'Area'], ['address', 'Address'], ['customerNotes', 'Notes']];
  const changed = labels
    .filter(([k]) => (user[k] ?? '') !== (input[k] ?? ''))
    .map(([k, label]) => `${label}: ${user[k] ?? '—'} → ${input[k] ?? '—'}`);
  await user.update(input);
  await hubLog(req, 'Customer updated', 'Customers', customerCode(user.id, settings.customerPrefix),
    changed.length ? changed.join('; ').slice(0, 400) : input.name);
  res.json(mapCustomer(user, settings.customerPrefix));
}));

export default router;
