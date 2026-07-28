/**
 * Customer picker shown above the cart on the POS sales screen.
 *
 * Two states:
 *   - No customer selected: a small "Add customer (optional)" button
 *     opens an inline search + create panel.
 *   - Customer selected: a compact chip showing name + phone, with
 *     a "change" link to re-open the panel and a "clear" link to
 *     revert to walk-in.
 *
 * Search debounces 250ms. Hitting Enter on an unmatched search opens
 * the create form pre-filled with the query as the phone (if digits
 * only) or the name.
 */
import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import api from '../api/axios';

export default function PosCustomerPicker({ customer, onSelect, onClear }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [createForm, setCreateForm] = useState(null);  // { name, phone, email }
  const [busy, setBusy] = useState(false);
  const debounceRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open || createForm) return;
    clearTimeout(debounceRef.current);
    if (!query.trim()) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const { data } = await api.get('/pos/customers', { params: { q: query } });
        setResults(data);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(debounceRef.current);
  }, [query, open, createForm]);

  const startCreate = () => {
    const digits = query.replace(/\D/g, '');
    const looksLikePhone = digits.length >= 4 && digits.length === query.replace(/\s/g, '').length;
    setCreateForm({
      name: looksLikePhone ? '' : query.trim(),
      phone: looksLikePhone ? query.trim() : '',
      email: '',
    });
  };

  const submitCreate = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post('/pos/customers', createForm);
      if (data._existing) toast('Customer already existed — selected', { icon: 'ℹ️' });
      else toast.success('Customer created');
      onSelect(data);
      setOpen(false);
      setCreateForm(null);
      setQuery('');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const onKey = (e) => {
    if (e.key === 'Enter' && results.length === 0 && query.trim()) {
      e.preventDefault();
      startCreate();
    }
  };

  // Compact "selected" view
  if (customer && !open) {
    return (
      <div className="pos-customer-chip">
        <div>
          <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>{customer.name}</div>
          <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
            {customer.phone || customer.email || 'no contact'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="link-btn" onClick={() => setOpen(true)}>change</button>
          <button className="link-btn" onClick={onClear} style={{ color: '#f87171' }}>clear</button>
        </div>
        <style>{`
          .pos-customer-chip {
            display: flex; justify-content: space-between; align-items: center;
            padding: 0.6rem 0.75rem; background: #0f172a;
            border: 1px solid #c4784a; border-radius: 8px;
            margin-bottom: 0.5rem;
          }
        `}</style>
      </div>
    );
  }

  if (!open) {
    return (
      <button className="link-btn" onClick={() => setOpen(true)} style={{ marginBottom: '0.5rem' }}>
        + Add customer (optional)
      </button>
    );
  }

  return (
    <div className="pos-customer-search">
      {!createForm && (
        <>
          <input
            ref={inputRef}
            placeholder="Search by phone or name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            className="pos-cust-input"
          />
          {query.trim() && (
            <div className="pos-cust-list">
              {searching && <div className="pos-cust-empty">Searching…</div>}
              {!searching && results.length === 0 && (
                <div className="pos-cust-empty">
                  No match. <button className="link-btn" onClick={startCreate}>+ Create &ldquo;{query}&rdquo;</button>
                </div>
              )}
              {results.map((c) => (
                <button key={c.id} className="pos-cust-item"
                  onClick={() => { onSelect(c); setOpen(false); setQuery(''); setResults([]); }}>
                  <div>
                    <div style={{ fontSize: '0.88rem' }}>{c.name}</div>
                    <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                      {[c.phone, c.email].filter(Boolean).join(' · ') || 'no contact'}
                    </div>
                  </div>
                </button>
              ))}
              {!searching && results.length > 0 && (
                <button className="link-btn pos-cust-create" onClick={startCreate}>
                  + Create new customer
                </button>
              )}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.4rem' }}>
            <button className="link-btn" onClick={() => { setOpen(false); setQuery(''); }}>Cancel</button>
          </div>
        </>
      )}

      {createForm && (
        <form onSubmit={submitCreate}>
          <div style={{ fontSize: '0.85rem', color: '#cbd5e1', marginBottom: '0.4rem' }}>New customer</div>
          <input
            placeholder="Name" autoFocus={!createForm.name}
            value={createForm.name}
            onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
            className="pos-cust-input"
            required
          />
          <input
            placeholder="Phone" autoFocus={!createForm.phone && !!createForm.name}
            value={createForm.phone}
            onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
            className="pos-cust-input"
            style={{ marginTop: 4 }}
          />
          <input
            placeholder="Email (optional)"
            type="email"
            value={createForm.email}
            onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
            className="pos-cust-input"
            style={{ marginTop: 4 }}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: '0.5rem' }}>
            <button type="submit" disabled={busy} className="pos-cust-btn-primary">
              {busy ? 'Saving…' : 'Add'}
            </button>
            <button type="button" onClick={() => setCreateForm(null)} className="pos-cust-btn-secondary">
              Back
            </button>
          </div>
        </form>
      )}

      <style>{`
        .pos-customer-search {
          padding: 0.6rem 0.75rem; background: #0f172a;
          border: 1px solid #334155; border-radius: 8px;
          margin-bottom: 0.5rem;
        }
        .pos-cust-input {
          width: 100%; padding: 0.5rem 0.75rem;
          background: #1e293b; border: 1px solid #334155;
          color: #f8fafc; border-radius: 6px; font-size: 0.88rem;
          font-family: inherit;
        }
        .pos-cust-input:focus { outline: none; border-color: #c4784a; }
        .pos-cust-list { margin-top: 0.4rem; max-height: 200px; overflow-y: auto; }
        .pos-cust-empty { padding: 0.4rem 0.5rem; color: #94a3b8; font-size: 0.82rem; }
        .pos-cust-item {
          display: flex; width: 100%; text-align: left;
          padding: 0.5rem 0.6rem; background: transparent;
          border: 1px solid transparent; border-radius: 6px;
          color: #f8fafc; cursor: pointer; font-family: inherit;
        }
        .pos-cust-item:hover { background: #1e293b; border-color: #334155; }
        .pos-cust-create { display: block; padding: 0.4rem 0.5rem; }
        .pos-cust-btn-primary {
          flex: 1; padding: 0.5rem; background: #c4784a; color: white;
          border: none; border-radius: 6px; cursor: pointer; font-family: inherit; font-weight: 600;
        }
        .pos-cust-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .pos-cust-btn-secondary {
          padding: 0.5rem 0.9rem; background: transparent; border: 1px solid #334155;
          color: #cbd5e1; border-radius: 6px; cursor: pointer; font-family: inherit;
        }
      `}</style>
    </div>
  );
}
