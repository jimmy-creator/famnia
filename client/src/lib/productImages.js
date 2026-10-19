// Images for the storefront. A SKU (variant) can carry its own image, set in
// the hub's product form; the product gallery (`images`) is the fallback.

const forSale = (v) => v && v.active !== false && !v.archived;

/** The variant matching every selected option, or null. */
export function variantFor(product, options) {
  if (!options || !product?.variants?.length) return null;
  return product.variants.find((v) => !v.archived && Object.entries(options).every(([k, val]) => v.options?.[k] === val)) || null;
}

/** Product gallery followed by each for-sale variant's own image, no repeats. */
export function galleryOf(product) {
  const list = (product?.images || []).filter(Boolean);
  for (const v of product?.variants || []) {
    if (forSale(v) && v.image && !list.includes(v.image)) list.push(v.image);
  }
  return list;
}

/** The image to show for a product, or for one chosen variant of it. */
export function imageOf(product, options) {
  return variantFor(product, options)?.image || galleryOf(product)[0] || null;
}

/** An image for one option value (e.g. a colour), preferring a variant that also matches the other selections. */
export function optionImage(product, type, value, selected) {
  const withValue = (product?.variants || []).filter((v) => forSale(v) && v.image && v.options?.[type] === value);
  const exact = withValue.find((v) => Object.entries(selected || {}).every(([k, sv]) => k === type || v.options?.[k] === sv));
  return (exact || withValue[0])?.image || null;
}
