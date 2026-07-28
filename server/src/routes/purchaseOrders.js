/**
 * Purchase Orders + GRN (receive) + Payments.
 *
 *   GET    /api/purchase-orders                 list with filters
 *   POST   /api/purchase-orders                 create (draft|sent)
 *   GET    /api/purchase-orders/:id             detail + receipts + payments
 *   PUT    /api/purchase-orders/:id             update (only when draft/sent)
 *   POST   /api/purchase-orders/:id/send        mark sent
 *   POST   /api/purchase-orders/:id/cancel      cancel (only if nothing received)
 *   POST   /api/purchase-orders/:id/receive     create a GRN, increment stock
 *   POST   /api/purchase-orders/:id/pay         record a SupplierPayment
 *
 * Receive flow:
 *   Body: { items: [{ productId, variantIndex, quantity }], notes? }
 *   - Each line's qty must not exceed (orderedQty - already receivedQty)
 *   - Increments ProductStock at the PO's locationId
 *   - Bumps PO.items[].receivedQty
 *   - If all lines fully received -> status='received', else 'partial'
 *
 * Pay flow:
 *   Body: { amount, paymentMethod, reference?, notes? }
 *   - amount <= (totalAmount - amountPaid)
 *   - Creates SupplierPayment, bumps PO.amountPaid
 *   - Recomputes PO.paymentStatus
 */
import { Router } from 'express';
import { Op } from 'sequelize';
import sequelize from '../config/database.js';
import {
  PurchaseOrder, PurchaseReceipt, SupplierPayment, ProductStock,
  Supplier, Location, User, Product, CashAccount,
  recomputeProductStock, writeCashTxn,
} from '../models/index.js';
import { protect, admin } from '../middleware/auth.js';

const router = Router();

