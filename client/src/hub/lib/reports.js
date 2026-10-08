/**
 * Reports aggregation.
 *
 * Every figure here is derived from data the signed-in staff member is already
 * allowed to read (the API's permission checks stay the boundary). Cost-based
 * numbers come from /api/hub/reports/financial-summary, which refuses to run
 * without the `reports.financial` permission and shares the classic P&L maths.
 *
 * Sales figures use confirmed / non-cancelled orders only. Delivery charges are
 * never treated as product revenue and assets are never treated as daily
 * expenses. All financial output is an operational estimate.
 *
 * Days are store-local (Asia/Qatar): order dates arrive as UTC timestamps, so
 * they are bucketed by the local calendar day, never by `toISOString()`.
 */
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const sum = (values) => round2(values.reduce((a, b) => a + b, 0));

/** YYYY-MM-DD of a Date in local time. */
export const localDay = (d) => d.toLocaleDateString('en-CA');

export function todayIso() {
  return localDay(new Date());
}

// Range maths works on store-day strings: building a Date with the browser's
// own clock and then formatting it on the store clock (lib/storeTime.js)
// shifts the day whenever the two time zones differ.
export function monthStartIso() {
  return `${todayIso().slice(0, 8)}01`;
}

export const RANGE_PRESETS = ['Today', 'Last 7 days', 'This month', 'Last 30 days', 'Custom'];

export function rangeFor(preset, current) {
  const today = todayIso();
  const back = (days) => {
    const [y, m, d] = today.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d - days)).toISOString().slice(0, 10);
  };
  switch (preset) {
    case 'Today':
      return { from: today, to: today };
    case 'Last 7 days':
      return { from: back(6), to: today };
    case 'This month':
      return { from: monthStartIso(), to: today };
    case 'Last 30 days':
      return { from: back(29), to: today };
    default:
      return current;
  }
}

/** Local calendar day of a date-only string or a timestamp. */
export function dayOf(value) {
  if (!value) return '';
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s.slice(0, 10) : localDay(d);
}

export function inRange(value, range) {
  const day = dayOf(value);
  if (!day) return false;
  return day >= range.from && day <= range.to;
}

/** Orders that count as real sales: confirmed and not cancelled/draft. */
export function salesOrdersIn(orders, range) {
  return orders.filter((o) => o.status !== 'Draft' && o.status !== 'Cancelled' && inRange(o.orderDate, range));
}

export function buildSalesReport(orders, range) {
  const rows = salesOrdersIn(orders, range);
  const items = rows.flatMap((o) => o.items);
  const byStatusMap = new Map();
  for (const o of rows) {
    const bucket = byStatusMap.get(o.status) ?? { count: 0, value: 0 };
    bucket.count += 1;
    bucket.value = round2(bucket.value + o.grandTotal);
    byStatusMap.set(o.status, bucket);
  }
  const byDayMap = new Map();
  for (const o of rows) {
    const key = dayOf(o.orderDate);
    byDayMap.set(key, round2((byDayMap.get(key) ?? 0) + o.grandTotal));
  }
  const productMap = new Map();
  for (const i of items) {
    const entry = productMap.get(i.sku) ?? { sku: i.sku, name: i.name, units: 0, value: 0 };
    entry.units += i.quantity;
    entry.value = round2(entry.value + i.lineTotal);
    productMap.set(i.sku, entry);
  }
  return {
    orderCount: rows.length,
    itemUnits: items.reduce((s, i) => s + i.quantity, 0),
    itemSales: sum(items.map((i) => i.lineTotal)),
    discounts: sum(rows.map((o) => o.totalDiscount)),
    deliveryCharges: sum(rows.map((o) => o.deliveryCharge)),
    grandTotal: sum(rows.map((o) => o.grandTotal)),
    received: sum(rows.map((o) => o.amountReceived)),
    balance: sum(rows.map((o) => o.remainingBalance)),
    returnedUnits: items.reduce((s, i) => s + (i.returnedQty ?? 0), 0),
    byStatus: [...byStatusMap.entries()].map(([label, v]) => ({ label, ...v })).sort((a, b) => b.value - a.value),
    byDay: [...byDayMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([label, value]) => ({ label, value })),
    topProducts: [...productMap.values()].sort((a, b) => b.value - a.value).slice(0, 15),
    orders: rows,
  };
}

