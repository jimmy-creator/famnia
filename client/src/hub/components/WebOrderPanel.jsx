/**
 * Online-order tools merged in from the classic admin: the real payment
 * gateway and coupon, customer refund requests and gateway refunds,
 * Shiprocket shipping, and the server-made PDF invoice. Shown only for
 * orders placed on the storefront.
 */
import { useMutation, useQuery } from '@tanstack/react-query';
import { Download, Loader2, RotateCcw, Truck } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/hub/ui/button';
import { Checkbox } from '@/hub/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/hub/ui/dialog';
import { Input } from '@/hub/ui/input';
import { Label } from '@/hub/ui/label';
import { Textarea } from '@/hub/ui/textarea';
import { accessQuery } from '@/hub/lib/api';
import {
  pdfInvoiceUrl, refundOrder, rejectRefund, shippingAction, shippingDocument, shippingStatusQuery,
} from '@/hub/lib/apiOrders';
import { can } from '@/hub/lib/permissions';

const money = (v) => `QAR ${Number(v || 0).toFixed(2)}`;
const GATEWAYS = {
  razorpay: 'Razorpay', paytm: 'Paytm', stripe: 'Stripe', nomod: 'Nomod (card)', cod: 'Cash on delivery',
  bank_transfer: 'Bank transfer', pos_cash: 'Till · cash', pos_card: 'Till · card', pos_split: 'Till · split',
};

