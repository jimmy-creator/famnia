import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Link2, PackageCheck, Plus, Printer, Trash2, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { EmptyState, ErrorState, LoadingRows, PageHeader } from '@/hub/components/shared';
import { Button } from '@/hub/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/hub/ui/dialog';
import { Input } from '@/hub/ui/input';
import { Switch } from '@/hub/ui/switch';
import { Textarea } from '@/hub/ui/textarea';
import { accessQuery, productsQuery, qk } from '@/hub/lib/api';
import {
  allSuppliersQuery,
  cancelPurchaseOrder,
  cancelPurchaseReturn,
  cashAccountsQuery,
  createPurchaseReturn,
  deleteSupplier,
  linkSupplierProducts,
  locationsQuery,
  payPurchaseOrder,
  pk,
  poPdfUrl,
  purchaseOrderQuery,
  purchaseOrdersQuery,
  purchaseReturnQuery,
  purchaseReturnsQuery,
  receivePurchaseOrder,
  returnPdfUrl,
  returnablePosQuery,
  savePurchaseOrder,
  saveSupplier,
  sendPurchaseOrder,
  supplierProductsQuery,
  supplierStatementQuery,
} from '@/hub/lib/apiPurchasing';
import { QAR, downloadFile, toCsv, today } from '@/hub/lib/format';
import { useHubTitle } from '@/hub/lib/useHubTitle';
import { cn } from '@/lib/utils';
import { PRICE_STEP } from '@/utils/currency';

const MULTILOC = import.meta.env.VITE_FEATURE_MULTILOC === 'true';
const SELECT = 'h-11 w-full rounded-xl border border-input bg-background px-3 text-sm';
const num = (v) => parseFloat(v) || 0;
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const lineKey = (productId, variantIndex) => `${productId}:${variantIndex ?? 'base'}`;
/** /hub/skus row → { productId, variantIndex } (the key is `productId:variantIndex|base`). */
const fromSku = (sku) => {
  const [pid, vi] = String(sku.key).split(':');
  return { productId: parseInt(pid, 10), variantIndex: vi === 'base' ? null : parseInt(vi, 10) };
};
const skuName = (sku) => [sku.name, sku.size, sku.color].filter(Boolean).join(' · ');
const activeOnly = (rows) => (rows ?? []).filter((r) => r.active !== false && r.isActive !== false);
const pdf = (url) => window.open(url, '_blank', 'noopener');

const TINTS = {
  draft: 'bg-muted text-muted-foreground border-border',
  sent: 'tint-lavender text-[var(--tint-lavender-ink)]',
  partial: 'tint-peach text-[var(--tint-peach-ink)]',
  unpaid: 'tint-rose text-[var(--tint-rose-ink)]',
  received: 'tint-mint text-[var(--tint-mint-ink)]',
  paid: 'tint-mint text-[var(--tint-mint-ink)]',
  completed: 'tint-mint text-[var(--tint-mint-ink)]',
  cancelled: 'tint-rose text-[var(--tint-rose-ink)]',
  inactive: 'bg-muted text-muted-foreground border-border',
};
function Pill({ value, label }) {
  return (
    <span className={cn('inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize', TINTS[value] ?? TINTS.draft)}>
      {label ?? String(value ?? '').replace(/_/g, ' ')}
    </span>
  );
}

function Field({ label, hint, className, children }) {
  return (
    <label className={cn('grid gap-1.5 text-sm', className)}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div className="rounded-xl border border-border bg-secondary/30 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('font-semibold', tone === 'warn' && 'text-amber-700', tone === 'good' && 'text-emerald-700')}>{value}</p>
    </div>
  );
}

