/**
 * Finance routes — cash accounts, expense categories, expenses,
 * cash transfers, and the daily-cash reconciliation view.
 *
 * Auto-seeds sensible defaults on first GET /cash-accounts call:
 *   - "<Location> Drawer" + "<Location> Card Terminal" for each Location
 *   - one global "Petty Cash" and one "Bank Account"
 * Skip if the user has already created their own (any CashAccount exists).
 *
 *   GET    /api/finance/cash-accounts            list with computed balances
 *   POST   /api/finance/cash-accounts            create
 *   PUT    /api/finance/cash-accounts/:id        update
 *   DELETE /api/finance/cash-accounts/:id        soft (active=false) if used
 *   GET    /api/finance/cash-accounts/:id/transactions?from=&to=
 *
 *   GET    /api/finance/expense-categories       list
 *   POST   /api/finance/expense-categories       create
 *   PUT    /api/finance/expense-categories/:id   update
 *   DELETE /api/finance/expense-categories/:id   delete (if unused)
 *
 *   GET    /api/finance/expenses                 list with filters
 *   POST   /api/finance/expenses                 create + write CashTxn
 *   GET    /api/finance/expenses/:id             detail
 *   POST   /api/finance/expenses/:id/cancel      reverse the CashTxn
 *
 *   GET    /api/finance/cash-transfers           list
 *   POST   /api/finance/cash-transfers           create + write 2 CashTxn rows
 *   POST   /api/finance/cash-transfers/:id/cancel
 *
 *   GET    /api/finance/daily-cash?date=&locationId=
 *          per-account opening, sales, refunds, expenses, transfers
 *          in/out, expected closing.
 */
import { Router } from 'express';
import { Op } from 'sequelize';
import sequelize from '../config/database.js';
import {
  CashAccount, CashTransaction, ExpenseCategory, Expense, CashTransfer,
  Location, User, Order, SalesReturn, Product, ProductStock,
  FixedAsset, DepreciationEntry, Wastage, StockCount, HubExpenseEntry, OrderReturn, StockMovement,
  writeCashTxn, getCashAccountBalance,
} from '../models/index.js';

// Hub Stock Out reasons that write goods off (the rest — internal use,
// samples, display, corrections, supplier returns — are not a loss).
const STOCK_LOSS_REASONS = ['Damaged', 'Lost', 'Expired', 'Defective'];
import { protect, admin } from '../middleware/auth.js';
import { ensureDepreciation } from '../services/depreciationJob.js';
import { localDate, rangeStart, rangeEnd } from '../utils/dates.js';

const router = Router();

