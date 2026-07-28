/**
 * Per-location inventory for the multi-location stores.
 *
 *   GET    /api/inventory                        list, filterable by location + product
 *   GET    /api/inventory/product/:productId     all stock rows for one product
 *                                                (each variant × each location)
 *   POST   /api/inventory/adjust                 upsert one (productId, variantIndex, locationId)
 *                                                with a new quantity. Triggers the
 *                                                Product.stock sync hook automatically.
 *
 * Phase 5 (POS) will add the decrement endpoints; for now this is the
 * admin's view + manual adjust surface.
 */
import { Router } from 'express';
import { Op } from 'sequelize';
import { ProductStock, Product, Location, recomputeProductStock } from '../models/index.js';
import { protect, admin } from '../middleware/auth.js';

const router = Router();

router.get('/', protect, admin, async (req, res) => {
  try {
    const where = {};
    if (req.query.locationId) where.locationId = parseInt(req.query.locationId, 10);
    if (req.query.productId)  where.productId  = parseInt(req.query.productId, 10);
    const rows = await ProductStock.findAll({
      where,
      order: [['productId', 'ASC'], ['variantIndex', 'ASC'], ['locationId', 'ASC']],
      include: [
        { model: Product, attributes: ['id', 'name', 'code', 'variants'] },
        { model: Location, attributes: ['id', 'name', 'code'] },
      ],
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// All stock rows for one product, plus the metadata callers need to render
// a "rows = variants, cols = locations" grid in admin.
router.get('/product/:productId', protect, admin, async (req, res) => {
  try {
    const productId = parseInt(req.params.productId, 10);
    const product = await Product.findByPk(productId);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    const [stocks, locations] = await Promise.all([
      ProductStock.findAll({ where: { productId } }),
      Location.findAll({ where: { active: true }, order: [['sortOrder', 'ASC'], ['id', 'ASC']] }),
    ]);
    res.json({
      product: product.toJSON(),
      locations,
      stocks,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Upsert one (productId, variantIndex|null, locationId) → quantity.
// Always go through model .update()/save() so the sync hook fires.
router.post('/adjust', protect, admin, async (req, res) => {
  try {
    const { productId, variantIndex, locationId, quantity, reorderThreshold } = req.body;
    if (!productId || !locationId) {
      return res.status(400).json({ message: 'productId and locationId are required' });
    }
    if (quantity == null || isNaN(parseInt(quantity, 10))) {
      return res.status(400).json({ message: 'quantity must be a number' });
    }
    const qty = Math.max(0, parseInt(quantity, 10));

    // variantIndex must be null OR a non-negative integer. Normalise.
    const vIdx = variantIndex == null || variantIndex === '' ? null : parseInt(variantIndex, 10);

    const existing = await ProductStock.findOne({ where: { productId, variantIndex: vIdx, locationId } });
    let row;
    if (existing) {
      const updates = { quantity: qty };
      if (reorderThreshold !== undefined) updates.reorderThreshold = reorderThreshold;
      await existing.update(updates);
      row = existing;
    } else {
      row = await ProductStock.create({
        productId, variantIndex: vIdx, locationId, quantity: qty,
        reorderThreshold: reorderThreshold != null ? parseInt(reorderThreshold, 10) : null,
      });
    }
    await recomputeProductStock(productId);
    res.json(row);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Bulk adjust — array of { productId, variantIndex, locationId, quantity }
router.post('/adjust-bulk', protect, admin, async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (items.length === 0) return res.status(400).json({ message: 'items required' });

    const touched = new Set();
    const results = [];
    for (const it of items) {
      const productId = parseInt(it.productId, 10);
      const locationId = parseInt(it.locationId, 10);
      if (!productId || !locationId) continue;
      const vIdx = it.variantIndex == null || it.variantIndex === '' ? null : parseInt(it.variantIndex, 10);
      const qty = Math.max(0, parseInt(it.quantity, 10) || 0);
      const existing = await ProductStock.findOne({ where: { productId, variantIndex: vIdx, locationId } });
      if (existing) {
        await existing.update({ quantity: qty });
      } else {
        await ProductStock.create({ productId, variantIndex: vIdx, locationId, quantity: qty });
      }
      touched.add(productId);
      results.push({ productId, variantIndex: vIdx, locationId, quantity: qty });
    }
    for (const pid of touched) await recomputeProductStock(pid);
    res.json({ ok: true, count: results.length, items: results });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
