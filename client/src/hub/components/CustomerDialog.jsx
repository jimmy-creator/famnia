/**
 * Add / edit customer.
 *
 * Duplicate protection lives on the server (normalized mobile number) so the
 * same rule applies from every screen. Permissions are enforced by the API —
 * the buttons only mirror them.
 */
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/hub/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/hub/ui/dialog';
import { Input } from '@/hub/ui/input';
import { Label } from '@/hub/ui/label';
import { Textarea } from '@/hub/ui/textarea';
import { createCustomerRecord, qk, updateCustomerRecord } from '@/hub/lib/api';

// Remounted on every opening / customer change (see the key), so the form
// always starts from the customer being edited.
export function CustomerDialog(props) {
  return <CustomerDialogForm key={`${props.open ? 'open' : 'closed'}-${props.customer?.id ?? 'new'}`} {...props} />;
}

function CustomerDialogForm({ open, customer, onClose, onSaved }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(customer?.name ?? '');
  const [phone, setPhone] = useState(customer?.phone ?? '');
  const [altPhone, setAltPhone] = useState(customer?.altPhone ?? '');
  const [area, setArea] = useState(customer?.area ?? '');
  const [address, setAddress] = useState(customer?.address ?? '');
  const [notes, setNotes] = useState(customer?.notes ?? '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      // Landmark has no field here; pass it through so an edit keeps it.
      const input = { name, phone, altPhone, area, address, notes, landmark: customer?.landmark ?? null };
      const saved = customer
        ? await updateCustomerRecord(customer.id, input)
        : await createCustomerRecord(input);
      await queryClient.invalidateQueries({ queryKey: qk.customerRecords });
      await queryClient.invalidateQueries({ queryKey: qk.customers });
      toast.success(customer ? `${saved.code} updated.` : `Customer ${saved.code} created.`);
      onSaved?.(saved);
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save customer.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="z-[70] max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{customer ? `Edit ${customer.code}` : 'Add customer'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="c-name">Name</Label>
            <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1 h-11" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="c-phone">Mobile number</Label>
              <Input
                id="c-phone"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. 33xxxxxx"
                className="mt-1 h-11"
              />
            </div>
            <div>
              <Label htmlFor="c-alt">Alternate mobile</Label>
              <Input
                id="c-alt"
                inputMode="tel"
                value={altPhone}
                onChange={(e) => setAltPhone(e.target.value)}
                className="mt-1 h-11"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="c-area">Area</Label>
            <Input id="c-area" value={area} onChange={(e) => setArea(e.target.value)} className="mt-1 h-11" />
          </div>
          <div>
            <Label htmlFor="c-address">Address</Label>
            <Textarea id="c-address" value={address} onChange={(e) => setAddress(e.target.value)} className="mt-1" rows={3} />
          </div>
          <div>
            <Label htmlFor="c-notes">Notes</Label>
            <Textarea id="c-notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1" rows={2} />
          </div>
        </div>
        <div className="sticky bottom-0 flex flex-col gap-2 border-t border-border bg-background pt-3 sm:flex-row sm:justify-end">
          <Button variant="outline" className="h-11" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button className="h-11" onClick={() => void save()} disabled={busy || !name.trim() || !phone.trim()}>
            {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
            {customer ? 'Save changes' : 'Create customer'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