const gen = (prefix) =>
  `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

// ─── List ──────────────────────────────────────────────────────────
router.get('/', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && !(req.user.permissions || []).includes('products')) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const where = {};
    if (req.query.supplierId) where.supplierId = parseInt(req.query.supplierId, 10);
    if (req.query.locationId) where.locationId = parseInt(req.query.locationId, 10);
    if (req.query.status) where.status = req.query.status;
    if (req.query.paymentStatus) where.paymentStatus = req.query.paymentStatus;
    if (req.query.from || req.query.to) {
      const from = req.query.from ? new Date(req.query.from) : new Date('1970-01-01');
      const to = req.query.to ? new Date(req.query.to) : new Date('2999-12-31');
      where.createdAt = { [Op.between]: [from, to] };
    }
    const rows = await PurchaseOrder.findAll({
      where,
      include: [
        { model: Supplier, attributes: ['id', 'name', 'code'] },
        { model: Location, attributes: ['id', 'name', 'code'] },
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(req.query.limit, 10) || 200,
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Detail ────────────────────────────────────────────────────────
router.get('/:id', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && !(req.user.permissions || []).includes('products')) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const po = await PurchaseOrder.findByPk(req.params.id, {
      include: [
        { model: Supplier, attributes: ['id', 'name', 'code', 'phone', 'email'] },
        { model: Location, attributes: ['id', 'name', 'code', 'address'] },
        { model: User, as: 'creator', attributes: ['id', 'name'] },
        { model: PurchaseReceipt, include: [{ model: User, as: 'receiver', attributes: ['id', 'name'] }] },
        { model: SupplierPayment, include: [{ model: User, as: 'payer', attributes: ['id', 'name'] }] },
      ],
    });
    if (!po) return res.status(404).json({ message: 'PO not found' });
    res.json(po);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Helpers for items shape ───────────────────────────────────────
function normalizeItems(items) {
  if (!Array.isArray(items)) throw new Error('items[] required');
  if (items.length === 0) throw new Error('At least one item is required');
  return items.map((it) => {
    const productId = parseInt(it.productId, 10);
    if (!productId) throw new Error('Each item needs productId');
    const orderedQty = parseInt(it.orderedQty ?? it.quantity, 10);
    if (!orderedQty || orderedQty < 1) throw new Error('Quantity must be > 0');
    const unitCost = parseFloat(it.unitCost) || 0;
    const taxRate = parseFloat(it.taxRate) || 0;
    const lineSubtotal = unitCost * orderedQty;
    const lineTax = +(lineSubtotal * (taxRate / 100)).toFixed(3);
    return {
      productId,
      variantIndex: it.variantIndex == null || it.variantIndex === '' ? null : parseInt(it.variantIndex, 10),
      name: it.name || '',
      sku: it.sku || null,
      orderedQty,
      receivedQty: parseInt(it.receivedQty, 10) || 0,
      unitCost,
      taxRate,
      lineTotal: +(lineSubtotal + lineTax).toFixed(3),
    };
  });
}

function computeTotals(items, shippingCost = 0, discount = 0) {
  const subtotal = items.reduce((s, i) => s + (i.unitCost * i.orderedQty), 0);
  const taxAmount = items.reduce((s, i) => s + (i.unitCost * i.orderedQty * (i.taxRate / 100)), 0);
  const totalAmount = subtotal + taxAmount + parseFloat(shippingCost || 0) - parseFloat(discount || 0);
  return {
    subtotal: +subtotal.toFixed(3),
    taxAmount: +taxAmount.toFixed(3),
    totalAmount: +totalAmount.toFixed(3),
  };
}

// Allocate shipping cost across lines by line value (qty × unitCost) and
// add it to each line's per-line tax to produce a landed unit cost. The
// landed unit cost is what hits Product.costPrice on receive so cost-of-
// goods reports reflect the true price paid per unit.
function applyLandedCost(items, shippingCost = 0) {
  const shipping = parseFloat(shippingCost) || 0;
  const subtotal = items.reduce((s, i) => s + (i.unitCost * i.orderedQty), 0);
  for (const it of items) {
    const lineValue = it.unitCost * it.orderedQty;
    const lineTax = lineValue * (it.taxRate / 100);
    const lineShipping = subtotal > 0 ? (shipping * lineValue / subtotal) : 0;
    const landedTotal = lineValue + lineTax + lineShipping;
    const qty = it.orderedQty > 0 ? it.orderedQty : 1;
    it.shippingShare = +lineShipping.toFixed(3);
    it.landedLineTotal = +landedTotal.toFixed(3);
    it.landedUnitCost = +(landedTotal / qty).toFixed(3);
  }
  return items;
}

// ─── Create ────────────────────────────────────────────────────────
router.post('/', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && !(req.user.permissions || []).includes('products')) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const { supplierId, locationId, items, status, notes, expectedDate, shippingCost = 0, discount = 0 } = req.body;
    if (!supplierId || !locationId) {
      return res.status(400).json({ message: 'supplierId and locationId required' });
    }
    const normalized = normalizeItems(items);
    const totals = computeTotals(normalized, shippingCost, discount);
    applyLandedCost(normalized, shippingCost);

    // Enrich names from Product table if not supplied.
    const productIds = [...new Set(normalized.map((i) => i.productId))];
    const products = await Product.findAll({ where: { id: productIds }, attributes: ['id', 'name'] });
    const nameMap = new Map(products.map((p) => [p.id, p.name]));
    for (const it of normalized) {
      if (!it.name) it.name = nameMap.get(it.productId) || `Product #${it.productId}`;
    }

    const po = await PurchaseOrder.create({
      poNumber: gen('PO'),
      supplierId,
      locationId,
      items: normalized,
      ...totals,
      shippingCost: parseFloat(shippingCost) || 0,
      discount: parseFloat(discount) || 0,
      status: status === 'sent' ? 'sent' : 'draft',
      paymentStatus: 'unpaid',
      expectedDate: expectedDate || null,
      notes: notes?.trim() || null,
      createdBy: req.user.id,
    });
    res.status(201).json(po);
  } catch (err) {
    console.error('[po/create]', err);
    res.status(400).json({ message: err.message });
  }
});

