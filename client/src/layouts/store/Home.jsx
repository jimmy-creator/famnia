import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight, Package, Trash2, ShoppingBasket, Boxes, UtensilsCrossed,
  Bath, Sparkles, LayoutGrid, Users, BadgeCheck, ShieldCheck, Truck,
} from 'lucide-react';
import api from '../../api/axios';
import { localizedName } from '../../utils/i18nHelpers';
import SEO from '../../components/SEO';
import ProductCard from './ProductCard';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const STORE_NAME = import.meta.env.VITE_STORE_NAME || 'Elegant Bayt';

// Category → icon (keyword match, falls back to a generic box).
const CATEGORY_ICONS = [
  [/storage|box/i, Boxes],
  [/dust|bin|trash|waste/i, Trash2],
  [/laundry|basket|hamper/i, ShoppingBasket],
  [/organ/i, Package],
  [/kitchen|utensil|dining/i, UtensilsCrossed],
  [/bath|toilet/i, Bath],
  [/clean|mop/i, Sparkles],
];
function iconFor(name = '') {
  for (const [re, Icon] of CATEGORY_ICONS) if (re.test(name)) return Icon;
  return Package;
}

// Stats content lives in i18n (stats.*) — built inside StatsBar so it
// re-renders on locale change.

function SectionHead({ title, to }) {
  const { t } = useTranslation();
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <h2 className="font-serif text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{title}</h2>
      <Link to={to} className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-primary hover:underline">
        {t('common.viewAll')} <ArrowRight className="size-3.5" />
      </Link>
    </div>
  );
}

function ProductGrid({ products }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {products.map((p) => <ProductCard key={p.id} product={p} />)}
    </div>
  );
}

function Hero() {
  const { t } = useTranslation();
  return (
    <section className="relative overflow-hidden border-b border-border">
      {/* Full-bleed background photo */}
      <img
        src="/images/eb-hero.webp"
        alt={`${STORE_NAME} plastic home appliances`}
        className="absolute inset-0 h-full w-full object-cover object-right"
        fetchPriority="high"
      />
      {/* Left scrim so the copy stays legible over the photo (stronger on mobile) */}
      <div className="absolute inset-0 bg-gradient-to-r from-background via-background/90 to-background/40 sm:via-background/55 sm:to-transparent lg:via-background/45" />

      <div className="relative mx-auto flex min-h-[440px] max-w-7xl items-center px-4 py-14 sm:min-h-[500px] lg:min-h-[580px] lg:px-8">
        <div className="max-w-lg">
          <p className="text-xs font-semibold uppercase tracking-[0.25em]" style={{ color: 'var(--gold)' }}>
            {t('hero.kicker')}
          </p>
          <h1 className="mt-4 font-serif text-4xl font-extrabold leading-[1.05] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            {t('hero.title1')}<br />{t('hero.title2')}
          </h1>
          <p className="mt-5 max-w-md text-base text-muted-foreground">
            {t('hero.desc')}
          </p>
          <div className="mt-8">
            <Button asChild size="lg" className="rounded-full px-7">
              <Link to="/products">{t('common.shopNow', { defaultValue: 'Shop Now' })} <ArrowRight className="size-4" /></Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Floating trust badge */}
      <div className="absolute bottom-5 right-5 hidden rounded-xl bg-white px-4 py-3 shadow-lg ring-1 ring-border sm:block">
        <p className="text-[11px] font-medium text-muted-foreground">{t('hero.trustedBy')}</p>
        <p className="text-sm font-bold text-foreground">18K+ <span className="font-medium text-muted-foreground">{t('hero.customers')}</span></p>
      </div>
    </section>
  );
}

function CategoryStrip({ categories }) {
  const { t } = useTranslation();
  if (!categories.length) return null;
  const items = categories.slice(0, 7);
  return (
    <section className="mx-auto max-w-7xl px-4 lg:px-8">
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 py-8 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-4 sm:gap-4 sm:overflow-visible sm:px-0 lg:grid-cols-8">
        {items.map((c) => {
          const Icon = iconFor(c.name);
          return (
            <Link
              key={c.id || c.name}
              to={`/products?category=${encodeURIComponent(c.name)}`}
              className="group flex aspect-square w-28 shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-card text-center transition-all hover:border-primary/40 hover:shadow-md sm:w-auto"
            >
              {c.image ? (
                <img
                  src={c.image}
                  alt={localizedName(c)}
                  loading="lazy"
                  className="min-h-0 w-full flex-1 object-contain p-2 transition-transform group-hover:scale-105"
                />
              ) : (
                <span className="flex min-h-0 w-full flex-1 items-center justify-center bg-[color:var(--bg-warm)] text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <Icon className="size-7" />
                </span>
              )}
              <span className="shrink-0 px-1.5 py-2 text-xs font-medium text-foreground">{localizedName(c)}</span>
            </Link>
          );
        })}
        <Link
          to="/products"
          className="group flex aspect-square w-28 shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-card text-center transition-all hover:border-primary/40 hover:shadow-md sm:w-auto"
        >
          <span className="flex min-h-0 w-full flex-1 items-center justify-center bg-[color:var(--bg-warm)] text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
            <LayoutGrid className="size-7" />
          </span>
          <span className="shrink-0 px-1.5 py-2 text-xs font-medium text-foreground">{t('products.allProducts')}</span>
        </Link>
      </div>
    </section>
  );
}

