import api from '@/api/axios';

/** Query keys all start with "femnia" so a mutation can invalidate the lot. */
export const qk = {
  all: ['femnia'],
  access: ['femnia', 'access'],
  permissionCatalogue: ['femnia', 'permission-catalogue'],
  products: ['femnia', 'products'],
  product: (key) => ['femnia', 'product', key],
  productHistory: (key) => ['femnia', 'product-history', key],
  productLock: (key) => ['femnia', 'product-lock', key],
  skuBatches: (key) => ['femnia', 'sku-batches', key],
  batchIndex: ['femnia', 'batch-index'],
  suppliers: ['femnia', 'suppliers'],
  stockIn: ['femnia', 'stock-in'],
  stockOut: ['femnia', 'stock-out'],
  importBatches: ['femnia', 'import-batches'],
  dashboard: ['femnia', 'dashboard'],
  activity: ['femnia', 'activity'],
  appSettings: ['femnia', 'app-settings'],
  orders: ['femnia', 'orders'],
  order: (id) => ['femnia', 'order', id],
  orderAudit: (id) => ['femnia', 'order-audit', id],
  customers: ['femnia', 'customers'],
  customerRecords: ['femnia', 'customer-records'],
  customerHistory: (id) => ['femnia', 'customer-history', id],
  customerPurchases: (id) => ['femnia', 'customer-purchases', id],
  deliveryStaff: ['femnia', 'delivery-staff'],
  myDeliveries: ['femnia', 'my-deliveries'],
  deliveryPaymentModes: ['femnia', 'delivery-payment-modes'],
  staff: ['femnia', 'staff'],
  cataloguePreview: ['femnia', 'catalogue-preview'],
  expenses: ['femnia', 'expenses'],
  assets: ['femnia', 'assets'],
  liabilities: ['femnia', 'liabilities'],
  fundingAccounts: ['femnia', 'funding-accounts'],
};

const get = async (url) => (await api.get(url)).data;

/** Who is signed in to the hub and what they may do (GET /api/hub/access). */
export const accessQuery = {
  queryKey: qk.access,
  queryFn: () => get('/hub/access'),
  staleTime: 5 * 60_000,
  retry: false,
};

export const permissionCatalogueQuery = {
  queryKey: qk.permissionCatalogue,
  queryFn: () => get('/hub/permission-catalogue'),
  staleTime: Infinity,
};

/** Every SKU (product × variant) with live stock — the hub's "products" list. */
export const productsQuery = { queryKey: qk.products, queryFn: () => get('/hub/skus'), staleTime: 30_000 };
export const productQuery = (key) => ({ queryKey: qk.product(key), queryFn: () => get(`/hub/skus/${key}`) });
export const productHistoryQuery = (key) => ({
  queryKey: qk.productHistory(key),
  queryFn: () => get(`/hub/skus/${key}/history`),
});
export const productLockQuery = (key) => ({ queryKey: qk.productLock(key), queryFn: () => get(`/hub/skus/${key}/lock`) });
export const skuBatchesQuery = (key) => ({
  queryKey: qk.skuBatches(key),
  queryFn: () => get(`/hub/skus/${key}/batches`),
  staleTime: 30_000,
});
/** { labels: {key: ["Batch 1 UAE", …]}, numbers: {key: ["Batch 1", …]} } */
export const batchIndexQuery = { queryKey: qk.batchIndex, queryFn: () => get('/hub/batches') };
export const suppliersQuery = { queryKey: qk.suppliers, queryFn: () => get('/hub/suppliers') };
export const stockInQuery = { queryKey: qk.stockIn, queryFn: () => get('/hub/stock-in') };
export const stockOutQuery = { queryKey: qk.stockOut, queryFn: () => get('/hub/stock-out') };
export const importBatchesQuery = { queryKey: qk.importBatches, queryFn: () => get('/hub/imports') };

