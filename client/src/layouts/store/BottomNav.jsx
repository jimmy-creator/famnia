import { Link, useLocation } from 'react-router-dom';
import { Home, LayoutGrid, ShoppingBag, Heart, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { useWishlist } from '../../context/WishlistContext';
import { cn } from '@/lib/utils';

/**
 * Mobile-only bottom tab bar: a dark berry panel with rounded top corners that
 * the page scrolls behind. The active destination is marked by a filled blush
 * pill rather than a colour change, which reads at a glance on the dark ground.
 *
 * Hidden from `md` up, where the top nav carries the same destinations.
 */
export default function BottomNav() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { user } = useAuth();
  const { cartCount } = useCart();
  const { wishlistCount } = useWishlist();

  const isHome = pathname === '/' || pathname === '/ar';

  const tabs = [
    { to: '/', icon: Home, label: t('common.home'), active: isHome },
    { to: '/products', icon: LayoutGrid, label: t('nav.shop'), active: pathname.startsWith('/products') },
    { to: '/cart', icon: ShoppingBag, label: t('common.cart'), active: pathname.startsWith('/cart'), count: cartCount },
    { to: '/wishlist', icon: Heart, label: t('common.wishlist'), active: pathname.startsWith('/wishlist'), count: wishlistCount },
    {
      to: user ? '/profile' : '/login',
      icon: User,
      label: t('common.account'),
      active: ['/profile', '/login', '/orders'].some((p) => pathname.startsWith(p)),
    },
  ];

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 rounded-t-[26px] pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_24px_rgba(43,22,32,0.18)] md:hidden"
      style={{ backgroundColor: 'var(--bg-dark)' }}
      aria-label={t('nav.bottomNav', { defaultValue: 'Primary' })}
    >
      {/* px-2 keeps the outer tabs off the screen edges: the columns are equal
          width, so a long word like ACCOUNT would otherwise sit much closer to
          the edge than a short one like HOME. */}
      <div className="mx-auto grid h-16 max-w-lg grid-cols-5 items-center px-2">
        {tabs.map((tab) => (
          <Link
            key={tab.to}
            to={tab.to}
            aria-current={tab.active ? 'page' : undefined}
            className="flex flex-col items-center justify-center gap-1"
          >
            <span
              className={cn(
                'relative flex h-8 items-center justify-center rounded-full px-4 transition-colors',
                tab.active ? 'text-[color:var(--bg-dark)]' : 'text-white/60',
              )}
              style={tab.active ? { backgroundColor: 'var(--gold)' } : undefined}
            >
              <tab.icon className="size-[19px] stroke-[1.7]" />
              {tab.count > 0 && (
                <span className="absolute -top-0.5 right-1 flex size-4 items-center justify-center rounded-full bg-white text-[9px] font-bold leading-none text-[color:var(--copper)]">
                  {tab.count}
                </span>
              )}
            </span>
            <span
              className={cn(
                'text-[9px] font-medium uppercase tracking-[0.1em] transition-colors',
                tab.active ? 'text-white' : 'text-white/50',
              )}
            >
              {tab.label}
            </span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
