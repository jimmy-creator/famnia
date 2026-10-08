import crypto from 'crypto';
import { Router } from 'express';
import { Op } from 'sequelize';
import sequelize from '../config/database.js';
import {
  ActivityLog, Expense, FixedAsset, HubExpenseEntry, HubLiability, HubReimbursement, Order, OrderAuditLog, OrderReturn,
  Product, ProductAuditLog, Setting,
  StockMovement, User,
} from '../models/index.js';
import { protect } from '../middleware/auth.js';
import { bad, hubLog, need, wrap as wrapAs } from '../hub/http.js';
import { ALL_PERMISSIONS, HUB_ROLES, passwordProblem } from '../hub/permissions.js';
import { SETTINGS_DEFAULTS, SETTING_KEYS, loadAppSettings } from '../hub/settings.js';
import { applyStockDelta, listSkus, recomputeAfter, skuStock, stockLocationId } from '../hub/catalog.js';
import { toSalesOrder } from '../hub/sales.js';
import { sendPasswordResetEmail } from '../services/emailService.js';

/**
 * FEMNIA Hub administration: Staff & Permissions, the activity log,
 * business settings, the Excel backup export and "Replace Product
 * Catalogue". Staff can never change their own role, status or permissions,
 * and the last active Admin can be neither downgraded nor switched off.
 */
const router = Router();
router.use(protect);
const wrap = (fn) => wrapAs('hubAdmin', fn);

const STAFF_ROLES = HUB_ROLES; // admin, staff, delivery
const STATUSES = ['pending', 'active', 'suspended', 'deactivated'];
const USERNAME_RULE = /^[a-z0-9](?:[a-z0-9._-]{1,30}[a-z0-9])$/;

function usernameProblem(value) {
  const name = String(value || '').trim().toLowerCase();
  if (name.length < 3) return 'Use at least 3 characters.';
  if (name.length > 32) return 'Use 32 characters or fewer.';
  if (!USERNAME_RULE.test(name)) return 'Use letters, numbers, dots, dashes or underscores only.';
  return null;
}