export function buildInventoryReport(products, stockIn, stockOut, range, soldUnits) {
  const inRows = stockIn.filter((r) => inRange(r.date, range));
  const outRows = stockOut.filter((r) => inRange(r.date, range));
  const byCategoryMap = new Map();
  for (const p of products) {
    const key = p.category?.trim() || 'Uncategorised';
    const bucket = byCategoryMap.get(key) ?? { units: 0, retailValue: 0 };
    bucket.units += p.currentStock;
    bucket.retailValue = round2(bucket.retailValue + p.currentStock * p.sellingPriceQar);
    byCategoryMap.set(key, bucket);
  }
  return {
    skuCount: products.length,
    activeCount: products.filter((p) => p.isActive).length,
    units: products.reduce((s, p) => s + p.currentStock, 0),
    costValue: sum(products.map((p) => p.currentStock * p.costPrice)),
    retailValue: sum(products.map((p) => p.currentStock * p.sellingPriceQar)),
    lowStock: products.filter((p) => p.stockStatus === 'Low Stock'),
    outOfStock: products.filter((p) => p.stockStatus === 'Out of Stock'),
    stockInUnits: inRows.reduce((s, r) => s + r.quantity, 0),
    stockInCost: sum(inRows.map((r) => r.totalCost ?? 0)),
    stockOutUnits: outRows.reduce((s, r) => s + r.quantity, 0),
    soldUnits,
    byCategory: [...byCategoryMap.entries()].map(([label, v]) => ({ label, ...v })).sort((a, b) => b.retailValue - a.retailValue),
  };
}

function groupBy(entries, key) {
  const map = new Map();
  for (const e of entries) {
    const k = key(e) || 'Other';
    const bucket = map.get(k) ?? { value: 0, count: 0 };
    bucket.value = round2(bucket.value + e.amount);
    bucket.count += 1;
    map.set(k, bucket);
  }
  return [...map.entries()].map(([label, v]) => ({ label, ...v })).sort((a, b) => b.value - a.value);
}

export function buildExpenseReport(expenses, assets, range) {
  const exp = expenses.filter((e) => inRange(e.date, range));
  const ast = assets.filter((e) => inRange(e.date, range));
  return {
    expenseTotal: sum(exp.map((e) => e.amount)),
    assetTotal: sum(ast.map((e) => e.amount)),
    expenseCount: exp.length,
    assetCount: ast.length,
    byExpenseCategory: groupBy(exp, (e) => e.category),
    byAssetCategory: groupBy(ast, (e) => e.category),
    byFunding: groupBy([...exp, ...ast], (e) => e.fundingSource).map(({ label, value }) => ({ label, value })),
    expenses: exp,
    assets: ast,
  };
}

export function buildLiabilityReport(liabilities, range) {
  const rows = liabilities.filter((l) => inRange(l.entry?.date ?? l.createdAt, range));
  const map = new Map();
  for (const l of rows) {
    const bucket = map.get(l.person) ?? { raised: 0, reimbursed: 0, outstanding: 0 };
    bucket.raised = round2(bucket.raised + l.amount);
    bucket.reimbursed = round2(bucket.reimbursed + l.reimbursed);
    bucket.outstanding = round2(bucket.outstanding + l.outstanding);
    map.set(l.person, bucket);
  }
  return {
    pending: rows.filter((l) => l.status === 'pending').length,
    partiallyPaid: rows.filter((l) => l.status === 'partially_paid').length,
    settled: rows.filter((l) => l.status === 'paid').length,
    totalRaised: sum(rows.map((l) => l.amount)),
    totalReimbursed: sum(rows.map((l) => l.reimbursed)),
    outstanding: sum(rows.map((l) => l.outstanding)),
    byPerson: [...map.entries()].map(([label, v]) => ({ label, ...v })).sort((a, b) => b.outstanding - a.outstanding),
    rows,
  };
}

export function buildPaymentsReport(orders, range) {
  const rows = salesOrdersIn(orders, range);
  const methodMap = new Map();
  for (const o of rows) {
    const key = o.paymentMode || 'Unspecified';
    const bucket = methodMap.get(key) ?? { orders: 0, received: 0, balance: 0 };
    bucket.orders += 1;
    bucket.received = round2(bucket.received + o.amountReceived);
    bucket.balance = round2(bucket.balance + o.remainingBalance);
    methodMap.set(key, bucket);
  }
  const heldMap = new Map();
  for (const o of rows) {
    if (o.amountReceived <= 0) continue;
    const key = o.paymentHeldIn?.trim() || 'Not recorded';
    heldMap.set(key, round2((heldMap.get(key) ?? 0) + o.amountReceived));
  }
  return {
    byMethod: [...methodMap.entries()].map(([label, v]) => ({ label, ...v })).sort((a, b) => b.received - a.received),
    byHeldIn: [...heldMap.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
    totalReceived: sum(rows.map((o) => o.amountReceived)),
    totalBalance: sum(rows.map((o) => o.remainingBalance)),
    codOutstanding: sum(rows.filter((o) => /cod|cash on delivery/i.test(o.paymentMode ?? '')).map((o) => o.remainingBalance)),
    fullyPaid: rows.filter((o) => o.remainingBalance <= 0 && o.amountReceived > 0).length,
    partiallyPaid: rows.filter((o) => o.amountReceived > 0 && o.remainingBalance > 0).length,
    unpaid: rows.filter((o) => o.amountReceived <= 0).length,
  };
}
