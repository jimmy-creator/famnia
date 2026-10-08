/**
 * POS reports.
 *
 *   GET /api/reports/cashier-sales   admin: per-cashier breakdown over date range
 *   GET /api/reports/location-sales  admin: per-location breakdown + top items
 *   GET /api/reports/x               cashier: snapshot of current open shift
 *   GET /api/reports/day?date=&locationId=
 *                                    admin: end-of-day report — every in-store
 *                                    sale that day, across all shifts/cashiers
 *   GET /api/reports/z/:sessionId    admin or owner: the shift's report — Z once
 *                                    it's closed, a live X while it's still open
 *
 * All money sums are computed in JS from Order.totalAmount so we can split
 * by paymentMethod without a separate group-by SQL pass per cashier.
 */
import { Router } from 'express';
import { Op } from 'sequelize';
import { Order, User, CashierSession, Location, SalesReturn } from '../models/index.js';
import { protect, requirePermission, protectCashier } from '../middleware/auth.js';
import { rangeStart, rangeEnd } from '../utils/dates.js';
import { rollup } from '../utils/posTotals.js';
import { dp } from '../utils/money.js';

const router = Router();

// ─── helpers ───────────────────────────────────────────────────────
function parseRange(q) {
  // Default: today (00:00 → 23:59:59 local)
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000 - 1);
  const from = q.from ? rangeStart(q.from) : startOfDay;
  const to = q.to ? rangeEnd(q.to) : endOfDay;
  return { from, to };
}

// Staff reading POS figures need the analytics permission; admins always pass.
const canSeeReports = (user) =>
  user.role === 'admin' || (user.role === 'staff' && (user.permissions || []).includes('analytics'));

// Every order query here must carry paymentBreakdown — without it a split
// sale can't be bucketed and its cash leg silently drops out of the drawer.
const ORDER_ATTRS = ['id', 'orderNumber', 'totalAmount', 'refundAmount', 'paymentMethod',
  'paymentBreakdown', 'items', 'createdAt'];

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
    .map(([name, v]) => ({ name, qty: v.qty, revenue: +v.revenue.toFixed(dp()) }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, n);
}

