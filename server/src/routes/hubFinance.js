import { Router } from 'express';
import { Op } from 'sequelize';
import sequelize from '../config/database.js';
import {
  CashAccount, CashTransaction, DepreciationEntry, Expense, ExpenseCategory, FixedAsset, HubExpenseEntry, HubLiability,
  HubReimbursement, Setting, User, writeCashTxn,
} from '../models/index.js';
import { protect } from '../middleware/auth.js';
import { bad, can, hubLog, need, wrap as wrapAs } from '../hub/http.js';

/**
 * FEMNIA Hub Expenses & Assets. Every company-funded entry posts to our
 * cash ledger through the account its funding source maps to (no-overdraft
 * rule applies); "Paid Personally" opens a liability that is settled by
 * reimbursements out of a company account.
 */
const router = Router();
router.use(protect);
const wrap = (fn) => wrapAs('hubFinance', fn);

export const PAYMENT_METHODS = ['Cash', 'Fawran', 'Card', 'Bank Transfer', 'Other'];
export const COMPANY_FUNDING_SOURCES = [
  'Company Bank', 'Petty Cash', 'Cash in Hand', 'Cash Drawer', 'Fawran', 'Company Money', 'Other Company Account',
];
export const PERSONAL_FUNDING_SOURCE = 'Paid Personally';
const FUNDING_SOURCES = [...COMPANY_FUNDING_SOURCES, PERSONAL_FUNDING_SOURCE];
const MAPPING_KEY = 'hub_funding_accounts';

// A new account for an unmapped source gets a type that puts it on the right
// balance-sheet line (cash in hand vs bank).
const SOURCE_ACCOUNT_TYPE = {
  'Company Bank': 'bank', 'Petty Cash': 'petty_cash', 'Cash in Hand': 'petty_cash', 'Cash Drawer': 'drawer',
  Fawran: 'bank', 'Company Money': 'other', 'Other Company Account': 'other',
};
// Reimbursements carry only a payment method in the design; this is the account they leave from by default.
const METHOD_DEFAULT_SOURCE = {
  Cash: 'Cash in Hand', Fawran: 'Fawran', Card: 'Company Bank', 'Bank Transfer': 'Company Bank', Other: 'Other Company Account',
};
const EXPENSE_METHOD = { Cash: 'cash', Card: 'card', Fawran: 'bank', 'Bank Transfer': 'bank', Other: 'other' };
const ASSET_CATEGORY = {
  Furniture: 'furniture', 'Fixtures & Racks': 'fixtures', Equipment: 'equipment', 'Computer / IT': 'computer',
  Printer: 'equipment', Vehicle: 'vehicle', 'Shop Improvement': 'leasehold', Software: 'other', Other: 'other',
};

