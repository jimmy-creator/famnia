/**
 * Purchase Orders + GRN (receive) + Payments.
 *
 *   GET    /api/purchase-orders                 list with filters
 *   POST   /api/purchase-orders                 create (draft|sent)
 *   GET    /api/purchase-orders/:id             detail + receipts + payments
 *   GET    /api/purchase-orders/:id/pdf         printable PO for the supplier
 *   PUT    /api/purchase-orders/:id             update (only when draft/sent)
 *   POST   /api/purchase-orders/:id/send        mark sent
 *   POST   /api/purchase-orders/:id/cancel      cancel (only if nothing received)
 *   POST   /api/purchase-orders/:id/receive     create a GRN, increment stock
 *   POST   /api/purchase-orders/:id/pay         record a SupplierPayment
 *   POST   /api/purchase-orders/:id/documents   attach files (invoice, packing list, AWB, customs…)
 *   GET    /api/purchase-orders/:id/documents/:docId   view / download one
 *   DELETE /api/purchase-orders/:id/documents/:docId   remove one
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
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import sequelize from '../config/database.js';
import {
  PurchaseOrder, PurchaseReceipt, SupplierPayment, ProductStock,
  Supplier, Location, User, Product, CashAccount, PurchaseDocument,
  recomputeProductStock, writeCashTxn,
} from '../models/index.js';
import { PO_DOC_TYPES } from '../models/PurchaseDocument.js';
import { uploadsDir } from '../config/uploadsDir.js';
import { withStockContext } from '../services/stockLedger.js';
import { protect, admin } from '../middleware/auth.js';
import { rangeStart, rangeEnd } from '../utils/dates.js';
import { generatePurchaseOrderPdf } from '../services/purchaseDocs.js';
import { priceFromMargin } from '../utils/pricing.js';
import { roundMoney } from '../utils/money.js';
import { hasPermission } from '../hub/permissions.js';
import { skuFields } from '../hub/catalog.js';
import { companyProfile } from '../hub/settings.js';

const router = Router();

const gen = (prefix) =>
  `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

// ─── List ──────────────────────────────────────────────────────────
router.get('/', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && !hasPermission(req.user, 'products')) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const where = {};
    if (req.query.supplierId) where.supplierId = parseInt(req.query.supplierId, 10);
    if (req.query.locationId) where.locationId = parseInt(req.query.locationId, 10);
    if (req.query.status) where.status = req.query.status;
    if (req.query.paymentStatus) where.paymentStatus = req.query.paymentStatus;
    if (req.query.from || req.query.to) {
      const from = req.query.from ? rangeStart(req.query.from) : new Date('1970-01-01');
      const to = req.query.to ? rangeEnd(req.query.to) : new Date('2999-12-31');
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
    if (req.user.role !== 'admin' && !hasPermission(req.user, 'products')) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const po = await PurchaseOrder.findByPk(req.params.id, {
      include: [
        { model: Supplier, attributes: ['id', 'name', 'code', 'phone', 'email', 'paymentTerms'] },
        { model: Location, attributes: ['id', 'name', 'code', 'address'] },
        { model: User, as: 'creator', attributes: ['id', 'name'] },
        { model: PurchaseReceipt, include: [{ model: User, as: 'receiver', attributes: ['id', 'name'] }] },
        { model: SupplierPayment, include: [{ model: User, as: 'payer', attributes: ['id', 'name'] }] },
        {
          model: PurchaseDocument,
          attributes: { exclude: ['storedName'] },
          include: [{ model: User, as: 'uploader', attributes: ['id', 'name'] }],
        },
      ],
      order: [[PurchaseDocument, 'createdAt', 'ASC']],
    });
    if (!po) return res.status(404).json({ message: 'PO not found' });
    const out = po.toJSON();
    out.items = await withSkuDetails(out.items);
    res.json(out);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── PDF (opens in the browser to print or save) ───────────────────
router.get('/:id/pdf', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && !hasPermission(req.user, 'products')) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const po = await PurchaseOrder.findByPk(req.params.id, {
      include: [
        { model: Supplier },
        { model: Location, attributes: ['id', 'name', 'code', 'address'] },
        { model: User, as: 'creator', attributes: ['id', 'name'] },
        { model: SupplierPayment },
      ],
    });
    if (!po) return res.status(404).json({ message: 'PO not found' });
    const data = po.toJSON();
    data.items = await withSkuDetails(data.items);
    const pdf = await generatePurchaseOrderPdf(data, await companyProfile());
    // ?download=1 saves the file; otherwise it opens in the browser to view / print.
    const disposition = req.query.download ? 'attachment' : 'inline';
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${disposition}; filename="${po.poNumber}.pdf"`,
      'Content-Length': pdf.length,
    });
    res.send(pdf);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Supplier currency ─────────────────────────────────────────────
const baseCurrency = () => (process.env.CURRENCY_CODE || 'QAR').toUpperCase();
const BASE_FX = { currency: null, rate: 1 };

/**
 * The PO's invoice currency and rate from the body, falling back to what the
 * PO already has. The store's own currency is stored as null (rate 1).
 */
