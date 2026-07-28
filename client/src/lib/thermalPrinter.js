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
 *   printLabels(labels, opts)      -> barcode
 *   kickDrawer()                   -> receipt
 *
 *  kind ∈ 'receipt' | 'barcode'
 */
import ReceiptPrinterEncoder from '@point-of-sale/receipt-printer-encoder';

const KINDS = ['receipt', 'barcode'];
const DEFAULTS = { receipt: 48, barcode: 32 };

const key = (kind, suffix) => `pos_${kind}_${suffix}`;

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
async function pickEndpoint(device) {
  if (!device.opened) await device.open();
  if (device.configuration === null) await device.selectConfiguration(1);
  const iface = device.configuration.interfaces[0];
  await device.claimInterface(iface.interfaceNumber);
  const alt = iface.alternate || iface.alternates[0];
  const out = alt.endpoints.find((e) => e.direction === 'out');
  if (!out) throw new Error('Printer has no OUT endpoint');
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
  setFingerprint(kind, device);
  setEnabled(kind, true);
  return pickEndpoint(device);
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
const fmt = (currency, n) => `${currency} ${(parseFloat(n) || 0).toFixed(3)}`;

function buildSale(payload, currency = 'KWD') {
  const { order, change, amountTendered, location, cashier } = payload;
  const breakdown = Array.isArray(order.paymentBreakdown) ? order.paymentBreakdown : null;
  const cols = getColumns('receipt');
  const loc = getReceiptLocale();
  // Override the param so every fmt(currency, …) call below renders the
  // locale-correct symbol without touching each line.
  currency = pickCurrency(currency, loc);
  const enc = new ReceiptPrinterEncoder({ language: 'esc-pos', columns: cols });

  enc.initialize()
    .align('center').bold(true).size('normal').line(location?.name || 'Anfal Sports').bold(false);
  if (location?.address) enc.align('center').line(location.address);
  if (location?.phone) enc.align('center').line(`Tel: ${location.phone}`);
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
    const sku = it.sku || it.variant?.sku || null;
    enc.line(`  ${sku ? `${sku} · ` : ''}${it.quantity} x ${fmt(currency, it.price)}`);
  }
  enc.rule();

  if (parseFloat(order.discount || 0) > 0) {
    const subtotal = (order.items || []).reduce(
      (s, it) => s + (parseFloat(it.price) || 0) * (parseInt(it.quantity, 10) || 0), 0
    );
    enc.table(
      [{ width: colW, marginRight: 1 }, { width: cols - colW - 1, align: 'right' }],
      [
        ['Subtotal', fmt(currency, subtotal)],
        [`Discount${order.couponCode ? ` (${order.couponCode})` : ''}`, `-${fmt(currency, order.discount)}`],
      ]
    );
  }
  enc.bold(true).table(
    [{ width: colW, marginRight: 1 }, { width: cols - colW - 1, align: 'right' }],
    [['TOTAL', fmt(currency, order.totalAmount)]]
  ).bold(false);

  const tenderLabel = (m) => m === 'cash' ? 'Cash' : m === 'knet' ? 'KNET' : 'Card';
  if (breakdown) {
    for (const tn of breakdown) {
      enc.table(
        [{ width: colW, marginRight: 1 }, { width: cols - colW - 1, align: 'right' }],
        [[`Paid (${tenderLabel(tn.method)})`, fmt(currency, tn.amount)]]
      );
    }
  } else {
    const method = order.paymentMethod === 'pos_cash' ? 'Cash'
      : order.paymentMethod === 'pos_knet' ? 'KNET' : 'Card';
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

  enc.rule().align('center').line('Thank you for shopping with us!').newline().newline();
  enc.cut('partial');
  return enc.encode();
}

function buildReturn(payload, currency = 'KWD') {
  const sr = payload.salesReturn;
  const cols = getColumns('receipt');
  const loc = getReceiptLocale();
  currency = pickCurrency(currency, loc);
  const enc = new ReceiptPrinterEncoder({ language: 'esc-pos', columns: cols });
  enc.initialize()
    .align('center').bold(true).line('RETURN RECEIPT').bold(false);
  if (sr.Location?.name) enc.line(sr.Location.name);
  if (sr.Location?.phone) enc.line(`Tel: ${sr.Location.phone}`);
  enc.rule()
    .align('left')
    .line(`Return #: ${sr.returnNumber}`)
    .line(`Original: ${payload.order?.orderNumber || ''}`)
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
    const sku = it.sku || it.variant?.sku || null;
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

function buildReport(report, currency = 'KWD') {
  const cols = getColumns('receipt');
  const loc = getReceiptLocale();
  currency = pickCurrency(currency, loc);
  const enc = new ReceiptPrinterEncoder({ language: 'esc-pos', columns: cols });
  const t = report.type === 'Z' ? 'Z-REPORT' : 'X-REPORT';
  const session = report.session || {};
  const opened = session.openedAt ? new Date(session.openedAt).toLocaleString() : '—';
  const closed = session.closedAt ? new Date(session.closedAt).toLocaleString() : '—';
  const colW = Math.floor(cols * 0.65);
  const row = (l, r) => enc.table(
    [{ width: colW, marginRight: 1 }, { width: cols - colW - 1, align: 'right' }],
    [[l, r]]
  );

  enc.initialize().align('center').bold(true).line(t).bold(false);
  if (report.location?.name) enc.line(report.location.name);
  if (report.location?.phone) enc.line(`Tel: ${report.location.phone}`);
  enc.rule().align('left')
    .line(`Cashier: ${report.cashier?.name || '—'}`)
    .line(`Opened: ${opened}`);
  if (report.type === 'Z') enc.line(`Closed: ${closed}`);
  enc.rule();
  row('Orders', String(report.orderCount));
  row('Cash sales', fmt(currency, report.cashSales));
  row('Card sales', fmt(currency, report.cardSales));
  if (report.cashRefunds > 0 || report.cardRefunds > 0) {
    row('Cash refunds', `-${fmt(currency, report.cashRefunds)}`);
    row('Card refunds', `-${fmt(currency, report.cardRefunds)}`);
  }
  enc.bold(true);
  row('NET SALES', fmt(currency, report.netSales));
  enc.bold(false).rule();
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
  const enc = new ReceiptPrinterEncoder({ language: 'esc-pos', columns: cols });
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
  await send('receipt', buildSale(payload, currency));
  if (openDrawer) await kickDrawer();
}

export async function printReturn(payload, currency) {
  await send('receipt', buildReturn(payload, currency));
}

export async function printReport(report, currency) {
  await send('receipt', buildReport(report, currency));
}

// Cash drawer pulse via the receipt printer.
export async function kickDrawer() {
  const cols = getColumns('receipt');
  const enc = new ReceiptPrinterEncoder({ language: 'esc-pos', columns: cols });
  const bytes = enc.initialize().pulse(0, 60, 120).encode();
  await send('receipt', bytes);
}

// Barcode-label printer entrypoint.
export async function printLabels(labels, { currency = 'KWD' } = {}) {
  const cols = getColumns('barcode');
  const enc = new ReceiptPrinterEncoder({ language: 'esc-pos', columns: cols });
  enc.initialize();
  for (const label of labels) {
    const show = label.show || { name: true, barcode: true, sku: true, price: true };
    enc.initialize();
    if (show.name && label.name) {
      enc.align('center').bold(true).line(label.name).bold(false);
    }
    if (show.barcode && (label.code || label.productId)) {
      const value = label.code || `P${label.productId}`;
      enc.align('center').barcode(value, 'code128', { height: 60, text: false });
    }
    if (show.sku && label.code) {
      enc.align('center').size('small').line(label.code).size('normal');
    }
    if (show.price && label.price != null) {
      enc.align('center').bold(true)
        .line(`${currency} ${(parseFloat(label.price) || 0).toFixed(3)}`)
        .bold(false);
    }
    enc.newline().cut('partial');
  }
  await send('barcode', enc.encode());
}
