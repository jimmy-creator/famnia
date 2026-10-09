import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Download } from 'lucide-react';
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { toast } from 'sonner';

import { EmptyState, ErrorState, Kpi, LoadingRows } from '@/hub/components/shared';
import { Button } from '@/hub/ui/button';
import { Input } from '@/hub/ui/input';
import { Label } from '@/hub/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/hub/ui/select';
import { Switch } from '@/hub/ui/switch';
import { MULTILOC, downloadServerCsv, locationsListQuery, reportQuery } from '@/hub/lib/apiReportsExtra';
import { QAR, downloadFile, toCsv } from '@/hub/lib/format';
import { todayIso } from '@/hub/lib/reports';
import { cn } from '@/lib/utils';

/*
 * The classic ERP analysis reports (/admin/erp: Sales report, Fast moving,
 * Dead stock, Purchase report, Profit & Loss, Balance sheet, Stock value)
 * rebuilt as hub report tabs. Same endpoints, same figures.
 */

const pct = (n) => `${Number(n ?? 0).toFixed(1)}%`;
const num = (n) => Number(n ?? 0).toLocaleString();

/* ------------------------------- building blocks ------------------------------- */

export function Field({ label, children, className }) {
  return (
    <div className={cn('space-y-1', className)}>
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

export function FilterBar({ children, actions }) {
  return (
    <div className="no-print card-surface mb-4 flex flex-col gap-3 p-3 lg:flex-row lg:items-end lg:justify-between">
      <div className="flex flex-wrap items-end gap-3">{children}</div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, note, children, className }) {
  return (
    <section className={cn('card-surface mt-4 p-4', className)}>
      {title && <h2 className="section-title text-sm font-semibold text-foreground">{title}</h2>}
      {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
      <div className={title || note ? 'mt-3' : ''}>{children}</div>
    </section>
  );
}

export function Notice({ tone = 'warn', children }) {
  return (
    <div
      className={cn(
        'mt-4 flex items-start gap-2 rounded-xl border p-3 text-sm',
        tone === 'warn' ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-border bg-secondary/40 text-foreground',
      )}
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

/**
 * Responsive table. `cols`: [{ label, right? }]; `rows`: arrays of cells;
 * `foot`: optional summary rows; `dim(i)`: fade a row (e.g. zero stock).
 */
export function DataTable({ cols, rows, foot = [], empty = 'Nothing to show for these filters', dim, onRowClick }) {
  if (!rows.length) return <EmptyState title={empty} />;
  const align = (j) => (cols[j]?.right ? 'text-right tabular-nums' : 'text-left');
  return (
    <>
      <div className="space-y-2 md:hidden">
        {rows.map((r, i) => (
          <div
            key={i}
            className={cn('rounded-xl border border-border bg-card p-3', dim?.(i) && 'opacity-50', onRowClick && 'cursor-pointer')}
            onClick={onRowClick ? () => onRowClick(i) : undefined}
          >
            {cols.map((c, j) => (
              <div key={c.label || j} className="flex justify-between gap-3 py-0.5 text-sm">
                <span className="text-muted-foreground">{c.label}</span>
                <span className="text-right font-medium text-foreground">{r[j]}</span>
              </div>
            ))}
          </div>
        ))}
        {foot.map((r, i) => (
          <div key={`f${i}`} className="flex justify-between gap-3 rounded-xl bg-secondary/50 px-3 py-2 text-sm font-semibold">
            <span>{r[0]}</span>
            <span>{r.slice(1).filter((c) => c !== '' && c != null).join(' · ')}</span>
          </div>
        ))}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
              {cols.map((c, j) => (
                <th key={c.label || j} className={cn('px-3 py-2 font-medium', align(j))}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={i}
                className={cn(
                  'border-b border-border/60 last:border-0',
                  dim?.(i) && 'opacity-50',
                  onRowClick && 'cursor-pointer hover:bg-secondary/40',
                )}
                onClick={onRowClick ? () => onRowClick(i) : undefined}
              >
                {r.map((c, j) => (
                  <td key={j} className={cn('px-3 py-2 text-foreground', align(j))}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {foot.length > 0 && (
            <tfoot>
              {foot.map((r, i) => (
                <tr key={i} className="border-t border-border bg-secondary/40 font-semibold">
                  {r.map((c, j) => (
                    <td key={j} className={cn('px-3 py-2', align(j))}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tfoot>
          )}
        </table>
      </div>
    </>
  );
}

export function HBars({ data, money = true }) {
  if (!data.length) return null;
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 11 }} width={56} />
          <Tooltip formatter={(v) => (money ? QAR(v) : num(v))} />
          <Bar dataKey="value" fill="#4A2040" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Location picker over GET /locations; '' means all locations. */
export function LocationSelect({ value, onChange, allLabel = 'All locations' }) {
  const locations = useQuery({ ...locationsListQuery, enabled: MULTILOC }).data ?? [];
  if (!MULTILOC) return null;
  return (
    <Field label="Location">
      <Select value={value ? String(value) : 'all'} onValueChange={(v) => onChange(v === 'all' ? '' : v)}>
        <SelectTrigger className="h-10 w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{allLabel}</SelectItem>
          {locations.map((l) => (
            <SelectItem key={l.id} value={String(l.id)}>
              {l.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

export function ChoiceSelect({ label, value, onChange, options, className = 'w-44' }) {
  return (
    <Field label={label}>
      <Select value={String(value)} onValueChange={onChange}>
        <SelectTrigger className={cn('h-10', className)}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([v, l]) => (
            <SelectItem key={v} value={String(v)}>
              {l}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

function CsvButton({ onClick, disabled }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      className="h-10"
      disabled={disabled || busy}
      onClick={async () => {
        setBusy(true);
        try {
          await onClick();
        } catch (err) {
          toast.error(err?.message || 'Export failed');
        } finally {
          setBusy(false);
        }
      }}
    >
      <Download className="mr-2 size-4" /> {busy ? 'Exporting…' : 'Export CSV'}
    </Button>
  );
}

/** Client-side CSV from table columns + plain-value rows. */
const csvFrom = (filename, head, rows) =>
  downloadFile(filename, toCsv(rows.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])))));

function Loadable({ q, section, children }) {
  if (q.error) return <ErrorState section={section} message={q.error.message} onRetry={() => void q.refetch()} />;
  if (q.isLoading || !q.data) return <LoadingRows count={5} />;
  return children(q.data);
}

/* --------------------------------- Sales analysis --------------------------------- */

const CHANNEL_LABEL = { web: 'Website', pos: 'In-store (POS)', phone: 'Phone', whatsapp: 'WhatsApp', other: 'Other' };
const GROUPS = [
  ['day', 'Day'],
  ['product', 'Product'],
  ['category', 'Category'],
  ['channel', 'Channel'],
  ...(MULTILOC ? [['location', 'Location']] : []),
];

export function SalesAnalysisReport({ range }) {
  const [groupBy, setGroupBy] = useState('day');
  const [channel, setChannel] = useState('');
  const [locationId, setLocationId] = useState('');
  const [includeUnpaid, setIncludeUnpaid] = useState(false);
  const params = {
    from: range.from,
    to: range.to,
    groupBy,
    channel,
    locationId,
    includeUnpaid: includeUnpaid ? 'true' : '',
  };
  const q = useQuery(reportQuery('/erp-reports/sales', params));
  const groupLabel = GROUPS.find(([k]) => k === groupBy)?.[1] ?? 'Group';
  const label = (r) => (groupBy === 'channel' ? CHANNEL_LABEL[r.key] || r.label : r.label);

  return (
    <>
      <FilterBar
        actions={
          <CsvButton
            disabled={!q.data?.rows?.length}
            onClick={() =>
              downloadServerCsv('/erp-reports/sales', params, `sales-${groupBy}-${range.from}-to-${range.to}.csv`)
            }
          />
        }
      >
        <ChoiceSelect label="Group by" value={groupBy} onChange={setGroupBy} options={GROUPS} className="w-36" />
        <ChoiceSelect
          label="Channel"
          value={channel || 'all'}
          onChange={(v) => setChannel(v === 'all' ? '' : v)}
          options={[['all', 'All channels'], ...Object.entries(CHANNEL_LABEL)]}
        />
        <LocationSelect value={locationId} onChange={setLocationId} />
        <Field label="Unpaid orders">
          <label className="flex h-10 items-center gap-2 text-sm">
            <Switch checked={includeUnpaid} onCheckedChange={setIncludeUnpaid} />
            Include unpaid
          </label>
        </Field>
      </FilterBar>
      <Loadable q={q} section="sales analysis">
        {(d) => (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Kpi label="Revenue" value={QAR(d.totals.gross)} />
              <Kpi label="Orders" value={num(d.totals.orders)} />
              <Kpi label="Units" value={num(d.totals.units)} />
              <Kpi label="Avg order" value={QAR(d.totals.avgOrderValue)} />
              <Kpi label="Cost (COGS)" value={QAR(d.totals.cogs)} tone="warn" />
              <Kpi
                label={`Profit · ${pct(d.totals.margin)}`}
                value={QAR(d.totals.profit)}
                tone={d.totals.profit >= 0 ? 'good' : 'danger'}
              />
            </div>
            {d.rows.length > 0 && (
              <Panel title={`Revenue by ${groupLabel.toLowerCase()}`}>
                <HBars
                  data={(groupBy === 'day' ? d.rows : d.rows.slice(0, 15)).map((r) => ({
                    label: label(r),
                    value: r.revenue,
                  }))}
                />
              </Panel>
            )}
            <Panel title={`Sales by ${groupLabel.toLowerCase()}`}>
              <DataTable
                cols={[
                  { label: groupLabel },
                  { label: 'Orders', right: true },
                  { label: 'Units', right: true },
                  { label: 'Revenue', right: true },
                  { label: 'Cost', right: true },
                  { label: 'Profit', right: true },
                  { label: 'Margin', right: true },
                ]}
                rows={d.rows.map((r) => [
                  <span key="l">
                    {label(r)}
                    {r.labelAr && <span className="block text-xs text-muted-foreground" dir="rtl">{r.labelAr}</span>}
                  </span>,
                  num(r.orders),
                  num(r.units),
                  QAR(r.revenue),
                  QAR(r.cogs),
                  <span key="p" className={r.profit < 0 ? 'text-destructive' : ''}>{QAR(r.profit)}</span>,
                  pct(r.margin),
                ])}
                empty="No sales in this period"
              />
            </Panel>
          </>
        )}
      </Loadable>
    </>
  );
}

/* --------------------------------- Fast moving --------------------------------- */

export function FastMovingReport() {
  const [days, setDays] = useState('30');
  const [locationId, setLocationId] = useState('');
  const params = { days, locationId };
  const q = useQuery(reportQuery('/erp-reports/fast-moving', params));
  return (
    <>
      <FilterBar
        actions={
          <CsvButton
            disabled={!q.data?.rows?.length}
            onClick={() => downloadServerCsv('/erp-reports/fast-moving', params, `fast-moving-${days}d.csv`)}
          />
        }
      >
        <ChoiceSelect
          label="Period"
          value={days}
          onChange={setDays}
          options={['7', '14', '30', '60', '90'].map((d) => [d, `Last ${d} days`])}
        />
        <LocationSelect value={locationId} onChange={setLocationId} />
      </FilterBar>
      <Loadable q={q} section="fast moving report">
        {(d) => {
          const risky = d.rows.filter((r) => r.stockOutRisk).length;
          return (
            <>
              {risky > 0 && (
                <Notice>
                  <strong>{risky}</strong> best seller{risky === 1 ? ' has' : 's have'} less than a week of stock left —
                  reorder soon.
                </Notice>
              )}
              {d.rows.length > 0 && (
                <Panel title="Units sold (top 15)">
                  <HBars money={false} data={d.rows.slice(0, 15).map((r) => ({ label: r.name, value: r.unitsSold }))} />
                </Panel>
              )}
              <Panel title="Best sellers" note="Velocity is units sold per day; days of cover is current stock ÷ velocity.">
                <DataTable
                  cols={[
                    { label: '#' },
                    { label: 'Product' },
                    { label: 'Units sold', right: true },
                    { label: 'Revenue', right: true },
                    { label: 'Per day', right: true },
                    { label: 'In stock', right: true },
                    { label: 'Days of cover', right: true },
                  ]}
                  rows={d.rows.map((r, i) => [
                    i + 1,
                    <span key="n">
                      {r.name}
                      {r.nameAr && <span className="block text-xs text-muted-foreground" dir="rtl">{r.nameAr}</span>}
                    </span>,
                    num(r.unitsSold),
                    QAR(r.revenue),
                    Number(r.velocity ?? 0).toFixed(2),
                    num(r.stock),
                    <span key="c" className={r.stockOutRisk ? 'font-semibold text-destructive' : ''}>
                      {r.daysOfCover == null ? '—' : `${r.daysOfCover} days`}
                    </span>,
                  ])}
                  empty="Nothing sold in this period"
                />
              </Panel>
            </>
          );
        }}
      </Loadable>
    </>
  );
}

/* --------------------------------- Dead stock --------------------------------- */

export function DeadStockReport() {
  const [days, setDays] = useState('90');
  const [maxUnits, setMaxUnits] = useState('0');
  const [locationId, setLocationId] = useState('');
  const params = { days, maxUnits, locationId };
  const q = useQuery(reportQuery('/erp-reports/dead-stock', params));
  return (
    <>
      <FilterBar
        actions={
          <CsvButton
            disabled={!q.data?.rows?.length}
            onClick={() => downloadServerCsv('/erp-reports/dead-stock', params, `dead-stock-${days}d.csv`)}
          />
        }
      >
        <ChoiceSelect
          label="No sales in"
          value={days}
          onChange={setDays}
          options={['30', '60', '90', '180', '365'].map((d) => [d, `Last ${d} days`])}
        />
        <Field label="Sold at most (units)">
          <Input
            type="number"
            min="0"
            className="h-10 w-32"
            value={maxUnits}
            onChange={(e) => setMaxUnits(e.target.value === '' ? '0' : e.target.value)}
          />
        </Field>
        <LocationSelect value={locationId} onChange={setLocationId} />
      </FilterBar>
      <Loadable q={q} section="dead stock report">
        {(d) => (
          <>
            <div className="grid grid-cols-2 gap-3 sm:w-1/2">
              <Kpi label="Slow / dead products" value={num(d.count)} tone={d.count ? 'warn' : 'good'} />
              <Kpi label="Value tied up (cost)" value={QAR(d.totalValue)} tone={d.count ? 'danger' : 'default'} />
            </div>
            <Panel
              title="Products not selling"
              note={`In stock, and sold ${maxUnits === '0' ? 'nothing' : `${maxUnits} units or fewer`} in the last ${days} days. Consider a discount, bundle or return to supplier.`}
            >
              <DataTable
                cols={[
                  { label: 'Code' },
                  { label: 'Product' },
                  { label: 'Category' },
                  { label: 'In stock', right: true },
                  { label: 'Sold', right: true },
                  { label: 'Last sale', right: true },
                  { label: 'Value tied up', right: true },
                ]}
                rows={d.rows.map((r) => [
                  <span key="c" className="font-mono text-xs">{r.code || '—'}</span>,
                  <span key="n">
                    {r.name}
                    {r.nameAr && <span className="block text-xs text-muted-foreground" dir="rtl">{r.nameAr}</span>}
                  </span>,
                  r.category || '—',
                  num(r.stock),
                  num(r.unitsSold),
                  r.daysSinceLastSale == null ? 'Never sold' : `${r.daysSinceLastSale} days ago`,
                  QAR(r.tiedUpValue),
                ])}
                empty="No dead stock — everything in stock is selling"
              />
            </Panel>
          </>
        )}
      </Loadable>
    </>
  );
}

/* --------------------------------- Purchases --------------------------------- */

export function PurchasesReport({ range }) {
  const params = { from: range.from, to: range.to };
  const q = useQuery(reportQuery('/erp-reports/purchases-by-supplier', params));
  return (
    <>
      <FilterBar
        actions={
          <CsvButton
            disabled={!q.data?.rows?.length}
            onClick={() => downloadServerCsv('/erp-reports/purchases-by-supplier', params, 'purchases-by-supplier.csv')}
          />
        }
      >
        <p className="text-sm text-muted-foreground">Uses the dates above.</p>
      </FilterBar>
      <Loadable q={q} section="purchase report">
        {(d) => (
          <>
            <div className="grid grid-cols-2 gap-3 sm:w-1/2">
              <Kpi label="Purchased (period)" value={QAR(d.totals.purchased)} />
              <Kpi label="Outstanding (all time)" value={QAR(d.totals.outstanding)} tone={d.totals.outstanding > 0 ? 'danger' : 'good'} />
            </div>
            <Panel title="Purchases by supplier" note="Purchased is for the selected dates. Paid and Outstanding are lifetime balances.">
              <DataTable
                cols={[
                  { label: 'Code' },
                  { label: 'Supplier' },
                  { label: 'POs', right: true },
                  { label: 'Purchased', right: true },
                  { label: 'Paid', right: true },
                  { label: 'Outstanding', right: true },
                ]}
                rows={d.rows.map((r) => [
                  <span key="c" className="font-mono text-xs">{r.code || '—'}</span>,
                  r.name,
                  num(r.poCount),
                  QAR(r.totalPurchased),
                  QAR(r.totalPaid),
                  <span key="o" className={r.outstanding > 0 ? 'font-semibold text-destructive' : ''}>{QAR(r.outstanding)}</span>,
                ])}
                empty="No purchases in this period"
              />
            </Panel>
          </>
        )}
      </Loadable>
    </>
  );
}

/* ------------------------------ Profit & Loss (cash) ------------------------------ */

export function PnlReport({ range }) {
  const [locationId, setLocationId] = useState('');
  const params = { from: range.from, to: range.to, locationId };
  const q = useQuery(reportQuery('/finance/pnl', params));

  const exportCsv = () => {
    const p = q.data;
    const rows = [
      ['Summary', 'Revenue', p.netRevenue],
      ['Summary', 'Cost of goods sold', p.cogs],
      ['Summary', 'Gross profit', p.grossProfit],
      ['Summary', 'Expenses', p.expenses],
      ['Summary', 'Depreciation (non-cash)', p.depreciation ?? 0],
      ['Summary', 'Stock losses (non-cash)', p.stockLosses ?? 0],
      ['Summary', 'Disposal gain / (loss)', p.disposalGainLoss ?? 0],
      ['Summary', 'Delivery income', p.deliveryIncome ?? 0],
      ['Summary', 'Net profit', p.netProfit],
      ...p.byCategory.map((r) => ['Revenue by category', r.category, r.revenue, r.qty, r.cogs, r.grossProfit]),
      ...p.expensesByCategory.map((r) => ['Expenses by category', r.category, r.amount]),
      ...(p.depreciationByAsset ?? []).map((r) => ['Depreciation by asset', r.asset, r.amount]),
    ];
    csvFrom(`pnl-${range.from}-to-${range.to}.csv`, ['Section', 'Line', 'Amount', 'Qty', 'COGS', 'Gross profit'], rows);
  };

  return (
    <>
      <FilterBar actions={<CsvButton disabled={!q.data} onClick={exportCsv} />}>
        <LocationSelect value={locationId} onChange={setLocationId} />
        <p className="pb-2 text-sm text-muted-foreground">Cash basis · uses the dates above.</p>
      </FilterBar>
      <Loadable q={q} section="profit & loss">
        {(p) => {
          const loss = p.stockLossDetail ?? {};
          return (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <Kpi label="Revenue" value={QAR(p.netRevenue)} />
                <Kpi label="Cost of goods (COGS)" value={QAR(p.cogs)} tone="warn" />
                <Kpi
                  label={`Gross profit · ${p.grossMargin ?? 0}%`}
                  value={QAR(p.grossProfit)}
                  tone={p.grossProfit >= 0 ? 'good' : 'danger'}
                />
                <Kpi label="Expenses" value={QAR(p.expenses)} tone="warn" />
                <Kpi label="Net profit" value={QAR(p.netProfit)} tone={p.netProfit >= 0 ? 'good' : 'danger'} />
                <Kpi label="Depreciation (non-cash)" value={QAR(p.depreciation ?? 0)} />
                <Kpi label="Stock losses (non-cash)" value={QAR(p.stockLosses ?? 0)} />
                {(p.disposalGainLoss ?? 0) !== 0 && (
                  <Kpi
                    label="Disposal gain / (loss)"
                    value={QAR(p.disposalGainLoss)}
                    tone={p.disposalGainLoss >= 0 ? 'good' : 'danger'}
                  />
                )}
                {(p.deliveryIncome ?? 0) > 0 && <Kpi label="Delivery income" value={QAR(p.deliveryIncome)} />}
              </div>

              {p.cogs === 0 && p.revenue > 0 && (
                <Notice>
                  <strong>Heads up:</strong> cost of goods is 0. Set a cost price on your products (or receive a purchase
                  order with unit costs) so margin can be calculated.
                </Notice>
              )}

              <div className="grid gap-4 lg:grid-cols-2">
                <Panel title="Revenue by category" note="Lines are at line price; the foot reconciles to Revenue.">
                  <DataTable
                    cols={[
                      { label: 'Category' },
                      { label: 'Qty', right: true },
                      { label: 'Revenue', right: true },
                      { label: 'COGS', right: true },
                      { label: 'Gross', right: true },
                    ]}
                    rows={p.byCategory.map((r) => [r.category, num(r.qty), QAR(r.revenue), QAR(r.cogs), QAR(r.grossProfit)])}
                    foot={
                      p.byCategory.length
                        ? [
                            ...((p.deliveryIncome ?? 0) > 0 ? [['Delivery', '', QAR(p.deliveryIncome), '', '']] : []),
                            ...((p.billDiscounts ?? 0) > 0 ? [['Less bill discounts', '', `−${QAR(p.billDiscounts)}`, '', '']] : []),
                            ...((p.refunds ?? 0) > 0 ? [['Less refunds', '', `−${QAR(p.refunds)}`, '', '']] : []),
                            ['Revenue', '', QAR(p.netRevenue), '', ''],
                          ]
                        : []
                    }
                    empty="No sales"
                  />
                </Panel>
                <div>
                  <Panel title="Expenses by category">
                    <DataTable
                      cols={[{ label: 'Category' }, { label: 'Amount', right: true }]}
                      rows={p.expensesByCategory.map((r) => [r.category, QAR(r.amount)])}
                      foot={p.expensesByCategory.length ? [['Total expenses', QAR(p.expenses)]] : []}
                      empty="No expenses"
                    />
                  </Panel>
                  {(p.depreciationByAsset?.length ?? 0) > 0 && (
                    <Panel title="Depreciation by asset" note="Non-cash: no money left an account.">
                      <DataTable
                        cols={[{ label: 'Asset' }, { label: 'Amount', right: true }]}
                        rows={p.depreciationByAsset.map((r) => [r.asset, QAR(r.amount)])}
                      />
                    </Panel>
                  )}
                  {(p.stockLosses ?? 0) > 0 && (
                    <Panel title="Stock losses" note="Non-cash: stock written off at cost.">
                      <DataTable
                        cols={[{ label: 'Source' }, { label: 'Amount', right: true }]}
                        rows={[
                          ['Wastage write-offs', QAR(loss.wastage ?? 0)],
                          ['Stock-count variance', QAR(loss.countVariance ?? 0)],
                          ...((loss.stockOut ?? 0) !== 0 ? [['Stock out (damaged / lost)', QAR(loss.stockOut)]] : []),
                        ]}
                        foot={[['Total', QAR(p.stockLosses)]]}
                      />
                    </Panel>
                  )}
                </div>
              </div>
            </>
          );
        }}
      </Loadable>
    </>
  );
}

/* --------------------------------- Balance sheet --------------------------------- */

const humanise = (k) => k.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());

function SheetLines({ lines }) {
  return (
    <div className="divide-y divide-border/60 text-sm">
      {lines.filter(Boolean).map(([label, value, opt = {}]) => (
        <div
          key={label}
          className={cn(
            'flex justify-between gap-3 py-2',
            opt.indent && 'pl-5',
            opt.muted && 'text-muted-foreground',
            opt.strong && 'font-semibold',
          )}
        >
          <span>{label}</span>
          <span className="tabular-nums">{QAR(value)}</span>
        </div>
      ))}
    </div>
  );
}

export function BalanceSheetReport() {
  const [asOf, setAsOf] = useState(() => todayIso());
  const q = useQuery(reportQuery('/accounting/balance-sheet', { asOf }));

  const lines = (bs) => {
    const { assets: A, liabilities: L, equity: E } = bs;
    return {
      assets: [
        ['Cash in hand', A.cashInHand],
        ['Cash in bank', A.cashInBank],
        ...A.cashByAccount.map((a) => [`${a.name}${a.active ? '' : ' (inactive)'}`, a.balance, { indent: true, muted: true }]),
        ['Inventory at cost', A.inventory],
        ['Fixed assets at cost', A.fixedAssetsAtCost],
        ['less accumulated depreciation', -A.accumulatedDepreciation, { indent: true, muted: true }],
        ['Fixed assets (net)', A.fixedAssetsNet],
        A.supplierAdvances > 0 ? ['Supplier advances', A.supplierAdvances] : null,
        ['Total assets', A.total, { strong: true }],
      ],
      liabilities: [
        ['Supplier payable', L.supplierPayable],
        ['Owed to people who paid personally', L.personalPayable || 0],
        ['Total liabilities', L.total, { strong: true }],
        ["Owner's capital", E.capitalContributions],
        ['less drawings', -E.drawings, { indent: true, muted: true }],
        ['Retained profit', E.retainedProfit],
        ["Owner's equity", E.total, { strong: true }],
        ['Total liabilities & equity', bs.totalLiabilitiesAndEquity, { strong: true }],
      ],
    };
  };

  const exportCsv = () => {
    const l = lines(q.data);
    const rows = [
      ...l.assets.filter(Boolean).map(([label, v]) => ['Assets', label, v]),
      ...l.liabilities.map(([label, v]) => ['Liabilities & equity', label, v]),
      ['Reconciliation', 'Difference', q.data.reconciliation.difference],
      ...Object.entries(q.data.reconciliation.quantified ?? {}).map(([k, v]) => ['Reconciliation', humanise(k), v]),
    ];
    csvFrom(`balance-sheet-${asOf}.csv`, ['Section', 'Line', 'Amount'], rows);
  };

  return (
    <>
      <FilterBar actions={<CsvButton disabled={!q.data} onClick={exportCsv} />}>
        <Field label="As of">
          <Input type="date" className="h-10 w-44" value={asOf} onChange={(e) => setAsOf(e.target.value || todayIso())} />
        </Field>
      </FilterBar>
      <Loadable q={q} section="balance sheet">
        {(bs) => {
          const R = bs.reconciliation;
          const l = lines(bs);
          return (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Kpi label="Total assets" value={QAR(bs.assets.total)} />
                <Kpi label="Total liabilities" value={QAR(bs.liabilities.total)} tone="warn" />
                <Kpi label="Owner's equity" value={QAR(bs.equity.total)} />
                <Kpi label="Difference" value={QAR(R.difference)} tone={R.balanced ? 'good' : 'danger'} />
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <Panel title="Assets">
                  <SheetLines lines={l.assets} />
                </Panel>
                <Panel title="Liabilities & equity">
                  <SheetLines lines={l.liabilities} />
                </Panel>
              </div>
              {!R.balanced && (
                <Panel title={`Assets exceed liabilities and equity by ${QAR(R.difference)}`}>
                  <p className="text-sm text-muted-foreground">
                    This is a single-entry cash ledger, so the sheet is an aggregation rather than a trial balance. The
                    difference is shown rather than absorbed. Known causes, quantified where possible:
                  </p>
                  <div className="mt-3">
                    <DataTable
                      cols={[{ label: 'Cause' }, { label: 'Amount', right: true }]}
                      rows={Object.entries(R.quantified ?? {}).map(([k, v]) => [humanise(k), QAR(v)])}
                      empty="No quantified causes"
                    />
                  </div>
                  {R.notes?.length > 0 && (
                    <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                      {R.notes.map((n) => (
                        <li key={n}>{n}</li>
                      ))}
                    </ul>
                  )}
                </Panel>
              )}
            </>
          );
        }}
      </Loadable>
    </>
  );
}

/* --------------------------------- Stock value --------------------------------- */

export function StockValueReport() {
  const [locationId, setLocationId] = useState('');
  const [search, setSearch] = useState('');
  const q = useQuery(reportQuery('/finance/stock-value', { locationId }));

  const exportCsv = () =>
    csvFrom(
      `stock-value${locationId ? `-loc${locationId}` : ''}-${todayIso()}.csv`,
      ['Item', 'SKU', 'Location', 'Qty', 'Unit cost', 'Cost value', 'Retail value', 'Margin %'],
      q.data.rows.map((r) => [r.name, r.sku ?? '', r.location?.name ?? '', r.quantity, r.costPrice ?? '', r.value, r.retailValue, r.costPrice ? r.margin : '']),
    );

  return (
    <>
      <FilterBar actions={<CsvButton disabled={!q.data?.rows?.length} onClick={exportCsv} />}>
        <LocationSelect value={locationId} onChange={setLocationId} />
        <Field label="Search">
          <Input className="h-10 w-56" placeholder="Product or SKU" value={search} onChange={(e) => setSearch(e.target.value)} />
        </Field>
      </FilterBar>
      <Loadable q={q} section="stock value">
        {(sv) => {
          const needle = search.trim().toLowerCase();
          const rows = needle
            ? sv.rows.filter((r) => `${r.name} ${r.sku ?? ''}`.toLowerCase().includes(needle))
            : sv.rows;
          return (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Kpi label="Total units" value={num(sv.totals.quantity)} />
                <Kpi label="Stock value (cost)" value={QAR(sv.totals.value)} />
                <Kpi label="Retail value" value={QAR(sv.totals.retailValue)} tone="good" />
                <Kpi label="Potential margin" value={`${sv.totals.marginPct}%`} />
              </div>
              {!locationId && sv.byLocation.length > 1 && (
                <Panel title="By location">
                  <DataTable
                    cols={[
                      { label: 'Location' },
                      { label: 'Units', right: true },
                      { label: 'Cost value', right: true },
                      { label: 'Retail value', right: true },
                    ]}
                    rows={sv.byLocation.map((r) => [r.locationName, num(r.quantity), QAR(r.value), QAR(r.retailValue)])}
                  />
                </Panel>
              )}
              <Panel title="By product" note="Faded rows have no stock. Rows without a cost price add nothing to the cost value.">
                <DataTable
                  cols={[
                    { label: 'Item' },
                    { label: 'Location' },
                    { label: 'Qty', right: true },
                    { label: 'Unit cost', right: true },
                    { label: 'Value', right: true },
                    { label: 'Retail', right: true },
                    { label: 'Margin', right: true },
                  ]}
                  rows={rows.map((r) => [
                    <span key="n">
                      {r.name}
                      {r.sku && <span className="block font-mono text-xs text-muted-foreground">{r.sku}</span>}
                    </span>,
                    r.location?.name || '—',
                    num(r.quantity),
                    r.costPrice ? QAR(r.costPrice) : <span key="c" className="text-muted-foreground">no cost</span>,
                    QAR(r.value),
                    QAR(r.retailValue),
                    r.costPrice ? `${r.margin}%` : '—',
                  ])}
                  dim={(i) => rows[i].quantity === 0}
                  empty={needle ? 'No products match' : 'No stock'}
                />
              </Panel>
            </>
          );
        }}
      </Loadable>
    </>
  );
}
