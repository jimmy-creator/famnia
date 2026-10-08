/**
 * Fixed assets, owner capital and the balance sheet.
 *
 * Each component owns its own state — Admin.jsx just renders
 * <AssetsTabs tab={tab} … /> with the shared lookups. This follows
 * StockCounts.jsx rather than FinanceTabs.jsx, which prop-drills ~20
 * values and is why Admin.jsx carries so much finance state.
 *
 * Legacy admin CSS throughout (admin-section, admin-table, dash-cards,
 * admin-form-overlay, btn …) to match every sibling in this folder.
 */
import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { HiPlus, HiTrash } from 'react-icons/hi';
import api from '../../api/axios';
import { CURRENCY_DECIMALS, PRICE_STEP } from '../../utils/currency';

export default function AssetsTabs(props) {
  const { tab } = props;
  if (tab === 'fixed-assets') return <FixedAssetsTab {...props} />;
  if (tab === 'capital') return <CapitalTab {...props} />;
  if (tab === 'balance-sheet') return <BalanceSheetTab {...props} />;
  return null;
}

const dlbl = { fontSize: '0.72rem', color: 'var(--text-light)', display: 'block', marginBottom: 2 };
// Sign goes BEFORE the currency code — "−QAR350.000", not "QAR-350.000".
const money = (c, n) => {
  const v = parseFloat(n) || 0;
  return `${v < 0 ? '−' : ''}${c}${Math.abs(v).toFixed(CURRENCY_DECIMALS)}`;
};
const err = (e) => toast.error(e.response?.data?.message || e.message);

const CATEGORIES = [
  { v: 'furniture', l: 'Furniture' },
  { v: 'fixtures', l: 'Fixtures & fit-out' },
  { v: 'equipment', l: 'Equipment' },
  { v: 'computer', l: 'Computer & POS' },
  { v: 'vehicle', l: 'Vehicle' },
  { v: 'leasehold', l: 'Leasehold improvements' },
  { v: 'other', l: 'Other' },
];
const CAT_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.v, c.l]));

const STATUS_STYLE = {
  active: { bg: 'rgba(90,138,106,0.15)', fg: 'var(--success)' },
  fully_depreciated: { bg: 'rgba(100,116,139,0.15)', fg: 'var(--text-light)' },
  disposed: { bg: 'rgba(100,116,139,0.15)', fg: 'var(--text-light)' },
  written_off: { bg: 'rgba(190,80,80,0.15)', fg: 'var(--danger)' },
};

