import { useState, useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { CURRENCY } from '../utils/currency';
import SEO from '../components/SEO';

const STATUS_STYLE = {
  pending:   { bg: 'rgba(250,204,21,0.18)', fg: '#a16207', label: 'Pending review' },
  quoted:    { bg: 'rgba(59,130,246,0.15)', fg: '#1d4ed8', label: 'Quoted' },
  paid:      { bg: 'rgba(34,197,94,0.15)',  fg: '#15803d', label: 'Paid' },
  cancelled: { bg: 'rgba(148,163,184,0.15)',fg: '#475569', label: 'Cancelled' },
  expired:   { bg: 'rgba(148,163,184,0.15)',fg: '#475569', label: 'Expired' },
};

export default function WholesaleQuotes() {
  const { user, loading: authLoading } = useAuth();
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    api.get('/b2b/requests/mine')
      .then((res) => setQuotes(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  if (authLoading) return null;
  if (!user) return <Navigate to="/login?next=/wholesale/my-quotes" replace />;

  return (
    <div className="s2-root">
      <SEO title="My Quotes — Wholesale" description="Your wholesale and B2B quote requests." />

      <div className="s2-container" style={{ padding: '3rem 1.5rem 5rem', maxWidth: 900 }}>
        <p className="s2-eyebrow" style={{ marginBottom: '0.75rem' }}>Wholesale</p>
        <h1 style={{
          fontFamily: 'var(--s2-font-display)',
          fontSize: 'clamp(1.8rem, 4vw, 2.6rem)',
          fontWeight: 400,
          letterSpacing: '-0.015em',
          margin: '0 0 0.5rem',
        }}>
          My quotes
        </h1>
        <p style={{ color: 'var(--s2-text-dim)', marginBottom: '2rem', fontSize: '0.95rem' }}>
          All your B2B requests, past and present.
        </p>

        {loading ? (
          <p style={{ color: 'var(--s2-text-dim)' }}>Loading…</p>
        ) : quotes.length === 0 ? (
          <div style={{ padding: '3rem 2rem', textAlign: 'center', border: '1px dashed var(--s2-border)', borderRadius: '12px' }}>
            <p style={{ color: 'var(--s2-text-dim)', marginBottom: '1rem' }}>You haven't submitted any quote requests yet.</p>
            <Link to="/wholesale/request" className="s2-btn s2-btn-primary">Request a quote</Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {quotes.map((q) => {
              const style = STATUS_STYLE[q.status] || STATUS_STYLE.pending;
              return (
                <Link
                  key={q.id}
                  to={`/wholesale/my-quotes/${q.id}`}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: '1rem', padding: '1rem 1.25rem',
                    border: '1px solid var(--s2-border)', borderRadius: '12px',
                    textDecoration: 'none', color: 'inherit', background: '#fff',
                  }}
                >
                  <div>
                    <div style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--s2-text-dim)' }}>{q.requestNumber}</div>
                    <div style={{ fontWeight: 600, marginTop: 2 }}>{q.companyName}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--s2-text-dim)', marginTop: 2 }}>
                      {new Date(q.createdAt).toLocaleDateString()} · {Array.isArray(q.items) ? q.items.length : 0} item{q.items?.length === 1 ? '' : 's'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ display: 'inline-block', padding: '0.2rem 0.6rem', borderRadius: '4px', background: style.bg, color: style.fg, fontSize: '0.78rem', fontWeight: 600 }}>
                      {style.label}
                    </span>
                    {q.quotedTotal && (
                      <div style={{ marginTop: '0.4rem', fontSize: '1rem', fontWeight: 600 }}>
                        {CURRENCY}{parseFloat(q.quotedTotal).toFixed(2)}
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
