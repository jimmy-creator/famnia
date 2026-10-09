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
  Order, SalesReturn, Product, ProductStock, Location, CashierSession, User, CashAccount, CashTransaction,
  recomputeProductStock, writeCashTxn, logActivity, verifyManagerPin,
} from '../models/index.js';

const REFUND_AMOUNT_THRESHOLD = 50;    // KWD — over this needs manager approval
import { protect, requirePermission } from '../middleware/auth.js';
import { refundValuer } from '../utils/refund.js';
import { rangeStart, rangeEnd } from '../utils/dates.js';
import { dp } from '../utils/money.js';
import { hasPermission } from '../hub/permissions.js';

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
        return next();
      }
      // Otherwise only admin or staff with the orders permission — a lookup
      // returns the customer's name, phone and address.
      if (user.role === 'admin' || (user.role === 'staff' && hasPermission(user, 'orders'))) {
        return next();
      }
      return res.status(403).json({ message: 'Not authorised' });
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

    // Stamp each line with its discount-inclusive unit value so the terminal
    // quotes the same refund the create route will actually pay out.
    const orderJson = order.toJSON();
    const refundValue = refundValuer(orderJson);
    orderJson.items = (orderJson.items || []).map((it) => ({
      ...it,
      netUnitPrice: refundValue(it, 1),
    }));

    res.json({
      order: orderJson,
      returnedSoFar,
      priorReturns: prior.length,
    });
  } catch (err) {
    console.error('[returns/lookup]', err);
    res.status(500).json({ message: err.message });
  }
});

