import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Download, XCircle, Truck, ExternalLink } from 'lucide-react';
import api from '../api/axios';
import { showToast } from '../utils/toast';
import { CURRENCY, formatPrice } from '../utils/currency';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

function ShipmentBlock({ order }) {
  const { t } = useTranslation();
  const meta = order.shippingMeta;
  if (!meta?.awb && !meta?.shipmentId) return null;

  const lastScan = Array.isArray(meta.scans) && meta.scans.length > 0 ? meta.scans[meta.scans.length - 1] : null;
  const trackUrl = meta.awb ? `https://shiprocket.co/tracking/${meta.awb}` : null;

  return (
    <div className="my-3 rounded-md border border-border bg-secondary/40 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Truck className="size-4" />
          <strong>{meta.awb ? (meta.courierName || t('orders.shipped')) : t('orders.preparing')}</strong>
          {meta.currentStatus && (
            <span className="text-xs capitalize text-muted-foreground">· {meta.currentStatus.toLowerCase()}</span>
          )}
        </div>
        {trackUrl && (
          <a href={trackUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            {t('orders.track')} <ExternalLink className="size-3" />
          </a>
        )}
      </div>
      {meta.awb && (
        <div className="mt-1 text-xs text-muted-foreground">
          AWB: <span className="font-mono">{meta.awb}</span>{meta.etd && <> · ETD {meta.etd}</>}
        </div>
      )}
      {lastScan && (
        <div className="mt-2 text-xs leading-relaxed text-muted-foreground">
          {lastScan.activity || lastScan.srStatusLabel} — {lastScan.location} · {lastScan.date}
        </div>
      )}
    </div>
  );
}

const statusClasses = {
  processing: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  confirmed: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  shipped: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
  delivered: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

export default function Orders() {
  const { t } = useTranslation();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cancelModal, setCancelModal] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const fetchOrders = () => {
    api.get('/orders/my-orders')
      .then((res) => setOrders(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchOrders(); }, []);

  const handleCancel = async () => {
    setCancelling(true);
    try {
      const { data } = await api.post(`/orders/${cancelModal}/cancel`, { reason: cancelReason });
      showToast(data.message);
      if (data.refundInitiated) showToast('Refund has been initiated');
      setCancelModal(null);
      setCancelReason('');
      fetchOrders();
    } catch (error) {
      showToast(error.response?.data?.message || 'Failed to cancel', 'error');
    } finally {
      setCancelling(false);
    }
  };

  const canCancel = (status) => ['processing', 'confirmed'].includes(status);
  const cancelOrder = orders.find((o) => o.id === cancelModal);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 lg:px-8">
        <Skeleton className="mb-8 h-9 w-48" />
        {[1, 2, 3].map((i) => <Skeleton key={i} className="mb-4 h-40 w-full rounded-lg" />)}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 lg:px-8">
      <h1 className="mb-6 font-serif text-3xl font-semibold tracking-tight">{t('orders.title')}</h1>

      {orders.length === 0 ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center text-center">
          <h2 className="font-serif text-2xl font-semibold">{t('orders.empty')}</h2>
          <p className="mt-2 text-muted-foreground">{t('orders.emptyHint')}</p>
          <Button asChild className="mt-6"><Link to="/products">{t('orders.shopNow')}</Link></Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {orders.map((order) => (
            <div key={order.id} className="rounded-lg border border-border bg-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-medium">{t('orders.order')} #{order.orderNumber}</h3>
                  <p className="text-xs text-muted-foreground">{new Date(order.createdAt).toLocaleDateString()}</p>
                </div>
                <Badge className={cn('capitalize', statusClasses[order.orderStatus])} variant="secondary">
                  {t(`orderStatus.${order.orderStatus}`, { defaultValue: order.orderStatus })}
                </Badge>
              </div>

              <div className="mt-4 flex flex-col gap-1.5 text-sm">
                {order.items.map((item, i) => (
                  <div key={i} className="flex justify-between gap-3">
                    <span className="min-w-0 text-muted-foreground">
                      {item.name}
                      {item.variant && ` (${Object.entries(item.variant).filter(([k]) => k !== 'sku').map(([, v]) => v).join(', ')})`}
                      {' × '}{item.quantity}
                    </span>
                    <span className="shrink-0 whitespace-nowrap">{CURRENCY}{formatPrice(item.price * item.quantity)}</span>
                  </div>
                ))}
              </div>

              <ShipmentBlock order={order} />

              {order.refundStatus && (
                <div className="mt-2 flex items-center gap-2 text-sm">
                  <Badge variant="secondary" className="capitalize">{t('orders.refund')} {order.refundStatus}</Badge>
                  {order.refundAmount > 0 && <span className="text-muted-foreground">{CURRENCY}{formatPrice(order.refundAmount)}</span>}
                </div>
              )}

              {order.cancellationReason && (
                <p className="mt-2 text-sm text-muted-foreground">{t('orders.reason')}: {order.cancellationReason}</p>
              )}

              <Separator className="my-4" />

              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm capitalize text-muted-foreground">
                  {t('orders.payment')}: {order.paymentMethod === 'cod' ? t('payment.codName')
                    : order.paymentMethod === 'bank_transfer' ? t('payment.bankName')
                    : order.paymentMethod === 'tap' ? t('payment.tapName')
                    : order.paymentMethod}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {canCancel(order.orderStatus) && (
                    <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-destructive" onClick={() => setCancelModal(order.id)}>
                      <XCircle className="size-4" /> {t('orders.cancel')}
                    </Button>
                  )}
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.open(`/api/orders/${order.id}/invoice`, '_blank')}>
                    <Download className="size-4" /> {t('orders.invoice')}
                  </Button>
                  <span className="text-sm font-semibold">{t('orders.total')}: {CURRENCY}{formatPrice(order.totalAmount)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!cancelModal} onOpenChange={(open) => { if (!open) { setCancelModal(null); setCancelReason(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('orders.cancelTitle')}</DialogTitle>
            <DialogDescription>
              {t('orders.cancelConfirm')}
              {cancelOrder?.paymentStatus === 'paid' && (
                <strong className="mt-2 block text-emerald-600">{t('orders.refundAuto')}</strong>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">{t('orders.cancelReason')}</label>
            <Select value={cancelReason} onValueChange={setCancelReason}>
              <SelectTrigger><SelectValue placeholder={t('orders.selectReason')} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Changed my mind">{t('orders.reasonChangedMind')}</SelectItem>
                <SelectItem value="Found a better price">{t('orders.reasonBetterPrice')}</SelectItem>
                <SelectItem value="Ordered by mistake">{t('orders.reasonMistake')}</SelectItem>
                <SelectItem value="Delivery too slow">{t('orders.reasonSlow')}</SelectItem>
                <SelectItem value="Other">{t('orders.reasonOther')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setCancelModal(null); setCancelReason(''); }}>{t('orders.keepOrder')}</Button>
            <Button variant="destructive" onClick={handleCancel} disabled={cancelling || !cancelReason}>
              {cancelling ? t('orders.cancelling') : t('orders.confirmCancel')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
