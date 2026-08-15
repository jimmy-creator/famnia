/**
 * POS endpoints — used by the in-store sales terminal.
 *
 * All endpoints require an open cashier shift (protectCashier middleware
 * attaches req.cashierSessionId + req.cashierLocationId).
 *
 *   GET   /api/pos/products?q=…    barcode/text search, includes per-location stock
 *   POST  /api/pos/sale            create an in-store Order, decrement stock at
 *                                  this location, return the Order for receipt
 *                                  printing
 *   GET   /api/pos/shift-summary   running totals for the current shift
 *                                  (used by the close-shift screen + Z-report)
 */
import { Router } from 'express';
import { Op } from 'sequelize';
import sequelize from '../config/database.js';
import {
  Product, ProductStock, Order, CashierSession, Location, CashAccount, User, Coupon, SalesReturn,
  Category,
  recomputeProductStock, writeCashTxn, logActivity, verifyManagerPin,
} from '../models/index.js';

// Thresholds — when an action crosses these limits, a manager PIN
// override is required. Could move to Settings table later.
const DISCOUNT_PCT_THRESHOLD = 15;     // percent
const REFUND_AMOUNT_THRESHOLD = 50;    // currency units (KWD)
import { protectCashier } from '../middleware/auth.js';
import { refundValuer } from '../utils/refund.js';
import { nextInvoiceNumber } from '../services/invoiceSequence.js';

const router = Router();

