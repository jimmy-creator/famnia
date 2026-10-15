import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Headphones,
  RotateCcw,
  ShieldCheck,
  Truck,
} from 'lucide-react';
import api from '../../api/axios';
import { localizedName } from '../../utils/i18nHelpers';
import SEO from '../../components/SEO';
import ProductCard from './ProductCard';
import { Skeleton } from '@/components/ui/skeleton';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { cn } from '@/lib/utils';

const STORE_NAME = import.meta.env.VITE_STORE_NAME || 'Femnia';

// Artwork shown until banners are configured in Admin → Settings → Theme.
// Image-only by design: titles and subtitles are authored per-banner in Admin,
// so a default banner carries no baked-in copy.
const FALLBACK_HERO = {
  image: '/images/femnia-hero.webp',
  mobileImage: '/images/femnia-hero-mobile.webp',
};

// Must stay in lockstep with Tailwind's `lg` (1024px), which is where the
// banners switch to their fixed-height desktop layout. If this is narrower,
// widths between it and `lg` get the mobile LAYOUT but the desktop IMAGE.
const MOBILE_BANNER_MEDIA = '(max-width: 1023px)';

// The "All products" grid is server-paginated — Back / More step through it.
const PAGE_SIZE = 12;
// The arrivals rail is one horizontal scroll, so it fetches its own short list.
const RAIL_LIMIT = 10;

/* ── Small shared bits ────────────────────────────────────────────────── */

// Section heading: title leading, an optional link or control trailing.
function SectionHead({ title, note, to, actionLabel }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <h2 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">{title}</h2>
      {to ? (
        <Link
          to={to}
          className="group inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold text-primary"
        >
          {actionLabel}
          <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5 rtl:rotate-180" />
        </Link>
      ) : note ? (
        <span className="shrink-0 text-[13px] text-muted-foreground">{note}</span>
      ) : null}
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-card p-3 ring-1 ring-border/70">
      <Skeleton className="aspect-[3/4] w-full rounded-xl" />
      <Skeleton className="h-3 w-3/4" />
      <Skeleton className="h-3 w-1/3" />
    </div>
  );
}

/* ── Banners ──────────────────────────────────────────────────────────── */

/**
 * One admin-configured promo image with optional overlaid copy.
 *
 * Mobile renders the image at its natural height so nothing is cropped; from
 * `lg` the panel takes the height its parent gives it and the image fills it.
 * `align` places the copy.
 */
function PromoPanel({ banner, className, align = 'start' }) {
  if (!banner?.image) return null;
  const hasCopy = !!(banner.subtitle || banner.title || banner.cta);
  return (
    <div className={cn('relative overflow-hidden rounded-3xl bg-[color:var(--bg-warm)]', className)}>
      <picture>
        {banner.mobileImage && <source media={MOBILE_BANNER_MEDIA} srcSet={banner.mobileImage} />}
        <img
          src={banner.image}
          alt={banner.title || ''}
          loading="lazy"
          className="block h-auto w-full lg:absolute lg:inset-0 lg:size-full lg:object-cover lg:object-center"
        />
      </picture>

      {hasCopy && (
        <div
          className={cn(
            'pointer-events-none absolute inset-0 flex flex-col justify-center gap-1.5 p-6 sm:p-8',
            align === 'end' ? 'items-end text-end' : 'items-start text-start',
          )}
        >
          {banner.subtitle && (
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-foreground/70">
              {banner.subtitle}
            </p>
          )}
          {banner.title && (
            <h3 className="max-w-[60%] text-2xl font-bold leading-tight text-foreground sm:text-3xl">
              {banner.title}
            </h3>
          )}
          {banner.link && (
            <span className="mt-2 rounded-full bg-primary px-4 py-2 text-[11px] font-semibold text-primary-foreground">
              {banner.cta || 'Shop now'}
            </span>
          )}
        </div>
      )}

      {banner.link && (
        <Link to={banner.link} className="absolute inset-0" aria-label={banner.title || STORE_NAME} />
      )}
    </div>
  );
}

