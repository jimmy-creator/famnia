import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  BarChart3,
  ChevronRight,
  Boxes,
  ExternalLink,
  Home,
  Landmark,
  LogOut,
  Menu,
  Package,
  PackagePlus,
  ShoppingCart,
  Store,
  Truck,
  ShieldCheck,
  UserRound,
  Wallet,
  X,
} from 'lucide-react';

import { FemniaLockup, FemniaLogo } from '@/hub/components/Brand';
import { accessQuery } from '@/hub/lib/api';
import { can } from '@/hub/lib/permissions';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import { ERP_SCREENS, STORE_SCREENS, canOpenScreen, canOpenStoreScreen } from '@/hub/lib/erpScreens';

// One menu for the whole back office. Items are either hub pages (gated on a
// hub permission) or our ERP screens at /hub/m/:screen (gated on the classic
// area the server checks — see erpScreens.js).
const page = (to, label, permission, extra = {}) => ({ to, label, permission, ...extra });
const erp = (screen) => ({ to: `/hub/m/${screen}`, label: ERP_SCREENS[screen].title, screen });
const store = (screen) => ({ to: `/hub/s/${screen}`, label: STORE_SCREENS[screen].title, storeScreen: screen });

const NAV_GROUPS = [
  { id: 'home', items: [page('/hub/dashboard', 'Dashboard', 'dashboard.view')], icon: Home, flat: true },
  {
    id: 'sales', label: 'Sales', icon: ShoppingCart,
    items: [
      page('/hub/pos', 'New Sales Order', 'orders.create'),
      page('/hub/orders', 'Sales Orders', 'orders.view_all'),
      page('/hub/customers', 'Customers', 'customers.view'),
      page('/hub/invoices', 'Invoices & Labels', 'invoices.view'),
      erp('till-returns'),
    ],
  },
  {
    id: 'catalogue', label: 'Catalogue', icon: Package,
    items: [page('/hub/products', 'Products', 'products.view'), erp('categories')],
  },
  {
    id: 'inventory', label: 'Inventory', icon: Boxes,
    items: [
      page('/hub/inventory', 'Inventory', 'inventory.view'),
      page('/hub/stock-in', 'Stock In', 'inventory.stock_in'),
      page('/hub/stock-out', 'Stock Out', 'inventory.stock_out'),
      erp('stock-counts'), erp('wastage'), erp('transfers'), erp('stock-on-hand'), erp('locations'), erp('reorder'),
    ],
  },
  {
    id: 'purchasing', label: 'Purchasing', icon: PackagePlus,
    items: [erp('suppliers'), erp('purchase-orders'), erp('purchase-returns')],
  },
  {
    id: 'delivery', label: 'Delivery', icon: Truck,
    items: [
      page('/hub/delivery', 'Delivery', 'delivery.view'),
      page('/hub/my-deliveries', 'My Deliveries', null, { deliveryOnly: true }),
      page('/hub/delivery-reports', 'Delivery Reports', 'delivery.view'),
    ],
  },
  {
    id: 'finance', label: 'Finance', icon: Wallet,
    items: [
      page('/hub/expenses', 'Expenses & Assets', 'expenses.view'),
      erp('cash-accounts'), erp('cash-transfers'), erp('daily-cash'), erp('daybook'), erp('fixed-assets'), erp('capital'),
      erp('pnl'), erp('balance-sheet'), erp('stock-value'),
    ],
  },
  {
    id: 'reports', label: 'Reports', icon: BarChart3,
    items: [
      page('/hub/reports', 'Reports', 'reports.operational'),
      erp('sales-report'), erp('fast-moving'), erp('dead-stock'), erp('purchase-report'), erp('pos-reports'),
    ],
  },
  { id: 'pos', label: 'POS', icon: Landmark, items: [erp('cashiers')] },
  {
    id: 'store', label: 'Online Store', icon: Store,
    items: ['abandoned-carts', 'b2b-quotes', 'reviews', 'coupons', 'theme'].map(store),
  },
  {
    id: 'admin', label: 'Admin', icon: ShieldCheck,
    items: [
      page('/hub/staff', 'Staff & Permissions', 'admin.manage_staff'),
      page('/hub/settings', 'Settings', null, { adminOnly: true }),
      page('/hub/staff?tab=activity', 'Activity Log', 'admin.view_audit'),
    ],
  },
];

const COLLAPSE_KEY = 'femnia-hub-nav-collapsed-v1';

function visibleItem(access, item) {
  if (!access) return false;
  if (item.screen) return canOpenScreen(access, item.screen);
  if (item.storeScreen) return canOpenStoreScreen(access, item.storeScreen);
  if (item.deliveryOnly) return access.roles.includes('delivery');
  if (item.adminOnly) return access.isAdmin; // settings are written by Admins only
  if (item.staffOnly) return access.isAdmin || access.roles.includes('staff');
  return can(access, item.permission);
}