// ─── Create return ─────────────────────────────────────────────────
// Body: { orderId?, items: [{productId, variantIndex, quantity, returnToStock?}],
//         refundMethod, reason?, notes?, locationId? (admin only) }
//
// Without orderId it is a no-receipt return: the customer has no bill, so
// there is nothing to cap quantities against and each item is refunded at
// the product's CURRENT selling price. The manager-override threshold below
// applies the same way.
router.post('/', authEither, async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { orderId, items, refundMethod, reason, notes } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      await t.rollback();
      return res.status(400).json({ message: 'items[] required' });
    }
    // No customer credit: every refund goes back out a real money rail.
    // store_credit was removed — it wrote no ledger entry and nothing
    // anywhere could redeem it, so issuing it created a hidden liability.
    if (!['cash', 'card'].includes(refundMethod)) {
      await t.rollback();
      return res.status(400).json({ message: 'refundMethod must be cash or card' });
    }

    const order = orderId ? await Order.findByPk(orderId, { transaction: t }) : null;
    if (orderId && (!order || order.paymentStatus !== 'paid')) {
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
      locationId = parseInt(req.body.locationId, 10);
      if (!locationId) {
        await t.rollback();
        return res.status(400).json({ message: 'locationId required for admin returns' });
      }
    }

    // Cap each return line against (sold - already-returned).
    const prior = order ? await SalesReturn.findAll({
      where: { orderId: order.id, status: 'completed' },
      attributes: ['items'], transaction: t,
    }) : [];
    const key = (pid, vIdx) => `${pid}:${vIdx ?? 'b'}`;
    const returnedSoFar = {};
    for (const r of prior) {
      for (const it of (r.items || [])) {
        const k = key(it.productId, it.variantIndex);
        returnedSoFar[k] = (returnedSoFar[k] || 0) + (parseInt(it.quantity, 10) || 0);
      }
    }
    const originalLineByKey = new Map();
    for (const it of (order?.items || [])) {
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
    const refundValue = order ? refundValuer(order) : null;

    // No-receipt returns price each line from the product as it is today.
    const productsById = new Map();
    if (!order) {
      const ids = [...new Set(items.map((it) => parseInt(it.productId, 10)).filter(Boolean))];
      const rows = await Product.findAll({ where: { id: ids }, transaction: t });
      for (const p of rows) productsById.set(p.id, p);
    }
    const currentLine = (productId, vIdx) => {
      const p = productsById.get(productId);
      if (!p) return null;
      const v = vIdx != null && Array.isArray(p.variants) ? p.variants[vIdx] : null;
      if (vIdx != null && !v) return null;
      const suffix = v ? ` (${Object.values(v.options || {}).join('/')})` : '';
      return {
        name: p.name + suffix,
        nameAr: p.nameAr ? p.nameAr + suffix : null,
        sku: v?.sku || p.code || null,
        barcode: v?.barcode || p.barcode || null,
        price: parseFloat(v?.price ?? p.price) || 0,
        // Current cost stands in for the missing sale snapshot, so the P&L
        // still credits COGS back for goods returning to stock.
        costPrice: parseFloat(v?.costPrice ?? p.costPrice ?? 0) || 0,
      };
    };

    for (const it of items) {
      const productId = parseInt(it.productId, 10);
      const vIdx = it.variantIndex == null || it.variantIndex === '' ? null : parseInt(it.variantIndex, 10);
      const qty = parseInt(it.quantity, 10);
      const returnToStock = it.returnToStock !== false;
      if (!productId || !qty || qty < 1) {
        await t.rollback();
        return res.status(400).json({ message: 'Invalid item entry' });
      }
      if (!order) {
        const line = currentLine(productId, vIdx);
        if (!line) {
          await t.rollback();
          return res.status(400).json({ message: `Product ${productId} not found` });
        }
        const lineRefund = +(line.price * qty).toFixed(dp());
        refundTotal += lineRefund;
        returnedItems.push({
          productId, variantIndex: vIdx,
          name: line.name, nameAr: line.nameAr, sku: line.sku, barcode: line.barcode,
          price: line.price, costPrice: line.costPrice, quantity: qty, refundAmount: lineRefund, returnToStock,
        });
        if (returnToStock) stockBumps.push({ productId, variantIndex: vIdx, qty });
        continue;
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
      // Count this line before checking the next, so the same product sent
      // as two lines can't each pass against the original remaining qty.
      returnedSoFar[key(productId, vIdx)] = alreadyReturned + qty;

      // Refund what the customer actually paid for these units, not the
      // gross price — line, manual and coupon discounts all come off.
      const lineRefund = refundValue(original, qty);
      refundTotal += lineRefund;
      returnedItems.push({
        productId,
        variantIndex: vIdx,
        name: original.name,
        nameAr: original.nameAr || null,
        sku: original.sku || original.variant?.sku || null,
        barcode: original.barcode || null,
        price: +(lineRefund / qty).toFixed(dp()),   // net unit price, so the receipt's qty × price adds up
        listPrice: parseFloat(original.price) || 0,
        // Carry the original line's COGS snapshot so the P&L can credit it
        // back. Without it refundCogs stays 0: the goods return to stock
        // (inventory up) while COGS is never reduced (profit unchanged),
        // which shows up as a permanent balance-sheet drift.
        costPrice: parseFloat(original.costPrice) || 0,
        quantity: qty,
        refundAmount: lineRefund,
        returnToStock,
      });
      if (returnToStock) stockBumps.push({ productId, variantIndex: vIdx, qty });
    }
    refundTotal = +refundTotal.toFixed(dp());

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
      orderId: order?.id ?? null,
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
    if (order) {
      const newRefundAmount = +((parseFloat(order.refundAmount) || 0) + refundTotal).toFixed(dp());
      await order.update({ refundAmount: newRefundAmount }, { transaction: t });
    }

    // Cash/card refunds are money OUT of the corresponding location
    // account. Store credit doesn't move cash, so no ledger entry.
    if (['cash', 'card'].includes(refundMethod)) {
      const acctType = refundMethod === 'cash' ? 'drawer' : 'card_terminal';
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
          description: order
            ? `Refund vs ${order.orderNumber} (${refundMethod})`
            : `Refund, no receipt (${refundMethod})`,
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
        orderNumber: order?.orderNumber ?? null,
        noReceipt: !order,
        refundAmount: refundTotal,
        refundMethod,
        itemCount: returnedItems.reduce((s, l) => s + l.quantity, 0),
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
      order: order ? { id: order.id, orderNumber: order.orderNumber } : null,
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
    if (req.user.role !== 'admin' && !hasPermission(req.user, 'orders')) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const where = {};
    if (req.query.from || req.query.to) {
      const from = req.query.from ? rangeStart(req.query.from) : new Date('1970-01-01');
      const to = req.query.to ? rangeEnd(req.query.to) : new Date('2999-12-31');
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
    if (req.user.role !== 'admin' && !hasPermission(req.user, 'orders')) {
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
router.post('/:id/cancel', protect, requirePermission('orders'), async (req, res) => {
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
      const newRefund = Math.max(0, +((parseFloat(order.refundAmount) || 0) - parseFloat(sr.refundAmount || 0)).toFixed(dp()));
      await order.update({ refundAmount: newRefund }, { transaction: t });
    }
    // Put the refunded money back: a +amount entry against each ledger row
    // the return wrote (kept rather than deleted, for the audit trail).
    // Store credit never touched an account, so it has none to reverse.
    const refundTxns = await CashTransaction.findAll({
      where: { sourceType: 'SalesReturn', sourceId: sr.id },
      transaction: t,
    });
    for (const txn of refundTxns) {
      await writeCashTxn({
        cashAccountId: txn.cashAccountId,
        amount: -parseFloat(txn.amount),
        source: 'return',
        sourceType: 'SalesReturn',
        sourceId: sr.id,
        reference: sr.returnNumber,
        description: `Cancelled return ${sr.returnNumber}`,
        date: new Date(),
        createdBy: req.user.id,
        transaction: t,
      });
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
