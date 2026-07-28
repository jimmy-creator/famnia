import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Heart, ShoppingCart, Trash2 } from 'lucide-react';
import { useWishlist } from '../context/WishlistContext';
import { useCart } from '../context/CartContext';
import ProductImage from '../components/ProductImage';
import { showToast } from '../utils/toast';
import { CurrencySymbol, formatPrice } from '../utils/currency';
import { Button } from '@/components/ui/button';

export default function Wishlist() {
  const { t } = useTranslation();
  const { wishlist, removeFromWishlist } = useWishlist();
  const { addToCart } = useCart();

  if (wishlist.length === 0) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center">
        <div className="mb-4 flex size-16 items-center justify-center rounded-full bg-secondary">
          <Heart className="size-7 text-muted-foreground" />
        </div>
        <h2 className="font-serif text-2xl font-semibold">{t('wishlist.empty')}</h2>
        <p className="mt-2 text-muted-foreground">{t('wishlist.emptyHint')}</p>
        <Button asChild className="mt-6">
          <Link to="/products">{t('wishlist.browse')}</Link>
        </Button>
      </div>
    );
  }

  const handleAddToCart = (item) => {
    const hasVariants = item.variants && item.variants.length > 0;
    if (hasVariants) {
      window.location.href = `/product/${item.slug}`;
      return;
    }
    addToCart(item);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
      <h1 className="mb-6 font-serif text-3xl font-semibold tracking-tight">{t('wishlist.title')} ({wishlist.length})</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {wishlist.map((item) => (
          <div key={item.id} className="flex gap-4 rounded-lg border border-border bg-card p-4">
            <Link to={`/product/${item.slug}`} className="size-24 shrink-0 overflow-hidden rounded-md bg-muted">
              <ProductImage product={item} size="normal" />
            </Link>
            <div className="flex min-w-0 flex-1 flex-col">
              <Link to={`/product/${item.slug}`} className="line-clamp-2 font-medium hover:text-primary">
                {item.name}
              </Link>
              <span className="text-xs text-muted-foreground">{item.category}</span>
              <div className="mt-1 flex items-center gap-2">
                <span className="font-semibold"><CurrencySymbol />{formatPrice(item.price)}</span>
                {item.comparePrice && (
                  <span className="text-xs text-muted-foreground line-through"><CurrencySymbol />{formatPrice(item.comparePrice)}</span>
                )}
              </div>
              <div className="mt-auto flex items-center gap-2 pt-3">
                <Button size="sm" className="flex-1 gap-1.5" onClick={() => handleAddToCart(item)}>
                  <ShoppingCart className="size-4" />
                  {item.variants?.length > 0 ? t('wishlist.selectOptions') : t('common.addToCart')}
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => { removeFromWishlist(item.id); showToast(t('wishlist.removed')); }}
                  aria-label="Remove"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
