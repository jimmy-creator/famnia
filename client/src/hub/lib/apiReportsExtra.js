import api from '@/api/axios';
import { get, send } from './api';

/**
 * The classic ERP reports and POS back office, served natively in the hub.
 * Every call goes to the same endpoints the classic screens used, so the
 * figures match /admin/erp exactly.
 */

/** "/path?a=1&b=2", dropping empty values. */
const withParams = (path, params = {}) => {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined && v !== false),
  ).toString();
  return qs ? `${path}?${qs}` : path;
};

const key = (...parts) => ['femnia', 'reports-extra', ...parts];

export const MULTILOC = import.meta.env.VITE_FEATURE_MULTILOC === 'true';

/** Admin, or a classic 'analytics' grant (directly or implied by a hub key). */
export const canAnalytics = (access) =>
  Boolean(access && access.status === 'active' && (access.isAdmin || access.legacy?.includes('analytics')));
export const canLegacy = (access, area) =>
  Boolean(access && access.status === 'active' && (access.isAdmin || access.legacy?.includes(area)));

export const locationsListQuery = {
  queryKey: key('locations'),
  queryFn: () => get('/locations'),
  staleTime: 5 * 60_000,
};

/** One query per report; `params` doubles as the cache key. */
export const reportQuery = (path, params = {}, enabled = true) => ({
  queryKey: key(path, params),
  queryFn: () => get(withParams(path, params)),
  enabled,
});

/** Server-built CSV for an /erp-reports endpoint, saved as `filename`. */
export async function downloadServerCsv(path, params, filename) {
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null && v !== false));
  const res = await api.get(path, { params: { ...clean, format: 'csv' }, responseType: 'blob' });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ------------------------------- POS admin ------------------------------- */
export const shiftsQuery = ({ from, to }) => ({
  queryKey: key('shifts', from, to),
  queryFn: () => get(withParams('/cashier/shifts', { limit: from || to ? 500 : 50, from, to })),
});
export const fetchShiftReport = (shiftId) => get(`/reports/z/${shiftId}`);
export const fetchDayReport = (date, locationId) => get(withParams('/reports/day', { date, locationId }));

export const cashiersQuery = {
  queryKey: key('cashiers'),
  queryFn: async () => {
    try {
      return await get('/staff?role=cashier');
    } catch {
      return (await get('/staff')).filter((u) => u.role === 'cashier');
    }
  },
};
export const createCashier = (body) => send('post', '/staff', { ...body, role: 'cashier' });
export const updateCashier = (id, body) => send('put', `/staff/${id}`, body);
export const deleteCashier = (id) => send('delete', `/staff/${id}`);

export const tillReturnsQuery = (filter) => ({
  queryKey: key('returns', filter),
  queryFn: () => get(withParams('/returns', filter)),
});
export const tillReturnQuery = (id) => ({
  queryKey: key('return', id),
  queryFn: () => get(`/returns/${id}`),
  enabled: Boolean(id),
});
export const cancelTillReturn = (id) => send('post', `/returns/${id}/cancel`);

export const posSalesQuery = (groupBy, params) =>
  reportQuery(groupBy === 'location' ? '/reports/location-sales' : '/reports/cashier-sales', params);

export const invalidateReportsExtra = (qc, ...parts) => qc.invalidateQueries({ queryKey: key(...parts) });
