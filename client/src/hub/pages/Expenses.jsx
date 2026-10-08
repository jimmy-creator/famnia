import { useQuery } from '@tanstack/react-query';
import { Download, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { ExpenseEntryDialog } from '@/hub/components/ExpenseEntryDialog';
import { ReimbursementDialog } from '@/hub/components/ReimbursementDialog';
import { EmptyState, ErrorState, LoadingRows, PageHeader, StatusBadge } from '@/hub/components/shared';
import { Button } from '@/hub/ui/button';
import { Input } from '@/hub/ui/input';
import { accessQuery, assetsQuery, expensesQuery, liabilitiesQuery, updatePurchasedBy } from '@/hub/lib/api';
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

const ALL = '__all__';
const clean = (v) => (v === ALL ? '' : v);

export default function ExpensesPage() {
  useHubTitle('Expenses, Assets & Liabilities — FEMNIA Hub');
  const access = useQuery(accessQuery).data ?? null;
  const expenses = useQuery(expensesQuery);
  const assets = useQuery(assetsQuery);
  const liabilities = useQuery(liabilitiesQuery);

  const canViewExpenses = can(access, 'expenses.view');
  const canViewAssets = can(access, 'assets.view');
  const canViewLiabilities = can(access, 'liabilities.view');
  const canAddExpense = can(access, 'expenses.add');
  const canAddAsset = can(access, 'assets.add');
  const canReimburse = can(access, 'liabilities.reimburse') || can(access, 'liabilities.settle');

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
    () => monthlySummary(expenses.data ?? [], assets.data ?? [], liabilities.data ?? [], year, month),
    [expenses.data, assets.data, liabilities.data, year, month],
  );
  const years = useMemo(() => {
    const set = new Set([new Date().getFullYear()]);
    for (const row of [...(expenses.data ?? []), ...(assets.data ?? [])]) set.add(Number(String(row.date).slice(0, 4)));
    return [...set].filter((y) => Number.isFinite(y)).sort((a, b) => b - a);
  }, [expenses.data, assets.data]);

  const categories = tab === 'assets' ? ASSET_CATEGORIES : EXPENSE_CATEGORIES;

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

  const entryTotal = entryRows.reduce((sum, r) => sum + r.amount, 0);
  const outstandingTotal = liabilityRows.reduce((sum, r) => sum + r.outstanding, 0);

  const active = tab === 'liabilities' ? liabilities : tab === 'assets' ? assets : expenses;
  const allowed =
    tab === 'liabilities'
      ? canViewLiabilities
      : tab === 'assets'
        ? canViewAssets
        : tab === 'monthly'
          ? canViewExpenses || canViewAssets
          : canViewExpenses;

  const tabs = [
    { key: 'expenses', label: 'Daily Expenses', count: (expenses.data ?? []).length, visible: canViewExpenses },
    { key: 'assets', label: 'Assets Purchased', count: (assets.data ?? []).length, visible: canViewAssets },
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
              {t.label} <span className="opacity-70">({t.count})</span>
            </button>
          ))}
      </div>

      {tab === 'monthly' ? (
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
        </div>
      )}

      {!allowed ? (
        <EmptyState title="No access" hint="You do not have permission to view this section." />
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
            {entryRows.length} records · total <strong>{money(entryTotal)}</strong>
          </p>

          {/* Mobile cards */}
          <div className="grid gap-3 lg:hidden">
            {entryRows.map((row) => (
              <button
                key={row.id}
                onClick={() => setDetail(row)}
                className="rounded-2xl border border-border bg-card p-4 text-left"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{row.item}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.date} · {row.category} · {row.reference}
                    </p>
                  </div>
                  <p className="shrink-0 font-semibold">{money(row.amount)}</p>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {row.paymentMethod} · {row.fundingSource}
                  {row.payee ? ` · ${row.payee}` : ''}
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
                  <th className="px-4 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {entryRows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => setDetail(row)}
                    className="cursor-pointer border-t border-border hover:bg-secondary/40"
                  >
                    <td className="px-4 py-3">{row.date}</td>
                    <td className="px-4 py-3">{row.reference}</td>
                    <td className="px-4 py-3">{row.category}</td>
                    <td className="px-4 py-3">{row.item}</td>
                    <td className="px-4 py-3">{purchasedByLabel(row.purchasedBy)}</td>
                    <td className="px-4 py-3">{row.purchasePerson ?? '—'}</td>
                    <td className="px-4 py-3">{row.payee ?? '—'}</td>
                    <td className="px-4 py-3">{row.paymentMethod}</td>
                    <td className="px-4 py-3">{row.fundingSource}</td>
                    <td className="px-4 py-3 text-right font-medium">{money(row.amount)}</td>
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
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
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
              {[
                ['Category', detail.category],
                ['Amount', money(detail.amount)],
                ['Purchase person', detail.purchasePerson ?? '—'],
                ['Supplier / payee', detail.payee ?? '—'],
                ['Payment method', detail.paymentMethod],
                ['Funding source', detail.fundingSource],
                ['Receipt reference', detail.receiptReference ?? '—'],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="font-medium text-foreground">{value}</dd>
                </div>
              ))}
            </dl>

            {detail.notes && <p className="mt-3 text-sm text-muted-foreground">{detail.notes}</p>}
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
