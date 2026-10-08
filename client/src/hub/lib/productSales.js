/**
 * Product Sales report (Reports → Product Sales).
 *
 * Read-only aggregation across existing data: confirmed (non-draft,
 * non-cancelled) orders, their items, recorded returns and the live stock view.
 * Nothing is written here.
 *
 * Cost figures come from the cost snapshotted on each order line at the time
 * of sale (saleCostsQuery). The API serves it only to callers holding
 * `reports.financial`, and the UI shows cost / profit columns only to them.
 */
import { inRange, monthStartIso, salesOrdersIn, todayIso } from '@/hub/lib/reports';

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

export const PRODUCT_SALES_SORTS = [
  { key: 'quantity', label: 'Quantity sold' },
  { key: 'sales', label: 'Sales value' },
  { key: 'profit', label: 'Profit' },
  { key: 'stock', label: 'Current stock' },
];

export function currentMonthRange() {
  return { from: monthStartIso(), to: todayIso() };
}

const keyOf = (name) => name.trim().toLowerCase();

/**
 * Groups net (sold − returned) performance by product name across every SKU
 * variant, size and colour.
 */
export function buildProductSalesReport(orders, products, costs, range, options = {}) {
  const month = currentMonthRange();
  const byName = new Map();
  const productBySku = new Map(products.map((p) => [p.sku, p]));

  const nameFor = (sku, fallback) => productBySku.get(sku)?.name?.trim() || (fallback ?? '').trim() || sku;

  const touch = (sku, itemName) => {
    const product = productBySku.get(sku);
    const name = nameFor(sku, itemName);
    const key = keyOf(name);
    const entry = byName.get(key) ?? {
      name,
      category: product?.category?.trim() || 'Uncategorised',
      qty: 0,
      monthQty: 0,
      sales: 0,
      cogs: 0,
      variants: new Map(),
    };
    if (!byName.has(key)) byName.set(key, entry);
    const variant = entry.variants.get(sku) ?? {
      sku,
      size: product?.size ?? null,
      color: product?.color ?? null,
      qty: 0,
      monthQty: 0,
      sales: 0,
      cogs: 0,
    };
    entry.variants.set(sku, variant);
    return { entry, variant };
  };

  /** Adds one order line's net contribution to its product group. */
  const applyOrder = (order) => {
    for (const item of order.items) {
      const sold = Number(item.quantity ?? 0);
      if (sold <= 0) continue;
      const returned = Math.min(Number(item.returnedQty ?? 0), sold);
      const netQty = sold - returned;
      const { entry, variant } = touch(item.sku, item.name);
      const netRevenue = round2((Number(item.lineTotal ?? 0) / sold) * netQty);
      const unitCost = costs[`${order.id}|${item.sku}`] ?? productBySku.get(item.sku)?.costPrice ?? 0;
      const cogs = round2(unitCost * netQty);
      entry.qty += netQty;
      entry.sales = round2(entry.sales + netRevenue);
      entry.cogs = round2(entry.cogs + cogs);
      variant.qty += netQty;
      variant.sales = round2(variant.sales + netRevenue);
      variant.cogs = round2(variant.cogs + cogs);
    }
  };

  for (const order of salesOrdersIn(orders, range)) applyOrder(order);
  for (const order of orders) {
    if (order.status === 'Draft' || order.status === 'Cancelled') continue;
    if (!inRange(order.orderDate, month)) continue;
    for (const item of order.items) {
      const sold = Number(item.quantity ?? 0);
      if (sold <= 0) continue;
      const returned = Math.min(Number(item.returnedQty ?? 0), sold);
      const { entry, variant } = touch(item.sku, item.name);
      entry.monthQty += sold - returned;
      variant.monthQty += sold - returned;
    }
  }

  // Live stock for every SKU that belongs to a product name (including SKUs
  // that have never sold, so the stock column reconciles with Inventory).
  for (const p of products) {
    const key = keyOf(p.name || p.sku);
    const entry = byName.get(key);
    if (!entry) continue;
    if (!entry.variants.has(p.sku)) {
      entry.variants.set(p.sku, { sku: p.sku, size: p.size, color: p.color, qty: 0, monthQty: 0, sales: 0, cogs: 0 });
    }
  }

  const stockOf = (sku) => productBySku.get(sku)?.currentStock ?? 0;

  let rows = [...byName.values()].map((entry) => {
    const variants = [...entry.variants.values()]
      .map((v) => ({
        sku: v.sku,
        size: v.size,
        color: v.color,
        quantitySold: v.qty,
        monthQuantity: v.monthQty,
        salesValue: round2(v.sales),
        cogs: round2(v.cogs),
        profit: round2(v.sales - v.cogs),
        currentStock: stockOf(v.sku),
      }))
      .sort((a, b) => b.quantitySold - a.quantitySold || a.sku.localeCompare(b.sku));
    return {
      name: entry.name,
      category: entry.category,
      skus: variants.map((v) => v.sku),
      quantitySold: entry.qty,
      monthQuantity: entry.monthQty,
      salesValue: round2(entry.sales),
      cogs: round2(entry.cogs),
      profit: round2(entry.sales - entry.cogs),
      currentStock: variants.reduce((s, v) => s + v.currentStock, 0),
      variants,
    };
  });

  const categories = [...new Set(rows.map((r) => r.category))].sort((a, b) => a.localeCompare(b));

  const search = (options.search ?? '').trim().toLowerCase();
  if (search) {
    rows = rows.filter((r) => r.name.toLowerCase().includes(search) || r.skus.some((s) => s.toLowerCase().includes(search)));
  }
  if (options.category && options.category !== 'All') {
    rows = rows.filter((r) => r.category === options.category);
  }

  const sort = options.sort ?? 'quantity';
  rows.sort((a, b) => {
    if (sort === 'sales') return b.salesValue - a.salesValue;
    if (sort === 'profit') return b.profit - a.profit;
    if (sort === 'stock') return b.currentStock - a.currentStock;
    return b.quantitySold - a.quantitySold;
  });

  return {
    rows,
    categories,
    totals: {
      quantitySold: rows.reduce((s, r) => s + r.quantitySold, 0),
      monthQuantity: rows.reduce((s, r) => s + r.monthQuantity, 0),
      salesValue: round2(rows.reduce((s, r) => s + r.salesValue, 0)),
      cogs: round2(rows.reduce((s, r) => s + r.cogs, 0)),
      profit: round2(rows.reduce((s, r) => s + r.profit, 0)),
      currentStock: rows.reduce((s, r) => s + r.currentStock, 0),
    },
  };
}
