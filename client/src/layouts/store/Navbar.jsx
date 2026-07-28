import { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, Search, User, ShoppingBag, ChevronDown, Home, LayoutGrid, Heart } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { useWishlist } from '../../context/WishlistContext';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from '../../components/LanguageSwitcher';
import api from '../../api/axios';
import ScrollToTopButton from '../../components/ScrollToTopButton';
import ProductImage from '../../components/ProductImage';
import { CURRENCY, formatPrice } from '../../utils/currency';
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

const STORE_NAME = import.meta.env.VITE_STORE_NAME || 'Elegant Bayt';

// Shared style for the desktop top-nav links (uppercase, bold, spaced).
const navLinkCls = 'text-[13px] font-semibold uppercase tracking-wide text-foreground/75 transition-colors hover:text-foreground';

export default function Navbar() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { cartCount } = useCart();
  const { wishlistCount } = useWishlist();
  const location = useLocation();
  const navigate = useNavigate();

  const [categories, setCategories] = useState([]);
  const [activeCat, setActiveCat] = useState('All Categories');
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [showSearch, setShowSearch] = useState(false);
  const debounceRef = useRef(null);
  const searchInputRef = useRef(null);

  // Focus the field when the search row is toggled open.
  useEffect(() => {
    if (showSearch) searchInputRef.current?.focus();
  }, [showSearch]);

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
    setShowSearch(false);
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
    if (activeCat && activeCat !== 'All Categories') params.set('category', activeCat);
    navigate(`/products?${params.toString()}`);
    setShowSuggestions(false);
    setShowSearch(false);
    setShowMobileMenu(false);
  };

  const pickCategory = (name) => {
    setActiveCat(name);
    if (name === 'All Categories') navigate('/products');
    else navigate(`/products?category=${encodeURIComponent(name)}`);
  };

  const CartBadge = () =>
    cartCount > 0 ? (
      <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground">
        {cartCount}
      </span>
    ) : null;

  // Search bar — rendered twice: inline on desktop, and as a full-width row
  // below the bar on mobile (standard e-commerce layout). `data-search` ties
  // both instances to the outside-click handler above.
  const searchForm = (
    <form onSubmit={handleSearch} data-search className="relative w-full">
      <div className="flex h-10 w-full items-stretch overflow-hidden rounded-md border border-input bg-background transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/40">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="hidden shrink-0 items-center gap-1.5 border-r border-input pl-3.5 pr-3 text-sm text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
            >
              <LayoutGrid className="size-4" />
              <span className="max-w-28 truncate">
                {activeCat === 'All Categories'
                  ? t('common.allCategories')
                  : localizedName(categories.find((c) => c.name === activeCat) || { name: activeCat })}
              </span>
              <ChevronDown className="size-3.5 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
            <DropdownMenuItem onSelect={() => pickCategory('All Categories')}>{t('common.allCategories')}</DropdownMenuItem>
            {categories.map((c) => (
              <DropdownMenuItem key={c.id || c.name} onSelect={() => pickCategory(c.name)}>{localizedName(c)}</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <input
          ref={searchInputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
          onKeyDown={onSearchKeyDown}
          placeholder={t('common.searchPlaceholder')}
          className="min-w-0 flex-1 bg-transparent px-4 text-base md:text-sm text-foreground outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:appearance-none"
        />
        <button
          type="submit"
          aria-label="Search"
          className="flex shrink-0 items-center justify-center bg-primary px-4 text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Search className="size-4" />
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
                <span className="block truncate text-xs text-muted-foreground">{p.category} · {CURRENCY}{formatPrice(p.price)}</span>
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

  return (
    <>
      <ScrollToTopButton />

      <header className="sticky top-0 z-40 w-full border-b border-border bg-background">
        <nav className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:gap-4 lg:px-8">
          {/* Mobile hamburger */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setShowMobileMenu(true)}
            aria-label={t('common.menu')}
          >
            <Menu className="size-5" />
          </Button>

          {/* Logo */}
          <Link to="/" onClick={scrollTopIfHome} className="flex shrink-0 items-center gap-2.5">
            <img src="/images/elegant-bayt-monogram.png" alt={STORE_NAME} className="h-9 w-auto sm:h-10" />
            <span className="hidden leading-none sm:flex sm:flex-col">
              <span className="font-serif text-lg font-extrabold tracking-[0.14em] text-foreground lg:text-xl">
                ELEGANT <span style={{ color: 'var(--gold)' }}>BAYT</span>
              </span>
              <span className="mt-1 text-[9px] font-medium uppercase tracking-[0.28em] text-muted-foreground">
                {t('brand.tagline')}
              </span>
            </span>
          </Link>

          {/* Desktop nav links */}
          <div className="ml-6 hidden items-center gap-6 md:flex lg:ml-8 lg:gap-8">
            <Link to="/" onClick={scrollTopIfHome} className={navLinkCls}>{t('common.home')}</Link>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className={cn(navLinkCls, 'inline-flex items-center gap-1')}>
                  {t('common.products')} <ChevronDown className="size-3.5 opacity-70" />
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

            <Link to="/about" className={navLinkCls}>{t('common.aboutUs')}</Link>
            <Link to="/contact" className={navLinkCls}>{t('common.contact')}</Link>
          </div>

          {/* Actions */}
          <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
            <LanguageSwitcher compact />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(showSearch && 'text-primary')}
              onClick={() => setShowSearch((s) => !s)}
              aria-label="Search"
              aria-expanded={showSearch}
            >
              <Search className="size-5" />
            </Button>
            <Button
              asChild
              variant="ghost"
              size="icon"
              className={cn(isAccount && 'text-primary')}
              aria-label={user ? 'Account' : 'Sign in'}
            >
              <Link to={user ? '/profile' : '/login'}>
                <User className="size-5" />
              </Link>
            </Button>
            <Button asChild variant="ghost" size="icon" className="relative" aria-label="Cart">
              <Link to="/cart">
                <ShoppingBag className="size-5" />
                <CartBadge />
              </Link>
            </Button>
          </div>
        </nav>

        {/* Search row — toggled by the search icon (all breakpoints) */}
        {showSearch && (
          <div className="border-t border-border bg-background px-4 py-3 lg:px-8">
            <div className="mx-auto max-w-3xl">{searchForm}</div>
          </div>
        )}
      </header>

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
    </>
  );
}
