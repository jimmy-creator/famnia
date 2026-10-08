import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  BarChart3,
  Boxes,
  ClipboardList,
  ExternalLink,
  FileBarChart,
  Home,
  LogOut,
  Menu,
  Package,
  PackageMinus,
  PackagePlus,
  Printer,
  Settings as SettingsIcon,
  ShoppingCart,
  Truck,
  ShieldCheck,
  UserRound,
  Users,
  Wallet,
  X,
} from 'lucide-react';

import { FemniaLockup, FemniaLogo } from '@/hub/components/Brand';
import { accessQuery } from '@/hub/lib/api';
import { can } from '@/hub/lib/permissions';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';

const NAV = [
  { to: '/hub/dashboard', label: 'Dashboard', icon: Home, permission: 'dashboard.view' },
  { to: '/hub/pos', label: 'New Sales Order', icon: ShoppingCart, permission: 'orders.create' },
  { to: '/hub/orders', label: 'Sales Orders', icon: ClipboardList, permission: 'orders.view_all' },
  { to: '/hub/products', label: 'Products', icon: Package, permission: 'products.view' },
  { to: '/hub/inventory', label: 'Inventory', icon: Boxes, permission: 'inventory.view' },
  { to: '/hub/stock-in', label: 'Stock In', icon: PackagePlus, permission: 'inventory.stock_in' },
  { to: '/hub/stock-out', label: 'Stock Out', icon: PackageMinus, permission: 'inventory.stock_out' },
  { to: '/hub/customers', label: 'Customers', icon: Users, permission: 'customers.view' },
  { to: '/hub/delivery', label: 'Delivery', icon: Truck, permission: 'delivery.view' },
  { to: '/hub/my-deliveries', label: 'My Deliveries', icon: Truck, permission: 'delivery.my_deliveries' },
  { to: '/hub/delivery-reports', label: 'Delivery Reports', icon: FileBarChart, permission: 'delivery.view' },
  { to: '/hub/invoices', label: 'Invoices & Labels', icon: Printer, permission: 'invoices.view' },
  { to: '/hub/expenses', label: 'Expenses & Assets', icon: Wallet, permission: 'expenses.view' },
  { to: '/hub/reports', label: 'Reports', icon: BarChart3, permission: 'reports.operational' },
  { to: '/hub/staff', label: 'Staff & Permissions', icon: ShieldCheck, permission: 'admin.manage_staff' },
  { to: '/hub/settings', label: 'Settings', icon: SettingsIcon, permission: 'admin.settings' },
];

export function AppShell({ children }) {
  const [open, setOpen] = useState(false);
  const { logout: signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pathname } = useLocation();
  const access = useQuery(accessQuery);

  const logout = async () => {
    try {
      await signOut();
    } finally {
      queryClient.clear();
      navigate('/hub/login', { replace: true });
    }
  };

  const nav = (
    <nav className="flex flex-col gap-1">
      {NAV.filter(({ to, permission }) =>
        to === '/hub/my-deliveries'
          ? Boolean(access.data?.roles.includes('delivery'))
          : !access.data || can(access.data, permission),
      ).map(({ to, label, icon }) => {
        const Icon = icon;
        const active = pathname === to || pathname.startsWith(`${to}/`);
        return (
          <Link
            key={to}
            to={to}
            onClick={() => setOpen(false)}
            className={cn(
              'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
              active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-foreground/80 hover:bg-secondary hover:text-primary',
            )}
          >
            <Icon className="size-4 shrink-0" />
            <span className="truncate">{label}</span>
          </Link>
        );
      })}
    </nav>
  );

  // Until every screen has moved into the hub, admins and staff can still
  // reach the classic back office for what isn't here yet.
  const classic =
    access.data && (access.data.isAdmin || access.data.roles.includes('staff')) ? (
      <div className="mt-4 border-t border-border pt-4">
        <p className="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Classic back office</p>
        <a
          href="/admin/erp"
          className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-foreground/80 hover:bg-secondary hover:text-primary"
        >
          <ExternalLink className="size-4 shrink-0" /> ERP &amp; Finance
        </a>
        <a
          href="/admin"
          className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-foreground/80 hover:bg-secondary hover:text-primary"
        >
          <ExternalLink className="size-4 shrink-0" /> Store Admin
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
