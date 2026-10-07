// Pin the process to the store's timezone before anything reads a clock.
// The shop and its staff are in Qatar, but the host's clock may not be, so
// left alone "today", day-range reports and printed times would all run on
// the host's clock. Imported first in index.js. Override with STORE_TIMEZONE
// (an IANA name) for a store elsewhere. The DB still stores UTC.
process.env.TZ = process.env.STORE_TIMEZONE || 'Asia/Qatar';
