import { useQuery } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { SalesOrderDetails } from '@/hub/components/SalesOrderDetails';
import { ErrorState, LoadingRows, PageHeader, StatusBadge } from '@/hub/components/shared';
import { Button } from '@/hub/ui/button';
import { Input } from '@/hub/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/hub/ui/select';
import { ordersQuery } from '@/hub/lib/api';
import { downloadFile, toCsv } from '@/hub/lib/format';
import { SALES_ORDER_STATUSES } from '@/hub/lib/sales';
import { useHubTitle } from '@/hub/lib/useHubTitle';

const money = (v) => `QAR ${Number(v || 0).toFixed(2)}`;

/** Where the order came from: web checkout (Online), the till (POS) or staff (Staff). */
function ChannelTag({ channel }) {
  if (!channel) return null;
  return (
    <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{channel}</span>
  );
}

export default function SalesOrdersPage() {
  useHubTitle('Sales Orders — FEMNIA Hub');
  const orders = useQuery(ordersQuery);
  const [params, setParams] = useSearchParams();
  const selected = params.get('order') ?? '';

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('All');
  const [fulfilment, setFulfilment] = useState('All');

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (orders.data ?? []).filter((o) => {
      if (status !== 'All' && o.status !== status) return false;
      if (fulfilment !== 'All' && o.fulfilmentMethod !== fulfilment) return false;
      if (!q) return true;
      return [o.id, o.customerName, o.customerCode, o.phone, o.area, o.trackingNumber, o.courier, o.channel]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [orders.data, search, status, fulfilment]);

  const open = (id) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (id) next.set('order', id);
        else next.delete('order');
        return next;
      },
      { replace: true },
    );

  if (orders.isPending) return <LoadingRows count={8} />;
  if (orders.isError) {
    return (
      <ErrorState
        section="sales orders"
        message={orders.error instanceof Error ? orders.error.message : 'Unknown error'}
        onRetry={() => void orders.refetch()}
      />
    );
  }

  return (
    <div>
      <PageHeader
        title="Sales Orders"
        subtitle="Every order, its fulfilment and payment state, invoices, labels, returns and cancellations."
        onRefresh={() => void orders.refetch()}
        refreshing={orders.isFetching}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              className="h-10"
              onClick={() =>
                downloadFile(
                  `femnia-sales-orders-${new Date().toISOString().slice(0, 10)}.csv`,
                  toCsv(
                    rows.map((o) => ({
                      Order: o.id,
                      Channel: o.channel,
                      Date: new Date(o.orderDate).toLocaleString('en-GB'),
                      Customer: o.customerName,
                      Phone: o.phone,
                      Fulfilment: o.fulfilmentMethod,
                      Status: o.status,
                      Payment: o.paymentMode,
                      'Payment status': o.paymentStatus,
                      'Grand total': o.grandTotal,
                      Received: o.amountReceived,
                      Balance: o.remainingBalance,
                    })),
                  ),
                )
              }
            >
              Export CSV
            </Button>
            <Button asChild size="sm" className="h-10">
              <Link to="/hub/pos">
                <Plus className="mr-2 size-4" /> New order
              </Link>
            </Button>
          </>
        }
      />

      <div className="card-surface mb-4 grid gap-3 p-4 sm:grid-cols-3">
        <div className="relative sm:col-span-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Order, customer, phone, area"
            className="h-11 pl-9"
            aria-label="Search sales orders"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-11" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All statuses</SelectItem>
            {SALES_ORDER_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={fulfilment} onValueChange={setFulfilment}>
          <SelectTrigger className="h-11" aria-label="Filter by fulfilment">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All fulfilment types</SelectItem>
            <SelectItem value="Delivery">Delivery</SelectItem>
            <SelectItem value="Customer Pickup">Customer Pickup</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {!rows.length && <p className="card-surface p-6 text-sm text-muted-foreground">No orders match these filters.</p>}

      {/* mobile cards */}
      <div className="space-y-3 lg:hidden">
        {rows.map((o) => (
          <button key={o.id} type="button" onClick={() => open(o.id)} className="card-surface w-full p-4 text-left">
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-2 font-medium">
                {o.id} <ChannelTag channel={o.channel} />
              </p>
              <StatusBadge value={o.status} />
            </div>
            <p className="mt-1 text-sm">{o.customerName}</p>
            <p className="text-xs text-muted-foreground">
              {o.phone} · {o.fulfilmentMethod} · {new Date(o.orderDate).toLocaleDateString('en-GB')}
            </p>
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="font-semibold">{money(o.grandTotal)}</span>
              <span className="text-xs text-muted-foreground">Balance {money(o.remainingBalance)}</span>
            </div>
          </button>
        ))}
      </div>

      {/* desktop table */}
      <div className="card-surface hidden overflow-x-auto lg:block">
        <table className="w-full text-sm">
          <thead className="bg-secondary/60 text-left text-xs">
            <tr>
              <th className="p-3">Order</th>
              <th className="p-3">Date</th>
              <th className="p-3">Customer</th>
              <th className="p-3">Fulfilment</th>
              <th className="p-3">Status</th>
              <th className="p-3">Payment</th>
              <th className="p-3 text-right">Total</th>
              <th className="p-3 text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id} onClick={() => open(o.id)} className="cursor-pointer border-t border-border hover:bg-secondary/40">
                <td className="p-3 font-medium">
                  <p>{o.id}</p>
                  <ChannelTag channel={o.channel} />
                </td>
                <td className="p-3">{new Date(o.orderDate).toLocaleDateString('en-GB')}</td>
                <td className="p-3">
                  <p>{o.customerName}</p>
                  <p className="text-xs text-muted-foreground">{o.phone}</p>
                </td>
                <td className="p-3">{o.fulfilmentMethod}</td>
                <td className="p-3">
                  <StatusBadge value={o.status} />
                </td>
                <td className="p-3">
                  <p>{o.paymentMode}</p>
                  <p className="text-xs text-muted-foreground">{o.paymentStatus}</p>
                </td>
                <td className="p-3 text-right">{money(o.grandTotal)}</td>
                <td className="p-3 text-right">{money(o.remainingBalance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SalesOrderDetails orderId={selected || null} onClose={() => open(null)} />
    </div>
  );
}
