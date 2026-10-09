/**
 * Cashier authentication + shift lifecycle for the POS.
 *
 *   GET    /api/cashier/cashiers              public — names + ids for the POS login picker
 *   POST   /api/cashier/login                 { userId, pin, locationId, openingCash? }
 *                                              verifies PIN, opens/resumes a CashierSession,
 *                                              sets the JWT cookie. Returns { user, session }.
 *   POST   /api/cashier/logout                clears cookie. Doesn't close the shift (cashier
 *                                              can step away and come back).
 *   GET    /api/cashier/me                    current cashier + their open shift
 *   POST   /api/cashier/shift/close           { closingCash, notes } — closes current shift
 *                                              and computes cashVariance.
 *   GET    /api/cashier/shifts                admin sees all; cashier sees own
 *   GET    /api/cashier/shifts/:id            admin sees any; cashier sees own
 *
 * JWT payload distinguishes cashier sessions from regular users by
 * carrying `sessionId` + `role: 'cashier'`. The existing /api/auth/me
 * and /api/orders/my-orders flows still work for them as a regular User.
 */
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { Op } from 'sequelize';
import { User, Location, CashierSession, Order, SalesReturn } from '../models/index.js';
import { protect, protectCashier } from '../middleware/auth.js';
import sequelize from '../config/database.js';
import { rollup } from '../utils/posTotals.js';
import { rangeStart, rangeEnd } from '../utils/dates.js';
import { dp } from '../utils/money.js';
import { hasPermission } from '../hub/permissions.js';

// Shift history is POS money data: a cashier sees their own, staff need the
// analytics permission, customers see nothing.
const canSeeAllShifts = (user) =>
  user.role === 'admin' || (user.role === 'staff' && hasPermission(user, 'analytics'));

const router = Router();

// One source of truth for how long a till stays logged in. The cookie and
// the JWT must agree: previously the cookie expired at 12h while the token
// was signed with the storefront's JWT_EXPIRE (7d), so a till open past 12h
// started 401-ing on every call with the shift still showing as open.
const CASHIER_SESSION_MS = 24 * 60 * 60 * 1000;  // 24h — covers any shift

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: CASHIER_SESSION_MS,
};

function issueToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: Math.floor(CASHIER_SESSION_MS / 1000),
  });
}

