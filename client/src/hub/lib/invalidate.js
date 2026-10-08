import { qk } from '@/hub/lib/api';

/** Refresh everything a stock or product change can affect. */
export function invalidateStock(client, key) {
  const keys = [qk.products, qk.stockIn, qk.stockOut, qk.dashboard, qk.activity, qk.suppliers, qk.batchIndex, qk.importBatches];
  if (key) keys.push(qk.product(key), qk.productHistory(key), qk.productLock(key), qk.skuBatches(key));
  return Promise.all(keys.map((queryKey) => client.invalidateQueries({ queryKey })));
}

/** Refresh orders, customers and stock after a sales-order change. */
export function invalidateSales(client, orderId) {
  const keys = [qk.orders, qk.customerRecords, ['femnia', 'customer-history'], ['femnia', 'customer-purchases']];
  if (orderId) keys.push(qk.order(orderId), qk.orderAudit(orderId));
  return Promise.all([
    invalidateStock(client),
    ['femnia', 'product'], ['femnia', 'product-history'],
    ...keys,
  ].map((k) => (Array.isArray(k) ? client.invalidateQueries({ queryKey: k }) : k)));
}