// Rotating circular seal over the hero photo. Text and visibility come from
// Admin → Settings → Theme → Hero Seal.
function EleganceSeal({ seal }) {
  if (!seal?.enabled || !seal.text) return null;
  // The text is repeated around the circle, so it needs a trailing separator
  // to read continuously as it loops.
  const ring = `${seal.text} · `;
  return (
    <div className="pointer-events-none absolute bottom-3 end-3 size-16 sm:bottom-6 sm:end-6 sm:size-24 lg:size-28">
      <svg viewBox="0 0 120 120" className="size-full animate-[spin_22s_linear_infinite]">
        <defs>
          <path id="seal-arc" d="M60,60 m-44,0 a44,44 0 1,1 88,0 a44,44 0 1,1 -88,0" fill="none" />
        </defs>
        <text fill="#fff" fontSize="11" letterSpacing="4.5" fontFamily="var(--font-body), sans-serif">
          <textPath href="#seal-arc" startOffset="4%">{ring}</textPath>
        </text>
      </svg>
      <svg viewBox="0 0 24 24" className="absolute left-1/2 top-1/2 size-6 -translate-x-1/2 -translate-y-1/2 fill-white">
        <path d="M12 2 13.6 9.2 20.5 12 13.6 14.8 12 22 10.4 14.8 3.5 12 10.4 9.2Z" />
      </svg>
      <span className="sr-only">{seal.text}</span>
    </div>
  );
}

/**
 * The hero block: a rounded banner carousel, with two promo panels stacked
 * beside it from `lg`.
 *
 * Below `lg` there is no side column — every banner is folded into the carousel
 * as another slide (see `carouselSlides` in the page component) and the
 * customer swipes through them. Stacking them instead meant three or four
 * full-width images to scroll past before reaching a product.
 *
 * `compact` is the same breakpoint as the `lg:` prefixes here, driven from JS
 * because the slide LIST differs between the two layouts, not just its style.
 */
function HeroBlock({ slides, active, seal, promos, compact, onSelect, onTouchStart, onTouchMove, onTouchEnd }) {
  const current = slides[active];
  // With no promo banners configured the carousel takes the whole row rather
  // than leaving a two-thirds-wide banner against dead space.
  const hasPromos = !!(promos[0] || promos[1]);
  return (
    <section className="mx-auto max-w-7xl px-4 pt-5 lg:px-8">
      <div className="grid gap-4 lg:h-[440px] lg:grid-cols-3">
        <div
          className={cn(
            'relative overflow-hidden rounded-3xl bg-[color:var(--bg-warm)] lg:h-full',
            // Mixed-ratio slides (a wide hero next to 1.57 promo crops) would
            // resize the block on every advance, so below `lg` the frame is
            // fixed at 16:9 — between the two — and images cover it.
            'aspect-[16/9] lg:aspect-auto',
            hasPromos ? 'lg:col-span-2' : 'lg:col-span-3',
          )}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          {slides.map((slide, i) => (
            <div
              key={i}
              className={cn(
                'absolute inset-0 transition-opacity duration-700',
                active === i ? 'opacity-100' : 'pointer-events-none opacity-0',
              )}
              aria-hidden={active !== i}
            >
              {slide.image ? (
                <picture>
                  {slide.mobileImage && <source media={MOBILE_BANNER_MEDIA} srcSet={slide.mobileImage} />}
                  <img
                    src={slide.image}
                    alt={slide.title || STORE_NAME}
                    fetchPriority={i === 0 ? 'high' : 'auto'}
                    loading={i === 0 ? 'eager' : 'lazy'}
                    className="absolute inset-0 size-full object-cover object-center"
                  />
                </picture>
              ) : (
                <div className="absolute inset-0 bg-[color:var(--bg-warm)]" />
              )}
              {slide.link && (
                <Link to={slide.link} className="absolute inset-0 z-10" aria-label={slide.title || STORE_NAME} />
              )}
            </div>
          ))}

          {/* Copy comes only from the banner configured in Admin. With no
              title/subtitle set the hero renders as a clean image. */}
          <div className="pointer-events-none absolute inset-0 flex items-center p-6 sm:p-10">
            {(current?.subtitle || current?.title) && (
              <div className="max-w-sm">
                {current.subtitle && (
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-foreground/70 sm:text-[11px]">
                    {current.subtitle}
                  </p>
                )}
                {current.title && (
                  <h1 className="mt-2 text-3xl font-extrabold leading-[1.05] tracking-tight text-foreground sm:text-5xl">
                    {current.title}
                  </h1>
                )}
                <span className="mt-4 block h-1 w-12 rounded-full sm:w-16" style={{ backgroundColor: 'var(--copper)' }} />
              </div>
            )}
          </div>

          <EleganceSeal seal={seal} />

          {slides.length > 1 && (
            <div className="absolute inset-x-0 bottom-4 z-20 flex justify-center gap-1.5">
              {slides.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onSelect(i)}
                  aria-label={`Slide ${i + 1}`}
                  className={cn(
                    'h-1.5 rounded-full transition-all',
                    active === i ? 'w-6 bg-[color:var(--copper)]' : 'w-1.5 bg-foreground/25',
                  )}
                />
              ))}
            </div>
          )}
        </div>

        {/* Two stacked promos beside the carousel. Slots left empty in Admin
            simply don't render, and the column collapses if neither is set.
            Hidden below `lg`, where these are carousel slides instead. */}
        {hasPromos && !compact && (
          <div className="flex flex-col gap-4 lg:h-full">
            <PromoPanel banner={promos[0]} align="end" className="lg:min-h-0 lg:flex-1" />
            <PromoPanel banner={promos[1]} align="end" className="lg:min-h-0 lg:flex-1" />
          </div>
        )}
      </div>
    </section>
  );
}

