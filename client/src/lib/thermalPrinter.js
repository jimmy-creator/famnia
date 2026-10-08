/**
 * Direct ESC/POS printing over WebUSB — supports two independent
 * printers: the receipt printer at the counter (80mm thermal, often
 * with a cash-drawer port) and the barcode/label printer in the back
 * room.
 *
 * navigator.usb.getDevices() returns every device the browser has
 * authorised but doesn't say which one is "receipt" or "barcode", so
 * we persist a {vendorId, productId, serialNumber} fingerprint per
 * role in localStorage and match against it at print time.
 *
 * Encoder: @point-of-sale/receipt-printer-encoder
 * Transport: navigator.usb
 *
 * Public API is now role-keyed:
 *   isSupported()                  WebUSB available?
 *   isEnabled(kind)                cashier has direct print on for this role?
 *   setEnabled(kind, v)
 *   getColumns(kind)               paper width in columns
 *   setColumns(kind, n)
 *   getDevice(kind)                lookup the paired physical device
 *   requestDevice(kind)            open OS picker + store fingerprint
 *   forget(kind)
 *   testPrint(kind)
 *   printSale(payload, ccy, kick)  -> receipt
 *   printReturn(payload, ccy)      -> receipt
 *   printReport(report, ccy)       -> receipt
 *   printLabelImages(canvases)     -> barcode
 *   kickDrawer()                   -> receipt
 *
 *  kind ∈ 'receipt' | 'barcode'
 */
import ReceiptPrinterEncoder from '@point-of-sale/receipt-printer-encoder';
import { CURRENCY_DECIMALS } from '../utils/currency';

const KINDS = ['receipt', 'barcode'];
const DEFAULTS = { receipt: 48, barcode: 32 };
const STORE_NAME = import.meta.env.VITE_STORE_NAME || 'Femnia Fashion';

const key = (kind, suffix) => `pos_${kind}_${suffix}`;

// The encoder rasterises images through a canvas it creates itself, so in a
// browser it needs to be told how to make one. Without this, .image() throws
// "Canvas is not supported in this environment".
function newEncoder(cols) {
  return new ReceiptPrinterEncoder({
    language: 'esc-pos',
    columns: cols,
    createCanvas: (w, h) => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      return c;
    },
  });
}

// ── Receipt logo ───────────────────────────────────────────────────
// Printed at the top of sale/return receipts. Thermal output is 1-bit, so
// this uses the DARK logo (the "-light" variants are cream-on-transparent
// and would burn to almost nothing). Atkinson dithering keeps the gold ring
// legible; the FN mark and wordmark are solid enough to come out clean.
//
// ESC/POS raster requires both dimensions to be a multiple of 8.
const LOGO_URL = '/images/femnia-logo.webp';
// Both multiples of 8, as ESC/POS raster requires. 128px was tried for the
// narrow roll and the FEMNIA wordmark dithered to mush; 160 keeps it legible.
const logoSize = (cols) => (cols >= 48 ? 192 : 160);   // 24×8 / 20×8

let logoPromise;
// Resolves to an HTMLImageElement, or null if the asset can't be loaded —
// a missing logo must never stop a sale from printing.
function loadLogo() {
  if (logoPromise) return logoPromise;
  logoPromise = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => { console.warn('[thermal] receipt logo failed to load'); resolve(null); };
    img.src = LOGO_URL;
  });
  return logoPromise;
}

// Draw the logo, centred, if we have one. Must not be called inside a
// table or box — the encoder rejects images there.
function addLogo(enc, logo, cols) {
  if (!logo) return enc;
  const px = logoSize(cols);
  try {
    return enc.align('center').image(logo, px, px, 'atkinson').newline();
  } catch (err) {
    console.warn('[thermal] logo skipped:', err.message);
    return enc;
  }
}

export function isSupported() {
  return typeof navigator !== 'undefined' && !!navigator.usb;
}

export function isEnabled(kind) {
  return localStorage.getItem(key(kind, 'enabled')) === 'true';
}