const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const num = (v) => parseFloat(v) || 0;
const clean = (v, max = 400) => (v ?? '').toString().replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const gen = (prefix) => `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

async function loadMapping() {
  const row = await Setting.findOne({ where: { key: MAPPING_KEY } });
  try {
    const parsed = JSON.parse(row?.value || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** The cash account a company funding source pays from: mapped, else same-named, else created. */
export async function accountForSource(source, transaction) {
  if (!COMPANY_FUNDING_SOURCES.includes(source)) throw bad('Choose a company funding source.');
  const mapping = await loadMapping();
  if (mapping[source]) {
    const mapped = await CashAccount.findByPk(parseInt(mapping[source], 10), { transaction });
    if (mapped && mapped.active !== false) return mapped;
  }
  const named = await CashAccount.findOne({ where: { name: source, active: true }, transaction });
  if (named) return named;
  return CashAccount.create({
    name: source, type: SOURCE_ACCOUNT_TYPE[source] || 'other', openingBalance: 0,
    notes: 'Created by the FEMNIA Hub for this funding source. Set its balance in the ERP cash accounts, or map the source to another account in Hub Settings.',
  }, { transaction });
}

async function balanceOf(accountId) {
  const acct = await CashAccount.findByPk(accountId, { attributes: ['openingBalance'] });
  const sum = await CashTransaction.sum('amount', { where: { cashAccountId: accountId } });
  return round2(num(acct?.openingBalance) + num(sum));
}

/** Debit an account, turning the no-overdraft refusal into guidance staff can act on. */
async function debit({ account, amount, source, sourceType, sourceId, reference, description, date, req, transaction }) {
  try {
    return await writeCashTxn({
      cashAccountId: account.id, amount: -amount, source, sourceType, sourceId, reference, description,
      date: new Date(`${date}T12:00:00`), createdBy: req.user.id, transaction, requireFunds: true,
    });
  } catch (err) {
    if (/^Not enough/.test(err.message)) {
      throw bad(`${err.message}. Record the money that account holds (ERP → Cash accounts), or map this funding source to another account in Settings.`);
    }
    throw err;
  }
}

// ════════════════════════════════════════════════════════════════════
// Funding source → cash account mapping
// ════════════════════════════════════════════════════════════════════
router.get('/finance/funding-accounts', need('expenses.add', 'assets.add', 'liabilities.reimburse', 'liabilities.settle', 'admin.settings'), wrap(async (req, res) => {
  const mapping = await loadMapping();
  const accounts = await CashAccount.findAll({ where: { active: true }, order: [['name', 'ASC']] });
  const rows = [];
  for (const source of COMPANY_FUNDING_SOURCES) {
    const id = mapping[source] ? parseInt(mapping[source], 10) : null;
    const acct = (id && accounts.find((a) => a.id === id)) || accounts.find((a) => a.name === source) || null;
    rows.push({
      source, mapped: Boolean(id && acct), cashAccountId: acct ? acct.id : null, cashAccountName: acct ? acct.name : null,
      balance: acct ? await balanceOf(acct.id) : null,
    });
  }
  res.json({
    sources: rows,
    accounts: can(req, 'admin.settings') ? accounts.map((a) => ({ id: a.id, name: a.name, type: a.type })) : [],
  });
}));

router.put('/finance/funding-accounts', need('admin.settings'), wrap(async (req, res) => {
  const input = req.body?.mapping && typeof req.body.mapping === 'object' ? req.body.mapping : {};
  const previous = await loadMapping();
  const next = {};
  for (const source of COMPANY_FUNDING_SOURCES) {
    const id = parseInt(input[source], 10);
    if (!id) continue;
    const acct = await CashAccount.findByPk(id);
    if (!acct || acct.active === false) throw bad(`${source}: choose an active cash account.`);
    next[source] = id;
  }
  await Setting.upsert({ key: MAPPING_KEY, value: JSON.stringify(next) });
  const changed = COMPANY_FUNDING_SOURCES.filter((s) => (previous[s] || null) !== (next[s] || null));
  if (changed.length) {
    await hubLog(req, 'Setting updated', 'Settings', MAPPING_KEY, `Funding account mapping changed: ${changed.join(', ')}`);
  }
  res.json({ ok: true, changed: changed.length });
}));

// ════════════════════════════════════════════════════════════════════
// Entries
// ════════════════════════════════════════════════════════════════════
const mapEntry = (e) => ({
  id: String(e.id),
  source: 'hub',
  entryType: e.entryType,
  reference: e.reference,
  date: e.txnDate,
  category: e.category,
  item: e.item,
  amount: num(e.amount),
  purchasedBy: e.purchasedBy || e.purchasePerson || null,
  purchasePerson: e.purchasePerson || null,
  payee: e.payee || null,
  paymentMethod: e.paymentMethod,
  fundingSource: e.fundingSource,
  receiptReference: e.receiptReference || null,
  notes: e.notes || null,
  createdAt: e.createdAt,
  voided: Boolean(e.voidedAt),
  voidReason: e.voidReason || null,
});

// Classic Expense.paymentMethod → the hub's payment methods.
const CLASSIC_METHOD = { cash: 'Cash', card: 'Card', bank: 'Bank Transfer', cheque: 'Other', other: 'Other' };
const ASSET_CATEGORY_LABEL = {
  furniture: 'Furniture', fixtures: 'Fixtures & Racks', equipment: 'Equipment', computer: 'Computer / IT',
  vehicle: 'Vehicle', leasehold: 'Shop Improvement', other: 'Other',
};

/** Reference category names (seeded once when missing, never forced active again). */
const DEFAULT_EXPENSE_CATEGORIES = [
  'Rent', 'Salaries', 'Utilities', 'Packing Material', 'Delivery / Courier', 'Marketing', 'Transport',
  'Office Supplies', 'Maintenance', 'Government / Fees', 'Bank Charges', 'Other',
];
let categoriesSeeded = false;
async function seedExpenseCategories() {
  if (categoriesSeeded) return;
  for (const name of DEFAULT_EXPENSE_CATEGORIES) {
    await ExpenseCategory.findOrCreate({ where: { name }, defaults: { active: true } });
  }
  categoriesSeeded = true;
}

async function namesById(ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const users = await User.findAll({ where: { id: unique }, attributes: ['id', 'name', 'username', 'email'] });
  return new Map(users.map((u) => [u.id, u.name || u.username || u.email]));
}

/**
 * Daily expenses from everywhere: hub entries, plus Expense rows booked in
 * Back Office / classic ERP (no hub entry points at them). An Expense
 * cancelled on either side shows as voided on the hub row too.
 */
async function listExpenses(includeVoided) {
  const entries = await HubExpenseEntry.findAll({ where: { entryType: 'expense' }, order: [['txnDate', 'DESC'], ['createdAt', 'DESC']] });
  const linkedIds = entries.map((e) => e.expenseId).filter(Boolean);
  const linked = linkedIds.length ? await Expense.findAll({ where: { id: linkedIds }, attributes: ['id', 'status'] }) : [];
  const cancelled = new Set(linked.filter((x) => x.status === 'cancelled').map((x) => x.id));
  const hubRows = entries.map((e) => {
    const row = mapEntry(e);
    if (!row.voided && e.expenseId && cancelled.has(e.expenseId)) row.voided = true;
    return row;
  });

  const classic = await Expense.findAll({
    where: linkedIds.length ? { id: { [Op.notIn]: linkedIds } } : {},
    include: [{ model: ExpenseCategory, attributes: ['name'] }, { model: CashAccount, attributes: ['name'] }],
    order: [['expenseDate', 'DESC'], ['createdAt', 'DESC']],
  });
  const names = await namesById(classic.map((x) => x.createdBy));
  const classicRows = classic.map((x) => ({
    id: `c-${x.id}`,
    source: 'classic',
    entryType: 'expense',
    reference: x.expenseNumber,
    date: x.expenseDate,
    category: x.ExpenseCategory?.name || 'Other',
    item: x.description,
    amount: num(x.amount),
    purchasedBy: names.get(x.createdBy) ?? null,
    purchasePerson: null,
    payee: null,
    paymentMethod: CLASSIC_METHOD[x.paymentMethod] || 'Other',
    fundingSource: x.CashAccount?.name || 'Company Money',
    receiptReference: x.reference || null,
    notes: x.notes || null,
    createdAt: x.createdAt,
    voided: x.status === 'cancelled',
    voidReason: null,
  }));
  const rows = [...hubRows, ...classicRows]
    .sort((a, b) => (String(b.date).localeCompare(String(a.date)) || new Date(b.createdAt) - new Date(a.createdAt)));
  return includeVoided ? rows : rows.filter((r) => !r.voided);
}

/**
 * Every fixed asset (hub + Back Office), with its depreciation so far. Hub
 * rows keep their entry's vocabulary (category, purchased by, funding).
 */
async function listAssets(includeVoided) {
  const [assets, entries, dep] = await Promise.all([
    FixedAsset.findAll({ include: [{ model: CashAccount, attributes: ['name'] }], order: [['acquisitionDate', 'DESC'], ['createdAt', 'DESC']] }),
    HubExpenseEntry.findAll({ where: { entryType: 'asset' } }),
    DepreciationEntry.findAll({
      attributes: ['fixedAssetId', [sequelize.fn('SUM', sequelize.col('amount')), 'total']],
      group: ['fixedAssetId'],
      raw: true,
    }),
  ]);
  const depBy = new Map(dep.map((d) => [d.fixedAssetId, num(d.total)]));
  const entryBy = new Map(entries.filter((e) => e.fixedAssetId).map((e) => [e.fixedAssetId, e]));
  const names = await namesById(assets.map((a) => a.createdBy));
  const rows = assets.map((a) => {
    const e = entryBy.get(a.id);
    const base = e ? mapEntry(e) : {
      id: `a-${a.id}`,
      source: 'classic',
      entryType: 'asset',
      reference: a.assetNumber,
      date: a.acquisitionDate,
      category: ASSET_CATEGORY_LABEL[a.category] || 'Other',
      item: a.name,
      amount: num(a.cost),
      purchasedBy: names.get(a.createdBy) ?? null,
      purchasePerson: null,
      payee: null,
      paymentMethod: 'Other',
      fundingSource: a.CashAccount?.name || 'Not recorded',
      receiptReference: null,
      notes: a.notes || null,
      createdAt: a.createdAt,
      voided: false,
      voidReason: null,
    };
    const accumulated = Math.min(depBy.get(a.id) || 0, num(a.cost));
    return {
      ...base,
      voided: base.voided || a.status === 'written_off',
      asset: {
        id: a.id,
        status: a.status,
        depreciationRate: num(a.depreciationRate),
        salvageValue: num(a.salvageValue),
        serialNumber: a.serialNumber || null,
        accumulatedDepreciation: round2(accumulated),
        netBookValue: round2(num(a.cost) - accumulated),
        disposalDate: a.disposalDate || null,
      },
    };
  });
  return includeVoided ? rows : rows.filter((r) => !r.voided);
}

router.get('/expenses', need('expenses.view', 'assets.view', 'reports.financial'), wrap(async (req, res) => {
  const type = req.query.type === 'asset' ? 'asset' : 'expense';
  if (!can(req, type === 'asset' ? 'assets.view' : 'expenses.view') && !can(req, 'reports.financial')) {
    throw bad('You do not have permission to view these records.', 403);
  }
  const includeVoided = req.query.includeVoided === '1';
  res.set('Cache-Control', 'no-store');
  res.json(type === 'asset' ? await listAssets(includeVoided) : await listExpenses(includeVoided));
}));

// ── Expense categories (shared with Back Office) ─────────────────────
router.get('/finance/expense-categories', need('expenses.view', 'expenses.add', 'reports.financial'), wrap(async (req, res) => {
  await seedExpenseCategories();
  const rows = await ExpenseCategory.findAll({ order: [['name', 'ASC']] });
  res.json(rows.map((c) => ({ id: c.id, name: c.name, active: c.active !== false })));
}));

const canManageCategories = (req) => req.user.role === 'admin' || can(req, 'expenses.edit');

router.post('/finance/expense-categories', need('expenses.edit'), wrap(async (req, res) => {
  if (!canManageCategories(req)) throw bad('You do not have permission to manage expense categories.', 403);
  const name = clean(req.body?.name, 80);
  if (!name) throw bad('Enter a category name.');
  const exists = await ExpenseCategory.findOne({ where: sequelize.where(sequelize.fn('LOWER', sequelize.col('name')), name.toLowerCase()) });
  if (exists) {
    if (exists.active === false) {
      await exists.update({ active: true });
      await hubLog(req, 'Expense category reactivated', 'Expenses & Assets', name);
      return res.json({ id: exists.id, name: exists.name, active: true });
    }
    throw bad('That category already exists.');
  }
  const cat = await ExpenseCategory.create({ name, active: true });
  await hubLog(req, 'Expense category added', 'Expenses & Assets', name);
  res.status(201).json({ id: cat.id, name: cat.name, active: true });
}));

router.put('/finance/expense-categories/:id', need('expenses.edit'), wrap(async (req, res) => {
  if (!canManageCategories(req)) throw bad('You do not have permission to manage expense categories.', 403);
  const cat = await ExpenseCategory.findByPk(parseInt(req.params.id, 10));
  if (!cat) throw bad('This category no longer exists.', 404);
  const patch = {};
  if (req.body?.name !== undefined) {
    const name = clean(req.body.name, 80);
    if (!name) throw bad('Enter a category name.');
    const clash = await ExpenseCategory.findOne({
      where: { [Op.and]: [sequelize.where(sequelize.fn('LOWER', sequelize.col('name')), name.toLowerCase()), { id: { [Op.ne]: cat.id } }] },
    });
    if (clash) throw bad('That category already exists.');
    patch.name = name;
  }
  if (req.body?.active !== undefined) patch.active = Boolean(req.body.active);
  const before = cat.name;
  await cat.update(patch);
  // Hub entries carry the category as text; a rename follows them so lists and summaries stay grouped.
  if (patch.name && patch.name !== before) {
    await HubExpenseEntry.update({ category: patch.name }, { where: { entryType: 'expense', category: before } });
  }
  await hubLog(req, 'Expense category updated', 'Expenses & Assets', cat.name,
    [patch.name && patch.name !== before ? `Renamed from ${before}` : null, patch.active === false ? 'Deactivated' : patch.active === true ? 'Activated' : null]
      .filter(Boolean).join(' · ') || 'No change');
  res.json({ id: cat.id, name: cat.name, active: cat.active !== false });
}));

router.post('/expenses', need('expenses.add', 'assets.add'), wrap(async (req, res) => {
  const b = req.body || {};
  const type = b.entryType === 'asset' ? 'asset' : 'expense';
  const label = type === 'asset' ? 'Asset' : 'Expense';
  if (!can(req, type === 'asset' ? 'assets.add' : 'expenses.add')) throw bad(`You do not have permission to add ${type}s.`, 403);
  const key = clean(b.idempotencyKey, 120) || null;
  if (key) {
    const prior = await HubExpenseEntry.findOne({ where: { idempotencyKey: key } });
    if (prior) {
      const liability = await HubLiability.findOne({ where: { entryId: prior.id } });
      return res.json({ entry: mapEntry(prior), liabilityCreated: false, liabilityPerson: liability?.person ?? null, duplicate: true });
    }
  }
  const item = clean(b.item, 200);
  const category = clean(b.category, 80);
  const amount = round2(b.amount);
  if (!item) throw bad(`${label} item is required.`);
  if (!category) throw bad('Category is required.');
  if (!(amount > 0)) throw bad('Enter a valid amount.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.date || ''))) throw bad('Date is required.');
  const fundingSource = FUNDING_SOURCES.includes(b.fundingSource) ? b.fundingSource : null;
  if (!fundingSource) throw bad('Choose where the money came from.');
  if (b.paymentMethod && !PAYMENT_METHODS.includes(b.paymentMethod)) throw bad('Choose a valid payment method.');
  const paymentMethod = b.paymentMethod || 'Cash';
  const personal = fundingSource === PERSONAL_FUNDING_SOURCE;
  const person = clean(b.purchasePerson, 120);
  if (personal && !person) throw bad('Purchase person is required when the payment was made personally.');
  const purchasedBy = clean(b.purchasedBy, 120);
  if (!purchasedBy) throw bad('Purchased by / expense made by is required.');
  const reference = clean(b.reference, 40) || gen(type === 'asset' ? 'AST' : 'EXP');
  // Asset depreciation inputs (Back Office defaults when not given).
  const salvageValue = type === 'asset' ? round2(Math.max(Number(b.salvageValue) || 0, 0)) : 0;
  const depreciationRate = type === 'asset' && b.depreciationRate !== undefined && b.depreciationRate !== ''
    ? Number(b.depreciationRate) : 20;
  if (type === 'asset') {
    if (salvageValue >= amount) throw bad('Salvage value must be less than the cost.');
    if (!(depreciationRate > 0 && depreciationRate <= 100)) throw bad('Depreciation rate must be between 0 and 100%.');
  }
  const serialNumber = clean(b.serialNumber, 120) || null;

  const t = await sequelize.transaction();
  let entry;
  try {
    const account = personal ? null : await accountForSource(fundingSource, t);
    entry = await HubExpenseEntry.create({
      entryType: type, reference, txnDate: b.date, category, item, amount, purchasedBy, purchasePerson: person || null,
      payee: clean(b.payee, 120) || null, paymentMethod, fundingSource, cashAccountId: account?.id ?? null,
      receiptReference: clean(b.receiptReference, 80) || null, notes: clean(b.notes) || null,
      idempotencyKey: key, createdBy: req.user.id,
    }, { transaction: t });

    if (type === 'expense' && account) {
      const [cat] = await ExpenseCategory.findOrCreate({ where: { name: category }, defaults: { active: true }, transaction: t });
      const exp = await Expense.create({
        expenseNumber: reference, expenseCategoryId: cat.id, cashAccountId: account.id, amount,
        paymentMethod: EXPENSE_METHOD[paymentMethod] || 'other', description: item.slice(0, 250),
        reference: entry.receiptReference, expenseDate: b.date, notes: entry.notes, status: 'paid', createdBy: req.user.id,
      }, { transaction: t });
      await debit({ account, amount, source: 'expense', sourceType: 'Expense', sourceId: exp.id, reference, description: item, date: b.date, req, transaction: t });
      entry.expenseId = exp.id;
    }
    if (type === 'asset') {
      const asset = await FixedAsset.create({
        assetNumber: reference, name: item.slice(0, 250), category: ASSET_CATEGORY[category] || 'other',
        acquisitionDate: b.date, cost: amount, salvageValue, depreciationRate, serialNumber,
        depreciationStartMonth: String(b.date).slice(0, 7), cashAccountId: account?.id ?? null,
        notes: [entry.notes, personal ? `Paid personally by ${person}` : null].filter(Boolean).join(' · ') || null,
        status: 'active', createdBy: req.user.id,
      }, { transaction: t });
      if (account) {
        await debit({ account, amount, source: 'asset', sourceType: 'FixedAsset', sourceId: asset.id, reference, description: `Purchase of ${item}`, date: b.date, req, transaction: t });
      }
      entry.fixedAssetId = asset.id;
    }
    await entry.save({ transaction: t });
    if (personal) {
      await HubLiability.create({
        entryId: entry.id, person, amount, notes: `${label} ${reference} paid personally by ${person}`, createdBy: req.user.id,
      }, { transaction: t });
    }
    await t.commit();
  } catch (err) {
    if (!t.finished) await t.rollback();
    if (err.name === 'SequelizeUniqueConstraintError') throw bad('That reference is already used. Save again to get a new one.', 409);
    throw err;
  }
  await hubLog(req, `${label} recorded`, 'Expenses & Assets', reference,
    `${category} · ${item} · QAR ${amount.toFixed(2)} · ${fundingSource}${personal ? ` · liability opened for ${person}` : ''}`);
  res.status(201).json({ entry: mapEntry(entry), liabilityCreated: personal, liabilityPerson: personal ? person : null });
}));

router.patch('/expenses/:id/purchased-by', need('expenses.edit', 'assets.edit'), wrap(async (req, res) => {
  if (!/^\d+$/.test(String(req.params.id))) throw bad('Back Office records keep their creator; purchased by can only be corrected on hub entries.');
  const entry = await HubExpenseEntry.findByPk(parseInt(req.params.id, 10));
  if (!entry) throw bad('This record no longer exists.', 404);
  if (!can(req, entry.entryType === 'asset' ? 'assets.edit' : 'expenses.edit')) throw bad('You do not have permission to edit this record.', 403);
  const next = clean(req.body?.purchasedBy, 120);
  if (!next) throw bad('Enter the person who made this purchase.');
  const before = entry.purchasedBy || entry.purchasePerson || 'Not Recorded';
  if (next === before) return res.json({ purchasedBy: next });
  await entry.update({ purchasedBy: next });
  await hubLog(req, 'Purchased by corrected', 'Expenses & Assets', entry.reference, `${before} → ${next}`);
  res.json({ purchasedBy: next });
}));

/**
 * Void a mistaken expense or asset. Company-paid: the cash comes back the
 * way the classic cancel does it (a +amount entry, never a delete), and the
 * Expense is cancelled / the asset written off. Paid personally: only while
 * nothing has been reimbursed — the liability is then cancelled with it.
 * `id` is a hub entry id, `c-<expenseId>` (Back Office expense) or
 * `a-<assetId>` (Back Office asset).
 */
router.post('/expenses/:id/void', need('expenses.edit', 'assets.edit'), wrap(async (req, res) => {
  const reason = clean(req.body?.reason, 200);
  if (!reason) throw bad('Enter the reason for voiding.');
  const raw = String(req.params.id);
  const t = await sequelize.transaction();
  let label;
  try {
    let entry = null;
    let expense = null;
    let asset = null;
    if (raw.startsWith('c-')) {
      expense = await Expense.findByPk(parseInt(raw.slice(2), 10), { transaction: t, lock: t.LOCK.UPDATE });
      if (!expense) throw bad('This expense no longer exists.', 404);
      entry = await HubExpenseEntry.findOne({ where: { expenseId: expense.id }, transaction: t });
    } else if (raw.startsWith('a-')) {
      asset = await FixedAsset.findByPk(parseInt(raw.slice(2), 10), { transaction: t, lock: t.LOCK.UPDATE });
      if (!asset) throw bad('This asset no longer exists.', 404);
      entry = await HubExpenseEntry.findOne({ where: { fixedAssetId: asset.id }, transaction: t });
    } else {
      entry = await HubExpenseEntry.findByPk(parseInt(raw, 10), { transaction: t, lock: t.LOCK.UPDATE });
      if (!entry) throw bad('This record no longer exists.', 404);
      if (entry.expenseId) expense = await Expense.findByPk(entry.expenseId, { transaction: t, lock: t.LOCK.UPDATE });
      if (entry.fixedAssetId) asset = await FixedAsset.findByPk(entry.fixedAssetId, { transaction: t, lock: t.LOCK.UPDATE });
    }
    const isAsset = Boolean(asset) || entry?.entryType === 'asset';
    if (!can(req, isAsset ? 'assets.edit' : 'expenses.edit')) throw bad('You do not have permission to void this record.', 403);
    if (entry?.voidedAt) throw bad('This record is already voided.');
    if (expense && expense.status !== 'paid') throw bad('This expense is already voided.');
    if (asset && ['written_off', 'disposed'].includes(asset.status)) throw bad('This asset is already disposed or written off.');
    if (asset) {
      const depreciated = num(await DepreciationEntry.sum('amount', { where: { fixedAssetId: asset.id }, transaction: t }));
      if (depreciated > 0) throw bad('Depreciation has already been booked on this asset. Dispose of it in Finance → Fixed Assets instead.');
    }

    // Personally paid: undo the liability, but never after money went back to the person.
    const liability = entry ? await HubLiability.findOne({ where: { entryId: entry.id }, transaction: t, lock: t.LOCK.UPDATE }) : null;
    if (liability) {
      if (num(liability.reimbursed) > 0) {
        throw bad('Part of this has already been reimbursed, so it can no longer be voided.');
      }
      await liability.destroy({ transaction: t });
    }

    if (expense) {
      await writeCashTxn({
        cashAccountId: expense.cashAccountId, amount: num(expense.amount), source: 'expense', sourceType: 'Expense',
        sourceId: expense.id, reference: `${expense.expenseNumber}-REVERSAL`, description: `Voided: ${expense.description}`,
        date: new Date(), createdBy: req.user.id, transaction: t,
      });
      await expense.update({ status: 'cancelled', notes: [expense.notes, `Voided: ${reason}`].filter(Boolean).join(' · ') }, { transaction: t });
    }
    if (asset) {
      if (asset.cashAccountId) {
        await writeCashTxn({
          cashAccountId: asset.cashAccountId, amount: num(asset.cost), source: 'asset', sourceType: 'FixedAsset',
          sourceId: asset.id, reference: `${asset.assetNumber}-REVERSAL`, description: `Voided: purchase of ${asset.name}`,
          date: new Date(), createdBy: req.user.id, transaction: t,
        });
      }
      await asset.update({ status: 'written_off', notes: [asset.notes, `Voided: ${reason}`].filter(Boolean).join(' · ') }, { transaction: t });
    }
    if (entry) await entry.update({ voidedAt: new Date(), voidReason: reason, voidedBy: req.user.id }, { transaction: t });
    label = entry?.reference || expense?.expenseNumber || asset?.assetNumber;
    await t.commit();
  } catch (err) {
    if (!t.finished) await t.rollback();
    throw err;
  }
  await hubLog(req, 'Entry voided', 'Expenses & Assets', label, reason);
  res.json({ ok: true });
}));

// ════════════════════════════════════════════════════════════════════
// Liabilities
// ════════════════════════════════════════════════════════════════════
async function listLiabilities(where = {}) {
  const rows = await HubLiability.findAll({ where, order: [['createdAt', 'DESC']] });
  if (!rows.length) return [];
  const entries = await HubExpenseEntry.findAll({ where: { id: rows.map((r) => r.entryId) } });
  const reimbursements = await HubReimbursement.findAll({ where: { liabilityId: rows.map((r) => r.id) } });
  return rows.map((row) => {
    const e = entries.find((x) => x.id === row.entryId);
    const amount = num(row.amount);
    const reimbursed = num(row.reimbursed);
    return {
      id: String(row.id),
      entryId: String(row.entryId),
      person: row.person,
      amount,
      reimbursed,
      outstanding: Math.max(0, round2(amount - reimbursed)),
      status: row.status,
      notes: row.notes,
      createdAt: row.createdAt,
      entry: e ? {
        entryType: e.entryType, reference: e.reference, date: e.txnDate, category: e.category, item: e.item,
        purchasedBy: e.purchasedBy || e.purchasePerson || row.person || null, notes: e.notes,
      } : null,
      reimbursements: reimbursements
        .filter((r) => r.liabilityId === row.id)
        .map((r) => ({
          id: String(r.id), paidOn: r.paidOn, amount: num(r.amount), paymentMethod: r.paymentMethod,
          fundingSource: r.fundingSource, reference: r.reference, notes: r.notes,
        }))
        .sort((a, b) => (a.paidOn < b.paidOn ? 1 : -1)),
    };
  });
}

router.get('/liabilities', need('liabilities.view', 'reports.financial', 'dashboard.profit_values'), wrap(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(await listLiabilities());
}));

/** A reimbursement leaves a company account; it never creates a second expense or asset. */
router.post('/liabilities/:id/reimburse', need('liabilities.reimburse', 'liabilities.settle'), wrap(async (req, res) => {
  const b = req.body || {};
  const key = clean(b.idempotencyKey, 120) || null;
  const t = await sequelize.transaction();
  let liability;
  let amount;
  try {
    if (key && (await HubReimbursement.findOne({ where: { idempotencyKey: key }, transaction: t }))) {
      await t.rollback();
      return res.json((await listLiabilities({ id: parseInt(req.params.id, 10) }))[0] ?? null);
    }
    liability = await HubLiability.findByPk(parseInt(req.params.id, 10), { transaction: t, lock: t.LOCK.UPDATE });
    if (!liability) throw bad('This liability no longer exists.', 404);
    const outstanding = round2(num(liability.amount) - num(liability.reimbursed));
    if (outstanding <= 0) throw bad('This liability is already fully settled.');
    amount = round2(b.amount);
    if (!(amount > 0)) throw bad('Enter a valid amount.');
    if (amount > outstanding + 0.001) throw bad(`Amount cannot exceed the outstanding balance of QAR ${outstanding.toFixed(2)}.`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.paidOn || ''))) throw bad('Enter the date it was paid.');
    if (b.paymentMethod && !PAYMENT_METHODS.includes(b.paymentMethod)) throw bad('Choose a valid payment method.');
    const paymentMethod = b.paymentMethod || 'Cash';
    const fundingSource = COMPANY_FUNDING_SOURCES.includes(b.fundingSource) ? b.fundingSource : METHOD_DEFAULT_SOURCE[paymentMethod];
    const account = await accountForSource(fundingSource, t);
    const entry = await HubExpenseEntry.findByPk(liability.entryId, { transaction: t });
    const r = await HubReimbursement.create({
      liabilityId: liability.id, paidOn: b.paidOn, amount, paymentMethod, fundingSource, cashAccountId: account.id,
      reference: clean(b.reference, 80) || null, notes: clean(b.notes) || null, idempotencyKey: key, createdBy: req.user.id,
    }, { transaction: t });
    const txn = await debit({
      account, amount, source: entry?.entryType === 'asset' ? 'asset' : 'expense', sourceType: 'HubReimbursement', sourceId: r.id,
      reference: entry?.reference ?? `LIA-${liability.id}`, description: `Reimbursement to ${liability.person}${entry ? ` · ${entry.item}` : ''}`,
      date: b.paidOn, req, transaction: t,
    });
    await r.update({ cashTransactionId: txn?.id ?? null }, { transaction: t });
    const reimbursed = round2(num(liability.reimbursed) + amount);
    await liability.update({
      reimbursed, status: reimbursed >= num(liability.amount) - 0.001 ? 'paid' : 'partially_paid',
    }, { transaction: t });
    await t.commit();
  } catch (err) {
    if (!t.finished) await t.rollback();
    throw err;
  }
  const [updated] = await listLiabilities({ id: liability.id });
  await hubLog(req, updated.status === 'paid' ? 'Liability settled' : 'Liability reimbursement recorded', 'Expenses & Assets',
    String(liability.id), `${liability.person} · QAR ${amount.toFixed(2)} via ${b.paymentMethod || 'Cash'} · outstanding QAR ${updated.outstanding.toFixed(2)}`);
  res.json(updated);
}));

export default router;
