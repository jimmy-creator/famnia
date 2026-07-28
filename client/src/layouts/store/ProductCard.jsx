import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Eye, ShoppingBag } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { CurrencySymbol, formatPrice } from '../../utils/currency';
import { localizedName } from '../../utils/i18nHelpers';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export default function ProductCard({ product, eager = false }) {
  const { t } = useTranslation();
  const { addToCart } = useCart();
  const displayName = localizedName(product);
  const imgFull = product.images?.[0];
  const img = imgFull?.replace(/\/uploads\/(.+?)\.webp$/, '/api/upload/thumb/$1.webp') || imgFull;
  const hasDiscount = product.comparePrice && product.comparePrice > product.price;
  const discount = hasDiscount
    ? Math.round((1 - product.price / product.comparePrice) * 100)
    : 0;
  const soldOut = product.stock === 0;

  const handleAddToCart = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (soldOut) return;
    addToCart(product, 1, null);
  };

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-lg border border-border bg-card transition-shadow hover:shadow-md">
      <Link to={`/product/${product.slug}`} className="relative block aspect-square overflow-hidden bg-muted">
        {img ? (
          <img
            src={img}
            alt={displayName}
            loading={eager ? 'eager' : 'lazy'}
            fetchpriority={eager ? 'high' : 'auto'}
            className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex size-full items-center justify-center font-serif text-5xl text-muted-foreground/40">
            {displayName?.[0] || '·'}
          </div>
        )}

        <span
          className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-full bg-background/80 text-foreground opacity-0 shadow-sm backdrop-blur transition-opacity group-hover:opacity-100"
          aria-hidden="true"
        >
          <Eye className="size-[15px]" />
        </span>

        {soldOut ? (
          <Badge variant="secondary" className="absolute left-2 top-2 bg-foreground/80 text-background">
            {t('common.outOfStock')}
          </Badge>
        ) : discount > 0 ? (
          <Badge className="absolute left-2 top-2">{discount}% {t('product.off')}</Badge>
        ) : null}
      </Link>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <Link
          to={`/product/${product.slug}`}
          className="line-clamp-2 text-sm font-medium text-foreground transition-colors hover:text-primary"
        >
          {displayName}
        </Link>

        <div className="mt-auto flex items-end justify-between gap-2 pt-1">
          <div className="flex flex-col leading-tight">
            <span className={cn('text-base font-semibold', hasDiscount && 'text-primary')}>
              <CurrencySymbol />{formatPrice(product.price)}
            </span>
            {hasDiscount && (
              <span className="text-xs text-muted-foreground line-through">
                <CurrencySymbol />{formatPrice(product.comparePrice)}
              </span>
            )}
          </div>
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={handleAddToCart}
            disabled={soldOut}
            aria-label={soldOut ? t('common.outOfStock') : t('common.addToCart')}
          >
            <ShoppingBag className="size-4" />
          </Button>
        </div>
      </div>
    </article>
  );
}
