/**
 * Delivery Reports.
 *
 * Read-only report over existing confirmed delivery orders plus the delivery
 * staff directory. Filtering happens in the browser over the same data the
 * Delivery board already loads; exports (Excel/PDF) are generated client-side
 * and never write back to the database.
 */
import { useQuery } from '@tanstack/react-query';
import { Download, FileSpreadsheet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { utils, writeFile } from 'xlsx';

import { EmptyState, ErrorState, LoadingRows, PageHeader } from '@/hub/components/shared';
import { Button } from '@/hub/ui/button';
import { Input } from '@/hub/ui/input';
import { Label } from '@/hub/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/hub/ui/select';
import { deliveryStaffQuery, ordersQuery } from '@/hub/lib/api';
import { useHubTitle } from '@/hub/lib/useHubTitle';
import { cn } from '@/lib/utils';

const PERIODS = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'yearly', label: 'Yearly' },
];

const qar2 = (v) =>
  `QAR ${Number(v ?? 0).toLocaleString('en-QA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const isoDay = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const day = (v) =>
  v ? new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

/**
 * Store calendar day (Asia/Qatar, via lib/storeTime) of a timestamp, or a
 * YYYY-MM-DD date as is. isoDay above is only for calendar arithmetic on
 * day strings, where the browser's own zone cancels out.
 */
const localDay = (v) => {
  if (!v) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-CA');
};

/** Inclusive [from, to] ISO-day range for the chosen period around `anchor`. */
function periodRange(period, anchor) {
  const d = anchor ? new Date(`${anchor}T00:00:00`) : new Date();
  if (period === 'daily') return { from: isoDay(d), to: isoDay(d) };
  if (period === 'weekly') {
    const start = new Date(d);
    const dow = (start.getDay() + 6) % 7; // Monday = 0
    start.setDate(start.getDate() - dow);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return { from: isoDay(start), to: isoDay(end) };
  }
  if (period === 'monthly') {
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return { from: isoDay(start), to: isoDay(end) };
  }
  return { from: `${d.getFullYear()}-01-01`, to: `${d.getFullYear()}-12-31` };
}

export default function DeliveryReportsPage() {
  useHubTitle('Delivery Reports — FEMNIA Hub');
  const orders = useQuery(ordersQuery);
  const staff = useQuery(deliveryStaffQuery);

  const [period, setPeriod] = useState('daily');
  const [anchor, setAnchor] = useState(() => new Date().toLocaleDateString('en-CA'));
  const [driverFilter, setDriverFilter] = useState('all');

  const { from, to } = periodRange(period, anchor);
  const fileDate = period === 'yearly' ? from.slice(0, 4) : period === 'monthly' ? from.slice(0, 7) : from;
  const baseName = `delivery-report-${period}-${fileDate}`;

  const staffById = useMemo(() => {
    const map = new Map();
    for (const s of staff.data ?? []) {
      map.set(s.id, { name: s.fullName ?? s.username ?? 'Driver', phone: s.phone ?? '' });
    }
    return map;
  }, [staff.data]);

  const rows = useMemo(() => {
    const list = [];
    for (const o of orders.data ?? []) {
      if (o.tillSale || o.fulfilmentMethod !== 'Delivery') continue;
      if (o.status === 'Draft' || o.status === 'Cancelled') continue;
      const dateIso = localDay(o.deliveryDate ?? o.orderDate);
      if (!dateIso || dateIso < from || dateIso > to) continue;
      const driver = o.assignedTo ? staffById.get(o.assignedTo) : undefined;
      if (driverFilter !== 'all' && o.assignedTo !== driverFilter) continue;
      list.push({
        id: o.id,
        date: dateIso,
        customer: o.customerName,
        area: o.area ?? '—',
        driverName: driver?.name ?? 'Unassigned',
        driverPhone: driver?.phone || '—',
        status: o.status,
        charge: Number(o.deliveryCharge ?? 0),
        driverId: o.assignedTo ?? null,
      });
    }
    list.sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date)));
    return list;
  }, [orders.data, from, to, driverFilter, staffById]);

  const totalCharge = rows.reduce((s, r) => s + r.charge, 0);
  const perDriver = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      const key = r.driverId ?? 'unassigned';
      const entry = map.get(key) ?? { name: r.driverName, count: 0, charge: 0 };
      entry.count += 1;
      entry.charge += r.charge;
      map.set(key, entry);
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [rows]);

  const rangeLabel = `${day(from)} — ${day(to)}`;

  const exportExcel = () => {
    const detail = rows.map((r) => ({
      Date: day(r.date),
      'Delivery/Invoice No': r.id,
      Customer: r.customer,
      Area: r.area,
      'Driver Name': r.driverName,
      'Driver Phone': r.driverPhone,
      'Delivery Status': r.status,
      'Delivery Charge (QAR)': Number(r.charge.toFixed(2)),
    }));
    const summary = perDriver.map((p) => ({
      'Driver Name': p.name,
      Deliveries: p.count,
      'Total Charge Collected (QAR)': Number(p.charge.toFixed(2)),
    }));
    summary.push({ 'Driver Name': 'TOTAL', Deliveries: rows.length, 'Total Charge Collected (QAR)': Number(totalCharge.toFixed(2)) });
    const wb = utils.book_new();
    const ws = utils.json_to_sheet(detail.length ? detail : [{ Date: 'No deliveries in this period' }]);
    ws['!cols'] = [{ wch: 14 }, { wch: 20 }, { wch: 24 }, { wch: 16 }, { wch: 18 }, { wch: 14 }, { wch: 16 }, { wch: 20 }];
    utils.book_append_sheet(wb, ws, 'Deliveries');
    const ws2 = utils.json_to_sheet(summary);
    ws2['!cols'] = [{ wch: 22 }, { wch: 12 }, { wch: 28 }];
    utils.book_append_sheet(wb, ws2, 'Per-Driver Summary');
    writeFile(wb, `${baseName}.xlsx`);
  };

  const exportPdf = async () => {
    // Loaded on demand so jsPDF stays out of the hub bundle.
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    let y = 14;
    doc.setFontSize(14);
    doc.text('FEMNIA — Delivery Report', 12, y);
    doc.setFontSize(9);
    y += 6;
    doc.text(`Period: ${period} · ${rangeLabel}`, 12, y);
    y += 5;
    doc.text(`Total deliveries: ${rows.length} · Total delivery charge: ${qar2(totalCharge)}`, 12, y);
    y += 8;

    const cols = [12, 40, 68, 104, 134, 166, 192, 216];
    const headers = ['Date', 'Invoice No', 'Customer', 'Area', 'Driver', 'Phone', 'Status', 'Charge (QAR)'];
    const line = () => {
      doc.setDrawColor(200);
      doc.line(12, y, pageW - 12, y);
      y += 3;
    };
    const ensure = () => {
      if (y > 190) {
        doc.addPage();
        y = 14;
      }
    };
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    headers.forEach((h, i) => doc.text(h, cols[i], y));
    doc.setFont('helvetica', 'normal');
    y += 2;
    line();
    for (const r of rows) {
      ensure();
      const values = [day(r.date), r.id, r.customer, r.area, r.driverName, r.driverPhone, r.status, r.charge.toFixed(2)];
      values.forEach((v, i) => doc.text(String(v).slice(0, i === 2 ? 26 : 20), cols[i], y));
      y += 5;
    }
    y += 4;
    ensure();
    doc.setFont('helvetica', 'bold');
    doc.text('Per-Driver Summary', 12, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    for (const p of perDriver) {
      ensure();
      doc.text(`${p.name} — ${p.count} deliveries — ${qar2(p.charge)}`, 12, y);
      y += 5;
    }
    doc.save(`${baseName}.pdf`);
  };

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title="Delivery Reports"
        subtitle="Deliveries, drivers and delivery charges for a day, week, month or year."
        actions={
          <>
            <Button variant="outline" size="sm" className="h-10" onClick={exportExcel} disabled={!rows.length}>
              <FileSpreadsheet className="mr-2 size-4" /> Download Excel (.xlsx)
            </Button>
            <Button size="sm" className="h-10" onClick={exportPdf} disabled={!rows.length}>
              <Download className="mr-2 size-4" /> Download PDF
            </Button>
          </>
        }
      />

      {/* Filters */}
      <div className="no-print mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex rounded-xl border border-border p-1">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                period === p.key ? 'bg-primary text-primary-foreground' : 'text-foreground/70 hover:bg-secondary',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div>
          <Label htmlFor="report-anchor" className="text-xs text-muted-foreground">
            {period === 'daily' ? 'Day' : period === 'weekly' ? 'Any day in the week' : period === 'monthly' ? 'Any day in the month' : 'Year'}
          </Label>
          {period === 'yearly' ? (
            <Select value={String(new Date(`${anchor}T00:00:00`).getFullYear())} onValueChange={(y) => setAnchor(`${y}-01-01`)}>
              <SelectTrigger className="h-10 w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 7 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input id="report-anchor" type="date" value={anchor} onChange={(e) => setAnchor(e.target.value)} className="h-10 w-44" />
          )}
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Driver</Label>
          <Select value={driverFilter} onValueChange={setDriverFilter}>
            <SelectTrigger className="h-10 w-48">
              <SelectValue placeholder="All drivers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All drivers</SelectItem>
              {(staff.data ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.fullName ?? s.username ?? 'Driver'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground">{rangeLabel}</p>
      </div>

      {orders.isError ? (
        <ErrorState message="Could not load deliveries." onRetry={() => orders.refetch()} />
      ) : orders.isLoading ? (
        <LoadingRows />
      ) : rows.length === 0 ? (
        <EmptyState title="No deliveries" hint="No delivery orders match the selected period and driver." />
      ) : (
        <>
          {/* Detail table */}
          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-3 py-2.5">Delivery/Invoice No</th>
                  <th className="px-3 py-2.5">Customer</th>
                  <th className="px-3 py-2.5">Area</th>
                  <th className="px-3 py-2.5">Driver Name</th>
                  <th className="px-3 py-2.5">Driver Phone</th>
                  <th className="px-3 py-2.5">Delivery Status</th>
                  <th className="px-3 py-2.5 text-right">Delivery Charge</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-3 py-2 whitespace-nowrap">{day(r.date)}</td>
                    <td className="px-3 py-2 font-medium">{r.id}</td>
                    <td className="px-3 py-2">{r.customer}</td>
                    <td className="px-3 py-2">{r.area}</td>
                    <td className="px-3 py-2">{r.driverName}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.driverPhone}</td>
                    <td className="px-3 py-2">{r.status}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{qar2(r.charge)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-border bg-secondary/40 text-sm font-semibold">
                <tr>
                  <td className="px-3 py-2.5" colSpan={6}>
                    Total deliveries: {rows.length}
                  </td>
                  <td className="px-3 py-2.5 text-right">Total charge</td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">{qar2(totalCharge)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Per-driver summary */}
          <div className="mt-4 rounded-2xl border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold text-foreground">Per-driver summary</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {perDriver.map((p) => (
                <div key={p.name} className="rounded-xl border border-border bg-secondary/30 p-3">
                  <p className="truncate text-sm font-medium text-foreground">{p.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{p.count} {p.count === 1 ? 'delivery' : 'deliveries'}</p>
                  <p className="mt-0.5 text-sm font-semibold text-primary">{qar2(p.charge)}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
