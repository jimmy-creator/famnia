import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { STORE_TZ } from "./storeTime";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// The store's calendar, whatever timezone the viewer's computer is in (the
// shop is in Qatar; the ERP may be checked from anywhere). Date filters are
// sent to the server as these plain YYYY-MM-DD strings and the server reads
// them as whole store days, so every screen agrees on what "today" is.
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: STORE_TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

/** YYYY-MM-DD of `d` (default now) in the store's timezone. */
export function localDate(d = new Date()) {
  return dayFmt.format(new Date(d));
}

/** "1 item", "3 items". */
export function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}