function resolveCurrency(body, po = null) {
  const raw = body.currency !== undefined ? body.currency : po?.currency;
  const code = String(raw || '').trim().toUpperCase();
  if (!code || code === baseCurrency()) return BASE_FX;
  if (!/^[A-Z]{3}$/.test(code)) throw new Error('Currency must be a 3-letter code such as AED');
  const rate = parseFloat(body.exchangeRate !== undefined ? body.exchangeRate : po?.exchangeRate);
  if (!(rate > 0)) throw new Error(`Enter the exchange rate: how many ${baseCurrency()} for 1 ${code}`);
  return { currency: code, rate: +rate.toFixed(6) };
}

/** Discount in the store's currency, plus the invoice-currency figure it came from. */
function discountOf(body, fx, po = null) {
  if (!fx.currency) {
    const discount = parseFloat(body.discount !== undefined ? body.discount : po?.discount) || 0;
    return { discount, foreignDiscount: null };
  }
  const raw = body.foreignDiscount !== undefined ? body.foreignDiscount : po?.foreignDiscount;
  const foreignDiscount = parseFloat(raw) || 0;
  return { discount: +(foreignDiscount * fx.rate).toFixed(3), foreignDiscount };
}

// ─── Helpers for items shape ───────────────────────────────────────
// With a foreign-currency PO each line's cost arrives as foreignUnitCost and
// unitCost becomes its store-currency value, so everything downstream (tax,
// landed cost, costPrice on receive) keeps working in the store's currency.
function normalizeItems(items, fx = BASE_FX) {
  if (!Array.isArray(items)) throw new Error('items[] required');
  if (items.length === 0) throw new Error('At least one item is required');
  return items.map((it) => {
    const productId = parseInt(it.productId, 10);
    if (!productId) throw new Error('Each item needs productId');
    const orderedQty = parseInt(it.orderedQty ?? it.quantity, 10);
    if (!orderedQty || orderedQty < 1) throw new Error('Quantity must be > 0');
    const foreignUnitCost = fx.currency ? parseFloat(it.foreignUnitCost) || 0 : null;
    const unitCost = fx.currency ? +(foreignUnitCost * fx.rate).toFixed(6) : parseFloat(it.unitCost) || 0;
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
      ...(fx.currency && { foreignUnitCost }),
      taxRate,
      lineTotal: +(lineSubtotal + lineTax).toFixed(3),
    };
  });
}

/** Product Code, size and colour for each line, read live (older POs never stored them). */
async function withSkuDetails(items) {
  const list = Array.isArray(items) ? items : [];
  const ids = [...new Set(list.map((i) => i.productId).filter(Boolean))];
  const products = ids.length ? await Product.findAll({ where: { id: ids } }) : [];
  const byId = new Map(products.map((p) => [p.id, p]));
  return list.map((it) => {
    const p = byId.get(it.productId);
    if (!p) return it;
    const vi = it.variantIndex ?? null;
    if (vi !== null && !p.variants?.[vi]) return it;
    const f = skuFields(p, vi);
    return { ...it, sku: it.sku || f.sku, productCode: f.productCode || null, size: f.size || null, color: f.color || null };
  });
}

// Optional references, terms and transport details — never required.
const DETAIL_FIELDS = {
  supplierReference: 80, supplierInvoiceNo: 80, paymentTerms: 120,
  transportMode: 40, carrier: 120, trackingNumber: 120, transportNotes: 2000,
};
function detailUpdates(body) {
  const out = {};
  for (const [field, max] of Object.entries(DETAIL_FIELDS)) {
    if (body[field] !== undefined) out[field] = String(body[field] ?? '').trim().slice(0, max) || null;
  }
  if (body.dispatchDate !== undefined) {
    const d = String(body.dispatchDate || '').slice(0, 10);
    out.dispatchDate = /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
  }
  return out;
}

