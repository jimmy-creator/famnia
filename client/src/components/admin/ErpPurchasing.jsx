/**
 * ERP → Purchasing: Suppliers, Purchase Orders, Purchase Returns.
 *
 * Lifted out of Admin.jsx when the ERP surface moved to its own page; the
 * tab markup is unchanged.  The PO and purchase-return editors still live
 * in PoModals / PurchaseReturnModals and are driven from here.
 */
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { HiPlus, HiPencil, HiTrash } from 'react-icons/hi';
import api from '../../api/axios';
import { localDate } from '../../lib/utils';
import { CURRENCY } from '../../utils/currency';
import PoModals from './PoModals';
import PurchaseReturnModals from './PurchaseReturnModals';

export default function ErpPurchasing({ tab, locations, products, isAdmin, onProductsChanged }) {
  const [suppliers, setSuppliers] = useState([]);
  const [supplierForm, setSupplierForm] = useState(null);
  const [supplierDetail, setSupplierDetail] = useState(null);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [poFilter, setPoFilter] = useState({ status: '', supplierId: '', locationId: '' });
  const [poForm, setPoForm] = useState(null);          // editor (new/edit)
  const [poDetail, setPoDetail] = useState(null);      // detail modal with actions
  const [receiveForm, setReceiveForm] = useState(null);// { poId, items: [{...}] }
  const [payForm, setPayForm] = useState(null);        // { poId, amount, method, ref, notes }
  const [purchaseReturns, setPurchaseReturns] = useState([]);
  const [prFilter, setPrFilter] = useState({ from: '', to: '', supplierId: '', locationId: '' });
  const [prForm, setPrForm] = useState(null);          // new purchase-return form
  const [prDetail, setPrDetail] = useState(null);
  const [linking, setLinking] = useState(false);

  // Point every product with no supplier at the one it was last bought from.
  const linkProducts = async () => {
    setLinking(true);
    try {
      const { data } = await api.post('/suppliers/link-products');
      toast.success(`${data.linked} products linked · ${data.withSupplier} have a supplier · ${data.withoutSupplier} never bought`, { duration: 8000 });
      const res = await api.get('/suppliers');
      setSuppliers(res.data);
      onProductsChanged?.();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Linking failed');
    } finally {
      setLinking(false);
    }
  };

  // CSV of the supplier list as loaded. BOM so Excel opens Arabic names correctly.
  const exportSuppliers = () => {
    const cols = [
      ['Name', 'name'], ['Code', 'code'], ['Contact person', 'contactPerson'], ['Phone', 'phone'],
      ['Email', 'email'], ['Address', 'address'], ['City', 'city'], ['Country', 'country'],
      // No payment terms / credit limit — suppliers get no credit (see the form below).
      ['Tax ID', 'taxId'], ['Opening balance', 'openingBalance'],
      ['Products', 'productCount'], ['Active', (s) => (s.active ? 'Yes' : 'No')],
      ['Notes', 'notes'],
    ];
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [
      cols.map(([label]) => esc(label)).join(','),
      ...suppliers.map((s) => cols.map(([, key]) => esc(typeof key === 'function' ? key(s) : s[key])).join(',')),
    ];
    const url = URL.createObjectURL(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `suppliers-${localDate()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (tab === 'suppliers') {
      api.get('/suppliers').then((res) => setSuppliers(res.data)).catch(() => {});
    } else if (tab === 'purchase-orders') {
      api.get('/suppliers?active=true').then((res) => setSuppliers(res.data)).catch(() => {});
      const params = {};
      if (poFilter.status) params.status = poFilter.status;
      if (poFilter.supplierId) params.supplierId = poFilter.supplierId;
      if (poFilter.locationId) params.locationId = poFilter.locationId;
      api.get('/purchase-orders', { params }).then((res) => setPurchaseOrders(res.data)).catch(() => {});
    } else if (tab === 'purchase-returns') {
      api.get('/suppliers?active=true').then((res) => setSuppliers(res.data)).catch(() => {});
      const params = {};
      if (prFilter.from) params.from = prFilter.from;
      if (prFilter.to) params.to = prFilter.to;
      if (prFilter.supplierId) params.supplierId = prFilter.supplierId;
      if (prFilter.locationId) params.locationId = prFilter.locationId;
      api.get('/purchase-returns', { params }).then((res) => setPurchaseReturns(res.data)).catch(() => {});
    }
  }, [tab, poFilter, prFilter]);

  return (
    <>
    {tab === 'suppliers' && (
      <div className="admin-section">
        <div className="admin-section-header">
          <h2>Suppliers</h2>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-secondary" disabled={linking} onClick={linkProducts}
            title="Products with no supplier get the one they were last bought from. Suppliers already picked on a product are kept.">
            {linking ? 'Linking…' : 'Link products from purchase history'}
          </button>
          <button className="btn btn-secondary" disabled={suppliers.length === 0} onClick={exportSuppliers}>Export CSV</button>
          <button className="btn btn-primary" onClick={() => setSupplierForm({ name: '', code: '', contactPerson: '', email: '', phone: '', address: '', city: '', country: '', taxId: '', openingBalance: 0, notes: '', active: true, _editing: false })}>
            <HiPlus /> Add Supplier
          </button>
          </div>
        </div>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>Name</th><th>Code</th><th>Contact</th><th>Phone</th><th>City</th><th style={{ textAlign: 'right' }}>Products</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {suppliers.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-light)' }}>No suppliers yet</td></tr>}
              {suppliers.map((s) => (
                <tr key={s.id} style={{ opacity: s.active ? 1 : 0.5 }}>
                  <td style={{ fontWeight: 500 }}>{s.name}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{s.code || '—'}</td>
                  <td>{s.contactPerson || '—'}</td>
                  <td>{s.phone || '—'}</td>
                  <td>{s.city || '—'}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{s.productCount ?? 0}</td>
                  <td>
                    <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '0.2rem 0.5rem', borderRadius: '100px',
                      background: s.active ? 'rgba(90,138,106,0.15)' : 'rgba(100,116,139,0.15)',
                      color: s.active ? 'var(--success)' : 'var(--text-light)' }}>
                      {s.active ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  </td>
                  <td style={{ display: 'flex', gap: '0.4rem' }}>
                    <button className="btn btn-secondary" style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem' }}
                      onClick={() => api.get(`/suppliers/${s.id}/statement`).then((res) => setSupplierDetail(res.data))}>
                      View
                    </button>
                    <button className="icon-btn" onClick={() => setSupplierForm({ ...s, openingBalance: s.openingBalance || 0, _editing: true })}>
                      <HiPencil />
                    </button>
                    <button className="icon-btn" onClick={async () => {
                      if (!confirm('Delete supplier? Soft-deleted if any PO history exists.')) return;
                      try { await api.delete(`/suppliers/${s.id}`); api.get('/suppliers').then((r) => setSuppliers(r.data)); }
                      catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
                    }}><HiTrash /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {supplierForm && (
          <div className="admin-form-overlay" onClick={(e) => { if (e.target === e.currentTarget) setSupplierForm(null); }}>
            <form className="admin-form" onSubmit={async (e) => {
              e.preventDefault();
              try {
                const body = { ...supplierForm };
                delete body._editing;
                if (supplierForm._editing) await api.put(`/suppliers/${supplierForm.id}`, body);
                else await api.post('/suppliers', body);
                toast.success(supplierForm._editing ? 'Updated' : 'Created');
                setSupplierForm(null);
                api.get('/suppliers').then((r) => setSuppliers(r.data));
              } catch (err) {
                toast.error(err.response?.data?.message || 'Failed');
              }
            }}>
              <h3>{supplierForm._editing ? 'Edit Supplier' : 'New Supplier'}</h3>
              <div className="form-row">
                <div className="form-group"><label>Name *</label><input value={supplierForm.name} onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })} required /></div>
                <div className="form-group"><label>Code</label><input value={supplierForm.code || ''} onChange={(e) => setSupplierForm({ ...supplierForm, code: e.target.value })} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Contact person</label><input value={supplierForm.contactPerson || ''} onChange={(e) => setSupplierForm({ ...supplierForm, contactPerson: e.target.value })} /></div>
                <div className="form-group"><label>Phone</label><input value={supplierForm.phone || ''} onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Email</label><input type="email" value={supplierForm.email || ''} onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })} /></div>
                <div className="form-group"><label>Tax ID</label><input value={supplierForm.taxId || ''} onChange={(e) => setSupplierForm({ ...supplierForm, taxId: e.target.value })} /></div>
              </div>
              <div className="form-group"><label>Address</label><textarea rows={2} value={supplierForm.address || ''} onChange={(e) => setSupplierForm({ ...supplierForm, address: e.target.value })} /></div>
              <div className="form-row">
                <div className="form-group"><label>City</label><input value={supplierForm.city || ''} onChange={(e) => setSupplierForm({ ...supplierForm, city: e.target.value })} /></div>
                <div className="form-group"><label>Country</label><input value={supplierForm.country || ''} onChange={(e) => setSupplierForm({ ...supplierForm, country: e.target.value })} /></div>
              </div>
              {/* No payment terms or credit limit: purchase orders must be
                  paid in full before goods can be received, so no payable
                  ever accrues and there is nothing for terms to govern. */}
              <div className="form-row">
                <div className="form-group"><label>Opening balance ({CURRENCY})</label>
                  <input type="number" step="0.001" value={supplierForm.openingBalance} onChange={(e) => setSupplierForm({ ...supplierForm, openingBalance: e.target.value })} />
                </div>
              </div>
              <div className="form-group"><label>Notes</label><textarea rows={2} value={supplierForm.notes || ''} onChange={(e) => setSupplierForm({ ...supplierForm, notes: e.target.value })} /></div>
              <div className="form-group"><label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input type="checkbox" checked={!!supplierForm.active} onChange={(e) => setSupplierForm({ ...supplierForm, active: e.target.checked })} /> Active
              </label></div>
              <div className="form-actions">
                <button type="submit" className="btn btn-primary">{supplierForm._editing ? 'Save' : 'Create'}</button>
                <button type="button" className="btn btn-secondary" onClick={() => setSupplierForm(null)}>Cancel</button>
              </div>
            </form>
          </div>
        )}

        {supplierDetail && (
          <div className="admin-form-overlay" onClick={(e) => { if (e.target === e.currentTarget) setSupplierDetail(null); }}>
            <div className="admin-form" style={{ maxWidth: 760 }}>
              <h3>{supplierDetail.supplier.name} — Statement</h3>
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', fontSize: '0.88rem' }}>
                <div><span style={{ color: 'var(--text-light)' }}>Opening</span> <strong>{CURRENCY}{parseFloat(supplierDetail.openingBalance).toFixed(3)}</strong></div>
                <div><span style={{ color: 'var(--text-light)' }}>Closing</span> <strong style={{ color: supplierDetail.closingBalance > 0 ? 'var(--danger)' : 'var(--success)' }}>{CURRENCY}{parseFloat(supplierDetail.closingBalance).toFixed(3)}</strong></div>
              </div>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead><tr><th>Date</th><th>Type</th><th>Ref</th><th style={{ textAlign: 'right' }}>Debit</th><th style={{ textAlign: 'right' }}>Credit</th><th style={{ textAlign: 'right' }}>Balance</th></tr></thead>
                  <tbody>
                    {supplierDetail.entries.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-light)' }}>No transactions</td></tr>}
                    {supplierDetail.entries.map((e, i) => (
                      <tr key={i}>
                        <td style={{ fontSize: '0.82rem' }}>{new Date(e.date).toLocaleDateString()}</td>
                        <td style={{ textTransform: 'capitalize' }}>{e.type}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{e.ref}</td>
                        <td style={{ textAlign: 'right' }}>{e.debit > 0 ? `${CURRENCY}${e.debit.toFixed(3)}` : ''}</td>
                        <td style={{ textAlign: 'right' }}>{e.credit > 0 ? `${CURRENCY}${e.credit.toFixed(3)}` : ''}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{CURRENCY}{e.balance.toFixed(3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="form-actions" style={{ marginTop: '1rem' }}>
                <button className="btn btn-primary" onClick={() => setSupplierDetail(null)}>Close</button>
              </div>
            </div>
          </div>
        )}
      </div>
    )}

    {tab === 'purchase-orders' && (
      <div className="admin-section">
        <div className="admin-section-header">
          <h2>Purchase Orders</h2>
          <button className="btn btn-primary" onClick={() => setPoForm({
            supplierId: '', locationId: '', items: [], shippingCost: 0, discount: 0, expectedDate: localDate(), notes: '', status: 'draft', _editing: false,
          })}><HiPlus /> New PO</button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end', marginBottom: '1.5rem', padding: '1rem', background: 'var(--surface-alt, #f8f9fa)', borderRadius: 8 }}>
          <div><label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Status</label>
            <select value={poFilter.status} onChange={(e) => setPoFilter({ ...poFilter, status: e.target.value })}>
              <option value="">All</option>
              <option value="draft">Draft</option><option value="sent">Sent</option><option value="partial">Partial</option><option value="received">Received</option><option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div><label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Supplier</label>
            <select value={poFilter.supplierId} onChange={(e) => setPoFilter({ ...poFilter, supplierId: e.target.value })}>
              <option value="">All</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div><label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Location</label>
            <select value={poFilter.locationId} onChange={(e) => setPoFilter({ ...poFilter, locationId: e.target.value })}>
              <option value="">All</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <button className="btn btn-secondary" onClick={() => setPoFilter({ status: '', supplierId: '', locationId: '' })}>Clear</button>
        </div>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>Date</th><th>PO #</th><th>Supplier</th><th>Location</th><th style={{ textAlign: 'right' }}>Total</th><th style={{ textAlign: 'right' }}>Paid</th><th>Status</th><th>Payment</th><th></th></tr>
            </thead>
            <tbody>
              {purchaseOrders.length === 0 && <tr><td colSpan={9} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-light)' }}>No purchase orders</td></tr>}
              {purchaseOrders.map((p) => (
                <tr key={p.id}>
                  <td style={{ fontSize: '0.82rem' }}>{new Date(p.createdAt).toLocaleDateString()}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{p.poNumber}</td>
                  <td>{p.Supplier?.name || '—'}</td>
                  <td>{p.Location?.name || '—'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{CURRENCY}{parseFloat(p.totalAmount).toFixed(3)}</td>
                  <td style={{ textAlign: 'right' }}>{CURRENCY}{parseFloat(p.amountPaid || 0).toFixed(3)}</td>
                  <td>
                    <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '0.2rem 0.5rem', borderRadius: '100px', textTransform: 'uppercase',
                      background: p.status === 'received' ? 'rgba(90,138,106,0.15)' : p.status === 'cancelled' ? 'rgba(220,38,38,0.15)' : 'rgba(196,120,74,0.15)',
                      color: p.status === 'received' ? 'var(--success)' : p.status === 'cancelled' ? 'var(--danger)' : 'var(--copper)' }}>
                      {p.status}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '0.2rem 0.5rem', borderRadius: '100px', textTransform: 'uppercase',
                      background: p.paymentStatus === 'paid' ? 'rgba(90,138,106,0.15)' : 'rgba(100,116,139,0.15)',
                      color: p.paymentStatus === 'paid' ? 'var(--success)' : 'var(--text-light)' }}>
                      {p.paymentStatus}
                    </span>
                  </td>
                  <td>
                    <button className="btn btn-secondary" style={{ padding: '0.3rem 0.7rem', fontSize: '0.78rem' }}
                      onClick={() => api.get(`/purchase-orders/${p.id}`).then((res) => setPoDetail(res.data))}>View</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* PO editor + detail + receive/pay modals — see PoModals below */}
        <PoModals
          poForm={poForm} setPoForm={setPoForm}
          poDetail={poDetail} setPoDetail={setPoDetail}
          receiveForm={receiveForm} setReceiveForm={setReceiveForm}
          payForm={payForm} setPayForm={setPayForm}
          suppliers={suppliers} locations={locations} products={products}
          currency={CURRENCY}
          refresh={() => api.get('/purchase-orders', { params: poFilter }).then((res) => setPurchaseOrders(res.data))}
          onReceived={onProductsChanged}
        />
      </div>
    )}

    {tab === 'purchase-returns' && (
      <div className="admin-section">
        <div className="admin-section-header">
          <h2>Purchase Returns</h2>
          <button className="btn btn-primary" onClick={() => setPrForm({
            supplierId: '', locationId: '', purchaseOrderId: '', items: [], refundMethod: 'credit_note', reason: '', notes: '',
          })}><HiPlus /> New Purchase Return</button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end', marginBottom: '1.5rem', padding: '1rem', background: 'var(--surface-alt, #f8f9fa)', borderRadius: 8 }}>
          <div><label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>From</label>
            <input type="date" value={prFilter.from} onChange={(e) => setPrFilter({ ...prFilter, from: e.target.value })} /></div>
          <div><label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>To</label>
            <input type="date" value={prFilter.to} onChange={(e) => setPrFilter({ ...prFilter, to: e.target.value })} /></div>
          <div><label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Supplier</label>
            <select value={prFilter.supplierId} onChange={(e) => setPrFilter({ ...prFilter, supplierId: e.target.value })}>
              <option value="">All</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div><label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Location</label>
            <select value={prFilter.locationId} onChange={(e) => setPrFilter({ ...prFilter, locationId: e.target.value })}>
              <option value="">All</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <button className="btn btn-secondary" onClick={() => setPrFilter({ from: '', to: '', supplierId: '', locationId: '' })}>Clear</button>
        </div>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Date</th><th>Return #</th><th>Supplier</th><th>Location</th><th>Method</th><th style={{ textAlign: 'right' }}>Total</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {purchaseReturns.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-light)' }}>No purchase returns</td></tr>}
              {purchaseReturns.map((r) => (
                <tr key={r.id} style={{ opacity: r.status === 'cancelled' ? 0.5 : 1 }}>
                  <td style={{ fontSize: '0.82rem' }}>{new Date(r.createdAt).toLocaleDateString()}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{r.returnNumber}</td>
                  <td>{r.Supplier?.name || '—'}</td>
                  <td>{r.Location?.name || '—'}</td>
                  <td style={{ textTransform: 'capitalize' }}>{r.refundMethod.replace('_', ' ')}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{CURRENCY}{parseFloat(r.totalAmount).toFixed(3)}</td>
                  <td>
                    <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '0.2rem 0.5rem', borderRadius: '100px', textTransform: 'uppercase',
                      background: r.status === 'completed' ? 'rgba(90,138,106,0.15)' : 'rgba(220,38,38,0.15)',
                      color: r.status === 'completed' ? 'var(--success)' : 'var(--danger)' }}>{r.status}</span>
                  </td>
                  <td><button className="btn btn-secondary" style={{ padding: '0.3rem 0.7rem', fontSize: '0.78rem' }}
                      onClick={() => api.get(`/purchase-returns/${r.id}`).then((res) => setPrDetail(res.data))}>View</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <PurchaseReturnModals
          prForm={prForm} setPrForm={setPrForm}
          prDetail={prDetail} setPrDetail={setPrDetail}
          suppliers={suppliers} locations={locations} products={products}
          currency={CURRENCY} isAdmin={isAdmin}
          refresh={() => api.get('/purchase-returns', { params: prFilter }).then((res) => setPurchaseReturns(res.data))}
        />
      </div>
    )}
    </>
  );
}
