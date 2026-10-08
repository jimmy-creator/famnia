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

// What a shopper may see of a product: cost, margin and supplier stay internal.
export const PUBLIC_PRODUCT_ATTRIBUTES = { exclude: ['costPrice', 'marginPercent', 'preferredSupplierId'] };
