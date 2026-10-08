import { AsyncLocalStorage } from 'node:async_hooks';
import { Op } from 'sequelize';

/**
 * Stock ledger plumbing (see models/StockMovement.js).
 *
 * ProductStock hooks call recordStockDelta() for every quantity change. What
 * the movement is called comes from, in order:
 *   1. an explicit context set with withStockContext() — the hub's Stock In,
 *      Stock Out, adjustments and imports, which carry references, supplier,
 *      batch and idempotency keys;
 *   2. otherwise the HTTP request in flight (ledgerRequestContext puts it in
 *      AsyncLocalStorage), classified by path below;
 *   3. otherwise 'other' (scripts, boot).
 *
 * Models are injected by models/index.js (initStockLedger) to avoid an import
 * cycle.
 */
const store = new AsyncLocalStorage();
let M = null;

export function initStockLedger(models) {
  M = models;
}

/** Express middleware: makes the current request visible to the hooks. */
export function ledgerRequestContext(req, res, next) {
  store.run({ req }, () => next());
}

/** Run `fn` with explicit movement details applied to every stock change inside it. */
export function withStockContext(ctx, fn) {
  const current = store.getStore() || {};
  return store.run({ ...current, ctx: { ...(current.ctx || {}), ...ctx } }, fn);
}

// Path → movement kind for changes made by routes that know nothing of the ledger.
const PATH_KINDS = [
  [/^\/api\/pos\/sales\/(\d+)\/void/, 'sale_void', (m) => `Sale #${m[1]} void`],
  [/^\/api\/pos\/sales\/(\d+)\/append/, 'sale', (m) => `Sale #${m[1]}`],
  [/^\/api\/pos\/sale\b/, 'sale', () => 'POS sale'],
  [/^\/api\/returns\/(\d+)\/cancel/, 'return', (m) => `Return #${m[1]} cancelled`],
  [/^\/api\/returns\b/, 'return', () => 'Sales return'],
  [/^\/api\/stock-transfers\/(\d+)/, 'transfer', (m) => `Transfer #${m[1]}`],
  [/^\/api\/stock-counts\/(\d+)/, 'count', (m) => `Stock count #${m[1]}`],
  [/^\/api\/wastage\/(\d+)\/cancel/, 'wastage', (m) => `Wastage #${m[1]} cancelled`],
  [/^\/api\/wastage\b/, 'wastage', () => 'Wastage'],
  [/^\/api\/purchase-orders\/(\d+)\/receive/, 'stock_in', (m) => `PO #${m[1]} receipt`],
  [/^\/api\/purchase-returns\/(\d+)\/cancel/, 'supplier_return', (m) => `Purchase return #${m[1]} cancelled`],
  [/^\/api\/purchase-returns\b/, 'supplier_return', () => 'Purchase return'],
  [/^\/api\/inventory\b/, 'adjustment', () => 'Inventory screen'],
  [/^\/api\/products\b/, 'adjustment', () => 'Product form'],
  [/^\/api\/bulk-products\b/, 'import', () => 'Product import'],
  [/^\/api\/orders\/(\d+)\/cancel/, 'cancel_restock', (m) => `Order #${m[1]} cancelled`],
  [/^\/api\/orders\/(\d+)\/refund/, 'cancel_restock', (m) => `Order #${m[1]} refund`],
  [/^\/api\/(orders|payment|shiprocket)\b/, 'sale', () => 'Online order'],
  [/^\/api\/backup\b/, 'other', () => 'Backup restore'],
];

function classifyRequest(req) {
  const path = (req.originalUrl || '').split('?')[0];
  for (const [re, kind, ref] of PATH_KINDS) {
    const m = path.match(re);
    if (m) return { kind, reference: ref(m) };
  }
  return { kind: 'other', reference: null };
}

export function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Called by the ProductStock hooks with the signed change. Explicit hub
 * contexts are strict (a failure aborts the stock change with it); otherwise a
 * ledger failure is logged and the next boot's reconcile repairs the ledger,
 * so a ledger problem can never block a sale at the till.
 */
