/**
 * FEMNIA Hub permission catalogue — the staff back office at /hub.
 *
 * Keys, labels, hints and presets are taken verbatim from the FEMNIA Hub
 * design the hub replicates. Admins implicitly hold every key. Staff hold an
 * explicit list in User.permissions; delivery staff normally hold only
 * `delivery.my_deliveries`.
 *
 * The client fetches this catalogue from GET /api/hub/permission-catalogue,
 * so this file is the single source of truth.
 */

export const PERMISSION_GROUPS = [
  {
    group: 'Dashboard',
    items: [
      { key: 'dashboard.view', label: 'View dashboard' },
      { key: 'dashboard.sales_values', label: 'View sales values' },
      { key: 'dashboard.profit_values', label: 'View profit / cost values' },
    ],
  },
  {
    group: 'Products',
    items: [
      { key: 'products.view', label: 'View products' },
      { key: 'products.add', label: 'Add products' },
      { key: 'products.edit', label: 'Edit product details' },
      { key: 'products.images', label: 'Upload product images' },
      { key: 'products.edit_price', label: 'Edit selling price' },
      { key: 'products.edit_cost', label: 'Edit cost price' },
      { key: 'products.view_cost', label: 'View cost values', hint: 'Cost is removed from data when off' },
      { key: 'products.deactivate', label: 'Deactivate products' },
      { key: 'products.barcodes', label: 'Print product barcode labels' },
    ],
  },
  {
    group: 'Inventory',
    items: [
      { key: 'inventory.view', label: 'View inventory' },
      { key: 'inventory.stock_in', label: 'Add Stock In' },
      { key: 'inventory.stock_out', label: 'Add manual Stock Out' },
      { key: 'inventory.adjust', label: 'Adjust stock' },
      { key: 'inventory.view_history', label: 'View stock history' },
      { key: 'inventory.export', label: 'Export inventory' },
      { key: 'suppliers.manage', label: 'Manage suppliers' },
      { key: 'inventory.batch_edit', label: 'Correct batch details', hint: 'Batch, country and wholesaler only — never quantities' },
      { key: 'inventory.reverse', label: 'Reverse stock transaction' },
    ],
  },
  {
    group: 'Orders & POS',
    items: [
      { key: 'orders.create', label: 'Create orders' },
      { key: 'orders.confirm', label: 'Confirm orders' },
      { key: 'orders.view_all', label: 'View all orders' },
      { key: 'orders.view_own', label: 'View only own orders' },
      { key: 'orders.update_delivery', label: 'Update delivery / pickup status' },
      { key: 'orders.cancellations', label: 'Process cancellations' },
      { key: 'orders.returns', label: 'Process returns' },
      { key: 'orders.edit_prices', label: 'Correct confirmed order prices', hint: 'Admin level correction with reason and audit' },
    ],
  },
  {
    group: 'Delivery',
    items: [
      { key: 'delivery.view', label: 'View the delivery board' },
      { key: 'delivery.assign', label: 'Assign deliveries to delivery staff' },
      {
        key: 'delivery.my_deliveries',
        label: 'See only my own deliveries',
        hint: 'For delivery staff — no inventory, reports or settings access',
      },
    ],
  },
  {
    group: 'Payments',
    items: [
      { key: 'payments.view', label: 'View payment details' },
      { key: 'payments.edit', label: 'Edit payment details' },
      { key: 'payments.audit', label: 'View payment audit history' },
      { key: 'payments.refunds', label: 'Process refunds' },
    ],
  },
  {
    group: 'Customers',
    items: [
      { key: 'customers.view', label: 'View customers' },
      { key: 'customers.add', label: 'Add customers' },
      { key: 'customers.edit', label: 'Edit customers' },
      { key: 'customers.history', label: 'View customer order history' },
    ],
  },
  {
    group: 'Invoices & Labels',
    items: [
      { key: 'invoices.view', label: 'View invoices' },
      { key: 'invoices.download', label: 'Download invoice PDF' },
      { key: 'invoices.print', label: 'Print invoices' },
      { key: 'invoices.labels', label: 'Download delivery labels' },
      { key: 'invoices.labels_print', label: 'Print / reprint labels' },
    ],
  },
  {
    group: 'Expenses & Assets',
    items: [
      { key: 'expenses.view', label: 'View expenses' },
      { key: 'expenses.add', label: 'Add expenses' },
      { key: 'expenses.edit', label: 'Edit expenses' },
      { key: 'assets.view', label: 'View assets' },
      { key: 'assets.add', label: 'Add assets' },
      { key: 'assets.edit', label: 'Edit assets' },
      { key: 'liabilities.view', label: 'View pending liabilities' },
      { key: 'liabilities.reimburse', label: 'Record reimbursements' },
      { key: 'liabilities.settle', label: 'Settle liabilities' },
    ],
  },
  {
    group: 'Reports',
    items: [
      { key: 'reports.operational', label: 'View operational reports' },
      { key: 'reports.financial', label: 'View financial reports' },
      { key: 'reports.export', label: 'Export reports' },
    ],
  },
  {
    group: 'Imports',
    items: [
      { key: 'imports.new_products', label: 'Import new products' },
      { key: 'imports.stock_in', label: 'Import Stock In' },
      { key: 'imports.mixed', label: 'Import mixed product files', hint: 'Admin level workflow' },
      { key: 'imports.templates', label: 'Download import templates' },
      { key: 'imports.history', label: 'View import history' },
      { key: 'imports.error_report', label: 'Download error reports' },
      { key: 'imports.reverse', label: 'Reverse imports' },
    ],
  },
  {
    group: 'Settings & Administration',
    items: [
      { key: 'admin.manage_staff', label: 'Manage staff' },
      { key: 'admin.change_permissions', label: 'Change permissions' },
      { key: 'admin.settings', label: 'Manage business settings' },
      { key: 'admin.view_audit', label: 'View full audit logs' },
    ],
  },
];

