/**
 * Stock and return-cap checks run line by line, so the same product sent
 * as two lines (3 + 3 against 4 in stock) passed each check on its own and
 * then moved stock by the wrong amount. Anything that validates quantities
 * per product must look at the combined quantity — these helpers give it.
 */

export const lineKey = (productId, variantIndex) => `${productId}:${variantIndex ?? 'b'}`;

export const parseVariantIndex = (v) => (v == null || v === '' ? null : parseInt(v, 10));

/**
 * Collapse lines for the same product/variant into one, summing quantity.
 * Expects already-normalised lines ({ productId:int, variantIndex:int|null,
 * quantity:int }); every other field is taken from the first occurrence.
 */
export function mergeLines(lines) {
  const byKey = new Map();
  for (const l of lines) {
    const k = lineKey(l.productId, l.variantIndex);
    const cur = byKey.get(k);
    if (cur) cur.quantity += l.quantity;
    else byKey.set(k, { ...l });
  }
  return [...byKey.values()];
}

/** Total quantity per product/variant key: Map<key, qty>. */
export function totalsByKey(lines) {
  const totals = new Map();
  for (const l of lines) {
    const k = lineKey(l.productId, l.variantIndex);
    totals.set(k, (totals.get(k) || 0) + (parseInt(l.quantity, 10) || 0));
  }
  return totals;
}
