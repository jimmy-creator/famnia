import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Plus, Settings2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { AssetDetailSheet, CapitalPanel } from '@/hub/components/CashFinance';
import { ExpenseEntryDialog } from '@/hub/components/ExpenseEntryDialog';
import { ReimbursementDialog } from '@/hub/components/ReimbursementDialog';
import { EmptyState, ErrorState, LoadingRows, PageHeader, StatusBadge } from '@/hub/components/shared';
import { Button } from '@/hub/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/hub/ui/dialog';
import { Input } from '@/hub/ui/input';
import { accessQuery, liabilitiesQuery, qk, updatePurchasedBy } from '@/hub/lib/api';
import {
  addExpenseCategory,
  assetsAllQuery,
  expenseCategoriesQuery,
  expensesAllQuery,
  updateExpenseCategory,
  voidEntry,
} from '@/hub/lib/apiFinance';
import { can } from '@/hub/lib/permissions';
import {
  ASSET_CATEGORIES,
  EXPENSE_CATEGORIES,
  LIABILITY_STATUS_LABELS,
  filterEntries,
  filterLiabilities,
  knownPeople,
  money,
  monthlyExportSheet,
  monthlySummary,
  purchasedByLabel,
} from '@/hub/lib/expenses';
import { downloadWorkbook } from '@/hub/lib/spreadsheet';
import { useHubTitle } from '@/hub/lib/useHubTitle';
import { cn } from '@/lib/utils';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December',
];