// Shipment batch — set while the PO is editable, then frozen: receipts stamp it
// onto their stock movements, so changing it afterwards would split the batch.
function batchUpdates(body) {
  const out = {};
  for (const field of ['batchNumber', 'sourceCountry']) {
    if (body[field] !== undefined) out[field] = String(body[field] ?? '').trim().slice(0, 80) || null;
  }
  return out;
}

function computeTotals(items, shippingCost = 0, discount = 0, otherCharges = 0) {
  const subtotal = items.reduce((s, i) => s + (i.unitCost * i.orderedQty), 0);
  const taxAmount = items.reduce((s, i) => s + (i.unitCost * i.orderedQty * (i.taxRate / 100)), 0);
  const totalAmount = subtotal + taxAmount + parseFloat(shippingCost || 0) + parseFloat(otherCharges || 0) - parseFloat(discount || 0);
  return {
    subtotal: +subtotal.toFixed(3),
    taxAmount: +taxAmount.toFixed(3),
    // Payable amount at the currency's precision: a 3dp total (e.g. 26.154)
    // left 0.004 "outstanding" after paying the 26.15 shown, and receiving
    // refuses anything not paid in full.
    totalAmount: roundMoney(totalAmount),
  };
}

// Allocate shipping cost and the supplier's discount across lines by line
// value (qty × unitCost) and add them to each line's per-line tax to produce
// a landed unit cost. The landed unit cost is what hits Product.costPrice on
// receive so cost-of-goods reports reflect the true price paid per unit —
// without the discount share, a discounted order overstated every cost.
function applyLandedCost(items, shippingCost = 0, discount = 0) {
  const shipping = parseFloat(shippingCost) || 0;
  const disc = parseFloat(discount) || 0;
  const subtotal = items.reduce((s, i) => s + (i.unitCost * i.orderedQty), 0);
  for (const it of items) {
    const lineValue = it.unitCost * it.orderedQty;
    const lineTax = lineValue * (it.taxRate / 100);
    const lineShipping = subtotal > 0 ? (shipping * lineValue / subtotal) : 0;
    const lineDiscount = subtotal > 0 ? (disc * lineValue / subtotal) : 0;
    const landedTotal = Math.max(0, lineValue + lineTax + lineShipping - lineDiscount);
    const qty = it.orderedQty > 0 ? it.orderedQty : 1;
    it.shippingShare = +lineShipping.toFixed(3);
    it.discountShare = +lineDiscount.toFixed(3);
    it.landedLineTotal = +landedTotal.toFixed(3);
    // 6dp to match Product.costPrice DECIMAL(12,6): raw materials are costed
    // per gram, and rounding their landed cost to 3dp zeroed it.
    it.landedUnitCost = +(landedTotal / qty).toFixed(6);
  }
  return items;
}

