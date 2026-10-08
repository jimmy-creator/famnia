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
import NewSalesOrderPage from '@/hub/pages/NewSalesOrder';
import OrdersPage from '@/hub/pages/Orders';
import CustomersPage from '@/hub/pages/Customers';
import InvoicesPage from '@/hub/pages/Invoices';
import PrintDeliveryLabelPage from '@/hub/pages/PrintDeliveryLabel';
import DeliveryPage from '@/hub/pages/Delivery';
import MyDeliveriesPage from '@/hub/pages/MyDeliveries';
import DeliveryReportsPage from '@/hub/pages/DeliveryReports';
import StaffPage from '@/hub/pages/Staff';
import SettingsPage from '@/hub/pages/Settings';
import ExpensesPage from '@/hub/pages/Expenses';
import DashboardPage from '@/hub/pages/Dashboard';
import ReportsPage from '@/hub/pages/Reports';
import BackOfficePage from '@/hub/pages/BackOffice';
import StoreExtrasPage from '@/hub/pages/StoreExtras';

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
        {/* Print pages: outside the AppShell; the page checks the session itself. */}
        <Route path="print/delivery-label/:orderId" element={<PrintDeliveryLabelPage />} />
        <Route element={<Protected />}>
          <Route index element={<Navigate to="/hub/dashboard" replace />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="products" element={<ProductsPage />} />
          <Route path="inventory" element={<InventoryPage />} />
          <Route path="stock-in" element={<StockInPage />} />
          <Route path="stock-out" element={<StockOutPage />} />
          <Route path="pos" element={<NewSalesOrderPage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="invoices" element={<InvoicesPage />} />
          <Route path="delivery" element={<DeliveryPage />} />
          <Route path="my-deliveries" element={<MyDeliveriesPage />} />
          <Route path="delivery-reports" element={<DeliveryReportsPage />} />
          <Route path="staff" element={<StaffPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="expenses" element={<ExpensesPage />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="back-office" element={<BackOfficePage />} />
          <Route path="store" element={<StoreExtrasPage />} />
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