/** A readable temporary password: letters and digits, never ambiguous characters. */
function newTemporaryPassword() {
  const letters = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ';
  const digits = '23456789';
  const all = letters + digits;
  const pick = (set) => set[crypto.randomInt(set.length)];
  const chars = [pick(letters), pick(letters), pick(digits), pick(digits)];
  while (chars.length < 12) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

/** Hub keys only; anything else in User.permissions (legacy admin keys) is kept as is. */
const hubKeys = (list) => [...new Set((Array.isArray(list) ? list : []).filter((p) => ALL_PERMISSIONS.includes(p)))];
const otherKeys = (list) => (Array.isArray(list) ? list : []).filter((p) => !ALL_PERMISSIONS.includes(p));

function mapStaff(u, names) {
  return {
    id: String(u.id),
    fullName: u.name || null,
    email: u.email || null,
    username: u.username || null,
    phone: u.phone || null,
    role: u.role,
    status: u.status || 'active',
    mustChangePassword: Boolean(u.mustChangePassword),
    lastLoginAt: u.lastLoginAt || null,
    createdAt: u.createdAt,
    approvedBy: u.approvedBy ? String(u.approvedBy) : null,
    approvedByName: u.approvedBy ? names.get(u.approvedBy) ?? null : null,
    approvedAt: u.approvedAt || null,
    permissions: hubKeys(u.permissions),
  };
}

async function findStaff(id) {
  const user = await User.findByPk(parseInt(id, 10));
  if (!user || !STAFF_ROLES.includes(user.role)) throw bad('This staff account no longer exists.', 404);
  return user;
}

async function activeAdminCount() {
  return User.count({ where: { role: 'admin', status: 'active' } });
}

function notSelf(req, user, what) {
  if (user.id === req.user.id) throw bad(`You cannot change your own ${what}.`, 403);
}

const MANAGE = ['admin.manage_staff', 'admin.change_permissions'];

// ════════════════════════════════════════════════════════════════════
// Staff
// ════════════════════════════════════════════════════════════════════
router.get('/staff', need(...MANAGE), wrap(async (req, res) => {
  const users = await User.findAll({ where: { role: STAFF_ROLES }, order: [['createdAt', 'ASC']] });
  const names = new Map(users.map((u) => [u.id, u.name || u.email || null]));
  res.set('Cache-Control', 'no-store');
  res.json(users.map((u) => mapStaff(u, names)));
}));

function staffInput(b) {
  const fullName = String(b.fullName || '').trim().slice(0, 120);
  if (!fullName) throw bad('Enter the staff member’s full name.');
  const role = STAFF_ROLES.includes(b.role) ? b.role : null;
  if (!role) throw bad('Choose a role.');
  const phone = String(b.phone || '').trim().slice(0, 40) || null;
  const permissions = role === 'admin' ? [] : hubKeys(b.permissions);
  return { fullName, role, phone, permissions };
}

/** Username + temporary password account. The password is returned once, never stored in clear. */
router.post('/staff', need('admin.manage_staff'), wrap(async (req, res) => {
  const b = req.body || {};
  const { fullName, role, phone, permissions } = staffInput(b);
  const username = String(b.username || '').trim().toLowerCase();
  const uProblem = usernameProblem(username);
  if (uProblem) throw bad(uProblem);
  const email = String(b.email || '').trim().toLowerCase() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad('Enter a valid email address, or leave it empty.');
  if (await User.findOne({ where: { username } })) throw bad('That username is already in use.');
  if (email && (await User.findOne({ where: { email } }))) throw bad('An account with that username or email already exists.');
  const password = String(b.password || '').trim() || newTemporaryPassword();
  const problem = passwordProblem(password);
  if (problem) throw bad(problem);

  const user = await User.create({
    name: fullName, email, username, phone, password, role, permissions,
    status: 'active', approvedBy: req.user.id, approvedAt: new Date(), mustChangePassword: true,
  });
  await hubLog(req, 'Staff account created', 'Staff & Permissions', String(user.id),
    `${fullName} (@${username}) created as ${role}; temporary password issued`);
  res.status(201).json({ ok: true, userId: String(user.id), username, temporaryPassword: password });
}));

const emailConfigured = () => Boolean(process.env.SMTP_EMAIL && process.env.SMTP_APP_PASSWORD);

/** Email invite: the invitee sets their own password from the link and waits for approval. */
router.post('/staff/invite', need('admin.manage_staff'), wrap(async (req, res) => {
  const b = req.body || {};
  const { fullName, role, phone, permissions } = staffInput(b);
  const email = String(b.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad('Enter a valid email address.');
  if (!emailConfigured()) {
    throw bad('Email sending is not set up on this server, so an invitation cannot be delivered. Create the account with a username and temporary password instead.');
  }
  if (await User.findOne({ where: { email } })) throw bad('An account with that email already exists.');
  const resetToken = crypto.randomBytes(32).toString('hex');
  const user = await User.create({
    name: fullName, email, phone, role, permissions, status: 'pending',
    password: crypto.randomBytes(24).toString('hex'),
    resetToken, resetTokenExpiry: new Date(Date.now() + 72 * 60 * 60 * 1000),
  });
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  try {
    await sendPasswordResetEmail(email, `${clientUrl}/hub/reset-password?token=${resetToken}&email=${encodeURIComponent(email)}`);
  } catch (err) {
    await user.destroy();
    throw bad(`The invitation email could not be sent (${err.message}). Nothing was created.`);
  }
  await hubLog(req, 'Staff invited', 'Staff & Permissions', String(user.id), `${fullName} <${email}> invited as ${role}`);
  res.status(201).json({ ok: true, userId: String(user.id) });
}));

router.post('/staff/:id/reset-password', need('admin.manage_staff'), wrap(async (req, res) => {
  const user = await findStaff(req.params.id);
  const password = String(req.body?.password || '').trim() || newTemporaryPassword();
  const problem = passwordProblem(password);
  if (problem) throw bad(problem);
  user.password = password;          // hashed by the model hook
  user.mustChangePassword = true;
  user.passwordChangedAt = new Date(); // signs the account out everywhere
  await user.save();
  await hubLog(req, 'Staff password reset', 'Staff & Permissions', String(user.id),
    'Temporary password issued; change required at next sign-in');
  res.json({ ok: true, temporaryPassword: password });
}));

router.patch('/staff/:id/status', need('admin.manage_staff'), wrap(async (req, res) => {
  const status = req.body?.status;
  if (!STATUSES.includes(status)) throw bad('Choose a valid status.');
  const user = await findStaff(req.params.id);
  notSelf(req, user, 'account status');
  const from = user.status || 'active';
  if (from === status) return res.json({ ok: true });
  if (user.role === 'admin' && from === 'active' && status !== 'active' && (await activeAdminCount()) <= 1) {
    throw bad('The last active Admin cannot be switched off.');
  }
  const patch = { status };
  if (status === 'active' && from === 'pending') Object.assign(patch, { approvedBy: req.user.id, approvedAt: new Date() });
  await user.update(patch);
  const action = status === 'active'
    ? from === 'pending' ? 'Account approved' : 'Account reactivated'
    : status === 'suspended' ? 'Account suspended'
      : status === 'deactivated' ? 'Account deactivated' : 'Account set to pending';
  await hubLog(req, action, 'Staff & Permissions', String(user.id), `${user.email || user.username || user.id}: ${from} → ${status}`);
  res.json({ ok: true });
}));

router.patch('/staff/:id/role', need('admin.change_permissions', 'admin.manage_staff'), wrap(async (req, res) => {
  const role = req.body?.role;
  if (!STAFF_ROLES.includes(role)) throw bad('Choose a valid role.');
  const user = await findStaff(req.params.id);
  notSelf(req, user, 'role');
  if (user.role === role) return res.json({ ok: true });
  if (role === 'admin' && req.user.role !== 'admin') throw bad('Only an Admin can make someone an Admin.', 403);
  if (user.role === 'admin' && (user.status || 'active') === 'active' && (await activeAdminCount()) <= 1) {
    throw bad('The last active Admin cannot be downgraded.');
  }
  const from = user.role;
  await user.update({ role });
  await hubLog(req, 'Permissions changed', 'Staff & Permissions', String(user.id), `Role: ${from} → ${role}`);
  res.json({ ok: true });
}));

router.put('/staff/:id/permissions', need('admin.change_permissions'), wrap(async (req, res) => {
  const user = await findStaff(req.params.id);
  notSelf(req, user, 'permissions');
  const current = new Set(hubKeys(user.permissions));
  const target = new Set(hubKeys(req.body?.permissions));
  const added = [...target].filter((p) => !current.has(p));
  const removed = [...current].filter((p) => !target.has(p));
  if (!added.length && !removed.length) return res.json({ added, removed });
  await user.update({ permissions: [...otherKeys(user.permissions), ...target] });
  await hubLog(req, 'Permissions changed', 'Staff & Permissions', String(user.id),
    `Granted: ${added.join(', ') || 'none'} · Revoked: ${removed.join(', ') || 'none'}`);
  res.json({ added, removed });
}));

// ════════════════════════════════════════════════════════════════════
// Activity log
// ════════════════════════════════════════════════════════════════════
function describe(details) {
  if (!details) return null;
  if (typeof details === 'string') return details.slice(0, 500);
  if (details.description) return String(details.description);
  return JSON.stringify(details).slice(0, 500);
}

router.get('/activity', need('admin.view_audit', 'admin.manage_staff'), wrap(async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), 1000);
  const rows = await ActivityLog.findAll({
    order: [['createdAt', 'DESC'], ['id', 'DESC']],
    limit,
    include: [{ model: User, as: 'actor', attributes: ['name', 'email', 'username'] }],
  });
  res.set('Cache-Control', 'no-store');
  res.json(rows.map((r) => ({
    id: String(r.id),
    createdAt: r.createdAt,
    staffName: r.actor ? r.actor.name || r.actor.username || r.actor.email : null,
    action: r.action,
    module: r.entityType || 'System',
    recordId: r.details?.recordId ?? (r.entityId != null ? String(r.entityId) : null),
    description: describe(r.details) || r.reason || null,
  })));
}));

