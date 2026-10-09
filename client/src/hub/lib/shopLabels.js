/**
 * Shop shelf labels — the classic label designer's layout, merged into the
 * hub's Print Barcodes dialog: store name, English | Arabic names side by
 * side, a Code 128 barcode filling the middle, optional SKU, then the price
 * footer with the struck-through compare-at price. Exact physical sizes,
 * printed through the browser (roll: one label per page; sheet: A4 grid) or
 * straight to a USB thermal printer as an image (Arabic shapes correctly).
 */
import JsBarcode from 'jsbarcode';

import { RECEIPT_STORE } from '@/lib/thermalPrinter';
import { CURRENCY_DECIMALS } from '@/utils/currency';
import { openPrintWindow } from './barcodes';

// padX/padY/gap/storeGap/colGap in mm, the rest in pt.
export const SHOP_LABEL_SIZES = [
  { id: 'small', label: '40 × 25 mm', width: 40, height: 25, padX: 2, padY: 1.5, gap: 0.7, storeGap: 0.6, colGap: 1.5, storePt: 5, namePt: 5.5, digitsPt: 5, pricePt: 8.5, wasPt: 5.5 },
  { id: 'medium', label: '50 × 30 mm', width: 50, height: 30, padX: 2.5, padY: 1.8, gap: 0.9, storeGap: 0.9, colGap: 2, storePt: 5.5, namePt: 6.5, digitsPt: 6, pricePt: 10, wasPt: 6.5 },
  { id: 'l6040', label: '60 × 40 mm', width: 60, height: 40, padX: 2.5, padY: 2, gap: 1.1, storeGap: 1.2, colGap: 2.5, storePt: 6.5, namePt: 8, digitsPt: 7, pricePt: 12, wasPt: 7.5 },
  { id: 'large', label: '80 × 50 mm', width: 80, height: 50, padX: 3, padY: 2.5, gap: 1.4, storeGap: 1.5, colGap: 3, storePt: 7.5, namePt: 10, digitsPt: 8, pricePt: 14, wasPt: 9 },
];

export const SHOP_SHOW_DEFAULT = { store: true, name: true, nameAr: true, barcode: true, compare: true, price: true, sku: false };

export const SHOP_SHOW_OPTIONS = [
  ['store', 'Store name'],
  ['name', 'Product name'],
  ['nameAr', 'Arabic name'],
  ['barcode', 'Barcode'],
  ['compare', 'Compare price'],
  ['price', 'Selling price'],
  ['sku', 'SKU'],
];

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const fixed = (n) => (parseFloat(n) || 0).toFixed(CURRENCY_DECIMALS);
/** Compare-at only makes sense struck through above the selling price. */
const compareOf = (item) => (parseFloat(item.comparePrice) > parseFloat(item.sellPrice) ? parseFloat(item.comparePrice) : null);
const barcodeValue = (item) => item.barcode || item.code;

function barsSvg(value) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  try {
    JsBarcode(svg, String(value), { format: 'CODE128', displayValue: false, height: 60, margin: 0, background: '#ffffff', lineColor: '#000000' });
  } catch {
    return '';
  }
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('style', 'width:100%;height:100%;display:block');
  return svg.outerHTML;
}

/** One label's HTML (the same markup the preview and the print window use). */
export function shopLabelHtml(item, size, show, currency) {
  const compare = compareOf(item);
  const en = show.name && item.name;
  const ar = show.nameAr && item.nameAr;
  const value = barcodeValue(item);
  return `<div class="bc-label" style="width:${size.width}mm;height:${size.height}mm;padding:${size.padY}mm ${size.padX}mm;gap:${size.gap}mm">
    ${show.store ? `<div class="bc-store" style="font-size:${size.storePt}pt;margin-bottom:${size.storeGap}mm">${esc(RECEIPT_STORE.name)}</div>` : ''}
    ${en || ar ? `<div class="bc-names" style="grid-template-columns:${en && ar ? '1fr 1fr' : '1fr'};column-gap:${size.colGap}mm">
      ${en ? `<div class="bc-name" style="font-size:${size.namePt}pt">${esc(item.name)}</div>` : ''}
      ${ar ? `<div class="bc-name-ar" dir="rtl" style="font-size:${size.namePt}pt">${esc(item.nameAr)}</div>` : ''}
    </div>` : ''}
    ${show.barcode && value ? `<div class="bc-bars"><div class="bc-bars-svg">${barsSvg(value)}</div>
      <div class="bc-digits" style="font-size:${size.digitsPt}pt">${esc(value)}</div></div>` : '<div style="flex:1"></div>'}
    ${show.sku && item.code ? `<div class="bc-sku" style="font-size:${size.digitsPt}pt">${esc(item.code)}</div>` : ''}
    ${show.price || (show.compare && compare) ? `<div class="bc-foot">
      ${show.compare && compare ? `<span class="bc-compare" style="font-size:${size.wasPt}pt">${esc(currency)} ${compare.toFixed(CURRENCY_DECIMALS)}</span>` : ''}
      ${show.price ? `<span class="bc-price" style="font-size:${size.pricePt}pt"><small>${esc(currency)}</small>${fixed(item.sellPrice)}</span>` : ''}
    </div>` : ''}
  </div>`;
}

