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

const money = (currency, n) => `${currency}${(parseFloat(n) || 0).toFixed(3)}`;

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
function WastageTab({ currency, locations = [], products = [], cashAccounts = [], expenseCategories = [] }) {
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
        <button type="button" className="btn-primary" onClick={() => setShowNew(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
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
                  {w.Product?.nameAr && <div style={{ fontSize: '0.78rem', color: 'var(--text-light)', direction: 'rtl' }}>{w.Product.nameAr}</div>}
                </td>
                <td>{w.Location?.name || '—'}</td>
                <td style={right}>{parseFloat(w.quantity)}</td>
                <td>{REASON_LABEL[w.reason] || w.reason}</td>
                <td style={{ ...right, color: 'var(--danger)' }}>{money(currency, w.totalCost)}</td>
                <td>{w.creator?.name || '—'}</td>
                <td style={right}>
                  <button type="button" className="btn-secondary" onClick={() => cancel(w)}>Reverse</button>
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
          cashAccounts={cashAccounts}
          expenseCategories={expenseCategories}
          onClose={() => setShowNew(false)}
          onSaved={() => { setShowNew(false); load(); }}
        />
      )}
    </div>
  );
}

function WastageModal({ locations, products, cashAccounts, expenseCategories, onClose, onSaved }) {
  const [form, setForm] = useState({
    productId: '', locationId: locations[0]?.id || '', quantity: '',
    reason: 'damaged', notes: '', wastageDate: localDate(),
    expenseCategoryId: '', cashAccountId: '',
  });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const product = products.find((p) => String(p.id) === String(form.productId));
  const estValue = (parseFloat(product?.costPrice) || 0) * (parseFloat(form.quantity) || 0);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.productId) return toast.error('Pick a product');
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
        <select value={form.productId} onChange={(e) => set('productId', e.target.value)} style={{ width: '100%', marginBottom: '0.75rem' }}>
          <option value="">Select…</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

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

        <div style={{ padding: '0.75rem', borderRadius: 8, background: 'var(--surface-alt,#f8f9fa)', marginBottom: '0.75rem' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-light)', marginBottom: '0.5rem' }}>
            Optional — also book this as an expense so it shows in the P&amp;L. Leave blank to only adjust stock.
          </div>
          <label style={dlbl}>Expense category</label>
          <select value={form.expenseCategoryId} onChange={(e) => set('expenseCategoryId', e.target.value)} style={{ width: '100%', marginBottom: '0.5rem' }}>
            <option value="">None</option>
            {expenseCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <label style={dlbl}>Paid from account</label>
          <select value={form.cashAccountId} onChange={(e) => set('cashAccountId', e.target.value)} style={{ width: '100%' }}>
            <option value="">None</option>
            {cashAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>

        {estValue > 0 && (
          <p style={{ fontSize: '0.85rem', marginBottom: '1rem' }}>
            Estimated write-off value: <strong style={{ color: 'var(--danger)' }}>{estValue.toFixed(3)}</strong>
          </p>
        )}

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Record'}</button>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

function Modal({ title, children, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface, #fff)', borderRadius: 10, padding: '1.5rem',
          width: 'min(480px,100%)', maxHeight: '90vh', overflowY: 'auto',
        }}
      >
        <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>{title}</h3>
        {children}
      </div>
    </div>
  );
}