function StatusPill({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.active;
  return (
    <span style={{
      fontSize: '0.7rem', fontWeight: 600, padding: '0.2rem 0.5rem',
      borderRadius: '100px', background: s.bg, color: s.fg, whiteSpace: 'nowrap',
    }}>
      {String(status).replace(/_/g, ' ').toUpperCase()}
    </span>
  );
}

// ─── Fixed assets ───────────────────────────────────────────────────

function FixedAssetsTab({ currency, isAdmin, locations = [], cashAccounts = [] }) {
  const [data, setData] = useState({ totals: {}, assets: [] });
  const [filter, setFilter] = useState({ status: '', category: '', includeDisposed: false });
  const [form, setForm] = useState(null);
  const [disposeFor, setDisposeFor] = useState(null);
  const [detail, setDetail] = useState(null);
  const [running, setRunning] = useState(false);

  const load = useCallback(() => {
    const params = {};
    if (filter.status) params.status = filter.status;
    if (filter.category) params.category = filter.category;
    if (filter.includeDisposed) params.includeDisposed = 'true';
    api.get('/accounting/assets', { params }).then((r) => setData(r.data)).catch(err);
  }, [filter]);
  useEffect(() => { load(); }, [load]);

  const t = data.totals || {};

  const runDepreciation = async () => {
    if (!window.confirm('Post depreciation for every month up to the current one?')) return;
    setRunning(true);
    try {
      const { data: r } = await api.post('/accounting/depreciation/run', {});
      toast.success(r.entriesCreated
        ? `Posted ${r.entriesCreated} entries · ${money(currency, r.totalPosted)}`
        : 'Already up to date');
      load();
    } catch (e) { err(e); } finally { setRunning(false); }
  };

  const save = async (e) => {
    e.preventDefault();
    try {
      await api.post('/accounting/assets', form);
      toast.success('Asset added');
      setForm(null);
      load();
    } catch (e2) { err(e2); }
  };

  const remove = async (a) => {
    if (!window.confirm(`Delete ${a.name}? Only possible before any depreciation is posted.`)) return;
    try { await api.delete(`/accounting/assets/${a.id}`); toast.success('Deleted'); load(); }
    catch (e) { err(e); }
  };

  // Live preview in the acquire form — makes the 20%/5-year rule concrete.
  const preview = (() => {
    if (!form) return null;
    const cost = parseFloat(form.cost) || 0;
    const salvage = parseFloat(form.salvageValue) || 0;
    const rate = parseFloat(form.depreciationRate) || 0;
    if (cost <= 0 || rate <= 0 || salvage >= cost) return null;
    const monthly = ((cost - salvage) * rate) / 100 / 12;
    const months = Math.round((12 * 100) / rate);
    const start = form.acquisitionDate ? new Date(`${form.acquisitionDate}T00:00:00`) : null;
    let end = '';
    if (start) {
      const d = new Date(start.getFullYear(), start.getMonth() + months - 1, 1);
      end = d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
    }
    return `${money(currency, monthly)} per month · ${months} months${end ? ` · fully depreciated by ${end}` : ''}`;
  })();

  return (
    <div className="admin-section">
      <div className="admin-section-header">
        <h2>Fixed Assets</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {isAdmin && (
            <button className="btn btn-secondary" onClick={runDepreciation} disabled={running}>
              {running ? 'Running…' : 'Run depreciation'}
            </button>
          )}
          <button className="btn btn-primary" onClick={() => setForm({
            name: '', category: 'equipment', locationId: '', acquisitionDate: '',
            cost: '', salvageValue: 0, depreciationRate: 20, cashAccountId: '',
            serialNumber: '', notes: '',
          })}>
            <HiPlus /> Add asset
          </button>
        </div>
      </div>

      <div className="dash-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <div className="dash-card"><div className="dash-card-label">Assets at cost</div><div className="dash-card-value">{money(currency, t.cost)}</div></div>
        <div className="dash-card"><div className="dash-card-label">Accumulated depreciation</div><div className="dash-card-value">{money(currency, t.accumulatedDepreciation)}</div></div>
        <div className="dash-card"><div className="dash-card-label">Net book value</div><div className="dash-card-value">{money(currency, t.netBookValue)}</div></div>
        <div className="dash-card"><div className="dash-card-label">Monthly charge</div><div className="dash-card-value">{money(currency, t.monthlyCharge)}</div></div>
        <div className="dash-card"><div className="dash-card-label">Assets</div><div className="dash-card-value">{t.count ?? 0}</div></div>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '1rem' }}>
        <div><label style={dlbl}>Status</label>
          <select value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}>
            <option value="">All active</option>
            <option value="active">Active</option>
            <option value="fully_depreciated">Fully depreciated</option>
            <option value="disposed">Disposed</option>
            <option value="written_off">Written off</option>
          </select>
        </div>
        <div><label style={dlbl}>Category</label>
          <select value={filter.category} onChange={(e) => setFilter({ ...filter, category: e.target.value })}>
            <option value="">All</option>
            {CATEGORIES.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}
          </select>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
          <input type="checkbox" checked={filter.includeDisposed}
            onChange={(e) => setFilter({ ...filter, includeDisposed: e.target.checked })} />
          Include disposed
        </label>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Asset #</th><th>Name</th><th>Category</th><th>Location</th><th>Acquired</th>
              <th style={{ textAlign: 'right' }}>Cost</th>
              <th style={{ textAlign: 'right' }}>Monthly</th>
              <th style={{ textAlign: 'right' }}>Accum. dep.</th>
              <th style={{ textAlign: 'right' }}>NBV</th>
              <th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {data.assets.length === 0 && (
              <tr><td colSpan={11} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-light)' }}>
                No assets yet
              </td></tr>
            )}
            {data.assets.map((a) => (
              <tr key={a.id}>
                <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                  <button className="link-btn" onClick={() => setDetail(a.id)}>{a.assetNumber}</button>
                </td>
                <td style={{ fontWeight: 500 }}>{a.name}</td>
                <td>{CAT_LABEL[a.category] || a.category}</td>
                <td>{a.Location?.name || '—'}</td>
                <td>{a.acquisitionDate}</td>
                <td style={{ textAlign: 'right' }}>{money(currency, a.cost)}</td>
                <td style={{ textAlign: 'right', color: 'var(--text-light)' }}>
                  {a.status === 'active' ? money(currency, a.monthlyDepreciation) : '—'}
                </td>
                <td style={{ textAlign: 'right' }}>{money(currency, a.accumulatedDepreciation)}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{money(currency, a.netBookValue)}</td>
                <td><StatusPill status={a.status} /></td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {a.status !== 'disposed' && a.status !== 'written_off' && isAdmin && (
                    <button className="link-btn" onClick={() => setDisposeFor(a)}>Dispose</button>
                  )}
                  {isAdmin && a.accumulatedDepreciation === 0 && (
                    <button className="icon-btn" onClick={() => remove(a)} title="Delete"><HiTrash /></button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {form && (
        <div className="admin-form-overlay" onClick={(e) => { if (e.target === e.currentTarget) setForm(null); }}>
          <form className="admin-form" style={{ maxWidth: 620 }} onSubmit={save}>
            <h3>Add fixed asset</h3>
            <div className="form-row">
              <div className="form-group"><label>Name *</label>
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="form-group"><label>Category</label>
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  {CATEGORIES.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Acquisition date *</label>
                <input type="date" required value={form.acquisitionDate}
                  onChange={(e) => setForm({ ...form, acquisitionDate: e.target.value })} />
              </div>
              <div className="form-group"><label>Location</label>
                <select value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })}>
                  <option value="">Head office / unassigned</option>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Cost ({currency}) *</label>
                <input type="number" step={PRICE_STEP} required value={form.cost}
                  onChange={(e) => setForm({ ...form, cost: e.target.value })} />
              </div>
              <div className="form-group"><label>Salvage value ({currency})</label>
                <input type="number" step={PRICE_STEP} value={form.salvageValue}
                  onChange={(e) => setForm({ ...form, salvageValue: e.target.value })} />
              </div>
              <div className="form-group"><label>Depreciation %/year</label>
                <input type="number" step="0.001" value={form.depreciationRate}
                  onChange={(e) => setForm({ ...form, depreciationRate: e.target.value })} />
              </div>
            </div>
            {preview && (
              <div style={{ fontSize: '0.8rem', color: 'var(--text-light)', marginBottom: '0.75rem' }}>
                {preview}
              </div>
            )}
            <div className="form-group"><label>Paid from account</label>
              <select value={form.cashAccountId} onChange={(e) => setForm({ ...form, cashAccountId: e.target.value })}>
                <option value="">Not paid from a store account</option>
                {cashAccounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name} ({money(currency, a.balance)})</option>
                ))}
              </select>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-light)', marginTop: 4 }}>
                Leave blank only if this wasn&apos;t paid from a store account — it will
                show as a reconciling item on the Balance Sheet.
              </div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Serial number</label>
                <input value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} />
              </div>
            </div>
            <div className="form-group"><label>Notes</label>
              <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-light)', marginBottom: '0.5rem' }}>
              Depreciation is straight-line and accrues monthly. An asset earns a
              full month&apos;s charge in the month it was acquired, however late in
              the month that was.
            </div>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary">Add asset</button>
              <button type="button" className="btn btn-secondary" onClick={() => setForm(null)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {disposeFor && (
        <DisposeModal asset={disposeFor} currency={currency} cashAccounts={cashAccounts}
          onClose={() => setDisposeFor(null)} onDone={() => { setDisposeFor(null); load(); }} />
      )}
      {detail && <AssetDetail id={detail} currency={currency} onClose={() => setDetail(null)} />}
    </div>
  );
}

