// Purchase Order and Purchase Return PDFs — the paperwork that goes to a
// supplier. Same A4 layout and Femnia palette as invoiceService's customer
// invoice.
import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// PNG only — pdfkit can't read the storefront's .webp logo. Without the file
// the header falls back to the store name in text.
const LOGO_PATH = path.resolve(__dirname, '../../../client/public/images/femnia-logo.png');

const brand = '#17130f';     // ink (--copper / primary)
const accent = '#c08b5c';    // gold (--gold)
const ink = '#17130f';
const grey = '#6b6058';      // --text-secondary
const rule = '#e6dccd';      // --border
const tint = '#faf6f0';      // --bg
const bandMeta = '#a89c91';  // meta text on the dark header band
const danger = '#dc2626';

const LEFT = 50;
const WIDTH = 495.28;
const PAGE_BOTTOM = 785;   // A4 is 842pt; pdfkit's own page break is at 842 - 50

// Env read at call time: dotenv runs after imports resolve.
function store() {
  const n = parseInt(process.env.CURRENCY_DECIMALS, 10);
  const decimals = Number.isFinite(n) && n >= 0 && n <= 4 ? n : 2;
  const symbol = process.env.CURRENCY_SYMBOL || 'QAR';
  return {
    name: process.env.STORE_NAME || 'Femnia Fashion',
    address: process.env.STORE_ADDRESS || '',
    phone: process.env.STORE_PHONE || '',
    email: process.env.STORE_CONTACT_EMAIL || process.env.SMTP_EMAIL || '',
    trn: process.env.STORE_TRN || '',
    money: (v) => `${symbol} ${(parseFloat(v) || 0).toFixed(decimals)}`,
  };
}

// Server runs on the store's timezone (tz.js), so these are Qatar dates.
const longDate = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const shortDate = (d) => new Date(d).toLocaleDateString('en-GB');
// DATEONLY strings are calendar days, not instants.
const dayOnly = (s) => (s ? shortDate(`${String(s).slice(0, 10)}T00:00:00`) : '—');

