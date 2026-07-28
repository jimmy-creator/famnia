/**
 * Stock counts (physical inventory / cycle counts).
 *
 *   GET    /api/stock-counts                    list, filterable by location + status
 *   POST   /api/stock-counts                    create a draft for a location
 *   GET    /api/stock-counts/:id                detail with lines
 *   POST   /api/stock-counts/:id/lines          add a line (snapshots expectedQty)
 *   PUT    /api/stock-counts/:id/lines/:lineId  update countedQty / reason
 *   DELETE /api/stock-counts/:id/lines/:lineId  remove a line (only if not posted)
 *   POST   /api/stock-counts/:id/post           apply variance, manager-gated
 *   POST   /api/stock-counts/:id/cancel         cancel without posting
 *   GET    /api/stock-counts/lookup?q=…&locationId=…
 *                                               product/variant search with current stock
 *
 *   GET    /api/stock-counts/report/variance?locationId=&from=&to=
 *                                               aggregate variance value & top items
 */
import { Router } from 'express';
import { Op } from 'sequelize';
import sequelize from '../config/database.js';
import {
  StockCount, StockCountLine, Product, ProductStock, Location,
  User, Expense,
  recomputeProductStock, writeCashTxn, logActivity, verifyManagerPin,
} from '../models/index.js';
import { protect, admin } from '../middleware/auth.js';

const router = Router();

