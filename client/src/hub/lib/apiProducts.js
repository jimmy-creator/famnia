import api from '@/api/axios';
import { errorMessage, get, send } from '@/hub/lib/api';

/**
 * Product-level storefront fields (the classic product form's): gallery,
 * categories from the Category table, compare-at price, VAT, Arabic, hide
 * online… Shared by every size/colour SKU of a product.
 */
export const categoriesQuery = { queryKey: ['femnia', 'categories'], queryFn: () => get('/hub/categories'), staleTime: 60_000 };

export const storefrontQuery = (productId) => ({
  queryKey: ['femnia', 'storefront', productId],
  queryFn: () => get(`/hub/products/${productId}/storefront`),
  enabled: Boolean(productId),
});

/** Resolves the saved fields plus `changes` (count). */
export const saveStorefront = (productId, input) => send('put', `/hub/products/${productId}/storefront`, input);

/* ------------------------- classic CSV (bulk-products) ------------------------- */
// The classic catalogue CSV route (server/src/routes/bulkProducts.js), offered
// alongside the hub's Excel wizard. Opened in a new tab so the browser
// downloads with the session cookie.
export const classicCsvExportUrl = '/api/bulk-products/export';
export const classicCsvTemplateUrl = (style) => `/api/bulk-products/template${style ? `?style=${style}` : ''}`;

/** Resolves the import's `{ message, errors }`. */
export async function importClassicCsv(file) {
  const form = new FormData();
  form.append('file', file);
  try {
    return (await api.post('/bulk-products/import', form, { headers: { 'Content-Type': 'multipart/form-data' } })).data;
  } catch (err) {
    throw new Error(errorMessage(err, 'Import failed'));
  }
}