function DisposeModal({ asset, currency, cashAccounts, onClose, onDone }) {
  const [f, setF] = useState({
    disposalDate: new Date().toISOString().slice(0, 10),
    proceeds: '', cashAccountId: '', notes: '', writeOff: false,
  });
  const nbv = parseFloat(asset.netBookValue) || 0;
  const gainLoss = +((parseFloat(f.proceeds) || 0) - nbv).toFixed(CURRENCY_DECIMALS);

  const submit = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.post(`/accounting/assets/${asset.id}/dispose`, f);
      toast.success(`Disposed · ${data.gainLoss >= 0 ? 'gain' : 'loss'} ${money(currency, Math.abs(data.gainLoss))}`);
      onDone();
    } catch (e2) { err(e2); }
  };

  return (
    <div className="admin-form-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="admin-form" style={{ maxWidth: 520 }} onSubmit={submit}>
        <h3>Dispose {asset.name}</h3>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-light)', marginBottom: '0.75rem' }}>
          Current net book value <strong>{money(currency, nbv)}</strong>. Depreciation for the
          disposal month is posted first, so the gain or loss is measured against
          an up-to-date book value.
        </div>
        <div className="form-row">
          <div className="form-group"><label>Disposal date *</label>
            <input type="date" required value={f.disposalDate}
              onChange={(e) => setF({ ...f, disposalDate: e.target.value })} />
          </div>
          <div className="form-group"><label>Proceeds ({currency})</label>
            <input type="number" step={PRICE_STEP} value={f.proceeds}
              onChange={(e) => setF({ ...f, proceeds: e.target.value })} />
          </div>
        </div>
        <div className="form-group"><label>Proceeds into account</label>
          <select value={f.cashAccountId} onChange={(e) => setF({ ...f, cashAccountId: e.target.value })}>
            <option value="">No cash received</option>
            {cashAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div style={{ marginBottom: '0.75rem', fontSize: '0.9rem' }}>
          Gain / (loss):{' '}
          <strong style={{ color: gainLoss >= 0 ? 'var(--success)' : 'var(--danger)' }}>
            {money(currency, gainLoss)}
          </strong>
        </div>
        <div className="form-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input type="checkbox" checked={f.writeOff}
              onChange={(e) => setF({ ...f, writeOff: e.target.checked })} />
            Write off (scrapped, not sold)
          </label>
        </div>
        <div className="form-group"><label>Notes</label>
          <textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary">Dispose</button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </div>
  );
}