export const SHOP_LABEL_CSS = `
  .bc-label { background:#fff; color:#000; display:flex; flex-direction:column; overflow:hidden; box-sizing:border-box;
    font-family: Arial, 'Segoe UI', 'Noto Sans Arabic', 'Geeza Pro', sans-serif; page-break-inside: avoid; }
  .bc-store { font-weight:700; text-align:center; text-transform:uppercase; letter-spacing:0.12em; line-height:1; }
  .bc-names { display:grid; align-items:start; }
  .bc-name, .bc-name-ar { font-weight:700; line-height:1.2; height:2.4em; overflow:hidden; overflow-wrap:anywhere;
    display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
  .bc-name { text-align:left; }
  .bc-name-ar { text-align:right; direction:rtl; }
  .bc-bars { flex:1 1 0; min-height:0; display:grid; grid-template-rows:1fr auto; justify-items:center; }
  .bc-bars-svg { width:88%; min-height:0; }
  .bc-digits { text-align:center; letter-spacing:0.14em; line-height:1; margin-top:0.6mm; font-variant-numeric:tabular-nums; }
  .bc-sku { text-align:center; letter-spacing:0.5px; line-height:1; }
  .bc-foot { display:flex; justify-content:space-between; align-items:baseline; gap:2mm; border-top:0.25mm solid #000;
    padding-top:0.8mm; line-height:1; }
  .bc-compare { text-decoration:line-through; white-space:nowrap; }
  .bc-price { font-weight:700; white-space:nowrap; margin-left:auto; font-variant-numeric:tabular-nums; }
  .bc-price small { font-size:0.62em; font-weight:700; margin-right:0.6mm; letter-spacing:0.04em; }
`;

/** Browser print: roll = one label per page at the label size; sheet = A4 flow. */
export function printShopLabels(items, size, layout, show, currency) {
  if (!items.length) throw new Error('Select at least one product and enter a quantity above zero.');
  const labels = items.map((item) => shopLabelHtml(item, size, show, currency));
  const roll = layout === 'roll';
  const body = roll
    ? labels.map((l) => `<div class="roll-page">${l}</div>`).join('')
    : `<div class="sheet">${labels.join('')}</div>`;
  openPrintWindow(`<!doctype html>
<html><head><meta charset="utf-8"><title>FEMNIA Shop Labels</title>
<style>
  @page { ${roll ? `size: ${size.width}mm ${size.height}mm;` : 'size: A4;'} margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; }
  ${SHOP_LABEL_CSS}
  .roll-page { width:${size.width}mm; height:${size.height}mm; page-break-after: always; break-after: page; }
  .roll-page:last-child { page-break-after: auto; break-after: auto; }
  .sheet { display:flex; flex-wrap:wrap; gap:0; }
</style></head><body>${body}</body></html>`);
}

// ── Direct USB printing: each label drawn at the printer's resolution ────
// 203 dpi heads: 8 dots per mm; ESC/POS wants multiples of 8, at most 576 wide.
const DOTS_PER_MM = 8;
const MAX_DOTS = 576;
const ptToDots = (pt) => Math.round((pt * 203) / 72);
const FONT = "Arial, 'Segoe UI', 'Noto Sans Arabic', 'Geeza Pro', sans-serif";

function wrap(ctx, text, maxWidth, maxLines) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width <= maxWidth || !cur) cur = next;
    else {
      lines.push(cur);
      cur = w;
    }
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

/** The same layout as shopLabelHtml, as a canvas for printLabelImages(). */
export function drawShopLabelCanvas(item, size, show, currency) {
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
  const spaced = (em, pt) => {
    ctx.letterSpacing = `${Math.round(px(pt) * em)}px`;
  };

  let y = padY;
  if (show.store) {
    ctx.font = font(size.storePt, true);
    ctx.textAlign = 'center';
    spaced(0.12, size.storePt);
    ctx.fillText(RECEIPT_STORE.name.toUpperCase(), W / 2, y);
    spaced(0, size.storePt);
    y += px(size.storePt) + mm(size.storeGap) + gap;
  }
  const en = show.name && item.name ? item.name : '';
  const ar = show.nameAr && item.nameAr ? item.nameAr : '';
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

  let bottom = H - padY;
  const compare = compareOf(item);
  if (show.price || (show.compare && compare)) {
    const baseline = bottom - Math.round(px(size.pricePt) * 0.2);
    ctx.textBaseline = 'alphabetic';
    if (show.price) {
      ctx.textAlign = 'right';
      ctx.font = font(size.pricePt, true);
      const amount = fixed(item.sellPrice);
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
    const rule = Math.max(2, mm(0.25));
    bottom -= rule;
    ctx.fillRect(padX, bottom, inner, rule);
    bottom -= gap;
  }
  ctx.textAlign = 'center';
  if (show.sku && item.code) {
    ctx.font = font(size.digitsPt, false);
    bottom -= px(size.digitsPt);
    ctx.fillText(item.code, W / 2, bottom);
    bottom -= gap;
  }
  const value = barcodeValue(item);
  if (show.barcode && value) {
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
        // Whole dots per module keeps every bar the same width; 88% leaves a quiet zone.
        JsBarcode(bc, value, { format: 'CODE128', displayValue: false, height: barH, width: 1, margin: 0 });
        const module = Math.max(1, Math.floor((inner * 0.88) / bc.width));
        JsBarcode(bc, value, { format: 'CODE128', displayValue: false, height: barH, width: module, margin: 0 });
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(bc, Math.round((W - bc.width) / 2), y);
      } catch {
        // Not encodable as Code 128 — the digits still print.
      }
    }
  }
  return canvas;
}