const gen = (prefix) =>
  `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

// Local-time date formatters. NEVER use toISOString() for a DATEONLY
// bound: parseRange builds its dates in local time, so on a UTC+3 server
// toISOString() shifts the window a day and leaks rows between periods.
const pad2 = (n) => String(n).padStart(2, '0');
export const dateOnly = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const monthKeyLocal = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;

const hasFinanceAccess = (req) =>
  req.user.role === 'admin' || (req.user.permissions || []).includes('analytics');

// ─── Seed default cash accounts ────────────────────────────────────
// Exported so the server can call it on boot. Idempotent: only inserts
// for locations that don't already have a drawer/card-terminal pair,
// and only adds the global petty/bank if neither exists yet.
export async function seedDefaultAccountsIfEmpty() {
  const locations = await Location.findAll({ where: { active: true } });
  const existing = await CashAccount.findAll({ attributes: ['type', 'locationId'] });
  const have = new Set(existing.map((a) => `${a.type}:${a.locationId ?? 'g'}`));

  const rows = [];
  for (const loc of locations) {
    if (!have.has(`drawer:${loc.id}`)) rows.push({ name: `${loc.name} Drawer`, type: 'drawer', locationId: loc.id });
    if (!have.has(`card_terminal:${loc.id}`)) rows.push({ name: `${loc.name} Card Terminal`, type: 'card_terminal', locationId: loc.id });
  }
  if (!existing.some((a) => a.type === 'petty_cash')) rows.push({ name: 'Petty Cash', type: 'petty_cash' });
  if (!existing.some((a) => a.type === 'bank')) rows.push({ name: 'Bank Account', type: 'bank' });
  if (rows.length) await CashAccount.bulkCreate(rows);
}

// ─── Cash Accounts ─────────────────────────────────────────────────
router.get('/cash-accounts', protect, async (req, res) => {
  try {
    if (!hasFinanceAccess(req)) return res.status(403).json({ message: 'Forbidden' });
    await seedDefaultAccountsIfEmpty();
    const where = {};
    if (req.query.active === 'true') where.active = true;
    if (req.query.active === 'false') where.active = false;
    if (req.query.type) where.type = req.query.type;
    if (req.query.locationId) where.locationId = parseInt(req.query.locationId, 10);
    const rows = await CashAccount.findAll({
      where,
      include: [{ model: Location, attributes: ['id', 'name', 'code'] }],
      order: [['type', 'ASC'], ['name', 'ASC']],
    });
    const enriched = await Promise.all(rows.map(async (r) => ({
      ...r.toJSON(),
      balance: await getCashAccountBalance(r.id),
    })));
    res.json(enriched);
  } catch (err) {
    console.error('[finance/cash-accounts]', err);
    res.status(500).json({ message: err.message });
  }
});

router.post('/cash-accounts', protect, admin, async (req, res) => {
  try {
    const body = { ...req.body };
    delete body.id; delete body.createdAt; delete body.updatedAt;
    const row = await CashAccount.create(body);
    res.status(201).json(row);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.put('/cash-accounts/:id', protect, admin, async (req, res) => {
  try {
    const row = await CashAccount.findByPk(req.params.id);
    if (!row) return res.status(404).json({ message: 'Not found' });
    const body = { ...req.body };
    delete body.id; delete body.createdAt; delete body.updatedAt;
    await row.update(body);
    res.json(row);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.delete('/cash-accounts/:id', protect, admin, async (req, res) => {
  try {
    const row = await CashAccount.findByPk(req.params.id);
    if (!row) return res.status(404).json({ message: 'Not found' });
    const used = await CashTransaction.count({ where: { cashAccountId: row.id } });
    if (used > 0) {
      await row.update({ active: false });
      return res.json({ ok: true, softDeleted: true });
    }
    await row.destroy();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/cash-accounts/:id/transactions', protect, async (req, res) => {
  try {
    if (!hasFinanceAccess(req)) return res.status(403).json({ message: 'Forbidden' });
    const where = { cashAccountId: parseInt(req.params.id, 10) };
    if (!(await CashAccount.count({ where: { id: where.cashAccountId } }))) {
      return res.status(404).json({ message: 'Cash account not found' });
    }
    if (req.query.from || req.query.to) {
      const from = req.query.from ? rangeStart(req.query.from) : new Date('1970-01-01');
      const to = req.query.to ? rangeEnd(req.query.to) : new Date('2999-12-31');
      where.date = { [Op.between]: [from, to] };
    }
    const txns = await CashTransaction.findAll({
      where,
      order: [['date', 'DESC']],
      limit: parseInt(req.query.limit, 10) || 500,
      include: [{ model: User, as: 'author', attributes: ['id', 'name'] }],
    });
    res.json(txns);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Expense Categories ────────────────────────────────────────────
router.get('/expense-categories', protect, async (req, res) => {
  try {
    // The wastage form offers these too, so inventory staff may read them.
    if (!hasFinanceAccess(req) && !(req.user.permissions || []).includes('products')) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const rows = await ExpenseCategory.findAll({ order: [['name', 'ASC']] });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/expense-categories', protect, admin, async (req, res) => {
  try {
    const row = await ExpenseCategory.create({
      name: req.body.name?.trim(),
      code: req.body.code?.trim() || null,
      active: req.body.active !== false,
    });
    res.status(201).json(row);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.put('/expense-categories/:id', protect, admin, async (req, res) => {
  try {
    const row = await ExpenseCategory.findByPk(req.params.id);
    if (!row) return res.status(404).json({ message: 'Not found' });
    await row.update({
      name: req.body.name?.trim() ?? row.name,
      code: req.body.code?.trim() ?? row.code,
      active: req.body.active ?? row.active,
    });
    res.json(row);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.delete('/expense-categories/:id', protect, admin, async (req, res) => {
  try {
    const used = await Expense.count({ where: { expenseCategoryId: req.params.id } });
    if (used > 0) return res.status(400).json({ message: 'Category in use — cannot delete' });
    const row = await ExpenseCategory.findByPk(req.params.id);
    if (!row) return res.status(404).json({ message: 'Not found' });
    await row.destroy();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Expenses ──────────────────────────────────────────────────────
router.get('/expenses', protect, async (req, res) => {
  try {
    if (!hasFinanceAccess(req)) return res.status(403).json({ message: 'Forbidden' });
    const where = {};
    if (req.query.from || req.query.to) {
      const from = req.query.from ? rangeStart(req.query.from) : new Date('1970-01-01');
      const to = req.query.to ? rangeEnd(req.query.to) : new Date('2999-12-31');
      where.expenseDate = { [Op.between]: [from, to] };
    }
    if (req.query.locationId) where.locationId = parseInt(req.query.locationId, 10);
    if (req.query.expenseCategoryId) where.expenseCategoryId = parseInt(req.query.expenseCategoryId, 10);
    if (req.query.cashAccountId) where.cashAccountId = parseInt(req.query.cashAccountId, 10);
    if (req.query.status) where.status = req.query.status;
    const rows = await Expense.findAll({
      where,
      include: [
        { model: ExpenseCategory, attributes: ['id', 'name'] },
        { model: Location, attributes: ['id', 'name', 'code'] },
        { model: CashAccount, attributes: ['id', 'name', 'type'] },
        { model: User, as: 'creator', attributes: ['id', 'name'] },
      ],
      order: [['expenseDate', 'DESC'], ['createdAt', 'DESC']],
      limit: parseInt(req.query.limit, 10) || 500,
    });
    res.json(rows);
  } catch (err) {
    console.error('[finance/expenses]', err);
    res.status(500).json({ message: err.message });
  }
});

router.post('/expenses', protect, async (req, res) => {
  if (!hasFinanceAccess(req)) return res.status(403).json({ message: 'Forbidden' });
  const t = await sequelize.transaction();
  try {
    const {
      expenseCategoryId, locationId, cashAccountId, amount, paymentMethod,
      description, reference, expenseDate, attachmentUrl, notes,
    } = req.body;
    const amt = parseFloat(amount);
    if (!expenseCategoryId || !cashAccountId || !amt || amt <= 0 || !description) {
      await t.rollback();
      return res.status(400).json({ message: 'category, cashAccount, amount, description required' });
    }
    if (!expenseDate) {
      await t.rollback();
      return res.status(400).json({ message: 'expenseDate required' });
    }

    const exp = await Expense.create({
      expenseNumber: gen('EXP'),
      expenseCategoryId: parseInt(expenseCategoryId, 10),
      locationId: locationId ? parseInt(locationId, 10) : null,
      cashAccountId: parseInt(cashAccountId, 10),
      amount: amt,
      paymentMethod: paymentMethod || 'cash',
      description: description.trim(),
      reference: reference?.trim() || null,
      expenseDate,
      attachmentUrl: attachmentUrl || null,
      notes: notes?.trim() || null,
      status: 'paid',
      createdBy: req.user.id,
    }, { transaction: t });

    // Money OUT of the chosen account.
    await writeCashTxn({
      cashAccountId: exp.cashAccountId,
      amount: -amt,
      source: 'expense',
      sourceType: 'Expense',
      sourceId: exp.id,
      reference: exp.expenseNumber,
      description: exp.description,
      date: new Date(exp.expenseDate),
      createdBy: req.user.id,
      transaction: t,
      requireFunds: true,
    });

    await t.commit();
    res.status(201).json(exp);
  } catch (err) {
    if (!t.finished) await t.rollback().catch(() => {});
    console.error('[finance/expenses/create]', err);
    res.status(400).json({ message: err.message });
  }
});

router.get('/expenses/:id', protect, async (req, res) => {
  try {
    if (!hasFinanceAccess(req)) return res.status(403).json({ message: 'Forbidden' });
    const row = await Expense.findByPk(req.params.id, {
      include: [
        { model: ExpenseCategory, attributes: ['id', 'name'] },
        { model: Location, attributes: ['id', 'name', 'code'] },
        { model: CashAccount, attributes: ['id', 'name', 'type'] },
        { model: User, as: 'creator', attributes: ['id', 'name', 'email'] },
      ],
    });
    if (!row) return res.status(404).json({ message: 'Not found' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/expenses/:id/cancel', protect, admin, async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const exp = await Expense.findByPk(req.params.id, { transaction: t });
    if (!exp) { await t.rollback(); return res.status(404).json({ message: 'Not found' }); }
    if (exp.status !== 'paid') { await t.rollback(); return res.status(400).json({ message: 'Already cancelled' }); }
    // Reverse: write +amount entry instead of deleting (audit trail).
    await writeCashTxn({
      cashAccountId: exp.cashAccountId,
      amount: parseFloat(exp.amount),
      source: 'expense',
      sourceType: 'Expense',
      sourceId: exp.id,
      reference: `${exp.expenseNumber}-REVERSAL`,
      description: `Cancelled: ${exp.description}`,
      date: new Date(),
      createdBy: req.user.id,
      transaction: t,
    });
    await exp.update({ status: 'cancelled' }, { transaction: t });
    await t.commit();
    res.json({ ok: true });
  } catch (err) {
    if (!t.finished) await t.rollback().catch(() => {});
    res.status(500).json({ message: err.message });
  }
});

// ─── Cash Transfers ────────────────────────────────────────────────
router.get('/cash-transfers', protect, async (req, res) => {
  try {
    if (!hasFinanceAccess(req)) return res.status(403).json({ message: 'Forbidden' });
    const where = {};
    if (req.query.from || req.query.to) {
      const from = req.query.from ? rangeStart(req.query.from) : new Date('1970-01-01');
      const to = req.query.to ? rangeEnd(req.query.to) : new Date('2999-12-31');
      where.transferDate = { [Op.between]: [from, to] };
    }
    const rows = await CashTransfer.findAll({
      where,
      include: [
        { model: CashAccount, as: 'fromAccount', attributes: ['id', 'name', 'type'] },
        { model: CashAccount, as: 'toAccount',   attributes: ['id', 'name', 'type'] },
        { model: User, as: 'creator', attributes: ['id', 'name'] },
      ],
      order: [['transferDate', 'DESC'], ['createdAt', 'DESC']],
      limit: parseInt(req.query.limit, 10) || 200,
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/cash-transfers', protect, async (req, res) => {
  if (!hasFinanceAccess(req)) return res.status(403).json({ message: 'Forbidden' });
  const t = await sequelize.transaction();
  try {
    const { fromAccountId, toAccountId, amount, transferDate, notes } = req.body;
    const amt = parseFloat(amount);
    if (!fromAccountId || !toAccountId || !amt || amt <= 0 || !transferDate) {
      await t.rollback();
      return res.status(400).json({ message: 'fromAccount, toAccount, amount, transferDate required' });
    }
    if (parseInt(fromAccountId, 10) === parseInt(toAccountId, 10)) {
      await t.rollback();
      return res.status(400).json({ message: 'From and To must differ' });
    }

    const tr = await CashTransfer.create({
      transferNumber: gen('TRF'),
      fromAccountId, toAccountId,
      amount: amt,
      transferDate,
      notes: notes?.trim() || null,
      status: 'completed',
      createdBy: req.user.id,
    }, { transaction: t });

    const txDate = new Date(transferDate);
    await writeCashTxn({
      cashAccountId: parseInt(fromAccountId, 10), amount: -amt,
      source: 'transfer', sourceType: 'CashTransfer', sourceId: tr.id,
      reference: tr.transferNumber, description: `Transfer to account ${toAccountId}`,
      date: txDate, createdBy: req.user.id, transaction: t, requireFunds: true,
    });
    await writeCashTxn({
      cashAccountId: parseInt(toAccountId, 10), amount: amt,
      source: 'transfer', sourceType: 'CashTransfer', sourceId: tr.id,
      reference: tr.transferNumber, description: `Transfer from account ${fromAccountId}`,
      date: txDate, createdBy: req.user.id, transaction: t,
    });

    await t.commit();
    res.status(201).json(tr);
  } catch (err) {
    if (!t.finished) await t.rollback().catch(() => {});
    res.status(err.status || 500).json({ message: err.message });
  }
});

router.post('/cash-transfers/:id/cancel', protect, admin, async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const tr = await CashTransfer.findByPk(req.params.id, { transaction: t });
    if (!tr) { await t.rollback(); return res.status(404).json({ message: 'Not found' }); }
    if (tr.status !== 'completed') { await t.rollback(); return res.status(400).json({ message: 'Already cancelled' }); }
    const amt = parseFloat(tr.amount);
    // Reverse: + on from-account, − on to-account.
    await writeCashTxn({
      cashAccountId: tr.fromAccountId, amount: amt,
      source: 'transfer', sourceType: 'CashTransfer', sourceId: tr.id,
      reference: `${tr.transferNumber}-REVERSAL`, description: 'Cancelled transfer',
      date: new Date(), createdBy: req.user.id, transaction: t,
    });
    await writeCashTxn({
      cashAccountId: tr.toAccountId, amount: -amt,
      source: 'transfer', sourceType: 'CashTransfer', sourceId: tr.id,
      reference: `${tr.transferNumber}-REVERSAL`, description: 'Cancelled transfer',
      date: new Date(), createdBy: req.user.id, transaction: t,
    });
    await tr.update({ status: 'cancelled' }, { transaction: t });
    await t.commit();
    res.json({ ok: true });
  } catch (err) {
    if (!t.finished) await t.rollback().catch(() => {});
    res.status(500).json({ message: err.message });
  }
});

// ─── Daily Cash reconciliation ─────────────────────────────────────
// For a given date (defaults to today) and optional locationId filter,
// return per-account: opening (balance before the day), sales, refunds,
// expenses, transfersIn, transfersOut, other, expected (= opening + net).
router.get('/daily-cash', protect, async (req, res) => {
  try {
    if (!hasFinanceAccess(req)) return res.status(403).json({ message: 'Forbidden' });

    const dateStr = req.query.date || localDate();
    const dayStart = new Date(dateStr + 'T00:00:00');
    const dayEnd = new Date(dateStr + 'T23:59:59.999');

    const acctWhere = { active: true };
    if (req.query.locationId) acctWhere.locationId = parseInt(req.query.locationId, 10);
    const accounts = await CashAccount.findAll({
      where: acctWhere,
      include: [{ model: Location, attributes: ['id', 'name'] }],
      order: [['type', 'ASC'], ['name', 'ASC']],
    });

    const result = await Promise.all(accounts.map(async (a) => {
      const opening = +(
        (parseFloat(a.openingBalance) || 0)
        + ((await CashTransaction.sum('amount', { where: { cashAccountId: a.id, date: { [Op.lt]: dayStart } } })) || 0)
      ).toFixed(3);

      const todayTxns = await CashTransaction.findAll({
        where: { cashAccountId: a.id, date: { [Op.between]: [dayStart, dayEnd] } },
        attributes: ['amount', 'source'],
      });
      let sales = 0, refunds = 0, expenses = 0, transfersIn = 0, transfersOut = 0, other = 0;
      for (const tx of todayTxns) {
        const amt = parseFloat(tx.amount);
        if (tx.source === 'sale') sales += amt;
        else if (tx.source === 'return') refunds += amt;       // already negative
        else if (tx.source === 'expense') expenses += amt;     // negative
        else if (tx.source === 'supplier_payment') other += amt;
        else if (tx.source === 'transfer') { if (amt > 0) transfersIn += amt; else transfersOut += amt; }
        else other += amt;
      }
      const net = sales + refunds + expenses + transfersIn + transfersOut + other;
      return {
        cashAccount: { id: a.id, name: a.name, type: a.type, location: a.Location || null },
        opening,
        sales: +sales.toFixed(3),
        refunds: +refunds.toFixed(3),
        expenses: +expenses.toFixed(3),
        transfersIn: +transfersIn.toFixed(3),
        transfersOut: +transfersOut.toFixed(3),
        other: +other.toFixed(3),
        expected: +(opening + net).toFixed(3),
      };
    }));

    res.json({ date: dateStr, accounts: result });
  } catch (err) {
    console.error('[finance/daily-cash]', err);
    res.status(500).json({ message: err.message });
  }
});

// ─── Daybook ────────────────────────────────────────────────────────
// Chronological CashTransaction listing for a date (or range), per
// account. Supports filters: ?date=, ?from=&to=, ?accountId=, ?source=.
router.get('/daybook', protect, async (req, res) => {
  try {
    if (!hasFinanceAccess(req)) return res.status(403).json({ message: 'Forbidden' });
    let from, to;
    if (req.query.from || req.query.to) {
      from = req.query.from ? rangeStart(req.query.from) : new Date('1970-01-01');
      to = req.query.to ? rangeEnd(req.query.to) : new Date('2999-12-31');
    } else {
      const dateStr = req.query.date || localDate();
      from = new Date(dateStr + 'T00:00:00');
      to = new Date(dateStr + 'T23:59:59.999');
    }
    const where = { date: { [Op.between]: [from, to] } };
    if (req.query.accountId) where.cashAccountId = parseInt(req.query.accountId, 10);
    if (req.query.source) where.source = req.query.source;
    const txns = await CashTransaction.findAll({
      where,
      include: [
        { model: CashAccount, attributes: ['id', 'name', 'type'] },
        { model: User, as: 'author', attributes: ['id', 'name'] },
      ],
      order: [['date', 'ASC'], ['id', 'ASC']],
      limit: parseInt(req.query.limit, 10) || 1000,
    });
    const totals = txns.reduce((s, t) => {
      const amt = parseFloat(t.amount);
      if (amt > 0) s.in += amt; else s.out += amt;
      s.net += amt;
      return s;
    }, { in: 0, out: 0, net: 0 });
    const round = (n) => +n.toFixed(3);
    res.json({
      range: { from, to },
      totals: { in: round(totals.in), out: round(totals.out), net: round(totals.net) },
      entries: txns,
    });
  } catch (err) {
    console.error('[finance/daybook]', err);
    res.status(500).json({ message: err.message });
  }
});

// ─── Profit & Loss ──────────────────────────────────────────────────
// Revenue (POS+online orders, status paid)
//   minus refunds (SalesReturn)
//   = Net revenue
// minus COGS (Σ Order.items[].costPrice × qty, less refund cost share)
//   = Gross profit
// minus Expenses (status=paid)
// minus Depreciation and stock losses (wastage + count variance) — non-cash
//   = Net profit
//
// COGS uses the snapshot costPrice on each Order line. Lines without
// costPrice contribute 0 (older orders, products without cost set).
// Returns subtract proportionally — refundAmount/totalAmount.
// Exported so the balance sheet can reuse the exact same formula for
// retained earnings. Two divergent COGS calculations is a guaranteed bug.
export async function computePnl({ from, to, locationId = null }) {
  {
    const locationFilter = locationId ? { locationId: parseInt(locationId, 10) } : {};

    const orderWhere = {
      paymentStatus: 'paid',
      createdAt: { [Op.between]: [from, to] },
      ...locationFilter,
    };
    const orders = await Order.findAll({
      where: orderWhere,
      attributes: ['id', 'orderNumber', 'totalAmount', 'refundAmount', 'paymentMethod', 'items', 'shippingCharge', 'locationId', 'createdAt'],
    });

    let revenue = 0, cogs = 0, deliveryIncome = 0;
    const linesByCategory = new Map();   // category → { revenue, cogs }
    for (const o of orders) {
      revenue += parseFloat(o.totalAmount || 0);
      // totalAmount is inclusive of delivery, so break it out to report
      // it as its own income line rather than buried in product sales.
      deliveryIncome += parseFloat(o.shippingCharge || 0);
      for (const it of (o.items || [])) {
        const qty = parseInt(it.quantity, 10) || 0;
        const cost = parseFloat(it.costPrice || 0);
        const lineRev = (parseFloat(it.price) || 0) * qty;
        const lineCogs = cost * qty;
        cogs += lineCogs;
        const cat = it.category || 'Uncategorized';
        const cur = linesByCategory.get(cat) || { revenue: 0, cogs: 0, qty: 0 };
        cur.revenue += lineRev;
        cur.cogs += lineCogs;
        cur.qty += qty;
        linesByCategory.set(cat, cur);
      }
    }

    // Returns in range
    const returnWhere = {
      status: 'completed',
      createdAt: { [Op.between]: [from, to] },
      ...locationFilter,
    };
    const returns = await SalesReturn.findAll({
      where: returnWhere,
      attributes: ['refundAmount', 'items', 'orderId'],
    });
    let refunds = 0, refundCogs = 0;
    for (const r of returns) {
      refunds += parseFloat(r.refundAmount || 0);
      for (const it of (r.items || [])) {
        const qty = parseInt(it.quantity, 10) || 0;
        // Return lines now snapshot the original line's costPrice, so a
        // return credits COGS back. Returns written before that change
        // have no costPrice and contribute 0 — which leaves their goods
        // back in stock with COGS never reversed, and shows up as a
        // balance-sheet difference rather than being silently absorbed.
        if (it.costPrice != null) refundCogs += parseFloat(it.costPrice) * qty;
      }
    }
    // Hub returns (OrderReturn) on paid orders: the returned units' line value
    // comes off revenue, and their cost comes back off COGS when they went
    // back into stock (a written-off return keeps its cost as a loss).
    if (!locationFilter.locationId) {
      const hubReturns = await OrderReturn.findAll({
        where: { createdAt: { [Op.between]: [from, to] } },
        attributes: ['orderId', 'lineIndex', 'quantity', 'restock'],
        raw: true,
      });
      if (hubReturns.length) {
        const paidOrders = await Order.findAll({
          where: { id: [...new Set(hubReturns.map((r) => r.orderId))], paymentStatus: 'paid' },
          attributes: ['id', 'items'],
        });
        const byId = new Map(paidOrders.map((o) => [o.id, o]));
        for (const r of hubReturns) {
          const item = (byId.get(r.orderId)?.items || [])[r.lineIndex];
          if (!item) continue;
          const sold = parseInt(item.quantity, 10) || 0;
          const qty = parseInt(r.quantity, 10) || 0;
          const lineTotal = item.lineTotal != null ? parseFloat(item.lineTotal) : (parseFloat(item.price) || 0) * sold;
          if (sold > 0) refunds += (lineTotal / sold) * qty;
          if (r.restock && item.costPrice != null) refundCogs += parseFloat(item.costPrice) * qty;
        }
      }
    }

    // parseRange builds `from`/`to` in LOCAL time, so formatting them with
    // toISOString() (as this used to) shifted the window by the UTC offset:
    // on UTC+3 the local 1st of a month became the previous month's last
    // day, leaking those expenses into the wrong period. Format locally.
    const expenseWhere = {
      status: 'paid',
      expenseDate: { [Op.between]: [dateOnly(from), dateOnly(to)] },
      ...locationFilter,
    };
    const exps = await Expense.findAll({
      where: expenseWhere,
      include: [{ model: ExpenseCategory, attributes: ['id', 'name'] }],
      attributes: ['amount', 'expenseCategoryId'],
    });
    let totalExpenses = 0;
    const expensesByCategory = new Map();
    for (const e of exps) {
      const amt = parseFloat(e.amount || 0);
      totalExpenses += amt;
      const cat = e.ExpenseCategory?.name || 'Uncategorized';
      expensesByCategory.set(cat, (expensesByCategory.get(cat) || 0) + amt);
    }
    // Hub expenses paid personally have no Expense row (no company cash left
    // yet); they count here on their own date, and the balance sheet carries
    // the unpaid part as a liability. Reimbursing them only moves cash.
    if (!locationFilter.locationId) {
      const personal = await HubExpenseEntry.findAll({
        where: {
          entryType: 'expense', fundingSource: 'Paid Personally', voidedAt: null,
          txnDate: { [Op.between]: [dateOnly(from), dateOnly(to)] },
        },
        attributes: ['amount', 'category'],
      });
      for (const e of personal) {
        const amt = parseFloat(e.amount || 0);
        totalExpenses += amt;
        expensesByCategory.set(e.category, (expensesByCategory.get(e.category) || 0) + amt);
      }
    }

    // ── Depreciation (NON-CASH) ──────────────────────────────────
    // Filtered on the 'YYYY-MM' string range, which is the whole point of
    // storing `period` as a string — no timezone reasoning needed.
    const fromMonth = monthKeyLocal(from);
    const toMonth = monthKeyLocal(to);
    const depEntries = await DepreciationEntry.findAll({
      where: { period: { [Op.between]: [fromMonth, toMonth] } },
      include: [{
        model: FixedAsset,
        attributes: ['id', 'name', 'assetNumber', 'locationId', 'category'],
        ...(locationFilter.locationId ? { where: { locationId: locationFilter.locationId } } : {}),
      }],
    });
    let depreciation = 0;
    const depByAsset = new Map();
    for (const d of depEntries) {
      const amt = parseFloat(d.amount || 0);
      depreciation += amt;
      const k = d.FixedAsset?.name || `#${d.fixedAssetId}`;
      depByAsset.set(k, (depByAsset.get(k) || 0) + amt);
    }

    // ── Disposal gain / loss ─────────────────────────────────────
    const disposals = await FixedAsset.findAll({
      where: {
        status: 'disposed',
        disposalDate: { [Op.between]: [dateOnly(from), dateOnly(to)] },
        ...locationFilter,
      },
      attributes: ['id', 'assetNumber', 'name', 'disposalDate', 'disposalProceeds', 'disposalGainLoss'],
    });
    const disposalGainLoss = disposals.reduce((s, a) => s + (parseFloat(a.disposalGainLoss) || 0), 0);

    // ── Stock losses (NON-CASH) ──────────────────────────────────
    // Wastage write-offs and stock-count variances take value out of
    // inventory without moving money, so they come straight off the
    // inventory records here rather than through Expense (which would also
    // debit a cash account). Rows from before that change carry an
    // expense id — their Expense is already counted above, so skip them.
    const wastageRows = await Wastage.findAll({
      where: {
        status: 'posted',
        expenseId: null,
        wastageDate: { [Op.between]: [dateOnly(from), dateOnly(to)] },
        ...locationFilter,
      },
      attributes: ['totalCost'],
    });
    const wastageLoss = wastageRows.reduce((s, w) => s + (parseFloat(w.totalCost) || 0), 0);
    const countRows = await StockCount.findAll({
      where: {
        status: 'posted',
        shrinkageExpenseId: null,
        postedAt: { [Op.between]: [from, to] },
        ...locationFilter,
      },
      attributes: ['totalVarianceValue'],
    });
    // totalVarianceValue is negative for shrinkage, positive for a surplus.
    const countVariance = countRows.reduce((s, c) => s + (parseFloat(c.totalVarianceValue) || 0), 0);
    // Hub Stock Out for damaged / lost / expired goods is a write-off too
    // (ERP wastage is its own movement kind, so nothing is counted twice).
    // Valued at the cost recorded on the movement, else the SKU's cost now.
    const lossOuts = await StockMovement.findAll({
      where: {
        kind: 'stock_out',
        reason: { [Op.in]: STOCK_LOSS_REASONS },
        txnDate: { [Op.between]: [dateOnly(from), dateOnly(to)] },
        ...locationFilter,
      },
      attributes: ['productId', 'variantIndex', 'quantity', 'unitCost'],
      raw: true,
    });
    let stockOutLoss = 0;
    if (lossOuts.length) {
      const prods = await Product.findAll({
        where: { id: [...new Set(lossOuts.map((m) => m.productId))] },
        attributes: ['id', 'costPrice', 'variants'],
      });
      const byId = new Map(prods.map((p) => [p.id, p]));
      for (const m of lossOuts) {
        const p = byId.get(m.productId);
        const v = m.variantIndex == null ? null : p?.variants?.[m.variantIndex];
        const current = v && v.costPrice != null && v.costPrice !== '' ? parseFloat(v.costPrice) : parseFloat(p?.costPrice);
        const unit = m.unitCost != null ? parseFloat(m.unitCost) : (current || 0);
        stockOutLoss += Math.abs(parseInt(m.quantity, 10) || 0) * (unit || 0);
      }
    }
    const stockLosses = wastageLoss - countVariance + stockOutLoss;

    const round = (n) => +n.toFixed(3);
    const netRevenue = revenue - refunds;
    const netCogs = cogs - refundCogs;
    const grossProfit = netRevenue - netCogs;
    const operatingProfit = grossProfit - totalExpenses;
    const netProfit = operatingProfit - depreciation - stockLosses + disposalGainLoss;
    const grossMargin = netRevenue > 0 ? +((grossProfit / netRevenue) * 100).toFixed(2) : 0;

    return {
      range: { from, to },
      locationId: locationId || null,
      revenue: round(revenue),
      deliveryIncome: round(deliveryIncome),
      productRevenue: round(revenue - deliveryIncome),
      refunds: round(refunds),
      netRevenue: round(netRevenue),
      cogs: round(netCogs),
      grossProfit: round(grossProfit),
      grossMargin,
      expenses: round(totalExpenses),
      operatingProfit: round(operatingProfit),
      depreciation: round(depreciation),
      stockLosses: round(stockLosses),
      // byCategory is at line price, before order-level discounts and
      // refunds; these let the table foot back to netRevenue.
      billDiscounts: round([...linesByCategory.values()].reduce((s, v) => s + v.revenue, 0) + deliveryIncome - revenue),
      stockLossDetail: { wastage: round(wastageLoss), countVariance: round(countVariance), stockOut: round(stockOutLoss) },
      disposalGainLoss: round(disposalGainLoss),
      netProfit: round(netProfit),
      byCategory: [...linesByCategory.entries()].map(([category, v]) => ({
        category, qty: v.qty, revenue: round(v.revenue), cogs: round(v.cogs), grossProfit: round(v.revenue - v.cogs),
      })).sort((a, b) => b.revenue - a.revenue),
      expensesByCategory: [...expensesByCategory.entries()].map(([name, amount]) => ({
        category: name, amount: round(amount),
      })).sort((a, b) => b.amount - a.amount),
      depreciationByAsset: [...depByAsset.entries()].map(([asset, amount]) => ({
        asset, amount: round(amount),
      })).sort((a, b) => b.amount - a.amount),
      disposals: disposals.map((a) => ({
        assetNumber: a.assetNumber, name: a.name, disposalDate: a.disposalDate,
        proceeds: round(parseFloat(a.disposalProceeds) || 0),
        gainLoss: round(parseFloat(a.disposalGainLoss) || 0),
      })),
    };
  }
}

