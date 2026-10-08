import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { StockSkuPicker } from '@/hub/components/StockSkuPicker';
import { Button } from '@/hub/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/hub/ui/dialog';
import { Input } from '@/hub/ui/input';
import { Label } from '@/hub/ui/label';
import { Textarea } from '@/hub/ui/textarea';
import { accessQuery, confirmStockOut, suppliersQuery } from '@/hub/lib/api';
import { STOCK_OUT_REASONS, newStockIdempotencyKey, newStockReference, today } from '@/hub/lib/format';
import { invalidateStock } from '@/hub/lib/invalidate';

// Remounted on every opening (see the key), so each form starts fresh with a
// new reference and idempotency key.
export function StockOutDialog(props) {
  return <StockOutDialogForm key={props.open ? 'open' : 'closed'} {...props} />;
}

function StockOutDialogForm({ open, onClose, products, onDone }) {
  const client = useQueryClient();
  const access = useQuery(accessQuery).data ?? null;
  const suppliers = useQuery({ ...suppliersQuery, enabled: open });

  const [product, setProduct] = useState(null);
  const [reference] = useState(() => newStockReference('out'));
  const [idempotencyKey] = useState(() => newStockIdempotencyKey('out'));
  const [date, setDate] = useState(today);
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState(STOCK_OUT_REASONS[0]);
  const [supplier, setSupplier] = useState('');
  const [referenceNote, setReferenceNote] = useState('');
  const [handledBy, setHandledBy] = useState(access?.fullName ?? access?.email ?? '');
  const [notes, setNotes] = useState('');

  const qty = Number(quantity);
  const exceeds = Boolean(product) && Number.isFinite(qty) && qty > (product?.currentStock ?? 0);

  const submit = useMutation({
    mutationFn: async () => {
      if (!product) throw new Error('Select a SKU first.');
      return confirmStockOut({
        reference,
        date,
        key: product.key,
        quantity: qty,
        reason,
        supplier: reason === 'Supplier Return' ? supplier || null : null,
        referenceNote: referenceNote || null,
        handledBy: handledBy || null,
        notes: notes || null,
        idempotencyKey,
      });
    },
    onSuccess: async (result) => {
      if (result.duplicate) toast.info('This Stock Out was already recorded — no duplicate created.');
      await invalidateStock(client, result.key);
      onDone(result);
      onClose();
    },
    onError: (error) => toast.error(error.message),
  });

  const invalid = !product || !Number.isFinite(qty) || qty <= 0 || exceeds || !date;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="z-[70] max-h-[92vh] w-full max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="pr-6">Record Stock Out — {reference}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <p className="rounded-2xl bg-secondary/50 p-3 text-xs text-muted-foreground">
            Manual Stock Out is for non-sales reductions only. Customer sales keep using the automatic stock-out from
            confirmed Sales Orders.
          </p>

          <div>
            <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">SKU Code / Product</Label>
            <StockSkuPicker products={products} value={product} onSelect={setProduct} />
          </div>

          {product && (
            <div className="rounded-2xl bg-secondary/50 p-4 text-sm">
              <p className="font-medium text-foreground">{product.name}</p>
              <p className="text-muted-foreground">
                {product.sku} · {product.category ?? 'No category'} · Size {product.size ?? '—'} · Colour {product.color ?? '—'}
              </p>
              <p className="mt-1 text-muted-foreground">
                Current stock: <span className="font-semibold text-foreground">{product.currentStock}</span>
              </p>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Stock Out Reference">
              <Input value={reference} readOnly className="h-11 bg-secondary/40" />
            </Field>
            <Field label="Date">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11" />
            </Field>
            <Field label="Quantity">
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="h-11"
              />
              {exceeds && (
                <p className="mt-1 text-xs text-destructive">
                  Quantity cannot exceed the current stock of {product?.currentStock}.
                </p>
              )}
            </Field>
            <Field label="Reason">
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
              >
                {STOCK_OUT_REASONS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {reason === 'Supplier Return' && (
            <Field label="Supplier (optional)">
              <Input list="femnia-supplier-list-out" value={supplier} onChange={(e) => setSupplier(e.target.value)} className="h-11" />
              <datalist id="femnia-supplier-list-out">
                {(suppliers.data ?? []).map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </Field>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Reference (optional)">
              <Input value={referenceNote} onChange={(e) => setReferenceNote(e.target.value)} className="h-11" />
            </Field>
            <Field label="Removed / Handled By">
              <Input value={handledBy} onChange={(e) => setHandledBy(e.target.value)} className="h-11" />
            </Field>
          </div>

          <Field label="Notes">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </Field>

          {product && Number.isFinite(qty) && qty > 0 && !exceeds && (
            <div className="rounded-2xl border border-border p-4 text-sm">
              New current stock after confirmation:{' '}
              <span className="font-semibold text-foreground">{product.currentStock - qty}</span>
            </div>
          )}

          <div className="sticky bottom-0 flex flex-col gap-2 border-t border-border bg-background pt-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" className="h-11" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" className="h-11" disabled={invalid || submit.isPending} onClick={() => submit.mutate()}>
              {submit.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Confirm Stock Out
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
