import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import SEO from '../components/SEO';

export default function Wholesale() {
  const { user } = useAuth();
  const storeName = import.meta.env.VITE_STORE_NAME || 'Kalif';

  return (
    <div className="s2-root">
      <SEO
        title={`Wholesale & B2B — ${storeName}`}
        description={`Bulk and B2B pricing from ${storeName}. Request a quote for wholesale orders, gifting, or retail — we'll get back with priced options.`}
      />

      <div className="s2-container" style={{ padding: '4rem 1.5rem 5rem', maxWidth: 900 }}>
        <p className="s2-eyebrow" style={{ marginBottom: '0.75rem' }}>For businesses</p>
        <h1 style={{
          fontFamily: 'var(--s2-font-display)',
          fontSize: 'clamp(2.2rem, 5vw, 3.6rem)',
          fontWeight: 400,
          letterSpacing: '-0.015em',
          lineHeight: 1.05,
          margin: '0 0 1.25rem',
        }}>
          Wholesale &amp; bulk orders
        </h1>
        <p style={{ color: 'var(--s2-text-dim)', fontSize: '1.05rem', lineHeight: 1.7, maxWidth: 620 }}>
          Buying for a shop, a gifting programme, a wedding, or a corporate occasion? Tell us what you need and how many — we'll come back with priced options, a quote you can pay online, or bank-transfer details if that's easier.
        </p>

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '2.5rem', flexWrap: 'wrap' }}>
          <Link to={user ? '/wholesale/request' : '/login?next=/wholesale/request'} className="s2-btn s2-btn-primary s2-btn-lg">
            Request a quote
          </Link>
          {user && (
            <Link to="/wholesale/my-quotes" className="s2-btn s2-btn-secondary s2-btn-lg">
              My quotes
            </Link>
          )}
        </div>

        <div style={{ marginTop: '4rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem' }}>
          <div style={{ padding: '1.25rem 1.5rem', border: '1px solid var(--s2-border)', borderRadius: '12px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 0.4rem' }}>1. Send the brief</h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--s2-text-dim)', lineHeight: 1.55, margin: 0 }}>Pick products and quantities, or write a note about what you need. Both work.</p>
          </div>
          <div style={{ padding: '1.25rem 1.5rem', border: '1px solid var(--s2-border)', borderRadius: '12px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 0.4rem' }}>2. We send a quote</h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--s2-text-dim)', lineHeight: 1.55, margin: 0 }}>Priced line items, validity date, and your choice of payment — usually within a working day.</p>
          </div>
          <div style={{ padding: '1.25rem 1.5rem', border: '1px solid var(--s2-border)', borderRadius: '12px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 0.4rem' }}>3. Pay &amp; we dispatch</h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--s2-text-dim)', lineHeight: 1.55, margin: 0 }}>Pay online or by bank transfer. Once we have confirmation, we pack and ship.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
