/**
 * Stock movement between two Locations.
 *
 *   GET    /api/stock-transfers              list
 *   POST   /api/stock-transfers              create (status='pending')
 *   POST   /api/stock-transfers/:id/dispatch   pending -> in_transit, decrement source
 *   POST   /api/stock-transfers/:id/complete   in_transit -> completed, increment destination
 *   POST   /api/stock-transfers/:id/cancel     undo (restores source if was in_transit)
 *
 * items JSON shape: [{ productId, variantIndex|null, quantity, name?, sku? }]
 *
 * Decrements/increments go through ProductStock.update() so the
 * Product.stock sync hook fires.
 */
import { Router } from 'express';
import sequelize from '../config/database.js';
import { StockTransfer, ProductStock, Location, User, recomputeProductStock } from '../models/index.js';
import { protect, admin } from '../middleware/auth.js';

const router = Router();

function genTransferNumber() {
  return `XFR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
}

router.get('/', protect, admin, async (req, res) => {
  try {
    const where = {};
    if (req.query.status) where.status = req.query.status;
    const rows = await StockTransfer.findAll({
      where,
      order: [['createdAt', 'DESC']],
      include: [
        { model: Location, as: 'fromLocation', attributes: ['id', 'name', 'code'] },
        { model: Location, as: 'toLocation', attributes: ['id', 'name', 'code'] },
        { model: User, as: 'creator', attributes: ['id', 'name', 'email'] },
      ],
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', protect, admin, async (req, res) => {
  try {
    const { fromLocationId, toLocationId, items, notes } = req.body;
    if (!fromLocationId || !toLocationId) {
      return res.status(400).json({ message: 'from + to location required' });
    }
    if (parseInt(fromLocationId, 10) === parseInt(toLocationId, 10)) {
      return res.status(400).json({ message: 'Source and destination must differ' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'At least one item required' });
    }

    const cleanItems = items
      .map((it) => ({
        productId: parseInt(it.productId, 10),
        variantIndex: it.variantIndex == null || it.variantIndex === '' ? null : parseInt(it.variantIndex, 10),
        quantity: parseInt(it.quantity, 10),
        name: it.name || null,
        sku: it.sku || null,
      }))
      .filter((it) => it.productId && it.quantity > 0);
    if (cleanItems.length === 0) {
      return res.status(400).json({ message: 'No valid items in the list' });
    }

    const transfer = await StockTransfer.create({
      transferNumber: genTransferNumber(),
      fromLocationId: parseInt(fromLocationId, 10),
      toLocationId: parseInt(toLocationId, 10),
      items: cleanItems,
      notes: notes?.trim() || null,
      createdBy: req.user.id,
      status: 'pending',
    });
    res.status(201).json(transfer);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/:id/dispatch', protect, admin, async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const xfr = await StockTransfer.findByPk(req.params.id, { transaction: t });
    if (!xfr) { await t.rollback(); return res.status(404).json({ message: 'Not found' }); }
    if (xfr.status !== 'pending') {
      await t.rollback();
      return res.status(400).json({ message: `Can only dispatch a pending transfer (currently ${xfr.status})` });
    }

    // Decrement source. Fail if any line would go negative.
    for (const it of xfr.items) {
      const stock = await ProductStock.findOne({
        where: { productId: it.productId, variantIndex: it.variantIndex, locationId: xfr.fromLocationId },
        transaction: t,
      });
      const have = stock?.quantity || 0;
      if (have < it.quantity) {
        await t.rollback();
        return res.status(400).json({
          message: `Insufficient stock at source for product ${it.productId}${it.variantIndex != null ? ' v' + it.variantIndex : ''} — have ${have}, need ${it.quantity}`,
        });
      }
    }
    // All lines validated — actually apply.
    for (const it of xfr.items) {
      const stock = await ProductStock.findOne({
        where: { productId: it.productId, variantIndex: it.variantIndex, locationId: xfr.fromLocationId },
        transaction: t,
      });
      await stock.update({ quantity: stock.quantity - it.quantity }, { transaction: t });
    }
    await xfr.update({ status: 'in_transit', dispatchedAt: new Date() }, { transaction: t });
    await t.commit();
    // Recompute Product.stock after the transaction has fully committed.
    for (const pid of new Set(xfr.items.map((i) => i.productId))) await recomputeProductStock(pid);
    res.json(xfr);
  } catch (err) {
    if (!t.finished) await t.rollback().catch(() => {});
    console.error('[stock-transfers] dispatch error:', err);
    res.status(500).json({ message: err.message });
  }
});

router.post('/:id/complete', protect, admin, async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const xfr = await StockTransfer.findByPk(req.params.id, { transaction: t });
    if (!xfr) { await t.rollback(); return res.status(404).json({ message: 'Not found' }); }
    if (xfr.status !== 'in_transit') {
      await t.rollback();
      return res.status(400).json({ message: `Can only complete an in-transit transfer (currently ${xfr.status})` });
    }
    // Increment destination — manual findOne + create-or-update path so we
    // don't trigger Sequelize's findOrCreate savepoint dance.
    for (const it of xfr.items) {
      const existing = await ProductStock.findOne({
        where: { productId: it.productId, variantIndex: it.variantIndex, locationId: xfr.toLocationId },
        transaction: t,
      });
      if (existing) {
        await existing.update({ quantity: existing.quantity + it.quantity }, { transaction: t });
      } else {
        await ProductStock.create({
          productId: it.productId,
          variantIndex: it.variantIndex,
          locationId: xfr.toLocationId,
          quantity: it.quantity,
        }, { transaction: t });
      }
    }
    await xfr.update({ status: 'completed', completedAt: new Date() }, { transaction: t });
    await t.commit();
    for (const pid of new Set(xfr.items.map((i) => i.productId))) await recomputeProductStock(pid);
    res.json(xfr);
  } catch (err) {
    if (!t.finished) await t.rollback().catch(() => {});
    console.error('[stock-transfers] complete error:', err);
    res.status(500).json({ message: err.message });
  }
});

router.post('/:id/cancel', protect, admin, async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const xfr = await StockTransfer.findByPk(req.params.id, { transaction: t });
    if (!xfr) { await t.rollback(); return res.status(404).json({ message: 'Not found' }); }
    if (xfr.status === 'completed' || xfr.status === 'cancelled') {
      await t.rollback();
      return res.status(400).json({ message: `Can't cancel a ${xfr.status} transfer` });
    }
    const wasInTransit = xfr.status === 'in_transit';
    if (wasInTransit) {
      for (const it of xfr.items) {
        const existing = await ProductStock.findOne({
          where: { productId: it.productId, variantIndex: it.variantIndex, locationId: xfr.fromLocationId },
          transaction: t,
        });
        if (existing) {
          await existing.update({ quantity: existing.quantity + it.quantity }, { transaction: t });
        } else {
          await ProductStock.create({
            productId: it.productId,
            variantIndex: it.variantIndex,
            locationId: xfr.fromLocationId,
            quantity: it.quantity,
          }, { transaction: t });
        }
      }
    }
    await xfr.update({ status: 'cancelled' }, { transaction: t });
    await t.commit();
    if (wasInTransit) {
      for (const pid of new Set(xfr.items.map((i) => i.productId))) await recomputeProductStock(pid);
    }
    res.json(xfr);
  } catch (err) {
    if (!t.finished) await t.rollback().catch(() => {});
    res.status(500).json({ message: err.message });
  }
});

export default router;