// ─── Update ────────────────────────────────────────────────────────
router.put('/:id', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && !(req.user.permissions || []).includes('products')) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const po = await PurchaseOrder.findByPk(req.params.id);
    if (!po) return res.status(404).json({ message: 'PO not found' });
    if (!['draft', 'sent'].includes(po.status)) {
      return res.status(400).json({ message: 'Cannot edit a PO with received goods' });
    }
    const { items, supplierId, locationId, notes, expectedDate, shippingCost = po.shippingCost, discount = po.discount } = req.body;
    const updates = {};
    if (items) {
      const normalized = normalizeItems(items);
      const totals = computeTotals(normalized, shippingCost, discount);
      applyLandedCost(normalized, shippingCost);
      Object.assign(updates, { items: normalized, ...totals });
    } else if (shippingCost !== undefined && shippingCost !== po.shippingCost) {
      // Shipping changed but items didn't — re-distribute existing lines.
      const existing = [...(po.items || [])];
      applyLandedCost(existing, shippingCost);
      updates.items = existing;
    }
    if (supplierId) updates.supplierId = parseInt(supplierId, 10);
    if (locationId) updates.locationId = parseInt(locationId, 10);
    if (notes !== undefined) updates.notes = notes?.trim() || null;
    if (expectedDate !== undefined) updates.expectedDate = expectedDate || null;
    if (shippingCost !== undefined) updates.shippingCost = parseFloat(shippingCost) || 0;
    if (discount !== undefined) updates.discount = parseFloat(discount) || 0;
    await po.update(updates);
    res.json(po);
  } catch (err) {
    console.error('[po/update]', err);
    res.status(400).json({ message: err.message });
  }
});

