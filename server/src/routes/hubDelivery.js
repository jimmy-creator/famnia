import { Router } from 'express';
import sequelize from '../config/database.js';
import { Order, OrderAuditLog, User } from '../models/index.js';
import { protect } from '../middleware/auth.js';
import { bad, hubLog, need, wrap as wrapAs } from '../hub/http.js';
import { loadAppSettings } from '../hub/settings.js';
import { localDate } from '../utils/dates.js';
import { SALES_PAYMENT_METHODS, adoptLegacy, clean, emailStatusChange, round2, syncLegacy, toSalesOrder } from '../hub/sales.js';

/**
 * FEMNIA Hub delivery: the board's assignment, and the delivery staff's own
 * screen. Delivery staff never read the order list — `/delivery/mine`
 * returns their assigned orders with safe fields only (no costs), and
 * `/delivery/:number/update` is their only write path.
 */
const router = Router();
router.use(protect);
const wrap = (fn) => wrapAs('hubDelivery', fn);

const DELIVERY_STATUSES = ['Pending', 'Out for Delivery', 'Delivered', 'Delivery Failed'];
const DELIVERY_PAYMENT_STATUSES = ['Pending', 'Paid'];
// Statuses a delivery shows as "Pending" (not yet on the road).
const NOT_STARTED = ['Confirmed', 'Awaiting Pickup'];

const isAdmin = (req) => req.user.role === 'admin';
const staffName = (u) => u.name || u.username || u.email || 'Staff';

async function audit(orderId, req, rows, transaction) {
  if (!rows.length) return;
  await OrderAuditLog.bulkCreate(rows.map((r) => ({
    orderId, field: r.field, oldValue: r.oldValue ?? null, newValue: r.newValue ?? null,
    changedBy: req.user.id, staffName: staffName(req.user),
  })), { transaction });
}

router.get('/delivery/staff', need('delivery.assign', 'delivery.view'), wrap(async (req, res) => {
  const users = await User.findAll({
    where: { role: 'delivery' },
    attributes: ['id', 'name', 'username', 'phone', 'status'],
    order: [['name', 'ASC']],
  });
  res.json(users.map((u) => ({
    id: String(u.id), fullName: u.name || null, username: u.username || null, phone: u.phone || null,
    status: u.status || 'active',
  })));
}));

router.get('/delivery/payment-modes', need('delivery.my_deliveries', 'delivery.view', 'orders.update_delivery'), wrap(async (req, res) => {
  res.json((await loadAppSettings()).deliveryPaymentModes);
}));

router.get('/delivery/mine', need('delivery.my_deliveries'), wrap(async (req, res) => {
  const orders = await Order.findAll({ where: { assignedTo: req.user.id }, order: [['createdAt', 'DESC']] });
  const rows = orders
    .map((o) => toSalesOrder(o))
    .filter((v) => v.status !== 'Draft' && v.status !== 'Cancelled')
    .map((v) => ({
      id: v.id,
      customerName: v.customerName,
      phone: v.phone,
      area: v.area,
      address: v.address,
      landmark: v.landmark,
      orderDate: v.orderDate,
      deliveryDate: v.deliveryDate,
      status: NOT_STARTED.includes(v.status) ? 'Pending' : v.status,
      paymentStatus: v.paymentStatus,
      paymentMode: v.paymentMode,
      grandTotal: v.grandTotal,
      amountReceived: v.amountReceived,
      deliveryNotes: v.deliveryNotes,
      paymentNotes: v.paymentNotes,
      items: v.items.map((i) => ({ name: i.name, size: i.size, color: i.color, quantity: i.quantity })),
    }));
  res.set('Cache-Control', 'no-store');
  res.json(rows);
}));