function AssetDetail({ id, currency, onClose }) {
  const [a, setA] = useState(null);
  useEffect(() => { api.get(`/accounting/assets/${id}`).then((r) => setA(r.data)).catch(err); }, [id]);
  if (!a) return null;
  return (
    <div className="admin-form-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="admin-form" style={{ maxWidth: 680 }}>
        <div className="admin-section-header">
          <h3>{a.name} <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-light)' }}>{a.assetNumber}</span></h3>
          <button className="link-btn" onClick={onClose}>Close</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: '0.6rem', marginBottom: '1rem', fontSize: '0.85rem' }}>
          <div><span style={dlbl}>Cost</span>{money(currency, a.cost)}</div>
          <div><span style={dlbl}>Salvage</span>{money(currency, a.salvageValue)}</div>
          <div><span style={dlbl}>Rate</span>{a.depreciationRate}% / year</div>
          <div><span style={dlbl}>Life</span>{a.usefulLifeMonths} months</div>
          <div><span style={dlbl}>Accum. dep.</span>{money(currency, a.accumulatedDepreciation)}</div>
          <div><span style={dlbl}>Net book value</span><strong>{money(currency, a.netBookValue)}</strong></div>
        </div>
        {a.disposalDate && (
          <div style={{ marginBottom: '1rem', fontSize: '0.85rem' }}>
            Disposed {a.disposalDate} for {money(currency, a.disposalProceeds)} —{' '}
            <strong style={{ color: (parseFloat(a.disposalGainLoss) || 0) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
              {money(currency, a.disposalGainLoss)}
            </strong>
          </div>
        )}
        <h4 style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>Depreciation schedule</h4>
        <div className="admin-table-wrap" style={{ maxHeight: 300, overflowY: 'auto' }}>
          <table className="admin-table">
            <thead><tr><th>Period</th><th style={{ textAlign: 'right' }}>Amount</th><th style={{ textAlign: 'right' }}>Book value after</th></tr></thead>
            <tbody>
              {a.schedule.length === 0 && <tr><td colSpan={3} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-light)' }}>Nothing posted yet</td></tr>}
              {a.schedule.map((e) => (
                <tr key={e.id}>
                  <td style={{ fontFamily: 'monospace' }}>{e.period}</td>
                  <td style={{ textAlign: 'right' }}>{money(currency, e.amount)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--text-light)' }}>{money(currency, e.bookValueAfter)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Owner capital ──────────────────────────────────────────────────

function CapitalTab({ currency, isAdmin, cashAccounts = [] }) {
  const [data, setData] = useState({ totals: {}, entries: [] });
  const [filter, setFilter] = useState({ from: '', to: '', type: '' });
  const [form, setForm] = useState(null);

  const load = useCallback(() => {
    const params = {};
    if (filter.from) params.from = filter.from;
    if (filter.to) params.to = filter.to;
    if (filter.type) params.type = filter.type;
    api.get('/accounting/capital', { params }).then((r) => setData(r.data)).catch(err);
  }, [filter]);
  useEffect(() => { load(); }, [load]);

  const save = async (e) => {
    e.preventDefault();
    try {
      await api.post('/accounting/capital', form);
      toast.success(form.type === 'contribution' ? 'Contribution recorded' : 'Drawing recorded');
      setForm(null); load();
    } catch (e2) { err(e2); }
  };

  const cancel = async (row) => {
    if (!window.confirm(`Cancel ${row.entryNumber}? A reversing ledger entry is written.`)) return;
    try { await api.post(`/accounting/capital/${row.id}/cancel`); toast.success('Cancelled'); load(); }
    catch (e) { err(e); }
  };

  const t = data.totals || {};
  const openForm = (type) => setForm({
    type, cashAccountId: '', amount: '',
    entryDate: new Date().toISOString().slice(0, 10),
    ownerName: '', description: '', reference: '',
  });

  return (
    <div className="admin-section">
      <div className="admin-section-header">
        <h2>Owner Capital</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-secondary" onClick={() => openForm('drawing')}>Record drawing</button>
          <button className="btn btn-primary" onClick={() => openForm('contribution')}><HiPlus /> Record contribution</button>
        </div>
      </div>

      <div className="dash-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <div className="dash-card"><div className="dash-card-label">Contributions</div><div className="dash-card-value">{money(currency, t.contributions)}</div></div>
        <div className="dash-card"><div className="dash-card-label">Drawings</div><div className="dash-card-value">{money(currency, t.drawings)}</div></div>
        <div className="dash-card"><div className="dash-card-label">Net capital</div><div className="dash-card-value">{money(currency, t.net)}</div></div>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '1rem' }}>
        <div><label style={dlbl}>From</label><input type="date" value={filter.from} onChange={(e) => setFilter({ ...filter, from: e.target.value })} /></div>
        <div><label style={dlbl}>To</label><input type="date" value={filter.to} onChange={(e) => setFilter({ ...filter, to: e.target.value })} /></div>
        <div><label style={dlbl}>Type</label>
          <select value={filter.type} onChange={(e) => setFilter({ ...filter, type: e.target.value })}>
            <option value="">All</option>
            <option value="contribution">Contributions</option>
            <option value="drawing">Drawings</option>
          </select>
        </div>
        <button className="btn btn-secondary" onClick={() => setFilter({ from: '', to: '', type: '' })}>Clear</button>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr><th>Date</th><th>Entry #</th><th>Type</th><th>Owner</th><th>Account</th>
              <th style={{ textAlign: 'right' }}>Amount</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {data.entries.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-light)' }}>
                No capital entries yet
              </td></tr>
            )}
            {data.entries.map((e) => (
              <tr key={e.id} style={{ opacity: e.status === 'cancelled' ? 0.5 : 1 }}>
                <td>{e.entryDate}</td>
                <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{e.entryNumber}</td>
                <td>
                  <span style={{
                    fontSize: '0.7rem', fontWeight: 600, padding: '0.2rem 0.5rem', borderRadius: '100px',
                    background: e.type === 'contribution' ? 'rgba(90,138,106,0.15)' : 'rgba(217,164,65,0.15)',
                    color: e.type === 'contribution' ? 'var(--success)' : 'var(--warning, #b7791f)',
                  }}>
                    {e.type === 'contribution' ? 'CONTRIBUTION' : 'DRAWING'}
                  </span>
                </td>
                <td>{e.ownerName || '—'}</td>
                <td>{e.CashAccount?.name || '—'}</td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: e.type === 'contribution' ? 'var(--success)' : 'var(--danger)' }}>
                  {e.type === 'contribution' ? '+' : '−'}{money(currency, e.amount)}
                </td>
                <td>{e.status === 'cancelled' ? 'Cancelled' : 'Active'}</td>
                <td>
                  {isAdmin && e.status === 'active' && (
                    <button className="link-btn" onClick={() => cancel(e)}>Cancel</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {form && (
        <div className="admin-form-overlay" onClick={(e) => { if (e.target === e.currentTarget) setForm(null); }}>
          <form className="admin-form" style={{ maxWidth: 520 }} onSubmit={save}>
            <h3>{form.type === 'contribution' ? 'Record capital contribution' : 'Record owner drawing'}</h3>
            <div className="form-row">
              <div className="form-group"><label>Amount ({currency}) *</label>
                <input type="number" step={PRICE_STEP} required value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </div>
              <div className="form-group"><label>Date *</label>
                <input type="date" required value={form.entryDate}
                  onChange={(e) => setForm({ ...form, entryDate: e.target.value })} />
              </div>
            </div>
            <div className="form-group"><label>{form.type === 'contribution' ? 'Into account *' : 'Out of account *'}</label>
              <select required value={form.cashAccountId}
                onChange={(e) => setForm({ ...form, cashAccountId: e.target.value })}>
                <option value="">Select an account…</option>
                {cashAccounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name} ({money(currency, a.balance)})</option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Owner name</label>
                <input value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} />
              </div>
              <div className="form-group"><label>Reference</label>
                <input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
              </div>
            </div>
            <div className="form-group"><label>Description</label>
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary">Save</button>
              <button type="button" className="btn btn-secondary" onClick={() => setForm(null)}>Cancel</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

// ─── Balance sheet ──────────────────────────────────────────────────

function BalanceSheetTab({ currency }) {
  const [bs, setBs] = useState(null);
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));

  useEffect(() => {
    api.get('/accounting/balance-sheet', { params: { asOf } })
      .then((r) => setBs(r.data)).catch(err);
  }, [asOf]);

  if (!bs) return <div className="admin-section"><h2>Balance Sheet</h2><p>Loading…</p></div>;
  const { assets: A, liabilities: L, equity: E, reconciliation: R } = bs;
  const row = (label, value, opts = {}) => (
    <tr key={label} style={opts.strong ? { fontWeight: 700 } : undefined}>
      <td style={{ paddingLeft: opts.indent ? '1.5rem' : undefined, color: opts.muted ? 'var(--text-light)' : undefined }}>{label}</td>
      <td style={{ textAlign: 'right', color: opts.muted ? 'var(--text-light)' : undefined }}>{money(currency, value)}</td>
    </tr>
  );

  return (
    <div className="admin-section">
      <div className="admin-section-header"><h2>Balance Sheet</h2></div>

      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', marginBottom: '1rem' }}>
        <div><label style={dlbl}>As of</label>
          <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
        </div>
      </div>

      <div className="dash-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <div className="dash-card"><div className="dash-card-label">Total assets</div><div className="dash-card-value">{money(currency, A.total)}</div></div>
        <div className="dash-card"><div className="dash-card-label">Total liabilities</div><div className="dash-card-value">{money(currency, L.total)}</div></div>
        <div className="dash-card"><div className="dash-card-label">Owner&apos;s equity</div><div className="dash-card-value">{money(currency, E.total)}</div></div>
        <div className="dash-card">
          <div className="dash-card-label">Difference</div>
          <div className="dash-card-value" style={{ color: R.balanced ? 'var(--success)' : 'var(--danger)' }}>
            {money(currency, R.difference)}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '1.25rem' }}>
        <div>
          <h3 style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>Assets</h3>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <tbody>
                {row('Cash in hand', A.cashInHand)}
                {row('Cash in bank', A.cashInBank)}
                {A.cashByAccount.map((a) => row(`${a.name}${a.active ? '' : ' (inactive)'}`, a.balance, { indent: true, muted: true }))}
                {row('Inventory at cost', A.inventory)}
                {row('Fixed assets at cost', A.fixedAssetsAtCost)}
                {row('less accumulated depreciation', -A.accumulatedDepreciation, { indent: true, muted: true })}
                {row('Fixed assets (net)', A.fixedAssetsNet)}
                {A.supplierAdvances > 0 && row('Supplier advances', A.supplierAdvances)}
                {row('Total assets', A.total, { strong: true })}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h3 style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>Liabilities &amp; Equity</h3>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <tbody>
                {row('Supplier payable', L.supplierPayable)}
                {row('Owed to people who paid personally', L.personalPayable || 0)}
                {row('Total liabilities', L.total, { strong: true })}
                {row("Owner's capital", E.capitalContributions)}
                {row('less drawings', -E.drawings, { indent: true, muted: true })}
                {row('Retained profit', E.retainedProfit)}
                {row("Owner's equity", E.total, { strong: true })}
                {row('Total liabilities & equity', bs.totalLiabilitiesAndEquity, { strong: true })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {!R.balanced && (
        <div style={{
          marginTop: '1.25rem', padding: '0.9rem 1rem', borderRadius: 8,
          background: 'rgba(217,164,65,0.10)', border: '1px solid rgba(217,164,65,0.3)',
        }}>
          <strong style={{ fontSize: '0.88rem' }}>
            Assets exceed liabilities and equity by {money(currency, R.difference)}
          </strong>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-light)', margin: '0.4rem 0 0.6rem' }}>
            This is a single-entry cash ledger, so the sheet is an aggregation rather
            than a trial balance. The difference is shown rather than absorbed. Known
            causes, quantified where possible:
          </p>
          <table className="admin-table" style={{ marginBottom: '0.6rem' }}>
            <tbody>
              {Object.entries(R.quantified).map(([k, v]) => (
                <tr key={k}>
                  <td style={{ fontSize: '0.8rem' }}>
                    {k.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}
                  </td>
                  <td style={{ textAlign: 'right', fontSize: '0.8rem' }}>{money(currency, v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul style={{ fontSize: '0.78rem', color: 'var(--text-light)', paddingLeft: '1.1rem', margin: 0 }}>
            {R.notes.map((n) => <li key={n} style={{ marginBottom: 2 }}>{n}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
