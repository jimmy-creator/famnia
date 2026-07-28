import { useState, useEffect, useRef } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Plus, X, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import SEO from '../components/SEO';

const emptyAddress = { line1: '', line2: '', city: '', state: '', postalCode: '', country: 'Qatar' };

export default function WholesaleRequest() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [companyName, setCompanyName] = useState('');
  const [contactName, setContactName] = useState(user?.name || '');
  const [contactPhone, setContactPhone] = useState(user?.phone || '');
  const [contactAddress, setContactAddress] = useState(emptyAddress);
  const [customerNote, setCustomerNote] = useState('');
  const [items, setItems] = useState([]);

  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const debounceRef = useRef(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) {
      setContactName((n) => n || user.name || '');
      setContactPhone((p) => p || user.phone || '');
    }
  }, [user]);

  useEffect(() => {
    if (query.length < 2) { setSuggestions([]); return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const { data } = await api.get(`/products/search-suggestions?q=${encodeURIComponent(query)}`);
        setSuggestions(data);
      } catch {
        setSuggestions([]);
      }
    }, 250);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  if (authLoading) return null;
  if (!user) return <Navigate to="/login?next=/wholesale/request" replace />;

  const addProduct = (product) => {
    if (items.some((i) => i.productId === product.id)) {
      toast.error('Already added');
      return;
    }
    setItems([...items, { productId: product.id, name: product.name, quantity: 1, image: product.images?.[0] || null }]);
    setQuery('');
    setSuggestions([]);
  };

  const addCustomRow = () => {
    setItems([...items, { productId: null, name: '', quantity: 1 }]);
  };

  const updateItem = (idx, patch) => {
    const next = [...items];
    next[idx] = { ...next[idx], ...patch };
    setItems(next);
  };

  const removeItem = (idx) => setItems(items.filter((_, i) => i !== idx));

  const submit = async (e) => {
    e.preventDefault();
    if (!companyName.trim() || !contactName.trim()) {
      toast.error('Company and contact name are required');
      return;
    }
    if (!contactAddress.line1 || !contactAddress.city || !contactAddress.postalCode) {
      toast.error('Please fill the address');
      return;
    }
    if (items.length === 0 && !customerNote.trim()) {
      toast.error('Add at least one item or write a note');
      return;
    }
    const cleanItems = items
      .map((i) => ({ productId: i.productId, name: i.name.trim(), quantity: parseInt(i.quantity, 10) }))
      .filter((i) => i.quantity > 0 && (i.productId || i.name));

    setSubmitting(true);
    try {
      const { data } = await api.post('/b2b/requests', {
        companyName: companyName.trim(),
        contactName: contactName.trim(),
        contactPhone: contactPhone.trim(),
        contactAddress,
        customerNote: customerNote.trim(),
        items: cleanItems,
      });
      toast.success('Request submitted — we\'ll be in touch shortly');
      navigate(`/wholesale/my-quotes/${data.id}`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="s2-root">
      <SEO title="Request a Quote — Wholesale" description="Submit a B2B/wholesale quote request." />

      <div className="s2-container" style={{ padding: '3rem 1.5rem 5rem', maxWidth: 760 }}>
        <p className="s2-eyebrow" style={{ marginBottom: '0.75rem' }}>Wholesale</p>
        <h1 style={{
          fontFamily: 'var(--s2-font-display)',
          fontSize: 'clamp(1.8rem, 4vw, 2.6rem)',
          fontWeight: 400,
          letterSpacing: '-0.015em',
          lineHeight: 1.1,
          margin: '0 0 0.75rem',
        }}>
          Request a quote
        </h1>
        <p style={{ color: 'var(--s2-text-dim)', marginBottom: '2rem', fontSize: '0.95rem', lineHeight: 1.6 }}>
          Tell us what you need. Add products + quantities, or just describe it in a note — both are fine.
        </p>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <section>
            <h3 style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--s2-text-dim)', fontWeight: 600, marginBottom: '0.75rem' }}>Your details</h3>
            <div className="s2-field"><label>Company / Business name</label>
              <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} required placeholder="ABC Traders" /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div className="s2-field"><label>Contact name</label>
                <input value={contactName} onChange={(e) => setContactName(e.target.value)} required /></div>
              <div className="s2-field"><label>Phone</label>
                <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="+91 …" /></div>
            </div>
          </section>

          <section>
            <h3 style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--s2-text-dim)', fontWeight: 600, marginBottom: '0.75rem' }}>Shipping address</h3>
            <div className="s2-field"><label>Address line 1</label>
              <input value={contactAddress.line1} onChange={(e) => setContactAddress({ ...contactAddress, line1: e.target.value })} required /></div>
            <div className="s2-field"><label>Address line 2</label>
              <input value={contactAddress.line2} onChange={(e) => setContactAddress({ ...contactAddress, line2: e.target.value })} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
              <div className="s2-field"><label>City</label>
                <input value={contactAddress.city} onChange={(e) => setContactAddress({ ...contactAddress, city: e.target.value })} required /></div>
              <div className="s2-field"><label>State</label>
                <input value={contactAddress.state} onChange={(e) => setContactAddress({ ...contactAddress, state: e.target.value })} /></div>
              <div className="s2-field"><label>PIN</label>
                <input value={contactAddress.postalCode} onChange={(e) => setContactAddress({ ...contactAddress, postalCode: e.target.value })} required /></div>
            </div>
          </section>

          <section>
            <h3 style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--s2-text-dim)', fontWeight: 600, marginBottom: '0.75rem' }}>Items</h3>

            <div style={{ position: 'relative' }}>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Search size={16} style={{ position: 'absolute', left: '0.75rem', color: 'var(--s2-text-dim)' }} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search products to add…"
                  style={{ width: '100%', padding: '0.7rem 0.85rem 0.7rem 2.25rem', border: '1px solid var(--s2-border)', borderRadius: '8px', fontSize: '0.9rem', background: '#fff' }}
                />
              </div>
              {suggestions.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: '#fff', border: '1px solid var(--s2-border)', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.08)', zIndex: 10, maxHeight: 320, overflowY: 'auto' }}>
                  {suggestions.map((p) => (
                    <button type="button" key={p.id} onClick={() => addProduct(p)}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', width: '100%', padding: '0.6rem 0.85rem', background: 'transparent', border: 'none', borderBottom: '1px solid var(--s2-border)', cursor: 'pointer', textAlign: 'left' }}>
                      {p.images?.[0] && <img src={p.images[0]} alt="" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 4 }} />}
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>{p.name}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--s2-text-dim)' }}>{p.category}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {items.length > 0 && (
              <div style={{ marginTop: '1rem', border: '1px solid var(--s2-border)', borderRadius: '8px', overflow: 'hidden' }}>
                {items.map((it, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0.85rem', borderBottom: idx < items.length - 1 ? '1px solid var(--s2-border)' : 'none' }}>
                    {it.image && <img src={it.image} alt="" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 4 }} />}
                    <input
                      value={it.name}
                      onChange={(e) => updateItem(idx, { name: e.target.value })}
                      readOnly={!!it.productId}
                      placeholder="Item name"
                      style={{ flex: 1, padding: '0.4rem 0.6rem', border: it.productId ? 'none' : '1px solid var(--s2-border)', borderRadius: 4, fontSize: '0.88rem', background: it.productId ? 'transparent' : '#fff' }}
                    />
                    <input
                      type="number" min={1}
                      value={it.quantity}
                      onChange={(e) => updateItem(idx, { quantity: e.target.value })}
                      style={{ width: 80, padding: '0.4rem 0.6rem', border: '1px solid var(--s2-border)', borderRadius: 4, fontSize: '0.88rem' }}
                    />
                    <button type="button" onClick={() => removeItem(idx)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--s2-text-dim)' }}>
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button type="button" onClick={addCustomRow} className="s2-btn s2-btn-secondary" style={{ marginTop: '0.75rem', fontSize: '0.85rem' }}>
              <Plus size={14} /> Add custom item
            </button>
          </section>

          <section>
            <h3 style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--s2-text-dim)', fontWeight: 600, marginBottom: '0.75rem' }}>Anything else?</h3>
            <div className="s2-field">
              <label>Note (optional)</label>
              <textarea
                rows={5}
                value={customerNote}
                onChange={(e) => setCustomerNote(e.target.value)}
                placeholder="Special requirements, delivery timing, packaging preferences, custom orders…"
              />
            </div>
          </section>

          <button type="submit" disabled={submitting} className="s2-btn s2-btn-primary s2-btn-lg" style={{ width: '100%' }}>
            {submitting ? 'Submitting…' : 'Submit request'}
          </button>
        </form>
      </div>
    </div>
  );
}
