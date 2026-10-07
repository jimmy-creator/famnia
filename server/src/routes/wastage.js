/**
 * Wastage — stock written off outside of a sale (damaged, lost, samples…).
 *
 *   GET    /api/wastage              list, filterable by date/location/reason
 *   GET    /api/wastage/summary      totals by reason and by product
 *   POST   /api/wastage              post a write-off (deducts stock)
 *   POST   /api/wastage/:id/cancel   reverse a write-off (returns stock)
 *
 * Booking the cost to the P&L is optional and mirrors how StockCount handles
 * shrinkage (routes/stockCounts.js): supply an expenseCategoryId +
 * cashAccountId and an Expense is written, omit them and the entry only moves
 * stock. Point it at a non-cash account if you don't want the drawer touched.
 */
import { Router } from 'express';
import { Op, fn, col, literal } from 'sequelize';
import sequelize from '../config/database.js';
import {
  Wastage, Product, Location, ProductStock, Expense, User,
  recomputeProductStock, logActivity, verifyManagerPin, writeCashTxn,
} from '../models/index.js';
import { protect, admin, requirePermission } from '../middleware/auth.js';
import { localDate } from '../utils/dates.js';

const router = Router();

const gen = (prefix) =>
  `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

// Write-offs worth more than this need a manager PIN from a non-admin user.
const OVERRIDE_VALUE_THRESHOLD = 20;

function dateRange(query) {
  const where = {};
  if (query.from || query.to) {
    where.wastageDate = {};
    if (query.from) where.wastageDate[Op.gte] = query.from;
    if (query.to) where.wastageDate[Op.lte] = query.to;
  }
  return where;
}

// ─── List ──────────────────────────────────────────────────────────
router.get('/', protect, admin, requirePermission('products'), async (req, res) => {
  try {
    const where = { ...dateRange(req.query) };
    if (req.query.locationId) where.locationId = parseInt(req.query.locationId, 10);
    if (req.query.productId) where.productId = parseInt(req.query.productId, 10);
    if (req.query.reason) where.reason = req.query.reason;
    where.status = req.query.status || 'posted';

    const rows = await Wastage.findAll({
      where,
      order: [['wastageDate', 'DESC'], ['id', 'DESC']],
      limit: Math.min(parseInt(req.query.limit, 10) || 200, 1000),
      include: [
        { model: Product, attributes: ['id', 'name', 'nameAr', 'code'] },
        { model: Location, attributes: ['id', 'name'] },
        { model: User, as: 'creator', attributes: ['id', 'name'] },
      ],
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Summary (what is actually bleeding money) ─────────────────────
router.get('/summary', protect, admin, requirePermission('analytics'), async (req, res) => {
  try {
    const where = { status: 'posted', ...dateRange(req.query) };
    if (req.query.locationId) where.locationId = parseInt(req.query.locationId, 10);

    const [byReason, byProduct] = await Promise.all([
      Wastage.findAll({
        where,
        attributes: [
          'reason',
          [fn('SUM', col('totalCost')), 'totalCost'],
          [fn('SUM', col('quantity')), 'totalQty'],
          [fn('COUNT', col('id')), 'entries'],
        ],
        group: ['reason'],
        raw: true,
      }),
      Wastage.findAll({
        where,
        attributes: [
          'productId',
          [fn('SUM', col('totalCost')), 'totalCost'],
          [fn('SUM', col('quantity')), 'totalQty'],
          [fn('COUNT', col('Wastage.id')), 'entries'],
        ],
        group: ['productId', 'Product.id'],
        include: [{ model: Product, attributes: ['id', 'name', 'nameAr', 'code'] }],
        order: [[literal('totalCost'), 'DESC']],
        limit: 50,
      }),
    ]);

    const totalCost = byReason.reduce((s, r) => s + (parseFloat(r.totalCost) || 0), 0);
    res.json({ totalCost: +totalCost.toFixed(3), byReason, byProduct });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Post a write-off ──────────────────────────────────────────────
router.post('/', protect, admin, requirePermission('products'), async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { productId, locationId, reason } = req.body;
    const quantity = parseFloat(req.body.quantity);

    if (!productId || !locationId) {
      await t.rollback();
      return res.status(400).json({ message: 'productId and locationId are required' });
    }
    if (!quantity || quantity <= 0) {
      await t.rollback();
      return res.status(400).json({ message: 'quantity must be greater than 0' });
    }
    // Stock is held in whole units. A fractional qty
    // used to round to 0 — nothing left the shelf, yet its cost was booked.
    if (!Number.isInteger(quantity)) {
      await t.rollback();
      return res.status(400).json({ message: 'quantity must be a whole number' });
    }

    const product = await Product.findByPk(parseInt(productId, 10), { transaction: t });
    if (!product) {
      await t.rollback();
      return res.status(404).json({ message: 'Product not found' });
    }

    const vIdx = req.body.variantIndex == null || req.body.variantIndex === ''
      ? null : parseInt(req.body.variantIndex, 10);

    const costPrice = req.body.costPrice != null
      ? parseFloat(req.body.costPrice)
      : (parseFloat(product.costPrice) || 0);
    const totalCost = +(costPrice * quantity).toFixed(3);

    // High-value write-offs need a manager's approval unless an admin is
    // doing it — admins carry inherent authority (same rule as stock counts).
    let approver = null;
    if (totalCost >= OVERRIDE_VALUE_THRESHOLD && req.user.role !== 'admin') {
      const { managerId, managerPin } = req.body;
      if (!managerId || !managerPin) {
        await t.rollback();
        return res.status(403).json({ message: 'Manager PIN required for this write-off value' });
      }
      try {
        approver = await verifyManagerPin({ userId: managerId, pin: managerPin, transaction: t });
      } catch (err) {
        await t.rollback();
        return res.status(403).json({ message: err.message });
      }
    }

    // ── Deduct stock ── can't write off more than the location holds; if
    // the shelf count is wrong, a stock count is the way to correct it.
    const stockRow = await ProductStock.findOne({
      where: { productId: product.id, variantIndex: vIdx, locationId: parseInt(locationId, 10) },
      transaction: t,
    });
    const have = stockRow?.quantity || 0;
    if (have < quantity) {
      await t.rollback();
      return res.status(400).json({ message: `Only ${have} of ${product.name} in stock at this location` });
    }
    await stockRow.update({ quantity: have - quantity }, { transaction: t });


    // ── Optional P&L booking ──
    let expense = null;
    if (totalCost > 0 && req.body.expenseCategoryId && req.body.cashAccountId) {
      const wastageDate = req.body.wastageDate || localDate();
      expense = await Expense.create({
        expenseNumber: gen('EXP'),
        expenseCategoryId: parseInt(req.body.expenseCategoryId, 10),
        locationId: parseInt(locationId, 10),
        cashAccountId: parseInt(req.body.cashAccountId, 10),
        amount: totalCost,
        paymentMethod: 'other',
        description: `Wastage — ${product.name} (${reason || 'damaged'})`,
        expenseDate: wastageDate,
        status: 'paid',
        createdBy: req.user.id,
      }, { transaction: t });
      await writeCashTxn({
        cashAccountId: expense.cashAccountId,
        amount: -totalCost,
        source: 'expense',
        sourceType: 'Expense',
        sourceId: expense.id,
        reference: expense.expenseNumber,
        description: expense.description,
        date: new Date(expense.expenseDate),
        createdBy: req.user.id,
        transaction: t,
      });
    }

    const wastage = await Wastage.create({
      wastageNumber: gen('WST'),
      productId: product.id,
      variantIndex: vIdx,
      locationId: parseInt(locationId, 10),
      quantity,
      costPrice: +costPrice.toFixed(3),
      totalCost,
      reason: reason || 'damaged',
      notes: req.body.notes?.trim() || null,
      wastageDate: req.body.wastageDate || localDate(),
      status: 'posted',
      expenseId: expense?.id || null,
      createdBy: req.user.id,
      managerOverrideBy: approver?.id || null,
    }, { transaction: t });

    await logActivity({
      userId: req.user.id,
      action: 'wastage_post',
      entityType: 'Wastage',
      entityId: wastage.id,
      details: { wastageNumber: wastage.wastageNumber, product: product.name, quantity, totalCost, reason },
      managerOverrideBy: approver?.id || null,
      locationId: parseInt(locationId, 10),
      transaction: t,
    });

    await t.commit();
    await recomputeProductStock(product.id);

    res.status(201).json(wastage);
  } catch (err) {
    await t.rollback();
    res.status(500).json({ message: err.message });
  }
});

// ─── Cancel (put the stock back) ───────────────────────────────────
router.post('/:id/cancel', protect, admin, requirePermission('products'), async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const wastage = await Wastage.findByPk(parseInt(req.params.id, 10), { transaction: t });
    if (!wastage) {
      await t.rollback();
      return res.status(404).json({ message: 'Wastage entry not found' });
    }
    if (wastage.status === 'cancelled') {
      await t.rollback();
      return res.status(400).json({ message: 'Already cancelled' });
    }

    const restore = Math.round(parseFloat(wastage.quantity));
    const stockRow = await ProductStock.findOne({
      where: { productId: wastage.productId, variantIndex: wastage.variantIndex, locationId: wastage.locationId },
      transaction: t,
    });
    if (stockRow) {
      await stockRow.update({ quantity: stockRow.quantity + restore }, { transaction: t });
    } else {
      await ProductStock.create({
        productId: wastage.productId, variantIndex: wastage.variantIndex,
        locationId: wastage.locationId, quantity: restore,
      }, { transaction: t });
    }

    // Cancel the linked expense too, so the P&L doesn't keep the write-off.
    if (wastage.expenseId) {
      const expense = await Expense.findByPk(wastage.expenseId, { transaction: t });
      if (expense && expense.status !== 'cancelled') {
        await expense.update({ status: 'cancelled' }, { transaction: t });
        await writeCashTxn({
          cashAccountId: expense.cashAccountId,
          amount: parseFloat(expense.amount),
          source: 'expense',
          sourceType: 'Expense',
          sourceId: expense.id,
          reference: expense.expenseNumber,
          description: `Reversal — ${expense.description}`,
          date: new Date(),
          createdBy: req.user.id,
          transaction: t,
        });
      }
    }

    await wastage.update({ status: 'cancelled' }, { transaction: t });

    await logActivity({
      userId: req.user.id,
      action: 'wastage_cancel',
      entityType: 'Wastage',
      entityId: wastage.id,
      details: { wastageNumber: wastage.wastageNumber, restored: restore },
      locationId: wastage.locationId,
      transaction: t,
    });

    await t.commit();
    await recomputeProductStock(wastage.productId);

    res.json(wastage);
  } catch (err) {
    await t.rollback();
    res.status(500).json({ message: err.message });
  }
});

export default router;
