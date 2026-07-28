import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { formatPrice, CurrencySymbol } from '../utils/currency';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { ShieldCheck, Lock, User, X } from 'lucide-react';
import api from '../api/axios';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';

const toastStyle = {
  style: {
    background: '#1a1614', color: '#f5f0eb',
    fontSize: '0.88rem', fontFamily: "'Outfit', sans-serif", borderRadius: '4px',
  },
  iconTheme: { primary: '#c4784a', secondary: '#f5f0eb' },
};

function loadScript(src) {
  return new Promise((resolve) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

// The store ships within Qatar — popular cities suggested in the address combobox
// (customers can also type any city not listed).
const QATAR_CITIES = [
  'Doha', 'Al Rayyan', 'Al Wakrah', 'Al Khor', 'Al Wukair', 'Umm Salal',
  'Al Daayen', 'Lusail', 'Mesaieed', 'Dukhan', 'Al Shamal', 'Al Shahaniya',
];

export default function Checkout() {
  const { t } = useTranslation();
  const { cart, cartTotal, clearCart } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const processingPayment = useRef(false);
  const isGuest = !user;

  // Coupon state
  const [couponCode, setCouponCode] = useState('');
  const [couponApplied, setCouponApplied] = useState(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState('');
  const [availableCoupons, setAvailableCoupons] = useState([]);
  const [showCoupons, setShowCoupons] = useState(false);

  // Tax state
  const [taxInfo, setTaxInfo] = useState({ totalTax: 0, breakdown: null });

  // Shipping state
  const [shippingOptions, setShippingOptions] = useState(null);
  const [shippingMethod, setShippingMethod] = useState('standard');

  const [form, setForm] = useState({
    fullName: user?.name || '',
    email: user?.email || '',
    address: '',
    city: '',
    state: '',
    country: 'Qatar',
    phone: user?.phone || '',
    paymentMethod: 'cod',
  });

  // Save abandoned cart when checkout page loads
  useEffect(() => {
    const email = user?.email || form.email;
    if (email && cart.length > 0) {
      api.post('/abandoned-cart/save', {
        email,
        items: cart.map((item) => ({ name: item.name, price: parseFloat(item.price), quantity: item.quantity })),
        cartTotal,
      }).catch(() => {});
    }
  }, [cart, user]);

  useEffect(() => {
    api.get('/coupons/available')
      .then((res) => setAvailableCoupons(Array.isArray(res.data) ? res.data : []))
      .catch(() => setAvailableCoupons([]));
  }, []);

  useEffect(() => {
    api.get('/payment/gateways')
      .then((res) => {
        setPaymentMethods(res.data);
      })
      .catch(() => {
        setPaymentMethods([
          { id: 'cod', name: 'Cash on Delivery', description: 'Pay when you receive your order' },
          { id: 'bank_transfer', name: 'Bank Transfer', description: 'Direct bank transfer' },
        ]);
      });
  }, [isGuest]);

  if (cart.length === 0 && !processingPayment.current) {
    navigate('/cart');
    return null;
  }

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const successUrl = (orderNum, failed) => {
    let url = `/order-success?orderNumber=${orderNum}`;
    if (failed) url += '&status=failed';
    if (isGuest && form.email) url += `&email=${encodeURIComponent(form.email)}`;
    return url;
  };

  const getShippingAddress = () => ({
    fullName: form.fullName, address: form.address,
    city: form.city, state: form.state,
    country: form.country, phone: form.phone,
  });

  const handleApplyCoupon = async (codeOverride) => {
    const code = (codeOverride ?? couponCode).trim();
    if (!code) return;
    setCouponLoading(true);
    setCouponError('');
    try {
      const { data } = await api.post('/coupons/apply', {
        code,
        cartTotal,
        cartCategories: [...new Set(cart.map((item) => item.category))],
        cartProductIds: cart.map((item) => item.id),
        paymentMethod: form.paymentMethod,
      });
      setCouponApplied(data);
      setCouponCode(code);
      setCouponError('');
      setShowCoupons(false);
      toast.success(`Coupon applied: ${data.description}`, toastStyle);
    } catch (error) {
      setCouponError(error.response?.data?.message || 'Invalid coupon');
      setCouponApplied(null);
    } finally {
      setCouponLoading(false);
    }
  };

  const handleRemoveCoupon = () => {
    setCouponApplied(null);
    setCouponCode('');
    setCouponError('');
  };

  // Fetch tax whenever state changes
  useEffect(() => {
    if (!form.state.trim()) { setTaxInfo({ totalTax: 0, breakdown: null }); return; }
    api.post('/payment/calculate-tax', {
      items: cart.map((item) => ({ productId: item.id, quantity: item.quantity })),
      shippingState: form.state,
    }).then((res) => setTaxInfo(res.data)).catch(() => {});
  }, [form.state, cart]);

  // Fetch shipping rates
  useEffect(() => {
    const afterCoupon = Math.max(0, cartTotal - (couponApplied?.discount || 0));
    api.post('/payment/calculate-shipping', {
      subtotal: afterCoupon,
      itemCount: cart.reduce((s, i) => s + i.quantity, 0),
      shippingState: form.state,
    }).then((res) => setShippingOptions(res.data)).catch(() => {});
  }, [cartTotal, couponApplied, cart, form.state]);

  const discountAmount = couponApplied?.discount || 0;
  const taxAmount = taxInfo.totalTax || 0;

  const handleCODOrder = async () => {
    const orderData = {
      items: cart.map((item) => ({ productId: item.id, quantity: item.quantity, selectedVariant: item.selectedVariant || null })),
      shippingAddress: getShippingAddress(),
      shippingMethod,
      paymentMethod: form.paymentMethod,
      couponCode: couponApplied?.code || null,
    };

    if (isGuest) {
      orderData.guestEmail = form.email;
      const { data } = await api.post('/orders/guest', orderData);
      api.post('/abandoned-cart/recover', { email: form.email }).catch(() => {});
      // Mark payment as processing before clearCart() so the empty-cart guard
      // doesn't redirect to /cart instead of the order-success page.
      processingPayment.current = true;
      navigate(successUrl(data.orderNumber));
      clearCart();
    } else {
      const { data } = await api.post('/orders', orderData);
      api.post('/abandoned-cart/recover', { email: user.email }).catch(() => {});
      processingPayment.current = true;
      navigate(successUrl(data.orderNumber));
      clearCart();
    }
  };

  const handleRazorpayPayment = async () => {
    const loaded = await loadScript('https://checkout.razorpay.com/v1/checkout.js');
    if (!loaded) {
      toast.error('Failed to load Razorpay. Check your internet connection.');
      return;
    }

    const createPayload = {
      items: cart.map((item) => ({ productId: item.id, quantity: item.quantity, selectedVariant: item.selectedVariant || null })),
      shippingAddress: getShippingAddress(),
      shippingMethod,
      gateway: 'razorpay',
      couponCode: couponApplied?.code || null,
    };
    if (isGuest) createPayload.guestEmail = form.email;

    const { data } = await api.post('/payment/create-order', createPayload);

    const { payment, order } = data;

    const options = {
      key: payment.key,
      amount: payment.amount,
      currency: payment.currency || 'QAR',
      name: payment.name,
      description: payment.description,
      order_id: payment.orderId,
      prefill: {
        name: form.fullName,
        email: isGuest ? form.email : user.email,
        contact: form.phone,
      },
      notes: {
        order_number: order.orderNumber,
      },
      theme: { color: '#1a1614' },
      handler: async function (response) {
        try {
          const verifyRes = await api.post('/payment/verify', {
            orderNumber: order.orderNumber,
            gateway: 'razorpay',
            paymentData: {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            },
          });

          if (verifyRes.data.verified) {
            navigate(successUrl(order.orderNumber));
            clearCart();
          } else {
            navigate(successUrl(order.orderNumber, true));
          }
        } catch (error) {
          navigate(successUrl(order.orderNumber, true));
        }
        setLoading(false);
      },
      modal: {
        confirm_close: true,
        ondismiss: function () {
          toast.error('Payment cancelled', toastStyle);
          setLoading(false);
        },
      },
    };

    const rzp = new window.Razorpay(options);
    rzp.on('payment.failed', function (response) {
      console.error('Razorpay payment failed:', response.error);
      toast.error(response.error.description || 'Payment failed', toastStyle);
      setLoading(false);
    });
    processingPayment.current = true;
    rzp.open();
  };

  const handleStripePayment = async () => {
    const createPayload = {
      items: cart.map((item) => ({ productId: item.id, quantity: item.quantity, selectedVariant: item.selectedVariant || null })),
      shippingAddress: getShippingAddress(),
      shippingMethod,
      gateway: 'stripe',
      couponCode: couponApplied?.code || null,
    };
    if (isGuest) createPayload.guestEmail = form.email;

    const { data } = await api.post('/payment/create-order', createPayload);
    if (data.payment?.sessionUrl) {
      // Cart is cleared on the order-success page only after a successful return
      // — not here — so an abandoned/failed online payment keeps the cart intact.
      window.location.href = data.payment.sessionUrl;
    } else {
      toast.error('Failed to create Stripe checkout session');
    }
  };

  const handleNomodPayment = async () => {
    const createPayload = {
      items: cart.map((item) => ({ productId: item.id, quantity: item.quantity, selectedVariant: item.selectedVariant || null })),
      shippingAddress: getShippingAddress(),
      shippingMethod,
      gateway: 'nomod',
      couponCode: couponApplied?.code || null,
    };
    if (isGuest) createPayload.guestEmail = form.email;

    const { data } = await api.post('/payment/create-order', createPayload);
    if (data.payment?.sessionUrl) {
      // Cart is cleared on the order-success page only after a successful return
      // — not here — so an abandoned/failed online payment keeps the cart intact.
      window.location.href = data.payment.sessionUrl;
    } else {
      toast.error('Failed to create Nomod checkout session');
    }
  };

  const handleTapPayment = async () => {
    const createPayload = {
      items: cart.map((item) => ({ productId: item.id, quantity: item.quantity, selectedVariant: item.selectedVariant || null })),
      shippingAddress: getShippingAddress(),
      shippingMethod,
      gateway: 'tap',
      couponCode: couponApplied?.code || null,
    };
    if (isGuest) createPayload.guestEmail = form.email;

    const { data } = await api.post('/payment/create-order', createPayload);
    if (data.payment?.sessionUrl) {
      // Cart is cleared on the order-success page only after a successful return
      // — not here — so an abandoned/failed online payment keeps the cart intact.
      window.location.href = data.payment.sessionUrl;
    } else {
      toast.error('Failed to create Tap checkout session');
    }
  };

  const handleTamaraPayment = async () => {
    const createPayload = {
      items: cart.map((item) => ({ productId: item.id, quantity: item.quantity, selectedVariant: item.selectedVariant || null })),
      shippingAddress: getShippingAddress(),
      shippingMethod,
      gateway: 'tamara',
      couponCode: couponApplied?.code || null,
    };
    if (isGuest) createPayload.guestEmail = form.email;

    const { data } = await api.post('/payment/create-order', createPayload);
    if (data.payment?.sessionUrl) {
      // Cart is cleared on the order-success page only after a successful return
      // — not here — so an abandoned/failed online payment keeps the cart intact.
      window.location.href = data.payment.sessionUrl;
    } else {
      toast.error('Failed to create Tamara checkout session');
    }
  };

  const verifyPaytmOrder = async (orderNumber, paymentOrderId) => {
    try {
      const verifyRes = await api.post('/payment/verify', {
        orderNumber,
        gateway: 'paytm',
        paymentData: { orderId: paymentOrderId },
      });

      if (verifyRes.data.verified) {
        navigate(successUrl(orderNumber));
        clearCart();
        return true;
      } else {
        navigate(successUrl(orderNumber, true));
        return false;
      }
    } catch (error) {
      console.error('Paytm verify error:', error);
      navigate(successUrl(orderNumber, true));
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handlePaytmPayment = async () => {
    const paytmPayload = {
      items: cart.map((item) => ({ productId: item.id, quantity: item.quantity, selectedVariant: item.selectedVariant || null })),
      shippingAddress: getShippingAddress(),
      shippingMethod,
      gateway: 'paytm',
      couponCode: couponApplied?.code || null,
    };
    if (isGuest) paytmPayload.guestEmail = form.email;

    const { data } = await api.post('/payment/create-order', paytmPayload);

    const { payment, order } = data;
    const scriptUrl = `${payment.baseUrl}/merchantpgpui/checkoutjs/merchants/${payment.mid}.js`;

    const loaded = await loadScript(scriptUrl);
    if (!loaded) {
      toast.error('Failed to load Paytm checkout. Check your internet connection.');
      setLoading(false);
      return;
    }

    let handled = false;

    const config = {
      root: '',
      flow: 'DEFAULT',
      data: {
        orderId: payment.orderId,
        token: payment.txnToken,
        tokenType: 'TXN_TOKEN',
        amount: payment.amount.toFixed(2),
      },
      handler: {
        notifyMerchant: function (eventName, eventData) {
          console.log('Paytm notifyMerchant:', eventName, eventData);
          if (eventName === 'APP_CLOSED') {
            if (!handled) {
              handled = true;
              verifyPaytmOrder(order.orderNumber, payment.orderId);
            }
          }
        },
        transactionStatus: function (response) {
          console.log('Paytm transactionStatus:', JSON.stringify(response));
          if (handled) return;
          handled = true;
          try {
            if (window.Paytm && window.Paytm.CheckoutJS) {
              window.Paytm.CheckoutJS.close();
            }
          } catch (e) {}
          verifyPaytmOrder(order.orderNumber, payment.orderId);
        },
      },
    };

    if (window.Paytm && window.Paytm.CheckoutJS) {
      window.Paytm.CheckoutJS.onLoad(function () {
        window.Paytm.CheckoutJS.init(config)
          .then(function () {
            processingPayment.current = true;
            window.Paytm.CheckoutJS.invoke();
          })
          .catch(function (error) {
            console.error('Paytm init error:', error);
            toast.error('Failed to initialize Paytm checkout');
            setLoading(false);
          });
      });
    } else {
      toast.error('Paytm checkout not available');
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.city.trim()) {
      toast.error(t('checkout.cityRequired'), toastStyle);
      return;
    }

    setLoading(true);

    try {
      const method = form.paymentMethod;

      if (method === 'cod' || method === 'bank_transfer') {
        await handleCODOrder();
      } else if (method === 'razorpay') {
        await handleRazorpayPayment();
      } else if (method === 'paytm') {
        await handlePaytmPayment();
      } else if (method === 'stripe') {
        await handleStripePayment();
      } else if (method === 'nomod') {
        await handleNomodPayment();
      } else if (method === 'tap') {
        await handleTapPayment();
      } else if (method === 'tamara') {
        await handleTamaraPayment();
      } else {
        toast.error(`${method} gateway is not configured yet. Please choose another method.`);
        setLoading(false);
        return;
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to place order');
    } finally {
      setLoading(false);
    }
  };

  const shipping = shippingOptions?.[shippingMethod]?.rate ?? 0;
  // Tax is inclusive in price — not added on top
  const grandTotal = Math.max(0, cartTotal - discountAmount + shipping);
  const isOnlinePayment = !['cod', 'bank_transfer'].includes(form.paymentMethod);

  const Row = ({ label, value, className }) => (
    <div className={cn('flex justify-between text-sm', className)}>
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );

  // Price with the QAR currency label (text via <CurrencySymbol />).
  // nowrap keeps the label glued to the amount.
  const Money = ({ amount, sign = '' }) => (
    <span className="whitespace-nowrap">{sign}<CurrencySymbol />{formatPrice(amount)}</span>
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <h1 className="mb-6 font-serif text-3xl font-semibold tracking-tight">{t('checkout.title')}</h1>

      {isGuest && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-secondary/40 px-4 py-3 text-sm">
          <span className="flex items-center gap-2 text-muted-foreground">
            <User className="size-4" /> {t('checkout.guest')}
          </span>
          <Link to="/login" className="font-medium text-primary hover:underline">{t('checkout.guestSignIn')}</Link>
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid gap-8 lg:grid-cols-[1fr_380px]">
        {/* Left: address + payment */}
        <div className="flex min-w-0 flex-col gap-8">
          {/* Address */}
          <section className="rounded-lg border border-border bg-card p-6">
            {isGuest && (
              <div className="mb-5 flex flex-col gap-2">
                <Label htmlFor="email">{t('checkout.email')}</Label>
                <Input
                  id="email"
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  placeholder={t('checkout.emailPlaceholder')}
                  required
                />
              </div>
            )}

            <h3 className="mb-4 font-medium">{t('checkout.shippingAddress')}</h3>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="fullName">{t('checkout.fullName')}</Label>
                <Input id="fullName" name="fullName" value={form.fullName} onChange={handleChange} required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="address">{t('checkout.address', { defaultValue: 'Address' })}</Label>
                <Input
                  id="address"
                  name="address"
                  value={form.address}
                  onChange={handleChange}
                  placeholder={t('checkout.addressPlaceholder')}
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="city">{t('checkout.city', { defaultValue: 'City' })}</Label>
                <Input
                  id="city"
                  name="city"
                  list="qatar-cities"
                  value={form.city}
                  onChange={(e) => setForm((f) => ({ ...f, city: e.target.value, state: e.target.value }))}
                  placeholder={t('checkout.cityPlaceholder')}
                  autoComplete="off"
                  required
                />
                <datalist id="qatar-cities">
                  {QATAR_CITIES.map((c) => <option key={c} value={c} />)}
                </datalist>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="phone">{t('checkout.phone')}</Label>
                <Input id="phone" name="phone" value={form.phone} onChange={handleChange} required />
              </div>
            </div>
          </section>

          {/* Payment */}
          <section className="rounded-lg border border-border bg-card p-6">
            <h3 className="mb-4 font-medium">{t('checkout.paymentMethod')}</h3>
            <RadioGroup
              value={form.paymentMethod}
              onValueChange={(v) => setForm((f) => ({ ...f, paymentMethod: v }))}
              className="gap-3"
            >
              {paymentMethods.map((method) => (
                <Label
                  key={method.id}
                  htmlFor={`pm-${method.id}`}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors',
                    form.paymentMethod === method.id ? 'border-primary bg-primary/5' : 'border-input hover:bg-accent',
                  )}
                >
                  <RadioGroupItem id={`pm-${method.id}`} value={method.id} className="mt-0.5" />
                  <div className="flex flex-col">
                    <span className="font-medium">
                      {method.id === 'cod' ? t('payment.codName')
                        : method.id === 'bank_transfer' ? t('payment.bankName')
                        : method.id === 'tap' ? t('payment.tapName')
                        : method.name}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {method.id === 'cod' ? t('payment.codDesc')
                        : method.id === 'bank_transfer' ? t('payment.bankDesc')
                        : method.id === 'tap' ? t('payment.tapDesc')
                        : method.description}
                    </span>
                  </div>
                </Label>
              ))}
            </RadioGroup>

            {isOnlinePayment && (
              <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                <Lock className="size-3.5" /> {t('checkout.securedPayment')}
              </p>
            )}

            <Button type="submit" size="lg" className="mt-6 w-full" disabled={loading}>
              {loading
                ? t('checkout.placingOrder')
                : isOnlinePayment
                  ? <>{t('checkout.placeOrder')} — <Money amount={grandTotal} /></>
                  : t('checkout.placeOrder')}
            </Button>
          </section>
        </div>

        {/* Right: order summary */}
        <aside className="min-w-0">
          <div className="sticky top-20 rounded-lg border border-border bg-card p-6">
            <h3 className="mb-4 font-medium">{t('checkout.orderSummary')}</h3>

            <div className="flex flex-col gap-2">
              {cart.map((item) => (
                <Row
                  key={item.cartKey}
                  label={`${item.name}${item.selectedVariant ? ` (${Object.values(item.selectedVariant).join(', ')})` : ''} × ${item.quantity}`}
                  value={<Money amount={parseFloat(item.price) * item.quantity} />}
                />
              ))}
            </div>

            <Separator className="my-4" />

            {/* Coupon */}
            <div className="mb-4">
              {couponApplied ? (
                <div className="flex items-center justify-between rounded-md border border-primary/30 bg-primary/5 p-3">
                  <div className="flex flex-col">
                    <Badge className="w-fit">{couponApplied.code}</Badge>
                    <span className="mt-1 text-xs text-muted-foreground">{couponApplied.description}</span>
                  </div>
                  <Button type="button" variant="ghost" size="icon-sm" onClick={handleRemoveCoupon} aria-label="Remove coupon">
                    <X className="size-4" />
                  </Button>
                </div>
              ) : (
                <>
                  <div className="flex gap-2">
                    <Input
                      value={couponCode}
                      onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); setCouponError(''); }}
                      placeholder={t('cart.couponPlaceholder')}
                    />
                    <Button type="button" variant="outline" onClick={() => handleApplyCoupon()} disabled={couponLoading}>
                      {couponLoading ? '…' : t('cart.couponApply')}
                    </Button>
                  </div>
                  {availableCoupons.length > 0 && (
                    <button
                      type="button"
                      className="mt-2 text-xs font-medium text-primary hover:underline"
                      onClick={() => setShowCoupons((s) => !s)}
                    >
                      {showCoupons ? t('checkout.hide') : t('checkout.view')} {availableCoupons.length} {t('checkout.availableCoupons')}
                    </button>
                  )}
                  {showCoupons && (
                    <ul className="mt-2 flex flex-col gap-2">
                      {availableCoupons.map((c) => {
                        const valueLabel = c.type === 'percentage'
                          ? <>{c.value}% {t('checkout.off')}{c.maxDiscount ? <> ({t('checkout.upTo')} <Money amount={c.maxDiscount} />)</> : ''}</>
                          : <><Money amount={c.value} /> {t('checkout.off')}</>;
                        const eligible = cartTotal >= c.minOrderAmount;
                        return (
                          <li key={c.code} className={cn('flex items-center justify-between gap-2 rounded-md border border-border p-3', !eligible && 'opacity-60')}>
                            <div className="min-w-0">
                              <Badge variant="outline" className="font-mono">{c.code}</Badge>
                              <span className="ml-2 text-sm font-medium">{valueLabel}</span>
                              {c.description && <p className="text-xs text-muted-foreground">{c.description}</p>}
                              {c.minOrderAmount > 0 && (
                                <p className="text-xs text-muted-foreground">
                                  {t('checkout.minOrder')} <Money amount={c.minOrderAmount} />
                                  {!eligible && <> · {t('checkout.addMore')} <Money amount={c.minOrderAmount - cartTotal} /> {t('checkout.more')}</>}
                                </p>
                              )}
                            </div>
                            <Button type="button" size="sm" variant="outline" onClick={() => handleApplyCoupon(c.code)} disabled={couponLoading || !eligible}>
                              {t('cart.couponApply')}
                            </Button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </>
              )}
              {couponError && <p className="mt-2 text-xs text-destructive">{couponError}</p>}
            </div>

            <div className="flex flex-col gap-2">
              <Row label={t('cart.subtotal')} value={<Money amount={cartTotal} />} />
              {discountAmount > 0 && (
                <Row label={t('cart.discount')} value={<Money amount={discountAmount} sign="-" />} className="text-emerald-600" />
              )}
              {taxAmount > 0 && (
                <Row label={t('checkout.inclVat')} value={<Money amount={taxAmount} />} className="text-xs" />
              )}
            </div>

            {/* Shipping */}
            {shippingOptions && (
              <RadioGroup value={shippingMethod} onValueChange={setShippingMethod} className="mt-4 gap-2">
                {['standard', 'express'].map((key) => {
                  const opt = shippingOptions[key];
                  if (!opt) return null;
                  return (
                    <Label
                      key={key}
                      htmlFor={`ship-${key}`}
                      className={cn(
                        'flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm transition-colors',
                        shippingMethod === key ? 'border-primary bg-primary/5' : 'border-input hover:bg-accent',
                      )}
                    >
                      <RadioGroupItem id={`ship-${key}`} value={key} />
                      <div className="flex flex-1 flex-col">
                        <span className="font-medium">
                          {key === 'standard' && opt.rate === 0 ? t('shippingOpt.freeShipping') : t(`shippingOpt.${key}`, { defaultValue: opt.label })}
                        </span>
                        <span className="text-xs text-muted-foreground">{t(`shippingOpt.${key}Days`, { defaultValue: opt.days })}</span>
                      </div>
                      <span className="font-medium">{opt.rate === 0 ? t('shippingOpt.free') : <Money amount={opt.rate} />}</span>
                    </Label>
                  );
                })}
                {shippingOptions.amountForFree && (
                  <p className="text-xs text-muted-foreground">{t('shippingOpt.addMorePre')} <Money amount={shippingOptions.amountForFree} /> {t('shippingOpt.addMorePost')}</p>
                )}
              </RadioGroup>
            )}

            <Separator className="my-4" />
            <div className="flex justify-between text-base font-semibold">
              <span>{t('cart.total')}</span>
              <span><Money amount={grandTotal} /></span>
            </div>

            <p className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="size-4 text-emerald-600" /> {t('checkout.secureCheckout')}
            </p>
          </div>
        </aside>
      </form>
    </div>
  );
}
