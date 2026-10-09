/**
 * Delivery & Pickup board.
 *
 * Read-only view over existing confirmed Sales Orders. All updates (status,
 * courier, tracking, dates, payment) and all printing happen through the
 * existing SalesOrderDetails drawer, which uses updateFulfilmentAndPayment —
 * that call never touches stock or order lines. Till sales never appear here.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { SalesOrderDetails } from '@/hub/components/SalesOrderDetails';
import { EmptyState, ErrorState, LoadingRows, PageHeader, StatusBadge } from '@/hub/components/shared';
import { Button } from '@/hub/ui/button';
import { Input } from '@/hub/ui/input';
import { Label } from '@/hub/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/hub/ui/select';
import { accessQuery, assignDeliveries, deliveryStaffQuery, ordersQuery, qk } from '@/hub/lib/api';
import { QAR } from '@/hub/lib/format';
import { can } from '@/hub/lib/permissions';
import { dayOf } from '@/hub/lib/reports';
import { useHubTitle } from '@/hub/lib/useHubTitle';

const TABS = [
  { key: 'ready', label: 'Ready for Delivery', statuses: ['Confirmed'], pickup: false },
  { key: 'out', label: 'Out for Delivery', statuses: ['Out for Delivery'] },
  { key: 'delivered', label: 'Delivered', statuses: ['Delivered'] },
  { key: 'awaiting', label: 'Awaiting Pickup', statuses: ['Confirmed', 'Awaiting Pickup'], pickup: true },
  { key: 'collected', label: 'Collected', statuses: ['Collected'] },
  { key: 'fulfilled', label: 'Fulfilled', statuses: ['Order Fulfilled'] },
];

const day = (v) =>
  v ? new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const matchesTab = (o, key) => {
  const def = TABS.find((t) => t.key === key);
  if (!def.statuses.includes(o.status)) return false;
  if (def.pickup === true && o.fulfilmentMethod !== 'Customer Pickup') return false;
  if (def.pickup === false && o.fulfilmentMethod !== 'Delivery') return false;
  return true;
};

export default function DeliveryPage() {
  useHubTitle('Delivery & Pickup — FEMNIA Hub');
  const orders = useQuery(ordersQuery);
  const access = useQuery(accessQuery).data ?? null;
  const [params, setParams] = useSearchParams();
  const selected = params.get('order') ?? '';

  const [tab, setTab] = useState('ready');
  const [search, setSearch] = useState('');
  const [fulfilment, setFulfilment] = useState('All');
  const [staffFilter, setStaffFilter] = useState('All');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [picked, setPicked] = useState([]);
  const [assignTo, setAssignTo] = useState('');

  const client = useQueryClient();
  const canAssign = can(access, 'delivery.assign');
  const staff = useQuery({ ...deliveryStaffQuery, enabled: canAssign });
  const staffName = (id) =>
    (staff.data ?? []).find((m) => m.id === id)?.fullName ?? (id ? 'Unknown staff' : 'Unassigned');

  const assign = useMutation({
    mutationFn: (staffId) => assignDeliveries(picked, staffId),
    onSuccess: async (result) => {
      toast.success(`${result.updated} deliver${result.updated === 1 ? 'y' : 'ies'} assigned.`);
      setPicked([]);
      await client.invalidateQueries({ queryKey: qk.orders });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'The assignment failed.'),
  });

  const toggle = (id) => setPicked((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));

  const canView = can(access, 'orders.view_all') || can(access, 'orders.view_own') || can(access, 'delivery.view');

  const confirmed = useMemo(
    () => (orders.data ?? []).filter((o) => o.status !== 'Draft' && !o.tillSale),
    [orders.data],
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    return confirmed.filter((o) => {
      if (!matchesTab(o, tab)) return false;
      if (fulfilment !== 'All' && o.fulfilmentMethod !== fulfilment) return false;
      if (staffFilter === 'Unassigned' && o.assignedTo) return false;
      if (staffFilter !== 'All' && staffFilter !== 'Unassigned' && o.assignedTo !== staffFilter) return false;
      // deliveryDate is a store-day string already; orderDate is a UTC timestamp → store day.
      const dated = o.deliveryDate ? String(o.deliveryDate).slice(0, 10) : dayOf(o.orderDate);
      if (from && dated < from) return false;
      if (to && dated > to) return false;
      if (!q) return true;
      if (digits && (o.phone ?? '').replace(/\D/g, '').includes(digits)) return true;
      return [o.id, o.customerName, o.area, o.courier, o.trackingNumber]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [confirmed, tab, search, fulfilment, staffFilter, from, to]);

  /* Per-staff workload: pending versus delivered, cash versus other modes. */
  const staffList = staff.data;
  const perStaff = useMemo(() => {
    const nameOf = (id) => (staffList ?? []).find((m) => m.id === id)?.fullName ?? (id ? 'Unknown staff' : 'Unassigned');
    const active = confirmed.filter((o) => o.status !== 'Cancelled' && o.fulfilmentMethod === 'Delivery');
    const map = new Map();
    for (const o of active) {
      const key = o.assignedTo ?? 'unassigned';
      const row = map.get(key) ?? {
        name: key === 'unassigned' ? 'Unassigned' : nameOf(o.assignedTo),
        pending: 0,
        delivered: 0,
        cash: 0,
        fawran: 0,
      };
      const done = o.status === 'Delivered' || o.status === 'Order Fulfilled';
      if (done) row.delivered += 1;
      else row.pending += 1;
      if (o.paymentStatus === 'Paid') {
        if ((o.paymentMode ?? '').toLowerCase().includes('cash')) row.cash += o.amountReceived;
        else row.fawran += o.amountReceived;
      }
      map.set(key, row);
    }
    return [...map.values()].sort((a, b) => b.pending - a.pending);
  }, [confirmed, staffList]);

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

  if (!canView) {
    return (
      <>
        <PageHeader title="Delivery & Pickup" subtitle="Restricted area" />
        <EmptyState title="You do not have permission to view orders" hint="Ask an Admin for order access." />
      </>
    );
  }

  if (orders.isPending) return <LoadingRows count={8} />;
  if (orders.isError) {
    return (
      <ErrorState
        section="delivery orders"
        message={orders.error instanceof Error ? orders.error.message : 'Unknown error'}
        onRetry={() => void orders.refetch()}
      />
    );
  }

  return (
    <div>
      <PageHeader
        title="Delivery & Pickup"
        subtitle="Track confirmed orders through delivery or customer pickup. Status and payment updates never change stock."
        onRefresh={() => void orders.refetch()}
        refreshing={orders.isFetching}
      />

      {/* tabs — horizontally scrollable on mobile, never overflowing the page */}
      <div className="no-scrollbar mb-4 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {TABS.map((t) => {
          const count = confirmed.filter((o) => matchesTab(o, t.key)).length;
          const active = tab === t.key;
          return (
            <Button
              key={t.key}
              variant={active ? 'default' : 'outline'}
              size="sm"
              className="h-10 shrink-0"
              onClick={() => setTab(t.key)}
            >
              {t.label}
              <span className={active ? 'ml-2 text-xs opacity-80' : 'ml-2 text-xs text-muted-foreground'}>{count}</span>
            </Button>
          );
        })}
      </div>

      <div className="card-surface mb-4 grid gap-3 p-4 sm:grid-cols-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Order number, customer name or mobile"
            className="h-11 pl-9"
            aria-label="Search delivery orders"
          />
        </div>
        <Select value={fulfilment} onValueChange={setFulfilment}>
          <SelectTrigger className="h-11" aria-label="Filter by fulfilment type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All fulfilment types</SelectItem>
            <SelectItem value="Delivery">Delivery</SelectItem>
            <SelectItem value="Customer Pickup">Customer Pickup</SelectItem>
          </SelectContent>
        </Select>
        {canAssign && (
          <Select value={staffFilter} onValueChange={setStaffFilter}>
            <SelectTrigger className="h-11" aria-label="Filter by delivery staff">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All delivery staff</SelectItem>
              <SelectItem value="Unassigned">Unassigned</SelectItem>
              {(staff.data ?? []).map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.fullName ?? m.username ?? m.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-11" />
          </div>
          <div>
            <Label className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-11" />
          </div>
        </div>
      </div>

      {canAssign && (
        <div className="card-surface mb-4 p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Delivery staff workload</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {perStaff.length ? (
              perStaff.map((row) => (
                <div key={row.name} className="rounded-xl bg-secondary/50 p-3">
                  <p className="truncate text-sm font-medium">{row.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {row.pending} pending · {row.delivered} delivered
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Cash {QAR(row.cash)} · Other {QAR(row.fawran)}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No deliveries yet.</p>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-border pt-4">
            <div className="min-w-[180px] flex-1">
              <Label className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">
                Assign {picked.length} selected to
              </Label>
              <Select value={assignTo} onValueChange={setAssignTo}>
                <SelectTrigger className="h-11" aria-label="Assign selected deliveries to">
                  <SelectValue placeholder="Choose delivery staff" />
                </SelectTrigger>
                <SelectContent>
                  {(staff.data ?? []).map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.fullName ?? m.username ?? m.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              className="h-11"
              disabled={!picked.length || !assignTo || assign.isPending}
              onClick={() => assign.mutate(assignTo)}
            >
              {assign.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Assign
            </Button>
            <Button
              variant="outline"
              className="h-11"
              disabled={!picked.length || assign.isPending}
              onClick={() => assign.mutate(null)}
            >
              Clear assignment
            </Button>
            <Button
              variant="ghost"
              className="h-11"
              onClick={() => setPicked(picked.length === rows.length ? [] : rows.map((o) => o.id))}
            >
              {picked.length === rows.length && rows.length ? 'Unselect all' : 'Select all shown'}
            </Button>
          </div>
        </div>
      )}

      {!rows.length && (
        <EmptyState
          title="No orders in this list"
          hint="Confirmed orders appear here as their delivery or pickup status changes."
        />
      )}

      {/* mobile cards */}
      <div className="space-y-3 lg:hidden">
        {rows.map((o) => (
          <div key={o.id} className="card-surface p-4">
            <button type="button" onClick={() => open(o.id)} className="w-full text-left">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">{o.id}</p>
                <StatusBadge value={o.status} />
              </div>
              <p className="mt-1 text-sm">{o.customerName}</p>
              <p className="text-xs text-muted-foreground">
                {o.phone} · {o.area ?? 'No area'} · {o.fulfilmentMethod}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {o.fulfilmentMethod === 'Customer Pickup'
                  ? `Pickup ${day(o.pickupDate)}${o.pickupTime ? ` ${o.pickupTime}` : ''}`
                  : `Delivery ${day(o.deliveryDate)}${o.courier ? ` · ${o.courier}` : ''}`}
              </p>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="font-semibold">{QAR(o.grandTotal)}</span>
                <span className="text-xs text-muted-foreground">Balance {QAR(o.remainingBalance)}</span>
              </div>
            </button>
            {canAssign && (
              <label className="mt-3 flex items-center gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
                <input type="checkbox" className="size-4" checked={picked.includes(o.id)} onChange={() => toggle(o.id)} />
                <span>Select · {staffName(o.assignedTo)}</span>
              </label>
            )}
          </div>
        ))}
      </div>

      {/* desktop table */}
      {rows.length > 0 && (
        <div className="card-surface hidden overflow-x-auto lg:block">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                {canAssign && <th className="p-3 w-10"> </th>}
                <th className="p-3">Order</th>
                <th className="p-3">Customer</th>
                <th className="p-3">Mobile</th>
                <th className="p-3">Area</th>
                <th className="p-3">Type</th>
                <th className="p-3">Delivery / Pickup</th>
                <th className="p-3">Delivery staff</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Total</th>
                <th className="p-3 text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr
                  key={o.id}
                  onClick={() => open(o.id)}
                  className="cursor-pointer border-t border-border hover:bg-secondary/40"
                >
                  {canAssign && (
                    <td className="p-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="size-4"
                        aria-label={`Select ${o.id}`}
                        checked={picked.includes(o.id)}
                        onChange={() => toggle(o.id)}
                      />
                    </td>
                  )}
                  <td className="p-3 font-medium">{o.id}</td>
                  <td className="p-3">{o.customerName}</td>
                  <td className="p-3">{o.phone}</td>
                  <td className="p-3">{o.area ?? '—'}</td>
                  <td className="p-3">{o.fulfilmentMethod}</td>
                  <td className="p-3">
                    {o.fulfilmentMethod === 'Customer Pickup' ? (
                      <>
                        {day(o.pickupDate)}
                        {o.pickupTime && <span className="text-xs text-muted-foreground"> {o.pickupTime}</span>}
                      </>
                    ) : (
                      <>
                        {day(o.deliveryDate)}
                        {o.courier && <p className="text-xs text-muted-foreground">{o.courier}</p>}
                      </>
                    )}
                  </td>
                  <td className="p-3">{staffName(o.assignedTo)}</td>
                  <td className="p-3">
                    <StatusBadge value={o.status} />
                    <p className="mt-1 text-xs text-muted-foreground">{o.paymentStatus}</p>
                  </td>
                  <td className="p-3 text-right">{QAR(o.grandTotal)}</td>
                  <td className="p-3 text-right">{QAR(o.remainingBalance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <SalesOrderDetails orderId={selected || null} onClose={() => open(null)} />
    </div>
  );
}
