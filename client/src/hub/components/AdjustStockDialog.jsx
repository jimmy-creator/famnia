import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/hub/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/hub/ui/dialog';
import { Input } from '@/hub/ui/input';
import { Label } from '@/hub/ui/label';
import { Textarea } from '@/hub/ui/textarea';
import { adjustStock } from '@/hub/lib/api';
import { STOCK_ADJUSTMENT_REASONS } from '@/hub/lib/format';
import { invalidateStock } from '@/hub/lib/invalidate';

export function AdjustStockDialog({ product, open, onClose }) {
  if (!product) return null;
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="z-[70] max-h-[92vh] w-full max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="pr-6">Adjust stock · {product.sku}</DialogTitle>
        </DialogHeader>
        {/* Mounted per opening, so the form starts from the live stock each time. */}
        <AdjustForm product={product} onClose={onClose} />
      </DialogContent>
    </Dialog>
  );
}

function AdjustForm({ product, onClose }) {
  const client = useQueryClient();
  const [counted, setCounted] = useState(String(product.currentStock));
  const [reason, setReason] = useState(STOCK_ADJUSTMENT_REASONS[0]);
  const [notes, setNotes] = useState('');
  const [idempotencyKey] = useState(
    () => `ADJ-${product.sku}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );

  const difference = counted === '' ? 0 : Number(counted) - product.currentStock;

  const submit = useMutation({
    mutationFn: async () => {
      if (Number(counted) === product.currentStock) return { key: product.key, difference: 0 };
      return {
        key: product.key,
        ...(await adjustStock(product.key, {
          systemQuantity: product.currentStock,
          countedQuantity: Number(counted),
          reason,
          notes: notes || null,
          idempotencyKey,
        })),
      };
    },
    onSuccess: async (result) => {
      toast.success(
        result.difference === 0
          ? 'Counted quantity matches system stock — no adjustment recorded'
          : `Stock adjusted by ${result.difference > 0 ? '+' : ''}${result.difference}`,
      );
      await invalidateStock(client, result.key);
      onClose();
    },
    onError: (error) => toast.error(error.message),
  });

  const invalid = counted === '' || Number(counted) < 0 || Number.isNaN(Number(counted));

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-secondary/50 p-4 text-sm">
        <p className="font-medium text-foreground">{product.name}</p>
        <p className="text-muted-foreground">
          System stock: <span className="font-semibold text-foreground">{product.currentStock}</span>
        </p>
      </div>

      <div>
        <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">Counted quantity</Label>
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          value={counted}
          onChange={(event) => setCounted(event.target.value)}
          className="h-11"
        />
        {Number(counted) < 0 && <p className="mt-1 text-xs text-destructive">Counted quantity cannot be negative.</p>}
      </div>

      <div className="rounded-2xl border border-border p-4 text-sm">
        Difference:{' '}
        <span
          className={
            difference === 0 ? 'font-semibold' : difference > 0 ? 'font-semibold text-primary' : 'font-semibold text-destructive'
          }
        >
          {difference > 0 ? '+' : ''}
          {difference}
        </span>
        <p className="mt-1 text-xs text-muted-foreground">
          Recorded as a stock adjustment. Sales, stock in and stock out history stay untouched.
        </p>
      </div>

      <div>
        <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">Reason</Label>
        <select
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
        >
          {STOCK_ADJUSTMENT_REASONS.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </div>

      <div>
        <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">Notes</Label>
        <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} />
      </div>

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="outline" className="h-11" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" className="h-11" disabled={invalid || submit.isPending} onClick={() => submit.mutate()}>
          {submit.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
          Save adjustment
        </Button>
      </div>
    </div>
  );
}
