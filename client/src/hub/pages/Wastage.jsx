import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Loader2, Plus, Undo2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { ConfirmAction } from '@/hub/components/ConfirmAction';
import { StockSkuPicker } from '@/hub/components/StockSkuPicker';
import { EmptyState, ErrorState, LoadingRows, PageHeader, StatusBadge } from '@/hub/components/shared';
import { Button } from '@/hub/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/hub/ui/dialog';
import { Input } from '@/hub/ui/input';
import { Label } from '@/hub/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/hub/ui/select';
import { Textarea } from '@/hub/ui/textarea';
import { accessQuery, productsQuery } from '@/hub/lib/api';
import {
  MULTILOC,
  WASTAGE_REASONS,
  canManageInventory,
  daysAgo,
  invalidateInventoryOps,
  locationStockQuery,
  locationsQuery,
  recordWastage,
  reverseWastage,
  variantLabel,
  wastageQuery,
  wastageReasonLabel,
} from '@/hub/lib/apiInventoryOps';
import { QAR, downloadFile, toCsv, today } from '@/hub/lib/format';
import { useHubTitle } from '@/hub/lib/useHubTitle';

const ALL = '__all__';
const SELECT_CLS = 'h-11 w-full rounded-xl border border-input bg-background px-3 text-sm';

