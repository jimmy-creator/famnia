/**
 * Purchase Returns — sending stock back to a Supplier.
 *
 *   GET    /api/purchase-returns               list with filters
 *   POST   /api/purchase-returns               create (decrements stock)
 *   GET    /api/purchase-returns/:id           detail
 *   GET    /api/purchase-returns/:id/pdf       printable return note for the supplier
 *   POST   /api/purchase-returns/:id/cancel    admin reversal
 *
 * On create:
 *   - For each item, decrement ProductStock at the return's locationId.
 *   - Increment Product.stock via recomputeProductStock helper.
 *   - Returns can be linked to a PO (purchaseOrderId) or standalone
 *     (defective stock found without traceable PO).
 *
 * On cancel:
 *   - Stock is added back at the same location.
 *   - Mark status='cancelled'.
 */
import { Router } from 'express';
import { Op } from 'sequelize';
import sequelize from '../config/database.js';
import {
  PurchaseReturn, PurchaseOrder, Supplier, Location, User,
  ProductStock, recomputeProductStock, CashAccount, writeCashTxn,
} from '../models/index.js';
import { protect, admin } from '../middleware/auth.js';
import { rangeStart, rangeEnd } from '../utils/dates.js';
import { lineKey, parseVariantIndex, totalsByKey } from '../utils/lines.js';
import { generatePurchaseReturnPdf } from '../services/purchaseDocs.js';
import { hasPermission } from '../hub/permissions.js';

const router = Router();

const genReturnNumber = () =>
  `PR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

router.get('/', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && !hasPermission(req.user, 'products')) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const where = {};
    if (req.query.supplierId) where.supplierId = parseInt(req.query.supplierId, 10);
    if (req.query.locationId) where.locationId = parseInt(req.query.locationId, 10);
    if (req.query.refundMethod) where.refundMethod = req.query.refundMethod;
    if (req.query.from || req.query.to) {
      const from = req.query.from ? rangeStart(req.query.from) : new Date('1970-01-01');
      const to = req.query.to ? rangeEnd(req.query.to) : new Date('2999-12-31');
      where.createdAt = { [Op.between]: [from, to] };
    }
    const rows = await PurchaseReturn.findAll({
      where,
      include: [
        { model: Supplier, attributes: ['id', 'name', 'code'] },
        { model: Location, attributes: ['id', 'name', 'code'] },
        { model: PurchaseOrder, attributes: ['id', 'poNumber'] },
        { model: User, as: 'creator', attributes: ['id', 'name'] },
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(req.query.limit, 10) || 200,
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/:id', protect, async (req, res) => {
  try {
    const row = await PurchaseReturn.findByPk(req.params.id, {
      include: [
        { model: Supplier, attributes: ['id', 'name', 'code', 'phone'] },
        { model: Location, attributes: ['id', 'name', 'code'] },
        { model: PurchaseOrder, attributes: ['id', 'poNumber'] },
        { model: User, as: 'creator', attributes: ['id', 'name'] },
      ],
    });
    if (!row) return res.status(404).json({ message: 'Return not found' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PDF (opens in the browser to print or save) — goes with the stock to the supplier.
router.get('/:id/pdf', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && !hasPermission(req.user, 'products')) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const row = await PurchaseReturn.findByPk(req.params.id, {
      include: [
        { model: Supplier },
        { model: Location, attributes: ['id', 'name', 'code', 'address'] },
        { model: PurchaseOrder, attributes: ['id', 'poNumber'] },
        { model: User, as: 'creator', attributes: ['id', 'name'] },
      ],
    });
    if (!row) return res.status(404).json({ message: 'Return not found' });
    const pdf = await generatePurchaseReturnPdf(row.toJSON());
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${row.returnNumber}.pdf"`,
      'Content-Length': pdf.length,
    });
    res.send(pdf);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', protect, async (req, res) => {
  if (req.user.role !== 'admin' && !hasPermission(req.user, 'products')) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  const t = await sequelize.transaction();
  try {
    const { supplierId, locationId, purchaseOrderId, items, refundMethod = 'credit_note', reason, notes } = req.body || {};
    if (!supplierId || !locationId) {
      await t.rollback();
      return res.status(400).json({ message: 'supplierId and locationId required' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      await t.rollback();
      return res.status(400).json({ message: 'items[] required' });
    }
    if (!['credit_note', 'cash', 'bank'].includes(refundMethod)) {
      await t.rollback();
      return res.status(400).json({ message: 'refundMethod must be credit_note, cash or bank' });
    }

    // Validate + check stock availability at the location.
    const lines = [];
    let total = 0;
    const productIds = new Set();
    // Stock is checked against the combined quantity per product, so the
    // same item on two lines can't each pass and drive stock negative.
    const needed = totalsByKey(items.map((it) => ({
      productId: parseInt(it.productId, 10),
      variantIndex: parseVariantIndex(it.variantIndex),
      quantity: it.quantity,
    })));
    for (const it of items) {
      const productId = parseInt(it.productId, 10);
      const vIdx = parseVariantIndex(it.variantIndex);
      const qty = parseInt(it.quantity, 10);
      const unitCost = parseFloat(it.unitCost) || 0;
      if (!productId || !qty || qty < 1) {
        await t.rollback();
        return res.status(400).json({ message: 'Invalid item entry' });
      }
      const stock = await ProductStock.findOne({
        where: { productId, variantIndex: vIdx, locationId },
        transaction: t,
      });
      const have = stock?.quantity || 0;
      const need = needed.get(lineKey(productId, vIdx));
      if (have < need) {
        await t.rollback();
        return res.status(400).json({ message: `Not enough stock at this location — have ${have}, need ${need}` });
      }
      const refundAmount = +(unitCost * qty).toFixed(3);
      total += refundAmount;
      lines.push({
        productId, variantIndex: vIdx,
        name: it.name || `Product #${productId}`,
        quantity: qty, unitCost, refundAmount,
      });
      productIds.add(productId);
    }
    total = +total.toFixed(3);

    // Decrement stock.
    for (const l of lines) {
      const stock = await ProductStock.findOne({
        where: { productId: l.productId, variantIndex: l.variantIndex, locationId },
        transaction: t,
      });
      await stock.update({ quantity: stock.quantity - l.quantity }, { transaction: t });
    }

    const pr = await PurchaseReturn.create({
      returnNumber: genReturnNumber(),
      supplierId, locationId,
      purchaseOrderId: purchaseOrderId || null,
      items: lines,
      totalAmount: total,
      refundMethod,
      reason: reason?.trim() || null,
      notes: notes?.trim() || null,
      status: 'completed',
      createdBy: req.user.id,
    }, { transaction: t });

    // A cash or bank refund from the supplier is money IN — without this
    // the daybook and every cash balance miss it entirely. A credit_note
    // moves no cash, so it correctly writes nothing.
    if (refundMethod === 'cash' || refundMethod === 'bank') {
      const acctType = refundMethod === 'cash' ? 'drawer' : 'bank';
      const acct = await CashAccount.findOne({
        where: {
          type: acctType, active: true,
          ...(acctType === 'drawer' ? { locationId } : {}),
        },
        transaction: t,
      });
      await writeCashTxn({
        cashAccountId: acct?.id,
        amount: total,
        source: 'supplier_payment',
        sourceType: 'PurchaseReturn',
        sourceId: pr.id,
        reference: pr.returnNumber,
        description: `Supplier refund (${refundMethod})`,
        date: new Date(),
        createdBy: req.user.id,
        transaction: t,
      });
    }

    await t.commit();
    for (const pid of productIds) await recomputeProductStock(pid);
    res.status(201).json(pr);
  } catch (err) {
    if (!t.finished) await t.rollback().catch(() => {});
    console.error('[purchase-returns/create]', err);
    res.status(400).json({ message: err.message });
  }
});

