/** Code 128 helpers for read-only product label printing. */
import JsBarcode from 'jsbarcode';

export const SMALL_LABEL = { widthMm: 30, heightMm: 20 };
export const FOUR_BY_SIX_LABEL = { widthMm: 100, heightMm: 150 };
export const DEFAULT_STICKER = SMALL_LABEL;

export const DEFAULT_SHEET = {
  pageWidthMm: 210,
  pageHeightMm: 297,
  marginMm: 0,
  gapXMm: 0,
  gapYMm: 0,
  guides: true,
};

/**
 * A4 adhesive sheet (WP-5165 / L7651 layout): 5 × 13 = 65 labels of 38.1 × 21.2 mm.
 * Side margin (210 − 5 × 38.1 − 4 × 2.5) / 2 = 4.75 mm; top margin (297 − 13 × 21.2) / 2 = 10.7 mm.
 */
export const A4_LABEL = { widthMm: 38.1, heightMm: 21.2 };
export const A4_LABEL_SHEET = { columns: 5, rows: 13, perPage: 65, leftMm: 4.75, topMm: 10.7, gapXMm: 2.5 };

/** Renders a Code 128 SVG. Width 1 is at least 0.25 mm at printed label scale. */
export function barcodeSvg(value, size, bars = {}) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  JsBarcode(svg, value, {
    format: 'CODE128',
    displayValue: false,
    margin: 0,
    marginLeft: 4,
    marginRight: 4,
    height: size.widthMm <= 30 ? 34 : 70,
    width: size.widthMm <= 30 ? 1 : 2,
    ...bars,
  });
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('style', 'width:100%;height:100%;display:block');
  return svg.outerHTML;
}

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);

/** Product name, exact stored colour, one Code 128 barcode, then code and optional price. */
export function stickerHtml(item, size, contentShift) {
  const shiftStyle = contentShift ? ` style="transform:translate(${contentShift.xMm}mm, ${contentShift.yMm}mm)"` : '';
  return `
    <div class="sticker-inner"${shiftStyle}>
      <div class="sticker-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div>
      <div class="sticker-color" title="Color: ${escapeHtml(item.variant)}">Color: ${escapeHtml(item.variant)}</div>
      <div class="sticker-barcode">${barcodeSvg(item.productCode, size)}</div>
      <div class="sticker-bottom">
        <span class="sticker-code">${escapeHtml(item.productCode)}</span>
        ${item.price ? `<span class="sticker-price">${escapeHtml(item.price)}</span>` : ''}
      </div>
    </div>`;
}

export const STICKER_CSS = (size) => {
  const compact = size.widthMm <= 30 && size.heightMm <= 20;
  return `
  .sticker {
    width: ${size.widthMm}mm;
    height: ${size.heightMm}mm;
    box-sizing: border-box;
    padding: ${compact ? '0.8mm' : '5mm'};
    overflow: hidden;
    background: #fff;
    color: #000;
    font-family: Arial, Helvetica, sans-serif;
  }
  .sticker-inner {
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr) auto;
    height: 100%;
    min-height: 0;
    text-align: center;
  }
  .sticker-name {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: ${compact ? '6pt' : '12pt'};
    font-weight: 700;
    line-height: 1.15;
  }
  .sticker-color {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: ${compact ? '6pt' : '11pt'};
    line-height: 1.1;
  }
  .sticker-barcode {
    min-height: 0;
    padding: ${compact ? '0.35mm 0' : '3mm 0'};
    overflow: hidden;
  }
  .sticker-barcode svg { width: 100%; height: 100%; display: block; }
  .sticker-bottom {
    display: flex;
    justify-content: center;
    align-items: baseline;
    gap: ${compact ? '1.5mm' : '5mm'};
    min-width: 0;
    font-size: ${compact ? '6pt' : '14pt'};
    font-weight: 700;
    line-height: 1;
  }
  .sticker-code { letter-spacing: 0; }
  .sticker-price { white-space: nowrap; }
`;
};

/** One 38.1 × 21.2 mm label: name, size, colour, barcode, code (+ price). Empty size/colour lines are left out. */
function a4LabelHtml(item, svgFor) {
  return `<div class="a4l">
      <div class="a4l-name">${escapeHtml(item.name)}</div>
      ${item.size ? `<div class="a4l-line">Size: ${escapeHtml(item.size)}</div>` : ''}
      ${item.variant ? `<div class="a4l-line">Color: ${escapeHtml(item.variant)}</div>` : ''}
      <div class="a4l-barcode">${svgFor(item.productCode)}</div>
      <div class="a4l-bottom">
        <span>${escapeHtml(item.productCode)}</span>
        ${item.price ? `<span>${escapeHtml(item.price)}</span>` : ''}
      </div>
    </div>`;
}

/**
 * One physical A4 sheet holding up to 65 labels, filled row by row from the top left.
 * `shift` nudges the whole grid for printers that feed slightly off; `blanks` pads the
 * grid with empty cells (used by the on-screen preview).
 */
