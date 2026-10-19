// npm run backfill:order-codes [-- --commit] — give every order line its
// product code (the code on the tag, which staff and customers quote).
// New lines record it when the order is placed; this fills in older orders
// from the line's product + variant. Preview by default; idempotent.
import sequelize from '../config/database.js';
import { Order, Product } from '../models/index.js';
import { hasVariants, skuFields } from '../hub/catalog.js';

const commit = process.argv.includes('--commit');

/** The variant a stored line points at: its index, its SKU, or (web lines) its options. */
function variantIndexOf(product, line) {
  if (!hasVariants(product)) return null;
  if (line.variantIndex !== undefined && line.variantIndex !== null) return Number(line.variantIndex);
  const sel = line.variant || line.selectedVariant;
  const sku = line.sku || sel?.sku;
  let idx = sku ? product.variants.findIndex((v) => v && v.sku && String(v.sku).toUpperCase() === String(sku).toUpperCase()) : -1;
  if (idx < 0 && sel) {
    idx = product.variants.findIndex((v) => v && !v.archived && v.options
      && Object.entries(v.options).every(([k, val]) => sel[k] === val));
  }
  return idx >= 0 ? idx : undefined;
}

try {
  await sequelize.authenticate();
  const products = new Map((await Product.findAll()).map((p) => [p.id, p]));
  let orders = 0, lines = 0, missing = 0;
  for (const order of await Order.findAll()) {
    const items = Array.isArray(order.items) ? order.items : [];
    let changed = false;
    const next = items.map((it) => {
      if (!it || it.productCode) return it;
      const product = products.get(Number(it.productId));
      const vi = product ? variantIndexOf(product, it) : undefined;
      const code = it.barcode || (product && vi !== undefined ? skuFields(product, vi).productCode : null);
      if (!code) { missing += 1; return it; }
      changed = true;
      lines += 1;
      return { ...it, productCode: code };
    });
    if (!changed) continue;
    orders += 1;
    // hooks off: only the line snapshot changes, nothing about stock or status.
    if (commit) await Order.update({ items: next }, { where: { id: order.id }, hooks: false });
  }
  console.log(`[backfill:order-codes] ${commit ? 'updated' : 'would update'} ${lines} line(s) on ${orders} order(s); ${missing} line(s) have no product code to give`);
  await sequelize.close();
} catch (err) {
  console.error('[backfill:order-codes] failed:', err.message);
  process.exit(1);
}
