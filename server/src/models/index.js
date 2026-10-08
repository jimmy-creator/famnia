import User from './User.js';
import Product from './Product.js';
import Order from './Order.js';
import Coupon from './Coupon.js';
import Review from './Review.js';
import Setting from './Setting.js';
import Category from './Category.js';
import Pincode from './Pincode.js';
import AbandonedCart from './AbandonedCart.js';
import PriceRequest from './PriceRequest.js';
import Location from './Location.js';
import ProductStock from './ProductStock.js';
import StockTransfer from './StockTransfer.js';
import CashierSession from './CashierSession.js';
import SalesReturn from './SalesReturn.js';
import Supplier from './Supplier.js';
import PurchaseOrder from './PurchaseOrder.js';
import PurchaseReceipt from './PurchaseReceipt.js';
import PurchaseReturn from './PurchaseReturn.js';
import SupplierPayment from './SupplierPayment.js';
import CashAccount from './CashAccount.js';
import CashTransaction from './CashTransaction.js';
import ExpenseCategory from './ExpenseCategory.js';
import Expense from './Expense.js';
import CashTransfer from './CashTransfer.js';
import ActivityLog from './ActivityLog.js';
import StockCount from './StockCount.js';
import StockCountLine from './StockCountLine.js';
import Counter from './Counter.js';
import FixedAsset from './FixedAsset.js';
import DepreciationEntry from './DepreciationEntry.js';
import CapitalEntry from './CapitalEntry.js';
import Wastage from './Wastage.js';
import StockMovement from './StockMovement.js';
import ProductAuditLog from './ProductAuditLog.js';
import ImportBatch from './ImportBatch.js';
import sequelize from '../config/database.js';
import { initStockLedger, recordStockDelta } from '../services/stockLedger.js';

// ── MariaDB JSON-column fix ──────────────────────────────────────
// On MariaDB (common on shared hosts like Hostinger) the JSON type is just a
// LONGTEXT alias, so the driver returns JSON columns as raw STRINGS instead of
// parsed values — which makes `product.images[0]` return "[" and crashes the
// admin edit form. Parse any JSON-typed attribute that came back as a string
// after every query. No-op on MySQL, where values arrive already parsed.
// Included associations are walked too: afterFind only fires for the top-level
// model, so a PO's PurchaseReceipts.items stayed a string and the PO view
// crashed calling .reduce() on it.
sequelize.addHook('afterFind', (result) => {
  if (!result) return;
  const parseRow = (row) => {
    const attrs = row && row.constructor && row.constructor.rawAttributes;
    if (!attrs || typeof row.getDataValue !== 'function') return;
    for (const key of Object.keys(attrs)) {
      if (!attrs[key].type || attrs[key].type.key !== 'JSON') continue;
      const v = row.getDataValue(key);
      if (typeof v === 'string') {
        try { row.setDataValue(key, JSON.parse(v)); } catch { /* leave raw */ }
      }
    }
    for (const key of Object.keys(row.constructor.associations || {})) {
      const inc = row.dataValues[key];
      if (Array.isArray(inc)) inc.forEach(parseRow);
      else if (inc) parseRow(inc);
    }
  };
  const rows = Array.isArray(result) ? result : (result.rows && Array.isArray(result.rows) ? result.rows : [result]);
  rows.forEach(parseRow);
});

// ── Existing associations ────────────────────────────────────────
User.hasMany(Order, { foreignKey: 'userId' });
Order.belongsTo(User, { foreignKey: 'userId' });

Product.hasMany(Review, { foreignKey: 'productId' });
Review.belongsTo(Product, { foreignKey: 'productId' });
Review.belongsTo(User, { foreignKey: 'userId' });

User.hasMany(PriceRequest, { foreignKey: 'userId' });
PriceRequest.belongsTo(User, { foreignKey: 'userId' });
PriceRequest.belongsTo(Order, { foreignKey: 'orderId' });

// ── Multi-location inventory ─────────────────────────────────────
Location.hasMany(ProductStock, { foreignKey: 'locationId' });
ProductStock.belongsTo(Location, { foreignKey: 'locationId' });

Product.hasMany(ProductStock, { foreignKey: 'productId' });
ProductStock.belongsTo(Product, { foreignKey: 'productId' });