function genOrderNumber() {
  return `POS-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
}

// ── Shared product shaping for the terminal (search, quick-pick, browse) ──
const posStockKey = (pid, vIdx) => `${pid}:${vIdx ?? 'b'}`;

// Build a {productId:variantIndex -> qty} map of per-location stock.
async function posStockMap(productIds, locationId) {
  if (!productIds.length) return new Map();
  const stocks = await ProductStock.findAll({
    where: { productId: { [Op.in]: productIds }, locationId },
  });
  return new Map(stocks.map((s) => [posStockKey(s.productId, s.variantIndex), s.quantity]));
}

// Shape a product (no specific variant chosen) into the uniform result the
// terminal's add-to-cart flow expects, with per-location stock attached.
// Browse and quick-pick return the SAME shape as search so the variant
// picker and add-to-cart work identically from every entry point.
function shapeProduct(product, stockMap) {
  const obj = product.toJSON ? product.toJSON() : product;
  const hasVariants = Array.isArray(obj.variants) && obj.variants.length > 0;
  return {
    productId: obj.id,
    name: obj.name,
    code: obj.code || null,
    price: parseFloat(obj.price) || 0,
    variantIndex: null,
    variantOptions: null,
    category: obj.category || null,
    image: obj.images?.[0] || null,
    stockAtLocation: stockMap.get(posStockKey(obj.id, null)) || 0,
    hasVariants,
    variants: hasVariants
      ? obj.variants.map((vr, idx) => ({ ...vr, stockAtLocation: stockMap.get(posStockKey(obj.id, idx)) || 0 }))
      : undefined,
  };
}

// ─── Categories for the browse tiles ───────────────────────────────
// Each row carries a productCount so the tile can show "N items". Counted
// in JS off one lean query rather than a COUNT per category, because a
// product matches on its primary `category` OR anywhere in `categories`.
router.get('/categories', protectCashier, async (req, res) => {
  try {
    const rows = await Category.findAll({
      where: { active: true },
      attributes: ['id', 'name', 'nameAr', 'image'],
      order: [['sortOrder', 'ASC'], ['name', 'ASC']],
    });
    const products = await Product.findAll({
      where: { active: true },
      attributes: ['category', 'categories'],
      raw: true,
    });
    const countByName = new Map();
    for (const p of products) {
      const names = Array.isArray(p.categories) && p.categories.length
        ? p.categories
        : (p.category ? [p.category] : []);
      for (const n of new Set(names)) countByName.set(n, (countByName.get(n) || 0) + 1);
    }
    res.json(rows.map((c) => ({
      ...c.toJSON(),
      productCount: countByName.get(c.name) || 0,
    })));
  } catch (err) {
    console.error('[pos/categories]', err);
    res.status(500).json({ message: err.message });
  }
});

// ─── Quick-pick tiles ──────────────────────────────────────────────
// Featured products plus best sellers, for selling without scanning.
router.get('/quick-products', protectCashier, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 30, 30);
    const PROD_ATTRS = ['id', 'name', 'code', 'price', 'images', 'variants', 'category'];

    const featuredRows = await Product.findAll({
      where: { active: true, featured: true },
      attributes: PROD_ATTRS,
      order: [['name', 'ASC']],
      limit,
    });

    // Best sellers — units sold across paid orders in the last 90 days.
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const paidOrders = await Order.findAll({
      where: { paymentStatus: 'paid', createdAt: { [Op.gte]: since } },
      attributes: ['items'],
      raw: true,
    });
    const qtyByProduct = new Map();
    for (const o of paidOrders) {
      const items = typeof o.items === 'string' ? JSON.parse(o.items || '[]') : (o.items || []);
      for (const it of items) {
        if (!it.productId) continue;
        qtyByProduct.set(it.productId, (qtyByProduct.get(it.productId) || 0) + (parseInt(it.quantity, 10) || 0));
      }
    }
    const topIds = [...qtyByProduct.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([id]) => id);
    const topRows = topIds.length
      ? await Product.findAll({ where: { id: { [Op.in]: topIds }, active: true }, attributes: PROD_ATTRS })
      : [];
    const topById = new Map(topRows.map((p) => [p.id, p]));
    const topSorted = topIds.map((id) => topById.get(id)).filter(Boolean);   // keep sold-rank order

    const allIds = [...new Set([...featuredRows, ...topSorted].map((p) => p.id))];
    const stockMap = await posStockMap(allIds, req.cashierLocationId);
    res.json({
      featured: featuredRows.map((p) => shapeProduct(p, stockMap)),
      topSellers: topSorted.map((p) => shapeProduct(p, stockMap)),
    });
  } catch (err) {
    console.error('[pos/quick-products]', err);
    res.status(500).json({ message: err.message });
  }
});

// ─── Search products for the cart panel ────────────────────────────
// Optimised for a barcode-scanner workflow: tries an exact code/SKU
// match first, then a "starts with" name match, capped at 15 results.
router.get('/products', protectCashier, async (req, res) => {
  try {
    const q = (req.query.q || '').toString().trim();
    const category = (req.query.category || '').toString().trim();

    // Browse by category (image grid) — matches the primary `category` OR
    // any entry in the `categories` array. No search query in this mode.
    if (category && !q) {
      const catJson = sequelize.escape(JSON.stringify(category));
      const rows = await Product.findAll({
        where: {
          active: true,
          [Op.or]: [{ category }, sequelize.literal(`JSON_CONTAINS(categories, ${catJson})`)],
        },
        attributes: ['id', 'name', 'code', 'price', 'images', 'variants', 'category'],
        order: [['name', 'ASC']],
        limit: 60,
      });
      const stockMap = await posStockMap(rows.map((p) => p.id), req.cashierLocationId);
      return res.json(rows.map((p) => shapeProduct(p, stockMap)));
    }

    if (!q) return res.json([]);

    // 1. Exact code match (barcode scanned)
    let exact = await Product.findAll({
      where: { active: true, code: q },
      limit: 5,
    });

    // 1b. Products with no code get a "P<id>" label barcode (see
    //     BarcodeLabelSheet.barcodeForProduct). Resolve that form back to
    //     the product so a label printed from admin or the till scans.
    if (exact.length === 0) {
      const m = /^P(\d+)$/i.exec(q);
      if (m) {
        const byId = await Product.findOne({ where: { id: parseInt(m[1], 10), active: true } });
        if (byId) exact = [byId];
      }
    }

    // 2. Variant-SKU match — Product.variants is JSON, can't index easily,
    //    so we fetch a small slice and filter in JS. For larger catalogues
    //    consider splitting variants into their own table.
    let variantHits = [];
    if (exact.length === 0) {
      const candidates = await Product.findAll({
        where: { active: true, variants: { [Op.ne]: null } },
        attributes: ['id', 'name', 'code', 'price', 'images', 'variants'],
        limit: 500,
      });
      for (const p of candidates) {
        if (!Array.isArray(p.variants)) continue;
        const idx = p.variants.findIndex((v) => v.sku === q);
        if (idx >= 0) variantHits.push({ product: p, variantIndex: idx });
      }
    }

    // 3. Name search — fuzzy
    const nameHits = (exact.length === 0 && variantHits.length === 0)
      ? await Product.findAll({
          where: {
            active: true,
            [Op.or]: [
              { name: { [Op.like]: `%${q}%` } },
              { code: { [Op.like]: `${q}%` } },
            ],
          },
          limit: 15,
          order: [['name', 'ASC']],
        })
      : [];

    // Stitch results into a single uniform shape and attach per-location stock.
    const candidates = [
      ...exact.map((p) => ({ product: p, variantIndex: null })),
      ...variantHits,
      ...nameHits.map((p) => ({ product: p, variantIndex: null })),
    ];
    if (candidates.length === 0) return res.json([]);

    const productIds = [...new Set(candidates.map((c) => c.product.id))];
    const stocks = await ProductStock.findAll({
      where: { productId: { [Op.in]: productIds }, locationId: req.cashierLocationId },
    });
    const stockKey = (pid, vIdx) => `${pid}:${vIdx ?? 'b'}`;
    const stockMap = new Map(stocks.map((s) => [stockKey(s.productId, s.variantIndex), s.quantity]));

    const results = candidates.map(({ product, variantIndex }) => {
      const obj = product.toJSON();
      const v = variantIndex != null && Array.isArray(obj.variants) ? obj.variants[variantIndex] : null;
      const hasVariants = Array.isArray(obj.variants) && obj.variants.length > 0 && variantIndex == null;
      // Enrich each variant with per-location stock so the client's variant
      // picker can show stock and avoid an extra fetch on selection.
      const variantsWithStock = hasVariants
        ? obj.variants.map((vr, idx) => ({
            ...vr,
            stockAtLocation: stockMap.get(stockKey(obj.id, idx)) || 0,
          }))
        : undefined;
      return {
        productId: obj.id,
        name: obj.name + (v ? ` (${Object.values(v.options || {}).join('/')})` : ''),
        code: v?.sku || obj.code || null,
        price: parseFloat(v?.price ?? obj.price) || 0,
        variantIndex,
        variantOptions: v?.options || null,
        image: obj.images?.[0] || null,
        stockAtLocation: stockMap.get(stockKey(obj.id, variantIndex)) || 0,
        hasVariants,
        variants: variantsWithStock,
      };
    });

    res.json(results);
  } catch (err) {
    console.error('[pos/products]', err);
    res.status(500).json({ message: err.message });
  }
});

// ─── Managers (for override PIN picker) ───────────────────────────
router.get('/managers', protectCashier, async (req, res) => {
  try {
    const rows = await User.findAll({
      where: {
        [Op.or]: [
          { role: 'admin' },
          { role: 'cashier', isManager: true },
        ],
      },
      attributes: ['id', 'name', 'role'],
      order: [['name', 'ASC']],
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Recent sales for this shift ─────────────────────────────────
router.get('/recent-sales', protectCashier, async (req, res) => {
  try {
    const rows = await Order.findAll({
      where: { cashierSessionId: req.cashierSessionId },
      attributes: ['id', 'orderNumber', 'totalAmount', 'discount', 'paymentMethod',
                   'items', 'shippingAddress', 'createdAt', 'refundAmount'],
      order: [['createdAt', 'DESC']],
      limit: parseInt(req.query.limit, 10) || 25,
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Reprint receipt payload ─────────────────────────────────────
// Returns the same shape /sale returns on creation — used to reprint
// any past sale from the cashier's shift (or from admin).
router.get('/sales/:id/receipt', protectCashier, async (req, res) => {
  try {
    const order = await Order.findByPk(req.params.id);
    if (!order) return res.status(404).json({ message: 'Sale not found' });
    if (order.cashierSessionId !== req.cashierSessionId && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Sale is not in your current shift' });
    }
    const location = order.locationId
      ? await Location.findByPk(order.locationId, { attributes: ['id', 'name', 'code', 'address', 'phone'] })
      : null;
    // Use the cashier from the session, not the actor on each row.
    let cashier = { id: req.user.id, name: req.user.name };
    if (order.cashierSessionId) {
      const session = await CashierSession.findByPk(order.cashierSessionId, {
        include: [{ model: User, attributes: ['id', 'name'] }],
      });
      if (session?.User) cashier = { id: session.User.id, name: session.User.name };
    }
    res.json({
      order: order.toJSON(),
      change: 0,                                  // reprint — no fresh change
      amountTendered: order.totalAmount,
      location,
      cashier,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Void a sale (manager-gated) ─────────────────────────────────
// Runs through the SalesReturn pipeline at full original amount,
// returns all items to stock at this location, refunds via the
// original payment method, and writes the ledger entry. The cashier
// just supplies a manager PIN.
//
// The order must not already be fully refunded.
router.post('/sales/:id/void', protectCashier, async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const order = await Order.findByPk(req.params.id, { transaction: t });
    if (!order) { await t.rollback(); return res.status(404).json({ message: 'Sale not found' }); }
    if (order.cashierSessionId !== req.cashierSessionId && req.user.role !== 'admin') {
      // Cashiers can only void within their own session; admin can void any.
      // Tighter than the SalesReturn route, which lets any cashier return
      // any order at their location.
      await t.rollback();
      return res.status(403).json({ message: 'Can only void sales from your current shift' });
    }
    const alreadyRefunded = parseFloat(order.refundAmount || 0);
    const remaining = +(parseFloat(order.totalAmount) - alreadyRefunded).toFixed(3);
    if (remaining <= 0) {
      await t.rollback();
      return res.status(400).json({ message: 'Sale already fully refunded' });
    }

    // Void always requires a manager.
    const { managerOverride } = req.body || {};
    if (!managerOverride?.userId || !managerOverride?.pin) {
      await t.rollback();
      return res.status(403).json({
        message: 'Voiding a sale needs a manager override',
        requires: 'manager_override',
        reason: `void_${order.orderNumber}`,
      });
    }
    let managerUser;
    try {
      managerUser = await verifyManagerPin({
        userId: managerOverride.userId, pin: managerOverride.pin, transaction: t,
      });
    } catch (err) {
      await t.rollback();
      return res.status(403).json({ message: err.message, requires: 'manager_override' });
    }

    // Build items list for the SalesReturn — net of any prior partial returns.
    const priorReturns = await SalesReturn.findAll({
      where: { orderId: order.id, status: 'completed' },
      attributes: ['items'], transaction: t,
    });
    const returnedSoFar = new Map();
    for (const r of priorReturns) {
      for (const it of (r.items || [])) {
        const k = `${it.productId}:${it.variantIndex ?? 'b'}`;
        returnedSoFar.set(k, (returnedSoFar.get(k) || 0) + (parseInt(it.quantity, 10) || 0));
      }
    }
    const voidItems = [];
    let refundTotal = 0;
    const productIds = new Set();
    // Value each line net of its own line discount plus its share of the
    // order-level (manual + coupon) discount — the same valuer the sales
    // return route uses, so a void and a full return pay out identically.
    const refundValue = refundValuer(order);
    for (const it of (order.items || [])) {
      const vIdx = it.variantIndex ?? null;
      const k = `${it.productId}:${vIdx ?? 'b'}`;
      const remainingQty = (parseInt(it.quantity, 10) || 0) - (returnedSoFar.get(k) || 0);
      if (remainingQty <= 0) continue;
      const lineRefund = refundValue(it, remainingQty);
      refundTotal += lineRefund;
      voidItems.push({
        productId: it.productId,
        variantIndex: vIdx,
        name: it.name,
        nameAr: it.nameAr || null,
        sku: it.sku || it.variant?.sku || null,
        price: +(lineRefund / remainingQty).toFixed(3),   // net unit price, so qty × price adds up
        listPrice: parseFloat(it.price) || 0,
        costPrice: parseFloat(it.costPrice) || 0,   // COGS snapshot, so the P&L can credit it back
        quantity: remainingQty,
        refundAmount: lineRefund,
        returnToStock: true,
      });
      productIds.add(it.productId);
    }
    refundTotal = +Math.min(refundTotal, remaining).toFixed(3);
    if (refundTotal <= 0) {
      await t.rollback();
      return res.status(400).json({ message: 'Nothing to void' });
    }

    // Refund via the same rail the customer paid through.
    const refundMethod = order.paymentMethod === 'pos_cash' ? 'cash'
      : order.paymentMethod === 'pos_card' ? 'card'
      : order.paymentMethod === 'pos_knet' ? 'knet'
      : 'cash';

    // Decrement stock back to this location.
    for (const v of voidItems) {
      const stock = await ProductStock.findOne({
        where: { productId: v.productId, variantIndex: v.variantIndex, locationId: req.cashierLocationId },
        transaction: t,
      });
      if (stock) {
        await stock.update({ quantity: stock.quantity + v.quantity }, { transaction: t });
      } else {
        await ProductStock.create({
          productId: v.productId, variantIndex: v.variantIndex,
          locationId: req.cashierLocationId, quantity: v.quantity,
        }, { transaction: t });
      }
    }

    const sr = await SalesReturn.create({
      returnNumber: `VOID-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
      orderId: order.id,
      locationId: req.cashierLocationId,
      cashierSessionId: req.cashierSessionId,
      items: voidItems,
      refundAmount: refundTotal,
      refundMethod,
      reason: managerOverride.reason || 'Sale voided',
      notes: req.body.notes?.trim() || null,
      processedBy: req.user.id,
      status: 'completed',
    }, { transaction: t });

    // Bump Order.refundAmount + write ledger entry if drawer/card account.
    await order.update({
      refundAmount: +(alreadyRefunded + refundTotal).toFixed(3),
    }, { transaction: t });

    const acctType = refundMethod === 'cash' ? 'drawer'
      : refundMethod === 'knet' ? 'knet_terminal'
      : 'card_terminal';
    const acct = await CashAccount.findOne({
      where: { locationId: req.cashierLocationId, type: acctType, active: true },
      transaction: t,
    });
    if (acct) {
      await writeCashTxn({
        cashAccountId: acct.id,
        amount: -refundTotal,
        source: 'return',
        sourceType: 'SalesReturn',
        sourceId: sr.id,
        reference: sr.returnNumber,
        description: `Void of ${order.orderNumber}`,
        date: new Date(),
        createdBy: req.user.id,
        transaction: t,
      });
    }

    await logActivity({
      userId: req.user.id,
      action: 'pos_sale_void',
      entityType: 'Order',
      entityId: order.id,
      details: {
        orderNumber: order.orderNumber,
        refundAmount: refundTotal,
        refundMethod,
        itemsVoided: voidItems.reduce((s, v) => s + v.quantity, 0),
        salesReturnId: sr.id,
      },
      managerOverrideBy: managerUser.id,
      reason: managerOverride.reason || `Void ${order.orderNumber}`,
      locationId: req.cashierLocationId,
      cashierSessionId: req.cashierSessionId,
      ip: req.ip,
      transaction: t,
    });

    await t.commit();
    for (const pid of productIds) await recomputeProductStock(pid);
    res.status(201).json({ salesReturn: sr.toJSON(), order: { id: order.id, orderNumber: order.orderNumber } });
  } catch (err) {
    if (!t.finished) await t.rollback().catch(() => {});
    console.error('[pos/sales/void]', err);
    res.status(400).json({ message: err.message });
  }
});

