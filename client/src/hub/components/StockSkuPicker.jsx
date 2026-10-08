import { useMemo, useState } from 'react';

import { Input } from '@/hub/ui/input';
import { cn } from '@/lib/utils';

/**
 * Search every active SKU by Product Code, SKU, name, size or colour. The
 * SKU is always the unique identifier — variants are never merged by name.
 */
export function StockSkuPicker({ products, value, onSelect }) {
  const [term, setTerm] = useState('');

  const matches = useMemo(() => {
    const active = products.filter((p) => p.isActive !== false);
    const q = term.trim().toLowerCase();
    if (!q) return active.slice(0, 25);
    return active
      .filter((p) =>
        `${p.productCode ?? ''} ${p.sku} ${p.name} ${p.size ?? ''} ${p.color ?? ''} ${p.category ?? ''}`
          .toLowerCase()
          .includes(q),
      )
      .slice(0, 50);
  }, [products, term]);

  return (
    <div className="space-y-2">
      <Input
        placeholder="Search Product Code, SKU code or product name…"
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        className="h-11"
      />
      <div className="max-h-56 overflow-y-auto rounded-2xl border border-border">
        {matches.length === 0 && <p className="p-4 text-sm text-muted-foreground">No product matches this search.</p>}
        {matches.map((product) => (
          <button
            key={product.key}
            type="button"
            onClick={() => onSelect(product)}
            className={cn(
              'flex w-full items-center justify-between gap-3 border-b border-border px-3 py-3 text-left text-sm last:border-b-0 hover:bg-secondary/60',
              value?.key === product.key && 'bg-secondary',
            )}
          >
            <span className="min-w-0">
              <span className="block truncate font-medium text-foreground">{product.name}</span>
              <span className="block text-xs text-muted-foreground">
                {product.productCode ? `${product.productCode} · ` : ''}
                {product.sku}
                {product.size ? ` · ${product.size}` : ''}
                {product.color ? ` · ${product.color}` : ''}
              </span>
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              Stock <span className="font-semibold text-foreground">{product.currentStock}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
