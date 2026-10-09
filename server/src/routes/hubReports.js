import { Router } from 'express';
import { Op } from 'sequelize';
import {
  CashAccount, CashTransaction, Expense, HubExpenseEntry, HubLiability, HubReimbursement, Order, Product, PurchaseOrder,
  StockMovement, User, Wastage,
} from '../models/index.js';
import { protect } from '../middleware/auth.js';
import { bad, can, need, wrap as wrapAs } from '../hub/http.js';
import { listSkus, skuKey } from '../hub/catalog.js';
import { mapItem, toSalesOrder } from '../hub/sales.js';
import { loadAppSettings } from '../hub/settings.js';
import { localDate, rangeEnd, rangeStart } from '../utils/dates.js';

/**
 * FEMNIA Hub Dashboard and the server side of Reports, on the client's
 * formulas: order lines net of returns, confirmed (not only paid) orders.
 */
const router = Router();
router.use(protect);
const wrap = (fn) => wrapAs('hubReports', fn);

const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const num = (v) => parseFloat(v) || 0;
const isConfirmed = (o) => o.status !== 'Draft' && o.status !== 'Cancelled';
const canProfit = (req) => can(req, 'dashboard.profit_values') || can(req, 'reports.financial');

/**
 * Unit cost per `orderNumber|sku` (the SKU exactly as the order view shows
 * it), qty-weighted across lines of the same SKU — the cost snapshotted on
 * each line at the time of sale.
 */
function saleCostMap(orders) {
  const totals = new Map();
  for (const o of orders) {
    (Array.isArray(o.items) ? o.items : []).forEach((it, idx) => {
      if (it.costPrice === undefined || it.costPrice === null) return;
      const key = `${o.orderNumber}|${mapItem(it, idx).sku}`;
      const qty = parseInt(it.quantity, 10) || 0;
      const t = totals.get(key) || { qty: 0, cost: 0 };
      t.qty += qty;
      t.cost += qty * num(it.costPrice);
      totals.set(key, t);
    });
  }
  const map = {};
  for (const [key, t] of totals) map[key] = t.qty > 0 ? round2(t.cost / t.qty) : 0;
  return map;
}

/**
 * Storefront fields the shop barcode label can show (Arabic name, compare-at
 * price), per product id — the hub's SKU rows don't carry them.
 */
router.get('/label-extras', need('products.view', 'products.barcodes'), wrap(async (req, res) => {
  const rows = await Product.findAll({ attributes: ['id', 'nameAr', 'comparePrice'], raw: true });
  res.json(Object.fromEntries(rows.map((p) => [p.id, {
    nameAr: p.nameAr || null,
    comparePrice: p.comparePrice === null || p.comparePrice === undefined ? null : num(p.comparePrice),
  }])));
}));

router.get('/reports/sale-costs', need('reports.financial', 'dashboard.profit_values'), wrap(async (req, res) => {
  const orders = await Order.findAll({ attributes: ['orderNumber', 'items'] });
  res.json(saleCostMap(orders));
}));

/**
 * The hub's Profit summary, on the client's formula: every confirmed order
 * (not just paid ones) by its sale date, lines net of returned units, COGS
 * at the cost recorded on the line, less the period's daily expenses
 * (assets are never expenses). The classic P&L in Back Office stays
 * cash-based (paid orders only) — the two answer different questions.
 */
