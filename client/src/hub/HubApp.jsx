import { useEffect, useState } from 'react';
import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';

import { Toaster } from '@/hub/ui/sonner';
import { AccessGate } from '@/hub/components/AccessGate';
import { AppShell } from '@/hub/components/AppShell';
import { ComingSoon } from '@/hub/components/shared';
import { accessQuery } from '@/hub/lib/api';
import { useHubTitle } from '@/hub/lib/useHubTitle';
import LoginPage from '@/hub/pages/Login';
import ResetPasswordPage from '@/hub/pages/ResetPassword';
import ProfilePage from '@/hub/pages/Profile';
import ProductsPage from '@/hub/pages/Products';
import InventoryPage from '@/hub/pages/Inventory';
import StockInPage from '@/hub/pages/StockIn';
import StockOutPage from '@/hub/pages/StockOut';

const FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&family=Playfair+Display:wght@500;600;700&display=swap';

/**
 * Switches <html> into the hub design system while the hub is mounted
 * (see hub.css) and loads its fonts; restores the storefront on unmount.
 */
function useHubTheme() {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('hub-theme');
    let link = document.getElementById('hub-fonts');
    if (!link) {
      link = document.createElement('link');
      link.id = 'hub-fonts';
      link.rel = 'stylesheet';
      link.href = FONTS_HREF;
      document.head.appendChild(link);
    }
    return () => root.classList.remove('hub-theme');
  }, []);
}

function Protected() {
  useHubTitle('FEMNIA Hub — Inventory & Delivery Manager');
  const access = useQuery(accessQuery);
  if (access.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-secondary/30">
        <div className="text-center">
          <p className="text-2xl font-semibold tracking-[0.3em] text-primary">FEMNIA</p>
          <p className="mt-2 text-sm text-muted-foreground">Loading your hub…</p>
        </div>
      </div>
    );
  }
  if (access.isError) return <Navigate to="/hub/login" replace />;
  return (
    <AccessGate>
      <AppShell>
        <Outlet />
      </AppShell>
    </AccessGate>
  );
}

// Screens still to be built, phase by phase. Each points staff at the classic
// back office until its replacement lands.
const PENDING = [
  ['dashboard', 'Dashboard', 'Live KPIs, recent orders, low stock and cash position arrive with the reports stage.'],
  ['pos', 'New Sales Order', 'Order entry with delivery or pickup, payments and consignment arrives with the sales stage.'],
  ['orders', 'Sales Orders', 'Order list, details, returns, cancellations and price corrections arrive with the sales stage.'],
  ['customers', 'Customers', 'Customer records and purchase history arrive with the sales stage.'],
  ['delivery', 'Delivery', 'The delivery and pickup board with staff assignment arrives with the delivery stage.'],
  ['my-deliveries', 'My Deliveries', 'The delivery staff board arrives with the delivery stage.'],
  ['delivery-reports', 'Delivery Reports', 'Daily to yearly delivery reports arrive with the delivery stage.'],
  ['invoices', 'Invoices & Labels', 'A4 invoices and 100×130 / 100×150 delivery labels arrive with the sales stage.'],
  ['expenses', 'Expenses & Assets', 'Expenses, assets and personally paid liabilities arrive with the back-office stage.'],
  ['reports', 'Reports', 'Sales, product, inventory, profit, expense and payment reports arrive with the back-office stage.'],
  ['staff', 'Staff & Permissions', 'Staff accounts, approvals and the permission matrix arrive with the back-office stage.'],
  ['settings', 'Settings', 'Business, order, delivery, printing and list settings arrive with the back-office stage.'],
];

export default function HubApp() {
  useHubTheme();
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <Routes>
        <Route path="login" element={<LoginPage />} />
        <Route path="reset-password" element={<ResetPasswordPage />} />
        <Route element={<Protected />}>
          <Route index element={<Navigate to="/hub/dashboard" replace />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="products" element={<ProductsPage />} />
          <Route path="inventory" element={<InventoryPage />} />
          <Route path="stock-in" element={<StockInPage />} />
          <Route path="stock-out" element={<StockOutPage />} />
          {PENDING.map(([path, title, note]) => (
            <Route key={path} path={path} element={<ComingSoon title={title} note={note} />} />
          ))}
          <Route path="*" element={<Navigate to="/hub/dashboard" replace />} />
        </Route>
      </Routes>
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  );
}
