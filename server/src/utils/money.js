// Money precision for the store's currency — CURRENCY_DECIMALS in .env
// (2 for QAR), the same setting the invoice/email/PO-PDF services read and
// the client mirrors as VITE_CURRENCY_DECIMALS. POS totals must round
// exactly as the till does or "tenders must equal the total" fails.
//
// Read at call time: dotenv runs after ES imports resolve.
export function dp() {
  const n = parseInt(process.env.CURRENCY_DECIMALS, 10);
  return Number.isFinite(n) && n >= 0 && n <= 4 ? n : 2;
}

/** Round to the currency's precision, as a number. */
export const roundMoney = (n) => +(+n || 0).toFixed(dp());
