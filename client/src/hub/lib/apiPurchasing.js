import { get, send } from '@/hub/lib/api';

/**
 * Purchasing (suppliers, purchase orders, supplier returns) on the classic
 * ERP endpoints. Keys sit under ['femnia', 'purchasing'] so one invalidation
 * refreshes the lot (and qk.all still catches them).
 */
const base = ['femnia', 'purchasing'];
export const pk = {
  all: base,
  suppliers: [...base, 'suppliers'],
  orders: (filters) => [...base, 'orders', filters],
  order: (id) => [...base, 'order', id],
  returns: (filters) => [...base, 'returns', filters],
  ret: (id) => [...base, 'return', id],
  statement: (id) => [...base, 'statement', id],
  supplierProducts: (id, locationId) => [...base, 'supplier-products', id, locationId],
  supplierOrders: (id) => [...base, 'supplier-orders', id],
};

const qs = (params) => {
  const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null)).toString();
  return s ? `?${s}` : '';
};

export const locationsQuery = { queryKey: [...base, 'locations'], queryFn: () => get('/locations'), staleTime: 60_000 };
/** Cash accounts with live balances. Finance-only on the server — a 403 just hides the picker. */
export const cashAccountsQuery = {
  queryKey: [...base, 'cash-accounts'],
  queryFn: () => get('/finance/cash-accounts?active=true'),
  retry: false,
};

export const allSuppliersQuery = { queryKey: pk.suppliers, queryFn: () => get('/suppliers') };
export const supplierStatementQuery = (id) => ({
  queryKey: pk.statement(id),
  queryFn: () => get(`/suppliers/${id}/statement`),
  enabled: Boolean(id),
});
export const supplierProductsQuery = (id, locationId) => ({
  queryKey: pk.supplierProducts(id, locationId),
  queryFn: () => get(`/suppliers/${id}/products${qs({ locationId })}`),
  enabled: Boolean(id),
});
export const saveSupplier = (id, body) => (id ? send('put', `/suppliers/${id}`, body) : send('post', '/suppliers', body));
export const deleteSupplier = (id) => send('delete', `/suppliers/${id}`);
export const linkSupplierProducts = () => send('post', '/suppliers/link-products');

export const purchaseOrdersQuery = (filters) => ({
  queryKey: pk.orders(filters),
  queryFn: () => get(`/purchase-orders${qs(filters)}`),
});
export const purchaseOrderQuery = (id) => ({
  queryKey: pk.order(id),
  queryFn: () => get(`/purchase-orders/${id}`),
  enabled: Boolean(id),
});
/** A supplier's POs that have stock to send back (partial / received). */
export const returnablePosQuery = (supplierId) => ({
  queryKey: pk.supplierOrders(supplierId),
  queryFn: async () =>
    (await get(`/purchase-orders${qs({ supplierId })}`)).filter((p) => ['partial', 'received'].includes(p.status)),
  enabled: Boolean(supplierId),
});
export const savePurchaseOrder = (id, body) =>
  id ? send('put', `/purchase-orders/${id}`, body) : send('post', '/purchase-orders', body);
export const sendPurchaseOrder = (id) => send('post', `/purchase-orders/${id}/send`);
export const cancelPurchaseOrder = (id) => send('post', `/purchase-orders/${id}/cancel`);
export const receivePurchaseOrder = (id, body) => send('post', `/purchase-orders/${id}/receive`, body);
export const payPurchaseOrder = (id, body) => send('post', `/purchase-orders/${id}/pay`, body);

export const purchaseReturnsQuery = (filters) => ({
  queryKey: pk.returns(filters),
  queryFn: () => get(`/purchase-returns${qs(filters)}`),
});
export const purchaseReturnQuery = (id) => ({
  queryKey: pk.ret(id),
  queryFn: () => get(`/purchase-returns/${id}`),
  enabled: Boolean(id),
});
export const createPurchaseReturn = (body) => send('post', '/purchase-returns', body);
export const cancelPurchaseReturn = (id) => send('post', `/purchase-returns/${id}/cancel`);

const API = import.meta.env.VITE_API_URL || '/api';
export const poPdfUrl = (id) => `${API}/purchase-orders/${id}/pdf`;
export const returnPdfUrl = (id) => `${API}/purchase-returns/${id}/pdf`;
