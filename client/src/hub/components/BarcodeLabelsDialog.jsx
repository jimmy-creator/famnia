import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Printer, Search, Usb } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/hub/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/hub/ui/dialog';
import { Input } from '@/hub/ui/input';
import { Label } from '@/hub/ui/label';
import { accessQuery, batchIndexQuery, get, qk, updateProduct } from '@/hub/lib/api';
import { can } from '@/hub/lib/permissions';
import {
  SHOP_LABEL_CSS,
  SHOP_LABEL_SIZES,
  SHOP_SHOW_DEFAULT,
  SHOP_SHOW_OPTIONS,
  drawShopLabelCanvas,
  printShopLabels,
  shopLabelHtml,
} from '@/hub/lib/shopLabels';
import {
  getDevice as getLabelPrinter,
  isSupported as usbSupported,
  printLabelImages,
  requestDevice as pairLabelPrinter,
} from '@/lib/thermalPrinter';
import { CURRENCY } from '@/hub/lib/format';
import {
  A4_LABEL,
  A4_LABEL_CSS,
  A4_LABEL_SHEET,
  DEFAULT_SHEET,
  FOUR_BY_SIX_LABEL,
  STICKER_CSS,
  a4LabelSheetHtml,
  printBarcodeLabels,
  printSingleTestLabel,
  sheetGrid,
  stickerHtml,
} from '@/hub/lib/barcodes';
import { QAR } from '@/hub/lib/format';

const PRINT_SETTINGS_KEY = 'femnia-barcode-label-presets-v1';
const FORMATS = ['thermal-30x20', 'a4-label', 'thermal-4x6', 'a4', 'custom', 'shop'];
// The A4 sheet preview is drawn at true size in mm, then scaled down to fit the dialog.
const A4_PREVIEW_SCALE = 0.45;
const distinct = (values) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
const labelExtrasQuery = { queryKey: ['femnia', 'label-extras'], queryFn: () => get('/hub/label-extras'), staleTime: 60_000 };
const round3 = (n) => Math.round((parseFloat(n) || 0) * 1000) / 1000;
const availableStock = (product) => Math.max(0, Math.round(product.currentStock ?? 0));
const inRange = (v, lo, hi) => Number(v) >= lo && Number(v) <= hi;

function loadSettings() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(PRINT_SETTINGS_KEY) ?? 'null');
    if (saved && FORMATS.includes(saved.format)) return saved;
  } catch {
    // Invalid preferences fall back to Thermal 30×20 mm.
  }
  return null;
}

