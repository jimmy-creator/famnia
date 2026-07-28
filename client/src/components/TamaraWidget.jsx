import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

// Tamara promotional widget ("Pay in 4 — 0% interest" messaging).
// Renders nothing unless VITE_TAMARA_PUBLIC_KEY is configured, so the storefront
// stays clean wherever Tamara isn't set up. Docs: cdn.tamara.co/widget-v2.
const PUBLIC_KEY = import.meta.env.VITE_TAMARA_PUBLIC_KEY;
const COUNTRY = import.meta.env.VITE_TAMARA_WIDGET_COUNTRY || 'AE';
const SCRIPT_SRC = 'https://cdn.tamara.co/widget-v2/tamara-widget.js';

// Load the widget script once per page; the custom element upgrades all
// <tamara-widget> tags on load and again on TamaraWidgetV2.refresh().
let scriptPromise = null;
function loadTamaraWidget(lang) {
  window.tamaraWidgetConfig = { lang, country: COUNTRY, publicKey: PUBLIC_KEY };
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = SCRIPT_SRC;
      s.defer = true;
      s.onload = () => resolve(true);
      s.onerror = () => resolve(false);
      document.body.appendChild(s);
    });
  }
  return scriptPromise;
}

export default function TamaraWidget({ amount, inlineType = '2', className }) {
  const { i18n } = useTranslation();
  const lang = i18n.language?.startsWith('ar') ? 'ar' : 'en';

  // Re-render the widget whenever the amount or language changes (SPA navigation,
  // variant price switch, language toggle). The element doesn't observe `amount`
  // itself, so refresh() is what repaints it.
  useEffect(() => {
    if (!PUBLIC_KEY || !amount) return;
    let cancelled = false;
    loadTamaraWidget(lang).then((ok) => {
      if (cancelled || !ok) return;
      if (window.tamaraWidgetConfig) window.tamaraWidgetConfig.lang = lang;
      window.TamaraWidgetV2?.refresh?.();
    });
    return () => { cancelled = true; };
  }, [amount, lang]);

  if (!PUBLIC_KEY || !amount) return null;

  return (
    <div className={className}>
      <tamara-widget type="tamara-summary" inline-type={inlineType} amount={String(amount)} />
    </div>
  );
}
