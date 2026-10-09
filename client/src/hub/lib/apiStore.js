import { get, send, qk } from './api';

/**
 * Online-store screens (coupons, reviews, abandoned carts, B2B quotes, theme
 * & banners, categories). All reuse the classic store-admin endpoints, which
 * the server gates on the classic area keys (`access.legacy`).
 */
export const sk = {
  coupons: [...qk.all, 'store', 'coupons'],
  reviews: [...qk.all, 'store', 'reviews'],
  abandonedAll: [...qk.all, 'store', 'abandoned'],
  abandoned: (status) => [...qk.all, 'store', 'abandoned', status],
  b2bAll: [...qk.all, 'store', 'b2b'],
  b2b: (status) => [...qk.all, 'store', 'b2b', status],
  categories: [...qk.all, 'store', 'categories'],
  productNames: [...qk.all, 'store', 'product-names'],
  gateways: [...qk.all, 'store', 'gateways'],
  setting: (name) => [...qk.all, 'store', 'setting', name],
};

/* ------------------------------ lookups ------------------------------ */
export const storeCategoriesQuery = { queryKey: sk.categories, queryFn: () => get('/categories/all') };
export const productNamesQuery = {
  queryKey: sk.productNames,
  queryFn: async () => (await get('/products/admin/all?limit=10000')).products ?? [],
  staleTime: 60_000,
};
export const gatewaysQuery = { queryKey: sk.gateways, queryFn: () => get('/payment/gateways'), staleTime: 60_000 };

/* ------------------------------ coupons ------------------------------ */
export const couponsQuery = { queryKey: sk.coupons, queryFn: () => get('/coupons') };
export const saveCoupon = (id, payload) => (id ? send('put', `/coupons/${id}`, payload) : send('post', '/coupons', payload));
export const deleteCoupon = (id) => send('delete', `/coupons/${id}`);

/* ------------------------------ reviews ------------------------------ */
export const reviewsQuery = { queryKey: sk.reviews, queryFn: async () => (await get('/reviews/all')).reviews ?? [] };
export const addReview = (input) => send('post', '/reviews/admin', input);
export const toggleReviewApproval = (id) => send('put', `/reviews/${id}/approve`);
export const deleteReview = (id) => send('delete', `/reviews/${id}`);

/* --------------------------- abandoned carts --------------------------- */
export const abandonedQuery = (status) => ({
  queryKey: sk.abandoned(status),
  queryFn: () => get(`/abandoned-cart?status=${status}`),
});
export const sendRecoveryEmail = (id) => send('post', `/abandoned-cart/${id}/send`);
export const deleteAbandonedCart = (id) => send('delete', `/abandoned-cart/${id}`);

/* ------------------------------ B2B quotes ------------------------------ */
export const b2bQuotesQuery = (status) => ({
  queryKey: sk.b2b(status),
  queryFn: () => get(`/b2b/requests${status ? `?status=${status}` : ''}`),
});
export const setQuoteStatus = (id, status) => send('patch', `/b2b/requests/${id}/status`, { status });
export const sendQuote = (id, payload) => send('patch', `/b2b/requests/${id}/quote`, payload);
export const markQuotePaid = (id) => send('patch', `/b2b/requests/${id}/mark-paid`);

/* --------------------------- theme & banners --------------------------- */
export const settingQuery = (name) => ({ queryKey: sk.setting(name), queryFn: () => get(`/settings/${name}`) });
export const saveSetting = (name, body) => send('put', `/settings/${name}`, body);

/* ------------------------------ categories ------------------------------ */
export const saveCategory = (id, payload) =>
  id ? send('put', `/categories/${id}`, payload) : send('post', '/categories', payload);
export const deleteCategory = (id) => send('delete', `/categories/${id}`);