function MonthlySection({ title, section }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-3">
        <h3 className="font-semibold text-foreground">{title}</h3>
        <p className="text-lg font-semibold text-primary">{money(section.total)}</p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">Paid directly by company</p>
          <p className="font-medium">{money(section.direct)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Reimbursements completed</p>
          <p className="font-medium">{money(section.reimbursed)}</p>
        </div>
      </div>
      {section.bySource.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
          {section.bySource.map((line) => (
            <li key={line.label} className="flex justify-between gap-3">
              <span className="text-muted-foreground">{line.label}</span>
              <span className="font-medium">{money(line.value)}</span>
            </li>
          ))}
        </ul>
      )}
      {section.rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Nothing paid from company funds this month.</p>
      ) : (
        <ul className="mt-3 space-y-2 border-t border-border pt-3 text-xs text-muted-foreground">
          {section.rows.map((row) => (
            <li key={`${row.kind}-${row.id}`} className="flex flex-wrap justify-between gap-2">
              <span className="min-w-0">
                {row.date} · {row.item} · {row.category} · {row.source} · Purchased by:{' '}
                <strong className="text-foreground">{purchasedByLabel(row.purchasedBy)}</strong>
              </span>
              <span className="font-medium text-foreground">{money(row.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function UnpaidSection({ title, rows, total }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-3">
        <h3 className="font-semibold text-foreground">{title}</h3>
        <p className="text-lg font-semibold text-amber-700">{money(total)}</p>
      </div>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Nothing outstanding this month.</p>
      ) : (
        <ul className="mt-3 grid gap-3">
          {rows.map((row) => (
            <li key={row.id} className="rounded-xl border border-border bg-secondary/30 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{row.item}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.date} · {row.category} · {row.reference} · paid by <strong>{row.person}</strong> · Purchased by:{' '}
                    <strong>{purchasedByLabel(row.purchasedBy)}</strong>
                  </p>
                </div>
                <StatusBadge value={LIABILITY_STATUS_LABELS[row.status]} />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Original</p>
                  <p className="font-medium">{money(row.amount)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Reimbursed</p>
                  <p className="font-medium">{money(row.reimbursed)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Outstanding</p>
                  <p className="font-semibold text-amber-700">{money(row.outstanding)}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Shows who made the purchase; an Admin can correct historical records. */
function PurchasedByRow({ entry, people, isAdmin, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(entry.purchasedBy ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const next = await updatePurchasedBy(entry, value);
      onSaved(next);
      setEditing(false);
      toast.success('Purchased by updated.');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="col-span-2 rounded-xl border border-border bg-secondary/30 p-3">
      <p className="text-xs text-muted-foreground">Purchased / expense made by</p>
      {editing ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <Input
            className="h-10 flex-1"
            list="femnia-people"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Person's name"
          />
          <datalist id="femnia-people">
            {people.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
          <Button size="sm" className="h-10" onClick={() => void save()} disabled={saving}>
            Save
          </Button>
          <Button size="sm" variant="outline" className="h-10" onClick={() => setEditing(false)} disabled={saving}>
            Cancel
          </Button>
        </div>
      ) : (
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium text-foreground">{purchasedByLabel(entry.purchasedBy)}</p>
          {isAdmin && (
            <Button size="sm" variant="outline" className="h-9" onClick={() => setEditing(true)}>
              Edit
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/** Void a mistaken record (cash comes back; it drops out of totals and P&L). */
function VoidSection({ entry, onDone }) {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const run = useMutation({
    mutationFn: () => voidEntry(entry.id, reason),
    onSuccess: async () => {
      toast.success(`${entry.reference} voided.`);
      await Promise.all([qk.expenses, qk.assets, qk.liabilities, qk.fundingAccounts, qk.activity].map((queryKey) =>
        client.invalidateQueries({ queryKey })));
      onDone();
    },
    onError: (error) => toast.error(error.message),
  });
  if (!open) {
    return (
      <Button variant="outline" className="mt-3 h-11 w-full border-destructive/40 text-destructive" onClick={() => setOpen(true)}>
        Void this {entry.entryType === 'asset' ? 'asset' : 'expense'}
      </Button>
    );
  }
  return (
    <div className="mt-3 rounded-xl border border-destructive/40 bg-destructive/5 p-3">
      <p className="text-xs text-muted-foreground">
        Voiding returns the money to its account (if the company paid) and removes it from totals and the P&amp;L. It stays
        in the history.
      </p>
      <Input className="mt-2 h-10" placeholder="Reason for voiding" value={reason} onChange={(e) => setReason(e.target.value)} />
      <div className="mt-2 flex gap-2">
        <Button className="h-10 flex-1" variant="destructive" disabled={!reason.trim() || run.isPending} onClick={() => run.mutate()}>
          Void
        </Button>
        <Button className="h-10" variant="outline" onClick={() => setOpen(false)} disabled={run.isPending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/** Expense categories shared with Back Office: add, rename, deactivate. */
function CategoriesDialog({ open, onClose }) {
  const client = useQueryClient();
  const list = useQuery({ ...expenseCategoriesQuery, enabled: open });
  const [name, setName] = useState('');
  const [editing, setEditing] = useState(null);
  const refresh = () => Promise.all([
    client.invalidateQueries({ queryKey: expenseCategoriesQuery.queryKey }),
    client.invalidateQueries({ queryKey: qk.expenses }),
  ]);
  const add = useMutation({
    mutationFn: () => addExpenseCategory(name),
    onSuccess: async () => {
      setName('');
      await refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const update = useMutation({
    mutationFn: ({ id, patch }) => updateExpenseCategory(id, patch),
    onSuccess: async () => {
      setEditing(null);
      await refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="z-[70] max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Expense categories</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">Shared with Finance in Back Office. Renaming also renames past hub entries.</p>
        <div className="flex gap-2">
          <Input className="h-10" placeholder="New category" value={name} onChange={(e) => setName(e.target.value)} />
          <Button className="h-10" disabled={!name.trim() || add.isPending} onClick={() => add.mutate()}>
            Add
          </Button>
        </div>
        <ul className="divide-y divide-border rounded-xl border border-border">
          {(list.data ?? []).map((c) => (
            <li key={c.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              {editing?.id === c.id ? (
                <>
                  <Input className="h-9 flex-1" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                  <Button size="sm" className="h-9" onClick={() => update.mutate({ id: c.id, patch: { name: editing.name } })}>
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" className="h-9" onClick={() => setEditing(null)}>
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  <span className={cn('flex-1', !c.active && 'text-muted-foreground line-through')}>{c.name}</span>
                  <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditing({ id: c.id, name: c.name })}>
                    Rename
                  </Button>
                  <Button size="sm" variant="outline" className="h-8" onClick={() => update.mutate({ id: c.id, patch: { active: !c.active } })}>
                    {c.active ? 'Deactivate' : 'Activate'}
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

const ALL = '__all__';
const clean = (v) => (v === ALL ? '' : v);
const MULTILOC = import.meta.env.VITE_FEATURE_MULTILOC === 'true';

export default function ExpensesPage() {
  useHubTitle('Expenses, Assets & Liabilities — FEMNIA Hub');
  const access = useQuery(accessQuery).data ?? null;
  // Hub + Back Office records, voided ones included (struck through, never totalled).
  const expenses = useQuery(expensesAllQuery);
  const assets = useQuery(assetsAllQuery);
  const liabilities = useQuery(liabilitiesQuery);
  const sharedCategories = useQuery(expenseCategoriesQuery).data;
  const liveExpenses = useMemo(() => (expenses.data ?? []).filter((r) => !r.voided), [expenses.data]);
  const liveAssets = useMemo(() => (assets.data ?? []).filter((r) => !r.voided), [assets.data]);
  const [categoriesOpen, setCategoriesOpen] = useState(false);

  const canViewExpenses = can(access, 'expenses.view');
  const canViewAssets = can(access, 'assets.view');
  const canViewLiabilities = can(access, 'liabilities.view');
  const canAddExpense = can(access, 'expenses.add');
  const canAddAsset = can(access, 'assets.add');
  const canReimburse = can(access, 'liabilities.reimburse') || can(access, 'liabilities.settle');
  // Owner capital and the asset ledger are classic finance screens: 'analytics' access, multi-location only.
  const canFinance = MULTILOC && Boolean(access?.isAdmin || access?.legacy?.includes('analytics'));
  const [assetId, setAssetId] = useState(null);

  const [tab, setTab] = useState('expenses');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const [formKind, setFormKind] = useState(null);
  const [detail, setDetail] = useState(null);
  const [reimburse, setReimburse] = useState(null);
  const [month, setMonth] = useState(() => new Date().getMonth() + 1);
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [monthlyView, setMonthlyView] = useState('paid');

  const monthly = useMemo(
    () => monthlySummary(liveExpenses, liveAssets, liabilities.data ?? [], year, month),
    [liveExpenses, liveAssets, liabilities.data, year, month],
  );
  const years = useMemo(() => {
    const set = new Set([new Date().getFullYear()]);
    for (const row of [...(expenses.data ?? []), ...(assets.data ?? [])]) set.add(Number(String(row.date).slice(0, 4)));
    return [...set].filter((y) => Number.isFinite(y)).sort((a, b) => b - a);
  }, [expenses.data, assets.data]);

  const expenseCategories = useMemo(() => {
    const names = new Set((sharedCategories ?? []).map((c) => c.name));
    for (const row of expenses.data ?? []) if (row.category) names.add(row.category);
    return names.size ? [...names].sort((a, b) => a.localeCompare(b)) : EXPENSE_CATEGORIES;
  }, [sharedCategories, expenses.data]);
  const assetCategories = useMemo(() => {
    const names = new Set(ASSET_CATEGORIES);
    for (const row of assets.data ?? []) if (row.category) names.add(row.category);
    return [...names];
  }, [assets.data]);
  const categories = tab === 'assets' ? assetCategories : expenseCategories;
  const canManageCategories = Boolean(access?.isAdmin) || can(access, 'expenses.edit');
  const canVoid = (row) => !row.voided && (row.entryType === 'asset' ? can(access, 'assets.edit') : can(access, 'expenses.edit'));

  const people = useMemo(
    () => knownPeople([...(expenses.data ?? []), ...(assets.data ?? [])]),
    [expenses.data, assets.data],
  );

  const entryRows = useMemo(() => {
    const rows = tab === 'assets' ? (assets.data ?? []) : (expenses.data ?? []);
    return filterEntries(rows, { search, category: clean(category), from, to });
  }, [tab, assets.data, expenses.data, search, category, from, to]);

  const liabilityRows = useMemo(
    () => filterLiabilities(liabilities.data ?? [], { search, status: clean(status), from, to }),
    [liabilities.data, search, status, from, to],
  );

  const entryTotal = entryRows.reduce((sum, r) => sum + (r.voided ? 0 : r.amount), 0);
  const voidedCount = entryRows.filter((r) => r.voided).length;
  const outstandingTotal = liabilityRows.reduce((sum, r) => sum + r.outstanding, 0);

  const active = tab === 'liabilities' ? liabilities : tab === 'assets' ? assets : expenses;
  const allowed =
    tab === 'liabilities'
      ? canViewLiabilities
      : tab === 'assets'
        ? canViewAssets
        : tab === 'monthly'
          ? canViewExpenses || canViewAssets
          : tab === 'capital'
            ? canFinance
            : canViewExpenses;

  const tabs = [
    { key: 'expenses', label: 'Daily Expenses', count: liveExpenses.length, visible: canViewExpenses },
    { key: 'assets', label: 'Assets Purchased', count: liveAssets.length, visible: canViewAssets },
    {
      key: 'liabilities',
      label: 'Pending Liabilities',
      count: (liabilities.data ?? []).filter((l) => l.status !== 'paid').length,
      visible: canViewLiabilities,
    },
    {
      key: 'monthly',
      label: 'Monthly Expenses',
      count: monthly.expenses.rows.length + monthly.assets.rows.length,
      visible: canViewExpenses || canViewAssets,
    },
    { key: 'capital', label: 'Capital', visible: canFinance },
  ];

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Expenses, Assets & Liabilities"
        subtitle="Business spending only — product stock purchases stay in Stock In."
        onRefresh={() => {
          expenses.refetch();
          assets.refetch();
          liabilities.refetch();
        }}
        refreshing={expenses.isFetching || assets.isFetching || liabilities.isFetching}
        actions={
          <>
            {canAddExpense && (
              <Button size="sm" className="h-10" onClick={() => setFormKind('expense')}>
                <Plus className="mr-2 size-4" /> Add Expense
              </Button>
            )}
            {canAddAsset && (
              <Button size="sm" variant="outline" className="h-10" onClick={() => setFormKind('asset')}>
                <Plus className="mr-2 size-4" /> Add Asset
              </Button>
            )}
          </>
        }
      />

      <div className="no-print mb-4 flex gap-2 overflow-x-auto pb-1">
        {tabs
          .filter((t) => t.visible)
          .map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'shrink-0 rounded-xl border px-3 py-2 text-sm font-medium transition-colors',
                tab === t.key
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-foreground/80 hover:bg-secondary',
              )}
            >
              {t.label} {t.count !== undefined && <span className="opacity-70">({t.count})</span>}
            </button>
          ))}
      </div>

      {tab === 'capital' ? null : tab === 'monthly' ? (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <select
            aria-label="Month"
            className="h-11 rounded-xl border border-input bg-background px-3 text-sm"
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
          >
            {MONTH_NAMES.map((name, index) => (
              <option key={name} value={index + 1}>
                {name}
              </option>
            ))}
          </select>
          <select
            aria-label="Year"
            className="h-11 rounded-xl border border-input bg-background px-3 text-sm"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            className="h-11"
            placeholder={tab === 'liabilities' ? 'Search person or reference' : 'Search item, reference or payee'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {tab === 'liabilities' ? (
            <select
              className="h-11 rounded-xl border border-input bg-background px-3 text-sm"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value={ALL}>All statuses</option>
              {Object.entries(LIABILITY_STATUS_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          ) : (
            <select
              className="h-11 rounded-xl border border-input bg-background px-3 text-sm"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value={ALL}>All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
          <Input className="h-11" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input className="h-11" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          {tab === 'expenses' && canManageCategories && (
            <Button variant="outline" className="h-11 sm:col-span-2 lg:col-span-1" onClick={() => setCategoriesOpen(true)}>
              <Settings2 className="mr-2 size-4" /> Manage categories
            </Button>
          )}
        </div>
      )}

      {!allowed ? (
        <EmptyState title="No access" hint="You do not have permission to view this section." />
      ) : tab === 'capital' ? (
        <CapitalPanel isAdmin={Boolean(access?.isAdmin)} />
      ) : active.isLoading ? (
        <LoadingRows />
      ) : active.isError ? (
        <ErrorState
          section="Expenses, Assets & Liabilities"
          message={active.error?.message ?? 'Unknown error'}
          onRetry={() => {
            void active.refetch();
          }}
        />
      ) : tab === 'monthly' ? (
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {[
              ['paid', `Paid Expenses (${money(monthly.total)})`],
              ['unpaid', `Unpaid / Personally Paid (${money(monthly.unpaid.total)})`],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setMonthlyView(key)}
                className={cn(
                  'rounded-xl border px-3 py-2 text-sm font-medium transition-colors',
                  monthlyView === key
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border bg-card text-foreground/80 hover:bg-secondary',
                )}
              >
                {label}
              </button>
            ))}
            <Button
              size="sm"
              variant="outline"
              className="h-10 sm:ml-auto"
              onClick={() => {
                const sheet = monthlyExportSheet(monthly, monthlyView);
                const name = `FEMNIA-monthly-${monthlyView}-${year}-${String(month).padStart(2, '0')}.xlsx`;
                downloadWorkbook(name, [{ name: sheet.sheetName, rows: sheet.rows }]);
                toast.success(`Downloaded ${name}`);
              }}
            >
              <Download className="mr-2 size-4" /> Download Excel
            </Button>
          </div>

          {monthlyView === 'paid' ? (
            <>
              <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Paid from company funds · {MONTH_NAMES[month - 1]} {year}
                </p>
                <p className="mt-1 text-2xl font-semibold text-foreground">{money(monthly.total)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Daily expenses {money(monthly.expenses.total)} · asset purchases {money(monthly.assets.total)}.
                  Includes personal purchases already reimbursed. Pending liabilities ({money(monthly.pendingExcluded)})
                  are excluded until reimbursed.
                </p>
              </div>
              {canViewExpenses && <MonthlySection title="Daily Expenses" section={monthly.expenses} />}
              {canViewAssets && <MonthlySection title="Asset Purchases" section={monthly.assets} />}
            </>
          ) : (
            <>
              <div className="rounded-2xl border border-amber-300/60 bg-amber-50 p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Outstanding personal payments · {MONTH_NAMES[month - 1]} {year}
                </p>
                <p className="mt-1 text-2xl font-semibold text-foreground">{money(monthly.unpaid.total)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Unpaid daily expenses {money(monthly.unpaid.expensesTotal)} · unpaid asset purchases{' '}
                  {money(monthly.unpaid.assetsTotal)}. Informational only — these amounts are not deducted from
                  available cash until they are actually reimbursed.
                </p>
              </div>
              {canViewExpenses && (
                <UnpaidSection
                  title="Daily Expenses — personally paid"
                  rows={monthly.unpaid.expenses}
                  total={monthly.unpaid.expensesTotal}
                />
              )}
              {canViewAssets && (
                <UnpaidSection
                  title="Asset Purchases — personally paid"
                  rows={monthly.unpaid.assets}
                  total={monthly.unpaid.assetsTotal}
                />
              )}
            </>
          )}
        </div>
      ) : tab === 'liabilities' ? (
        liabilityRows.length === 0 ? (
          <EmptyState title="No liabilities" hint="Liabilities appear when a purchase is paid personally." />
        ) : (
          <>
            <p className="mb-3 text-sm text-muted-foreground">
              {liabilityRows.length} liabilities · outstanding <strong>{money(outstandingTotal)}</strong>
            </p>
            <div className="grid gap-3">
              {liabilityRows.map((row) => (
                <div key={row.id} className="rounded-2xl border border-border bg-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{row.person}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.entry
                          ? `${row.entry.entryType === 'asset' ? 'Asset' : 'Expense'} ${row.entry.reference} · ${
                              row.entry.item
                            } · ${row.entry.date}`
                          : 'Linked record unavailable'}
                      </p>
                    </div>
                    <StatusBadge value={LIABILITY_STATUS_LABELS[row.status]} />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Paid personally</p>
                      <p className="font-medium">{money(row.amount)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Reimbursed</p>
                      <p className="font-medium">{money(row.reimbursed)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Outstanding</p>
                      <p className="font-semibold text-primary">{money(row.outstanding)}</p>
                    </div>
                  </div>
                  {row.reimbursements.length > 0 && (
                    <ul className="mt-3 space-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
                      {row.reimbursements.map((r) => (
                        <li key={r.id}>
                          {r.paidOn} · {money(r.amount)} · {r.paymentMethod}
                          {r.fundingSource ? ` · from ${r.fundingSource}` : ''}
                          {r.reference ? ` · ${r.reference}` : ''}
                        </li>
                      ))}
                    </ul>
                  )}
                  {canReimburse && row.status !== 'paid' && (
                    <Button className="mt-3 h-11 w-full sm:w-auto" onClick={() => setReimburse(row)}>
                      Record reimbursement
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </>
        )
      ) : entryRows.length === 0 ? (
        <EmptyState
          title={tab === 'assets' ? 'No assets recorded' : 'No expenses recorded'}
          hint="Use the buttons above to add the first record."
        />
      ) : (
        <>
          <p className="mb-3 text-sm text-muted-foreground">
            {entryRows.length - voidedCount} records · total <strong>{money(entryTotal)}</strong>
            {voidedCount > 0 && ` · ${voidedCount} voided (not counted)`}
          </p>

          {/* Mobile cards */}
          <div className="grid gap-3 lg:hidden">
            {entryRows.map((row) => (
              <button
                key={row.id}
                onClick={() => setDetail(row)}
                className={cn('rounded-2xl border border-border bg-card p-4 text-left', row.voided && 'opacity-60')}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className={cn('truncate font-medium text-foreground', row.voided && 'line-through')}>{row.item}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.date} · {row.category} · {row.reference}
                      {row.voided ? ' · Voided' : ''}
                    </p>
                  </div>
                  <p className={cn('shrink-0 font-semibold', row.voided && 'line-through')}>{money(row.amount)}</p>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {row.paymentMethod} · {row.fundingSource}
                  {row.payee ? ` · ${row.payee}` : ''}
                  {row.asset ? ` · book value ${money(row.asset.netBookValue)}` : ''}
                </p>
              </button>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-2xl border border-border bg-card lg:block">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Item</th>
                  <th className="px-4 py-3">Purchased by</th>
                  <th className="px-4 py-3">Person</th>
                  <th className="px-4 py-3">Payee</th>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3">Funding</th>
                  {tab === 'assets' && (
                    <>
                      <th className="px-4 py-3 text-right">Dep. %</th>
                      <th className="px-4 py-3 text-right">Depreciated</th>
                      <th className="px-4 py-3 text-right">Book value</th>
                      <th className="px-4 py-3">Status</th>
                    </>
                  )}
                  <th className="px-4 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {entryRows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => setDetail(row)}
                    className={cn('cursor-pointer border-t border-border hover:bg-secondary/40', row.voided && 'text-muted-foreground')}
                  >
                    <td className="px-4 py-3">{row.date}</td>
                    <td className="px-4 py-3">{row.reference}</td>
                    <td className="px-4 py-3">{row.category}</td>
                    <td className={cn('px-4 py-3', row.voided && 'line-through')}>
                      {row.item}
                      {row.voided && <span className="ml-2 text-xs no-underline">(voided)</span>}
                    </td>
                    <td className="px-4 py-3">{purchasedByLabel(row.purchasedBy)}</td>
                    <td className="px-4 py-3">{row.purchasePerson ?? '—'}</td>
                    <td className="px-4 py-3">{row.payee ?? '—'}</td>
                    <td className="px-4 py-3">{row.paymentMethod}</td>
                    <td className="px-4 py-3">{row.fundingSource}</td>
                    {tab === 'assets' && (
                      <>
                        <td className="px-4 py-3 text-right">{row.asset ? `${row.asset.depreciationRate}%` : '—'}</td>
                        <td className="px-4 py-3 text-right">{row.asset ? money(row.asset.accumulatedDepreciation) : '—'}</td>
                        <td className="px-4 py-3 text-right font-medium">{row.asset ? money(row.asset.netBookValue) : '—'}</td>
                        <td className="px-4 py-3 capitalize">{row.asset ? row.asset.status.replace(/_/g, ' ') : '—'}</td>
                      </>
                    )}
                    <td className={cn('px-4 py-3 text-right font-medium', row.voided && 'line-through')}>{money(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {detail && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-foreground/40 p-0 sm:items-center sm:p-6">
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-card p-5 sm:rounded-2xl">
            <h2 className="text-lg font-semibold">{detail.item}</h2>
            <p className="text-xs text-muted-foreground">
              {detail.reference} · {detail.date}
              {detail.source === 'classic' ? ' · recorded in Back Office' : ''}
            </p>
            {detail.voided && (
              <p className="mt-2 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
                Voided{detail.voidReason ? ` — ${detail.voidReason}` : ''}. Not counted in totals or the P&amp;L.
              </p>
            )}
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              {detail.source === 'hub' ? (
                <PurchasedByRow
                  key={detail.id}
                  entry={detail}
                  people={people}
                  isAdmin={Boolean(access?.isAdmin)}
                  onSaved={(value) => {
                    setDetail({ ...detail, purchasedBy: value });
                    void expenses.refetch();
                    void assets.refetch();
                    void liabilities.refetch();
                  }}
                />
              ) : (
                <div className="col-span-2">
                  <dt className="text-xs text-muted-foreground">Recorded by</dt>
                  <dd className="font-medium text-foreground">{purchasedByLabel(detail.purchasedBy)}</dd>
                </div>
              )}
              {[
                ['Category', detail.category],
                ['Amount', money(detail.amount)],
                ['Purchase person', detail.purchasePerson ?? '—'],
                ['Supplier / payee', detail.payee ?? '—'],
                ['Payment method', detail.paymentMethod],
                ['Funding source', detail.fundingSource],
                ['Receipt reference', detail.receiptReference ?? '—'],
                ...(detail.asset
                  ? [
                      ['Depreciation', `${detail.asset.depreciationRate}% a year`],
                      ['Salvage value', money(detail.asset.salvageValue)],
                      ['Depreciated so far', money(detail.asset.accumulatedDepreciation)],
                      ['Book value', money(detail.asset.netBookValue)],
                      ['Serial number', detail.asset.serialNumber ?? '—'],
                      ['Status', detail.asset.status.replace(/_/g, ' ')],
                    ]
                  : []),
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="font-medium text-foreground">{value}</dd>
                </div>
              ))}
            </dl>

            {detail.notes && <p className="mt-3 text-sm text-muted-foreground">{detail.notes}</p>}
            {detail.asset && canFinance && (
              <Button variant="outline" className="mt-4 h-11 w-full" onClick={() => {
                  setAssetId(detail.asset.id);
                  setDetail(null);
                }}
              >
                Depreciation schedule{access?.isAdmin ? ', edit & disposal' : ''}
              </Button>
            )}
            {canVoid(detail) && <VoidSection key={detail.id} entry={detail} onDone={() => setDetail(null)} />}
            <Button variant="outline" className="mt-4 h-11 w-full" onClick={() => setDetail(null)}>
              Close
            </Button>
          </div>
        </div>
      )}

      <ExpenseEntryDialog
        open={formKind !== null}
        kind={formKind ?? 'expense'}
        onClose={() => setFormKind(null)}
        onDone={(result) => {
          toast.success(
            `${result.entry.entryType === 'asset' ? 'Asset' : 'Expense'} ${result.entry.reference} saved · ${money(
              result.entry.amount,
            )}${result.liabilityCreated ? ` · liability opened for ${result.liabilityPerson}` : ''}`,
          );
          if (result.liabilityCreated) setTab('liabilities');
        }}
      />

      <CategoriesDialog open={categoriesOpen} onClose={() => setCategoriesOpen(false)} />

      {assetId && <AssetDetailSheet assetId={assetId} isAdmin={Boolean(access?.isAdmin)} onClose={() => setAssetId(null)} />}

      <ReimbursementDialog
        liability={reimburse}
        onClose={() => setReimburse(null)}
        onDone={(result) =>
          toast.success(
            result.status === 'paid'
              ? `${result.person}'s liability is fully settled.`
              : `Reimbursement saved · outstanding ${money(result.outstanding)}`,
          )
        }
      />
    </div>
  );
}
