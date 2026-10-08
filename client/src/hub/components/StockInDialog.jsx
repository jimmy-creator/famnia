import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { StockSkuPicker } from '@/hub/components/StockSkuPicker';
import { Button } from '@/hub/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/hub/ui/dialog';
import { Input } from '@/hub/ui/input';
import { Label } from '@/hub/ui/label';
import { Textarea } from '@/hub/ui/textarea';
import { accessQuery, confirmStockIn, createSupplier, qk, suppliersQuery } from '@/hub/lib/api';
import { QAR, newStockIdempotencyKey, newStockReference, today } from '@/hub/lib/format';
import { invalidateStock } from '@/hub/lib/invalidate';
import { can } from '@/hub/lib/permissions';

/**
 * `initialKey` preselects a SKU (used right after "Save Product & Open Stock In").
 * Remounted on every opening (see the key), so each form starts fresh with a
 * new reference and idempotency key.
 */
export function StockInDialog(props) {
  return <StockInDialogForm key={props.open ? `open:${props.initialKey ?? ''}` : 'closed'} {...props} />;
}

function StockInDialogForm({ open, onClose, products, onDone, initialKey = null }) {
  const client = useQueryClient();
  const access = useQuery(accessQuery).data ?? null;
  const suppliers = useQuery({ ...suppliersQuery, enabled: open });
  const canManageSuppliers = can(access, 'suppliers.manage');
  const initial = initialKey ? (products.find((p) => p.key === initialKey) ?? null) : null;

  const [product, setProduct] = useState(initial);
  const [reference] = useState(() => newStockReference('in'));
  const [idempotencyKey] = useState(() => newStockIdempotencyKey('in'));
  const [date, setDate] = useState(today);
  const [quantity, setQuantity] = useState('');
  const [unitCost, setUnitCost] = useState(initial?.costPrice ? String(initial.costPrice) : '');
  const [supplier, setSupplier] = useState('');
  const [invoiceRef, setInvoiceRef] = useState('');
  const [receivedBy, setReceivedBy] = useState(access?.fullName ?? access?.email ?? '');
  const [rack, setRack] = useState(initial?.rack ?? '');
  const [shelf, setShelf] = useState(initial?.shelfLocation ?? '');
  const [batchNumber, setBatchNumber] = useState('');
  const [sourceCountry, setSourceCountry] = useState('');
  const [wholesaler, setWholesaler] = useState('');
  const [notes, setNotes] = useState('');

  // Picking a SKU prefills its cost and storage location.
  const pick = (next) => {
    setProduct(next);
    setUnitCost(next.costPrice ? String(next.costPrice) : '');
    setRack(next.rack ?? '');
    setShelf(next.shelfLocation ?? '');
  };

  const qty = Number(quantity);
  const cost = unitCost === '' ? null : Number(unitCost);
  const totalCost = useMemo(
    () => (cost === null || !Number.isFinite(qty) ? null : Math.round(cost * qty * 100) / 100),
    [cost, qty],
  );

  const addSupplier = useMutation({
    mutationFn: () => createSupplier(supplier),
    onSuccess: async (created) => {
      setSupplier(created.name);
      toast.success(`Supplier "${created.name}" saved`);
      await client.invalidateQueries({ queryKey: qk.suppliers });
    },
    onError: (error) => toast.error(error.message),
  });

  const submit = useMutation({
    mutationFn: async () => {
      if (!product) throw new Error('Select a SKU first.');
      return confirmStockIn({
        reference,
        date,
        key: product.key,
        quantity: qty,
        unitCost: cost,
        supplier: supplier || null,
        invoiceReference: invoiceRef || null,
        receivedBy: receivedBy || null,
        rack: rack || null,
        shelfLocation: shelf || null,
        batchNumber: batchNumber || null,
        sourceCountry: sourceCountry || null,
        wholesaler: wholesaler || null,
        notes: notes || null,
        idempotencyKey,
        updateProductDefaults: true,
      });
    },
    onSuccess: async (result) => {
      if (result.duplicate) toast.info('This Stock In was already recorded — no duplicate created.');
      await invalidateStock(client, result.key);
      onDone(result);
      onClose();
    },
    onError: (error) => toast.error(error.message),
  });

  const invalid = !product || !Number.isFinite(qty) || qty <= 0 || !date;
  const supplierExists = (suppliers.data ?? []).some((name) => name.toLowerCase() === supplier.trim().toLowerCase());

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="z-[70] max-h-[92vh] w-full max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="pr-6">Add Stock — {reference}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div>
            <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">SKU Code / Product</Label>
            <StockSkuPicker products={products} value={product} onSelect={pick} />
          </div>

          {product && (
            <div className="rounded-2xl bg-secondary/50 p-4 text-sm">
              <p className="font-medium text-foreground">{product.name}</p>
              <p className="text-muted-foreground">
                {product.sku} · {product.category ?? 'No category'} · Size {product.size ?? '—'} · Colour {product.color ?? '—'}
              </p>
              <p className="mt-1 text-muted-foreground">
                Current stock before addition: <span className="font-semibold text-foreground">{product.currentStock}</span>
              </p>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Stock In Reference">
              <Input value={reference} readOnly className="h-11 bg-secondary/40" />
            </Field>
            <Field label="Stock In Date">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11" />
            </Field>
            <Field label="Quantity Received">
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="h-11"
              />
            </Field>
            <Field label="Unit Cost (QAR)">
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                className="h-11"
              />
            </Field>
          </div>

          <div className="rounded-2xl border border-border p-4 text-sm">
            Total Cost: <span className="font-semibold text-primary">{totalCost === null ? '—' : QAR(totalCost)}</span>
            {product && Number.isFinite(qty) && qty > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                New current stock after confirmation:{' '}
                <span className="font-semibold text-foreground">{product.currentStock + qty}</span>
              </p>
            )}
          </div>

          <div>
            <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">Supplier (optional)</Label>
            <div className="flex gap-2">
              <Input
                list="femnia-supplier-list"
                placeholder="Leave empty or type a supplier name"
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                className="h-11"
              />
              {canManageSuppliers && supplier.trim() && !supplierExists && (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 shrink-0"
                  disabled={addSupplier.isPending}
                  onClick={() => addSupplier.mutate()}
                >
                  {addSupplier.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                  <span className="ml-1 hidden sm:inline">Save supplier</span>
                </Button>
              )}
            </div>
            <datalist id="femnia-supplier-list">
              {(suppliers.data ?? []).map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            <p className="mt-1 text-xs text-muted-foreground">
              Supplier is not required. Leave it empty until the real supplier is known.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Invoice / Purchase Reference">
              <Input value={invoiceRef} onChange={(e) => setInvoiceRef(e.target.value)} className="h-11" />
            </Field>
            <Field label="Received By">
              <Input value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} className="h-11" />
            </Field>
            <Field label="Rack (optional)">
              <Input value={rack} onChange={(e) => setRack(e.target.value)} className="h-11" />
            </Field>
            <Field label="Shelf Location (optional)">
              <Input value={shelf} onChange={(e) => setShelf(e.target.value)} className="h-11" />
            </Field>
          </div>

          <div className="rounded-2xl border border-border p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Batch details (optional)
            </p>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Batch Number">
                <Input value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} placeholder="Batch 1" className="h-11" />
              </Field>
              <Field label="Source Country">
                <Input value={sourceCountry} onChange={(e) => setSourceCountry(e.target.value)} placeholder="UAE" className="h-11" />
              </Field>
              <Field label="Wholesaler">
                <Input
                  list="femnia-supplier-list"
                  value={wholesaler}
                  onChange={(e) => setWholesaler(e.target.value)}
                  placeholder="Pick or type a supplier"
                  className="h-11"
                />
              </Field>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              A SKU can have several batches, for example “Batch 1 UAE” and “Batch 2 CHN”. Batch details are informational
              only and never change stock or sales figures.
            </p>
          </div>

          <Field label="Notes (optional)">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </Field>

          <div className="sticky bottom-0 flex flex-col gap-2 border-t border-border bg-background pt-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" className="h-11" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" className="h-11" disabled={invalid || submit.isPending} onClick={() => submit.mutate()}>
              {submit.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Confirm Stock In
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
