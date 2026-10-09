/**
 * Supplier routes — vendor master CRUD plus computed balance/statement.
 *
 *   GET    /api/suppliers              list (?active=, ?search=)
 *   POST   /api/suppliers              create
 *   GET    /api/suppliers/:id          detail with current balance
 *   PUT    /api/suppliers/:id          update
 *   DELETE /api/suppliers/:id          soft-delete (active=false). Blocks
 *                                      if linked POs / payments exist.
 *   GET    /api/suppliers/:id/statement?from=&to=
 *                                      chronological list of POs, payments,
 *                                      returns with running balance.
 *   GET    /api/suppliers/:id/products?locationId=
 *                                      what this supplier supplies: products
 *                                      linked to it (Product.preferredSupplierId)
 *                                      or bought from it before, with stock,
 *                                      reorder level and last cost — the New PO
 *                                      form's quick-add list.
 *   POST   /api/suppliers/link-products
 *                                      set each product with no supplier to
 *                                      the one it was last bought from.
 *
 * Balance formula (simple ledger):
 *   balance = openingBalance
 *           + Σ PO totalAmount (status partial or received)
 *           − Σ payments
 *           − Σ purchase returns (refundMethod = credit_note OR cash/bank)
 */
import { Router } from 'express';
import { Op } from 'sequelize';
import {
  Supplier, PurchaseOrder, PurchaseReturn, SupplierPayment, Product, ProductStock,
} from '../models/index.js';
import { protect, admin } from '../middleware/auth.js';
import { rangeStart, rangeEnd } from '../utils/dates.js';
import { hasPermission } from '../hub/permissions.js';

const router = Router();

// Exported so the balance sheet reports the same payable figure the
// supplier screen shows.
//
// Every committed PO counts, not only received ones: the store extends no
// supplier credit (a PO is paid before it can be received — see
// purchaseOrders.js), so the payment usually lands before the goods. Counting
// only received POs would show every prepaid order as a supplier credit.
export async function computeBalance(supplierId) {
  const supplier = await Supplier.findByPk(supplierId, { attributes: ['openingBalance'] });
  if (!supplier) return 0;
  const [poSum, paySum, returnSum] = await Promise.all([
    // Only committed POs are payable. A draft is a shopping list, not an
    // obligation — counting it inflated the balance.
    PurchaseOrder.sum('totalAmount', {
      where: { supplierId, status: { [Op.notIn]: ['cancelled', 'draft'] } },
    }),
    SupplierPayment.sum('amount', { where: { supplierId } }),
    // Only a credit note reduces what we owe. A cash or bank refund already
    // came back as money in (see purchaseReturns.js), so subtracting it here
    // too would count the same refund twice.
    PurchaseReturn.sum('totalAmount', {
      where: { supplierId, status: 'completed', refundMethod: 'credit_note' },
    }),
  ]);
  return +((parseFloat(supplier.openingBalance) || 0)
    + (poSum || 0) - (paySum || 0) - (returnSum || 0)).toFixed(3);
}

