/**
 * Purchase Return modals — editor + detail.
 *
 * The editor lets you optionally pick a PurchaseOrder to pre-populate
 * the line items at their PO unit cost, or build an ad-hoc return from
 * scratch by searching products. Stock is validated server-side at
 * the chosen Location.
 */
import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import ProductSearchPicker from './ProductSearchPicker';
import { CURRENCY_DECIMALS } from '../../utils/currency';

export default function PurchaseReturnModals({
  prForm, setPrForm, prDetail, setPrDetail,
  suppliers, locations, products, currency, isAdmin, refresh,
}) {
  return (
    <>
      {prForm && (
        <PrEditor form={prForm} setForm={setPrForm} suppliers={suppliers} locations={locations} products={products}
          currency={currency} onSaved={() => { setPrForm(null); refresh(); }} />
      )}
      {prDetail && (
        <PrDetail row={prDetail} currency={currency} isAdmin={isAdmin}
          onClose={() => setPrDetail(null)}
          onCancel={async () => {
            if (!confirm('Cancel this purchase return? Stock will be added back at the location.')) return;
            try { await api.post(`/purchase-returns/${prDetail.id}/cancel`); toast.success('Cancelled'); setPrDetail(null); refresh(); }
            catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
          }} />
      )}
    </>
  );
}

function PrEditor({ form, setForm, suppliers, locations, products, currency, onSaved }) {
  const [poList, setPoList] = useState([]);
  const fmt = (n) => `${currency}${(parseFloat(n) || 0).toFixed(CURRENCY_DECIMALS)}`;

  // When supplier changes, load their received POs as a pick-source.
  useEffect(() => {
    if (!form.supplierId) return;
    api.get('/purchase-orders', { params: { supplierId: form.supplierId } })
      .then((res) => setPoList((res.data || []).filter((p) => p.status === 'partial' || p.status === 'received')))
      .catch(() => {});
  }, [form.supplierId]);

  // Keyboard flow as on the PO editor: pick in search → that line's Qty takes
  // focus (selected) → Tab to cost → Enter returns to search.
  const searchRef = useRef(null);
  const qtyRefs = useRef([]);
  const focusLine = useRef(null);
  useEffect(() => {
    if (focusLine.current == null) return;
    qtyRefs.current[focusLine.current]?.focus();
    qtyRefs.current[focusLine.current]?.select();
    focusLine.current = null;
  }, [form.items]);
  const onLineKey = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); searchRef.current?.focus(); }
  };

  const loadFromPo = (poId) => {
    if (!poId) { setForm({ ...form, purchaseOrderId: '' }); return; }
    api.get(`/purchase-orders/${poId}`).then(({ data }) => {
      const items = (data.items || []).map((l) => ({
        productId: l.productId, variantIndex: l.variantIndex,
        name: l.name, quantity: 0, unitCost: l.unitCost,
      }));
      setForm({ ...form, purchaseOrderId: poId, locationId: data.locationId, items });
    });
  };

  const addProductLine = (p, variantIndex = null, { scanned } = {}) => {
    const variant = variantIndex != null && Array.isArray(p.variants) ? p.variants[variantIndex] : null;
    const name = p.name + (variant ? ` (${Object.values(variant.options || {}).join('/')})` : '');
    const existing = (form.items || []).findIndex((l) => l.productId === p.id && (l.variantIndex ?? null) === (variantIndex ?? null));
    // A scan stays in the search box for the next scan instead of jumping to Qty.
    if (!scanned) focusLine.current = existing >= 0 ? existing : (form.items || []).length;
    if (existing >= 0) {
      const next = [...form.items];
      next[existing] = { ...next[existing], quantity: (parseInt(next[existing].quantity, 10) || 0) + 1 };
      setForm({ ...form, items: next });
    } else {
      setForm({
        ...form,
        items: [...(form.items || []), {
          productId: p.id, variantIndex, name,
          // Goods go back at what they cost us, not their retail price.
          quantity: 1, unitCost: parseFloat(p.costPrice) > 0 ? parseFloat(p.costPrice) : '',
        }],
      });
    }
  };

  const setLine = (i, patch) => {
    const next = [...form.items];
    next[i] = { ...next[i], ...patch };
    setForm({ ...form, items: next });
  };
  const removeLine = (i) => setForm({ ...form, items: form.items.filter((_, idx) => idx !== i) });

  const total = (form.items || []).reduce((s, l) => s + (parseFloat(l.unitCost) || 0) * (parseInt(l.quantity, 10) || 0), 0);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.supplierId || !form.locationId) { toast.error('Pick supplier + location'); return; }
    // Line fields hold the raw typed text while editing; parse here.
    const items = (form.items || []).filter((l) => (parseInt(l.quantity, 10) || 0) > 0);
    if (items.length === 0) { toast.error('Add at least one item with qty'); return; }
    try {
      await api.post('/purchase-returns', {
        supplierId: parseInt(form.supplierId, 10),
        locationId: parseInt(form.locationId, 10),
        purchaseOrderId: form.purchaseOrderId || null,
        items: items.map((l) => ({
          productId: l.productId, variantIndex: l.variantIndex,
          name: l.name, quantity: parseInt(l.quantity, 10), unitCost: parseFloat(l.unitCost) || 0,
        })),
        refundMethod: form.refundMethod,
        reason: form.reason,
        notes: form.notes,
      });
      toast.success('Purchase return created');
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    }
  };

  return (
    <div className="admin-form-overlay" onClick={(e) => { if (e.target === e.currentTarget) setForm(null); }}>
      <form className="admin-form" onSubmit={submit} style={{ maxWidth: 820 }}>
        <h3>New Purchase Return</h3>

        <div className="form-row">
          <div className="form-group"><label>Supplier *</label>
            <select value={form.supplierId} onChange={(e) => { setForm({ ...form, supplierId: e.target.value, purchaseOrderId: '', items: [] }); if (!e.target.value) setPoList([]); }} required>
              <option value="">— Select —</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="form-group"><label>From location *</label>
            <select value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })} required>
              <option value="">— Select —</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div className="form-group"><label>From PO (optional)</label>
            <select value={form.purchaseOrderId} onChange={(e) => loadFromPo(e.target.value)} disabled={!form.supplierId}>
              <option value="">— Ad-hoc return —</option>
              {poList.map((p) => <option key={p.id} value={p.id}>{p.poNumber}</option>)}
            </select>
          </div>
        </div>

        <ProductSearchPicker
          ref={searchRef}
          products={products}
          currency={currency}
          onPick={addProductLine}
          hint="↑ ↓ to choose · Enter to add · type the qty, Tab to cost · Enter to come back here"
        />

        <div className="admin-table-wrap" style={{ marginBottom: '0.75rem' }}>
          <table className="admin-table po-lines">
            <thead><tr><th>Item</th><th style={{ width: 96 }}>Qty</th><th style={{ width: 110 }}>Unit cost</th><th style={{ textAlign: 'right', width: 110 }}>Refund</th><th style={{ width: 40 }}></th></tr></thead>
            <tbody>
              {(form.items || []).length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-light)' }}>No items</td></tr>}
              {(form.items || []).map((l, i) => (
                <tr key={i}>
                  <td>{l.name}</td>
                  <td><input ref={(el) => { qtyRefs.current[i] = el; }} type="number" min={0} inputMode="numeric" value={l.quantity}
                    onChange={(e) => setLine(i, { quantity: e.target.value })} onKeyDown={onLineKey} style={{ width: '100%' }} /></td>
                  <td><input type="number" step="0.001" inputMode="decimal" value={l.unitCost}
                    onChange={(e) => setLine(i, { unitCost: e.target.value })} onKeyDown={onLineKey} style={{ width: '100%' }} /></td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt((parseFloat(l.unitCost) || 0) * (parseInt(l.quantity, 10) || 0))}</td>
                  <td><button type="button" className="icon-btn" onClick={() => removeLine(i)}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="form-row">
          <div className="form-group"><label>Refund method</label>
            <select value={form.refundMethod} onChange={(e) => setForm({ ...form, refundMethod: e.target.value })}>
              <option value="credit_note">Credit note (reduces AP)</option>
              <option value="cash">Cash refund</option>
              <option value="bank">Bank refund</option>
            </select>
          </div>
          <div className="form-group"><label>Reason</label>
            <input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="defective, over-shipped, etc" />
          </div>
        </div>
        <div className="form-group"><label>Notes</label>
          <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0', borderTop: '1px solid var(--border-light)' }}>
          <strong>Refund total</strong>
          <strong>{fmt(total)}</strong>
        </div>

        <div className="form-actions">
          <button type="submit" className="btn btn-primary">Create return</button>
          <button type="button" className="btn btn-secondary" onClick={() => setForm(null)}>Cancel</button>
        </div>
      </form>
    </div>
  );
}

