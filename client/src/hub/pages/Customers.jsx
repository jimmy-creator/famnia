/**
 * Customers directory: search, add/edit, and complete purchase history built
 * from the orders and their returns. Nothing here writes stock, payments or
 * invoices.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Pencil, Plus, Search, UserRound } from 'lucide-react';
import { useMemo, useState } from 'react';

import { CustomerDialog } from '@/hub/components/CustomerDialog';
import { EmptyState, ErrorState, LoadingRows, PageHeader, StatusBadge } from '@/hub/components/shared';
import { Button } from '@/hub/ui/button';
import { Input } from '@/hub/ui/input';
import { accessQuery, customerPurchasesQuery, customerRecordsQuery, qk } from '@/hub/lib/api';
import { guestCustomersQuery, guestOrdersQuery } from '@/hub/lib/apiOrders';
import { filterCustomers } from '@/hub/lib/customers';
import { QAR } from '@/hub/lib/format';
import { can } from '@/hub/lib/permissions';
import { useHubTitle } from '@/hub/lib/useHubTitle';

const day = (v) =>
  v ? new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export default function CustomersPage() {
  useHubTitle('Customers — FEMNIA Hub');
  const access = useQuery(accessQuery).data ?? null;
  const customers = useQuery(customerRecordsQuery);
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  /** Registered customers (accounts) or guests (checked out with an email only). */
  const [view, setView] = useState('registered');
  const guests = useQuery({ ...guestCustomersQuery, enabled: view === 'guests' });

  const canView = can(access, 'customers.view');
  const canAdd = can(access, 'customers.add');
  const canEdit = can(access, 'customers.edit');
  const canHistory = can(access, 'customers.history');

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (view === 'guests') {
      return (guests.data ?? [])
        .filter((g) => !q || [g.name, g.email, g.phone, g.area].some((v) => String(v ?? '').toLowerCase().includes(q)))
        .map((g) => ({ ...g, id: `guest:${g.email}`, code: 'Guest', guest: true }));
    }
    // Name / code / area / mobile (normalised), plus the account email.
    const list = customers.data ?? [];
    const matched = new Set(filterCustomers(list, query).map((c) => c.id));
    return list.filter((c) => matched.has(c.id) || (q && (c.email ?? '').toLowerCase().includes(q)));
  }, [customers.data, guests.data, query, view]);
  const active = view === 'guests' ? guests : customers;

  if (!canView) {
    return (
      <>
        <PageHeader title="Customers" subtitle="Restricted area" />
        <EmptyState title="You do not have permission to view customers" hint="Ask an Admin for customer access." />
      </>
    );
  }

  if (selected) {
    return (
      <CustomerDetails
        customer={selected}
        canHistory={canHistory}
        canEdit={canEdit && !selected.guest}
        onBack={() => setSelected(null)}
        onEdit={() => {
          setEditing(selected);
          setDialogOpen(true);
        }}
        dialog={
          <CustomerDialog
            open={dialogOpen}
            customer={editing}
            onClose={() => setDialogOpen(false)}
            onSaved={(c) => {
              setSelected({ ...selected, ...c });
              void queryClient.invalidateQueries({ queryKey: qk.customerRecords });
            }}
          />
        }
      />
    );
  }

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle={view === 'guests' ? `${guests.data?.length ?? 0} guest shoppers` : `${customers.data?.length ?? 0} customers`}
        onRefresh={() => void active.refetch()}
        refreshing={active.isFetching}
        actions={
          canAdd ? (
            <Button
              className="h-10"
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="mr-2 size-4" /> Add customer
            </Button>
          ) : undefined
        }
      />

      <div className="mb-3 inline-flex rounded-xl border border-border bg-card p-1">
        {[['registered', 'Registered'], ['guests', 'Guests']].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setView(key)}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${view === key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-primary'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-3.5 size-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={view === 'guests' ? 'Search guests by name, email or mobile' : 'Search by name, mobile, email or customer code'}
          className="h-11 pl-9"
        />
      </div>

      {active.isLoading && <LoadingRows count={6} />}
      {active.isError && (
        <ErrorState
          section={view === 'guests' ? 'guest shoppers' : 'customers'}
          message={active.error instanceof Error ? active.error.message : 'Unknown error'}
          onRetry={() => void active.refetch()}
        />
      )}

      {active.isSuccess && !results.length && (
        <EmptyState
          title={query ? 'No customer matched your search' : 'No customers yet'}
          hint={query ? 'Try a different name or mobile number.' : 'Customers are also created automatically from Sales Orders.'}
        />
      )}

      {/* mobile cards */}
      <div className="space-y-3 md:hidden">
        {results.map((c) => (
          <button key={c.id} className="card-surface w-full p-4 text-left" onClick={() => setSelected(c)}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{c.name}</p>
                <p className="truncate text-xs text-muted-foreground">{c.phone}{c.altPhone ? ` · ${c.altPhone}` : ''}</p>
                <p className="truncate text-xs text-muted-foreground">{c.area ?? 'No area'} · {c.code}</p>
                {c.email && <p className="truncate text-xs text-muted-foreground">{c.email}</p>}
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold">{QAR(c.totalSpend)}</p>
                <p className="text-xs text-muted-foreground">{c.orderCount} order{c.orderCount === 1 ? '' : 's'}</p>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* desktop table */}
      {results.length > 0 && (
        <div className="card-surface hidden overflow-hidden md:block">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Mobile</th>
                <th className="px-4 py-3">Area</th>
                <th className="px-4 py-3 text-right">Orders</th>
                <th className="px-4 py-3 text-right">Total spend</th>
                <th className="px-4 py-3">Last order</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {results.map((c) => (
                <tr key={c.id} className="border-t border-border/70">
                  <td className="px-4 py-3">
                    <p className="font-medium">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.code}</p>
                    {c.email && <p className="text-xs text-muted-foreground">{c.email}</p>}
                  </td>
                  <td className="px-4 py-3">
                    {c.phone}
                    {c.altPhone && <p className="text-xs text-muted-foreground">{c.altPhone}</p>}
                  </td>
                  <td className="px-4 py-3">{c.area ?? '—'}</td>
                  <td className="px-4 py-3 text-right">{c.orderCount}</td>
                  <td className="px-4 py-3 text-right">{QAR(c.totalSpend)}</td>
                  <td className="px-4 py-3">{day(c.lastOrderDate)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => setSelected(c)}>
                        <UserRound className="mr-1.5 size-4" /> View
                      </Button>
                      {canEdit && !c.guest && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditing(c);
                            setDialogOpen(true);
                          }}
                        >
                          <Pencil className="size-4" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CustomerDialog open={dialogOpen} customer={editing} onClose={() => setDialogOpen(false)} />
    </>
  );
}

function CustomerDetails({ customer, canHistory, canEdit, onBack, onEdit, dialog }) {
  const purchases = useQuery(
    customer.guest
      ? { ...guestOrdersQuery(customer.email), enabled: canHistory }
      : { ...customerPurchasesQuery(customer.id), enabled: canHistory },
  );

  return (
    <>
      <PageHeader
        title={customer.name}
        subtitle={[customer.code, customer.phone, customer.altPhone, customer.email].filter(Boolean).join(' · ')}
        actions={
          <>
            <Button variant="outline" className="h-10" onClick={onBack}>
              <ArrowLeft className="mr-2 size-4" /> Back
            </Button>
            {canEdit && (
              <Button className="h-10" onClick={onEdit}>
                <Pencil className="mr-2 size-4" /> Edit
              </Button>
            )}
          </>
        }
      />

      <div className="card-surface mb-4 grid gap-3 p-4 sm:grid-cols-2">
        <Detail label="Area" value={customer.area} />
        <Detail label="Address" value={customer.address} />
        <Detail label="Notes" value={customer.notes} />
        {customer.guest ? (
          <Detail label="Last order" value={day(customer.lastOrderDate)} />
        ) : (
          <Detail label="Customer since" value={day(customer.createdAt)} />
        )}
        <Detail label="Total orders" value={String(customer.orderCount)} />
        <Detail label="Total spend" value={QAR(customer.totalSpend)} />
      </div>

      <h2 className="mb-2 section-title text-sm font-semibold">Purchase history</h2>
      {!canHistory && <EmptyState title="You do not have permission to view order history" />}
      {canHistory && purchases.isLoading && <LoadingRows count={3} />}
      {canHistory && purchases.isError && (
        <ErrorState
          section="purchase history"
          message={purchases.error instanceof Error ? purchases.error.message : 'Unknown error'}
          onRetry={() => void purchases.refetch()}
        />
      )}
      {canHistory && purchases.isSuccess && !purchases.data.length && (
        <EmptyState title="No orders yet" hint="Orders created for this customer will appear here." />
      )}

      <div className="space-y-3">
        {(purchases.data ?? []).map(({ order, returns }) => (
          <div key={order.id} className="card-surface p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold">{order.id}</p>
                <p className="text-xs text-muted-foreground">{day(order.orderDate)}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge value={order.status} />
                <StatusBadge value={order.paymentStatus} />
                <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">
                  {order.fulfilmentMethod}
                </span>
              </div>
            </div>

            <ul className="mt-3 space-y-1 text-sm">
              {order.items.map((i) => (
                <li key={`${order.id}-${i.id}`} className="flex flex-wrap justify-between gap-2">
                  <span className="min-w-0 truncate">
                    {i.name}
                    {i.size ? ` · ${i.size}` : ''}
                    {i.color ? ` · ${i.color}` : ''} × {i.quantity}
                    {i.returnedQty ? ` (${i.returnedQty} returned)` : ''}
                  </span>
                  <span className="shrink-0 text-muted-foreground">{QAR(i.lineTotal)}</span>
                </li>
              ))}
            </ul>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-3 text-sm">
              <span className="text-muted-foreground">
                {order.paymentMode} · Received {QAR(order.amountReceived)}
                {order.remainingBalance > 0 ? ` · Balance ${QAR(order.remainingBalance)}` : ''}
              </span>
              <span className="font-semibold">{QAR(order.grandTotal)}</span>
            </div>

            {returns.length > 0 && (
              <div className="mt-3 rounded-xl bg-destructive/10 p-3 text-xs text-destructive">
                {returns.map((r, idx) => (
                  <p key={`${order.id}-r-${idx}`}>
                    Returned {r.quantity} × {r.sku} — {r.reason}
                    {r.restock ? ' (restocked)' : ' (not restocked)'} on {day(r.createdAt)}
                  </p>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {dialog}
    </>
  );
}

function Detail({ label, value }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm">{value?.trim() ? value : '—'}</p>
    </div>
  );
}
