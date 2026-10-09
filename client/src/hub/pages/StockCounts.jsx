import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Plus, ScanLine, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { ConfirmAction } from '@/hub/components/ConfirmAction';
import { EmptyState, ErrorState, Loading, LoadingRows, PageHeader, StatusBadge } from '@/hub/components/shared';
import { Button } from '@/hub/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/hub/ui/dialog';
import { Input } from '@/hub/ui/input';
import { Label } from '@/hub/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/hub/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/hub/ui/tabs';
import { Textarea } from '@/hub/ui/textarea';
import { accessQuery } from '@/hub/lib/api';
import {
  MULTILOC,
  addCountLine,
  canManageInventory,
  cancelCount,
  countQuery,
  countsQuery,
  createCount,
  daysAgo,
  deleteCountLine,
  invalidateInventoryOps,
  ik,
  locationsQuery,
  lookupCountProducts,
  postCount,
  updateCountLine,
  varianceReportQuery,
  variantLabel,
} from '@/hub/lib/apiInventoryOps';
import { QAR, today } from '@/hub/lib/format';
import { useHubTitle } from '@/hub/lib/useHubTitle';
import { cn } from '@/lib/utils';

const ALL = '__all__';
const SELECT_CLS = 'h-11 w-full rounded-xl border border-input bg-background px-3 text-sm';
const STATUS = { draft: 'Draft', in_progress: 'Counting', posted: 'Posted', cancelled: 'Cancelled' };
const signed = (n) => (n > 0 ? `+${n}` : String(n));
const tone = (n) => (n < 0 ? 'text-destructive' : n > 0 ? 'text-emerald-700' : 'text-foreground');

export default function StockCountsPage() {
  useHubTitle('Stock Counts — FEMNIA Hub');
  const access = useQuery(accessQuery).data ?? null;
  const allowed = MULTILOC && canManageInventory(access);
  const [params, setParams] = useSearchParams();
  const countId = params.get('count');
  const view = params.get('view') === 'variance' ? 'variance' : 'counts';

  if (!allowed) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader title="Stock Counts" />
        <EmptyState
          title={MULTILOC ? 'You do not have permission to open this screen.' : 'Stock counts need multi-location inventory.'}
          hint={MULTILOC ? 'Ask an Admin for inventory access.' : 'Use Inventory → Adjust stock to correct a single size.'}
        />
      </div>
    );
  }

  if (countId) return <CountDetail id={countId} onBack={() => setParams({}, { replace: false })} />;

  const tabBar = (
    <Tabs value={view} onValueChange={(v) => setParams(v === 'variance' ? { view: v } : {}, { replace: true })}>
      <TabsList className="mb-4">
        <TabsTrigger value="counts" className="min-h-10">
          Counts
        </TabsTrigger>
        <TabsTrigger value="variance" className="min-h-10">
          Variance report
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );

  return view === 'variance' ? (
    <VarianceReport tabBar={tabBar} />
  ) : (
    <CountList tabBar={tabBar} onOpen={(id) => setParams({ count: String(id) })} />
  );
}

/* --------------------------------- List --------------------------------- */

