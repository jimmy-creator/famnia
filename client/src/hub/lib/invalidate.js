import { qk } from '@/hub/lib/api';

/** Refresh everything a stock or product change can affect. */
export function invalidateStock(client, key) {
  const keys = [qk.products, qk.stockIn, qk.stockOut, qk.dashboard, qk.activity, qk.suppliers, qk.batchIndex, qk.importBatches];
  if (key) keys.push(qk.product(key), qk.productHistory(key), qk.productLock(key), qk.skuBatches(key));
  return Promise.all(keys.map((queryKey) => client.invalidateQueries({ queryKey })));
}
