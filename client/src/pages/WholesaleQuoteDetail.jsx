import { useState, useEffect } from 'react';
import { useParams, useNavigate, Navigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { CURRENCY } from '../utils/currency';
import SEO from '../components/SEO';

function loadScript(src) {
  return new Promise((resolve) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve(true);
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

export default function WholesaleQuoteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [quote, setQuote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [bankDetails, setBankDetails] = useState('');
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    if (!user) return;
    api.get(`/b2b/requests/${id}`)
      .then((res) => setQuote(res.data))
      .catch(() => setQuote(null))
      .finally(() => setLoading(false));
  }, [id, user]);

  useEffect(() => {
    if (quote?.paymentMethod === 'bank_transfer' && quote?.status === 'quoted') {
      api.get('/settings/b2b-bank-details')
        .then((res) => setBankDetails(res.data.value || ''))
        .catch(() => {});
    }
  }, [quote?.paymentMethod, quote?.status]);

  if (authLoading) return null;
  if (!user) return <Navigate to={`/login?next=/wholesale/my-quotes/${id}`} replace />;

  if (loading) {
    return <div className="s2-root"><div className="s2-container" style={{ padding: '3rem 1.5rem' }}><p style={{ color: 'var(--s2-text-dim)' }}>Loading…</p></div></div>;
  }
  if (!quote) {
    return <div className="s2-root"><div className="s2-container" style={{ padding: '3rem 1.5rem' }}><p>Quote not found.</p></div></div>;
  }

  const isQuoted = quote.status === 'quoted';
  const isPaid = quote.status === 'paid';
  const expired = quote.quotedValidUntil && new Date(quote.quotedValidUntil) < new Date();

  const payOnline = async () => {
    setPaying(true);
    try {
      const { data: init } = await api.post(`/b2b/requests/${quote.id}/pay-init`, {});

      if (init.gateway === 'razorpay') {
        const loaded = await loadScript('https://checkout.razorpay.com/v1/checkout.js');
        if (!loaded) { toast.error('Failed to load checkout'); setPaying(false); return; }

        const rzp = new window.Razorpay({
          key: init.key,
          amount: init.amount,
          currency: init.currency,
          name: init.name,
          description: init.description,
          order_id: init.orderId,
          prefill: { name: quote.contactName, email: user.email, contact: quote.contactPhone || '' },
          handler: async (response) => {
            try {
              const { data: verify } = await api.post(`/b2b/requests/${quote.id}/verify-payment`, {
                paymentData: {
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                },
              });
              if (verify.verified) {
                toast.success('Payment received — thank you!');
                navigate('/wholesale/my-quotes');
              } else {
                toast.error('Payment could not be verified');
              }
            } catch {
              toast.error('Verification failed');
            } finally {
              setPaying(false);
            }
          },
          modal: { ondismiss: () => { setPaying(false); toast.error('Payment cancelled'); } },
        });
        rzp.open();
      } else if (init.sessionUrl) {
        // Hosted-checkout gateways (Stripe, Nomod, etc.)
        window.location.href = init.sessionUrl;
      } else {
        toast.error('Unsupported gateway');
        setPaying(false);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to start payment');
      setPaying(false);
    }
  };

  const cancel = async () => {
    if (!confirm('Cancel this request?')) return;
    try {
      await api.patch(`/b2b/requests/${quote.id}/cancel`);
      toast.success('Request cancelled');
      navigate('/wholesale/my-quotes');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    }
  };

  return (
    <div className="s2-root">
      <SEO title={`Quote ${quote.requestNumber}`} description="Quote details." />

      <div className="s2-container" style={{ padding: '3rem 1.5rem 5rem', maxWidth: 760 }}>
        <Link to="/wholesale/my-quotes" style={{ fontSize: '0.85rem', color: 'var(--s2-text-dim)', textDecoration: 'none' }}>← All quotes</Link>

        <p className="s2-eyebrow" style={{ marginTop: '1rem', marginBottom: '0.5rem' }}>{quote.requestNumber}</p>
        <h1 style={{
          fontFamily: 'var(--s2-font-display)',
          fontSize: 'clamp(1.6rem, 3.6vw, 2.2rem)',
          fontWeight: 400,
          letterSpacing: '-0.015em',
          margin: '0 0 1.5rem',
        }}>
          {isPaid ? 'Paid' : isQuoted ? 'Your quote is ready' : quote.status === 'pending' ? 'We have your request' : `Status: ${quote.status}`}
        </h1>

        {quote.adminNote && (
          <div style={{ padding: '1rem 1.25rem', background: 'var(--s2-bg-warm, #faf8f5)', borderLeft: '3px solid var(--s2-accent, #6b3fa0)', borderRadius: '6px', marginBottom: '1.5rem', whiteSpace: 'pre-wrap', fontSize: '0.9rem', lineHeight: 1.6 }}>
            {quote.adminNote}
          </div>
        )}

        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1.5rem', border: '1px solid var(--s2-border)', borderRadius: '8px', overflow: 'hidden' }}>
          <thead>
            <tr style={{ background: 'var(--s2-bg-warm, #faf8f5)' }}>
              <th style={{ padding: '0.6rem 0.85rem', textAlign: 'left', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--s2-text-dim)' }}>Item</th>
              <th style={{ padding: '0.6rem 0.85rem', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--s2-text-dim)', textAlign: 'center', width: 60 }}>Qty</th>
              {isQuoted || isPaid ? (
                <>
                  <th style={{ padding: '0.6rem 0.85rem', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--s2-text-dim)', textAlign: 'right', width: 100 }}>Unit</th>
                  <th style={{ padding: '0.6rem 0.85rem', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--s2-text-dim)', textAlign: 'right', width: 110 }}>Line</th>
                </>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {(quote.items || []).map((it, idx) => (
              <tr key={idx} style={{ borderTop: '1px solid var(--s2-border)' }}>
                <td style={{ padding: '0.7rem 0.85rem', fontSize: '0.9rem' }}>{it.name}</td>
                <td style={{ padding: '0.7rem 0.85rem', textAlign: 'center', fontSize: '0.9rem' }}>{it.quantity}</td>
                {(isQuoted || isPaid) && (
                  <>
                    <td style={{ padding: '0.7rem 0.85rem', textAlign: 'right', fontSize: '0.9rem', color: 'var(--s2-text-dim)' }}>{CURRENCY}{parseFloat(it.unitPrice || 0).toFixed(2)}</td>
                    <td style={{ padding: '0.7rem 0.85rem', textAlign: 'right', fontSize: '0.9rem', fontWeight: 600 }}>{CURRENCY}{parseFloat(it.lineTotal || 0).toFixed(2)}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
          {(isQuoted || isPaid) && (
            <tfoot>
              <tr style={{ borderTop: '1px solid var(--s2-border)' }}>
                <td colSpan={3} style={{ padding: '0.85rem', textAlign: 'right', fontSize: '0.88rem', color: 'var(--s2-text-dim)' }}>Total</td>
                <td style={{ padding: '0.85rem', textAlign: 'right', fontSize: '1.05rem', fontWeight: 700 }}>{CURRENCY}{parseFloat(quote.quotedTotal || 0).toFixed(2)}</td>
              </tr>
            </tfoot>
          )}
        </table>

        {quote.customerNote && (
          <p style={{ marginBottom: '1.5rem', fontSize: '0.85rem', color: 'var(--s2-text-dim)' }}>
            <strong>Your note:</strong> {quote.customerNote}
          </p>
        )}

        {isQuoted && quote.quotedValidUntil && (
          <p style={{ fontSize: '0.85rem', color: expired ? 'crimson' : 'var(--s2-text-dim)', marginBottom: '1.5rem' }}>
            {expired ? 'This quote has expired. Please request a fresh quote.' : <>Valid until <strong>{new Date(quote.quotedValidUntil).toLocaleDateString()}</strong>.</>}
          </p>
        )}

        {isQuoted && !expired && quote.paymentMethod === 'online' && (
          <button type="button" onClick={payOnline} disabled={paying} className="s2-btn s2-btn-primary s2-btn-lg" style={{ width: '100%', marginBottom: '1rem' }}>
            {paying ? 'Opening checkout…' : `Pay ${CURRENCY}${parseFloat(quote.quotedTotal || 0).toFixed(2)} online`}
          </button>
        )}

        {isQuoted && !expired && quote.paymentMethod === 'bank_transfer' && (
          <div style={{ padding: '1.25rem', background: 'var(--s2-bg-warm, #faf8f5)', border: '1px solid var(--s2-border)', borderRadius: '8px', marginBottom: '1rem' }}>
            <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.95rem' }}>Bank transfer details</h3>
            {bankDetails ? (
              <pre style={{ margin: 0, fontFamily: 'inherit', fontSize: '0.88rem', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{bankDetails}</pre>
            ) : (
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--s2-text-dim)' }}>Bank details will be shared with you via email. Please check your inbox.</p>
            )}
            <p style={{ margin: '0.75rem 0 0', fontSize: '0.8rem', color: 'var(--s2-text-dim)' }}>Once paid, reply to the quote email with the transaction reference. We'll confirm and dispatch.</p>
          </div>
        )}

        {(quote.status === 'pending' || quote.status === 'quoted') && !isPaid && (
          <button type="button" onClick={cancel} className="s2-btn s2-btn-secondary" style={{ width: '100%', marginTop: '0.5rem' }}>
            Cancel request
          </button>
        )}
      </div>
    </div>
  );
}
