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
import sequelize from '../config/database.js';

// ── MariaDB JSON-column fix ──────────────────────────────────────
// On MariaDB (common on shared hosts like Hostinger) the JSON type is just a
// LONGTEXT alias, so the driver returns JSON columns as raw STRINGS instead of
// parsed values — which makes `product.images[0]` return "[" and crashes the
// admin edit form. Parse any JSON-typed attribute that came back as a string
// after every query. No-op on MySQL, where values arrive already parsed.
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
}) {
  if (!cashAccountId) return null;
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

export async function recomputeProductStock(productId) {
  if (!productId) return;
  try {
    const total = await ProductStock.sum('quantity', { where: { productId } });
    await Product.update({ stock: total || 0 }, { where: { id: productId } });
  } catch (err) {
    console.error('[recomputeProductStock]', productId, err.message);
  }
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