// ════════════════════════════════════════════════════════════════════
// Settings
// ════════════════════════════════════════════════════════════════════
const SETTING_LABELS = {
  businessName: 'Business name', logoUrl: 'Logo URL', location: 'Location', phone: 'Phone', currency: 'Currency',
  invoicePrefix: 'Order / invoice prefix', customerPrefix: 'Customer prefix', defaultOrderStatus: 'Default order status',
  defaultDeliveryCharge: 'Default delivery charge', courierNames: 'Courier names', labelSize: 'Default label size',
  defaultReorderLevel: 'Default reorder level', lowStockRule: 'Stock warning threshold',
  reorderMultiplier: 'Reorder multiplier', invoiceFooter: 'Invoice footer', labelFooter: 'Label footer',
  categories: 'Categories', sizes: 'Sizes', colours: 'Colours', paymentMethods: 'Payment methods',
  paymentHolders: 'Payment holder options', deliveryPaymentModes: 'Delivery payment modes',
};
const PREFIX_RE = /^[A-Z][A-Z0-9]{1,7}$/;

function normaliseSettings(input, previous) {
  const next = { ...previous };
  const errors = {};
  for (const field of Object.keys(SETTING_KEYS)) {
    if (input[field] === undefined) continue;
    const fallback = SETTINGS_DEFAULTS[field];
    if (Array.isArray(fallback)) {
      const raw = Array.isArray(input[field]) ? input[field] : String(input[field]).split(/[\n,]/);
      const items = [];
      for (const v of raw.map((x) => String(x).trim()).filter(Boolean)) {
        if (!items.some((i) => i.toLowerCase() === v.toLowerCase())) items.push(v.slice(0, 60));
      }
      next[field] = items;
    } else if (typeof fallback === 'number') {
      next[field] = Number(input[field]);
    } else {
      next[field] = String(input[field] ?? '').trim();
    }
  }
  if (!next.businessName) errors.businessName = 'Business name is required.';
  if (!next.location) errors.location = 'Location is required.';
  if (!/^[0-9+\-\s]{6,20}$/.test(next.phone)) errors.phone = 'Enter a valid phone number.';
  if (!/^[A-Z]{2,5}$/.test(next.currency)) errors.currency = 'Use a currency code such as QAR.';
  if (!PREFIX_RE.test(next.invoicePrefix)) errors.invoicePrefix = 'Use 2–8 capital letters or digits, starting with a letter.';
  if (!PREFIX_RE.test(next.customerPrefix)) errors.customerPrefix = 'Use 2–8 capital letters or digits, starting with a letter.';
  if (!next.defaultOrderStatus) errors.defaultOrderStatus = 'Choose a default order status.';
  if (!Number.isFinite(next.defaultDeliveryCharge) || next.defaultDeliveryCharge < 0) errors.defaultDeliveryCharge = 'Enter 0 or more.';
  for (const f of ['defaultReorderLevel', 'lowStockRule']) {
    if (!Number.isInteger(next[f]) || next[f] < 0) errors[f] = 'Enter a whole number of 0 or more.';
  }
  if (!Number.isFinite(next.reorderMultiplier) || next.reorderMultiplier < 1) errors.reorderMultiplier = 'Enter 1 or more.';
  if (next.logoUrl && !/^https:\/\/[^\s]+$/i.test(next.logoUrl)) {
    errors.logoUrl = 'Use a full https:// image address, or leave it empty for the FEMNIA logo.';
  }
  if (!['100x130', '100x150'].includes(next.labelSize)) errors.labelSize = 'Choose a label size.';
  for (const f of ['invoiceFooter', 'labelFooter']) if (next[f].length > 200) errors[f] = 'Keep the footer under 200 characters.';
  for (const f of ['courierNames', 'categories', 'sizes', 'colours', 'paymentMethods', 'paymentHolders', 'deliveryPaymentModes']) {
    if (!next[f].length) errors[f] = 'Add at least one entry.';
  }
  return { next, errors };
}

