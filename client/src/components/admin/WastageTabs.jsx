/**
 * Wastage log — write-offs of damaged, defective, lost or sample stock.
 *
 * Log of write-offs with totals by reason, plus a "Record wastage" modal
 * that deducts stock and can book the cost to the P&L as an Expense.
 */
import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { HiPlus } from 'react-icons/hi';
import api from '../../api/axios';
import { localDate } from '../../lib/utils';
import { CURRENCY_DECIMALS } from '../../utils/currency';

export default function WastageTabs(props) {
  const { tab } = props;
  if (tab === 'wastage') return <WastageTab {...props} />;
  return null;
}

const dlbl = { display: 'block', fontSize: '0.75rem', color: 'var(--text-light)', marginBottom: '0.25rem' };
const filterBar = {
  display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end',
  marginBottom: '1.25rem', padding: '1rem', background: 'var(--surface-alt, #f8f9fa)', borderRadius: 8,
};
const cardGrid = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))',
  gap: '0.75rem', marginBottom: '1.25rem',
};
const right = { textAlign: 'right' };
const empty = { textAlign: 'center', padding: '2rem', color: 'var(--text-light)' };

const money = (currency, n) => `${currency}${(parseFloat(n) || 0).toFixed(CURRENCY_DECIMALS)}`;

// Must match the Wastage.reason ENUM on the server.
const REASON_LABEL = {
  damaged: 'Damaged', defective: 'Defective', lost: 'Lost / missing',
  theft: 'Theft', sample: 'Sample / giveaway', other: 'Other',
};

function defaultRange(days = 30) {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);
  return { from: localDate(from), to: localDate(to) };
}

