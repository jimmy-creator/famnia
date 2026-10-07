/**
 * ERP reporting — the numbers the client asked to be able to see.
 *
 *   GET /api/erp-reports/sales                unified sales report
 *   GET /api/erp-reports/dead-stock           stock that isn't moving
 *   GET /api/erp-reports/fast-moving          best sellers by velocity
 *   GET /api/erp-reports/reorder              at/below reorder level
 *   GET /api/erp-reports/purchases-by-supplier  spend + outstanding payables
 *
 * Every endpoint accepts `?format=csv` to download the same data as a
 * spreadsheet, because this is what actually gets sent to an accountant.
 *
 * Sales figures come from Order rows, which cover online AND POS (the POS
 * writes Orders too — see routes/pos.js), so one report covers every channel,
 * including phone and WhatsApp orders rung up at the till.
 */
import { Router } from 'express';
import { Op, fn, col } from 'sequelize';
import {
  Order, Product, ProductStock, Location, Supplier, PurchaseOrder,
  SupplierPayment,
} from '../models/index.js';
import { protect, admin, requirePermission } from '../middleware/auth.js';
import { localDate } from '../utils/dates.js';

const router = Router();

/**
 * Order.items is a JSON column. Existing aggregation code reads it with
 * `raw: true`, which bypasses the MariaDB JSON-parsing hook in models/index.js
 * (that hook needs a model instance). On MariaDB the value therefore comes
 * back as a string — parse defensively so reports don't silently return zero.
 */
