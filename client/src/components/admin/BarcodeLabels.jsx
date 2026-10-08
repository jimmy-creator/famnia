/**
 * Barcode label printing — pick products, choose qty + label size,
 * preview a print-ready sheet, print via the browser dialog.
 *
 * Renders Code128 barcodes via jsbarcode (SVG for the browser dialog).
 * Label sizes: small thermal roll (40×25mm), medium roll (50×30mm), the
 * shop's 60×40mm, large/jewellery (80×50mm).
 *
 * Direct USB printing draws each label onto a canvas at the printer's
 * resolution and sends it as an image: the label prints at its real size,
 * and Arabic comes out shaped correctly — sent as ESC/POS text it depends
 * on the printer's code page and usually prints as garbage.
 *
 * Print CSS hides the rest of the page and lays out labels in a
 * continuous flex-wrap grid so the same template works for both
 * single-column roll printers and Avery-style A4 sheets.
 */
import { useState, useMemo, useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import { HiPlus, HiX, HiPrinter } from 'react-icons/hi';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import {
  isSupported as thermalSupported,
  getDevice,
  requestDevice as requestPrinter,
  printLabelImages as thermalPrintLabelImages,
  RECEIPT_STORE,
} from '../../lib/thermalPrinter';
import { CURRENCY_DECIMALS, PRICE_STEP } from '../../utils/currency';

// Every label is an exact size (never grows) with equal margins on all
// sides: store name, then English | Arabic names side by side (2 lines
// each), then the barcode filling whatever height is left, then the price
// footer. padX/padY/gap/storeGap/colGap in mm, the rest in pt.
const LABEL_SIZES = [
  { id: 'small', label: '40 × 25 mm', width: 40, height: 25, padX: 2, padY: 1.5, gap: 0.7, storeGap: 0.6, colGap: 1.5, storePt: 5, namePt: 5.5, digitsPt: 5, pricePt: 8.5, wasPt: 5.5 },
  { id: 'medium', label: '50 × 30 mm', width: 50, height: 30, padX: 2.5, padY: 1.8, gap: 0.9, storeGap: 0.9, colGap: 2, storePt: 5.5, namePt: 6.5, digitsPt: 6, pricePt: 10, wasPt: 6.5 },
  { id: 'l6040', label: '60 × 40 mm', width: 60, height: 40, padX: 2.5, padY: 2, gap: 1.1, storeGap: 1.2, colGap: 2.5, storePt: 6.5, namePt: 8, digitsPt: 7, pricePt: 12, wasPt: 7.5 },
  { id: 'large', label: '80 × 50 mm', width: 80, height: 50, padX: 3, padY: 2.5, gap: 1.4, storeGap: 1.5, colGap: 3, storePt: 7.5, namePt: 10, digitsPt: 8, pricePt: 14, wasPt: 9 },
];

// Bars stretch to fill their box (preserveAspectRatio none) — scaling is
// uniform across the width, so the code still scans.
function BarcodeSvg({ value }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || !value) return;
    try {
      JsBarcode(ref.current, String(value), {
        format: 'CODE128',
        displayValue: false,
        height: 60,
        margin: 0,
        background: '#ffffff',
        lineColor: '#000000',
      });
      ref.current.setAttribute('preserveAspectRatio', 'none');
    } catch {
      /* invalid value — render empty */
    }
  }, [value]);
  return <svg ref={ref} style={{ width: '100%', height: '100%', display: 'block' }} />;
}

const round3 = (n) => Math.round(parseFloat(n) * 1000) / 1000;

// ── Label as an image, for direct USB printing ──────────────────────
// 203dpi thermal heads: 8 dots per mm. ESC/POS wants both sides in
// multiples of 8, and most heads are at most 576 dots (72mm) wide.
const DOTS_PER_MM = 8;
const MAX_DOTS = 576;
const ptToDots = (pt) => Math.round((pt * 203) / 72);
const FONT = "Arial, 'Segoe UI', 'Noto Sans Arabic', 'Geeza Pro', sans-serif";

// Lines of `text` that fit `maxWidth`, at most `maxLines` (last one ellipsised).
function wrap(ctx, text, maxWidth, maxLines) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width <= maxWidth || !cur) cur = next;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    let last = lines[maxLines - 1];
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    lines[maxLines - 1] = `${last}…`;
  }
  return lines;
}