export function BarcodeLabelsDialog({ open, onClose, products }) {
  const [saved] = useState(loadSettings);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState({});
  const [format, setFormat] = useState(saved?.format ?? 'thermal-30x20');
  const [showPrice, setShowPrice] = useState(Boolean(saved?.showPrice));
  const [customWidthMm, setCustomWidthMm] = useState(inRange(saved?.customWidthMm, 10, 100) ? Number(saved.customWidthMm) : 30);
  const [customHeightMm, setCustomHeightMm] = useState(inRange(saved?.customHeightMm, 10, 150) ? Number(saved.customHeightMm) : 20);
  const [thermalSmallWidthMm, setThermalSmallWidthMm] = useState(
    inRange(saved?.thermalSmallWidthMm, 10, 100) ? Number(saved.thermalSmallWidthMm) : 30,
  );
  const [thermalSmallHeightMm, setThermalSmallHeightMm] = useState(
    inRange(saved?.thermalSmallHeightMm, 10, 150) ? Number(saved.thermalSmallHeightMm) : 20,
  );
  const [thermalSmallShiftXMm, setThermalSmallShiftXMm] = useState(
    inRange(saved?.thermalSmallShiftXMm, -3, 3) ? Number(saved.thermalSmallShiftXMm) : 0,
  );
  const [thermalSmallShiftYMm, setThermalSmallShiftYMm] = useState(
    inRange(saved?.thermalSmallShiftYMm, -3, 3) ? Number(saved.thermalSmallShiftYMm) : 0,
  );
  const [a4ShiftXMm, setA4ShiftXMm] = useState(inRange(saved?.a4ShiftXMm, -3, 3) ? Number(saved.a4ShiftXMm) : 0);
  const [a4ShiftYMm, setA4ShiftYMm] = useState(inRange(saved?.a4ShiftYMm, -3, 3) ? Number(saved.a4ShiftYMm) : 0);
  const [sizeFilter, setSizeFilter] = useState('');
  const [colorFilter, setColorFilter] = useState('');
  const [batch, setBatch] = useState('__all__');
  const batchIndex = useQuery({ ...batchIndexQuery, enabled: open });
  // Shop label (the classic label designer's layout).
  const [shopSizeId, setShopSizeId] = useState(
    SHOP_LABEL_SIZES.some((s) => s.id === saved?.shopSizeId) ? saved.shopSizeId : 'l6040',
  );
  const [shopLayout, setShopLayout] = useState(saved?.shopLayout === 'sheet' ? 'sheet' : 'roll');
  const [shopShow, setShopShow] = useState({ ...SHOP_SHOW_DEFAULT, ...(saved?.shopShow ?? {}) });
  const shop = format === 'shop';
  const extras = useQuery({ ...labelExtrasQuery, enabled: open && shop });
  const access = useQuery(accessQuery).data ?? null;
  const canEditPrice = can(access, 'products.edit_price');
  const client = useQueryClient();
  const [usbReady, setUsbReady] = useState(false);
  const [usbBusy, setUsbBusy] = useState(false);

  useEffect(() => {
    if (!open || !shop || !usbSupported()) return;
    let live = true;
    getLabelPrinter('barcode')
      .then((h) => live && setUsbReady(Boolean(h)))
      .catch(() => live && setUsbReady(false));
    return () => {
      live = false;
    };
  }, [open, shop]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        PRINT_SETTINGS_KEY,
        JSON.stringify({
          format, showPrice, customWidthMm, customHeightMm,
          thermalSmallWidthMm, thermalSmallHeightMm, thermalSmallShiftXMm, thermalSmallShiftYMm,
          a4ShiftXMm, a4ShiftYMm, shopSizeId, shopLayout, shopShow,
        }),
      );
    } catch {
      /* storage unavailable — settings last for this session only */
    }
  }, [format, showPrice, customWidthMm, customHeightMm, thermalSmallWidthMm, thermalSmallHeightMm, thermalSmallShiftXMm, thermalSmallShiftYMm, a4ShiftXMm, a4ShiftYMm, shopSizeId, shopLayout, shopShow]);

  const batchNumbers = useMemo(() => batchIndex.data?.numbers ?? {}, [batchIndex.data]);
  const printable = useMemo(() => products.filter((product) => product.isActive && product.productCode), [products]);
  const batchOptions = useMemo(
    () => [...new Set(Object.values(batchNumbers).flat())].sort((a, b) => a.localeCompare(b)),
    [batchNumbers],
  );
  const productsInBatch = useMemo(
    () => printable.filter((product) => batch === '__all__' || (batchNumbers[product.key] ?? []).includes(batch)),
    [printable, batch, batchNumbers],
  );
  const sizeOptions = useMemo(() => distinct(printable.map((product) => product.size)), [printable]);
  const colorOptions = useMemo(() => distinct(printable.map((product) => product.color)), [printable]);
  // Every filter narrows the list; an empty filter matches everything.
  const results = useMemo(() => {
    const term = search.trim().toLowerCase();
    return productsInBatch.filter(
      (product) =>
        (!sizeFilter || product.size === sizeFilter) &&
        (!colorFilter || product.color === colorFilter) &&
        (!term ||
          [product.productCode ?? '', product.sku, product.name, product.color ?? ''].some((value) =>
            value.toLowerCase().includes(term),
          )),
    );
  }, [productsInBatch, search, sizeFilter, colorFilter]);

  const chosen = printable.filter((product) => selected[product.key]);
  const fresh = (product) => ({ quantity: availableStock(product) });

  const toggle = (key) =>
    setSelected((previous) => {
      const next = { ...previous };
      if (next[key]) delete next[key];
      else {
        const product = printable.find((candidate) => candidate.key === key);
        if (product) next[key] = fresh(product);
      }
      return next;
    });

  const selectAll = () =>
    setSelected((previous) => {
      const next = { ...previous };
      for (const product of results) if (!next[product.key]) next[product.key] = fresh(product);
      return next;
    });

  const selectAllInBatch = () =>
    setSelected((previous) => {
      const next = { ...previous };
      for (const product of productsInBatch) if (!next[product.key]) next[product.key] = fresh(product);
      return next;
    });

  const resetToStock = () =>
    setSelected((previous) =>
      Object.fromEntries(
        Object.entries(previous).map(([key, value]) => {
          const product = printable.find((candidate) => candidate.key === key);
          return [key, product ? fresh(product) : value];
        }),
      ),
    );

  const stickers = chosen.flatMap((product) => {
    const item = {
      sku: product.sku,
      productCode: product.productCode ?? '',
      name: product.name,
      size: product.size ?? '',
      variant: product.color ?? '',
      batch: '',
      price: showPrice ? QAR(product.sellingPriceQar) : '',
    };
    const count = Math.max(0, Math.min(Math.floor(selected[product.key]?.quantity ?? 0), 500));
    return Array.from({ length: count }, () => item);
  });

  const customSize = { widthMm: customWidthMm, heightMm: customHeightMm };
  const thermalSmallSize = { widthMm: thermalSmallWidthMm, heightMm: thermalSmallHeightMm };
  const thermalSmallShift = { xMm: thermalSmallShiftXMm, yMm: thermalSmallShiftYMm };
  const labelSize =
    format === 'thermal-4x6' ? FOUR_BY_SIX_LABEL : format === 'a4' || format === 'custom' ? customSize : thermalSmallSize;
  const grid = sheetGrid(labelSize, DEFAULT_SHEET);
  const a4Label = format === 'a4-label';
  const a4Shift = { xMm: a4ShiftXMm, yMm: a4ShiftYMm };
  const pageCount =
    format === 'a4'
      ? Math.max(1, Math.ceil(stickers.length / grid.perPage))
      : a4Label
        ? Math.max(1, Math.ceil(stickers.length / A4_LABEL_SHEET.perPage))
        : Math.max(1, stickers.length);
  const preview = stickers[0];
  // First sheet as it will print; rebuilt only when its labels or the shift change.
  const firstSheetKey = a4Label ? JSON.stringify(stickers.slice(0, A4_LABEL_SHEET.perPage)) : '';
  const a4PreviewHtml = useMemo(
    () => (firstSheetKey ? a4LabelSheetHtml(JSON.parse(firstSheetKey), { xMm: a4ShiftXMm, yMm: a4ShiftYMm }, true) : ''),
    [firstSheetKey, a4ShiftXMm, a4ShiftYMm],
  );
  const previewScale = Math.min(360 / labelSize.widthMm, 400 / labelSize.heightMm);
  const previewWidth = format === 'thermal-4x6' ? 'min(100%, 267px)' : `${labelSize.widthMm * previewScale}px`;
  const previewHeight = format === 'thermal-4x6' ? '400px' : `${labelSize.heightMm * previewScale}px`;

  // ── Shop labels: one entry per label, with the sticker price per product ──
  const shopSize = SHOP_LABEL_SIZES.find((s) => s.id === shopSizeId) ?? SHOP_LABEL_SIZES[2];
  const stickerPrice = (product) => selected[product.key]?.sellPrice ?? (product.sellingPriceQar ?? 0).toFixed(2);
  const shopItems = chosen.flatMap((product) => {
    const extra = extras.data?.[product.productId] ?? {};
    const item = {
      name: product.name,
      nameAr: extra.nameAr ?? null,
      comparePrice: extra.comparePrice ?? null,
      code: product.sku,
      barcode: product.productCode ?? '',
      sellPrice: stickerPrice(product),
    };
    const count = Math.max(0, Math.min(Math.floor(selected[product.key]?.quantity ?? 0), 500));
    return Array.from({ length: count }, () => item);
  });
  // Sticker prices that differ from the selling price are saved to the SKU
  // before printing, so the till and the website charge what the label says.
  const priceChanges = shop && shopShow.price && canEditPrice
    ? chosen.filter((p) => selected[p.key]?.sellPrice !== undefined && round3(selected[p.key].sellPrice) !== round3(p.sellingPriceQar))
    : [];

  const applyPrices = async () => {
    const badPrice = priceChanges.find((p) => !(round3(selected[p.key].sellPrice) > 0));
    if (badPrice) {
      toast.error(`${badPrice.name}: enter a selling price above 0`);
      return false;
    }
    try {
      for (const p of priceChanges) await updateProduct(p.key, { sellingPriceQar: round3(selected[p.key].sellPrice) });
    } catch (error) {
      toast.error(`${error.message} — nothing printed.`);
      return false;
    }
    if (priceChanges.length) {
      toast.success(`Selling price updated for ${priceChanges.length} product${priceChanges.length === 1 ? '' : 's'}`);
      void client.invalidateQueries({ queryKey: qk.products });
    }
    return true;
  };

  const print = async () => {
    try {
      if (shop) {
        if (!(await applyPrices())) return;
        printShopLabels(shopItems, shopSize, shopLayout, shopShow, CURRENCY);
        return;
      }
      printBarcodeLabels(stickers, format, customSize, thermalSmallSize, thermalSmallShift, a4Shift);
    } catch (error) {
      toast.error(error.message);
    }
  };

  const printTest = () => {
    try {
      if (shop) {
        if (shopItems[0]) printShopLabels([shopItems[0]], shopSize, 'roll', shopShow, CURRENCY);
        return;
      }
      if (!preview) return;
      printSingleTestLabel(preview, format, customSize, thermalSmallSize, thermalSmallShift, a4Shift);
    } catch (error) {
      toast.error(error.message);
    }
  };

  const pairUsb = async () => {
    try {
      const handle = await pairLabelPrinter('barcode');
      setUsbReady(true);
      toast.success(`Paired: ${handle.device.productName || 'label printer'}`);
    } catch (error) {
      if (error?.name !== 'NotFoundError') toast.error(error.message || 'Pairing cancelled');
    }
  };

  const printUsb = async () => {
    if (!shopItems.length) return;
    if (!(await applyPrices())) return;
    setUsbBusy(true);
    try {
      await printLabelImages(shopItems.map((item) => drawShopLabelCanvas(item, shopSize, shopShow, CURRENCY)));
      toast.success(`Sent ${shopItems.length} label${shopItems.length === 1 ? '' : 's'} to the printer`);
    } catch (error) {
      toast.error(error.message || 'Direct print failed');
    } finally {
      setUsbBusy(false);
    }
  };

  const printCount = shop ? shopItems.length : stickers.length;

  const numberInput = (value, setter, min, max, step, fallback) => (
    <Input
      type="number"
      inputMode="decimal"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(event) => setter(Math.min(max, Math.max(min, Number(event.target.value) || fallback)))}
      className="h-11"
    />
  );

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="z-[70] max-h-[92vh] w-[calc(100%-1rem)] min-w-0 max-w-3xl overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="pr-6">Print Barcodes</DialogTitle>
        </DialogHeader>

        <div className="min-w-0 space-y-5">
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search product name, Product Code or SKU"
                aria-label="Search product name, Product Code or SKU"
                className="h-11 pl-9"
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <select
                value={sizeFilter}
                onChange={(event) => setSizeFilter(event.target.value)}
                aria-label="Filter by size"
                className="h-11 min-w-0 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">All sizes</option>
                {sizeOptions.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
              <select
                value={colorFilter}
                onChange={(event) => setColorFilter(event.target.value)}
                aria-label="Filter by colour"
                className="h-11 min-w-0 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">All colours</option>
                {colorOptions.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
              <select
                value={batch}
                onChange={(event) => setBatch(event.target.value)}
                aria-label="Filter by batch"
                className="h-11 min-w-0 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="__all__">All batches</option>
                {batchOptions.map((label) => (
                  <option key={label} value={label}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" className="h-9" disabled={results.length === 0} onClick={selectAll}>
                  Select all listed
                </Button>
                <Button type="button" variant="outline" size="sm" className="h-9" disabled={batch === '__all__'} onClick={selectAllInBatch}>
                  Select all in batch
                </Button>
                <Button type="button" variant="outline" size="sm" className="h-9" disabled={chosen.length === 0} onClick={resetToStock}>
                  Reset to available stock
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-9" disabled={chosen.length === 0} onClick={() => setSelected({})}>
                  Clear selection
                </Button>
              </div>
              <p className="text-xs font-medium text-muted-foreground">
                Selected: <span className="text-foreground">{chosen.length}</span> | Results:{' '}
                <span className="text-foreground">{results.length}</span>
              </p>
            </div>
            <div className="max-h-72 overflow-auto rounded-xl border border-border">
              {results.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">No active product with a Product Code matches.</p>
              ) : (
                <table className="w-full min-w-[36rem] text-left text-sm">
                  <thead className="sticky top-0 bg-background text-xs uppercase tracking-wide text-muted-foreground">
                    <tr className="border-b border-border">
                      <th className="px-3 py-2 font-medium">Code</th>
                      <th className="px-3 py-2 font-medium">Product</th>
                      <th className="px-3 py-2 font-medium">SKU</th>
                      <th className="px-3 py-2 font-medium">Size</th>
                      <th className="px-3 py-2 font-medium">Colour</th>
                      <th className="px-3 py-2 text-right font-medium">Stock</th>
                      <th className="px-3 py-2 text-center font-medium">
                        <span className="sr-only">Select</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((product) => (
                      <tr
                        key={product.key}
                        onClick={() => toggle(product.key)}
                        className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-secondary/60"
                      >
                        <td className="px-3 py-2 font-mono text-xs text-primary">{product.productCode}</td>
                        <td className="max-w-[14rem] truncate px-3 py-2">{product.name}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{product.sku}</td>
                        <td className="px-3 py-2 text-xs">{product.size || '—'}</td>
                        <td className="max-w-[9rem] truncate px-3 py-2 text-xs">{product.color || '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{availableStock(product)}</td>
                        <td className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={Boolean(selected[product.key])}
                            onChange={() => toggle(product.key)}
                            onClick={(event) => event.stopPropagation()}
                            aria-label={`Select ${product.productCode} ${product.name}`}
                            className="size-4"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {chosen.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Selected products — quantity defaults to current stock; 0 skips printing
              </p>
              {chosen.map((product) => (
                <SelectedRow
                  key={product.key}
                  product={product}
                  quantity={selected[product.key]?.quantity ?? 0}
                  onChange={(quantity) =>
                    setSelected((previous) => ({ ...previous, [product.key]: { ...previous[product.key], quantity } }))
                  }
                  price={shop && shopShow.price && canEditPrice ? stickerPrice(product) : null}
                  onPriceChange={(sellPrice) =>
                    setSelected((previous) => ({ ...previous, [product.key]: { ...previous[product.key], sellPrice } }))
                  }
                />
              ))}
              {priceChanges.length > 0 && (
                <p className="rounded-md border-l-4 border-primary bg-secondary/40 p-3 text-xs text-foreground">
                  Printing will change the selling price of {priceChanges.length} product
                  {priceChanges.length === 1 ? '' : 's'} to the sticker price — the till and the website will charge it from
                  then on.
                </p>
              )}
            </div>
          )}

          <div className="rounded-xl border border-border p-4">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <div>
                <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">Print size</Label>
                <select
                  value={format}
                  onChange={(event) => setFormat(event.target.value)}
                  className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="thermal-30x20">Thermal 30×20 mm (Default)</option>
                  <option value="a4-label">A4 Label – 38.1 × 21.2 mm (65 per sheet)</option>
                  <option value="thermal-4x6">Thermal 4×6 in (100×150 mm)</option>
                  <option value="a4">A4 — 30×20 mm grid</option>
                  <option value="custom">Custom size</option>
                  <option value="shop">Shop label — 40×25 to 80×50 mm, Arabic name, USB printer</option>
                </select>
              </div>
              {!shop && (
                <label className="flex h-11 items-center gap-2 text-sm">
                  <input type="checkbox" checked={showPrice} onChange={(event) => setShowPrice(event.target.checked)} className="size-4" />
                  Show price in QAR
                </label>
              )}
            </div>
            {shop && (
              <div className="mt-4 space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">Label size</Label>
                    <select
                      value={shopSizeId}
                      onChange={(event) => setShopSizeId(event.target.value)}
                      className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      {SHOP_LABEL_SIZES.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">Layout</Label>
                    <select
                      value={shopLayout}
                      onChange={(event) => setShopLayout(event.target.value)}
                      className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="roll">Roll — one label per page (label printer)</option>
                      <option value="sheet">Sheet — A4, labels side by side</option>
                    </select>
                  </div>
                </div>
                <div>
                  <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">Show on label</Label>
                  <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
                    {SHOP_SHOW_OPTIONS.map(([key, label]) => (
                      <label key={key} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          className="size-4"
                          checked={Boolean(shopShow[key])}
                          onChange={(event) => setShopShow((s) => ({ ...s, [key]: event.target.checked }))}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
                {usbSupported() && (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    {usbReady ? (
                      <span className="text-muted-foreground">USB label printer connected.</span>
                    ) : (
                      <Button type="button" variant="outline" className="h-10" onClick={pairUsb}>
                        <Usb className="mr-2 size-4" /> Connect label printer
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}
            {format === 'thermal-30x20' && (
              <div className="mt-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">Width (mm)</Label>
                    {numberInput(thermalSmallWidthMm, setThermalSmallWidthMm, 10, 100, 0.5, 10)}
                  </div>
                  <div>
                    <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">Height (mm)</Label>
                    {numberInput(thermalSmallHeightMm, setThermalSmallHeightMm, 10, 150, 0.5, 10)}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
                      Shift left/right (mm)
                    </Label>
                    {numberInput(thermalSmallShiftXMm, setThermalSmallShiftXMm, -3, 3, 0.5, 0)}
                  </div>
                  <div>
                    <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
                      Shift up/down (mm)
                    </Label>
                    {numberInput(thermalSmallShiftYMm, setThermalSmallShiftYMm, -3, 3, 0.5, 0)}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setThermalSmallWidthMm(30);
                    setThermalSmallHeightMm(20);
                    setThermalSmallShiftXMm(0);
                    setThermalSmallShiftYMm(0);
                  }}
                >
                  Reset to 30×20
                </Button>
              </div>
            )}
            {a4Label && (
              <div className="mt-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
                      Shift left/right (mm)
                    </Label>
                    {numberInput(a4ShiftXMm, setA4ShiftXMm, -3, 3, 0.25, 0)}
                  </div>
                  <div>
                    <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
                      Shift up/down (mm)
                    </Label>
                    {numberInput(a4ShiftYMm, setA4ShiftYMm, -3, 3, 0.25, 0)}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Leave at 0 unless a test print on plain paper sits off the label outlines — then nudge the whole sheet.
                </p>
              </div>
            )}
            {(format === 'custom' || format === 'a4') && (
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div>
                  <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">Width (mm)</Label>
                  {numberInput(customWidthMm, setCustomWidthMm, 10, 100, 1, 10)}
                </div>
                <div>
                  <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">Height (mm)</Label>
                  {numberInput(customHeightMm, setCustomHeightMm, 10, 150, 1, 10)}
                </div>
              </div>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              {shop
                ? `${shopItems.length} label${shopItems.length === 1 ? '' : 's'} at ${shopSize.label}, ${shopLayout === 'roll' ? 'one per page' : 'on A4 sheets'}.`
                : format === 'a4'
                  ? `${grid.columns} × ${grid.rows} = ${grid.perPage} labels per A4 page. ${stickers.length} total across ${pageCount} page${pageCount === 1 ? '' : 's'}.`
                  : a4Label
                    ? `${A4_LABEL_SHEET.columns} × ${A4_LABEL_SHEET.rows} = ${A4_LABEL_SHEET.perPage} labels of ${A4_LABEL.widthMm} × ${A4_LABEL.heightMm} mm per A4 sheet. ${stickers.length} total across ${pageCount} sheet${pageCount === 1 ? '' : 's'}.`
                    : `One label per page. ${stickers.length} total across ${pageCount} page${pageCount === 1 ? '' : 's'}.`}
            </p>
            <p className="mt-2 text-xs font-medium text-foreground">In the print dialog, set margins to None and scale to 100%.</p>
          </div>

          <div className="rounded-xl border border-border p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Live label preview</p>
            <style>{shop ? SHOP_LABEL_CSS : a4Label ? A4_LABEL_CSS : STICKER_CSS(labelSize)}</style>
            <div className="flex min-h-44 items-center justify-center overflow-hidden rounded-md bg-secondary/50 p-4">
              {a4Label ? (
                preview ? (
                  <div style={{ width: `${210 * A4_PREVIEW_SCALE}mm`, height: `${297 * A4_PREVIEW_SCALE}mm` }}>
                    <div
                      className="a4l-guides border border-foreground/40 bg-white shadow-sm"
                      style={{ width: '210mm', height: '297mm', transform: `scale(${A4_PREVIEW_SCALE})`, transformOrigin: 'top left' }}
                      dangerouslySetInnerHTML={{ __html: a4PreviewHtml }}
                    />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Select a product to preview the sheet.</p>
                )
              ) : shop ? (
                shopItems[0] ? (
                  <div
                    style={{
                      width: `${shopSize.width * Math.min(320 / shopSize.width, 220 / shopSize.height) * 0.2645}mm`,
                      height: `${shopSize.height * Math.min(320 / shopSize.width, 220 / shopSize.height) * 0.2645}mm`,
                    }}
                  >
                    <div
                      className="border border-foreground shadow-sm"
                      style={{
                        width: `${shopSize.width}mm`,
                        transform: `scale(${Math.min(320 / shopSize.width, 220 / shopSize.height) * 0.2645})`,
                        transformOrigin: 'top left',
                      }}
                      dangerouslySetInnerHTML={{ __html: shopLabelHtml(shopItems[0], shopSize, shopShow, CURRENCY) }}
                    />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Select a product to preview its label.</p>
                )
              ) : preview ? (
                <div
                  className="sticker border border-foreground shadow-sm"
                  style={{ width: previewWidth, height: previewHeight }}
                  dangerouslySetInnerHTML={{
                    __html: stickerHtml(preview, labelSize, format === 'thermal-30x20' ? thermalSmallShift : undefined),
                  }}
                />
              ) : (
                <p className="text-sm text-muted-foreground">Select a product to preview its label.</p>
              )}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {a4Label
                ? `First sheet at true proportions — dashed outlines mark the ${A4_LABEL_SHEET.perPage} labels and are not printed. Printing never changes inventory.`
                : 'Preview enlarged on screen. Printing uses exact physical dimensions and never changes inventory.'}
            </p>
          </div>

          <div className="sticky bottom-0 flex flex-col gap-2 border-t border-border bg-background pt-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" className="h-11" onClick={onClose}>
              Close
            </Button>
            <Button type="button" variant="outline" className="h-11" disabled={shop ? !shopItems.length : !preview} onClick={printTest}>
              <Printer className="mr-2 size-4" /> Print test label
            </Button>
            {shop && usbReady && (
              <Button type="button" variant="outline" className="h-11" disabled={!printCount || usbBusy} onClick={printUsb}>
                {usbBusy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Usb className="mr-2 size-4" />}
                {usbBusy ? 'Sending…' : `USB · ${printCount} label${printCount === 1 ? '' : 's'}`}
              </Button>
            )}
            <Button type="button" className="h-11" disabled={!printCount} onClick={print}>
              <Printer className="mr-2 size-4" /> Print {printCount || ''} label{printCount === 1 ? '' : 's'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SelectedRow({ product, quantity, onChange, price, onPriceChange }) {
  const update = (value) => onChange(Math.min(Math.max(Math.floor(value), 0), 500));
  return (
    <div
      className={
        price === null
          ? 'grid gap-2 rounded-md bg-secondary/40 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center'
          : 'grid gap-2 rounded-md bg-secondary/40 p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center'
      }
    >
      <div className="min-w-0 text-sm">
        <p className="truncate font-medium">
          <span className="font-mono text-xs text-primary">{product.productCode}</span> {product.name}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          Current stock {availableStock(product)} · {product.sku}
          {product.size ? ` · ${product.size}` : ''}
          {product.color ? ` · ${product.color}` : ''}
        </p>
      </div>
      {price !== null && (
        <label className="flex min-w-0 flex-col gap-1 sm:items-end">
          <span className="text-xs font-medium text-muted-foreground">Sticker price (QAR)</span>
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={price}
            onChange={(event) => onPriceChange(event.target.value)}
            className="h-10 w-full sm:w-28"
            aria-label={`Sticker price for ${product.name}`}
          />
        </label>
      )}
      <div className="flex min-w-0 flex-col gap-1 sm:items-end">
        <span className="text-xs font-medium text-muted-foreground">Labels to print</span>
        <div className="grid w-full grid-cols-[2.5rem_minmax(4rem,1fr)_2.5rem] gap-1 sm:w-40">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-10"
            aria-label="Print one fewer label"
            disabled={quantity <= 0}
            onClick={() => update(quantity - 1)}
          >
            −
          </Button>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            max={500}
            step={1}
            value={quantity}
            onChange={(event) => update(Number(event.target.value) || 0)}
            className="h-10 min-w-0 text-center"
            aria-label={`Labels to print for ${product.name}`}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-10"
            aria-label="Print one more label"
            disabled={quantity >= 500}
            onClick={() => update(quantity + 1)}
          >
            +
          </Button>
        </div>
      </div>
    </div>
  );
}
