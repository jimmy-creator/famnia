import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Loader2, Pause, Pencil, Play, Plus, Search, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';

import { EmptyState, ErrorState, LoadingRows, PageHeader } from '@/hub/components/shared';
import { deleteOffer, offersQuery, productNamesQuery, saveOffer } from '@/hub/lib/apiStore';
import { QAR } from '@/hub/lib/format';
import { useHubTitle } from '@/hub/lib/useHubTitle';
import { STORE_TZ } from '@/lib/storeTime';
import { cn } from '@/lib/utils';
import { Badge } from '@/hub/ui/badge';
import { Button } from '@/hub/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/hub/ui/dialog';
import { Input } from '@/hub/ui/input';
import { Label } from '@/hub/ui/label';
import { Switch } from '@/hub/ui/switch';

/** 'YYYY-MM-DDTHH:mm' on the store's clock, for <input type="datetime-local">. */
function toLocalInput(value) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: STORE_TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(value)).map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
const today = () => toLocalInput(Date.now()).slice(0, 10);

const fmt = (d) =>
  new Date(d).toLocaleString('en-GB', {
    timeZone: STORE_TZ, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });

function statusOf(o, now = Date.now()) {
  if (!o.active) return { label: 'Paused', variant: 'secondary' };
  if (new Date(o.endsAt).getTime() <= now) return { label: 'Ended', variant: 'outline' };
  if (new Date(o.startsAt).getTime() > now) return { label: 'Scheduled', variant: 'secondary' };
  return { label: 'Running now', variant: 'default' };
}

const discountText = (o) => (o.discountType === 'percent' ? `${o.discountValue}% off` : 'Own price per product');

