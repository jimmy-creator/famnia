import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Heart, ShoppingBag } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { useWishlist } from '../../context/WishlistContext';
import { CurrencySymbol, formatPrice } from '../../utils/currency';
import { localizedName } from '../../utils/i18nHelpers';
import { cn } from '@/lib/utils';
import { imageOf } from '@/lib/productImages';

// Below this, the card shows a scarcity badge instead of the discount one —
// "two left" is the more urgent message when both are true.
const LOW_STOCK_AT = 3;

/**
 * Soft, rounded catalogue tile: portrait photo with corner badges, then name,
 * price pair and a single dark action pill.
 *
 * Products that carry variants can't be added from the grid — there is nothing
 * to pick a size from here — so those get an "Options" pill through to the
 * detail page instead of the one-tap bag button.
 */
export default function ProductCard({ product, eager = false }) {
  const { t } = useTranslation();
  const { addToCart } = useCart();
  const { toggleWishlist, isInWishlist } = useWishlist();

  const displayName = localizedName(product);
  const imgFull = imageOf(product);
  const img = imgFull?.replace(/\/uploads\/(.+?)\.webp$/, '/api/upload/thumb/$1.webp') || imgFull;

  const hasDiscount = product.comparePrice && product.comparePrice > product.price;
  const soldOut = product.stock === 0;
  const lowStock = !soldOut && product.stock > 0 && product.stock <= LOW_STOCK_AT;
  // Archived sizes stay in variants[] (indexes are referenced elsewhere) but
  // are not for sale, so they don't count.
  const hasVariants = !!(product.variants?.some((v) => !v.archived) || product.variantOptions?.length);
  const wished = isInWishlist?.(product.id);

  const handleAddToCart = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (soldOut) return;
    addToCart(product, 1, null);
  };

  const handleWishlist = (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleWishlist?.(product);
  };

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl bg-card shadow-[0_1px_3px_rgba(43,22,32,0.06)] ring-1 ring-border/70 transition-shadow duration-300 hover:shadow-[0_10px_30px_rgba(43,22,32,0.1)]">
      <Link to={`/product/${product.slug}`} className="relative block aspect-[3/4] overflow-hidden bg-[color:var(--bg-warm)]">
        {img ? (
          <img
            src={img}
            alt={displayName}
            loading={eager ? 'eager' : 'lazy'}
            fetchpriority={eager ? 'high' : 'auto'}
            className="size-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-5xl font-semibold text-foreground/15">
            {displayName?.[0] || '·'}
          </div>
        )}

        {/* One badge at a time, in order of urgency. */}
        {soldOut ? (
          <span className="absolute left-2.5 top-2.5 rounded-full bg-foreground/85 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-background backdrop-blur">
            {t('common.outOfStock')}
          </span>
        ) : lowStock ? (
          <span
            className="absolute left-2.5 top-2.5 rounded-full px-2.5 py-1 text-[10px] font-semibold text-white"
            style={{ backgroundColor: 'var(--copper-dark)' }}
          >
            {t('common.onlyLeft', { count: product.stock })}
          </span>
        ) : hasDiscount ? (
          <span className="absolute left-2.5 top-2.5 rounded-full bg-primary px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-primary-foreground">
            {/* A running offer shows how much is off; a standing compare-at price just says Sale. */}
            {product.offer ? `−${Math.round((1 - product.price / product.comparePrice) * 100)}%` : t('common.sale')}
          </span>
        ) : null}

        <button
          type="button"
          onClick={handleWishlist}
          aria-label={t('common.wishlist')}
          aria-pressed={!!wished}
          className="absolute right-2.5 top-2.5 flex size-8 items-center justify-center rounded-full bg-background/85 text-foreground shadow-sm backdrop-blur transition-colors hover:text-primary"
        >
          <Heart className={cn('size-4 stroke-[1.6]', wished && 'fill-primary text-primary')} />
        </button>
      </Link>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <Link
          to={`/product/${product.slug}`}
          className="line-clamp-2 min-h-[2.5rem] text-[13px] font-medium leading-tight text-foreground transition-colors hover:text-primary"
        >
          {displayName}
        </Link>

        {/* "QAR" is three letters wide, so it's set smaller than the figure,
            and the row wraps rather than letting a long price run under the
            action on a phone-width card. */}
        <div className="mt-auto flex flex-wrap items-center justify-between gap-x-2 gap-y-2">
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="whitespace-nowrap text-[15px] font-bold text-foreground">
              <CurrencySymbol className="me-0.5 text-[11px] font-semibold" />{formatPrice(product.price)}
            </span>
            {hasDiscount && (
              <span className="text-[11px] text-muted-foreground line-through">
                <CurrencySymbol />{formatPrice(product.comparePrice)}
              </span>
            )}
          </span>

          {hasVariants ? (
            <Link
              to={`/product/${product.slug}`}
              className="shrink-0 rounded-full bg-foreground px-3 py-2 text-[11px] sm:px-4 font-semibold text-background transition-opacity hover:opacity-85"
            >
              {t('common.options')}
            </Link>
          ) : (
            <button
              type="button"
              onClick={handleAddToCart}
              disabled={soldOut}
              aria-label={soldOut ? t('common.outOfStock') : t('common.addToCart')}
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-opacity hover:opacity-85 disabled:opacity-30"
            >
              <ShoppingBag className="size-4 stroke-[1.7]" />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
