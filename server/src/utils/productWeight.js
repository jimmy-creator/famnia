/**
 * Resolve the per-unit weight in kilograms for an order line, taking
 * variants into account.
 *
 * Resolution chain (first hit wins):
 *   1. variant.weight on the matching variant of product.variants (numeric, kg)
 *   2. Weight parsed out of the variant option strings — "500g", "1 kg", "1.5kg"
 *   3. product.weight (numeric, kg) on the Product row
 *   4. DEFAULT_KG fallback (0.1 kg)
 *
 * Why parsing: in Kalif's catalog the pack size lives as an option string
 * ("500g", "1kg") rather than a separate weight column on each variant.
 * Parsing keeps the integration accurate without forcing admin to fill
 * in a numeric weight on every variant.
 */
export const DEFAULT_KG = 0.1;

export function parseWeightFromOptions(options) {
  if (!options || typeof options !== 'object') return null;
  for (const raw of Object.values(options)) {
    const s = String(raw || '').trim();
    if (!s) continue;
    // Match numbers followed by g/gm/gms/grams or kg/kgs/kilo(s)
    const m = s.match(/^\s*([\d.]+)\s*(kg|kgs|kilo|kilos|kilograms?|g|gm|gms|grams?)\b/i);
    if (!m) continue;
    const n = parseFloat(m[1]);
    if (isNaN(n)) continue;
    const unit = m[2].toLowerCase();
    if (unit.startsWith('k')) return n;       // kilograms
    return n / 1000;                          // grams
  }
  return null;
}

function toNum(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

/**
 * @param {object} orderItem — { productId, variant: {options, sku} | null, quantity }
 * @param {object} product   — Sequelize Product instance or plain object
 * @returns weight in kg per unit (not multiplied by quantity)
 */
export function resolveItemWeight(orderItem, product) {
  const productObj = product?.toJSON ? product.toJSON() : product;
  const opts = orderItem?.variant
    ? Object.fromEntries(Object.entries(orderItem.variant).filter(([k]) => k !== 'sku'))
    : null;

  // 1. Find matching variant on the product
  if (opts && Array.isArray(productObj?.variants)) {
    const v = productObj.variants.find((vv) =>
      vv.options && Object.entries(opts).every(([k, val]) => vv.options[k] === val)
    );
    if (v) {
      const explicit = toNum(v.weight);
      if (explicit !== null) return explicit;
      const parsed = parseWeightFromOptions(v.options);
      if (parsed !== null) return parsed;
    }
  }

  // 2. Parse from the order-item's variant options (if product lookup failed)
  if (opts) {
    const parsed = parseWeightFromOptions(opts);
    if (parsed !== null) return parsed;
  }

  // 3. Product-level weight
  const productWeight = toNum(productObj?.weight);
  if (productWeight !== null) return productWeight;

  // 4. Default
  return DEFAULT_KG;
}
