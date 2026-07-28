import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, XCircle, Download } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import { CURRENCY, formatPrice } from '../utils/currency';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';

export default function OrderSuccess() {
  const [searchParams] = useSearchParams();
  const { clearCart } = useCart();
  const { user } = useAuth();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  const orderNumber = searchParams.get('orderNumber');
  const guestEmail = searchParams.get('email');
  const sessionId = searchParams.get('session_id');
  const tapChargeId = searchParams.get('tap_id');
  const status = searchParams.get('status');
  const isFailed = status === 'failed';
  const isGuest = !user;

  useEffect(() => {
    if (!isFailed) clearCart();

    if (sessionId && orderNumber) {
      api.post('/payment/verify', { orderNumber, gateway: 'stripe', paymentData: { sessionId } }).catch(() => {});
    }
    if (tapChargeId && orderNumber) {
      api.post('/payment/verify', { orderNumber, gateway: 'tap', paymentData: { chargeId: tapChargeId } }).catch(() => {});
    }

    if (orderNumber) {
      if (isGuest && guestEmail) {
        api.get(`/orders/track?orderNumber=${orderNumber}&email=${encodeURIComponent(guestEmail)}`)
          .then((res) => {
            setOrder(res.data);
            if (res.data?.paymentMethod === 'nomod' && res.data?.paymentStatus !== 'paid') {
              api.post('/payment/nomod-verify', { orderNumber, guestEmail }).catch(() => {});
            }
            if (res.data?.paymentMethod === 'tamara' && res.data?.paymentStatus !== 'paid') {
              api.post('/payment/tamara-verify', { orderNumber, guestEmail }).catch(() => {});
            }
          })
          .catch(console.error)
          .finally(() => setLoading(false));
      } else if (!isGuest) {
        api.get('/orders/my-orders')
          .then((res) => {
            const found = res.data.find((o) => o.orderNumber === orderNumber);
            if (found) {
              setOrder(found);
              if (found.paymentMethod === 'nomod' && found.paymentStatus !== 'paid') {
                api.post('/payment/nomod-verify', { orderNumber }).catch(() => {});
              }
              if (found.paymentMethod === 'tamara' && found.paymentStatus !== 'paid') {
                api.post('/payment/tamara-verify', { orderNumber }).catch(() => {});
              }
            }
          })
          .catch(console.error)
          .finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    } else {
      setLoading(false);
    }
  }, []);

  if (loading) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <Skeleton className="mx-auto h-16 w-16 rounded-full" />
        <Skeleton className="mx-auto mt-6 h-8 w-56" />
        <Skeleton className="mt-8 h-40 w-full rounded-lg" />
      </div>
    );
  }

  const Row = ({ label, value }) => (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium capitalize">{value}</span>
    </div>
  );

  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      {isFailed ? (
        <XCircle className="mx-auto size-16 text-destructive" strokeWidth={1.5} />
      ) : (
        <CheckCircle2 className="mx-auto size-16 text-emerald-600" strokeWidth={1.5} />
      )}
      <h1 className="mt-5 font-serif text-3xl font-semibold tracking-tight">
        {isFailed ? 'Payment failed' : 'Order confirmed!'}
      </h1>
      <p className="mt-2 text-muted-foreground">
        {isFailed
          ? 'Your payment could not be processed. No amount has been charged.'
          : 'Thank you for your purchase. Your order has been placed successfully.'}
      </p>

      {(order || orderNumber) && (
        <Card className="mt-8 text-left">
          <CardContent className="flex flex-col gap-3">
            <Row label="Order number" value={order?.orderNumber || orderNumber} />
            {order && (
              <>
                <Row label="Amount" value={`${CURRENCY}${formatPrice(order.totalAmount)}`} />
                <Row label="Payment" value={order.paymentStatus} />
                <Row label="Status" value={order.orderStatus} />
              </>
            )}
          </CardContent>
        </Card>
      )}

      {isGuest && !isFailed && guestEmail && (
        <p className="mt-4 text-sm text-muted-foreground">
          A confirmation has been sent to <strong>{guestEmail}</strong>. Save your order number to track your order.
        </p>
      )}

      <Separator className="my-8" />

      <div className="flex flex-wrap justify-center gap-3">
        {order && !isFailed && (
          <Button
            className="gap-1.5"
            onClick={() => {
              const url = isGuest
                ? `/api/orders/${order.id}/invoice?email=${encodeURIComponent(guestEmail)}`
                : `/api/orders/${order.id}/invoice`;
              window.open(url, '_blank');
            }}
          >
            <Download className="size-4" /> Download invoice
          </Button>
        )}
        {!isGuest && <Button asChild variant="outline"><Link to="/orders">View my orders</Link></Button>}
        <Button asChild variant="outline"><Link to="/products">Continue shopping</Link></Button>
        {isGuest && <Button asChild><Link to="/register">Create account</Link></Button>}
      </div>
    </div>
  );
}
