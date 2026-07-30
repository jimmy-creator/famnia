import { Link, useLocation } from 'react-router-dom';
import { Home, LayoutGrid, Heart, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { useWishlist } from '../../context/WishlistContext';
import { FemniaMonogram } from './Logo';
import { cn } from '@/lib/utils';

/**
 * Mobile-only bottom tab bar with the brand pill in the middle.
 * Hidden from `md` up, where the top nav carries the same destinations.
 */
export default function BottomNav() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { user } = useAuth();
  const { wishlistCount } = useWishlist();

  const isHome = pathname === '/' || pathname === '/ar';
  const accountPath = user ? '/profile' : '/login';

  const tabs = [
    { to: '/', icon: Home, label: t('common.home'), active: isHome },
    { to: '/products', icon: LayoutGrid, label: t('nav.shop'), active: pathname.startsWith('/products') },
    null, // slot for the centre brand pill
    { to: '/wishlist', icon: Heart, label: t('common.wishlist'), active: pathname.startsWith('/wishlist'), count: wishlistCount },
    { to: accountPath, icon: User, label: t('common.account'), active: ['/profile', '/login', '/orders'].some((p) => pathname.startsWith(p)) },
  ];

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-label={t('nav.bottomNav', { defaultValue: 'Primary' })}
    >
      {/* px-2 keeps the outer labels off the screen edges: the columns are
          equal width, so a long word like ACCOUNT would otherwise sit much
          closer to the edge than a short one like HOME. */}
      <div className="mx-auto grid h-16 max-w-lg grid-cols-5 items-center px-2">
        {tabs.map((tab, i) =>
          tab === null ? (
            <Link
              key="brand"
              to="/"
              aria-label="Femnia"
              className="flex items-center justify-center"
            >
              <span className="flex size-14 -translate-y-3 items-center justify-center rounded-full bg-foreground shadow-lg">
                <FemniaMonogram className="h-8 w-auto" />
              </span>
            </Link>
          ) : (
            <Link
              key={tab.to + i}
              to={tab.to}
              className={cn(
                'relative flex flex-col items-center gap-1 py-1 transition-colors',
                tab.active ? 'text-[color:var(--gold)]' : 'text-foreground/55',
              )}
            >
              <tab.icon className="size-[19px] stroke-[1.6]" />
              <span className="text-[9px] font-medium uppercase tracking-[0.12em]">{tab.label}</span>
              {tab.count > 0 && (
                <span className="absolute right-1/2 top-0 -mr-4 flex size-4 items-center justify-center rounded-full bg-[color:var(--gold)] text-[9px] font-semibold leading-none text-white">
                  {tab.count}
                </span>
              )}
            </Link>
          ),
        )}
      </div>
    </nav>
  );
}
