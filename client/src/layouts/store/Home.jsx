import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Heart, Mail } from 'lucide-react';
import api from '../../api/axios';
import { localizedName } from '../../utils/i18nHelpers';
import { CurrencySymbol, formatPrice } from '../../utils/currency';
import SEO from '../../components/SEO';
import { useWishlist } from '../../context/WishlistContext';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const STORE_NAME = import.meta.env.VITE_STORE_NAME || 'Femnia';

// Artwork shown until banners are configured in Admin → Settings → Theme.
// Image-only by design: titles and subtitles are authored per-banner in Admin,
// so a default banner carries no baked-in copy.
const FALLBACK_HERO = {
  image: '/images/femnia-hero.webp',
  mobileImage: '/images/femnia-hero-mobile.webp',
};
const FALLBACK_MID = { image: '/images/femnia-promo.webp' };

// Must stay in lockstep with Tailwind's `md` (768px), which is where the
// banners switch to their desktop layout. If this is narrower, widths between
// it and `md` get the mobile LAYOUT but the desktop IMAGE.
const MOBILE_BANNER_MEDIA = '(max-width: 767px)';

/* ── Shared bits ──────────────────────────────────────────────────────── */

// Centred heading with the gold rule under it (SHOP BY CATEGORY).
function RuledHeading({ children }) {
  return (
    <div className="flex flex-col items-center">
      <div className="flex w-full items-center gap-5">
        <span className="h-px flex-1 bg-border" />
        <h2 className="text-center font-serif text-xl uppercase tracking-[0.14em] text-foreground sm:text-2xl">{children}</h2>
        <span className="h-px flex-1 bg-border" />
      </div>
      <span className="mt-3 h-[2px] w-12" style={{ backgroundColor: 'var(--gold)' }} />
    </div>
  );
}

/* ── Hero ─────────────────────────────────────────────────────────────── */

