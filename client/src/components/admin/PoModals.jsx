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
import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import ProductSearchPicker from './ProductSearchPicker';
import { CURRENCY_DECIMALS, PRICE_STEP } from '../../utils/currency';

export default function PoModals({
  poForm, setPoForm, poDetail, setPoDetail,
  receiveForm, setReceiveForm, payForm, setPayForm,
  suppliers, locations, products, currency, refresh, onReceived,
}) {
  return (
    <>
      {poForm && (
        <PoEditor form={poForm} setForm={setPoForm} suppliers={suppliers} locations={locations} products={products} currency={currency} onSaved={() => { setPoForm(null); refresh(); }} />
      )}
      {poDetail && (
        <PoDetail po={poDetail} currency={currency}
          onClose={() => setPoDetail(null)}
          onEdit={() => {
            setPoForm({
              id: poDetail.id, poNumber: poDetail.poNumber, status: poDetail.status,
              supplierId: String(poDetail.supplierId), locationId: String(poDetail.locationId),
              items: (poDetail.items || []).map((l) => ({
                productId: l.productId, variantIndex: l.variantIndex ?? null, name: l.name, sku: l.sku,
                orderedQty: l.orderedQty, unitCost: l.unitCost, taxRate: l.taxRate,
              })),
              shippingCost: parseFloat(poDetail.shippingCost) || 0,
              discount: parseFloat(poDetail.discount) || 0,
              expectedDate: (poDetail.expectedDate || '').slice(0, 10),
              notes: poDetail.notes || '',
              _editing: true,
            });
            setPoDetail(null);
          }}
          onReceive={() => setReceiveForm({ poId: poDetail.id, items: (poDetail.items || []).map((it) => ({ ...it, receiveQty: (it.orderedQty || 0) - (it.receivedQty || 0) })) })}
          onPay={() => setPayForm({ poId: poDetail.id, amount: +((parseFloat(poDetail.totalAmount) - parseFloat(poDetail.amountPaid || 0)).toFixed(CURRENCY_DECIMALS)), paymentMethod: 'cash', reference: '', notes: '' })}
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
          onDone={() => { setReceiveForm(null); refresh(); onReceived?.(); if (poDetail) api.get(`/purchase-orders/${poDetail.id}`).then((r) => setPoDetail(r.data)); }} />
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
  const fmt = (n) => `${currency}${(parseFloat(n) || 0).toFixed(CURRENCY_DECIMALS)}`;

  // Keyboard flow, no mouse needed: pick in search (ProductSearchPicker) →
  // the line's Qty takes focus, selected so typing replaces it → Tab on to
  // cost/tax → Enter returns to search for the next item.
  const searchRef = useRef(null);
  const qtyRefs = useRef([]);
  // Line whose Qty should take focus once the added row has rendered.
  const focusLine = useRef(null);
  // Line to scroll into view after the next render — a scan doesn't move
  // focus, so on a long PO the new line would land off-screen.
  const scrollLine = useRef(null);
  const linesRef = useRef(null);
  useEffect(() => {
    if (scrollLine.current != null) {
      linesRef.current?.querySelector(`[data-line="${scrollLine.current}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      scrollLine.current = null;
    }
    if (focusLine.current == null) return;
    qtyRefs.current[focusLine.current]?.focus();
    qtyRefs.current[focusLine.current]?.select();
    focusLine.current = null;
  }, [form.items]);

  // Enter in a line's fields goes back to search instead of submitting.
  const onLineKey = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); searchRef.current?.focus(); }
  };

  const addProductLine = (p, variantIndex = null, { scanned } = {}) => {
    const variant = variantIndex != null && Array.isArray(p.variants) ? p.variants[variantIndex] : null;
    const name = p.name + (variant ? ` (${Object.values(variant.options || {}).join('/')})` : '');
    const existing = (form.items || []).findIndex((l) => l.productId === p.id && (l.variantIndex ?? null) === (variantIndex ?? null));
    // A scan stays in the search box for the next scan instead of jumping to Qty.
    if (!scanned) focusLine.current = existing >= 0 ? existing : (form.items || []).length;
    scrollLine.current = existing >= 0 ? existing : (form.items || []).length;
    if (existing >= 0) {
      const next = [...form.items];
      next[existing] = { ...next[existing], orderedQty: (parseInt(next[existing].orderedQty, 10) || 0) + 1 };
      setForm({ ...form, items: next });
    } else {
      setForm({
        ...form,
        items: [...(form.items || []), {
          productId: p.id, variantIndex,
          name, sku: variant?.sku || p.code || null,
          // Start from the product's current cost (last received landed
          // cost), not its retail price — this line becomes the new cost on
          // receive. Blank when the product has no cost yet.
          orderedQty: 1, unitCost: parseFloat(p.costPrice) > 0 ? parseFloat(p.costPrice) : '', taxRate: 0,
        }],
      });
    }
  };

  // The chosen supplier's products (linked or bought from it before), for
  // quick-adding lines. Stock is at the receiving location when one's picked.
  // Tagged with the supplier/location it was fetched for, so a list from the
  // previously chosen supplier never shows while the next one loads.
  const [supplierList, setSupplierList] = useState({ key: null, rows: [] });
  const [showSupplierProducts, setShowSupplierProducts] = useState(true);
  const listKey = form.supplierId ? `${form.supplierId}:${form.locationId || ''}` : null;
  useEffect(() => {
    if (!listKey) return;
    let live = true;
    api.get(`/suppliers/${form.supplierId}/products`, { params: form.locationId ? { locationId: form.locationId } : {} })
      .then((r) => { if (live) setSupplierList({ key: listKey, rows: r.data }); })
      .catch(() => { if (live) setSupplierList({ key: listKey, rows: [] }); });
    return () => { live = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listKey]);
  const supplierProducts = listKey && supplierList.key === listKey ? supplierList.rows : null;

  const onPo = (row) => (form.items || []).some((l) => l.productId === row.productId && (l.variantIndex ?? null) === (row.variantIndex ?? null));
  const belowReorder = (row) => row.reorderLevel != null && row.stock <= row.reorderLevel;
  // Add several at once: one setForm, since addProductLine reads `form` and
  // calling it in a loop would keep only the last line.
  const addSupplierRows = (rows) => {
    const fresh = rows.filter((r) => !onPo(r));
    if (fresh.length === 0) { toast('Already on the PO'); return; }
    scrollLine.current = (form.items || []).length + fresh.length - 1;
    setForm({
      ...form,
      items: [...(form.items || []), ...fresh.map((r) => ({
        productId: r.productId, variantIndex: r.variantIndex ?? null, name: r.name, sku: r.code || null,
        // Top up to the reorder level (or the product's reorder qty), else 1.
        orderedQty: Math.max(1, r.reorderQty || (r.reorderLevel != null ? r.reorderLevel - r.stock + 1 : 1)),
        unitCost: r.lastCost > 0 ? r.lastCost : (r.costPrice > 0 ? r.costPrice : ''),
        taxRate: 0,
      }))],
    });
  };

  const setLine = (idx, patch) => {
    const next = [...form.items];
    next[idx] = { ...next[idx], ...patch };
    setForm({ ...form, items: next });
  };
  const removeLine = (idx) => setForm({ ...form, items: form.items.filter((_, i) => i !== idx) });

  const subtotal = (form.items || []).reduce((s, l) => s + (parseFloat(l.unitCost) || 0) * (parseInt(l.orderedQty, 10) || 0), 0);
  const taxAmount = (form.items || []).reduce((s, l) => s + (parseFloat(l.unitCost) || 0) * (parseInt(l.orderedQty, 10) || 0) * ((parseFloat(l.taxRate) || 0) / 100), 0);
  const total = +(subtotal + taxAmount + (parseFloat(form.shippingCost) || 0) - (parseFloat(form.discount) || 0)).toFixed(CURRENCY_DECIMALS);
  const totalQty = (form.items || []).reduce((s, l) => s + (parseInt(l.orderedQty, 10) || 0), 0);

  const submit = async (e, statusOverride) => {
    if (e) e.preventDefault();
    if (!form.supplierId || !form.locationId) { toast.error('Pick supplier + location'); return; }
    if (!form.items?.length) { toast.error('Add at least one item'); return; }
    try {
      const body = {
        supplierId: parseInt(form.supplierId, 10),
        locationId: parseInt(form.locationId, 10),
        // Line fields hold the raw typed text while editing; parse here.
        items: form.items.map((l) => ({
          productId: l.productId, variantIndex: l.variantIndex, name: l.name,
          orderedQty: Math.max(1, parseInt(l.orderedQty, 10) || 1),
          unitCost: parseFloat(l.unitCost) || 0,
          taxRate: parseFloat(l.taxRate) || 0,
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

        {supplierProducts && (
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '0.6rem 0.75rem', marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button type="button" className="link-btn" onClick={() => setShowSupplierProducts((v) => !v)} style={{ fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                {showSupplierProducts ? '▾' : '▸'} This supplier's products ({supplierProducts.length})
              </button>
              {supplierProducts.some(belowReorder) && (
                <button type="button" className="btn btn-secondary" style={{ padding: '0.2rem 0.6rem', fontSize: '0.8rem' }} onClick={() => addSupplierRows(supplierProducts.filter(belowReorder))}>
                  Add all below reorder level ({supplierProducts.filter(belowReorder).length})
                </button>
              )}
            </div>
            {showSupplierProducts && (supplierProducts.length === 0 ? (
              <div style={{ fontSize: '0.85rem', color: 'var(--text-light)', marginTop: '0.4rem' }}>
                Nothing bought from this supplier yet — search below, or link products on the Suppliers tab.
              </div>
            ) : (
              <div style={{ maxHeight: 240, overflowY: 'auto', marginTop: '0.5rem' }}>
                <table className="admin-table" style={{ fontSize: '0.85rem' }}>
                  <thead><tr><th>Item</th><th style={{ textAlign: 'right' }}>Stock</th><th style={{ textAlign: 'right' }}>Reorder at</th><th style={{ textAlign: 'right' }}>Last cost</th><th>Last bought</th><th></th></tr></thead>
                  <tbody>
                    {supplierProducts.map((r) => (
                      <tr key={`${r.productId}:${r.variantIndex ?? 'b'}`}>
                        <td>{r.name}{r.code && <span style={{ color: 'var(--text-light)', fontFamily: 'monospace', fontSize: '0.75rem' }}> · {r.code}</span>}</td>
                        <td style={{ textAlign: 'right', color: belowReorder(r) ? 'var(--danger, #dc2626)' : undefined, fontWeight: belowReorder(r) ? 600 : undefined }}>{r.stock}</td>
                        <td style={{ textAlign: 'right' }}>{r.reorderLevel ?? '—'}</td>
                        <td style={{ textAlign: 'right' }}>{r.lastCost != null ? fmt(r.lastCost) : '—'}</td>
                        <td>{r.lastBoughtAt ? new Date(r.lastBoughtAt).toLocaleDateString() : '—'}</td>
                        <td style={{ textAlign: 'right' }}>
                          {onPo(r)
                            ? <span style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>Added</span>
                            : <button type="button" className="btn btn-secondary" style={{ padding: '0.2rem 0.6rem', fontSize: '0.8rem' }} onClick={() => addSupplierRows([r])}>Add</button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}

        <ProductSearchPicker
          ref={searchRef}
          products={products}
          currency={currency}
          onPick={addProductLine}
          hint="↑ ↓ to choose · Enter to add · type the qty, Tab to cost and tax · Enter to come back here"
        />

        <div className="admin-table-wrap" style={{ marginBottom: '0.75rem' }} ref={linesRef}>
          <table className="admin-table po-lines">
            <thead><tr><th>Item</th><th style={{ width: 96 }}>Qty</th><th style={{ width: 110 }}>Unit cost</th><th style={{ width: 80 }}>Tax %</th><th style={{ width: 110, textAlign: 'right' }}>Line total</th><th style={{ width: 110, textAlign: 'right' }}>Landed / unit</th><th style={{ width: 40 }}></th></tr></thead>
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
                  <tr key={i} data-line={i}>
                    <td>{l.name}</td>
                    {/* Raw text while typing — forcing a number on every
                        keystroke snapped a cleared Qty back to 1, so
                        backspace-then-7 gave 17. Clamped on blur and save. */}
                    <td><input ref={(el) => { qtyRefs.current[i] = el; }} type="number" min={1} inputMode="numeric" value={l.orderedQty}
                      onChange={(e) => setLine(i, { orderedQty: e.target.value })}
                      onBlur={() => { if (!(parseInt(l.orderedQty, 10) >= 1)) setLine(i, { orderedQty: 1 }); }}
                      onKeyDown={onLineKey} style={{ width: '100%' }} /></td>
                    <td><input type="number" step="0.001" inputMode="decimal" value={l.unitCost} onChange={(e) => setLine(i, { unitCost: e.target.value })} onKeyDown={onLineKey} style={{ width: '100%' }} /></td>
                    <td><input type="number" step="0.01" inputMode="decimal" value={l.taxRate} onChange={(e) => setLine(i, { taxRate: e.target.value })} onKeyDown={onLineKey} style={{ width: '100%' }} /></td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(lineTotal)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--text-light)' }}>{fmt(landedUnit)}</td>
                    <td><button type="button" className="icon-btn" onClick={() => removeLine(i)}>×</button></td>
                  </tr>
                );
              })}
            </tbody>
            {(form.items || []).length > 0 && (
              <tfoot>
                <tr style={{ fontWeight: 600 }}>
                  <td>{form.items.length} item{form.items.length === 1 ? '' : 's'} · Total qty</td>
                  <td style={{ paddingLeft: '0.75rem' }}>{totalQty}</td>
                  <td colSpan={2}></td>
                  <td style={{ textAlign: 'right' }}>{fmt(subtotal + taxAmount)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <div className="form-row">
          <div className="form-group"><label>Shipping cost</label>
            <input type="number" step={PRICE_STEP} value={form.shippingCost} onChange={(e) => setForm({ ...form, shippingCost: e.target.value })} />
          </div>
          <div className="form-group"><label>Discount</label>
            <input type="number" step={PRICE_STEP} value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} />
          </div>
        </div>

        <div className="form-group"><label>Notes</label>
          <textarea rows={2} value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0', borderTop: '1px solid var(--border-light)', fontSize: '1.1rem' }}>
          <strong>Total <span style={{ fontWeight: 400, fontSize: '0.85rem', color: 'var(--text-light)' }}>· {totalQty} units</span></strong>
          <strong>{fmt(total)}</strong>
        </div>

        <div className="form-actions">
          {form._editing && form.status === 'sent' ? (
            <button type="button" className="btn btn-primary" onClick={(e) => submit(e, 'sent')}>Save changes</button>
          ) : (
            <>
              <button type="button" className="btn btn-secondary" onClick={(e) => submit(e, 'draft')}>Save as draft</button>
              <button type="button" className="btn btn-primary" onClick={(e) => submit(e, 'sent')}>Save & send</button>
            </>
          )}
          <button type="button" className="btn btn-secondary" onClick={() => setForm(null)}>Cancel</button>
        </div>
      </form>
    </div>
  );
}

// ─── PO Detail ─────────────────────────────────────────────────────
function PoDetail({ po, currency, onClose, onEdit, onReceive, onPay, onSend, onCancel }) {
  const fmt = (n) => `${currency}${(parseFloat(n) || 0).toFixed(CURRENCY_DECIMALS)}`;
  const outstanding = +((parseFloat(po.totalAmount) || 0) - (parseFloat(po.amountPaid) || 0)).toFixed(CURRENCY_DECIMALS);
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
            <tfoot>
              <tr style={{ fontWeight: 600 }}>
                <td>{(po.items || []).length} items · Total qty</td>
                <td style={{ textAlign: 'right' }}>{(po.items || []).reduce((s, l) => s + (parseInt(l.orderedQty, 10) || 0), 0)}</td>
                <td style={{ textAlign: 'right' }}>{(po.items || []).reduce((s, l) => s + (parseInt(l.receivedQty, 10) || 0), 0)}</td>
                <td colSpan={3}></td>
              </tr>
            </tfoot>
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
          {/* Editable until goods arrive — the server refuses once anything's received. */}
          {(po.status === 'draft' || po.status === 'sent') && <button className="btn btn-secondary" onClick={onEdit}>Edit</button>}
          {editable && !fullyReceived && <button className="btn btn-primary" onClick={onReceive}>Receive goods</button>}
          {po.status !== 'cancelled' && outstanding > 0 && <button className="btn btn-primary" onClick={onPay}>Record payment</button>}
          {editable && !((po.items || []).some((i) => (i.receivedQty || 0) > 0)) && (
            <button className="btn btn-secondary" onClick={onCancel}>Cancel PO</button>
          )}
          <button className="btn btn-secondary" onClick={() => window.open(`${api.defaults.baseURL}/purchase-orders/${po.id}/pdf`, '_blank')}>Print / PDF</button>
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ─── Receive (GRN) ─────────────────────────────────────────────────
function ReceiveModal({ form, setForm, currency, onDone }) {
  const fmt = (n) => `${currency}${(parseFloat(n) || 0).toFixed(CURRENCY_DECIMALS)}`;
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

  // Keyboard: opens on the first line still outstanding; Enter steps to the
  // next one, and from the last to the Receive button (Enter again confirms).
  const qtyRefs = useRef([]);
  const receiveBtn = useRef(null);
  const receivable = form.items
    .map((l, i) => ((l.orderedQty || 0) - (l.receivedQty || 0) > 0 ? i : null))
    .filter((i) => i != null);
  useEffect(() => {
    const first = qtyRefs.current[receivable[0]];
    first?.focus();
    first?.select();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const onQtyKey = (e, i) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const next = receivable[receivable.indexOf(i) + 1];
    if (next != null) { qtyRefs.current[next]?.focus(); qtyRefs.current[next]?.select(); }
    else receiveBtn.current?.focus();
  };

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
          <table className="admin-table po-lines">
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
                      <input ref={(el) => { qtyRefs.current[i] = el; }} type="number" min={0} max={outstanding}
                        inputMode="numeric" value={l.receiveQty || 0}
                        onChange={(e) => setLine(i, e.target.value)} onKeyDown={(e) => onQtyKey(e, i)}
                        disabled={outstanding < 1} style={{ width: '100%' }} />
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
          <button ref={receiveBtn} className="btn btn-primary" onClick={submit} disabled={!anySelected}>Receive</button>
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
          <input type="number" step={PRICE_STEP} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
        </div>
        <div className="form-group"><label>Method</label>
          <select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}>
            <option value="cash">Cash</option><option value="bank">Bank transfer</option><option value="card">Card</option><option value="cheque">Cheque</option><option value="other">Other</option>
          </select>
        </div>
        <div className="form-group"><label>Pay from account</label>
          <select value={form.cashAccountId || ''} onChange={(e) => setForm({ ...form, cashAccountId: e.target.value })}>
            <option value="">— Don't move cash (manual reconcile) —</option>
            {cashAccounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({currency}{parseFloat(a.balance || 0).toFixed(CURRENCY_DECIMALS)})</option>)}
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