/** Human message from an axios error (server `message`), or the fallback. */
export function errorMessage(err, fallback = 'Something went wrong') {
  return err?.response?.data?.message || err?.message || fallback;
}

/** Rejects with an Error whose message is the server's, so callers can toast it. */
async function send(method, url, body) {
  try {
    return (await api.request({ method, url, data: body })).data;
  } catch (err) {
    throw new Error(errorMessage(err));
  }
}

/* ------------------------------ account ------------------------------ */
export const hubSignUp = ({ name, email, password }) => send('post', '/hub/signup', { name, email, password });
export const sendPasswordReset = (email) => send('post', '/auth/forgot-password', { email });
export const resetPasswordWithToken = ({ email, token, password }) =>
  send('post', '/auth/reset-password', { email, token, password });
export const changePassword = (currentPassword, newPassword) =>
  send('post', '/auth/change-password', { currentPassword, newPassword });
export const completeForcedPasswordChange = (password) => send('post', '/auth/forced-password', { password });

/* ------------------------------ catalogue ------------------------------ */
export const nextProductCodes = (count) => get(`/hub/product-codes/next?count=${Math.max(1, count)}`);
export const createProductVariants = (input) => send('post', '/hub/products', input);
export const updateProduct = (key, input) => send('put', `/hub/skus/${key}`, input);
export const setProductActive = (key, isActive) => send('post', `/hub/skus/${key}/active`, { isActive });
export const deleteProduct = (key) => send('delete', `/hub/skus/${key}`);
export const adjustStock = (key, input) => send('post', `/hub/skus/${key}/adjust`, input);
export const updateOpeningStockBatch = (key, input, reason) =>
  send('patch', `/hub/skus/${key}/opening-batch`, { ...input, reason });
export const updateStockInBatch = (id, input, reason) => send('patch', `/hub/stock-in/${id}/batch`, { ...input, reason });
export const createSupplier = (name) => send('post', '/hub/suppliers', { name });
export const confirmStockIn = (input) => send('post', '/hub/stock-in', input);
export const confirmStockOut = (input) => send('post', '/hub/stock-out', input);

