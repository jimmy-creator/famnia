import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Lock, Pencil, Plus, Printer, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import PosReportReceipt from '@/components/PosReportReceipt';
import {
  ChoiceSelect,
  DataTable,
  Field,
  FilterBar,
  LocationSelect,
  Panel,
} from '@/hub/components/ReportsAnalysis';
import { Badge } from '@/hub/ui/badge';
import { EmptyState, ErrorState, Kpi, LoadingRows, PageHeader } from '@/hub/components/shared';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/hub/ui/alert-dialog';
import { Button } from '@/hub/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/hub/ui/dialog';
import { Input } from '@/hub/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/hub/ui/select';
import { Switch } from '@/hub/ui/switch';
import { accessQuery } from '@/hub/lib/api';
import {
  MULTILOC,
  canAnalytics,
  canLegacy,
  cancelTillReturn,
  cashiersQuery,
  createCashier,
  deleteCashier,
  fetchDayReport,
  fetchShiftReport,
  invalidateReportsExtra,
  locationsListQuery,
  posSalesQuery,
  shiftsQuery,
  tillReturnQuery,
  tillReturnsQuery,
  updateCashier,
} from '@/hub/lib/apiReportsExtra';
import { QAR, downloadFile, toCsv } from '@/hub/lib/format';
import { useHubTitle } from '@/hub/lib/useHubTitle';
import { cn, localDate } from '@/lib/utils';
import { CURRENCY } from '@/utils/currency';

/*
 * POS back office: shifts with X/Z and daily reports, cashier and location
 * totals, cashier accounts and till returns — the classic /admin/erp
 * "Cashiers & Shifts", "POS Reports" and "Till Returns" screens, native.
 * The till itself stays at the staff POS URL; /hub/pos is the hub's own
 * New Sales Order.
 */

const dateTime = (d) => (d ? new Date(d).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return localDate(d);
};
const QUICK_RANGES = [
  ['today', 'Today', () => [localDate(), localDate()]],
  ['7d', 'Last 7 days', () => [daysAgo(6), localDate()]],
  ['30d', 'Last 30 days', () => [daysAgo(29), localDate()]],
  ['mtd', 'This month', () => [`${localDate().slice(0, 8)}01`, localDate()]],
];

function QuickRange({ onPick }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {QUICK_RANGES.map(([k, label, fn]) => (
        <Button key={k} size="sm" variant="outline" className="h-10" onClick={() => onPick(...fn())}>
          {label}
        </Button>
      ))}
    </div>
  );
}