// ─── Append items to an existing paid sale ────────────────────────
// Used for the "add to bill" path when a customer is still at the
// counter and the cashier forgot an item. Always manager-gated.
//
// Body:
//   items: [{ productId, variantIndex, quantity }]
//   payment: { method, amountTendered? }  OR  { tenders: [...] }
//   managerOverride: { userId, pin, reason }
router.post('/sales/:id/append', protectCashier, async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const order = await Order.findByPk(req.params.id, { transaction: t });
    if (!order) { await t.rollback(); return res.status(404).json({ message: 'Sale not found' }); }
    if (order.cashierSessionId !== req.cashierSessionId && req.user.role !== 'admin') {
      await t.rollback();
      return res.status(403).json({ message: 'Can only edit sales from your current shift' });
    }
    if (order.orderStatus === 'cancelled') {
      await t.rollback();
      return res.status(400).json({ message: 'Cannot edit a cancelled sale' });
    }

    const { items, payment, managerOverride } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      await t.rollback();
      return res.status(400).json({ message: 'items[] required' });
    }
    if (!managerOverride?.userId || !managerOverride?.pin) {
      await t.rollback();
      return res.status(403).json({
        message: 'Editing a paid bill needs a manager override',
        requires: 'manager_override',
        reason: `append_${order.orderNumber}`,
      });
    }
    let managerUser;
    try {
      managerUser = await verifyManagerPin({
        userId: managerOverride.userId, pin: managerOverride.pin, transaction: t,
      });
    } catch (err) {
      await t.rollback();
      return res.status(403).json({ message: err.message, requires: 'manager_override' });
    }

    // Resolve product details + stock at this location.
    const productIds = [...new Set(items.map((i) => parseInt(i.productId, 10)).filter(Boolean))];
    const products = await Product.findAll({ where: { id: { [Op.in]: productIds } }, transaction: t });
    const productMap = new Map(products.map((p) => [p.id, p]));

    const newLines = [];
    const stockDecrements = [];
    let delta = 0;
    for (const it of items) {
      const productId = parseInt(it.productId, 10);
      const product = productMap.get(productId);
      if (!product) throw new Error(`Product ${productId} not found`);
      const vIdx = it.variantIndex == null || it.variantIndex === '' ? null : parseInt(it.variantIndex, 10);
      const variant = vIdx != null && Array.isArray(product.variants) ? product.variants[vIdx] : null;
      const qty = parseInt(it.quantity, 10);
      if (!qty || qty < 1) throw new Error(`Invalid quantity for ${product.name}`);

      const stock = await ProductStock.findOne({
        where: { productId, variantIndex: vIdx, locationId: req.cashierLocationId },
        transaction: t,
      });
      const have = stock?.quantity || 0;
      if (have < qty) throw new Error(`Not enough stock for ${product.name} — have ${have}, need ${qty}`);
      stockDecrements.push({ stockRow: stock, qty });

      const unitPrice = parseFloat(variant?.price ?? product.price) || 0;
      const unitCost = parseFloat(variant?.costPrice ?? product.costPrice ?? 0) || 0;
      delta += unitPrice * qty;
      const appendSuffix = variant ? ` (${Object.values(variant.options || {}).join('/')})` : '';
      newLines.push({
        productId,
        name: product.name + appendSuffix,
        nameAr: product.nameAr ? product.nameAr + appendSuffix : null,
        sku: variant?.sku || product.code || null,
        category: product.category,
        variantIndex: vIdx,
        price: unitPrice,
        costPrice: unitCost,
        quantity: qty,
        image: product.images?.[0] || null,
        variant: variant ? { ...variant.options, sku: variant.sku } : null,
        taxable: product.taxable || false,
        taxRate: product.taxable ? parseFloat(product.taxRate || 0) : 0,
        hsnCode: product.hsnCode || null,
        appendedAt: new Date().toISOString(),
      });
    }
    delta = +delta.toFixed(3);

    // Resolve new tender(s) — same shape as /sale's payment.
    let newTenders = [];
    if (Array.isArray(payment?.tenders) && payment.tenders.length > 0) {
      newTenders = payment.tenders.map((tn) => ({ method: tn.method, amount: parseFloat(tn.amount) }));
      const sum = +newTenders.reduce((s, tn) => s + (tn.amount || 0), 0).toFixed(3);
      if (sum !== delta) throw new Error(`Tenders sum to ${sum} but added line total is ${delta}`);
    } else if (payment?.method && ['cash', 'card'].includes(payment.method)) {
      const tendered = payment.amountTendered != null ? parseFloat(payment.amountTendered) : delta;
      if (payment.method === 'cash' && tendered < delta) throw new Error('Cash tendered less than line total');
      if (payment.method === 'card' && tendered > delta) throw new Error('Card cannot exceed line total');
      newTenders = [{ method: payment.method, amount: delta }];
    } else {
      throw new Error('payment.method or payment.tenders required');
    }

    // Decrement stock.
    for (const { stockRow, qty } of stockDecrements) {
      await stockRow.update({ quantity: stockRow.quantity - qty }, { transaction: t });
    }

    // Update Order — append items, bump total, merge tenders.
    const updatedItems = [...(order.items || []), ...newLines];
    const newTotal = +((parseFloat(order.totalAmount) || 0) + delta).toFixed(3);
    const priorBreakdown = Array.isArray(order.paymentBreakdown) ? order.paymentBreakdown : null;
    let mergedBreakdown;
    if (priorBreakdown) {
      mergedBreakdown = [...priorBreakdown, ...newTenders];
    } else {
      // Convert legacy single-tender to breakdown so we can stack on it.
      const priorMethod = order.paymentMethod === 'pos_cash' ? 'cash'
        : order.paymentMethod === 'pos_card' ? 'card' : null;
      if (priorMethod) {
        mergedBreakdown = [
          { method: priorMethod, amount: parseFloat(order.totalAmount) },
          ...newTenders,
        ];
      } else {
        mergedBreakdown = newTenders;
      }
    }
    const newPaymentMethod = mergedBreakdown.length > 1 ? 'pos_split'
      : `pos_${mergedBreakdown[0].method}`;

    await order.update({
      items: updatedItems,
      totalAmount: newTotal,
      paymentBreakdown: mergedBreakdown.length > 1 ? mergedBreakdown : null,
      paymentMethod: newPaymentMethod,
    }, { transaction: t });

    // Write CashTransaction(s) for the new tender(s).
    for (const tn of newTenders) {
      if (!tn.amount || tn.amount <= 0) continue;
      // Same mapping as the sale path — without the KNET branch, KNET
      // appends were landing on the card terminal and neither reconciled.
      const acctType = tn.method === 'cash' ? 'drawer'
        : tn.method === 'knet' ? 'knet_terminal'
        : 'card_terminal';
      const acct = await CashAccount.findOne({
        where: { locationId: req.cashierLocationId, type: acctType, active: true },
        transaction: t,
      });
      if (!acct) {
        console.warn(`[pos] no ${acctType} account at location ${req.cashierLocationId} — ` +
          `${tn.method} ${tn.amount} on ${order.orderNumber} is NOT in the cash ledger`);
        continue;
      }
      await writeCashTxn({
        cashAccountId: acct.id,
        amount: tn.amount,
        source: 'sale',
        sourceType: 'Order',
        sourceId: order.id,
        reference: order.orderNumber,
        description: `Bill edit: appended ${tn.method}`,
        date: new Date(),
        createdBy: req.user.id,
        transaction: t,
      });
    }

    await logActivity({
      userId: req.user.id,
      action: 'pos_sale_append',
      entityType: 'Order',
      entityId: order.id,
      details: {
        orderNumber: order.orderNumber,
        delta,
        addedLineCount: newLines.length,
        addedQty: newLines.reduce((s, l) => s + l.quantity, 0),
        newTotal,
        newPaymentMethod,
      },
      managerOverrideBy: managerUser.id,
      reason: managerOverride.reason || `Added ${newLines.length} line(s) to ${order.orderNumber}`,
      locationId: req.cashierLocationId,
      cashierSessionId: req.cashierSessionId,
      ip: req.ip,
      transaction: t,
    });

    await t.commit();
    for (const pid of productIds) await recomputeProductStock(pid);
    res.status(201).json({ order: await Order.findByPk(order.id) });
  } catch (err) {
    if (!t.finished) await t.rollback().catch(() => {});
    console.error('[pos/sales/append]', err);
    res.status(400).json({ message: err.message });
  }
});

