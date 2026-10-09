/**
 * Where each retired screen lives now. The ERP (/admin/erp?tab=…) and the
 * interim hub wrappers (/hub/m/:screen, /hub/s/:screen) were rebuilt as
 * native hub pages; old links and bookmarks redirect through this map.
 */

// Classic ERP tab (/admin/erp?tab=…) → hub page.
export const ERP_TAB_TO_HUB = {
  overview: '/hub/dashboard',
  products: '/hub/products',
  categories: '/hub/categories',
  inventory: '/hub/inventory?tab=locations',
  locations: '/hub/settings?tab=locations',
  transfers: '/hub/transfers',
  'stock-counts': '/hub/stock-counts',
  'stock-count-detail': '/hub/stock-counts',
  'variance-report': '/hub/stock-counts',
  'barcode-labels': '/hub/products',
  wastage: '/hub/wastage',
  reorder: '/hub/inventory?tab=reorder',
  suppliers: '/hub/purchasing?tab=suppliers',
  'purchase-orders': '/hub/purchasing?tab=orders',
  'purchase-returns': '/hub/purchasing?tab=returns',
  'supplier-purchases': '/hub/reports?tab=purchases',
  'cash-accounts': '/hub/cash?tab=accounts',
  expenses: '/hub/expenses',
  'cash-transfers': '/hub/cash?tab=transfers',
  'daily-cash': '/hub/cash?tab=daily',
  daybook: '/hub/cash?tab=daybook',
  'fixed-assets': '/hub/expenses',
  capital: '/hub/expenses',
  pnl: '/hub/reports?tab=pnl',
  'balance-sheet': '/hub/reports?tab=balance-sheet',
  'stock-value': '/hub/reports?tab=stock-value',
  'pos-reports': '/hub/pos-admin?tab=reports',
  returns: '/hub/pos-admin?tab=returns',
  cashiers: '/hub/pos-admin?tab=cashiers',
  'sales-report': '/hub/reports?tab=sales-analysis',
  'fast-moving': '/hub/reports?tab=fast-moving',
  'dead-stock': '/hub/reports?tab=dead-stock',
  'activity-log': '/hub/staff?tab=activity',
  backup: '/hub/settings',
};

// Interim hub wrapper screens (/hub/m/:screen) → their ERP tab.
const M_SCREEN_TAB = {
  'stock-on-hand': 'inventory', 'barcode-printer': 'barcode-labels', 'purchase-report': 'supplier-purchases',
  'till-returns': 'returns', 'backup-restore': 'backup',
};

export function hubPathForMScreen(screen) {
  return ERP_TAB_TO_HUB[M_SCREEN_TAB[screen] || screen] || '/hub/dashboard';
}

// Interim store wrapper screens (/hub/s/:screen) → native Online Store tab.
const S_SCREEN_TAB = { 'abandoned-carts': 'abandoned', 'b2b-quotes': 'b2b', reviews: 'reviews', coupons: 'coupons', theme: 'theme' };

export function hubPathForSScreen(screen) {
  return `/hub/store${S_SCREEN_TAB[screen] ? `?tab=${S_SCREEN_TAB[screen]}` : ''}`;
}