const asText = (v) => (Array.isArray(v) ? v.join(', ') : String(v));

/** Only changed keys are written; each change goes into the activity log. */
router.put('/settings', need('admin.settings'), wrap(async (req, res) => {
  const previous = await loadAppSettings();
  const { next, errors } = normaliseSettings(req.body || {}, previous);
  if (Object.keys(errors).length) {
    return res.status(400).json({ message: Object.values(errors)[0], errors });
  }
  const changes = Object.keys(SETTING_KEYS)
    .filter((f) => asText(previous[f]) !== asText(next[f]))
    .map((f) => ({ field: f, key: SETTING_KEYS[f], from: asText(previous[f]), to: asText(next[f]) }));
  for (const c of changes) await Setting.upsert({ key: c.key, value: c.to.slice(0, 2000) });
  for (const c of changes) {
    await hubLog(req, 'Setting updated', 'Settings', c.key, `${SETTING_LABELS[c.field]}: "${c.from || '—'}" → "${c.to || '—'}"`);
  }
  res.json({ changed: changes.length, settings: await loadAppSettings() });
}));

// ════════════════════════════════════════════════════════════════════
// Backup (export only — reads, never writes)
// ════════════════════════════════════════════════════════════════════
const IN_KINDS = ['opening', 'stock_in', 'return', 'cancel_restock', 'import', 'transfer_in', 'purchase'];
const OUT_KINDS = ['stock_out', 'wastage', 'supplier_return', 'transfer_out'];

