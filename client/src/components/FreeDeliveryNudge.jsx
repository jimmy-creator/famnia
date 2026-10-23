import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Truck } from 'lucide-react';
import api from '../api/axios';
import ProductImage from './ProductImage';
import { CurrencySymbol, formatPrice } from '../utils/currency';
import { localizedName } from '../utils/i18nHelpers';
import { imageOf } from '../lib/productImages';
import { cn } from '@/lib/utils';

import { useShippingRates } from '../lib/shippingRates';

/**
 * "Add QAR X more for free delivery" with a progress bar and a few in-stock
 * products that would close the gap. Shows a "you've got free delivery" line
 * once the subtotal reaches the threshold.
 */
export default function FreeDeliveryNudge({ subtotal, excludeIds = [], className }) {
  const threshold = useShippingRates()?.freeAbove || 0;
  const [products, setProducts] = useState([]);
  const gap = Math.max(0, Math.round((threshold - subtotal) * 100) / 100);

  useEffect(() => {
    if (!gap) return;
    api.get('/products', { params: { limit: 60, sort: 'price', order: 'ASC' } })
      .then((r) => setProducts(r.data?.products || []))
      .catch(() => {});
  }, [gap > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cheapest products that alone close the gap; failing that, the priciest ones.
  const { suggestions, oneIsEnough } = useMemo(() => {
    const pool = products.filter((p) => !excludeIds.includes(p.id));
    const closing = pool.filter((p) => parseFloat(p.price) >= gap);
    return { suggestions: (closing.length ? closing : [...pool].reverse()).slice(0, 4), oneIsEnough: closing.length > 0 };
  }, [products, gap, excludeIds]);

  if (!threshold) return null;

  if (!gap) {
    return (
      <div className={cn('flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700', className)}>
        <Truck className="size-4 shrink-0" /> You&apos;ve got FREE delivery on this order!
      </div>
    );
  }

  const pct = Math.min(100, Math.round((subtotal / threshold) * 100));
  return (
    <div className={cn('rounded-lg border border-primary/30 bg-primary/5 p-4', className)}>
      <p className="flex items-start gap-2 text-sm">
        <Truck className="mt-0.5 size-4 shrink-0 text-primary" />
        <span>
          Add <strong className="whitespace-nowrap"><CurrencySymbol />{formatPrice(gap)}</strong> more to get{' '}
          <strong>FREE delivery</strong> (orders of <span className="whitespace-nowrap"><CurrencySymbol />{formatPrice(threshold)}</span> and above).
        </span>
      </p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-primary/15" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
      {suggestions.length > 0 && (
        <>
          <p className="mt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">{oneIsEnough ? 'Add one of these to get free delivery' : 'Add more from these to reach free delivery'}</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {suggestions.map((p) => {
              const img = imageOf(p);
              return (
                <Link key={p.id} to={`/product/${p.slug}`} className="group flex min-w-0 items-center gap-3 rounded-md border border-border bg-background p-2">
                  <div className="h-16 w-12 shrink-0 overflow-hidden rounded bg-muted">
                    {img ? <img src={img} alt="" loading="lazy" className="size-full object-cover" /> : <ProductImage product={p} size="small" />}
                  </div>
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-xs font-medium group-hover:text-primary">{localizedName(p)}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground"><CurrencySymbol />{formatPrice(p.price)}</p>
                    <p className="mt-0.5 text-xs font-medium text-primary">View →</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
