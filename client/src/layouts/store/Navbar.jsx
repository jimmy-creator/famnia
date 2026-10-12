import { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, Search, User, ShoppingBag, Home, LayoutGrid, Heart } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { useWishlist } from '../../context/WishlistContext';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from '../../components/LanguageSwitcher';
import api from '../../api/axios';
import ScrollToTopButton from '../../components/ScrollToTopButton';
import AnnouncementBar from '../../components/AnnouncementBar';
import ProductImage from '../../components/ProductImage';
import { FemniaMonogram } from './Logo';
import BottomNav from './BottomNav';
import { CurrencySymbol, formatPrice } from '../../utils/currency';
import { localizedName } from '../../utils/i18nHelpers';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

const STORE_NAME = import.meta.env.VITE_STORE_NAME || 'Femnia';

// Links on the light category strip below the gradient masthead.
const bandLinkCls =
  'whitespace-nowrap text-[13px] font-medium text-muted-foreground transition-colors hover:text-primary';

// Superscript count on the cart / wishlist icons. White-on-berry, since these
// icons sit on the gradient. Declared at module scope so it isn't re-created
// (and its subtree remounted) on every Navbar render.
function CountBadge({ count }) {
  if (!count) return null;
  return (
    <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold leading-none text-[color:var(--copper)]">
      {count}
    </span>
  );
}