const plain = (row) => (row && typeof row.get === 'function' ? row.get({ plain: true }) : row);

router.get('/backup', need('admin.settings'), wrap(async (req, res) => {
  const [skus, movements, orders, returns, customers, expenses, assets, activity, orderAudit, productAudit, staffUsers] = await Promise.all([
    listSkus({ showCost: true }),
    StockMovement.findAll({ order: [['createdAt', 'ASC'], ['id', 'ASC']], raw: true }),
    Order.findAll({ order: [['createdAt', 'ASC']] }),
    OrderReturn.findAll({ order: [['createdAt', 'ASC']], raw: true }),
    User.findAll({ where: { role: 'customer' }, attributes: { exclude: ['password', 'resetToken', 'resetTokenExpiry'] }, raw: true }),
    Expense.findAll({ order: [['createdAt', 'ASC']], raw: true }),
    FixedAsset.findAll({ order: [['createdAt', 'ASC']], raw: true }),
    ActivityLog.findAll({ order: [['createdAt', 'ASC']], raw: true }),
    OrderAuditLog.findAll({ order: [['createdAt', 'ASC']], raw: true }),
    ProductAuditLog.findAll({ order: [['createdAt', 'ASC']], raw: true }),
    User.findAll({ where: { role: STAFF_ROLES }, attributes: ['id', 'name', 'email', 'username'], raw: true }),
  ]);
  const [hubEntries, liabilities, reimbursements] = await Promise.all([
    HubExpenseEntry.findAll({ order: [['txnDate', 'ASC'], ['id', 'ASC']], raw: true }),
    HubLiability.findAll({ order: [['createdAt', 'ASC']], raw: true }),
    HubReimbursement.findAll({ order: [['paidOn', 'ASC'], ['id', 'ASC']], raw: true }),
  ]);
  const settings = await loadAppSettings();
  const views = orders.map((o) => toSalesOrder(o, { customerPrefix: settings.customerPrefix }));
  const productRows = skus.map((s) => ({
    key: s.key, sku: s.sku, productCode: s.productCode, name: s.name, category: s.category, size: s.size, color: s.color,
    costPrice: s.costPrice, sellingPrice: s.sellingPrice, reorderLevel: s.reorderLevel, rack: s.rack,
    shelfLocation: s.shelfLocation, supplier: s.supplier, isActive: s.isActive,
  }));
  const inventoryRows = skus.map((s) => ({
    key: s.key, sku: s.sku, name: s.name, openingStock: s.openingStock, stockIn: s.stockIn, autoStockOut: s.autoStockOut,
    manualStockOut: s.manualStockOut, adjustmentNet: s.adjustmentNet, currentStock: s.currentStock, stockStatus: s.stockStatus,
  }));
  const names = new Map(staffUsers.map((u) => [u.id, u.name || u.username || u.email]));
  const sheets = [
    { name: 'Products', rows: productRows },
    { name: 'Inventory', rows: inventoryRows },
    { name: 'Stock In', rows: movements.filter((m) => IN_KINDS.includes(m.kind)) },
    { name: 'Stock Out', rows: movements.filter((m) => OUT_KINDS.includes(m.kind)) },
    { name: 'Stock Adjustments', rows: movements.filter((m) => !IN_KINDS.includes(m.kind) && !OUT_KINDS.includes(m.kind) && !['sale', 'sale_void'].includes(m.kind)) },
    { name: 'Orders', rows: views.map(({ items, ...header }) => header) },
    { name: 'Order Items', rows: views.flatMap((v) => v.items.map((i) => ({ orderId: v.id, ...i }))) },
    { name: 'Returns', rows: returns },
    { name: 'Customers', rows: customers },
    {
      name: 'Payments',
      rows: views.map((v) => ({
        orderId: v.id, orderDate: v.orderDate, channel: v.channel, paymentMode: v.paymentMode, paymentStatus: v.paymentStatus,
        grandTotal: v.grandTotal, amountReceived: v.amountReceived, remainingBalance: v.remainingBalance,
        paymentDate: v.paymentDate, paymentReference: v.paymentReference, paymentHeldIn: v.paymentHeldIn,
      })),
    },
    { name: 'Expenses', rows: expenses },
    { name: 'Assets', rows: assets },
    { name: 'Hub Expense Entries', rows: hubEntries.filter((e) => e.entryType === 'expense') },
    { name: 'Hub Asset Entries', rows: hubEntries.filter((e) => e.entryType === 'asset') },
    { name: 'Liabilities', rows: liabilities },
    { name: 'Reimbursements', rows: reimbursements },
    {
      name: 'Audit Logs',
      rows: [
        ...activity.map((a) => ({ source: 'Activity', createdAt: a.createdAt, staff: names.get(a.userId) ?? a.userId, action: a.action, module: a.entityType, details: a.details })),
        ...orderAudit.map((a) => ({ source: 'Order', createdAt: a.createdAt, staff: a.staffName, action: a.field, module: `Order ${a.orderId}`, details: `${a.oldValue ?? ''} → ${a.newValue ?? ''}` })),
        ...productAudit.map((a) => ({ source: 'Product', createdAt: a.createdAt, staff: names.get(a.changedBy) ?? a.changedBy, action: a.field, module: `Product ${a.productId}`, details: `${a.oldValue ?? ''} → ${a.newValue ?? ''}` })),
      ].sort((x, y) => new Date(x.createdAt) - new Date(y.createdAt)),
    },
  ].map((s) => ({ name: s.name, rows: s.rows.map(plain) }));
  await hubLog(req, 'Backup exported', 'Settings', null, sheets.map((s) => `${s.name}: ${s.rows.length}`).join(', '));
  res.set('Cache-Control', 'no-store');
  res.json({ sheets });
}));