// ── Stock transfers ──────────────────────────────────────────────
StockTransfer.belongsTo(Location, { as: 'fromLocation', foreignKey: 'fromLocationId' });
StockTransfer.belongsTo(Location, { as: 'toLocation', foreignKey: 'toLocationId' });
StockTransfer.belongsTo(User, { as: 'creator', foreignKey: 'createdBy' });

// ── Cashier shifts ───────────────────────────────────────────────
User.hasMany(CashierSession, { foreignKey: 'userId' });
CashierSession.belongsTo(User, { foreignKey: 'userId' });
Location.hasMany(CashierSession, { foreignKey: 'locationId' });
CashierSession.belongsTo(Location, { foreignKey: 'locationId' });

User.belongsTo(Location, { as: 'homeLocation', foreignKey: 'homeLocationId' });

// ── Order ↔ Location + CashierSession ────────────────────────────
Order.belongsTo(Location, { foreignKey: 'locationId' });
Location.hasMany(Order, { foreignKey: 'locationId' });
Order.belongsTo(CashierSession, { foreignKey: 'cashierSessionId' });
CashierSession.hasMany(Order, { foreignKey: 'cashierSessionId' });

// ── Sales Returns ───────────────────────────────────────────────
Order.hasMany(SalesReturn, { foreignKey: 'orderId' });
SalesReturn.belongsTo(Order, { foreignKey: 'orderId' });
Location.hasMany(SalesReturn, { foreignKey: 'locationId' });
SalesReturn.belongsTo(Location, { foreignKey: 'locationId' });
CashierSession.hasMany(SalesReturn, { foreignKey: 'cashierSessionId' });
SalesReturn.belongsTo(CashierSession, { foreignKey: 'cashierSessionId' });
SalesReturn.belongsTo(User, { as: 'processor', foreignKey: 'processedBy' });

// ── Purchasing (Supplier, POs, GRNs, returns, payments) ─────────
Supplier.hasMany(PurchaseOrder, { foreignKey: 'supplierId' });
PurchaseOrder.belongsTo(Supplier, { foreignKey: 'supplierId' });
Location.hasMany(PurchaseOrder, { foreignKey: 'locationId' });
PurchaseOrder.belongsTo(Location, { foreignKey: 'locationId' });
PurchaseOrder.belongsTo(User, { as: 'creator', foreignKey: 'createdBy' });

PurchaseOrder.hasMany(PurchaseReceipt, { foreignKey: 'purchaseOrderId' });
PurchaseReceipt.belongsTo(PurchaseOrder, { foreignKey: 'purchaseOrderId' });
Location.hasMany(PurchaseReceipt, { foreignKey: 'locationId' });
PurchaseReceipt.belongsTo(Location, { foreignKey: 'locationId' });
PurchaseReceipt.belongsTo(User, { as: 'receiver', foreignKey: 'receivedBy' });

Supplier.hasMany(PurchaseReturn, { foreignKey: 'supplierId' });
PurchaseReturn.belongsTo(Supplier, { foreignKey: 'supplierId' });
PurchaseOrder.hasMany(PurchaseReturn, { foreignKey: 'purchaseOrderId' });
PurchaseReturn.belongsTo(PurchaseOrder, { foreignKey: 'purchaseOrderId' });
Location.hasMany(PurchaseReturn, { foreignKey: 'locationId' });
PurchaseReturn.belongsTo(Location, { foreignKey: 'locationId' });
PurchaseReturn.belongsTo(User, { as: 'creator', foreignKey: 'createdBy' });

Supplier.hasMany(SupplierPayment, { foreignKey: 'supplierId' });
SupplierPayment.belongsTo(Supplier, { foreignKey: 'supplierId' });
PurchaseOrder.hasMany(SupplierPayment, { foreignKey: 'purchaseOrderId' });
SupplierPayment.belongsTo(PurchaseOrder, { foreignKey: 'purchaseOrderId' });
SupplierPayment.belongsTo(User, { as: 'payer', foreignKey: 'paidBy' });

// ── Finance (Cash Accounts, Transactions, Expenses, Transfers) ──
Location.hasMany(CashAccount, { foreignKey: 'locationId' });
CashAccount.belongsTo(Location, { foreignKey: 'locationId' });

