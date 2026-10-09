import { useQuery } from '@tanstack/react-query';
import { Download, History as HistoryIcon, Plus, Upload } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { BatchEditDialog } from '@/hub/components/BatchEditDialog';
import { ImportHistoryDialog } from '@/hub/components/ImportHistoryDialog';
import { ImportWizard } from '@/hub/components/ImportWizard';
import { StockInDialog } from '@/hub/components/StockInDialog';
import { EmptyState, ErrorState, LoadingRows, PageHeader } from '@/hub/components/shared';
import { Button } from '@/hub/ui/button';
import { Input } from '@/hub/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/hub/ui/sheet';
import { accessQuery, productsQuery, stockInQuery } from '@/hub/lib/api';
import { QAR, today } from '@/hub/lib/format';
import { can } from '@/hub/lib/permissions';
import { downloadStockInTemplate, downloadWorkbook } from '@/hub/lib/spreadsheet';
import { useHubTitle } from '@/hub/lib/useHubTitle';

const ALL = '__all__';

export default function StockInPage() {
  useHubTitle('Stock In — FEMNIA Hub');
  const history = useQuery(stockInQuery);
  const products = useQuery(productsQuery);
  const access = useQuery(accessQuery).data ?? null;
  const canAdd = can(access, 'inventory.stock_in');
  const canEditBatch = can(access, 'inventory.batch_edit');

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState(ALL);
  const [supplier, setSupplier] = useState(ALL);
  const [batch, setBatch] = useState(ALL);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [batchEdit, setBatchEdit] = useState(null);

  const rows = useMemo(() => history.data ?? [], [history.data]);
  const categories = useMemo(() => [...new Set(rows.map((r) => r.category).filter(Boolean))].sort(), [rows]);
  const suppliers = useMemo(() => [...new Set(rows.map((r) => r.supplier).filter(Boolean))].sort(), [rows]);
  const batches = useMemo(
    () =>
      [...new Set(rows.map((r) => [r.batchNumber, r.sourceCountry].filter(Boolean).join(' ')).filter(Boolean))].sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (term && !`${row.sku} ${row.name} ${row.reference}`.toLowerCase().includes(term)) return false;
      if (category !== ALL && row.category !== category) return false;
      if (supplier !== ALL && (row.supplier ?? '') !== supplier) return false;
      if (batch !== ALL && [row.batchNumber, row.sourceCountry].filter(Boolean).join(' ') !== batch) return false;
      if (from && row.date < from) return false;
      if (to && row.date > to) return false;
      return true;
    });
  }, [rows, search, category, supplier, batch, from, to]);

  const totals = useMemo(
    () => ({
      qty: filtered.reduce((sum, r) => sum + r.quantity, 0),
      cost: filtered.reduce((sum, r) => sum + (r.totalCost ?? 0), 0),
    }),
    [filtered],
  );

  const exportFiltered = () => {
    const headers = [
      'Reference', 'Date', 'SKU Code', 'Product', 'Category', 'Size', 'Colour', 'Quantity Received', 'Unit Cost',
      'Total Cost', 'Supplier', 'Batch Number', 'Source Country', 'Wholesaler', 'Invoice / Purchase Ref',
      'Received By', 'Notes',
    ];
    const body = filtered.map((r) => [
      r.reference, r.date, r.sku, r.name, r.category ?? '', r.size ?? '', r.color ?? '', r.quantity, r.unitCost ?? '',
      r.totalCost ?? '', r.supplier ?? 'Not Assigned', r.batchNumber ?? '', r.sourceCountry ?? '', r.wholesaler ?? '',
      r.invoiceReference ?? '', r.receivedBy ?? '', r.notes ?? '',
    ]);
    downloadWorkbook(`FEMNIA_Stock_In_${today()}.xlsx`, [{ name: 'Stock In', rows: [headers, ...body] }]);
  };

  const selectClass = 'h-11 w-full rounded-xl border border-input bg-background px-3 text-sm';

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Stock In"
        subtitle="Record received stock. Current stock always stays calculated from the live stock ledger."
        onRefresh={() => history.refetch()}
        refreshing={history.isFetching}
        actions={
          <div className="flex flex-wrap gap-2">
            {canAdd && (
              <Button size="sm" className="h-10" onClick={() => setFormOpen(true)}>
                <Plus className="mr-2 size-4" /> Add Stock
              </Button>
            )}
            {can(access, 'imports.stock_in') && (
              <Button size="sm" variant="outline" className="h-10" onClick={() => setImportOpen(true)}>
                <Upload className="mr-2 size-4" /> Import Existing Stock
              </Button>
            )}
            {can(access, 'inventory.export') && (
              <Button size="sm" variant="outline" className="h-10" onClick={exportFiltered} disabled={!filtered.length}>
                <Download className="mr-2 size-4" /> Download Excel
              </Button>
            )}
            {can(access, 'imports.templates') && (
              <Button size="sm" variant="outline" className="h-10" onClick={downloadStockInTemplate}>
                <Download className="mr-2 size-4" /> Stock In Template
              </Button>
            )}
            {can(access, 'imports.history') && (
              <Button size="sm" variant="outline" className="h-10" onClick={() => setHistoryOpen(true)}>
                <HistoryIcon className="mr-2 size-4" /> Import History
              </Button>
            )}
          </div>
        }
      />

      {importOpen && <ImportWizard open kind="stock_in" onClose={() => setImportOpen(false)} />}
      <ImportHistoryDialog open={historyOpen} onClose={() => setHistoryOpen(false)} canReverse={can(access, 'imports.reverse')} />

      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="card-surface p-3">
          <p className="text-xs text-muted-foreground">Units received</p>
          <p className="mt-1 text-lg font-semibold text-primary">{totals.qty}</p>
        </div>
        <div className="card-surface p-3">
          <p className="text-xs text-muted-foreground">Purchase value</p>
          <p className="mt-1 text-sm font-semibold text-primary sm:text-lg">{QAR(totals.cost)}</p>
        </div>
      </div>

      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        <Input
          placeholder="Search SKU, product or reference…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-11 lg:col-span-2"
        />
        <select value={category} onChange={(e) => setCategory(e.target.value)} className={selectClass}>
          <option value={ALL}>All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select value={supplier} onChange={(e) => setSupplier(e.target.value)} className={selectClass}>
          <option value={ALL}>All suppliers</option>
          {suppliers.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select value={batch} onChange={(e) => setBatch(e.target.value)} className={selectClass}>
          <option value={ALL}>All batches</option>
          {batches.map((b) => (
            <option key={b} value={b}>
              {b}
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
        <ErrorState section="Stock In history" message={history.error.message} onRetry={() => history.refetch()} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No Stock In records yet"
          {...(canAdd ? { hint: 'Use Add Stock to record a received shipment.' } : {})}
        />
      ) : (
        <>
          {/* Mobile cards */}
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
                  <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                    +{row.quantity}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {row.type && row.type !== 'Stock In' ? `${row.type} · ` : ''}
                  {row.reference} · {row.date} · {row.supplier ?? 'Not Assigned'}
                  {[row.batchNumber, row.sourceCountry].filter(Boolean).length
                    ? ` · ${[row.batchNumber, row.sourceCountry].filter(Boolean).join(' ')}`
                    : ''}
                </p>
              </button>
            ))}
          </div>

          {/* Desktop table */}
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
                  <th className="px-4 py-3 text-right">Qty</th>
                  <th className="px-4 py-3 text-right">Unit Cost</th>
                  <th className="px-4 py-3 text-right">Total Cost</th>
                  <th className="px-4 py-3">Supplier</th>
                  <th className="px-4 py-3">Batch</th>
                  <th className="px-4 py-3">Received By</th>
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
                    <td className="px-4 py-3 text-right font-semibold text-emerald-700">+{row.quantity}</td>
                    <td className="px-4 py-3 text-right">{row.unitCost === null ? '—' : QAR(row.unitCost)}</td>
                    <td className="px-4 py-3 text-right">{row.totalCost === null ? '—' : QAR(row.totalCost)}</td>
                    <td className="px-4 py-3">{row.supplier ?? 'Not Assigned'}</td>
                    <td className="px-4 py-3">{[row.batchNumber, row.sourceCountry].filter(Boolean).join(' ') || '—'}</td>
                    <td className="px-4 py-3">{row.receivedBy ?? '—'}</td>
                    {/* Returns and cancellation restocks also add stock — the column says which. */}
                    <td className="px-4 py-3">{row.type && row.type !== 'Stock In' ? row.type : 'Confirmed'}</td>
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
              <Row label="Quantity Received" value={`+${detail.quantity}`} />
              <Row label="Unit Cost" value={detail.unitCost === null ? '—' : QAR(detail.unitCost)} />
              <Row label="Total Cost" value={detail.totalCost === null ? '—' : QAR(detail.totalCost)} />
              <Row label="Supplier" value={detail.supplier ?? 'Not Assigned'} />
              <Row label="Invoice / Purchase Ref" value={detail.invoiceReference ?? '—'} />
              <Row label="Received By" value={detail.receivedBy ?? '—'} />
              <Row label="Rack" value={detail.rack ?? '—'} />
              <Row label="Shelf Location" value={detail.shelfLocation ?? '—'} />
              <Row label="Batch Number" value={detail.batchNumber ?? '—'} />
              <Row label="Source Country" value={detail.sourceCountry ?? '—'} />
              <Row label="Wholesaler" value={detail.wholesaler ?? '—'} />
              <Row label="Notes" value={detail.notes ?? '—'} />
              <Row label="Created By" value={detail.createdByName ?? '—'} />
              <Row label="Created" value={new Date(detail.createdAt).toLocaleString()} />
              <Row label="Status" value={detail.type && detail.type !== 'Stock In' ? detail.type : 'Confirmed'} />
              {canEditBatch && (!detail.type || detail.type === 'Stock In') && (
                <Button
                  variant="outline"
                  className="h-11 w-full"
                  onClick={() =>
                    setBatchEdit({
                      kind: 'receipt',
                      id: detail.id,
                      key: detail.key,
                      title: `${detail.reference} · ${detail.name}`,
                      initial: {
                        batchNumber: detail.batchNumber ?? null,
                        sourceCountry: detail.sourceCountry ?? null,
                        wholesaler: detail.wholesaler ?? null,
                      },
                    })
                  }
                >
                  Edit batch details
                </Button>
              )}
              <p className="rounded-2xl bg-secondary/50 p-3 text-xs text-muted-foreground">
                Confirmed Stock In quantities, costs and dates cannot be edited or deleted. Corrections are made with an
                audited stock adjustment from Inventory. Batch details may be corrected separately.
              </p>
            </dl>
          )}
        </SheetContent>
      </Sheet>

      <BatchEditDialog
        target={batchEdit}
        onClose={() => {
          setBatchEdit(null);
          setDetail(null);
        }}
      />

      <StockInDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        products={products.data ?? []}
        onDone={(result) =>
          toast.success(`Stock In ${result.reference}`, {
            description: `${result.name} (${result.sku}) · Previous ${result.previous} · Added ${result.quantity} · New stock ${result.resulting}`,
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
