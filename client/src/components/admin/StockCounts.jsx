/**
 * Stock counts (physical inventory / cycle count) admin UI.
 *
 * Routes:
 *   List view  →  table of counts, "New count" button, link into detail
 *   Detail view →  one count: search bar to add lines, line table with
 *                   inline countedQty inputs, variance summary, Post / Cancel
 *   Variance report → totals + per-location + top-loss items
 *
 * The component owns all its own state — Admin.jsx just renders <StockCounts
 * tab={tab} currency={CURRENCY} isAdmin={isAdmin} />.
 */
import { useEffect, useState, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import { HiPlus, HiTrash, HiArrowLeft, HiSearch } from 'react-icons/hi';
import api from '../../api/axios';

export default function StockCounts(props) {
  const { tab } = props;
  if (tab === 'stock-counts') return <StockCountsList {...props} />;
  if (tab === 'stock-count-detail') return <StockCountDetail {...props} />;
  if (tab === 'variance-report') return <VarianceReport {...props} />;
  return null;
}

// ─────────────────────────────────────────────────────────────────
// List view
// ─────────────────────────────────────────────────────────────────
function StockCountsList({ currency, locations, setTab, setActiveStockCountId }) {
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState({ locationId: '', status: '' });
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState({ locationId: '', scope: 'partial', notes: '' });

  const load = useCallback(() => {
    const params = {};
    if (filter.locationId) params.locationId = filter.locationId;
    if (filter.status) params.status = filter.status;
    api.get('/stock-counts', { params }).then((r) => setRows(r.data));
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const create = async (e) => {
    e.preventDefault();
    if (!newForm.locationId) return toast.error('Pick a location');
    try {
      const { data } = await api.post('/stock-counts', newForm);
      toast.success(`Started ${data.countNumber}`);
      setShowNew(false);
      setNewForm({ locationId: '', scope: 'partial', notes: '' });
      setActiveStockCountId(data.id);
      setTab('stock-count-detail');
    } catch (err) {
      toast.error(err.response?.data?.message || err.message);
    }
  };

  const STATUS_STYLE = {
    draft:       { bg: 'rgba(100,116,139,0.15)', fg: 'var(--text-light)' },
    in_progress: { bg: 'rgba(245,158,11,0.18)',  fg: '#b45309' },
    posted:      { bg: 'rgba(90,138,106,0.18)',  fg: 'var(--success)' },
    cancelled:   { bg: 'rgba(239,68,68,0.15)',   fg: 'var(--danger)' },
  };

  return (
    <div className="admin-section">
      <div className="admin-section-header">
        <h2>Stock Counts</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-secondary" onClick={() => setTab('variance-report')}>Variance Report</button>
          <button className="btn btn-primary" onClick={() => setShowNew(true)}><HiPlus /> New Count</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <select value={filter.locationId} onChange={(e) => setFilter({ ...filter, locationId: e.target.value })}>
          <option value="">All locations</option>
          {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <select value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}>
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="in_progress">In progress</option>
          <option value="posted">Posted</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead><tr>
            <th>Number</th><th>Location</th><th>Scope</th><th>Status</th>
            <th style={{ textAlign: 'right' }}>Variance (qty)</th>
            <th style={{ textAlign: 'right' }}>Variance (value)</th>
            <th>Posted at</th><th>Posted by</th>
          </tr></thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-light)' }}>No counts yet</td></tr>
            )}
            {rows.map((r) => {
              const sty = STATUS_STYLE[r.status] || STATUS_STYLE.draft;
              const value = parseFloat(r.totalVarianceValue) || 0;
              return (
                <tr key={r.id} style={{ cursor: 'pointer' }}
                    onClick={() => { setActiveStockCountId(r.id); setTab('stock-count-detail'); }}>
                  <td style={{ fontWeight: 500 }}>{r.countNumber}</td>
                  <td>{r.Location?.name || '—'}</td>
                  <td style={{ textTransform: 'capitalize' }}>{r.scope}</td>
                  <td>
                    <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '0.2rem 0.5rem',
                      borderRadius: 100, background: sty.bg, color: sty.fg, textTransform: 'uppercase' }}>
                      {r.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>{r.status === 'posted' ? r.totalVarianceQty : '—'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600,
                    color: r.status !== 'posted' ? 'inherit' : value < 0 ? 'var(--danger)' : value > 0 ? 'var(--success)' : 'inherit' }}>
                    {r.status === 'posted' ? `${currency}${value.toFixed(3)}` : '—'}
                  </td>
                  <td>{r.postedAt ? new Date(r.postedAt).toLocaleString() : '—'}</td>
                  <td>{r.poster?.name || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showNew && (
        <div className="admin-form-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowNew(false); }}>
          <form className="admin-form" onSubmit={create}>
            <h3>New Stock Count</h3>
            <label>Location *
              <select value={newForm.locationId} onChange={(e) => setNewForm({ ...newForm, locationId: e.target.value })} required>
                <option value="">— pick one —</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </label>
            <label>Scope
              <select value={newForm.scope} onChange={(e) => setNewForm({ ...newForm, scope: e.target.value })}>
                <option value="partial">Partial (only listed SKUs)</option>
                <option value="full">Full (all SKUs at location)</option>
              </select>
            </label>
            <label>Notes
              <textarea rows={3} value={newForm.notes} onChange={(e) => setNewForm({ ...newForm, notes: e.target.value })} />
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowNew(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Start Count</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Detail view
// ─────────────────────────────────────────────────────────────────
function StockCountDetail({ currency, setTab, activeStockCountId, expenseCategories, cashAccounts }) {
  const [sc, setSc] = useState(null);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [variantPicker, setVariantPicker] = useState(null);
  const [showPost, setShowPost] = useState(false);
  const [postForm, setPostForm] = useState({ expenseCategoryId: '', cashAccountId: '' });
  const searchRef = useRef(null);

  const load = useCallback(() => {
    if (!activeStockCountId) return;
    api.get(`/stock-counts/${activeStockCountId}`).then((r) => setSc(r.data));
  }, [activeStockCountId]);

  useEffect(() => { load(); }, [load]);

  // Debounced search
  useEffect(() => {
    if (!search.trim() || !sc) {
      if (results.length) setResults([]);
      return;
    }
    const t = setTimeout(() => {
      api.get('/stock-counts/lookup', { params: { q: search.trim(), locationId: sc.locationId } })
        .then((r) => setResults(r.data))
        .catch(() => setResults([]));
    }, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, sc]);

  const locked = sc && (sc.status === 'posted' || sc.status === 'cancelled');

  const addLine = async (productId, variantIndex) => {
    try {
      await api.post(`/stock-counts/${sc.id}/lines`, { productId, variantIndex });
      setSearch(''); setResults([]); setVariantPicker(null);
      searchRef.current?.focus();
      load();
    } catch (err) {
      const msg = err.response?.data?.message;
      if (err.response?.status === 409) toast(msg);
      else toast.error(msg || err.message);
    }
  };

  const updateLine = async (lineId, patch) => {
    try {
      await api.put(`/stock-counts/${sc.id}/lines/${lineId}`, patch);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message);
    }
  };

  const removeLine = async (lineId) => {
    if (!confirm('Remove this line?')) return;
    try {
      await api.delete(`/stock-counts/${sc.id}/lines/${lineId}`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message);
    }
  };

  const cancel = async () => {
    if (!confirm('Cancel this count? Lines will be kept for audit.')) return;
    try {
      await api.post(`/stock-counts/${sc.id}/cancel`);
      toast.success('Cancelled');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message);
    }
  };

  const post = async (e) => {
    e.preventDefault();
    try {
      const body = { ...postForm };
      // Strip empty optional fields so the server doesn't try to write a
      // zero-amount Expense.
      if (!body.expenseCategoryId) delete body.expenseCategoryId;
      if (!body.cashAccountId) delete body.cashAccountId;
      await api.post(`/stock-counts/${sc.id}/post`, body);
      toast.success('Posted');
      setShowPost(false);
      setPostForm({ expenseCategoryId: '', cashAccountId: '' });
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message);
    }
  };

  if (!sc) {
    return (
      <div className="admin-section">
        <button className="link-btn" onClick={() => setTab('stock-counts')}><HiArrowLeft /> Back to counts</button>
        <p style={{ marginTop: '1rem', color: 'var(--text-light)' }}>Loading…</p>
      </div>
    );
  }

  // Aggregate variance preview (before post)
  const linesArr = sc.lines || [];
  const countedLines = linesArr.filter((l) => l.countedQty != null);
  const previewQty = countedLines.reduce((s, l) => s + ((l.countedQty || 0) - (l.expectedQty || 0)), 0);

  return (
    <div className="admin-section">
      <button className="link-btn" onClick={() => setTab('stock-counts')} style={{ marginBottom: '1rem' }}>
        <HiArrowLeft /> Back to counts
      </button>

      <div className="admin-section-header" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <h2 style={{ margin: 0 }}>{sc.countNumber}</h2>
          <div style={{ color: 'var(--text-light)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
            {sc.Location?.name} · {sc.scope} · {sc.status.replace('_', ' ')}
            {sc.creator?.name && ` · started by ${sc.creator.name}`}
            {sc.postedAt && ` · posted ${new Date(sc.postedAt).toLocaleString()}`}
          </div>
        </div>
        {!locked && (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-secondary" onClick={cancel}>Cancel Count</button>
            <button className="btn btn-primary" disabled={countedLines.length === 0}
                    onClick={() => setShowPost(true)}>Post Count</button>
          </div>
        )}
      </div>

      {!locked && (
        <div style={{ marginTop: '1rem', marginBottom: '1rem', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <HiSearch style={{ color: 'var(--text-light)' }} />
            <input
              ref={searchRef}
              type="text"
              placeholder="Scan barcode or search by name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ flex: 1, fontSize: '1rem', padding: '0.6rem 0.75rem' }}
              autoFocus
            />
          </div>
          {results.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
              background: 'var(--card-bg, #fff)', border: '1px solid var(--border, #e2e8f0)',
              borderRadius: 8, maxHeight: 360, overflow: 'auto', marginTop: 4,
              boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
            }}>
              {results.map((r) => (
                <div key={`${r.productId}:${r.variantIndex}`}
                     onClick={() => r.hasVariants ? setVariantPicker(r) : addLine(r.productId, r.variantIndex)}
                     style={{ padding: '0.6rem 0.75rem', cursor: 'pointer', borderBottom: '1px solid var(--border, #e2e8f0)',
                              display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <div>
                    <div>{r.name}{r.hasVariants && <span style={{ color: 'var(--text-light)', marginLeft: 6 }}>(pick variant)</span>}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-light)' }}>
                      {r.sku && <span style={{ fontFamily: 'monospace' }}>{r.sku} · </span>}
                      Cost {currency}{(r.costPrice || 0).toFixed(3)}
                    </div>
                  </div>
                  {!r.hasVariants && (
                    <div style={{ fontSize: 12, color: 'var(--text-light)' }}>
                      stock: <strong>{r.stockAtLocation}</strong>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {variantPicker && (
        <div className="admin-form-overlay" onClick={(e) => { if (e.target === e.currentTarget) setVariantPicker(null); }}>
          <div className="admin-form" style={{ maxWidth: 480 }}>
            <h3>Pick variant — {variantPicker.name}</h3>
            <div style={{ display: 'grid', gap: 6, maxHeight: 360, overflow: 'auto' }}>
              {(variantPicker.variants || []).map((v, idx) => (
                <button key={idx} className="btn btn-secondary"
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                        onClick={() => addLine(variantPicker.productId, idx)}>
                  <span>{Object.values(v.options || {}).join(' / ')}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-light)', fontFamily: 'monospace' }}>
                    {v.sku} · stock {v.stockAtLocation || 0}
                  </span>
                </button>
              ))}
            </div>
            <button className="btn btn-secondary" onClick={() => setVariantPicker(null)} style={{ marginTop: '0.5rem' }}>Close</button>
          </div>
        </div>
      )}

      {/* Variance preview / posted totals */}
      <div className="dash-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
        <div className="dash-card">
          <div className="dash-card-label">Lines</div>
          <div className="dash-card-value">{linesArr.length}</div>
        </div>
        <div className="dash-card">
          <div className="dash-card-label">Counted</div>
          <div className="dash-card-value">{countedLines.length}</div>
        </div>
        <div className="dash-card">
          <div className="dash-card-label">{locked ? 'Total variance (qty)' : 'Variance preview (qty)'}</div>
          <div className="dash-card-value" style={{ color: previewQty < 0 ? 'var(--danger)' : previewQty > 0 ? 'var(--success)' : 'inherit' }}>
            {locked ? sc.totalVarianceQty : previewQty}
          </div>
        </div>
        {locked && (
          <div className="dash-card">
            <div className="dash-card-label">Variance value</div>
            <div className="dash-card-value" style={{ color: (sc.totalVarianceValue || 0) < 0 ? 'var(--danger)' : 'inherit' }}>
              {currency}{parseFloat(sc.totalVarianceValue || 0).toFixed(3)}
            </div>
          </div>
        )}
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead><tr>
            <th>Item</th><th>SKU</th>
            <th style={{ textAlign: 'right' }}>Expected</th>
            <th style={{ textAlign: 'right' }}>Counted</th>
            <th style={{ textAlign: 'right' }}>Variance</th>
            {locked && <th style={{ textAlign: 'right' }}>Value</th>}
            <th>Reason</th>
            {!locked && <th></th>}
          </tr></thead>
          <tbody>
            {linesArr.length === 0 && (
              <tr><td colSpan={locked ? 7 : 7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-light)' }}>
                {locked ? 'No lines on this count.' : 'Scan or search a SKU above to add a line.'}
              </td></tr>
            )}
            {linesArr.map((l) => {
              const variance = l.countedQty != null ? l.countedQty - l.expectedQty : null;
              return (
                <tr key={l.id}>
                  <td>{l.name}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{l.sku || '—'}</td>
                  <td style={{ textAlign: 'right' }}>{l.expectedQty}</td>
                  <td style={{ textAlign: 'right' }}>
                    {locked ? l.countedQty : (
                      <input type="number" value={l.countedQty ?? ''} style={{ width: 70, textAlign: 'right' }}
                             onChange={(e) => updateLine(l.id, { countedQty: e.target.value })} />
                    )}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600,
                    color: variance == null ? 'inherit' : variance < 0 ? 'var(--danger)' : variance > 0 ? 'var(--success)' : 'inherit' }}>
                    {variance == null ? '—' : (variance > 0 ? `+${variance}` : variance)}
                  </td>
                  {locked && (
                    <td style={{ textAlign: 'right',
                      color: (l.varianceValue || 0) < 0 ? 'var(--danger)' : 'inherit' }}>
                      {currency}{parseFloat(l.varianceValue || 0).toFixed(3)}
                    </td>
                  )}
                  <td>
                    {locked ? (l.reason || '—') : (
                      <input type="text" value={l.reason || ''} placeholder="optional"
                             onChange={(e) => updateLine(l.id, { reason: e.target.value })}
                             style={{ width: '100%' }} />
                    )}
                  </td>
                  {!locked && (
                    <td><button className="icon-btn" onClick={() => removeLine(l.id)}><HiTrash /></button></td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {sc.notes && <p style={{ marginTop: '1rem', color: 'var(--text-light)' }}>Notes: {sc.notes}</p>}

      {showPost && (
        <div className="admin-form-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowPost(false); }}>
          <form className="admin-form" onSubmit={post}>
            <h3>Post Count</h3>
            <p style={{ color: 'var(--text-light)', fontSize: 13 }}>
              Counted quantities will overwrite per-location stock. Optionally
              capture net shrinkage as an Expense to keep P&L accurate.
            </p>
            <label>Shrinkage expense category (optional)
              <select value={postForm.expenseCategoryId} onChange={(e) => setPostForm({ ...postForm, expenseCategoryId: e.target.value })}>
                <option value="">— skip expense —</option>
                {(expenseCategories || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label>Pay from cash account (optional)
              <select value={postForm.cashAccountId} onChange={(e) => setPostForm({ ...postForm, cashAccountId: e.target.value })}>
                <option value="">— skip expense —</option>
                {(cashAccounts || []).filter((a) => a.active).map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowPost(false)}>Close</button>
              <button type="submit" className="btn btn-primary">Post Count</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Variance report
// ─────────────────────────────────────────────────────────────────
function VarianceReport({ currency, locations, setTab }) {
  const [filter, setFilter] = useState(() => {
    const to = new Date();
    const from = new Date(); from.setDate(from.getDate() - 30);
    return { locationId: '', from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
  });
  const [data, setData] = useState(null);

  const load = useCallback(() => {
    const params = { from: filter.from, to: filter.to };
    if (filter.locationId) params.locationId = filter.locationId;
    api.get('/stock-counts/report/variance', { params }).then((r) => setData(r.data));
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="admin-section">
      <button className="link-btn" onClick={() => setTab('stock-counts')} style={{ marginBottom: '1rem' }}>
        <HiArrowLeft /> Back to counts
      </button>
      <h2>Variance Report</h2>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <select value={filter.locationId} onChange={(e) => setFilter({ ...filter, locationId: e.target.value })}>
          <option value="">All locations</option>
          {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <input type="date" value={filter.from} onChange={(e) => setFilter({ ...filter, from: e.target.value })} />
        <input type="date" value={filter.to} onChange={(e) => setFilter({ ...filter, to: e.target.value })} />
      </div>

      {!data ? <p style={{ color: 'var(--text-light)' }}>Loading…</p> : (
        <>
          <div className="dash-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <div className="dash-card">
              <div className="dash-card-label">Posted counts</div>
              <div className="dash-card-value">{data.totalCounts}</div>
            </div>
            <div className="dash-card">
              <div className="dash-card-label">Shrinkage value</div>
              <div className="dash-card-value" style={{ color: 'var(--danger)' }}>{currency}{data.totalShrinkageValue.toFixed(3)}</div>
            </div>
            <div className="dash-card">
              <div className="dash-card-label">Surplus value</div>
              <div className="dash-card-value" style={{ color: 'var(--success)' }}>{currency}{data.totalSurplusValue.toFixed(3)}</div>
            </div>
            <div className="dash-card">
              <div className="dash-card-label">Net</div>
              <div className="dash-card-value" style={{ color: data.netVarianceValue < 0 ? 'var(--danger)' : 'inherit' }}>
                {currency}{data.netVarianceValue.toFixed(3)}
              </div>
            </div>
          </div>

          <h3>By Location</h3>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Location</th><th style={{ textAlign: 'right' }}>Counts</th>
                <th style={{ textAlign: 'right' }}>Shrinkage</th>
                <th style={{ textAlign: 'right' }}>Surplus</th></tr></thead>
              <tbody>
                {data.byLocation.length === 0 && (
                  <tr><td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-light)' }}>No posted counts in this range</td></tr>
                )}
                {data.byLocation.map((b) => (
                  <tr key={b.locationId}>
                    <td>{b.locationName}</td>
                    <td style={{ textAlign: 'right' }}>{b.counts}</td>
                    <td style={{ textAlign: 'right', color: 'var(--danger)' }}>{currency}{b.shrinkageValue.toFixed(3)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--success)' }}>{currency}{b.surplusValue.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 style={{ marginTop: '1.5rem' }}>Top Shrinkage Items</h3>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Item</th><th>SKU</th>
                <th style={{ textAlign: 'right' }}>Qty lost</th>
                <th style={{ textAlign: 'right' }}>Value lost</th></tr></thead>
              <tbody>
                {data.topLoss.length === 0 && (
                  <tr><td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-light)' }}>No shrinkage in this range</td></tr>
                )}
                {data.topLoss.map((i) => (
                  <tr key={`${i.productId}:${i.variantIndex}`}>
                    <td>{i.name}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{i.sku || '—'}</td>
                    <td style={{ textAlign: 'right' }}>{i.totalQty}</td>
                    <td style={{ textAlign: 'right', color: 'var(--danger)' }}>{currency}{i.totalValue.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