function StatsBar() {
  const { t } = useTranslation();
  const stats = [
    { icon: Users, primary: '18K+', secondary: t('stats.happyCustomers') },
    { icon: BadgeCheck, primary: '500+', secondary: t('stats.qualityProducts') },
    { icon: ShieldCheck, primary: '95%', secondary: t('stats.satisfactionRate') },
    { icon: Truck, primary: t('stats.fastDelivery'), secondary: t('stats.acrossCountry') },
  ];
  return (
    <section id="why" className="mx-auto max-w-7xl scroll-mt-20 px-4 lg:px-8">
      <div className="grid grid-cols-2 gap-6 rounded-2xl px-6 py-8 sm:grid-cols-4 sm:px-10" style={{ backgroundColor: 'var(--copper)' }}>
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.secondary} className="flex items-center gap-3 text-white">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/10" style={{ color: 'var(--gold)' }}>
                <Icon className="size-5" />
              </span>
              <div className="min-w-0 leading-tight">
                <p className="text-lg font-bold">{stat.primary}</p>
                <p className="text-xs text-white/70">{stat.secondary}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function PromoBand() {
  const { t } = useTranslation();
  return (
    <section className="mx-auto mt-16 max-w-7xl px-4 lg:px-8">
      <div className="relative overflow-hidden rounded-2xl border border-border">
        {/* Full-bleed background photo */}
        <img
          src="/images/eb-promo.webp"
          alt="Organized plastic storage solutions"
          className="absolute inset-0 h-full w-full object-cover object-right"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/90 to-background/30 sm:via-background/55 sm:to-transparent" />
        <div className="relative flex min-h-[300px] max-w-md flex-col justify-center gap-4 p-8 sm:min-h-[360px] sm:p-12">
          <h2 className="font-serif text-3xl font-extrabold leading-tight tracking-tight text-foreground sm:text-4xl">
            {t('promo.title1')}<br /><span className="text-primary">{t('promo.title2')}</span>
          </h2>
          <p className="max-w-xs text-muted-foreground">{t('promo.desc')}</p>
          <Button asChild size="lg" className="mt-2 w-fit rounded-full px-7">
            <Link to="/products">{t('promo.explore')} <ArrowRight className="size-4" /></Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

function Newsletter() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  return (
    <section className="mx-auto mt-16 max-w-7xl px-4 lg:px-8">
      <div className="rounded-2xl border border-border bg-card p-8 sm:p-10">
        <div className="flex flex-col items-center gap-6 md:flex-row md:justify-between">
          <div className="text-center md:text-left">
            <h3 className="font-serif text-2xl font-bold tracking-tight text-foreground">{t('newsletter.title')}</h3>
            <p className="mt-1 text-muted-foreground">
              {t('newsletter.offerPre')} <span className="font-semibold" style={{ color: 'var(--gold)' }}>{t('newsletter.offerHighlight')}</span> {t('newsletter.offerPost')}
            </p>
          </div>
          {sent ? (
            <p className="text-sm font-medium text-primary">{t('newsletter.thanks')}</p>
          ) : (
            <form
              onSubmit={(e) => { e.preventDefault(); if (email.trim()) setSent(true); }}
              className="flex w-full max-w-md items-center gap-2"
            >
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('newsletter.placeholder')}
                className="h-11 min-w-0 flex-1 rounded-full border border-input bg-background px-5 text-base md:text-sm outline-none transition-[box-shadow] focus:ring-[3px] focus:ring-ring/40"
              />
              <Button type="submit" size="lg" className="rounded-full px-6">{t('newsletter.subscribe')}</Button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  const { t } = useTranslation();
  const [featured, setFeatured] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [banners, setBanners] = useState(() => {
    const cached = localStorage.getItem('cached-banners');
    return cached ? JSON.parse(cached) : [];
  });
  const [activeBanner, setActiveBanner] = useState(0);

  useEffect(() => {
    api.get('/settings/banners')
      .then((res) => {
        if (Array.isArray(res.data) && res.data.length > 0) {
          setBanners(res.data);
          localStorage.setItem('cached-banners', JSON.stringify(res.data));
          res.data.forEach((b) => { if (b.image) { const img = new Image(); img.src = b.image; } });
        }
      })
      .catch(() => {});

    api.get('/categories')
      .then((res) => setCategories(Array.isArray(res.data) ? res.data : []))
      .catch(() => {});

    api.get('/products?featured=true&limit=10')
      .then((res) => setFeatured(res.data.products))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const autoplayRef = useRef(null);
  const touchStart = useRef(null);
  const touchDelta = useRef(0);

  const goTo = useCallback((index) => {
    setActiveBanner(index);
    clearInterval(autoplayRef.current);
    autoplayRef.current = setInterval(() => {
      setActiveBanner((prev) => (prev + 1) % banners.length);
    }, 5000);
  }, [banners.length]);

  useEffect(() => {
    if (banners.length <= 1) return;
    autoplayRef.current = setInterval(() => {
      setActiveBanner((prev) => (prev + 1) % banners.length);
    }, 5000);
    return () => clearInterval(autoplayRef.current);
  }, [banners.length]);

  const handleTouchStart = (e) => { touchStart.current = e.touches[0].clientX; touchDelta.current = 0; };
  const handleTouchMove = (e) => { if (touchStart.current !== null) touchDelta.current = e.touches[0].clientX - touchStart.current; };
  const handleTouchEnd = () => {
    if (Math.abs(touchDelta.current) > 50) {
      if (touchDelta.current < 0 && activeBanner < banners.length - 1) goTo(activeBanner + 1);
      else if (touchDelta.current > 0 && activeBanner > 0) goTo(activeBanner - 1);
    }
    touchStart.current = null;
    touchDelta.current = 0;
  };

  return (
    <div>
      <SEO title={t('home.seoTitle')} description={t('home.seoDescription')} />

      {/* ── Hero: admin banner carousel if configured, else branded hero ─── */}
      {banners.length > 0 ? (
        <section
          className="relative overflow-hidden"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="flex transition-transform duration-500 ease-out" style={{ transform: `translateX(-${activeBanner * 100}%)` }}>
            {banners.map((banner, i) => (
              <Link key={i} to={banner.link || '/products'} className="relative block w-full shrink-0">
                <picture>
                  {banner.mobileImage && <source media="(max-width: 720px)" srcSet={banner.mobileImage} />}
                  <img
                    src={banner.image}
                    alt={banner.title || ''}
                    className="aspect-[4/5] w-full object-cover sm:aspect-[16/7]"
                    fetchPriority={i === 0 ? 'high' : 'auto'}
                    loading={i === 0 ? 'eager' : 'lazy'}
                  />
                </picture>
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 mx-auto max-w-7xl p-6 text-white sm:p-10 lg:px-8">
                  {banner.subtitle && <p className="mb-2 text-xs font-medium uppercase tracking-[0.2em] text-white/80">{banner.subtitle}</p>}
                  {banner.title && <h2 className="max-w-xl font-serif text-3xl font-semibold sm:text-5xl">{banner.title}</h2>}
                </div>
              </Link>
            ))}
          </div>
          {banners.length > 1 && (
            <div className="absolute inset-x-0 bottom-4 flex justify-center gap-2">
              {banners.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  className={cn('h-1.5 rounded-full bg-white/50 transition-all', activeBanner === i ? 'w-6 bg-white' : 'w-1.5')}
                  onClick={() => goTo(i)}
                  aria-label={`Banner ${i + 1}`}
                />
              ))}
            </div>
          )}
        </section>
      ) : (
        <Hero />
      )}

      <CategoryStrip categories={categories} />

      <StatsBar />

      {/* ── Best sellers ─── */}
      <section className="mx-auto mt-16 max-w-7xl px-4 lg:px-8">
        <SectionHead title={t('home.bestSellersTitle', { defaultValue: 'Best Selling Products' })} to="/products" />
        {loading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-3">
                <Skeleton className="aspect-square w-full rounded-lg" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/3" />
              </div>
            ))}
          </div>
        ) : (
          <ProductGrid products={featured} />
        )}
      </section>

      <PromoBand />

      <Newsletter />
    </div>
  );
}
