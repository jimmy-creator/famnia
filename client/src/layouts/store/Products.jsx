import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SlidersHorizontal, LayoutGrid, Grid2x2, ChevronLeft, ChevronRight } from 'lucide-react';
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const STORE_NAME = import.meta.env.VITE_STORE_NAME || 'Elegant Bayt';

export default function Products() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalPages, setTotalPages] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
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

  const title = search ? `"${search}"` : category || 'Everything';

  const CategoryFilter = ({ onPick }) => (
    <div className="flex flex-col gap-1">
      <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t('products.category')}
      </h4>
      <button
        className={cn(
          'rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent',
          !category && 'bg-accent font-medium text-accent-foreground',
        )}
        onClick={() => { updateFilter('category', ''); onPick?.(); }}
      >
        {t('common.all')} {t('products.category').toLowerCase()}
      </button>
      {categories.map((cat) => (
        <button
          key={cat}
          className={cn(
            'rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent',
            category === cat && 'bg-accent font-medium text-accent-foreground',
          )}
          onClick={() => { updateFilter('category', cat); onPick?.(); }}
        >
          {cat}
        </button>
      ))}
    </div>
  );

  const gridClass =
    viewMode === 'two-col'
      ? 'grid grid-cols-2 gap-4'
      : 'grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4';

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
      <SEO
        title={search ? `${t('common.search')}: ${search}` : category || t('products.allProducts')}
        description={`Shop ${category ? category + ' at' : 'all products at'} ${STORE_NAME}. Fast delivery and easy returns.`}
      />

      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            {search ? 'Searching for' : 'Collection'}
          </p>
          <h1 className="font-serif text-3xl font-semibold italic tracking-tight text-foreground sm:text-4xl">
            {title}
          </h1>
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
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="createdAt-DESC">{t('products.sortNewest')}</SelectItem>
              <SelectItem value="price-ASC">{t('products.sortPriceLow')}</SelectItem>
              <SelectItem value="price-DESC">{t('products.sortPriceHigh')}</SelectItem>
              <SelectItem value="name-ASC">A–Z</SelectItem>
            </SelectContent>
          </Select>

          <div className="hidden items-center rounded-md border border-input p-0.5 sm:flex">
            <Button
              type="button"
              variant={viewMode === 'two-col' ? 'secondary' : 'ghost'}
              size="icon-sm"
              onClick={() => setView('two-col')}
              aria-label="Two columns"
            >
              <Grid2x2 className="size-4" />
            </Button>
            <Button
              type="button"
              variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
              size="icon-sm"
              onClick={() => setView('grid')}
              aria-label="Grid"
            >
              <LayoutGrid className="size-4" />
            </Button>
          </div>

          {/* Mobile filter trigger */}
          <Sheet open={showFilters} onOpenChange={setShowFilters}>
            <SheetTrigger asChild>
              <Button variant="outline" className="gap-2 lg:hidden">
                <SlidersHorizontal className="size-4" /> {t('products.filters')}
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72">
              <SheetHeader>
                <SheetTitle>{t('products.filters')}</SheetTitle>
              </SheetHeader>
              <div className="px-4 pb-4">
                <CategoryFilter onPick={() => setShowFilters(false)} />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      <div className="flex gap-8">
        {/* Desktop sidebar */}
        <aside className="hidden w-56 shrink-0 lg:block">
          <div className="sticky top-20">
            <CategoryFilter />
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          {loading ? (
            <div className={gridClass}>
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="flex flex-col gap-3">
                  <Skeleton className="aspect-square w-full rounded-lg" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/3" />
                </div>
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="flex min-h-64 items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground">
              No products found.
            </div>
          ) : (
            <>
              <div className={gridClass}>
                {products.map((p) => <ProductCard key={p.id} product={p} eager />)}
              </div>

              {totalPages > 1 && (() => {
                const WINDOW = 7;
                const start = Math.min(
                  Math.max(1, page - Math.floor(WINDOW / 2)),
                  Math.max(1, totalPages - WINDOW + 1),
                );
                const end = Math.min(totalPages, start + WINDOW - 1);
                const pages = Array.from({ length: end - start + 1 }, (_, i) => start + i);
                return (
                  <div className="mt-10 flex flex-wrap items-center justify-center gap-1.5">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => updateFilter('page', String(page - 1))}
                      disabled={page === 1}
                      aria-label="Previous page"
                    >
                      <ChevronLeft className="size-4" />
                    </Button>
                    {pages.map((n) => (
                      <Button
                        key={n}
                        variant={page === n ? 'default' : 'outline'}
                        size="icon"
                        onClick={() => updateFilter('page', String(n))}
                      >
                        {n}
                      </Button>
                    ))}
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => updateFilter('page', String(page + 1))}
                      disabled={page === totalPages}
                      aria-label="Next page"
                    >
                      <ChevronRight className="size-4" />
                    </Button>
                  </div>
                );
              })()}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