export function setEnabled(kind, v) {
  if (v) localStorage.setItem(key(kind, 'enabled'), 'true');
  else localStorage.removeItem(key(kind, 'enabled'));
}

export function getColumns(kind) {
  return parseInt(localStorage.getItem(key(kind, 'columns')), 10) || DEFAULTS[kind] || 48;
}

export function setColumns(kind, n) {
  localStorage.setItem(key(kind, 'columns'), String(parseInt(n, 10) || DEFAULTS[kind]));
}

// Receipt language: 'en' (default), 'ar' (Arabic only), 'bi' (bilingual
// — print English then Arabic on each item line). Stored per-browser.
export function getReceiptLocale() {
  return localStorage.getItem('pos_receipt_locale') || 'en';
}
export function setReceiptLocale(loc) {
  if (['en', 'ar', 'bi'].includes(loc)) localStorage.setItem('pos_receipt_locale', loc);
}

// Returns the localised name for a line item per the receipt locale
// setting. Falls back to English when nameAr isn't snapshotted.
function pickName(item, loc) {
  if (loc === 'ar') return item.nameAr || item.name;
  return item.name;
}
// "د.ك" for Arabic receipts, the configured KWD/etc. otherwise.
function pickCurrency(defaultCurrency, loc) {
  if (loc === 'ar' || loc === 'bi') {
    return (typeof window !== 'undefined' && import.meta.env.VITE_CURRENCY_SYMBOL_AR)
      || 'د.ك';
  }
  return defaultCurrency;
}

function getFingerprint(kind) {
  try { return JSON.parse(localStorage.getItem(key(kind, 'device')) || 'null'); }
  catch { return null; }
}
function setFingerprint(kind, device) {
  const fp = {
    vendorId: device.vendorId,
    productId: device.productId,
    serialNumber: device.serialNumber || null,
  };
  localStorage.setItem(key(kind, 'device'), JSON.stringify(fp));
}
function clearFingerprint(kind) {
  localStorage.removeItem(key(kind, 'device'));
}

// ── Device handling ────────────────────────────────────────────────
// USB classes Chrome refuses to claim over WebUSB (audio, HID, mass
// storage, smart card, video, A/V, wireless). Composite POS devices often
// put one of these first, so interface 0 can't be assumed to be the printer.
const PROTECTED_CLASSES = new Set([0x01, 0x03, 0x08, 0x0b, 0x0e, 0x10, 0xe0]);

async function pickEndpoint(device) {
  if (!device.opened) await device.open();
  if (device.configuration === null) await device.selectConfiguration(1);
  // Prefer the printer class (0x07), then any other claimable interface
  // with an OUT endpoint (vendor-specific 0xFF on most cheap printers).
  const candidates = [];
  for (const iface of device.configuration.interfaces) {
    for (const alt of iface.alternates) {
      if (PROTECTED_CLASSES.has(alt.interfaceClass)) continue;
      const out = alt.endpoints.find((e) => e.direction === 'out');
      if (out) candidates.push({ iface, alt, out });
    }
  }
  candidates.sort((a, b) => (b.alt.interfaceClass === 0x07) - (a.alt.interfaceClass === 0x07));
  const pick = candidates[0];
  if (!pick) {
    const classes = device.configuration.interfaces
      .map((i) => '0x' + i.alternates[0].interfaceClass.toString(16).padStart(2, '0')).join(', ');
    throw new Error(`"${device.productName || 'This device'}" has no printer interface the browser can use (classes: ${classes}). Check you picked the printer, not the screen or scanner.`);
  }
  const { iface, alt, out } = pick;
  if (!iface.claimed) await device.claimInterface(iface.interfaceNumber);
  if (iface.alternate?.alternateSetting !== alt.alternateSetting) {
    await device.selectAlternateInterface(iface.interfaceNumber, alt.alternateSetting);
  }
  return { device, endpoint: out.endpointNumber, interface: iface.interfaceNumber };
}

