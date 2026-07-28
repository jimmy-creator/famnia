/**
 * POS reports.
 *
 *   GET /api/reports/cashier-sales   admin: per-cashier breakdown over date range
 *   GET /api/reports/location-sales  admin: per-location breakdown + top items
 *   GET /api/reports/x               cashier: snapshot of current open shift
 *   GET /api/reports/z/:sessionId    admin or owner: closed-shift report
 *
 * All money sums are computed in JS from Order.totalAmount so we can split
 * by paymentMethod without a separate group-by SQL pass per cashier.
 */
import { Router } from 'express';
import { Op } from 'sequelize';
import { Order, User, CashierSession, Location, SalesReturn } from '../models/index.js';
import { protect, admin, protectCashier } from '../middleware/auth.js';

const router = Router();

// ─── helpers ───────────────────────────────────────────────────────
function parseRange(q) {
  // Default: today (00:00 → 23:59:59 local)
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000 - 1);
  const from = q.from ? new Date(q.from) : startOfDay;
  const to = q.to ? new Date(q.to) : endOfDay;
  return { from, to };
}

const isCash = (pm) => pm === 'pos_cash' || pm === 'cash';
const isCard = (pm) => pm === 'pos_card' || pm === 'card';
const isKnet = (pm) => pm === 'pos_knet' || pm === 'knet';

// Refunds are attributed to the refundMethod (= the actual money-out path
// from today's drawer), NOT to the original order's paymentMethod, since a
// customer can pay cash today and refund onto a card tomorrow.
function rollup(orders, returns = []) {
  let totalSales = 0, cashSales = 0, cardSales = 0, knetSales = 0;
  for (const o of orders) {
    const amt = parseFloat(o.totalAmount || 0);
    totalSales += amt;
    // Split-payment orders carry per-tender amounts in paymentBreakdown.
    // Single-tender orders fall back to paymentMethod-based bucketing.
    if (Array.isArray(o.paymentBreakdown) && o.paymentBreakdown.length > 0) {
      for (const tn of o.paymentBreakdown) {
        const tAmt = parseFloat(tn.amount || 0);
        if (tn.method === 'cash') cashSales += tAmt;
        else if (tn.method === 'card') cardSales += tAmt;
        else if (tn.method === 'knet') knetSales += tAmt;
      }
    } else if (isCash(o.paymentMethod)) cashSales += amt;
    else if (isCard(o.paymentMethod)) cardSales += amt;
    else if (isKnet(o.paymentMethod)) knetSales += amt;
  }
  let cashRefunds = 0, cardRefunds = 0, knetRefunds = 0, creditRefunds = 0, returnCount = 0;
  for (const r of returns) {
    if (r.status === 'cancelled') continue;
    const amt = parseFloat(r.refundAmount || 0);
    returnCount += 1;
    if (r.refundMethod === 'cash') cashRefunds += amt;
    else if (r.refundMethod === 'card') cardRefunds += amt;
    else if (r.refundMethod === 'knet') knetRefunds += amt;
    else if (r.refundMethod === 'store_credit') creditRefunds += amt;
  }
  const round = (n) => +n.toFixed(3);
  return {
    orderCount: orders.length,
    totalSales: round(totalSales),
    cashSales: round(cashSales),
    cardSales: round(cardSales),
    knetSales: round(knetSales),
    returnCount,
    cashRefunds: round(cashRefunds),
    cardRefunds: round(cardRefunds),
    knetRefunds: round(knetRefunds),
    creditRefunds: round(creditRefunds),
    netSales: round(totalSales - cashRefunds - cardRefunds - knetRefunds - creditRefunds),
  };
}

