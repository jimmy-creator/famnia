/**
 * Sales Returns — issued at POS counter (cashier) or by admin.
 *
 *   GET  /api/returns/lookup/:orderNumber  cashier or staff: fetch order
 *                                          and how much of each line has
 *                                          already been returned.
 *   POST /api/returns                      cashier OR admin: create a return.
 *                                          Cashier writes with their session/
 *                                          location; admin specifies locationId
 *                                          and refundMethod.
 *   GET  /api/returns                      admin/staff: list with filters
 *   GET  /api/returns/:id                  admin/staff: detail
 *
 * Side effects on create:
 *   - Each returned item's ProductStock at the return's locationId is
 *     incremented by the returned quantity (unless returnToStock=false
 *     for that line — e.g. defective items go to write-off, not stock).
 *   - Product.stock is recomputed via the explicit helper.
 *   - Order.refundAmount is bumped (additively) so the order history
 *     shows total refunded against this order.
 */
import { Router } from 'express';
import { Op } from 'sequelize';
import sequelize from '../config/database.js';
import {
  Order, SalesReturn, ProductStock, Location, CashierSession, User, CashAccount,
  recomputeProductStock, writeCashTxn, logActivity, verifyManagerPin,
} from '../models/index.js';

const REFUND_AMOUNT_THRESHOLD = 50;    // KWD — over this needs manager approval
import { protect, admin, protectCashier } from '../middleware/auth.js';

const router = Router();