function ConfirmDialog({ open, title, body, confirmLabel, destructive, busy, onConfirm, onClose }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="z-[80] max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {body && <DialogDescription>{body}</DialogDescription>}
        </DialogHeader>
        <div className="flex justify-end gap-2">
          <Button variant="outline" className="h-10" onClick={onClose} disabled={busy}>
            Back
          </Button>
          <Button variant={destructive ? 'destructive' : 'default'} className="h-10" onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Search the SKU list by code, SKU or name; Enter on an exact code/SKU adds it straight away. */
function SkuSearch({ onPick, placeholder = 'Scan or search Product Code, SKU or name…' }) {
  const skus = useQuery(productsQuery);
  const [term, setTerm] = useState('');
  const matches = useMemo(() => {
    const q = term.trim().toLowerCase();
    if (!q) return [];
    return (skus.data ?? [])
      .filter((s) => s.isActive !== false)
      .filter((s) => `${s.productCode ?? ''} ${s.sku} ${s.name} ${s.size ?? ''} ${s.color ?? ''}`.toLowerCase().includes(q))
      .slice(0, 30);
  }, [skus.data, term]);
  const pick = (s) => {
    onPick(s);
    setTerm('');
  };
  return (
    <div className="space-y-2">
      <Input
        className="h-11"
        placeholder={skus.isLoading ? 'Loading products…' : placeholder}
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          const q = term.trim().toLowerCase();
          const exact = (skus.data ?? []).find(
            (s) => String(s.productCode ?? '').toLowerCase() === q || String(s.sku ?? '').toLowerCase() === q,
          );
          if (exact) pick(exact);
          else if (matches.length === 1) pick(matches[0]);
        }}
      />
      {term.trim() && (
        <div className="max-h-56 overflow-y-auto rounded-2xl border border-border">
          {matches.length === 0 && <p className="p-3 text-sm text-muted-foreground">No product matches.</p>}
          {matches.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => pick(s)}
              className="flex w-full items-center justify-between gap-3 border-b border-border px-3 py-2.5 text-left text-sm last:border-b-0 hover:bg-secondary/60"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{skuName(s)}</span>
                <span className="block text-xs text-muted-foreground">
                  {s.productCode ? `${s.productCode} · ` : ''}
                  {s.sku}
                </span>
              </span>
              <span className="shrink-0 text-right text-xs text-muted-foreground">
                Stock <strong className="text-foreground">{s.currentStock}</strong>
                {num(s.costPrice) > 0 && <span className="block">Cost {QAR(s.costPrice)}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════ Purchase orders ═══════════════════════════════ */

const PO_STATUSES = ['draft', 'sent', 'partial', 'received', 'cancelled'];
const PAY_METHODS = ['cash', 'bank', 'card', 'cheque', 'other'];
const outstandingOf = (po) => Math.max(0, +(num(po.totalAmount) - num(po.amountPaid)).toFixed(2));

function poTotals(lines, shipping, discount) {
  const subtotal = lines.reduce((s, l) => s + num(l.unitCost) * num(l.orderedQty), 0);
  const tax = lines.reduce((s, l) => s + num(l.unitCost) * num(l.orderedQty) * (num(l.taxRate) / 100), 0);
  return { subtotal, tax, total: subtotal + tax + num(shipping) - num(discount) };
}
function landedUnit(line, subtotal, shipping) {
  const qty = num(line.orderedQty);
  if (!qty) return 0;
  const value = num(line.unitCost) * qty;
  const lineTotal = value * (1 + num(line.taxRate) / 100);
  const shipShare = subtotal > 0 ? (num(shipping) * value) / subtotal : 0;
  return (lineTotal + shipShare) / qty;
}

/** The supplier's products (bought before or linked), with one-tap and below-reorder bulk add. */
function SupplierQuickAdd({ supplierId, locationId, existing, onAdd }) {
  const [open, setOpen] = useState(false);
  const rows = useQuery({ ...supplierProductsQuery(supplierId, locationId), enabled: open && Boolean(supplierId) });
  const toLine = (r) => ({
    productId: r.productId,
    variantIndex: r.variantIndex,
    name: r.name,
    orderedQty: Math.max(1, num(r.reorderQty) || num(r.reorderLevel) - num(r.stock) + 1),
    unitCost: num(r.lastCost) || num(r.costPrice),
    taxRate: 0,
  });
  const low = (rows.data ?? []).filter((r) => r.reorderLevel != null && num(r.stock) <= num(r.reorderLevel));
  return (
    <div className="rounded-2xl border border-border bg-secondary/20 p-3">
      <button type="button" className="text-sm font-medium text-primary" onClick={() => setOpen(!open)}>
        {open ? 'Hide' : 'Show'} this supplier&apos;s products
      </button>
      {open &&
        (rows.isLoading ? (
          <LoadingRows count={2} />
        ) : !rows.data?.length ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Nothing bought from or linked to this supplier yet. Search below to add lines.
          </p>
        ) : (
          <div className="mt-2 space-y-2">
            {low.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="h-9"
                onClick={() => onAdd(low.filter((r) => !existing.has(lineKey(r.productId, r.variantIndex))).map(toLine))}
              >
                Add all below reorder level ({low.length})
              </Button>
            )}
            <ul className="max-h-56 divide-y divide-border overflow-y-auto rounded-xl border border-border bg-card">
              {rows.data.map((r) => {
                const added = existing.has(lineKey(r.productId, r.variantIndex));
                const isLow = r.reorderLevel != null && num(r.stock) <= num(r.reorderLevel);
                return (
                  <li key={lineKey(r.productId, r.variantIndex)} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{r.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.code ? `${r.code} · ` : ''}stock{' '}
                        <span className={cn(isLow && 'font-semibold text-amber-700')}>{r.stock}</span>
                        {r.reorderLevel != null ? ` / reorder ${r.reorderLevel}` : ''}
                        {r.lastCost != null ? ` · last ${QAR(r.lastCost)} on ${fmtDate(r.lastBoughtAt)}` : ''}
                      </p>
                    </div>
                    <Button size="sm" variant="ghost" className="h-8" disabled={added} onClick={() => onAdd([toLine(r)])}>
                      {added ? 'Added' : 'Add'}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
    </div>
  );
}

/** Create or edit a PO. Mounted with a key so the form starts from the PO it edits. */
function PoEditor({ po, suppliers, locations, onClose, onSaved }) {
  const client = useQueryClient();
  const [supplierId, setSupplierId] = useState(po?.supplierId ? String(po.supplierId) : '');
  const [locationId, setLocationId] = useState(String(po?.locationId ?? locations[0]?.id ?? ''));
  const [expectedDate, setExpectedDate] = useState(po?.expectedDate ? String(po.expectedDate).slice(0, 10) : '');
  const [shipping, setShipping] = useState(po ? num(po.shippingCost) : 0);
  const [discount, setDiscount] = useState(po ? num(po.discount) : 0);
  const [notes, setNotes] = useState(po?.notes ?? '');
  const [lines, setLines] = useState(() =>
    (po?.items ?? []).map((it) => ({
      productId: it.productId,
      variantIndex: it.variantIndex ?? null,
      name: it.name,
      orderedQty: it.orderedQty,
      unitCost: num(it.unitCost),
      taxRate: num(it.taxRate),
    })),
  );
  const existing = useMemo(() => new Set(lines.map((l) => lineKey(l.productId, l.variantIndex))), [lines]);
  const totals = poTotals(lines, shipping, discount);
  const editingSent = po?.status === 'sent';

  const addLines = (next) =>
    setLines((cur) => {
      const out = [...cur];
      for (const n of next) {
        const i = out.findIndex((l) => lineKey(l.productId, l.variantIndex) === lineKey(n.productId, n.variantIndex));
        if (i >= 0) out[i] = { ...out[i], orderedQty: num(out[i].orderedQty) + 1 };
        else out.push(n);
      }
      return out;
    });
  const setLine = (i, patch) => setLines((cur) => cur.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const save = useMutation({
    mutationFn: (status) =>
      savePurchaseOrder(po?.id, {
        supplierId: parseInt(supplierId, 10),
        locationId: parseInt(locationId, 10),
        items: lines.map((l) => ({
          productId: l.productId,
          variantIndex: l.variantIndex,
          name: l.name,
          orderedQty: parseInt(l.orderedQty, 10),
          unitCost: num(l.unitCost),
          taxRate: num(l.taxRate),
        })),
        shippingCost: num(shipping),
        discount: num(discount),
        expectedDate: expectedDate || null,
        notes,
        status,
      }),
    onSuccess: async (saved, status) => {
      toast.success(`${saved?.poNumber ?? 'Purchase order'} ${po ? 'updated' : status === 'sent' ? 'saved and sent' : 'saved as draft'}.`);
      await client.invalidateQueries({ queryKey: pk.all });
      onSaved(saved);
    },
    onError: (e) => toast.error(e.message),
  });

  const invalid =
    !supplierId ? 'Choose a supplier.'
    : !locationId ? 'Choose the receiving location.'
    : lines.length === 0 ? 'Add at least one line.'
    : lines.some((l) => !(parseInt(l.orderedQty, 10) > 0)) ? 'Every line needs a quantity of 1 or more.'
    : lines.some((l) => num(l.unitCost) < 0) ? 'Unit costs cannot be negative.'
    : null;

  const supplierOptions = suppliers.filter((s) => s.active !== false || String(s.id) === supplierId);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="z-[70] max-h-[92vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{po ? `Edit ${po.poNumber}` : 'New purchase order'}</DialogTitle>
          <DialogDescription>Costs are what you pay the supplier; tax and shipping roll into each line&apos;s landed cost.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Supplier">
            <select className={SELECT} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">Choose supplier…</option>
              {supplierOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.code ? ` (${s.code})` : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Receive at">
            <select className={SELECT} value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Expected date">
            <Input className="h-11" type="date" value={expectedDate} min={today()} onChange={(e) => setExpectedDate(e.target.value)} />
          </Field>
        </div>

        {supplierId && (
          <SupplierQuickAdd key={supplierId} supplierId={supplierId} locationId={locationId} existing={existing} onAdd={addLines} />
        )}

        <SkuSearch
          onPick={(s) =>
            addLines([{ ...fromSku(s), name: skuName(s), orderedQty: 1, unitCost: num(s.costPrice), taxRate: 0 }])
          }
        />

        {lines.length === 0 ? (
          <EmptyState title="No lines yet" hint="Search above, or open this supplier's products." />
        ) : (
          <div className="grid gap-2">
            {lines.map((l, i) => (
              <div key={lineKey(l.productId, l.variantIndex)} className="rounded-2xl border border-border bg-card p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 text-sm font-medium">{l.name}</p>
                  <button
                    type="button"
                    aria-label="Remove line"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => setLines(lines.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                  <Field label="Qty">
                    <Input className="h-10" type="number" min="1" step="1" value={l.orderedQty} onChange={(e) => setLine(i, { orderedQty: e.target.value })} />
                  </Field>
                  <Field label="Unit cost">
                    <Input className="h-10" type="number" min="0" step={PRICE_STEP} value={l.unitCost} onChange={(e) => setLine(i, { unitCost: e.target.value })} />
                  </Field>
                  <Field label="Tax %">
                    <Input className="h-10" type="number" min="0" step="0.01" value={l.taxRate} onChange={(e) => setLine(i, { taxRate: e.target.value })} />
                  </Field>
                  <div className="grid gap-1.5 text-sm">
                    <span className="text-xs font-medium text-muted-foreground">Line total</span>
                    <span className="flex h-10 items-center font-medium">
                      {QAR(num(l.unitCost) * num(l.orderedQty) * (1 + num(l.taxRate) / 100))}
                    </span>
                  </div>
                  <div className="grid gap-1.5 text-sm">
                    <span className="text-xs font-medium text-muted-foreground">Landed / unit</span>
                    <span className="flex h-10 items-center font-semibold text-primary">
                      {QAR(landedUnit(l, totals.subtotal, shipping))}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Shipping">
              <Input className="h-11" type="number" min="0" step={PRICE_STEP} value={shipping} onChange={(e) => setShipping(e.target.value)} />
            </Field>
            <Field label="Discount">
              <Input className="h-11" type="number" min="0" step={PRICE_STEP} value={discount} onChange={(e) => setDiscount(e.target.value)} />
            </Field>
            <Field label="Notes" className="col-span-2">
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>
          <dl className="grid content-start gap-1.5 rounded-2xl border border-border bg-secondary/30 p-4 text-sm">
            {[
              ['Subtotal', totals.subtotal],
              ['Tax', totals.tax],
              ['Shipping', num(shipping)],
              ['Discount', -num(discount)],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <dt className="text-muted-foreground">{k}</dt>
                <dd>{QAR(v)}</dd>
              </div>
            ))}
            <div className="mt-1 flex justify-between border-t border-border pt-2 text-base font-semibold">
              <dt>Total</dt>
              <dd>{QAR(totals.total)}</dd>
            </div>
          </dl>
        </div>

        {invalid && <p className="text-xs text-muted-foreground">{invalid}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" className="h-11" onClick={onClose} disabled={save.isPending}>
            Close
          </Button>
          {editingSent ? (
            <Button className="h-11" disabled={Boolean(invalid) || save.isPending} onClick={() => save.mutate('sent')}>
              Save changes
            </Button>
          ) : (
            <>
              <Button variant="outline" className="h-11" disabled={Boolean(invalid) || save.isPending} onClick={() => save.mutate('draft')}>
                Save as draft
              </Button>
              <Button className="h-11" disabled={Boolean(invalid) || save.isPending} onClick={() => save.mutate('sent')}>
                Save &amp; send
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Receive full or partial quantities against the PO's outstanding lines. */
function ReceivePanel({ po, onDone, onCancel }) {
  const client = useQueryClient();
  const items = po.items ?? [];
  const [qty, setQty] = useState(() => items.map((it) => Math.max(0, num(it.orderedQty) - num(it.receivedQty))));
  const [notes, setNotes] = useState('');
  const run = useMutation({
    mutationFn: () =>
      receivePurchaseOrder(po.id, {
        items: items
          .map((it, i) => ({ productId: it.productId, variantIndex: it.variantIndex ?? null, quantity: parseInt(qty[i], 10) || 0 }))
          .filter((it) => it.quantity > 0),
        notes,
      }),
    onSuccess: async (res) => {
      toast.success(`Stock received${res?.grnNumber ? ` · ${res.grnNumber}` : ''}.`);
      await Promise.all([pk.all, qk.products, qk.stockIn].map((queryKey) => client.invalidateQueries({ queryKey })));
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });
  const total = qty.reduce((s, q) => s + (parseInt(q, 10) || 0), 0);
  return (
    <div className="grid gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-4">
      <p className="text-sm font-semibold">Receive stock at {po.Location?.name}</p>
      {items.map((it, i) => {
        const left = Math.max(0, num(it.orderedQty) - num(it.receivedQty));
        return (
          <div key={lineKey(it.productId, it.variantIndex)} className="flex items-center gap-3 text-sm">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{it.name}</p>
              <p className="text-xs text-muted-foreground">
                ordered {it.orderedQty} · received {num(it.receivedQty)} · {left} to come
              </p>
            </div>
            <Input
              className="h-10 w-24"
              type="number"
              min="0"
              max={left}
              step="1"
              disabled={left === 0}
              value={qty[i]}
              onChange={(e) => {
                const v = Math.min(left, Math.max(0, parseInt(e.target.value, 10) || 0));
                setQty(qty.map((q, j) => (j === i ? v : q)));
              }}
            />
          </div>
        );
      })}
      <Field label="Notes (optional)">
        <Input className="h-10" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. 2 cartons short, rest next week" />
      </Field>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" className="h-10" onClick={onCancel} disabled={run.isPending}>
          Back
        </Button>
        <Button className="h-10" disabled={total === 0 || run.isPending} onClick={() => run.mutate()}>
          <PackageCheck className="mr-2 size-4" /> Receive {total} unit{total === 1 ? '' : 's'}
        </Button>
      </div>
    </div>
  );
}

function PayPanel({ po, onDone, onCancel }) {
  const client = useQueryClient();
  const accounts = useQuery(cashAccountsQuery);
  const outstanding = outstandingOf(po);
  const [amount, setAmount] = useState(outstanding);
  const [method, setMethod] = useState('bank');
  const [accountId, setAccountId] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const run = useMutation({
    mutationFn: () =>
      payPurchaseOrder(po.id, {
        amount: num(amount),
        paymentMethod: method,
        cashAccountId: accountId ? parseInt(accountId, 10) : undefined,
        reference: reference || undefined,
        notes: notes || undefined,
      }),
    onSuccess: async () => {
      toast.success(`Payment of ${QAR(amount)} recorded.`);
      await Promise.all([pk.all, qk.fundingAccounts].map((queryKey) => client.invalidateQueries({ queryKey })));
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });
  const account = (accounts.data ?? []).find((a) => String(a.id) === accountId);
  const short = account && num(account.balance) < num(amount);
  return (
    <div className="grid gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-4">
      <p className="text-sm font-semibold">Record a payment · outstanding {QAR(outstanding)}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Amount">
          <Input className="h-10" type="number" min="0" max={outstanding} step={PRICE_STEP} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Method">
          <select className={cn(SELECT, 'h-10 capitalize')} value={method} onChange={(e) => setMethod(e.target.value)}>
            {PAY_METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Paid from account"
          className="sm:col-span-2"
          hint={
            accounts.isError
              ? 'You cannot see cash accounts, so this payment is recorded without moving cash.'
              : short
                ? 'This account cannot cover the payment — the server will refuse it.'
                : undefined
          }
        >
          <select className={cn(SELECT, 'h-10')} value={accountId} disabled={accounts.isError} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Don&apos;t move cash (manual reconcile)</option>
            {(accounts.data ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {QAR(a.balance)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Reference">
          <Input className="h-10" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Cheque / transfer no." />
        </Field>
        <Field label="Notes">
          <Input className="h-10" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" className="h-10" onClick={onCancel} disabled={run.isPending}>
          Back
        </Button>
        <Button
          className="h-10"
          disabled={!(num(amount) > 0) || num(amount) > outstanding + 0.001 || run.isPending}
          onClick={() => run.mutate()}
        >
          <Wallet className="mr-2 size-4" /> Pay {QAR(amount)}
        </Button>
      </div>
    </div>
  );
}

function PoDetail({ id, isAdmin, onClose, onEdit }) {
  const client = useQueryClient();
  const q = useQuery(purchaseOrderQuery(id));
  const [panel, setPanel] = useState(null); // 'receive' | 'pay' | 'cancel'
  const refresh = () => client.invalidateQueries({ queryKey: pk.all });
  const send = useMutation({
    mutationFn: () => sendPurchaseOrder(id),
    onSuccess: async () => {
      toast.success('Marked as sent.');
      await refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const cancel = useMutation({
    mutationFn: () => cancelPurchaseOrder(id),
    onSuccess: async () => {
      toast.success('Purchase order cancelled.');
      setPanel(null);
      await refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  const po = q.data;
  const items = po?.items ?? [];
  const outstanding = po ? outstandingOf(po) : 0;
  const anyReceived = items.some((it) => num(it.receivedQty) > 0);
  const fullyReceived = items.length > 0 && items.every((it) => num(it.receivedQty) >= num(it.orderedQty));
  const editable = po && ['draft', 'sent'].includes(po.status);
  const canReceive = po && ['draft', 'sent', 'partial'].includes(po.status) && !fullyReceived;
  const paidUp = outstanding <= 0.001;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="z-[70] max-h-[92vh] max-w-3xl overflow-y-auto">
        {q.isLoading ? (
          <LoadingRows count={4} />
        ) : q.isError ? (
          <ErrorState section="the purchase order" message={q.error.message} onRetry={() => q.refetch()} />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2">
                {po.poNumber} <Pill value={po.status} /> <Pill value={po.paymentStatus} label={`payment ${po.paymentStatus}`} />
              </DialogTitle>
              <DialogDescription>
                {po.Supplier?.name} → {po.Location?.name} · created {fmtDate(po.createdAt)}
                {po.creator?.name ? ` by ${po.creator.name}` : ''}
                {po.expectedDate ? ` · expected ${fmtDate(po.expectedDate)}` : ''}
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Total" value={QAR(po.totalAmount)} />
              <Stat label="Paid" value={QAR(po.amountPaid)} tone={paidUp ? 'good' : undefined} />
              <Stat label="Outstanding" value={QAR(outstanding)} tone={paidUp ? 'good' : 'warn'} />
              <Stat label="Received" value={`${items.reduce((s, it) => s + num(it.receivedQty), 0)} / ${items.reduce((s, it) => s + num(it.orderedQty), 0)}`} />
            </div>

            {canReceive && !paidUp && (
              <p className="rounded-xl border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                No supplier credit: this PO can only be received once it is paid in full ({QAR(outstanding)} still to pay).
              </p>
            )}

            <div className="overflow-x-auto rounded-2xl border border-border">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="bg-secondary/60 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Item</th>
                    <th className="px-3 py-2 text-right">Ordered</th>
                    <th className="px-3 py-2 text-right">Received</th>
                    <th className="px-3 py-2 text-right">Unit cost</th>
                    <th className="px-3 py-2 text-right">Tax</th>
                    <th className="px-3 py-2 text-right">Landed / unit</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={lineKey(it.productId, it.variantIndex)} className="border-t border-border">
                      <td className="px-3 py-2">{it.name}</td>
                      <td className="px-3 py-2 text-right">{it.orderedQty}</td>
                      <td className={cn('px-3 py-2 text-right', num(it.receivedQty) >= num(it.orderedQty) && 'text-emerald-700')}>
                        {num(it.receivedQty)}
                      </td>
                      <td className="px-3 py-2 text-right">{QAR(it.unitCost)}</td>
                      <td className="px-3 py-2 text-right">{num(it.taxRate)}%</td>
                      <td className="px-3 py-2 text-right font-medium">
                        {it.landedUnitCost != null ? QAR(it.landedUnitCost) : QAR(landedUnit(it, num(po.subtotal), po.shippingCost))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <dl className="ml-auto grid w-full max-w-xs gap-1 text-sm">
              {[
                ['Subtotal', po.subtotal],
                ['Tax', po.taxAmount],
                ['Shipping', po.shippingCost],
                ['Discount', -num(po.discount)],
                ['Total', po.totalAmount],
              ].map(([k, v]) => (
                <div key={k} className={cn('flex justify-between', k === 'Total' && 'border-t border-border pt-1 font-semibold')}>
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd>{QAR(v)}</dd>
                </div>
              ))}
            </dl>
            {po.notes && <p className="text-sm text-muted-foreground">Notes: {po.notes}</p>}

            {panel === 'receive' && (
              <ReceivePanel key={`r-${po.updatedAt}`} po={po} onCancel={() => setPanel(null)} onDone={() => setPanel(null)} />
            )}
            {panel === 'pay' && <PayPanel key={`p-${po.updatedAt}`} po={po} onCancel={() => setPanel(null)} onDone={() => setPanel(null)} />}

            {panel === null && (
              <div className="flex flex-wrap gap-2">
                {po.status === 'draft' && (
                  <Button className="h-10" disabled={send.isPending} onClick={() => send.mutate()}>
                    Mark as sent
                  </Button>
                )}
                {editable && (
                  <Button variant="outline" className="h-10" onClick={() => onEdit(po)}>
                    Edit
                  </Button>
                )}
                {isAdmin && po.status !== 'cancelled' && outstanding > 0 && (
                  <Button variant="outline" className="h-10" onClick={() => setPanel('pay')}>
                    <Wallet className="mr-2 size-4" /> Record payment
                  </Button>
                )}
                {canReceive && (
                  <Button
                    className="h-10"
                    disabled={!paidUp}
                    title={paidUp ? undefined : 'Pay the PO in full first'}
                    onClick={() => setPanel('receive')}
                  >
                    <PackageCheck className="mr-2 size-4" /> Receive
                  </Button>
                )}
                <Button variant="outline" className="h-10" onClick={() => pdf(poPdfUrl(po.id))}>
                  <Printer className="mr-2 size-4" /> Print / PDF
                </Button>
                {isAdmin && editable && !anyReceived && (
                  <Button variant="outline" className="h-10 border-destructive/40 text-destructive" onClick={() => setPanel('cancel')}>
                    Cancel PO
                  </Button>
                )}
              </div>
            )}

            {(po.PurchaseReceipts ?? []).length > 0 && (
              <section>
                <h3 className="mb-2 text-sm font-semibold">Goods received</h3>
                <ul className="divide-y divide-border rounded-xl border border-border text-sm">
                  {po.PurchaseReceipts.map((g) => (
                    <li key={g.id ?? g.grnNumber} className="flex flex-wrap justify-between gap-2 px-3 py-2">
                      <span>
                        <span className="font-medium">{g.grnNumber}</span>
                        <span className="text-muted-foreground">
                          {' '}
                          · {fmtDate(g.receivedAt ?? g.createdAt)}
                          {g.receiver?.name ? ` · ${g.receiver.name}` : ''}
                          {g.notes ? ` · ${g.notes}` : ''}
                        </span>
                      </span>
                      <span>{(g.items ?? []).reduce((s, it) => s + num(it.quantity), 0)} units</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {(po.SupplierPayments ?? []).length > 0 && (
              <section>
                <h3 className="mb-2 text-sm font-semibold">Payments</h3>
                <ul className="divide-y divide-border rounded-xl border border-border text-sm">
                  {po.SupplierPayments.map((p) => (
                    <li key={p.id ?? p.paymentNumber} className="flex flex-wrap justify-between gap-2 px-3 py-2">
                      <span>
                        <span className="font-medium">{p.paymentNumber}</span>
                        <span className="capitalize text-muted-foreground">
                          {' '}
                          · {fmtDate(p.paidAt)} · {p.paymentMethod}
                          {p.reference ? ` · ${p.reference}` : ''}
                          {p.payer?.name ? ` · ${p.payer.name}` : ''}
                        </span>
                      </span>
                      <span className="font-medium">{QAR(p.amount)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <ConfirmDialog
              open={panel === 'cancel'}
              title={`Cancel ${po.poNumber}?`}
              body="The order is closed and can no longer be received. Payments already made stay on the supplier's statement."
              confirmLabel="Cancel PO"
              destructive
              busy={cancel.isPending}
              onConfirm={() => cancel.mutate()}
              onClose={() => setPanel(null)}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PurchaseOrdersTab({ suppliers, locations, isAdmin }) {
  const [status, setStatus] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [search, setSearch] = useState('');
  const [detailId, setDetailId] = useState(null);
  const [editing, setEditing] = useState(null); // null | 'new' | po
  const list = useQuery(purchaseOrdersQuery({ status, supplierId, locationId }));
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (list.data ?? []).filter((p) => !q || `${p.poNumber} ${p.Supplier?.name ?? ''}`.toLowerCase().includes(q));
  }, [list.data, search]);
  const totalOutstanding = rows.filter((p) => p.status !== 'cancelled').reduce((s, p) => s + outstandingOf(p), 0);

  return (
    <>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Input className="h-11" placeholder="Search PO number or supplier" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className={cn(SELECT, 'capitalize')} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {PO_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select className={SELECT} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
          <option value="">All suppliers</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select className={SELECT} value={locationId} onChange={(e) => setLocationId(e.target.value)}>
          <option value="">All locations</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <Button className="h-11" onClick={() => setEditing('new')}>
          <Plus className="mr-2 size-4" /> New PO
        </Button>
      </div>

      {list.isLoading ? (
        <LoadingRows />
      ) : list.isError ? (
        <ErrorState section="purchase orders" message={list.error.message} onRetry={() => list.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState title="No purchase orders" hint="Create one with New PO — pay it, then receive the stock." />
      ) : (
        <>
          <p className="mb-3 text-sm text-muted-foreground">
            {rows.length} orders · outstanding to suppliers <strong>{QAR(totalOutstanding)}</strong>
          </p>
          <div className="grid gap-3 lg:hidden">
            {rows.map((p) => (
              <button key={p.id} onClick={() => setDetailId(p.id)} className="rounded-2xl border border-border bg-card p-4 text-left">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{p.poNumber}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {p.Supplier?.name} · {p.Location?.name} · {fmtDate(p.createdAt)}
                    </p>
                  </div>
                  <p className="shrink-0 font-semibold">{QAR(p.totalAmount)}</p>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Pill value={p.status} />
                  <Pill value={p.paymentStatus} label={`payment ${p.paymentStatus}`} />
                  {p.status !== 'cancelled' && outstandingOf(p) > 0 && (
                    <span className="text-xs text-amber-700">owes {QAR(outstandingOf(p))}</span>
                  )}
                </div>
              </button>
            ))}
          </div>
          <div className="hidden overflow-hidden rounded-2xl border border-border bg-card lg:block">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">PO</th>
                  <th className="px-4 py-3">Supplier</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right">Paid</th>
                  <th className="px-4 py-3 text-right">Outstanding</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Payment</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} onClick={() => setDetailId(p.id)} className="cursor-pointer border-t border-border hover:bg-secondary/40">
                    <td className="px-4 py-3">{fmtDate(p.createdAt)}</td>
                    <td className="px-4 py-3 font-medium">{p.poNumber}</td>
                    <td className="px-4 py-3">{p.Supplier?.name}</td>
                    <td className="px-4 py-3">{p.Location?.name}</td>
                    <td className="px-4 py-3 text-right">{QAR(p.totalAmount)}</td>
                    <td className="px-4 py-3 text-right">{QAR(p.amountPaid)}</td>
                    <td className={cn('px-4 py-3 text-right', p.status !== 'cancelled' && outstandingOf(p) > 0 && 'font-medium text-amber-700')}>
                      {p.status === 'cancelled' ? '—' : QAR(outstandingOf(p))}
                    </td>
                    <td className="px-4 py-3">
                      <Pill value={p.status} />
                    </td>
                    <td className="px-4 py-3">
                      <Pill value={p.paymentStatus} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {detailId && !editing && (
        <PoDetail
          id={detailId}
          isAdmin={isAdmin}
          onClose={() => setDetailId(null)}
          onEdit={(po) => setEditing(po)}
        />
      )}
      {editing && (
        <PoEditor
          key={editing === 'new' ? 'new' : editing.id}
          po={editing === 'new' ? null : editing}
          suppliers={suppliers}
          locations={locations}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setEditing(null);
            if (saved?.id) setDetailId(saved.id);
          }}
        />
      )}
    </>
  );
}

/* ═══════════════════════════════════ Suppliers ═══════════════════════════════════ */

const SUPPLIER_FIELDS = [
  ['name', 'Name *'],
  ['code', 'Code'],
  ['contactPerson', 'Contact person'],
  ['phone', 'Phone'],
  ['email', 'Email'],
  ['taxId', 'Tax ID'],
  ['address', 'Address'],
  ['city', 'City'],
  ['country', 'Country'],
];
const BLANK_SUPPLIER = {
  name: '', code: '', contactPerson: '', phone: '', email: '', taxId: '', address: '', city: '', country: '',
  openingBalance: 0, notes: '', active: true,
};

function SupplierForm({ supplier, onClose }) {
  const client = useQueryClient();
  const [form, setForm] = useState(() =>
    supplier
      ? Object.fromEntries(Object.keys(BLANK_SUPPLIER).map((k) => [k, supplier[k] ?? BLANK_SUPPLIER[k]]))
      : BLANK_SUPPLIER,
  );
  const save = useMutation({
    mutationFn: () => saveSupplier(supplier?.id, { ...form, openingBalance: num(form.openingBalance) }),
    onSuccess: async () => {
      toast.success(`Supplier ${supplier ? 'updated' : 'added'}.`);
      await Promise.all([pk.all, qk.suppliers].map((queryKey) => client.invalidateQueries({ queryKey })));
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="z-[70] max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{supplier ? `Edit ${supplier.name}` : 'Add supplier'}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          {SUPPLIER_FIELDS.map(([key, label]) => (
            <Field key={key} label={label} className={key === 'address' ? 'sm:col-span-2' : undefined}>
              <Input
                className="h-11"
                type={key === 'email' ? 'email' : 'text'}
                required={key === 'name'}
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              />
            </Field>
          ))}
          <Field label="Opening balance (owed to supplier)">
            <Input
              className="h-11"
              type="number"
              step={PRICE_STEP}
              value={form.openingBalance}
              onChange={(e) => setForm({ ...form, openingBalance: e.target.value })}
            />
          </Field>
          <label className="flex items-center gap-3 self-end pb-2 text-sm">
            <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} /> Active
          </label>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="outline" className="h-11" onClick={onClose} disabled={save.isPending}>
              Cancel
            </Button>
            <Button type="submit" className="h-11" disabled={!form.name.trim() || save.isPending}>
              Save supplier
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function StatementDialog({ supplier, onClose }) {
  const q = useQuery(supplierStatementQuery(supplier.id));
  const s = q.data;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="z-[70] max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{supplier.name} — statement</DialogTitle>
          <DialogDescription>Orders (sent onwards) increase what you owe; payments and completed returns reduce it.</DialogDescription>
        </DialogHeader>
        {q.isLoading ? (
          <LoadingRows count={4} />
        ) : q.isError ? (
          <ErrorState section="the statement" message={q.error.message} onRetry={() => q.refetch()} />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Opening balance" value={QAR(s.openingBalance)} />
              <Stat label="Closing balance" value={QAR(s.closingBalance)} tone={num(s.closingBalance) > 0 ? 'warn' : 'good'} />
            </div>
            {s.entries.length === 0 ? (
              <EmptyState title="No transactions" />
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-border">
                <table className="w-full min-w-[520px] text-sm">
                  <thead className="bg-secondary/60 text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2">Ref</th>
                      <th className="px-3 py-2 text-right">Debit</th>
                      <th className="px-3 py-2 text-right">Credit</th>
                      <th className="px-3 py-2 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.entries.map((e, i) => (
                      <tr key={`${e.ref}-${i}`} className="border-t border-border">
                        <td className="px-3 py-2">{fmtDate(e.date)}</td>
                        <td className="px-3 py-2 capitalize">{e.type}</td>
                        <td className="px-3 py-2 font-mono text-xs">{e.ref}</td>
                        <td className="px-3 py-2 text-right">{num(e.debit) > 0 ? QAR(e.debit) : ''}</td>
                        <td className="px-3 py-2 text-right">{num(e.credit) > 0 ? QAR(e.credit) : ''}</td>
                        <td className="px-3 py-2 text-right font-medium">{QAR(e.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SuppliersTab({ list, isAdmin }) {
  const client = useQueryClient();
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState(null); // null | 'new' | supplier
  const [statement, setStatement] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const refresh = () => Promise.all([pk.all, qk.suppliers, qk.products].map((queryKey) => client.invalidateQueries({ queryKey })));

  const link = useMutation({
    mutationFn: linkSupplierProducts,
    onSuccess: async (d) => {
      toast.success(`${d.linked} products linked · ${d.withSupplier} have a supplier · ${d.withoutSupplier} never bought`, {
        duration: 8000,
      });
      await refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (s) => deleteSupplier(s.id),
    onSuccess: async (res) => {
      toast.success(res?.message ?? 'Supplier removed.');
      setDeleting(null);
      await refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (list.data ?? [])
      .filter((s) => showInactive || s.active !== false)
      .filter((s) => !q || `${s.name} ${s.code ?? ''} ${s.contactPerson ?? ''} ${s.phone ?? ''} ${s.email ?? ''}`.toLowerCase().includes(q));
  }, [list.data, search, showInactive]);

  const exportCsv = () => {
    const csv = toCsv(
      rows.map((s) => ({
        Name: s.name,
        Code: s.code,
        'Contact person': s.contactPerson,
        Phone: s.phone,
        Email: s.email,
        Address: s.address,
        City: s.city,
        Country: s.country,
        'Tax ID': s.taxId,
        'Opening balance': num(s.openingBalance).toFixed(2),
        Products: s.productCount ?? 0,
        Active: s.active === false ? 'No' : 'Yes',
        Notes: s.notes,
      })),
    );
    downloadFile(`suppliers-${today()}.csv`, csv);
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input className="h-11 min-w-0 flex-1 sm:max-w-xs" placeholder="Search name, code, contact…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <label className="flex items-center gap-2 px-1 text-sm">
          <Switch checked={showInactive} onCheckedChange={setShowInactive} /> Show inactive
        </label>
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          {isAdmin && (
            <Button variant="outline" className="h-11" disabled={link.isPending} onClick={() => link.mutate()}>
              <Link2 className="mr-2 size-4" /> Link products from purchase history
            </Button>
          )}
          <Button variant="outline" className="h-11" disabled={!rows.length} onClick={exportCsv}>
            <Download className="mr-2 size-4" /> CSV
          </Button>
          {isAdmin && (
            <Button className="h-11" onClick={() => setEditing('new')}>
              <Plus className="mr-2 size-4" /> Add supplier
            </Button>
          )}
        </div>
      </div>

      {list.isLoading ? (
        <LoadingRows />
      ) : list.isError ? (
        <ErrorState section="suppliers" message={list.error.message} onRetry={() => list.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState title="No suppliers" hint={isAdmin ? 'Add your first supplier above.' : 'Ask an admin to add suppliers.'} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((s) => (
            <div key={s.id} className={cn('rounded-2xl border border-border bg-card p-4', s.active === false && 'opacity-60')}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{s.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[s.code, s.contactPerson, s.phone, s.email].filter(Boolean).join(' · ') || 'No contact details'}
                  </p>
                </div>
                {s.active === false && <Pill value="inactive" />}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {s.productCount ?? 0} linked products
                {[s.city, s.country].filter(Boolean).length ? ` · ${[s.city, s.country].filter(Boolean).join(', ')}` : ''}
                {s.taxId ? ` · Tax ID ${s.taxId}` : ''}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className="h-9" onClick={() => setStatement(s)}>
                  Statement
                </Button>
                {isAdmin && (
                  <>
                    <Button size="sm" variant="outline" className="h-9" onClick={() => setEditing(s)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" className="h-9 text-destructive" onClick={() => setDeleting(s)}>
                      Delete
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <SupplierForm key={editing === 'new' ? 'new' : editing.id} supplier={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
      {statement && <StatementDialog supplier={statement} onClose={() => setStatement(null)} />}
      <ConfirmDialog
        open={Boolean(deleting)}
        title={`Delete ${deleting?.name ?? ''}?`}
        body="If this supplier has purchase orders it is deactivated instead, so its history stays intact."
        confirmLabel="Delete"
        destructive
        busy={remove.isPending}
        onConfirm={() => remove.mutate(deleting)}
        onClose={() => setDeleting(null)}
      />
    </>
  );
}

/* ═════════════════════════════════ Supplier returns ═════════════════════════════════ */

const REFUND_METHODS = [
  ['credit_note', 'Credit note (reduces what you owe)'],
  ['cash', 'Cash refund'],
  ['bank', 'Bank refund'],
];

function ReturnEditor({ suppliers, locations, onClose, onSaved }) {
  const client = useQueryClient();
  const [supplierId, setSupplierId] = useState('');
  const [locationId, setLocationId] = useState(String(locations[0]?.id ?? ''));
  const [poId, setPoId] = useState('');
  const [lines, setLines] = useState([]);
  const [refundMethod, setRefundMethod] = useState('credit_note');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const pos = useQuery(returnablePosQuery(supplierId));

  const pickPo = async (id) => {
    setPoId(id);
    if (!id) {
      setLines([]);
      return;
    }
    try {
      const po = await client.fetchQuery(purchaseOrderQuery(id));
      setLocationId(String(po.locationId));
      setLines(
        (po.items ?? [])
          .filter((it) => num(it.receivedQty) > 0)
          .map((it) => ({
            productId: it.productId,
            variantIndex: it.variantIndex ?? null,
            name: it.name,
            quantity: 0,
            unitCost: num(it.landedUnitCost) || num(it.unitCost),
            max: num(it.receivedQty),
          })),
      );
    } catch (e) {
      toast.error(e.message);
    }
  };
  const setLine = (i, patch) => setLines((cur) => cur.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const addSku = (s) =>
    setLines((cur) => {
      const { productId, variantIndex } = fromSku(s);
      const i = cur.findIndex((l) => lineKey(l.productId, l.variantIndex) === lineKey(productId, variantIndex));
      if (i >= 0) return cur.map((l, j) => (j === i ? { ...l, quantity: num(l.quantity) + 1 } : l));
      return [...cur, { productId, variantIndex, name: skuName(s), quantity: 1, unitCost: num(s.costPrice) }];
    });

  const picked = lines.filter((l) => parseInt(l.quantity, 10) > 0);
  const total = picked.reduce((s, l) => s + num(l.unitCost) * parseInt(l.quantity, 10), 0);
  const save = useMutation({
    mutationFn: () =>
      createPurchaseReturn({
        supplierId: parseInt(supplierId, 10),
        locationId: parseInt(locationId, 10),
        purchaseOrderId: poId ? parseInt(poId, 10) : null,
        items: picked.map((l) => ({
          productId: l.productId,
          variantIndex: l.variantIndex,
          name: l.name,
          quantity: parseInt(l.quantity, 10),
          unitCost: num(l.unitCost),
        })),
        refundMethod,
        reason,
        notes,
      }),
    onSuccess: async (saved) => {
      toast.success(`${saved?.returnNumber ?? 'Return'} recorded · stock taken out of ${locations.find((l) => String(l.id) === locationId)?.name ?? 'the location'}.`);
      await Promise.all([pk.all, qk.products, qk.stockOut].map((queryKey) => client.invalidateQueries({ queryKey })));
      onSaved(saved);
    },
    onError: (e) => toast.error(e.message),
  });
  const invalid = !supplierId ? 'Choose a supplier.' : !locationId ? 'Choose the location.' : picked.length === 0 ? 'Enter a quantity on at least one line.' : null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="z-[70] max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New supplier return</DialogTitle>
          <DialogDescription>Stock leaves the chosen location now; the refund is booked by the method you pick.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Supplier">
            <select
              className={SELECT}
              value={supplierId}
              onChange={(e) => {
                setSupplierId(e.target.value);
                setPoId('');
                setLines([]);
              }}
            >
              <option value="">Choose supplier…</option>
              {activeOnly(suppliers).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Source PO (optional)" hint={supplierId && pos.data?.length === 0 ? 'No received POs from this supplier.' : undefined}>
            <select className={SELECT} value={poId} disabled={!supplierId} onChange={(e) => void pickPo(e.target.value)}>
              <option value="">None (ad-hoc)</option>
              {(pos.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.poNumber} · {fmtDate(p.createdAt)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Return from">
            <select className={SELECT} value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <SkuSearch onPick={addSku} placeholder="Add another item: scan or search…" />

        {lines.length === 0 ? (
          <EmptyState title="No lines yet" hint="Pick a source PO or search for the items going back." />
        ) : (
          <div className="grid gap-2">
            {lines.map((l, i) => (
              <div key={lineKey(l.productId, l.variantIndex)} className="flex flex-wrap items-end gap-2 rounded-2xl border border-border bg-card p-3">
                <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                  <p className="text-sm font-medium">{l.name}</p>
                  {l.max != null && <p className="text-xs text-muted-foreground">received {l.max} on the PO</p>}
                </div>
                <Field label="Qty" className="w-24">
                  <Input className="h-10" type="number" min="0" step="1" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
                </Field>
                <Field label="Unit cost" className="w-28">
                  <Input className="h-10" type="number" min="0" step={PRICE_STEP} value={l.unitCost} onChange={(e) => setLine(i, { unitCost: e.target.value })} />
                </Field>
                <p className="w-28 pb-2.5 text-right text-sm font-medium">{QAR(num(l.unitCost) * (parseInt(l.quantity, 10) || 0))}</p>
                <button
                  type="button"
                  aria-label="Remove line"
                  className="pb-3 text-muted-foreground hover:text-destructive"
                  onClick={() => setLines(lines.filter((_, j) => j !== i))}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Refund method">
            <select className={SELECT} value={refundMethod} onChange={(e) => setRefundMethod(e.target.value)}>
              {REFUND_METHODS.map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Reason">
            <Input className="h-11" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Defective, over-shipped…" />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm">
            Refund total <strong>{QAR(total)}</strong>
            {invalid && <span className="ml-2 text-xs text-muted-foreground">{invalid}</span>}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" className="h-11" onClick={onClose} disabled={save.isPending}>
              Close
            </Button>
            <Button className="h-11" disabled={Boolean(invalid) || save.isPending} onClick={() => save.mutate()}>
              Record return
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReturnDetail({ id, isAdmin, onClose }) {
  const client = useQueryClient();
  const q = useQuery(purchaseReturnQuery(id));
  const [confirm, setConfirm] = useState(false);
  const cancel = useMutation({
    mutationFn: () => cancelPurchaseReturn(id),
    onSuccess: async () => {
      toast.success('Return cancelled · stock added back.');
      setConfirm(false);
      await Promise.all([pk.all, qk.products].map((queryKey) => client.invalidateQueries({ queryKey })));
    },
    onError: (e) => toast.error(e.message),
  });
  const r = q.data;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="z-[70] max-h-[92vh] max-w-2xl overflow-y-auto">
        {q.isLoading ? (
          <LoadingRows count={3} />
        ) : q.isError ? (
          <ErrorState section="the return" message={q.error.message} onRetry={() => q.refetch()} />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2">
                {r.returnNumber} <Pill value={r.status} />
              </DialogTitle>
              <DialogDescription>
                {r.Supplier?.name} · from {r.Location?.name} · {fmtDate(r.createdAt)}
                {r.PurchaseOrder?.poNumber ? ` · against ${r.PurchaseOrder.poNumber}` : ''}
              </DialogDescription>
            </DialogHeader>
            <ul className="divide-y divide-border rounded-xl border border-border text-sm">
              {(r.items ?? []).map((it) => (
                <li key={lineKey(it.productId, it.variantIndex)} className="flex justify-between gap-3 px-3 py-2">
                  <span className="min-w-0">
                    {it.name}
                    <span className="block text-xs text-muted-foreground">
                      {it.quantity} × {QAR(it.unitCost)}
                    </span>
                  </span>
                  <span className="font-medium">{QAR(it.refundAmount ?? num(it.unitCost) * num(it.quantity))}</span>
                </li>
              ))}
            </ul>
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Refund total" value={QAR(r.totalAmount)} />
              <Stat label="Method" value={REFUND_METHODS.find(([v]) => v === r.refundMethod)?.[1] ?? r.refundMethod} />
            </div>
            {r.reason && <p className="text-sm">Reason: {r.reason}</p>}
            {r.notes && <p className="text-sm text-muted-foreground">{r.notes}</p>}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="h-10" onClick={() => pdf(returnPdfUrl(r.id))}>
                <Printer className="mr-2 size-4" /> Print / PDF
              </Button>
              {isAdmin && r.status === 'completed' && (
                <Button variant="outline" className="h-10 border-destructive/40 text-destructive" onClick={() => setConfirm(true)}>
                  Cancel return
                </Button>
              )}
            </div>
            <ConfirmDialog
              open={confirm}
              title={`Cancel ${r.returnNumber}?`}
              body={`Stock will be added back at ${r.Location?.name ?? 'the location'} and the refund reversed.`}
              confirmLabel="Cancel return"
              destructive
              busy={cancel.isPending}
              onConfirm={() => cancel.mutate()}
              onClose={() => setConfirm(false)}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ReturnsTab({ suppliers, locations, isAdmin }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [creating, setCreating] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const list = useQuery(purchaseReturnsQuery({ from, to, supplierId, locationId }));
  const rows = list.data ?? [];
  const total = rows.filter((r) => r.status === 'completed').reduce((s, r) => s + num(r.totalAmount), 0);

  return (
    <>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Input className="h-11" type="date" aria-label="From" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input className="h-11" type="date" aria-label="To" value={to} onChange={(e) => setTo(e.target.value)} />
        <select className={SELECT} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
          <option value="">All suppliers</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select className={SELECT} value={locationId} onChange={(e) => setLocationId(e.target.value)}>
          <option value="">All locations</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <Button className="h-11" onClick={() => setCreating(true)}>
          <Plus className="mr-2 size-4" /> New return
        </Button>
      </div>

      {list.isLoading ? (
        <LoadingRows />
      ) : list.isError ? (
        <ErrorState section="supplier returns" message={list.error.message} onRetry={() => list.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState title="No supplier returns" hint="Goods sent back to a supplier appear here." />
      ) : (
        <>
          <p className="mb-3 text-sm text-muted-foreground">
            {rows.length} returns · refunds <strong>{QAR(total)}</strong>
          </p>
          <div className="grid gap-3 lg:hidden">
            {rows.map((r) => (
              <button key={r.id} onClick={() => setDetailId(r.id)} className={cn('rounded-2xl border border-border bg-card p-4 text-left', r.status === 'cancelled' && 'opacity-60')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{r.returnNumber}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {r.Supplier?.name} · {r.Location?.name} · {fmtDate(r.createdAt)}
                    </p>
                  </div>
                  <p className="shrink-0 font-semibold">{QAR(r.totalAmount)}</p>
                </div>
                <div className="mt-2 flex gap-2">
                  <Pill value={r.status} />
                  <Pill value="draft" label={String(r.refundMethod).replace('_', ' ')} />
                </div>
              </button>
            ))}
          </div>
          <div className="hidden overflow-hidden rounded-2xl border border-border bg-card lg:block">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Return</th>
                  <th className="px-4 py-3">Supplier</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">Refund</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} onClick={() => setDetailId(r.id)} className={cn('cursor-pointer border-t border-border hover:bg-secondary/40', r.status === 'cancelled' && 'text-muted-foreground')}>
                    <td className="px-4 py-3">{fmtDate(r.createdAt)}</td>
                    <td className="px-4 py-3 font-medium">{r.returnNumber}</td>
                    <td className="px-4 py-3">{r.Supplier?.name}</td>
                    <td className="px-4 py-3">{r.Location?.name}</td>
                    <td className="px-4 py-3 capitalize">{String(r.refundMethod).replace('_', ' ')}</td>
                    <td className="px-4 py-3 text-right">{QAR(r.totalAmount)}</td>
                    <td className="px-4 py-3">
                      <Pill value={r.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {creating && (
        <ReturnEditor
          suppliers={suppliers}
          locations={locations}
          onClose={() => setCreating(false)}
          onSaved={(saved) => {
            setCreating(false);
            if (saved?.id) setDetailId(saved.id);
          }}
        />
      )}
      {detailId && <ReturnDetail id={detailId} isAdmin={isAdmin} onClose={() => setDetailId(null)} />}
    </>
  );
}

/* ═══════════════════════════════════════ Page ═══════════════════════════════════════ */

const TABS = [
  ['orders', 'Purchase Orders'],
  ['suppliers', 'Suppliers'],
  ['returns', 'Supplier Returns'],
];

export default function PurchasingPage() {
  useHubTitle('Purchasing — FEMNIA Hub');
  const client = useQueryClient();
  const access = useQuery(accessQuery).data ?? null;
  const allowed = MULTILOC && Boolean(access && (access.isAdmin || access.legacy?.includes('products')));
  const isAdmin = Boolean(access?.isAdmin);
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(([k]) => k === params.get('tab')) ? params.get('tab') : 'orders';

  const suppliers = useQuery({ ...allSuppliersQuery, enabled: allowed });
  const locations = useQuery({ ...locationsQuery, enabled: allowed });
  const activeLocations = useMemo(() => activeOnly(locations.data), [locations.data]);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Purchasing"
        subtitle="Order from suppliers, pay in full, then receive stock at landed cost. Returns go back the same way."
        onRefresh={allowed ? () => client.invalidateQueries({ queryKey: pk.all }) : undefined}
        refreshing={suppliers.isFetching || locations.isFetching}
      />

      {!MULTILOC ? (
        <EmptyState title="Purchasing is off" hint="It needs multi-location inventory (FEATURE_MULTILOC) to be switched on." />
      ) : !access ? (
        <LoadingRows />
      ) : !allowed ? (
        <EmptyState title="No access" hint="Purchasing needs the Products permission." />
      ) : (
        <>
          <div className="no-print mb-4 flex gap-2 overflow-x-auto pb-1">
            {TABS.map(([key, label]) => (
              <button
                key={key}
                onClick={() => setParams(key === 'orders' ? {} : { tab: key }, { replace: true })}
                className={cn(
                  'shrink-0 rounded-xl border px-3 py-2 text-sm font-medium transition-colors',
                  tab === key ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground/80 hover:bg-secondary',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === 'suppliers' ? (
            <SuppliersTab list={suppliers} isAdmin={isAdmin} />
          ) : locations.isLoading || suppliers.isLoading ? (
            <LoadingRows />
          ) : tab === 'returns' ? (
            <ReturnsTab suppliers={suppliers.data ?? []} locations={activeLocations} isAdmin={isAdmin} />
          ) : (
            <PurchaseOrdersTab suppliers={suppliers.data ?? []} locations={activeLocations} isAdmin={isAdmin} />
          )}
        </>
      )}
    </div>
  );
}
