import * as XLSX from 'xlsx';
import { Op } from 'sequelize';
import sequelize from '../config/database.js';
import {
  ActivityLog, Counter, Expense, ExpenseCategory, FixedAsset, HubExpenseEntry, HubLiability, HubReimbursement, Order,
  OrderAuditLog, OrderReturn, ProductAuditLog, StockMovement, User, writeCashTxn,
} from '../models/index.js';
import { localDate } from '../utils/dates.js';
import { HUB_ROLES } from './permissions.js';
import { loadAppSettings } from './settings.js';
import {
  applyStockDelta, listSkus, normalizeProductCode, recomputeAfter, skuStock, stockLocationId, usedIdentifiers,
} from './catalog.js';
import {
  SALES_ORDER_STATUSES, SALES_PAYMENT_METHODS, SALES_PAYMENT_STATUSES, normalizePhone, round2, syncLegacy,
} from './sales.js';
import { createSkuGroup } from '../routes/hubCatalog.js';
import { LEGACY_METHOD } from '../routes/hubSales.js';
import {
  ASSET_CATEGORY, COMPANY_FUNDING_SOURCES, EXPENSE_METHOD, METHOD_DEFAULT_SOURCE, PAYMENT_METHODS, PERSONAL_FUNDING_SOURCE,
  accountForSource,
} from '../routes/hubFinance.js';

/**
 * FEMNIA data import: a workbook in the FEMNIA Hub backup layout (the
 * client's previous system exports exactly this, and the template download is
 * the same layout with example rows) → our products, stock ledger, customers,
 * orders, returns, expenses, assets, liabilities, reimbursements and audit
 * history.
 *
 * All of it runs in ONE transaction: a dry run (the default) rolls back and
 * only reports, and a real run commits only when no row has an error — a
 * migration is never half applied. Records that already exist (same SKU,
 * expense reference, movement reference) are skipped, so the same file can be
 * imported again without doubling anything. An order that already exists is
 * brought up to date from a newer backup (see refreshOrder).
 *
 * Stock is rebuilt as a ledger, oldest first: opening stock, Stock In / Out,
 * adjustments and one sale per line of every confirmed order. For SKUs this
 * import creates, the result is then checked against the Inventory sheet's
 * current_stock and any difference booked as a reconciliation adjustment.
 *
 * Historical money is posted without the no-overdraft rule (the old system
 * kept no cash balances): the report lists what each cash account was
 * debited, so its opening balance can be set to match reality.
 */

// Sheet → columns, in the old system's order. The template is built from this.
export const SHEETS = {
  Products: ['sku', 'name', 'rack', 'category', 'size', 'color', 'opening_stock', 'cost_price', 'selling_price_qar',
    'selling_price_inr', 'reorder_level', 'shelf_location', 'supplier', 'image_url', 'created_at', 'updated_at', 'notes',
    'is_active', 'description', 'design_model', 'brand', 'import_batch_id', 'product_code', 'batch_number', 'source_country',
    'wholesaler'],
  Inventory: ['sku', 'name', 'rack', 'category', 'size', 'color', 'opening_stock', 'cost_price', 'selling_price_qar',
    'selling_price_inr', 'reorder_level', 'shelf_location', 'supplier', 'image_url', 'notes', 'is_active', 'created_at',
    'updated_at', 'stock_in', 'auto_stock_out', 'manual_stock_out', 'adjustment_net', 'current_stock', 'description',
    'design_model', 'brand', 'product_code'],
  'Stock In': ['id', 'reference', 'txn_date', 'sku', 'quantity', 'supplier', 'cost_price', 'notes', 'created_by',
    'created_at', 'invoice_reference', 'received_by', 'rack', 'shelf_location', 'idempotency_key', 'import_batch_id',
    'batch_number', 'source_country', 'wholesaler'],
  'Stock Out': ['id', 'reference', 'txn_date', 'sku', 'quantity', 'reason', 'supplier', 'reference_note', 'handled_by',
    'notes', 'created_by', 'created_at'],
  'Stock Adjustments': ['id', 'reference', 'txn_date', 'sku', 'system_quantity', 'counted_quantity', 'difference', 'reason',
    'notes', 'idempotency_key', 'created_by', 'created_at'],
  Orders: ['id', 'customer_id', 'customer_name', 'phone', 'area', 'address', 'order_date', 'subtotal', 'delivery_charge',
    'grand_total', 'payment_mode', 'payment_status', 'status', 'delivery_date', 'courier', 'tracking_number',
    'delivery_notes', 'idempotency_key', 'confirmed_at', 'created_by', 'created_at', 'updated_at', 'fulfilment_method',
    'pickup_date', 'pickup_time', 'pickup_notes', 'amount_received', 'payment_date', 'payment_time', 'payment_reference',
    'payment_notes', 'payment_held_in', 'payment_holder_details', 'cancelled_at', 'restocked_at', 'landmark', 'assigned_to',
    'assigned_at', 'assigned_by', 'channel'],
  'Order Items': ['id', 'order_id', 'sku', 'name', 'size', 'color', 'quantity', 'unit_price', 'discount', 'line_total',
    'returned_qty', 'created_at', 'is_consignment', 'consignment_partner', 'consignment_product_cost',
    'consignment_op_percent', 'consignment_op_min', 'consignment_other_cost'],
  Returns: ['id', 'order_id', 'sku', 'quantity', 'reason', 'restock', 'notes', 'created_by', 'created_at'],
  Customers: ['id', 'name', 'phone', 'area', 'address', 'notes', 'created_at', 'updated_at', 'alt_phone', 'landmark'],
  Payments: ['order_id', 'customer_name', 'phone', 'order_date', 'grand_total', 'amount_received', 'balance', 'payment_mode',
    'payment_status', 'payment_date', 'payment_time', 'payment_reference', 'payment_held_in', 'payment_holder_details',
    'payment_notes', 'order_status'],
  Expenses: ['id', 'entry_type', 'reference_code', 'txn_date', 'category', 'item', 'amount', 'purchase_person', 'payee',
    'payment_method', 'funding_source', 'receipt_reference', 'notes', 'idempotency_key', 'created_by', 'created_at',
    'updated_at', 'purchased_by'],
  Assets: ['id', 'entry_type', 'reference_code', 'txn_date', 'category', 'item', 'amount', 'purchase_person', 'payee',
    'payment_method', 'funding_source', 'receipt_reference', 'notes', 'idempotency_key', 'created_by', 'created_at',
    'updated_at', 'purchased_by'],
  Liabilities: ['id', 'entry_id', 'person', 'amount', 'reimbursed_amount', 'status', 'notes', 'created_by', 'created_at',
    'updated_at'],
  Reimbursements: ['id', 'liability_id', 'paid_on', 'amount', 'payment_method', 'reference', 'notes', 'idempotency_key',
    'created_by', 'created_at'],
  'Audit Logs': ['logged_at', 'source', 'module', 'record', 'action', 'field', 'old_value', 'new_value', 'staff', 'details'],
};

const MAX_LISTED = 300;
const bad = (message, status = 400) => Object.assign(new Error(message), { status });

