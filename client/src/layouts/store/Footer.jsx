import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Mail, MapPin, Phone, Send } from 'lucide-react';
import api from '../../api/axios';
import { localizedName } from '../../utils/i18nHelpers';
import FemniaLogo from './Logo';
import { cn } from '@/lib/utils';
import { INSTAGRAM_ACCOUNTS } from '@/lib/social';
import { DEFAULT_COMPANY, telHref, useCompany } from '@/lib/company';

const B2B_ENABLED = import.meta.env.VITE_FEATURE_B2B === 'true';
const STORE_NAME = import.meta.env.VITE_STORE_NAME || 'Femnia';


function FooterCol({ title, children, className }) {
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <h4 className="font-serif text-base tracking-wide text-white">{title}</h4>
      <div className="flex flex-col gap-2 text-sm text-white/65 [&_a]:transition-colors [&_a:hover]:text-[color:var(--gold)]">
        {children}
      </div>
    </div>
  );
}

// Brand social icons (inline SVG — avoids depending on brand icons that some
// lucide versions drop). One Instagram icon per account (see lib/social.js).
const SOCIALS = [
  ...INSTAGRAM_ACCOUNTS.map((a) => ({ label: `Instagram @${a.handle}`, href: a.url, path: 'M12 8.6A3.4 3.4 0 1 0 12 15.4 3.4 3.4 0 0 0 12 8.6Zm0 5.6a2.2 2.2 0 1 1 0-4.4 2.2 2.2 0 0 1 0 4.4Zm3.6-5.9a.8.8 0 1 1-1.6 0 .8.8 0 0 1 1.6 0ZM8.4 6.2h7.2A2.6 2.6 0 0 1 18.2 8.8v6.4a2.6 2.6 0 0 1-2.6 2.6H8.4a2.6 2.6 0 0 1-2.6-2.6V8.8a2.6 2.6 0 0 1 2.6-2.6Zm0 1.3A1.3 1.3 0 0 0 7.1 8.8v6.4a1.3 1.3 0 0 0 1.3 1.3h7.2a1.3 1.3 0 0 0 1.3-1.3V8.8a1.3 1.3 0 0 0-1.3-1.3H8.4Z' })),
  { label: 'WhatsApp', href: `https://wa.me/${DEFAULT_COMPANY.whatsapp}`, path: 'M12 5.5A6.4 6.4 0 0 0 6.3 15l-.8 3 3.1-.8A6.4 6.4 0 1 0 12 5.5Zm0 1.3a5.1 5.1 0 0 1 0 10.2 5 5 0 0 1-2.6-.7l-.2-.1-1.5.4.4-1.5-.1-.2a5.1 5.1 0 0 1 4-8.1Zm-1.7 2.4c-.1-.3-.2-.3-.4-.3h-.3a.7.7 0 0 0-.5.2c-.2.2-.6.6-.6 1.4s.6 1.6.7 1.7c.1.2 1.2 1.9 3 2.6 1.5.6 1.8.5 2.1.4.3 0 1-.4 1.1-.8.2-.4.2-.7.1-.8l-.4-.2-1-.5c-.2 0-.3-.1-.4.1l-.5.6c-.1.1-.2.2-.4.1a4.2 4.2 0 0 1-1.2-.8 4.6 4.6 0 0 1-.9-1.1c0-.2 0-.3.1-.4l.3-.3.2-.3v-.3l-.5-1.2Z' },
];

// Newsletter sign-up. Front-end only, as before — there is no subscriber
// endpoint yet, so it just acknowledges the address.
function NewsletterSignup() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <h4 className="font-serif text-base tracking-wide text-white">{t('newsletter.title')}</h4>

      {sent ? (
        <p className="text-sm text-[color:var(--gold)]">{t('newsletter.thanks')}</p>
      ) : (
        <form
          onSubmit={(e) => { e.preventDefault(); if (email.trim()) setSent(true); }}
          className="flex items-stretch"
        >
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('newsletter.placeholder')}
            aria-label={t('newsletter.placeholder')}
            className="h-11 min-w-0 flex-1 border border-white/20 bg-white/5 px-4 text-base text-white outline-none placeholder:text-white/40 focus:border-[color:var(--gold)] md:text-sm"
          />
          <button
            type="submit"
            className="inline-flex shrink-0 items-center gap-2 px-5 text-[11px] font-medium uppercase tracking-[0.14em] text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: 'var(--copper)' }}
          >
            <Send className="size-3.5" />
            <span className="hidden sm:inline">{t('newsletter.subscribe')}</span>
          </button>
        </form>
      )}

      <p className="max-w-xs text-xs leading-relaxed text-white/50">{t('footer.newsletterNote')}</p>

      <div className="mt-1 flex gap-2.5">
        {SOCIALS.map((s) => (
          <a
            key={s.label}
            href={s.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={s.label}
            title={s.label}
            className="inline-flex size-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-[color:var(--gold)] hover:text-[color:var(--bg-dark)]"
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true">
              <path d={s.path} />
            </svg>
          </a>
        ))}
      </div>
      <p className="text-xs text-white/60">
        {INSTAGRAM_ACCOUNTS.map((a, i) => (
          <span key={a.handle}>
            {i > 0 && ' · '}
            <a href={a.url} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-[color:var(--gold)]">@{a.handle}</a>
          </span>
        ))}
      </p>
    </div>
  );
}

