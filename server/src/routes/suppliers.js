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
 *
 * Balance formula (simple ledger):
 *   balance = openingBalance
 *           + Σ PO totalAmount (status ≠ cancelled)
 *           − Σ payments
 *           − Σ purchase returns (refundMethod = credit_note OR cash/bank)
 */
import { Router } from 'express';
import { Op } from 'sequelize';
import {
  Supplier, PurchaseOrder, PurchaseReturn, SupplierPayment,
} from '../models/index.js';
import { protect, admin } from '../middleware/auth.js';

const router = Router();

async function computeBalance(supplierId) {
  const supplier = await Supplier.findByPk(supplierId, { attributes: ['openingBalance'] });
  if (!supplier) return 0;
  const [poSum, paySum, returnSum] = await Promise.all([
    PurchaseOrder.sum('totalAmount', {
      where: { supplierId, status: { [Op.ne]: 'cancelled' } },
    }),
    SupplierPayment.sum('amount', { where: { supplierId } }),
    PurchaseReturn.sum('totalAmount', {
      where: { supplierId, status: 'completed' },
    }),
  ]);
  return +((parseFloat(supplier.openingBalance) || 0)
    + (poSum || 0) - (paySum || 0) - (returnSum || 0)).toFixed(3);
}

router.get('/', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && !(req.user.permissions || []).includes('products')) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const where = {};
    if (req.query.active === 'true') where.active = true;
    if (req.query.active === 'false') where.active = false;
    if (req.query.search) where.name = { [Op.like]: `%${req.query.search}%` };
    const rows = await Supplier.findAll({ where, order: [['name', 'ASC']] });
    res.json(rows);
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
router.get('/:id/statement', protect, async (req, res) => {
  try {
    const supplier = await Supplier.findByPk(req.params.id);
    if (!supplier) return res.status(404).json({ message: 'Supplier not found' });

    const where = { supplierId: supplier.id };
    if (req.query.from || req.query.to) {
      const from = req.query.from ? new Date(req.query.from) : new Date('1970-01-01');
      const to = req.query.to ? new Date(req.query.to) : new Date('2999-12-31');
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
      if (p.status === 'cancelled') continue;
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
