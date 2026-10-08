import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';

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