function matches(device, fp) {
  if (!fp) return false;
  if (device.vendorId !== fp.vendorId) return false;
  if (device.productId !== fp.productId) return false;
  // serialNumber is the strongest match but many cheap printers report
  // empty/identical serials; fall back to vendor+product if so.
  if (fp.serialNumber && device.serialNumber && device.serialNumber !== fp.serialNumber) return false;
  return true;
}

export async function getDevice(kind) {
  if (!isSupported()) return null;
  const fp = getFingerprint(kind);
  if (!fp) return null;
  const devs = await navigator.usb.getDevices();
  const found = devs.find((d) => matches(d, fp));
  if (!found) return null;
  return pickEndpoint(found);
}

export async function requestDevice(kind) {
  if (!isSupported()) throw new Error('WebUSB not supported in this browser');
  // If the OTHER kind is paired to a device, exclude it from the picker
  // so the user can't accidentally re-pick it for this role.
  const otherKind = kind === 'receipt' ? 'barcode' : 'receipt';
  const otherFp = getFingerprint(otherKind);
  const exclusionFilters = otherFp
    ? [{ vendorId: otherFp.vendorId, productId: otherFp.productId }]
    : [];
  const device = await navigator.usb.requestDevice({
    filters: [],
    exclusionFilters,
  }).catch(async () => {
    // Older browsers reject `exclusionFilters` — retry without.
    return navigator.usb.requestDevice({ filters: [] });
  });
  // Only remember the device once we've actually claimed a printer
  // interface on it, so a wrong pick doesn't leave a broken pairing.
  const handle = await pickEndpoint(device);
  setFingerprint(kind, device);
  setEnabled(kind, true);
  return handle;
}

export async function forget(kind) {
  setEnabled(kind, false);
  const fp = getFingerprint(kind);
  clearFingerprint(kind);
  if (!isSupported() || !fp) return;
  const devs = await navigator.usb.getDevices();
  const target = devs.find((d) => matches(d, fp));
  if (target) {
    // Only revoke the authorisation if no other kind still claims it.
    const otherFp = getFingerprint(KINDS.find((k) => k !== kind));
    if (!otherFp || !matches(target, otherFp)) {
      try { await target.forget(); } catch { /* old browsers */ }
    }
  }
}

// ── Low-level send ─────────────────────────────────────────────────
async function send(kind, bytes) {
  const handle = await getDevice(kind);
  if (!handle) throw new Error(`No ${kind} printer paired`);
  await handle.device.transferOut(handle.endpoint, bytes);
}

// ── Receipt templates ──────────────────────────────────────────────
const fmt = (currency, n) => `${currency} ${(parseFloat(n) || 0).toFixed(CURRENCY_DECIMALS)}`;

// Store header for receipts, X/Z reports and barcode labels. A POS
// location's own address/phone win when set; these fill in for locations
// that don't have them. Blank values are simply not printed.
export const RECEIPT_STORE = {
  name: STORE_NAME,
  logo: LOGO_URL,
  address: '',
  phone: '+974 6654 3343',
  email: 'info@femnia.com',
};

// Logo + location + contacts, shared by sale/return receipts and X/Z reports.
async function printStoreHeader(enc, cols, location) {
  const logo = await loadLogo();
  addLogo(enc, logo, cols);
  // The logo is a monogram, so the store name is always spelled out.
  enc.align('center').bold(true).size('normal').line(location?.name || RECEIPT_STORE.name).bold(false);
  const address = location?.address || RECEIPT_STORE.address;
  const phone = location?.phone || RECEIPT_STORE.phone;
  if (address) enc.line(address);
  if (phone) enc.line(`Tel: ${phone}`);
  if (RECEIPT_STORE.email) enc.line(RECEIPT_STORE.email);
}

