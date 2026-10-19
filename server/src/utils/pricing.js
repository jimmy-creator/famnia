import { Op } from 'sequelize';
import { dp } from './money.js';

// Selling price from landed cost + margin %: cost 10 at 25% → 12.50.
// Rounded to the currency's precision (CURRENCY_DECIMALS); null when cost or
// margin is missing. `typed` is a price the form worked the margin out from:
// the margin is kept to 2dp, so cost × margin can miss it by a unit in the
// last place — keep the typed price then.
export function priceFromMargin(cost, margin, typed) {
  const c = parseFloat(cost);
  const m = parseFloat(margin);
  if (!(c > 0) || !Number.isFinite(m)) return null;
  const d = dp();
  const price = +(c * (1 + m / 100)).toFixed(d);
  const t = parseFloat(typed);
  return Number.isFinite(t) && Math.abs(t - price) <= c * 0.00005 + 0.5 * 10 ** -d ? +t.toFixed(d) : price;
}

// What a shopper may see of a product: cost, margin, supplier and the
// warehouse fields (rack, batch, reorder levels, notes…) stay internal.
export const PUBLIC_PRODUCT_ATTRIBUTES = {
  exclude: ['costPrice', 'marginPercent', 'preferredSupplierId', 'reorderLevel', 'reorderQty', 'rack', 'shelfLocation',
    'notes', 'batchNumber', 'sourceCountry', 'wholesaler', 'importBatchId'],
};

// Storefront visibility: active, not POS-only, and something left to sell —
// a sold-out product is hidden from shoppers rather than shown as "Out of stock".
export const STOREFRONT_WHERE = { active: true, hideOnline: false, stock: { [Op.gt]: 0 } };

// Hub SKU data (cost, supplier, batch…) lives on each variant, so variants are
// allowlisted. `barcode` is the product code printed on the tag.
const PUBLIC_VARIANT_KEYS = ['sku', 'barcode', 'price', 'comparePrice', 'stock', 'active', 'archived', 'options', 'image', 'video'];

const sellableVariant = (v) => v && typeof v === 'object' && v.active !== false && !v.archived && (parseInt(v.stock, 10) || 0) > 0;

/**
 * A product row as the storefront API returns it: only the variants a shopper
 * can buy (sold-out, inactive and archived ones are left out, and their option
 * values with them), or null when nothing is left to sell.
 */
export function publicProduct(product) {
  const json = product.toJSON();
  if ((parseInt(json.stock, 10) || 0) <= 0) return null;
  if (Array.isArray(json.variants) && json.variants.length) {
    json.variants = json.variants.filter(sellableVariant)
      .map((v) => Object.fromEntries(PUBLIC_VARIANT_KEYS.filter((k) => k in v).map((k) => [k, v[k]])));
    if (!json.variants.length) return null;
    if (json.variantOptions && typeof json.variantOptions === 'object') {
      json.variantOptions = Object.fromEntries(Object.entries(json.variantOptions).map(([type, values]) => [
        type, (Array.isArray(values) ? values : []).filter((val) => json.variants.some((v) => v.options?.[type] === val)),
      ]));
    }
  }
  return json;
}