/** Uploads an image through the shared upload route (WebP-converted); returns its URL. */
export async function uploadProductImage(file) {
  const form = new FormData();
  form.append('image', file);
  try {
    return (await api.post('/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } })).data.url;
  } catch (err) {
    throw new Error(errorMessage(err, 'Upload image failed'));
  }
}

/* ------------------------------- imports ------------------------------- */
export const findBatchByHash = (hash) => get(`/hub/imports/by-hash/${hash}`);
export const confirmImport = (kind, args) => send('post', `/hub/imports/${kind}`, args);
export const reverseImport = async (id, reason) => (await send('post', `/hub/imports/${id}/reverse`, { reason })).note;

/* -------------------------------- sales -------------------------------- */
const orderUrl = (id, rest = '') => `/hub/orders/${encodeURIComponent(id)}${rest}`;

export const appSettingsQuery = { queryKey: qk.appSettings, queryFn: () => get('/hub/settings'), staleTime: 60_000 };
export const ordersQuery = { queryKey: qk.orders, queryFn: () => get('/hub/orders'), staleTime: 15_000 };
export const salesOrderQuery = (id) => ({ queryKey: qk.order(id), queryFn: () => get(orderUrl(id)), enabled: Boolean(id) });
export const orderAuditQuery = (id) => ({
  queryKey: qk.orderAudit(id),
  queryFn: () => get(orderUrl(id, '/audit')),
  enabled: Boolean(id),
});
/** Customer directory with order stats (also feeds the order-form picker). */
export const customerRecordsQuery = { queryKey: qk.customerRecords, queryFn: () => get('/hub/customers'), staleTime: 30_000 };
export const customersQuery = customerRecordsQuery;
export const customerHistoryQuery = (id) => ({
  queryKey: qk.customerHistory(id),
  queryFn: () => get(`/hub/customers/${id}/history`),
  enabled: Boolean(id),
});
export const customerPurchasesQuery = (id) => ({
  queryKey: qk.customerPurchases(id),
  queryFn: () => get(`/hub/customers/${id}/purchases`),
  enabled: Boolean(id),
});

export const newIdempotencyKey = () => `idem-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;

export function whatsappLink(phone) {
  const digits = (phone ?? '').replace(/[^\d]/g, '');
  const withCountry = digits.startsWith('974') ? digits : `974${digits.replace(/^0+/, '')}`;
  return `https://wa.me/${withCountry}`;
}

/** Draft save: no stock movement. Resolves { orderId }. */
export const saveSalesOrderDraft = (input) => send('post', '/hub/orders/draft', input);
/** The one action that deducts stock; idempotent on input.idempotencyKey. Resolves { order, duplicate }. */
export const confirmSalesOrder = (input) => send('post', '/hub/orders/confirm', input);
export const updateFulfilmentAndPayment = ({ orderId, ...patch }) => send('patch', orderUrl(orderId, '/fulfilment'), patch);
export const updateOrderContact = ({ orderId, ...patch }) => send('patch', orderUrl(orderId, '/contact'), patch);
export const correctOrderPricing = ({ orderId, ...input }) => send('post', orderUrl(orderId, '/correct-prices'), input);
export const processOrderReturn = (orderId, lines) => send('post', orderUrl(orderId, '/returns'), { lines });
export const cancelSalesOrder = (orderId, reason, restock) => send('post', orderUrl(orderId, '/cancel'), { reason, restock });
export const recordInvoicePrint = (orderId) => send('post', orderUrl(orderId, '/invoice-print'));
export const recordLabelPrint = async (orderId, labelSize) =>
  (await send('post', orderUrl(orderId, '/label-print'), { labelSize })).printCount;

/* ------------------------------ customers ------------------------------ */
export const findCustomerByPhone = (phone) => get(`/hub/customers/lookup?phone=${encodeURIComponent(phone)}`);
/** New Sales Order: reuses the customer already on that mobile number. Resolves { customer, existed }. */
export const createOrReuseCustomer = (input) => send('post', '/hub/customers', { ...input, reuse: true });
export const createCustomerRecord = async (input) => (await send('post', '/hub/customers', input)).customer;
export const updateCustomerRecord = (id, input) => send('put', `/hub/customers/${id}`, input);

/* ------------------------------- delivery ------------------------------- */
export const deliveryStaffQuery = { queryKey: qk.deliveryStaff, queryFn: () => get('/hub/delivery/staff'), staleTime: 60_000 };
/** The signed-in delivery staff member's own deliveries (safe fields only). */
export const myDeliveriesQuery = { queryKey: qk.myDeliveries, queryFn: () => get('/hub/delivery/mine'), staleTime: 10_000 };
export const deliveryPaymentModesQuery = {
  queryKey: qk.deliveryPaymentModes,
  queryFn: () => get('/hub/delivery/payment-modes'),
  staleTime: 300_000,
};
/** input: { orderId, status, paymentStatus, paymentMode, amountCollected, note } */
export const updateMyDelivery = ({ orderId, ...input }) =>
  send('post', `/hub/delivery/${encodeURIComponent(orderId)}/update`, input);
/* ------------------------------ admin ------------------------------ */
export const staffQuery = { queryKey: qk.staff, queryFn: () => get('/hub/staff') };
export const activityQuery = { queryKey: qk.activity, queryFn: () => get('/hub/activity?limit=200') };
/** Username + temporary password account. Resolves { ok, userId, username, temporaryPassword }. */
export const createStaffAccount = (input) => send('post', '/hub/staff', input);
/** Email invitation (needs SMTP on the server). Resolves { ok, userId }. */
export const inviteStaff = (input) => send('post', '/hub/staff/invite', input);
/** Resolves { ok, temporaryPassword }. */
export const resetStaffPassword = (userId, password) =>
  send('post', `/hub/staff/${userId}/reset-password`, password ? { password } : {});
export const setStaffStatus = (member, status) => send('patch', `/hub/staff/${member.id}/status`, { status });
export const setStaffRole = (member, role) => send('patch', `/hub/staff/${member.id}/role`, { role });
/** Resolves { added, removed }. */
export const setStaffPermissions = (member, permissions) =>
  send('put', `/hub/staff/${member.id}/permissions`, { permissions });
/** Resolves { changed, settings }. */
export const saveAppSettings = (next) => send('put', '/hub/settings', next);
export const saveDeliveryPaymentModes = (modes) => send('put', '/hub/settings/delivery-payment-modes', { modes });
/** { sheets: [{ name, rows: [object] }] } — read-only export. */
export const fetchBackup = () => get('/hub/backup');
export const cataloguePreviewQuery = { queryKey: qk.cataloguePreview, queryFn: () => get('/hub/catalogue-replace/preview') };
export const replaceCatalogue = (args) => send('post', '/hub/catalogue-replace', args);
export const rollbackCatalogueReplacement = (run) =>
  send('post', `/hub/catalogue-replace/${encodeURIComponent(run.reference)}/rollback`);

/* --------------------------- dashboard & reports --------------------------- */
export const dashboardQuery = { queryKey: qk.dashboard, queryFn: () => get('/hub/dashboard'), staleTime: 30_000 };
/** Cost recorded at the time of sale, keyed `orderId|sku`. */
export const saleCostsQuery = { queryKey: ['femnia', 'sale-costs'], queryFn: () => get('/hub/reports/sale-costs'), staleTime: 30_000 };
/** Same figures as the classic P&L for the range (needs reports.financial). */
export const financialSummaryQuery = (from, to, enabled = true) => ({
  queryKey: ['femnia', 'financial-summary', from, to],
  queryFn: () => get(`/hub/reports/financial-summary?from=${from}&to=${to}`),
  enabled: Boolean(enabled && from && to),
});

/* ------------------------- expenses & assets ------------------------- */
export const expensesQuery = { queryKey: qk.expenses, queryFn: () => get('/hub/expenses?type=expense') };
export const assetsQuery = { queryKey: qk.assets, queryFn: () => get('/hub/expenses?type=asset') };
export const liabilitiesQuery = { queryKey: qk.liabilities, queryFn: () => get('/hub/liabilities') };
/** { sources: [{source, mapped, cashAccountId, cashAccountName, balance}], accounts: [{id, name, type}] (admins only) } */
export const fundingAccountsQuery = { queryKey: qk.fundingAccounts, queryFn: () => get('/hub/finance/funding-accounts') };
export const saveFundingAccounts = (mapping) => send('put', '/hub/finance/funding-accounts', { mapping });
/** Resolves { entry, liabilityCreated, liabilityPerson }. */
export const saveEntry = (input) => send('post', '/hub/expenses', input);
export const updatePurchasedBy = async (entry, purchasedBy) =>
  (await send('patch', `/hub/expenses/${entry.id}/purchased-by`, { purchasedBy })).purchasedBy;
/** input: { liabilityId, paidOn, amount, paymentMethod, fundingSource?, reference, notes, idempotencyKey }. Resolves the updated liability. */
export const recordReimbursement = ({ liabilityId, ...input }) => send('post', `/hub/liabilities/${liabilityId}/reimburse`, input);

/** Assigns (or clears, with a null staff id) one or more deliveries. Resolves { ok, updated }. */
export const assignDeliveries = (orderIds, staffId) => {
  if (!orderIds.length) return Promise.reject(new Error('Select at least one delivery first.'));
  return send('post', '/hub/delivery/assign', { orderIds, staffId });
};