async function buildSale(payload, currency = 'KWD') {
  const { order, change, amountTendered, cardType, location, cashier } = payload;
  const breakdown = Array.isArray(order.paymentBreakdown) ? order.paymentBreakdown : null;
  const cols = getColumns('receipt');
  const loc = getReceiptLocale();
  // Override the param so every fmt(currency, …) call below renders the
  // locale-correct symbol without touching each line.
  currency = pickCurrency(currency, loc);
  const enc = newEncoder(cols);

  enc.initialize();
  await printStoreHeader(enc, cols, location);
  enc.rule();
  enc.align('left')
    .line(`Receipt: ${order.orderNumber}`)
    .line(`Date: ${new Date(order.createdAt || Date.now()).toLocaleString()}`)
    .line(`Cashier: ${cashier?.name || '—'}`);
  if (order.shippingAddress?.fullName && order.shippingAddress.fullName !== 'Walk-in') {
    enc.line(`Customer: ${order.shippingAddress.fullName}`);
  }
  enc.rule();

  const colW = Math.floor(cols * 0.65);
  for (const it of (order.items || [])) {
    const lineTotal = fmt(currency, (parseFloat(it.price) || 0) * (parseInt(it.quantity, 10) || 0));
    const displayName = pickName(it, loc);
    enc.table(
      [{ width: colW, marginRight: 1 }, { width: cols - colW - 1, align: 'right' }],
      [[displayName, lineTotal]]
    );
    // Bilingual mode: print Arabic name as a second line under English.
    if (loc === 'bi' && it.nameAr && it.nameAr !== it.name) {
      enc.line(`  ${it.nameAr}`);
    }
    const sku = it.barcode || it.sku || it.variant?.sku || null;
    enc.line(`  ${sku ? `${sku} · ` : ''}${it.quantity} x ${fmt(currency, it.price)}`);
  }
  enc.rule();

  // Show the subtotal whenever anything sits between it and the total —
  // a discount, a delivery charge, or both. Must mirror PosReceipt.jsx.
  const delivery = parseFloat(order.shippingCharge || 0);
  if (parseFloat(order.discount || 0) > 0 || delivery > 0) {
    const subtotal = (order.items || []).reduce(
      (s, it) => s + (parseFloat(it.price) || 0) * (parseInt(it.quantity, 10) || 0), 0
    );
    const rows = [['Subtotal', fmt(currency, subtotal)]];
    if (parseFloat(order.discount || 0) > 0) {
      rows.push([`Discount${order.couponCode ? ` (${order.couponCode})` : ''}`, `-${fmt(currency, order.discount)}`]);
    }
    if (delivery > 0) rows.push(['Delivery', fmt(currency, delivery)]);
    enc.table(
      [{ width: colW, marginRight: 1 }, { width: cols - colW - 1, align: 'right' }],
      rows
    );
  }
  enc.bold(true).table(
    [{ width: colW, marginRight: 1 }, { width: cols - colW - 1, align: 'right' }],
    [['TOTAL', fmt(currency, order.totalAmount)]]
  ).bold(false);

  const tenderLabel = (m) => (m === 'cash' ? 'Cash' : 'Card');
  if (breakdown) {
    for (const tn of breakdown) {
      enc.table(
        [{ width: colW, marginRight: 1 }, { width: cols - colW - 1, align: 'right' }],
        [[`Paid (${tenderLabel(tn.method)})`, fmt(currency, tn.amount)]]
      );
    }
  } else {
    const method = order.paymentMethod === 'pos_cash' ? 'Cash'
      : (cardType || 'Card');
    enc.table(
      [{ width: colW, marginRight: 1 }, { width: cols - colW - 1, align: 'right' }],
      [[`Paid (${method})`, fmt(currency, amountTendered ?? order.totalAmount)]]
    );
    if (change > 0) {
      enc.table(
        [{ width: colW, marginRight: 1 }, { width: cols - colW - 1, align: 'right' }],
        [['Change', fmt(currency, change)]]
      );
    }
  }

  enc.rule().align('center').line('Thank you for shopping with us!');
  if (order.orderNumber) {
    enc.barcode(order.orderNumber, 'code128', { height: 60, text: false }).line(order.orderNumber);
  }
  enc.newline().newline();
  enc.cut('partial');
  return enc.encode();
}