function render(draw) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    try {
      draw(doc);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function header(doc, { title, number, date, cancelled }) {
  doc.rect(0, 0, 595.28, 100).fill(brand);
  if (fs.existsSync(LOGO_PATH)) {
    doc.roundedRect(LEFT, 28, 168, 46, 8).fill('#ffffff');
    doc.image(LOGO_PATH, 60, 35, { fit: [148, 32], align: 'center', valign: 'center' });
  } else {
    doc.fontSize(22).font('Helvetica-Bold').fill('#ffffff').text(store().name.toUpperCase(), LEFT, 38, { characterSpacing: 2 });
  }
  doc.fontSize(20).fill('#ffffff').font('Helvetica-Bold').text(title, 300, 28, { width: 245, align: 'right' });
  doc.fontSize(9).fill(bandMeta).font('Helvetica').text(`#${number}`, 300, 56, { width: 245, align: 'right' });
  doc.text(longDate(date), 300, 70, { width: 245, align: 'right' });
  doc.rect(0, 100, 595.28, 3).fill(accent);
  if (cancelled) {
    doc.fontSize(11).fill(danger).font('Helvetica-Bold').text('CANCELLED', LEFT, 112, { width: WIDTH, align: 'right' });
  }
}

// Two address blocks side by side; returns the y below the taller one.
function parties(doc, y, left, right) {
  const block = (x, { label, name, lines }) => {
    let yy = y;
    doc.fontSize(8).fill(brand).font('Helvetica-Bold').text(label, x, yy); yy += 14;
    doc.fontSize(10).fill(ink).font('Helvetica-Bold').text(name || '—', x, yy, { width: 220 }); yy += 14;
    doc.fontSize(9).fill(grey).font('Helvetica');
    for (const l of lines.filter(Boolean)) {
      doc.text(l, x, yy, { width: 220 });
      yy += doc.heightOfString(l, { width: 220 }) + 2;
    }
    return yy;
  };
  return Math.max(block(LEFT, left), block(330, right)) + 18;
}

// Peach bar of label/value pairs.
function detailsBar(doc, y, fields) {
  const colW = WIDTH / fields.length;
  doc.rect(LEFT, y, WIDTH, 44).fill(tint);
  fields.forEach(([label, value, color], i) => {
    const x = LEFT + 10 + i * colW;
    doc.fontSize(7.5).fill(grey).font('Helvetica-Bold').text(label, x, y + 8, { width: colW - 12 });
    doc.fontSize(9).fill(color || ink).font(color ? 'Helvetica-Bold' : 'Helvetica').text(value, x, y + 22, { width: colW - 12, height: 12, ellipsis: true });
  });
  return y + 58;
}

// cols: [{ label, width, align }]; rows: [{ cells: [...], sub?: string }]
// (sub = small grey line under the item name, e.g. the SKU).
function table(doc, y, cols, rows) {
  const xs = [];
  cols.reduce((x, c) => { xs.push(x); return x + c.width; }, LEFT + 10);
  const head = (yy) => {
    doc.rect(LEFT, yy, WIDTH, 24).fill(brand);
    doc.fontSize(8).fill('#ffffff').font('Helvetica-Bold');
    cols.forEach((c, i) => doc.text(c.label, xs[i], yy + 8, { width: c.width - 6, align: c.align || 'left' }));
    return yy + 24;
  };
  y = head(y);
  const nameCol = 1;
  rows.forEach((row, r) => {
    doc.fontSize(9).font('Helvetica');
    const nameH = doc.heightOfString(String(row.cells[nameCol]), { width: cols[nameCol].width - 6 });
    const h = Math.max(26, nameH + (row.sub ? 22 : 14));
    if (y + h > PAGE_BOTTOM) { doc.addPage(); y = head(LEFT); }
    if (r % 2 === 0) doc.rect(LEFT, y, WIDTH, h).fill(tint);
    row.cells.forEach((cell, i) => {
      doc.fontSize(9).fill(ink).font('Helvetica')
        .text(String(cell), xs[i], y + 8, { width: cols[i].width - 6, align: cols[i].align || 'left' });
    });
    if (row.sub) {
      doc.fontSize(7.5).fill(grey).text(row.sub, xs[nameCol], y + 8 + nameH + 2, { width: cols[nameCol].width - 6 });
    }
    y += h;
  });
  if (rows.length === 0) {
    doc.fontSize(9).fill(grey).text('No items', LEFT, y + 10, { width: WIDTH, align: 'center' });
    y += 30;
  }
  return y + 12;
}

// Right-aligned totals; the `strong` row gets the brand bar.
function totals(doc, y, lines) {
  if (y + lines.length * 18 + 40 > PAGE_BOTTOM) { doc.addPage(); y = LEFT; }
  const labelX = 350;
  const valueX = 440;
  for (const { label, value, strong, color } of lines) {
    if (strong) {
      y += 4;
      doc.rect(labelX - 10, y, 205.28, 28).fill(brand);
      doc.fontSize(11).fill('#ffffff').font('Helvetica-Bold').text(label, labelX, y + 8, { width: 90 });
      doc.text(value, valueX, y + 8, { width: 100, align: 'right' });
      y += 34;
    } else {
      doc.fontSize(9).fill(grey).font('Helvetica').text(label, labelX, y, { width: 90 });
      doc.fill(color || ink).text(value, valueX, y, { width: 100, align: 'right' });
      y += 18;
    }
  }
  return y + 8;
}

function notesBlock(doc, y, label, text) {
  if (!text) return y;
  const h = doc.fontSize(9).heightOfString(text, { width: WIDTH });
  if (y + h + 20 > PAGE_BOTTOM) { doc.addPage(); y = LEFT; }
  doc.fontSize(8).fill(brand).font('Helvetica-Bold').text(label, LEFT, y);
  doc.fontSize(9).fill(ink).font('Helvetica').text(text, LEFT, y + 13, { width: WIDTH });
  return y + 13 + h + 12;
}

// Two signature lines, then the footer.
function signOff(doc, y, left, right) {
  if (y + 110 > PAGE_BOTTOM) { doc.addPage(); y = LEFT; }
  y += 30;
  doc.moveTo(LEFT, y).lineTo(LEFT + 200, y).lineWidth(0.7).strokeColor(grey).stroke();
  doc.moveTo(345.28, y).lineTo(545.28, y).stroke();
  doc.fontSize(8).fill(grey).font('Helvetica')
    .text(left, LEFT, y + 5, { width: 200 })
    .text(right, 345.28, y + 5, { width: 200 });
  y += 40;
  const s = store();
  doc.moveTo(LEFT, y).lineTo(545.28, y).lineWidth(0.5).strokeColor(rule).stroke();
  doc.fontSize(8).fill(grey)
    .text([s.name, s.phone, s.email, s.trn && `TRN: ${s.trn}`].filter(Boolean).join(' • '), LEFT, y + 10, { width: WIDTH, align: 'center' })
    .text('This is a computer-generated document.', LEFT, y + 22, { width: WIDTH, align: 'center' });
}

const supplierLines = (sup = {}) => [
  sup.contactPerson && `Attn: ${sup.contactPerson}`,
  sup.address,
  [sup.city, sup.country].filter(Boolean).join(', '),
  sup.phone && `Phone: ${sup.phone}`,
  sup.email && `Email: ${sup.email}`,
  sup.taxId && `Tax ID: ${sup.taxId}`,
];

const title = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** `po` is PurchaseOrder.toJSON() with Supplier, Location, creator. */
export function generatePurchaseOrderPdf(po) {
  return render((doc) => {
    const s = store();
    const loc = po.Location || {};
    header(doc, { title: 'PURCHASE ORDER', number: po.poNumber, date: po.createdAt, cancelled: po.status === 'cancelled' });
    let y = parties(doc, 132,
      { label: 'FROM / DELIVER TO', name: s.name, lines: [loc.name, loc.address || s.address, s.phone && `Phone: ${s.phone}`, s.trn && `TRN: ${s.trn}`] },
      { label: 'SUPPLIER', name: po.Supplier?.name, lines: supplierLines(po.Supplier) });

    const paid = parseFloat(po.amountPaid) || 0;
    const total = parseFloat(po.totalAmount) || 0;
    y = detailsBar(doc, y, [
      ['PO NUMBER', po.poNumber],
      ['ORDER DATE', shortDate(po.createdAt)],
      ['EXPECTED', dayOnly(po.expectedDate)],
      ['STATUS', title(po.status), po.status === 'cancelled' ? danger : null],
      ['PAYMENT', title(po.paymentStatus)],
    ]);

    const items = po.items || [];
    const anyReceived = items.some((l) => (l.receivedQty || 0) > 0);
    const cols = [
      { label: '#', width: 22 },
      { label: 'ITEM', width: anyReceived ? 178 : 238 },
      { label: 'QTY', width: 50, align: 'right' },
      ...(anyReceived ? [{ label: 'RECEIVED', width: 60, align: 'right' }] : []),
      { label: 'UNIT COST', width: 80, align: 'right' },
      { label: 'AMOUNT', width: 95, align: 'right' },
    ];
    y = table(doc, y, cols, items.map((l, i) => {
      const qty = parseInt(l.orderedQty, 10) || 0;
      const amount = (parseFloat(l.unitCost) || 0) * qty * (1 + (parseFloat(l.taxRate) || 0) / 100);
      const tax = parseFloat(l.taxRate) ? ` · tax ${parseFloat(l.taxRate)}%` : '';
      return {
        cells: [i + 1, l.name, qty, ...(anyReceived ? [l.receivedQty || 0] : []), s.money(l.unitCost), s.money(amount)],
        sub: l.sku || tax ? `${l.sku ? `SKU ${l.sku}` : ''}${tax}` : null,
      };
    }));

    const tax = parseFloat(po.taxAmount) || 0;
    const shipping = parseFloat(po.shippingCost) || 0;
    const discount = parseFloat(po.discount) || 0;
    const totalQty = items.reduce((a, l) => a + (parseInt(l.orderedQty, 10) || 0), 0);
    y = totals(doc, y, [
      { label: 'Total qty', value: `${totalQty} (${items.length} items)` },
      { label: 'Subtotal', value: s.money(po.subtotal) },
      ...(tax ? [{ label: 'Tax', value: s.money(tax) }] : []),
      ...(shipping ? [{ label: 'Shipping', value: s.money(shipping) }] : []),
      ...(discount ? [{ label: 'Discount', value: `-${s.money(discount)}` }] : []),
      { label: 'TOTAL', value: s.money(total), strong: true },
      ...(paid ? [
        { label: 'Paid', value: s.money(paid) },
        { label: 'Balance due', value: s.money(total - paid), color: total - paid > 0 ? danger : null },
      ] : []),
    ]);
    y = notesBlock(doc, y, 'NOTES', po.notes);
    signOff(doc, y, `Prepared by${po.creator?.name ? `: ${po.creator.name}` : ''}`, 'Authorised signature');
  });
}

const REFUND = { credit_note: 'Credit note', cash: 'Cash', bank: 'Bank' };

/** `pr` is PurchaseReturn.toJSON() with Supplier, Location, PurchaseOrder, creator. */
export function generatePurchaseReturnPdf(pr) {
  return render((doc) => {
    const s = store();
    const loc = pr.Location || {};
    header(doc, { title: 'PURCHASE RETURN', number: pr.returnNumber, date: pr.createdAt, cancelled: pr.status === 'cancelled' });
    let y = parties(doc, 132,
      { label: 'RETURNED BY', name: s.name, lines: [loc.name, loc.address || s.address, s.phone && `Phone: ${s.phone}`, s.trn && `TRN: ${s.trn}`] },
      { label: 'RETURNED TO', name: pr.Supplier?.name, lines: supplierLines(pr.Supplier) });

    y = detailsBar(doc, y, [
      ['RETURN NUMBER', pr.returnNumber],
      ['DATE', shortDate(pr.createdAt)],
      ['AGAINST PO', pr.PurchaseOrder?.poNumber || '—'],
      ['REFUND', REFUND[pr.refundMethod] || pr.refundMethod || '—'],
      ['STATUS', title(pr.status), pr.status === 'cancelled' ? danger : null],
    ]);

    const items = pr.items || [];
    y = table(doc, y, [
      { label: '#', width: 22 },
      { label: 'ITEM', width: 238 },
      { label: 'QTY', width: 50, align: 'right' },
      { label: 'UNIT COST', width: 80, align: 'right' },
      { label: 'AMOUNT', width: 95, align: 'right' },
    ], items.map((l, i) => ({
      cells: [i + 1, l.name, l.quantity, s.money(l.unitCost),
        s.money(l.refundAmount != null ? l.refundAmount : (parseFloat(l.unitCost) || 0) * (parseInt(l.quantity, 10) || 0))],
    })));

    y = totals(doc, y, [{ label: 'TOTAL', value: s.money(pr.totalAmount), strong: true }]);
    y = notesBlock(doc, y, 'REASON', pr.reason);
    y = notesBlock(doc, y, 'NOTES', pr.notes);
    signOff(doc, y, `Prepared by${pr.creator?.name ? `: ${pr.creator.name}` : ''}`, 'Received by (supplier)');
  });
}
