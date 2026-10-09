import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Barcode, Download, History, Plus, ShoppingCart, Upload } from 'lucide-react';
import { toast } from 'sonner';

import { Input } from '@/hub/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/hub/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/hub/ui/sheet';
import { Button } from '@/hub/ui/button';
import { AdjustStockDialog } from '@/hub/components/AdjustStockDialog';
import { BarcodeLabelsDialog } from '@/hub/components/BarcodeLabelsDialog';
import { BatchEditDialog } from '@/hub/components/BatchEditDialog';
import { ImportHistoryDialog } from '@/hub/components/ImportHistoryDialog';
import { ImportWizard } from '@/hub/components/ImportWizard';
import { ProductCreateDialog } from '@/hub/components/ProductCreateDialog';
import { ProductEditDialog } from '@/hub/components/ProductEditDialog';
import { ProductHistoryDialog } from '@/hub/components/ProductHistoryDialog';
import { StockInDialog } from '@/hub/components/StockInDialog';
import {
  EmptyState,
  ErrorState,
  Loading,
  LoadingRows,
  PageHeader,
  ProductThumb,
  StockBadge,
} from '@/hub/components/shared';
import { accessQuery, batchIndexQuery, productQuery, productsQuery, skuBatchesQuery } from '@/hub/lib/api';
import { addToCart, useCart } from '@/hub/lib/cart';
import { QAR } from '@/hub/lib/format';
import { can } from '@/hub/lib/permissions';
import { downloadNewProductsTemplate, downloadWorkbook } from '@/hub/lib/spreadsheet';
import { useHubTitle } from '@/hub/lib/useHubTitle';
import { ClassicCsvMenu } from '@/hub/components/ClassicCsvMenu';

const ALL = '__all__';