// ── cell parsing ────────────────────────────────────────────────────
// The old system's export escapes formula-like cells with a leading apostrophe ('-8, '+974…).
const text = (v, max = 400) => {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  return String(v).replace(/^'(?=[=+\-@])/, '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
};
const opt = (v, max) => text(v, max) || null;
/** null for an empty cell, NaN for something that is not a number. */
const num = (v) => {
  if (typeof v === 'number') return v;
  const s = text(v).replace(/[,\s]/g, '').replace(/^(qar|qr)/i, '');
  return s ? Number(s) : null;
};
const bool = (v, fallback) => {
  if (typeof v === 'boolean') return v;
  const s = text(v).toLowerCase();
  if (!s) return fallback;
  if (['true', 'yes', 'y', '1', 'active'].includes(s)) return true;
  if (['false', 'no', 'n', '0', 'inactive'].includes(s)) return false;
  return fallback;
};
/** A Date, null when empty, undefined when unreadable. */
const when = (v) => {
  if (v instanceof Date) return Number.isNaN(v.valueOf()) ? undefined : v;
  const s = text(v);
  if (!s) return null;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T12:00:00` : s);
  return Number.isNaN(d.valueOf()) ? undefined : d;
};
/** YYYY-MM-DD on the store clock, null when empty, undefined when unreadable. */
const day = (v) => {
  const s = v instanceof Date ? '' : text(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = when(v);
  return d ? localDate(d) : d;
};
const upper = (v) => text(v).toUpperCase();

// ── workbook I/O ────────────────────────────────────────────────────
const keyOf = (h) => String(h).trim().toLowerCase().replace(/[\s-]+/g, '_');

/** The known sheets of a workbook as row objects keyed by column name; `_row` is the spreadsheet row. */
export function readWorkbook(buffer) {
  let wb;
  try {
    wb = XLSX.read(buffer, { type: 'buffer', cellDates: true, cellFormula: false });
  } catch (err) {
    throw bad(/password|encrypt/i.test(err.message || '')
      ? 'This file is password protected. Remove the password and upload it again.'
      : 'This file could not be read. Save it as .xlsx and try again.');
  }
  if (wb.vbaraw) throw bad('This workbook contains macros and cannot be imported.');
  const sheets = {};
  for (const name of wb.SheetNames) {
    const canonical = Object.keys(SHEETS).find((k) => k.toLowerCase() === name.trim().toLowerCase());
    if (!canonical) continue;
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '', raw: true });
    sheets[canonical] = rows.map((r, i) => {
      const row = { _row: i + 2 };
      for (const [k, v] of Object.entries(r)) row[keyOf(k)] = v;
      return row;
    });
  }
  return sheets;
}

const TEMPLATE_EXAMPLES = {
  Products: [
    { sku: 'EXAMPLE-KFT-M-BLU', name: 'Floral Kaftan', category: 'Kaftan', size: 'M', color: 'Blue', opening_stock: 5,
      cost_price: 40, selling_price_qar: 95, reorder_level: 2, supplier: 'Dubai Wholesale', created_at: '2026-09-01',
      is_active: 'true', brand: 'FEMNIA', product_code: '9001', batch_number: 'BATCH-1', source_country: 'UAE' },
  ],
  Inventory: [
    { sku: 'EXAMPLE-KFT-M-BLU', name: 'Floral Kaftan', category: 'Kaftan', size: 'M', color: 'Blue', opening_stock: 5,
      cost_price: 40, selling_price_qar: 95, is_active: 'true', stock_in: 3, auto_stock_out: 1, manual_stock_out: 1,
      adjustment_net: 1, current_stock: 7, product_code: '9001' },
  ],
  'Stock In': [
    { reference: 'EXAMPLE-GRN-001', txn_date: '2026-09-05', sku: 'EXAMPLE-KFT-M-BLU', quantity: 2, supplier: 'Dubai Wholesale',
      cost_price: 40, invoice_reference: 'INV-778', received_by: 'Store', created_at: '2026-09-05T10:00:00+03:00' },
  ],
  'Stock Out': [
    { reference: 'EXAMPLE-SO-001', txn_date: '2026-09-06', sku: 'EXAMPLE-KFT-M-BLU', quantity: 1, reason: 'Damaged',
      notes: 'Torn seam', created_at: '2026-09-06T10:00:00+03:00' },
  ],
  'Stock Adjustments': [
    { reference: 'EXAMPLE-ADJ-001', txn_date: '2026-09-07', sku: 'EXAMPLE-KFT-M-BLU', system_quantity: 6, counted_quantity: 7,
      difference: 1, reason: 'Physical Count Correction', created_at: '2026-09-07T10:00:00+03:00' },
  ],
  Orders: [
    { id: 'EXAMPLE-0001', customer_id: 'EXAMPLE-CUS-1', customer_name: 'Aisha', phone: '55112233', area: 'Al Wakrah',
      address: 'Building 4, Flat 8', order_date: '2026-09-08T11:00:00+03:00', subtotal: 95, delivery_charge: 10,
      grand_total: 105, payment_mode: 'Cash', payment_status: 'Paid', status: 'Returned', delivery_date: '2026-09-09',
      confirmed_at: '2026-09-08T11:00:00+03:00', fulfilment_method: 'Delivery', amount_received: 105,
      payment_date: '2026-09-09', payment_held_in: 'Cash in Hand', channel: 'Staff' },
  ],
  'Order Items': [
    { order_id: 'EXAMPLE-0001', sku: 'EXAMPLE-KFT-M-BLU', name: 'Floral Kaftan', size: 'M', color: 'Blue', quantity: 1,
      unit_price: 95, discount: 0, line_total: 95, returned_qty: 1, is_consignment: 'false' },
  ],
  Returns: [
    { order_id: 'EXAMPLE-0001', sku: 'EXAMPLE-KFT-M-BLU', quantity: 1, reason: 'Wrong size', restock: 'true',
      created_at: '2026-09-10T10:00:00+03:00' },
  ],
  Customers: [
    { id: 'EXAMPLE-CUS-1', name: 'Aisha', phone: '55112233', area: 'Al Wakrah', address: 'Building 4, Flat 8',
      notes: 'Prefers evening delivery', created_at: '2026-09-01' },
  ],
  Payments: [
    { order_id: 'EXAMPLE-0001', customer_name: 'Aisha', grand_total: 105, amount_received: 105, balance: 0,
      payment_mode: 'Cash', payment_status: 'Paid', order_status: 'Returned' },
  ],
  Expenses: [
    { id: 'EXAMPLE-E1', entry_type: 'expense', reference_code: 'EXAMPLE-EXP-001', txn_date: '2026-09-02',
      category: 'Packing Material', item: 'Packing covers', amount: 65, purchase_person: 'Nisar', payment_method: 'Cash',
      funding_source: 'Petty Cash', purchased_by: 'Nisar' },
  ],
  Assets: [
    { id: 'EXAMPLE-A1', entry_type: 'asset', reference_code: 'EXAMPLE-AST-001', txn_date: '2026-09-03',
      category: 'Fixtures & Racks', item: 'Storage rack', amount: 1270, purchase_person: 'Nisar', payment_method: 'Cash',
      funding_source: 'Paid Personally', purchased_by: 'Nisar' },
  ],
  Liabilities: [
    { id: 'EXAMPLE-L1', entry_id: 'EXAMPLE-A1', person: 'Nisar', amount: 1270, status: 'pending' },
  ],
  Reimbursements: [
    { id: 'EXAMPLE-R1', liability_id: 'EXAMPLE-L1', paid_on: '2026-09-20', amount: 270, payment_method: 'Cash',
      reference: 'Cash from shop' },
  ],
  'Audit Logs': [
    { logged_at: '2026-09-08T11:00:00+03:00', source: 'Order change', module: 'Orders', record: 'EXAMPLE-0001',
      action: 'Field updated', field: 'Status', old_value: '', new_value: 'Confirmed', staff: 'Nisar' },
  ],
};

const INSTRUCTIONS = [
  ['FEMNIA data import template'],
  [''],
  ['Fill in the sheets you need and leave the others empty. A backup downloaded from the old FEMNIA Hub has exactly this layout and can be imported as it is.'],
  ['Rows whose values start with EXAMPLE- are skipped — delete or overwrite them.'],
  ['Always run Preview first. Nothing is saved unless every row is valid; fix the rows listed as errors and preview again.'],
  ['Records that already exist (same SKU, expense reference, stock reference) are skipped, so a file can be imported twice safely. An order that already exists is updated to match a newer backup (status, payment, delivery, lines, returns) unless it has been changed in this hub since.'],
  [''],
  ['Sheet', 'What it does'],
  ['Products', 'New SKUs. Rows with the same name and category become one product with size/colour variants. opening_stock is the first stock figure.'],
  ['Inventory', 'Optional. current_stock is the stock each NEW SKU must end on; any difference after the history below is booked as a reconciliation adjustment.'],
  ['Stock In / Stock Out / Stock Adjustments', 'Stock history, applied oldest first. References starting CAN- or RET- are cancellation / return restocks.'],
  ['Customers', 'Matched to existing customers by mobile number; otherwise created. Orders point at them through customer_id.'],
  ['Orders + Order Items', 'Sales orders (statuses: ' + SALES_ORDER_STATUSES.join(', ') + '). A confirmed order takes its lines out of stock.'],
  ['Returns', 'Returned lines of imported orders.'],
  ['Payments', 'Reference only — payment details are read from the Orders sheet.'],
  ['Expenses / Assets', 'funding_source: ' + [...COMPANY_FUNDING_SOURCES, PERSONAL_FUNDING_SOURCE].join(', ') + '. Company money is paid from the matching cash account; Paid Personally opens a liability.'],
  ['Liabilities / Reimbursements', 'Money owed to staff who paid personally, and the repayments (entry_id / liability_id point at the id column).'],
  ['Audit Logs', 'History only (Activity, Order change, Product change).'],
];

/** The import template: an Instructions sheet plus every sheet with its columns and one example row. */
export function templateWorkbook() {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(INSTRUCTIONS), 'Instructions');
  for (const [name, columns] of Object.entries(SHEETS)) {
    const rows = (TEMPLATE_EXAMPLES[name] || []).map((r) => columns.map((c) => r[c] ?? ''));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([columns, ...rows]), name);
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// ── report ──────────────────────────────────────────────────────────
function newReport() {
  const counts = {};
  const report = {
    errors: [],
    warnings: [],
    errorCount: 0,
    warningCount: 0,
    examplesSkipped: 0,
    counts,
    cash: {},
    unmatchedStaff: new Set(),
    error(sheet, row, message) {
      report.errorCount += 1;
      if (report.errors.length < MAX_LISTED) report.errors.push({ sheet, row: row ?? null, message });
    },
    warn(sheet, row, message) {
      report.warningCount += 1;
      if (report.warnings.length < MAX_LISTED) report.warnings.push({ sheet, row: row ?? null, message });
    },
    count(sheet, what, n = 1) {
      counts[sheet] = counts[sheet] || {};
      counts[sheet][what] = (counts[sheet][what] || 0) + n;
    },
  };
  return report;
}

const isExample = (row) => Object.entries(row).some(([k, v]) => k !== '_row' && /^EXAMPLE-/i.test(text(v)));

function rowsOf(sheets, name, report) {
  return (sheets[name] || []).filter((r) => {
    if (Object.entries(r).every(([k, v]) => k === '_row' || !text(v))) return false;
    if (isExample(r)) {
      report.examplesSkipped += 1;
      return false;
    }
    return true;
  });
}

// ── steps ───────────────────────────────────────────────────────────

/**
 * Staff in the old system are UUIDs. Their names come from the audit log:
 * on a Login row the record IS the person; other rows about an account
 * ("Staff invited", "Account approved") carry the admin who acted, so they
 * only count when the person never logged in. A name then matches one of our
 * hub accounts by name or username. Unmatched people fall back to the importer.
 */
async function loadStaff(ctx) {
  const names = new Map();
  const fallback = new Map();
  for (const a of ctx.sheets['Audit Logs'] || []) {
    const id = text(a.record);
    const name = text(a.staff, 120);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(id) || !name) continue;
    const into = /^log ?in$/i.test(text(a.action)) ? names : fallback;
    if (!into.has(id)) into.set(id, name);
  }
  for (const [id, name] of fallback) if (!names.has(id)) names.set(id, name);
  const users = await User.findAll({ where: { role: HUB_ROLES }, attributes: ['id', 'name', 'username', 'role'] });
  const byName = new Map();
  for (const u of users) {
    for (const k of [u.name, u.username].filter(Boolean).map((s) => s.trim().toLowerCase())) {
      const prev = byName.get(k);
      byName.set(k, prev === undefined || prev?.id === u.id ? u : null);   // ambiguous → no match
    }
  }
  ctx.staffName = (raw) => {
    const v = text(raw, 120);
    return names.get(v) || (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(v) ? null : v || null);
  };
  ctx.staffUser = (raw) => {
    const name = ctx.staffName(raw);
    if (!name) return null;
    const u = byName.get(name.toLowerCase());
    if (!u) ctx.report.unmatchedStaff.add(name);
    return u || null;
  };
  ctx.createdBy = (raw) => ctx.staffUser(raw)?.id ?? ctx.userId;
}

async function importCustomers(ctx) {
  const { report, t } = ctx;
  ctx.customers = new Map();   // their id → our User id
  const existing = await User.findAll({ where: { role: 'customer' }, attributes: ['id', 'name', 'phone', 'altPhone'], transaction: t });
  const byPhone = new Map();
  // Placeholder numbers can't identify anyone alone; name + the same placeholder finds an earlier import's row.
  const placeholderKey = (name, phone) => `${text(name).toLowerCase()}|${text(phone)}`;
  const byPlaceholder = new Map();
  for (const u of existing) {
    for (const p of [u.phone, u.altPhone]) if (normalizePhone(p)) byPhone.set(normalizePhone(p), u.id);
    if (normalizePhone(u.phone).length < 6) byPlaceholder.set(placeholderKey(u.name, u.phone), u.id);
  }
  const seen = new Set();
  for (const r of rowsOf(ctx.sheets, 'Customers', report)) {
    const id = text(r.id, 60);
    const name = text(r.name, 120);
    const phone = text(r.phone, 24);
    if (!name) { report.error('Customers', r._row, 'Customer name is required.'); continue; }
    if (id && seen.has(id)) { report.error('Customers', r._row, `Customer id ${id} appears twice.`); continue; }
    if (id) seen.add(id);
    // Placeholder numbers ("000") are kept as given but never matched on.
    const usable = normalizePhone(phone).length >= 6;
    if (!usable) report.warn('Customers', r._row, `${name}: mobile number "${phone}" is not a real number — kept as given.`);
    const match = usable ? byPhone.get(normalizePhone(phone)) : byPlaceholder.get(placeholderKey(name, phone));
    if (match) {
      if (id) ctx.customers.set(id, match);
      report.count('Customers', 'matched');
      continue;
    }
    const createdAt = when(r.created_at) || new Date();
    const altPhone = text(r.alt_phone, 24) || null;
    const user = await User.create({
      name, phone, altPhone, area: opt(r.area, 80), address: opt(r.address), landmark: opt(r.landmark, 200),
      customerNotes: opt(r.notes), role: 'customer', createdAt,
    }, { transaction: t });
    if (usable) byPhone.set(normalizePhone(phone), user.id);
    if (altPhone && normalizePhone(altPhone)) byPhone.set(normalizePhone(altPhone), user.id);
    if (id) ctx.customers.set(id, user.id);
    report.count('Customers', 'created');
  }
}

async function importProducts(ctx) {
  const { report, t } = ctx;
  // Existing SKUs (read before anything is written).
  ctx.skus = new Map();
  for (const s of await listSkus({ showCost: true })) {
    ctx.skus.set(s.sku.toUpperCase(), {
      productId: s.productId, variantIndex: s.variantIndex, sku: s.sku, name: s.name, size: s.size, color: s.color,
      category: s.category, costPrice: s.costPrice, image: s.imageUrl, created: false,
    });
  }
  ctx.targets = new Map();   // sku → current_stock the import must end on
  ctx.events = [];           // stock movements, applied oldest first after orders exist

  // Products rows, with Inventory rows filling in SKUs (and current stock) the Products sheet lacks.
  const inventory = new Map(rowsOf(ctx.sheets, 'Inventory', report).map((r) => [upper(r.sku), r]));
  const rows = rowsOf(ctx.sheets, 'Products', report).map((r) => ({ ...r, _sheet: 'Products' }));
  const listed = new Set(rows.map((r) => upper(r.sku)));
  for (const [sku, r] of inventory) if (sku && !listed.has(sku)) rows.push({ ...r, _sheet: 'Inventory' });

  const used = await usedIdentifiers();
  const fileCodes = new Map();
  let nextCode = 0;
  for (const c of used.codes.keys()) if (/^\d{4,6}$/.test(c)) nextCode = Math.max(nextCode, parseInt(c, 10));
  for (const r of rows) if (/^\d{1,6}$/.test(text(r.product_code))) nextCode = Math.max(nextCode, parseInt(text(r.product_code), 10));

  const fresh = [];
  const seen = new Set();
  for (const r of rows) {
    const sheet = r._sheet;
    const sku = upper(r.sku).slice(0, 80);
    const name = text(r.name, 200);
    const category = text(r.category, 80);
    if (!sku) { report.error(sheet, r._row, 'SKU is missing.'); continue; }
    if (seen.has(sku)) { report.error(sheet, r._row, `${sku} appears twice.`); continue; }
    seen.add(sku);
    if (ctx.skus.has(sku)) {
      report.count('Products', 'already existed');
      const target = num(inventory.get(sku)?.current_stock ?? r.current_stock);
      if (Number.isInteger(target)) ctx.targets.set(sku, target);   // checked, never adjusted
      continue;
    }
    if (!name || !category) { report.error(sheet, r._row, `${sku}: name and category are required.`); continue; }
    const cost = num(r.cost_price) ?? 0;
    const price = num(r.selling_price_qar) ?? 0;
    const opening = num(r.opening_stock) ?? 0;
    const reorder = num(r.reorder_level);
    if (Number.isNaN(cost) || cost < 0) { report.error(sheet, r._row, `${sku}: cost price must be a number of 0 or more.`); continue; }
    if (Number.isNaN(price) || price < 0) { report.error(sheet, r._row, `${sku}: selling price must be a number of 0 or more.`); continue; }
    if (!Number.isInteger(opening) || opening < 0) { report.error(sheet, r._row, `${sku}: opening stock must be a whole number of 0 or more.`); continue; }
    let code;
    try {
      code = text(r.product_code) ? normalizeProductCode(text(r.product_code)) : String(++nextCode).padStart(4, '0');
    } catch (err) {
      report.error(sheet, r._row, `${sku}: ${err.message}`);
      continue;
    }
    if (used.codes.has(code)) { report.error(sheet, r._row, `${sku}: product code ${code} is already used by ${used.codes.get(code).sku}.`); continue; }
    if (fileCodes.has(code)) { report.error(sheet, r._row, `${sku}: product code ${code} is also given to ${fileCodes.get(code)}.`); continue; }
    fileCodes.set(code, sku);
    const createdAt = when(r.created_at) || null;
    fresh.push({
      row: r, sheet, sku, name, category, code, cost, price, opening, createdAt,
      reorder: Number.isInteger(reorder) && reorder >= 0 ? reorder : 3,
      size: opt(r.size, 60), color: opt(r.color, 60), active: bool(r.is_active, true),
    });
    const inv = inventory.get(sku);
    const target = num(inv ? inv.current_stock : r.current_stock);
    if (Number.isInteger(target)) ctx.targets.set(sku, target);
  }

  // Same name + category with a size or colour → one product with variants; otherwise its own product.
  const groups = new Map();
  for (const f of fresh) {
    const key = f.size || f.color ? `${f.name.toLowerCase()}|${f.category.toLowerCase()}` : `single|${f.sku}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  }
  for (const list of groups.values()) {
    const first = list[0].row;
    let placed;
    try {
      ({ placed } = await createSkuGroup({
        base: {
          name: list[0].name, category: list[0].category, brand: opt(first.brand, 80), designModel: opt(first.design_model, 120),
          description: opt(first.description, 4000), supplier: opt(first.supplier, 120), notes: opt(first.notes),
          reorderLevel: list[0].reorder, isActive: list.some((f) => f.active), imageUrl: imageOf(first),
          rack: opt(first.rack, 60), shelfLocation: opt(first.shelf_location, 60), batchNumber: opt(first.batch_number, 80),
          sourceCountry: opt(first.source_country, 80), wholesaler: opt(first.wholesaler, 120),
        },
        skus: list.map((f) => ({
          sku: f.sku, productCode: f.code, size: f.size, color: f.color, costPrice: f.cost, sellingPrice: f.price,
          rack: opt(f.row.rack, 60), shelfLocation: opt(f.row.shelf_location, 60), reorderLevel: f.reorder, isActive: f.active,
          batchNumber: opt(f.row.batch_number, 80), sourceCountry: opt(f.row.source_country, 80),
          wholesaler: opt(f.row.wholesaler, 120), notes: opt(f.row.notes), supplier: opt(f.row.supplier, 120),
          imageUrl: imageOf(f.row), description: opt(f.row.description, 4000), designModel: opt(f.row.design_model, 120),
        })),
        transaction: t,
      }));
    } catch (err) {
      if (!err.status) throw err;
      for (const f of list) report.error(f.sheet, f.row._row, `${f.sku}: ${err.message}`);
      continue;
    }
    const oldest = list.map((f) => f.createdAt).filter(Boolean).sort((a, b) => a - b)[0];
    if (oldest) {
      await sequelize.query('UPDATE Products SET createdAt = ? WHERE id = ?', { replacements: [oldest, placed[0].productId], transaction: t });
    }
    for (const { s, productId, variantIndex } of placed) {
      const f = list.find((x) => x.sku === s.sku);
      ctx.skus.set(f.sku, {
        productId, variantIndex, sku: f.sku, name: f.name, size: f.size, color: f.color, category: f.category,
        costPrice: f.cost, image: imageOf(f.row), created: true,
      });
      ctx.touched.add(productId);
      ctx.events.push({
        at: f.createdAt || oldest || new Date(0), sku: f.sku, delta: f.opening,
        ctx: { kind: 'opening', reference: f.sku, unitCost: f.cost, batchNumber: opt(f.row.batch_number, 80),
          sourceCountry: opt(f.row.source_country, 80), wholesaler: opt(f.row.wholesaler, 120), notes: 'Opening stock (imported)' },
      });
      report.count('Products', 'SKUs created');
    }
    report.count('Products', 'products created');
  }
}

