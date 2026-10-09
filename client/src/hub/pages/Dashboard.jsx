import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/hub/ui/dialog';
import { BUSINESS, FemniaLogo } from '@/hub/components/Brand';
import {
  EmptyState,
  ErrorState,
  Kpi,
  LoadingCards,
  LoadingRows,
  PageHeader,
  StatusBadge,
  StockBadge,
} from '@/hub/components/shared';
import { dashboardQuery } from '@/hub/lib/api';
import { QAR } from '@/hub/lib/format';
import { useHubTitle } from '@/hub/lib/useHubTitle';

// Money KPIs come back null when the signed-in user may not see them; those
// tiles are left out rather than shown as zero.
const shown = (v) => v !== null && v !== undefined;

const PRIMARY = 'var(--primary)';

/**
 * Figures merged in from the classic admin dashboard and the ERP overview:
 * month growth, customers, purchase orders, cash in accounts, wastage, the
 * revenue chart, order-status bars, payment methods and top sellers.
 */
function BusinessOverview({ o, topSelling, showSales }) {
  const [period, setPeriod] = useState('days');
  const chart = o.revenueChart[period];
  const growth = o.growthPercent;
  const maxStatus = Math.max(1, ...o.orderStatus.map((s) => s.count));
  return (
    <>
      <section className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {shown(o.monthRevenue) && (
          <Kpi
            label="This Month"
            value={QAR(o.monthRevenue)}
            tone={growth !== null && growth < 0 ? 'warn' : 'good'}
          />
        )}
        {shown(o.lastMonthRevenue) && (
          <Kpi
            label={growth === null ? 'Last Month' : `Last Month · ${growth >= 0 ? '↑' : '↓'} ${Math.abs(growth)}%`}
            value={QAR(o.lastMonthRevenue)}
          />
        )}
        {shown(o.avgBillToday) && <Kpi label="Avg Bill Today" value={QAR(o.avgBillToday)} />}
        {shown(o.grossProfitToday) && (
          <Kpi label={`Gross Profit Today · ${o.marginTodayPercent}%`} value={QAR(o.grossProfitToday)} tone="good" />
        )}
        <Kpi label="Customers" value={`${o.customers.total} · +${o.customers.newThisMonth} this month`} to="/hub/customers" />
        <Kpi label="Open Purchase Orders" value={o.openPurchaseOrders} to="/hub/m/purchase-orders" />
        {shown(o.cashInAccounts) && (
          <Kpi label="Cash in Accounts" value={QAR(o.cashInAccounts)} tone={o.cashInAccounts < 0 ? 'danger' : 'default'} to="/hub/m/cash-accounts" />
        )}
        {shown(o.wastageThisMonth) && <Kpi label="Wastage This Month" value={QAR(o.wastageThisMonth)} tone="warn" to="/hub/m/wastage" />}
        <Kpi label="To Reorder" value={o.reorderCount} tone={o.reorderCount > 0 ? 'warn' : 'default'} to="/hub/m/reorder" />
      </section>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <section className="card-surface p-4 xl:col-span-2">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="section-title text-base font-semibold text-foreground">
              {showSales ? 'Revenue' : 'Orders'}
            </h2>
            <div className="flex gap-1">
              {[
                ['days', 'Last 30 days'],
                ['months', '12 months'],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPeriod(key)}
                  className={
                    period === key
                      ? 'rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground'
                      : 'rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:text-primary'
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => (period === 'days' ? v.slice(8) : v.slice(5))}
                  interval={period === 'days' ? 2 : 0}
                />
                <YAxis tick={{ fontSize: 11 }} width={48} />
                <Tooltip
                  formatter={(value, name) => (name === 'revenue' ? [QAR(value), 'Revenue'] : [value, 'Orders'])}
                  labelFormatter={(l) => l}
                />
                <Bar dataKey={showSales ? 'revenue' : 'orders'} fill={PRIMARY} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="card-surface p-4">
          <h2 className="mb-3 section-title text-base font-semibold text-foreground">Order Status</h2>
          {o.orderStatus.length === 0 ? (
            <EmptyState title="No orders yet" />
          ) : (
            <ul className="space-y-2">
              {o.orderStatus.map((s) => (
                <li key={s.status} className="text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-foreground">{s.status}</span>
                    <span className="font-semibold text-primary">{s.count}</span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-secondary">
                    <div className="h-2 rounded-full bg-primary" style={{ width: `${(s.count / maxStatus) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card-surface p-4">
          <h2 className="mb-3 section-title text-base font-semibold text-foreground">Payment Methods</h2>
          {o.paymentMethods.length === 0 ? (
            <EmptyState title="No payments yet" />
          ) : (
            <ul className="divide-y divide-border text-sm">
              {o.paymentMethods.map((p) => (
                <li key={p.method} className="flex items-center justify-between py-2">
                  <span className="text-foreground">{p.method}</span>
                  <span className="text-muted-foreground">
                    {p.orders} order{p.orders === 1 ? '' : 's'}
                    {shown(p.revenue) && <span className="ml-2 font-medium text-foreground">{QAR(p.revenue)}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card-surface p-4 xl:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="section-title text-base font-semibold text-foreground">Top Selling Products</h2>
            <Link to="/hub/m/fast-moving" className="text-sm text-primary hover:underline">
              Fast moving
            </Link>
          </div>
          {topSelling.length === 0 ? (
            <EmptyState title="No sales yet" />
          ) : (
            <ul className="divide-y divide-border text-sm">
              {topSelling.map((t) => (
                <li key={t.sku} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.sku}</p>
                  </div>
                  <span className="text-right text-muted-foreground">
                    {t.quantity} sold
                    {showSales && <span className="ml-2 font-medium text-foreground">{QAR(t.revenue)}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

export default function DashboardPage() {
  useHubTitle('Dashboard — FEMNIA Hub');
  const q = useQuery(dashboardQuery);
  const [cashOpen, setCashOpen] = useState(false);

  if (q.isPending) {
    return (
      <>
        <PageHeader title="Dashboard" subtitle="Loading live business data…" />
        <LoadingCards count={12} />
      </>
    );
  }

  if (q.isError) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <ErrorState section="Dashboard" message={q.error.message} onRetry={() => void q.refetch()} />
      </>
    );
  }

  const d = q.data;
  const k = d.kpis;
  const syncedAt = new Date(d.syncedAt).toLocaleString('en-GB', { hour12: false });

  return (
    <>
      <div className="no-print mb-4 flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
        <FemniaLogo className="size-12 rounded-xl" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-primary">{BUSINESS.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {BUSINESS.location} · {BUSINESS.phone} · {BUSINESS.currency}
          </p>
        </div>
      </div>
      <PageHeader
        title="Dashboard"
        subtitle={`Last refreshed ${syncedAt}`}
        onRefresh={() => void q.refetch()}
        refreshing={q.isFetching}
      />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {shown(k.todaySales) && <Kpi label="Today's Sales" value={QAR(k.todaySales)} tone="good" />}
        <Kpi label="Today's Orders" value={k.todayOrders} to="/hub/orders" />
        {shown(k.totalSales) && <Kpi label="Total Sales" value={QAR(k.totalSales)} tone="good" />}
        {shown(k.totalProfit) && <Kpi label="Total Profit" value={QAR(k.totalProfit)} tone="good" />}
        {shown(k.totalLiabilities) && (
          <Kpi label="Total Liabilities" value={QAR(k.totalLiabilities)} tone={k.totalLiabilities > 0 ? 'warn' : 'default'} />
        )}
        {d.cash && (
          <button type="button" onClick={() => setCashOpen(true)} className="text-left" aria-label="Total Available Cash breakdown">
            <Kpi label="Total Available Cash" value={QAR(d.cash.total)} tone={d.cash.total < 0 ? 'danger' : 'good'} />
          </button>
        )}
        <Kpi label="Total SKUs" value={k.totalSkus} to="/hub/products" />
        <Kpi label="Current Stock Units" value={k.totalStock} to="/hub/inventory" />
        {shown(k.inventoryCostValue) && <Kpi label="Inventory Cost Value" value={QAR(k.inventoryCostValue)} />}
        {shown(k.retailStockValue) && <Kpi label="Retail Stock Value" value={QAR(k.retailStockValue)} />}
        <Kpi label="Pending Orders" value={k.pendingOrders} tone="warn" to="/hub/orders" />
        <Kpi label="Out for Delivery" value={k.outForDeliveryOrders} to="/hub/delivery" />
        <Kpi label="Delivered Orders" value={k.deliveredOrders} tone="good" to="/hub/delivery" />
        <Kpi label="Returned Orders" value={k.returnedOrders} tone="danger" to="/hub/orders" />
        <Kpi label="Low Stock SKUs" value={k.lowStockCount} tone="warn" to="/hub/inventory" />
        <Kpi label="Out of Stock SKUs" value={k.outOfStockCount} tone="danger" to="/hub/inventory" />
      </section>

      {d.overview && <BusinessOverview o={d.overview} topSelling={d.topSelling} showSales={shown(k.totalSales)} />}

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <section className="card-surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="section-title text-base font-semibold text-foreground">Recent Orders</h2>
            <Link to="/hub/orders" className="text-sm text-primary hover:underline">
              View all
            </Link>
          </div>
          {d.recentOrders.length === 0 ? (
            <EmptyState title="No orders yet" hint="Confirmed orders will appear here." />
          ) : (
            <ul className="divide-y divide-border">
              {d.recentOrders.map((o) => (
                <li key={o.id}>
                  <Link
                    to={`/hub/orders?order=${encodeURIComponent(o.id)}`}
                    className="flex items-center justify-between gap-3 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {o.id} · {o.customerName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(o.orderDate).toLocaleDateString('en-GB')} · {o.paymentMode}
                      </p>
                    </div>
                    <div className="text-right">
                      {shown(k.totalSales) && <p className="text-sm font-semibold text-foreground">{QAR(o.grandTotal)}</p>}
                      <StatusBadge value={o.status} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card-surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="section-title text-base font-semibold text-foreground">Low Stock Products</h2>
            <Link to="/hub/inventory" className="text-sm text-primary hover:underline">
              Inventory
            </Link>
          </div>
          {d.lowStock.length === 0 ? (
            <EmptyState title="All products are in stock" />
          ) : (
            <ul className="divide-y divide-border">
              {d.lowStock.map((p) => (
                <li key={p.key ?? p.sku} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.sku} · stock {p.currentStock} / reorder {p.reorderLevel}
                    </p>
                  </div>
                  <StockBadge status={p.stockStatus} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card-surface p-4">
          <h2 className="mb-3 section-title text-base font-semibold text-foreground">Recent Stock Movements</h2>
          {d.recentMovements.length === 0 ? (
            <EmptyState title="No stock movements yet" hint="Stock In and Stock Out entries appear here." />
          ) : (
            <ul className="divide-y divide-border">
              {d.recentMovements.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {m.type} · {m.sku}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {m.date} · {m.reference}
                      {m.note ? ` · ${m.note}` : ''}
                    </p>
                  </div>
                  <span
                    className={
                      m.quantity < 0 ? 'text-sm font-semibold text-destructive' : 'text-sm font-semibold text-emerald-700'
                    }
                  >
                    {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card-surface p-4">
          <h2 className="mb-3 section-title text-base font-semibold text-foreground">Delivery Status Summary</h2>
          <ul className="grid grid-cols-2 gap-2">
            {d.deliverySummary.map((s) => (
              <li key={s.status} className="flex items-center justify-between rounded-xl bg-secondary/60 px-3 py-2 text-sm">
                <span className="truncate text-foreground">{s.status}</span>
                <span className="font-semibold text-primary">{s.count}</span>
              </li>
            ))}
          </ul>

          <h2 className="mb-3 mt-6 section-title text-base font-semibold text-foreground">Sales Summary</h2>
          {d.salesSummary.length === 0 ? (
            <EmptyState title="No sales recorded yet" />
          ) : (
            <div className="max-h-64 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="py-2">Date</th>
                    <th className="py-2">Orders</th>
                    {shown(k.totalSales) && <th className="py-2 text-right">Sales</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {[...d.salesSummary].reverse().map((s) => (
                    <tr key={s.date}>
                      <td className="py-2 text-foreground">{s.date}</td>
                      <td className="py-2 text-muted-foreground">{s.orders}</td>
                      {shown(k.totalSales) && <td className="py-2 text-right font-medium text-foreground">{QAR(s.sales)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {q.isFetching && (
        <div className="mt-4">
          <LoadingRows count={1} />
        </div>
      )}

      {d.cash && (
        <Dialog open={cashOpen} onOpenChange={setCashOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Total Available Cash</DialogTitle>
              <DialogDescription>
                Money actually received for products, minus refunds and liability payments already made from company
                funds. Unpaid balances, delivery charges and pending liabilities are not included.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-xl bg-secondary/60 p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Available now</p>
                <p className="text-2xl font-semibold text-primary">{QAR(d.cash.total)}</p>
              </div>
              <ul className="divide-y divide-border text-sm">
                <li className="flex items-center justify-between py-2">
                  <span className="text-muted-foreground">Product payments received</span>
                  <span className="font-medium text-foreground">{QAR(d.cash.productPaymentsReceived)}</span>
                </li>
                <li className="flex items-center justify-between py-2">
                  <span className="text-muted-foreground">Refunds &amp; returned items</span>
                  <span className="font-medium text-destructive">− {QAR(d.cash.refunds)}</span>
                </li>
                <li className="flex items-center justify-between py-2">
                  <span className="text-muted-foreground">Liability payments made</span>
                  <span className="font-medium text-destructive">− {QAR(d.cash.liabilityPaymentsPaid)}</span>
                </li>
              </ul>
              <div>
                <h3 className="mb-2 section-title text-sm font-semibold text-foreground">Held by / received in</h3>
                {d.cash.byHeldIn.length === 0 ? (
                  <EmptyState title="No payments recorded yet" />
                ) : (
                  <ul className="space-y-2">
                    {d.cash.byHeldIn.map((row) => (
                      <li
                        key={row.label}
                        className="flex items-center justify-between rounded-xl bg-secondary/60 px-3 py-2 text-sm"
                      >
                        <span className="truncate text-foreground">{row.label}</span>
                        <span className="font-semibold text-primary">{QAR(row.value)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  Liability payments of {QAR(d.cash.liabilityPaymentsPaid)} are deducted from the overall total.
                </p>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