// ─── Create ────────────────────────────────────────────────────────
router.post('/', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && !hasPermission(req.user, 'products')) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const { supplierId, locationId, items, status, notes, expectedDate, shippingCost = 0, otherCharges = 0 } = req.body;
    if (!supplierId || !locationId) {
      return res.status(400).json({ message: 'supplierId and locationId required' });
    }
    if ((parseFloat(otherCharges) || 0) < 0) return res.status(400).json({ message: 'Other charges cannot be negative' });
    const fx = resolveCurrency(req.body);
    const { discount, foreignDiscount } = discountOf(req.body, fx);
    const normalized = normalizeItems(items, fx);
    const totals = computeTotals(normalized, shippingCost, discount, otherCharges);
    applyLandedCost(normalized, (parseFloat(shippingCost) || 0) + (parseFloat(otherCharges) || 0), discount);

    // Enrich names from Product table if not supplied.
    const productIds = [...new Set(normalized.map((i) => i.productId))];
    const products = await Product.findAll({ where: { id: productIds }, attributes: ['id', 'name'] });
    if (products.length !== productIds.length) {
      return res.status(400).json({ message: 'One or more products on this PO do not exist' });
    }
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
      otherCharges: parseFloat(otherCharges) || 0,
      discount,
      currency: fx.currency,
      exchangeRate: fx.currency ? fx.rate : null,
      foreignDiscount,
      status: status === 'sent' ? 'sent' : 'draft',
      paymentStatus: 'unpaid',
      expectedDate: expectedDate || null,
      notes: notes?.trim() || null,
      ...detailUpdates(req.body),
      ...batchUpdates(req.body),
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
    if (req.user.role !== 'admin' && !hasPermission(req.user, 'products')) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const po = await PurchaseOrder.findByPk(req.params.id);
    if (!po) return res.status(404).json({ message: 'PO not found' });
    if (!['draft', 'sent'].includes(po.status)) {
      return res.status(400).json({ message: 'Cannot edit a PO with received goods' });
    }
    const {
      items, supplierId, locationId, notes, expectedDate,
      shippingCost = po.shippingCost, otherCharges = po.otherCharges,
    } = req.body;
    if ((parseFloat(otherCharges) || 0) < 0) return res.status(400).json({ message: 'Other charges cannot be negative' });
    const fx = resolveCurrency(req.body, po);
    const fxChanged = fx.currency !== (po.currency || null)
      || (fx.currency && fx.rate !== parseFloat(po.exchangeRate));
    // Line costs are entered in the invoice currency, so a currency or rate
    // change has to come with the lines it applies to.
    if (fxChanged && !items) {
      return res.status(400).json({ message: 'Send the order lines along with a currency or exchange-rate change' });
    }
    const { discount, foreignDiscount } = discountOf(req.body, fx, po);
    const landedExtras = (parseFloat(shippingCost) || 0) + (parseFloat(otherCharges) || 0);
    const updates = {
      ...detailUpdates(req.body),
      ...batchUpdates(req.body),
      currency: fx.currency,
      exchangeRate: fx.currency ? fx.rate : null,
      foreignDiscount,
    };
    if (items) {
      const normalized = normalizeItems(items, fx);
      const ids = [...new Set(normalized.map((i) => i.productId))];
      if (await Product.count({ where: { id: ids } }) !== ids.length) {
        return res.status(400).json({ message: 'One or more products on this PO do not exist' });
      }
      const totals = computeTotals(normalized, shippingCost, discount, otherCharges);
      applyLandedCost(normalized, landedExtras, discount);
      Object.assign(updates, { items: normalized, ...totals });
    } else if (
      // Compare as numbers: Sequelize hands DECIMAL back as a string, so
      // `shippingCost !== po.shippingCost` was comparing 25 to "25.000"
      // and firing on virtually every edit.
      (parseFloat(shippingCost) || 0) !== (parseFloat(po.shippingCost) || 0)
      || (parseFloat(otherCharges) || 0) !== (parseFloat(po.otherCharges) || 0)
      || (parseFloat(discount) || 0) !== (parseFloat(po.discount) || 0)
    ) {
      // Shipping/discount changed but items didn't — re-distribute the
      // existing lines AND recompute the header. Previously only the
      // lines were re-landed, so totalAmount kept the old shipping.
      const existing = [...(po.items || [])];
      const totals = computeTotals(existing, shippingCost, discount, otherCharges);
      applyLandedCost(existing, landedExtras, discount);
      Object.assign(updates, { items: existing, ...totals });
    }
    if (supplierId) updates.supplierId = parseInt(supplierId, 10);
    if (locationId) updates.locationId = parseInt(locationId, 10);
    if (notes !== undefined) updates.notes = notes?.trim() || null;
    if (expectedDate !== undefined) updates.expectedDate = expectedDate || null;
    if (shippingCost !== undefined) updates.shippingCost = parseFloat(shippingCost) || 0;
    if (otherCharges !== undefined) updates.otherCharges = parseFloat(otherCharges) || 0;
    updates.discount = discount;
    // "Save & send" from the editor sends a draft; a sent PO never goes back to draft.
    if (req.body.status === 'sent' && po.status === 'draft') updates.status = 'sent';
    // Payments may already exist against a draft/sent PO — keep them consistent.
    if (updates.totalAmount !== undefined) {
      const paid = parseFloat(po.amountPaid) || 0;
      if (updates.totalAmount < paid) {
        return res.status(400).json({ message: `New total ${updates.totalAmount.toFixed(3)} is below the ${paid.toFixed(3)} already paid` });
      }
      updates.paymentStatus = paid >= updates.totalAmount && paid > 0 ? 'paid' : (paid > 0 ? 'partial' : 'unpaid');
    }
    await po.update(updates);
    res.json(po);
  } catch (err) {
    console.error('[po/update]', err);
    res.status(400).json({ message: err.message });
  }
});

