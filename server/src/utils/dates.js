// Store-local calendar dates. toISOString() gives the UTC date, which in
// Qatar is still "yesterday" until 03:00; these use the process timezone
// that tz.js pins to the store's.
const pad = (n) => String(n).padStart(2, '0');

/** YYYY-MM-DD of `d` (default now) in the store's timezone. */
export function localDate(d = new Date()) {
  const x = new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

// Range bounds from a query value. A bare date means that whole store-local
// day; `new Date('2026-10-03')` alone would be UTC midnight, which cuts the
// last day off a `to` bound.
export const rangeStart = (s) => new Date(DATE_ONLY.test(s) ? `${s}T00:00:00` : s);
export const rangeEnd = (s) => new Date(DATE_ONLY.test(s) ? `${s}T23:59:59.999` : s);