CashAccount.hasMany(CashTransaction, { foreignKey: 'cashAccountId' });
CashTransaction.belongsTo(CashAccount, { foreignKey: 'cashAccountId' });
CashTransaction.belongsTo(User, { as: 'author', foreignKey: 'createdBy' });

ExpenseCategory.hasMany(Expense, { foreignKey: 'expenseCategoryId' });
Expense.belongsTo(ExpenseCategory, { foreignKey: 'expenseCategoryId' });
Location.hasMany(Expense, { foreignKey: 'locationId' });
Expense.belongsTo(Location, { foreignKey: 'locationId' });
CashAccount.hasMany(Expense, { foreignKey: 'cashAccountId' });
Expense.belongsTo(CashAccount, { foreignKey: 'cashAccountId' });
Expense.belongsTo(User, { as: 'creator', foreignKey: 'createdBy' });

CashAccount.hasMany(CashTransfer, { as: 'transfersOut', foreignKey: 'fromAccountId' });
CashAccount.hasMany(CashTransfer, { as: 'transfersIn',  foreignKey: 'toAccountId' });
CashTransfer.belongsTo(CashAccount, { as: 'fromAccount', foreignKey: 'fromAccountId' });
CashTransfer.belongsTo(CashAccount, { as: 'toAccount',   foreignKey: 'toAccountId' });
CashTransfer.belongsTo(User, { as: 'creator', foreignKey: 'createdBy' });

// ── Fixed assets & owner capital ────────────────────────────────
Location.hasMany(FixedAsset, { foreignKey: 'locationId' });
FixedAsset.belongsTo(Location, { foreignKey: 'locationId' });
FixedAsset.belongsTo(Supplier, { foreignKey: 'supplierId' });
FixedAsset.belongsTo(CashAccount, { foreignKey: 'cashAccountId' });
FixedAsset.belongsTo(CashAccount, { as: 'disposalAccount', foreignKey: 'disposalCashAccountId' });
FixedAsset.belongsTo(User, { as: 'creator', foreignKey: 'createdBy' });

FixedAsset.hasMany(DepreciationEntry, { as: 'depreciation', foreignKey: 'fixedAssetId', onDelete: 'CASCADE' });
DepreciationEntry.belongsTo(FixedAsset, { foreignKey: 'fixedAssetId' });

CashAccount.hasMany(CapitalEntry, { foreignKey: 'cashAccountId' });
CapitalEntry.belongsTo(CashAccount, { foreignKey: 'cashAccountId' });
CapitalEntry.belongsTo(User, { as: 'creator', foreignKey: 'createdBy' });

// ── Activity Log ────────────────────────────────────────────────
ActivityLog.belongsTo(User, { as: 'actor', foreignKey: 'userId' });
ActivityLog.belongsTo(User, { as: 'approver', foreignKey: 'managerOverrideBy' });
ActivityLog.belongsTo(Location, { foreignKey: 'locationId' });

// ── Stock Counts ────────────────────────────────────────────────
StockCount.belongsTo(Location, { foreignKey: 'locationId' });
Location.hasMany(StockCount, { foreignKey: 'locationId' });
StockCount.belongsTo(User, { as: 'creator', foreignKey: 'createdBy' });
StockCount.belongsTo(User, { as: 'poster',  foreignKey: 'postedBy' });
StockCount.belongsTo(User, { as: 'approver', foreignKey: 'managerOverrideBy' });
StockCount.belongsTo(Expense, { as: 'shrinkageExpense', foreignKey: 'shrinkageExpenseId' });

StockCount.hasMany(StockCountLine, { as: 'lines', foreignKey: 'stockCountId', onDelete: 'CASCADE' });
StockCountLine.belongsTo(StockCount, { foreignKey: 'stockCountId' });
StockCountLine.belongsTo(Product, { foreignKey: 'productId' });

// A product's default supplier, used by the reorder report to draft POs.
Product.belongsTo(Supplier, { as: 'preferredSupplier', foreignKey: 'preferredSupplierId' });

// ── Wastage / spoilage ──────────────────────────────────────────
Product.hasMany(Wastage, { foreignKey: 'productId' });
Wastage.belongsTo(Product, { foreignKey: 'productId' });
Location.hasMany(Wastage, { foreignKey: 'locationId' });
Wastage.belongsTo(Location, { foreignKey: 'locationId' });
Wastage.belongsTo(Expense, { foreignKey: 'expenseId' });
Wastage.belongsTo(User, { as: 'creator', foreignKey: 'createdBy' });
Wastage.belongsTo(User, { as: 'approver', foreignKey: 'managerOverrideBy' });