// Route wrapper. Runs any missing depreciation first so the figures on
// screen are never stale.
router.get('/pnl', protect, async (req, res) => {
  try {
    if (!hasFinanceAccess(req)) return res.status(403).json({ message: 'Forbidden' });
    const { from, to } = parseRange(req.query);
    if (to <= new Date()) await ensureDepreciation(monthKeyLocal(to));
    res.json(await computePnl({ from, to, locationId: req.query.locationId }));
  } catch (err) {
    console.error('[finance/pnl]', err);
    res.status(500).json({ message: err.message });
  }
});

function parseRange(q) {
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  const from = q.from ? rangeStart(q.from) : firstOfMonth;
  const to = q.to ? rangeEnd(q.to) : endOfMonth;
  return { from, to };
}

// ─── Stock Value ────────────────────────────────────────────────────
// Inventory valuation per product per location:
//   value = ProductStock.quantity × Product.costPrice
// Totals roll up per location and overall.
// Exported so the balance sheet values inventory with the same formula.
export async function computeStockValue({ locationId = null } = {}) {
  {
    const where = {};
    if (locationId) where.locationId = parseInt(locationId, 10);

    const stocks = await ProductStock.findAll({
      where,
      include: [
        { model: Product, attributes: ['id', 'name', 'code', 'category', 'costPrice', 'price', 'variants'] },
        { model: Location, attributes: ['id', 'name', 'code'] },
      ],
    });

    const rows = [];
    let totalValue = 0, totalRetail = 0, totalQty = 0;
    const byLocation = new Map();
    for (const s of stocks) {
      const p = s.Product;
      if (!p) continue;
      // Resolve variant cost/price if applicable.
      let cost = parseFloat(p.costPrice || 0);
      let retail = parseFloat(p.price || 0);
      let name = p.name;
      if (s.variantIndex != null && Array.isArray(p.variants) && p.variants[s.variantIndex]) {
        const v = p.variants[s.variantIndex];
        if (v.costPrice != null) cost = parseFloat(v.costPrice);
        if (v.price != null) retail = parseFloat(v.price);
        name = `${p.name} (${Object.values(v.options || {}).join('/')})`;
      }
      const qty = s.quantity || 0;
      const value = cost * qty;
      const retailVal = retail * qty;
      rows.push({
        productId: p.id, variantIndex: s.variantIndex,
        name, sku: p.code,
        category: p.category,
        location: s.Location ? { id: s.Location.id, name: s.Location.name } : null,
        quantity: qty,
        costPrice: cost,
        retailPrice: retail,
        value: +value.toFixed(3),
        retailValue: +retailVal.toFixed(3),
        margin: retailVal > 0 ? +((retailVal - value) / retailVal * 100).toFixed(2) : 0,
      });
      totalValue += value;
      totalRetail += retailVal;
      totalQty += qty;
      if (s.locationId) {
        const k = s.locationId;
        const cur = byLocation.get(k) || { locationName: s.Location?.name || `#${k}`, qty: 0, value: 0, retailValue: 0 };
        cur.qty += qty;
        cur.value += value;
        cur.retailValue += retailVal;
        byLocation.set(k, cur);
      }
    }

    const round = (n) => +n.toFixed(3);
    return {
      totals: {
        quantity: totalQty,
        value: round(totalValue),
        retailValue: round(totalRetail),
        marginPct: totalRetail > 0 ? +((totalRetail - totalValue) / totalRetail * 100).toFixed(2) : 0,
      },
      byLocation: [...byLocation.entries()].map(([locId, v]) => ({
        locationId: locId, locationName: v.locationName,
        quantity: v.qty, value: round(v.value), retailValue: round(v.retailValue),
      })).sort((a, b) => b.value - a.value),
      rows: rows.sort((a, b) => b.value - a.value),
    };
  }
}

router.get('/stock-value', protect, async (req, res) => {
  try {
    if (!hasFinanceAccess(req)) return res.status(403).json({ message: 'Forbidden' });
    res.json(await computeStockValue({ locationId: req.query.locationId }));
  } catch (err) {
    console.error('[finance/stock-value]', err);
    res.status(500).json({ message: err.message });
  }
});

export default router;