// ─── 1. Cashier sales (admin) ──────────────────────────────────────
// Optional filters: cashierId, locationId
router.get('/cashier-sales', protect, requirePermission('analytics'), async (req, res) => {
  try {
    const { from, to } = parseRange(req.query);
    const where = {
      cashierSessionId: { [Op.ne]: null },
      createdAt: { [Op.between]: [from, to] },
    };
    if (req.query.locationId) where.locationId = parseInt(req.query.locationId, 10);

    const orders = await Order.findAll({
      where,
      attributes: [...ORDER_ATTRS, 'cashierSessionId', 'locationId'],
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
router.get('/location-sales', protect, requirePermission('analytics'), async (req, res) => {
  try {
    const { from, to } = parseRange(req.query);
    const where = {
      locationId: { [Op.ne]: null },
      createdAt: { [Op.between]: [from, to] },
    };
    if (req.query.locationId) where.locationId = parseInt(req.query.locationId, 10);

    const orders = await Order.findAll({
      where,
      attributes: [...ORDER_ATTRS, 'locationId'],
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

// ─── Daily report (all shifts) ─────────────────────────────────────
// One store-local day: every in-store order (POS and aggregator orders
// keyed in at the till — not web orders), whether or not it belongs to a
// shift, so imported old-POS days report too. Plus each shift open during
// the day with its drawer result.
router.get('/day', protect, async (req, res) => {
  try {
    if (!canSeeReports(req.user)) return res.status(403).json({ message: 'Forbidden' });
    const date = req.query.date || null;
    const { from, to } = parseRange({ from: date, to: date });
    const locationId = req.query.locationId ? parseInt(req.query.locationId, 10) : null;
    const where = { createdAt: { [Op.between]: [from, to] }, channel: { [Op.ne]: 'web' }, orderStatus: { [Op.ne]: 'cancelled' } };
    if (locationId) where.locationId = locationId;
    const orders = await Order.findAll({ where, attributes: ORDER_ATTRS, order: [['createdAt', 'ASC']] });
    const retWhere = { createdAt: { [Op.between]: [from, to] } };
    if (locationId) retWhere.locationId = locationId;
    const returns = await SalesReturn.findAll({ where: retWhere });
    const totals = rollup(orders, returns);
    // Anything the drawer/terminal lines don't cover — so the lines add up.
    const otherSales = +(totals.totalSales - totals.cashSales - totals.cardSales).toFixed(dp());

    // Every shift that was open at any point in the day — not only those
    // opened that day, or a shift running past midnight vanishes from the
    // day it was closed and counted on.
    const shiftWhere = {
      openedAt: { [Op.lte]: to },
      [Op.or]: [{ closedAt: null }, { closedAt: { [Op.gte]: from } }],
    };
    if (locationId) shiftWhere.locationId = locationId;
    const sessions = await CashierSession.findAll({
      where: shiftWhere,
      include: [{ model: User, attributes: ['id', 'name'] }],
      order: [['openedAt', 'ASC']],
    });
    const shifts = sessions.map((s) => ({
      id: s.id,
      cashier: s.User?.name || `User #${s.userId}`,
      openedAt: s.openedAt,
      closedAt: s.closedAt,
      status: s.status,
      openingCash: parseFloat(s.openingCash) || 0,
      closingCash: s.closingCash != null ? parseFloat(s.closingCash) : null,
      variance: s.cashVariance != null ? parseFloat(s.cashVariance) : null,
    }));
    const location = locationId
      ? await Location.findByPk(locationId, { attributes: ['id', 'name', 'code', 'address', 'phone'] })
      : null;

    res.json({
      type: 'DAY',
      date: date || from.toISOString(),
      dayStart: from,
      location,
      generatedAt: new Date(),
      ...totals,
      otherSales,
      shifts,
      // A shift's variance belongs to the day it was counted (closed), so a
      // shift spanning two days isn't counted on both.
      totalVariance: +shifts
        .filter((x) => x.closedAt && new Date(x.closedAt) >= from && new Date(x.closedAt) <= to)
        .reduce((s, x) => s + (x.variance || 0), 0).toFixed(dp()),
      topItems: topItems(orders, 10),
    });
  } catch (err) {
    console.error('[reports/day]', err);
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
      attributes: ORDER_ATTRS,
      order: [['createdAt', 'DESC']],
    });
    const returns = await SalesReturn.findAll({
      where: { cashierSessionId: session.id },
      order: [['createdAt', 'DESC']],
    });

    const totals = rollup(orders, returns);
    const openingCash = parseFloat(session.openingCash) || 0;
    const expectedCash = +(openingCash + totals.cashSales - totals.cashRefunds).toFixed(dp());

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
    // A cashier may read their own shift; anyone else needs report access
    // (this used to be open to any logged-in account, customers included).
    const ownShift = req.user.role === 'cashier' && session.userId === req.user.id;
    if (!ownShift && !canSeeReports(req.user)) {
      return res.status(403).json({ message: 'Not your shift' });
    }

    const orders = await Order.findAll({
      where: { cashierSessionId: session.id },
      attributes: ORDER_ATTRS,
      order: [['createdAt', 'DESC']],
    });
    const returns = await SalesReturn.findAll({
      where: { cashierSessionId: session.id },
      order: [['createdAt', 'DESC']],
    });

    const totals = rollup(orders, returns);
    const openingCash = parseFloat(session.openingCash) || 0;
    const expectedCash = +(openingCash + totals.cashSales - totals.cashRefunds).toFixed(dp());

    // Still open (viewed from the ERP): there's no count yet, so it's an
    // X-report — same shape as GET /x — not a Z with a fake 0 closing.
    if (session.status === 'open') {
      return res.json({
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
    }
    const closingCash = parseFloat(session.closingCash) || 0;
    const variance = +(closingCash - expectedCash).toFixed(dp());

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