// Same layout as <Label>, drawn at the printer's resolution.
function drawLabelCanvas(product, size, show, currency) {
  const scale = Math.min(1, MAX_DOTS / (size.width * DOTS_PER_MM));
  const W = Math.floor((size.width * DOTS_PER_MM * scale) / 8) * 8;
  const H = Math.floor((size.height * DOTS_PER_MM * scale) / 8) * 8;
  const mm = (v) => Math.round(v * DOTS_PER_MM * scale);
  const padX = mm(size.padX);
  const padY = mm(size.padY);
  const gap = mm(size.gap);
  const inner = W - padX * 2;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#000';
  ctx.textBaseline = 'top';
  const px = (pt) => Math.max(10, Math.round(ptToDots(pt) * scale));
  const font = (pt, bold) => `${bold ? 'bold ' : ''}${px(pt)}px ${FONT}`;
  const spaced = (em, pt) => { ctx.letterSpacing = `${Math.round(px(pt) * em)}px`; };

  // Top block, drawn downwards.
  let y = padY;
  if (show.store) {
    ctx.font = font(size.storePt, true);
    ctx.textAlign = 'center';
    spaced(0.12, size.storePt);
    ctx.fillText(RECEIPT_STORE.name.toUpperCase(), W / 2, y);
    spaced(0, size.storePt);
    y += px(size.storePt) + mm(size.storeGap) + gap;
  }
  // English | Arabic side by side, two lines each; the block is always two
  // lines tall so the barcode is the same height on every label.
  const en = show.name && product.name ? product.name : '';
  const ar = show.nameAr && product.nameAr ? product.nameAr : '';
  if (en || ar) {
    ctx.font = font(size.namePt, true);
    const lh = Math.round(px(size.namePt) * 1.2);
    const colW = en && ar ? (inner - mm(size.colGap)) / 2 : inner;
    if (en) {
      ctx.textAlign = 'left';
      wrap(ctx, en, colW, 2).forEach((l, i) => ctx.fillText(l, padX, y + i * lh));
    }
    if (ar) {
      ctx.direction = 'rtl';
      ctx.textAlign = 'right';
      wrap(ctx, ar, colW, 2).forEach((l, i) => ctx.fillText(l, W - padX, y + i * lh));
      ctx.direction = 'ltr';
    }
    y += lh * 2 + gap;
  }

  // Bottom block, drawn upwards from the bottom margin.
  let bottom = H - padY;
  const compare = parseFloat(product.comparePrice) > parseFloat(product.sellPrice) ? parseFloat(product.comparePrice) : null;
  if (show.price || (show.compare && compare)) {
    const baseline = bottom - Math.round(px(size.pricePt) * 0.2);
    ctx.textBaseline = 'alphabetic';
    if (show.price) {
      ctx.textAlign = 'right';
      ctx.font = font(size.pricePt, true);
      const amount = (parseFloat(product.sellPrice) || 0).toFixed(CURRENCY_DECIMALS);
      ctx.fillText(amount, W - padX, baseline);
      const aw = ctx.measureText(amount).width;
      ctx.font = font(size.pricePt * 0.62, true);
      ctx.fillText(currency, W - padX - aw - mm(0.6), baseline);
    }
    if (show.compare && compare) {
      ctx.textAlign = 'left';
      ctx.font = font(size.wasPt, false);
      const txt = `${currency} ${compare.toFixed(CURRENCY_DECIMALS)}`;
      ctx.fillText(txt, padX, baseline);
      ctx.fillRect(padX, baseline - Math.round(px(size.wasPt) * 0.3), ctx.measureText(txt).width, Math.max(2, Math.round(scale * 2)));
    }
    ctx.textBaseline = 'top';
    bottom -= px(size.pricePt) + mm(0.8);
    // Hairline over the price.
    const rule = Math.max(2, mm(0.25));
    bottom -= rule;
    ctx.fillRect(padX, bottom, inner, rule);
    bottom -= gap;
  }
  ctx.textAlign = 'center';
  if (show.sku && product.code) {
    ctx.font = font(size.digitsPt, false);
    bottom -= px(size.digitsPt);
    ctx.fillText(product.code, W / 2, bottom);
    bottom -= gap;
  }

  // Barcode fills whatever is left in the middle, with its digits under it.
  if (show.barcode) {
    const value = product.barcode || product.code || `P${product.productId}`;
    ctx.font = font(size.digitsPt, false);
    spaced(0.14, size.digitsPt);
    bottom -= px(size.digitsPt);
    ctx.fillText(value, W / 2, bottom);
    spaced(0, size.digitsPt);
    bottom -= mm(0.6);
    const barH = bottom - y;
    if (barH > 16) {
      const bc = document.createElement('canvas');
      try {
        // Whole dots per module keeps every bar the same width; 88% of the
        // inner width leaves a quiet zone either side for the scanner.
        JsBarcode(bc, value, { format: 'CODE128', displayValue: false, height: barH, width: 1, margin: 0 });
        const module = Math.max(1, Math.floor((inner * 0.88) / bc.width));
        JsBarcode(bc, value, { format: 'CODE128', displayValue: false, height: barH, width: module, margin: 0 });
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(bc, Math.round((W - bc.width) / 2), y);
      } catch {
        // Not encodable as Code128 — the digits still print.
      }
    }
  }
  return canvas;
}