export default function Footer() {
  const { t } = useTranslation();
  const company = useCompany();
  const [categories, setCategories] = useState([]);
  const [methods, setMethods] = useState([]);

  useEffect(() => {
    api.get('/categories').then(res => setCategories(res.data.slice(0, 6))).catch(() => {});
    // The payment strip lists whatever checkout actually offers, rather than a
    // fixed set of card logos.
    api.get('/payment/gateways').then(res => setMethods(Array.isArray(res.data) ? res.data : [])).catch(() => {});
  }, []);

  return (
    <footer className="mt-16 text-white" style={{ backgroundColor: 'var(--bg-dark)' }}>
      <div className="mx-auto max-w-7xl px-4 py-14 lg:px-8">
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-5">
          <div className="col-span-2 lg:col-span-1">
            <NewsletterSignup />
          </div>

          <FooterCol title={t('footer.storeInfo')} className="col-span-2 lg:col-span-1">
            <Link to="/" aria-label={STORE_NAME} className="mb-1 inline-flex items-center">
              <FemniaLogo tone="light" className="h-20 w-auto" title={STORE_NAME} />
            </Link>
            <span className="font-medium text-white/80">{company.legalName}</span>
            <span className="flex items-start gap-2.5">
              <MapPin className="mt-0.5 size-4 shrink-0" style={{ color: 'var(--gold)' }} />
              <span>{company.address}</span>
            </span>
            <a href={`mailto:${company.email}`} className="flex items-center gap-2.5">
              <Mail className="size-4 shrink-0" style={{ color: 'var(--gold)' }} />
              {company.email}
            </a>
            <a href={telHref(company.phone)} className="flex items-center gap-2.5" dir="ltr">
              <Phone className="size-4 shrink-0" style={{ color: 'var(--gold)' }} />
              {company.phone}
            </a>
          </FooterCol>

          <FooterCol title={t('common.categories')}>
            <Link to="/products">{t('products.allProducts')}</Link>
            {categories.map(cat => (
              <Link key={cat.id} to={`/products?category=${encodeURIComponent(cat.name)}`}>{localizedName(cat)}</Link>
            ))}
          </FooterCol>

          <FooterCol title={t('common.account')}>
            <Link to="/profile">{t('common.profile')}</Link>
            <Link to="/orders">{t('orders.title')}</Link>
            <Link to="/wishlist">{t('common.wishlist')}</Link>
            <Link to="/cart">{t('common.cart')}</Link>
            {B2B_ENABLED && <Link to="/wholesale">{t('common.wholesale')}</Link>}
          </FooterCol>

          <FooterCol title={t('footer.support')} className="col-span-2 sm:col-span-1">
            <Link to="/about">{t('footer.aboutUs')}</Link>
            <Link to="/contact">{t('footer.contactUs')}</Link>
            <Link to="/shipping-policy">{t('footer.shippingPolicy')}</Link>
            <Link to="/return-policy">{t('footer.returnPolicy')}</Link>
            <Link to="/refund-policy">{t('footer.refundPolicy')}</Link>
          </FooterCol>
        </div>
      </div>

      {/* Bottom bar — copyright, accepted payment methods, legal links. */}
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 px-4 py-5 text-xs text-white/55 md:flex-row md:justify-between lg:px-8">
          <p className="order-3 text-center md:order-1 md:text-start">
            {t('footer.copyright', { year: new Date().getFullYear(), store: company.legalName })}
            {company.crNumber && <span className="whitespace-nowrap"> · {t('footer.crNumber', { number: company.crNumber })}</span>}
          </p>

          {methods.length > 0 && (
            <ul className="order-1 flex flex-wrap items-center justify-center gap-2 md:order-2">
              {methods.map((m) => (
                <li
                  key={m.id}
                  className="rounded border border-white/15 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.1em] text-white/70"
                >
                  {m.name}
                </li>
              ))}
            </ul>
          )}

          <p className="order-2 flex items-center gap-2 md:order-3">
            <Link to="/privacy-policy" className="transition-colors hover:text-[color:var(--gold)]">{t('footer.privacyPolicy')}</Link>
            <span aria-hidden="true">|</span>
            <Link to="/terms" className="transition-colors hover:text-[color:var(--gold)]">{t('footer.terms')}</Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
