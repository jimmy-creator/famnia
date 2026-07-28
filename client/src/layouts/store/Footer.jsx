import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/axios';
import { localizedName } from '../../utils/i18nHelpers';
import { Separator } from '@/components/ui/separator';

const B2B_ENABLED = import.meta.env.VITE_FEATURE_B2B === 'true';
const STORE_NAME = import.meta.env.VITE_STORE_NAME || 'Elegant Bayt';

function FooterCol({ title, children }) {
  return (
    <div className="flex flex-col gap-2.5">
      <h4 className="text-sm font-semibold uppercase tracking-wider text-white">{title}</h4>
      <div className="flex flex-col gap-2 text-sm text-white/70 [&_a]:transition-colors [&_a:hover]:text-[color:var(--gold)]">
        {children}
      </div>
    </div>
  );
}

// Brand social icons (inline SVG — avoids depending on brand icons that some
// lucide versions drop). Links are placeholders until real profiles are shared.
const SOCIALS = [
  { label: 'Facebook', href: '#', path: 'M13.5 9H15V6.5h-1.9C11 6.5 10 7.8 10 9.7V11H8.5v2.5H10V19h2.6v-5.5h1.8l.3-2.5h-2.1V9.9c0-.6.2-.9.9-.9Z' },
  { label: 'Instagram', href: '#', path: 'M12 8.6A3.4 3.4 0 1 0 12 15.4 3.4 3.4 0 0 0 12 8.6Zm0 5.6a2.2 2.2 0 1 1 0-4.4 2.2 2.2 0 0 1 0 4.4Zm3.6-5.9a.8.8 0 1 1-1.6 0 .8.8 0 0 1 1.6 0ZM8.4 6.2h7.2A2.6 2.6 0 0 1 18.2 8.8v6.4a2.6 2.6 0 0 1-2.6 2.6H8.4a2.6 2.6 0 0 1-2.6-2.6V8.8a2.6 2.6 0 0 1 2.6-2.6Zm0 1.3A1.3 1.3 0 0 0 7.1 8.8v6.4a1.3 1.3 0 0 0 1.3 1.3h7.2a1.3 1.3 0 0 0 1.3-1.3V8.8a1.3 1.3 0 0 0-1.3-1.3H8.4Z' },
  { label: 'WhatsApp', href: '#', path: 'M12 5.5A6.4 6.4 0 0 0 6.3 15l-.8 3 3.1-.8A6.4 6.4 0 1 0 12 5.5Zm0 1.3a5.1 5.1 0 0 1 0 10.2 5 5 0 0 1-2.6-.7l-.2-.1-1.5.4.4-1.5-.1-.2a5.1 5.1 0 0 1 4-8.1Zm-1.7 2.4c-.1-.3-.2-.3-.4-.3h-.3a.7.7 0 0 0-.5.2c-.2.2-.6.6-.6 1.4s.6 1.6.7 1.7c.1.2 1.2 1.9 3 2.6 1.5.6 1.8.5 2.1.4.3 0 1-.4 1.1-.8.2-.4.2-.7.1-.8l-.4-.2-1-.5c-.2 0-.3-.1-.4.1l-.5.6c-.1.1-.2.2-.4.1a4.2 4.2 0 0 1-1.2-.8 4.6 4.6 0 0 1-.9-1.1c0-.2 0-.3.1-.4l.3-.3.2-.3v-.3l-.5-1.2Z' },
];

export default function Footer() {
  const { t } = useTranslation();
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    api.get('/categories').then(res => setCategories(res.data.slice(0, 5))).catch(() => {});
  }, []);

  return (
    <footer className="mt-16 text-white" style={{ backgroundColor: 'var(--copper)' }}>
      <div className="mx-auto max-w-7xl px-4 py-14 lg:px-8">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-3 lg:grid-cols-5">
          <div className="col-span-2 md:col-span-3 lg:col-span-1">
            <Link to="/" className="flex items-center gap-2.5">
              <span className="inline-flex items-center justify-center rounded-lg bg-white p-1.5">
                <img src="/images/elegant-bayt-monogram.png" alt={STORE_NAME} className="h-7 w-auto" />
              </span>
              <span className="flex flex-col leading-none">
                <span className="font-serif text-base font-extrabold tracking-[0.14em]">
                  ELEGANT <span style={{ color: 'var(--gold)' }}>BAYT</span>
                </span>
                <span className="mt-1 text-[8px] font-medium uppercase tracking-[0.28em] text-white/60">
                  {t('brand.tagline')}
                </span>
              </span>
            </Link>
            <p className="mt-4 max-w-xs text-sm text-white/70">{t('home.seoDescription')}</p>
            <div className="mt-5 flex gap-2.5">
              {SOCIALS.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  aria-label={s.label}
                  className="inline-flex size-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-[color:var(--gold)] hover:text-[color:var(--copper)]"
                >
                  <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true">
                    <path d={s.path} />
                  </svg>
                </a>
              ))}
            </div>
          </div>

          <FooterCol title={t('footer.shop')}>
            <Link to="/products">{t('products.allProducts')}</Link>
            {categories.map(cat => (
              <Link key={cat.id} to={`/products?category=${encodeURIComponent(cat.name)}`}>{localizedName(cat)}</Link>
            ))}
          </FooterCol>

          <FooterCol title={t('common.account')}>
            <Link to="/cart">{t('common.cart')}</Link>
            <Link to="/orders">{t('common.products')}</Link>
            <Link to="/profile">{t('common.profile')}</Link>
            <Link to="/wishlist">{t('common.wishlist')}</Link>
          </FooterCol>

          <FooterCol title={t('footer.company')}>
            <Link to="/about">{t('footer.aboutUs')}</Link>
            <Link to="/contact">{t('footer.contactUs')}</Link>
            {B2B_ENABLED && <Link to="/wholesale">{t('common.wholesale')}</Link>}
            <Link to="/privacy-policy">{t('footer.privacyPolicy')}</Link>
            <Link to="/terms">{t('footer.terms')}</Link>
          </FooterCol>

          <FooterCol title={t('footer.support')}>
            <Link to="/shipping-policy">{t('footer.shippingPolicy')}</Link>
            <Link to="/refund-policy">{t('footer.refundPolicy')}</Link>
            <Link to="/return-policy">{t('footer.returnPolicy')}</Link>
          </FooterCol>
        </div>

        <Separator className="my-8 bg-white/15" />

        <div className="text-center text-xs text-white/60">
          {t('footer.copyright', { year: new Date().getFullYear(), store: STORE_NAME })}
        </div>
      </div>
    </footer>
  );
}
