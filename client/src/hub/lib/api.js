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