/** Offers & sales (/hub/offers): timed offer prices on the online store. */
export default function OffersPage() {
  useHubTitle('Offers & Sales — FEMNIA Hub');
  const qc = useQueryClient();
  const offers = useQuery(offersQuery);
  const [editing, setEditing] = useState(null);

  const refresh = () => qc.invalidateQueries({ queryKey: offersQuery.queryKey });
  const toggle = useMutation({
    mutationFn: (o) => saveOffer(o.id, { active: !o.active }),
    onSuccess: (o) => {
      toast.success(o.active ? 'Offer resumed' : 'Offer paused — normal prices are back on the website');
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (o) => deleteOffer(o.id),
    onSuccess: () => {
      toast.success('Offer deleted');
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  const rows = offers.data ?? [];

  return (
    <div>
      <PageHeader
        title="Offers & Sales"
        subtitle="Offer prices for a day or a date range. While an offer runs, the website shows the offer price with the normal price struck through, and charges it at checkout."
        actions={
          <>
            <Button variant="outline" size="sm" className="h-10" asChild>
              <a href="/products?offer=1" target="_blank" rel="noopener">
                <ExternalLink className="mr-2 size-4" /> See offers on the website
              </a>
            </Button>
            <Button size="sm" className="h-10" onClick={() => setEditing({})}>
              <Plus className="mr-2 size-4" /> New offer
            </Button>
          </>
        }
      />

      {offers.isPending ? (
        <LoadingRows />
      ) : offers.isError ? (
        <ErrorState section="Offers" message={offers.error?.message} onRetry={() => offers.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No offers yet"
          hint="Create one for a special day — e.g. National Day, 20% off chosen products from 18 Dec 00:00 to 23:59."
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {rows.map((o) => {
            const s = statusOf(o);
            return (
              <div key={o.id} className="card-surface flex flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{o.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {fmt(o.startsAt)} → {fmt(o.endsAt)}
                    </p>
                  </div>
                  <Badge variant={s.variant}>{s.label}</Badge>
                </div>
                <p className="text-sm">
                  <span className="font-medium">{discountText(o)}</span> · {o.items.length} product{o.items.length === 1 ? '' : 's'}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {o.items.slice(0, 6).map((i) => (
                    <span key={i.productId} className="rounded-full bg-secondary px-2.5 py-1 text-xs">
                      {i.name}
                      {o.discountType === 'price' && i.price != null ? ` · ${QAR(i.price)}` : ''}
                    </span>
                  ))}
                  {o.items.length > 6 && <span className="px-1 py-1 text-xs text-muted-foreground">+{o.items.length - 6} more</span>}
                </div>
                <div className="mt-auto flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditing(o)}>
                    <Pencil className="mr-1.5 size-3.5" /> Edit
                  </Button>
                  {s.label !== 'Ended' && (
                    <Button variant="outline" size="sm" disabled={toggle.isPending} onClick={() => toggle.mutate(o)}>
                      {o.active ? <Pause className="mr-1.5 size-3.5" /> : <Play className="mr-1.5 size-3.5" />}
                      {o.active ? 'Pause' : 'Resume'}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive"
                    disabled={remove.isPending}
                    onClick={() => window.confirm(`Delete the offer "${o.name}"?`) && remove.mutate(o)}
                  >
                    <Trash2 className="mr-1.5 size-3.5" /> Delete
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={Boolean(editing)} onOpenChange={(v) => !v && setEditing(null)}>
        {editing && <OfferForm key={editing.id ?? 'new'} initial={editing} onDone={() => setEditing(null)} />}
      </Dialog>
    </div>
  );
}

function OfferForm({ initial, onDone }) {
  const qc = useQueryClient();
  const products = useQuery(productNamesQuery);
  const isNew = !initial.id;

  const [name, setName] = useState(initial.name ?? '');
  // One day is the common case (a special day); a range covers longer sales.
  const startInit = initial.startsAt ? toLocalInput(initial.startsAt) : `${today()}T00:00`;
  const endInit = initial.endsAt ? toLocalInput(initial.endsAt) : `${today()}T23:59`;
  const [oneDay, setOneDay] = useState(
    isNew || (startInit.slice(0, 10) === endInit.slice(0, 10) && startInit.endsWith('00:00') && endInit.endsWith('23:59')),
  );
  const [day, setDay] = useState(startInit.slice(0, 10));
  const [startsAt, setStartsAt] = useState(startInit);
  const [endsAt, setEndsAt] = useState(endInit);
  const [discountType, setDiscountType] = useState(initial.discountType ?? 'percent');
  const [discountValue, setDiscountValue] = useState(initial.discountValue != null ? String(initial.discountValue) : '');
  const [active, setActive] = useState(initial.active ?? true);
  const [items, setItems] = useState(() =>
    (initial.items ?? []).map((i) => ({ ...i, price: i.price != null ? String(i.price) : '' })),
  );
  const [search, setSearch] = useState('');

  const byId = useMemo(() => new Map((products.data ?? []).map((p) => [p.id, p])), [products.data]);
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    const chosen = new Set(items.map((i) => i.productId));
    return (products.data ?? [])
      .filter((p) => !chosen.has(p.id) && p.active !== false)
      .filter((p) =>
        [p.name, p.barcode, p.code, p.category].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)),
      )
      .slice(0, 10);
  }, [products.data, search, items]);

  const listPrice = (i) => parseFloat(byId.get(i.productId)?.price ?? i.listPrice) || 0;
  const pct = parseFloat(discountValue) || 0;
  const offerPriceOf = (i) =>
    discountType === 'percent' ? Math.round(listPrice(i) * (1 - pct / 100) * 100) / 100 : parseFloat(i.price) || 0;

  const add = (p) => {
    setItems((prev) => [
      ...prev,
      { productId: p.id, name: p.name, productCode: p.barcode ?? null, listPrice: parseFloat(p.price) || 0, price: '' },
    ]);
    setSearch('');
  };
  // A whole category in one go, e.g. "all Kaftans".
  const categoryHits = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 3) return [];
    const chosen = new Set(items.map((i) => i.productId));
    return (products.data ?? []).filter(
      (p) => !chosen.has(p.id) && p.active !== false && String(p.category ?? '').toLowerCase().includes(q),
    );
  }, [products.data, search, items]);

  const save = useMutation({
    mutationFn: () =>
      saveOffer(initial.id, {
        name,
        startsAt: oneDay ? `${day}T00:00` : startsAt,
        endsAt: oneDay ? `${day}T23:59` : endsAt,
        discountType,
        discountValue: discountType === 'percent' ? pct : null,
        items: items.map((i) => ({ productId: i.productId, ...(discountType === 'price' ? { price: parseFloat(i.price) } : {}) })),
        active,
      }),
    onSuccess: () => {
      toast.success(isNew ? 'Offer created' : 'Offer saved');
      qc.invalidateQueries({ queryKey: offersQuery.queryKey });
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{isNew ? 'New offer' : `Edit offer · ${initial.name}`}</DialogTitle>
        <DialogDescription>
          Offer prices show and apply on the website only. Hub orders keep the normal price, with a one-click “use
          website offer” for customers who saw it online.
        </DialogDescription>
      </DialogHeader>

      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="offer-name">Offer name</Label>
          <Input id="offer-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="National Day Sale" required />
          <p className="text-xs text-muted-foreground">Shown to customers on the product page.</p>
        </div>

        <section className="space-y-3 rounded-2xl border border-border p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">When</h3>
            <div className="inline-flex rounded-xl border border-border bg-card p-1">
              {[
                [true, 'One day'],
                [false, 'From – to'],
              ].map(([v, label]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setOneDay(v)}
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-sm font-medium',
                    oneDay === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {oneDay ? (
            <div className="space-y-2">
              <Label htmlFor="offer-day">Day</Label>
              <Input id="offer-day" type="date" value={day} onChange={(e) => setDay(e.target.value)} required />
              <p className="text-xs text-muted-foreground">Runs the whole day, 00:00 to 23:59 Qatar time.</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="offer-from">From</Label>
                <Input id="offer-from" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="offer-to">To</Label>
                <Input id="offer-to" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} required />
              </div>
            </div>
          )}
        </section>

        <section className="space-y-3 rounded-2xl border border-border p-4">
          <h3 className="text-sm font-semibold">Offer price</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              ['percent', '% off every product'],
              ['price', 'Set a price per product'],
            ].map(([v, label]) => (
              <Button key={v} type="button" variant={discountType === v ? 'default' : 'outline'} onClick={() => setDiscountType(v)}>
                {label}
              </Button>
            ))}
          </div>
          {discountType === 'percent' && (
            <div className="max-w-40 space-y-2">
              <Label htmlFor="offer-pct">Discount %</Label>
              <Input
                id="offer-pct"
                type="number"
                min="1"
                max="99"
                step="0.01"
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                required
              />
            </div>
          )}
        </section>

        <section className="space-y-3 rounded-2xl border border-border p-4">
          <h3 className="text-sm font-semibold">Products ({items.length})</h3>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, product code or category"
              className="pl-9"
            />
          </div>
          {search.trim() && (
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-border p-1">
              {products.isPending && <p className="p-2 text-xs text-muted-foreground">Loading products…</p>}
              {categoryHits.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    categoryHits.forEach(add);
                  }}
                  className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-primary hover:bg-secondary/60"
                >
                  + Add all {categoryHits.length} products in categories matching “{search.trim()}”
                </button>
              )}
              {matches.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => add(p)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-secondary/60"
                >
                  <span className="min-w-0 truncate">
                    {p.barcode && <span className="font-mono text-xs text-primary">{p.barcode} </span>}
                    {p.name}
                    {p.category && <span className="text-xs text-muted-foreground"> · {p.category}</span>}
                  </span>
                  <span className="shrink-0 text-xs font-medium">{QAR(p.price)}</span>
                </button>
              ))}
              {!products.isPending && !matches.length && <p className="p-2 text-xs text-muted-foreground">No product matches.</p>}
            </div>
          )}

          {items.length > 0 && (
            <div className="space-y-2">
              {items.map((i, idx) => (
                <div key={i.productId} className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{i.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {i.productCode ? `${i.productCode} · ` : ''}Normal {QAR(listPrice(i))}
                      {discountType === 'percent' && pct > 0 && (
                        <span className="font-medium text-primary"> → Offer {QAR(offerPriceOf(i))}</span>
                      )}
                    </p>
                  </div>
                  {discountType === 'price' && (
                    <div className="w-32">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={i.price}
                        placeholder="Offer price"
                        aria-label={`Offer price for ${i.name}`}
                        onChange={(e) =>
                          setItems((prev) => prev.map((x, k) => (k === idx ? { ...x, price: e.target.value } : x)))
                        }
                        className={cn(i.price !== '' && parseFloat(i.price) >= listPrice(i) && 'border-destructive')}
                        required
                      />
                    </div>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${i.name}`}
                    onClick={() => setItems((prev) => prev.filter((_, k) => k !== idx))}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            The offer covers every size and colour of a product. If two offers include the same product at the same
            time, the lower price wins — they never stack. Coupons still apply on top of offer prices.
          </p>
        </section>

        <label className="flex items-center gap-3 text-sm">
          <Switch checked={active} onCheckedChange={setActive} />
          Active — turn off to pause the offer without deleting it
        </label>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            {isNew ? 'Create offer' : 'Save offer'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