function CountList({ tabBar, onOpen }) {
  const [locationId, setLocationId] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [createOpen, setCreateOpen] = useState(false);
  const locs = useQuery(locationsQuery);
  const list = useQuery(
    countsQuery({ locationId: locationId === ALL ? '' : locationId, status: status === ALL ? '' : status }),
  );
  const rows = list.data ?? [];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Stock Counts"
        subtitle="Count what is really on the shelf, then post: the counted figure replaces the system stock and the difference is recorded."
        onRefresh={() => list.refetch()}
        refreshing={list.isFetching}
        actions={
          <Button size="sm" className="h-10" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 size-4" /> Start a count
          </Button>
        }
      />
      {tabBar}

      <div className="no-print mb-4 grid gap-2 sm:grid-cols-2 lg:w-2/3">
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
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-11">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {Object.entries(STATUS).map(([k, label]) => (
              <SelectItem key={k} value={k}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {list.isPending ? (
        <LoadingRows />
      ) : list.isError ? (
        <ErrorState section="Stock counts" message={list.error.message} onRetry={() => list.refetch()} />
      ) : !rows.length ? (
        <EmptyState title="No stock counts yet" hint="Start a count to check a branch's shelves against the system." />
      ) : (
        <ul className="grid gap-3">
          {rows.map((c) => {
            const value = parseFloat(c.totalVarianceValue) || 0;
            return (
              <li key={c.id}>
                <button onClick={() => onOpen(c.id)} className="card-surface w-full p-4 text-left hover:bg-secondary/40">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">
                        {c.countNumber} · {c.Location?.name ?? '—'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {c.scope === 'full' ? 'Full count' : 'Partial count'} · started {new Date(c.createdAt).toLocaleDateString()}
                        {c.creator?.name ? ` by ${c.creator.name}` : ''}
                        {c.postedAt ? ` · posted ${new Date(c.postedAt).toLocaleDateString()}` : ''}
                        {c.poster?.name ? ` by ${c.poster.name}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {c.status === 'posted' && (
                        <div className="text-right text-sm">
                          <p className={cn('font-semibold', tone(c.totalVarianceQty ?? 0))}>{signed(c.totalVarianceQty ?? 0)} units</p>
                          <p className={cn('text-xs', tone(value))}>{QAR(value)}</p>
                        </div>
                      )}
                      <StatusBadge value={STATUS[c.status] ?? c.status} />
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <NewCountDialog open={createOpen} onClose={() => setCreateOpen(false)} locations={locs.data ?? []} onCreated={onOpen} />
    </div>
  );
}

function NewCountDialog(props) {
  return <NewCountForm key={props.open ? 'open' : 'closed'} {...props} />;
}

function NewCountForm({ open, onClose, locations, onCreated }) {
  const client = useQueryClient();
  const active = locations.filter((l) => l.active !== false);
  const [locationId, setLocationId] = useState(() => String((active.find((l) => l.isOnlineDefault) ?? active[0])?.id ?? ''));
  const [scope, setScope] = useState('partial');
  const [notes, setNotes] = useState('');

  const submit = useMutation({
    mutationFn: () => createCount({ locationId: Number(locationId), scope, notes: notes.trim() || null }),
    onSuccess: async (sc) => {
      toast.success(`Count ${sc.countNumber} started`);
      await client.invalidateQueries({ queryKey: ['femnia', 'inv-counts'] });
      onClose();
      onCreated(sc.id);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="z-[70] w-full max-w-lg">
        <DialogHeader>
          <DialogTitle>Start a stock count</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Location">
            <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className={SELECT_CLS}>
              {active.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Scope">
            <select value={scope} onChange={(e) => setScope(e.target.value)} className={SELECT_CLS}>
              <option value="partial">Partial — a shelf, rack or a few products</option>
              <option value="full">Full — every product at the location</option>
            </select>
          </Field>
          <Field label="Notes (optional)">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="e.g. Rack A, month-end count" />
          </Field>
          <p className="rounded-2xl bg-secondary/50 p-3 text-xs text-muted-foreground">
            Only the sizes you add to the count are changed when you post it. Anything you don't count keeps its current stock.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" className="h-11" onClick={onClose}>
              Cancel
            </Button>
            <Button className="h-11" disabled={!locationId || submit.isPending} onClick={() => submit.mutate()}>
              {submit.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Start counting
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------- Detail -------------------------------- */

function CountDetail({ id, onBack }) {
  const client = useQueryClient();
  const q = useQuery(countQuery(id));
  const sc = q.data;
  const [search, setSearch] = useState('');
  const [variantPicker, setVariantPicker] = useState(null);
  const [confirm, setConfirm] = useState(null); // 'post' | 'cancel' | { line }
  const searchRef = useRef(null);
  const scanQueue = useRef(Promise.resolve());

  const locked = sc && (sc.status === 'posted' || sc.status === 'cancelled');
  const lines = useMemo(() => sc?.lines ?? [], [sc]);
  const counted = lines.filter((l) => l.countedQty != null);
  const previewQty = counted.reduce((s, l) => s + (l.countedQty - l.expectedQty), 0);

  const refresh = () => client.invalidateQueries({ queryKey: ik.count(id) });

  // Debounced name/SKU search against this count's location.
  const [term, setTerm] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setTerm(search.trim()), 200);
    return () => clearTimeout(t);
  }, [search]);
  const lookup = useQuery({
    queryKey: ['femnia', 'inv-count-lookup', sc?.locationId, term],
    queryFn: () => lookupCountProducts(term, sc.locationId),
    enabled: Boolean(term && sc),
    staleTime: 10_000,
  });
  const results = search.trim() && term ? (lookup.data ?? []) : [];

  const addLine = async (productId, variantIndex) => {
    try {
      await addCountLine(id, { productId, variantIndex });
      setSearch('');
      setVariantPicker(null);
      searchRef.current?.focus();
      await refresh();
    } catch (err) {
      if (/already on this count/i.test(err.message)) toast.info(err.message);
      else toast.error(err.message);
    }
  };

  // Scanner (or Enter on a typed SKU/barcode): an exact match is added with
  // qty 1, and scanning it again adds 1 more. Queued so fast scans never race.
  const doScan = async (code) => {
    try {
      const hits = await lookupCountProducts(code, sc.locationId);
      const exact = hits.filter((h) => h.exact);
      if (exact.length !== 1) {
        setSearch(code);
        if (!hits.length) toast.error(`No product for "${code}"`);
        return;
      }
      const hit = exact[0];
      if (hit.hasVariants && hit.variantIndex == null) {
        setVariantPicker(hit);
        return;
      }
      const fresh = await client.fetchQuery({ ...countQuery(id), staleTime: 0 });
      const line = (fresh.lines ?? []).find(
        (l) => l.productId === hit.productId && (l.variantIndex ?? null) === (hit.variantIndex ?? null),
      );
      if (line) {
        await updateCountLine(id, line.id, { countedQty: (line.countedQty || 0) + 1 });
        toast.success(`${hit.name} · counted ${(line.countedQty || 0) + 1}`, { id: 'scan' });
      } else {
        await addCountLine(id, { productId: hit.productId, variantIndex: hit.variantIndex, countedQty: 1 });
        toast.success(`${hit.name} added · counted 1`, { id: 'scan' });
      }
      await refresh();
    } catch (err) {
      toast.error(err.message);
    }
  };
  const scan = (code) => {
    scanQueue.current = scanQueue.current.then(() => doScan(code));
  };

  const saveLine = async (lineId, patch) => {
    try {
      await updateCountLine(id, lineId, patch);
      await refresh();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const act = useMutation({
    mutationFn: async (what) => {
      if (what === 'post') return postCount(id);
      if (what === 'cancel') return cancelCount(id);
      return deleteCountLine(id, what.line.id);
    },
    onSuccess: async (_, what) => {
      toast.success(what === 'post' ? 'Count posted — stock updated' : what === 'cancel' ? 'Count cancelled' : 'Line removed');
      setConfirm(null);
      if (what === 'post') await invalidateInventoryOps(client);
      else await Promise.all([refresh(), client.invalidateQueries({ queryKey: ['femnia', 'inv-counts'] })]);
    },
    onError: (e) => toast.error(e.message),
  });

  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState section="Stock count" message={q.error.message} onRetry={() => q.refetch()} />;

  const varianceValue = parseFloat(sc.totalVarianceValue) || 0;

  return (
    <div className="mx-auto max-w-6xl">
      <Button variant="ghost" className="mb-3 h-10 px-2" onClick={onBack}>
        <ArrowLeft className="mr-2 size-4" /> All counts
      </Button>
      <PageHeader
        title={`${sc.countNumber} · ${sc.Location?.name ?? ''}`}
        subtitle={[
          sc.scope === 'full' ? 'Full count' : 'Partial count',
          STATUS[sc.status] ?? sc.status,
          sc.creator?.name && `started by ${sc.creator.name}`,
          sc.postedAt && `posted ${new Date(sc.postedAt).toLocaleString()}`,
          sc.notes,
        ]
          .filter(Boolean)
          .join(' · ')}
        onRefresh={() => q.refetch()}
        refreshing={q.isFetching}
        actions={
          !locked && (
            <>
              <Button variant="outline" size="sm" className="h-10" onClick={() => setConfirm('cancel')}>
                Cancel count
              </Button>
              <Button size="sm" className="h-10" disabled={!counted.length} onClick={() => setConfirm('post')}>
                Post count
              </Button>
            </>
          )
        }
      />

      {!locked && (
        <div className="relative mb-4">
          <div className="relative">
            <ScanLine className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              autoFocus
              placeholder="Scan a barcode, or type a SKU / name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' || !search.trim()) return;
                e.preventDefault();
                const code = search.trim();
                setSearch('');
                scan(code);
              }}
              className="h-12 pl-10 text-base"
            />
          </div>
          {results.length > 0 && (
            <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-80 overflow-y-auto rounded-2xl border border-border bg-card shadow-lg">
              {results.map((r) => (
                <button
                  key={`${r.productId}:${r.variantIndex}`}
                  type="button"
                  onClick={() => (r.hasVariants && r.variantIndex == null ? setVariantPicker(r) : addLine(r.productId, r.variantIndex))}
                  className="flex w-full items-center justify-between gap-3 border-b border-border px-3 py-3 text-left text-sm last:border-b-0 hover:bg-secondary/60"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-foreground">
                      {r.name}
                      {r.hasVariants && r.variantIndex == null && <span className="ml-1 text-muted-foreground">(pick a size)</span>}
                    </span>
                    <span className="block text-xs text-muted-foreground">{r.sku || '—'}</span>
                  </span>
                  {!(r.hasVariants && r.variantIndex == null) && (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      system <strong className="text-foreground">{r.stockAtLocation}</strong>
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Lines" value={lines.length} />
        <Stat label="Counted" value={counted.length} />
        <Stat
          label={locked ? 'Variance (units)' : 'Variance so far'}
          value={signed(locked ? sc.totalVarianceQty ?? 0 : previewQty)}
          className={tone(locked ? sc.totalVarianceQty ?? 0 : previewQty)}
        />
        {locked && <Stat label="Variance value" value={QAR(varianceValue)} className={tone(varianceValue)} />}
      </div>

      {!lines.length ? (
        <EmptyState
          title={locked ? 'No lines on this count' : 'Nothing counted yet'}
          hint={locked ? undefined : 'Scan or search a product above to add it.'}
        />
      ) : (
        <div className="card-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Item</th>
                <th className="px-3 py-3 text-right">System</th>
                <th className="px-3 py-3 text-right">Counted</th>
                <th className="px-3 py-3 text-right">Difference</th>
                {locked && <th className="px-3 py-3 text-right">Value</th>}
                <th className="px-3 py-3">Reason</th>
                {!locked && <th className="px-3 py-3" />}
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <LineRow
                  key={`${l.id}:${l.countedQty}:${l.reason ?? ''}`}
                  line={l}
                  locked={locked}
                  onSave={(patch) => saveLine(l.id, patch)}
                  onRemove={() => setConfirm({ line: l })}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={Boolean(variantPicker)} onOpenChange={(o) => !o && setVariantPicker(null)}>
        <DialogContent className="z-[70] w-full max-w-md">
          <DialogHeader>
            <DialogTitle>Pick a size — {variantPicker?.name}</DialogTitle>
          </DialogHeader>
          <div className="grid max-h-80 gap-2 overflow-y-auto">
            {(variantPicker?.variants ?? []).map((v, idx) =>
              v.archived ? null : (
                <Button
                  key={idx}
                  variant="outline"
                  className="h-11 justify-between"
                  onClick={() => addLine(variantPicker.productId, idx)}
                >
                  <span>{variantLabel(v) || `Variant ${idx + 1}`}</span>
                  <span className="text-xs text-muted-foreground">
                    {v.sku ? `${v.sku} · ` : ''}system {v.stockAtLocation || 0}
                  </span>
                </Button>
              ),
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmAction
        open={confirm === 'post'}
        title="Post this count?"
        description={
          <>
            <p>
              The counted figures replace the system stock at <strong>{sc.Location?.name}</strong> for the {counted.length} counted
              line{counted.length === 1 ? '' : 's'}. Lines left blank are ignored.
            </p>
            <p>
              The difference ({signed(previewQty)} units) is valued at cost and shows in P&amp;L as a stock loss or gain. No cash moves.
            </p>
          </>
        }
        confirmLabel="Post count"
        busy={act.isPending}
        onConfirm={() => act.mutate('post')}
        onClose={() => setConfirm(null)}
      />
      <ConfirmAction
        open={confirm === 'cancel'}
        title="Cancel this count?"
        description={<p>No stock changes. The lines are kept for the record.</p>}
        confirmLabel="Cancel count"
        destructive
        busy={act.isPending}
        onConfirm={() => act.mutate('cancel')}
        onClose={() => setConfirm(null)}
      />
      <ConfirmAction
        open={Boolean(confirm?.line)}
        title="Remove this line?"
        description={<p>{confirm?.line?.name}</p>}
        confirmLabel="Remove"
        destructive
        busy={act.isPending}
        onConfirm={() => act.mutate(confirm)}
        onClose={() => setConfirm(null)}
      />
    </div>
  );
}

/** One count line. Edits are local until the field loses focus (or Enter). */
function LineRow({ line, locked, onSave, onRemove }) {
  const [qty, setQty] = useState(line.countedQty == null ? '' : String(line.countedQty));
  const [reason, setReason] = useState(line.reason ?? '');
  const shown = qty === '' ? null : Number(qty);
  const diff = shown == null || Number.isNaN(shown) ? null : shown - line.expectedQty;
  const value = parseFloat(line.varianceValue) || 0;

  const commitQty = () => {
    const next = qty === '' ? null : Number(qty);
    if (next === line.countedQty) return;
    if (next != null && (!Number.isInteger(next) || next < 0)) {
      toast.error('Counted quantity must be a whole number, 0 or more');
      setQty(line.countedQty == null ? '' : String(line.countedQty));
      return;
    }
    onSave({ countedQty: next });
  };
  const commitReason = () => {
    if ((reason.trim() || null) !== (line.reason || null)) onSave({ reason });
  };
  const enter = (e) => e.key === 'Enter' && e.currentTarget.blur();

  return (
    <tr className="border-t border-border">
      <td className="px-4 py-2">
        <p className="font-medium text-foreground">{line.name}</p>
        <p className="text-xs text-muted-foreground">{line.sku || '—'}</p>
      </td>
      <td className="px-3 py-2 text-right">{line.expectedQty}</td>
      <td className="px-3 py-2 text-right">
        {locked ? (
          line.countedQty ?? '—'
        ) : (
          <Input
            type="number"
            min={0}
            inputMode="numeric"
            aria-label={`Counted ${line.name}`}
            value={qty}
            placeholder="—"
            onChange={(e) => setQty(e.target.value)}
            onBlur={commitQty}
            onKeyDown={enter}
            className="ml-auto h-9 w-20 text-right"
          />
        )}
      </td>
      <td className={cn('px-3 py-2 text-right font-semibold', diff == null ? 'text-muted-foreground' : tone(diff))}>
        {diff == null ? '—' : signed(diff)}
      </td>
      {locked && <td className={cn('px-3 py-2 text-right', tone(value))}>{QAR(value)}</td>}
      <td className="px-3 py-2">
        {locked ? (
          line.reason || '—'
        ) : (
          <Input
            value={reason}
            placeholder="optional"
            onChange={(e) => setReason(e.target.value)}
            onBlur={commitReason}
            onKeyDown={enter}
            className="h-9 min-w-[8rem]"
          />
        )}
      </td>
      {!locked && (
        <td className="px-2 py-2 text-right">
          <Button variant="ghost" size="icon" aria-label="Remove line" onClick={onRemove}>
            <Trash2 className="size-4" />
          </Button>
        </td>
      )}
    </tr>
  );
}

/* ---------------------------- Variance report ---------------------------- */

function VarianceReport({ tabBar }) {
  const [from, setFrom] = useState(() => daysAgo(30));
  const [to, setTo] = useState(today);
  const [locationId, setLocationId] = useState(ALL);
  const locs = useQuery(locationsQuery);
  const q = useQuery(varianceReportQuery({ from, to, locationId: locationId === ALL ? '' : locationId }));
  const d = q.data;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Stock Counts"
        subtitle="Shrinkage and surplus found by posted counts, valued at cost."
        onRefresh={() => q.refetch()}
        refreshing={q.isFetching}
      />
      {tabBar}

      <div className="no-print mb-4 grid gap-2 sm:grid-cols-3">
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
      </div>

      {q.isPending ? (
        <LoadingRows />
      ) : q.isError ? (
        <ErrorState section="Variance report" message={q.error.message} onRetry={() => q.refetch()} />
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Counts posted" value={d.totalCounts} />
            <Stat label="Shrinkage (loss)" value={QAR(d.totalShrinkageValue)} className="text-destructive" />
            <Stat label="Surplus (found)" value={QAR(d.totalSurplusValue)} className="text-emerald-700" />
            <Stat label="Net" value={QAR(d.netVarianceValue)} className={tone(d.netVarianceValue)} />
          </div>

          <h2 className="mb-2 text-base font-semibold text-foreground">By location</h2>
          {!d.byLocation?.length ? (
            <EmptyState title="No posted counts in this period" />
          ) : (
            <div className="card-surface mb-6 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Location</th>
                    <th className="px-3 py-3 text-right">Counts</th>
                    <th className="px-3 py-3 text-right">Shrinkage</th>
                    <th className="px-3 py-3 text-right">Surplus</th>
                  </tr>
                </thead>
                <tbody>
                  {d.byLocation.map((r) => (
                    <tr key={r.locationId} className="border-t border-border">
                      <td className="px-4 py-3 font-medium text-foreground">{r.locationName}</td>
                      <td className="px-3 py-3 text-right">{r.counts}</td>
                      <td className="px-3 py-3 text-right text-destructive">{QAR(r.shrinkageValue)}</td>
                      <td className="px-3 py-3 text-right text-emerald-700">{QAR(r.surplusValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h2 className="mb-2 text-base font-semibold text-foreground">Biggest losses</h2>
          {!d.topLoss?.length ? (
            <EmptyState title="No losses found" />
          ) : (
            <div className="card-surface overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Item</th>
                    <th className="px-3 py-3 text-right">Units</th>
                    <th className="px-3 py-3 text-right">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {d.topLoss.map((r, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">{r.name}</p>
                        <p className="text-xs text-muted-foreground">{r.sku || '—'}</p>
                      </td>
                      <td className="px-3 py-3 text-right text-destructive">−{r.totalQty}</td>
                      <td className="px-3 py-3 text-right text-destructive">{QAR(r.totalValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, className }) {
  return (
    <div className="card-surface p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-sm font-semibold text-primary sm:text-lg', className)}>{value}</p>
    </div>
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
