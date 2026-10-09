import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Save, Undo2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/hub/ui/button';
import { Input } from '@/hub/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/hub/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/hub/ui/sheet';
import { Tabs, TabsList, TabsTrigger } from '@/hub/ui/tabs';
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
import {
  MULTILOC,
  adjustStockBulk,
  canManageInventory,
  invalidateInventoryOps,
  locationStockQuery,
  locationsQuery,
  reorderQuery,
} from '@/hub/lib/apiInventoryOps';
import { QAR, downloadFile, toCsv, today } from '@/hub/lib/format';
import { can } from '@/hub/lib/permissions';
import { useHubTitle } from '@/hub/lib/useHubTitle';
import { cn } from '@/lib/utils';

const ALL = '__all__';

export default function InventoryPage() {
  useHubTitle('Inventory — FEMNIA Hub');
  const access = useQuery(accessQuery).data ?? null;
  const [params, setParams] = useSearchParams();

  const tabs = [['stock', 'Stock']];
  if (MULTILOC && canManageInventory(access)) tabs.push(['locations', 'By location']);
  if (canManageInventory(access)) tabs.push(['reorder', 'Low stock & reorder']);
  const tab = tabs.some(([k]) => k === params.get('tab')) ? params.get('tab') : 'stock';

  const tabBar =
    tabs.length > 1 ? (
      <Tabs value={tab} onValueChange={(v) => setParams(v === 'stock' ? {} : { tab: v }, { replace: true })}>
        <TabsList className="mb-4 flex h-auto w-full flex-wrap justify-start gap-1">
          {tabs.map(([k, label]) => (
            <TabsTrigger key={k} value={k} className="min-h-10">
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    ) : null;

  return (
    <div className="mx-auto max-w-7xl">
      {tab === 'locations' ? (
        <ByLocationTab tabBar={tabBar} />
      ) : tab === 'reorder' ? (
        <ReorderTab tabBar={tabBar} />
      ) : (
        <StockTab tabBar={tabBar} />
      )}
    </div>
  );
}

/* --------------------------------- Stock --------------------------------- */

function StockTab({ tabBar }) {
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
    <>
      <PageHeader
        title="Inventory"
        subtitle="Live stock per size. Stock changes through Stock In, Stock Out, adjustments and orders."
        onRefresh={() => q.refetch()}
        refreshing={q.isFetching}
        actions={
          <Button variant="outline" size="sm" className="h-10" onClick={exportCsv} disabled={!rows.length}>
            <Download className="mr-2 size-4" /> Export CSV
          </Button>
        }
      />
      {tabBar}

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
                          <p className="truncate text-xs text-muted-foreground">{skuLine(p)}</p>
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
                    <p className="truncate text-xs text-muted-foreground">{skuLine(p)}</p>
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
    </>
  );
}

const skuLine = (p) =>
  `${p.productCode ? `${p.productCode} · ` : ''}${p.sku}${p.size ? ` · ${p.size}` : ''}${p.color ? ` · ${p.color}` : ''}`;

/* ------------------------------ By location ------------------------------ */

const PAGE = 60;
const cellKey = (skuKey, locationId) => `${skuKey}@${locationId}`;

/**
 * Stock per size per branch. Type a new figure into any cell and save — every
 * change is written as an adjustment, so it shows in the stock history.
 */
function ByLocationTab({ tabBar }) {
  const client = useQueryClient();
  const skus = useQuery(productsQuery);
  const locs = useQuery(locationsQuery);
  const stock = useQuery(locationStockQuery);
  const [search, setSearch] = useState('');
  const [locationId, setLocationId] = useState(ALL);
  const [onlyStocked, setOnlyStocked] = useState(false);
  const [edits, setEdits] = useState({});
  const [limit, setLimit] = useState(PAGE);
  const [saving, setSaving] = useState(false);

  const activeLocations = useMemo(() => (locs.data ?? []).filter((l) => l.active !== false), [locs.data]);
  const columns = locationId === ALL ? activeLocations : activeLocations.filter((l) => String(l.id) === locationId);

  // ProductStock rows keyed "productId:variantIndex|base@locationId".
  const qty = useMemo(() => {
    const m = new Map();
    for (const r of stock.data ?? []) m.set(cellKey(`${r.productId}:${r.variantIndex ?? 'base'}`, r.locationId), r.quantity);
    return m;
  }, [stock.data]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (skus.data ?? []).filter((p) => {
      if (term && !`${p.productCode ?? ''} ${p.sku} ${p.name} ${p.size ?? ''} ${p.color ?? ''}`.toLowerCase().includes(term))
        return false;
      if (onlyStocked && !columns.some((l) => (qty.get(cellKey(p.key, l.id)) ?? 0) > 0)) return false;
      return true;
    });
  }, [skus.data, search, onlyStocked, columns, qty]);

  const changed = Object.entries(edits).filter(([k, v]) => v !== '' && Number(v) !== (qty.get(k) ?? 0));

  const save = async () => {
    const bySku = new Map((skus.data ?? []).map((p) => [p.key, p]));
    const items = changed.map(([k, v]) => {
      const [skuKey, loc] = k.split('@');
      const p = bySku.get(skuKey);
      return { productId: p.productId, variantIndex: p.variantIndex, locationId: Number(loc), quantity: Math.max(0, parseInt(v, 10) || 0) };
    });
    setSaving(true);
    try {
      await adjustStockBulk(items);
      toast.success(`Saved ${items.length} stock change${items.length === 1 ? '' : 's'}`);
      setEdits({});
      await invalidateInventoryOps(client);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const exportCsv = () =>
    downloadFile(
      `femnia-stock-by-location-${today()}.csv`,
      toCsv(
        rows.map((p) => {
          const row = { SKU: p.sku, Name: p.name, Size: p.size ?? '', Colour: p.color ?? '' };
          let total = 0;
          for (const l of columns) {
            const n = qty.get(cellKey(p.key, l.id)) ?? 0;
            row[l.name] = n;
            total += n;
          }
          row.Total = total;
          return row;
        }),
      ),
    );

  const loading = skus.isPending || locs.isPending || stock.isPending;
  const error = skus.error || locs.error || stock.error;
  const refetch = () => Promise.all([skus.refetch(), locs.refetch(), stock.refetch()]);

  return (
    <>
      <PageHeader
        title="Stock by location"
        subtitle="Each size's stock at every branch. Type the real figure and save — the change is logged as an adjustment."
        onRefresh={refetch}
        refreshing={skus.isFetching || stock.isFetching}
        actions={
          <Button variant="outline" size="sm" className="h-10" onClick={exportCsv} disabled={!rows.length}>
            <Download className="mr-2 size-4" /> Export CSV
          </Button>
        }
      />
      {tabBar}

      <div className="no-print mb-4 grid gap-2 sm:grid-cols-3">
        <Input placeholder="Search SKU, name, size…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-11" />
        <Select value={locationId} onValueChange={setLocationId}>
          <SelectTrigger className="h-11">
            <SelectValue placeholder="Location" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All locations</SelectItem>
            {activeLocations.map((l) => (
              <SelectItem key={l.id} value={String(l.id)}>
                {l.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={onlyStocked ? 'stocked' : 'all'} onValueChange={(v) => setOnlyStocked(v === 'stocked')}>
          <SelectTrigger className="h-11">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sizes</SelectItem>
            <SelectItem value="stocked">Only sizes with stock here</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {changed.length > 0 && (
        <div className="sticky top-2 z-10 mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-primary/30 bg-card p-3 shadow-sm">
          <p className="text-sm text-foreground">
            <strong>{changed.length}</strong> unsaved change{changed.length === 1 ? '' : 's'}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" className="h-10" onClick={() => setEdits({})} disabled={saving}>
              <Undo2 className="mr-2 size-4" /> Discard
            </Button>
            <Button className="h-10" onClick={save} disabled={saving}>
              <Save className="mr-2 size-4" /> {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <LoadingRows />
      ) : error ? (
        <ErrorState section="Stock by location" message={error.message} onRetry={refetch} />
      ) : !activeLocations.length ? (
        <EmptyState title="No active locations" hint="Add a branch or warehouse in Settings → Locations." />
      ) : !rows.length ? (
        <EmptyState title="No matching sizes" hint="Adjust the search or filters." />
      ) : (
        <>
          <div className="card-surface overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="sticky left-0 bg-secondary px-4 py-3">Product</th>
                  {columns.map((l) => (
                    <th key={l.id} className="px-3 py-3 text-right whitespace-nowrap">
                      {l.name}
                    </th>
                  ))}
                  {columns.length > 1 && <th className="px-3 py-3 text-right">Total</th>}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, limit).map((p) => {
                  let total = 0;
                  return (
                    <tr key={p.key} className="border-t border-border">
                      <td className="sticky left-0 bg-card px-4 py-2">
                        <p className="max-w-[14rem] truncate font-medium text-foreground">{p.name}</p>
                        <p className="max-w-[14rem] truncate text-xs text-muted-foreground">{skuLine(p)}</p>
                      </td>
                      {columns.map((l) => {
                        const k = cellKey(p.key, l.id);
                        const saved = qty.get(k) ?? 0;
                        const value = edits[k] ?? String(saved);
                        const dirty = edits[k] !== undefined && edits[k] !== '' && Number(edits[k]) !== saved;
                        total += dirty ? Number(edits[k]) : saved;
                        return (
                          <td key={l.id} className="px-2 py-2 text-right">
                            <Input
                              type="number"
                              min={0}
                              inputMode="numeric"
                              aria-label={`${p.sku} at ${l.name}`}
                              value={value}
                              onChange={(e) => setEdits((cur) => ({ ...cur, [k]: e.target.value }))}
                              className={cn('ml-auto h-9 w-20 text-right', dirty && 'border-primary bg-primary/5 font-semibold')}
                            />
                          </td>
                        );
                      })}
                      {columns.length > 1 && <td className="px-3 py-2 text-right font-semibold text-primary">{total}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {rows.length > limit && (
            <div className="mt-3 text-center">
              <Button variant="outline" className="h-10" onClick={() => setLimit((n) => n + PAGE)}>
                Show more ({rows.length - limit} left)
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
}

/* --------------------------- Low stock & reorder --------------------------- */

function ReorderTab({ tabBar }) {
  const [locationId, setLocationId] = useState(ALL);
  const locs = useQuery({ ...locationsQuery, enabled: MULTILOC });
  const params = locationId === ALL ? {} : { locationId };
  const report = useQuery(reorderQuery(params));
  const skus = useQuery(productsQuery);
  const [openKey, setOpenKey] = useState(null);

  const low = useMemo(
    () =>
      (skus.data ?? [])
        .filter((p) => p.isActive !== false && p.stockStatus !== 'In Stock')
        .sort((a, b) => a.currentStock - b.currentStock || a.name.localeCompare(b.name)),
    [skus.data],
  );

  const rows = report.data?.rows ?? [];
  const exportCsv = () =>
    downloadFile(
      `femnia-reorder-${today()}.csv`,
      toCsv(
        rows.map((r) => ({
          Code: r.code ?? '',
          Product: r.name,
          Stock: r.stock,
          'Reorder level': r.reorderLevel,
          'Suggested qty': r.suggestedQty,
          'Sold per day': r.velocity,
          'Days of cover': r.daysOfCover ?? '',
          Supplier: r.supplierName ?? '',
          'Est. cost': r.estimatedCost,
        })),
      ),
    );
  const exportLowCsv = () =>
    downloadFile(
      `femnia-low-stock-sizes-${today()}.csv`,
      toCsv(
        low.map((p) => ({
          SKU: p.sku,
          Name: p.name,
          Size: p.size ?? '',
          Colour: p.color ?? '',
          'Current Stock': p.currentStock,
          'Reorder Level': p.reorderLevel,
          'Replenish Qty': p.replenishQuantity,
          Status: p.stockStatus,
          Supplier: p.supplier ?? '',
        })),
      ),
    );

  return (
    <>
      <PageHeader
        title="Low stock & reorder"
        subtitle="What to buy next: products at or below their reorder level, with a suggested quantity."
        onRefresh={() => Promise.all([report.refetch(), skus.refetch()])}
        refreshing={report.isFetching || skus.isFetching}
        actions={
          <Button variant="outline" size="sm" className="h-10" onClick={exportCsv} disabled={!rows.length}>
            <Download className="mr-2 size-4" /> Export CSV
          </Button>
        }
      />
      {tabBar}

      {MULTILOC && (locs.data?.length ?? 0) > 0 && (
        <div className="no-print mb-4 max-w-xs">
          <Select value={locationId} onValueChange={setLocationId}>
            <SelectTrigger className="h-11">
              <SelectValue placeholder="Location" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All locations</SelectItem>
              {locs.data.map((l) => (
                <SelectItem key={l.id} value={String(l.id)}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <section className="mb-8">
        <h2 className="mb-1 text-base font-semibold text-foreground">Reorder list (by product)</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Products with a reorder level set whose stock has fallen to it. Out-of-stock items come first.
        </p>
        {report.data && (
          <div className="mb-4 grid grid-cols-3 gap-3">
            <div className="card-surface p-3">
              <p className="text-xs text-muted-foreground">To reorder</p>
              <p className="mt-1 text-lg font-semibold text-primary">{report.data.count}</p>
            </div>
            <div className="card-surface p-3">
              <p className="text-xs text-muted-foreground">Out of stock</p>
              <p className={cn('mt-1 text-lg font-semibold', report.data.outOfStockCount > 0 ? 'text-destructive' : 'text-primary')}>
                {report.data.outOfStockCount}
              </p>
            </div>
            <div className="card-surface p-3">
              <p className="text-xs text-muted-foreground">Estimated cost</p>
              <p className="mt-1 text-sm font-semibold text-primary sm:text-lg">{QAR(report.data.estimatedTotal)}</p>
            </div>
          </div>
        )}
        {report.isPending ? (
          <LoadingRows count={4} />
        ) : report.isError ? (
          <ErrorState section="Reorder list" message={report.error.message} onRetry={() => report.refetch()} />
        ) : !rows.length ? (
          <EmptyState title="Nothing needs reordering" hint="Set a reorder level on a product to have it listed here when it runs low." />
        ) : (
          <div className="card-surface overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-3 py-3 text-right">Stock</th>
                  <th className="px-3 py-3 text-right">Reorder at</th>
                  <th className="px-3 py-3 text-right">Suggested</th>
                  <th className="px-3 py-3 text-right">Days left</th>
                  <th className="px-3 py-3">Supplier</th>
                  <th className="px-3 py-3 text-right">Est. cost</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">
                        {r.name}
                        {r.outOfStock && (
                          <span className="tint-rose ml-2 rounded-full border px-2 py-0.5 text-[11px] text-[var(--tint-rose-ink)]">
                            Out
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">{r.code || '—'}</p>
                    </td>
                    <td className={cn('px-3 py-3 text-right', r.outOfStock && 'font-semibold text-destructive')}>{r.stock}</td>
                    <td className="px-3 py-3 text-right">{r.reorderLevel}</td>
                    <td className="px-3 py-3 text-right font-semibold text-primary">{r.suggestedQty}</td>
                    <td className="px-3 py-3 text-right">{r.daysOfCover ?? '—'}</td>
                    <td className="px-3 py-3">{r.supplierName || <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-3 py-3 text-right">{QAR(r.estimatedCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-foreground">Sizes running low</h2>
          <Button variant="outline" size="sm" className="h-9" onClick={exportLowCsv} disabled={!low.length}>
            <Download className="mr-2 size-4" /> CSV
          </Button>
        </div>
        <p className="mb-3 text-sm text-muted-foreground">
          Every size that is low or out across all locations, with how many to buy to get back to a healthy level.
        </p>
        {skus.isPending ? (
          <LoadingRows count={4} />
        ) : skus.isError ? (
          <ErrorState section="Low stock" message={skus.error.message} onRetry={() => skus.refetch()} />
        ) : !low.length ? (
          <EmptyState title="Every size is in stock" />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {low.map((p) => (
              <li key={p.key}>
                <button onClick={() => setOpenKey(p.key)} className="card-surface flex w-full items-center gap-3 p-3 text-left">
                  <ProductThumb src={p.imageUrl} name={p.name} className="size-10" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">{p.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{skuLine(p)}</p>
                    <div className="mt-1">
                      <StockBadge status={p.stockStatus} />
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-semibold text-primary">{p.currentStock}</p>
                    <p className="text-[11px] text-muted-foreground">buy {p.replenishQuantity}</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <HistorySheet productKey={openKey} onClose={() => setOpenKey(null)} />
    </>
  );
}

/* -------------------------------- History -------------------------------- */

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