// ════════════════════════════════════════════════════════════════════
// Replace Product Catalogue (archive + zero stock; never deletes; reversible)
// ════════════════════════════════════════════════════════════════════
const REPLACE_CONFIRM_PHRASE = 'REPLACE INVENTORY';

async function catalogueRows() {
  const skus = await listSkus({ showCost: false });
  const linked = new Set();
  const orders = await Order.findAll({ attributes: ['items'], raw: false });
  for (const o of orders) {
    for (const it of Array.isArray(o.items) ? o.items : []) {
      if (it.productId) linked.add(String(it.productId));
    }
  }
  return skus.map((s) => ({
    key: s.key, productId: s.key.split(':')[0], sku: s.sku, name: s.name, category: s.category || null,
    currentStock: s.currentStock, isActive: s.isActive, linkedToOrders: linked.has(s.key.split(':')[0]),
  }));
}

function previewOf(rows) {
  return {
    rows: rows.map(({ productId, ...r }) => r),
    totals: {
      products: rows.length,
      active: rows.filter((r) => r.isActive).length,
      alreadyArchived: rows.filter((r) => !r.isActive).length,
      unitsToZero: rows.reduce((s, r) => s + (r.currentStock > 0 ? r.currentStock : 0), 0),
      linkedToOrders: rows.filter((r) => r.linkedToOrders).length,
    },
  };
}