export default function WastagePage() {
  useHubTitle('Wastage — FEMNIA Hub');
  const client = useQueryClient();
  const access = useQuery(accessQuery).data ?? null;
  const allowed = MULTILOC && canManageInventory(access);

  const [from, setFrom] = useState(() => daysAgo(30));
  const [to, setTo] = useState(today);
  const [locationId, setLocationId] = useState(ALL);
  const [reason, setReason] = useState(ALL);
  const [status, setStatus] = useState('posted');
  const [recordOpen, setRecordOpen] = useState(false);
  const [reversing, setReversing] = useState(null);

  const params = {
    from,
    to,
    status,
    limit: 1000,
    locationId: locationId === ALL ? '' : locationId,
    reason: reason === ALL ? '' : reason,
  };
  const list = useQuery({ ...wastageQuery(params), enabled: allowed });
  const locs = useQuery({ ...locationsQuery, enabled: allowed });
  const rows = useMemo(() => list.data ?? [], [list.data]);

  const totals = useMemo(() => {
    const byReason = new Map();
    let cost = 0;
    let units = 0;
    for (const r of rows) {
      const c = parseFloat(r.totalCost) || 0;
      cost += c;
      units += parseFloat(r.quantity) || 0;
      const cur = byReason.get(r.reason) ?? { cost: 0, qty: 0 };
      byReason.set(r.reason, { cost: cur.cost + c, qty: cur.qty + (parseFloat(r.quantity) || 0) });
    }
    return { cost, units, byReason: [...byReason.entries()].sort((a, b) => b[1].cost - a[1].cost) };
  }, [rows]);

  const reverse = useMutation({
    mutationFn: (id) => reverseWastage(id),
    onSuccess: async () => {
      toast.success('Write-off reversed — stock added back');
      setReversing(null);
      await invalidateInventoryOps(client);
    },
    onError: (e) => toast.error(e.message),
  });

  const exportCsv = () =>
    downloadFile(
      `femnia-wastage-${from}-to-${to}.csv`,
      toCsv(
        rows.map((r) => ({
          Number: r.wastageNumber,
          Date: r.wastageDate,
          Product: productName(r),
          Location: r.Location?.name ?? '',
          Quantity: r.quantity,
          Reason: wastageReasonLabel(r.reason),
          Cost: r.totalCost,
          'Recorded by': r.creator?.name ?? '',
          Notes: r.notes ?? '',
          Status: r.status,
        })),
      ),
    );

  if (!allowed) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader title="Wastage" />
        <EmptyState
          title={MULTILOC ? 'You do not have permission to open this screen.' : 'Wastage needs multi-location inventory.'}
          hint={MULTILOC ? 'Ask an Admin for inventory access.' : 'Use Stock Out with reason “Damaged” instead.'}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Wastage"
        subtitle="Damaged, defective, lost or given-away stock written off. The cost shows in P&L as a stock loss — no cash moves."
        onRefresh={() => list.refetch()}
        refreshing={list.isFetching}
        actions={
          <>
            <Button variant="outline" size="sm" className="h-10" onClick={exportCsv} disabled={!rows.length}>
              <Download className="mr-2 size-4" /> Export CSV
            </Button>
            <Button size="sm" className="h-10" onClick={() => setRecordOpen(true)}>
              <Plus className="mr-2 size-4" /> Record wastage
            </Button>
          </>
        }
      />

      <div className="no-print mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-11" aria-label="From" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-11" aria-label="To" />
        <Select value={locationId} onValueChange={setLocationId}>
          <SelectTrigger className="h-11">
            <SelectValue placeholder="Location" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All locations</SelectItem>
            {(locs.data ?? []).map((l) => (
              <SelectItem key={l.id} value={String(l.id)}>
                {l.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={reason} onValueChange={setReason}>
          <SelectTrigger className="h-11">
            <SelectValue placeholder="Reason" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All reasons</SelectItem>
            {WASTAGE_REASONS.map(([k, label]) => (
              <SelectItem key={k} value={k}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-11">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="posted">Written off</SelectItem>
            <SelectItem value="cancelled">Reversed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className="card-surface p-3">
          <p className="text-xs text-muted-foreground">Entries</p>
          <p className="mt-1 text-lg font-semibold text-primary">{rows.length}</p>
        </div>
        <div className="card-surface p-3">
          <p className="text-xs text-muted-foreground">Units</p>
          <p className="mt-1 text-lg font-semibold text-primary">{totals.units}</p>
        </div>
        <div className="card-surface p-3">
          <p className="text-xs text-muted-foreground">Cost {status === 'posted' ? 'written off' : 'reversed'}</p>
          <p className="mt-1 text-sm font-semibold text-primary sm:text-lg">{QAR(totals.cost)}</p>
        </div>
      </div>

      {totals.byReason.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {totals.byReason.map(([r, t]) => (
            <span key={r} className="rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
              {wastageReasonLabel(r)}: <strong className="text-foreground">{t.qty}</strong> · {QAR(t.cost)}
            </span>
          ))}
        </div>
      )}

      {list.isPending ? (
        <LoadingRows />
      ) : list.isError ? (
        <ErrorState section="Wastage" message={list.error.message} onRetry={() => list.refetch()} />
      ) : !rows.length ? (
        <EmptyState title="No wastage in this period" hint="Change the dates or filters, or record a write-off." />
      ) : (
        <ul className="grid gap-3">
          {rows.map((r) => (
            <li key={r.id} className="card-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{productName(r)}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.wastageNumber} · {r.wastageDate} · {r.Location?.name ?? '—'}
                    {r.creator?.name ? ` · by ${r.creator.name}` : ''}
                  </p>
                  {r.notes && <p className="mt-1 text-sm text-muted-foreground">{r.notes}</p>}
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-lg font-semibold text-destructive">−{r.quantity}</p>
                    <p className="text-xs text-muted-foreground">{QAR(r.totalCost)}</p>
                  </div>
                  <StatusBadge value={wastageReasonLabel(r.reason)} />
                  {r.status === 'cancelled' ? (
                    <StatusBadge value="Cancelled" />
                  ) : (
                    <Button variant="outline" size="sm" className="h-9" onClick={() => setReversing(r)}>
                      <Undo2 className="mr-1.5 size-4" /> Reverse
                    </Button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <RecordWastageDialog open={recordOpen} onClose={() => setRecordOpen(false)} locations={locs.data ?? []} />
      <ConfirmAction
        open={Boolean(reversing)}
        title={`Reverse ${reversing?.wastageNumber ?? 'write-off'}?`}
        description={
          reversing && (
            <p>
              {reversing.quantity} × {productName(reversing)} goes back into stock at {reversing.Location?.name ?? 'its location'},
              and the {QAR(reversing.totalCost)} loss is removed from P&L.
            </p>
          )
        }
        confirmLabel="Reverse write-off"
        busy={reverse.isPending}
        onConfirm={() => reverse.mutate(reversing.id)}
        onClose={() => setReversing(null)}
      />
    </div>
  );
}

function productName(r) {
  const v = r.variantIndex != null ? r.Product?.variants?.[r.variantIndex] : null;
  const label = variantLabel(v);
  return `${r.Product?.name ?? `Product #${r.productId}`}${label ? ` — ${label}` : ''}`;
}

function RecordWastageDialog(props) {
  return <RecordWastageForm key={props.open ? 'open' : 'closed'} {...props} />;
}

function RecordWastageForm({ open, onClose, locations }) {
  const client = useQueryClient();
  const skus = useQuery({ ...productsQuery, enabled: open });
  const stock = useQuery({ ...locationStockQuery, enabled: open });
  const active = locations.filter((l) => l.active !== false);
  const [sku, setSku] = useState(null);
  const [locationId, setLocationId] = useState(() => String((active.find((l) => l.isOnlineDefault) ?? active[0])?.id ?? ''));
  const [quantity, setQuantity] = useState('1');
  const [reason, setReason] = useState('damaged');
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState('');

  const atLocation = useMemo(() => {
    if (!sku || !locationId) return null;
    const row = (stock.data ?? []).find(
      (r) => r.productId === sku.productId && (r.variantIndex ?? null) === (sku.variantIndex ?? null) && String(r.locationId) === locationId,
    );
    return row ? row.quantity : 0;
  }, [stock.data, sku, locationId]);

  const qty = Number(quantity);
  const exceeds = atLocation != null && qty > atLocation;
  const invalid = !sku || !locationId || !Number.isInteger(qty) || qty <= 0 || exceeds || !date;

  const submit = useMutation({
    mutationFn: () =>
      recordWastage({
        productId: sku.productId,
        variantIndex: sku.variantIndex,
        locationId: Number(locationId),
        quantity: qty,
        reason,
        notes: notes.trim() || null,
        wastageDate: date,
      }),
    onSuccess: async (w) => {
      toast.success(`Wastage ${w?.wastageNumber ?? ''} recorded`.trim());
      await invalidateInventoryOps(client);
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="z-[70] max-h-[92vh] w-full max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record wastage</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          <p className="rounded-2xl bg-secondary/50 p-3 text-xs text-muted-foreground">
            Removes the stock from the chosen location. The cost is booked in P&amp;L as a stock loss — it is not an expense and no
            cash moves. If the shelf figure is simply wrong, use a Stock Count instead.
          </p>
          <Field label="Product / size">
            <StockSkuPicker products={skus.data ?? []} value={sku} onSelect={setSku} />
          </Field>
          {sku && (
            <div className="rounded-2xl bg-secondary/50 p-4 text-sm">
              <p className="font-medium text-foreground">{sku.name}</p>
              <p className="text-muted-foreground">
                {sku.sku}
                {sku.size ? ` · Size ${sku.size}` : ''}
                {sku.color ? ` · ${sku.color}` : ''}
              </p>
              <p className="mt-1 text-muted-foreground">
                At this location: <span className="font-semibold text-foreground">{atLocation ?? '—'}</span>
                {sku.costPrice > 0 && Number.isFinite(qty) && qty > 0 && (
                  <>
                    {' '}
                    · Estimated cost <span className="font-semibold text-foreground">{QAR(sku.costPrice * qty)}</span>
                  </>
                )}
              </p>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Location">
              <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className={SELECT_CLS}>
                {active.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Date">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11" />
            </Field>
            <Field label="Quantity">
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="h-11"
              />
              {exceeds && <p className="mt-1 text-xs text-destructive">Only {atLocation} in stock at this location.</p>}
            </Field>
            <Field label="Reason">
              <select value={reason} onChange={(e) => setReason(e.target.value)} className={SELECT_CLS}>
                {WASTAGE_REASONS.map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Notes">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="What happened?" />
          </Field>
          <div className="sticky bottom-0 flex flex-col gap-2 border-t border-border bg-background pt-4 sm:flex-row sm:justify-end">
            <Button variant="outline" className="h-11" onClick={onClose}>
              Cancel
            </Button>
            <Button className="h-11" disabled={invalid || submit.isPending} onClick={() => submit.mutate()}>
              {submit.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Write off stock
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