router.get('/reports/financial-summary', need('reports.financial'), wrap(async (req, res) => {
  const from = String(req.query.from || '');
  const to = String(req.query.to || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw bad('Choose a date range.');
  const [orders, skus, hubExpenses, hubRefs] = await Promise.all([
    Order.findAll({ where: { createdAt: { [Op.between]: [rangeStart(from), rangeEnd(to)] } } }),
    listSkus({ showCost: true }),
    HubExpenseEntry.sum('amount', { where: { entryType: 'expense', voidedAt: null, txnDate: { [Op.between]: [from, to] } } }),
    HubExpenseEntry.findAll({ where: { entryType: 'expense', voidedAt: null, expenseId: { [Op.ne]: null } }, attributes: ['expenseId'], raw: true }),
  ]);
  // Expenses booked in Back Office directly (not through the hub) count too;
  // hub entries' own Expense rows are already in hubExpenses.
  const classicExpenses = await Expense.sum('amount', {
    where: {
      status: 'paid',
      expenseDate: { [Op.between]: [from, to] },
      ...(hubRefs.length ? { id: { [Op.notIn]: hubRefs.map((r) => r.expenseId) } } : {}),
    },
  });
  const costBySku = new Map(skus.map((s) => [s.sku, s.costPrice]));
  let sales = 0;
  let cogs = 0;
  let delivery = 0;
  for (const o of orders) {
    const v = toSalesOrder(o);
    if (!isConfirmed(v)) continue;
    delivery += v.deliveryCharge;
    (Array.isArray(o.items) ? o.items : []).forEach((it, idx) => {
      const line = v.items[idx];
      if (!line || line.quantity <= 0) return;
      const netQty = line.quantity - Math.min(line.returnedQty, line.quantity);
      const unitCost = it.costPrice !== undefined && it.costPrice !== null ? num(it.costPrice) : (costBySku.get(line.sku) ?? 0);
      sales += (line.lineTotal / line.quantity) * netQty;
      cogs += unitCost * netQty;
    });
  }
  const expenses = num(hubExpenses) + num(classicExpenses);
  res.json({
    productSales: round2(sales),
    deliveryCharges: round2(delivery),
    cogs: round2(cogs),
    grossProfit: round2(sales - cogs),
    expenses: round2(expenses),
    netProfit: round2(sales - cogs - expenses),
  });
}));

router.get('/dashboard', need('dashboard.view'), wrap(async (req, res) => {
  const profit = canProfit(req);
  const salesValues = can(req, 'dashboard.sales_values') || profit;
  const settings = await loadAppSettings();
  const [skus, orderRows, movements] = await Promise.all([
    listSkus({ showCost: profit }),
    Order.findAll({ order: [['createdAt', 'DESC'], ['id', 'DESC']] }),
    StockMovement.findAll({
      where: { kind: { [Op.in]: ['stock_in', 'return', 'stock_out'] } },
      order: [['createdAt', 'DESC'], ['id', 'DESC']],
      limit: 10,
      raw: true,
    }),
  ]);
  const orders = orderRows.map((o) => toSalesOrder(o, { customerPrefix: settings.customerPrefix }));
  const confirmed = orders.filter(isConfirmed);
  const today = localDate();
  const todayOrders = confirmed.filter((o) => localDate(new Date(o.orderDate)) === today);
  const costs = saleCostMap(orderRows);
  const costBySku = new Map(skus.map((s) => [s.sku, s.costPrice]));

  let totalSales = 0;
  let totalCogs = 0;
  const top = new Map();
  for (const o of confirmed) {
    for (const item of o.items) {
      const sold = item.quantity;
      if (sold <= 0) continue;
      const netQty = sold - Math.min(item.returnedQty, sold);
      const unitCost = costs[`${o.id}|${item.sku}`] ?? costBySku.get(item.sku) ?? 0;
      totalSales += (item.lineTotal / sold) * netQty;
      totalCogs += unitCost * netQty;
      const t = top.get(item.sku) || { sku: item.sku, name: item.name, quantity: 0, revenue: 0 };
      t.quantity += sold;
      t.revenue += item.lineTotal;
      top.set(item.sku, t);
    }
  }

  // Liabilities and the cash position (the design's formula: product money
  // received, less refunds and returned items, less reimbursements paid).
  let totalLiabilities = null;
  let cash;
  if (profit || can(req, 'liabilities.view')) {
    const liabs = await HubLiability.findAll({ attributes: ['amount', 'reimbursed', 'status'], raw: true });
    totalLiabilities = round2(liabs.filter((l) => l.status !== 'paid').reduce((s, l) => s + Math.max(num(l.amount) - num(l.reimbursed), 0), 0));
  }
  if (profit || can(req, 'liabilities.view')) {
    const returnedByOrder = new Map();
    for (const o of orders) {
      for (const it of o.items) {
        const returned = Math.min(it.returnedQty, it.quantity);
        if (it.quantity > 0 && returned > 0) returnedByOrder.set(o.id, (returnedByOrder.get(o.id) || 0) + (it.lineTotal / it.quantity) * returned);
      }
    }
    const held = new Map();
    let productPayments = 0;
    let refunds = 0;
    for (const o of confirmed) {
      const received = Math.max(o.amountReceived, o.paymentStatus === 'Paid' ? o.grandTotal : 0);
      if (received <= 0) continue;
      const productReceived = Math.min(received, Math.max(o.grandTotal - o.deliveryCharge, 0));
      const refund = o.paymentStatus === 'Refunded' ? productReceived : Math.min(returnedByOrder.get(o.id) || 0, productReceived);
      productPayments += productReceived;
      refunds += refund;
      const label = (o.paymentHeldIn || '').trim() || 'Not recorded';
      held.set(label, (held.get(label) || 0) + productReceived - refund);
    }
    const liabilityPaid = num(await HubReimbursement.sum('amount'));
    cash = {
      total: round2(productPayments - refunds - liabilityPaid),
      productPaymentsReceived: round2(productPayments),
      refunds: round2(refunds),
      liabilityPaymentsPaid: round2(liabilityPaid),
      byHeldIn: [...held.entries()].map(([label, value]) => ({ label, value: round2(value) })).sort((a, b) => b.value - a.value),
    };
  }

  const salesByDay = new Map();
  for (const o of confirmed) {
    const date = localDate(new Date(o.orderDate));
    const e = salesByDay.get(date) || { date, sales: 0, orders: 0 };
    e.sales += o.grandTotal;
    e.orders += 1;
    salesByDay.set(date, e);
  }
  const skuOf = new Map(skus.map((s) => [s.key, s.sku]));
  const recentMovements = movements.map((m) => ({
    id: String(m.id),
    type: m.kind === 'return' || String(m.reference || '').startsWith('RET-') ? 'Return' : m.kind === 'stock_out' ? 'Manual Stock Out' : 'Stock In',
    reference: m.reference || '',
    date: m.txnDate || localDate(new Date(m.createdAt)),
    sku: skuOf.get(skuKey(m.productId, m.variantIndex)) || `P${m.productId}`,
    quantity: m.quantity,
    note: m.notes || m.reason || null,
  }));

  // ── Classic-admin and ERP overview figures, merged in ────────────────
  // Revenue = grand totals of confirmed orders (all channels), on the store day.
  const monthKey = (day) => day.slice(0, 7);
  const thisMonth = monthKey(today);
  const lastMonthDate = new Date(`${thisMonth}-01T12:00:00`);
  lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
  const lastMonth = localDate(lastMonthDate).slice(0, 7);
  const days30 = [];
  for (let i = 29; i >= 0; i -= 1) {
    const dd = new Date(`${today}T12:00:00`);
    dd.setDate(dd.getDate() - i);
    days30.push(localDate(dd));
  }
  const months12 = [];
  for (let i = 11; i >= 0; i -= 1) {
    const dd = new Date(`${thisMonth}-01T12:00:00`);
    dd.setMonth(dd.getMonth() - i);
    months12.push(localDate(dd).slice(0, 7));
  }
  const byDay = new Map(days30.map((d) => [d, { label: d, revenue: 0, orders: 0 }]));
  const byMonth = new Map(months12.map((m) => [m, { label: m, revenue: 0, orders: 0 }]));
  const payModes = new Map();
  let monthRevenue = 0;
  let lastMonthRevenue = 0;
  for (const o of confirmed) {
    const day = localDate(new Date(o.orderDate));
    const m = monthKey(day);
    if (byDay.has(day)) { byDay.get(day).revenue += o.grandTotal; byDay.get(day).orders += 1; }
    if (byMonth.has(m)) { byMonth.get(m).revenue += o.grandTotal; byMonth.get(m).orders += 1; }
    if (m === thisMonth) monthRevenue += o.grandTotal;
    if (m === lastMonth) lastMonthRevenue += o.grandTotal;
    const pm = payModes.get(o.paymentMode) || { method: o.paymentMode, orders: 0, revenue: 0 };
    pm.orders += 1;
    pm.revenue += o.grandTotal;
    payModes.set(o.paymentMode, pm);
  }
  const money = (v) => (salesValues ? round2(v) : null);
  const series = (rows) => rows.map((r) => ({ ...r, revenue: money(r.revenue) }));

  // Today's bill and margin, on the same line costs as the totals above.
  let todayNet = 0;
  let todayCogs = 0;
  for (const o of todayOrders) {
    for (const item of o.items) {
      if (item.quantity <= 0) continue;
      const netQty = item.quantity - Math.min(item.returnedQty, item.quantity);
      todayNet += (item.lineTotal / item.quantity) * netQty;
      todayCogs += (costs[`${o.id}|${item.sku}`] ?? costBySku.get(item.sku) ?? 0) * netQty;
    }
  }
  const monthStart = `${thisMonth}-01`;
  const [customerTotal, customerNew, openPurchaseOrders, accounts, wastage] = await Promise.all([
    User.count({ where: { role: 'customer' } }),
    User.count({ where: { role: 'customer', createdAt: { [Op.gte]: rangeStart(monthStart) } } }),
    PurchaseOrder.count({ where: { status: { [Op.in]: ['draft', 'sent', 'partial'] } } }),
    profit ? CashAccount.findAll({ where: { active: true }, attributes: ['id', 'openingBalance'], raw: true }) : [],
    profit ? Wastage.sum('totalCost', { where: { status: 'posted', wastageDate: { [Op.between]: [monthStart, today] } } }) : null,
  ]);
  let cashInAccounts = null;
  if (profit) {
    const sums = accounts.length
      ? await CashTransaction.findAll({
        where: { cashAccountId: accounts.map((a) => a.id) },
        attributes: ['cashAccountId', [CashTransaction.sequelize.fn('SUM', CashTransaction.sequelize.col('amount')), 'total']],
        group: ['cashAccountId'],
        raw: true,
      })
      : [];
    const byAcct = new Map(sums.map((s) => [s.cashAccountId, num(s.total)]));
    cashInAccounts = round2(accounts.reduce((s, a) => s + num(a.openingBalance) + (byAcct.get(a.id) || 0), 0));
  }
  const allStatuses = ['Draft', 'Confirmed', 'Awaiting Pickup', 'Out for Delivery', 'Delivered', 'Delivery Failed',
    'Collected', 'Order Fulfilled', 'Returned', 'Cancelled'];
  const overview = {
    revenueChart: { days: series([...byDay.values()]), months: series([...byMonth.values()]) },
    monthRevenue: money(monthRevenue),
    lastMonthRevenue: money(lastMonthRevenue),
    growthPercent: salesValues
      ? (lastMonthRevenue > 0 ? round2(((monthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100) : null)
      : null,
    customers: { total: customerTotal, newThisMonth: customerNew },
    orderStatus: allStatuses.map((status) => ({ status, count: orders.filter((o) => o.status === status).length }))
      .filter((s) => s.count > 0),
    paymentMethods: [...payModes.values()].map((p) => ({ ...p, revenue: money(p.revenue) }))
      .sort((a, b) => b.orders - a.orders),
    avgBillToday: salesValues ? (todayOrders.length ? round2(todayOrders.reduce((s, o) => s + o.grandTotal, 0) / todayOrders.length) : 0) : null,
    grossProfitToday: profit ? round2(todayNet - todayCogs) : null,
    marginTodayPercent: profit ? (todayNet > 0 ? round2(((todayNet - todayCogs) / todayNet) * 100) : 0) : null,
    openPurchaseOrders,
    cashInAccounts,
    wastageThisMonth: profit ? round2(num(wastage)) : null,
    reorderCount: skus.filter((p) => p.stockStatus !== 'In Stock' && p.isActive).length,
  };

  const statuses = ['Pending', 'Confirmed', 'Out for Delivery', 'Delivered', 'Returned', 'Cancelled'];
  res.set('Cache-Control', 'no-store');
  res.json({
    syncedAt: new Date().toISOString(),
    source: 'cloud',
    kpis: {
      totalSkus: skus.length,
      totalStock: skus.reduce((s, p) => s + p.currentStock, 0),
      inventoryCostValue: profit ? round2(skus.reduce((s, p) => s + Math.max(p.currentStock, 0) * p.costPrice, 0)) : null,
      retailStockValue: salesValues ? round2(skus.reduce((s, p) => s + Math.max(p.currentStock, 0) * p.sellingPriceQar, 0)) : null,
      todayOrders: todayOrders.length,
      todaySales: salesValues ? round2(todayOrders.reduce((s, o) => s + o.grandTotal, 0)) : null,
      totalSales: salesValues ? round2(totalSales) : null,
      totalProfit: profit ? round2(totalSales - totalCogs) : null,
      totalLiabilities,
      totalAvailableCash: cash ? cash.total : null,
      pendingOrders: orders.filter((o) => o.status === 'Pending' || o.status === 'Confirmed').length,
      outForDeliveryOrders: orders.filter((o) => o.status === 'Out for Delivery').length,
      deliveredOrders: orders.filter((o) => o.status === 'Delivered').length,
      returnedOrders: orders.filter((o) => o.status === 'Returned').length,
      lowStockCount: skus.filter((p) => p.stockStatus === 'Low Stock').length,
      outOfStockCount: skus.filter((p) => p.stockStatus === 'Out of Stock').length,
    },
    ...(cash ? { cash } : {}),
    recentOrders: orders.slice(0, 6).map((o) => (salesValues ? o : {
      id: o.id, channel: o.channel, customerName: o.customerName, orderDate: o.orderDate, status: o.status,
      paymentMode: o.paymentMode, fulfilmentMethod: o.fulfilmentMethod, items: [],
    })),
    lowStock: skus.filter((p) => p.stockStatus !== 'In Stock').sort((a, b) => a.currentStock - b.currentStock).slice(0, 8),
    topSelling: [...top.values()].map((t) => ({ ...t, revenue: salesValues ? round2(t.revenue) : 0 }))
      .sort((a, b) => b.quantity - a.quantity).slice(0, 6),
    recentMovements,
    salesSummary: [...salesByDay.values()].map((d) => ({ ...d, sales: salesValues ? round2(d.sales) : 0 }))
      .sort((a, b) => a.date.localeCompare(b.date)).slice(-14),
    deliverySummary: statuses.map((status) => ({ status, count: orders.filter((o) => o.status === status).length })),
    overview,
  });
}));

export default router;