function parseItems(items) {
  if (Array.isArray(items)) return items;
  if (typeof items === 'string') {
    try {
      const parsed = JSON.parse(items);
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }
  return [];
}

/** Inclusive day range → Sequelize where clause on createdAt. */
function buildDateWhere(query, field = 'createdAt') {
  const where = {};
  if (query.from || query.to) {
    where[field] = {};
    if (query.from) where[field][Op.gte] = new Date(`${query.from}T00:00:00`);
    if (query.to) where[field][Op.lte] = new Date(`${query.to}T23:59:59.999`);
  }
  return where;
}

/** Minimal CSV writer — quotes every field so commas in names are safe. */
function sendCsv(res, filename, columns, rows) {
  const esc = (v) => {
    if (v == null) return '""';
    return `"${String(v).replace(/"/g, '""')}"`;
  };
  const lines = [
    columns.map((c) => esc(c.label)).join(','),
    ...rows.map((r) => columns.map((c) => esc(typeof c.value === 'function' ? c.value(r) : r[c.value])).join(',')),
  ];
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  // BOM so Excel opens Arabic product names correctly.
  res.send('﻿' + lines.join('\n'));
}

/**
 * Orders that count as revenue.
 *
 * Cancelled orders are always excluded. Unpaid orders are excluded by
 * default, but COD/aggregator flows often sit as `pending` until delivery,
 * so `?includeUnpaid=true` widens it to everything not cancelled.
 */
function revenueWhere(query) {
  const where = {
    ...buildDateWhere(query),
    orderStatus: { [Op.ne]: 'cancelled' },
  };
  if (query.includeUnpaid !== 'true') where.paymentStatus = 'paid';
  if (query.locationId) where.locationId = parseInt(query.locationId, 10);
  if (query.channel) where.channel = query.channel;
  return where;
}

// ─── Sales report ──────────────────────────────────────────────────
// ?groupBy=day|month|product|category|channel|location  (default: day)
router.get('/sales', protect, admin, requirePermission('analytics'), async (req, res) => {
  try {
    const groupBy = req.query.groupBy || 'day';
    const orders = await Order.findAll({
      where: revenueWhere(req.query),
      attributes: ['id', 'orderNumber', 'items', 'totalAmount', 'discount', 'taxAmount',
        'shippingCharge', 'channel', 'locationId', 'createdAt'],
      order: [['createdAt', 'ASC']],
    });

    // Product → category lookup, needed for the category grouping and to
    // report cost of goods so the report can show margin, not just revenue.
    const products = await Product.findAll({ attributes: ['id', 'name', 'nameAr', 'code', 'category', 'costPrice'] });
    const productById = new Map(products.map((p) => [p.id, p]));

    const buckets = new Map();
    const totals = {
      orders: 0, units: 0, gross: 0, discount: 0, tax: 0,
      shipping: 0, net: 0, cogs: 0,
    };

    for (const o of orders) {
      const items = parseItems(o.items);
      const units = items.reduce((s, i) => s + (parseInt(i.quantity, 10) || 0), 0);
      const total = parseFloat(o.totalAmount) || 0;

      // Cost of goods for this order, from each product's current cost price.
      const cogs = items.reduce((s, i) => {
        const p = productById.get(i.productId);
        return s + (parseFloat(p?.costPrice) || 0) * (parseInt(i.quantity, 10) || 0);
      }, 0);

      totals.orders += 1;
      totals.units += units;
      totals.gross += total;
      totals.discount += parseFloat(o.discount) || 0;
      totals.tax += parseFloat(o.taxAmount) || 0;
      totals.shipping += parseFloat(o.shippingCharge) || 0;
      totals.net += total;
      totals.cogs += cogs;

      // Product and category groupings fan out one row per line item; the
      // others produce a single row per order.
      if (groupBy === 'product' || groupBy === 'category') {
        for (const i of items) {
          const p = productById.get(i.productId);
          const key = groupBy === 'product'
            ? `p:${i.productId}`
            : `c:${p?.category || 'Uncategorised'}`;
          const label = groupBy === 'product'
            ? (p?.name || i.name || `#${i.productId}`)
            : (p?.category || 'Uncategorised');

          const qty = parseInt(i.quantity, 10) || 0;
          const revenue = (parseFloat(i.price) || 0) * qty;
          const lineCost = (parseFloat(p?.costPrice) || 0) * qty;

          const b = buckets.get(key) || {
            key, label, labelAr: groupBy === 'product' ? (p?.nameAr || null) : null,
            code: p?.code || null, orders: 0, units: 0, revenue: 0, cogs: 0,
            // Distinct order ids — two products from the same category in one
            // order is still one order, not two.
            orderIds: new Set(),
          };
          b.units += qty;
          b.revenue += revenue;
          b.cogs += lineCost;
          b.orderIds.add(o.id);
          buckets.set(key, b);
        }
      } else {
        let key; let label;
        if (groupBy === 'channel') {
          key = `ch:${o.channel}`; label = o.channel;
        } else if (groupBy === 'location') {
          key = `l:${o.locationId || 0}`; label = o.locationId ? `Location ${o.locationId}` : 'Unassigned';
        } else if (groupBy === 'month') {
          key = localDate(o.createdAt).slice(0, 7); label = key;
        } else {
          key = localDate(o.createdAt); label = key;
        }
        const b = buckets.get(key) || { key, label, orders: 0, units: 0, revenue: 0, cogs: 0 };
        b.orders += 1;
        b.units += units;
        b.revenue += total;
        b.cogs += cogs;
        buckets.set(key, b);
      }
    }

    // Resolve location names in one query rather than N.
    if (groupBy === 'location') {
      const locations = await Location.findAll({ attributes: ['id', 'name'] });
      const byId = new Map(locations.map((l) => [l.id, l.name]));
      for (const b of buckets.values()) {
        const id = parseInt(b.key.slice(2), 10);
        if (byId.has(id)) b.label = byId.get(id);
      }
    }

    const rows = [...buckets.values()]
      .map(({ orderIds, ...b }) => ({
        ...b,
        // Product/category buckets counted distinct orders in a Set; the
        // others already incremented `orders` directly.
        orders: orderIds ? orderIds.size : b.orders,
        revenue: +b.revenue.toFixed(3),
        cogs: +b.cogs.toFixed(3),
        profit: +(b.revenue - b.cogs).toFixed(3),
        margin: b.revenue > 0
          ? +(((b.revenue - b.cogs) / b.revenue) * 100).toFixed(1)
          : 0,
      }))
      .sort((a, b) => (['day', 'month'].includes(groupBy) ? a.key.localeCompare(b.key) : b.revenue - a.revenue));

    for (const k of Object.keys(totals)) totals[k] = +totals[k].toFixed(3);
    totals.profit = +(totals.net - totals.cogs).toFixed(3);
    totals.margin = totals.net > 0 ? +((totals.profit / totals.net) * 100).toFixed(1) : 0;
    totals.avgOrderValue = totals.orders > 0 ? +(totals.gross / totals.orders).toFixed(3) : 0;

    if (req.query.format === 'csv') {
      return sendCsv(res, `sales-${groupBy}.csv`, [
        { label: groupBy, value: 'label' },
        { label: 'Orders', value: 'orders' },
        { label: 'Units', value: 'units' },
        { label: 'Revenue', value: 'revenue' },
        { label: 'Cost', value: 'cogs' },
        { label: 'Profit', value: 'profit' },
        { label: 'Margin %', value: 'margin' },
      ], rows);
    }

    res.json({ groupBy, from: req.query.from || null, to: req.query.to || null, totals, rows });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * Shared helper for the movement reports: units sold per product over a
 * window, derived from Order.items.
 */
async function unitsSoldByProduct({ from, to, locationId }) {
  const where = { orderStatus: { [Op.ne]: 'cancelled' }, paymentStatus: 'paid' };
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt[Op.gte] = from;
    if (to) where.createdAt[Op.lte] = to;
  }
  if (locationId) where.locationId = parseInt(locationId, 10);

  const orders = await Order.findAll({ where, attributes: ['items', 'createdAt'] });

  const sold = new Map();
  for (const o of orders) {
    for (const i of parseItems(o.items)) {
      const id = i.productId;
      if (!id) continue;
      const rec = sold.get(id) || { units: 0, revenue: 0, lastSoldAt: null };
      rec.units += parseInt(i.quantity, 10) || 0;
      rec.revenue += (parseFloat(i.price) || 0) * (parseInt(i.quantity, 10) || 0);
      if (!rec.lastSoldAt || new Date(o.createdAt) > new Date(rec.lastSoldAt)) {
        rec.lastSoldAt = o.createdAt;
      }
      sold.set(id, rec);
    }
  }
  return sold;
}

// ─── Dead stock ────────────────────────────────────────────────────
// Products holding stock that sold fewer than `maxUnits` over `days`.
router.get('/dead-stock', protect, admin, requirePermission('analytics'), async (req, res) => {
  try {
    const days = Math.max(1, parseInt(req.query.days, 10) || 90);
    const maxUnits = parseInt(req.query.maxUnits, 10) || 0;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const sold = await unitsSoldByProduct({ from: since, locationId: req.query.locationId });

    const products = await Product.findAll({
      where: { active: true },
      attributes: ['id', 'name', 'nameAr', 'code', 'category', 'price', 'costPrice', 'stock', 'createdAt'],
    });

    // Per-location stock when a location filter is applied, otherwise the
    // product-wide total that Product.stock already carries.
    let stockByProduct = null;
    if (req.query.locationId) {
      const rows = await ProductStock.findAll({
        where: { locationId: parseInt(req.query.locationId, 10) },
        attributes: ['productId', [fn('SUM', col('quantity')), 'qty']],
        group: ['productId'],
        raw: true,
      });
      stockByProduct = new Map(rows.map((r) => [r.productId, parseInt(r.qty, 10) || 0]));
    }

    const rows = products
      .map((p) => {
        const s = sold.get(p.id);
        const units = s?.units || 0;
        const qty = stockByProduct ? (stockByProduct.get(p.id) || 0) : (p.stock || 0);
        const cost = parseFloat(p.costPrice) || 0;

        // Days since the last sale — null when it has never sold at all,
        // which the UI shows as "never" rather than a misleading number.
        const lastSoldAt = s?.lastSoldAt || null;
        const daysSinceLastSale = lastSoldAt
          ? Math.floor((Date.now() - new Date(lastSoldAt)) / (1000 * 60 * 60 * 24))
          : null;

        return {
          id: p.id, name: p.name, nameAr: p.nameAr, code: p.code,
          category: p.category,
          stock: qty,
          unitsSold: units,
          lastSoldAt,
          daysSinceLastSale,
          costPrice: +cost.toFixed(3),
          // The money sitting on the shelf doing nothing — the point of the report.
          tiedUpValue: +(qty * cost).toFixed(3),
        };
      })
      // Only stock we actually hold, and only what barely moved.
      .filter((r) => r.stock > 0 && r.unitsSold <= maxUnits)
      .sort((a, b) => b.tiedUpValue - a.tiedUpValue);

    const totalValue = +rows.reduce((s, r) => s + r.tiedUpValue, 0).toFixed(3);

    if (req.query.format === 'csv') {
      return sendCsv(res, `dead-stock-${days}d.csv`, [
        { label: 'Code', value: 'code' },
        { label: 'Product', value: 'name' },
        { label: 'Arabic', value: 'nameAr' },
        { label: 'Category', value: 'category' },
        { label: 'Stock', value: 'stock' },
        { label: `Units sold (${days}d)`, value: 'unitsSold' },
        { label: 'Days since last sale', value: (r) => r.daysSinceLastSale ?? 'never' },
        { label: 'Tied-up value', value: 'tiedUpValue' },
      ], rows);
    }

    res.json({ days, maxUnits, totalValue, count: rows.length, rows });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Fast moving ───────────────────────────────────────────────────
router.get('/fast-moving', protect, admin, requirePermission('analytics'), async (req, res) => {
  try {
    const days = Math.max(1, parseInt(req.query.days, 10) || 30);
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 500);
    const since = new Date();
    since.setDate(since.getDate() - days);

    const sold = await unitsSoldByProduct({ from: since, locationId: req.query.locationId });

    const ids = [...sold.keys()];
    const products = ids.length
      ? await Product.findAll({
        where: { id: { [Op.in]: ids } },
        attributes: ['id', 'name', 'nameAr', 'code', 'category', 'price', 'costPrice', 'stock'],
      })
      : [];
    const productById = new Map(products.map((p) => [p.id, p]));

    const rows = [...sold.entries()]
      .map(([id, s]) => {
        const p = productById.get(id);
        const velocity = s.units / days;
        const stock = p?.stock || 0;
        const cost = parseFloat(p?.costPrice) || 0;
        return {
          id,
          name: p?.name || `#${id}`,
          nameAr: p?.nameAr || null,
          code: p?.code || null,
          category: p?.category || null,
          unitsSold: s.units,
          revenue: +s.revenue.toFixed(3),
          profit: +(s.revenue - cost * s.units).toFixed(3),
          // Units per day, and how long current stock lasts at that rate —
          // the number that tells you what to reorder before it runs out.
          velocity: +velocity.toFixed(2),
          stock,
          daysOfCover: velocity > 0 ? +(stock / velocity).toFixed(1) : null,
          stockOutRisk: velocity > 0 && stock / velocity < 7,
        };
      })
      .sort((a, b) => b.unitsSold - a.unitsSold)
      .slice(0, limit);

    if (req.query.format === 'csv') {
      return sendCsv(res, `fast-moving-${days}d.csv`, [
        { label: 'Code', value: 'code' },
        { label: 'Product', value: 'name' },
        { label: 'Arabic', value: 'nameAr' },
        { label: 'Units sold', value: 'unitsSold' },
        { label: 'Revenue', value: 'revenue' },
        { label: 'Units/day', value: 'velocity' },
        { label: 'Stock', value: 'stock' },
        { label: 'Days of cover', value: (r) => r.daysOfCover ?? '' },
      ], rows);
    }

    res.json({ days, count: rows.length, rows });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Reorder report ────────────────────────────────────────────────
router.get('/reorder', protect, admin, requirePermission('products'), async (req, res) => {
  try {
    const days = Math.max(1, parseInt(req.query.days, 10) || 30);
    const since = new Date();
    since.setDate(since.getDate() - days);

    const sold = await unitsSoldByProduct({ from: since, locationId: req.query.locationId });

    const products = await Product.findAll({
      where: { active: true },
      attributes: ['id', 'name', 'nameAr', 'code', 'category', 'stock',
        'reorderLevel', 'reorderQty', 'costPrice', 'preferredSupplierId'],
      include: [{ model: Supplier, as: 'preferredSupplier', attributes: ['id', 'name'] }],
    });

    // Per-location reorder thresholds override the product-wide level.
    const stockRows = await ProductStock.findAll({
      where: req.query.locationId ? { locationId: parseInt(req.query.locationId, 10) } : {},
      attributes: ['productId', 'locationId', 'quantity', 'reorderThreshold'],
      raw: true,
    });
    const thresholdByProduct = new Map();
    const qtyByProduct = new Map();
    for (const r of stockRows) {
      qtyByProduct.set(r.productId, (qtyByProduct.get(r.productId) || 0) + (r.quantity || 0));
      if (r.reorderThreshold != null) {
        thresholdByProduct.set(r.productId, Math.max(thresholdByProduct.get(r.productId) || 0, r.reorderThreshold));
      }
    }

    const rows = products
      .map((p) => {
        const level = thresholdByProduct.get(p.id) ?? p.reorderLevel;
        if (level == null) return null; // no reorder policy set — not a finding

        const stock = req.query.locationId ? (qtyByProduct.get(p.id) || 0) : (p.stock || 0);
        if (stock > level) return null;

        const velocity = (sold.get(p.id)?.units || 0) / days;
        const suggested = p.reorderQty || Math.max(level * 2 - stock, 1);

        return {
          id: p.id, name: p.name, nameAr: p.nameAr, code: p.code,
          category: p.category,
          stock,
          reorderLevel: level,
          suggestedQty: suggested,
          velocity: +velocity.toFixed(2),
          daysOfCover: velocity > 0 ? +(stock / velocity).toFixed(1) : null,
          costPrice: +(parseFloat(p.costPrice) || 0).toFixed(3),
          estimatedCost: +((parseFloat(p.costPrice) || 0) * suggested).toFixed(3),
          supplierId: p.preferredSupplierId || null,
          supplierName: p.preferredSupplier?.name || null,
          // Already out of stock, not merely low — this is the urgent bucket.
          outOfStock: stock <= 0,
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (a.outOfStock !== b.outOfStock) return a.outOfStock ? -1 : 1;
        return (a.daysOfCover ?? 999) - (b.daysOfCover ?? 999);
      });

    if (req.query.format === 'csv') {
      return sendCsv(res, 'reorder.csv', [
        { label: 'Code', value: 'code' },
        { label: 'Product', value: 'name' },
        { label: 'Stock', value: 'stock' },
        { label: 'Reorder level', value: 'reorderLevel' },
        { label: 'Suggested qty', value: 'suggestedQty' },
        { label: 'Supplier', value: 'supplierName' },
        { label: 'Est. cost', value: 'estimatedCost' },
      ], rows);
    }

    res.json({
      count: rows.length,
      outOfStockCount: rows.filter((r) => r.outOfStock).length,
      estimatedTotal: +rows.reduce((s, r) => s + r.estimatedCost, 0).toFixed(3),
      rows,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Purchases by supplier ─────────────────────────────────────────
router.get('/purchases-by-supplier', protect, admin, requirePermission('analytics'), async (req, res) => {
  try {
    const where = { ...buildDateWhere(req.query), status: { [Op.ne]: 'cancelled' } };
    if (req.query.supplierId) where.supplierId = parseInt(req.query.supplierId, 10);

    const [orders, suppliers, payments] = await Promise.all([
      PurchaseOrder.findAll({
        where,
        attributes: ['id', 'supplierId', 'totalAmount', 'status', 'createdAt'],
        raw: true,
      }),
      Supplier.findAll({ attributes: ['id', 'name', 'code', 'openingBalance', 'paymentTerms'] }),
      SupplierPayment.findAll({ attributes: ['supplierId', 'amount'], raw: true }),
    ]);

    const paidBySupplier = new Map();
    for (const p of payments) {
      paidBySupplier.set(p.supplierId, (paidBySupplier.get(p.supplierId) || 0) + (parseFloat(p.amount) || 0));
    }

    const agg = new Map();
    for (const o of orders) {
      const rec = agg.get(o.supplierId) || { poCount: 0, totalPurchased: 0 };
      rec.poCount += 1;
      rec.totalPurchased += parseFloat(o.totalAmount) || 0;
      agg.set(o.supplierId, rec);
    }

    const rows = suppliers
      .map((s) => {
        const a = agg.get(s.id) || { poCount: 0, totalPurchased: 0 };
        const paid = paidBySupplier.get(s.id) || 0;
        const opening = parseFloat(s.openingBalance) || 0;
        return {
          id: s.id, name: s.name, code: s.code, paymentTerms: s.paymentTerms,
          poCount: a.poCount,
          totalPurchased: +a.totalPurchased.toFixed(3),
          // Payments are lifetime totals, so outstanding is a lifetime figure
          // too — it deliberately ignores the date filter above, which only
          // scopes the purchase columns.
          totalPaid: +paid.toFixed(3),
          outstanding: +(opening + a.totalPurchased - paid).toFixed(3),
        };
      })
      .filter((r) => r.poCount > 0 || r.outstanding !== 0)
      .sort((a, b) => b.totalPurchased - a.totalPurchased);

    if (req.query.format === 'csv') {
      return sendCsv(res, 'purchases-by-supplier.csv', [
        { label: 'Code', value: 'code' },
        { label: 'Supplier', value: 'name' },
        { label: 'POs', value: 'poCount' },
        { label: 'Purchased', value: 'totalPurchased' },
        { label: 'Paid', value: 'totalPaid' },
        { label: 'Outstanding', value: 'outstanding' },
      ], rows);
    }

    res.json({
      totals: {
        purchased: +rows.reduce((s, r) => s + r.totalPurchased, 0).toFixed(3),
        outstanding: +rows.reduce((s, r) => s + r.outstanding, 0).toFixed(3),
      },
      rows,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
