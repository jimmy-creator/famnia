/**
 * My Deliveries — mobile-first board for delivery staff.
 *
 * Reads go through GET /api/hub/delivery/mine and writes through
 * POST /api/hub/delivery/:id/update, so the server decides what this account
 * can see and change: only its own assigned deliveries, only the allowed
 * statuses, and never a delivery that is already Delivered + Paid (Admin only).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, MapPin, Phone } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { EmptyState, ErrorState, LoadingRows, PageHeader, StatusBadge } from '@/hub/components/shared';
import { Button } from '@/hub/ui/button';
import { Input } from '@/hub/ui/input';
import { Label } from '@/hub/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/hub/ui/select';
import { Textarea } from '@/hub/ui/textarea';
import { deliveryPaymentModesQuery, myDeliveriesQuery, qk, updateMyDelivery } from '@/hub/lib/api';
import { DELIVERY_PAYMENT_STATUSES, DELIVERY_STATUSES } from '@/hub/lib/delivery';
import { QAR } from '@/hub/lib/format';
import { useHubTitle } from '@/hub/lib/useHubTitle';

const itemsSummary = (delivery) =>
  (delivery.items ?? [])
    .map((i) => `${i.name}${i.size ? ` ${i.size}` : ''}${i.color ? ` ${i.color}` : ''} × ${i.quantity}`)
    .join(', ') || 'No items';

function DeliveryCard({ delivery }) {
  const client = useQueryClient();
  const modes = useQuery(deliveryPaymentModesQuery);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(DELIVERY_STATUSES.includes(delivery.status) ? delivery.status : 'Pending');
  const [paymentStatus, setPaymentStatus] = useState(delivery.paymentStatus === 'Paid' ? 'Paid' : 'Pending');
  const [paymentMode, setPaymentMode] = useState(delivery.paymentMode || 'Cash');
  const [amount, setAmount] = useState(String(delivery.amountReceived || delivery.grandTotal));
  const [note, setNote] = useState('');

  const locked = delivery.status === 'Delivered' && delivery.paymentStatus === 'Paid';

  const save = useMutation({
    mutationFn: () =>
      updateMyDelivery({
        orderId: delivery.id,
        status,
        paymentStatus,
        paymentMode,
        amountCollected: Number(amount) || 0,
        note,
      }),
    onSuccess: async () => {
      toast.success(`${delivery.id} updated.`);
      setOpen(false);
      setNote('');
      await client.invalidateQueries({ queryKey: qk.myDeliveries });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'The update failed.'),
  });

  const submit = () => {
    if (status === 'Delivery Failed' && !note.trim()) {
      toast.error('Add a note explaining why the delivery failed.');
      return;
    }
    if (status === 'Delivered' || paymentStatus === 'Paid') {
      const label =
        status === 'Delivered' && paymentStatus === 'Paid'
          ? 'Mark this delivery as Delivered and Paid?'
          : status === 'Delivered'
            ? 'Mark this delivery as Delivered?'
            : 'Mark this payment as Paid?';
      if (!window.confirm(`${label} Only an Admin can undo it afterwards.`)) return;
    }
    save.mutate();
  };

  return (
    <div className="card-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">{delivery.id}</p>
          <p className="truncate text-sm">{delivery.customerName}</p>
        </div>
        <StatusBadge value={delivery.status} />
      </div>

      <div className="mt-3 space-y-2 text-sm">
        <a href={`tel:${delivery.phone}`} className="inline-flex items-center gap-2 font-medium text-primary">
          <Phone className="size-4" /> {delivery.phone}
        </a>
        <p className="flex items-start gap-2 text-muted-foreground">
          <MapPin className="mt-0.5 size-4 shrink-0" />
          <span className="break-words">
            {[delivery.address, delivery.landmark, delivery.area].filter(Boolean).join(', ') || 'No address recorded'}
          </span>
        </p>
        <p className="text-xs text-muted-foreground break-words">{itemsSummary(delivery)}</p>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-sm">
        <span className="font-semibold">{QAR(delivery.grandTotal)}</span>
        <span className="text-xs text-muted-foreground">
          {delivery.paymentStatus} · {delivery.paymentMode} · collected {QAR(delivery.amountReceived)}
        </span>
      </div>

      {locked ? (
        <p className="mt-3 rounded-xl bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">
          Delivered and paid — contact an Admin if this needs to change.
        </p>
      ) : open ? (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          <div>
            <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">Delivery status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DELIVERY_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">Payment</Label>
              <Select value={paymentStatus} onValueChange={setPaymentStatus}>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DELIVERY_PAYMENT_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s === 'Pending' ? 'Unpaid' : 'Paid'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">Payment mode</Label>
              <Select value={paymentMode} onValueChange={setPaymentMode}>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {/* Keep the order's current mode (e.g. COD) selectable even when it isn't in the list. */}
                  {[...new Set([...(modes.data ?? []), paymentMode])].map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
              Amount collected (QAR)
            </Label>
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-11" />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
              Note {status === 'Delivery Failed' ? '(required)' : '(optional)'}
            </Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button className="h-11 flex-1" onClick={submit} disabled={save.isPending}>
              {save.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Save update
            </Button>
            <Button variant="outline" className="h-11" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button className="mt-3 h-11 w-full" onClick={() => setOpen(true)}>
          Update delivery
        </Button>
      )}
    </div>
  );
}

export default function MyDeliveriesPage() {
  useHubTitle('My Deliveries — FEMNIA Hub');
  const deliveries = useQuery(myDeliveriesQuery);
  const [filter, setFilter] = useState('Active');

  if (deliveries.isPending) return <LoadingRows count={4} />;
  if (deliveries.isError) {
    return (
      <ErrorState
        section="my deliveries"
        message={deliveries.error instanceof Error ? deliveries.error.message : 'Unknown error'}
        onRetry={() => void deliveries.refetch()}
      />
    );
  }

  const all = deliveries.data ?? [];
  const rows = all.filter((d) => {
    if (filter === 'All') return true;
    if (filter === 'Active') return d.status !== 'Delivered';
    return d.status === filter;
  });

  return (
    <div>
      <PageHeader
        title="My Deliveries"
        subtitle="Only the deliveries assigned to you."
        onRefresh={() => void deliveries.refetch()}
        refreshing={deliveries.isFetching}
      />

      <div className="no-scrollbar mb-4 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {['Active', 'Pending', 'Out for Delivery', 'Delivered', 'Delivery Failed', 'All'].map((key) => (
          <Button
            key={key}
            size="sm"
            variant={filter === key ? 'default' : 'outline'}
            className="h-10 shrink-0"
            onClick={() => setFilter(key)}
          >
            {key}
          </Button>
        ))}
      </div>

      {!rows.length ? (
        <EmptyState title="Nothing here yet" hint="Deliveries appear as soon as an Admin assigns them to you." />
      ) : (
        <div className="space-y-3">
          {rows.map((d) => (
            <DeliveryCard key={d.id} delivery={d} />
          ))}
        </div>
      )}
    </div>
  );
}