// ─── Wastage ───────────────────────────────────────────────────────
function WastageTab({ currency, locations = [], products = [] }) {
  const [filter, setFilter] = useState({ ...defaultRange(30), locationId: '', reason: '' });
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [showNew, setShowNew] = useState(false);
  // Starts true: the first load is already in flight on mount.
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    const params = { from: filter.from, to: filter.to };
    if (filter.locationId) params.locationId = filter.locationId;
    if (filter.reason) params.reason = filter.reason;
    Promise.all([
      api.get('/wastage', { params }),
      api.get('/wastage/summary', { params }),
    ])
      .then(([a, b]) => { setRows(a.data); setSummary(b.data); })
      .catch((e) => toast.error(e.response?.data?.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const cancel = async (row) => {
    if (!window.confirm(`Cancel ${row.wastageNumber}? The stock will be added back.`)) return;
    try {
      await api.post(`/wastage/${row.id}/cancel`);
      toast.success('Write-off reversed');
      load();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Cancel failed');
    }
  };

  return (
    <div className="admin-section">
      <div className="admin-section-header">
        <h2>Wastage</h2>
        <button type="button" className="btn btn-primary" onClick={() => setShowNew(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
          <HiPlus /> Record wastage
        </button>
      </div>

      <div style={filterBar}>
        <div><label style={dlbl}>From</label><input type="date" value={filter.from} onChange={(e) => setFilter({ ...filter, from: e.target.value })} /></div>
        <div><label style={dlbl}>To</label><input type="date" value={filter.to} onChange={(e) => setFilter({ ...filter, to: e.target.value })} /></div>
        <div><label style={dlbl}>Reason</label>
          <select value={filter.reason} onChange={(e) => setFilter({ ...filter, reason: e.target.value })}>
            <option value="">All</option>
            {Object.entries(REASON_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        {locations.length > 0 && (
          <div><label style={dlbl}>Location</label>
            <select value={filter.locationId} onChange={(e) => setFilter({ ...filter, locationId: e.target.value })}>
              <option value="">All</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        )}
      </div>

      {summary && (
        <div className="dash-cards" style={cardGrid}>
          <div className="dash-card">
            <div className="dash-card-label">Total written off</div>
            <div className="dash-card-value" style={{ color: 'var(--danger)' }}>{money(currency, summary.totalCost)}</div>
          </div>
          {summary.byReason.map((r) => (
            <div className="dash-card" key={r.reason}>
              <div className="dash-card-label">{REASON_LABEL[r.reason] || r.reason}</div>
              <div className="dash-card-value">{money(currency, r.totalCost)}</div>
            </div>
          ))}
        </div>
      )}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Ref</th><th>Date</th><th>Product</th><th>Location</th>
              <th style={right}>Qty</th><th>Reason</th><th style={right}>Value</th>
              <th>By</th><th style={right}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={9} style={empty}>Loading…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={9} style={empty}>No wastage recorded in this period</td></tr>}
            {!loading && rows.map((w) => (
              <tr key={w.id}>
                <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{w.wastageNumber}</td>
                <td>{w.wastageDate}</td>
                <td>
                  {w.Product?.name || '—'}
                  {w.variantIndex != null && w.Product?.variants?.[w.variantIndex] && (
                    <span style={{ color: 'var(--text-light)' }}> ({Object.values(w.Product.variants[w.variantIndex].options || {}).join(' / ')})</span>
                  )}
                  {w.Product?.nameAr && <div style={{ fontSize: '0.78rem', color: 'var(--text-light)', direction: 'rtl' }}>{w.Product.nameAr}</div>}
                </td>
                <td>{w.Location?.name || '—'}</td>
                <td style={right}>{parseFloat(w.quantity)}</td>
                <td>{REASON_LABEL[w.reason] || w.reason}</td>
                <td style={{ ...right, color: 'var(--danger)' }}>{money(currency, w.totalCost)}</td>
                <td>{w.creator?.name || '—'}</td>
                <td style={right}>
                  <button type="button" className="btn btn-secondary" onClick={() => cancel(w)}>Reverse</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showNew && (
        <WastageModal
          locations={locations}
          products={products}
          onClose={() => setShowNew(false)}
          onSaved={() => { setShowNew(false); load(); }}
        />
      )}
    </div>
  );
}

function WastageModal({ locations, products, onClose, onSaved }) {
  const [form, setForm] = useState({
    productId: '', variantIndex: '', locationId: locations[0]?.id || '', quantity: '',
    reason: 'damaged', notes: '', wastageDate: localDate(),
  });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const product = products.find((p) => String(p.id) === String(form.productId));
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  const variant = form.variantIndex !== '' ? variants[parseInt(form.variantIndex, 10)] : null;
  const unitCost = parseFloat(variant?.costPrice ?? product?.costPrice) || 0;
  const estValue = unitCost * (parseFloat(form.quantity) || 0);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.productId) return toast.error('Pick a product');
    if (variants.length && form.variantIndex === '') return toast.error('Pick a size');
    if (!form.locationId) return toast.error('Pick a location');
    if (!(parseFloat(form.quantity) > 0)) return toast.error('Quantity must be greater than 0');

    setSaving(true);
    try {
      await api.post('/wastage', form);
      toast.success('Wastage recorded — stock updated');
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to record');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Record wastage" onClose={onClose}>
      <form onSubmit={submit}>
        <label style={dlbl}>Product *</label>
        <select value={form.productId} onChange={(e) => setForm((f) => ({ ...f, productId: e.target.value, variantIndex: '' }))} style={{ width: '100%', marginBottom: '0.75rem' }}>
          <option value="">Select…</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        {variants.length > 0 && (
          <>
            <label style={dlbl}>Size / variant *</label>
            <select value={form.variantIndex} onChange={(e) => set('variantIndex', e.target.value)} style={{ width: '100%', marginBottom: '0.75rem' }}>
              <option value="">Select…</option>
              {variants.map((v, i) => (
                <option key={i} value={i}>{Object.values(v.options || {}).join(' / ') || `Variant ${i + 1}`}{v.sku ? ` — ${v.sku}` : ''}</option>
              ))}
            </select>
          </>
        )}

        <label style={dlbl}>Location *</label>
        <select value={form.locationId} onChange={(e) => set('locationId', e.target.value)} style={{ width: '100%', marginBottom: '0.75rem' }}>
          <option value="">Select…</option>
          {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>

        <label style={dlbl}>Quantity *</label>
        <input type="number" step="1" min="1" value={form.quantity}
          onChange={(e) => set('quantity', e.target.value)} style={{ width: '100%', marginBottom: '0.75rem' }} />

        <label style={dlbl}>Reason *</label>
        <select value={form.reason} onChange={(e) => set('reason', e.target.value)} style={{ width: '100%', marginBottom: '0.75rem' }}>
          {Object.entries(REASON_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>

        <label style={dlbl}>Date</label>
        <input type="date" value={form.wastageDate} onChange={(e) => set('wastageDate', e.target.value)} style={{ width: '100%', marginBottom: '0.75rem' }} />

        <label style={dlbl}>Notes</label>
        <textarea rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} style={{ width: '100%', marginBottom: '0.75rem' }} />

        <p style={{ fontSize: '0.8rem', color: 'var(--text-light)', marginBottom: '0.75rem' }}>
          The cost shows in the P&amp;L as a stock loss. No cash account is touched — nothing was paid out.
        </p>

        {estValue > 0 && (
          <p style={{ fontSize: '0.85rem', marginBottom: '1rem' }}>
            Estimated write-off value: <strong style={{ color: 'var(--danger)' }}>{estValue.toFixed(CURRENCY_DECIMALS)}</strong>
          </p>
        )}

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Record'}</button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

// Same overlay + panel classes as the PO modals, so the ERP theme's backdrop
// and input styling (scoped to .admin-form) apply here too.
function Modal({ title, children, onClose }) {
  return (
    <div className="admin-form-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="admin-form" style={{ maxWidth: 480 }}>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}