export default function ProductsPage() {
  useHubTitle('Products — FEMNIA Hub');
  const client = useQueryClient();
  const q = useQuery(productsQuery);
  const access = useQuery(accessQuery).data ?? null;
  const [createOpen, setCreateOpen] = useState(false);
  const [stockInKey, setStockInKey] = useState(null);
  const [wizard, setWizard] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [barcodeOpen, setBarcodeOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState(ALL);
  const [size, setSize] = useState(ALL);
  const [color, setColor] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [sort, setSort] = useState('name');
  const [openKey, setOpenKey] = useState(null);

  const products = useMemo(() => q.data ?? [], [q.data]);
  const uniq = (fn) => [...new Set(products.map(fn).filter(Boolean))].sort();

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return products
      .filter((p) => {
        if (term && !`${p.productCode ?? ''} ${p.sku} ${p.name} ${p.brand ?? ''} ${p.category ?? ''} ${p.color ?? ''}`.toLowerCase().includes(term)) return false;
        if (category !== ALL && p.category !== category) return false;
        if (size !== ALL && p.size !== size) return false;
        if (color !== ALL && p.color !== color) return false;
        if (status !== ALL && p.stockStatus !== status) return false;
        return true;
      })
      .sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : a.currentStock - b.currentStock));
  }, [products, search, category, size, color, status, sort]);

  const showCost = can(access, 'products.view_cost');
  const canSell = can(access, 'orders.create');
  const cart = useCart();
  const cartCount = cart.reduce((s, e) => s + e.quantity, 0);
  const inCart = (key) => cart.find((e) => e.key === key)?.quantity ?? 0;
  const handleAdd = (p) => {
    if (addToCart(p.key, p.currentStock)) toast.success(`${p.name} added to cart.`);
    else toast.error(`Only ${p.currentStock} unit(s) of ${p.sku} in stock.`);
  };

  const exportProducts = async () => {
    const active = products.filter((p) => p.isActive);
    const batches = (await client.fetchQuery(batchIndexQuery)).labels ?? {};
    const headers = [
      'Product Code', 'SKU Code', 'Product Name', 'Category', 'Size/Age', 'Colour/Variant',
      ...(showCost ? ['Cost Price'] : []),
      'Selling Price', 'Current Stock', 'Reorder Level', 'Supplier', 'Batch Details', 'Barcode Value', 'Status',
    ];
    const rows = active.map((p) => [
      p.productCode ?? '', p.sku, p.name, p.category ?? '', p.size ?? '', p.color ?? '',
      ...(showCost ? [p.costPrice] : []),
      p.sellingPriceQar, p.currentStock, p.reorderLevel, p.supplier ?? 'Not Assigned',
      (batches[p.key] ?? []).join('; '), p.productCode ?? '', 'Active',
    ]);
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    downloadWorkbook(`FEMNIA_Products_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.xlsx`, [
      { name: 'Products', rows: [headers, ...rows] },
    ]);
  };

  return (
    <>
      <PageHeader
        title="Products"
        subtitle={`${filtered.length} of ${products.length} products`}
        onRefresh={() => q.refetch()}
        refreshing={q.isFetching}
        actions={
          <div className="flex flex-wrap gap-2">
            {can(access, 'products.add') && (
              <Button size="sm" className="h-10" onClick={() => setCreateOpen(true)}>
                <Plus className="mr-2 size-4" /> Add New Product
              </Button>
            )}
            {can(access, 'imports.new_products') && (
              <Button size="sm" variant="outline" className="h-10" onClick={() => setWizard('new_products')}>
                <Upload className="mr-2 size-4" /> Import New Products
              </Button>
            )}
            {can(access, 'imports.mixed') && access?.isAdmin && (
              <Button size="sm" variant="outline" className="h-10" onClick={() => setWizard('mixed')}>
                <Upload className="mr-2 size-4" /> Import Mixed File
              </Button>
            )}
            {can(access, 'inventory.export') && (
              <Button size="sm" variant="outline" className="h-10" onClick={() => exportProducts()} disabled={!products.length}>
                <Download className="mr-2 size-4" /> Download Excel
              </Button>
            )}
            {can(access, 'products.barcodes') && (
              <Button size="sm" variant="outline" className="h-10" onClick={() => setBarcodeOpen(true)}>
                <Barcode className="mr-2 size-4" /> Print Barcodes
              </Button>
            )}
            {can(access, 'imports.templates') && (
              <Button size="sm" variant="outline" className="h-10" onClick={downloadNewProductsTemplate}>
                <Download className="mr-2 size-4" /> Product Template
              </Button>
            )}
            {(access?.isAdmin || access?.legacy?.includes('products')) && <ClassicCsvMenu onImported={() => q.refetch()} />}
            {can(access, 'imports.history') && (
              <Button size="sm" variant="outline" className="h-10" onClick={() => setHistoryOpen(true)}>
                <History className="mr-2 size-4" /> Import History
              </Button>
            )}
          </div>
        }
      />

      <ProductCreateDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={(keys, thenStockIn) => {
          if (thenStockIn && can(access, 'inventory.stock_in')) setStockInKey(keys[0] ?? '');
        }}
      />
      <StockInDialog
        open={stockInKey !== null}
        initialKey={stockInKey || null}
        onClose={() => setStockInKey(null)}
        products={products}
        onDone={(result) =>
          toast.success(`Stock In ${result.reference}`, {
            description: `${result.name} (${result.sku}) · Previous ${result.previous} · Added ${result.quantity} · New stock ${result.resulting}`,
            duration: 8000,
          })
        }
      />
      <BarcodeLabelsDialog open={barcodeOpen} onClose={() => setBarcodeOpen(false)} products={products} />
      {wizard && <ImportWizard open kind={wizard} onClose={() => setWizard(null)} />}
      <ImportHistoryDialog
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        canReverse={can(access, 'imports.reverse')}
      />

      <div className="no-print mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
        <Input
          placeholder="Search code, SKU, name, brand, category or colour…"
          className="h-11 sm:col-span-2"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <FilterSelect label="Category" value={category} onChange={setCategory} options={uniq((p) => p.category)} />
        <FilterSelect label="Size" value={size} onChange={setSize} options={uniq((p) => p.size)} />
        <FilterSelect label="Colour" value={color} onChange={setColor} options={uniq((p) => p.color)} />
        <FilterSelect
          label="Stock status"
          value={status}
          onChange={setStatus}
          options={['In Stock', 'Low Stock', 'Out of Stock']}
        />
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="h-11 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Sort: Name (A–Z)</SelectItem>
            <SelectItem value="stock">Sort: Stock (low first)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {q.isPending ? (
        <LoadingRows count={8} />
      ) : q.isError ? (
        <ErrorState section="Products" message={q.error.message} onRetry={() => q.refetch()} />
      ) : filtered.length === 0 ? (
        <EmptyState title="No products match these filters" hint="Clear the search or filters to see all products." />
      ) : (
        <>
          {/* Desktop table */}
          <div className="card-surface hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="p-3">Code</th>
                  <th className="p-3">Product</th>
                  <th className="p-3">SKU</th>
                  <th className="p-3">Category</th>
                  <th className="p-3">Size</th>
                  <th className="p-3">Colour</th>
                  <th className="p-3 text-right">Cost</th>
                  <th className="p-3 text-right">Selling</th>
                  <th className="p-3 text-right">Stock</th>
                  <th className="p-3 text-right">Reorder</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Supplier</th>
                  {canSell && <th className="p-3">Cart</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((p) => (
                  <tr key={p.key} onClick={() => setOpenKey(p.key)} className="cursor-pointer hover:bg-secondary/40">
                    <td className="p-3 font-mono text-xs font-semibold text-foreground">{p.productCode ?? '—'}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        <ProductThumb src={p.imageUrl} name={p.name} className="size-10" />
                        <span className="font-medium text-foreground">{p.name}</span>
                      </div>
                    </td>
                    <td className="p-3 font-mono text-xs text-muted-foreground">{p.sku}</td>
                    <td className="p-3">{p.category ?? '—'}</td>
                    <td className="p-3">{p.size ?? '—'}</td>
                    <td className="p-3">{p.color ?? '—'}</td>
                    <td className="p-3 text-right">{QAR(p.costPrice)}</td>
                    <td className="p-3 text-right font-medium">{QAR(p.sellingPriceQar)}</td>
                    <td className="p-3 text-right font-semibold">{p.currentStock}</td>
                    <td className="p-3 text-right text-muted-foreground">{p.reorderLevel}</td>
                    <td className="p-3">
                      <StockBadge status={p.stockStatus} />
                    </td>
                    <td className="p-3 text-muted-foreground">{p.supplier ?? 'Not Assigned'}</td>
                    {canSell && (
                      <td className="p-3" onClick={(e) => e.stopPropagation()}>
                        {p.isActive && (
                          <Button size="sm" variant="outline" disabled={p.currentStock < 1} onClick={() => handleAdd(p)}>
                            <ShoppingCart className="size-4" />
                            {inCart(p.key) > 0 ? inCart(p.key) : 'Add'}
                          </Button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <ul className="grid gap-3 lg:hidden">
            {filtered.map((p) => (
              <li key={p.key}>
                <button
                  onClick={() => setOpenKey(p.key)}
                  className="card-surface flex w-full items-start gap-3 p-3 text-left"
                >
                  <ProductThumb src={p.imageUrl} name={p.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{p.name}</p>
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {p.productCode ? `${p.productCode} · ` : ''}
                      {p.sku}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {[p.category, p.size, p.color].filter(Boolean).join(' · ') || '—'}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <StockBadge status={p.stockStatus} />
                      <span className="text-xs text-muted-foreground">Stock {p.currentStock}</span>
                      <span className="text-sm font-semibold text-foreground">{QAR(p.sellingPriceQar)}</span>
                    </div>
                  </div>
                </button>
                {canSell && p.isActive && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-1 h-10 w-full"
                    disabled={p.currentStock < 1}
                    onClick={() => handleAdd(p)}
                  >
                    <ShoppingCart className="size-4" /> {p.currentStock < 1 ? 'Out of stock' : 'Add to cart'}
                    {inCart(p.key) > 0 && ` (${inCart(p.key)})`}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {canSell && cartCount > 0 && (
        <div className="no-print sticky bottom-3 z-30 mt-4 flex justify-center">
          <Link
            to="/hub/pos"
            className="flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-lg"
          >
            <ShoppingCart className="size-4" /> View cart &amp; create order · {cartCount} item(s)
          </Link>
        </div>
      )}

      <ProductDetail productKey={openKey} onClose={() => setOpenKey(null)} />
    </>
  );
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-11 w-full">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{label}: All</SelectItem>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ProductDetail({ productKey, onClose }) {
  const q = useQuery({ ...productQuery(productKey ?? ''), enabled: Boolean(productKey) });
  const access = useQuery(accessQuery).data ?? null;
  const product = q.data?.product ?? null;
  const [dialog, setDialog] = useState(null);

  return (
    <>
      <Sheet open={Boolean(productKey)} onOpenChange={(o) => !o && onClose()}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{product?.name ?? 'Product'}</SheetTitle>
          </SheetHeader>
          {q.isPending ? (
            <Loading label="Loading product…" />
          ) : q.isError ? (
            <div className="p-4">
              <ErrorState section="Product details" message={q.error.message} onRetry={() => q.refetch()} />
            </div>
          ) : !product ? (
            <div className="p-4">
              <EmptyState title="Product not found" />
            </div>
          ) : (
            <div className="space-y-5 p-4">
              <div className="flex items-center gap-3">
                <ProductThumb src={product.imageUrl} name={product.name} className="size-16" />
                <div className="min-w-0">
                  <p className="font-mono text-xs text-muted-foreground">{product.sku}</p>
                  <StockBadge status={product.stockStatus} />
                </div>
              </div>

              <dl className="grid grid-cols-2 gap-3 text-sm">
                <Field label="Category" value={product.category ?? '—'} />
                <Field label="Size / Age" value={product.size ?? '—'} />
                <Field label="Colour" value={product.color ?? '—'} />
                <Field label="Supplier" value={product.supplier ?? 'Not Assigned'} />
                <Field label="Cost price" value={QAR(product.costPrice)} />
                <Field label="Selling price" value={QAR(product.sellingPriceQar)} />
                <Field label="Opening stock" value={product.openingStock} />
                <Field label="Stock in" value={product.stockIn} />
                <Field label="Auto stock out" value={product.autoStockOut} />
                <Field label="Manual stock out" value={product.manualStockOut} />
                <Field label="Current stock" value={product.currentStock} />
                <Field label="Reorder level" value={product.reorderLevel} />
                <Field label="Replenish qty" value={product.replenishQuantity} />
                <Field label="Shelf / rack" value={product.shelfLocation ?? product.rack ?? '—'} />
              </dl>

              <div className="no-print flex flex-wrap gap-2">
                {can(access, 'products.edit') && (
                  <Button className="h-11" onClick={() => setDialog('edit')}>
                    Edit product
                  </Button>
                )}
                {can(access, 'inventory.adjust') && (
                  <Button variant="outline" className="h-11" onClick={() => setDialog('adjust')}>
                    Adjust stock
                  </Button>
                )}
                {can(access, 'inventory.view_history') && (
                  <Button variant="outline" className="h-11" onClick={() => setDialog('history')}>
                    View history
                  </Button>
                )}
                {!product.isActive && (
                  <span className="inline-flex items-center rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                    Inactive — hidden from new orders
                  </span>
                )}
              </div>

              <BatchList product={product} />

              <div>
                <h3 className="mb-2 text-sm font-semibold text-foreground">Stock history</h3>
                {(q.data?.history ?? []).length === 0 ? (
                  <EmptyState title="No movements for this SKU yet" />
                ) : (
                  <ul className="divide-y divide-border text-sm">
                    {q.data.history.map((m) => (
                      <li key={m.id} className="flex items-center justify-between gap-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-foreground">{m.type}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {m.date} · {m.reference}
                          </p>
                        </div>
                        <span className={m.quantity < 0 ? 'font-semibold text-destructive' : 'font-semibold text-emerald-700'}>
                          {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
      <ProductEditDialog product={product} open={dialog === 'edit'} onClose={() => setDialog(null)} />
      <AdjustStockDialog product={product} open={dialog === 'adjust'} onClose={() => setDialog(null)} />
      <ProductHistoryDialog product={product} open={dialog === 'history'} onClose={() => setDialog(null)} />
    </>
  );
}

function BatchList({ product }) {
  const batches = useQuery(skuBatchesQuery(product.key));
  const access = useQuery(accessQuery).data ?? null;
  const [edit, setEdit] = useState(null);
  const rows = batches.data ?? [];
  const opening = rows.find((b) => b.source.startsWith('Opening Stock'));
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">Batch details</h3>
        {can(access, 'inventory.batch_edit') && (
          <Button
            size="sm"
            variant="outline"
            className="h-9"
            onClick={() =>
              setEdit({
                kind: 'opening',
                key: product.key,
                title: `Opening stock batch · ${product.sku}`,
                initial: {
                  batchNumber: opening?.batchNumber ?? product.batchNumber ?? null,
                  sourceCountry: opening?.sourceCountry ?? product.sourceCountry ?? null,
                  wholesaler: opening?.wholesaler ?? product.wholesaler ?? null,
                },
              })
            }
          >
            Edit opening batch
          </Button>
        )}
      </div>
      <BatchEditDialog target={edit} onClose={() => setEdit(null)} />
      {rows.length === 0 ? (
        <p className="rounded-xl bg-secondary/50 p-3 text-sm text-muted-foreground">No batch details recorded for this SKU.</p>
      ) : (
        <ul className="divide-y divide-border text-sm">
          {rows.map((b) => (
            <li key={b.key} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-foreground">{b.label}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {b.source}
                  {b.wholesaler ? ` · ${b.wholesaler}` : ''}
                  {b.firstDate ? ` · from ${b.firstDate}` : ''}
                </p>
              </div>
              <span className="font-semibold text-foreground">{b.receivedQuantity} received</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div className="rounded-xl bg-secondary/50 p-3">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-medium text-foreground">{value}</dd>
    </div>
  );
}
