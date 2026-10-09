import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Loader2, Plus, Trash2, Truck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { ConfirmAction } from '@/hub/components/ConfirmAction';
import { StockSkuPicker } from '@/hub/components/StockSkuPicker';
import { EmptyState, ErrorState, LoadingRows, PageHeader, StatusBadge } from '@/hub/components/shared';
import { Button } from '@/hub/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/hub/ui/dialog';
import { Input } from '@/hub/ui/input';
import { Label } from '@/hub/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/hub/ui/tabs';
import { Textarea } from '@/hub/ui/textarea';
import { accessQuery, productsQuery } from '@/hub/lib/api';
import {
  MULTILOC,
  canManageInventory,
  createTransfer,
  invalidateInventoryOps,
  locationStockQuery,
  locationsQuery,
  transferAction,
  transfersQuery,
} from '@/hub/lib/apiInventoryOps';
import { useHubTitle } from '@/hub/lib/useHubTitle';

const SELECT_CLS = 'h-11 w-full rounded-xl border border-input bg-background px-3 text-sm';
const STATUS = {
  pending: 'Pending',
  in_transit: 'In transit',
  completed: 'Completed',
  cancelled: 'Cancelled',
};
const FILTERS = [
  ['all', 'All'],
  ['pending', 'Pending'],
  ['in_transit', 'In transit'],
  ['completed', 'Completed'],
  ['cancelled', 'Cancelled'],
];

/** What each action does, in plain words, for the confirmation dialog. */
const ACTIONS = {
  dispatch: {
    label: 'Dispatch',
    title: 'Dispatch this transfer?',
    text: (x) => `The items leave ${x.fromLocation?.name ?? 'the source'} now — its stock goes down. They arrive at ${x.toLocation?.name ?? 'the destination'} when you mark the transfer completed.`,
  },
  complete: {
    label: 'Mark received',
    title: 'Mark this transfer as received?',
    text: (x) => `The items are added to ${x.toLocation?.name ?? 'the destination'}'s stock.`,
  },
  cancel: {
    label: 'Cancel transfer',
    title: 'Cancel this transfer?',
    text: (x) =>
      x.status === 'in_transit'
        ? `The items go back into ${x.fromLocation?.name ?? 'the source'}'s stock.`
        : 'Nothing has moved yet, so no stock changes.',
  },
};

