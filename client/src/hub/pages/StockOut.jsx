import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { StockOutDialog } from '@/hub/components/StockOutDialog';
import { EmptyState, ErrorState, LoadingRows, PageHeader } from '@/hub/components/shared';
import { Button } from '@/hub/ui/button';
import { Input } from '@/hub/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/hub/ui/sheet';
import { accessQuery, productsQuery, stockOutQuery } from '@/hub/lib/api';
import { STOCK_OUT_REASONS } from '@/hub/lib/format';
import { can } from '@/hub/lib/permissions';
import { useHubTitle } from '@/hub/lib/useHubTitle';

const ALL = '__all__';

export default function StockOutPage() {
  useHubTitle('Stock Out — FEMNIA Hub');
  const history = useQuery(stockOutQuery);
  const products = useQuery(productsQuery);
  const access = useQuery(accessQuery).data ?? null;
  const canAdd = can(access, 'inventory.stock_out');

  const [search, setSearch] = useState('');
  const [reason, setReason] = useState(ALL);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [detail, setDetail] = useState(null);

  const rows = useMemo(() => history.data ?? [], [history.data]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (term && !`${row.sku} ${row.name} ${row.reference}`.toLowerCase().includes(term)) return false;
      if (reason !== ALL && row.reason !== reason) return false;
      if (from && row.date < from) return false;
      if (to && row.date > to) return false;
      return true;
    });
  }, [rows, search, reason, from, to]);

  const totalQty = filtered.reduce((sum, r) => sum + r.quantity, 0);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Stock Out"
        subtitle="Non-sales stock reductions only. Customer sales still deduct automatically on order confirmation."
        onRefresh={() => history.refetch()}
        refreshing={history.isFetching}
        actions={
          canAdd && (
            <Button size="sm" className="h-10" onClick={() => setFormOpen(true)}>
              <Plus className="mr-2 size-4" /> Record Stock Out
            </Button>
          )
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="card-surface p-3">
          <p className="text-xs text-muted-foreground">Units removed</p>
          <p className="mt-1 text-lg font-semibold text-primary">{totalQty}</p>
        </div>
        <div className="card-surface p-3">
          <p className="text-xs text-muted-foreground">Transactions</p>
          <p className="mt-1 text-lg font-semibold text-primary">{filtered.length}</p>
        </div>
      </div>

      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Input
          placeholder="Search SKU, product or reference…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-11 lg:col-span-2"
        />
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
        >
          <option value={ALL}>All reasons</option>
          {STOCK_OUT_REASONS.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-11" />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-11" />
        </div>
      </div>

      {history.isPending ? (
        <LoadingRows />
      ) : history.isError ? (
        <ErrorState section="Stock Out history" message={history.error.message} onRetry={() => history.refetch()} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No Stock Out records yet"
          {...(canAdd ? { hint: 'Use Record Stock Out for damaged, lost or sample stock.' } : {})}
        />
      ) : (
        <>
          <div className="space-y-3 lg:hidden">
            {filtered.map((row) => (
              <button key={row.id} type="button" onClick={() => setDetail(row)} className="card-surface w-full p-4 text-left">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{row.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.sku}
                      {row.size ? ` · ${row.size}` : ''}
                      {row.color ? ` · ${row.color}` : ''}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-destructive/15 px-2.5 py-1 text-xs font-semibold text-destructive">
                    −{row.quantity}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {row.type && row.type !== 'Manual Stock Out' ? `${row.type} · ` : ''}{row.reference} · {row.date} · {row.reason}
                </p>
              </button>
            ))}
          </div>

          <div className="card-surface hidden overflow-x-auto lg:block">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">Size</th>
                  <th className="px-4 py-3">Colour</th>
                  <th className="px-4 py-3 text-right">Qty Removed</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3">Supplier</th>
                  <th className="px-4 py-3">Handled By</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr
                    key={row.id}
                    className="cursor-pointer border-t border-border hover:bg-secondary/40"
                    onClick={() => setDetail(row)}
                  >
                    <td className="px-4 py-3 font-medium">{row.reference}</td>
                    <td className="px-4 py-3">{row.date}</td>
                    <td className="px-4 py-3">{row.sku}</td>
                    <td className="px-4 py-3">{row.name}</td>
                    <td className="px-4 py-3">{row.size ?? '—'}</td>
                    <td className="px-4 py-3">{row.color ?? '—'}</td>
                    <td className="px-4 py-3 text-right font-semibold text-destructive">−{row.quantity}</td>
                    <td className="px-4 py-3">{row.type && row.type !== 'Manual Stock Out' ? `${row.type} · ${row.reason}` : row.reason}</td>
                    <td className="px-4 py-3">{row.supplier ?? '—'}</td>
                    <td className="px-4 py-3">{row.handledBy ?? '—'}</td>
                    <td className="px-4 py-3">Confirmed</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Sheet open={Boolean(detail)} onOpenChange={(next) => !next && setDetail(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{detail?.reference}</SheetTitle>
          </SheetHeader>
          {detail && (
            <dl className="mt-4 space-y-3 px-4 pb-6 text-sm">
              <Row label="Date" value={detail.date} />
              <Row label="SKU Code" value={detail.sku} />
              <Row label="Product" value={detail.name} />
              <Row label="Category" value={detail.category ?? '—'} />
              <Row label="Size" value={detail.size ?? '—'} />
              <Row label="Colour" value={detail.color ?? '—'} />
              <Row label="Quantity Removed" value={`−${detail.quantity}`} />
              <Row label="Reason" value={detail.reason} />
              <Row label="Supplier" value={detail.supplier ?? '—'} />
              <Row label="Reference" value={detail.referenceNote ?? '—'} />
              <Row label="Handled By" value={detail.handledBy ?? '—'} />
              <Row label="Notes" value={detail.notes ?? '—'} />
              <Row label="Created By" value={detail.createdByName ?? '—'} />
              <Row label="Created" value={new Date(detail.createdAt).toLocaleString()} />
              <Row label="Status" value="Confirmed" />
              <p className="rounded-2xl bg-secondary/50 p-3 text-xs text-muted-foreground">
                Confirmed Stock Out records cannot be edited or deleted. Corrections are made with an audited stock
                adjustment from Inventory.
              </p>
            </dl>
          )}
        </SheetContent>
      </Sheet>

      <StockOutDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        products={(products.data ?? []).filter((p) => p.currentStock > 0)}
        onDone={(result) =>
          toast.success(`Stock Out ${result.reference}`, {
            description: `${result.name} (${result.sku}) · Previous ${result.previous} · Removed ${result.quantity} · New stock ${result.resulting}`,
            duration: 8000,
          })
        }
      />
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border pb-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium text-foreground">{value}</dd>
    </div>
  );
}
