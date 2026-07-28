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
import { protect, admin, protectCashier } from '../middleware/auth.js';
import sequelize from '../config/database.js';

const router = Router();

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 12 * 60 * 60 * 1000,  // 12h — covers a long shift
};

function issueToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '12h',
  });
}

// ─── Public picker for the POS login page ──────────────────────────
router.get('/cashiers', async (req, res) => {
  try {
    const where = { role: 'cashier' };
    const rows = await User.findAll({
      where,
      attributes: ['id', 'name', 'homeLocationId'],
      include: [{ model: Location, as: 'homeLocation', attributes: ['id', 'name', 'code'] }],
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

    // Compute expected cash = opening + cash sales − cash refunds for THIS shift.
    // Cash sales come from Orders attributed to this session; cash refunds come
    // from SalesReturn rows attributed to this session with refundMethod='cash'
    // (this handles returns of items sold in earlier shifts correctly).
    // Cash sales: pure-cash orders contribute totalAmount; split orders
    // contribute only the cash tender from paymentBreakdown.
    const cashOrders = await Order.findAll({
      where: {
        cashierSessionId: session.id,
        paymentMethod: { [Op.in]: ['cash', 'pos_cash'] },
      },
      attributes: ['totalAmount'],
      transaction: t,
    });
    const splitOrders = await Order.findAll({
      where: { cashierSessionId: session.id, paymentMethod: 'pos_split' },
      attributes: ['paymentBreakdown'],
      transaction: t,
    });
    const cashReturns = await SalesReturn.findAll({
      where: { cashierSessionId: session.id, refundMethod: 'cash', status: 'completed' },
      attributes: ['refundAmount'],
      transaction: t,
    });
    const cashSales = cashOrders.reduce((s, o) => s + parseFloat(o.totalAmount || 0), 0)
      + splitOrders.reduce((s, o) => {
          const cashLine = (o.paymentBreakdown || []).find((t) => t.method === 'cash');
          return s + (cashLine ? parseFloat(cashLine.amount || 0) : 0);
        }, 0);
    const cashRefunds = cashReturns.reduce((s, r) => s + parseFloat(r.refundAmount || 0), 0);
    const expectedCash = parseFloat(session.openingCash || 0) + cashSales - cashRefunds;
    const variance = +(closingCash - expectedCash).toFixed(3);

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
    // Admin/staff sees all; cashier sees own only.
    if (req.user.role === 'cashier') where.userId = req.user.id;
    if (req.query.locationId) where.locationId = parseInt(req.query.locationId, 10);
    if (req.query.status) where.status = req.query.status;
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
    if (req.user.role === 'cashier' && session.userId !== req.user.id) {
      return res.status(403).json({ message: 'Not your shift' });
    }
    res.json(session);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