async function buildReturn(payload, currency = 'KWD') {
  const sr = payload.salesReturn;
  const cols = getColumns('receipt');
  const loc = getReceiptLocale();
  currency = pickCurrency(currency, loc);
  const enc = newEncoder(cols);
  enc.initialize();
  await printStoreHeader(enc, cols, sr.Location);
  enc.rule()
    .align('center').bold(true).line('RETURN RECEIPT').bold(false)
    .rule()
    .align('left')
    .line(`Return #: ${sr.returnNumber}`)
    .line(`Original: ${payload.order?.orderNumber || 'No receipt'}`)
    .line(`Date: ${new Date(sr.createdAt || Date.now()).toLocaleString()}`)
    .line(`Cashier: ${sr.processor?.name || '—'}`);
  if (sr.reason) enc.line(`Reason: ${sr.reason}`);
  enc.rule();

  const colW = Math.floor(cols * 0.65);
  for (const it of (sr.items || [])) {
    const displayName = pickName(it, loc);
    enc.table(
      [{ width: colW, marginRight: 1 }, { width: cols - colW - 1, align: 'right' }],
      [[displayName, `-${fmt(currency, it.refundAmount)}`]]
    );
    if (loc === 'bi' && it.nameAr && it.nameAr !== it.name) {
      enc.line(`  ${it.nameAr}`);
    }
    const sku = it.barcode || it.sku || it.variant?.sku || null;
    enc.line(`  ${sku ? `${sku} · ` : ''}${it.quantity} x ${fmt(currency, it.price)}`);
  }
  enc.rule();
  enc.bold(true).table(
    [{ width: colW, marginRight: 1 }, { width: cols - colW - 1, align: 'right' }],
    [['REFUND TOTAL', `-${fmt(currency, sr.refundAmount)}`]]
  ).bold(false);
  const methodLabel = sr.refundMethod === 'cash' ? 'Cash'
    : sr.refundMethod === 'card' ? 'Card' : 'Store Credit';
  enc.table(
    [{ width: colW, marginRight: 1 }, { width: cols - colW - 1, align: 'right' }],
    [['Method', methodLabel]]
  );
  enc.rule();
  if (sr.refundMethod === 'cash') enc.align('center').line('Cash returned to customer');
  else if (sr.refundMethod === 'card') enc.align('center').line('Refund to original card');
  else enc.align('center').line('Store credit issued');
  enc.newline().newline().cut('partial');
  return enc.encode();
}

