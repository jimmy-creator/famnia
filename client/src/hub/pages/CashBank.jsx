import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowRightLeft, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { AccountSelect, ConfirmAction, Field, SELECT_CLS } from '@/hub/components/CashFinance';
import { EmptyState, ErrorState, Kpi, LoadingRows, PageHeader } from '@/hub/components/shared';
import { Button } from '@/hub/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/hub/ui/dialog';
import { Input } from '@/hub/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/hub/ui/sheet';
import { Textarea } from '@/hub/ui/textarea';
import { accessQuery } from '@/hub/lib/api';
import {
  ACCOUNT_TYPES,
  SOURCE_LABELS,
  accountStatementQuery,
  cancelCashTransfer,
  cashAccountsQuery,
  cashTransfersQuery,
  createCashAccount,
  createCashTransfer,
  dailyCashQuery,
  daybookQuery,
  deleteCashAccount,
  locationsQuery,
  num,
  updateCashAccount,
  useInvalidateCash,
} from '@/hub/lib/apiCash';
import { QAR, today } from '@/hub/lib/format';
import { useHubTitle } from '@/hub/lib/useHubTitle';
import { cn } from '@/lib/utils';

const MULTILOC = import.meta.env.VITE_FEATURE_MULTILOC === 'true';

const TABS = [
  ['accounts', 'Accounts'],
  ['transfers', 'Transfers'],
  ['daily', 'Daily Cash'],
  ['daybook', 'Daybook'],
];

const time = (d) => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const day = (d) => new Date(d).toLocaleDateString();

function Money({ value, signed }) {
  const n = num(value);
  return (
    <span className={cn(signed && n > 0 && 'text-[var(--tint-mint-ink)]', signed && n < 0 && 'text-destructive')}>
      {QAR(n)}
    </span>
  );
}

/* ------------------------------ accounts ------------------------------ */