// ─── Send / Cancel ─────────────────────────────────────────────────
router.post('/:id/send', protect, async (req, res) => {
  try {
    const po = await PurchaseOrder.findByPk(req.params.id);
    if (!po) return res.status(404).json({ message: 'PO not found' });
    if (po.status !== 'draft') return res.status(400).json({ message: 'Only drafts can be sent' });
    await po.update({ status: 'sent' });
    res.json(po);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/:id/cancel', protect, admin, async (req, res) => {
  try {
    const po = await PurchaseOrder.findByPk(req.params.id);
    if (!po) return res.status(404).json({ message: 'PO not found' });
    const anyReceived = (po.items || []).some((i) => (i.receivedQty || 0) > 0);
    if (anyReceived) return res.status(400).json({ message: 'Cannot cancel — some items already received' });
    await po.update({ status: 'cancelled' });
    res.json(po);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Receive (GRN) ─────────────────────────────────────────────────
router.post('/:id/receive', protect, async (req, res) => {
  if (req.user.role !== 'admin' && !(req.user.permissions || []).includes('products')) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  const t = await sequelize.transaction();
  try {
    const po = await PurchaseOrder.findByPk(req.params.id, { transaction: t });
    if (!po) { await t.rollback(); return res.status(404).json({ message: 'PO not found' }); }
    if (po.status === 'cancelled' || po.status === 'received') {
      await t.rollback();
      return res.status(400).json({ message: `Cannot receive a ${po.status} PO` });
    }

    const { items, notes } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      await t.rollback();
      return res.status(400).json({ message: 'items[] required' });
    }

    // Validate each line against outstanding qty.
    const poItems = [...(po.items || [])];
    const grnItems = [];
    const productIds = new Set();
    for (const r of items) {
      const productId = parseInt(r.productId, 10);
      const vIdx = r.variantIndex == null || r.variantIndex === '' ? null : parseInt(r.variantIndex, 10);
      const qty = parseInt(r.quantity, 10);
      if (!qty || qty < 1) continue;   // skip zero lines

      const lineIdx = poItems.findIndex((p) => p.productId === productId && (p.variantIndex ?? null) === (vIdx ?? null));
      if (lineIdx < 0) {
        await t.rollback();
        return res.status(400).json({ message: `Product ${productId} not on this PO` });
      }
      const line = poItems[lineIdx];
      const outstanding = (line.orderedQty || 0) - (line.receivedQty || 0);
      if (qty > outstanding) {
        await t.rollback();
        return res.status(400).json({ message: `Cannot receive ${qty} of "${line.name}" — only ${outstanding} outstanding` });
      }
      poItems[lineIdx] = { ...line, receivedQty: (line.receivedQty || 0) + qty };
      grnItems.push({
        productId, variantIndex: vIdx, quantity: qty,
        unitCost: line.unitCost,
        landedUnitCost: line.landedUnitCost ?? line.unitCost,
        name: line.name,
      });
      productIds.add(productId);
    }

    if (grnItems.length === 0) {
      await t.rollback();
      return res.status(400).json({ message: 'No quantities specified' });
    }

    // Increment ProductStock at the PO's location AND update each
    // product's costPrice to the latest received cost (simple last-in
    // pricing — admin can override manually on the product page).
    for (const g of grnItems) {
      const existing = await ProductStock.findOne({
        where: { productId: g.productId, variantIndex: g.variantIndex, locationId: po.locationId },
        transaction: t,
      });
      if (existing) {
        await existing.update({ quantity: existing.quantity + g.quantity }, { transaction: t });
      } else {
        await ProductStock.create({
          productId: g.productId,
          variantIndex: g.variantIndex,
          locationId: po.locationId,
          quantity: g.quantity,
        }, { transaction: t });
      }
      // Use landed unit cost (unit cost + per-line tax + proportional
      // share of PO shipping) so Product.costPrice reflects the true
      // landed price per unit.
      const cost = parseFloat(g.landedUnitCost ?? g.unitCost) || 0;
      if (cost > 0) {
        await Product.update({ costPrice: cost }, { where: { id: g.productId }, transaction: t });
      }
    }

    // Persist GRN.
    const grn = await PurchaseReceipt.create({
      grnNumber: gen('GRN'),
      purchaseOrderId: po.id,
      locationId: po.locationId,
      items: grnItems,
      notes: notes?.trim() || null,
      receivedBy: req.user.id,
    }, { transaction: t });

    // Recompute PO status from line totals.
    const allReceived = poItems.every((p) => (p.receivedQty || 0) >= (p.orderedQty || 0));
    const anyReceived = poItems.some((p) => (p.receivedQty || 0) > 0);
    const newStatus = allReceived ? 'received' : (anyReceived ? 'partial' : po.status);
    const updates = { items: poItems, status: newStatus };
    if (allReceived) updates.receivedDate = new Date();
    await po.update(updates, { transaction: t });

    await t.commit();
    for (const pid of productIds) await recomputeProductStock(pid);

    res.status(201).json({ grn, po: await PurchaseOrder.findByPk(po.id) });
  } catch (err) {
    if (!t.finished) await t.rollback().catch(() => {});
    console.error('[po/receive]', err);
    res.status(400).json({ message: err.message });
  }
});

// ─── Pay (record a SupplierPayment against this PO) ────────────────
router.post('/:id/pay', protect, admin, async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const po = await PurchaseOrder.findByPk(req.params.id, { transaction: t });
    if (!po) { await t.rollback(); return res.status(404).json({ message: 'PO not found' }); }
    if (po.status === 'cancelled') { await t.rollback(); return res.status(400).json({ message: 'PO is cancelled' }); }

    const amount = parseFloat(req.body.amount);
    if (!amount || amount <= 0) { await t.rollback(); return res.status(400).json({ message: 'amount required' }); }
    const outstanding = +((parseFloat(po.totalAmount) || 0) - (parseFloat(po.amountPaid) || 0)).toFixed(3);
    if (amount > outstanding) {
      await t.rollback();
      return res.status(400).json({ message: `Amount exceeds outstanding ${outstanding}` });
    }

    const payment = await SupplierPayment.create({
      paymentNumber: gen('PAY'),
      supplierId: po.supplierId,
      purchaseOrderId: po.id,
      amount,
      paymentMethod: req.body.paymentMethod || 'cash',
      reference: req.body.reference?.trim() || null,
      notes: req.body.notes?.trim() || null,
      paidBy: req.user.id,
    }, { transaction: t });

    // If a cashAccountId is supplied, debit it. Otherwise the payment is
    // tracked but no cash-ledger entry is written (the user can record
    // the cash movement manually as an adjustment later).
    if (req.body.cashAccountId) {
      await writeCashTxn({
        cashAccountId: parseInt(req.body.cashAccountId, 10),
        amount: -amount,
        source: 'supplier_payment',
        sourceType: 'SupplierPayment',
        sourceId: payment.id,
        reference: payment.paymentNumber,
        description: `Payment to supplier vs ${po.poNumber}`,
        date: new Date(),
        createdBy: req.user.id,
        transaction: t,
      });
    }

    const newPaid = +((parseFloat(po.amountPaid) || 0) + amount).toFixed(3);
    const newPaymentStatus = newPaid >= parseFloat(po.totalAmount) ? 'paid' : (newPaid > 0 ? 'partial' : 'unpaid');
    await po.update({ amountPaid: newPaid, paymentStatus: newPaymentStatus }, { transaction: t });

    await t.commit();
    res.status(201).json({ payment, po: await PurchaseOrder.findByPk(po.id) });
  } catch (err) {
    if (!t.finished) await t.rollback().catch(() => {});
    console.error('[po/pay]', err);
    res.status(400).json({ message: err.message });
  }
});

export default router;
