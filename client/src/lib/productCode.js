import { variantFor } from './productImages';

/**
 * The product code printed on the tag (stored as the SKU's `barcode`) — what
 * staff and customers quote. A product with sizes/colours has one per variant.
 */
export function productCodeOf(product, options) {
  if (product?.variants?.length) return variantFor(product, options)?.barcode || null;
  return product?.barcode || null;
}