export function a4LabelSheetHtml(items, shift = { xMm: 0, yMm: 0 }, blanks = false) {
  const svgs = new Map();
  const svgFor = (code) => {
    if (!svgs.has(code)) svgs.set(code, barcodeSvg(code, A4_LABEL, { height: 30, width: 2 }));
    return svgs.get(code);
  };
  const cells = items.map((item) => a4LabelHtml(item, svgFor));
  if (blanks) while (cells.length < A4_LABEL_SHEET.perPage) cells.push('<div class="a4l"></div>');
  const padding = `${A4_LABEL_SHEET.topMm + shift.yMm}mm 0 0 ${A4_LABEL_SHEET.leftMm + shift.xMm}mm`;
  return `<div class="a4l-sheet" style="padding:${padding}"><div class="a4l-grid">${cells.join('')}</div></div>`;
}

export const A4_LABEL_CSS = `
  .a4l-sheet {
    width: 210mm;
    /* 1 mm short of A4 so rounding never spills a blank page; the last row ends at 286.3 mm. */
    height: 296mm;
    box-sizing: border-box;
    overflow: hidden;
    background: #fff;
  }
  .a4l-grid {
    display: grid;
    grid-template-columns: repeat(${A4_LABEL_SHEET.columns}, ${A4_LABEL.widthMm}mm);
    grid-auto-rows: ${A4_LABEL.heightMm}mm;
    column-gap: ${A4_LABEL_SHEET.gapXMm}mm;
    row-gap: 0;
  }
  .a4l {
    display: flex;
    flex-direction: column;
    width: ${A4_LABEL.widthMm}mm;
    height: ${A4_LABEL.heightMm}mm;
    box-sizing: border-box;
    padding: 1mm 1.6mm 0.9mm;
    overflow: hidden;
    background: #fff;
    color: #000;
    font-family: Arial, Helvetica, sans-serif;
    text-align: center;
  }
  .a4l-name, .a4l-line {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    line-height: 1.15;
  }
  .a4l-name { font-size: 6.5pt; font-weight: 700; }
  .a4l-line { font-size: 6pt; }
  .a4l-barcode { flex: 1 1 0; min-height: 0; padding: 0.4mm 0; overflow: hidden; }
  .a4l-barcode svg { width: 100%; height: 100%; display: block; }
  .a4l-bottom {
    display: flex;
    justify-content: center;
    gap: 1.5mm;
    font-size: 6.5pt;
    font-weight: 700;
    line-height: 1;
    white-space: nowrap;
  }
  .a4l-guides .a4l { outline: 0.15mm dashed #b8b8b8; outline-offset: -0.15mm; }
`;

function printA4LabelSheets(title, items, shift) {
  const { perPage } = A4_LABEL_SHEET;
  const pages = [];
  for (let start = 0; start < items.length; start += perPage) pages.push(a4LabelSheetHtml(items.slice(start, start + perPage), shift));
  printDocument(
    title,
    'size: A4;',
    `${A4_LABEL_CSS}
     .a4l-sheet { page-break-after: always; break-after: page; break-inside: avoid; }
     .a4l-sheet:last-child { page-break-after: auto; break-after: auto; }`,
    pages.join(''),
  );
}

export function sheetGrid(size, sheet) {
  const usableWidth = sheet.pageWidthMm - sheet.marginMm * 2;
  const usableHeight = sheet.pageHeightMm - sheet.marginMm * 2;
  const columns = Math.max(1, Math.floor((usableWidth + sheet.gapXMm) / (size.widthMm + sheet.gapXMm)));
  const rows = Math.max(1, Math.floor((usableHeight + sheet.gapYMm) / (size.heightMm + sheet.gapYMm)));
  return { columns, rows, perPage: columns * rows };
}

export function openPrintWindow(html) {
  const win = window.open('', '_blank', 'width=760,height=760');
  if (!win) throw new Error('Allow pop-ups for this site to print barcode labels.');
  win.document.write(html);
  win.document.close();
  win.focus();
  win.setTimeout(() => {
    win.print();
    win.close();
  }, 400);
}

export const SHEET_CSS = (size, sheet) => {
  const { columns } = sheetGrid(size, sheet);
  return `
  ${STICKER_CSS(size)}
  .sheet-page {
    width: ${sheet.pageWidthMm}mm;
    height: ${sheet.pageHeightMm}mm;
    box-sizing: border-box;
    padding: ${sheet.marginMm}mm;
    background: #fff;
    overflow: hidden;
  }
  .sheet-grid {
    display: grid;
    grid-template-columns: repeat(${columns}, ${size.widthMm}mm);
    grid-auto-rows: ${size.heightMm}mm;
    column-gap: ${sheet.gapXMm}mm;
    row-gap: ${sheet.gapYMm}mm;
    align-content: start;
    justify-content: start;
  }
  .sheet-grid .sticker {
    ${sheet.guides ? 'border: 0.2mm solid #000;' : ''}
    break-inside: avoid;
    page-break-inside: avoid;
  }
`;
};

function printDocument(title, pageRule, css, body) {
  openPrintWindow(`<!doctype html>
<html><head><meta charset="utf-8"><title>${title}</title>
<style>
  @page { ${pageRule} margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; }
  ${css}
</style></head><body>${body}</body></html>`);
}