// ─── Coupon validation ────────────────────────────────────────────
// Re-validates a code against current cart state. Returns the
// computed discount but does NOT increment usedCount — that happens
// when the sale commits.
async function validateCoupon({ code, subtotal, items, userId, transaction = null }) {
  if (!code) return { coupon: null, discount: 0 };
  const coupon = await Coupon.findOne({
    where: { code: code.toUpperCase().trim(), active: true },
    transaction,
  });
  if (!coupon) throw new Error('Invalid coupon code');
  const now = new Date();
  if (coupon.startDate && now < new Date(coupon.startDate)) throw new Error('Coupon not active yet');
  if (coupon.endDate && now > new Date(coupon.endDate)) throw new Error('Coupon has expired');
  if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) throw new Error('Coupon usage limit reached');
  if (subtotal < parseFloat(coupon.minOrderAmount || 0)) {
    throw new Error(`Minimum order ${parseFloat(coupon.minOrderAmount).toFixed(3)} required`);
  }
  if (userId && coupon.perUserLimit) {
    const used = await Order.count({ where: { userId, couponCode: coupon.code }, transaction });
    if (used >= coupon.perUserLimit) throw new Error('Customer has already used this coupon');
  }
  if (coupon.applicableCategories?.length && items?.length) {
    const cats = [...new Set(items.map((i) => i.category).filter(Boolean))];
    if (!cats.some((c) => coupon.applicableCategories.includes(c))) {
      throw new Error(`Coupon valid only for: ${coupon.applicableCategories.join(', ')}`);
    }
  }
  if (coupon.applicableProducts?.length && items?.length) {
    const pids = items.map((i) => i.productId);
    if (!pids.some((id) => coupon.applicableProducts.includes(id))) {
      throw new Error('Coupon not valid for the items in this cart');
    }
  }
  let discount = 0;
  if (coupon.type === 'percentage') {
    discount = (subtotal * parseFloat(coupon.value)) / 100;
    if (coupon.maxDiscount) discount = Math.min(discount, parseFloat(coupon.maxDiscount));
  } else {
    discount = parseFloat(coupon.value);
  }
  discount = Math.min(discount, subtotal);
  discount = +discount.toFixed(3);
  return { coupon, discount };
}