// Only https images (as the hub's own import); anything else is dropped.
const imageOf = (r) => (/^https:\/\/[\w.-]+\//i.test(text(r.image_url)) ? text(r.image_url, 500) : null);

async function importOrders(ctx) {
  const { report, t, settings } = ctx;
  ctx.orders = new Map();   // order number → { id, created, updated }
  const rows = rowsOf(ctx.sheets, 'Orders', report);
  const numbers = rows.map((r) => text(r.id, 60)).filter(Boolean);
  const existing = numbers.length ? await Order.findAll({ where: { orderNumber: numbers }, transaction: t }) : [];
  const existingBy = new Map(existing.map((o) => [o.orderNumber, o]));
  for (const o of existing) ctx.orders.set(o.orderNumber, { id: o.id, created: false });

  const itemsBy = groupBy(rowsOf(ctx.sheets, 'Order Items', report), (r) => text(r.order_id, 60));
  const returnsBy = groupBy(rowsOf(ctx.sheets, 'Returns', report), (r) => text(r.order_id, 60));
  // Restocks the Stock In sheet already carries (CAN-FEM-0001-…, RET-FEM-0020-…), per order.
  const restockRefs = rowsOf(ctx.sheets, 'Stock In', report).map((r) => text(r.reference, 80));
  const hasRestock = (prefix, number) => restockRefs.some((ref) => ref.startsWith(`${prefix}-${number}-`));
  const seen = new Set();

  for (const r of rows) {
    const number = text(r.id, 60);
    if (!number) { report.error('Orders', r._row, 'Order id is missing.'); continue; }
    if (seen.has(number)) { report.error('Orders', r._row, `${number} appears twice.`); continue; }
    seen.add(number);
    const prev = existingBy.get(number);
    if (prev?.channel === 'pos') {
      report.count('Orders', 'already existed');
      report.warn('Orders', r._row, `${number} is a till sale here — skipped.`);
      continue;
    }
    const problems = [];
    const notes = [];   // per-order warnings, reported only when the order is written
    const status = text(r.status, 30);
    if (!SALES_ORDER_STATUSES.includes(status)) problems.push(`unknown status "${status}"`);
    const paymentStatus = text(r.payment_status, 20) || 'Pending';
    if (!SALES_PAYMENT_STATUSES.includes(paymentStatus)) problems.push(`unknown payment status "${paymentStatus}"`);
    let paymentMode = text(r.payment_mode, 30) || 'Cash';
    if (!SALES_PAYMENT_METHODS.includes(paymentMode)) {
      notes.push(`${number}: payment mode "${paymentMode}" recorded as Other.`);
      paymentMode = 'Other';
    }
    const pickup = /pickup/i.test(text(r.fulfilment_method));
    const orderDate = when(r.order_date) || when(r.created_at);
    if (!orderDate) problems.push('order_date is missing or unreadable');
    const confirmedAt = when(r.confirmed_at);
    const cancelledAt = when(r.cancelled_at);
    const restockedAt = when(r.restocked_at);
    if ([confirmedAt, cancelledAt, restockedAt].includes(undefined)) problems.push('a date column is unreadable');
    const deliveryCharge = pickup ? 0 : num(r.delivery_charge) ?? 0;
    const grandTotal = num(r.grand_total);
    const received = num(r.amount_received) ?? 0;
    if ([deliveryCharge, grandTotal, received].some((v) => Number.isNaN(v))) problems.push('an amount is not a number');
    let userId = null;
    const customerRef = text(r.customer_id, 60);
    if (customerRef) {
      userId = ctx.customers.get(customerRef) ?? null;
      if (!userId) problems.push(`customer ${customerRef} is not in the Customers sheet`);
    }

    const lines = [];
    for (const it of itemsBy.get(number) || []) {
      const sku = upper(it.sku);
      const s = ctx.skus.get(sku);
      const quantity = num(it.quantity);
      const unitPrice = num(it.unit_price) ?? 0;
      const discount = num(it.discount) ?? 0;
      const returnedQty = num(it.returned_qty) ?? 0;
      if (!s) { problems.push(`line ${sku || '(no SKU)'} is not a known SKU`); continue; }
      if (!Number.isInteger(quantity) || quantity < 1) { problems.push(`line ${sku}: quantity must be at least 1`); continue; }
      if ([unitPrice, discount].some((v) => Number.isNaN(v) || v < 0)) { problems.push(`line ${sku}: price or discount is not valid`); continue; }
      if (!Number.isInteger(returnedQty) || returnedQty < 0 || returnedQty > quantity) { problems.push(`line ${sku}: returned_qty is not valid`); continue; }
      const lineTotal = num(it.line_total);
      const consignment = bool(it.is_consignment, false) ? {
        partner: opt(it.consignment_partner, 120), productCost: round2(num(it.consignment_product_cost) || 0),
        opPercent: round2(num(it.consignment_op_percent) || 0), opMin: round2(num(it.consignment_op_min) || 0),
        otherCost: round2(num(it.consignment_other_cost) || 0),
      } : null;
      lines.push({
        productId: s.productId, variantIndex: s.variantIndex, sku: s.sku, name: text(it.name, 200) || s.name,
        size: opt(it.size, 60) ?? s.size, color: opt(it.color, 60) ?? s.color, category: s.category, image: s.image,
        quantity, price: round2(unitPrice), unitPrice: round2(unitPrice), discount: round2(discount),
        lineTotal: round2(Number.isFinite(lineTotal) ? lineTotal : Math.max(quantity * unitPrice - discount, 0)),
        costPrice: s.costPrice, returnedQty, consignment,
      });
    }
    if (problems.length) { report.error('Orders', r._row, `${number}: ${problems.join('; ')}.`); continue; }
    // The old system can export an order whose lines were lost; its header and payment still happened.
    if (!lines.length) notes.push(`${number}: no lines in Order Items — imported with its total and payment only.`);

    const linesTotal = round2(lines.reduce((s, l) => s + l.lineTotal, 0));
    const total = grandTotal ?? round2(linesTotal + deliveryCharge);
    if (Math.abs(linesTotal + deliveryCharge - total) > 0.01) {
      notes.push(`${number}: lines + delivery = ${round2(linesTotal + deliveryCharge)} but grand_total is ${total}; grand_total kept.`);
    }
    // A Draft never took stock; anything confirmed did (a cancel before confirmation has no confirmed_at).
    const deducted = Boolean(confirmedAt) || !['Draft', 'Cancelled'].includes(status);
    const assignee = text(r.assigned_to) ? ctx.staffUser(r.assigned_to) : null;
    if (text(r.assigned_to) && !assignee) {
      notes.push(`${number}: driver ${ctx.staffName(r.assigned_to) || text(r.assigned_to)} has no hub account here — left unassigned.`);
    }
    const header = {
      customerName: text(r.customer_name, 120) || 'Customer', customerPhone: text(r.phone, 24) || '-',
      area: opt(r.area, 80), address: opt(r.address), landmark: opt(r.landmark, 200),
    };
    const fields = {
      userId,
      totalAmount: total,
      discount: 0,
      shippingCharge: deliveryCharge,
      shippingAddress: { fullName: header.customerName, phone: header.customerPhone, address: header.address || '', city: header.area || '', landmark: header.landmark || '' },
      paymentMethod: LEGACY_METHOD[paymentMode] || 'other',
      ...header,
      hubStatus: status,
      hubPaymentStatus: paymentStatus,
      hubPaymentMode: paymentMode,
      fulfilmentMethod: pickup ? 'Customer Pickup' : 'Delivery',
      amountReceived: round2(Math.max(received, 0)),
      paymentDate: day(r.payment_date) || null,
      paymentTime: opt(r.payment_time, 20),
      paymentReference: opt(r.payment_reference, 80),
      paymentNotes: opt(r.payment_notes),
      paymentHeldIn: opt(r.payment_held_in, 60),
      paymentHolderDetails: opt(r.payment_holder_details, 200),
      deliveryDate: pickup ? null : day(r.delivery_date) || null,
      courier: pickup ? null : opt(r.courier, 80),
      trackingNumber: pickup ? null : opt(r.tracking_number, 80),
      deliveryNotes: opt(r.delivery_notes),
      pickupDate: pickup ? day(r.pickup_date) || null : null,
      pickupTime: pickup ? opt(r.pickup_time, 20) : null,
      pickupNotes: pickup ? opt(r.pickup_notes) : null,
      confirmedAt: confirmedAt || null,
      cancelledAt: cancelledAt || null,
      restockedAt: restockedAt || null,
      stockState: deducted ? (restockedAt ? 'restored' : 'deducted') : 'none',
      idempotencyKey: opt(r.idempotency_key, 120),
      assignedTo: assignee?.id ?? null,
      assignedAt: assignee ? when(r.assigned_at) || null : null,
      assignedBy: assignee ? ctx.staffUser(r.assigned_by)?.id ?? null : null,
    };
    const fileReturns = returnsBy.get(number) || [];

    if (prev) {
      const updated = await refreshOrder(ctx, prev, r, { fields, lines, deducted, restockedAt, fileReturns, hasRestock });
      if (updated) for (const n of notes) report.warn('Orders', r._row, n);
      continue;
    }

    for (const n of notes) report.warn('Orders', r._row, n);
    const order = Order.build({
      orderNumber: number,
      channel: { online: 'web', pos: 'pos' }[text(r.channel).toLowerCase()] || 'staff',
      items: lines,
      ...fields,
      createdBy: ctx.createdBy(r.created_by),
      createdAt: orderDate,
    });
    syncLegacy(order);
    await order.save({ transaction: t });
    ctx.orders.set(number, { id: order.id, created: true });
    report.count('Orders', 'created');
    report.count('Order Items', 'created', lines.length);

    if (deducted) {
      const at = confirmedAt || orderDate;
      for (const l of lines) {
        ctx.events.push({ at, sku: l.sku.toUpperCase(), delta: -l.quantity, ctx: { kind: 'sale', reference: number, orderId: order.id } });
      }
      // Restocks the old system did but the file has no Stock In row for.
      if (restockedAt && !hasRestock('CAN', number)) {
        for (const l of lines) {
          const qty = l.quantity - l.returnedQty;
          if (qty > 0) {
            ctx.events.push({ at: restockedAt, sku: l.sku.toUpperCase(), delta: qty,
              ctx: { kind: 'cancel_restock', reference: `CAN-${number}-${l.sku}`, orderId: order.id, reason: 'Order cancelled' } });
          }
        }
      }
    }

    await importReturns(ctx, order, lines, fileReturns, { deducted, hasRestock });
  }
}

/**
 * Returns: which line each one came back on, and whether it went back to stock.
 * An order imported before keeps the returns it has; only the file's later
 * rows (beyond the count already recorded) are added.
 */
async function importReturns(ctx, order, lines, fileReturns, { deducted, hasRestock }) {
  const { report, t } = ctx;
  const number = order.orderNumber;
  const prior = !ctx.orders.get(number)?.created
    ? await OrderReturn.findAll({ where: { orderId: order.id }, attributes: ['lineIndex', 'quantity'], transaction: t })
    : [];
  const left = lines.map((l) => l.returnedQty);
  const recorded = lines.map(() => 0);
  for (const p of prior) if (recorded[p.lineIndex] !== undefined) recorded[p.lineIndex] += p.quantity;
  for (const rr of fileReturns.slice(prior.length)) {
    const sku = upper(rr.sku);
    const qty = num(rr.quantity);
    const idx = lines.findIndex((l, i) => l.sku.toUpperCase() === sku && left[i] - recorded[i] >= qty);
    if (!Number.isInteger(qty) || qty < 1 || idx < 0) {
      report.warn('Returns', rr._row, `${number} ${sku}: does not match a returned line on the order — skipped.`);
      continue;
    }
    recorded[idx] += qty;
    const restock = bool(rr.restock, false) && deducted;
    const createdAt = when(rr.created_at) || order.createdAt;
    await OrderReturn.create({
      orderId: order.id, lineIndex: idx, productId: lines[idx].productId, variantIndex: lines[idx].variantIndex,
      sku: lines[idx].sku, quantity: qty, reason: text(rr.reason, 120) || 'Other', restock, notes: opt(rr.notes),
      createdBy: ctx.createdBy(rr.created_by), createdAt,
    }, { transaction: t });
    report.count('Returns', 'created');
    if (restock && !hasRestock('RET', number)) {
      ctx.events.push({ at: createdAt, sku, delta: qty,
        ctx: { kind: 'return', reference: `RET-${number}-${lines[idx].sku}`, orderId: order.id, reason: text(rr.reason, 120) || 'Other' } });
    }
  }
  lines.forEach((l, i) => {
    if (l.returnedQty !== recorded[i]) {
      report.warn('Returns', null, `${number} ${l.sku}: returned_qty is ${l.returnedQty} but the Returns sheet lists ${recorded[i]}.`);
    }
  });
}

const secs = (d) => Math.round(new Date(d).valueOf() / 1000);
/** History-row key at whole seconds (DATETIME columns drop the milliseconds the old system exports). */
const auditKeys = (d, label) => [`${secs(d)}|${label}`, `${Math.floor(new Date(d).valueOf() / 1000)}|${label}`];
const auditField = (r) => text(r.field, 255) || text(r.action, 255) || 'Change';

const parsed = (v) => {
  if (typeof v !== 'string' || !/^[[{]/.test(v)) return v;
  try { return JSON.parse(v); } catch { return v; }
};
/** A stable comparable form of a column value: numbers as numbers, objects key-sorted. */
function comparable(v) {
  v = parsed(v);
  if (v === undefined || v === null || v === '') return null;
  if (v instanceof Date) return v.valueOf();
  if (typeof v === 'object') return JSON.stringify(Object.keys(v).sort().map((k) => [k, comparable(v[k])]));
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  return v;
}
/** Equal as stored: timestamps within the second a DATETIME column keeps. */
const sameValue = (a, b) => (a instanceof Date && b instanceof Date
  ? Math.abs(a.valueOf() - b.valueOf()) < 1000
  : comparable(a) === comparable(b));

const lineView = (l) => [upper(l.sku), Number(l.quantity), round2(l.unitPrice ?? l.price), round2(l.discount), round2(l.lineTotal),
  Number(l.returnedQty || 0), text(l.name), text(l.size), text(l.color)];

/** SKU → stock the order holds: minus its sale, plus a cancel restock the Stock In sheet does not carry. */
function heldStock(lines, deducted, implicitRestock) {
  const held = new Map();
  if (!deducted) return held;
  for (const l of lines) {
    const sku = upper(l.sku);
    const back = implicitRestock ? Number(l.quantity) - Number(l.returnedQty || 0) : 0;
    held.set(sku, (held.get(sku) || 0) - Number(l.quantity) + back);
  }
  return held;
}

/**
 * An order an earlier import brought in, now in a newer backup: apply what
 * changed in the old system (status, payment, delivery, lines) and move stock
 * by the difference. An order with any change-history row the file does not
 * carry — changed in this hub since, or already updated from a newer backup —
 * is left alone, so a re-import never overwrites work done here or rolls an
 * order back. Returns true when the order was updated.
 */
async function refreshOrder(ctx, prev, r, { fields, lines, deducted, restockedAt, fileReturns, hasRestock }) {
  const { report, t } = ctx;
  const number = prev.orderNumber;

  const fileHistory = new Set((ctx.sheets['Audit Logs'] || [])
    .filter((a) => text(a.source).toLowerCase().startsWith('order') && text(a.record, 60) === number && when(a.logged_at))
    .flatMap((a) => auditKeys(when(a.logged_at), auditField(a))));
  const ours = await OrderAuditLog.findAll({ where: { orderId: prev.id }, attributes: ['field', 'createdAt'], transaction: t });
  const editedHere = ours.some((h) => !auditKeys(h.createdAt, h.field).some((k) => fileHistory.has(k)));

  const changed = Object.keys(fields).filter((k) => !sameValue(fields[k], prev.get(k)));
  const prevLines = parsed(prev.items) || [];
  // The old system exports an order's lines in no fixed order: compare them as a set.
  const lineSet = (ls) => JSON.stringify(ls.map((l) => JSON.stringify(lineView(l))).sort());
  const linesChanged = lineSet(prevLines) !== lineSet(lines);
  const returnsAdded = fileReturns.length > (await OrderReturn.count({ where: { orderId: prev.id }, transaction: t }));
  if (!changed.length && !linesChanged && !returnsAdded) {
    report.count('Orders', 'unchanged');
    return false;
  }
  if (editedHere) {
    report.count('Orders', 'kept (newer here)');
    report.warn('Orders', r._row, `${number} has changes here that this file does not (made in this hub, or from a newer backup) — left as it is.`);
    return false;
  }
  if (prevLines.some((l) => !l.sku || !ctx.skus.has(upper(l.sku)))) {
    report.error('Orders', r._row, `${number}: a line on the existing order has no known SKU, so its stock cannot be reconciled.`);
    return false;
  }

  // Stock: the difference between what the order held before and what it holds now.
  const implicitBefore = prev.stockState === 'restored' && !hasRestock('CAN', number);
  const before = heldStock(prevLines, prev.stockState !== 'none', implicitBefore);
  const after = heldStock(lines, deducted, Boolean(restockedAt) && !hasRestock('CAN', number));
  const at = when(r.updated_at) || new Date();
  for (const sku of new Set([...before.keys(), ...after.keys()])) {
    const delta = (after.get(sku) || 0) - (before.get(sku) || 0);
    if (!delta) continue;
    const restoring = delta > 0 && Boolean(restockedAt) && !implicitBefore;
    ctx.events.push({ at, sku, delta, ctx: restoring
      ? { kind: 'cancel_restock', reference: `CAN-${number}-${sku}`.slice(0, 80), orderId: prev.id, reason: 'Order cancelled' }
      : { kind: 'sale', reference: number, orderId: prev.id, notes: 'Order changed in the imported backup' } });
  }

  if (linesChanged) {
    // Lines still on the order keep their position (returns point at line indexes) and recorded cost;
    // new lines go after them at today's cost.
    const pool = [...lines];
    const kept = [];
    for (const p of prevLines) {
      const i = pool.findIndex((l) => upper(l.sku) === upper(p.sku));
      if (i >= 0) kept.push({ ...pool.splice(i, 1)[0], costPrice: p.costPrice });
    }
    prev.items = [...kept, ...pool];
  }
  prev.set(fields);
  prev.stockState = deducted ? (restockedAt ? 'restored' : 'deducted') : 'none';
  syncLegacy(prev);
  await prev.save({ transaction: t });
  ctx.orders.set(number, { id: prev.id, created: false, updated: true });
  report.count('Orders', 'updated');
  const what = [...changed, ...(linesChanged ? ['lines'] : []), ...(returnsAdded ? ['returns'] : [])];
  report.warn('Orders', r._row, `${number} updated from the backup: ${what.join(', ')}.`);
  await importReturns(ctx, prev, prev.items, fileReturns, { deducted, hasRestock });
  return true;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function groupBy(rows, keyFn) {
  const out = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(r);
  }
  return out;
}

/** Stock In / Out / adjustments from the sheets, merged with opening and sale events, applied oldest first. */
async function replayStock(ctx) {
  const { report, t } = ctx;
  const sheetEvents = [];
  const add = (sheet, r, keyPrefix, build) => {
    const sku = upper(r.sku);
    if (!ctx.skus.has(sku)) { report.error(sheet, r._row, `${sku || '(no SKU)'} is not a known SKU.`); return; }
    const reference = text(r.reference, 80);
    const idem = text(r.idempotency_key, 120) || `${keyPrefix}-${text(r.id, 80) || reference || r._row}`.slice(0, 120);
    const at = when(r.created_at) || when(r.txn_date);
    if (!at) { report.error(sheet, r._row, `${sku}: created_at / txn_date is missing or unreadable.`); return; }
    const built = build(sku, reference);
    if (!built) return;
    sheetEvents.push({ sheet, at, sku, idem, ...built, ctx: { ...built.ctx, reference: reference || null, txnDate: day(r.txn_date) || localDate(at),
      idempotencyKey: idem, createdBy: ctx.createdBy(r.created_by), notes: opt(r.notes) } });
  };
  for (const r of rowsOf(ctx.sheets, 'Stock In', report)) {
    add('Stock In', r, 'IMP-SI', (sku, ref) => {
      const qty = num(r.quantity);
      if (!Number.isInteger(qty) || qty < 1) { report.error('Stock In', r._row, `${sku}: quantity must be a whole number above 0.`); return null; }
      const note = text(r.notes);
      const kind = /^CAN-/i.test(ref) || /^cancellation restock/i.test(note) ? 'cancel_restock'
        : /^RET-/i.test(ref) || /^return restock/i.test(note) ? 'return' : 'stock_in';
      // CAN-FEM-0001-<sku>: the order number itself contains dashes, so match it against the known orders.
      const order = [...ctx.orders.keys()].find((number) => new RegExp(`^(CAN|RET)-${escapeRe(number)}-`, 'i').test(ref));
      return {
        delta: qty,
        ctx: {
          kind, orderId: order ? ctx.orders.get(order).id : null, unitCost: num(r.cost_price) || null,
          supplier: opt(r.supplier, 120), invoiceRef: opt(r.invoice_reference, 120), receivedBy: opt(r.received_by, 120),
          rack: opt(r.rack, 60), shelfLocation: opt(r.shelf_location, 60), batchNumber: opt(r.batch_number, 80),
          sourceCountry: opt(r.source_country, 80), wholesaler: opt(r.wholesaler, 120),
        },
      };
    });
  }
  for (const r of rowsOf(ctx.sheets, 'Stock Out', report)) {
    add('Stock Out', r, 'IMP-SO', (sku) => {
      const qty = num(r.quantity);
      if (!Number.isInteger(qty) || qty < 1) { report.error('Stock Out', r._row, `${sku}: quantity must be a whole number above 0.`); return null; }
      return {
        delta: -qty,
        ctx: { kind: 'stock_out', reason: text(r.reason, 120) || 'Other', supplier: opt(r.supplier, 120),
          referenceNote: opt(r.reference_note, 200), handledBy: opt(r.handled_by, 120) },
      };
    });
  }
  for (const r of rowsOf(ctx.sheets, 'Stock Adjustments', report)) {
    add('Stock Adjustments', r, 'IMP-ADJ', (sku) => {
      let diff = num(r.difference);
      if (diff === null) diff = (num(r.counted_quantity) ?? NaN) - (num(r.system_quantity) ?? NaN);
      if (!Number.isInteger(diff)) { report.error('Stock Adjustments', r._row, `${sku}: difference must be a whole number.`); return null; }
      return { delta: diff, ctx: { kind: 'adjustment', reason: text(r.reason, 120) || 'Adjustment' } };
    });
  }

  // Movements already recorded by an earlier import of the same file.
  const keys = sheetEvents.map((e) => e.idem);
  const done = new Set();
  for (let i = 0; i < keys.length; i += 500) {
    const rows = await StockMovement.findAll({ where: { idempotencyKey: keys.slice(i, i + 500) }, attributes: ['idempotencyKey'], transaction: t });
    for (const r of rows) done.add(r.idempotencyKey);
  }
  for (const e of sheetEvents) {
    if (done.has(e.idem)) {
      report.count(e.sheet, 'already recorded');
      continue;
    }
    ctx.events.push(e);
    report.count(e.sheet, 'created');
  }

  const events = ctx.events.map((e, i) => ({ ...e, i })).sort((a, b) => a.at - b.at || a.i - b.i);
  const locationId = await stockLocationId();
  for (const e of events) {
    const s = ctx.skus.get(e.sku);
    ctx.touched.add(s.productId);
    await applyStockDelta({
      productId: s.productId, variantIndex: s.variantIndex, delta: e.delta, transaction: t, locationId,
      ctx: { txnDate: localDate(e.at), createdBy: ctx.userId, ...e.ctx },
    });
  }

  // New SKUs must end on the stock the Inventory sheet says they hold.
  for (const [sku, target] of ctx.targets) {
    const s = ctx.skus.get(sku);
    if (!s) continue;
    if (!s.created) {
      // An existing SKU this import moved: report a gap, never adjust it — sales made here explain a difference.
      if (!events.some((e) => e.sku === sku)) continue;
      const current = await skuStock(s.productId, s.variantIndex, t);
      if (current !== target) {
        report.count('Inventory', 'differs from the file');
        report.warn('Inventory', null, `${sku}: stock here is ${current} after this import, the file says ${target} — not adjusted (check sales made here).`);
      } else {
        report.count('Inventory', 'matched');
      }
      continue;
    }
    const current = await skuStock(s.productId, s.variantIndex, t);
    if (current !== target) {
      await applyStockDelta({
        productId: s.productId, variantIndex: s.variantIndex, delta: target - current, transaction: t, locationId,
        ctx: { kind: 'adjustment', reference: `IMPORT-RECONCILE-${sku}`.slice(0, 80), reason: 'Import reconciliation',
          notes: `History in the file gives ${current}; the Inventory sheet says ${target}.`, txnDate: localDate(), createdBy: ctx.userId },
      });
      report.count('Inventory', 'reconciled');
      report.warn('Inventory', null, `${sku}: history adds up to ${current}, current_stock is ${target} — adjusted by ${target - current}.`);
    } else {
      report.count('Inventory', 'matched');
    }
  }
}

async function importFinance(ctx) {
  const { report, t } = ctx;
  const entries = [
    ...rowsOf(ctx.sheets, 'Expenses', report).map((r) => ({ r, sheet: 'Expenses', type: text(r.entry_type) === 'asset' ? 'asset' : 'expense' })),
    ...rowsOf(ctx.sheets, 'Assets', report).map((r) => ({ r, sheet: 'Assets', type: text(r.entry_type) === 'expense' ? 'expense' : 'asset' })),
  ];
  const liabilityRows = groupBy(rowsOf(ctx.sheets, 'Liabilities', report), (r) => text(r.entry_id, 80));
  const refs = entries.map((e) => text(e.r.reference_code, 40)).filter(Boolean);
  const taken = new Set();
  if (refs.length) {
    const [a, b, c] = await Promise.all([
      HubExpenseEntry.findAll({ where: { reference: refs }, attributes: ['reference'], transaction: t }),
      Expense.findAll({ where: { expenseNumber: refs }, attributes: ['expenseNumber'], transaction: t }),
      FixedAsset.findAll({ where: { assetNumber: refs }, attributes: ['assetNumber'], transaction: t }),
    ]);
    for (const x of a) taken.add(x.reference);
    for (const x of b) taken.add(x.expenseNumber);
    for (const x of c) taken.add(x.assetNumber);
  }
  const liabilities = new Map();   // their liability id → HubLiability
  const debit = async (account, amount, date, fields) => {
    await writeCashTxn({
      cashAccountId: account.id, amount: -amount, date: new Date(`${date}T12:00:00`), createdBy: ctx.userId, transaction: t, ...fields,
    });
    ctx.report.cash[account.name] = round2((ctx.report.cash[account.name] || 0) - amount);
  };

  const earlier = [];   // [their liability id, our entry reference] for entries an earlier import created
  let n = 0;
  for (const { r, sheet, type } of entries) {
    n += 1;
    const label = type === 'asset' ? 'Asset' : 'Expense';
    const reference = text(r.reference_code, 40) || `${type === 'asset' ? 'AST' : 'EXP'}-IMP-${String(n).padStart(4, '0')}`;
    if (taken.has(reference)) {
      report.count(sheet, 'already existed');
      const liabilityRow = (liabilityRows.get(text(r.id, 80)) || [])[0];
      if (liabilityRow && text(liabilityRow.id)) earlier.push([text(liabilityRow.id, 80), reference]);
      continue;
    }
    taken.add(reference);
    const date = day(r.txn_date);
    const item = text(r.item, 200);
    const category = text(r.category, 80);
    const amount = round2(num(r.amount));
    const fundingSource = text(r.funding_source, 40);
    const problems = [];
    if (!date) problems.push('txn_date is missing or unreadable');
    if (!item) problems.push('item is required');
    if (!category) problems.push('category is required');
    if (!(amount > 0)) problems.push('amount must be above 0');
    if (![...COMPANY_FUNDING_SOURCES, PERSONAL_FUNDING_SOURCE].includes(fundingSource)) problems.push(`unknown funding_source "${fundingSource}"`);
    const personal = fundingSource === PERSONAL_FUNDING_SOURCE;
    const liabilityRow = (liabilityRows.get(text(r.id, 80)) || [])[0] || null;
    const person = text(r.purchase_person, 120) || text(liabilityRow?.person, 120);
    if (personal && !person) problems.push('purchase_person is required when it was paid personally');
    if (problems.length) { report.error(sheet, r._row, `${reference}: ${problems.join('; ')}.`); continue; }
    let paymentMethod = text(r.payment_method, 30) || 'Cash';
    if (!PAYMENT_METHODS.includes(paymentMethod)) {
      report.warn(sheet, r._row, `${reference}: payment method "${paymentMethod}" recorded as Other.`);
      paymentMethod = 'Other';
    }
    const createdBy = ctx.createdBy(r.created_by);
    const createdAt = when(r.created_at) || new Date(`${date}T12:00:00`);
    const notes = opt(r.notes);
    const account = personal ? null : await accountForSource(fundingSource, t);
    const entry = await HubExpenseEntry.create({
      entryType: type, reference, txnDate: date, category, item, amount,
      purchasedBy: text(r.purchased_by, 120) || person || ctx.staffName(r.created_by) || null,
      purchasePerson: person || null, payee: opt(r.payee, 120), paymentMethod, fundingSource, cashAccountId: account?.id ?? null,
      receiptReference: opt(r.receipt_reference, 80), notes, idempotencyKey: opt(r.idempotency_key, 120), createdBy, createdAt,
    }, { transaction: t });
    if (type === 'expense' && account) {
      const [cat] = await ExpenseCategory.findOrCreate({ where: { name: category }, defaults: { active: true }, transaction: t });
      const exp = await Expense.create({
        expenseNumber: reference, expenseCategoryId: cat.id, cashAccountId: account.id, amount,
        paymentMethod: EXPENSE_METHOD[paymentMethod] || 'other', description: item.slice(0, 250),
        reference: entry.receiptReference, expenseDate: date, notes, status: 'paid', createdBy,
      }, { transaction: t });
      await debit(account, amount, date, { source: 'expense', sourceType: 'Expense', sourceId: exp.id, reference, description: item });
      entry.expenseId = exp.id;
    }
    if (type === 'asset') {
      const asset = await FixedAsset.create({
        assetNumber: reference, name: item.slice(0, 250), category: ASSET_CATEGORY[category] || 'other',
        acquisitionDate: date, cost: amount, salvageValue: 0, depreciationRate: 20,
        depreciationStartMonth: date.slice(0, 7), cashAccountId: account?.id ?? null,
        notes: [notes, personal ? `Paid personally by ${person}` : null].filter(Boolean).join(' · ') || null,
        status: 'active', createdBy,
      }, { transaction: t });
      if (account) {
        await debit(account, amount, date, { source: 'asset', sourceType: 'FixedAsset', sourceId: asset.id, reference, description: `Purchase of ${item}` });
      }
      entry.fixedAssetId = asset.id;
    }
    await entry.save({ transaction: t });
    report.count(sheet, 'created');
    if (personal) {
      const liability = await HubLiability.create({
        entryId: entry.id, person, amount: round2(num(liabilityRow?.amount) || amount),
        notes: opt(liabilityRow?.notes) || `${label} ${reference} paid personally by ${person}`,
        createdBy: liabilityRow ? ctx.createdBy(liabilityRow.created_by) : createdBy,
        createdAt: when(liabilityRow?.created_at) || createdAt,
      }, { transaction: t });
      if (liabilityRow && text(liabilityRow.id)) liabilities.set(text(liabilityRow.id, 80), liability);
      report.count('Liabilities', 'created');
    }
  }

  // A later backup can pay back a liability an earlier import created.
  if (earlier.length) {
    const found = await HubExpenseEntry.findAll({ where: { reference: earlier.map(([, ref]) => ref) }, attributes: ['id', 'reference'], transaction: t });
    const entryIds = new Map(found.map((e) => [e.reference, e.id]));
    const owed = await HubLiability.findAll({ where: { entryId: [...entryIds.values()] }, transaction: t });
    const byEntry = new Map(owed.map((l) => [l.entryId, l]));
    for (const [theirId, ref] of earlier) {
      const liability = byEntry.get(entryIds.get(ref));
      if (liability) liabilities.set(theirId, liability);
    }
  }

  const reimbursed = new Map(); // our liability id → total paid back, including earlier imports
  for (const r of rowsOf(ctx.sheets, 'Reimbursements', report)) {
    const key = text(r.idempotency_key, 120) || `IMP-RB-${text(r.id, 80) || r._row}`.slice(0, 120);
    if (await HubReimbursement.findOne({ where: { idempotencyKey: key }, transaction: t })) {
      report.count('Reimbursements', 'already existed');
      continue;
    }
    const liability = liabilities.get(text(r.liability_id, 80));
    if (!liability) {
      report.error('Reimbursements', r._row, `liability ${text(r.liability_id) || '(none)'} is not in this file or an earlier import.`);
      continue;
    }
    const amount = round2(num(r.amount));
    const paidOn = day(r.paid_on);
    if (!(amount > 0) || !paidOn) { report.error('Reimbursements', r._row, 'paid_on and an amount above 0 are required.'); continue; }
    const total = round2((reimbursed.get(liability.id) ?? round2(liability.reimbursed)) + amount);
    if (total > round2(liability.amount) + 0.001) { report.error('Reimbursements', r._row, `${liability.person}: reimbursements exceed the amount owed.`); continue; }
    reimbursed.set(liability.id, total);
    const paymentMethod = PAYMENT_METHODS.includes(text(r.payment_method)) ? text(r.payment_method) : 'Cash';
    const fundingSource = COMPANY_FUNDING_SOURCES.includes(text(r.funding_source)) ? text(r.funding_source) : METHOD_DEFAULT_SOURCE[paymentMethod];
    const account = await accountForSource(fundingSource, t);
    const entry = await HubExpenseEntry.findByPk(liability.entryId, { transaction: t });
    const row = await HubReimbursement.create({
      liabilityId: liability.id, paidOn, amount, paymentMethod, fundingSource, cashAccountId: account.id,
      reference: opt(r.reference, 80), notes: opt(r.notes), idempotencyKey: key, createdBy: ctx.createdBy(r.created_by),
      createdAt: when(r.created_at) || new Date(`${paidOn}T12:00:00`),
    }, { transaction: t });
    await debit(account, amount, paidOn, {
      source: entry?.entryType === 'asset' ? 'asset' : 'expense', sourceType: 'HubReimbursement', sourceId: row.id,
      reference: entry?.reference ?? `LIA-${liability.id}`, description: `Reimbursement to ${liability.person}${entry ? ` · ${entry.item}` : ''}`,
    });
    report.count('Reimbursements', 'created');
  }
  for (const liability of liabilities.values()) {
    const paid = reimbursed.get(liability.id);
    if (paid === undefined) continue;
    await liability.update({
      reimbursed: paid, status: paid >= round2(liability.amount) - 0.001 ? 'paid' : 'partially_paid',
    }, { transaction: t });
  }
}

/** History rows, attached only to orders and SKUs this import created. */
async function importAudit(ctx) {
  const { report, t } = ctx;
  const rows = rowsOf(ctx.sheets, 'Audit Logs', report);
  const orderRows = [];
  const productRows = [];
  const activityRows = [];
  for (const r of rows) {
    const source = text(r.source).toLowerCase();
    const at = when(r.logged_at);
    if (!at) continue;
    const staff = ctx.staffUser(r.staff);
    if (source.startsWith('order')) {
      const o = ctx.orders.get(text(r.record, 60));
      if (!o?.created && !o?.updated) continue;
      orderRows.push({ orderId: o.id, field: auditField(r), oldValue: opt(r.old_value, 4000),
        newValue: opt(r.new_value, 4000), changedBy: staff?.id ?? null, staffName: text(r.staff, 120) || null, createdAt: at });
    } else if (source.startsWith('product')) {
      const s = ctx.skus.get(upper(r.record));
      if (!s?.created) continue;
      productRows.push({ productId: s.productId, variantIndex: s.variantIndex, sku: s.sku, field: text(r.field, 255) || 'Change',
        oldValue: opt(r.old_value, 4000), newValue: opt(r.new_value, 4000), changedBy: staff?.id ?? null, createdAt: at });
    } else {
      const who = text(r.staff, 120);
      const description = [text(r.details, 450), !staff && who ? `by ${who}` : null].filter(Boolean).join(' · ') || null;
      activityRows.push({ userId: staff?.id ?? null, action: text(r.action, 120) || 'Activity', entityType: text(r.module, 120) || null,
        details: { recordId: opt(r.record, 120), description, imported: true }, createdAt: at });
    }
  }
  // History rows have no key of their own: skip ones an earlier import already added (matched at whole seconds).
  if (activityRows.length) {
    const times = activityRows.map((a) => a.createdAt.valueOf());
    const prior = await ActivityLog.findAll({
      where: { createdAt: { [Op.between]: [new Date(Math.min(...times) - 1000), new Date(Math.max(...times) + 1000)] } },
      attributes: ['createdAt', 'action'], transaction: t,
    });
    const seen = new Set(prior.map((p) => `${secs(p.createdAt)}|${p.action}`));
    const fresh = activityRows.filter((a) => !auditKeys(a.createdAt, a.action).some((k) => seen.has(k)));
    report.count('Audit Logs', 'activity skipped (already imported)', activityRows.length - fresh.length);
    activityRows.length = 0;
    activityRows.push(...fresh);
  }
  const updatedIds = [...new Set(orderRows.map((o) => o.orderId))];
  if (updatedIds.length) {
    const prior = await OrderAuditLog.findAll({ where: { orderId: updatedIds }, attributes: ['orderId', 'field', 'createdAt'], transaction: t });
    const seen = new Set(prior.map((p) => `${p.orderId}|${secs(p.createdAt)}|${p.field}`));
    const fresh = orderRows.filter((o) => !auditKeys(o.createdAt, o.field).some((k) => seen.has(`${o.orderId}|${k}`)));
    orderRows.length = 0;
    orderRows.push(...fresh);
  }
  if (orderRows.length) await OrderAuditLog.bulkCreate(orderRows, { transaction: t });
  if (productRows.length) await ProductAuditLog.bulkCreate(productRows, { transaction: t });
  if (activityRows.length) await ActivityLog.bulkCreate(activityRows, { transaction: t });
  report.count('Audit Logs', 'order changes', orderRows.length);
  report.count('Audit Logs', 'product changes', productRows.length);
  report.count('Audit Logs', 'activity', activityRows.length);
}

/** New hub orders continue after the highest imported number (FEM-0089 → FEM-0090). */
async function bumpOrderCounter(ctx) {
  const prefix = `${ctx.settings.invoicePrefix}-`;
  let max = 0;
  for (const [number, o] of ctx.orders) {
    if (o.created && number.startsWith(prefix) && /^\d+$/.test(number.slice(prefix.length))) {
      max = Math.max(max, parseInt(number.slice(prefix.length), 10));
    }
  }
  if (!max) return;
  const row = await Counter.findByPk('hub_order', { transaction: ctx.t, lock: ctx.t.LOCK.UPDATE });
  if (!row) await Counter.create({ name: 'hub_order', value: max }, { transaction: ctx.t });
  else if (Number(row.value) < max) await row.update({ value: max }, { transaction: ctx.t });
}

/**
 * Import a workbook read by readWorkbook(). With `dryRun` (the default) or
 * any row error, everything is rolled back and only the report returns.
 */
export async function importData(sheets, { userId, dryRun = true }) {
  if (!Object.keys(sheets).length) {
    throw bad(`No known sheets in this file. Expected some of: ${Object.keys(SHEETS).join(', ')}.`);
  }
  await stockLocationId();   // the hub's stock rules apply: fail before anything is written
  const report = newReport();
  const ctx = { sheets, userId, report, settings: await loadAppSettings(), touched: new Set() };
  let committed = false;
  const t = await sequelize.transaction();
  ctx.t = t;
  try {
    await loadStaff(ctx);
    await importCustomers(ctx);
    await importProducts(ctx);
    await importOrders(ctx);
    await replayStock(ctx);
    await importFinance(ctx);
    await importAudit(ctx);
    await bumpOrderCounter(ctx);
    if (dryRun || report.errorCount) {
      await t.rollback();
    } else {
      await t.commit();
      committed = true;
    }
  } catch (err) {
    if (!t.finished) await t.rollback();
    throw err;
  }
  if (committed) await recomputeAfter([...ctx.touched]);
  return {
    dryRun,
    committed,
    counts: report.counts,
    cashDebited: Object.entries(report.cash).map(([account, amount]) => ({ account, amount })),
    unmatchedStaff: [...report.unmatchedStaff],
    examplesSkipped: report.examplesSkipped,
    errorCount: report.errorCount,
    errors: report.errors,
    warningCount: report.warningCount,
    warnings: report.warnings,
  };
}