// ── Stock ledger ─────────────────────────────────────────────────
// Every ProductStock quantity change writes a StockMovement (see
// services/stockLedger.js), so stock history covers every path that moves
// stock without each route having to remember. All ProductStock writes in
// this codebase go through instance create/update, which fire these hooks.
StockMovement.belongsTo(Product, { foreignKey: 'productId' });
StockMovement.belongsTo(User, { as: 'creator', foreignKey: 'createdBy' });
ProductAuditLog.belongsTo(User, { as: 'changer', foreignKey: 'changedBy' });
ImportBatch.belongsTo(User, { as: 'creator', foreignKey: 'createdBy' });

ProductStock.addHook('afterCreate', (row, options) =>
  recordStockDelta(row, row.quantity || 0, options, { created: true }));
ProductStock.addHook('afterUpdate', (row, options) => {
  if (!row.changed('quantity')) return undefined;
  const before = parseInt(row.previous('quantity'), 10) || 0;
  return recordStockDelta(row, (row.quantity || 0) - before, options);
});

initStockLedger({ sequelize, StockMovement });

// ── Keep Product.stock in sync with SUM(ProductStock.quantity) ───
// Called explicitly by routes after they mutate ProductStock (and after
// any transaction has committed). An earlier version did this via
// afterCreate/afterUpdate/afterDestroy hooks, but the hook ran inside
// the active transaction context and produced TransactionFinishedError
// cascades — explicit recompute is more predictable.
// ── Cash ledger helper ───────────────────────────────────────────
// Write a CashTransaction tied to a source row. amount is signed:
// positive = money IN, negative = money OUT. Called inline from POS,
// returns, supplier-payment and expense routes — they pass any active
// Sequelize transaction so the ledger entry commits/rolls back with
// the originating operation.
export async function writeCashTxn({
  cashAccountId, amount, source, sourceType = null, sourceId = null,
  reference = null, description = null, date, createdBy = null, transaction = null,
  requireFunds = false,
}) {
  if (!cashAccountId) {
    // Silently dropping a money movement is worse than a noisy log — the
    // daybook and every cash balance would just be quietly wrong.
    console.warn(`[writeCashTxn] no cashAccountId for ${source}/${sourceType}#${sourceId} ` +
      `(${amount}) — movement NOT recorded in the cash ledger`);
    return null;
  }
  // Back-office payments can't spend money an account doesn't hold — a
  // supplier paid from an empty petty cash left it at a negative balance.
  // The account row is locked so two payments can't both pass the check.
  if (requireFunds && amount < 0) {
    const acct = await CashAccount.findByPk(cashAccountId, {
      attributes: ['id', 'name', 'openingBalance'],
      ...(transaction ? { transaction, lock: transaction.LOCK.UPDATE } : {}),
    });
    const sum = await CashTransaction.sum('amount', {
      where: { cashAccountId }, ...(transaction ? { transaction } : {}),
    });
    const balance = (parseFloat(acct?.openingBalance) || 0) + (parseFloat(sum) || 0);
    if (balance + amount < -0.0005) {
      const err = new Error(`Not enough in ${acct?.name || 'that account'} — balance ${balance.toFixed(2)}, need ${(-amount).toFixed(2)}`);
      err.status = 400;
      throw err;
    }
  }
  return CashTransaction.create({
    cashAccountId,
    amount,
    source,
    sourceType,
    sourceId,
    reference,
    description,
    date: date || new Date(),
    createdBy,
  }, transaction ? { transaction } : undefined);
}

// Returns the current balance of a CashAccount:
//   openingBalance + SUM(CashTransaction.amount)
export async function getCashAccountBalance(cashAccountId) {
  const acct = await CashAccount.findByPk(cashAccountId, { attributes: ['openingBalance'] });
  if (!acct) return 0;
  const sum = await CashTransaction.sum('amount', { where: { cashAccountId } });
  return +((parseFloat(acct.openingBalance) || 0) + (sum || 0)).toFixed(3);
}