const adminOnly = (req, res, next) => (req.user.role === 'admin'
  ? next()
  : res.status(403).json({ message: 'Only an Admin can replace the product catalogue.' }));

router.get('/catalogue-replace/preview', adminOnly, wrap(async (req, res) => {
  res.json(previewOf(await catalogueRows()));
}));

router.post('/catalogue-replace', adminOnly, wrap(async (req, res) => {
  const b = req.body || {};
  if (String(b.confirmPhrase || '').trim().toUpperCase() !== REPLACE_CONFIRM_PHRASE) {
    throw bad(`Type ${REPLACE_CONFIRM_PHRASE} exactly to continue.`);
  }
  if (!String(b.backupFilename || '').trim()) throw bad('Download a fresh full backup first — this step is required.');
  const rows = await catalogueRows();
  if (!rows.length) throw bad('There are no products to archive.');
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const reference = `RPL-${stamp}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
  const note = `${reference}: catalogue replacement (backup ${String(b.backupFilename).slice(0, 120)})${b.reason ? ` · ${String(b.reason).slice(0, 200)}` : ''}`;
  const locationId = await stockLocationId();

  const zeroed = [];
  const archivedProducts = [];
  const t = await sequelize.transaction();
  try {
    for (const r of rows) {
      const [pid, vi] = r.key.split(':');
      const variantIndex = vi === 'base' ? null : parseInt(vi, 10);
      const current = await skuStock(parseInt(pid, 10), variantIndex, t);
      if (current !== 0) {
        await applyStockDelta({
          productId: parseInt(pid, 10), variantIndex, delta: -current, transaction: t, locationId,
          ctx: {
            kind: 'adjustment', reference, reason: 'Opening Balance Correction', createdBy: req.user.id,
            notes: `${note} · stock reset to 0 before new catalogue import`, idempotencyKey: `${reference}-${r.key}`,
          },
        });
        zeroed.push({ key: r.key, sku: r.sku, from: current });
      }
    }
    const products = await Product.findAll({ where: { active: true }, transaction: t, lock: t.LOCK.UPDATE });
    for (const p of products) {
      await p.update({ active: false }, { transaction: t });
      archivedProducts.push(p.id);
    }
    if (archivedProducts.length) {
      await ProductAuditLog.bulkCreate(archivedProducts.map((productId) => ({
        productId, field: 'Active status', oldValue: 'true', newValue: 'false', changedBy: req.user.id,
      })), { transaction: t });
    }
    await t.commit();
  } catch (err) {
    if (!t.finished) await t.rollback();
    throw err;
  }
  await recomputeAfter(zeroed.map((z) => parseInt(z.key, 10)));
  const run = {
    reference,
    archivedProductIds: archivedProducts,
    archivedSkus: rows.filter((r) => r.isActive).map((r) => r.sku),
    zeroedSkus: zeroed,
    unitsRemoved: zeroed.reduce((s, z) => s + z.from, 0),
    preservedLinkedToOrders: rows.filter((r) => r.linkedToOrders).length,
  };
  await ActivityLog.create({
    userId: req.user.id, action: 'Product catalogue replaced', entityType: 'Products', ip: req.ip,
    details: { recordId: reference, description: `${archivedProducts.length} product(s) archived, ${run.unitsRemoved} unit(s) zeroed`, run },
  });
  res.json(run);
}));

router.post('/catalogue-replace/:reference/rollback', adminOnly, wrap(async (req, res) => {
  const reference = String(req.params.reference);
  // Matched in JS: JSON path queries differ between MySQL versions.
  const candidates = await ActivityLog.findAll({
    where: { action: 'Product catalogue replaced', entityType: 'Products' },
    order: [['createdAt', 'DESC']],
    limit: 200,
  });
  const found = candidates.find((a) => a.details?.run?.reference === reference);
  if (!found) throw bad('That catalogue replacement could not be found.', 404);
  const already = await ActivityLog.findOne({
    where: { action: 'Product catalogue replacement rolled back', entityType: 'Products', reason: reference },
  });
  if (already) throw bad('This catalogue replacement has already been rolled back.');
  const { run } = found.details;
  const locationId = await stockLocationId();
  const t = await sequelize.transaction();
  let restored = 0;
  try {
    for (const z of run.zeroedSkus || []) {
      const [pid, vi] = z.key.split(':');
      const variantIndex = vi === 'base' ? null : parseInt(vi, 10);
      const now = await skuStock(parseInt(pid, 10), variantIndex, t);
      if (now === z.from) continue;
      await applyStockDelta({
        productId: parseInt(pid, 10), variantIndex, delta: z.from - now, transaction: t, locationId,
        ctx: {
          kind: 'adjustment', reference: `${reference}-UNDO`, reason: 'Data Entry Correction', createdBy: req.user.id,
          notes: `${reference}: catalogue replacement rolled back — stock restored`, idempotencyKey: `${reference}-UNDO-${z.key}`,
        },
      });
      restored += 1;
    }
    const ids = run.archivedProductIds || [];
    if (ids.length) {
      await Product.update({ active: true }, { where: { id: { [Op.in]: ids } }, transaction: t });
      await ProductAuditLog.bulkCreate(ids.map((productId) => ({
        productId, field: 'Active status', oldValue: 'false', newValue: 'true', changedBy: req.user.id,
      })), { transaction: t });
    }
    await t.commit();
  } catch (err) {
    if (!t.finished) await t.rollback();
    throw err;
  }
  await recomputeAfter((run.zeroedSkus || []).map((z) => parseInt(z.key, 10)));
  await ActivityLog.create({
    userId: req.user.id, action: 'Product catalogue replacement rolled back', entityType: 'Products', reason: reference, ip: req.ip,
    details: { recordId: reference, description: `${(run.archivedProductIds || []).length} product(s) reactivated, ${restored} stock quantit(ies) restored.` },
  });
  res.json({ ok: true, reactivated: (run.archivedProductIds || []).length, restored });
}));

export default router;