router.post('/preview-coupon', protectCashier, async (req, res) => {
  try {
    const { code, items = [], userId } = req.body || {};
    if (!code) return res.status(400).json({ message: 'Coupon code required' });
    const subtotal = items.reduce((s, l) => s + (parseFloat(l.price) || 0) * (parseInt(l.quantity, 10) || 0), 0);
    const { coupon, discount } = await validateCoupon({ code, subtotal, items, userId });
    res.json({
      code: coupon.code,
      type: coupon.type,
      value: parseFloat(coupon.value),
      description: coupon.description,
      discount,
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// ─── Customer picker (POS) ─────────────────────────────────────────
// Search by phone (digit substring) or name. Cashier types into the
// picker and gets up to 8 matches.
router.get('/customers', protectCashier, async (req, res) => {
  try {
    const q = (req.query.q || '').toString().trim();
    if (!q) return res.json([]);
    const digits = q.replace(/\D/g, '');
    const where = { role: 'customer' };
    const ors = [{ name: { [Op.like]: `%${q}%` } }];
    if (digits.length >= 3) ors.push({ phone: { [Op.like]: `%${digits}%` } });
    ors.push({ email: { [Op.like]: `%${q}%` } });
    where[Op.or] = ors;
    const rows = await User.findAll({
      where,
      attributes: ['id', 'name', 'email', 'phone'],
      limit: 8,
      order: [['name', 'ASC']],
    });
    res.json(rows);
  } catch (err) {
    console.error('[pos/customers]', err);
    res.status(500).json({ message: err.message });
  }
});

// Create a phone-only POS customer.
router.post('/customers', protectCashier, async (req, res) => {
  try {
    const name = (req.body.name || '').trim();
    const phone = (req.body.phone || '').trim();
    const email = (req.body.email || '').trim().toLowerCase() || null;
    if (!name) return res.status(400).json({ message: 'Name required' });
    if (!phone && !email) return res.status(400).json({ message: 'Phone or email required' });

    // If a customer with this phone already exists, return them rather
    // than creating a duplicate.
    if (phone) {
      const existing = await User.findOne({ where: { role: 'customer', phone } });
      if (existing) return res.json({ ...existing.toJSON(), _existing: true });
    }
    if (email) {
      const existing = await User.findOne({ where: { email } });
      if (existing) {
        if (existing.role !== 'customer') return res.status(400).json({ message: 'Email is registered to a staff account' });
        return res.json({ ...existing.toJSON(), _existing: true });
      }
    }

    const user = await User.create({
      name, phone: phone || null, email,
      role: 'customer',
    });
    res.status(201).json(user.toJSON());
  } catch (err) {
    console.error('[pos/customers/create]', err);
    res.status(400).json({ message: err.message });
  }
});

// ─── Create a sale ─────────────────────────────────────────────────
router.post('/sale', protectCashier, async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const {
      items, customer, payment, userId, couponCode, manualDiscount, managerOverride,
      deliveryCharge: deliveryChargeRaw,
    } = req.body || {};
    // Optional delivery charge. Adds to the total as its own income line;
    // deliberately NOT taxed, and the receipt hides the line when zero.
    const deliveryCharge = Math.max(0, parseFloat(deliveryChargeRaw) || 0);
    if (!Array.isArray(items) || items.length === 0) {
      await t.rollback();
      return res.status(400).json({ message: 'No items in sale' });
    }
    // Accept either single-tender { method, amountTendered? } (back-compat)
    // or split { tenders: [{ method, amount }] }. Normalise to a tenders
    // array. Validation of sum vs total happens after discount/total calc.
    let tenders = [];
    if (Array.isArray(payment?.tenders) && payment.tenders.length > 0) {
      tenders = payment.tenders.map((t) => ({
        method: t.method,
        amount: parseFloat(t.amount),
      }));
    } else if (payment?.method && ['cash', 'card', 'knet'].includes(payment.method)) {
      tenders = [{ method: payment.method, amount: null }];   // amount filled after total
    } else {
      await t.rollback();
      return res.status(400).json({ message: 'payment.method or payment.tenders required' });
    }
    if (tenders.some((t) => !['cash', 'card', 'knet'].includes(t.method))) {
      await t.rollback();
      return res.status(400).json({ message: 'Each tender must be cash, card or knet' });
    }

    // Validate shift is still open.
    const session = await CashierSession.findByPk(req.cashierSessionId, { transaction: t });
    if (!session || session.status !== 'open') {
      await t.rollback();
      return res.status(403).json({ message: 'Shift is not open' });
    }

    // Resolve each cart line against the product + per-location stock.
    const productIds = [...new Set(items.map((i) => parseInt(i.productId, 10)).filter(Boolean))];
    const products = await Product.findAll({
      where: { id: { [Op.in]: productIds } },
      transaction: t,
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    const orderItems = [];
    const stockDecrements = [];   // [{stockRow, qty}]
    let subTotal = 0;
    let lineOffTotal = 0;         // sum of per-line discounts
    let repricedLines = 0;        // audit: how many lines were price-overridden
    let repriceDelta = 0;         // audit: net effect of those overrides

    for (const it of items) {
      const productId = parseInt(it.productId, 10);
      const product = productMap.get(productId);
      if (!product) throw new Error(`Product ${productId} not found`);

      const vIdx = it.variantIndex == null || it.variantIndex === '' ? null : parseInt(it.variantIndex, 10);
      const variant = vIdx != null && Array.isArray(product.variants) ? product.variants[vIdx] : null;
      const qty = parseInt(it.quantity, 10);
      if (!qty || qty < 1) throw new Error(`Invalid quantity for ${product.name}`);

      const stock = await ProductStock.findOne({
        where: { productId, variantIndex: vIdx, locationId: req.cashierLocationId },
        transaction: t,
      });
      const have = stock?.quantity || 0;
      if (have < qty) {
        throw new Error(`Not enough stock for ${product.name} — have ${have}, need ${qty}`);
      }
      stockDecrements.push({ stockRow: stock, qty });

      const listPrice = parseFloat(variant?.price ?? product.price) || 0;
      const unitCost = parseFloat(variant?.costPrice ?? product.costPrice ?? 0) || 0;

      // Per-sale price override — the cashier charges a different price for
      // this sale only; the catalogue price is untouched. Stored as the
      // line's `price` so every downstream reader (receipt, returns,
      // reports) sees what was actually charged, with `listPrice` kept for
      // the audit trail.
      let unitPrice = listPrice;
      if (it.priceOverride != null && it.priceOverride !== '') {
        const po = parseFloat(it.priceOverride);
        if (!Number.isFinite(po) || po < 0) throw new Error(`Invalid price for ${product.name}`);
        unitPrice = +po.toFixed(3);
      }
      const repriced = unitPrice !== listPrice;
      if (repriced) {
        repricedLines += 1;
        repriceDelta += (unitPrice - listPrice) * qty;
      }

      const lineGross = unitPrice * qty;
      subTotal += lineGross;

      // Per-line discount — recomputed here from the server-side price so a
      // tampered client can't inflate it. A fixed amount is per item, so it
      // applies once per unit. Capped at the line's gross.
      let lineOff = 0;
      const ld = it.lineDiscount;
      if (ld && parseFloat(ld.value) > 0) {
        const v = parseFloat(ld.value);
        lineOff = ld.kind === 'percentage' ? (lineGross * v) / 100 : v * qty;
        lineOff = +Math.min(lineOff, lineGross).toFixed(3);
        lineOffTotal += lineOff;
      }
      const variantSuffix = variant ? ` (${Object.values(variant.options || {}).join('/')})` : '';
      orderItems.push({
        productId,
        name: product.name + variantSuffix,
        nameAr: product.nameAr ? product.nameAr + variantSuffix : null,
        sku: variant?.sku || product.code || null,   // snapshot SKU for receipt
        category: product.category,
        // Persist the variant index on the line. Without it the returns
        // matcher falls through to "first line with this productId" and a
        // multi-variant order refunds the wrong line's price.
        variantIndex: vIdx,
        price: unitPrice,
        listPrice,                           // catalogue price at time of sale
        priceOverridden: repriced,
        costPrice: unitCost,                 // snapshot for COGS
        quantity: qty,
        lineDiscount: lineOff > 0 ? { kind: ld.kind, value: parseFloat(ld.value), amount: lineOff } : null,
        image: product.images?.[0] || null,
        variant: variant ? { ...variant.options, sku: variant.sku } : null,
        taxable: product.taxable || false,
        taxRate: product.taxable ? parseFloat(product.taxRate || 0) : 0,
        hsnCode: product.hsnCode || null,
      });
    }

    // Resolve linked customer first so the coupon's per-user limit
    // check can see it.
    let linkedUser = null;
    if (userId) {
      linkedUser = await User.findByPk(parseInt(userId, 10), { transaction: t });
      if (!linkedUser || linkedUser.role !== 'customer') {
        throw new Error('Invalid customer');
      }
    }

    // Apply discounts. Manual discount applies to the cart subtotal,
    // then the coupon applies to (subtotal − manual). Final total is
    // capped at 0 in case both stack heavily.
    // Discount waterfall: per-line discounts first, then the manual bill
    // discount on what's left, then any coupon on top of that.
    lineOffTotal = +lineOffTotal.toFixed(3);
    const afterLines = +Math.max(0, subTotal - lineOffTotal).toFixed(3);
    let manualOff = 0;
    let manualPct = 0;
    if (manualDiscount && parseFloat(manualDiscount.value) > 0) {
      const v = parseFloat(manualDiscount.value);
      manualOff = manualDiscount.kind === 'percentage'
        ? (afterLines * v) / 100
        : v;
      manualOff = Math.min(manualOff, afterLines);
      // Gauge the override threshold against the gross, so stacking a line
      // discount under a bill discount can't slip past the manager gate.
      manualPct = subTotal > 0 ? ((manualOff + lineOffTotal) / subTotal) * 100 : 0;
    }

    // Manager override gate: any manual discount whose effective
    // percentage exceeds the threshold must be approved by a manager.
    let managerUser = null;
    if (manualPct > DISCOUNT_PCT_THRESHOLD) {
      if (!managerOverride?.userId || !managerOverride?.pin) {
        await t.rollback();
        return res.status(403).json({
          message: `Discount above ${DISCOUNT_PCT_THRESHOLD}% needs a manager override`,
          requires: 'manager_override',
          reason: `discount_${manualPct.toFixed(1)}pct`,
        });
      }
      try {
        managerUser = await verifyManagerPin({
          userId: managerOverride.userId, pin: managerOverride.pin, transaction: t,
        });
      } catch (err) {
        await t.rollback();
        return res.status(403).json({ message: err.message, requires: 'manager_override' });
      }
    }
    let couponOff = 0;
    let appliedCoupon = null;
    if (couponCode) {
      const result = await validateCoupon({
        code: couponCode,
        subtotal: +Math.max(0, afterLines - manualOff).toFixed(3),
        items: orderItems,
        userId: linkedUser?.id,
        transaction: t,
      });
      couponOff = result.discount;
      appliedCoupon = result.coupon;
    }
    // order.discount is the FULL discount including per-line ones — the
    // refund valuer subtracts the line discounts back out to work out the
    // order-level slice, so this must not exclude them.
    const totalDiscount = +(lineOffTotal + manualOff + couponOff).toFixed(3);
    // Delivery is charged on top of the discounted goods and is not
    // discountable — a coupon shouldn't erode the courier fee. Folding it
    // into totalAmount here means every tender check below, the ledger
    // posting and the P&L all pick it up without further changes.
    const goodsTotal = +(Math.max(0, subTotal - totalDiscount)).toFixed(3);
    const totalAmount = +(goodsTotal + deliveryCharge).toFixed(3);

    const orderNumber = await nextInvoiceNumber(t);

    // Resolve tenders. Single-tender back-compat: amount comes from the
    // legacy `amountTendered` field (any overage is the cash change).
    // For splits, each tender carries its retained amount; sum must equal
    // totalAmount exactly (cash overpay is the cashier's responsibility
    // to subtract change before sending).
    let amountTendered = totalAmount;     // for the receipt's "Paid" line
    let change = 0;
    if (tenders.length === 1) {
      const single = tenders[0];
      amountTendered = payment.amountTendered != null
        ? parseFloat(payment.amountTendered)
        : totalAmount;
      change = +(amountTendered - totalAmount).toFixed(3);
      if (single.method === 'cash') {
        if (amountTendered < totalAmount) throw new Error('Amount tendered is less than total');
        single.amount = totalAmount;       // retained, not tendered
      } else {
        // Card and KNET terminals charge exactly the bill amount.
        if (change > 0) throw new Error(`${single.method.toUpperCase()} payment cannot exceed total`);
        single.amount = totalAmount;
      }
    } else {
      const sum = +tenders.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0).toFixed(3);
      if (sum !== totalAmount) {
        throw new Error(`Split tenders sum to ${sum} but total is ${totalAmount}`);
      }
    }
    const isSplit = tenders.length > 1;
    const paymentMethod = isSplit ? 'pos_split' : `pos_${tenders[0].method}`;

    // Decrement stock at this location.
    for (const { stockRow, qty } of stockDecrements) {
      await stockRow.update({ quantity: stockRow.quantity - qty }, { transaction: t });
    }

    const order = await Order.create({
      orderNumber,
      userId: linkedUser?.id || null,
      guestEmail: linkedUser ? null : (customer?.email?.toLowerCase()?.trim() || null),
      items: orderItems,
      totalAmount,
      shippingAddress: {
        fullName: linkedUser?.name || customer?.name || 'Walk-in',
        phone: linkedUser?.phone || customer?.phone || '',
        notes: [
          'In-store sale (POS)',
          manualDiscount?.reason ? `Discount reason: ${manualDiscount.reason}` : null,
        ].filter(Boolean).join(' · '),
      },
      paymentMethod,
      paymentStatus: 'paid',
      orderStatus: 'delivered',
      locationId: req.cashierLocationId,
      cashierSessionId: req.cashierSessionId,
      shippingCharge: deliveryCharge,
      discount: totalDiscount,
      couponCode: appliedCoupon?.code || null,
      taxAmount: 0,   // delivery is zero-rated and goods tax is not charged at POS
      paymentBreakdown: isSplit ? tenders : null,
    }, { transaction: t });

    if (appliedCoupon) {
      await appliedCoupon.increment('usedCount', { transaction: t });
    }

    await logActivity({
      userId: req.user.id,
      action: 'pos_sale',
      entityType: 'Order',
      entityId: order.id,
      details: {
        orderNumber: order.orderNumber,
        total: totalAmount,
        paymentMethod,
        itemCount: orderItems.reduce((s, i) => s + i.quantity, 0),
        discount: totalDiscount,
        lineDiscount: lineOffTotal,
        manualPct: +manualPct.toFixed(2),
        couponCode: appliedCoupon?.code || null,
        customerId: linkedUser?.id || null,
        deliveryCharge: deliveryCharge || undefined,
        // Price overrides are worth auditing on their own — they change
        // what was charged without leaving a discount trail.
        repricedLines: repricedLines || undefined,
        repriceDelta: repricedLines ? +repriceDelta.toFixed(3) : undefined,
      },
      managerOverrideBy: managerUser?.id || null,
      reason: managerUser ? (managerOverride?.reason || `Discount ${manualPct.toFixed(1)}%`) : null,
      locationId: req.cashierLocationId,
      cashierSessionId: req.cashierSessionId,
      ip: req.ip,
      transaction: t,
    });

    // Write one CashTransaction per tender. Cash hits the location's
    // drawer; card hits its card-terminal account. Missing account is
    // non-fatal — POS keeps working, the sale just doesn't hit the
    // ledger for that tender until the account is created.
    const methodToAcct = { cash: 'drawer', card: 'card_terminal', knet: 'knet_terminal' };
    const acctCache = {};   // type -> CashAccount
    for (const tn of tenders) {
      if (!tn.amount || tn.amount <= 0) continue;
      const acctType = methodToAcct[tn.method] || 'card_terminal';
      if (!(acctType in acctCache)) {
        acctCache[acctType] = await CashAccount.findOne({
          where: { locationId: req.cashierLocationId, type: acctType, active: true },
          transaction: t,
        });
      }
      const acct = acctCache[acctType];
      if (!acct) continue;
      await writeCashTxn({
        cashAccountId: acct.id,
        amount: tn.amount,
        source: 'sale',
        sourceType: 'Order',
        sourceId: order.id,
        reference: order.orderNumber,
        description: `POS sale (${tn.method})${isSplit ? ' [split]' : ''}`,
        date: order.createdAt,
        createdBy: req.user.id,
        transaction: t,
      });
    }

    await t.commit();

    // Recompute Product.stock for each affected product (outside the txn).
    for (const pid of productIds) await recomputeProductStock(pid);

    const location = await Location.findByPk(req.cashierLocationId, {
      attributes: ['id', 'name', 'code', 'address', 'phone'],
    });

    res.status(201).json({
      order: order.toJSON(),
      change,
      amountTendered,
      location,
      cashier: { id: req.user.id, name: req.user.name },
    });
  } catch (err) {
    if (!t.finished) await t.rollback().catch(() => {});
    console.error('[pos/sale]', err);
    res.status(400).json({ message: err.message });
  }
});

// ─── Running totals for the current shift ──────────────────────────
router.get('/shift-summary', protectCashier, async (req, res) => {
  try {
    const session = await CashierSession.findByPk(req.cashierSessionId);
    if (!session) return res.status(404).json({ message: 'Shift not found' });

    const orders = await Order.findAll({
      where: { cashierSessionId: session.id },
      attributes: ['id', 'orderNumber', 'totalAmount', 'paymentMethod', 'paymentBreakdown', 'createdAt'],
      order: [['createdAt', 'DESC']],
    });

    const summary = orders.reduce((s, o) => {
      const amt = parseFloat(o.totalAmount || 0);
      s.totalSales += amt;
      s.orderCount += 1;
      // Split-payment sales carry per-tender amounts; without this branch a
      // pos_split order counts into totalSales but into no tender line, and
      // the drawer never reconciles.
      if (Array.isArray(o.paymentBreakdown) && o.paymentBreakdown.length > 0) {
        for (const tn of o.paymentBreakdown) {
          const tAmt = parseFloat(tn.amount || 0);
          if (tn.method === 'cash') s.cashSales += tAmt;
          else if (tn.method === 'card') s.cardSales += tAmt;
          else if (tn.method === 'knet') s.knetSales += tAmt;
        }
      } else if (o.paymentMethod === 'pos_cash') s.cashSales += amt;
      else if (o.paymentMethod === 'pos_card') s.cardSales += amt;
      else if (o.paymentMethod === 'pos_knet') s.knetSales += amt;
      return s;
    }, { totalSales: 0, cashSales: 0, cardSales: 0, knetSales: 0, orderCount: 0 });

    summary.openingCash = parseFloat(session.openingCash) || 0;
    summary.expectedCash = summary.openingCash + summary.cashSales;
    res.json({ session, summary, recentOrders: orders.slice(0, 20) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