/** The only write path a delivery staff member has. Never touches stock. */
router.post('/delivery/:number/update', need('delivery.my_deliveries'), wrap(async (req, res) => {
  const b = req.body || {};
  const note = clean(b.note, 400);
  const t = await sequelize.transaction();
  let order;
  const changes = [];
  let previousOrderStatus = null;
  try {
    order = await Order.findOne({ where: { orderNumber: req.params.number }, transaction: t, lock: t.LOCK.UPDATE });
    if (!order) throw bad('This delivery no longer exists.', 404);
    if (order.assignedTo !== req.user.id && !isAdmin(req)) throw bad('This delivery is not assigned to you.', 403);
    const before = toSalesOrder(order);
    previousOrderStatus = order.orderStatus;
    if (before.status === 'Draft' || before.status === 'Cancelled' || order.channel === 'pos') {
      throw bad('This delivery can no longer be updated.');
    }
    if (!DELIVERY_STATUSES.includes(b.status)) throw bad('That delivery status is not allowed.');
    if (!DELIVERY_PAYMENT_STATUSES.includes(b.paymentStatus)) throw bad('That payment status is not allowed.');
    if (b.status === 'Delivery Failed' && !note) throw bad('Add a note explaining why the delivery failed.');
    const collected = b.amountCollected === undefined || b.amountCollected === null || b.amountCollected === ''
      ? before.amountReceived
      : round2(Number(b.amountCollected));
    if (!Number.isFinite(collected) || collected < 0 || collected > before.grandTotal) {
      throw bad('Amount collected must be between 0 and the invoice total.');
    }
    if (before.status === 'Delivered' && before.paymentStatus === 'Paid'
      && (b.status !== 'Delivered' || b.paymentStatus !== 'Paid') && !isAdmin(req)) {
      throw bad('Only an Admin can change a delivery that is already Delivered and Paid.', 403);
    }
    adoptLegacy(order, before);

    // "Pending" means not on the road yet: keep a not-started status as it is.
    const nextStatus = b.status === 'Pending'
      ? (NOT_STARTED.includes(before.status) ? before.status : 'Confirmed')
      : b.status;
    const shownBefore = NOT_STARTED.includes(before.status) ? 'Pending' : before.status;
    if (shownBefore !== b.status) changes.push({ field: 'Delivery status', oldValue: shownBefore, newValue: b.status });
    if (before.paymentStatus !== b.paymentStatus) changes.push({ field: 'Payment status', oldValue: before.paymentStatus, newValue: b.paymentStatus });
    if (before.amountReceived !== collected) changes.push({ field: 'Amount collected', oldValue: String(before.amountReceived), newValue: String(collected) });
    if (note && note !== (before.deliveryNotes || '')) changes.push({ field: 'Delivery note', oldValue: before.deliveryNotes, newValue: note });
    const mode = clean(b.paymentMode, 30);
    const allowedModes = [...SALES_PAYMENT_METHODS, ...(await loadAppSettings()).deliveryPaymentModes];
    if (mode && !allowedModes.some((m) => m.toLowerCase() === mode.toLowerCase())) {
      throw bad('That payment mode is not in the delivery payment modes list.');
    }
    if (mode && mode !== before.paymentMode) {
      changes.push({ field: 'Payment method', oldValue: before.paymentMode, newValue: mode });
      order.hubPaymentMode = mode;
    }

    order.hubStatus = nextStatus;
    order.hubPaymentStatus = b.paymentStatus;
    order.amountReceived = collected;
    if (b.paymentStatus === 'Paid' && !order.paymentDate) order.paymentDate = localDate();
    if (note) order.deliveryNotes = note;
    syncLegacy(order);
    await order.save({ transaction: t });
    await audit(order.id, req, changes, t);
    await t.commit();
  } catch (err) {
    if (!t.finished) await t.rollback();
    throw err;
  }
  await emailStatusChange(order, previousOrderStatus); // web customers hear about it, as with staff updates
  await hubLog(req, 'Delivery updated', 'Delivery', order.orderNumber,
    changes.length ? changes.map((c) => `${c.field}: ${c.oldValue ?? '—'} → ${c.newValue ?? '—'}`).join('; ') : 'no field changes');
  res.json({ ok: true });
}));

/** Assign (or clear, with a null staffId) one or more deliveries. */
router.post('/delivery/assign', need('delivery.assign'), wrap(async (req, res) => {
  const ids = Array.isArray(req.body?.orderIds) ? req.body.orderIds.map(String).slice(0, 500) : [];
  if (!ids.length) throw bad('Select at least one delivery first.');
  const rawStaff = req.body?.staffId;
  let target = null;
  if (rawStaff !== null && rawStaff !== undefined && rawStaff !== '') {
    target = await User.findByPk(parseInt(rawStaff, 10));
    if (!target || target.role !== 'delivery') throw bad('That account is not a delivery staff account.');
    if (target.status && target.status !== 'active') throw bad('That delivery staff account is not active.');
  }
  const targetName = target ? staffName(target) : 'Unassigned';
  let updated = 0;
  const t = await sequelize.transaction();
  try {
    const orders = await Order.findAll({ where: { orderNumber: ids }, transaction: t, lock: t.LOCK.UPDATE });
    for (const order of orders) {
      const v = toSalesOrder(order);
      if (v.status === 'Draft' || order.channel === 'pos') continue;
      const previous = order.assignedTo;
      order.assignedTo = target ? target.id : null;
      order.assignedBy = req.user.id;
      order.assignedAt = target ? new Date() : null;
      await order.save({ transaction: t });
      updated += 1;
      let oldName = null;
      if (previous) {
        const prev = await User.findByPk(previous, { attributes: ['name', 'username', 'email'], transaction: t });
        oldName = prev ? staffName(prev) : null;
      }
      await audit(order.id, req, [{ field: 'Delivery staff', oldValue: oldName, newValue: targetName }], t);
    }
    await t.commit();
  } catch (err) {
    if (!t.finished) await t.rollback();
    throw err;
  }
  await hubLog(req, 'Deliveries assigned', 'Delivery', null, `${updated} order(s) assigned to ${targetName}`);
  res.json({ ok: true, updated });
}));

export default router;
