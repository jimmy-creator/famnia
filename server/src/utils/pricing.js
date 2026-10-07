// Selling price from landed cost + margin %: cost 10 at 25% → 12.500.
// Rounded to the 3dp prices are stored in; null when cost or margin is missing.
// `typed` is a price the form worked the margin out from: the margin is kept
// to 2dp, so cost × margin can miss it by a fil — keep the typed price then.
export function priceFromMargin(cost, margin, typed) {
  const c = parseFloat(cost);
  const m = parseFloat(margin);
  if (!(c > 0) || !Number.isFinite(m)) return null;
  const price = +(c * (1 + m / 100)).toFixed(3);
  const t = parseFloat(typed);
  return Number.isFinite(t) && Math.abs(t - price) <= c * 0.00005 + 0.0005 ? +t.toFixed(3) : price;
}

// What a shopper may see of a product: cost, margin and supplier stay internal.
export const PUBLIC_PRODUCT_ATTRIBUTES = { exclude: ['costPrice', 'marginPercent', 'preferredSupplierId'] };
