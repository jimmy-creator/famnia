import { Router } from 'express';
import { Op } from 'sequelize';
import { HubLiability, HubReimbursement, Order, StockMovement } from '../models/index.js';
import { protect } from '../middleware/auth.js';
import { bad, can, need, wrap as wrapAs } from '../hub/http.js';
import { listSkus, skuKey } from '../hub/catalog.js';
import { toSalesOrder } from '../hub/sales.js';
import { loadAppSettings } from '../hub/settings.js';
import { computePnl } from './finance.js';
import { localDate, rangeEnd, rangeStart } from '../utils/dates.js';

/**
 * FEMNIA Hub Dashboard and the server side of Reports. Sales figures are
 * computed the hub's way (order lines net of returns); the financial summary
 * comes from computePnl so it can never disagree with the classic P&L.
 */
const router = Router();
router.use(protect);
const wrap = (fn) => wrapAs('hubReports', fn);

const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const num = (v) => parseFloat(v) || 0;
const isConfirmed = (o) => o.status !== 'Draft' && o.status !== 'Cancelled';
const canProfit = (req) => can(req, 'dashboard.profit_values') || can(req, 'reports.financial');

/** Unit cost per `orderNumber|sku`, from the cost snapshotted on each order line. */
function saleCostMap(orders) {
  const map = {};
  for (const o of orders) {
    for (const it of Array.isArray(o.items) ? o.items : []) {
      if (it.costPrice === undefined || it.costPrice === null) continue;
      const sku = it.sku || (it.productId ? `P${it.productId}` : '');
      map[`${o.orderNumber}|${sku}`] = round2(it.costPrice);
    }
  }
  return map;
}

router.get('/reports/sale-costs', need('reports.financial', 'dashboard.profit_values'), wrap(async (req, res) => {
  const orders = await Order.findAll({ attributes: ['orderNumber', 'items'] });
  res.json(saleCostMap(orders));
}));

router.get('/reports/financial-summary', need('reports.financial'), wrap(async (req, res) => {
  const from = String(req.query.from || '');
  const to = String(req.query.to || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw bad('Choose a date range.');
  const p = await computePnl({ from: rangeStart(from), to: rangeEnd(to) });
  res.json({
    productSales: round2(p.productRevenue - p.refunds),
    deliveryCharges: round2(p.deliveryIncome),
    cogs: round2(p.cogs),
    grossProfit: round2(p.grossProfit),
    expenses: round2(p.expenses),
    netProfit: round2(p.netProfit),
    depreciation: round2(p.depreciation),
    stockLosses: round2(p.stockLosses),
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
  if (profit) {
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
    recentOrders: orders.slice(0, 6),
    lowStock: skus.filter((p) => p.stockStatus !== 'In Stock').sort((a, b) => a.currentStock - b.currentStock).slice(0, 8),
    topSelling: [...top.values()].map((t) => ({ ...t, revenue: salesValues ? round2(t.revenue) : 0 }))
      .sort((a, b) => b.quantity - a.quantity).slice(0, 6),
    recentMovements,
    salesSummary: [...salesByDay.values()].map((d) => ({ ...d, sales: salesValues ? round2(d.sales) : 0 }))
      .sort((a, b) => a.date.localeCompare(b.date)).slice(-14),
    deliverySummary: statuses.map((status) => ({ status, count: orders.filter((o) => o.status === status).length })),
  });
}));

export default router;
