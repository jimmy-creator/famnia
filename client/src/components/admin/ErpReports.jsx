/**
 * ERP reporting tabs: Sales report, Dead stock, Fast moving, Reorder,
 * Supplier purchases.
 *
 * Each tab owns its own filters and data — Admin.jsx just renders
 * <ErpReports tab={tab} currency={CURRENCY} locations={locations} />.
 * Styling follows the existing legacy admin CSS (admin-table / dash-card),
 * same as FinanceTabs and StockCounts, rather than shadcn, because the admin
 * panel hasn't been converted yet.
 */
import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { HiDownload } from 'react-icons/hi';
import api from '../../api/axios';
import { localDate } from '../../lib/utils';

export default function ErpReports(props) {
  const { tab } = props;
  if (tab === 'sales-report') return <SalesReportTab {...props} />;
  if (tab === 'dead-stock') return <DeadStockTab {...props} />;
  if (tab === 'fast-moving') return <FastMovingTab {...props} />;
  if (tab === 'reorder') return <ReorderTab {...props} />;
  if (tab === 'supplier-purchases') return <SupplierPurchasesTab {...props} />;
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

/** Default range: the last N days, as yyyy-mm-dd. */
function defaultRange(days = 30) {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);
  return { from: localDate(from), to: localDate(to) };
}

const money = (currency, n) => `${currency}${(parseFloat(n) || 0).toFixed(3)}`;

/**
 * Download a report as CSV. Goes through the axios client (blob response) so
 * the auth cookie is sent — a plain <a href> would hit the API unauthenticated.
 */