// Exact thermal physical pages, sized by the chosen label dimensions.
const THERMAL_30X20_PAGE_CSS = (size) => `
  @media print {
    html, body {
      width: ${size.widthMm}mm;
      margin: 0 !important;
      padding: 0 !important;
    }
    .thermal-30x20-page {
      display: block;
      width: ${size.widthMm}mm;
      height: ${size.heightMm}mm;
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      overflow: hidden;
      break-after: page;
      page-break-after: always;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .thermal-30x20-page > .sticker {
      width: ${size.widthMm}mm;
      height: ${size.heightMm}mm;
      margin: 0;
      padding: 0;
    }
    .thermal-30x20-page > .sticker > .sticker-inner {
      box-sizing: border-box;
      padding: 0.8mm;
    }
    .thermal-30x20-page:last-child {
      break-after: auto;
      page-break-after: auto;
    }
  }
`;

/** Prints one selected label on the chosen preset, used by the test-label action. */
export function printSingleTestLabel(item, format, customSize = SMALL_LABEL, thermalSmallSize = SMALL_LABEL, thermalSmallShift, a4Shift) {
  if (format === 'a4-label') {
    printA4LabelSheets('FEMNIA Test Barcode', [item], a4Shift);
    return;
  }
  if (format === 'thermal-30x20') {
    const body = `<div class="thermal-30x20-page"><div class="sticker">${stickerHtml(item, thermalSmallSize, thermalSmallShift)}</div></div>`;
    printDocument(
      'FEMNIA Test Barcode',
      `size: ${thermalSmallSize.widthMm}mm ${thermalSmallSize.heightMm}mm;`,
      `${STICKER_CSS(thermalSmallSize)}${THERMAL_30X20_PAGE_CSS(thermalSmallSize)}`,
      body,
    );
    return;
  }
  const size = format === 'thermal-4x6' ? FOUR_BY_SIX_LABEL : customSize;
  const pageRule = format === 'a4' ? 'size: A4;' : `size: ${size.widthMm}mm ${size.heightMm}mm;`;
  const page =
    format === 'a4'
      ? DEFAULT_SHEET
      : { ...DEFAULT_SHEET, pageWidthMm: size.widthMm, pageHeightMm: size.heightMm, guides: false };
  const body = `<div class="sheet-page"><div class="sheet-grid"><div class="sticker">${stickerHtml(item, size)}</div></div></div>`;
  printDocument('FEMNIA Test Barcode', pageRule, SHEET_CSS(size, page), body);
}

/** Prints every copy without touching product, stock, or order records. */
export function printBarcodeLabels(items, format, customSize = SMALL_LABEL, thermalSmallSize = SMALL_LABEL, thermalSmallShift, a4Shift) {
  if (!items.length) throw new Error('Select at least one product and enter a quantity above zero.');

  if (format === 'a4-label') {
    printA4LabelSheets('FEMNIA Barcode Labels', items, a4Shift);
    return;
  }

  if (format === 'thermal-30x20') {
    const pages = items
      .map(
        (item) =>
          `<div class="thermal-30x20-page"><div class="sticker">${stickerHtml(item, thermalSmallSize, thermalSmallShift)}</div></div>`,
      )
      .join('');
    printDocument(
      'FEMNIA Barcode Labels',
      `size: ${thermalSmallSize.widthMm}mm ${thermalSmallSize.heightMm}mm;`,
      `${STICKER_CSS(thermalSmallSize)}${THERMAL_30X20_PAGE_CSS(thermalSmallSize)}`,
      pages,
    );
    return;
  }

  if (format !== 'a4') {
    const size = format === 'thermal-4x6' ? FOUR_BY_SIX_LABEL : customSize;
    const pages = items.map((item) => `<div class="sticker label-page">${stickerHtml(item, size)}</div>`).join('');
    printDocument(
      'FEMNIA Barcode Labels',
      `size: ${size.widthMm}mm ${size.heightMm}mm;`,
      `${STICKER_CSS(size)}
       .label-page { page-break-after: always; break-after: page; break-inside: avoid; }
       .label-page:last-child { page-break-after: auto; break-after: auto; }`,
      pages,
    );
    return;
  }

  const size = customSize;
  const sheet = DEFAULT_SHEET;
  const { perPage } = sheetGrid(size, sheet);
  const pages = [];
  for (let start = 0; start < items.length; start += perPage) {
    const cells = items
      .slice(start, start + perPage)
      .map((item) => `<div class="sticker">${stickerHtml(item, size)}</div>`)
      .join('');
    pages.push(`<div class="sheet-page"><div class="sheet-grid">${cells}</div></div>`);
  }
  printDocument(
    'FEMNIA Barcode Labels',
    'size: A4;',
    `${SHEET_CSS(size, sheet)}
     .sheet-page { page-break-after: always; break-after: page; break-inside: avoid; }
     .sheet-page:last-child { page-break-after: auto; break-after: auto; }`,
    pages.join(''),
  );
}
