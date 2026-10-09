/**
 * ERP back office — everything that isn't day-to-day storefront admin.
 *
 * Split out of Admin.jsx once the ERP tabs outnumbered the store ones and
 * a single sidebar stopped being scannable.  The two pages are siblings,
 * not parent/child: Admin.jsx keeps catalog/orders/customers, this page
 * keeps inventory, purchasing, finance, POS and audit.
 *
 * The active tab lives in `?tab=` so an ERP screen can be bookmarked and
 * survives a refresh — the old in-memory tab state always bounced you
 * back to the dashboard.
 *
 * State that only one tab group touches lives in that group's component
 * (ErpInventory / ErpPurchasing / ErpPosOps).  What stays here is the
 * shared lookups (locations, products) plus the finance state that
 * FinanceTabs expects as props.
 */
import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import { CURRENCY, CURRENCY_DECIMALS } from '../utils/currency';
import { cn, localDate } from '@/lib/utils';
import {
  Menu, LogOut, ShoppingBag, LayoutGrid, Boxes, Truck,
  Wallet, Store, ScrollText, ChevronRight, X, Tag, DatabaseBackup,
} from 'lucide-react';
import ErpInventory from '../components/admin/ErpInventory';
import ErpPurchasing from '../components/admin/ErpPurchasing';
import ErpPosOps from '../components/admin/ErpPosOps';
import BarcodeLabels from '../components/admin/BarcodeLabels';
import StockCounts from '../components/admin/StockCounts';
import ErpReports from '../components/admin/ErpReports';
import WastageTabs from '../components/admin/WastageTabs';
import FinanceTabs from '../components/admin/FinanceTabs';
import AssetsTabs from '../components/admin/AssetsTabs';
import MonthlySalesChart from '../components/admin/MonthlySalesChart';
import ProductsManager from '../components/admin/ProductsManager';
import CategoriesManager from '../components/admin/CategoriesManager';
import BackupRestore from '../components/admin/BackupRestore';

const MULTILOC_ENABLED = import.meta.env.VITE_FEATURE_MULTILOC === 'true';

// Tabs that need the (large) product list loaded before they can render.
const PRODUCT_TABS = ['inventory', 'wastage',
  'purchase-orders', 'purchase-returns'];
// Tabs that post to the P&L and so need the account/category pickers.
const LEDGER_TABS = ['stock-counts', 'stock-count-detail', 'variance-report',
  'wastage', 'expenses', 'cash-accounts', 'cash-transfers', 'daybook',
  'fixed-assets', 'capital', 'balance-sheet'];
// Sub-screens reached from a tab rather than the sidebar — they highlight
// their parent so the nav doesn't look like it lost its place.
const SUB_TABS = { 'stock-count-detail': 'stock-counts', 'variance-report': 'stock-counts' };

/**
 * `embedded`: rendered inside the FEMNIA Hub shell — no rail or top bar of
 * its own, and the hub's palette through `.hub-legacy` (hub.css).
 * `screen`: one ERP screen as its own hub page (/hub/m/:screen); the hub
 * sidebar is the navigation, so the section pills and title are hidden.
 * Sub-screens (a stock count's detail…) still move through `?tab=`.
 * `legacy`: the classic area keys the hub granted (accessFor().legacy), so
 * hub-created staff see what the server would let them use.
 */