function topItems(orders, n = 5) {
  const map = new Map();   // name → { qty, revenue }
  for (const o of orders) {
    for (const it of (o.items || [])) {
      const key = it.name;
      const cur = map.get(key) || { qty: 0, revenue: 0 };
      cur.qty += parseInt(it.quantity, 10) || 0;
      cur.revenue += (parseFloat(it.price) || 0) * (parseInt(it.quantity, 10) || 0);
      map.set(key, cur);
    }
  }
  return [...map.entries()]
    .map(([name, v]) => ({ name, qty: v.qty, revenue: +v.revenue.toFixed(3) }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, n);
}

// ─── 1. Cashier sales (admin) ──────────────────────────────────────
// Optional filters: cashierId, locationId
router.get('/cashier-sales', protect, admin, async (req, res) => {
  try {
    const { from, to } = parseRange(req.query);
    const where = {
      cashierSessionId: { [Op.ne]: null },
      createdAt: { [Op.between]: [from, to] },
    };
    if (req.query.locationId) where.locationId = parseInt(req.query.locationId, 10);

    const orders = await Order.findAll({
      where,
      attributes: ['id', 'orderNumber', 'totalAmount', 'refundAmount', 'paymentMethod', 'items',
                   'cashierSessionId', 'locationId', 'createdAt'],
      include: [{
        model: CashierSession,
        attributes: ['id', 'userId', 'locationId', 'openedAt', 'closedAt', 'status'],
        include: [{ model: User, attributes: ['id', 'name'] }],
        required: true,
      }],
    });

    let filtered = orders;
    if (req.query.cashierId) {
      const cId = parseInt(req.query.cashierId, 10);
      filtered = orders.filter((o) => o.CashierSession?.userId === cId);
    }

    // Returns attributed per cashier — fetch returns in the same range
    // tied to a shift, then group by the shift's cashier.
    const returnWhere = {
      cashierSessionId: { [Op.ne]: null },
      createdAt: { [Op.between]: [from, to] },
    };
    if (req.query.locationId) returnWhere.locationId = parseInt(req.query.locationId, 10);
    const returns = await SalesReturn.findAll({
      where: returnWhere,
      include: [{
        model: CashierSession,
        attributes: ['id', 'userId'],
        required: true,
      }],
    });
    const returnsByCashier = new Map();
    for (const r of returns) {
      const uid = r.CashierSession?.userId;
      if (!uid) continue;
      if (req.query.cashierId && uid !== parseInt(req.query.cashierId, 10)) continue;
      if (!returnsByCashier.has(uid)) returnsByCashier.set(uid, []);
      returnsByCashier.get(uid).push(r);
    }

    // Group orders by cashier id
    const groups = new Map();
    for (const o of filtered) {
      const uid = o.CashierSession?.userId;
      const cashierName = o.CashierSession?.User?.name || 'Unknown';
      if (!uid) continue;
      if (!groups.has(uid)) groups.set(uid, { cashierId: uid, cashierName, orders: [] });
      groups.get(uid).orders.push(o);
    }
    // Make sure cashiers with only returns also show up.
    for (const uid of returnsByCashier.keys()) {
      if (!groups.has(uid)) groups.set(uid, { cashierId: uid, cashierName: 'Cashier', orders: [] });
    }

    const rows = [...groups.values()].map((g) => ({
      cashierId: g.cashierId,
      cashierName: g.cashierName,
      ...rollup(g.orders, returnsByCashier.get(g.cashierId) || []),
    })).sort((a, b) => b.totalSales - a.totalSales);

    const allReturnsForTotal = req.query.cashierId
      ? returns.filter((r) => r.CashierSession?.userId === parseInt(req.query.cashierId, 10))
      : returns;

    res.json({
      range: { from, to },
      filters: { cashierId: req.query.cashierId || null, locationId: req.query.locationId || null },
      totals: rollup(filtered, allReturnsForTotal),
      rows,
    });
  } catch (err) {
    console.error('[reports/cashier-sales]', err);
    res.status(500).json({ message: err.message });
  }
});

// ─── 2. Location sales (admin) ─────────────────────────────────────
router.get('/location-sales', protect, admin, async (req, res) => {
  try {
    const { from, to } = parseRange(req.query);
    const where = {
      locationId: { [Op.ne]: null },
      createdAt: { [Op.between]: [from, to] },
    };
    if (req.query.locationId) where.locationId = parseInt(req.query.locationId, 10);

    const orders = await Order.findAll({
      where,
      attributes: ['id', 'totalAmount', 'refundAmount', 'paymentMethod', 'items', 'locationId', 'createdAt'],
    });

    const returns = await SalesReturn.findAll({ where });
    const returnsByLoc = new Map();
    for (const r of returns) {
      const lid = r.locationId;
      if (!returnsByLoc.has(lid)) returnsByLoc.set(lid, []);
      returnsByLoc.get(lid).push(r);
    }

    const locations = await Location.findAll({ attributes: ['id', 'name', 'code'] });
    const locMap = new Map(locations.map((l) => [l.id, l]));

    const groups = new Map();
    for (const o of orders) {
      const lid = o.locationId;
      if (!groups.has(lid)) groups.set(lid, { locationId: lid, locationName: locMap.get(lid)?.name || `#${lid}`, orders: [] });
      groups.get(lid).orders.push(o);
    }
    for (const lid of returnsByLoc.keys()) {
      if (!groups.has(lid)) groups.set(lid, { locationId: lid, locationName: locMap.get(lid)?.name || `#${lid}`, orders: [] });
    }

    const rows = [...groups.values()].map((g) => ({
      locationId: g.locationId,
      locationName: g.locationName,
      ...rollup(g.orders, returnsByLoc.get(g.locationId) || []),
      topItems: topItems(g.orders, 5),
    })).sort((a, b) => b.totalSales - a.totalSales);

    res.json({
      range: { from, to },
      filters: { locationId: req.query.locationId || null },
      totals: rollup(orders, returns),
      topItems: topItems(orders, 10),
      rows,
    });
  } catch (err) {
    console.error('[reports/location-sales]', err);
    res.status(500).json({ message: err.message });
  }
});

// ─── 3. X-report (mid-shift, no reset) ─────────────────────────────
router.get('/x', protectCashier, async (req, res) => {
  try {
    const session = await CashierSession.findByPk(req.cashierSessionId, {
      include: [
        { model: User, attributes: ['id', 'name'] },
        { model: Location, attributes: ['id', 'name', 'code', 'address', 'phone'] },
      ],
    });
    if (!session) return res.status(404).json({ message: 'Shift not found' });

    const orders = await Order.findAll({
      where: { cashierSessionId: session.id },
      attributes: ['id', 'orderNumber', 'totalAmount', 'refundAmount', 'paymentMethod', 'items', 'createdAt'],
      order: [['createdAt', 'DESC']],
    });
    const returns = await SalesReturn.findAll({
      where: { cashierSessionId: session.id },
      order: [['createdAt', 'DESC']],
    });

    const totals = rollup(orders, returns);
    const openingCash = parseFloat(session.openingCash) || 0;
    const expectedCash = +(openingCash + totals.cashSales - totals.cashRefunds).toFixed(3);

    res.json({
      type: 'X',
      session: session.toJSON(),
      cashier: session.User,
      location: session.Location,
      generatedAt: new Date(),
      openingCash,
      expectedCash,
      ...totals,
      topItems: topItems(orders, 5),
      recentOrders: orders.slice(0, 10),
      recentReturns: returns.slice(0, 10),
    });
  } catch (err) {
    console.error('[reports/x]', err);
    res.status(500).json({ message: err.message });
  }
});

// ─── 4. Z-report (closed shift, final) ─────────────────────────────
router.get('/z/:sessionId', protect, async (req, res) => {
  try {
    const session = await CashierSession.findByPk(req.params.sessionId, {
      include: [
        { model: User, attributes: ['id', 'name'] },
        { model: Location, attributes: ['id', 'name', 'code', 'address', 'phone'] },
      ],
    });
    if (!session) return res.status(404).json({ message: 'Shift not found' });
    if (req.user.role === 'cashier' && session.userId !== req.user.id) {
      return res.status(403).json({ message: 'Not your shift' });
    }

    const orders = await Order.findAll({
      where: { cashierSessionId: session.id },
      attributes: ['id', 'orderNumber', 'totalAmount', 'refundAmount', 'paymentMethod', 'items', 'createdAt'],
      order: [['createdAt', 'DESC']],
    });
    const returns = await SalesReturn.findAll({
      where: { cashierSessionId: session.id },
      order: [['createdAt', 'DESC']],
    });

    const totals = rollup(orders, returns);
    const openingCash = parseFloat(session.openingCash) || 0;
    const closingCash = parseFloat(session.closingCash) || 0;
    const expectedCash = +(openingCash + totals.cashSales - totals.cashRefunds).toFixed(3);
    const variance = +(closingCash - expectedCash).toFixed(3);

    res.json({
      type: 'Z',
      session: session.toJSON(),
      cashier: session.User,
      location: session.Location,
      generatedAt: new Date(),
      openingCash,
      closingCash,
      expectedCash,
      variance,
      ...totals,
      topItems: topItems(orders, 5),
      recentOrders: orders.slice(0, 10),
    });
  } catch (err) {
    console.error('[reports/z]', err);
    res.status(500).json({ message: err.message });
  }
});

export default router;
