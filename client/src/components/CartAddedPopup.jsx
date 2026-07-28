import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, X, ShoppingBag } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { CURRENCY, formatPrice } from '../utils/currency';
import { Button } from '@/components/ui/button';

export default function CartAddedPopup() {
  const { lastAdded, dismissLastAdded, cartCount } = useCart();

  useEffect(() => {
    if (!lastAdded) return;
    const t = setTimeout(dismissLastAdded, 4000);
    return () => clearTimeout(t);
  }, [lastAdded?.ts, dismissLastAdded]);

  if (!lastAdded) return null;

  const { product, quantity, selectedVariant } = lastAdded;
  const img = product.images?.[0];
  const variantText = selectedVariant
    ? Object.entries(selectedVariant).map(([k, v]) => `${k}: ${v}`).join(' · ')
    : null;
  const lineTotal = formatPrice(parseFloat(product.price) * quantity);

  return (
    <div
      role="alert"
      className="fixed right-4 top-20 z-50 w-[320px] max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-popover p-4 shadow-lg animate-in slide-in-from-top-2 fade-in"
    >
      <button
        className="absolute right-2 top-2 text-muted-foreground transition-colors hover:text-foreground"
        onClick={dismissLastAdded}
        aria-label="Close"
      >
        <X className="size-4" />
      </button>
      <div className="flex items-center gap-1.5 text-sm font-medium text-emerald-600">
        <CheckCircle className="size-4" /> Added to cart
      </div>
      <div className="mt-3 flex gap-3">
        {img && <img src={img} alt="" className="size-14 shrink-0 rounded-md object-cover" />}
        <div className="min-w-0 flex-1">
          <p className="line-clamp-1 text-sm font-medium">{product.name}</p>
          {variantText && <p className="text-xs text-muted-foreground">{variantText}</p>}
          <p className="mt-0.5 text-xs text-muted-foreground">Qty {quantity} · {CURRENCY}{lineTotal}</p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <Button asChild size="sm" className="flex-1 gap-1.5" onClick={dismissLastAdded}>
          <Link to="/cart"><ShoppingBag className="size-3.5" /> View cart ({cartCount})</Link>
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={dismissLastAdded}>
          Continue
        </Button>
      </div>
    </div>
  );
}