// ─── Public picker for the POS login page ──────────────────────────
router.get('/cashiers', async (req, res) => {
  try {
    const where = { role: 'cashier' };
    const rows = await User.findAll({
      where,
      attributes: ['id', 'name', 'homeLocationId'],
      // `active` lets the POS store picker hide deactivated stores.
      include: [{ model: Location, as: 'homeLocation', attributes: ['id', 'name', 'code', 'active'] }],
      order: [['name', 'ASC']],
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Public branch list for the POS login page. /api/locations is admin-only,
// so an unauthenticated terminal used to derive its branch list from
// whichever cashiers happened to have a home location — meaning a newly
// added branch was unselectable until someone was assigned to it.
// Only non-sensitive display fields are exposed.
router.get('/locations', async (req, res) => {
  try {
    const rows = await Location.findAll({
      where: { active: true },
      attributes: ['id', 'name', 'code'],
      order: [['name', 'ASC']],
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Login (POS terminal) ──────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { userId, pin, locationId, openingCash } = req.body;
    if (!userId || !pin || !locationId) {
      return res.status(400).json({ message: 'userId, pin and locationId are required' });
    }
    const user = await User.findByPk(userId);
    if (!user || user.role !== 'cashier') {
      return res.status(401).json({ message: 'Invalid cashier' });
    }
    const ok = await user.comparePin(pin);
    if (!ok) return res.status(401).json({ message: 'Invalid PIN' });

    const loc = await Location.findByPk(locationId);
    if (!loc || !loc.active) return res.status(400).json({ message: 'Invalid location' });

    // Resume existing open shift OR open a new one.
    let session = await CashierSession.findOne({
      where: { userId: user.id, status: 'open' },
    });
    let resumed = !!session;
    if (!session) {
      if (openingCash === undefined || openingCash === null || openingCash === '') {
        // Tell the client to prompt for opening cash, then call /login again.
        return res.status(409).json({
          message: 'Opening cash required for a new shift',
          requires: 'openingCash',
          user: { id: user.id, name: user.name },
        });
      }
      session = await CashierSession.create({
        userId: user.id,
        locationId: loc.id,
        openingCash: parseFloat(openingCash) || 0,
        status: 'open',
        openedAt: new Date(),
      });
    } else if (session.locationId !== loc.id) {
      // Cashier picked a different location than their open shift.
      // Allow it but record on the session.
      await session.update({ locationId: loc.id });
    }

    const token = issueToken({
      id: user.id,
      role: 'cashier',
      sessionId: session.id,
      locationId: session.locationId,
    });
    res.cookie('token', token, COOKIE_OPTIONS);
    res.json({
      user: { id: user.id, name: user.name, role: 'cashier' },
      session: session.toJSON(),
      location: loc.toJSON(),
      resumed,
    });
  } catch (err) {
    console.error('[cashier/login]', err);
    res.status(500).json({ message: err.message });
  }
});

router.post('/logout', async (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

router.get('/me', protectCashier, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    const session = await CashierSession.findByPk(req.cashierSessionId, {
      include: [{ model: Location, attributes: ['id', 'name', 'code'] }],
    });
    if (!session || session.status !== 'open') {
      res.clearCookie('token');
      return res.status(401).json({ message: 'No open shift' });
    }
    res.json({ user: user.toJSON(), session: session.toJSON() });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/shift/close', protectCashier, async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const session = await CashierSession.findByPk(req.cashierSessionId, { transaction: t });
    if (!session || session.status !== 'open') {
      await t.rollback();
      return res.status(400).json({ message: 'No open shift' });
    }
    const closingCash = parseFloat(req.body.closingCash);
    if (isNaN(closingCash)) {
      await t.rollback();
      return res.status(400).json({ message: 'closingCash is required' });
    }

    // Expected cash = opening + cash sales − cash refunds for THIS shift,
    // computed by the same rollup as the X/Z reports so the three agree
    // (split sales count only their cash leg; returns of items sold in
    // earlier shifts still come out of this drawer).
    const orders = await Order.findAll({
      where: { cashierSessionId: session.id },
      attributes: ['totalAmount', 'paymentMethod', 'paymentBreakdown'],
      transaction: t,
    });
    const returns = await SalesReturn.findAll({
      where: { cashierSessionId: session.id, status: 'completed' },
      transaction: t,
    });
    const { cashSales, cashRefunds } = rollup(orders, returns);
    const expectedCash = +(parseFloat(session.openingCash || 0) + cashSales - cashRefunds).toFixed(dp());
    const variance = +(closingCash - expectedCash).toFixed(dp());

    await session.update({
      closingCash,
      cashVariance: variance,
      status: 'closed',
      closedAt: new Date(),
      notes: req.body.notes?.trim() || session.notes,
    }, { transaction: t });
    await t.commit();
    res.clearCookie('token');
    res.json({ session: session.toJSON(), expectedCash, cashSales, cashRefunds, variance });
  } catch (err) {
    if (!t.finished) await t.rollback().catch(() => {});
    console.error('[cashier/shift/close]', err);
    res.status(500).json({ message: err.message });
  }
});

// ─── Shift history ─────────────────────────────────────────────────
router.get('/shifts', protect, async (req, res) => {
  try {
    const where = {};
    if (req.user.role === 'cashier') where.userId = req.user.id;
    else if (!canSeeAllShifts(req.user)) return res.status(403).json({ message: 'Forbidden' });
    if (req.query.locationId) where.locationId = parseInt(req.query.locationId, 10);
    if (req.query.status) where.status = req.query.status;
    // ?from=&to= — shifts opened on those (store-local) days.
    if (req.query.from || req.query.to) {
      where.openedAt = {};
      if (req.query.from) where.openedAt[Op.gte] = rangeStart(req.query.from);
      if (req.query.to) where.openedAt[Op.lte] = rangeEnd(req.query.to);
    }
    const rows = await CashierSession.findAll({
      where,
      order: [['openedAt', 'DESC']],
      limit: parseInt(req.query.limit, 10) || 100,
      include: [
        { model: User, attributes: ['id', 'name', 'email'] },
        { model: Location, attributes: ['id', 'name', 'code'] },
      ],
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/shifts/:id', protect, async (req, res) => {
  try {
    const session = await CashierSession.findByPk(req.params.id, {
      include: [
        { model: User, attributes: ['id', 'name', 'email'] },
        { model: Location, attributes: ['id', 'name', 'code'] },
      ],
    });
    if (!session) return res.status(404).json({ message: 'Shift not found' });
    const ownShift = req.user.role === 'cashier' && session.userId === req.user.id;
    if (!ownShift && !canSeeAllShifts(req.user)) {
      return res.status(403).json({ message: 'Not your shift' });
    }
    res.json(session);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