// Push a stock figure typed into the admin PRODUCT form through to the
// per-location ProductStock rows.
//
// Without this the product form is a trap once multi-location is on:
// Product.stock is a derived rollup that recomputeProductStock() overwrites
// from SUM(ProductStock) after any ERP action, so the edit silently vanishes
// and the till never sees it — the stock has to be re-entered under
// Inventory to have any effect.
//
// Only applied when there is exactly ONE active location. With several, the
// destination is genuinely ambiguous (which branch got the goods?) and
// Inventory / Stock Transfers are the right tools; the caller is told so it
// can say as much rather than discard the number quietly.
//
// Returns 'synced' | 'ambiguous' | 'off'.
export async function syncProductStockFromForm(productId, body = {}) {
  if (process.env.FEATURE_MULTILOC !== 'true') return 'off';
  if (!('stock' in body) && !Array.isArray(body.variants)) return 'off';

  const locations = await Location.findAll({ where: { active: true }, attributes: ['id'] });
  if (locations.length === 0) return 'off';
  if (locations.length > 1) return 'ambiguous';
  const locationId = locations[0].id;

  const product = await Product.findByPk(productId, { attributes: ['id', 'variants'] });
  if (!product) return 'off';

  // A product with variants carries its stock per variant; one without
  // carries a single base figure. Match whichever shape was submitted.
  const targets = Array.isArray(body.variants) && body.variants.length
    ? body.variants.map((v, i) => ({ variantIndex: i, quantity: parseInt(v?.stock, 10) || 0 }))
    : [{ variantIndex: null, quantity: parseInt(body.stock, 10) || 0 }];

  for (const t of targets) {
    const [row] = await ProductStock.findOrCreate({
      where: { productId, variantIndex: t.variantIndex, locationId },
      defaults: { quantity: t.quantity },
    });
    if (row.quantity !== t.quantity) await row.update({ quantity: t.quantity });
  }

  await recomputeProductStock(productId);
  return 'synced';
}

export async function recomputeProductStock(productId) {
  if (!productId) return;
  try {
    const total = await ProductStock.sum('quantity', { where: { productId } });
    const update = { stock: total || 0 };
    // Roll the per-variant rows up into variants[].stock too. The storefront
    // size picker reads that field, so leaving it alone meant a size sold
    // out at the till still showed as available online (and a received
    // size stayed "out of stock").
    const product = await Product.findByPk(productId, { attributes: ['id', 'variants'] });
    if (Array.isArray(product?.variants) && product.variants.length) {
      const rows = await ProductStock.findAll({
        where: { productId },
        attributes: ['variantIndex', [sequelize.fn('SUM', sequelize.col('quantity')), 'qty']],
        group: ['variantIndex'],
        raw: true,
      });
      const byIdx = new Map(rows.map((r) => [r.variantIndex, parseInt(r.qty, 10) || 0]));
      update.variants = product.variants.map((v, i) => ({ ...v, stock: byIdx.get(i) || 0 }));
    }
    await Product.update(update, { where: { id: productId } });
  } catch (err) {
    console.error('[recomputeProductStock]', productId, err.message);
  }
}

// The Location whose ProductStock is the online store's inventory pool.
// Exactly one active location should have isOnlineDefault. Returns its
// id, or null if none is configured.
export async function getOnlineLocationId() {
  try {
    const loc = await Location.findOne({
      where: { isOnlineDefault: true, active: true },
      attributes: ['id'],
    });
    return loc ? loc.id : null;
  } catch (err) {
    console.error('[getOnlineLocationId]', err.message);
    return null;
  }
}

// Map an order item back to its index in product.variants[] by matching
// the stored selected-options against each variant's options (the same
// matching the legacy reduceStock does). Returns null for a base product.
function variantIndexForItem(product, item) {
  const selected = item.variant || item.selectedVariant;
  if (!selected || !Array.isArray(product?.variants) || !product.variants.length) {
    return null;
  }
  // Archived variants (removed in the staff hub) keep their slot so indexes
  // stay stable, but must never match a new order line.
  const idx = product.variants.findIndex(
    (v) => v && !v.archived && v.options && Object.entries(v.options).every(([k, val]) => selected[k] === val)
  );
  return idx >= 0 ? idx : null;
}

