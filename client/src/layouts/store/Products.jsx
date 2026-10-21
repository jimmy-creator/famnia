import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LayoutGrid, Grid2x2, ChevronLeft, ChevronRight } from 'lucide-react';
import api from '../../api/axios';
import SEO from '../../components/SEO';
import ProductCard from './ProductCard';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const STORE_NAME = import.meta.env.VITE_STORE_NAME || 'Femnia';

export default function Products() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('product-view') || 'grid');

  const page = parseInt(searchParams.get('page') || '1');
  const category = searchParams.get('category') || '';
  const search = searchParams.get('search') || '';
  const sort = searchParams.get('sort') || 'createdAt';
  const order = searchParams.get('order') || 'DESC';

  useEffect(() => {
    api.get('/products/categories').then((res) => setCategories(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = { page, limit: 12, sort, order };
    if (category) params.category = category;
    if (search) params.search = search;

    api.get('/products', { params })
      .then((res) => {
        setProducts(res.data.products);
        setTotalPages(res.data.totalPages);
        setTotal(res.data.total || 0);
      })
      .catch(console.error)
      .finally(() => setLoading(false));

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [page, category, search, sort, order]);

  const updateFilter = (key, value) => {
    const params = new URLSearchParams(searchParams);
    if (value) params.set(key, value);
    else params.delete(key);
    if (key !== 'page') params.set('page', '1');
    setSearchParams(params);
  };

  const setView = (mode) => {
    setViewMode(mode);
    localStorage.setItem('product-view', mode);
  };

  const title = search ? `"${search}"${category ? ` · ${category}` : ''}` : category || t('products.allProducts');

  const gridClass =
    viewMode === 'two-col'
      ? 'grid grid-cols-2 gap-3 lg:gap-4'
      : 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-4';

  // Category chips stand in for the old sidebar + filter drawer — one control
  // that works identically at every width.
  const chipCls = (selected) =>
    cn(
      'shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-medium transition-colors',
      selected
        ? 'bg-primary text-primary-foreground'
        : 'bg-card text-foreground ring-1 ring-border hover:ring-primary',
    );

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
      <SEO
        title={search ? `${t('common.search')}: ${search}` : category || t('products.allProducts')}
        description={`Shop ${category ? category + ' at' : 'all products at'} ${STORE_NAME}. Fast delivery and easy returns.`}
      />

      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
            {title}
          </h1>
          {!loading && total > 0 && (
            <p className="mt-1 text-[13px] text-muted-foreground">
              {t('products.items', { count: total })}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Select
            value={`${sort}-${order}`}
            onValueChange={(v) => {
              const [s, o] = v.split('-');
              const p = new URLSearchParams(searchParams);
              p.set('sort', s);
              p.set('order', o);
              p.set('page', '1');
              setSearchParams(p);
            }}
          >
            <SelectTrigger className="w-[160px] rounded-full bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="createdAt-DESC">{t('products.sortNewest')}</SelectItem>
              <SelectItem value="price-ASC">{t('products.sortPriceLow')}</SelectItem>
              <SelectItem value="price-DESC">{t('products.sortPriceHigh')}</SelectItem>
              <SelectItem value="name-ASC">A–Z</SelectItem>
            </SelectContent>
          </Select>

          <div className="hidden items-center rounded-full bg-card p-0.5 ring-1 ring-border sm:flex">
            <Button
              type="button"
              variant={viewMode === 'two-col' ? 'secondary' : 'ghost'}
              size="icon-sm"
              className="rounded-full"
              onClick={() => setView('two-col')}
              aria-label="Two columns"
            >
              <Grid2x2 className="size-4" />
            </Button>
            <Button
              type="button"
              variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
              size="icon-sm"
              className="rounded-full"
              onClick={() => setView('grid')}
              aria-label="Grid"
            >
              <LayoutGrid className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      {categories.length > 0 && (
        <div className="-mx-4 mb-6 flex gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:px-0 [&::-webkit-scrollbar]:hidden">
          <button type="button" className={chipCls(!category)} onClick={() => updateFilter('category', '')}>
            {t('common.all')}
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              className={chipCls(category === cat)}
              onClick={() => updateFilter('category', cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className={gridClass}>
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-3 rounded-2xl bg-card p-3 ring-1 ring-border/70">
              <Skeleton className="aspect-[3/4] w-full rounded-xl" />
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="flex min-h-64 items-center justify-center rounded-2xl border border-dashed border-border text-muted-foreground">
          {t('products.noResults')}
        </div>
      ) : (
        <>
          <div className={gridClass}>
            {products.map((p) => <ProductCard key={p.id} product={p} eager />)}
          </div>

          {totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => updateFilter('page', String(page - 1))}
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
                onClick={() => updateFilter('page', String(page + 1))}
                disabled={page >= totalPages}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-[13px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-40"
              >
                {t('common.more')}
                <ChevronRight className="size-4 rtl:rotate-180" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
