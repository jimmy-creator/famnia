import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { useCart } from '../context/CartContext';
import { CURRENCY } from '../utils/currency';
import SEO from '../components/SEO';

const SR_SCRIPT = 'https://checkout-ui.shiprocket.com/assets/js/channels/shopify.js';
const SR_STYLE = 'https://checkout-ui.shiprocket.com/assets/styles/shopify.css';

function loadScriptOnce(src) {
  return new Promise((resolve) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve(true);
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

function loadStyleOnce(href) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = href;
  document.head.appendChild(l);
}

export default function ShiprocketCheckout() {
  const { cart, cartTotal, cartCount } = useCart();
  const [loading, setLoading] = useState(false);
  const [scriptReady, setScriptReady] = useState(false);
  const buttonRef = useRef(null);

  useEffect(() => {
    loadStyleOnce(SR_STYLE);
    loadScriptOnce(SR_SCRIPT).then((ok) => setScriptReady(ok));
  }, []);

  // Bounce empties straight back to the cart.
  if (cart.length === 0) {
    return (
      <div className="checkout-page">
        <div className="container" style={{ padding: '4rem 1.5rem', textAlign: 'center' }}>
          <h1>Checkout</h1>
          <p style={{ margin: '1.5rem 0', color: 'var(--text-secondary)' }}>
            Your cart is empty.
          </p>
          <Link to="/products" className="btn btn-primary">Continue shopping</Link>
        </div>
      </div>
    );
  }

  const handleCheckout = async (event) => {
    if (!scriptReady) {
      toast.error('Checkout script still loading — please try again in a moment.');
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post('/shiprocket/init-checkout', {
        items: cart.map((item) => ({
          productId: item.id,
          quantity: item.quantity,
          selectedVariant: item.selectedVariant || null,
        })),
        redirectUrl: `${window.location.origin}/order-success`,
      });

      if (!data?.token) {
        throw new Error(data?.message || 'Could not initialize checkout');
      }

      if (typeof window.HeadlessCheckout?.addToCart !== 'function') {
        throw new Error('Shiprocket Checkout SDK not available');
      }

      window.HeadlessCheckout.addToCart(event, data.token, {
        fallbackUrl: `${window.location.origin}/cart`,
      });
    } catch (err) {
      console.error('Shiprocket init error:', err);
      toast.error(err.response?.data?.message || err.message || 'Could not start checkout');
      setLoading(false);
    }
  };

  return (
    <div className="checkout-page">
      <SEO title="Checkout" description="Complete your order securely." />

      {/* Hidden sellerDomain field — required by the Shiprocket script. */}
      <input
        type="hidden"
        id="sellerDomain"
        value={(import.meta.env.VITE_SITE_URL || window.location.origin).replace(/^https?:\/\//, '').replace(/\/$/, '')}
      />

      <div className="container" style={{ maxWidth: 720, padding: '3rem 1.5rem 5rem' }}>
        <h1>Checkout</h1>

        <div className="checkout-section" style={{ marginTop: '1.5rem' }}>
          <h3 style={{ marginTop: 0 }}>Order summary</h3>
          {cart.map((item) => (
            <div key={item.cartKey || item.id} className="summary-item">
              <span>
                {item.name}
                {item.selectedVariant && ` (${Object.values(item.selectedVariant).join(', ')})`}
                {' x '}{item.quantity}
              </span>
              <span>{CURRENCY}{(parseFloat(item.price) * item.quantity).toFixed(2)}</span>
            </div>
          ))}
          <div className="summary-row total" style={{ marginTop: '1rem' }}>
            <span>Total</span>
            <span>{CURRENCY}{cartTotal.toFixed(2)}</span>
          </div>
        </div>

        <div className="checkout-section" style={{ marginTop: '1.5rem', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem', fontSize: '0.9rem' }}>
            Address, payment and delivery handled securely by Shiprocket.
          </p>
          <button
            ref={buttonRef}
            id="buyNow"
            type="button"
            className="btn btn-primary"
            style={{ width: '100%', padding: '0.95rem', fontSize: '1rem' }}
            onClick={handleCheckout}
            disabled={loading || !scriptReady || cartCount === 0}
          >
            {loading
              ? 'Opening checkout…'
              : !scriptReady
                ? 'Loading…'
                : `Checkout ${CURRENCY}${cartTotal.toFixed(2)}`}
          </button>
          <p style={{ marginTop: '0.75rem', fontSize: '0.78rem', color: 'var(--text-light)' }}>
            By proceeding you agree to our <Link to="/terms">Terms</Link> and <Link to="/refund-policy">Refund Policy</Link>.
          </p>
        </div>

        <p style={{ marginTop: '2rem', textAlign: 'center', fontSize: '0.85rem' }}>
          <Link to="/cart" style={{ color: 'var(--text-secondary)' }}>← Back to cart</Link>
        </p>
      </div>
    </div>
  );
}