export async function recordStockDelta(row, delta, options = {}, { created = false } = {}) {
  if (!M || !delta) return;
  const s = store.getStore() || {};
  const ctx = s.ctx || null;
  let kind;
  let reference;
  if (ctx) {
    kind = ctx.kind || 'other';
    reference = ctx.reference || null;
  } else if (s.req) {
    ({ kind, reference } = classifyRequest(s.req));
  } else {
    kind = 'other';
    reference = null;
  }
  // A brand-new stock row opened by an import or the product form is that
  // SKU's starting stock, not a correction.
  if (created && !ctx && ['import', 'adjustment', 'other'].includes(kind)) kind = 'opening';

  const data = {
    productId: row.productId,
    variantIndex: row.variantIndex ?? null,
    locationId: row.locationId ?? null,
    quantity: delta,
    kind,
    reference,
    txnDate: ctx?.txnDate || todayLocal(),
    createdBy: ctx?.createdBy ?? s.req?.user?.id ?? null,
  };
  if (ctx) {
    for (const k of ['unitCost', 'supplier', 'invoiceRef', 'receivedBy', 'handledBy', 'referenceNote', 'rack',
      'shelfLocation', 'reason', 'notes', 'batchNumber', 'sourceCountry', 'wholesaler', 'idempotencyKey',
      'importBatchId', 'orderId']) {
      if (ctx[k] !== undefined && ctx[k] !== null && ctx[k] !== '') data[k] = ctx[k];
    }
  }
  try {
    await M.StockMovement.create(data, options.transaction ? { transaction: options.transaction } : undefined);
  } catch (err) {
    if (ctx) throw err;
    console.error('[stockLedger] movement not recorded:', err.message);
  }
}

/**
 * Restore the invariant SUM(movements) = ProductStock.quantity for every stock
 * row. The first run on an existing database opens each row with an
 * 'opening' movement for its current quantity; afterwards it only repairs
 * drift (a raw write that bypassed the hooks, e.g. a database restore).
 * Idempotent; runs at boot after sync().
 */
export async function reconcileStockLedger({ log = console.log } = {}) {
  if (!M) return 0;
  const { sequelize } = M;
  const [rows] = await sequelize.query(`
    SELECT ps.productId, ps.variantIndex, ps.locationId, ps.quantity,
           COALESCE(SUM(sm.quantity), 0) AS ledger, COUNT(sm.id) AS n
      FROM ProductStocks ps
      LEFT JOIN StockMovements sm
        ON sm.productId = ps.productId
       AND sm.variantIndex <=> ps.variantIndex
       AND sm.locationId <=> ps.locationId
     GROUP BY ps.id, ps.productId, ps.variantIndex, ps.locationId, ps.quantity`);
  const fixes = rows
    .map((r) => ({ ...r, diff: (parseInt(r.quantity, 10) || 0) - (parseInt(r.ledger, 10) || 0), n: parseInt(r.n, 10) || 0 }))
    .filter((r) => r.diff !== 0);
  if (!fixes.length) return 0;
  const today = todayLocal();
  await M.StockMovement.bulkCreate(fixes.map((r) => ({
    productId: r.productId,
    variantIndex: r.variantIndex,
    locationId: r.locationId,
    quantity: r.diff,
    kind: r.n === 0 ? 'opening' : 'adjustment',
    reference: r.n === 0 ? 'OPENING-BALANCE' : 'LEDGER-RECONCILE',
    reason: r.n === 0 ? 'Stock on hand when the ledger started' : 'Ledger reconciliation',
    txnDate: today,
  })));
  log(`[stockLedger] reconciled ${fixes.length} stock row(s)`);
  return fixes.length;
}

/** Movements for one SKU (all locations), oldest first. */
export async function movementsFor(productId, variantIndex) {
  return M.StockMovement.findAll({
    where: { productId, variantIndex: variantIndex ?? { [Op.is]: null } },
    order: [['createdAt', 'ASC'], ['id', 'ASC']],
  });
}