/* ── Categories ───────────────────────────────────────────────────────── */

// Horizontal strip directly under the navbar: a round thumbnail per category
// with its name beneath. Scrolls sideways when it overflows; centred when it
// fits. Purely a shortcut into the catalogue — nothing filters here.
function CategoryCircles({ categories }) {
  if (!categories.length) return null;

  return (
    <section className="mx-auto max-w-7xl px-4 pt-4 lg:px-8">
      {/* py-1: the scroller clips both axes, so the 2px hover ring needs room. */}
      <div className="-mx-4 flex gap-4 overflow-x-auto px-4 py-1 [scrollbar-width:none] sm:gap-6 lg:mx-0 lg:justify-center lg:px-0 [&::-webkit-scrollbar]:hidden">
        {categories.map((c) => (
          <Link
            key={c.name}
            to={`/products?category=${encodeURIComponent(c.name)}`}
            className="group flex w-[72px] shrink-0 flex-col items-center gap-2 sm:w-[88px]"
          >
            <span className="flex size-16 items-center justify-center overflow-hidden rounded-full bg-[color:var(--bg-warm)] ring-1 ring-border transition-shadow group-hover:ring-2 group-hover:ring-primary sm:size-20">
              {c.image ? (
                <img src={c.image} alt="" loading="lazy" className="size-full object-cover" />
              ) : (
                <span className="text-lg font-bold text-foreground/40">{localizedName(c)?.[0]}</span>
              )}
            </span>
            <span className="line-clamp-2 text-center text-xs font-medium leading-tight text-foreground group-hover:text-primary">
              {localizedName(c)}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

/* ── Trust badges ─────────────────────────────────────────────────────── */

function TrustBadges() {
  const { t } = useTranslation();
  const items = [
    { icon: Truck, title: t('trust.shipping'), desc: t('trust.shippingDesc'), to: '/shipping-policy' },
    { icon: RotateCcw, title: t('trust.returns'), desc: t('trust.returnsDesc'), to: '/return-policy' },
    { icon: ShieldCheck, title: t('trust.secure'), desc: t('trust.secureDesc'), to: '/privacy-policy' },
    { icon: Headphones, title: t('trust.support'), desc: t('trust.supportDesc'), to: '/contact' },
  ];
  return (
    <section className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.title}
              to={item.to}
              className="flex items-center gap-3 rounded-2xl bg-card px-4 py-4 ring-1 ring-border/70 transition-shadow hover:shadow-[0_8px_24px_rgba(43,22,32,0.08)]"
            >
              <span
                className="flex size-10 shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: 'var(--bg-warm)' }}
              >
                <Icon className="size-5 stroke-[1.6]" style={{ color: 'var(--copper)' }} />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-foreground">{item.title}</span>
                <span className="block truncate text-xs text-muted-foreground">{item.desc}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────── */

export default function Home() {
  const { t } = useTranslation();

  const [latest, setLatest] = useState([]);
  const [railLoading, setRailLoading] = useState(true);
  const [categories, setCategories] = useState([]);

  // "All products" is server-paginated on its own, independently of the rail.
  const [all, setAll] = useState([]);
  const [allLoading, setAllLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const gridRef = useRef(null);
  // Paging should scroll the grid back into view — but not on first paint,
  // which would yank a customer who landed at the top straight down the page.
  const pagedOnce = useRef(false);

  const [banners, setBanners] = useState(() => {
    const cached = localStorage.getItem('cached-banners');
    return cached ? JSON.parse(cached) : [];
  });
  const [promos, setPromos] = useState(() => {
    const cached = localStorage.getItem('cached-mid-banners');
    return cached ? JSON.parse(cached) : [];
  });
  const [seal, setSeal] = useState(() => {
    const cached = localStorage.getItem('cached-hero-seal');
    return cached ? JSON.parse(cached) : null;
  });

  const [active, setActive] = useState(0);

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

    // Hero seal — Admin → Settings → Theme → Hero Seal.
    api.get('/settings/hero-seal')
      .then((res) => {
        if (res.data && typeof res.data === 'object') {
          setSeal(res.data);
          localStorage.setItem('cached-hero-seal', JSON.stringify(res.data));
        }
      })
      .catch(() => {});

    // Promo banners — Admin → Settings → Theme → Promo Banners. Positional:
    // [0] and [1] stack beside the hero, [2] sits between the sections, [3] is
    // the full-width sale banner.
    api.get('/settings/mid-banners')
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : [];
        setPromos(list);
        localStorage.setItem('cached-mid-banners', JSON.stringify(list));
      })
      .catch(() => {});

    // The circles list what the Shop page's chips list — the categories the
    // products actually carry — so each one opens a non-empty filter. A
    // Category row of the same name (any case) supplies the image and Arabic
    // name; without one the circle shows the initial.
    Promise.all([
      api.get('/products/categories').then((r) => r.data).catch(() => []),
      api.get('/categories').then((r) => r.data).catch(() => []),
    ]).then(([names, rows]) => {
      const byName = new Map((Array.isArray(rows) ? rows : []).map((c) => [c.name.toLowerCase(), c]));
      setCategories((Array.isArray(names) ? names : []).map((name) => ({
        ...byName.get(String(name).toLowerCase()),
        name,
      })));
    });

    api.get(`/products?sort=createdAt&order=DESC&limit=${RAIL_LIMIT}`)
      .then((r) => setLatest(r.data.products || []))
      .catch(() => {})
      .finally(() => setRailLoading(false));
  }, []);

  useEffect(() => {
    setAllLoading(true);
    api.get('/products', { params: { page, limit: PAGE_SIZE, sort: 'createdAt', order: 'DESC' } })
      .then((r) => {
        setAll(r.data.products || []);
        setTotalPages(r.data.totalPages || 1);
        setTotal(r.data.total || 0);
      })
      .catch(() => {})
      .finally(() => setAllLoading(false));

    if (pagedOnce.current) {
      gridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    pagedOnce.current = true;
  }, [page]);

  // Admin banners drive the hero when configured; otherwise the default artwork.
  const heroSlides = banners.length > 0 ? banners : [FALLBACK_HERO];
  const promoAt = (i) => (promos[i]?.image ? promos[i] : null);

  // Below `lg` the hero-side promos have nowhere of their own to sit, so they
  // fold into the carousel as extra slides rather than stacking as full-width
  // images the customer scrolls past.
  //
  // Slots 2 and 3 are excluded deliberately: both are full-width bands by
  // design and keep that placement at every width.
  const compact = useMediaQuery(MOBILE_BANNER_MEDIA);
  const carouselPromos = [promoAt(0), promoAt(1)].filter(Boolean);
  const slides = compact ? [...heroSlides, ...carouselPromos] : heroSlides;

  // Rotating a phone to landscape drops the promos back out of the carousel,
  // so an index that was valid a moment ago can now point past the end and
  // blank the hero. Clamp on read rather than resetting to 0, which would
  // yank the customer back to the first slide on every resize.
  const safeActive = Math.min(active, slides.length - 1);

  const autoplayRef = useRef(null);
  const touchStart = useRef(null);
  const touchDelta = useRef(0);

  const goTo = useCallback((index) => {
    setActive(index);
    clearInterval(autoplayRef.current);
    if (slides.length > 1) {
      autoplayRef.current = setInterval(() => {
        setActive((prev) => (prev + 1) % slides.length);
      }, 5000);
    }
  }, [slides.length]);

  useEffect(() => {
    if (slides.length <= 1) return;
    autoplayRef.current = setInterval(() => {
      setActive((prev) => (prev + 1) % slides.length);
    }, 5000);
    return () => clearInterval(autoplayRef.current);
  }, [slides.length]);

  const handleTouchStart = (e) => { touchStart.current = e.touches[0].clientX; touchDelta.current = 0; };
  const handleTouchMove = (e) => { if (touchStart.current !== null) touchDelta.current = e.touches[0].clientX - touchStart.current; };
  const handleTouchEnd = () => {
    if (Math.abs(touchDelta.current) > 50) {
      if (touchDelta.current < 0 && active < slides.length - 1) goTo(active + 1);
      else if (touchDelta.current > 0 && active > 0) goTo(Math.min(active, slides.length - 1) - 1);
    }
    touchStart.current = null;
    touchDelta.current = 0;
  };

  return (
    <div className="pb-4">
      <SEO title={t('home.seoTitle')} description={t('home.seoDescription')} />

      <CategoryCircles categories={categories} />

      <HeroBlock
        slides={slides}
        active={safeActive}
        seal={seal}
        promos={[promoAt(0), promoAt(1)]}
        compact={compact}
        onSelect={goTo}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      />

      {/* New arrivals — one horizontal rail, so the newest stock is one swipe
          away rather than a grid the customer has to scroll past. */}
      {(railLoading || latest.length > 0) && (
        <section className="mx-auto mt-10 max-w-7xl px-4 lg:px-8">
          <SectionHead
            title={t('common.newArrivals')}
            to="/products?sort=createdAt&order=DESC"
            actionLabel={t('common.viewAll')}
          />
          <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] lg:mx-0 lg:px-0 [&::-webkit-scrollbar]:hidden">
            {(railLoading ? Array.from({ length: 4 }) : latest).map((p, i) => (
              <div key={p?.id ?? i} className="w-40 shrink-0 snap-start sm:w-48 lg:w-56">
                {railLoading ? <CardSkeleton /> : <ProductCard product={p} />}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Promo slot 3 — a full-width band between the two product sections. */}
      {promoAt(2) && (
        <section className="mx-auto mt-10 max-w-7xl px-4 lg:px-8">
          <PromoPanel banner={promoAt(2)} align="end" className="lg:h-[220px]" />
        </section>
      )}

      {/* All products — server-paginated, stepped through with Back / More. */}
      <section ref={gridRef} className="mx-auto mt-10 max-w-7xl scroll-mt-28 px-4 lg:px-8">
        <SectionHead
          title={t('products.allProducts')}
          note={total > 0 ? t('products.items', { count: total }) : undefined}
        />

        {!allLoading && all.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-4 py-14 text-center text-sm text-muted-foreground">
            {t('products.noResults')}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-4">
            {allLoading
              ? Array.from({ length: PAGE_SIZE }).map((_, i) => <CardSkeleton key={i} />)
              : all.map((p) => <ProductCard key={p.id} product={p} eager />)}
          </div>
        )}

        {totalPages > 1 && (
          <div className="mt-8 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="inline-flex items-center gap-1.5 rounded-full bg-card px-5 py-2.5 text-[13px] font-semibold text-foreground ring-1 ring-border transition-colors hover:ring-primary disabled:pointer-events-none disabled:opacity-40"
            >
              <ChevronLeft className="size-4 rtl:rotate-180" />
              {t('common.back')}
            </button>

            <span className="text-[13px] font-medium text-muted-foreground">
              {t('common.pageOf', { current: page, total: totalPages })}
            </span>

            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-[13px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-40"
            >
              {t('common.more')}
              <ChevronRight className="size-4 rtl:rotate-180" />
            </button>
          </div>
        )}
      </section>

      {/* Full-width sale banner — promo slot 4. Its own band at every width. */}
      {promoAt(3) && (
        <section className="mx-auto mt-12 max-w-7xl px-4 lg:px-8">
          <PromoPanel banner={promoAt(3)} align="end" className="lg:h-[240px]" />
        </section>
      )}

      <TrustBadges />
    </div>
  );
}
