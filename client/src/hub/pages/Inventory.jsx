import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '@/hub/ui/button';
import { Input } from '@/hub/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/hub/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/hub/ui/sheet';
import { AdjustStockDialog } from '@/hub/components/AdjustStockDialog';
import { ProductHistoryDialog } from '@/hub/components/ProductHistoryDialog';
import {
  EmptyState,
  ErrorState,
  Loading,
  LoadingRows,
  PageHeader,
  ProductThumb,
  StockBadge,
} from '@/hub/components/shared';
import { accessQuery, productQuery, productsQuery } from '@/hub/lib/api';
import { QAR, downloadFile, toCsv, today } from '@/hub/lib/format';
import { can } from '@/hub/lib/permissions';
import { useHubTitle } from '@/hub/lib/useHubTitle';

const ALL = '__all__';

export default function InventoryPage() {
  useHubTitle('Inventory — FEMNIA Hub');
  const q = useQuery(productsQuery);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [sort, setSort] = useState('name');
  const [openKey, setOpenKey] = useState(null);

  const products = useMemo(() => q.data ?? [], [q.data]);
  const categories = useMemo(() => [...new Set(products.map((p) => p.category).filter(Boolean))].sort(), [products]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return products
      .filter((p) => {
        if (term && !`${p.productCode ?? ''} ${p.sku} ${p.name}`.toLowerCase().includes(term)) return false;
        if (category !== ALL && p.category !== category) return false;
        if (status !== ALL && p.stockStatus !== status) return false;
        return true;
      })
      .sort((a, b) =>
        sort === 'name'
          ? a.name.localeCompare(b.name)
          : sort === 'lowest'
            ? a.currentStock - b.currentStock
            : b.currentStock - a.currentStock,
      );
  }, [products, search, category, status, sort]);

  const exportCsv = () => {
    downloadFile(
      `femnia-inventory-${today()}.csv`,
      toCsv(
        rows.map((p) => ({
          'Product Code': p.productCode ?? '',
          SKU: p.sku,
          Name: p.name,
          Category: p.category ?? '',
          Size: p.size ?? '',
          Colour: p.color ?? '',
          Rack: p.rack ?? '',
          'Opening Stock': p.openingStock,
          'Stock In': p.stockIn,
          'Sales (Auto Out)': p.autoStockOut,
          'Manual Stock Out': p.manualStockOut,
          'Adjustments (net)': p.adjustmentNet,
          'Current Stock': p.currentStock,
          'Reorder Level': p.reorderLevel,
          'Replenish Qty': p.replenishQuantity,
          Status: p.stockStatus,
          'Cost Price': p.costPrice,
          'Selling Price (QAR)': p.sellingPriceQar,
        })),
      ),
    );
  };

  const totals = useMemo(
    () => ({
      stock: rows.reduce((s, p) => s + p.currentStock, 0),
      cost: rows.reduce((s, p) => s + p.currentStock * p.costPrice, 0),
      retail: rows.reduce((s, p) => s + p.currentStock * p.sellingPriceQar, 0),
    }),
    [rows],
  );

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Inventory"
        subtitle="Read-only live stock. Stock changes only through Stock In, Stock Out and order confirmation."
        onRefresh={() => q.refetch()}
        refreshing={q.isFetching}
        actions={
          <Button variant="outline" size="sm" className="h-10" onClick={exportCsv} disabled={!rows.length}>
            <Download className="mr-2 size-4" /> Export CSV
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className="card-surface p-3">
          <p className="text-xs text-muted-foreground">Units in stock</p>
          <p className="mt-1 text-lg font-semibold text-primary">{totals.stock}</p>
        </div>
        <div className="card-surface p-3">
          <p className="text-xs text-muted-foreground">Cost value</p>
          <p className="mt-1 text-sm font-semibold text-primary sm:text-lg">{QAR(totals.cost)}</p>
        </div>
        <div className="card-surface p-3">
          <p className="text-xs text-muted-foreground">Retail value</p>
          <p className="mt-1 text-sm font-semibold text-primary sm:text-lg">{QAR(totals.retail)}</p>
        </div>
      </div>

      <div className="no-print mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Input placeholder="Search SKU or name…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-11" />
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="h-11">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-11">
            <SelectValue placeholder="Stock status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            <SelectItem value="In Stock">In Stock</SelectItem>
            <SelectItem value="Low Stock">Low Stock</SelectItem>
            <SelectItem value="Out of Stock">Out of Stock</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="h-11">
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Name A–Z</SelectItem>
            <SelectItem value="lowest">Lowest stock first</SelectItem>
            <SelectItem value="highest">Highest stock first</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {q.isPending ? (
        <LoadingRows />
      ) : q.isError ? (
        <ErrorState section="Inventory" message={q.error.message} onRetry={() => q.refetch()} />
      ) : !rows.length ? (
        <EmptyState title="No matching products" hint="Adjust the search or filters." />
      ) : (
        <>
          {/* Desktop */}
          <div className="card-surface hidden overflow-x-auto lg:block">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-3 py-3 text-right">Opening</th>
                  <th className="px-3 py-3 text-right">Stock In</th>
                  <th className="px-3 py-3 text-right">Sales</th>
                  <th className="px-3 py-3 text-right">Manual Out</th>
                  <th className="px-3 py-3 text-right">Adjust</th>
                  <th className="px-3 py-3 text-right">Current</th>
                  <th className="px-3 py-3 text-right">Reorder</th>
                  <th className="px-3 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr
                    key={p.key}
                    onClick={() => setOpenKey(p.key)}
                    className="cursor-pointer border-t border-border hover:bg-secondary/40"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <ProductThumb src={p.imageUrl} name={p.name} className="size-10" />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-foreground">{p.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {p.productCode ? `${p.productCode} · ` : ''}
                            {p.sku}
                            {p.size ? ` · ${p.size}` : ''}
                            {p.color ? ` · ${p.color}` : ''}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right">{p.openingStock}</td>
                    <td className="px-3 py-3 text-right">{p.stockIn}</td>
                    <td className="px-3 py-3 text-right">{p.autoStockOut}</td>
                    <td className="px-3 py-3 text-right">{p.manualStockOut}</td>
                    <td className="px-3 py-3 text-right">{p.adjustmentNet > 0 ? `+${p.adjustmentNet}` : p.adjustmentNet}</td>
                    <td className="px-3 py-3 text-right font-semibold text-primary">{p.currentStock}</td>
                    <td className="px-3 py-3 text-right">{p.reorderLevel}</td>
                    <td className="px-3 py-3">
                      <StockBadge status={p.stockStatus} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile */}
          <div className="space-y-3 lg:hidden">
            {rows.map((p) => (
              <button key={p.key} onClick={() => setOpenKey(p.key)} className="card-surface w-full p-3 text-left">
                <div className="flex items-center gap-3">
                  <ProductThumb src={p.imageUrl} name={p.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">{p.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {p.productCode ? `${p.productCode} · ` : ''}
                      {p.sku}
                      {p.size ? ` · ${p.size}` : ''}
                      {p.color ? ` · ${p.color}` : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-semibold text-primary">{p.currentStock}</p>
                    <p className="text-[11px] text-muted-foreground">in stock</p>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <StockBadge status={p.stockStatus} />
                  <span className="text-xs text-muted-foreground">
                    In {p.stockIn} · Sold {p.autoStockOut} · Out {p.manualStockOut}
                    {p.adjustmentNet !== 0 ? ` · Adj ${p.adjustmentNet > 0 ? '+' : ''}${p.adjustmentNet}` : ''}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      <HistorySheet productKey={openKey} onClose={() => setOpenKey(null)} />
    </div>
  );
}

function HistorySheet({ productKey, onClose }) {
  const detail = useQuery({ ...productQuery(productKey ?? ''), enabled: Boolean(productKey) });
  const product = detail.data?.product ?? null;
  const movements = detail.data?.history ?? [];
  const access = useQuery(accessQuery).data ?? null;
  const [dialog, setDialog] = useState(null);

  return (
    <>
      <Sheet open={Boolean(productKey)} onOpenChange={(o) => !o && onClose()}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{product?.name ?? 'Product'}</SheetTitle>
          </SheetHeader>
          {detail.isPending ? (
            <Loading />
          ) : detail.isError ? (
            <ErrorState section="Stock history" message={detail.error.message} onRetry={() => detail.refetch()} />
          ) : (
            <div className="space-y-4 px-4 pb-6">
              {product && (
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <Field label="SKU" value={product.sku} />
                  <Field label="Rack" value={product.rack ?? '—'} />
                  <Field label="Opening stock" value={String(product.openingStock)} />
                  <Field label="Stock in" value={String(product.stockIn)} />
                  <Field label="Sales" value={String(product.autoStockOut)} />
                  <Field label="Manual stock out" value={String(product.manualStockOut)} />
                  <Field
                    label="Adjustments (net)"
                    value={product.adjustmentNet > 0 ? `+${product.adjustmentNet}` : String(product.adjustmentNet)}
                  />
                  <Field label="Current stock" value={String(product.currentStock)} />
                  <Field label="Reorder level" value={String(product.reorderLevel)} />
                  <Field label="Replenish qty" value={String(product.replenishQuantity)} />
                  <Field label="Selling price" value={QAR(product.sellingPriceQar)} />
                </div>
              )}
              <div className="no-print flex flex-wrap gap-2">
                {can(access, 'inventory.adjust') && (
                  <Button className="h-11" onClick={() => setDialog('adjust')}>
                    Adjust stock
                  </Button>
                )}
                {can(access, 'inventory.view_history') && (
                  <Button variant="outline" className="h-11" onClick={() => setDialog('history')}>
                    Full history
                  </Button>
                )}
              </div>

              <div>
                <p className="mb-2 text-sm font-medium text-foreground">Stock history</p>
                {!movements.length ? (
                  <EmptyState title="No movements yet" />
                ) : (
                  <ul className="space-y-2">
                    {movements.map((m) => (
                      <li key={m.id} className="rounded-xl border border-border p-3 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-foreground">{m.type}</span>
                          <span className={m.quantity < 0 ? 'text-destructive' : 'text-emerald-700'}>
                            {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {new Date(m.date).toLocaleString()} · {m.reference}
                          {m.note ? ` · ${m.note}` : ''}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
      <AdjustStockDialog product={product} open={dialog === 'adjust'} onClose={() => setDialog(null)} />
      <ProductHistoryDialog product={product} open={dialog === 'history'} onClose={() => setDialog(null)} />
    </>
  );
}

function Field({ label, value }) {
  return (
    <div className="rounded-xl bg-secondary/50 p-2.5">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-medium text-foreground">{value}</p>
    </div>
  );
}
