/**
 * Our ERP screens, each its own hub page at /hub/m/:screen (pages/Erp.jsx
 * rendered embedded). `need` is the classic area key the server gates the
 * screen's API on (checked against accessFor().legacy); `admin` screens are
 * Admin-only; `multiloc` screens exist only with multi-location inventory on.
 */
export const ERP_SCREENS = {
  'stock-on-hand': { tab: 'inventory', title: 'Stock by Location', subtitle: 'Stock per branch, with bulk adjustments.', need: 'products', multiloc: true },
  locations: { tab: 'locations', title: 'Locations', subtitle: 'Store branches, warehouses and the online default.', need: 'products', multiloc: true },
  transfers: { tab: 'transfers', title: 'Stock Transfers', subtitle: 'Move stock between locations: create, dispatch, complete.', need: 'products', multiloc: true },
  'stock-counts': { tab: 'stock-counts', title: 'Stock Counts', subtitle: 'Count stock on the shelf and post the variance.', need: 'products', multiloc: true },
  wastage: { tab: 'wastage', title: 'Wastage', subtitle: 'Damaged, defective or expired stock written off.', need: 'products', multiloc: true },
  reorder: { tab: 'reorder', title: 'Reorder', subtitle: 'Products at or below their reorder level.', need: 'products' },
  categories: { tab: 'categories', title: 'Categories', subtitle: 'Storefront categories: names, images, order and Arabic names.', need: 'categories' },
  'barcode-printer': { tab: 'barcode-labels', title: 'Label Printer', subtitle: 'Roll and sheet labels, direct USB thermal printing, Arabic names.', need: 'products', multiloc: true },
  suppliers: { tab: 'suppliers', title: 'Suppliers', subtitle: 'Supplier records, balances and linked products.', need: 'products', multiloc: true },
  'purchase-orders': { tab: 'purchase-orders', title: 'Purchase Orders', subtitle: 'Order from suppliers, pay and receive stock at landed cost.', need: 'products', multiloc: true },
  'purchase-returns': { tab: 'purchase-returns', title: 'Purchase Returns', subtitle: 'Goods sent back to suppliers.', need: 'products', multiloc: true },
  'cash-accounts': { tab: 'cash-accounts', title: 'Cash Accounts', subtitle: 'Drawers, petty cash and bank accounts with live balances.', need: 'analytics', multiloc: true },
  'cash-transfers': { tab: 'cash-transfers', title: 'Cash Transfers', subtitle: 'Move money between accounts.', need: 'analytics', multiloc: true },
  'daily-cash': { tab: 'daily-cash', title: 'Daily Cash', subtitle: 'Reconcile the day’s cash by account and location.', need: 'analytics', multiloc: true },
  daybook: { tab: 'daybook', title: 'Daybook', subtitle: 'Every money movement on a day.', need: 'analytics', multiloc: true },
  'fixed-assets': { tab: 'fixed-assets', title: 'Fixed Assets', subtitle: 'Assets at cost, depreciation schedule and disposals.', need: 'analytics', multiloc: true },
  capital: { tab: 'capital', title: 'Owner Capital', subtitle: 'Contributions and drawings.', need: 'analytics', multiloc: true },
  pnl: { tab: 'pnl', title: 'Profit & Loss', subtitle: 'Cash-basis P&L with revenue, expenses and depreciation by category.', need: 'analytics', multiloc: true },
  'balance-sheet': { tab: 'balance-sheet', title: 'Balance Sheet', subtitle: 'Assets, liabilities and equity on a date.', need: 'analytics', multiloc: true },
  'stock-value': { tab: 'stock-value', title: 'Stock Value', subtitle: 'Inventory at cost and retail, by location and product.', need: 'analytics', multiloc: true },
  'sales-report': { tab: 'sales-report', title: 'Sales Report', subtitle: 'Sales by day, product, category, channel or location.', need: 'analytics' },
  'fast-moving': { tab: 'fast-moving', title: 'Fast Moving', subtitle: 'Best sellers and days of cover.', need: 'analytics' },
  'dead-stock': { tab: 'dead-stock', title: 'Dead Stock', subtitle: 'Stock that hasn’t sold.', need: 'analytics' },
  'purchase-report': { tab: 'supplier-purchases', title: 'Purchase Report', subtitle: 'Purchases by supplier.', need: 'analytics', multiloc: true },
  'pos-reports': { tab: 'pos-reports', title: 'POS Reports', subtitle: 'Daily till report, cashier and location totals, top items.', need: 'analytics', multiloc: true },
  'till-returns': { tab: 'returns', title: 'Till Returns', subtitle: 'Returns and refunds taken at the till.', need: 'orders', multiloc: true },
  cashiers: { tab: 'cashiers', title: 'Cashiers & Shifts', subtitle: 'Till users, PINs, managers, shifts and X/Z reports.', admin: true, multiloc: true },
  'activity-log': { tab: 'activity-log', title: 'Activity Log', subtitle: 'Who did what, with filters and manager overrides.', need: 'analytics', multiloc: true },
  'backup-restore': { tab: 'backup', title: 'Backup & Restore', subtitle: 'Full database backup (.sql) and restore.', admin: true },
};

const MULTILOC = import.meta.env.VITE_FEATURE_MULTILOC === 'true';

/** Whether the signed-in hub user may open an ERP screen. */
export function canOpenScreen(access, key) {
  const s = ERP_SCREENS[key];
  if (!s || !access || access.status !== 'active') return false;
  if (s.multiloc && !MULTILOC) return false;
  if (access.isAdmin) return true;
  if (s.admin) return false;
  return Boolean(access.legacy?.includes(s.need));
}
