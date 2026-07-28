/**
 * i18next bootstrap for the storefront.
 *
 * Only initialised when VITE_FEATURE_I18N is on (store4). Other
 * stores never import this — the rest of the app uses plain strings.
 *
 * Locale detection order:
 *   1. localStorage 'pos_locale' (user explicitly switched)
 *   2. navigator.language (browser)
 *   3. fallback to English
 *
 * Applies dir="rtl" + lang="<code>" to <html> on every change and
 * fires a re-render via the LocaleContext provider above the app.
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import ar from './ar.json';

export const SUPPORTED = ['en', 'ar'];
export const RTL_LOCALES = new Set(['ar', 'he', 'fa', 'ur']);

// Locale is driven purely by the URL — /ar/* serves Arabic, anything
// else is English. No localStorage cache, no navigator-language sniff.
// Keeping the URL as the only source of truth means a crawlable,
// shareable Arabic URL works deterministically (Googlebot on
// /ar/products/foo gets Arabic; on /products/foo it gets English) and
// users never get auto-redirected into a locale they didn't ask for.
//
// Clean up any cached pos_locale from older builds so existing
// browsers stop being routed by stale localStorage.
try { localStorage.removeItem('pos_locale'); } catch { /* sandbox */ }

const pathLocale = (() => {
  if (typeof window === 'undefined') return 'en';
  const p = window.location.pathname;
  return (p === '/ar' || p.startsWith('/ar/')) ? 'ar' : 'en';
})();

i18n
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en }, ar: { translation: ar } },
    lng: pathLocale,
    fallbackLng: 'en',
    supportedLngs: SUPPORTED,
    interpolation: { escapeValue: false },
  });

// Apply lang to <html> whenever the locale changes. Layout stays LTR
// even in Arabic — icons/buttons/banner text keep their positions;
// Arabic text runs still render right-to-left natively within elements.
function applyDirection(lng) {
  document.documentElement.dir = 'ltr';
  document.documentElement.lang = lng;
}
applyDirection(i18n.language || 'en');
i18n.on('languageChanged', applyDirection);

// Convenience for non-React code (e.g. product display helpers).
export function pickLocalized(obj, locale = i18n.language, baseKey = 'name') {
  if (!obj) return '';
  const arKey = `${baseKey}Ar`;
  if (locale === 'ar' && obj[arKey]) return obj[arKey];
  return obj[baseKey];
}

export default i18n;