export function WebOrderPanel({ data, onChanged }) {
  const access = useQuery(accessQuery).data ?? null;
  const shipping = useQuery(shippingStatusQuery);
  const canRefund = can(access, 'payments.refunds');
  const canShip = can(access, 'orders.update_delivery');
  const canPdf = can(access, 'invoices.download') || can(access, 'invoices.view');

  const [refundOpen, setRefundOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [cancelShipOpen, setCancelShipOpen] = useState(false);

  const pendingRequest = data.refundStatus === 'pending';
  const refunded = data.refundStatus === 'processed';
  const paid = data.paymentStatus === 'Paid' || pendingRequest;
  const meta = data.shippingMeta || {};
  const showShipping = Boolean(shipping.data?.enabled) && data.fulfilmentMethod === 'Delivery' && data.status !== 'Draft';

  const ship = useMutation({
    mutationFn: (action) => shippingAction(data.id, action),
    onSuccess: async (r) => {
      toast.success(r.message);
      setCancelShipOpen(false);
      await onChanged();
    },
    onError: (e) => toast.error(e.message),
  });
  const openDoc = useMutation({
    mutationFn: (doc) => shippingDocument(data.id, doc),
    onSuccess: (r) => window.open(r.url, '_blank', 'noopener,noreferrer'),
    onError: (e) => toast.error(e.message),
  });
  const reject = useMutation({
    mutationFn: () => rejectRefund(data.id),
    onSuccess: async () => {
      toast.success('Refund request rejected.');
      setRejectOpen(false);
      await onChanged();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="card-surface space-y-3 p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Online order</h3>
        {canPdf && data.dbId && (
          <a href={pdfInvoiceUrl(data.dbId)} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="h-9">
              <Download className="mr-2 size-4" /> PDF invoice
            </Button>
          </a>
        )}
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
        <dt className="text-muted-foreground">Paid with</dt>
        <dd>{GATEWAYS[data.paymentGateway] ?? data.paymentGateway ?? '—'}</dd>
        {data.couponCode && (
          <>
            <dt className="text-muted-foreground">Coupon</dt>
            <dd>
              <span className="font-mono">{data.couponCode}</span>
              {data.couponDiscount > 0 && <span className="text-muted-foreground"> · −{money(data.couponDiscount)}</span>}
            </dd>
          </>
        )}
      </dl>

      {/* refunds */}
      {canRefund && (pendingRequest || refunded || data.refundStatus === 'failed' || paid) && (
        <div className="rounded-xl border border-border p-3">
          <p className="mb-2 font-medium">Refund</p>
          {refunded ? (
            <p className="text-muted-foreground">
              Refunded {money(data.refundAmount)}
              {data.refundedAt ? ` on ${new Date(data.refundedAt).toLocaleDateString('en-GB')}` : ''}.
            </p>
          ) : pendingRequest ? (
            <div className="space-y-2">
              <p>The customer asked for a refund of {money(data.refundAmount ?? data.grandTotal)}.</p>
              <div className="flex flex-wrap gap-2">
                <Button className="h-10" onClick={() => setRefundOpen(true)}>
                  <RotateCcw className="mr-2 size-4" /> Approve &amp; refund
                </Button>
                <Button variant="outline" className="h-10" onClick={() => setRejectOpen(true)}>
                  Reject request
                </Button>
              </div>
            </div>
          ) : data.refundStatus === 'failed' ? (
            <p className="text-muted-foreground">The customer’s refund request was rejected.</p>
          ) : (
            <Button variant="outline" className="h-10" onClick={() => setRefundOpen(true)}>
              <RotateCcw className="mr-2 size-4" /> Refund payment
            </Button>
          )}
        </div>
      )}

      {/* Shiprocket */}
      {showShipping && (
        <div className="rounded-xl border border-border p-3">
          <p className="mb-2 flex items-center gap-2 font-medium">
            <Truck className="size-4" /> Shiprocket
          </p>
          <div className="mb-3 rounded-lg bg-secondary/50 p-3 leading-relaxed">
            {meta.awb ? (
              <>
                <p>
                  AWB <span className="font-mono">{meta.awb}</span> · {meta.courierName}
                  {meta.courierId ? ` (#${meta.courierId})` : ''}
                </p>
                <p className="text-muted-foreground">Status: {meta.currentStatus || 'AWB_ASSIGNED'}</p>
                {meta.pickupScheduledDate && <p className="text-muted-foreground">Pickup: {meta.pickupScheduledDate}</p>}
                {meta.etd && <p className="text-muted-foreground">ETD: {meta.etd}</p>}
              </>
            ) : meta.shipmentId ? (
              <>
                <p>
                  SR order {meta.srOrderId} · shipment {meta.shipmentId}
                </p>
                <p className="text-warning">AWB not assigned yet — use Retry AWB.</p>
              </>
            ) : meta.lastError ? (
              <p className="text-destructive">Last error: {meta.lastError}</p>
            ) : (
              <p className="text-muted-foreground">No shipment yet.</p>
            )}
          </div>
          {canShip && (
            <div className="flex flex-wrap gap-2">
              {!meta.awb && (
                <Button className="h-10" disabled={ship.isPending} onClick={() => ship.mutate('create')}>
                  {ship.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                  {meta.shipmentId ? 'Retry AWB' : 'Create shipment'}
                </Button>
              )}
              {meta.shipmentId && (
                <>
                  {['label', 'invoice', 'manifest'].map((doc) => (
                    <Button key={doc} variant="outline" className="h-10 capitalize" disabled={openDoc.isPending} onClick={() => openDoc.mutate(doc)}>
                      {doc}
                    </Button>
                  ))}
                  <Button variant="outline" className="h-10" disabled={ship.isPending} onClick={() => ship.mutate('refresh')}>
                    Refresh tracking
                  </Button>
                  <Button variant="ghost" className="h-10 text-destructive" disabled={ship.isPending} onClick={() => setCancelShipOpen(true)}>
                    Cancel shipment
                  </Button>
                </>
              )}
            </div>
          )}
          {Array.isArray(meta.scans) && meta.scans.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-muted-foreground">Tracking history ({meta.scans.length} scans)</summary>
              <div className="mt-2 max-h-60 overflow-y-auto text-xs leading-relaxed">
                {meta.scans.slice().reverse().map((s, i) => (
                  <div key={i} className="border-b border-border px-2 py-2">
                    <p>
                      <strong>{s.srStatusLabel || s.status}</strong> · {s.date}
                    </p>
                    <p className="text-muted-foreground">
                      {s.activity} — {s.location}
                    </p>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {refundOpen && (
        <RefundDialog data={data} onClose={() => setRefundOpen(false)} onDone={onChanged} />
      )}

      <Dialog open={rejectOpen} onOpenChange={(v) => !v && setRejectOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject the refund request?</DialogTitle>
            <DialogDescription>The customer keeps the order and no money is returned.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Back</Button>
            <Button variant="destructive" disabled={reject.isPending} onClick={() => reject.mutate()}>
              Reject request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cancelShipOpen} onOpenChange={(v) => !v && setCancelShipOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this shipment?</DialogTitle>
            <DialogDescription>The Shiprocket shipment is cancelled. The order itself is not cancelled.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelShipOpen(false)}>Back</Button>
            <Button variant="destructive" disabled={ship.isPending} onClick={() => ship.mutate('cancel')}>
              Cancel shipment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Mounted per opening, so the form always starts from the order's values. */
function RefundDialog({ data, onClose, onDone }) {
  const [amount, setAmount] = useState(String(data.refundAmount ?? data.grandTotal));
  const [reason, setReason] = useState(data.refundStatus === 'pending' ? 'Customer refund request approved' : '');
  const [emailCustomer, setEmailCustomer] = useState(true);
  const notShipped = ['Confirmed', 'Awaiting Pickup'].includes(data.status);

  const refund = useMutation({
    mutationFn: () => refundOrder(data.id, { amount: Number(amount) || 0, reason, emailCustomer }),
    onSuccess: async (r) => {
      toast.success(`Refunded ${money(r.amount)}.`, {
        description: r.cancelled
          ? r.restored ? 'The order was cancelled and its stock put back.' : 'The order was cancelled.'
          : 'Use Process Return to bring any goods back into stock.',
      });
      onClose();
      await onDone();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Refund {data.id}</DialogTitle>
          <DialogDescription>
            {data.paymentGateway === 'nomod'
              ? 'The card payment is refunded through Nomod.'
              : 'Record the refund here after returning the money to the customer.'}{' '}
            {notShipped
              ? 'This order hasn’t shipped, so it will be cancelled and its stock put back.'
              : 'The order keeps its status — process a return for any goods that come back.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="rf-amount">Amount (QAR)</Label>
            <Input id="rf-amount" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1 h-11" />
            <p className="mt-1 text-xs text-muted-foreground">Order total {money(data.grandTotal)}</p>
          </div>
          <div>
            <Label htmlFor="rf-reason">Reason</Label>
            <Textarea id="rf-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={emailCustomer} onCheckedChange={(v) => setEmailCustomer(v === true)} />
            Email the customer
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Back</Button>
          <Button disabled={refund.isPending || !(Number(amount) > 0)} onClick={() => refund.mutate()}>
            {refund.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Refund {money(Number(amount) || 0)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