function genReturnNumber() {
  return `RTN-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
}

// Either a cashier (open shift) or staff with orders permission may look up
// an order. Tries cashier-session JWT first, falls back to admin/staff JWT.
async function authEither(req, res, next) {
  if (req.cookies?.token) {
    try {
      const { default: jwt } = await import('jsonwebtoken');
      const decoded = jwt.verify(req.cookies.token, process.env.JWT_SECRET);
      const user = await User.findByPk(decoded.id);
      if (!user) return res.status(401).json({ message: 'Not authenticated' });
      req.user = user;
      if (decoded.role === 'cashier' && decoded.sessionId) {
        req.cashierSessionId = decoded.sessionId;
        req.cashierLocationId = decoded.locationId;
      }
      return next();
    } catch {
      return res.status(401).json({ message: 'Invalid token' });
    }
  }
  return res.status(401).json({ message: 'Not authenticated' });
}

// ─── Lookup ────────────────────────────────────────────────────────
// Returns the order plus a `returnedSoFar` map keyed by productId:variantIdx
// so the client can cap each line's returnable quantity.
router.get('/lookup/:orderNumber', authEither, async (req, res) => {
  try {
    const order = await Order.findOne({
      where: { orderNumber: req.params.orderNumber },
      include: [{ model: Location, attributes: ['id', 'name'] }],
    });
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.paymentStatus !== 'paid') {
      return res.status(400).json({ message: 'Only paid orders can be returned' });
    }

    const prior = await SalesReturn.findAll({
      where: { orderId: order.id, status: 'completed' },
      attributes: ['items'],
    });

    const key = (pid, vIdx) => `${pid}:${vIdx ?? 'b'}`;
    const returnedSoFar = {};
    for (const r of prior) {
      for (const it of (r.items || [])) {
        const k = key(it.productId, it.variantIndex);
        returnedSoFar[k] = (returnedSoFar[k] || 0) + (parseInt(it.quantity, 10) || 0);
      }
    }

    res.json({
      order: order.toJSON(),
      returnedSoFar,
      priorReturns: prior.length,
    });
  } catch (err) {
    console.error('[returns/lookup]', err);
    res.status(500).json({ message: err.message });
  }
});

// ─── Create return ─────────────────────────────────────────────────
// Body: { orderId, items: [{productId, variantIndex, quantity, returnToStock?}],
//         refundMethod, reason?, notes?, locationId? (admin only) }
router.post('/', authEither, async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { orderId, items, refundMethod, reason, notes } = req.body || {};
    if (!orderId || !Array.isArray(items) || items.length === 0) {
      await t.rollback();
      return res.status(400).json({ message: 'orderId and items[] required' });
    }
    if (!['cash', 'card', 'knet', 'store_credit'].includes(refundMethod)) {
      await t.rollback();
      return res.status(400).json({ message: 'refundMethod must be cash, card, knet or store_credit' });
    }

    const order = await Order.findByPk(orderId, { transaction: t });
    if (!order || order.paymentStatus !== 'paid') {
      await t.rollback();
      return res.status(400).json({ message: 'Order not eligible for return' });
    }

    // Decide location + session.
    // Cashier returns: use their shift session + location.
    // Admin returns: locationId must be supplied (the warehouse/store receiving
    // the returned goods). Cashier session is null.
    let locationId, cashierSessionId = null;
    if (req.cashierSessionId) {
      const session = await CashierSession.findByPk(req.cashierSessionId, { transaction: t });
      if (!session || session.status !== 'open') {
        await t.rollback();
        return res.status(403).json({ message: 'Shift is not open' });
      }
      cashierSessionId = session.id;
      locationId = req.cashierLocationId;
    } else {
      if (req.user.role !== 'admin' && req.user.role !== 'staff') {
        await t.rollback();
        return res.status(403).json({ message: 'Not authorised to create returns' });
      }
      locationId = parseInt(req.body.locationId, 10);
      if (!locationId) {
        await t.rollback();
        return res.status(400).json({ message: 'locationId required for admin returns' });
      }
    }

    // Cap each return line against (sold - already-returned).
    const prior = await SalesReturn.findAll({
      where: { orderId: order.id, status: 'completed' },
      attributes: ['items'], transaction: t,
    });
    const key = (pid, vIdx) => `${pid}:${vIdx ?? 'b'}`;
    const returnedSoFar = {};
    for (const r of prior) {
      for (const it of (r.items || [])) {
        const k = key(it.productId, it.variantIndex);
        returnedSoFar[k] = (returnedSoFar[k] || 0) + (parseInt(it.quantity, 10) || 0);
      }
    }
    const originalLineByKey = new Map();
    for (const it of (order.items || [])) {
      originalLineByKey.set(key(it.productId, it.variant?.variantIndex ?? null), it);
    }
    // Fallback: many POS orders store variantIndex inside .variant, others on the line root.
    // Try both keys.
    const findOriginal = (productId, vIdx) => {
      return originalLineByKey.get(key(productId, vIdx))
        || (order.items || []).find((it) => it.productId === productId && (it.variantIndex ?? null) === (vIdx ?? null))
        || (order.items || []).find((it) => it.productId === productId);
    };

    const returnedItems = [];
    let refundTotal = 0;
    const stockBumps = [];

    for (const it of items) {
      const productId = parseInt(it.productId, 10);
      const vIdx = it.variantIndex == null || it.variantIndex === '' ? null : parseInt(it.variantIndex, 10);
      const qty = parseInt(it.quantity, 10);
      const returnToStock = it.returnToStock !== false;
      if (!productId || !qty || qty < 1) {
        await t.rollback();
        return res.status(400).json({ message: 'Invalid item entry' });
      }
      const original = findOriginal(productId, vIdx);
      if (!original) {
        await t.rollback();
        return res.status(400).json({ message: `Product ${productId} not on the original order` });
      }
      const alreadyReturned = returnedSoFar[key(productId, vIdx)] || 0;
      const maxReturnable = (parseInt(original.quantity, 10) || 0) - alreadyReturned;
      if (qty > maxReturnable) {
        await t.rollback();
        return res.status(400).json({
          message: `Can only return ${maxReturnable} of "${original.name}" (already returned ${alreadyReturned})`,
        });
      }

      const unitPrice = parseFloat(original.price) || 0;
      const lineRefund = +(unitPrice * qty).toFixed(3);
      refundTotal += lineRefund;
      returnedItems.push({
        productId,
        variantIndex: vIdx,
        name: original.name,
        nameAr: original.nameAr || null,
        sku: original.sku || original.variant?.sku || null,
        price: unitPrice,
        quantity: qty,
        refundAmount: lineRefund,
        returnToStock,
      });
      if (returnToStock) stockBumps.push({ productId, variantIndex: vIdx, qty });
    }
    refundTotal = +refundTotal.toFixed(3);

    // Manager-override gate for refunds over the threshold. Cashier
    // initiated only — admin-initiated returns assume admin auth.
    let managerUser = null;
    const isAdminInitiated = !req.cashierSessionId;
    if (!isAdminInitiated && refundTotal > REFUND_AMOUNT_THRESHOLD) {
      const { managerOverride } = req.body || {};
      if (!managerOverride?.userId || !managerOverride?.pin) {
        await t.rollback();
        return res.status(403).json({
          message: `Refund above ${REFUND_AMOUNT_THRESHOLD} needs a manager override`,
          requires: 'manager_override',
          reason: `refund_${refundTotal}`,
        });
      }
      try {
        managerUser = await verifyManagerPin({
          userId: managerOverride.userId, pin: managerOverride.pin, transaction: t,
        });
      } catch (err) {
        await t.rollback();
        return res.status(403).json({ message: err.message, requires: 'manager_override' });
      }
    }

    // Update or create per-location stock rows.
    for (const b of stockBumps) {
      const existing = await ProductStock.findOne({
        where: { productId: b.productId, variantIndex: b.variantIndex, locationId },
        transaction: t,
      });
      if (existing) {
        await existing.update({ quantity: existing.quantity + b.qty }, { transaction: t });
      } else {
        await ProductStock.create({
          productId: b.productId,
          variantIndex: b.variantIndex,
          locationId,
          quantity: b.qty,
        }, { transaction: t });
      }
    }

    const sr = await SalesReturn.create({
      returnNumber: genReturnNumber(),
      orderId: order.id,
      locationId,
      cashierSessionId,
      items: returnedItems,
      refundAmount: refundTotal,
      refundMethod,
      reason: reason?.trim() || null,
      notes: notes?.trim() || null,
      processedBy: req.user.id,
      status: 'completed',
    }, { transaction: t });

    // Bump Order.refundAmount additively so the order history shows total
    // refunded against this order.
    const newRefundAmount = +((parseFloat(order.refundAmount) || 0) + refundTotal).toFixed(3);
    await order.update({ refundAmount: newRefundAmount }, { transaction: t });

    // Cash/card/KNET refunds are money OUT of the corresponding location
    // account. Store credit doesn't move cash, so no ledger entry.
    if (['cash', 'card', 'knet'].includes(refundMethod)) {
      const acctType = refundMethod === 'cash' ? 'drawer'
        : refundMethod === 'knet' ? 'knet_terminal'
        : 'card_terminal';
      const acct = await CashAccount.findOne({
        where: { locationId, type: acctType, active: true },
        transaction: t,
      });
      if (acct) {
        await writeCashTxn({
          cashAccountId: acct.id,
          amount: -refundTotal,
          source: 'return',
          sourceType: 'SalesReturn',
          sourceId: sr.id,
          reference: sr.returnNumber,
          description: `Refund vs ${order.orderNumber} (${refundMethod})`,
          date: new Date(),
          createdBy: req.user.id,
          transaction: t,
        });
      }
    }

    await logActivity({
      userId: req.user.id,
      action: 'sales_return_create',
      entityType: 'SalesReturn',
      entityId: sr.id,
      details: {
        returnNumber: sr.returnNumber,
        orderNumber: order.orderNumber,
        refundAmount: refundTotal,
        refundMethod,
        itemCount: lines.reduce((s, l) => s + l.quantity, 0),
      },
      managerOverrideBy: managerUser?.id || null,
      reason: managerUser ? (req.body.managerOverride?.reason || reason || `Refund ${refundTotal}`) : null,
      locationId,
      cashierSessionId: req.cashierSessionId || null,
      ip: req.ip,
      transaction: t,
    });

    await t.commit();
    for (const b of stockBumps) await recomputeProductStock(b.productId);

    // Refetch with associations for the receipt.
    const full = await SalesReturn.findByPk(sr.id, {
      include: [
        { model: Location, attributes: ['id', 'name', 'code', 'address', 'phone'] },
        { model: User, as: 'processor', attributes: ['id', 'name'] },
      ],
    });
    res.status(201).json({
      salesReturn: full.toJSON(),
      order: { id: order.id, orderNumber: order.orderNumber },
    });
  } catch (err) {
    if (!t.finished) await t.rollback().catch(() => {});
    console.error('[returns/create]', err);
    res.status(400).json({ message: err.message });
  }
});

// ─── Admin list ────────────────────────────────────────────────────
router.get('/', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && !(req.user.permissions || []).includes('orders')) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const where = {};
    if (req.query.from || req.query.to) {
      const from = req.query.from ? new Date(req.query.from) : new Date('1970-01-01');
      const to = req.query.to ? new Date(req.query.to) : new Date('2999-12-31');
      where.createdAt = { [Op.between]: [from, to] };
    }
    if (req.query.locationId) where.locationId = parseInt(req.query.locationId, 10);
    if (req.query.refundMethod) where.refundMethod = req.query.refundMethod;
    if (req.query.cashierSessionId) where.cashierSessionId = parseInt(req.query.cashierSessionId, 10);
    if (req.query.status) where.status = req.query.status;

    const rows = await SalesReturn.findAll({
      where,
      include: [
        { model: Order, attributes: ['id', 'orderNumber', 'totalAmount'] },
        { model: Location, attributes: ['id', 'name', 'code'] },
        { model: User, as: 'processor', attributes: ['id', 'name'] },
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(req.query.limit, 10) || 200,
    });
    res.json(rows);
  } catch (err) {
    console.error('[returns/list]', err);
    res.status(500).json({ message: err.message });
  }
});

router.get('/:id', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && !(req.user.permissions || []).includes('orders')) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const row = await SalesReturn.findByPk(req.params.id, {
      include: [
        { model: Order, attributes: ['id', 'orderNumber', 'totalAmount', 'shippingAddress', 'createdAt'] },
        { model: Location, attributes: ['id', 'name', 'code', 'address', 'phone'] },
        { model: User, as: 'processor', attributes: ['id', 'name', 'email'] },
        { model: CashierSession, attributes: ['id', 'openedAt', 'closedAt', 'status'] },
      ],
    });
    if (!row) return res.status(404).json({ message: 'Return not found' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Admin override: also let admin cancel a return (reverses stock + refund).
router.post('/:id/cancel', protect, admin, async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const sr = await SalesReturn.findByPk(req.params.id, { transaction: t });
    if (!sr) { await t.rollback(); return res.status(404).json({ message: 'Return not found' }); }
    if (sr.status !== 'completed') { await t.rollback(); return res.status(400).json({ message: 'Already cancelled' }); }

    const order = await Order.findByPk(sr.orderId, { transaction: t });
    // Decrement stock that was added back, only for lines that were returnToStock.
    const productIds = new Set();
    for (const it of (sr.items || [])) {
      productIds.add(it.productId);
      if (it.returnToStock === false) continue;
      const ps = await ProductStock.findOne({
        where: { productId: it.productId, variantIndex: it.variantIndex ?? null, locationId: sr.locationId },
        transaction: t,
      });
      if (ps) {
        const newQty = Math.max(0, ps.quantity - it.quantity);
        await ps.update({ quantity: newQty }, { transaction: t });
      }
    }
    if (order) {
      const newRefund = Math.max(0, +((parseFloat(order.refundAmount) || 0) - parseFloat(sr.refundAmount || 0)).toFixed(3));
      await order.update({ refundAmount: newRefund }, { transaction: t });
    }
    await sr.update({ status: 'cancelled' }, { transaction: t });
    await t.commit();
    for (const pid of productIds) await recomputeProductStock(pid);
    res.json({ ok: true });
  } catch (err) {
    if (!t.finished) await t.rollback().catch(() => {});
    res.status(500).json({ message: err.message });
  }
});

export default router;