router.post('/:id/cancel', protect, admin, async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const pr = await PurchaseReturn.findByPk(req.params.id, { transaction: t });
    if (!pr) { await t.rollback(); return res.status(404).json({ message: 'Return not found' }); }
    if (pr.status !== 'completed') { await t.rollback(); return res.status(400).json({ message: 'Already cancelled' }); }

    const productIds = new Set();
    for (const it of (pr.items || [])) {
      productIds.add(it.productId);
      const existing = await ProductStock.findOne({
        where: { productId: it.productId, variantIndex: it.variantIndex ?? null, locationId: pr.locationId },
        transaction: t,
      });
      if (existing) {
        await existing.update({ quantity: existing.quantity + it.quantity }, { transaction: t });
      } else {
        await ProductStock.create({
          productId: it.productId,
          variantIndex: it.variantIndex ?? null,
          locationId: pr.locationId,
          quantity: it.quantity,
        }, { transaction: t });
      }
    }

    // Mirror-reversal of the refund, dated today — never delete the
    // original ledger row. Same pattern as the expense-cancel path.
    if (pr.refundMethod === 'cash' || pr.refundMethod === 'bank') {
      const acctType = pr.refundMethod === 'cash' ? 'drawer' : 'bank';
      const acct = await CashAccount.findOne({
        where: {
          type: acctType, active: true,
          ...(acctType === 'drawer' ? { locationId: pr.locationId } : {}),
        },
        transaction: t,
      });
      await writeCashTxn({
        cashAccountId: acct?.id,
        amount: -(parseFloat(pr.totalAmount) || 0),
        source: 'supplier_payment',
        sourceType: 'PurchaseReturn',
        sourceId: pr.id,
        reference: `${pr.returnNumber}-REVERSAL`,
        description: 'Supplier refund cancelled',
        date: new Date(),
        createdBy: req.user.id,
        transaction: t,
      });
    }

    await pr.update({ status: 'cancelled' }, { transaction: t });
    await t.commit();
    for (const pid of productIds) await recomputeProductStock(pid);
    res.json({ ok: true });
  } catch (err) {
    if (!t.finished) await t.rollback().catch(() => {});
    res.status(500).json({ message: err.message });
  }
});

export default router;