export function AppShell({ children }) {
  const [open, setOpen] = useState(false);
  const { logout: signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pathname } = useLocation();
  const access = useQuery(accessQuery);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return new Set(JSON.parse(window.localStorage.getItem(COLLAPSE_KEY) ?? '[]'));
    } catch {
      return new Set();
    }
  });
  const toggleGroup = (id) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        window.localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...next]));
      } catch {
        /* storage unavailable — collapse state lives for this visit */
      }
      return next;
    });

  const logout = async () => {
    try {
      await signOut();
    } finally {
      queryClient.clear();
      navigate('/hub/login', { replace: true });
    }
  };

  const isActive = (to) => pathname === to || pathname.startsWith(`${to}/`);
  const link = ({ to, label }, Icon) => (
    <Link
      key={to}
      to={to}
      onClick={() => setOpen(false)}
      className={cn(
        'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
        isActive(to) ? 'bg-primary text-primary-foreground shadow-sm' : 'text-foreground/80 hover:bg-secondary hover:text-primary',
      )}
    >
      {Icon ? <Icon className="size-4 shrink-0" /> : <span className="ml-1.5 mr-0.5 size-1.5 shrink-0 rounded-full bg-current opacity-60" />}
      <span className="truncate">{label}</span>
    </Link>
  );

  const nav = (
    <nav className="flex flex-col gap-1">
      {NAV_GROUPS.map((group) => {
        const items = group.items.filter((item) => visibleItem(access.data, item));
        if (!items.length) return null;
        if (group.flat) return items.map((item) => link(item, group.icon));
        // A group is open when it holds the current page, whatever was saved.
        const holdsActive = items.some((item) => isActive(item.to));
        const isOpen = holdsActive || !collapsed.has(group.id);
        const Icon = group.icon;
        return (
          <div key={group.id} className="mt-2">
            <button
              type="button"
              onClick={() => toggleGroup(group.id)}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-primary"
              aria-expanded={isOpen}
            >
              <Icon className="size-3.5" />
              <span className="flex-1 text-left">{group.label}</span>
              <ChevronRight className={cn('size-3.5 transition-transform', isOpen && 'rotate-90')} />
            </button>
            {isOpen && <div className="mt-0.5 flex flex-col gap-0.5">{items.map((item) => link(item, null))}</div>}
          </div>
        );
      })}
    </nav>
  );

  // The classic admin stays reachable while the team moves over.
  const classic =
    access.data && (access.data.isAdmin || access.data.roles.includes('staff')) ? (
      <div className="mt-4 border-t border-border pt-3">
        <a
          href="/admin"
          className="flex items-center gap-3 rounded-xl px-3 py-2 text-xs text-muted-foreground hover:bg-secondary hover:text-primary"
        >
          <ExternalLink className="size-3.5 shrink-0" /> Classic admin
        </a>
      </div>
    ) : null;

  const userBlock = (
    <div className="mt-4 border-t border-border pt-4">
      <p className="truncate text-sm font-medium text-foreground">
        {access.data?.fullName ?? access.data?.email ?? 'Staff'}
      </p>
      <p className="text-xs text-muted-foreground">{access.data?.isAdmin ? 'Admin' : access.data ? 'Staff' : '…'}</p>
      <Link
        to="/hub/profile"
        onClick={() => setOpen(false)}
        className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-secondary"
      >
        <UserRound className="size-4" /> My Profile
      </Link>
      <button
        onClick={logout}
        className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-secondary"
      >
        <LogOut className="size-4" /> Log out
      </button>
    </div>
  );

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-secondary/30">
      {/* Mobile top bar */}
      <header className="no-print sticky top-0 z-40 flex items-center justify-between border-b border-border bg-card px-4 py-3 lg:hidden">
        <button
          aria-label="Open menu"
          onClick={() => setOpen(true)}
          className="inline-flex size-10 items-center justify-center rounded-xl border border-border"
        >
          <Menu className="size-5" />
        </button>
        <FemniaLogo className="size-9" />
        <button
          aria-label="Log out"
          onClick={logout}
          className="inline-flex size-10 items-center justify-center rounded-xl border border-border"
        >
          <LogOut className="size-4" />
        </button>
      </header>

      {open && (
        <div className="no-print fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-foreground/40" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-[82%] max-w-xs overflow-y-auto bg-card p-4">
            <div className="mb-4 flex items-center justify-between">
              <FemniaLockup />
              <button aria-label="Close menu" onClick={() => setOpen(false)}>
                <X className="size-5" />
              </button>
            </div>
            {nav}
            {classic}
            {userBlock}
          </aside>
        </div>
      )}

      <div className="flex">
        {/* Desktop sidebar */}
        <aside className="no-print sticky top-0 hidden h-screen w-64 shrink-0 flex-col justify-between overflow-y-auto border-r border-border bg-card p-4 lg:flex">
          <div>
            <div className="px-2 pb-6 pt-2">
              <FemniaLockup subtitle="Inventory & Delivery Hub" logoClassName="size-11" />
            </div>
            {nav}
            {classic}
          </div>
          {userBlock}
        </aside>

        <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
