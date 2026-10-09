import { get, send } from './api';

/**
 * Multi-location inventory operations (locations, per-location stock,
 * transfers, stock counts, wastage, reorder). These reuse the ERP's own
 * endpoints, so the hub and the classic back office share one source of truth.
 */
const qs = (params = {}) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== '' && v != null) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const ik = {
  locations: ['femnia', 'inv-locations'],
  locationStock: ['femnia', 'inv-location-stock'],
  reorder: (params) => ['femnia', 'inv-reorder', params],
  transfers: (status) => ['femnia', 'inv-transfers', status],
  counts: (params) => ['femnia', 'inv-counts', params],
  count: (id) => ['femnia', 'inv-count', id],
  variance: (params) => ['femnia', 'inv-variance', params],
  wastage: (params) => ['femnia', 'inv-wastage', params],
  wastageSummary: (params) => ['femnia', 'inv-wastage-summary', params],
};

/* ------------------------------ locations ------------------------------ */
export const locationsQuery = { queryKey: ik.locations, queryFn: () => get('/locations'), staleTime: 60_000 };
export const createLocation = (input) => send('post', '/locations', input);
export const updateLocation = (id, input) => send('patch', `/locations/${id}`, input);
export const deleteLocation = (id) => send('delete', `/locations/${id}`);
export const setOnlineDefaultLocation = (id) => send('post', `/locations/${id}/set-online-default`);

/* ------------------------- per-location stock ------------------------- */
/** Every ProductStock row (product × variant × location). */
export const locationStockQuery = { queryKey: ik.locationStock, queryFn: () => get('/inventory'), staleTime: 15_000 };
/** items: [{ productId, variantIndex, locationId, quantity }] — absolute quantities. */
export const adjustStockBulk = (items) => send('post', '/inventory/adjust-bulk', { items });

/* ------------------------------- reorder ------------------------------- */
export const reorderQuery = (params) => ({
  queryKey: ik.reorder(params),
  queryFn: () => get(`/erp-reports/reorder${qs(params)}`),
});

/* ------------------------------ transfers ------------------------------ */
export const transfersQuery = (status) => ({
  queryKey: ik.transfers(status),
  queryFn: () => get(`/stock-transfers${qs({ status })}`),
});
export const createTransfer = (input) => send('post', '/stock-transfers', input);
export const transferAction = (id, action) => send('post', `/stock-transfers/${id}/${action}`);

/* ---------------------------- stock counts ---------------------------- */
export const countsQuery = (params) => ({ queryKey: ik.counts(params), queryFn: () => get(`/stock-counts${qs(params)}`) });
export const countQuery = (id) => ({ queryKey: ik.count(id), queryFn: () => get(`/stock-counts/${id}`), enabled: Boolean(id) });
export const varianceReportQuery = (params) => ({
  queryKey: ik.variance(params),
  queryFn: () => get(`/stock-counts/report/variance${qs(params)}`),
});
export const createCount = (input) => send('post', '/stock-counts', input);
export const lookupCountProducts = (q, locationId) => get(`/stock-counts/lookup${qs({ q, locationId })}`);
export const addCountLine = (id, input) => send('post', `/stock-counts/${id}/lines`, input);
export const updateCountLine = (id, lineId, input) => send('put', `/stock-counts/${id}/lines/${lineId}`, input);
export const deleteCountLine = (id, lineId) => send('delete', `/stock-counts/${id}/lines/${lineId}`);
export const postCount = (id) => send('post', `/stock-counts/${id}/post`);
export const cancelCount = (id) => send('post', `/stock-counts/${id}/cancel`);

/* ------------------------------- wastage ------------------------------- */
export const WASTAGE_REASONS = [
  ['damaged', 'Damaged'],
  ['defective', 'Defective'],
  ['lost', 'Lost / missing'],
  ['theft', 'Theft'],
  ['sample', 'Sample / giveaway'],
  ['other', 'Other'],
];
export const wastageReasonLabel = (r) => WASTAGE_REASONS.find(([k]) => k === r)?.[1] ?? r;

export const wastageQuery = (params) => ({ queryKey: ik.wastage(params), queryFn: () => get(`/wastage${qs(params)}`) });
export const wastageSummaryQuery = (params) => ({
  queryKey: ik.wastageSummary(params),
  queryFn: () => get(`/wastage/summary${qs(params)}`),
});
export const recordWastage = (input) => send('post', '/wastage', input);
export const reverseWastage = (id) => send('post', `/wastage/${id}/cancel`);

/* ------------------------------- helpers ------------------------------- */
/** Local YYYY-MM-DD `days` ago (never toISOString — that shifts on UTC+3). */
export function daysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "M / Red" from a variant's options object. */
export const variantLabel = (v) => (v?.options ? Object.values(v.options).filter(Boolean).join(' / ') : '');

/** Any ERP inventory screen: admin, or a staff member whose access covers the classic products area. */
export const canManageInventory = (access) =>
  Boolean(access && access.status === 'active' && (access.isAdmin || access.legacy?.includes('products')));
export const canSeeAnalytics = (access) =>
  Boolean(access && access.status === 'active' && (access.isAdmin || access.legacy?.includes('analytics')));

export const MULTILOC = import.meta.env.VITE_FEATURE_MULTILOC === 'true';

/** Refresh every query a stock-moving inventory operation can affect. */
export function invalidateInventoryOps(client) {
  return Promise.all(
    [
      ['femnia', 'products'],
      ['femnia', 'product'],
      ['femnia', 'product-history'],
      ['femnia', 'dashboard'],
      ['femnia', 'activity'],
      ik.locationStock,
      ['femnia', 'inv-reorder'],
      ['femnia', 'inv-transfers'],
      ['femnia', 'inv-counts'],
      ['femnia', 'inv-count'],
      ['femnia', 'inv-variance'],
      ['femnia', 'inv-wastage'],
      ['femnia', 'inv-wastage-summary'],
    ].map((queryKey) => client.invalidateQueries({ queryKey })),
  );
}