function DateField({ label, value, onChange }) {
  return (
    <Field label={label}>
      <Input type="date" className="h-10 w-40" value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

/* ------------------------------ Shifts & reports ------------------------------ */

function ShiftsTab({ onReport }) {
  const [filter, setFilter] = useState({ from: '', to: '' });
  const [day, setDay] = useState({ date: localDate(), locationId: '' });
  const [loadingId, setLoadingId] = useState(null);
  const shifts = useQuery(shiftsQuery(filter));
  const ranged = filter.from || filter.to;

  const open = async (id, fn) => {
    setLoadingId(id);
    try {
      onReport(await fn());
    } catch (err) {
      toast.error(err.message || 'Could not load the report');
    } finally {
      setLoadingId(null);
    }
  };

  const rows = shifts.data ?? [];
  return (
    <>
      <Panel
        title="Daily report"
        note="Every in-store sale on a day across all shifts — print it on the receipt printer or as a page."
        className="mt-0"
      >
        <div className="flex flex-wrap items-end gap-3">
          <DateField label="Date" value={day.date} onChange={(v) => setDay({ ...day, date: v || localDate() })} />
          <LocationSelect value={day.locationId} onChange={(v) => setDay({ ...day, locationId: v })} />
          <Button
            className="h-10"
            disabled={loadingId === 'day'}
            onClick={() => open('day', () => fetchDayReport(day.date, day.locationId))}
          >
            <Printer className="mr-2 size-4" /> {loadingId === 'day' ? 'Loading…' : 'Open daily report'}
          </Button>
        </div>
      </Panel>

      <Panel
        title={ranged ? 'Shifts' : 'Recent shifts'}
        note="Open a shift's X-report (still open) or Z-report (closed) to view or print it."
      >
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <DateField label="Opened from" value={filter.from} onChange={(v) => setFilter({ ...filter, from: v })} />
          <DateField label="To" value={filter.to} onChange={(v) => setFilter({ ...filter, to: v })} />
          <Button
            variant="outline"
            className="h-10"
            onClick={() => setFilter({ from: daysAgo(1), to: daysAgo(1) })}
          >
            Yesterday
          </Button>
          <Button variant="outline" className="h-10" onClick={() => setFilter({ from: localDate(), to: localDate() })}>
            Today
          </Button>
          {ranged && (
            <Button variant="ghost" className="h-10" onClick={() => setFilter({ from: '', to: '' })}>
              Clear
            </Button>
          )}
        </div>
        {shifts.error ? (
          <ErrorState section="shifts" message={shifts.error.message} onRetry={() => void shifts.refetch()} />
        ) : shifts.isLoading ? (
          <LoadingRows count={4} />
        ) : (
          <DataTable
            cols={[
              { label: 'Cashier' },
              { label: 'Location' },
              { label: 'Opened' },
              { label: 'Closed' },
              { label: 'Opening cash', right: true },
              { label: 'Closing cash', right: true },
              { label: 'Variance', right: true },
              { label: 'Status' },
              { label: 'Report' },
            ]}
            rows={rows.map((s) => {
              const variance = s.cashVariance == null ? null : parseFloat(s.cashVariance);
              return [
                s.User?.name || `#${s.userId}`,
                s.Location?.name || '—',
                dateTime(s.openedAt),
                dateTime(s.closedAt),
                QAR(s.openingCash),
                s.closingCash != null ? QAR(s.closingCash) : '—',
                variance == null ? (
                  '—'
                ) : (
                  <span
                    key="v"
                    className={cn('font-semibold', variance < 0 ? 'text-destructive' : variance > 0 ? 'text-amber-700' : 'text-emerald-700')}
                  >
                    {variance > 0 ? '+' : ''}
                    {QAR(variance)}
                  </span>
                ),
                <Badge key="st" variant={s.status === 'open' ? 'default' : 'secondary'}>
                  {s.status === 'open' ? 'Open' : 'Closed'}
                </Badge>,
                <Button
                  key="r"
                  size="sm"
                  variant="outline"
                  disabled={loadingId === s.id}
                  onClick={() => open(s.id, () => fetchShiftReport(s.id))}
                >
                  <FileText className="mr-1.5 size-4" />
                  {loadingId === s.id ? '…' : s.status === 'open' ? 'X-report' : 'Z-report'}
                </Button>,
              ];
            })}
            empty={ranged ? 'No shifts opened in these dates' : 'No shifts yet'}
          />
        )}
      </Panel>
    </>
  );
}

/* --------------------------------- POS reports --------------------------------- */

function PosReportsTab({ isAdmin }) {
  const [groupBy, setGroupBy] = useState('cashier');
  const [range, setRange] = useState({ from: localDate(), to: localDate() });
  const [locationId, setLocationId] = useState('');
  const [cashierId, setCashierId] = useState('');
  const cashiers = useQuery({ ...cashiersQuery, enabled: isAdmin }).data ?? [];
  const params = { ...range, locationId, cashierId: groupBy === 'cashier' ? cashierId : '' };
  const q = useQuery(posSalesQuery(groupBy, params));
  const who = groupBy === 'location' ? 'Location' : 'Cashier';

  const exportCsv = () => {
    const rows = q.data.rows.map((r) => ({
      [who]: groupBy === 'location' ? r.locationName : r.cashierName,
      Orders: r.orderCount,
      Cash: r.cashSales,
      Card: r.cardSales,
      Refunds: (r.cashRefunds || 0) + (r.cardRefunds || 0),
      'Net sales': r.netSales,
    }));
    downloadFile(`pos-${groupBy}-${range.from}-to-${range.to}.csv`, toCsv(rows));
  };

  return (
    <>
      <FilterBar
        actions={
          <Button size="sm" variant="outline" className="h-10" disabled={!q.data?.rows?.length} onClick={exportCsv}>
            Export CSV
          </Button>
        }
      >
        <ChoiceSelect
          label="Group by"
          value={groupBy}
          onChange={setGroupBy}
          options={[
            ['cashier', 'Cashier'],
            ['location', 'Location'],
          ]}
          className="w-36"
        />
        <DateField label="From" value={range.from} onChange={(v) => setRange({ ...range, from: v || localDate() })} />
        <DateField label="To" value={range.to} onChange={(v) => setRange({ ...range, to: v || localDate() })} />
        <QuickRange onPick={(from, to) => setRange({ from, to })} />
        <LocationSelect value={locationId} onChange={setLocationId} />
        {groupBy === 'cashier' && isAdmin && (
          <ChoiceSelect
            label="Cashier"
            value={cashierId || 'all'}
            onChange={(v) => setCashierId(v === 'all' ? '' : v)}
            options={[['all', 'All cashiers'], ...cashiers.map((c) => [String(c.id), c.name])]}
          />
        )}
      </FilterBar>
      {q.error ? (
        <ErrorState section="POS report" message={q.error.message} onRetry={() => void q.refetch()} />
      ) : q.isLoading || !q.data ? (
        <LoadingRows count={4} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Orders" value={q.data.totals.orderCount} />
            <Kpi label="Cash sales" value={QAR(q.data.totals.cashSales)} />
            <Kpi label="Card sales" value={QAR(q.data.totals.cardSales)} />
            <Kpi label="Net sales" value={QAR(q.data.totals.netSales)} tone="good" />
          </div>
          <Panel title={`By ${who.toLowerCase()}`}>
            <DataTable
              cols={[
                { label: who },
                { label: 'Orders', right: true },
                { label: 'Cash', right: true },
                { label: 'Card', right: true },
                { label: 'Refunds', right: true },
                { label: 'Net sales', right: true },
              ]}
              rows={q.data.rows.map((r) => [
                groupBy === 'location' ? r.locationName : r.cashierName,
                r.orderCount,
                QAR(r.cashSales),
                QAR(r.cardSales),
                QAR((r.cashRefunds || 0) + (r.cardRefunds || 0)),
                <strong key="n">{QAR(r.netSales)}</strong>,
              ])}
              empty="No till sales in this period"
            />
          </Panel>
          {groupBy === 'location' && (
            <Panel title="Top items">
              <DataTable
                cols={[{ label: 'Item' }, { label: 'Qty', right: true }, { label: 'Revenue', right: true }]}
                rows={(q.data.topItems ?? []).map((it) => [it.name, it.qty, QAR(it.revenue)])}
                empty="No items sold"
              />
            </Panel>
          )}
        </>
      )}
    </>
  );
}

/* ---------------------------------- Cashiers ---------------------------------- */

const EMPTY_FORM = { name: '', email: '', password: '', pin: '', homeLocationId: '', isManager: false };

function CashierDialog({ cashier, onClose }) {
  const qc = useQueryClient();
  const editing = Boolean(cashier?.id);
  const [form, setForm] = useState(() =>
    editing
      ? { ...EMPTY_FORM, name: cashier.name, email: cashier.email, homeLocationId: cashier.homeLocationId ? String(cashier.homeLocationId) : '', isManager: Boolean(cashier.isManager) }
      : EMPTY_FORM,
  );
  const locations = useQuery({ ...locationsListQuery, enabled: MULTILOC }).data ?? [];
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const save = useMutation({
    mutationFn: () => {
      const base = { name: form.name.trim(), homeLocationId: form.homeLocationId ? Number(form.homeLocationId) : null, isManager: form.isManager };
      if (editing) {
        return updateCashier(cashier.id, {
          ...base,
          ...(form.password ? { password: form.password } : {}),
          ...(form.pin ? { pin: form.pin } : {}),
        });
      }
      return createCashier({ ...base, email: form.email.trim(), password: form.password, pin: form.pin });
    },
    onSuccess: () => {
      toast.success(editing ? 'Cashier updated' : 'Cashier account created');
      invalidateReportsExtra(qc, 'cashiers');
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const problem = !form.name.trim()
    ? 'Enter a name'
    : !editing && !/^\S+@\S+\.\S+$/.test(form.email.trim())
      ? 'Enter a valid email'
      : (!editing || form.password) && form.password.length < 8
        ? 'Password must be at least 8 characters'
        : (!editing || form.pin) && !/^\d{4,6}$/.test(form.pin)
          ? 'PIN must be 4–6 digits'
          : null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${cashier.name}` : 'New cashier'}</DialogTitle>
          <DialogDescription>
            Cashiers sign in at the till with their email and password, then unlock it with their PIN.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (problem) return toast.error(problem);
            save.mutate();
          }}
        >
          <Field label="Name">
            <Input className="h-10" value={form.name} onChange={(e) => set({ name: e.target.value })} autoFocus />
          </Field>
          <Field label={editing ? 'Email (cannot be changed)' : 'Email'}>
            <Input
              className="h-10"
              type="email"
              value={form.email}
              disabled={editing}
              onChange={(e) => set({ email: e.target.value })}
            />
          </Field>
          <Field label={editing ? 'New password (blank keeps it)' : 'Password (8+ characters)'}>
            <Input
              className="h-10"
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => set({ password: e.target.value })}
            />
          </Field>
          <Field label={editing ? 'New PIN (blank keeps it)' : 'PIN (4–6 digits)'}>
            <Input
              className="h-10"
              inputMode="numeric"
              placeholder="1234"
              value={form.pin}
              onChange={(e) => set({ pin: e.target.value.replace(/\D/g, '').slice(0, 6) })}
            />
          </Field>
          {MULTILOC && (
            <Field label="Home location (suggested at login)" className="sm:col-span-2">
              <Select value={form.homeLocationId || 'none'} onValueChange={(v) => set({ homeLocationId: v === 'none' ? '' : v })}>
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {locations.map((l) => (
                    <SelectItem key={l.id} value={String(l.id)}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          <label className="flex items-start gap-3 rounded-xl border border-border p-3 text-sm sm:col-span-2">
            <Switch checked={form.isManager} onCheckedChange={(v) => set({ isManager: v })} />
            <span>
              <span className="font-medium">Manager</span>
              <span className="block text-xs text-muted-foreground">
                Can approve POS overrides — large discounts, price cuts and large refunds.
              </span>
            </span>
          </label>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : editing ? 'Save' : 'Create cashier'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CashiersTab() {
  const qc = useQueryClient();
  const cashiers = useQuery(cashiersQuery);
  const locations = useQuery({ ...locationsListQuery, enabled: MULTILOC }).data ?? [];
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const remove = useMutation({
    mutationFn: (id) => deleteCashier(id),
    onSuccess: () => {
      toast.success('Cashier deleted');
      invalidateReportsExtra(qc, 'cashiers');
    },
    onError: (err) => toast.error(err.message),
    onSettled: () => setDeleting(null),
  });
  const rows = cashiers.data ?? [];

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button className="h-10" onClick={() => setEditing({})}>
          <Plus className="mr-2 size-4" /> Add cashier
        </Button>
      </div>
      {cashiers.error ? (
        <ErrorState section="cashiers" message={cashiers.error.message} onRetry={() => void cashiers.refetch()} />
      ) : cashiers.isLoading ? (
        <LoadingRows count={4} />
      ) : (
        <Panel className="mt-0">
          <DataTable
            cols={[{ label: 'Name' }, { label: 'Email' }, { label: 'Home location' }, { label: 'Role' }, { label: 'Created' }, { label: '' }]}
            rows={rows.map((u) => [
              <strong key="n">{u.name}</strong>,
              u.email,
              locations.find((l) => l.id === u.homeLocationId)?.name || '—',
              u.isManager ? <Badge key="m">Manager</Badge> : 'Cashier',
              new Date(u.createdAt).toLocaleDateString(),
              <div key="a" className="flex justify-end gap-1">
                <Button size="icon" variant="ghost" aria-label={`Edit ${u.name}`} onClick={() => setEditing(u)}>
                  <Pencil className="size-4" />
                </Button>
                <Button size="icon" variant="ghost" aria-label={`Delete ${u.name}`} onClick={() => setDeleting(u)}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>,
            ])}
            empty="No cashier accounts yet"
          />
        </Panel>
      )}
      {editing && <CashierDialog key={editing.id ?? 'new'} cashier={editing} onClose={() => setEditing(null)} />}
      <AlertDialog open={Boolean(deleting)} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete cashier “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              They will no longer be able to sign in at the till. Past sales and shifts keep their name.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => remove.mutate(deleting.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* --------------------------------- Till returns --------------------------------- */

const METHOD_LABEL = { cash: 'Cash', card: 'Card' };

function ReturnDetail({ id, isAdmin, onClose }) {
  const qc = useQueryClient();
  const q = useQuery(tillReturnQuery(id));
  const [confirming, setConfirming] = useState(false);
  const cancel = useMutation({
    mutationFn: () => cancelTillReturn(id),
    onSuccess: () => {
      toast.success('Return cancelled — stock deducted and refund reversed');
      invalidateReportsExtra(qc, 'returns');
      invalidateReportsExtra(qc, 'return', id);
      setConfirming(false);
    },
    onError: (err) => toast.error(err.message),
  });
  const r = q.data;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Return {r?.returnNumber ?? ''}</DialogTitle>
          <DialogDescription>
            {r ? `${dateTime(r.createdAt)} · ${r.Location?.name || '—'} · by ${r.processor?.name || '—'}` : 'Loading…'}
          </DialogDescription>
        </DialogHeader>
        {q.error ? (
          <ErrorState section="return" message={q.error.message} onRetry={() => void q.refetch()} />
        ) : !r ? (
          <LoadingRows count={3} />
        ) : (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-muted-foreground">Original order: </span>
                {r.Order?.orderNumber || 'No receipt'}
              </div>
              <div>
                <span className="text-muted-foreground">Refund: </span>
                <strong>{QAR(r.refundAmount)}</strong> ({METHOD_LABEL[r.refundMethod] || r.refundMethod})
              </div>
              <div>
                <span className="text-muted-foreground">Status: </span>
                <Badge variant={r.status === 'cancelled' ? 'secondary' : 'default'}>{r.status}</Badge>
              </div>
              {r.CashierSession && (
                <div>
                  <span className="text-muted-foreground">Shift: </span>#{r.CashierSession.id}
                </div>
              )}
            </div>
            <DataTable
              cols={[{ label: 'Item' }, { label: 'Qty', right: true }, { label: 'Refund', right: true }, { label: 'Back to stock' }]}
              rows={(r.items ?? []).map((it) => [it.name, it.quantity, QAR(it.refundAmount), it.returnToStock === false ? 'No' : 'Yes'])}
              empty="No items"
            />
            {r.reason && (
              <p>
                <span className="text-muted-foreground">Reason: </span>
                {r.reason}
              </p>
            )}
            {r.notes && (
              <p>
                <span className="text-muted-foreground">Notes: </span>
                {r.notes}
              </p>
            )}
          </div>
        )}
        <DialogFooter>
          {isAdmin && r && r.status !== 'cancelled' && (
            <Button variant="destructive" onClick={() => setConfirming(true)}>
              Cancel return
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this return?</AlertDialogTitle>
            <AlertDialogDescription>Stock will be deducted again and the refund reversed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep return</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={cancel.isPending}
              onClick={(e) => {
                e.preventDefault();
                cancel.mutate();
              }}
            >
              {cancel.isPending ? 'Cancelling…' : 'Cancel return'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

function ReturnsTab({ isAdmin }) {
  const [filter, setFilter] = useState({ from: daysAgo(29), to: localDate(), locationId: '', refundMethod: '' });
  const [openId, setOpenId] = useState(null);
  const q = useQuery(tillReturnsQuery(filter));
  const rows = q.data ?? [];
  const live = rows.filter((r) => r.status !== 'cancelled');
  const sum = (list) => list.reduce((s, r) => s + (parseFloat(r.refundAmount) || 0), 0);

  const exportCsv = () =>
    downloadFile(
      `till-returns-${filter.from || 'all'}-to-${filter.to || 'all'}.csv`,
      toCsv(
        rows.map((r) => ({
          Date: dateTime(r.createdAt),
          Return: r.returnNumber,
          Order: r.Order?.orderNumber || 'No receipt',
          Location: r.Location?.name || '',
          'Processed by': r.processor?.name || '',
          Method: METHOD_LABEL[r.refundMethod] || r.refundMethod,
          Amount: r.refundAmount,
          Status: r.status,
        })),
      ),
    );

  return (
    <>
      <FilterBar
        actions={
          <Button size="sm" variant="outline" className="h-10" disabled={!rows.length} onClick={exportCsv}>
            Export CSV
          </Button>
        }
      >
        <DateField label="From" value={filter.from} onChange={(v) => setFilter({ ...filter, from: v })} />
        <DateField label="To" value={filter.to} onChange={(v) => setFilter({ ...filter, to: v })} />
        <QuickRange onPick={(from, to) => setFilter({ ...filter, from, to })} />
        <LocationSelect value={filter.locationId} onChange={(v) => setFilter({ ...filter, locationId: v })} />
        <ChoiceSelect
          label="Refund method"
          value={filter.refundMethod || 'all'}
          onChange={(v) => setFilter({ ...filter, refundMethod: v === 'all' ? '' : v })}
          options={[
            ['all', 'Cash & card'],
            ['cash', 'Cash'],
            ['card', 'Card'],
          ]}
          className="w-36"
        />
      </FilterBar>
      {q.error ? (
        <ErrorState section="till returns" message={q.error.message} onRetry={() => void q.refetch()} />
      ) : q.isLoading ? (
        <LoadingRows count={4} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Returns" value={live.length} />
            <Kpi label="Refunded" value={QAR(sum(live))} tone="warn" />
            <Kpi label="Cash refunds" value={QAR(sum(live.filter((r) => r.refundMethod === 'cash')))} />
            <Kpi label="Card refunds" value={QAR(sum(live.filter((r) => r.refundMethod === 'card')))} />
          </div>
          <Panel title="Returns" note="Click a return to see its items. Cancelled returns are not counted in the totals.">
            <DataTable
              cols={[
                { label: 'Date' },
                { label: 'Return #' },
                { label: 'Order' },
                { label: 'Location' },
                { label: 'Processed by' },
                { label: 'Method' },
                { label: 'Amount', right: true },
                { label: 'Status' },
              ]}
              rows={rows.map((r) => [
                dateTime(r.createdAt),
                <span key="n" className="font-mono text-xs">{r.returnNumber}</span>,
                r.Order?.orderNumber || <span key="o" className="text-muted-foreground">No receipt</span>,
                r.Location?.name || '—',
                r.processor?.name || '—',
                METHOD_LABEL[r.refundMethod] || r.refundMethod,
                QAR(r.refundAmount),
                <Badge key="s" variant={r.status === 'cancelled' ? 'secondary' : 'default'}>
                  {r.status}
                </Badge>,
              ])}
              dim={(i) => rows[i].status === 'cancelled'}
              onRowClick={(i) => setOpenId(rows[i].id)}
              empty="No returns in these dates"
            />
          </Panel>
        </>
      )}
      {openId && <ReturnDetail key={openId} id={openId} isAdmin={isAdmin} onClose={() => setOpenId(null)} />}
    </>
  );
}

/* ----------------------------------- page ----------------------------------- */

export default function PosAdminPage() {
  useHubTitle('POS — FEMNIA Hub');
  const qc = useQueryClient();
  const access = useQuery(accessQuery).data ?? null;
  const [params, setParams] = useSearchParams();
  const [report, setReport] = useState(null);

  if (!access) return <LoadingRows count={4} />;
  const isAdmin = Boolean(access.isAdmin);
  const tabs = [
    { key: 'shifts', label: 'Shifts & reports', visible: canAnalytics(access) },
    { key: 'reports', label: 'Sales by cashier / location', visible: canAnalytics(access) },
    { key: 'returns', label: 'Till returns', visible: canLegacy(access, 'orders') },
    { key: 'cashiers', label: 'Cashiers', visible: isAdmin },
  ].filter((t) => t.visible);
  const wanted = params.get('tab');
  const tab = tabs.some((t) => t.key === wanted) ? wanted : tabs[0]?.key;

  const header = (
    <PageHeader
      title="POS"
      subtitle="Till shifts, X/Z and daily reports, cashier accounts and till returns."
      onRefresh={tabs.length ? () => void qc.invalidateQueries({ queryKey: ['femnia', 'reports-extra'] }) : undefined}
    />
  );

  if (!MULTILOC || !tabs.length) {
    return (
      <div className="mx-auto max-w-3xl">
        {header}
        {!MULTILOC ? (
          <EmptyState title="The in-store POS is not enabled" hint="Turn on multi-location inventory to use the till." />
        ) : (
          <div className="card-surface flex flex-col items-center gap-3 p-8 text-center">
            <Lock className="size-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Ask an Admin for access to POS reports or till returns.</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl">
      {header}
      <div className="no-print mb-4 flex gap-2 overflow-x-auto pb-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setParams({ tab: t.key }, { replace: true })}
            className={cn(
              'shrink-0 rounded-xl border px-3 py-2 text-sm font-medium transition-colors',
              tab === t.key
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card text-foreground hover:bg-secondary',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'shifts' && <ShiftsTab onReport={setReport} />}
      {tab === 'reports' && <PosReportsTab isAdmin={isAdmin} />}
      {tab === 'returns' && <ReturnsTab isAdmin={isAdmin} />}
      {tab === 'cashiers' && <CashiersTab />}
      {report && <PosReportReceipt report={report} currency={CURRENCY} autoPrint={false} onClose={() => setReport(null)} />}
    </div>
  );
}