function PrDetail({ row, currency, isAdmin, onClose, onCancel }) {
  const fmt = (n) => `${currency}${(parseFloat(n) || 0).toFixed(CURRENCY_DECIMALS)}`;
  return (
    <div className="admin-form-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="admin-form" style={{ maxWidth: 640 }}>
        <h3>Purchase Return {row.returnNumber}</h3>
        <div style={{ marginBottom: '1rem', fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
          <div>Supplier: <strong>{row.Supplier?.name}</strong></div>
          <div>Location: {row.Location?.name}</div>
          {row.PurchaseOrder && <div>Linked PO: {row.PurchaseOrder.poNumber}</div>}
          <div>Method: {row.refundMethod.replace('_', ' ')}</div>
          {row.reason && <div>Reason: {row.reason}</div>}
          {row.notes && <div>Notes: {row.notes}</div>}
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Item</th><th style={{ textAlign: 'right' }}>Qty</th><th style={{ textAlign: 'right' }}>Unit</th><th style={{ textAlign: 'right' }}>Refund</th></tr></thead>
            <tbody>
              {(row.items || []).map((it, i) => (
                <tr key={i}>
                  <td>{it.name}</td>
                  <td style={{ textAlign: 'right' }}>{it.quantity}</td>
                  <td style={{ textAlign: 'right' }}>{fmt(it.unitCost)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(it.refundAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0', borderTop: '1px solid var(--border-light)', marginTop: '0.5rem' }}>
          <strong>Total refunded</strong><strong>{fmt(row.totalAmount)}</strong>
        </div>
        <div className="form-actions" style={{ marginTop: '1rem' }}>
          <button className="btn btn-secondary" onClick={() => window.open(`${api.defaults.baseURL}/purchase-returns/${row.id}/pdf`, '_blank')}>Print / PDF</button>
          {isAdmin && row.status === 'completed' && <button className="btn btn-secondary" onClick={onCancel}>Cancel return</button>}
          <button className="btn btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
