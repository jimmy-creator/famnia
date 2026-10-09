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
  DEFAULT_SHEET,
  FOUR_BY_SIX_LABEL,
  STICKER_CSS,
  printBarcodeLabels,
  printSingleTestLabel,
  sheetGrid,
  stickerHtml,
} from '@/hub/lib/barcodes';
import { QAR } from '@/hub/lib/format';

const PRINT_SETTINGS_KEY = 'femnia-barcode-label-presets-v1';
const FORMATS = ['thermal-30x20', 'thermal-4x6', 'a4', 'custom', 'shop'];
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
          shopSizeId, shopLayout, shopShow,
        }),
      );
    } catch {
      /* storage unavailable — settings last for this session only */
    }
  }, [format, showPrice, customWidthMm, customHeightMm, thermalSmallWidthMm, thermalSmallHeightMm, thermalSmallShiftXMm, thermalSmallShiftYMm, shopSizeId, shopLayout, shopShow]);

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
  const results = useMemo(() => {
    const term = search.trim().toLowerCase();
    return productsInBatch
      .filter((product) =>
        term
          ? [product.productCode ?? '', product.sku, product.name, product.color ?? ''].some((value) =>
              value.toLowerCase().includes(term),
            )
          : true,
      )
      .slice(0, 60);
  }, [productsInBatch, search]);

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
  const pageCount =
    format === 'a4' ? Math.max(1, Math.ceil(stickers.length / grid.perPage)) : Math.max(1, stickers.length);
  const preview = stickers[0];
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
      printBarcodeLabels(stickers, format, customSize, thermalSmallSize, thermalSmallShift);
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
      printSingleTestLabel(preview, format, customSize, thermalSmallSize, thermalSmallShift);
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
          <div>
            <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
              Find products by Product Code, SKU, name or colour
            </Label>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,auto)_auto]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="0001, SKU, name or colour"
                  className="h-11 pl-9"
                />
              </div>
              <select
                value={batch}
                onChange={(event) => setBatch(event.target.value)}
                aria-label="Filter products by batch"
                className="h-11 min-w-0 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="__all__">All recorded batches</option>
                {batchOptions.map((label) => (
                  <option key={label} value={label}>
                    {label}
                  </option>
                ))}
              </select>
              <Button type="button" variant="outline" className="h-11" disabled={batch === '__all__'} onClick={selectAllInBatch}>
                Select all in batch
              </Button>
            </div>
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">{results.length} product(s) listed</p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" className="h-9" onClick={selectAll}>
                  Select all listed
                </Button>
                <Button type="button" variant="outline" size="sm" className="h-9" disabled={chosen.length === 0} onClick={resetToStock}>
                  Reset to available stock
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-9" onClick={() => setSelected({})}>
                  Clear
                </Button>
              </div>
            </div>
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-border p-2">
              {results.length === 0 && (
                <p className="p-3 text-sm text-muted-foreground">No active product with a Product Code matches.</p>
              )}
              {results.map((product) => (
                <label
                  key={product.key}
                  className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-secondary/60"
                >
                  <input
                    type="checkbox"
                    checked={Boolean(selected[product.key])}
                    onChange={() => toggle(product.key)}
                    className="size-4"
                  />
                  <span className="font-mono text-xs text-primary">{product.productCode}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{product.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      Stock {availableStock(product)} · {product.sku}
                      {product.color ? ` · ${product.color}` : ''}
                    </span>
                  </span>
                </label>
              ))}
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
                  : `One label per page. ${stickers.length} total across ${pageCount} page${pageCount === 1 ? '' : 's'}.`}
            </p>
            <p className="mt-2 text-xs font-medium text-foreground">In the print dialog, set margins to None and scale to 100%.</p>
          </div>

          <div className="rounded-xl border border-border p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Live label preview</p>
            <style>{shop ? SHOP_LABEL_CSS : STICKER_CSS(labelSize)}</style>
            <div className="flex min-h-44 items-center justify-center overflow-hidden rounded-md bg-secondary/50 p-4">
              {shop ? (
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
              Preview enlarged on screen. Printing uses exact physical dimensions and never changes inventory.
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