export default function Navbar() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { cartCount } = useCart();
  const { wishlistCount } = useWishlist();
  const location = useLocation();
  const navigate = useNavigate();

  const [categories, setCategories] = useState([]);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const debounceRef = useRef(null);

  useEffect(() => {
    api.get('/categories').then((res) => setCategories(Array.isArray(res.data) ? res.data : [])).catch(() => {});
  }, []);

  useEffect(() => {
    // Close suggestions on outside click. `data-search` is on both the desktop
    // and mobile search forms, so this works regardless of which is visible.
    const onClick = (e) => {
      if (!e.target.closest('[data-search]')) setShowSuggestions(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // Search autocomplete (debounced)
  useEffect(() => {
    if (query.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const { data } = await api.get(`/products/search-suggestions?q=${encodeURIComponent(query)}`);
        setSuggestions(data);
        setShowSuggestions(data.length > 0);
        setActiveIndex(-1);
      } catch {
        setSuggestions([]);
      }
    }, 250);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const pickSuggestion = (product) => {
    setShowSuggestions(false);
    setQuery('');
    navigate(`/product/${product.slug}`);
    setShowMobileMenu(false);
  };

  const onSearchKeyDown = (e) => {
    if (!showSuggestions) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, -1));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      pickSuggestion(suggestions[activeIndex]);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  const isAccount = ['/profile', '/login', '/orders', '/admin'].includes(location.pathname);

  // Clicking Home (or the logo) while already on the home page is a no-op
  // navigation — scroll to top instead. Route changes already scroll via App.jsx.
  const scrollTopIfHome = () => {
    if (location.pathname === '/' || location.pathname === '/ar') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleSearch = (e) => {
    e?.preventDefault?.();
    const params = new URLSearchParams();
    if (query.trim()) params.set('search', query.trim());
    navigate(`/products?${params.toString()}`);
    setShowSuggestions(false);
    setShowMobileMenu(false);
  };

  // Search pill — a white field sitting on the brand gradient. Rendered twice:
  // inline in the desktop header row, and as its own full-width row beneath the
  // bar on mobile. `data-search` ties both to the outside-click handler above.
  const searchForm = (
    <form onSubmit={handleSearch} data-search className="relative w-full">
      <div className="flex h-11 w-full items-center gap-2.5 rounded-full bg-white ps-4 pe-1.5 shadow-sm transition-shadow focus-within:ring-[3px] focus-within:ring-white/40">
        <Search className="size-[18px] shrink-0 text-[color:var(--copper)]" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
          onKeyDown={onSearchKeyDown}
          placeholder={`${t('common.search')} ${STORE_NAME}`}
          className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground md:text-sm [&::-webkit-search-cancel-button]:appearance-none"
        />
        <button
          type="submit"
          aria-label={t('common.search')}
          className="hidden h-8 shrink-0 items-center rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 sm:flex"
        >
          {t('common.search')}
        </button>
      </div>

      {showSuggestions && (
        <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
          {suggestions.map((p, i) => (
            <button
              key={p.id}
              type="button"
              className={cn('flex w-full items-center gap-3 px-3 py-2 text-left transition-colors', activeIndex === i ? 'bg-accent' : 'hover:bg-accent/60')}
              onClick={() => pickSuggestion(p)}
              onMouseEnter={() => setActiveIndex(i)}
            >
              <div className="size-10 shrink-0 overflow-hidden rounded-md bg-muted">
                <ProductImage product={p} size="small" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">{p.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{p.category} · <CurrencySymbol />{formatPrice(p.price)}</span>
              </div>
            </button>
          ))}
          <button
            type="button"
            className="block w-full border-t border-border px-3 py-2.5 text-center text-sm font-medium text-primary hover:bg-accent/60"
            onClick={handleSearch}
          >
            View all results for &ldquo;{query}&rdquo;
          </button>
        </div>
      )}
    </form>
  );

  // Gradient masthead: brand lock-up leading, search filling the middle on
  // desktop, account actions trailing. On mobile the search drops to its own
  // full-width row beneath, and the panel's bottom corners are rounded so the
  // page scrolls up behind a soft edge.
  const masthead = (
    <div
      className="rounded-b-[28px] text-white shadow-[0_6px_20px_rgba(43,22,32,0.15)] md:rounded-none md:shadow-none"
      style={{ background: 'var(--brand-gradient)' }}
    >
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <div className="flex h-16 items-center gap-3 md:h-20">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="-ms-2 shrink-0 text-white hover:bg-white/15 hover:text-white md:hidden"
            onClick={() => setShowMobileMenu(true)}
            aria-label={t('common.menu')}
          >
            <Menu className="size-5" />
          </Button>

          <Link
            to="/"
            onClick={scrollTopIfHome}
            aria-label={STORE_NAME}
            className="flex shrink-0 items-center gap-2.5"
          >
            {/* The cream monogram sits straight on the dark gradient — the
                full lockup's wordmark is unreadable at this size, and the
                store name is spelled out beside it anyway. */}
            <FemniaMonogram className="h-10 w-auto shrink-0 md:h-12" title={STORE_NAME} />
            <span className="flex flex-col leading-tight">
              <span className="text-[9px] font-medium uppercase tracking-[0.2em] text-white/65">
                {t('common.welcomeTo')}
              </span>
              <span className="text-[17px] font-extrabold tracking-tight text-white md:text-xl">
                {STORE_NAME}
              </span>
            </span>
          </Link>

          {/* Desktop search — takes whatever room the two clusters leave. */}
          <div className="mx-6 hidden min-w-0 flex-1 md:block">{searchForm}</div>

          <div className="ms-auto flex items-center gap-0.5 sm:gap-1 md:ms-0">
            <span className="hidden sm:inline-flex">
              <LanguageSwitcher compact />
            </span>
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="relative hidden text-white hover:bg-white/15 hover:text-white sm:inline-flex"
              aria-label={t('common.wishlist')}
            >
              <Link to="/wishlist">
                <Heart className="size-5" />
                <CountBadge count={wishlistCount} />
              </Link>
            </Button>
            <Button
              asChild
              variant="ghost"
              size="icon"
              className={cn(
                'hidden text-white hover:bg-white/15 hover:text-white sm:inline-flex',
                isAccount && 'bg-white/15',
              )}
              aria-label={user ? t('common.account') : t('common.signIn')}
            >
              <Link to={user ? '/profile' : '/login'}>
                <User className="size-5" />
              </Link>
            </Button>
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="relative text-white hover:bg-white/15 hover:text-white"
              aria-label={t('common.cart')}
            >
              <Link to="/cart">
                <ShoppingBag className="size-5" />
                <CountBadge count={cartCount} />
              </Link>
            </Button>
          </div>
        </div>

        {/* Mobile search row — always on, rather than hidden behind a toggle. */}
        <div className="pb-4 md:hidden">{searchForm}</div>
      </div>
    </div>
  );

  // Light category strip under the gradient: the "All Categories" launcher, the
  // primary links, and the shipping note pinned to the trailing edge. Desktop
  // only — mobile uses the slide-in sheet and the home page's chip row instead.
  const categoryBand = (
    <div className="hidden border-b border-border bg-card md:block">
      <div className="mx-auto flex h-11 max-w-7xl items-stretch px-4 lg:px-8">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex shrink-0 items-center gap-2 pe-6 text-foreground transition-colors hover:text-primary"
              aria-label={t('common.allCategories')}
            >
              <Menu className="size-[18px]" />
              <span className="hidden text-[12px] font-semibold lg:inline">
                {t('common.allCategories')}
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
            <DropdownMenuItem asChild>
              <Link to="/products">{t('products.allProducts')}</Link>
            </DropdownMenuItem>
            {categories.map((c) => (
              <DropdownMenuItem key={c.id || c.name} asChild>
                <Link to={`/products?category=${encodeURIComponent(c.name)}`}>{localizedName(c)}</Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <nav className="flex min-w-0 flex-1 items-center gap-6 overflow-x-auto [scrollbar-width:none] lg:gap-8 [&::-webkit-scrollbar]:hidden">
          <Link to="/" onClick={scrollTopIfHome} className={bandLinkCls}>{t('common.home')}</Link>
          <Link to="/products" className={bandLinkCls}>{t('nav.shop')}</Link>
          {/* First few categories promoted onto the strip; the rest live in the
              "All Categories" menu above. */}
          {categories.slice(0, 4).map((c) => (
            <Link
              key={c.id || c.name}
              to={`/products?category=${encodeURIComponent(c.name)}`}
              className={bandLinkCls}
            >
              {localizedName(c)}
            </Link>
          ))}
          <Link to="/about" className={bandLinkCls}>{t('common.aboutUs')}</Link>
          <Link to="/contact" className={bandLinkCls}>{t('common.contact')}</Link>
        </nav>

        <div className="hidden shrink-0 items-center lg:flex">
          <span className="whitespace-nowrap rounded-full bg-[color:var(--bg-warm)] px-4 py-1.5 text-[11px] font-semibold text-[color:var(--copper)]">
            {t('nav.announcement')}
          </span>
        </div>
      </div>
    </div>
  );

  const header = (
    <header className="sticky top-0 z-40 w-full">
      {masthead}
      {categoryBand}
    </header>
  );

  return (
    <>
      <ScrollToTopButton />

      <AnnouncementBar />
      {header}

      {/* Mobile slide-in menu */}
      <Sheet open={showMobileMenu} onOpenChange={setShowMobileMenu}>
        <SheetContent side="left" className="w-80 p-0">
          <SheetHeader className="border-b border-border">
            <SheetTitle className="font-serif text-lg">{t('common.menu')}</SheetTitle>
          </SheetHeader>
          <nav className="flex flex-col p-2">
            {[
              { to: '/', icon: Home, label: t('common.home') },
              { to: '/products', icon: LayoutGrid, label: t('common.products') },
              { to: '/wishlist', icon: Heart, label: t('common.wishlist'), count: wishlistCount },
              { to: '/cart', icon: ShoppingBag, label: t('common.cart'), count: cartCount },
              { to: user ? '/profile' : '/login', icon: User, label: user ? t('common.account') : t('common.signIn') },
            ].map(({ to, icon: Icon, label, count }) => (
              <Link
                key={to + label}
                to={to}
                onClick={() => setShowMobileMenu(false)}
                className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                <Icon className="size-[18px]" />
                <span className="flex-1">{label}</span>
                {count > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
                    {count}
                  </span>
                )}
              </Link>
            ))}
          </nav>
          {/* Language, moved off the crowded mobile top row. The dropdown
              renders in a portal, so it escapes the sheet. */}
          <div className="border-t border-border p-2">
            <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('common.language', 'Language')}
            </div>
            <div className="flex flex-wrap items-center gap-2 px-3 pb-2">
              <LanguageSwitcher />
            </div>
          </div>
          <div className="border-t border-border p-2">
            <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('common.explore')}</div>
            <div className="flex flex-col">
              <Link to="/about" onClick={() => setShowMobileMenu(false)} className="rounded-md px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent">{t('common.aboutUs')}</Link>
              <Link to="/contact" onClick={() => setShowMobileMenu(false)} className="rounded-md px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent">{t('common.contact')}</Link>
            </div>
          </div>
          {categories.length > 0 && (
            <div className="border-t border-border p-2">
              <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('common.categories')}
              </div>
              <div className="flex flex-col">
                <Link
                  to="/products"
                  onClick={() => setShowMobileMenu(false)}
                  className="rounded-md px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent"
                >
                  {t('common.all')} {t('common.categories').toLowerCase()}
                </Link>
                {categories.map((c) => (
                  <Link
                    key={c.id || c.name}
                    to={`/products?category=${encodeURIComponent(c.name)}`}
                    onClick={() => setShowMobileMenu(false)}
                    className="rounded-md px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent"
                  >
                    {localizedName(c)}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <BottomNav />
    </>
  );
}