async function buildReport(report, currency = 'KWD') {
  const cols = getColumns('receipt');
  const loc = getReceiptLocale();
  currency = pickCurrency(currency, loc);
  const enc = newEncoder(cols);
  const isDay = report.type === 'DAY';   // end-of-day, all shifts
  const t = isDay ? 'DAILY REPORT' : report.type === 'Z' ? 'Z-REPORT' : 'X-REPORT';
  const session = report.session || {};
  const opened = session.openedAt ? new Date(session.openedAt).toLocaleString() : '—';
  const closed = session.closedAt ? new Date(session.closedAt).toLocaleString() : '—';
  const colW = Math.floor(cols * 0.65);
  const row = (l, r) => enc.table(
    [{ width: colW, marginRight: 1 }, { width: cols - colW - 1, align: 'right' }],
    [[l, r]]
  );

  enc.initialize();
  await printStoreHeader(enc, cols, report.location);
  enc.rule()
    .align('center').bold(true).line(t).bold(false)
    .rule().align('left');
  if (isDay) {
    enc.line(`Date: ${new Date(report.dayStart || report.date).toLocaleDateString()}`)
      .line(`Location: ${report.location?.name || 'All locations'}`);
  } else {
    enc.line(`Cashier: ${report.cashier?.name || '—'}`).line(`Opened: ${opened}`);
    if (report.type === 'Z') enc.line(`Closed: ${closed}`);
  }
  enc.rule();
  row('Orders', String(report.orderCount));
  row('Cash sales', fmt(currency, report.cashSales));
  row('Card sales', fmt(currency, report.cardSales));
  if (report.otherSales > 0) row('Other', fmt(currency, report.otherSales));
  if (report.cashRefunds > 0 || report.cardRefunds > 0) {
    row('Cash refunds', `-${fmt(currency, report.cashRefunds)}`);
    row('Card refunds', `-${fmt(currency, report.cardRefunds)}`);
  }
  enc.bold(true);
  row('NET SALES', fmt(currency, report.netSales));
  enc.bold(false).rule();
  if (isDay) {
    const hm = (d) => (d ? new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '..');
    enc.bold(true).line(`SHIFTS (${(report.shifts || []).length})`).bold(false);
    for (const s of report.shifts || []) {
      row(`${s.cashier} ${hm(s.openedAt)}-${s.status === 'open' ? 'open' : hm(s.closedAt)}`,
        s.variance != null ? `${s.variance >= 0 ? '+' : ''}${fmt(currency, s.variance)}` : '-');
    }
    if ((report.shifts || []).length) {
      enc.bold(true);
      row('TOTAL VARIANCE', `${report.totalVariance >= 0 ? '+' : ''}${fmt(currency, report.totalVariance)}`);
      enc.bold(false);
    }
    enc.rule().align('center').line('-- END OF DAY --').newline().newline().cut('partial');
    return enc.encode();
  }
  row('Opening cash', fmt(currency, report.openingCash));
  row('+ Cash sales', fmt(currency, report.cashSales));
  row('- Cash refunds', fmt(currency, report.cashRefunds));
  enc.bold(true);
  row('Expected drawer', fmt(currency, report.expectedCash));
  enc.bold(false);
  if (report.type === 'Z') {
    row('Counted cash', fmt(currency, report.closingCash));
    enc.bold(true);
    const varianceStr = (report.variance >= 0 ? '+' : '') + fmt(currency, report.variance);
    row('VARIANCE', varianceStr);
    enc.bold(false);
  }
  enc.rule().align('center')
    .line(report.type === 'Z' ? '-- END OF SHIFT --' : '-- MID-SHIFT REPORT --')
    .newline().newline().cut('partial');
  return enc.encode();
}

// ── Public print entrypoints ───────────────────────────────────────
export async function testPrint(kind) {
  const cols = getColumns(kind);
  const enc = newEncoder(cols);
  enc.initialize()
    .align('center').bold(true).line('TEST PRINT').bold(false)
    .line(kind === 'barcode' ? 'Label printer' : 'Receipt printer')
    .line(new Date().toLocaleString())
    .rule();
  if (kind === 'barcode') {
    enc.align('center').barcode('TEST1234', 'code128', { height: 60, text: false })
      .line('TEST1234');
  } else {
    enc.align('left').line('Direct print is working.');
  }
  enc.newline().newline().cut('partial');
  await send(kind, enc.encode());
}

export async function printSale(payload, currency, openDrawer = false) {
  await send('receipt', await buildSale(payload, currency));
  if (openDrawer) await kickDrawer();
}

export async function printReturn(payload, currency) {
  await send('receipt', await buildReturn(payload, currency));
}

export async function printReport(report, currency) {
  await send('receipt', await buildReport(report, currency));
}

// Cash drawer pulse via the receipt printer.
export async function kickDrawer() {
  const cols = getColumns('receipt');
  const enc = newEncoder(cols);
  const bytes = enc.initialize().pulse(0, 60, 120).encode();
  await send('receipt', bytes);
}

// Barcode-label printer entrypoint. Each label arrives already drawn on a
// canvas at the printer's resolution (see BarcodeLabels.drawLabelCanvas), so
// the layout matches the label size and Arabic is shaped by the browser
// instead of depending on the printer's code page.
export async function printLabelImages(canvases) {
  const enc = newEncoder(getColumns('barcode'));
  enc.initialize();
  for (const canvas of canvases) {
    enc.align('center').image(canvas, canvas.width, canvas.height, 'threshold', 160);
    enc.cut('partial');
  }
  await send('barcode', enc.encode());
}
