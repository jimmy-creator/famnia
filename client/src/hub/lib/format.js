export const CURRENCY = import.meta.env.VITE_CURRENCY_CODE || 'QAR';

/** "QAR 1,234.00" — the hub's money format. */
export const QAR = (value) =>
  `${CURRENCY} ${Number(value ?? 0).toLocaleString('en-QA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function toCsv(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [headers.join(','), ...rows.map((r) => headers.map((h) => escape(r[h])).join(','))].join('\n');
}

export function downloadFile(filename, content, type = 'text/csv;charset=utf-8') {
  // Leading byte-order mark so Excel opens the CSV as UTF-8.
  const blob = new Blob([String.fromCharCode(0xfeff) + content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Today in the browser's local calendar, YYYY-MM-DD. */
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function reference(prefix) {
  const date = today().replace(/-/g, '');
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${date}-${rand}`;
}

export const newStockReference = (kind) => reference(kind === 'in' ? 'GRN' : 'SO');
export const newStockIdempotencyKey = (kind) => `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export const STOCK_OUT_REASONS = [
  'Damaged',
  'Lost',
  'Expired',
  'Internal Use',
  'Sample',
  'Display Use',
  'Manual Correction',
  'Supplier Return',
  'Other',
];

export const STOCK_ADJUSTMENT_REASONS = [
  'Physical Count Correction',
  'Data Entry Correction',
  'Damaged Stock Correction',
  'Missing Stock Correction',
  'Opening Balance Correction',
  'Found Extra Stock',
  'Sample/Internal Use',
  'Return Correction',
  'Other',
];

export const batchLabel = (batchNumber, sourceCountry) =>
  [batchNumber, sourceCountry].filter(Boolean).join(' ') || 'No batch recorded';

export function suggestSku(name, category, size, color, index) {
  const part = (value, len) =>
    String(value || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, len);
  const segments = ['FEM', part(category, 3) || 'GEN', part(name, 4) || 'PRD', part(size, 4), part(color, 3)].filter(
    Boolean,
  );
  return `${segments.join('-')}-${String(index + 1).padStart(2, '0')}`;
}

/** "7" / " 07 " → "0007"; null when not digits. */
export function tryNormalizeProductCode(raw) {
  const value = String(raw ?? '').trim();
  if (!value || !/^\d+$/.test(value)) return null;
  return value.replace(/^0+(?=\d)/, '').padStart(4, '0');
}
