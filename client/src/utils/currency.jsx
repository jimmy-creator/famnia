import { localizedCurrency } from './i18nHelpers';

// Static export for back-compat (admin/POS/finance code that's not
// translated). Storefront callers should prefer the locale-aware
// `<CurrencySymbol />` component or `localizedCurrency()` helper.
export const CURRENCY = import.meta.env.VITE_CURRENCY_SYMBOL || '₹';
export const CURRENCY_ICON = import.meta.env.VITE_CURRENCY_ICON || '';

// Decimal places for displayed prices. Defaults to 2 (INR/AED); store4 sets
// VITE_CURRENCY_DECIMALS=3 for Kuwaiti Dinar (fils). Single source of truth —
// all customer-facing price formatting should go through formatPrice().
export const CURRENCY_DECIMALS = (() => {
  const n = parseInt(import.meta.env.VITE_CURRENCY_DECIMALS, 10);
  return Number.isFinite(n) && n >= 0 && n <= 4 ? n : 2;
})();

// step= value for <input type="number"> price fields: 0.01 for 2dp, 0.001 for 3dp.
export const PRICE_STEP = (1 / 10 ** CURRENCY_DECIMALS).toFixed(CURRENCY_DECIMALS);

// Format a numeric price with the store's decimal precision.
export function formatPrice(value) {
  return (parseFloat(value) || 0).toFixed(CURRENCY_DECIMALS);
}

// Locale-aware currency label — always rendered as text (e.g. "QAR" / "ر.ق"),
// never an image glyph. Re-evaluates on every render so it flips when the user
// toggles the language switcher.
export function CurrencySymbol({ className = '' }) {
  return <span className={className}>{localizedCurrency()}</span>;
}