const gen = (prefix) =>
  `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

// ─── List ──────────────────────────────────────────────────────────
router.get('/', protect, admin, async (req, res) => {
  try {
    const where = {};
    if (req.query.locationId) where.locationId = parseInt(req.query.locationId, 10);
    if (req.query.status) where.status = req.query.status;
    const rows = await StockCount.findAll({
      where,
      include: [
        { model: Location, attributes: ['id', 'name', 'code'] },
        { model: User, as: 'creator', attributes: ['id', 'name'] },
        { model: User, as: 'poster', attributes: ['id', 'name'] },
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(req.query.limit, 10) || 100,
    });
    res.json(rows);
  } catch (err) {
    console.error('[stock-counts/list]', err);
    res.status(500).json({ message: err.message });
  }
});

// ─── Lookup product/variant by SKU or name for a location ─────────
// Returns the matching candidates with current ProductStock for the
// given location so the UI can prefill expectedQty.
router.get('/lookup', protect, admin, async (req, res) => {
  try {
    const q = (req.query.q || '').toString().trim();
    const locationId = parseInt(req.query.locationId, 10);
    if (!q || !locationId) return res.json([]);

    // 1. Exact product code
    const exact = await Product.findAll({ where: { active: true, code: q }, limit: 5 });

    // 2. Variant SKU
    let variantHits = [];
    if (exact.length === 0) {
      const candidates = await Product.findAll({
        where: { active: true, variants: { [Op.ne]: null } },
        attributes: ['id', 'name', 'code', 'price', 'costPrice', 'images', 'variants'],
        limit: 500,
      });
      for (const p of candidates) {
        if (!Array.isArray(p.variants)) continue;
        const idx = p.variants.findIndex((v) => v.sku === q);
        if (idx >= 0) variantHits.push({ product: p, variantIndex: idx });
      }
    }

    // 3. Name search
    const nameHits = (exact.length === 0 && variantHits.length === 0)
      ? await Product.findAll({
          where: {
            active: true,
            [Op.or]: [
              { name: { [Op.like]: `%${q}%` } },
              { code: { [Op.like]: `${q}%` } },
            ],
          },
          attributes: ['id', 'name', 'code', 'price', 'costPrice', 'images', 'variants'],
          limit: 15,
        })
      : [];

    const candidates = [
      ...exact.map((p) => ({ product: p, variantIndex: null })),
      ...variantHits,
      ...nameHits.map((p) => ({ product: p, variantIndex: null })),
    ];
    if (candidates.length === 0) return res.json([]);

    const productIds = [...new Set(candidates.map((c) => c.product.id))];
    const stocks = await ProductStock.findAll({
      where: { productId: { [Op.in]: productIds }, locationId },
    });
    const stockKey = (pid, vIdx) => `${pid}:${vIdx ?? 'b'}`;
    const stockMap = new Map(stocks.map((s) => [stockKey(s.productId, s.variantIndex), s.quantity]));

    const results = candidates.map(({ product, variantIndex }) => {
      const obj = product.toJSON();
      const v = variantIndex != null && Array.isArray(obj.variants) ? obj.variants[variantIndex] : null;
      const hasVariants = Array.isArray(obj.variants) && obj.variants.length > 0 && variantIndex == null;
      const variantsWithStock = hasVariants
        ? obj.variants.map((vr, idx) => ({
            ...vr,
            stockAtLocation: stockMap.get(stockKey(obj.id, idx)) || 0,
          }))
        : undefined;
      return {
        productId: obj.id,
        name: obj.name + (v ? ` (${Object.values(v.options || {}).join('/')})` : ''),
        sku: v?.sku || obj.code || null,
        costPrice: parseFloat(v?.costPrice ?? obj.costPrice ?? 0) || 0,
        variantIndex,
        image: obj.images?.[0] || null,
        stockAtLocation: stockMap.get(stockKey(obj.id, variantIndex)) || 0,
        hasVariants,
        variants: variantsWithStock,
      };
    });

    res.json(results);
  } catch (err) {
    console.error('[stock-counts/lookup]', err);
    res.status(500).json({ message: err.message });
  }
});

// ─── Detail ────────────────────────────────────────────────────────
router.get('/:id', protect, admin, async (req, res) => {
  try {
    const sc = await StockCount.findByPk(req.params.id, {
      include: [
        { model: Location, attributes: ['id', 'name', 'code'] },
        { model: User, as: 'creator', attributes: ['id', 'name'] },
        { model: User, as: 'poster', attributes: ['id', 'name'] },
        { model: User, as: 'approver', attributes: ['id', 'name'] },
        { model: StockCountLine, as: 'lines',
          include: [{ model: Product, attributes: ['id', 'name', 'code', 'images', 'category'] }],
        },
      ],
      order: [[{ model: StockCountLine, as: 'lines' }, 'id', 'ASC']],
    });
    if (!sc) return res.status(404).json({ message: 'Not found' });
    res.json(sc);
  } catch (err) {
    console.error('[stock-counts/detail]', err);
    res.status(500).json({ message: err.message });
  }
});

// ─── Create draft ─────────────────────────────────────────────────
router.post('/', protect, admin, async (req, res) => {
  try {
    const { locationId, scope, notes } = req.body;
    if (!locationId) return res.status(400).json({ message: 'locationId required' });
    const loc = await Location.findByPk(locationId);
    if (!loc) return res.status(400).json({ message: 'Location not found' });

    const sc = await StockCount.create({
      countNumber: gen('SC'),
      locationId: parseInt(locationId, 10),
      scope: scope === 'full' ? 'full' : 'partial',
      notes: notes?.trim() || null,
      status: 'draft',
      createdBy: req.user.id,
    });
    res.status(201).json(sc);
  } catch (err) {
    console.error('[stock-counts/create]', err);
    res.status(400).json({ message: err.message });
  }
});

// ─── Add line ─────────────────────────────────────────────────────
router.post('/:id/lines', protect, admin, async (req, res) => {
  try {
    const sc = await StockCount.findByPk(req.params.id);
    if (!sc) return res.status(404).json({ message: 'Not found' });
    if (sc.status === 'posted' || sc.status === 'cancelled') {
      return res.status(400).json({ message: 'Count is locked' });
    }
    const { productId, variantIndex, countedQty, reason } = req.body;
    if (!productId) return res.status(400).json({ message: 'productId required' });

    const product = await Product.findByPk(parseInt(productId, 10));
    if (!product) return res.status(400).json({ message: 'Product not found' });

    const vIdx = variantIndex == null || variantIndex === '' ? null : parseInt(variantIndex, 10);
    const variant = vIdx != null && Array.isArray(product.variants) ? product.variants[vIdx] : null;

    // Don't allow duplicate lines for the same (productId, variantIndex).
    const existing = await StockCountLine.findOne({
      where: { stockCountId: sc.id, productId: product.id, variantIndex: vIdx },
    });
    if (existing) {
      return res.status(409).json({ message: 'Item already on this count', lineId: existing.id });
    }

    const stock = await ProductStock.findOne({
      where: { productId: product.id, variantIndex: vIdx, locationId: sc.locationId },
    });
    const expectedQty = stock ? stock.quantity : 0;
    const cqty = countedQty == null || countedQty === '' ? null : parseInt(countedQty, 10);

    const line = await StockCountLine.create({
      stockCountId: sc.id,
      productId: product.id,
      variantIndex: vIdx,
      sku: variant?.sku || product.code || null,
      name: product.name + (variant ? ` (${Object.values(variant.options || {}).join('/')})` : ''),
      expectedQty,
      countedQty: cqty,
      variance: cqty != null ? cqty - expectedQty : null,
      reason: reason?.trim() || null,
    });

    if (sc.status === 'draft' && cqty != null) {
      await sc.update({ status: 'in_progress' });
    }
    res.status(201).json(line);
  } catch (err) {
    console.error('[stock-counts/add-line]', err);
    res.status(400).json({ message: err.message });
  }
});

// ─── Update a line (counted qty / reason) ─────────────────────────
router.put('/:id/lines/:lineId', protect, admin, async (req, res) => {
  try {
    const sc = await StockCount.findByPk(req.params.id);
    if (!sc) return res.status(404).json({ message: 'Not found' });
    if (sc.status === 'posted' || sc.status === 'cancelled') {
      return res.status(400).json({ message: 'Count is locked' });
    }
    const line = await StockCountLine.findOne({
      where: { id: req.params.lineId, stockCountId: sc.id },
    });
    if (!line) return res.status(404).json({ message: 'Line not found' });

    const updates = {};
    if (req.body.countedQty !== undefined) {
      const c = req.body.countedQty == null || req.body.countedQty === ''
        ? null : parseInt(req.body.countedQty, 10);
      updates.countedQty = c;
      updates.variance = c != null ? c - line.expectedQty : null;
    }
    if (req.body.reason !== undefined) updates.reason = req.body.reason?.trim() || null;

    await line.update(updates);
    if (sc.status === 'draft' && updates.countedQty != null) {
      await sc.update({ status: 'in_progress' });
    }
    res.json(line);
  } catch (err) {
    console.error('[stock-counts/update-line]', err);
    res.status(400).json({ message: err.message });
  }
});

// ─── Delete line ──────────────────────────────────────────────────
router.delete('/:id/lines/:lineId', protect, admin, async (req, res) => {
  try {
    const sc = await StockCount.findByPk(req.params.id);
    if (!sc) return res.status(404).json({ message: 'Not found' });
    if (sc.status === 'posted' || sc.status === 'cancelled') {
      return res.status(400).json({ message: 'Count is locked' });
    }
    const line = await StockCountLine.findOne({
      where: { id: req.params.lineId, stockCountId: sc.id },
    });
    if (!line) return res.status(404).json({ message: 'Line not found' });
    await line.destroy();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Post — apply variance to inventory + write shrinkage Expense ──
router.post('/:id/post', protect, admin, async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const sc = await StockCount.findByPk(req.params.id, { transaction: t });
    if (!sc) { await t.rollback(); return res.status(404).json({ message: 'Not found' }); }
    if (sc.status === 'posted') { await t.rollback(); return res.status(400).json({ message: 'Already posted' }); }
    if (sc.status === 'cancelled') { await t.rollback(); return res.status(400).json({ message: 'Cancelled' }); }

    const lines = await StockCountLine.findAll({
      where: { stockCountId: sc.id }, transaction: t,
    });
    const counted = lines.filter((l) => l.countedQty != null);
    if (counted.length === 0) {
      await t.rollback();
      return res.status(400).json({ message: 'No counted lines to post' });
    }

    // Manager PIN: required if any single variance is large or total shrinkage value is large.
    // Threshold: 5 units or 10 KWD per line, or total shrinkage > 50 KWD.
    let needsOverride = false;
    let totalShrinkageValue = 0;
    for (const l of counted) {
      const product = await Product.findByPk(l.productId, { transaction: t });
      const variant = l.variantIndex != null && Array.isArray(product?.variants)
        ? product.variants[l.variantIndex] : null;
      const cost = parseFloat(variant?.costPrice ?? product?.costPrice ?? 0) || 0;
      const variance = l.countedQty - l.expectedQty;
      const value = variance * cost; // negative for shrinkage
      l._cost = cost;
      l._varianceValue = value;
      if (variance < 0) totalShrinkageValue += -value;
      if (Math.abs(variance) >= 5 || Math.abs(value) >= 10) needsOverride = true;
    }
    if (totalShrinkageValue > 50) needsOverride = true;

    // Admin users have inherent authority — only require a manager PIN when
    // a non-admin (e.g. staff with products permission) is posting.
    let approver = null;
    if (needsOverride && req.user.role !== 'admin') {
      const { managerId, managerPin } = req.body;
      if (!managerId || !managerPin) {
        await t.rollback();
        return res.status(403).json({ message: 'Manager PIN required to post variance' });
      }
      try {
        approver = await verifyManagerPin({ userId: managerId, pin: managerPin, transaction: t });
      } catch (err) {
        await t.rollback();
        return res.status(403).json({ message: err.message });
      }
    }

    let totalVarianceQty = 0;
    let totalVarianceValue = 0;
    const touchedProducts = new Set();

    for (const l of counted) {
      const variance = l.countedQty - l.expectedQty;
      totalVarianceQty += variance;
      totalVarianceValue += l._varianceValue;

      const stockRow = await ProductStock.findOne({
        where: { productId: l.productId, variantIndex: l.variantIndex, locationId: sc.locationId },
        transaction: t,
      });
      if (stockRow) {
        await stockRow.update({ quantity: l.countedQty }, { transaction: t });
      } else if (l.countedQty > 0) {
        await ProductStock.create({
          productId: l.productId, variantIndex: l.variantIndex,
          locationId: sc.locationId, quantity: l.countedQty,
        }, { transaction: t });
      }
      await l.update({
        variance,
        costPrice: l._cost,
        varianceValue: l._varianceValue,
      }, { transaction: t });
      touchedProducts.add(l.productId);
    }

    // Optional shrinkage Expense (only if there's a net shrinkage and the
    // user picked an expense category + cash account in the request body).
    let shrinkageExpense = null;
    const shrinkageValue = totalVarianceValue < 0 ? -totalVarianceValue : 0;
    if (shrinkageValue > 0 && req.body.expenseCategoryId && req.body.cashAccountId) {
      shrinkageExpense = await Expense.create({
        expenseNumber: gen('EXP'),
        expenseCategoryId: parseInt(req.body.expenseCategoryId, 10),
        locationId: sc.locationId,
        cashAccountId: parseInt(req.body.cashAccountId, 10),
        amount: +shrinkageValue.toFixed(3),
        paymentMethod: 'other',
        description: `Stock variance ${sc.countNumber}`,
        reference: sc.countNumber,
        expenseDate: new Date().toISOString().slice(0, 10),
        status: 'paid',
        createdBy: req.user.id,
      }, { transaction: t });
      await writeCashTxn({
        cashAccountId: shrinkageExpense.cashAccountId,
        amount: -parseFloat(shrinkageExpense.amount),
        source: 'expense',
        sourceType: 'Expense',
        sourceId: shrinkageExpense.id,
        reference: shrinkageExpense.expenseNumber,
        description: shrinkageExpense.description,
        date: new Date(shrinkageExpense.expenseDate),
        createdBy: req.user.id,
        transaction: t,
      });
    }

    await sc.update({
      status: 'posted',
      postedBy: req.user.id,
      postedAt: new Date(),
      managerOverrideBy: approver?.id || null,
      totalVarianceQty,
      totalVarianceValue: +totalVarianceValue.toFixed(3),
      shrinkageExpenseId: shrinkageExpense?.id || null,
    }, { transaction: t });

    await logActivity({
      userId: req.user.id,
      action: 'stock_count_post',
      entityType: 'StockCount',
      entityId: sc.id,
      details: {
        countNumber: sc.countNumber,
        lines: counted.length,
        totalVarianceQty,
        totalVarianceValue: +totalVarianceValue.toFixed(3),
        shrinkageExpenseId: shrinkageExpense?.id || null,
      },
      managerOverrideBy: approver?.id || null,
      locationId: sc.locationId,
      transaction: t,
    });

    await t.commit();

    // Recompute Product.stock outside the transaction — that helper
    // does its own write and isn't safe inside an uncommitted txn.
    for (const pid of touchedProducts) await recomputeProductStock(pid);

    const fresh = await StockCount.findByPk(sc.id, {
      include: [
        { model: Location, attributes: ['id', 'name', 'code'] },
        { model: StockCountLine, as: 'lines' },
      ],
    });
    res.json(fresh);
  } catch (err) {
    if (!t.finished) await t.rollback().catch(() => {});
    console.error('[stock-counts/post]', err);
    res.status(500).json({ message: err.message });
  }
});

// ─── Cancel ───────────────────────────────────────────────────────
router.post('/:id/cancel', protect, admin, async (req, res) => {
  try {
    const sc = await StockCount.findByPk(req.params.id);
    if (!sc) return res.status(404).json({ message: 'Not found' });
    if (sc.status === 'posted') return res.status(400).json({ message: 'Already posted' });
    await sc.update({ status: 'cancelled' });
    res.json(sc);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Variance report ─────────────────────────────────────────────
router.get('/report/variance', protect, admin, async (req, res) => {
  try {
    const where = { status: 'posted' };
    if (req.query.locationId) where.locationId = parseInt(req.query.locationId, 10);
    if (req.query.from || req.query.to) {
      const from = req.query.from ? new Date(req.query.from) : new Date('1970-01-01');
      const to = req.query.to ? new Date(req.query.to) : new Date('2999-12-31');
      where.postedAt = { [Op.between]: [from, to] };
    }
    const counts = await StockCount.findAll({
      where,
      include: [
        { model: Location, attributes: ['id', 'name'] },
        { model: StockCountLine, as: 'lines',
          include: [{ model: Product, attributes: ['id', 'name', 'category'] }],
        },
      ],
      order: [['postedAt', 'DESC']],
    });

    // Per-location aggregate + top loss items
    const byLocation = new Map();
    const itemLoss = new Map(); // productId+variantIndex → { name, sku, totalQty, totalValue }
    let totalShrinkageValue = 0;
    let totalSurplusValue = 0;
    let totalCounts = counts.length;

    for (const c of counts) {
      const loc = c.Location?.name || 'Unknown';
      const bucket = byLocation.get(c.locationId) || {
        locationId: c.locationId, locationName: loc, shrinkageValue: 0, surplusValue: 0, counts: 0,
      };
      bucket.counts += 1;
      for (const l of c.lines || []) {
        const v = parseFloat(l.varianceValue) || 0;
        if (v < 0) {
          bucket.shrinkageValue += -v;
          totalShrinkageValue += -v;
          const key = `${l.productId}:${l.variantIndex ?? 'b'}`;
          const it = itemLoss.get(key) || {
            productId: l.productId, variantIndex: l.variantIndex,
            sku: l.sku, name: l.name, totalQty: 0, totalValue: 0,
          };
          it.totalQty += -(l.variance || 0);
          it.totalValue += -v;
          itemLoss.set(key, it);
        } else if (v > 0) {
          bucket.surplusValue += v;
          totalSurplusValue += v;
        }
      }
      byLocation.set(c.locationId, bucket);
    }

    const topLoss = [...itemLoss.values()]
      .sort((a, b) => b.totalValue - a.totalValue)
      .slice(0, 25)
      .map((x) => ({ ...x, totalValue: +x.totalValue.toFixed(3) }));

    res.json({
      totalCounts,
      totalShrinkageValue: +totalShrinkageValue.toFixed(3),
      totalSurplusValue: +totalSurplusValue.toFixed(3),
      netVarianceValue: +(totalSurplusValue - totalShrinkageValue).toFixed(3),
      byLocation: [...byLocation.values()].map((b) => ({
        ...b,
        shrinkageValue: +b.shrinkageValue.toFixed(3),
        surplusValue: +b.surplusValue.toFixed(3),
      })),
      topLoss,
    });
  } catch (err) {
    console.error('[stock-counts/report]', err);
    res.status(500).json({ message: err.message });
  }
});

export default router;
