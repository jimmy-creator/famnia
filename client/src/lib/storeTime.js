// Show every date and time on the store's clock, not the viewer's. The shop is
// in Qatar but the ERP may be checked from anywhere, and receipts, the daybook,
// shift times etc. format with toLocale*String() in ~50 places. Rather than
// pass a timeZone at each call, default it here; a call that names its own
// timeZone keeps it. Imported first in main.jsx, before anything renders.
export const STORE_TZ = import.meta.env.VITE_STORE_TIMEZONE || 'Asia/Qatar';

for (const method of ['toLocaleString', 'toLocaleDateString', 'toLocaleTimeString']) {
  const original = Date.prototype[method];
  Date.prototype[method] = function (locales, options) {
    return original.call(this, locales, options?.timeZone ? options : { ...options, timeZone: STORE_TZ });
  };
}
