/**
 * Locale helpers — safe to import even when VITE_FEATURE_I18N is off.
 * When i18n is disabled, these fall through to the English fields.
 */
const I18N_ON = import.meta.env.VITE_FEATURE_I18N === 'true';
const CURRENCY_DEFAULT = import.meta.env.VITE_CURRENCY_SYMBOL || '₹';
const CURRENCY_AR = import.meta.env.VITE_CURRENCY_SYMBOL_AR;

function currentLocale() {
  if (!I18N_ON) return 'en';
  // Read from <html lang> rather than i18next to avoid pulling the
  // i18next module into bundles that don't enable i18n.
  if (typeof document !== 'undefined') {
    return (document.documentElement.lang || 'en').toLowerCase();
  }
  return 'en';
}

export function localizedName(obj) {
  if (!obj) return '';
  if (currentLocale().startsWith('ar') && obj.nameAr) return obj.nameAr;
  return obj.name || '';
}

export function localizedDescription(obj) {
  if (!obj) return '';
  if (currentLocale().startsWith('ar') && obj.descriptionAr) return obj.descriptionAr;
  return obj.description || '';
}

// Returns the right currency symbol/abbreviation for the active
// locale. Set VITE_CURRENCY_SYMBOL_AR=د.ك in the env to override the
// Arabic one; otherwise falls back to the default (VITE_CURRENCY_SYMBOL).
export function localizedCurrency() {
  if (currentLocale().startsWith('ar') && CURRENCY_AR) return CURRENCY_AR;
  return CURRENCY_DEFAULT;
}
