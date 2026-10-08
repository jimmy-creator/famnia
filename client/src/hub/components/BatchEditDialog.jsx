/**
 * Batch detail correction — batch number, source country and wholesaler only.
 * Quantities, SKUs, dates and costs are never editable here; every correction
 * is written to the product's audit trail.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/hub/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/hub/ui/dialog';
import { Input } from '@/hub/ui/input';
import { Label } from '@/hub/ui/label';
import { Textarea } from '@/hub/ui/textarea';
import { suppliersQuery, updateOpeningStockBatch, updateStockInBatch } from '@/hub/lib/api';
import { invalidateStock } from '@/hub/lib/invalidate';

/**
 * target: { kind: "opening" | "receipt", key, id?, title, initial: {batchNumber, sourceCountry, wholesaler} }
 */
export function BatchEditDialog({ target, onClose }) {
  const client = useQueryClient();
  const suppliers = useQuery({ ...suppliersQuery, enabled: Boolean(target) });
  const [batchNumber, setBatchNumber] = useState('');
  const [sourceCountry, setSourceCountry] = useState('');
  const [wholesaler, setWholesaler] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setBatchNumber(target?.initial.batchNumber ?? '');
    setSourceCountry(target?.initial.sourceCountry ?? '');
    setWholesaler(target?.initial.wholesaler ?? '');
    setReason('');
  }, [target]);

  const save = async () => {
    if (!target) return;
    setSaving(true);
    try {
      const input = { batchNumber, sourceCountry, wholesaler };
      const result =
        target.kind === 'opening'
          ? await updateOpeningStockBatch(target.key, input, reason)
          : await updateStockInBatch(target.id, input, reason);
      await invalidateStock(client, target.key);
      toast.success(result.changes ? 'Batch details updated.' : 'Nothing changed.');
      onClose();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={Boolean(target)} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="z-[70] max-h-[88vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit batch details</DialogTitle>
          <DialogDescription>
            {target?.title} — batch number, source country and wholesaler only. Quantities, prices and dates stay
            exactly as recorded.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="batch-number">Batch Number</Label>
            <Input
              id="batch-number"
              value={batchNumber}
              onChange={(e) => setBatchNumber(e.target.value)}
              placeholder="Batch 1"
              className="mt-1 h-11"
            />
          </div>
          <div>
            <Label htmlFor="batch-country">Source Country</Label>
            <Input
              id="batch-country"
              value={sourceCountry}
              onChange={(e) => setSourceCountry(e.target.value)}
              placeholder="UAE"
              className="mt-1 h-11"
            />
          </div>
          <div>
            <Label htmlFor="batch-wholesaler">Wholesaler</Label>
            <Input
              id="batch-wholesaler"
              list="femnia-batch-supplier-list"
              value={wholesaler}
              onChange={(e) => setWholesaler(e.target.value)}
              placeholder="Pick or type a supplier"
              className="mt-1 h-11"
            />
            <datalist id="femnia-batch-supplier-list">
              {(suppliers.data ?? []).map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </div>
          <div>
            <Label htmlFor="batch-reason">Reason for this correction (optional)</Label>
            <Textarea id="batch-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="mt-1" />
          </div>
          <p className="rounded-2xl bg-secondary/50 p-3 text-xs text-muted-foreground">
            Batch details are informational. They never change stock, sales or cost figures.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" className="h-11" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button className="h-11" onClick={() => save()} disabled={saving}>
            {saving ? 'Saving…' : 'Save batch details'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
