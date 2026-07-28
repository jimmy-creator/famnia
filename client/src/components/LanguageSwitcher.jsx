/**
 * Locale toggle — flips between English (`/path`) and Arabic
 * (`/ar/path`) via URL navigation, so each locale has a unique
 * crawlable URL and i18next syncs from the URL on landing.
 *
 * Only rendered when VITE_FEATURE_I18N is on (store4).
 */
import { useLocation, useNavigate } from 'react-router-dom';
import i18n from '../i18n';

const I18N_ON = import.meta.env.VITE_FEATURE_I18N === 'true';

export default function LanguageSwitcher({ compact = false }) {
  const navigate = useNavigate();
  const { pathname, search, hash } = useLocation();
  if (!I18N_ON) return null;
  const isAr = pathname === '/ar' || pathname.startsWith('/ar/');
  const label = isAr ? 'English' : 'العربية';

  const switchTo = () => {
    // Flip i18n FIRST so LocaleManager doesn't see a mismatch on the
    // next render and bounce us back. Then navigate to the new URL.
    const nextLang = isAr ? 'en' : 'ar';
    i18n.changeLanguage(nextLang);
    const target = isAr
      ? (pathname.replace(/^\/ar/, '') || '/')
      : ('/ar' + (pathname === '/' ? '' : pathname));
    navigate(target + search + hash);
  };

  return (
    <button
      onClick={switchTo}
      title={`Switch to ${label}`}
      aria-label={`Switch to ${label}`}
      style={{
        padding: compact ? '0.35rem 0.6rem' : '0.5rem 0.85rem',
        background: 'transparent',
        border: '1px solid currentColor',
        borderRadius: 100,
        cursor: 'pointer',
        fontFamily: 'inherit',
        fontSize: compact ? '0.78rem' : '0.85rem',
        fontWeight: 500,
        color: 'inherit',
        opacity: 0.85,
      }}>
      {label}
    </button>
  );
}