async function downloadCsv(path, params, filename) {
  try {
    const { data } = await api.get(path, {
      params: { ...params, format: 'csv' },
      responseType: 'blob',
    });
    const url = URL.createObjectURL(new Blob([data], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    toast.error(err.response?.data?.message || 'Export failed');
  }
}

function ExportButton({ onClick }) {
  return (
    <button type="button" className="btn-secondary" onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
      <HiDownload /> Export CSV
    </button>
  );
}

// ─── Sales report ──────────────────────────────────────────────────
const CHANNEL_LABEL = {
  web: 'Website', pos: 'In-store (POS)',
  phone: 'Phone', whatsapp: 'WhatsApp', other: 'Other',
};

function SalesReportTab({ currency, locations = [] }) {
  const [filter, setFilter] = useState({ ...defaultRange(30), groupBy: 'day', channel: '', locationId: '', includeUnpaid: false });
  const [data, setData] = useState(null);
  // Starts true: the first load is already in flight on mount.
  const [loading, setLoading] = useState(true);

  const params = {
    from: filter.from, to: filter.to, groupBy: filter.groupBy,
    ...(filter.channel ? { channel: filter.channel } : {}),
    ...(filter.locationId ? { locationId: filter.locationId } : {}),
    ...(filter.includeUnpaid ? { includeUnpaid: 'true' } : {}),
  };

  const load = useCallback(() => {
    api.get('/erp-reports/sales', { params })
      .then((r) => setData(r.data))
      .catch((e) => toast.error(e.response?.data?.message || 'Failed to load'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter.from, filter.to, filter.groupBy, filter.channel, filter.locationId, filter.includeUnpaid]);

  useEffect(() => { load(); }, [load]);

  const t = data?.totals;
  const groupLabel = { day: 'Date', product: 'Product', category: 'Category', channel: 'Channel', location: 'Location' }[filter.groupBy];

  return (
    <div className="admin-section">
      <div className="admin-section-header">
        <h2>Sales Report</h2>
        <ExportButton onClick={() => downloadCsv('/erp-reports/sales', params, `sales-${filter.groupBy}-${filter.from}-to-${filter.to}.csv`)} />
      </div>

      <div style={filterBar}>
        <div><label style={dlbl}>From</label><input type="date" value={filter.from} onChange={(e) => setFilter({ ...filter, from: e.target.value })} /></div>
        <div><label style={dlbl}>To</label><input type="date" value={filter.to} onChange={(e) => setFilter({ ...filter, to: e.target.value })} /></div>
        <div><label style={dlbl}>Group by</label>
          <select value={filter.groupBy} onChange={(e) => setFilter({ ...filter, groupBy: e.target.value })}>
            <option value="day">Day</option>
            <option value="product">Product</option>
            <option value="category">Category</option>
            <option value="channel">Channel</option>
            <option value="location">Location</option>
          </select>
        </div>
        <div><label style={dlbl}>Channel</label>
          <select value={filter.channel} onChange={(e) => setFilter({ ...filter, channel: e.target.value })}>
            <option value="">All</option>
            {Object.entries(CHANNEL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
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
        <div>
          <label style={{ ...dlbl, marginBottom: '0.5rem' }}>&nbsp;</label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
            <input type="checkbox" checked={filter.includeUnpaid} onChange={(e) => setFilter({ ...filter, includeUnpaid: e.target.checked })} />
            Include unpaid
          </label>
        </div>
      </div>

      {t && (
        <div className="dash-cards" style={cardGrid}>
          <div className="dash-card"><div className="dash-card-label">Revenue</div><div className="dash-card-value">{money(currency, t.gross)}</div></div>
          <div className="dash-card"><div className="dash-card-label">Orders</div><div className="dash-card-value">{t.orders}</div></div>
          <div className="dash-card"><div className="dash-card-label">Units</div><div className="dash-card-value">{t.units}</div></div>
          <div className="dash-card"><div className="dash-card-label">Avg order</div><div className="dash-card-value">{money(currency, t.avgOrderValue)}</div></div>
          <div className="dash-card"><div className="dash-card-label">Cost of goods</div><div className="dash-card-value">{money(currency, t.cogs)}</div></div>
          <div className="dash-card">
            <div className="dash-card-label">Profit</div>
            <div className="dash-card-value" style={{ color: t.profit >= 0 ? 'var(--success)' : 'var(--danger)' }}>{money(currency, t.profit)}</div>
          </div>
          <div className="dash-card"><div className="dash-card-label">Margin</div><div className="dash-card-value">{t.margin}%</div></div>
        </div>
      )}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>{groupLabel}</th>
              <th style={right}>Orders</th>
              <th style={right}>Units</th>
              <th style={right}>Revenue</th>
              <th style={right}>Cost</th>
              <th style={right}>Profit</th>
              <th style={right}>Margin</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} style={empty}>Loading…</td></tr>}
            {!loading && (!data?.rows?.length) && <tr><td colSpan={7} style={empty}>No sales in this period</td></tr>}
            {!loading && data?.rows?.map((r) => (
              <tr key={r.key}>
                <td>
                  {filter.groupBy === 'channel' ? (CHANNEL_LABEL[r.label] || r.label) : r.label}
                  {r.labelAr && <div style={{ fontSize: '0.78rem', color: 'var(--text-light)', direction: 'rtl' }}>{r.labelAr}</div>}
                </td>
                <td style={right}>{r.orders}</td>
                <td style={right}>{r.units}</td>
                <td style={right}>{money(currency, r.revenue)}</td>
                <td style={right}>{money(currency, r.cogs)}</td>
                <td style={{ ...right, color: r.profit >= 0 ? 'var(--success)' : 'var(--danger)' }}>{money(currency, r.profit)}</td>
                <td style={right}>{r.margin}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Dead stock ────────────────────────────────────────────────────
function DeadStockTab({ currency, locations = [] }) {
  const [filter, setFilter] = useState({ days: 90, maxUnits: 0, locationId: '' });
  const [data, setData] = useState(null);
  // Starts true: the first load is already in flight on mount.
  const [loading, setLoading] = useState(true);

  const params = {
    days: filter.days, maxUnits: filter.maxUnits,
    ...(filter.locationId ? { locationId: filter.locationId } : {}),
  };

  const load = useCallback(() => {
    api.get('/erp-reports/dead-stock', { params })
      .then((r) => setData(r.data))
      .catch((e) => toast.error(e.response?.data?.message || 'Failed to load'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter.days, filter.maxUnits, filter.locationId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="admin-section">
      <div className="admin-section-header">
        <h2>Dead Stock</h2>
        <ExportButton onClick={() => downloadCsv('/erp-reports/dead-stock', params, `dead-stock-${filter.days}d.csv`)} />
      </div>

      <p style={{ color: 'var(--text-light)', fontSize: '0.85rem', marginTop: '-0.5rem', marginBottom: '1rem' }}>
        Products you still hold stock of that sold {filter.maxUnits === 0 ? 'nothing' : `${filter.maxUnits} or fewer`} in the last {filter.days} days.
      </p>

      <div style={filterBar}>
        <div><label style={dlbl}>Period (days)</label>
          <select value={filter.days} onChange={(e) => setFilter({ ...filter, days: parseInt(e.target.value, 10) })}>
            <option value={30}>30</option><option value={60}>60</option>
            <option value={90}>90</option><option value={180}>180</option><option value={365}>365</option>
          </select>
        </div>
        <div><label style={dlbl}>Max units sold</label>
          <input type="number" min={0} value={filter.maxUnits} style={{ width: 110 }}
            onChange={(e) => setFilter({ ...filter, maxUnits: parseInt(e.target.value, 10) || 0 })} />
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

      {data && (
        <div className="dash-cards" style={cardGrid}>
          <div className="dash-card"><div className="dash-card-label">Items</div><div className="dash-card-value">{data.count}</div></div>
          <div className="dash-card">
            <div className="dash-card-label">Capital tied up</div>
            <div className="dash-card-value" style={{ color: 'var(--danger)' }}>{money(currency, data.totalValue)}</div>
          </div>
        </div>
      )}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Code</th><th>Product</th><th>Category</th>
              <th style={right}>Stock</th><th style={right}>Sold</th>
              <th>Last sold</th><th style={right}>Tied-up value</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} style={empty}>Loading…</td></tr>}
            {!loading && !data?.rows?.length && <tr><td colSpan={7} style={empty}>Nothing is sitting still — good news</td></tr>}
            {!loading && data?.rows?.map((r) => (
              <tr key={r.id}>
                <td>{r.code || '—'}</td>
                <td>
                  {r.name}
                  {r.nameAr && <div style={{ fontSize: '0.78rem', color: 'var(--text-light)', direction: 'rtl' }}>{r.nameAr}</div>}
                </td>
                <td>{r.category || '—'}</td>
                <td style={right}>{r.stock}</td>
                <td style={right}>{r.unitsSold}</td>
                <td>{r.daysSinceLastSale == null
                  ? <span style={{ color: 'var(--danger)' }}>Never sold</span>
                  : `${r.daysSinceLastSale} days ago`}</td>
                <td style={{ ...right, fontWeight: 600 }}>{money(currency, r.tiedUpValue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Fast moving ───────────────────────────────────────────────────
function FastMovingTab({ currency, locations = [] }) {
  const [filter, setFilter] = useState({ days: 30, locationId: '' });
  const [data, setData] = useState(null);
  // Starts true: the first load is already in flight on mount.
  const [loading, setLoading] = useState(true);

  const params = { days: filter.days, ...(filter.locationId ? { locationId: filter.locationId } : {}) };

  const load = useCallback(() => {
    api.get('/erp-reports/fast-moving', { params })
      .then((r) => setData(r.data))
      .catch((e) => toast.error(e.response?.data?.message || 'Failed to load'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter.days, filter.locationId]);

  useEffect(() => { load(); }, [load]);

  const atRisk = data?.rows?.filter((r) => r.stockOutRisk).length || 0;

  return (
    <div className="admin-section">
      <div className="admin-section-header">
        <h2>Fast Moving Items</h2>
        <ExportButton onClick={() => downloadCsv('/erp-reports/fast-moving', params, `fast-moving-${filter.days}d.csv`)} />
      </div>

      <div style={filterBar}>
        <div><label style={dlbl}>Period (days)</label>
          <select value={filter.days} onChange={(e) => setFilter({ ...filter, days: parseInt(e.target.value, 10) })}>
            <option value={7}>7</option><option value={14}>14</option>
            <option value={30}>30</option><option value={60}>60</option><option value={90}>90</option>
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

      {atRisk > 0 && (
        <div style={{ padding: '0.75rem 1rem', marginBottom: '1rem', borderRadius: 8, background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', fontSize: '0.88rem' }}>
          {atRisk} fast-moving {atRisk === 1 ? 'item has' : 'items have'} less than a week of stock left.
        </div>
      )}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>#</th><th>Product</th>
              <th style={right}>Units sold</th><th style={right}>Revenue</th>
              <th style={right}>Units/day</th><th style={right}>Stock</th><th style={right}>Days of cover</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} style={empty}>Loading…</td></tr>}
            {!loading && !data?.rows?.length && <tr><td colSpan={7} style={empty}>No sales in this period</td></tr>}
            {!loading && data?.rows?.map((r, i) => (
              <tr key={r.id}>
                <td>{i + 1}</td>
                <td>
                  {r.name}
                  {r.nameAr && <div style={{ fontSize: '0.78rem', color: 'var(--text-light)', direction: 'rtl' }}>{r.nameAr}</div>}
                </td>
                <td style={{ ...right, fontWeight: 600 }}>{r.unitsSold}</td>
                <td style={right}>{money(currency, r.revenue)}</td>
                <td style={right}>{r.velocity}</td>
                <td style={right}>{r.stock}</td>
                <td style={{ ...right, color: r.stockOutRisk ? 'var(--danger)' : undefined, fontWeight: r.stockOutRisk ? 600 : undefined }}>
                  {r.daysOfCover == null ? '—' : `${r.daysOfCover}d`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Reorder ───────────────────────────────────────────────────────
function ReorderTab({ currency, locations = [] }) {
  const [filter, setFilter] = useState({ locationId: '' });
  const [data, setData] = useState(null);
  // Starts true: the first load is already in flight on mount.
  const [loading, setLoading] = useState(true);

  const params = { ...(filter.locationId ? { locationId: filter.locationId } : {}) };

  const load = useCallback(() => {
    api.get('/erp-reports/reorder', { params })
      .then((r) => setData(r.data))
      .catch((e) => toast.error(e.response?.data?.message || 'Failed to load'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter.locationId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="admin-section">
      <div className="admin-section-header">
        <h2>Reorder</h2>
        <ExportButton onClick={() => downloadCsv('/erp-reports/reorder', params, 'reorder.csv')} />
      </div>

      <p style={{ color: 'var(--text-light)', fontSize: '0.85rem', marginTop: '-0.5rem', marginBottom: '1rem' }}>
        Products at or below their reorder level. Set a level per product (Products tab) or per location (Inventory tab) —
        products with no reorder level set are never listed here.
      </p>

      {locations.length > 0 && (
        <div style={filterBar}>
          <div><label style={dlbl}>Location</label>
            <select value={filter.locationId} onChange={(e) => setFilter({ ...filter, locationId: e.target.value })}>
              <option value="">All</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        </div>
      )}

      {data && (
        <div className="dash-cards" style={cardGrid}>
          <div className="dash-card"><div className="dash-card-label">To reorder</div><div className="dash-card-value">{data.count}</div></div>
          <div className="dash-card">
            <div className="dash-card-label">Out of stock</div>
            <div className="dash-card-value" style={{ color: data.outOfStockCount > 0 ? 'var(--danger)' : undefined }}>{data.outOfStockCount}</div>
          </div>
          <div className="dash-card"><div className="dash-card-label">Estimated cost</div><div className="dash-card-value">{money(currency, data.estimatedTotal)}</div></div>
        </div>
      )}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Code</th><th>Product</th>
              <th style={right}>Stock</th><th style={right}>Reorder at</th>
              <th style={right}>Suggested</th><th>Supplier</th><th style={right}>Est. cost</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} style={empty}>Loading…</td></tr>}
            {!loading && !data?.rows?.length && <tr><td colSpan={7} style={empty}>Nothing needs reordering</td></tr>}
            {!loading && data?.rows?.map((r) => (
              <tr key={r.id}>
                <td>{r.code || '—'}</td>
                <td>
                  {r.name}
                  {r.outOfStock && <span style={{ marginLeft: 6, fontSize: '0.7rem', padding: '2px 6px', borderRadius: 4, background: 'rgba(239,68,68,0.15)', color: 'var(--danger)' }}>OUT</span>}
                  {r.nameAr && <div style={{ fontSize: '0.78rem', color: 'var(--text-light)', direction: 'rtl' }}>{r.nameAr}</div>}
                </td>
                <td style={{ ...right, color: r.outOfStock ? 'var(--danger)' : undefined }}>{r.stock}</td>
                <td style={right}>{r.reorderLevel}</td>
                <td style={{ ...right, fontWeight: 600 }}>{r.suggestedQty}</td>
                <td>{r.supplierName || <span style={{ color: 'var(--text-light)' }}>—</span>}</td>
                <td style={right}>{money(currency, r.estimatedCost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Supplier purchases ────────────────────────────────────────────
function SupplierPurchasesTab({ currency }) {
  const [filter, setFilter] = useState(defaultRange(90));
  const [data, setData] = useState(null);
  // Starts true: the first load is already in flight on mount.
  const [loading, setLoading] = useState(true);

  const params = { from: filter.from, to: filter.to };

  const load = useCallback(() => {
    api.get('/erp-reports/purchases-by-supplier', { params })
      .then((r) => setData(r.data))
      .catch((e) => toast.error(e.response?.data?.message || 'Failed to load'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter.from, filter.to]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="admin-section">
      <div className="admin-section-header">
        <h2>Supplier Purchases</h2>
        <ExportButton onClick={() => downloadCsv('/erp-reports/purchases-by-supplier', params, 'purchases-by-supplier.csv')} />
      </div>

      <div style={filterBar}>
        <div><label style={dlbl}>From</label><input type="date" value={filter.from} onChange={(e) => setFilter({ ...filter, from: e.target.value })} /></div>
        <div><label style={dlbl}>To</label><input type="date" value={filter.to} onChange={(e) => setFilter({ ...filter, to: e.target.value })} /></div>
      </div>

      {data && (
        <div className="dash-cards" style={cardGrid}>
          <div className="dash-card"><div className="dash-card-label">Purchased</div><div className="dash-card-value">{money(currency, data.totals.purchased)}</div></div>
          <div className="dash-card">
            <div className="dash-card-label">Outstanding</div>
            <div className="dash-card-value" style={{ color: data.totals.outstanding > 0 ? 'var(--danger)' : undefined }}>{money(currency, data.totals.outstanding)}</div>
          </div>
        </div>
      )}

      <p style={{ color: 'var(--text-light)', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
        Purchased is for the selected dates. Paid and Outstanding are lifetime balances.
      </p>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Code</th><th>Supplier</th>
              <th style={right}>POs</th><th style={right}>Purchased</th>
              <th style={right}>Paid</th><th style={right}>Outstanding</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} style={empty}>Loading…</td></tr>}
            {!loading && !data?.rows?.length && <tr><td colSpan={6} style={empty}>No purchases in this period</td></tr>}
            {!loading && data?.rows?.map((r) => (
              <tr key={r.id}>
                <td>{r.code || '—'}</td>
                <td>{r.name}</td>
                <td style={right}>{r.poCount}</td>
                <td style={right}>{money(currency, r.totalPurchased)}</td>
                <td style={right}>{money(currency, r.totalPaid)}</td>
                <td style={{ ...right, fontWeight: 600, color: r.outstanding > 0 ? 'var(--danger)' : 'var(--success)' }}>
                  {money(currency, r.outstanding)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