// Decrement the online store's inventory pool for a confirmed online sale.
// Returns true when it handled the decrement (multi-location on and an
// online location configured), false so the caller falls back to legacy
// Product.stock behaviour.
//
// Without this, an online sale decrements Product.stock while every ERP
// action calls recomputeProductStock() and overwrites it from
// SUM(ProductStock) — silently reverting the sale and causing oversell.
export async function decrementOnlineStock(order) {
  if (process.env.FEATURE_MULTILOC !== 'true') return false;
  const onlineLocId = await getOnlineLocationId();
  if (!onlineLocId) return false;

  const items = Array.isArray(order.items) ? order.items : [];
  const touched = new Set();
  for (const item of items) {
    if (!item.productId || !item.quantity) continue;
    const product = await Product.findByPk(item.productId, { attributes: ['id', 'variants'] });
    const vIdx = variantIndexForItem(product, item);
    const row = await ProductStock.findOne({
      where: { productId: item.productId, variantIndex: vIdx, locationId: onlineLocId },
    });
    if (row) await row.update({ quantity: Math.max(0, row.quantity - item.quantity) });
    touched.add(item.productId);
  }
  for (const pid of touched) await recomputeProductStock(pid);
  if (!order.locationId) {
    try { await order.update({ locationId: onlineLocId }); } catch { /* non-fatal */ }
  }
  return true;
}

// Return stock to the online pool when an order is cancelled/refunded.
// Mirror of decrementOnlineStock; same true/false fallback contract.
export async function restoreOnlineStock(order) {
  if (process.env.FEATURE_MULTILOC !== 'true') return false;
  const onlineLocId = await getOnlineLocationId();
  if (!onlineLocId) return false;

  const items = Array.isArray(order.items) ? order.items : [];
  const touched = new Set();
  for (const item of items) {
    if (!item.productId || !item.quantity) continue;
    const product = await Product.findByPk(item.productId, { attributes: ['id', 'variants'] });
    const vIdx = variantIndexForItem(product, item);
    const [row] = await ProductStock.findOrCreate({
      where: { productId: item.productId, variantIndex: vIdx, locationId: onlineLocId },
      defaults: { quantity: 0 },
    });
    await row.update({ quantity: row.quantity + item.quantity });
    touched.add(item.productId);
  }
  for (const pid of touched) await recomputeProductStock(pid);
  return true;
}

export {
  User, Product, Order, Coupon, Review, Setting, Category,
  Pincode, AbandonedCart, PriceRequest,
  Location, ProductStock, StockTransfer, CashierSession,
  SalesReturn,
  Supplier, PurchaseOrder, PurchaseReceipt, PurchaseReturn, SupplierPayment,
  CashAccount, CashTransaction, ExpenseCategory, Expense, CashTransfer,
  ActivityLog,
  StockCount, StockCountLine,
  Counter,
  FixedAsset, DepreciationEntry, CapitalEntry,
  Wastage,
  StockMovement, ProductAuditLog, ImportBatch,
};

// ── Activity log + manager-override helpers ─────────────────────
// Write to the audit log. Fire-and-forget — failures are logged but
// don't break the caller. Pass `transaction` to include the entry
// in the active SQL transaction (rolls back together).
export async function logActivity({
  userId, action, entityType = null, entityId = null,
  details = null, managerOverrideBy = null, locationId = null,
  cashierSessionId = null, reason = null, ip = null,
  transaction = null,
}) {
  try {
    return await ActivityLog.create({
      userId, action, entityType, entityId, details,
      managerOverrideBy, locationId, cashierSessionId, reason, ip,
    }, transaction ? { transaction } : undefined);
  } catch (err) {
    console.error('[logActivity]', action, err.message);
    return null;
  }
}

// Verify a manager-override PIN. Accepts admin role implicitly or
// cashier with isManager=true. Returns the approving user or throws.
export async function verifyManagerPin({ userId, pin, transaction = null }) {
  if (!userId || !pin) throw new Error('Manager ID and PIN required');
  const user = await User.findByPk(parseInt(userId, 10), { transaction });
  if (!user) throw new Error('Manager not found');
  const isAuthorised = user.role === 'admin' || (user.role === 'cashier' && user.isManager);
  if (!isAuthorised) throw new Error('User is not a manager');
  if (!user.pin) throw new Error('Manager has no PIN set');
  const ok = await user.comparePin(pin);
  if (!ok) throw new Error('Invalid manager PIN');
  return user;
}