router.get('/', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && !hasPermission(req.user, 'products')) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const where = {};
    if (req.query.active === 'true') where.active = true;
    if (req.query.active === 'false') where.active = false;
    if (req.query.search) where.name = { [Op.like]: `%${req.query.search}%` };
    const rows = await Supplier.findAll({ where, order: [['name', 'ASC']] });
    // How many products each supplier is linked to, for the list's column.
    const counts = await Product.count({
      where: { preferredSupplierId: { [Op.ne]: null } }, group: ['preferredSupplierId'],
    });
    const countBy = new Map(counts.map((c) => [c.preferredSupplierId, c.count]));
    res.json(rows.map((s) => ({ ...s.toJSON(), productCount: countBy.get(s.id) || 0 })));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', protect, admin, async (req, res) => {
  try {
    const body = { ...req.body };
    delete body.id; delete body.createdAt; delete body.updatedAt;
    const row = await Supplier.create(body);
    res.status(201).json(row);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.get('/:id', protect, async (req, res) => {
  try {
    const row = await Supplier.findByPk(req.params.id);
    if (!row) return res.status(404).json({ message: 'Supplier not found' });
    const balance = await computeBalance(row.id);
    res.json({ ...row.toJSON(), balance });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/:id', protect, admin, async (req, res) => {
  try {
    const row = await Supplier.findByPk(req.params.id);
    if (!row) return res.status(404).json({ message: 'Supplier not found' });
    const body = { ...req.body };
    delete body.id; delete body.createdAt; delete body.updatedAt;
    await row.update(body);
    res.json(row);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.delete('/:id', protect, admin, async (req, res) => {
  try {
    const row = await Supplier.findByPk(req.params.id);
    if (!row) return res.status(404).json({ message: 'Supplier not found' });
    // If any non-cancelled history exists, soft-delete only.
    const hasHistory = await PurchaseOrder.count({ where: { supplierId: row.id } });
    if (hasHistory > 0) {
      await row.update({ active: false });
      return res.json({ ok: true, softDeleted: true });
    }
    await row.destroy();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Statement ─────────────────────────────────────────────────────
const canPurchase = (req) => req.user.role === 'admin' || hasPermission(req.user, 'products');

// Lines of goods actually bought (partly or fully received POs), oldest
// first, so later rows win when collapsing to "last bought".
async function boughtLines(where = {}) {
  const pos = await PurchaseOrder.findAll({
    where: { ...where, status: { [Op.in]: PAYABLE_PO_STATUSES } },
    attributes: ['id', 'supplierId', 'items', 'receivedDate', 'createdAt'],
    order: [['createdAt', 'ASC'], ['id', 'ASC']],
  });
  return pos.flatMap((po) => (Array.isArray(po.items) ? po.items : []).map((l) => ({
    supplierId: po.supplierId,
    productId: l.productId,
    variantIndex: l.variantIndex ?? null,
    unitCost: parseFloat(l.unitCost) || 0,
    at: po.receivedDate || po.createdAt,
  })));
}

router.post('/link-products', protect, admin, async (req, res) => {
  try {
    if (!canPurchase(req)) return res.status(403).json({ message: 'Forbidden' });
    const last = new Map();   // productId -> supplierId it was last bought from
    for (const l of await boughtLines()) if (l.productId) last.set(l.productId, l.supplierId);
    // Only products with no supplier yet — one picked by hand is kept.
    const bySupplier = new Map();
    for (const [productId, supplierId] of last) {
      if (!bySupplier.has(supplierId)) bySupplier.set(supplierId, []);
      bySupplier.get(supplierId).push(productId);
    }
    let linked = 0;
    for (const [supplierId, ids] of bySupplier) {
      const [n] = await Product.update({ preferredSupplierId: supplierId }, { where: { id: ids, preferredSupplierId: null } });
      linked += n;
    }
    const withSupplier = await Product.count({ where: { preferredSupplierId: { [Op.ne]: null } } });
    const total = await Product.count();
    res.json({ linked, withSupplier, withoutSupplier: Math.max(0, total - withSupplier) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/:id/products', protect, async (req, res) => {
  try {
    if (!canPurchase(req)) return res.status(403).json({ message: 'Forbidden' });
    const supplierId = parseInt(req.params.id, 10);
    const key = (pid, v) => `${pid}:${v ?? 'b'}`;
    const rows = new Map();   // product/variant -> history from this supplier
    for (const l of await boughtLines({ supplierId })) {
      if (!l.productId) continue;
      const r = rows.get(key(l.productId, l.variantIndex)) || { productId: l.productId, variantIndex: l.variantIndex, timesBought: 0 };
      r.timesBought += 1;
      r.lastCost = l.unitCost;
      r.lastBoughtAt = l.at;
      rows.set(key(l.productId, l.variantIndex), r);
    }
    // Linked but never bought from it (set by hand on the product form).
    const linked = await Product.findAll({ where: { preferredSupplierId: supplierId }, attributes: ['id'] });
    for (const p of linked) {
      if (![...rows.values()].some((r) => r.productId === p.id)) {
        rows.set(key(p.id, null), { productId: p.id, variantIndex: null, timesBought: 0, lastCost: null, lastBoughtAt: null });
      }
    }
    const ids = [...new Set([...rows.values()].map((r) => r.productId))];
    const products = new Map((await Product.findAll({
      where: { id: ids, active: true },
      attributes: ['id', 'name', 'code', 'barcode', 'variants', 'costPrice', 'stock', 'reorderLevel', 'reorderQty', 'preferredSupplierId'],
    })).map((p) => [p.id, p]));
    const locationId = req.query.locationId ? parseInt(req.query.locationId, 10) : null;
    const stockAt = locationId
      ? new Map((await ProductStock.findAll({ where: { productId: ids, locationId }, attributes: ['productId', 'variantIndex', 'quantity'] }))
        .map((s) => [key(s.productId, s.variantIndex), s.quantity]))
      : null;
    const out = [];
    for (const r of rows.values()) {
      const p = products.get(r.productId);
      if (!p) continue;   // deleted / inactive
      const variant = r.variantIndex != null && Array.isArray(p.variants) ? p.variants[r.variantIndex] : null;
      out.push({
        ...r,
        name: p.name + (variant ? ` (${Object.values(variant.options || {}).join('/')})` : ''),
        code: variant?.sku || p.code,
        barcode: variant?.barcode || p.barcode,
        costPrice: parseFloat(p.costPrice) || 0,
        stock: stockAt ? (stockAt.get(key(r.productId, r.variantIndex)) || 0) : (p.stock || 0),
        reorderLevel: p.reorderLevel,
        reorderQty: p.reorderQty,
        preferred: p.preferredSupplierId === supplierId,
      });
    }
    out.sort((a, b) => new Date(b.lastBoughtAt || 0) - new Date(a.lastBoughtAt || 0) || a.name.localeCompare(b.name));
    res.json(out);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/:id/statement', protect, async (req, res) => {
  try {
    const supplier = await Supplier.findByPk(req.params.id);
    if (!supplier) return res.status(404).json({ message: 'Supplier not found' });

    const where = { supplierId: supplier.id };
    if (req.query.from || req.query.to) {
      const from = req.query.from ? rangeStart(req.query.from) : new Date('1970-01-01');
      const to = req.query.to ? rangeEnd(req.query.to) : new Date('2999-12-31');
      where.createdAt = { [Op.between]: [from, to] };
    }

    const [pos, pays, rets] = await Promise.all([
      PurchaseOrder.findAll({ where, attributes: ['id', 'poNumber', 'totalAmount', 'status', 'createdAt'] }),
      SupplierPayment.findAll({ where: { supplierId: supplier.id, ...(where.createdAt ? { paidAt: where.createdAt } : {}) }, attributes: ['id', 'paymentNumber', 'amount', 'paymentMethod', 'reference', 'paidAt'] }),
      PurchaseReturn.findAll({ where: { ...where, status: 'completed' }, attributes: ['id', 'returnNumber', 'totalAmount', 'refundMethod', 'createdAt'] }),
    ]);

    // Merge into a single chronological array, compute running balance.
    const entries = [];
    for (const p of pos) {
      if (!PAYABLE_PO_STATUSES.includes(p.status)) continue;
      entries.push({ type: 'po', id: p.id, ref: p.poNumber, date: p.createdAt, debit: parseFloat(p.totalAmount), credit: 0, meta: { status: p.status } });
    }
    for (const p of pays) {
      entries.push({ type: 'payment', id: p.id, ref: p.paymentNumber, date: p.paidAt, debit: 0, credit: parseFloat(p.amount), meta: { method: p.paymentMethod, reference: p.reference } });
    }
    for (const r of rets) {
      entries.push({ type: 'return', id: r.id, ref: r.returnNumber, date: r.createdAt, debit: 0, credit: parseFloat(r.totalAmount), meta: { method: r.refundMethod } });
    }
    entries.sort((a, b) => new Date(a.date) - new Date(b.date));

    let running = parseFloat(supplier.openingBalance) || 0;
    for (const e of entries) {
      running += e.debit - e.credit;
      e.balance = +running.toFixed(3);
    }

    res.json({
      supplier,
      openingBalance: parseFloat(supplier.openingBalance) || 0,
      closingBalance: +running.toFixed(3),
      entries,
    });
  } catch (err) {
    console.error('[suppliers/statement]', err);
    res.status(500).json({ message: err.message });
  }
});

export default router;