// Rotating circular seal over the hero photo. Text and visibility come from
// Admin → Settings → Theme → Hero Seal.
function EleganceSeal({ seal }) {
  if (!seal?.enabled || !seal.text) return null;
  // The text is repeated around the circle, so it needs a trailing separator
  // to read continuously as it loops.
  const ring = `${seal.text} · `;
  return (
    // Mobile: tucked into the bottom-right corner and scaled down — the hero
    // is only as tall as the banner there, so the old bottom-24 pushed the
    // seal up into the middle of the artwork.
    <div className="pointer-events-none absolute bottom-3 right-3 size-16 sm:bottom-16 sm:right-4 sm:size-28 lg:right-10 lg:size-32">
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

function Hero({ slides, active, seal, onSelect, onTouchStart, onTouchMove, onTouchEnd }) {
  const current = slides[active];
  return (
    <section
      // -mt-20 pulls the hero up under the (transparent) h-20 navbar on
      // mobile so the art runs to the announcement bar. From `md` up the
      // navbar is solid and the hero sits below it as normal.
      className="relative -mt-20 overflow-hidden bg-[color:var(--bg-warm)] md:mt-0"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* On mobile the FIRST slide sits in normal flow so the banner's own
          aspect ratio sets the hero height — the art then meets the navbar
          with no letterbox strip above or below it. From `md` up every slide
          is absolutely stacked and the copy column sets the height instead. */}
      <div className="relative md:min-h-[560px] lg:min-h-[640px]">
        {slides.map((slide, i) => (
          <div
            key={i}
            className={cn(
              'transition-opacity duration-700',
              i === 0 ? 'relative md:absolute md:inset-0' : 'absolute inset-0',
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
                  className={cn(
                    'md:absolute md:inset-0 md:size-full md:object-cover md:object-center',
                    i === 0
                      ? 'block h-auto w-full'
                      : 'absolute inset-0 size-full object-contain object-center',
                  )}
                  fetchPriority={i === 0 ? 'high' : 'auto'}
                  loading={i === 0 ? 'eager' : 'lazy'}
                />
              </picture>
            ) : (
              // Keeps the hero from collapsing on mobile when a slide has no
              // image (the first slide is what sets the height there).
              <div
                className={cn(
                  'bg-[color:var(--bg-warm)]',
                  i === 0 ? 'h-[320px] w-full md:absolute md:inset-0 md:h-auto' : 'absolute inset-0',
                )}
              />
            )}
            {/* No scrim: the hero art is supplied with its left side left
                clear for the copy, so the photo renders untouched. */}

            {/* The slide itself is the call to action now that the button is
                gone — the whole banner links wherever Admin points it. */}
            {slide.link && (
              <Link to={slide.link} className="absolute inset-0 z-10" aria-label={slide.title || STORE_NAME} />
            )}
          </div>
        ))}

        {/* Copy comes only from the banner configured in Admin → Settings →
            Theme. With no title/subtitle set (or on the default artwork) the
            hero renders as a clean image with no overlaid text or button.
            pt-36 clears the transparent navbar the art sits under on mobile. */}
        <div className="pointer-events-none absolute inset-0 mx-auto flex max-w-7xl items-center px-6 pt-20 md:relative md:min-h-[560px] md:py-16 md:pt-16 lg:min-h-[640px] lg:px-10">
          {(current?.subtitle || current?.title) && (
            <div className="max-w-md">
              {current.subtitle && (
                <p className="text-[9px] font-medium uppercase tracking-[0.25em] text-foreground/70 md:text-[11px] md:tracking-[0.3em]">
                  {current.subtitle}
                </p>
              )}
              {current.title && (
                // Sized down on mobile: the banner sets the hero height there,
                // so the copy has to sit inside a much shorter box.
                <h1 className="mt-1.5 font-serif text-2xl uppercase leading-[0.95] tracking-tight text-foreground sm:text-4xl md:mt-5 md:text-6xl lg:text-7xl">
                  {current.title}
                </h1>
              )}
              <span className="mt-3 block h-px w-10 md:mt-7 md:w-16" style={{ backgroundColor: 'var(--gold)' }} />
            </div>
          )}
        </div>

        <EleganceSeal seal={seal} />

        {slides.length > 1 && (
          <div className="absolute inset-x-0 bottom-6 z-20 flex justify-center gap-2">
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onSelect(i)}
                aria-label={`Slide ${i + 1}`}
                className={cn(
                  'size-2 rounded-full transition-colors',
                  active === i ? 'bg-[color:var(--gold)]' : 'bg-foreground/20',
                )}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/* ── Shop by category (circular tiles) ────────────────────────────────── */

function CategoryCircles({ categories }) {
  const { t } = useTranslation();
  if (!categories.length) return null;
  return (
    <section className="mx-auto max-w-7xl px-6 py-14 lg:px-10">
      <RuledHeading>{t('femnia.shopByCategory')}</RuledHeading>
      <div className="-mx-6 mt-10 flex gap-6 overflow-x-auto px-6 pb-2 [scrollbar-width:none] sm:mx-0 sm:justify-center sm:overflow-visible sm:px-0">
        {categories.slice(0, 6).map((c) => (
          <Link
            key={c.id || c.name}
            to={`/products?category=${encodeURIComponent(c.name)}`}
            className="group flex w-24 shrink-0 flex-col items-center gap-3 sm:w-32"
          >
            <span className="block size-24 overflow-hidden rounded-full bg-[color:var(--bg-warm)] ring-1 ring-border transition-all group-hover:ring-2 group-hover:ring-[color:var(--gold)] sm:size-32">
              {c.image ? (
                <img
                  src={c.image}
                  alt={localizedName(c)}
                  loading="lazy"
                  className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              ) : (
                <span className="flex size-full items-center justify-center font-serif text-3xl text-foreground/25">
                  {localizedName(c)?.[0]}
                </span>
              )}
            </span>
            <span className="text-center text-[11px] font-medium uppercase tracking-[0.14em] text-foreground">
              {localizedName(c)}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

/* ── Dark sale banner ─────────────────────────────────────────────────── */

/**
 * Mid-page banner, driven entirely by Admin → Settings → Theme → Mid-page
 * Banners. Copy is whatever `title`/`subtitle` the admin sets; with neither
 * set the banner renders as a clean image. Nothing is hardcoded.
 */
function MidBanner({ banner }) {
  const hasCopy = !!(banner.subtitle || banner.title);
  return (
    <section className="mx-auto max-w-7xl px-6 lg:px-10">
      <div className="relative overflow-hidden bg-[color:var(--bg-dark)]">
        {banner.image && (
          <>
            <picture>
              {banner.mobileImage && <source media={MOBILE_BANNER_MEDIA} srcSet={banner.mobileImage} />}
              <img
                src={banner.image}
                alt={banner.title || ''}
                loading="lazy"
                // Same as the hero: full banner on mobile, cropped fill on desktop.
                className="absolute inset-0 size-full object-contain object-center sm:object-cover sm:object-[75%_center]"
              />
            </picture>
            {/* Scrim only when there is copy to keep legible. */}
            {hasCopy && (
              <div className="absolute inset-0 bg-gradient-to-r from-[color:var(--bg-dark)] via-[color:var(--bg-dark)]/85 to-transparent" />
            )}
          </>
        )}

        <div className="pointer-events-none relative flex min-h-[240px] max-w-lg flex-col justify-center gap-4 p-8 sm:min-h-[280px] sm:p-12">
          {banner.subtitle && (
            <p className="text-[11px] font-medium uppercase tracking-[0.28em]" style={{ color: 'var(--gold)' }}>
              {banner.subtitle}
            </p>
          )}
          {banner.title && (
            <h2 className="font-serif text-4xl uppercase leading-[1.05] text-white sm:text-5xl">
              {banner.title}
            </h2>
          )}
        </div>

        {banner.link && (
          <Link to={banner.link} className="absolute inset-0" aria-label={banner.title || STORE_NAME} />
        )}
      </div>
    </section>
  );
}

/* ── Product rail ─────────────────────────────────────────────────────── */

// Editorial product card: tall image, heart toggle, name + price under it.
function FashionCard({ product }) {
  const { toggleWishlist, isInWishlist } = useWishlist();
  const wished = isInWishlist?.(product.id);
  const imgFull = product.images?.[0];
  const img = imgFull?.replace(/\/uploads\/(.+?)\.webp$/, '/api/upload/thumb/$1.webp') || imgFull;
  const displayName = localizedName(product);

  return (
    // w-44 + shrink-0 give the card a fixed width inside the mobile scroll
    // row; from `sm` the parent is a grid again and the track sizes it.
    <article className="group flex w-44 shrink-0 snap-start flex-col sm:w-auto">
      <div className="relative overflow-hidden bg-[color:var(--bg-warm)]">
        <Link to={`/product/${product.slug}`} className="block aspect-[3/4]">
          {img ? (
            <img
              src={img}
              alt={displayName}
              loading="lazy"
              className="size-full object-cover transition-transform duration-700 group-hover:scale-105"
            />
          ) : (
            <span className="flex size-full items-center justify-center font-serif text-5xl text-foreground/20">
              {displayName?.[0] || '·'}
            </span>
          )}
        </Link>
        <button
          type="button"
          onClick={() => toggleWishlist?.(product)}
          aria-label="Add to wishlist"
          aria-pressed={!!wished}
          className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-full bg-white/85 text-foreground backdrop-blur transition-colors hover:bg-white"
        >
          <Heart className={cn('size-4 stroke-[1.5]', wished && 'fill-current')} />
        </button>
      </div>
      <div className="bg-card px-3 py-4">
        <Link
          to={`/product/${product.slug}`}
          className="line-clamp-1 text-[13px] text-foreground transition-colors hover:text-[color:var(--gold)]"
        >
          {displayName}
        </Link>
        <p className="mt-1.5 text-sm font-semibold text-foreground">
          <CurrencySymbol />{formatPrice(product.price)}
        </p>
      </div>
    </article>
  );
}

function ProductRail({ title, products, loading }) {
  const { t } = useTranslation();
  return (
    <section className="mx-auto max-w-7xl px-6 py-14 lg:px-10">
      <div className="mb-8 flex items-end justify-between gap-4">
        <h2 className="font-serif text-2xl uppercase tracking-[0.06em] text-foreground sm:text-3xl">{title}</h2>
        <Link
          to="/products"
          className="group inline-flex shrink-0 items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-foreground hover:text-[color:var(--gold)]"
        >
          {t('common.viewAll')}
          <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
        </Link>
      </div>
      {/* Mobile: one snapping side-scroll row (bleeds to the screen edges so
          the next card peeks). From `sm` up it goes back to a wrapped grid. */}
      <div
        className={cn(
          // scroll-pl-6 matches px-6: snap points align to the border box, so
          // without it the first card snaps flush to the screen edge.
          '-mx-6 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-pl-6 px-6 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          'sm:mx-0 sm:grid sm:snap-none sm:grid-cols-3 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-4',
        )}
      >
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex w-44 shrink-0 snap-start flex-col gap-3 sm:w-auto">
                <Skeleton className="aspect-[3/4] w-full" />
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            ))
          : products.map((p) => <FashionCard key={p.id} product={p} />)}
      </div>
    </section>
  );
}

/* ── Newsletter ───────────────────────────────────────────────────────── */

function ClubBand() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  return (
    <section className="bg-[color:var(--bg-warm)]">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-7 px-6 py-12 md:flex-row md:justify-between lg:px-10">
        <div className="flex items-center gap-5">
          <span
            className="flex size-14 shrink-0 items-center justify-center rounded-full text-white"
            style={{ backgroundColor: 'var(--gold)' }}
          >
            <Mail className="size-6 stroke-[1.5]" />
          </span>
          <div className="text-center sm:text-left">
            <h3 className="font-serif text-xl tracking-[0.06em] text-foreground sm:text-2xl">
              {t('newsletter.title')}
            </h3>
            <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted-foreground">
              {t('newsletter.desc1')}<br className="hidden sm:block" />{t('newsletter.desc2')}
            </p>
          </div>
        </div>

        {sent ? (
          <p className="text-sm font-medium text-foreground">{t('newsletter.thanks')}</p>
        ) : (
          <form
            onSubmit={(e) => { e.preventDefault(); if (email.trim()) setSent(true); }}
            className="flex w-full max-w-md items-stretch"
          >
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('newsletter.placeholder')}
              className="h-12 min-w-0 flex-1 bg-white px-5 text-base text-foreground outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-inset focus:ring-[color:var(--gold)] md:text-sm"
            />
            <button
              type="submit"
              className="shrink-0 bg-foreground px-6 text-[11px] font-medium uppercase tracking-[0.16em] text-background transition-colors hover:bg-foreground/85"
            >
              {t('newsletter.subscribe')}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────── */

export default function Home() {
  const { t } = useTranslation();
  const [featured, setFeatured] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [banners, setBanners] = useState(() => {
    const cached = localStorage.getItem('cached-banners');
    return cached ? JSON.parse(cached) : [];
  });
  const [midBanners, setMidBanners] = useState(() => {
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

    // Mid-page banners — Admin → Settings → Theme → Mid-page Banners.
    api.get('/settings/mid-banners')
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data.filter((b) => b?.image) : [];
        setMidBanners(list);
        localStorage.setItem('cached-mid-banners', JSON.stringify(list));
      })
      .catch(() => {});

    api.get('/categories')
      .then((res) => setCategories(Array.isArray(res.data) ? res.data : []))
      .catch(() => {});

    api.get('/products?featured=true&limit=8')
      .then((res) => setFeatured(res.data.products || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Admin banners drive the hero when configured; otherwise a single
  // branded slide built from the i18n copy.
  const slides = banners.length > 0 ? banners : [FALLBACK_HERO];
  const midSlides = midBanners.length > 0 ? midBanners : [FALLBACK_MID];

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
      else if (touchDelta.current > 0 && active > 0) goTo(active - 1);
    }
    touchStart.current = null;
    touchDelta.current = 0;
  };

  return (
    <div>
      <SEO title={t('home.seoTitle')} description={t('home.seoDescription')} />

      <Hero
        slides={slides}
        active={active}
        seal={seal}
        onSelect={goTo}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      />

      <CategoryCircles categories={categories} />

      {midSlides.map((banner, i) => <MidBanner key={i} banner={banner} />)}

      <ProductRail title={t('femnia.newIn')} products={featured} loading={loading} />

      <ClubBand />
    </div>
  );
}
