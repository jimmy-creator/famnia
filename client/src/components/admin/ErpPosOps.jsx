/**
 * ERP → Sales & POS floor: Cashiers, POS Reports, Returns, Activity Log.
 *
 * Lifted out of Admin.jsx when the ERP surface moved to its own page; the
 * tab markup is unchanged.  These four tabs share nothing but the location
 * list, which Erp.jsx owns, so all of their state lives here.
 */
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { HiPlus, HiPencil, HiTrash } from 'react-icons/hi';
import api from '../../api/axios';
import { localDate } from '../../lib/utils';
import { CURRENCY, CURRENCY_DECIMALS } from '../../utils/currency';
import PosReportReceipt from '../PosReportReceipt';

export default function ErpPosOps({ tab, locations, isAdmin }) {
  const [cashiers, setCashiers] = useState([]);
  const [cashierForm, setCashierForm] = useState(null);      // { name, email, password, pin, homeLocationId, _editing }
  const [shifts, setShifts] = useState([]);
  const [shiftFilter, setShiftFilter] = useState({ from: '', to: '' });   // opened-on dates; blank = latest 50
  const [shiftReport, setShiftReport] = useState(null);                  // X/Z/DAY payload being viewed
  const [dayFilter, setDayFilter] = useState(() => ({ date: localDate(), locationId: '' }));
  const [dayLoading, setDayLoading] = useState(false);
  const [loadingReportId, setLoadingReportId] = useState(null);
  const [reportType, setReportType] = useState('cashier');   // 'cashier' | 'location'
  const [reportFrom, setReportFrom] = useState(() => localDate());
  const [reportTo, setReportTo] = useState(() => localDate());
  const [reportFilterCashier, setReportFilterCashier] = useState('');
  const [reportFilterLocation, setReportFilterLocation] = useState('');
  const [reportData, setReportData] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [salesReturns, setSalesReturns] = useState([]);
  const [returnsFilter, setReturnsFilter] = useState({ from: '', to: '', locationId: '', refundMethod: '' });
  const [returnDetail, setReturnDetail] = useState(null);
  const [activityLog, setActivityLog] = useState([]);
  const [activityFilter, setActivityFilter] = useState({ from: '', to: '', action: '', managerOnly: false });
  const [activityDetail, setActivityDetail] = useState(null);

  useEffect(() => {
    if (tab === 'cashiers') {
      api.get('/staff?role=cashier').then((res) => setCashiers(res.data)).catch(() => {
        // Fallback if /staff doesn't filter by role — fetch all then filter
        api.get('/staff').then((r) => setCashiers((r.data || []).filter((u) => u.role === 'cashier'))).catch(() => {});
      });
    } else if (tab === 'pos-reports') {
      api.get('/staff?role=cashier').then((res) => setCashiers(res.data)).catch(() => {});
    } else if (tab === 'returns') {
      const params = {};
      if (returnsFilter.from) params.from = returnsFilter.from;
      if (returnsFilter.to) params.to = returnsFilter.to;
      if (returnsFilter.locationId) params.locationId = returnsFilter.locationId;
      if (returnsFilter.refundMethod) params.refundMethod = returnsFilter.refundMethod;
      api.get('/returns', { params }).then((res) => setSalesReturns(res.data)).catch(() => {});
    } else if (tab === 'activity-log') {
      const params = {};
      if (activityFilter.from) params.from = activityFilter.from;
      if (activityFilter.to) params.to = activityFilter.to;
      if (activityFilter.action) params.action = activityFilter.action;
      if (activityFilter.managerOnly) params.managerOnly = 'true';
      api.get('/activity-log', { params }).then((res) => setActivityLog(res.data)).catch(() => {});
    }
  }, [tab, returnsFilter, activityFilter]);

  useEffect(() => {
    if (tab !== 'cashiers') return;
    const ranged = shiftFilter.from || shiftFilter.to;
    const params = { limit: ranged ? 500 : 50 };
    if (shiftFilter.from) params.from = shiftFilter.from;
    if (shiftFilter.to) params.to = shiftFilter.to;
    api.get('/cashier/shifts', { params }).then((res) => setShifts(res.data)).catch(() => {});
  }, [tab, shiftFilter]);

  // End-of-day report: every in-store sale that day, across all shifts.
  const openDayReport = async () => {
    setDayLoading(true);
    try {
      const params = { date: dayFilter.date };
      if (dayFilter.locationId) params.locationId = dayFilter.locationId;
      const { data } = await api.get('/reports/day', { params });
      setShiftReport(data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not load the daily report');
    } finally {
      setDayLoading(false);
    }
  };

  // Z-report for a closed shift, a live X-report for one still open.
  const openShiftReport = async (shiftId) => {
    setLoadingReportId(shiftId);
    try {
      const { data } = await api.get(`/reports/z/${shiftId}`);
      setShiftReport(data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not load the report');
    } finally {
      setLoadingReportId(null);
    }
  };

  return (
    <>
    {shiftReport && (
      <PosReportReceipt report={shiftReport} currency={CURRENCY} autoPrint={false} onClose={() => setShiftReport(null)} />
    )}
    {tab === 'cashiers' && (
      <div>
        <button
          className="btn btn-primary"
          onClick={() => setCashierForm({ name: '', email: '', password: '', pin: '', homeLocationId: '', role: 'cashier', _editing: false })}
          style={{ marginBottom: '1.5rem' }}
        >
          <HiPlus /> Add Cashier
        </button>

        <div className="admin-table" style={{ marginBottom: '2rem' }}>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Home location</th>
                <th>Created</th>
                <th>Edit</th>
                <th>Delete</th>
              </tr>
            </thead>
            <tbody>
              {cashiers.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-light)' }}>No cashier accounts yet</td></tr>}
              {cashiers.map((u) => (
                <tr key={u.id}>
                  <td><strong>{u.name}</strong></td>
                  <td style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{u.email}</td>
                  <td>{locations.find((l) => l.id === u.homeLocationId)?.name || '—'}</td>
                  <td style={{ fontSize: '0.78rem' }}>{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td>
                    <button className="icon-btn" onClick={() => setCashierForm({
                      ...u, password: '', pin: '', role: 'cashier', _editing: true, _id: u.id,
                    })}><HiPencil /></button>
                  </td>
                  <td>
                    <button className="icon-btn danger" onClick={async () => {
                      if (!confirm(`Delete cashier "${u.name}"?`)) return;
                      try {
                        await api.delete(`/staff/${u.id}`);
                        setCashiers(cashiers.filter((x) => x.id !== u.id));
                        toast.success('Deleted');
                      } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
                    }}><HiTrash /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: '0.75rem', marginTop: '2rem', marginBottom: '0.75rem' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-secondary)', marginRight: 'auto' }}>
            {shiftFilter.from || shiftFilter.to ? 'Shifts' : 'Recent shifts'}
          </h3>
          <div>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Opened from</label>
            <input type="date" value={shiftFilter.from} onChange={(e) => setShiftFilter({ ...shiftFilter, from: e.target.value })} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>To</label>
            <input type="date" value={shiftFilter.to} onChange={(e) => setShiftFilter({ ...shiftFilter, to: e.target.value })} />
          </div>
          <button type="button" className="btn btn-secondary" onClick={() => {
            const d = new Date(); d.setDate(d.getDate() - 1);
            setShiftFilter({ from: localDate(d), to: localDate(d) });
          }}>Yesterday</button>
          {(shiftFilter.from || shiftFilter.to) && (
            <button type="button" className="btn btn-secondary" onClick={() => setShiftFilter({ from: '', to: '' })}>Clear</button>
          )}
        </div>
        <div className="admin-table">
          <table>
            <thead>
              <tr>
                <th>Cashier</th>
                <th>Location</th>
                <th>Opened</th>
                <th>Closed</th>
                <th>Opening</th>
                <th>Closing</th>
                <th>Variance</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {shifts.length === 0 && <tr><td colSpan={9} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-light)' }}>{shiftFilter.from || shiftFilter.to ? 'No shifts opened in this range' : 'No shifts yet'}</td></tr>}
              {shifts.map((s) => (
                <tr key={s.id}>
                  <td>{s.User?.name || `User #${s.userId}`}</td>
                  <td>{s.Location?.name || `Loc #${s.locationId}`}</td>
                  <td style={{ fontSize: '0.78rem' }}>{new Date(s.openedAt).toLocaleString()}</td>
                  <td style={{ fontSize: '0.78rem' }}>{s.closedAt ? new Date(s.closedAt).toLocaleString() : '—'}</td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{CURRENCY}{parseFloat(s.openingCash).toFixed(CURRENCY_DECIMALS)}</td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{s.closingCash != null ? `${CURRENCY}${parseFloat(s.closingCash).toFixed(CURRENCY_DECIMALS)}` : '—'}</td>
                  <td style={{ fontVariantNumeric: 'tabular-nums', color: s.cashVariance < 0 ? 'var(--danger)' : s.cashVariance > 0 ? 'var(--success)' : 'var(--text-secondary)' }}>
                    {s.cashVariance != null ? `${s.cashVariance >= 0 ? '+' : ''}${parseFloat(s.cashVariance).toFixed(CURRENCY_DECIMALS)}` : '—'}
                  </td>
                  <td>
                    <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.45rem', borderRadius: 4,
                      background: s.status === 'open' ? 'rgba(34,197,94,0.18)' : 'rgba(148,163,184,0.15)',
                      color: s.status === 'open' ? '#15803d' : '#475569' }}>{s.status}</span>
                  </td>
                  <td>
                    <button type="button" className="btn btn-secondary" style={{ padding: '0.2rem 0.6rem', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                      disabled={loadingReportId === s.id} onClick={() => openShiftReport(s.id)}>
                      {loadingReportId === s.id ? 'Loading…' : s.status === 'open' ? 'X-report' : 'Z-report'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {cashierForm && (
          <div className="admin-form-overlay" onClick={(e) => { if (e.target === e.currentTarget) setCashierForm(null); }}>
            <form className="admin-form" onSubmit={async (e) => {
              e.preventDefault();
              try {
                if (cashierForm._editing) {
                  const payload = {
                    name: cashierForm.name,
                    homeLocationId: cashierForm.homeLocationId || null,
                    isManager: !!cashierForm.isManager,
                  };
                  if (cashierForm.password) payload.password = cashierForm.password;
                  if (cashierForm.pin) payload.pin = cashierForm.pin;
                  await api.put(`/staff/${cashierForm._id}`, payload);
                  toast.success('Cashier updated');
                } else {
                  await api.post('/staff', {
                    name: cashierForm.name,
                    email: cashierForm.email,
                    password: cashierForm.password,
                    pin: cashierForm.pin,
                    homeLocationId: cashierForm.homeLocationId || null,
                    isManager: !!cashierForm.isManager,
                    role: 'cashier',
                  });
                  toast.success('Cashier account created');
                }
                setCashierForm(null);
                api.get('/staff?role=cashier').then((r) => setCashiers(r.data)).catch(() => {});
              } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
            }}>
              <h3>{cashierForm._editing ? 'Edit Cashier' : 'New Cashier'}</h3>
              <div className="form-row">
                <div className="form-group">
                  <label>Name</label>
                  <input value={cashierForm.name} onChange={(e) => setCashierForm({ ...cashierForm, name: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label>Email {cashierForm._editing && <small>(read-only)</small>}</label>
                  <input type="email" value={cashierForm.email} onChange={(e) => setCashierForm({ ...cashierForm, email: e.target.value })} required={!cashierForm._editing} disabled={cashierForm._editing} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>{cashierForm._editing ? 'New password (leave blank to keep)' : 'Password'}</label>
                  <input type="password" value={cashierForm.password} onChange={(e) => setCashierForm({ ...cashierForm, password: e.target.value })} required={!cashierForm._editing} minLength={8} />
                </div>
                <div className="form-group">
                  <label>{cashierForm._editing ? 'New PIN (leave blank to keep)' : 'PIN (4–6 digits)'}</label>
                  <input
                    type="text" inputMode="numeric" pattern="\d{4,6}"
                    value={cashierForm.pin}
                    onChange={(e) => setCashierForm({ ...cashierForm, pin: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                    required={!cashierForm._editing}
                    placeholder="1234"
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Home location (suggested at login)</label>
                <select value={cashierForm.homeLocationId || ''} onChange={(e) => setCashierForm({ ...cashierForm, homeLocationId: e.target.value })}>
                  <option value="">— None —</option>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input type="checkbox" checked={!!cashierForm.isManager} onChange={(e) => setCashierForm({ ...cashierForm, isManager: e.target.checked })} />
                  <span>Manager <small style={{ color: 'var(--text-light)' }}>(can approve POS overrides — large discounts, large refunds)</small></span>
                </label>
              </div>
              <div className="form-actions">
                <button type="submit" className="btn btn-primary">{cashierForm._editing ? 'Save' : 'Create'}</button>
                <button type="button" className="btn btn-secondary" onClick={() => setCashierForm(null)}>Cancel</button>
              </div>
            </form>
          </div>
        )}
      </div>
    )}

    {tab === 'activity-log' && (
      <div className="admin-section">
        <div className="admin-section-header">
          <h2>Activity Log</h2>
          <span style={{ color: 'var(--text-light)', fontSize: '0.85rem' }}>{activityLog.length} entries</span>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end', marginBottom: '1.25rem', padding: '1rem', background: 'var(--surface-alt, #f8f9fa)', borderRadius: 8 }}>
          <div><label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>From</label>
            <input type="date" value={activityFilter.from} onChange={(e) => setActivityFilter({ ...activityFilter, from: e.target.value })} /></div>
          <div><label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>To</label>
            <input type="date" value={activityFilter.to} onChange={(e) => setActivityFilter({ ...activityFilter, to: e.target.value })} /></div>
          <div><label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Action</label>
            <select value={activityFilter.action} onChange={(e) => setActivityFilter({ ...activityFilter, action: e.target.value })}>
              <option value="">All</option>
              <option value="pos_sale">POS sale</option>
              <option value="sales_return_create">Sales return</option>
              <option value="pos_drawer_open">Drawer opened (no sale)</option>
            </select>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
            <input type="checkbox" checked={activityFilter.managerOnly} onChange={(e) => setActivityFilter({ ...activityFilter, managerOnly: e.target.checked })} />
            Manager overrides only
          </label>
          <button className="btn btn-secondary" onClick={() => setActivityFilter({ from: '', to: '', action: '', managerOnly: false })}>Clear</button>
        </div>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Entity</th><th>Location</th><th>Override</th><th>Reason</th><th></th></tr></thead>
            <tbody>
              {activityLog.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-light)' }}>No entries</td></tr>}
              {activityLog.map((e) => (
                <tr key={e.id} style={{ background: e.managerOverrideBy ? 'rgba(251,191,36,0.06)' : 'inherit' }}>
                  <td style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>{new Date(e.createdAt).toLocaleString()}</td>
                  <td>{e.actor?.name || '—'} <small style={{ color: 'var(--text-light)' }}>({e.actor?.role})</small></td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{e.action}</td>
                  <td style={{ fontSize: '0.82rem' }}>
                    {e.entityType && <span>{e.entityType}#{e.entityId}</span>}
                    {!e.entityType && '—'}
                  </td>
                  <td>{e.Location?.name || '—'}</td>
                  <td>{e.approver?.name ? <strong style={{ color: 'var(--copper)' }}>{e.approver.name}</strong> : '—'}</td>
                  <td style={{ fontSize: '0.82rem', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.reason || '—'}</td>
                  <td>
                    <button className="btn btn-secondary" style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                      onClick={() => setActivityDetail(e)}>Detail</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {activityDetail && (
          <div className="admin-form-overlay" onClick={(ev) => { if (ev.target === ev.currentTarget) setActivityDetail(null); }}>
            <div className="admin-form" style={{ maxWidth: 560 }}>
              <h3>Activity #{activityDetail.id}</h3>
              <div style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                <div>When: {new Date(activityDetail.createdAt).toLocaleString()}</div>
                <div>Actor: {activityDetail.actor?.name} ({activityDetail.actor?.role})</div>
                <div>Action: <strong>{activityDetail.action}</strong></div>
                {activityDetail.entityType && <div>Entity: {activityDetail.entityType}#{activityDetail.entityId}</div>}
                {activityDetail.Location && <div>Location: {activityDetail.Location.name}</div>}
                {activityDetail.approver && <div>Manager: <strong>{activityDetail.approver.name}</strong></div>}
                {activityDetail.reason && <div>Reason: {activityDetail.reason}</div>}
                {activityDetail.ip && <div>IP: {activityDetail.ip}</div>}
              </div>
              <pre style={{ background: 'var(--bg-warm, #f5f1e8)', padding: '0.75rem', borderRadius: 6, fontSize: '0.78rem', overflow: 'auto', maxHeight: 300 }}>
                {JSON.stringify(activityDetail.details, null, 2)}
              </pre>
              <div className="form-actions" style={{ marginTop: '1rem' }}>
                <button className="btn btn-primary" onClick={() => setActivityDetail(null)}>Close</button>
              </div>
            </div>
          </div>
        )}
      </div>
    )}

    {tab === 'pos-reports' && (
      <div className="admin-section">
        <div className="admin-section-header">
          <h2>POS Reports</h2>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end', marginBottom: '1rem', padding: '1rem', border: '1px solid var(--border-light)', borderRadius: 8 }}>
          <div style={{ marginRight: 'auto' }}>
            <div style={{ fontWeight: 600 }}>Daily report</div>
            <div style={{ fontSize: 12, color: 'var(--text-light)' }}>One day across every shift and cashier — printable on the receipt printer.</div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Date</label>
            <input type="date" value={dayFilter.date} onChange={(e) => setDayFilter({ ...dayFilter, date: e.target.value })} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Location</label>
            <select value={dayFilter.locationId} onChange={(e) => setDayFilter({ ...dayFilter, locationId: e.target.value })}>
              <option value="">All</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <button type="button" className="btn btn-primary" disabled={!dayFilter.date || dayLoading} onClick={openDayReport}>
            {dayLoading ? 'Loading…' : 'View daily report'}
          </button>
        </div>

        <div className="report-filters" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end', marginBottom: '1.5rem', padding: '1rem', background: 'var(--surface-alt, #f8f9fa)', borderRadius: 8 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Group by</label>
            <select value={reportType} onChange={(e) => { setReportType(e.target.value); setReportData(null); }}>
              <option value="cashier">Cashier</option>
              <option value="location">Location</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>From</label>
            <input type="date" value={reportFrom} onChange={(e) => setReportFrom(e.target.value)} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>To</label>
            <input type="date" value={reportTo} onChange={(e) => setReportTo(e.target.value)} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Quick range</label>
            <select onChange={(e) => {
              const v = e.target.value;
              if (!v) return;
              const today = new Date();
              const iso = localDate;
              setReportTo(iso(today));
              if (v === 'today') setReportFrom(iso(today));
              if (v === '7d') { const d = new Date(today); d.setDate(d.getDate() - 6); setReportFrom(iso(d)); }
              if (v === '30d') { const d = new Date(today); d.setDate(d.getDate() - 29); setReportFrom(iso(d)); }
              if (v === 'mtd') setReportFrom(`${iso(today).slice(0, 8)}01`);
              e.target.value = '';
            }}>
              <option value="">— Pick —</option>
              <option value="today">Today</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="mtd">Month to date</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Location</label>
            <select value={reportFilterLocation} onChange={(e) => setReportFilterLocation(e.target.value)}>
              <option value="">All</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          {reportType === 'cashier' && (
            <div>
              <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Cashier</label>
              <select value={reportFilterCashier} onChange={(e) => setReportFilterCashier(e.target.value)}>
                <option value="">All</option>
                {cashiers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          <button
            className="btn btn-primary"
            disabled={reportLoading}
            onClick={async () => {
              setReportLoading(true);
              try {
                const params = {
                  from: reportFrom,
                  to: reportTo,
                };
                if (reportFilterLocation) params.locationId = reportFilterLocation;
                if (reportType === 'cashier' && reportFilterCashier) params.cashierId = reportFilterCashier;
                const url = reportType === 'cashier' ? '/reports/cashier-sales' : '/reports/location-sales';
                const { data } = await api.get(url, { params });
                setReportData(data);
              } catch (err) {
                toast.error(err.response?.data?.message || 'Failed to load report');
              } finally {
                setReportLoading(false);
              }
            }}>
            {reportLoading ? 'Loading…' : 'Run report'}
          </button>
          {reportData && (
            <button
              className="btn btn-secondary"
              onClick={() => {
                const rows = reportData.rows || [];
                const headers = reportType === 'cashier'
                  ? ['Cashier', 'Orders', 'Cash', 'Card', 'Refunds', 'Net sales']
                  : ['Location', 'Orders', 'Cash', 'Card', 'Refunds', 'Net sales'];
                const lines = [headers.join(',')];
                for (const r of rows) {
                  const label = reportType === 'cashier' ? r.cashierName : r.locationName;
                  const refunds = ((r.cashRefunds || 0) + (r.cardRefunds || 0)).toFixed(CURRENCY_DECIMALS);
                  lines.push([`"${label}"`, r.orderCount, r.cashSales, r.cardSales, refunds, r.netSales].join(','));
                }
                const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `${reportType}-sales-${reportFrom}-to-${reportTo}.csv`;
                a.click();
              }}>
              Export CSV
            </button>
          )}
        </div>

        {!reportData && !reportLoading && (
          <p style={{ color: 'var(--text-light)' }}>Choose filters and click <strong>Run report</strong>.</p>
        )}

        {reportData && (
          <>
            <div className="dash-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <div className="dash-card">
                <div className="dash-card-label">Total orders</div>
                <div className="dash-card-value">{reportData.totals.orderCount}</div>
              </div>
              <div className="dash-card">
                <div className="dash-card-label">Cash sales</div>
                <div className="dash-card-value">{CURRENCY}{reportData.totals.cashSales.toFixed(CURRENCY_DECIMALS)}</div>
              </div>
              <div className="dash-card">
                <div className="dash-card-label">Card sales</div>
                <div className="dash-card-value">{CURRENCY}{reportData.totals.cardSales.toFixed(CURRENCY_DECIMALS)}</div>
              </div>
              <div className="dash-card">
                <div className="dash-card-label">Net sales</div>
                <div className="dash-card-value">{CURRENCY}{reportData.totals.netSales.toFixed(CURRENCY_DECIMALS)}</div>
              </div>
            </div>

            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>{reportType === 'cashier' ? 'Cashier' : 'Location'}</th>
                    <th style={{ textAlign: 'right' }}>Orders</th>
                    <th style={{ textAlign: 'right' }}>Cash</th>
                    <th style={{ textAlign: 'right' }}>Card</th>
                    <th style={{ textAlign: 'right' }}>Refunds</th>
                    <th style={{ textAlign: 'right' }}>Net</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.rows.length === 0 && (
                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-light)' }}>No sales in this range</td></tr>
                  )}
                  {reportData.rows.map((r, i) => (
                    <tr key={i}>
                      <td>{reportType === 'cashier' ? r.cashierName : r.locationName}</td>
                      <td style={{ textAlign: 'right' }}>{r.orderCount}</td>
                      <td style={{ textAlign: 'right' }}>{CURRENCY}{r.cashSales.toFixed(CURRENCY_DECIMALS)}</td>
                      <td style={{ textAlign: 'right' }}>{CURRENCY}{r.cardSales.toFixed(CURRENCY_DECIMALS)}</td>
                      <td style={{ textAlign: 'right' }}>{CURRENCY}{((r.cashRefunds || 0) + (r.cardRefunds || 0)).toFixed(CURRENCY_DECIMALS)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{CURRENCY}{r.netSales.toFixed(CURRENCY_DECIMALS)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {reportType === 'location' && reportData.topItems?.length > 0 && (
              <div style={{ marginTop: '1.5rem' }}>
                <h3 style={{ marginBottom: '0.75rem' }}>Top selling items</h3>
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th style={{ textAlign: 'right' }}>Qty sold</th>
                        <th style={{ textAlign: 'right' }}>Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.topItems.map((it, i) => (
                        <tr key={i}>
                          <td>{it.name}</td>
                          <td style={{ textAlign: 'right' }}>{it.qty}</td>
                          <td style={{ textAlign: 'right' }}>{CURRENCY}{it.revenue.toFixed(CURRENCY_DECIMALS)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    )}

    {tab === 'returns' && (
      <div className="admin-section">
        <div className="admin-section-header">
          <h2>Sales Returns</h2>
          <span style={{ color: 'var(--text-light)', fontSize: '0.85rem' }}>
            {salesReturns.length} return{salesReturns.length === 1 ? '' : 's'}
          </span>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end', marginBottom: '1.5rem', padding: '1rem', background: 'var(--surface-alt, #f8f9fa)', borderRadius: 8 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>From</label>
            <input type="date" value={returnsFilter.from} onChange={(e) => setReturnsFilter({ ...returnsFilter, from: e.target.value })} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>To</label>
            <input type="date" value={returnsFilter.to} onChange={(e) => setReturnsFilter({ ...returnsFilter, to: e.target.value })} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Location</label>
            <select value={returnsFilter.locationId} onChange={(e) => setReturnsFilter({ ...returnsFilter, locationId: e.target.value })}>
              <option value="">All</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Refund method</label>
            <select value={returnsFilter.refundMethod} onChange={(e) => setReturnsFilter({ ...returnsFilter, refundMethod: e.target.value })}>
              <option value="">All</option>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
            </select>
          </div>
          <button className="btn btn-secondary" onClick={() => setReturnsFilter({ from: '', to: '', locationId: '', refundMethod: '' })}>
            Clear
          </button>
        </div>

        {(() => {
          const totals = salesReturns.reduce((s, r) => {
            if (r.status === 'cancelled') return s;
            const amt = parseFloat(r.refundAmount || 0);
            s.total += amt;
            if (r.refundMethod === 'cash') s.cash += amt;
            if (r.refundMethod === 'card') s.card += amt;
            return s;
          }, { total: 0, cash: 0, card: 0 });
          return (
            <div className="dash-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <div className="dash-card"><div className="dash-card-label">Total refunded</div><div className="dash-card-value">{CURRENCY}{totals.total.toFixed(CURRENCY_DECIMALS)}</div></div>
              <div className="dash-card"><div className="dash-card-label">Cash refunds</div><div className="dash-card-value">{CURRENCY}{totals.cash.toFixed(CURRENCY_DECIMALS)}</div></div>
              <div className="dash-card"><div className="dash-card-label">Card refunds</div><div className="dash-card-value">{CURRENCY}{totals.card.toFixed(CURRENCY_DECIMALS)}</div></div>
            </div>
          );
        })()}

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Return #</th>
                <th>Order</th>
                <th>Location</th>
                <th>Cashier</th>
                <th>Method</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {salesReturns.length === 0 && <tr><td colSpan={9} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-light)' }}>No returns in this range</td></tr>}
              {salesReturns.map((r) => (
                <tr key={r.id} style={{ opacity: r.status === 'cancelled' ? 0.5 : 1 }}>
                  <td style={{ whiteSpace: 'nowrap', fontSize: '0.82rem' }}>{new Date(r.createdAt).toLocaleString()}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{r.returnNumber}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{r.Order?.orderNumber || 'No receipt'}</td>
                  <td>{r.Location?.name || '—'}</td>
                  <td>{r.processor?.name || '—'}</td>
                  <td style={{ textTransform: 'capitalize' }}>{r.refundMethod.replace('_', ' ')}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{CURRENCY}{parseFloat(r.refundAmount).toFixed(CURRENCY_DECIMALS)}</td>
                  <td>
                    <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '0.2rem 0.5rem', borderRadius: '100px',
                      background: r.status === 'completed' ? 'rgba(90,138,106,0.15)' : 'rgba(220,38,38,0.15)',
                      color: r.status === 'completed' ? 'var(--success)' : 'var(--danger)',
                      textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      {r.status}
                    </span>
                  </td>
                  <td>
                    <button className="btn btn-secondary" style={{ padding: '0.3rem 0.7rem', fontSize: '0.78rem' }}
                      onClick={() => api.get(`/returns/${r.id}`).then((res) => setReturnDetail(res.data))}>
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {returnDetail && (
          <div className="admin-form-overlay" onClick={(e) => { if (e.target === e.currentTarget) setReturnDetail(null); }}>
            <div className="admin-form" style={{ maxWidth: 640 }}>
              <h3>Return {returnDetail.returnNumber}</h3>
              <div style={{ marginBottom: '1rem', fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
                <div>Original order: <strong>{returnDetail.Order?.orderNumber || 'No receipt'}</strong></div>
                <div>Location: {returnDetail.Location?.name}</div>
                <div>Processed by: {returnDetail.processor?.name}</div>
                <div>Method: {returnDetail.refundMethod.replace('_', ' ')}</div>
                {returnDetail.reason && <div>Reason: {returnDetail.reason}</div>}
                {returnDetail.notes && <div>Notes: {returnDetail.notes}</div>}
              </div>

              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead><tr><th>Item</th><th style={{ textAlign: 'right' }}>Qty</th><th style={{ textAlign: 'right' }}>Refund</th><th>To stock</th></tr></thead>
                  <tbody>
                    {(returnDetail.items || []).map((it, i) => (
                      <tr key={i}>
                        <td>{it.name}</td>
                        <td style={{ textAlign: 'right' }}>{it.quantity}</td>
                        <td style={{ textAlign: 'right' }}>{CURRENCY}{parseFloat(it.refundAmount).toFixed(CURRENCY_DECIMALS)}</td>
                        <td>{it.returnToStock === false ? 'No' : 'Yes'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0', borderTop: '1px solid var(--border-light)', marginTop: '0.75rem' }}>
                <strong>Total refunded</strong>
                <strong>{CURRENCY}{parseFloat(returnDetail.refundAmount).toFixed(CURRENCY_DECIMALS)}</strong>
              </div>

              <div className="form-actions" style={{ marginTop: '1rem' }}>
                {isAdmin && returnDetail.status === 'completed' && (
                  <button className="btn btn-secondary" onClick={async () => {
                    if (!confirm('Cancel this return? Stock will be deducted and refund reversed.')) return;
                    try {
                      await api.post(`/returns/${returnDetail.id}/cancel`);
                      toast.success('Return cancelled');
                      setReturnDetail(null);
                      // Refresh list
                      api.get('/returns').then((res) => setSalesReturns(res.data));
                    } catch (err) {
                      toast.error(err.response?.data?.message || 'Failed');
                    }
                  }}>Cancel return</button>
                )}
                <button className="btn btn-primary" onClick={() => setReturnDetail(null)}>Close</button>
              </div>
            </div>
          </div>
        )}
      </div>
    )}
    </>
  );
}