export default function Erp({ embedded = false, screen = null, legacy = null }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const tab = searchParams.get('tab') || screen || 'overview';
  const setTab = (next) => setSearchParams(
    next === 'overview' || next === screen ? {} : { tab: next },
    { replace: !screen },
  );

  const isAdmin = user?.role === 'admin';
  const hasAccess = (perm) => isAdmin || (user?.permissions || []).includes(perm) || Boolean(legacy?.includes(perm));

  // ── Shared lookups ──────────────────────────────────────────────
  const [locations, setLocations] = useState([]);
  const [products, setProducts] = useState([]);
  const [cashAccounts, setCashAccounts] = useState([]);
  const [expenseCategories, setExpenseCategories] = useState([]);

  // ── Finance state — FinanceTabs takes it as props ───────────────
  const [cashAccountForm, setCashAccountForm] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [expenseFilter, setExpenseFilter] = useState({ from: '', to: '', categoryId: '', locationId: '' });
  const [expenseForm, setExpenseForm] = useState(null);
  const [expenseCatForm, setExpenseCatForm] = useState(null);
  const [cashTransfers, setCashTransfers] = useState([]);
  const [cashTransferForm, setCashTransferForm] = useState(null);
  const [dailyCash, setDailyCash] = useState(null);
  const [dailyCashFilter, setDailyCashFilter] = useState({ date: localDate(), locationId: '' });
  const [daybook, setDaybook] = useState(null);
  const [daybookFilter, setDaybookFilter] = useState({ date: localDate(), accountId: '', source: '' });
  const [pnl, setPnl] = useState(null);
  const [pnlFilter, setPnlFilter] = useState(() => {
    const today = localDate();
    const [y, m] = today.split('-').map(Number);
    return {
      from: `${today.slice(0, 8)}01`,
      to: `${today.slice(0, 8)}${new Date(Date.UTC(y, m, 0)).getUTCDate()}`,
      locationId: '',
    };
  });
  const [stockValue, setStockValue] = useState(null);
  const [stockValueFilter, setStockValueFilter] = useState({ locationId: '' });
  const [activeStockCountId, setActiveStockCountId] = useState(null);

  const [overview, setOverview] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('erp_collapsed_sections') || '[]')); }
    catch { return new Set(); }
  });
  const toggleSection = (id) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      localStorage.setItem('erp_collapsed_sections', JSON.stringify([...next]));
      return next;
    });
  };

  const handleLogout = async () => {
    try { await logout(); } catch { /* clear client state regardless */ }
    navigate('/login');
  };

  // ─── Sidebar nav ────────────────────────────────────────────────
  // `show` is computed per render so role/feature gating stays live.
  // `from`/`to` drive the overview card's gradient tile (see .erp-module in
  // index.css).  They stay in a warm family around the brand orange —
  // Inventory reads straight from the theme token so it tracks a theme change;
  // green and rose are kept for the two sections where the hue is doing
  // semantic work (money, counter sales).
  const NAV_SECTIONS = [
    { id: 'catalog', label: 'Catalog', icon: Tag, blurb: 'Products and categories — same screens as the store admin', from: '#f97316', to: '#fdba74', items: [
        { tab: 'products',   label: 'Products',   show: hasAccess('products') },
        { tab: 'categories', label: 'Categories', show: hasAccess('categories') },
    ]},
    { id: 'inventory', label: 'Inventory', icon: Boxes, blurb: 'Stock on hand, movements and shrinkage', from: 'var(--copper)', to: 'var(--copper-light)', items: [
        { tab: 'inventory',      label: 'Stock on Hand',  show: MULTILOC_ENABLED && hasAccess('products') },
        { tab: 'locations',      label: 'Locations',      show: MULTILOC_ENABLED && hasAccess('products') },
        { tab: 'transfers',      label: 'Stock Transfers', show: MULTILOC_ENABLED && hasAccess('products') },
        { tab: 'stock-counts',   label: 'Stock Counts',   show: MULTILOC_ENABLED && hasAccess('products') },
        { tab: 'barcode-labels', label: 'Barcode Labels', show: MULTILOC_ENABLED && hasAccess('products') },
        { tab: 'wastage',        label: 'Wastage',        show: MULTILOC_ENABLED && hasAccess('products') },
        { tab: 'reorder',        label: 'Reorder',        show: hasAccess('products') },
    ]},
    { id: 'purchasing', label: 'Purchasing', icon: Truck, blurb: 'Suppliers, orders and returns', from: '#c2410c', to: '#ea580c', items: [
        { tab: 'suppliers',           label: 'Suppliers',        show: MULTILOC_ENABLED && hasAccess('products') },
        { tab: 'purchase-orders',     label: 'Purchase Orders',  show: MULTILOC_ENABLED && hasAccess('products') },
        { tab: 'purchase-returns',    label: 'Purchase Returns', show: MULTILOC_ENABLED && hasAccess('products') },
        { tab: 'supplier-purchases',  label: 'Purchase Report',  show: MULTILOC_ENABLED && hasAccess('analytics') },
    ]},
    { id: 'finance', label: 'Finance', icon: Wallet, blurb: 'Cash, expenses, assets, the P&L and balance sheet', from: '#16a34a', to: '#22c55e', items: [
        { tab: 'cash-accounts',  label: 'Cash Accounts',  show: MULTILOC_ENABLED && hasAccess('analytics') },
        { tab: 'expenses',       label: 'Expenses',       show: MULTILOC_ENABLED && hasAccess('analytics') },
        { tab: 'cash-transfers', label: 'Cash Transfers', show: MULTILOC_ENABLED && hasAccess('analytics') },
        { tab: 'daily-cash',     label: 'Daily Cash',     show: MULTILOC_ENABLED && hasAccess('analytics') },
        { tab: 'daybook',        label: 'Daybook',        show: MULTILOC_ENABLED && hasAccess('analytics') },
        { tab: 'fixed-assets',   label: 'Fixed Assets',   show: MULTILOC_ENABLED && hasAccess('analytics') },
        { tab: 'capital',        label: 'Capital',        show: MULTILOC_ENABLED && hasAccess('analytics') },
        { tab: 'pnl',            label: 'Profit & Loss',  show: MULTILOC_ENABLED && hasAccess('analytics') },
        { tab: 'balance-sheet',  label: 'Balance Sheet',  show: MULTILOC_ENABLED && hasAccess('analytics') },
        { tab: 'stock-value',    label: 'Stock Value',    show: MULTILOC_ENABLED && hasAccess('analytics') },
    ]},
    { id: 'sales', label: 'Sales & POS', icon: Store, blurb: 'Counter takings, returns and what sells', from: '#e11d48', to: '#f43f5e', items: [
        { tab: 'pos-reports',  label: 'POS Reports',  show: MULTILOC_ENABLED && hasAccess('analytics') },
        { tab: 'returns',      label: 'Returns',      show: MULTILOC_ENABLED && hasAccess('orders') },
        { tab: 'cashiers',     label: 'Cashiers',     show: MULTILOC_ENABLED && isAdmin },
        { tab: 'sales-report', label: 'Sales Report', show: hasAccess('analytics') },
        { tab: 'fast-moving',  label: 'Fast Moving',  show: hasAccess('analytics') },
        { tab: 'dead-stock',   label: 'Dead Stock',   show: hasAccess('analytics') },
    ]},
    { id: 'audit', label: 'Audit', icon: ScrollText, blurb: 'Who changed what', from: '#78716c', to: '#a8a29e', items: [
        { tab: 'activity-log', label: 'Activity Log', show: MULTILOC_ENABLED && hasAccess('analytics') },
    ]},
    { id: 'data', label: 'Data', icon: DatabaseBackup, blurb: 'Database backup and restore', from: '#0284c7', to: '#38bdf8', items: [
        { tab: 'backup', label: 'Backup & Restore', show: isAdmin },
    ]},
  ];

  const navTab = SUB_TABS[tab] || tab;
  const activeItem = NAV_SECTIONS.flatMap((s) => s.items).find((i) => i.tab === navTab);
  const activeSection = NAV_SECTIONS.find((s) => s.items.some((i) => i.tab === navTab));

  // Auto-expand the section holding the active tab, so a jump from the
  // overview cards never lands on a collapsed section.
  useEffect(() => {
    if (activeSection && collapsedSections.has(activeSection.id)) {
      setCollapsedSections((prev) => {
        const next = new Set(prev);
        next.delete(activeSection.id);
        localStorage.setItem('erp_collapsed_sections', JSON.stringify([...next]));
        return next;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // ─── Shared lookups: fetched here so the tab components don't each
  // re-request the same lists on every switch. ────────────────────
  useEffect(() => {
    api.get('/locations').then((res) => setLocations(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    // Products can be added or edited on the Catalog screen, so drop the
    // cached list there and let the next product tab fetch it fresh.
    if (tab === 'products') setProducts([]);
    if (PRODUCT_TABS.includes(tab) && products.length === 0) {
      api.get('/products/admin/all?limit=10000').then((res) => setProducts(res.data.products)).catch(() => {});
    }
    if (LEDGER_TABS.includes(tab)) {
      const accounts = tab === 'cash-accounts' ? '/finance/cash-accounts' : '/finance/cash-accounts?active=true';
      api.get(accounts).then((res) => setCashAccounts(res.data)).catch(() => {});
      api.get('/finance/expense-categories').then((res) => setExpenseCategories(res.data)).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // ─── Finance data — the tab components render it but don't own it ──
  useEffect(() => {
    if (tab === 'expenses') {
      const params = {};
      if (expenseFilter.from) params.from = expenseFilter.from;
      if (expenseFilter.to) params.to = expenseFilter.to;
      if (expenseFilter.categoryId) params.expenseCategoryId = expenseFilter.categoryId;
      if (expenseFilter.locationId) params.locationId = expenseFilter.locationId;
      api.get('/finance/expenses', { params }).then((res) => setExpenses(res.data)).catch(() => {});
    } else if (tab === 'cash-transfers') {
      api.get('/finance/cash-transfers').then((res) => setCashTransfers(res.data)).catch(() => {});
    } else if (tab === 'daily-cash') {
      const params = { date: dailyCashFilter.date };
      if (dailyCashFilter.locationId) params.locationId = dailyCashFilter.locationId;
      api.get('/finance/daily-cash', { params }).then((res) => setDailyCash(res.data)).catch(() => {});
    } else if (tab === 'daybook') {
      const params = { date: daybookFilter.date };
      if (daybookFilter.accountId) params.accountId = daybookFilter.accountId;
      if (daybookFilter.source) params.source = daybookFilter.source;
      api.get('/finance/daybook', { params }).then((res) => setDaybook(res.data)).catch(() => {});
    } else if (tab === 'pnl') {
      const params = {
        from: pnlFilter.from,
        to: pnlFilter.to,
      };
      if (pnlFilter.locationId) params.locationId = pnlFilter.locationId;
      api.get('/finance/pnl', { params }).then((res) => setPnl(res.data)).catch(() => {});
    } else if (tab === 'stock-value') {
      const params = {};
      if (stockValueFilter.locationId) params.locationId = stockValueFilter.locationId;
      api.get('/finance/stock-value', { params }).then((res) => setStockValue(res.data)).catch(() => {});
    }
  }, [tab, expenseFilter, dailyCashFilter, daybookFilter, pnlFilter, stockValueFilter]);

  // ─── Overview tiles ─────────────────────────────────────────────
  // Every call is optional: a staff member without `analytics` gets 403 on
  // some of these, and the tile simply doesn't render.
  //
  // Waits for `user`, and re-runs when it arrives.  AuthContext seeds `user`
  // synchronously from localStorage, so it is normally set on mount — but when
  // it isn't (first login in a fresh browser, cleared storage, private window)
  // every hasAccess() below is false, all six branches yield null, and the
  // all-null result renders an empty tile row that never refills, because the
  // tab hasn't changed.
  useEffect(() => {
    if (tab !== 'overview' || !user) return;
    const today = localDate();
    const monthStart = `${today.slice(0, 8)}01`;
    const nil = () => null;
    Promise.all([
      hasAccess('analytics') ? api.get('/finance/stock-value').then((r) => r.data).catch(nil) : null,
      hasAccess('products') ? api.get('/erp-reports/reorder').then((r) => r.data).catch(nil) : null,
      hasAccess('products') ? api.get('/purchase-orders').then((r) => r.data).catch(nil) : null,
      hasAccess('analytics') ? api.get('/finance/cash-accounts?active=true').then((r) => r.data).catch(nil) : null,
      hasAccess('analytics')
        ? api.get('/wastage/summary', { params: { from: monthStart } }).then((r) => r.data).catch(nil)
        : null,
      hasAccess('analytics')
        ? api.get('/erp-reports/sales', { params: { from: today, to: today, groupBy: 'channel' } }).then((r) => r.data).catch(nil)
        : null,
    ]).then(([stock, reorder, pos, accounts, wastage, todaySales]) => {
      setOverview({ stock, reorder, pos, accounts, wastage, todaySales });
    });
    // Keyed on the id/role primitives rather than `user` itself: the object
    // identity changes again when /auth/profile resolves over the localStorage
    // copy, which would fire a second, identical round of six requests.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, user?.id, user?.role]);

  const money = (n) => `${CURRENCY}${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: CURRENCY_DECIMALS, maximumFractionDigits: CURRENCY_DECIMALS })}`;

  const tiles = (() => {
    if (!overview) return [];
    const { stock, reorder, pos, accounts, wastage, todaySales } = overview;
    const openPos = (pos || []).filter((p) => ['draft', 'sent', 'partial'].includes(p.status));
    const out = [];
    if (todaySales) {
      const t = todaySales.totals || {};
      out.push({ label: 'Sales today', value: money(t.gross), sub: `${t.orders ?? 0} orders · ${t.units ?? 0} items`, tab: 'sales-report' });
      out.push({ label: 'Avg bill today', value: money(t.avgOrderValue), sub: `${money(t.discount)} discounts`, tab: 'sales-report' });
      out.push({ label: 'Gross profit today', value: money(t.profit), sub: `${t.margin ?? 0}% margin`, tab: 'sales-report' });
    }
    if (stock) out.push({ label: 'Stock value', value: money(stock.totals?.value), sub: `${money(stock.totals?.retailValue)} at retail`, tab: 'stock-value' });
    if (reorder) out.push({ label: 'To reorder', value: reorder.count ?? 0, sub: `${reorder.outOfStockCount ?? 0} out of stock`, tab: 'reorder', alert: (reorder.outOfStockCount ?? 0) > 0 });
    if (pos) out.push({ label: 'Open POs', value: openPos.length, sub: `${(pos || []).length} total`, tab: 'purchase-orders' });
    if (accounts) out.push({ label: 'Cash on hand', value: money(accounts.reduce((s, a) => s + parseFloat(a.balance || 0), 0)), sub: `${accounts.length} accounts`, tab: 'cash-accounts' });
    if (wastage) out.push({ label: 'Wastage this month', value: money(wastage.totalCost), sub: 'written off', tab: 'wastage' });
    return out;
  })();

  return (
    <div className={embedded ? 'erp-ui hub-legacy' : 'erp-ui min-h-screen'}>
      {!embedded && (<>
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/45 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Fixed rail — it owns its own scroll, so a long nav never carries the
          page content away with it. */}
      <aside
        className={cn(
          'erp-rail fixed inset-y-0 left-0 z-40 flex w-64 flex-col transition-transform duration-300 lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--erp-line-soft)] px-4 py-4">
          <div className="flex items-center gap-3">
            <span className="erp-brand-mark flex size-9 items-center justify-center rounded-xl">
              <Boxes className="size-[18px] text-white" strokeWidth={2} />
            </span>
            <div className="leading-none">
              <div className="font-serif text-base font-bold tracking-[0.12em]">FEMNIA</div>
              <div className="mt-1 text-[10px] font-medium tracking-[0.2em] text-muted-foreground">
                FASHION · ERP
              </div>
            </div>
          </div>
          <button
            className="text-muted-foreground transition-colors hover:text-foreground lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="shrink-0 px-3 pt-3">
          {/* Admins land here after login, so this is their way into the
              store side — a full nav button, not a small back link. */}
          <button
            className="erp-nav-link border-[var(--erp-line)]"
            onClick={() => navigate('/admin')}
          >
            <ShoppingBag className="erp-nav-icon size-[17px]" strokeWidth={1.8} />
            E-commerce Admin
            <ChevronRight className="ml-auto size-4 text-[var(--text-light)]" />
          </button>
        </div>

        {/* min-h-0 is required: without it a flex child won't shrink below its
            content height and the list would overflow instead of scroll. */}
        <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          <button
            className={cn('erp-nav-link', tab === 'overview' && 'is-active')}
            onClick={() => { setTab('overview'); setSidebarOpen(false); }}
          >
            <LayoutGrid className="erp-nav-icon size-[17px]" strokeWidth={1.8} />
            Overview
          </button>

          {NAV_SECTIONS.map((section) => {
            const visible = section.items.filter((i) => i.show);
            if (visible.length === 0) return null;
            const collapsed = collapsedSections.has(section.id);
            const Icon = section.icon;
            return (
              <div key={section.id} className="mt-4">
                <button className="erp-rail-section" onClick={() => toggleSection(section.id)}>
                  <Icon className="size-3.5" strokeWidth={2} />
                  <span className="flex-1 text-left">{section.label}</span>
                  <ChevronRight className={cn('size-3 transition-transform', !collapsed && 'rotate-90')} />
                </button>
                {!collapsed && (
                  <ul className="mt-1 space-y-0.5">
                    {visible.map((i) => (
                      <li key={i.tab}>
                        <button
                          className={cn('erp-nav-link', navTab === i.tab && 'is-active')}
                          onClick={() => { setTab(i.tab); setSidebarOpen(false); }}
                        >
                          <span className="erp-nav-icon ml-[3px] size-1.5 rounded-full bg-current" />
                          {i.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </nav>

        <div className="shrink-0 border-t border-[var(--erp-line-soft)] p-3">
          <div className="mb-2 flex items-center gap-2.5 px-1">
            <span className="erp-avatar flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold">
              {(user?.name || user?.email || 'U')[0].toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium">{user?.name || user?.email}</div>
              <span className="mt-0.5 inline-block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {user?.role}
              </span>
            </div>
          </div>
          <button
            className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-[var(--erp-hover)] hover:text-destructive"
            onClick={handleLogout}
          >
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      </aside>
      </>)}

      <div className={embedded ? '' : 'flex min-h-screen flex-col lg:pl-64'}>
        {!embedded && (
        <header className="erp-topbar sticky top-0 z-20 px-4 py-3 lg:px-6">
          <div className="flex items-center justify-between gap-3">
            <button
              className="text-muted-foreground transition-colors hover:text-foreground lg:hidden"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="size-6" />
            </button>
            <div className="hidden min-w-0 items-center gap-1.5 text-xs text-muted-foreground lg:flex">
              {activeSection && (
                <>
                  <span>{activeSection.label}</span>
                  <ChevronRight className="size-3" />
                </>
              )}
              <span className="truncate font-medium text-foreground">
                {activeItem?.label || 'Overview'}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden text-xs text-muted-foreground sm:inline">{user?.email}</span>
              <span className="erp-pill">{user?.role}</span>
            </div>
          </div>
        </header>
        )}

        <main className={embedded ? '' : 'flex-1 px-4 pb-16 pt-5 lg:px-6 lg:pt-6'}>
          {embedded && !screen && (
            <nav className="hub-legacy-nav mb-5 flex flex-col gap-2">
              <div className="flex flex-wrap gap-1.5">
                <button
                  className={cn('hub-legacy-pill', tab === 'overview' && 'is-active')}
                  onClick={() => setTab('overview')}
                >
                  Overview
                </button>
                {NAV_SECTIONS.filter((s) => s.items.some((i) => i.show)).map((s) => (
                  <button
                    key={s.id}
                    className={cn('hub-legacy-pill', activeSection?.id === s.id && 'is-active')}
                    onClick={() => setTab(s.items.find((i) => i.show).tab)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              {activeSection && (
                <div className="flex flex-wrap gap-1.5">
                  {activeSection.items.filter((i) => i.show).map((i) => (
                    <button
                      key={i.tab}
                      className={cn('hub-legacy-subpill', navTab === i.tab && 'is-active')}
                      onClick={() => setTab(i.tab)}
                    >
                      {i.label}
                    </button>
                  ))}
                </div>
              )}
            </nav>
          )}
          {!screen && (
          <div className="mb-6">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {activeSection ? activeSection.label : 'ERP'}
            </div>
            <h1 className="font-serif text-2xl font-semibold tracking-tight lg:text-3xl">
              {activeItem?.label || 'Overview'}
            </h1>
          </div>
          )}
          {screen && activeItem && !activeItem.show && (
            <p className="text-sm text-muted-foreground">You do not have permission to open this screen.</p>
          )}

          {tab === 'overview' && (
            <div className="flex flex-col gap-8">
              {tiles.length > 0 && (
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
                  {tiles.map((t) => (
                    <button key={t.label} className="erp-tile" onClick={() => setTab(t.tab)}>
                      <div className="erp-tile-label">{t.label}</div>
                      <div className={cn('erp-tile-value', t.alert && 'is-alert')}>{t.value}</div>
                      <div className="erp-tile-sub">{t.sub}</div>
                    </button>
                  ))}
                </div>
              )}

              {user && hasAccess('analytics') && <MonthlySalesChart />}

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {NAV_SECTIONS.map((section) => {
                  const visible = section.items.filter((i) => i.show);
                  if (visible.length === 0) return null;
                  const Icon = section.icon;
                  return (
                    <div
                      key={section.id}
                      className="erp-module"
                      style={{ '--m-from': section.from, '--m-to': section.to }}
                    >
                      <div className="flex items-start gap-3">
                        <span className="erp-module-mark">
                          <Icon className="size-5" strokeWidth={1.8} />
                        </span>
                        <div className="min-w-0">
                          <h3 className="font-semibold leading-tight">{section.label}</h3>
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                            {section.blurb}
                          </p>
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-1.5">
                        {visible.map((i) => (
                          <button key={i.tab} className="erp-chip" onClick={() => setTab(i.tab)}>
                            {i.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {tab === 'products' && <ProductsManager />}
          {tab === 'categories' && <CategoriesManager />}

          {['locations', 'inventory', 'transfers'].includes(tab) && (
            <ErpInventory
              tab={tab} setTab={setTab}
              locations={locations} setLocations={setLocations}
              products={products} setProducts={setProducts}
            />
          )}

          {tab === 'barcode-labels' && <BarcodeLabels currency={CURRENCY} />}

          {['suppliers', 'purchase-orders', 'purchase-returns'].includes(tab) && (
            <ErpPurchasing
              tab={tab} locations={locations} products={products} isAdmin={isAdmin}
              // Receiving sets each product's cost, so reload the list for
              // the next PO's cost prefill.
              onProductsChanged={() => api.get('/products/admin/all?limit=10000').then((res) => setProducts(res.data.products)).catch(() => {})}
            />
          )}

          {tab === 'backup' && isAdmin && <BackupRestore />}
          {['cashiers', 'pos-reports', 'returns', 'activity-log'].includes(tab) && (
            <ErpPosOps tab={tab} locations={locations} isAdmin={isAdmin} />
          )}

          {['stock-counts', 'stock-count-detail', 'variance-report'].includes(tab) && (
            <StockCounts
              tab={tab} currency={CURRENCY} locations={locations}
              setTab={setTab}
              activeStockCountId={activeStockCountId} setActiveStockCountId={setActiveStockCountId}
              expenseCategories={expenseCategories} cashAccounts={cashAccounts}
            />
          )}

          {['sales-report', 'dead-stock', 'fast-moving', 'reorder', 'supplier-purchases'].includes(tab) && (
            <ErpReports tab={tab} currency={CURRENCY} locations={locations} />
          )}

          {['fixed-assets', 'capital', 'balance-sheet'].includes(tab) && (
            <AssetsTabs
              tab={tab} currency={CURRENCY} isAdmin={isAdmin}
              locations={locations} cashAccounts={cashAccounts}
            />
          )}

          {tab === 'wastage' && (
            <WastageTabs
              tab={tab} currency={CURRENCY} locations={locations} products={products}
              cashAccounts={cashAccounts} expenseCategories={expenseCategories}
            />
          )}

          {['cash-accounts', 'expenses', 'cash-transfers', 'daily-cash', 'daybook', 'pnl', 'stock-value'].includes(tab) && (
            <FinanceTabs
              tab={tab} currency={CURRENCY} isAdmin={isAdmin} locations={locations}
              cashAccounts={cashAccounts} setCashAccounts={setCashAccounts}
              cashAccountForm={cashAccountForm} setCashAccountForm={setCashAccountForm}
              expenses={expenses} setExpenses={setExpenses}
              expenseFilter={expenseFilter} setExpenseFilter={setExpenseFilter}
              expenseForm={expenseForm} setExpenseForm={setExpenseForm}
              expenseCategories={expenseCategories} setExpenseCategories={setExpenseCategories}
              expenseCatForm={expenseCatForm} setExpenseCatForm={setExpenseCatForm}
              cashTransfers={cashTransfers} setCashTransfers={setCashTransfers}
              cashTransferForm={cashTransferForm} setCashTransferForm={setCashTransferForm}
              dailyCash={dailyCash} setDailyCash={setDailyCash}
              dailyCashFilter={dailyCashFilter} setDailyCashFilter={setDailyCashFilter}
              daybook={daybook} daybookFilter={daybookFilter} setDaybookFilter={setDaybookFilter}
              pnl={pnl} pnlFilter={pnlFilter} setPnlFilter={setPnlFilter}
              stockValue={stockValue} stockValueFilter={stockValueFilter} setStockValueFilter={setStockValueFilter}
            />
          )}
        </main>
      </div>
    </div>
  );
}
