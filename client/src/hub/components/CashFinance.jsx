import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import { EmptyState, ErrorState, Kpi, LoadingRows } from '@/hub/components/shared';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/hub/ui/alert-dialog';
import { Button } from '@/hub/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/hub/ui/dialog';
import { Input } from '@/hub/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/hub/ui/sheet';
import { Textarea } from '@/hub/ui/textarea';
import {
  ASSET_CATEGORY_OPTIONS,
  assetDetailQuery,
  cancelCapitalEntry,
  capitalQuery,
  cashAccountsQuery,
  createCapitalEntry,
  disposeAsset,
  locationsQuery,
  num,
  runDepreciation,
  updateAsset,
  useInvalidateCash,
} from '@/hub/lib/apiCash';
import { QAR, today } from '@/hub/lib/format';
import { cn } from '@/lib/utils';

export const SELECT_CLS = 'h-11 w-full rounded-xl border border-input bg-background px-3 text-sm';

export function Field({ label, hint, children, className }) {
  return (
    <label className={cn('grid gap-1.5 text-sm', className)}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

/** A button that asks before doing something hard to undo. */
export function ConfirmAction({ title, description, actionLabel, onConfirm, children, destructive = true }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent className="z-[80]">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep</AlertDialogCancel>
          <AlertDialogAction
            className={destructive ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : undefined}
            onClick={onConfirm}
          >
            {actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Account picker; `showBalance` adds each account's live balance (for outflows). */
export function AccountSelect({ accounts, value, onChange, showBalance, noneLabel = '— Select account —', exclude, required }) {
  return (
    <select className={SELECT_CLS} value={value} onChange={(e) => onChange(e.target.value)} required={required}>
      <option value="">{noneLabel}</option>
      {accounts
        .filter((a) => a.active && String(a.id) !== String(exclude ?? ''))
        .map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
            {showBalance ? ` (${QAR(num(a.balance))})` : ''}
          </option>
        ))}
    </select>
  );
}

/* ------------------------------ owner capital ------------------------------ */

function CapitalDialog({ open, onClose, accounts }) {
  const invalidate = useInvalidateCash();
  const [form, setForm] = useState({
    type: 'contribution',
    amount: '',
    entryDate: today(),
    cashAccountId: '',
    ownerName: '',
    reference: '',
    description: '',
  });
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const account = accounts.find((a) => String(a.id) === String(form.cashAccountId));
  const short = form.type === 'drawing' && account && num(form.amount) > num(account.balance);
  const save = useMutation({
    mutationFn: () => createCapitalEntry({ ...form, amount: num(form.amount), cashAccountId: Number(form.cashAccountId) }),
    onSuccess: async (row) => {
      toast.success(`${form.type === 'drawing' ? 'Drawing' : 'Contribution'} ${row?.entryNumber ?? ''} recorded.`);
      await invalidate();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });
  const valid = num(form.amount) > 0 && form.cashAccountId && form.entryDate && !short;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="z-[70] max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record owner capital</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) save.mutate();
          }}
        >
          <div className="grid grid-cols-2 gap-2">
            {[
              ['contribution', 'Contribution', 'Owner puts money in'],
              ['drawing', 'Drawing', 'Owner takes money out'],
            ].map(([key, label, hint]) => (
              <button
                key={key}
                type="button"
                onClick={() => set({ type: key })}
                className={cn(
                  'rounded-xl border p-3 text-left text-sm',
                  form.type === key ? 'border-primary bg-primary/10' : 'border-border bg-card hover:bg-secondary',
                )}
              >
                <span className="block font-medium">{label}</span>
                <span className="text-xs text-muted-foreground">{hint}</span>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount *">
              <Input className="h-11" type="number" min="0" step="0.01" value={form.amount} onChange={(e) => set({ amount: e.target.value })} />
            </Field>
            <Field label="Date *">
              <Input className="h-11" type="date" value={form.entryDate} onChange={(e) => set({ entryDate: e.target.value })} />
            </Field>
          </div>
          <Field
            label={form.type === 'drawing' ? 'Paid out of account *' : 'Paid into account *'}
            hint={short ? `Not enough money: ${account.name} holds ${QAR(num(account.balance))}.` : undefined}
          >
            <AccountSelect
              accounts={accounts}
              value={form.cashAccountId}
              onChange={(v) => set({ cashAccountId: v })}
              showBalance={form.type === 'drawing'}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Owner name">
              <Input className="h-11" value={form.ownerName} onChange={(e) => set({ ownerName: e.target.value })} />
            </Field>
            <Field label="Reference">
              <Input className="h-11" value={form.reference} onChange={(e) => set({ reference: e.target.value })} />
            </Field>
          </div>
          <Field label="Description">
            <Textarea rows={2} value={form.description} onChange={(e) => set({ description: e.target.value })} />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" className="h-11 flex-1" disabled={!valid || save.isPending}>
              {save.isPending ? 'Saving…' : 'Record'}
            </Button>
            <Button type="button" variant="outline" className="h-11" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Owner contributions and drawings (Expenses page → Capital tab). */
export function CapitalPanel({ isAdmin }) {
  const invalidate = useInvalidateCash();
  const [filters, setFilters] = useState({ from: '', to: '', type: '' });
  const [formOpen, setFormOpen] = useState(false);
  const list = useQuery(capitalQuery(filters));
  const accounts = useQuery(cashAccountsQuery).data ?? [];
  const cancel = useMutation({
    mutationFn: (id) => cancelCapitalEntry(id),
    onSuccess: async () => {
      toast.success('Entry cancelled; its cash movement was reversed.');
      await invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const totals = list.data?.totals ?? { contributions: 0, drawings: 0, net: 0 };
  const entries = list.data?.entries ?? [];

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Input className="h-11" type="date" aria-label="From" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
        <Input className="h-11" type="date" aria-label="To" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
        <select className={SELECT_CLS} value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}>
          <option value="">Contributions &amp; drawings</option>
          <option value="contribution">Contributions only</option>
          <option value="drawing">Drawings only</option>
        </select>
        <Button className="h-11" onClick={() => setFormOpen(true)}>
          Record contribution / drawing
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Contributions" value={QAR(num(totals.contributions))} tone="good" />
        <Kpi label="Drawings" value={QAR(num(totals.drawings))} tone="warn" />
        <Kpi label="Net capital" value={QAR(num(totals.net))} />
      </div>

      {list.isLoading ? (
        <LoadingRows />
      ) : list.isError ? (
        <ErrorState section="Owner capital" message={list.error?.message} onRetry={() => void list.refetch()} />
      ) : entries.length === 0 ? (
        <EmptyState title="No capital entries" hint="Record money the owner puts in or takes out of the business." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Entry</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Account</th>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3">Reference / note</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">By</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                const cancelled = e.status === 'cancelled';
                return (
                  <tr key={e.id} className={cn('border-t border-border', cancelled && 'text-muted-foreground')}>
                    <td className="px-4 py-3 whitespace-nowrap">{e.entryDate}</td>
                    <td className="px-4 py-3 font-mono text-xs">{e.entryNumber}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-xs font-medium',
                          e.type === 'drawing' ? 'tint-peach text-[var(--tint-peach-ink)]' : 'tint-mint text-[var(--tint-mint-ink)]',
                        )}
                      >
                        {e.type === 'drawing' ? 'Drawing' : 'Contribution'}
                      </span>
                      {cancelled && <span className="ml-2 text-xs">(cancelled)</span>}
                    </td>
                    <td className="px-4 py-3">{e.CashAccount?.name ?? '—'}</td>
                    <td className="px-4 py-3">{e.ownerName || '—'}</td>
                    <td className="px-4 py-3">
                      {[e.reference, e.description].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td className={cn('px-4 py-3 text-right font-medium', cancelled && 'line-through')}>
                      {e.type === 'drawing' ? '−' : ''}
                      {QAR(num(e.amount))}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{e.creator?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-right">
                      {isAdmin && !cancelled && (
                        <ConfirmAction
                          title={`Cancel ${e.entryNumber}?`}
                          description="The cash movement is reversed. The entry stays in the list, marked cancelled."
                          actionLabel="Cancel entry"
                          onConfirm={() => cancel.mutate(e.id)}
                        >
                          <Button size="sm" variant="outline" className="h-8" disabled={cancel.isPending}>
                            Cancel
                          </Button>
                        </ConfirmAction>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {formOpen && <CapitalDialog open onClose={() => setFormOpen(false)} accounts={accounts} />}
    </div>
  );
}

/* ------------------------------ fixed asset detail ------------------------------ */

const ASSET_STATUS_LABELS = {
  active: 'Active',
  fully_depreciated: 'Fully depreciated',
  disposed: 'Disposed',
  written_off: 'Written off',
};

function DisposeDialog({ asset, accounts, onClose, onDone }) {
  const [form, setForm] = useState({ disposalDate: today(), proceeds: '', cashAccountId: '', notes: '', writeOff: false });
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const proceeds = form.writeOff ? 0 : num(form.proceeds);
  const gainLoss = proceeds - num(asset.netBookValue);
  const run = useMutation({
    mutationFn: () =>
      disposeAsset(asset.id, {
        disposalDate: form.disposalDate,
        proceeds,
        cashAccountId: proceeds > 0 && form.cashAccountId ? Number(form.cashAccountId) : null,
        notes: form.notes,
        writeOff: form.writeOff,
      }),
    onSuccess: (res) => {
      const gl = num(res?.gainLoss);
      toast.success(`${asset.name} ${form.writeOff ? 'written off' : 'disposed'} · ${gl >= 0 ? 'gain' : 'loss'} ${QAR(Math.abs(gl))}`);
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="z-[80] max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Dispose of {asset.name}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          The disposal month is depreciated in full first, then the asset leaves the books at its book value (now{' '}
          {QAR(num(asset.netBookValue))}).
        </p>
        <div className="grid gap-3">
          <Field label="Disposal date *">
            <Input className="h-11" type="date" value={form.disposalDate} onChange={(e) => set({ disposalDate: e.target.value })} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.writeOff} onChange={(e) => set({ writeOff: e.target.checked })} />
            Write off (scrapped, lost or stolen — no proceeds)
          </label>
          {!form.writeOff && (
            <>
              <Field label="Sale proceeds">
                <Input className="h-11" type="number" min="0" step="0.01" value={form.proceeds} onChange={(e) => set({ proceeds: e.target.value })} />
              </Field>
              <Field label="Proceeds paid into">
                <AccountSelect
                  accounts={accounts}
                  value={form.cashAccountId}
                  onChange={(v) => set({ cashAccountId: v })}
                  noneLabel="No cash received"
                />
              </Field>
            </>
          )}
          <Field label="Notes">
            <Textarea rows={2} value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
          </Field>
          <div className={cn('rounded-xl p-3 text-sm', gainLoss >= 0 ? 'tint-mint' : 'tint-rose')}>
            {gainLoss >= 0 ? 'Gain' : 'Loss'} on disposal: <strong>{QAR(Math.abs(gainLoss))}</strong>
            <span className="block text-xs text-muted-foreground">Estimate: proceeds − book value today.</span>
          </div>
          <div className="flex gap-2">
            <Button
              variant="destructive"
              className="h-11 flex-1"
              disabled={!form.disposalDate || run.isPending}
              onClick={() => run.mutate()}
            >
              {run.isPending ? 'Saving…' : form.writeOff ? 'Write off' : 'Dispose'}
            </Button>
            <Button variant="outline" className="h-11" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditAssetDialog({ asset, locations, onClose, onDone }) {
  const locked = (asset.schedule ?? []).length > 0;
  const [form, setForm] = useState({
    name: asset.name ?? '',
    category: asset.category ?? 'other',
    locationId: asset.locationId ?? '',
    serialNumber: asset.serialNumber ?? '',
    notes: asset.notes ?? '',
    depreciationRate: asset.depreciationRate ?? '',
    salvageValue: asset.salvageValue ?? '',
  });
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name.trim(),
        category: form.category,
        locationId: form.locationId ? Number(form.locationId) : null,
        serialNumber: form.serialNumber || null,
        notes: form.notes || null,
      };
      if (!locked) {
        body.depreciationRate = num(form.depreciationRate);
        body.salvageValue = num(form.salvageValue);
      }
      return updateAsset(asset.id, body);
    },
    onSuccess: () => {
      toast.success('Asset updated.');
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="z-[80] max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit asset details</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="Name *">
            <Input className="h-11" value={form.name} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <select className={SELECT_CLS} value={form.category} onChange={(e) => set({ category: e.target.value })}>
                {Object.entries(ASSET_CATEGORY_OPTIONS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Location">
              <select className={SELECT_CLS} value={form.locationId} onChange={(e) => set({ locationId: e.target.value })}>
                <option value="">—</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Serial number">
            <Input className="h-11" value={form.serialNumber} onChange={(e) => set({ serialNumber: e.target.value })} />
          </Field>
          {locked ? (
            <p className="rounded-xl bg-secondary/50 p-3 text-xs text-muted-foreground">
              Cost, rate and salvage value are locked: depreciation has been posted against them. Dispose and re-acquire to
              change them.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Depreciation % a year">
                <Input className="h-11" type="number" min="0" step="0.01" value={form.depreciationRate} onChange={(e) => set({ depreciationRate: e.target.value })} />
              </Field>
              <Field label="Salvage value">
                <Input className="h-11" type="number" min="0" step="0.01" value={form.salvageValue} onChange={(e) => set({ salvageValue: e.target.value })} />
              </Field>
            </div>
          )}
          <Field label="Notes">
            <Textarea rows={2} value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
          </Field>
          <div className="flex gap-2">
            <Button className="h-11 flex-1" disabled={!form.name.trim() || save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? 'Saving…' : 'Save'}
            </Button>
            <Button variant="outline" className="h-11" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Fixed asset: figures, depreciation schedule, and (Admin) edit / dispose / run depreciation. */
export function AssetDetailSheet({ assetId, onClose, isAdmin }) {
  const invalidate = useInvalidateCash();
  const detail = useQuery(assetDetailQuery(assetId));
  const accounts = useQuery(cashAccountsQuery).data ?? [];
  const locations = useQuery({ ...locationsQuery, enabled: isAdmin }).data ?? [];
  const [dialog, setDialog] = useState(null);
  const depreciate = useMutation({
    mutationFn: runDepreciation,
    onSuccess: async (r) => {
      toast.success(
        r?.entriesCreated
          ? `Posted ${r.entriesCreated} entries · ${QAR(num(r.totalPosted))} through ${r.throughMonth}.`
          : `Depreciation is up to date through ${r?.throughMonth ?? 'this month'}.`,
      );
      await invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const a = detail.data;
  const disposed = a && (a.status === 'disposed' || a.status === 'written_off');
  const done = async () => {
    setDialog(null);
    await invalidate();
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="z-[70] w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{a ? a.name : 'Fixed asset'}</SheetTitle>
        </SheetHeader>
        {detail.isLoading ? (
          <LoadingRows count={4} />
        ) : detail.isError ? (
          <ErrorState section="Asset" message={detail.error?.message} onRetry={() => void detail.refetch()} />
        ) : (
          <div className="mt-4 grid gap-4">
            <p className="text-xs text-muted-foreground">
              {a.assetNumber} · {ASSET_CATEGORY_OPTIONS[a.category] ?? a.category}
              {a.Location ? ` · ${a.Location.name}` : ''} · acquired {a.acquisitionDate}
              {a.creator ? ` · by ${a.creator.name}` : ''}
            </p>
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              {[
                ['Cost', QAR(num(a.cost))],
                ['Salvage value', QAR(num(a.salvageValue))],
                ['Rate', `${num(a.depreciationRate)}% a year`],
                ['Useful life', a.usefulLifeMonths ? `${a.usefulLifeMonths} months` : '—'],
                ['Monthly charge', QAR(num(a.monthlyDepreciation))],
                ['Depreciated', QAR(num(a.accumulatedDepreciation))],
                ['Book value', QAR(num(a.netBookValue))],
                ['Paid from', a.CashAccount?.name ?? '—'],
                ['Serial number', a.serialNumber || '—'],
                ['Status', ASSET_STATUS_LABELS[a.status] ?? a.status],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="font-medium">{value}</dd>
                </div>
              ))}
            </dl>
            {disposed && (
              <div className="rounded-xl bg-secondary/50 p-3 text-sm">
                {a.status === 'written_off' ? 'Written off' : 'Disposed'} on {a.disposalDate} · proceeds{' '}
                {QAR(num(a.disposalProceeds))} · {num(a.disposalGainLoss) >= 0 ? 'gain' : 'loss'}{' '}
                <strong>{QAR(Math.abs(num(a.disposalGainLoss)))}</strong>
              </div>
            )}
            {a.notes && <p className="text-sm text-muted-foreground">{a.notes}</p>}

            {isAdmin && (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" className="h-10" onClick={() => setDialog('edit')}>
                  Edit details
                </Button>
                {!disposed && (
                  <Button variant="outline" className="h-10 border-destructive/40 text-destructive" onClick={() => setDialog('dispose')}>
                    Dispose / write off
                  </Button>
                )}
                <Button variant="outline" className="h-10" disabled={depreciate.isPending} onClick={() => depreciate.mutate()}>
                  {depreciate.isPending ? 'Running…' : 'Run depreciation now'}
                </Button>
              </div>
            )}

            <div>
              <h3 className="mb-2 text-sm font-semibold">Depreciation schedule</h3>
              {(a.schedule ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing posted yet. Depreciation is charged monthly from the start month; the server posts it automatically.
                </p>
              ) : (
                <div className="overflow-hidden rounded-xl border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-secondary/60 text-left text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">Month</th>
                        <th className="px-3 py-2 text-right">Charge</th>
                        <th className="px-3 py-2 text-right">Book value after</th>
                      </tr>
                    </thead>
                    <tbody>
                      {a.schedule.map((s) => (
                        <tr key={s.id} className="border-t border-border">
                          <td className="px-3 py-2">{s.period}</td>
                          <td className="px-3 py-2 text-right">{QAR(num(s.amount))}</td>
                          <td className="px-3 py-2 text-right">{QAR(num(s.bookValueAfter))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {(a.cashTransactions ?? []).length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold">Cash movements</h3>
                <ul className="divide-y divide-border rounded-xl border border-border text-sm">
                  {a.cashTransactions.map((t) => (
                    <li key={t.id} className="flex justify-between gap-3 px-3 py-2">
                      <span className="min-w-0 text-muted-foreground">
                        {new Date(t.date).toLocaleDateString()} · {t.reference || t.description || '—'}
                      </span>
                      <span className={cn('font-medium', num(t.amount) < 0 ? 'text-destructive' : 'text-[var(--tint-mint-ink)]')}>
                        {QAR(num(t.amount))}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        {a && dialog === 'dispose' && (
          <DisposeDialog asset={a} accounts={accounts} onClose={() => setDialog(null)} onDone={() => void done()} />
        )}
        {a && dialog === 'edit' && (
          <EditAssetDialog asset={a} locations={locations} onClose={() => setDialog(null)} onDone={() => void done()} />
        )}
      </SheetContent>
    </Sheet>
  );
}