export default function TransfersPage() {
  useHubTitle('Stock Transfers — FEMNIA Hub');
  const client = useQueryClient();
  const access = useQuery(accessQuery).data ?? null;
  const allowed = MULTILOC && canManageInventory(access);
  const [status, setStatus] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [pending, setPending] = useState(null); // { transfer, action }

  const list = useQuery({ ...transfersQuery(status === 'all' ? '' : status), enabled: allowed });
  const locs = useQuery({ ...locationsQuery, enabled: allowed });

  const act = useMutation({
    mutationFn: ({ transfer, action }) => transferAction(transfer.id, action),
    onSuccess: async (_, { action }) => {
      toast.success(action === 'dispatch' ? 'Transfer dispatched' : action === 'complete' ? 'Transfer received' : 'Transfer cancelled');
      setPending(null);
      await invalidateInventoryOps(client);
    },
    onError: (e) => toast.error(e.message),
  });

  if (!allowed) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader title="Stock Transfers" />
        <EmptyState
          title={MULTILOC ? 'You do not have permission to open this screen.' : 'Transfers need multi-location inventory.'}
          hint={MULTILOC ? 'Ask an Admin for inventory access.' : undefined}
        />
      </div>
    );
  }

  const rows = list.data ?? [];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Stock Transfers"
        subtitle="Move stock between branches: create, dispatch (leaves the source), then mark received (arrives at the destination)."
        onRefresh={() => list.refetch()}
        refreshing={list.isFetching}
        actions={
          <Button size="sm" className="h-10" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 size-4" /> New transfer
          </Button>
        }
      />

      <Tabs value={status} onValueChange={setStatus}>
        <TabsList className="mb-4 flex h-auto w-full flex-wrap justify-start gap-1">
          {FILTERS.map(([k, label]) => (
            <TabsTrigger key={k} value={k} className="min-h-10">
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {list.isPending ? (
        <LoadingRows />
      ) : list.isError ? (
        <ErrorState section="Transfers" message={list.error.message} onRetry={() => list.refetch()} />
      ) : !rows.length ? (
        <EmptyState title="No transfers" hint="Create one to move stock between locations." />
      ) : (
        <ul className="grid gap-3">
          {rows.map((x) => {
            const units = (x.items ?? []).reduce((s, it) => s + (Number(it.quantity) || 0), 0);
            return (
              <li key={x.id} className="card-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-medium text-foreground">
                      {x.fromLocation?.name ?? '—'} <ArrowRight className="size-4 text-muted-foreground" /> {x.toLocation?.name ?? '—'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {x.transferNumber} · {new Date(x.createdAt).toLocaleString()}
                      {x.creator?.name ? ` · by ${x.creator.name}` : ''} · {x.items?.length ?? 0} line
                      {x.items?.length === 1 ? '' : 's'}, {units} unit{units === 1 ? '' : 's'}
                    </p>
                  </div>
                  <StatusBadge value={STATUS[x.status] ?? x.status} />
                </div>
                <ul className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
                  {(x.items ?? []).map((it, i) => (
                    <li key={i} className="flex justify-between gap-3">
                      <span className="min-w-0 truncate text-muted-foreground">
                        {it.name || `Product #${it.productId}`}
                        {it.sku ? ` · ${it.sku}` : ''}
                      </span>
                      <span className="font-medium text-foreground">× {it.quantity}</span>
                    </li>
                  ))}
                </ul>
                {x.notes && <p className="mt-2 text-sm text-muted-foreground">{x.notes}</p>}
                {(x.status === 'pending' || x.status === 'in_transit') && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {x.status === 'pending' && (
                      <Button size="sm" className="h-9" onClick={() => setPending({ transfer: x, action: 'dispatch' })}>
                        <Truck className="mr-1.5 size-4" /> Dispatch
                      </Button>
                    )}
                    {x.status === 'in_transit' && (
                      <Button size="sm" className="h-9" onClick={() => setPending({ transfer: x, action: 'complete' })}>
                        Mark received
                      </Button>
                    )}
                    <Button variant="outline" size="sm" className="h-9" onClick={() => setPending({ transfer: x, action: 'cancel' })}>
                      Cancel
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <CreateTransferDialog open={createOpen} onClose={() => setCreateOpen(false)} locations={locs.data ?? []} />
      <ConfirmAction
        open={Boolean(pending)}
        title={pending ? ACTIONS[pending.action].title : ''}
        description={pending && <p>{ACTIONS[pending.action].text(pending.transfer)}</p>}
        confirmLabel={pending ? ACTIONS[pending.action].label : ''}
        destructive={pending?.action === 'cancel'}
        busy={act.isPending}
        onConfirm={() => act.mutate(pending)}
        onClose={() => setPending(null)}
      />
    </div>
  );
}

function CreateTransferDialog(props) {
  return <CreateTransferForm key={props.open ? 'open' : 'closed'} {...props} />;
}

function CreateTransferForm({ open, onClose, locations }) {
  const client = useQueryClient();
  const skus = useQuery({ ...productsQuery, enabled: open });
  const stock = useQuery({ ...locationStockQuery, enabled: open });
  const active = locations.filter((l) => l.active !== false);
  const [fromId, setFromId] = useState(() => String(active[0]?.id ?? ''));
  const [toId, setToId] = useState(() => String(active[1]?.id ?? ''));
  const [lines, setLines] = useState([]); // { sku, quantity }
  const [notes, setNotes] = useState('');

  const qtyAt = useMemo(() => {
    const m = new Map();
    for (const r of stock.data ?? []) m.set(`${r.productId}:${r.variantIndex ?? 'base'}@${r.locationId}`, r.quantity);
    return m;
  }, [stock.data]);
  const available = (sku) => qtyAt.get(`${sku.key}@${fromId}`) ?? 0;

  const addSku = (sku) => {
    if (lines.some((l) => l.sku.key === sku.key)) {
      toast.info('Already on this transfer — change its quantity below.');
      return;
    }
    setLines((cur) => [...cur, { sku, quantity: '1' }]);
  };

  const sameLocation = fromId && fromId === toId;
  const overStock = lines.some((l) => Number(l.quantity) > available(l.sku));
  const invalid =
    !fromId ||
    !toId ||
    sameLocation ||
    !lines.length ||
    lines.some((l) => !Number.isInteger(Number(l.quantity)) || Number(l.quantity) <= 0) ||
    overStock;

  const submit = useMutation({
    mutationFn: () =>
      createTransfer({
        fromLocationId: Number(fromId),
        toLocationId: Number(toId),
        notes: notes.trim() || null,
        items: lines.map((l) => ({
          productId: l.sku.productId,
          variantIndex: l.sku.variantIndex,
          quantity: Number(l.quantity),
          name: [l.sku.name, l.sku.size, l.sku.color].filter(Boolean).join(' — '),
          sku: l.sku.sku,
        })),
      }),
    onSuccess: async (x) => {
      toast.success(`Transfer ${x?.transferNumber ?? ''} created — dispatch it when the goods leave.`);
      await invalidateInventoryOps(client);
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="z-[70] max-h-[92vh] w-full max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New stock transfer</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="From">
              <select value={fromId} onChange={(e) => setFromId(e.target.value)} className={SELECT_CLS}>
                <option value="">Choose…</option>
                {active.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="To">
              <select value={toId} onChange={(e) => setToId(e.target.value)} className={SELECT_CLS}>
                <option value="">Choose…</option>
                {active.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
              {sameLocation && <p className="mt-1 text-xs text-destructive">Pick two different locations.</p>}
            </Field>
          </div>

          <Field label="Add products">
            <StockSkuPicker products={skus.data ?? []} value={null} onSelect={addSku} />
          </Field>

          {lines.length > 0 && (
            <ul className="divide-y divide-border rounded-2xl border border-border">
              {lines.map((l) => {
                const have = available(l.sku);
                const over = Number(l.quantity) > have;
                return (
                  <li key={l.sku.key} className="flex items-center gap-3 p-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground">{l.sku.name}</p>
                      <p className={over ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
                        {l.sku.sku}
                        {l.sku.size ? ` · ${l.sku.size}` : ''} · {have} at source
                      </p>
                    </div>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      value={l.quantity}
                      aria-label={`Quantity of ${l.sku.sku}`}
                      onChange={(e) =>
                        setLines((cur) => cur.map((x) => (x.sku.key === l.sku.key ? { ...x, quantity: e.target.value } : x)))
                      }
                      className="h-10 w-20 text-right"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Remove line"
                      onClick={() => setLines((cur) => cur.filter((x) => x.sku.key !== l.sku.key))}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
          {overStock && <p className="text-xs text-destructive">Some lines ask for more than the source location holds.</p>}

          <Field label="Notes (optional)">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </Field>

          <div className="sticky bottom-0 flex flex-col gap-2 border-t border-border bg-background pt-4 sm:flex-row sm:justify-end">
            <Button variant="outline" className="h-11" onClick={onClose}>
              Cancel
            </Button>
            <Button className="h-11" disabled={invalid || submit.isPending} onClick={() => submit.mutate()}>
              {submit.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Create transfer
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
