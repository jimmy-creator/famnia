/**
 * Purchase Order modals — editor, detail, receive (GRN), pay.
 *
 * Sub-component of the admin "Purchase Orders" tab. Pulled into its own
 * file because the four modals plus the line-item picker would otherwise
 * dwarf the rest of Admin.jsx.
 *
 * Props are state from the parent Admin component so opening/closing
 * stays controlled at the top level.
 */
import { useState, useMemo, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/axios';

export default function PoModals({
  poForm, setPoForm, poDetail, setPoDetail,
  receiveForm, setReceiveForm, payForm, setPayForm,
  suppliers, locations, products, currency, refresh,
}) {
  return (
    <>
      {poForm && (
        <PoEditor form={poForm} setForm={setPoForm} suppliers={suppliers} locations={locations} products={products} currency={currency} onSaved={() => { setPoForm(null); refresh(); }} />
      )}
      {poDetail && (
        <PoDetail po={poDetail} currency={currency}
          onClose={() => setPoDetail(null)}
          onReceive={() => setReceiveForm({ poId: poDetail.id, items: (poDetail.items || []).map((it) => ({ ...it, receiveQty: (it.orderedQty || 0) - (it.receivedQty || 0) })) })}
          onPay={() => setPayForm({ poId: poDetail.id, amount: +((parseFloat(poDetail.totalAmount) - parseFloat(poDetail.amountPaid || 0)).toFixed(3)), paymentMethod: 'cash', reference: '', notes: '' })}
          onSend={async () => {
            try { await api.post(`/purchase-orders/${poDetail.id}/send`); toast.success('Marked sent'); setPoDetail(null); refresh(); }
            catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
          }}
          onCancel={async () => {
            if (!confirm('Cancel this PO?')) return;
            try { await api.post(`/purchase-orders/${poDetail.id}/cancel`); toast.success('Cancelled'); setPoDetail(null); refresh(); }
            catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
          }}
        />
      )}
      {receiveForm && (
        <ReceiveModal form={receiveForm} setForm={setReceiveForm} currency={currency}
          onDone={() => { setReceiveForm(null); refresh(); if (poDetail) api.get(`/purchase-orders/${poDetail.id}`).then((r) => setPoDetail(r.data)); }} />
      )}
      {payForm && (
        <PayModal form={payForm} setForm={setPayForm} currency={currency}
          onDone={() => { setPayForm(null); refresh(); if (poDetail) api.get(`/purchase-orders/${poDetail.id}`).then((r) => setPoDetail(r.data)); }} />
      )}
    </>
  );
}

// ─── PO Editor (new / edit) ────────────────────────────────────────
function PoEditor({ form, setForm, suppliers, locations, products, currency, onSaved }) {
  const [search, setSearch] = useState('');
  const fmt = (n) => `${currency}${(parseFloat(n) || 0).toFixed(3)}`;

  const searchHits = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return (products || []).filter((p) =>
      p.name?.toLowerCase().includes(q) || p.code?.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [search, products]);

  const addProductLine = (p, variantIndex = null) => {
    const variant = variantIndex != null && Array.isArray(p.variants) ? p.variants[variantIndex] : null;
    const name = p.name + (variant ? ` (${Object.values(variant.options || {}).join('/')})` : '');
    const existing = (form.items || []).findIndex((l) => l.productId === p.id && (l.variantIndex ?? null) === (variantIndex ?? null));
    if (existing >= 0) {
      const next = [...form.items];
      next[existing] = { ...next[existing], orderedQty: (next[existing].orderedQty || 0) + 1 };
      setForm({ ...form, items: next });
    } else {
      setForm({
        ...form,
        items: [...(form.items || []), {
          productId: p.id, variantIndex,
          name, sku: variant?.sku || p.code || null,
          orderedQty: 1, unitCost: parseFloat(variant?.price ?? p.price) || 0, taxRate: 0,
        }],
      });
    }
    setSearch('');
  };

  const setLine = (idx, patch) => {
    const next = [...form.items];
    next[idx] = { ...next[idx], ...patch };
    setForm({ ...form, items: next });
  };
  const removeLine = (idx) => setForm({ ...form, items: form.items.filter((_, i) => i !== idx) });

  const subtotal = (form.items || []).reduce((s, l) => s + (parseFloat(l.unitCost) || 0) * (parseInt(l.orderedQty, 10) || 0), 0);
  const taxAmount = (form.items || []).reduce((s, l) => s + (parseFloat(l.unitCost) || 0) * (parseInt(l.orderedQty, 10) || 0) * ((parseFloat(l.taxRate) || 0) / 100), 0);
  const total = +(subtotal + taxAmount + (parseFloat(form.shippingCost) || 0) - (parseFloat(form.discount) || 0)).toFixed(3);

  const submit = async (e, statusOverride) => {
    if (e) e.preventDefault();
    if (!form.supplierId || !form.locationId) { toast.error('Pick supplier + location'); return; }
    if (!form.items?.length) { toast.error('Add at least one item'); return; }
    try {
      const body = {
        supplierId: parseInt(form.supplierId, 10),
        locationId: parseInt(form.locationId, 10),
        items: form.items.map((l) => ({
          productId: l.productId, variantIndex: l.variantIndex, name: l.name,
          orderedQty: l.orderedQty, unitCost: l.unitCost, taxRate: l.taxRate,
        })),
        shippingCost: form.shippingCost,
        discount: form.discount,
        expectedDate: form.expectedDate || null,
        notes: form.notes,
        status: statusOverride || form.status || 'draft',
      };
      if (form._editing) await api.put(`/purchase-orders/${form.id}`, body);
      else await api.post('/purchase-orders', body);
      toast.success(form._editing ? 'Updated' : 'Created');
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    }
  };

  return (
    <div className="admin-form-overlay" onClick={(e) => { if (e.target === e.currentTarget) setForm(null); }}>
      <form className="admin-form" onSubmit={submit} style={{ maxWidth: 880 }}>
        <h3>{form._editing ? `Edit PO ${form.poNumber || ''}` : 'New Purchase Order'}</h3>

        <div className="form-row">
          <div className="form-group"><label>Supplier *</label>
            <select value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })} required>
              <option value="">— Select —</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="form-group"><label>Receiving location *</label>
            <select value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })} required>
              <option value="">— Select —</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div className="form-group"><label>Expected date</label>
            <input type="date" value={form.expectedDate || ''} onChange={(e) => setForm({ ...form, expectedDate: e.target.value })} />
          </div>
        </div>

        <div style={{ background: 'var(--bg-warm, #f5f1e8)', padding: '0.75rem', borderRadius: 8, marginBottom: '0.75rem' }}>
          <label style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Add items</label>
          <input
            placeholder="Search products by name or code…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%' }}
          />
          {searchHits.length > 0 && (
            <div style={{ background: 'white', border: '1px solid var(--border-light)', borderRadius: 6, marginTop: 6, maxHeight: 200, overflowY: 'auto' }}>
              {searchHits.map((p) => {
                if (Array.isArray(p.variants) && p.variants.length > 0) {
                  return p.variants.map((v, vi) => (
                    <div key={`${p.id}-${vi}`} style={hitRow} onClick={() => addProductLine(p, vi)}>
                      <span>{p.name} <span style={{ color: 'var(--text-light)' }}>({Object.values(v.options || {}).join('/')})</span></span>
                      <span style={{ color: 'var(--text-light)', fontSize: 12 }}>{fmt(v.price ?? p.price)}</span>
                    </div>
                  ));
                }
                return (
                  <div key={p.id} style={hitRow} onClick={() => addProductLine(p)}>
                    <span>{p.name}</span>
                    <span style={{ color: 'var(--text-light)', fontSize: 12 }}>{fmt(p.price)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="admin-table-wrap" style={{ marginBottom: '0.75rem' }}>
          <table className="admin-table">
            <thead><tr><th>Item</th><th style={{ width: 70 }}>Qty</th><th style={{ width: 110 }}>Unit cost</th><th style={{ width: 80 }}>Tax %</th><th style={{ width: 110, textAlign: 'right' }}>Line total</th><th style={{ width: 110, textAlign: 'right' }}>Landed / unit</th><th style={{ width: 40 }}></th></tr></thead>
            <tbody>
              {(form.items || []).length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-light)' }}>No items yet</td></tr>}
              {(form.items || []).map((l, i) => {
                const qty = parseInt(l.orderedQty, 10) || 0;
                const uc = parseFloat(l.unitCost) || 0;
                const tr = parseFloat(l.taxRate) || 0;
                const lineValue = uc * qty;
                const lineTotal = lineValue * (1 + tr / 100);
                // Landed unit cost = unit + per-line tax + proportional shipping share / qty
                const shippingShare = subtotal > 0 ? ((parseFloat(form.shippingCost) || 0) * lineValue / subtotal) : 0;
                const landedUnit = qty > 0 ? (lineTotal + shippingShare) / qty : 0;
                return (
                  <tr key={i}>
                    <td>{l.name}</td>
                    <td><input type="number" min={1} value={l.orderedQty} onChange={(e) => setLine(i, { orderedQty: parseInt(e.target.value, 10) || 1 })} style={{ width: '100%' }} /></td>
                    <td><input type="number" step="0.001" value={l.unitCost} onChange={(e) => setLine(i, { unitCost: parseFloat(e.target.value) || 0 })} style={{ width: '100%' }} /></td>
                    <td><input type="number" step="0.01" value={l.taxRate} onChange={(e) => setLine(i, { taxRate: parseFloat(e.target.value) || 0 })} style={{ width: '100%' }} /></td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(lineTotal)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--text-light)' }}>{fmt(landedUnit)}</td>
                    <td><button type="button" className="icon-btn" onClick={() => removeLine(i)}>×</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="form-row">
          <div className="form-group"><label>Shipping cost</label>
            <input type="number" step="0.001" value={form.shippingCost} onChange={(e) => setForm({ ...form, shippingCost: e.target.value })} />
          </div>
          <div className="form-group"><label>Discount</label>
            <input type="number" step="0.001" value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} />
          </div>
        </div>

        <div className="form-group"><label>Notes</label>
          <textarea rows={2} value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0', borderTop: '1px solid var(--border-light)', fontSize: '1.1rem' }}>
          <strong>Total</strong>
          <strong>{fmt(total)}</strong>
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={(e) => submit(e, 'draft')}>Save as draft</button>
          <button type="button" className="btn btn-primary" onClick={(e) => submit(e, 'sent')}>Save & send</button>
          <button type="button" className="btn btn-secondary" onClick={() => setForm(null)}>Cancel</button>
        </div>
      </form>
    </div>
  );
}

// ─── PO Detail ─────────────────────────────────────────────────────
function PoDetail({ po, currency, onClose, onReceive, onPay, onSend, onCancel }) {
  const fmt = (n) => `${currency}${(parseFloat(n) || 0).toFixed(3)}`;
  const outstanding = +((parseFloat(po.totalAmount) || 0) - (parseFloat(po.amountPaid) || 0)).toFixed(3);
  const editable = po.status === 'draft' || po.status === 'sent' || po.status === 'partial';
  const fullyReceived = (po.items || []).every((i) => (i.receivedQty || 0) >= (i.orderedQty || 0));

  return (
    <div className="admin-form-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="admin-form" style={{ maxWidth: 860 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h3 style={{ margin: 0 }}>PO {po.poNumber}</h3>
            <div style={{ color: 'var(--text-light)', fontSize: '0.88rem', marginTop: 4 }}>
              {po.Supplier?.name} · {po.Location?.name} · created {new Date(po.createdAt).toLocaleDateString()}
            </div>
          </div>
          <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '0.3rem 0.7rem', borderRadius: '100px', textTransform: 'uppercase', background: 'rgba(196,120,74,0.15)', color: 'var(--copper)' }}>
            {po.status}
          </span>
        </div>

        <div className="admin-table-wrap" style={{ marginTop: '1rem' }}>
          <table className="admin-table">
            <thead><tr><th>Item</th><th style={{ textAlign: 'right' }}>Ordered</th><th style={{ textAlign: 'right' }}>Received</th><th style={{ textAlign: 'right' }}>Unit</th><th style={{ textAlign: 'right' }}>Landed / unit</th><th style={{ textAlign: 'right' }}>Line total</th></tr></thead>
            <tbody>
              {(po.items || []).map((l, i) => {
                const lineTotal = (parseFloat(l.unitCost) || 0) * (parseInt(l.orderedQty, 10) || 0) * (1 + (parseFloat(l.taxRate) || 0) / 100);
                const fullyReceivedLine = (l.receivedQty || 0) >= (l.orderedQty || 0);
                const landed = l.landedUnitCost != null ? parseFloat(l.landedUnitCost) : parseFloat(l.unitCost) || 0;
                return (
                  <tr key={i}>
                    <td>{l.name}</td>
                    <td style={{ textAlign: 'right' }}>{l.orderedQty}</td>
                    <td style={{ textAlign: 'right', color: fullyReceivedLine ? 'var(--success)' : 'var(--copper)', fontWeight: 600 }}>{l.receivedQty || 0}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(l.unitCost)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--text-light)' }} title="Includes per-line tax + proportional share of shipping">{fmt(landed)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(lineTotal)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '0.75rem', fontSize: '0.88rem' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Subtotal</span><span>{fmt(po.subtotal)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Tax</span><span>{fmt(po.taxAmount)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Shipping</span><span>{fmt(po.shippingCost)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Discount</span><span>−{fmt(po.discount)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-light)', paddingTop: 4, marginTop: 4, fontWeight: 600 }}><span>Total</span><span>{fmt(po.totalAmount)}</span></div>
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Paid</span><span>{fmt(po.amountPaid)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: outstanding > 0 ? 'var(--danger)' : 'var(--success)' }}><span>Outstanding</span><span>{fmt(outstanding)}</span></div>
          </div>
        </div>

        {(po.PurchaseReceipts?.length > 0 || po.SupplierPayments?.length > 0) && (
          <div style={{ marginTop: '1rem' }}>
            <h4 style={{ margin: '0 0 0.5rem' }}>History</h4>
            {(po.PurchaseReceipts || []).map((g) => (
              <div key={`g${g.id}`} style={{ fontSize: '0.82rem', padding: '0.3rem 0', color: 'var(--text-secondary)' }}>
                <strong>GRN</strong> {g.grnNumber} · {(g.items || []).reduce((s, i) => s + i.quantity, 0)} items · {new Date(g.receivedAt).toLocaleString()} · by {g.receiver?.name}
              </div>
            ))}
            {(po.SupplierPayments || []).map((p) => (
              <div key={`p${p.id}`} style={{ fontSize: '0.82rem', padding: '0.3rem 0', color: 'var(--text-secondary)' }}>
                <strong>PAY</strong> {p.paymentNumber} · {fmt(p.amount)} via {p.paymentMethod}{p.reference ? ` (${p.reference})` : ''} · {new Date(p.paidAt).toLocaleString()}
              </div>
            ))}
          </div>
        )}

        <div className="form-actions" style={{ marginTop: '1rem', flexWrap: 'wrap' }}>
          {po.status === 'draft' && <button className="btn btn-primary" onClick={onSend}>Send</button>}
          {editable && !fullyReceived && <button className="btn btn-primary" onClick={onReceive}>Receive goods</button>}
          {po.status !== 'cancelled' && outstanding > 0 && <button className="btn btn-primary" onClick={onPay}>Record payment</button>}
          {editable && !((po.items || []).some((i) => (i.receivedQty || 0) > 0)) && (
            <button className="btn btn-secondary" onClick={onCancel}>Cancel PO</button>
          )}
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ─── Receive (GRN) ─────────────────────────────────────────────────
function ReceiveModal({ form, setForm, currency, onDone }) {
  const fmt = (n) => `${currency}${(parseFloat(n) || 0).toFixed(3)}`;
  const setLine = (i, q) => {
    const next = [...form.items];
    const line = next[i];
    const outstanding = (line.orderedQty || 0) - (line.receivedQty || 0);
    const v = Math.max(0, Math.min(parseInt(q, 10) || 0, outstanding));
    next[i] = { ...line, receiveQty: v };
    setForm({ ...form, items: next });
  };
  const total = form.items.reduce((s, l) => s + (l.unitCost || 0) * (l.receiveQty || 0), 0);
  const anySelected = form.items.some((l) => (l.receiveQty || 0) > 0);

  const submit = async () => {
    try {
      const items = form.items
        .filter((l) => (l.receiveQty || 0) > 0)
        .map((l) => ({ productId: l.productId, variantIndex: l.variantIndex, quantity: l.receiveQty }));
      await api.post(`/purchase-orders/${form.poId}/receive`, { items, notes: form.notes });
      toast.success('Goods received');
      onDone();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    }
  };

  return (
    <div className="admin-form-overlay" onClick={(e) => { if (e.target === e.currentTarget) setForm(null); }}>
      <div className="admin-form" style={{ maxWidth: 720 }}>
        <h3>Receive Goods</h3>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Item</th><th style={{ textAlign: 'right' }}>Ordered</th><th style={{ textAlign: 'right' }}>Received</th><th style={{ width: 120 }}>Receive now</th></tr></thead>
            <tbody>
              {form.items.map((l, i) => {
                const outstanding = (l.orderedQty || 0) - (l.receivedQty || 0);
                return (
                  <tr key={i} style={{ opacity: outstanding < 1 ? 0.4 : 1 }}>
                    <td>{l.name}</td>
                    <td style={{ textAlign: 'right' }}>{l.orderedQty}</td>
                    <td style={{ textAlign: 'right' }}>{l.receivedQty || 0}</td>
                    <td>
                      <input type="number" min={0} max={outstanding} value={l.receiveQty || 0}
                        onChange={(e) => setLine(i, e.target.value)} disabled={outstanding < 1}
                        style={{ width: '100%' }} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderTop: '1px solid var(--border-light)', marginTop: '0.5rem' }}>
          <span>Goods value to receive</span>
          <strong>{fmt(total)}</strong>
        </div>
        <div className="form-group" style={{ marginTop: '0.75rem' }}>
          <label>Notes</label>
          <textarea rows={2} value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <div className="form-actions">
          <button className="btn btn-primary" onClick={submit} disabled={!anySelected}>Receive</button>
          <button className="btn btn-secondary" onClick={() => setForm(null)}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── Pay ───────────────────────────────────────────────────────────
function PayModal({ form, setForm, currency, onDone }) {
  const [cashAccounts, setCashAccounts] = useState([]);
  useEffect(() => {
    api.get('/finance/cash-accounts?active=true').then((r) => setCashAccounts(r.data)).catch(() => {});
  }, []);

  const submit = async () => {
    try {
      await api.post(`/purchase-orders/${form.poId}/pay`, {
        amount: parseFloat(form.amount),
        paymentMethod: form.paymentMethod,
        cashAccountId: form.cashAccountId || undefined,
        reference: form.reference || undefined,
        notes: form.notes || undefined,
      });
      toast.success('Payment recorded');
      onDone();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    }
  };
  return (
    <div className="admin-form-overlay" onClick={(e) => { if (e.target === e.currentTarget) setForm(null); }}>
      <div className="admin-form" style={{ maxWidth: 480 }}>
        <h3>Record Payment</h3>
        <div className="form-group"><label>Amount ({currency})</label>
          <input type="number" step="0.001" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
        </div>
        <div className="form-group"><label>Method</label>
          <select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}>
            <option value="cash">Cash</option><option value="bank">Bank transfer</option><option value="card">Card</option><option value="cheque">Cheque</option><option value="other">Other</option>
          </select>
        </div>
        <div className="form-group"><label>Pay from account</label>
          <select value={form.cashAccountId || ''} onChange={(e) => setForm({ ...form, cashAccountId: e.target.value })}>
            <option value="">— Don't move cash (manual reconcile) —</option>
            {cashAccounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({currency}{parseFloat(a.balance || 0).toFixed(3)})</option>)}
          </select>
        </div>
        <div className="form-group"><label>Reference</label>
          <input value={form.reference || ''} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="cheque #, txn id, etc" />
        </div>
        <div className="form-group"><label>Notes</label>
          <textarea rows={2} value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <div className="form-actions">
          <button className="btn btn-primary" onClick={submit}>Pay</button>
          <button className="btn btn-secondary" onClick={() => setForm(null)}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

const hitRow = {
  display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0.75rem',
  cursor: 'pointer', borderBottom: '1px solid var(--border-light)',
};