function Label({ product, size, show, currency }) {
  const codeForBarcode = product.barcode || product.code || `P${product.productId}`;
  // Compare price only makes sense struck through above the selling price.
  const compare = parseFloat(product.comparePrice) > parseFloat(product.sellPrice) ? parseFloat(product.comparePrice) : null;
  const en = show.name && product.name;
  const ar = show.nameAr && product.nameAr;
  return (
    <div className="bc-label" style={{
      width: `${size.width}mm`,
      height: `${size.height}mm`,
      padding: `${size.padY}mm ${size.padX}mm`,
      gap: `${size.gap}mm`,
    }}>
      {show.store && (
        <div className="bc-store" style={{ fontSize: `${size.storePt}pt`, marginBottom: `${size.storeGap}mm` }}>
          {RECEIPT_STORE.name}
        </div>
      )}
      {(en || ar) && (
        <div className="bc-names" style={{ gridTemplateColumns: en && ar ? '1fr 1fr' : '1fr', columnGap: `${size.colGap}mm` }}>
          {en && <div className="bc-name" style={{ fontSize: `${size.namePt}pt` }}>{product.name}</div>}
          {ar && <div className="bc-name-ar" dir="rtl" style={{ fontSize: `${size.namePt}pt` }}>{product.nameAr}</div>}
        </div>
      )}
      {show.barcode ? (
        <div className="bc-bars">
          <div className="bc-bars-svg"><BarcodeSvg value={codeForBarcode} /></div>
          <div className="bc-digits" style={{ fontSize: `${size.digitsPt}pt` }}>{codeForBarcode}</div>
        </div>
      ) : <div style={{ flex: 1 }} />}
      {show.sku && product.code && (
        <div className="bc-sku" style={{ fontSize: `${size.digitsPt}pt` }}>
          {product.code}
        </div>
      )}
      {(show.price || (show.compare && compare)) && (
        <div className="bc-foot">
          {show.compare && compare && (
            <span className="bc-compare" style={{ fontSize: `${size.wasPt}pt` }}>
              {currency} {compare.toFixed(CURRENCY_DECIMALS)}
            </span>
          )}
          {show.price && (
            <span className="bc-price" style={{ fontSize: `${size.pricePt}pt` }}>
              <small>{currency}</small>{(parseFloat(product.sellPrice) || 0).toFixed(CURRENCY_DECIMALS)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default function BarcodeLabels({ currency = 'KWD' }) {
  const [allProducts, setAllProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [queue, setQueue] = useState([]);                // [{ productId, name, code, price, qty }]
  const [sizeId, setSizeId] = useState('l6040');
  const [layout, setLayout] = useState('roll');   // 'roll' (one per row, label-printer) | 'sheet' (multi-col, A4)
  const [show, setShow] = useState({ store: true, name: true, nameAr: true, barcode: true, compare: true, price: true, sku: false });
  const searchRef = useRef(null);
  const queueRef = useRef(null);
  const scrollToRow = useRef(null);   // productId to bring into view after the next render

  // A long queue: keep the product just added/scanned on screen.
  useEffect(() => {
    if (scrollToRow.current == null) return;
    queueRef.current?.querySelector(`[data-row="${scrollToRow.current}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    scrollToRow.current = null;
  }, [queue]);

  useEffect(() => {
    api.get('/products/admin/all?limit=10000')
      .then((r) => setAllProducts(r.data.products || []))
      .catch(() => {});
  }, []);

  const hits = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return allProducts
      .filter((p) => p.name?.toLowerCase().includes(q) || p.code?.toLowerCase().includes(q) || p.barcode?.toLowerCase().includes(q))
      .slice(0, 8);
  }, [search, allProducts]);

  const addProduct = (p) => {
    scrollToRow.current = p.id;
    setQueue((prev) => {
      const idx = prev.findIndex((q) => q.productId === p.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: next[idx].qty + 1 };
        return next;
      }
      // sellPrice is the shop price printed on the sticker; it starts at the
      // current selling price and may be set higher or lower.
      return [...prev, {
        productId: p.id, name: p.name, nameAr: p.nameAr, code: p.code, barcode: p.barcode,
        price: p.price, comparePrice: p.comparePrice, qty: 1,
        sellPrice: (parseFloat(p.price) || 0).toFixed(CURRENCY_DECIMALS),
      }];
    });
    setSearch('');
    searchRef.current?.focus();
  };

  // Scanner: types the barcode then Enter. An exact barcode/code match is
  // added straight away (+1 label each scan); otherwise a lone search hit.
  const onSearchKey = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const q = search.trim().toLowerCase();
    if (!q) return;
    const exact = allProducts.find((p) => p.barcode?.toLowerCase() === q)
      || allProducts.find((p) => p.code?.toLowerCase() === q);
    if (exact) addProduct(exact);
    else if (hits.length === 1) addProduct(hits[0]);
    else if (hits.length === 0) { toast.error(`No product for "${search.trim()}"`); setSearch(''); }
  };
  const setQty = (i, q) => setQueue((prev) => {
    const next = [...prev];
    next[i] = { ...next[i], qty: Math.max(1, parseInt(q || 1, 10)) };
    return next;
  });
  const removeRow = (i) => setQueue((prev) => prev.filter((_, idx) => idx !== i));
  const setRow = (i, patch) => setQueue((prev) => {
    const next = [...prev];
    next[i] = { ...next[i], ...patch };
    return next;
  });
  // Rows whose sticker price differs from what the product is sold at now —
  // these get saved to the product before printing so the POS and website
  // charge exactly what the sticker says.
  const priceChanges = show.price ? queue.filter((q) => round3(q.sellPrice) !== round3(q.price)) : [];

  const applyPrices = async () => {
    if (!show.price) return true;
    const bad = queue.find((q) => !(round3(q.sellPrice) > 0));
    if (bad) {
      toast.error(`${bad.name}: enter a selling price above 0`);
      return false;
    }
    // A compare price at or below the new price would show online as a
    // struck-through "discount" that isn't one, so it is cleared.
    const patchFor = (q) => {
      const price = round3(q.sellPrice);
      return parseFloat(q.comparePrice) > price ? { price } : { price, comparePrice: null };
    };
    try {
      for (const q of priceChanges) {
        await api.put(`/products/${q.productId}`, patchFor(q));
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not update prices — nothing printed');
      return false;
    }
    if (priceChanges.length) {
      const saved = new Map(priceChanges.map((q) => [q.productId, patchFor(q)]));
      setQueue((prev) => prev.map((q) => (saved.has(q.productId) ? { ...q, ...saved.get(q.productId) } : q)));
      setAllProducts((prev) => prev.map((p) => (saved.has(p.id) ? { ...p, ...saved.get(p.id) } : p)));
      toast.success(`Selling price updated for ${priceChanges.length} product${priceChanges.length === 1 ? '' : 's'}`);
    }
    return true;
  };

  const size = LABEL_SIZES.find((s) => s.id === sizeId);
  const totalLabels = queue.reduce((s, q) => s + q.qty, 0);

  // Flatten queue into one entry per label for the preview.
  const flatLabels = useMemo(() => {
    const out = [];
    for (const q of queue) {
      for (let i = 0; i < q.qty; i += 1) out.push(q);
    }
    return out;
  }, [queue]);

  const doPrint = async () => {
    if (!(await applyPrices())) return;
    setTimeout(() => window.print(), 100);
  };

  const [usbReady, setUsbReady] = useState(false);
  const [usbBusy, setUsbBusy] = useState(false);
  useEffect(() => {
    if (!thermalSupported()) { setUsbReady(false); return; }
    getDevice('barcode')
      .then((h) => setUsbReady(!!h))
      .catch(() => setUsbReady(false));
  }, []);

  const doPair = async () => {
    try {
      const handle = await requestPrinter('barcode');
      setUsbReady(true);
      toast.success(`Paired: ${handle.device.productName || 'label printer'}`);
    } catch (err) {
      if (err?.name !== 'NotFoundError') {
        toast.error(err.message || 'Pairing cancelled');
      }
    }
  };

  const doUsbPrint = async () => {
    if (!(await applyPrices())) return;
    setUsbBusy(true);
    try {
      const images = flatLabels.map((q) => drawLabelCanvas(q, size, show, currency));
      await thermalPrintLabelImages(images);
      toast.success(`Sent ${images.length} labels to printer`);
    } catch (err) {
      toast.error(err.message || 'Direct print failed');
    } finally {
      setUsbBusy(false);
    }
  };

  return (
    <div className="admin-section">
      <div className="admin-section-header">
        <h2>Barcode Labels</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          {thermalSupported() && !usbReady && (
            <button className="btn btn-secondary" onClick={doPair}>
              <HiPrinter /> Connect label printer
            </button>
          )}
          {usbReady && (
            <button className="btn btn-primary" disabled={queue.length === 0 || usbBusy} onClick={doUsbPrint}>
              <HiPrinter /> {usbBusy ? 'Sending…' : `USB · ${totalLabels} label${totalLabels === 1 ? '' : 's'}`}
            </button>
          )}
          <button className="btn btn-secondary" disabled={queue.length === 0} onClick={doPrint}>
            <HiPrinter /> Browser print
          </button>
        </div>
      </div>

      {/* Options panel */}
      <div className="bc-options no-print">
        <div>
          <label style={lblStyle}>Label size</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {LABEL_SIZES.map((s) => (
              <button key={s.id} onClick={() => setSizeId(s.id)}
                style={{
                  padding: '0.5rem 0.85rem', fontSize: '0.85rem',
                  background: sizeId === s.id ? 'var(--bg-dark)' : 'var(--bg-card)',
                  color: sizeId === s.id ? 'var(--text-inverse)' : 'var(--text)',
                  border: '1px solid var(--border-light)', borderRadius: 8,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label style={lblStyle}>Layout</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {[
              { id: 'roll', label: 'Roll (1 per row)' },
              { id: 'sheet', label: 'Sheet (A4)' },
            ].map((l) => (
              <button key={l.id} onClick={() => setLayout(l.id)}
                style={{
                  padding: '0.5rem 0.85rem', fontSize: '0.85rem',
                  background: layout === l.id ? 'var(--bg-dark)' : 'var(--bg-card)',
                  color: layout === l.id ? 'var(--text-inverse)' : 'var(--text)',
                  border: '1px solid var(--border-light)', borderRadius: 8,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>
                {l.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label style={lblStyle}>Show on label</label>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: '0.85rem' }}>
            {[
              { key: 'store', label: 'Store name' },
              { key: 'name', label: 'Product name' },
              { key: 'nameAr', label: 'Arabic name' },
              { key: 'barcode', label: 'Barcode' },
              { key: 'compare', label: 'Compare price' },
              { key: 'price', label: 'Selling price' },
              { key: 'sku', label: 'SKU' },
            ].map((c) => (
              <label key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input
                  type="checkbox" checked={show[c.key]}
                  onChange={(e) => setShow({ ...show, [c.key]: e.target.checked })}
                />
                {c.label}
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Product picker */}
      <div className="bc-picker no-print">
        <label style={lblStyle}>Add products</label>
        <input
          ref={searchRef}
          autoFocus
          placeholder="Scan a barcode, or search by name or SKU…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={onSearchKey}
          style={{ width: '100%' }}
        />
        {hits.length > 0 && (
          <div className="bc-hits">
            {hits.map((p) => (
              <button key={p.id} className="bc-hit" onClick={() => addProduct(p)}>
                <span>{p.name}</span>
                <span style={{ color: 'var(--text-light)', fontSize: 12 }}>
                  {p.code || `#${p.id}`} · {currency} {parseFloat(p.price || 0).toFixed(CURRENCY_DECIMALS)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Queue */}
      <div className="bc-queue no-print" ref={queueRef}>
        {queue.length === 0 && (
          <p style={{ color: 'var(--text-light)', padding: '1rem 0' }}>
            Scan barcodes or search products above to queue them — each scan adds one label. Each row's qty is how many labels of that product will print.
          </p>
        )}
        {queue.map((q, i) => (
          <div key={i} className="bc-queue-row" data-row={q.productId}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 500 }}>{q.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-light)', fontFamily: 'monospace' }}>
                {q.code || `#${q.productId}`}
              </div>
            </div>
            {show.price && (
              <label className="bc-price-input">Selling price ({currency})
                <input type="number" step={PRICE_STEP} min={0} value={q.sellPrice}
                  onChange={(e) => setRow(i, { sellPrice: e.target.value })} />
              </label>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button onClick={() => setQty(i, q.qty - 1)} className="qty-btn">−</button>
              <input
                type="number" min={1} value={q.qty}
                onChange={(e) => setQty(i, e.target.value)}
                style={{ width: 60, textAlign: 'center' }}
              />
              <button onClick={() => setQty(i, q.qty + 1)} className="qty-btn">+</button>
            </div>
            <button onClick={() => removeRow(i)} className="qty-btn qty-btn-x"><HiX size={14} /></button>
          </div>
        ))}
        {queue.length > 0 && (
          <button onClick={() => setQueue([])} className="link-btn" style={{ marginTop: '0.5rem' }}>
            Clear all
          </button>
        )}
        {priceChanges.length > 0 && (
          <p className="bc-price-notice">
            Printing will change the selling price of {priceChanges.length} product{priceChanges.length === 1 ? '' : 's'} to
            the sticker price — the POS and website will charge it from then on.
          </p>
        )}
      </div>

      {/* Preview (also the print target) */}
      {queue.length > 0 && (
        <>
          <h3 className="no-print" style={{ marginTop: '1.5rem' }}>Preview</h3>
          <div id="bc-print-area" className={`bc-layout-${layout}`} data-w={size.width}>
            {flatLabels.map((q, i) => (
              <Label key={i} product={q} size={size} show={show} currency={currency} />
            ))}
          </div>
        </>
      )}

      <style>{`
        .bc-options {
          display: flex; gap: 1.5rem; flex-wrap: wrap;
          padding: 1rem; background: var(--surface-alt, #f8f9fa);
          border-radius: 8px; margin-bottom: 1rem;
        }
        .bc-picker { margin-bottom: 1rem; position: relative; }
        .bc-hits {
          background: white; border: 1px solid var(--border-light);
          border-radius: 6px; margin-top: 4px;
          max-height: 240px; overflow-y: auto;
        }
        .bc-hit {
          display: flex; justify-content: space-between; width: 100%;
          padding: 0.55rem 0.8rem;
          background: transparent; border: none; border-bottom: 1px solid var(--border-light);
          cursor: pointer; text-align: left; font-family: inherit;
        }
        .bc-hit:last-child { border-bottom: none; }
        .bc-hit:hover { background: var(--bg-warm, #f5f1e8); }
        .bc-queue-row {
          display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;
          padding: 0.6rem 0.8rem;
          border: 1px solid var(--border-light);
          border-radius: 8px; margin-bottom: 6px;
          background: var(--bg-card);
        }
        .qty-btn {
          width: 28px; height: 28px;
          border: 1px solid var(--border-light); background: var(--bg-card);
          border-radius: 6px; cursor: pointer; display: grid; place-items: center;
          font-family: inherit;
        }
        .qty-btn:hover { background: var(--bg-warm, #f5f1e8); }
        .qty-btn-x { color: var(--danger); }
        .bc-price-input { display: flex; flex-direction: column; font-size: 11px; color: var(--text-light); gap: 2px; }
        .bc-price-input input { width: 100px; }
        .bc-price-notice {
          margin-top: 0.75rem; padding: 0.6rem 0.8rem; font-size: 0.85rem;
          border: 1px solid var(--border-light); border-left: 3px solid var(--copper);
          border-radius: 6px; background: var(--bg-card);
        }
        /* Preview area on screen */
        #bc-print-area {
          margin-top: 0.5rem;
          padding: 8px; background: #e5e7eb; border-radius: 6px;
        }
        #bc-print-area.bc-layout-sheet { display: flex; flex-wrap: wrap; gap: 2mm; }
        #bc-print-area.bc-layout-roll { display: flex; flex-direction: column; gap: 1mm; align-items: flex-start; }
        .bc-label {
          background: white; color: black;
          border: 1px solid #cbd5e1;
          display: flex; flex-direction: column;
          font-family: Arial, 'Segoe UI', 'Noto Sans Arabic', 'Geeza Pro', sans-serif;
          overflow: hidden; box-sizing: border-box;
          page-break-inside: avoid;
        }
        .bc-store {
          font-weight: 700; text-align: center; text-transform: uppercase;
          letter-spacing: 0.12em; line-height: 1;
        }
        /* English | Arabic side by side, top-aligned, always two lines tall */
        .bc-names { display: grid; align-items: start; }
        .bc-name, .bc-name-ar {
          font-weight: 700; line-height: 1.2; height: 2.4em;
          overflow: hidden; overflow-wrap: anywhere; display: -webkit-box;
          -webkit-line-clamp: 2; -webkit-box-orient: vertical;
        }
        .bc-name { text-align: left; }
        .bc-name-ar { text-align: right; direction: rtl; }
        .bc-bars { flex: 1 1 0; min-height: 0; display: grid; grid-template-rows: 1fr auto; justify-items: center; }
        .bc-bars-svg { width: 88%; min-height: 0; }
        .bc-digits { text-align: center; letter-spacing: 0.14em; line-height: 1; margin-top: 0.6mm; font-variant-numeric: tabular-nums; }
        .bc-sku { text-align: center; letter-spacing: 0.5px; line-height: 1; }
        .bc-foot {
          display: flex; justify-content: space-between; align-items: baseline; gap: 2mm;
          border-top: 0.25mm solid #000; padding-top: 0.8mm; line-height: 1;
        }
        .bc-compare { text-decoration: line-through; white-space: nowrap; }
        .bc-price { font-weight: 700; white-space: nowrap; margin-left: auto; font-variant-numeric: tabular-nums; }
        .bc-price small { font-size: 0.62em; font-weight: 700; margin-right: 0.6mm; letter-spacing: 0.04em; }

        @media print {
          body * { visibility: hidden !important; }
          #bc-print-area, #bc-print-area * { visibility: visible !important; }
          #bc-print-area {
            position: absolute !important; left: 0 !important; top: 0 !important;
            padding: 0 !important; margin: 0 !important;
            background: white !important; border: none !important;
          }
          .bc-label {
            border: none !important;
            margin: 0 !important;
            page-break-inside: avoid;
          }
          .no-print { display: none !important; }

          /* Sheet layout — multi-column on a normal A4 / Letter page */
          #bc-print-area.bc-layout-sheet {
            display: flex !important; flex-wrap: wrap !important; gap: 0 !important;
          }

          /* Roll layout — one label per "page", paper size = label size */
          #bc-print-area.bc-layout-roll {
            display: block !important;
          }
          .bc-layout-roll .bc-label {
            page-break-after: always !important;
            break-after: page !important;
          }
          .bc-layout-roll .bc-label:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }
        }
        /* Per-size @page sizing for roll printers. The roll @page rule
           narrows the print area to one label; the printer driver
           feeds one label per page. Sheet layout uses default @page. */
        @media print {
          .bc-layout-roll[data-w="40"] ~ * { display: none; }
        }
        @page bc-roll-40 { size: 40mm 25mm; margin: 0; }
        @page bc-roll-50 { size: 50mm 30mm; margin: 0; }
        @page bc-roll-60 { size: 60mm 40mm; margin: 0; }
        @page bc-roll-80 { size: 80mm 50mm; margin: 0; }
        @media print {
          .bc-layout-roll[data-w="40"] { page: bc-roll-40; }
          .bc-layout-roll[data-w="50"] { page: bc-roll-50; }
          .bc-layout-roll[data-w="60"] { page: bc-roll-60; }
          .bc-layout-roll[data-w="80"] { page: bc-roll-80; }
          .bc-layout-sheet { page: auto; }
        }
      `}</style>
    </div>
  );
}

const lblStyle = { display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 6, color: 'var(--text-light)' };