// ─── References & transport (any time but cancelled; never costs or stock) ──
router.patch('/:id/details', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && !hasPermission(req.user, 'products')) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const po = await PurchaseOrder.findByPk(req.params.id);
    if (!po) return res.status(404).json({ message: 'PO not found' });
    if (po.status === 'cancelled') return res.status(400).json({ message: 'A cancelled PO cannot be changed' });
    const updates = detailUpdates(req.body || {});
    if (req.body?.notes !== undefined) updates.notes = String(req.body.notes ?? '').trim() || null;
    await po.update(updates);
    res.json(po);
  } catch (err) {
    console.error('[po/details]', err);
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
  if (req.user.role !== 'admin' && !hasPermission(req.user, 'products')) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  const t = await sequelize.transaction();
  try {
    const po = await PurchaseOrder.findByPk(req.params.id, {
      include: [{ model: Supplier, attributes: ['name'] }], transaction: t,
    });
    if (!po) { await t.rollback(); return res.status(404).json({ message: 'PO not found' }); }
    if (po.status === 'cancelled' || po.status === 'received') {
      await t.rollback();
      return res.status(400).json({ message: `Cannot receive a ${po.status} PO` });
    }

    // House rule: we take no supplier credit. Goods only enter stock once
    // the invoice is settled in full, so no payable can ever accrue.
    // Settle with POST /purchase-orders/:id/pay first.
    const owed = +((parseFloat(po.totalAmount) || 0) - (parseFloat(po.amountPaid) || 0)).toFixed(3);
    if (owed > 0.0005) {
      await t.rollback();
      return res.status(400).json({
        message: `Pay this PO in full before receiving — ${owed.toFixed(2)} outstanding of ${(parseFloat(po.totalAmount) || 0).toFixed(2)}`,
        requires: 'payment',
        outstanding: owed,
      });
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
    // pricing — admin can override manually on the product page), and its
    // selling price when the product has a margin %.
    for (const g of grnItems) {
      const existing = await ProductStock.findOne({
        where: { productId: g.productId, variantIndex: g.variantIndex, locationId: po.locationId },
        transaction: t,
      });
      // The stock-in movement carries the PO's supplier, invoice and batch,
      // so the hub's Stock In list and batch views show where it came from.
      await withStockContext({
        kind: 'stock_in',
        reference: `${po.poNumber} receipt`.slice(0, 80),
        unitCost: parseFloat(g.landedUnitCost ?? g.unitCost) || null,
        supplier: po.Supplier?.name || null,
        invoiceRef: po.supplierInvoiceNo || null,
        receivedBy: req.user.name || null,
        notes: notes?.trim() || null,
        batchNumber: po.batchNumber || null,
        sourceCountry: po.sourceCountry || null,
        createdBy: req.user.id,
      }, async () => {
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
      });
      // Use landed unit cost (unit cost + per-line tax + proportional
      // share of PO shipping) so costPrice reflects the true landed
      // price per unit.
      const cost = parseFloat(g.landedUnitCost ?? g.unitCost) || 0;
      if (cost > 0) {
        if (g.variantIndex == null) {
          // A product on margin pricing is repriced from the new landed cost.
          const prod = await Product.findByPk(g.productId, { attributes: ['id', 'marginPercent'], transaction: t });
          const price = priceFromMargin(cost, prod?.marginPercent);
          await Product.update({ costPrice: cost, ...(price != null && { price }) }, { where: { id: g.productId }, transaction: t });
        } else {
          // Write to the variant, not the whole product. Receiving one
          // variant used to overwrite costPrice for every variant, and
          // POS reads variant?.costPrice ?? product.costPrice — so
          // variant COGS silently drifted after any mixed receipt.
          const prod = await Product.findByPk(g.productId, {
            attributes: ['id', 'variants'], transaction: t,
          });
          const variants = Array.isArray(prod?.variants) ? [...prod.variants] : [];
          if (variants[g.variantIndex]) {
            variants[g.variantIndex] = { ...variants[g.variantIndex], costPrice: cost };
            await Product.update({ variants }, { where: { id: g.productId }, transaction: t });
          }
        }
      }
      // A product with no supplier yet is linked to the one it came from.
      await Product.update({ preferredSupplierId: po.supplierId }, {
        where: { id: g.productId, preferredSupplierId: null }, transaction: t,
      });
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
        requireFunds: true,
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

// ─── Documents (supplier invoice, packing list, AWB / B/L, customs…) ──
// Kept out of the public /uploads folder: invoices are business records, so
// they are only ever served through the authenticated route below.
const docsDir = path.join(path.dirname(uploadsDir), 'private-docs', 'purchase-orders');
try { fs.mkdirSync(docsDir, { recursive: true }); } catch { /* ignore */ }

const DOC_TYPES = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/heic': '.heic',
  'image/heif': '.heif',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-excel': '.xls',
  'text/csv': '.csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/msword': '.doc',
};
const INLINE_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

const docUpload = multer({
  storage: multer.diskStorage({
    destination: docsDir,
    filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + DOC_TYPES[file.mimetype]),
  }),
  fileFilter: (req, file, cb) => {
    if (DOC_TYPES[file.mimetype]) cb(null, true);
    else cb(new Error(`"${file.originalname}" is not a PDF, image, Excel, CSV or Word file`));
  },
  limits: { fileSize: 15 * 1024 * 1024, files: 10 },
});

const canSeePurchasing = (user) => user.role === 'admin' || hasPermission(user, 'products');

router.post('/:id/documents', protect, (req, res) => {
  if (!canSeePurchasing(req.user)) return res.status(403).json({ message: 'Forbidden' });
  docUpload.array('files', 10)(req, res, async (uploadErr) => {
    const files = req.files || [];
    const discard = () => files.forEach((f) => fs.unlink(f.path, () => {}));
    try {
      if (uploadErr) {
        discard();
        const message = uploadErr.code === 'LIMIT_FILE_SIZE' ? 'Each file must be 15 MB or smaller'
          : uploadErr.code === 'LIMIT_FILE_COUNT' ? 'Attach at most 10 files at a time'
            : uploadErr.message;
        return res.status(400).json({ message });
      }
      if (!files.length) return res.status(400).json({ message: 'Choose at least one file' });
      const po = await PurchaseOrder.findByPk(req.params.id, { attributes: ['id'] });
      if (!po) { discard(); return res.status(404).json({ message: 'PO not found' }); }
      const docType = PO_DOC_TYPES.includes(req.body.docType) ? req.body.docType : 'other';
      const notes = String(req.body.notes || '').trim().slice(0, 200) || null;
      const docs = await PurchaseDocument.bulkCreate(files.map((f) => ({
        purchaseOrderId: po.id,
        docType,
        // multer hands the name over as latin1; Arabic / accented names need this.
        fileName: Buffer.from(f.originalname, 'latin1').toString('utf8').slice(0, 255),
        storedName: f.filename,
        mimeType: f.mimetype,
        size: f.size,
        notes,
        uploadedBy: req.user.id,
      })));
      res.status(201).json(docs.map((d) => ({ ...d.toJSON(), storedName: undefined })));
    } catch (err) {
      discard();
      console.error('[po/documents]', err);
      res.status(500).json({ message: err.message });
    }
  });
});

router.get('/:id/documents/:docId', protect, async (req, res) => {
  try {
    if (!canSeePurchasing(req.user)) return res.status(403).json({ message: 'Forbidden' });
    const doc = await PurchaseDocument.findOne({ where: { id: req.params.docId, purchaseOrderId: req.params.id } });
    if (!doc) return res.status(404).json({ message: 'Document not found' });
    const file = path.join(docsDir, path.basename(doc.storedName));
    if (!fs.existsSync(file)) return res.status(404).json({ message: 'The file is missing on the server' });
    const inline = !req.query.download && INLINE_TYPES.has(doc.mimeType);
    res.set({
      'Content-Type': doc.mimeType,
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    });
    res.sendFile(file);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/:id/documents/:docId', protect, async (req, res) => {
  try {
    if (!canSeePurchasing(req.user)) return res.status(403).json({ message: 'Forbidden' });
    const doc = await PurchaseDocument.findOne({ where: { id: req.params.docId, purchaseOrderId: req.params.id } });
    if (!doc) return res.status(404).json({ message: 'Document not found' });
    // Staff can take back their own upload; anything else is the admin's call.
    if (req.user.role !== 'admin' && doc.uploadedBy !== req.user.id) {
      return res.status(403).json({ message: 'Only an admin can remove a document someone else attached' });
    }
    await doc.destroy();
    fs.unlink(path.join(docsDir, path.basename(doc.storedName)), () => {});
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
