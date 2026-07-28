import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Trash2, Minus, Plus, ShoppingCart } from 'lucide-react';
import { useCart } from '../context/CartContext';
import ProductImage from '../components/ProductImage';
import TamaraWidget from '../components/TamaraWidget';
import { CurrencySymbol, formatPrice } from '../utils/currency';
import { localizedName } from '../utils/i18nHelpers';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

export default function Cart() {
  const { t } = useTranslation();
  const { cart, removeFromCart, updateQuantity, cartTotal } = useCart();

  if (cart.length === 0) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center">
        <div className="mb-4 flex size-16 items-center justify-center rounded-full bg-secondary">
          <ShoppingCart className="size-7 text-muted-foreground" />
        </div>
        <h2 className="font-serif text-2xl font-semibold">{t('cart.empty')}</h2>
        <p className="mt-2 text-muted-foreground">{t('cart.emptyHint')}</p>
        <Button asChild className="mt-6">
          <Link to="/products">{t('common.shopNow')}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
      <h1 className="mb-6 font-serif text-3xl font-semibold tracking-tight">{t('cart.title')}</h1>

      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        {/* Items */}
        <div className="flex min-w-0 flex-col divide-y divide-border rounded-lg border border-border">
          {cart.map((item) => (
            <div key={item.cartKey} className="flex gap-4 p-4">
              <Link to={`/product/${item.slug}`} className="size-20 shrink-0 overflow-hidden rounded-md bg-muted">
                <ProductImage product={item} size="small" />
              </Link>

              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link to={`/product/${item.slug}`} className="line-clamp-2 font-medium hover:text-primary">
                      {localizedName(item)}
                    </Link>
                    {item.selectedVariant && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {Object.entries(item.selectedVariant).map(([k, v]) => `${k}: ${v}`).join(' / ')}
                      </p>
                    )}
                    <p className="mt-1 text-sm text-muted-foreground"><CurrencySymbol />{formatPrice(item.price)}</p>
                  </div>
                  <div className="shrink-0 whitespace-nowrap text-right font-semibold">
                    <CurrencySymbol />{formatPrice(parseFloat(item.price) * item.quantity)}
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-3">
                  <div className="flex items-center rounded-md border border-input">
                    <Button variant="ghost" size="icon-sm" onClick={() => updateQuantity(item.cartKey, item.quantity - 1)} aria-label="Decrease">
                      <Minus className="size-3.5" />
                    </Button>
                    <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                    <Button variant="ghost" size="icon-sm" onClick={() => updateQuantity(item.cartKey, item.quantity + 1)} aria-label="Increase">
                      <Plus className="size-3.5" />
                    </Button>
                  </div>
                  <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" onClick={() => removeFromCart(item.cartKey)} aria-label="Remove">
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Summary */}
        <div className="min-w-0">
          <Card className="sticky top-20">
            <CardHeader>
              <CardTitle className="text-lg">{t('checkout.orderSummary')}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t('cart.subtotal')}</span>
                <span><CurrencySymbol />{formatPrice(cartTotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t('cart.shipping')}</span>
                <span className="text-muted-foreground">Calculated at checkout</span>
              </div>
              <Separator />
              <div className="flex justify-between text-base font-semibold">
                <span>Total</span>
                <span><CurrencySymbol />{formatPrice(cartTotal)}</span>
              </div>
              <TamaraWidget amount={cartTotal} />
              <Button asChild size="lg" className="mt-2 w-full">
                <Link to="/checkout">{t('cart.proceedToCheckout')}</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