export const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => i.key));

export const PERMISSION_PRESETS = {
  'Sales Staff': [
    'dashboard.view', 'products.view', 'inventory.view', 'orders.create', 'orders.confirm',
    'orders.view_all', 'orders.update_delivery', 'delivery.view', 'customers.view', 'customers.add',
    'customers.history', 'invoices.view', 'invoices.print', 'invoices.labels', 'invoices.labels_print',
    'payments.view',
  ],
  'Inventory Staff': [
    'dashboard.view', 'products.view', 'inventory.view', 'inventory.stock_in', 'inventory.stock_out',
    'inventory.view_history', 'inventory.export',
  ],
  'Delivery Staff': ['delivery.my_deliveries'],
  Manager: [
    'dashboard.view', 'dashboard.sales_values', 'products.view', 'products.add', 'products.edit',
    'products.images', 'products.edit_price', 'products.view_cost', 'inventory.view', 'inventory.stock_in',
    'inventory.stock_out', 'inventory.view_history', 'inventory.export', 'orders.create', 'orders.confirm',
    'orders.view_all', 'orders.update_delivery', 'orders.cancellations', 'orders.returns', 'payments.view',
    'payments.edit', 'payments.audit', 'customers.view', 'customers.add', 'customers.edit',
    'customers.history', 'invoices.view', 'invoices.download', 'invoices.print', 'invoices.labels',
    'invoices.labels_print', 'reports.operational',
  ],
};

export const PRESET_NAMES = ['Sales Staff', 'Inventory Staff', 'Delivery Staff', 'Manager', 'Custom'];

/** Roles that sign in to the hub (customers and POS cashiers do not). */
export const HUB_ROLES = ['admin', 'staff', 'delivery'];

/**
 * The old admin (/admin, /admin/erp) gates routes on 8 coarse keys. Until it
 * is retired, a hub permission implies the legacy key that covers it, so
 * staff created in the hub can still reach the endpoints those screens use.
 */
const LEGACY_EQUIVALENTS = {
  products: ['products.', 'inventory.', 'suppliers.', 'imports.'],
  orders: ['orders.', 'delivery.view', 'delivery.assign', 'invoices.', 'payments.'],
  customers: ['customers.'],
  analytics: ['reports.', 'dashboard.sales_values', 'dashboard.profit_values', 'expenses.', 'assets.', 'liabilities.'],
  settings: ['admin.settings'],
  categories: ['products.edit', 'products.add'],
  coupons: ['admin.settings'],
  reviews: ['products.edit'],
};

/** True when the user holds `key`, either directly or via a hub key that implies it. */
export function hasPermission(user, key) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const perms = Array.isArray(user.permissions) ? user.permissions : [];
  if (perms.includes(key)) return true;
  const implied = LEGACY_EQUIVALENTS[key];
  return Boolean(implied && perms.some((p) => implied.some((prefix) => p === prefix || (prefix.endsWith('.') && p.startsWith(prefix)))));
}

/** Hub access summary for the signed-in user (the client's `accessQuery`). */
export function accessFor(user) {
  const isAdmin = user.role === 'admin';
  const perms = Array.isArray(user.permissions) ? user.permissions : [];
  return {
    id: user.id,
    fullName: user.name,
    email: user.email,
    username: user.username || null,
    phone: user.phone || null,
    roles: [user.role],
    isAdmin,
    status: user.status || 'active',
    mustChangePassword: Boolean(user.mustChangePassword),
    permissions: isAdmin ? ALL_PERMISSIONS : perms.filter((p) => ALL_PERMISSIONS.includes(p)),
  };
}

/** Their password rule: 8–72 characters with at least one letter and one digit. */
export function passwordProblem(pw) {
  const s = String(pw || '');
  if (s.length < 8) return 'Use at least 8 characters.';
  if (s.length > 72) return 'Use 72 characters or fewer.';
  if (!/[A-Za-z]/.test(s) || !/[0-9]/.test(s)) return 'Include at least one letter and one number.';
  return null;
}