function AccountDialog({ account, locations, onClose }) {
  const invalidate = useInvalidateCash();
  const editing = Boolean(account?.id);
  const [form, setForm] = useState({
    name: account?.name ?? '',
    code: account?.code ?? '',
    type: account?.type ?? 'drawer',
    locationId: account?.locationId ?? '',
    openingBalance: account ? num(account.openingBalance) : 0,
    notes: account?.notes ?? '',
    active: account?.active ?? true,
  });
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const save = useMutation({
    mutationFn: () => {
      const body = {
        ...form,
        name: form.name.trim(),
        code: form.code.trim() || null,
        locationId: form.locationId ? Number(form.locationId) : null,
        openingBalance: num(form.openingBalance),
      };
      return editing ? updateCashAccount(account.id, body) : createCashAccount(body);
    },
    onSuccess: async () => {
      toast.success(editing ? 'Account updated.' : 'Account added.');
      await invalidate();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="z-[70] max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${account.name}` : 'New cash account'}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (form.name.trim()) save.mutate();
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name *" className="col-span-2 sm:col-span-1">
              <Input className="h-11" value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Main drawer" />
            </Field>
            <Field label="Code" className="col-span-2 sm:col-span-1">
              <Input className="h-11" value={form.code} onChange={(e) => set({ code: e.target.value })} placeholder="Optional" />
            </Field>
            <Field label="Type">
              <select className={SELECT_CLS} value={form.type} onChange={(e) => set({ type: e.target.value })}>
                {Object.entries(ACCOUNT_TYPES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Location">
              <select className={SELECT_CLS} value={form.locationId} onChange={(e) => set({ locationId: e.target.value })}>
                <option value="">— None —</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Opening balance" hint="What the account held before the first recorded movement.">
            <Input className="h-11" type="number" step="0.01" value={form.openingBalance} onChange={(e) => set({ openingBalance: e.target.value })} />
          </Field>
          <Field label="Notes">
            <Textarea rows={2} value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
          </Field>
          {editing && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={Boolean(form.active)} onChange={(e) => set({ active: e.target.checked })} /> Active
            </label>
          )}
          <div className="flex gap-2">
            <Button type="submit" className="h-11 flex-1" disabled={!form.name.trim() || save.isPending}>
              {save.isPending ? 'Saving…' : editing ? 'Save' : 'Add account'}
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

function StatementSheet({ account, onClose }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const list = useQuery(accountStatementQuery(account.id, from, to));
  const rows = list.data ?? [];
  const inflow = rows.reduce((s, t) => s + Math.max(0, num(t.amount)), 0);
  const outflow = rows.reduce((s, t) => s + Math.min(0, num(t.amount)), 0);
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="z-[70] w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{account.name}</SheetTitle>
        </SheetHeader>
        <p className="text-xs text-muted-foreground">
          {ACCOUNT_TYPES[account.type] ?? account.type}
          {account.Location ? ` · ${account.Location.name}` : ''} · opening {QAR(num(account.openingBalance))}
        </p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Kpi label="Balance now" value={QAR(num(account.balance))} />
          <Kpi label="In" value={QAR(inflow)} tone="good" />
          <Kpi label="Out" value={QAR(Math.abs(outflow))} tone="warn" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Field label="From">
            <Input className="h-10" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To">
            <Input className="h-10" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
        <div className="mt-4">
          {list.isLoading ? (
            <LoadingRows count={4} />
          ) : list.isError ? (
            <ErrorState section="Statement" message={list.error?.message} onRetry={() => void list.refetch()} />
          ) : rows.length === 0 ? (
            <EmptyState title="No movements" hint="Nothing has moved through this account in the period." />
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border text-sm">
              {rows.map((t) => (
                <li key={t.id} className="flex items-start justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {SOURCE_LABELS[t.source] ?? t.source}
                      {t.reference ? <span className="ml-2 font-mono text-xs text-muted-foreground">{t.reference}</span> : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {day(t.date)} {time(t.date)}
                      {t.description ? ` · ${t.description}` : ''}
                      {t.author?.name ? ` · ${t.author.name}` : ''}
                    </p>
                  </div>
                  <span className="shrink-0 font-semibold">
                    <Money value={t.amount} signed />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function AccountsTab({ accounts, locations, isAdmin }) {
  const invalidate = useInvalidateCash();
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState(null);
  const [statement, setStatement] = useState(null);
  const remove = useMutation({
    mutationFn: (a) => deleteCashAccount(a.id),
    onSuccess: async (res, a) => {
      toast.success(res?.softDeleted ? `${a.name} deactivated — it has history, so it is kept.` : `${a.name} deleted.`);
      await invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const active = accounts.filter((a) => a.active);
  const byType = (type) => active.filter((a) => a.type === type).reduce((s, a) => s + num(a.balance), 0);
  const rows = showInactive ? accounts : active;

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="All accounts" value={QAR(active.reduce((s, a) => s + num(a.balance), 0))} />
        <Kpi label="Cash drawers" value={QAR(byType('drawer'))} tone="good" />
        <Kpi label="Card terminals" value={QAR(byType('card_terminal'))} tone="good" />
        <Kpi label="Petty cash" value={QAR(byType('petty_cash'))} tone="warn" />
        <Kpi label="Bank" value={QAR(byType('bank'))} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Show inactive accounts ({accounts.length - active.length})
        </label>
        {isAdmin && (
          <Button className="h-10" onClick={() => setEditing({})}>
            <Plus className="mr-2 size-4" /> New account
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No cash accounts" hint={isAdmin ? 'Add a drawer, petty cash box or bank account.' : 'An Admin adds accounts.'} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((a) => (
            <div key={a.id} className={cn('rounded-2xl border border-border bg-card p-4', !a.active && 'opacity-60')}>
              <button type="button" className="w-full text-left" onClick={() => setStatement(a)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{a.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {ACCOUNT_TYPES[a.type] ?? a.type}
                      {a.code ? ` · ${a.code}` : ''}
                      {a.Location ? ` · ${a.Location.name}` : ''}
                      {!a.active ? ' · Inactive' : ''}
                    </p>
                  </div>
                  <p className={cn('shrink-0 text-lg font-semibold', num(a.balance) < 0 && 'text-destructive')}>{QAR(num(a.balance))}</p>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Opening {QAR(num(a.openingBalance))} · tap for statement
                </p>
              </button>
              {isAdmin && (
                <div className="mt-3 flex gap-2 border-t border-border pt-3">
                  <Button size="sm" variant="outline" className="h-9" onClick={() => setEditing(a)}>
                    Edit
                  </Button>
                  {a.active && (
                    <ConfirmAction
                      title={`Remove ${a.name}?`}
                      description="An account with history is deactivated (kept for the records); an unused one is deleted."
                      actionLabel="Remove"
                      onConfirm={() => remove.mutate(a)}
                    >
                      <Button size="sm" variant="outline" className="h-9 text-destructive" disabled={remove.isPending}>
                        Deactivate
                      </Button>
                    </ConfirmAction>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {editing && <AccountDialog account={editing.id ? editing : null} locations={locations} onClose={() => setEditing(null)} />}
      {statement && <StatementSheet account={statement} onClose={() => setStatement(null)} />}
    </div>
  );
}

/* ------------------------------ transfers ------------------------------ */

function TransferDialog({ accounts, onClose }) {
  const invalidate = useInvalidateCash();
  const [form, setForm] = useState({ fromAccountId: '', toAccountId: '', amount: '', transferDate: today(), notes: '' });
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const from = accounts.find((a) => String(a.id) === String(form.fromAccountId));
  const amount = num(form.amount);
  const short = from && amount > num(from.balance);
  const save = useMutation({
    mutationFn: () =>
      createCashTransfer({
        ...form,
        fromAccountId: Number(form.fromAccountId),
        toAccountId: Number(form.toAccountId),
        amount,
      }),
    onSuccess: async () => {
      toast.success(`Moved ${QAR(amount)}.`);
      await invalidate();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });
  const valid = form.fromAccountId && form.toAccountId && form.fromAccountId !== form.toAccountId && amount > 0 && !short;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="z-[70] max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Move money between accounts</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) save.mutate();
          }}
        >
          <Field
            label="From *"
            hint={short ? `Not enough money: ${from.name} holds ${QAR(num(from.balance))}.` : undefined}
          >
            <AccountSelect accounts={accounts} value={form.fromAccountId} onChange={(v) => set({ fromAccountId: v })} showBalance />
          </Field>
          <Field label="To *">
            <AccountSelect
              accounts={accounts}
              value={form.toAccountId}
              onChange={(v) => set({ toAccountId: v })}
              exclude={form.fromAccountId}
              showBalance
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount *">
              <Input className="h-11" type="number" min="0" step="0.01" value={form.amount} onChange={(e) => set({ amount: e.target.value })} />
            </Field>
            <Field label="Date *">
              <Input className="h-11" type="date" value={form.transferDate} onChange={(e) => set({ transferDate: e.target.value })} />
            </Field>
          </div>
          <Field label="Notes">
            <Textarea rows={2} value={form.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="e.g. Banked the day's takings" />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" className="h-11 flex-1" disabled={!valid || save.isPending}>
              {save.isPending ? 'Saving…' : 'Transfer'}
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

function TransfersTab({ accounts, isAdmin }) {
  const invalidate = useInvalidateCash();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const list = useQuery(cashTransfersQuery(from, to));
  const cancel = useMutation({
    mutationFn: (id) => cancelCashTransfer(id),
    onSuccess: async () => {
      toast.success('Transfer cancelled; both accounts are restored.');
      await invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const rows = list.data ?? [];

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Input className="h-11" type="date" aria-label="From" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input className="h-11" type="date" aria-label="To" value={to} onChange={(e) => setTo(e.target.value)} />
        <Button className="h-11" onClick={() => setFormOpen(true)}>
          <ArrowRightLeft className="mr-2 size-4" /> New transfer
        </Button>
      </div>
      {list.isLoading ? (
        <LoadingRows />
      ) : list.isError ? (
        <ErrorState section="Transfers" message={list.error?.message} onRetry={() => void list.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState title="No transfers" hint="Move money between drawers, petty cash and the bank." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Transfer</th>
                <th className="px-4 py-3">From → To</th>
                <th className="px-4 py-3">Notes</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">By</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((tr) => {
                const cancelled = tr.status === 'cancelled';
                return (
                  <tr key={tr.id} className={cn('border-t border-border', cancelled && 'text-muted-foreground')}>
                    <td className="px-4 py-3 whitespace-nowrap">{day(tr.transferDate)}</td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {tr.transferNumber}
                      {cancelled && <span className="ml-2 font-sans">(cancelled)</span>}
                    </td>
                    <td className="px-4 py-3">
                      {tr.fromAccount?.name ?? '—'} → {tr.toAccount?.name ?? '—'}
                    </td>
                    <td className="px-4 py-3">{tr.notes || '—'}</td>
                    <td className={cn('px-4 py-3 text-right font-medium', cancelled && 'line-through')}>{QAR(num(tr.amount))}</td>
                    <td className="px-4 py-3 text-muted-foreground">{tr.creator?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-right">
                      {isAdmin && tr.status === 'completed' && (
                        <ConfirmAction
                          title={`Cancel ${tr.transferNumber}?`}
                          description="The money goes back to the account it came from."
                          actionLabel="Cancel transfer"
                          onConfirm={() => cancel.mutate(tr.id)}
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
      {formOpen && <TransferDialog accounts={accounts} onClose={() => setFormOpen(false)} />}
    </div>
  );
}

/* ------------------------------ daily cash ------------------------------ */

const DAILY_COLUMNS = [
  ['opening', 'Opening'],
  ['sales', 'Sales'],
  ['refunds', 'Refunds'],
  ['expenses', 'Expenses'],
  ['transfersIn', 'Transfers in'],
  ['transfersOut', 'Transfers out'],
  ['other', 'Other'],
];

function DailyCashTab({ locations }) {
  const [date, setDate] = useState(today);
  const [locationId, setLocationId] = useState('');
  const daily = useQuery(dailyCashQuery(date, locationId));
  const rows = daily.data?.accounts ?? [];
  const total = (key) => rows.reduce((s, r) => s + num(r[key]), 0);

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Day">
          <Input className="h-11" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Location">
          <select className={SELECT_CLS} value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            <option value="">All locations</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {daily.isLoading ? (
        <LoadingRows />
      ) : daily.isError ? (
        <ErrorState section="Daily cash" message={daily.error?.message} onRetry={() => void daily.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState title="No accounts in scope" hint="No active cash account matches this location." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Opening" value={QAR(total('opening'))} />
            <Kpi label="Sales" value={QAR(total('sales'))} tone="good" />
            <Kpi label="Refunds + expenses" value={QAR(total('refunds') + total('expenses'))} tone="warn" />
            <Kpi label="Expected close" value={QAR(total('expected'))} />
          </div>
          {/* Mobile */}
          <div className="grid gap-3 lg:hidden">
            {rows.map((r) => (
              <div key={r.cashAccount.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{r.cashAccount.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {ACCOUNT_TYPES[r.cashAccount.type] ?? r.cashAccount.type}
                      {r.cashAccount.location ? ` · ${r.cashAccount.location.name}` : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Expected close</p>
                    <p className="text-lg font-semibold">{QAR(num(r.expected))}</p>
                  </div>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  {DAILY_COLUMNS.map(([key, label]) => (
                    <div key={key} className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd>
                        <Money value={r[key]} signed={key !== 'opening'} />
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
          {/* Desktop */}
          <div className="hidden overflow-x-auto rounded-2xl border border-border bg-card lg:block">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Account</th>
                  {DAILY_COLUMNS.map(([key, label]) => (
                    <th key={key} className="px-4 py-3 text-right">
                      {label}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right">Expected close</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.cashAccount.id} className="border-t border-border">
                    <td className="px-4 py-3">
                      <p className="font-medium">{r.cashAccount.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {ACCOUNT_TYPES[r.cashAccount.type] ?? r.cashAccount.type}
                        {r.cashAccount.location ? ` · ${r.cashAccount.location.name}` : ''}
                      </p>
                    </td>
                    {DAILY_COLUMNS.map(([key]) => (
                      <td key={key} className="px-4 py-3 text-right">
                        <Money value={r[key]} signed={key !== 'opening'} />
                      </td>
                    ))}
                    <td className="px-4 py-3 text-right font-semibold">{QAR(num(r.expected))}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-border bg-secondary/40 font-semibold">
                  <td className="px-4 py-3">Total</td>
                  {DAILY_COLUMNS.map(([key]) => (
                    <td key={key} className="px-4 py-3 text-right">
                      {QAR(total(key))}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right">{QAR(total('expected'))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------ daybook ------------------------------ */

function DaybookTab({ accounts }) {
  const [filters, setFilters] = useState(() => ({ date: today(), accountId: '', source: '' }));
  const book = useQuery(daybookQuery(filters));
  const totals = book.data?.totals ?? { in: 0, out: 0, net: 0 };
  const entries = book.data?.entries ?? [];

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Day">
          <Input className="h-11" type="date" value={filters.date} onChange={(e) => setFilters({ ...filters, date: e.target.value })} />
        </Field>
        <Field label="Account">
          <select className={SELECT_CLS} value={filters.accountId} onChange={(e) => setFilters({ ...filters, accountId: e.target.value })}>
            <option value="">All accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.active ? '' : ' (inactive)'}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Source">
          <select className={SELECT_CLS} value={filters.source} onChange={(e) => setFilters({ ...filters, source: e.target.value })}>
            <option value="">All sources</option>
            {Object.entries(SOURCE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {book.isLoading ? (
        <LoadingRows />
      ) : book.isError ? (
        <ErrorState section="Daybook" message={book.error?.message} onRetry={() => void book.refetch()} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Money in" value={QAR(num(totals.in))} tone="good" />
            <Kpi label="Money out" value={QAR(Math.abs(num(totals.out)))} tone="warn" />
            <Kpi label="Net" value={QAR(num(totals.net))} tone={num(totals.net) < 0 ? 'danger' : 'default'} />
            <Kpi label="Entries" value={entries.length} />
          </div>
          {entries.length === 0 ? (
            <EmptyState title="No entries" hint="No money moved on this day with these filters." />
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-secondary/60 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Time</th>
                    <th className="px-4 py-3">Account</th>
                    <th className="px-4 py-3">Source</th>
                    <th className="px-4 py-3">Reference</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3 text-right">In</th>
                    <th className="px-4 py-3 text-right">Out</th>
                    <th className="px-4 py-3">By</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => {
                    const amt = num(e.amount);
                    return (
                      <tr key={e.id} className="border-t border-border">
                        <td className="px-4 py-3 whitespace-nowrap">{time(e.date)}</td>
                        <td className="px-4 py-3">{e.CashAccount?.name ?? '—'}</td>
                        <td className="px-4 py-3">{SOURCE_LABELS[e.source] ?? e.source}</td>
                        <td className="px-4 py-3 font-mono text-xs">{e.reference || '—'}</td>
                        <td className="px-4 py-3">{e.description || '—'}</td>
                        <td className="px-4 py-3 text-right font-medium text-[var(--tint-mint-ink)]">{amt > 0 ? QAR(amt) : ''}</td>
                        <td className="px-4 py-3 text-right font-medium text-destructive">{amt < 0 ? QAR(Math.abs(amt)) : ''}</td>
                        <td className="px-4 py-3 text-muted-foreground">{e.author?.name ?? '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------ page ------------------------------ */

export default function CashBankPage() {
  useHubTitle('Cash & Bank — FEMNIA Hub');
  const access = useQuery(accessQuery).data ?? null;
  const allowed = MULTILOC && Boolean(access?.isAdmin || access?.legacy?.includes('analytics'));
  const isAdmin = Boolean(access?.isAdmin);
  const accounts = useQuery({ ...cashAccountsQuery, enabled: allowed });
  const locations = useQuery({ ...locationsQuery, enabled: allowed });
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(([k]) => k === params.get('tab')) ? params.get('tab') : 'accounts';
  const accountList = useMemo(() => accounts.data ?? [], [accounts.data]);
  const locationList = locations.data ?? [];

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Cash & Bank"
        subtitle="Drawers, petty cash and bank accounts: balances, transfers and the day's money."
        onRefresh={allowed ? () => void accounts.refetch() : undefined}
        refreshing={accounts.isFetching}
      />
      {!MULTILOC ? (
        <EmptyState title="Not enabled" hint="Cash accounts come with multi-location inventory, which is off for this store." />
      ) : !allowed ? (
        <EmptyState title="No access" hint="You need finance (analytics) access to open Cash & Bank." />
      ) : (
        <>
          <div className="no-print mb-4 flex gap-2 overflow-x-auto pb-1">
            {TABS.map(([key, label]) => (
              <button
                key={key}
                onClick={() => setParams(key === 'accounts' ? {} : { tab: key }, { replace: true })}
                className={cn(
                  'shrink-0 rounded-xl border px-3 py-2 text-sm font-medium transition-colors',
                  tab === key
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card text-foreground/80 hover:bg-secondary',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {accounts.isLoading ? (
            <LoadingRows />
          ) : accounts.isError ? (
            <ErrorState section="Cash accounts" message={accounts.error?.message} onRetry={() => void accounts.refetch()} />
          ) : tab === 'accounts' ? (
            <AccountsTab accounts={accountList} locations={locationList} isAdmin={isAdmin} />
          ) : tab === 'transfers' ? (
            <TransfersTab accounts={accountList} isAdmin={isAdmin} />
          ) : tab === 'daily' ? (
            <DailyCashTab locations={locationList} />
          ) : (
            <DaybookTab accounts={accountList} />
          )}
        </>
      )}
    </div>
  );
}
