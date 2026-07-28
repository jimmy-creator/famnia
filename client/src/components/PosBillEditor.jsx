/**
 * Bill Editor — open a paid sale, remove individual lines, or append
 * new lines while the customer is still at the counter. Manager
 * PIN-gated end-to-end via the parent's `onNeedOverride` callback.
 *
 *   - Delete a line: calls /api/returns with that one line at full
 *     remaining qty (refund via original payment rail).
 *   - Add lines: search products → quantities → choose Cash/Card →
 *     calls /api/pos/sales/:id/append with delta payment.
 *
 * Stock at the cashier's location is decremented on append and
 * returned on delete (when returnToStock=true, which is the default).
 */
import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { HiX, HiPlus, HiCash, HiCreditCard, HiSearch } from 'react-icons/hi';
import api from '../api/axios';

export default function PosBillEditor({ orderNumber, currency = 'KWD', onClose, onNeedOverride, onUpdated }) {
  const [order, setOrder] = useState(null);
  const [returnedSoFar, setReturnedSoFar] = useState({});
  const [loading, setLoading] = useState(true);

  // "Add line" state
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [addQueue, setAddQueue] = useState([]);    // [{productId, variantIndex, name, code, price, quantity, stockAtLocation}]
  const [variantPicker, setVariantPicker] = useState(null);   // {name, productId, variants:[{...stockAtLocation}]}
  const [payMethod, setPayMethod] = useState('cash');
  const [submitting, setSubmitting] = useState(false);

  const fmt = (n) => `${currency} ${(parseFloat(n) || 0).toFixed(3)}`;
  const keyOf = (pid, vIdx) => `${pid}:${vIdx ?? 'b'}`;

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/returns/lookup/${encodeURIComponent(orderNumber)}`);
      setOrder(data.order);
      setReturnedSoFar(data.returnedSoFar || {});
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not load sale');
    } finally {
      setLoading(false);
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [orderNumber]);

  // Search products for the "add line" panel.
  useEffect(() => {
    if (!search.trim()) { setResults([]); return; }
    const id = setTimeout(async () => {
      setSearching(true);
      try {
        const { data } = await api.get('/pos/products', { params: { q: search } });
        setResults(data);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(id);
  }, [search]);

  const lines = useMemo(() => {
    if (!order) return [];
    return (order.items || []).map((it) => {
      const vIdx = it.variantIndex ?? it.variant?.variantIndex ?? null;
      const k = keyOf(it.productId, vIdx);
      const refunded = returnedSoFar[k] || 0;
      const remaining = (parseInt(it.quantity, 10) || 0) - refunded;
      return { ...it, variantIndex: vIdx, refunded, remaining, _key: k };
    });
  }, [order, returnedSoFar]);

  const queueLine = (line) => {
    if (line.stockAtLocation < 1) {
      toast.error('Out of stock at this location');
      return;
    }
    setAddQueue((prev) => {
      const k = keyOf(line.productId, line.variantIndex);
      const idx = prev.findIndex((q) => keyOf(q.productId, q.variantIndex) === k);
      if (idx >= 0) {
        const next = [...prev];
        const newQty = next[idx].quantity + 1;
        if (newQty > line.stockAtLocation) {
          toast.error(`Only ${line.stockAtLocation} in stock`);
          return prev;
        }
        next[idx] = { ...next[idx], quantity: newQty };
        return next;
      }
      return [...prev, { ...line, quantity: 1 }];
    });
    setSearch('');
    setResults([]);
  };

  const addItemToQueue = (r) => {
    if (r.hasVariants) {
      // Open variant picker — same flow as the main POS.
      setVariantPicker(r);
      return;
    }
    queueLine({
      productId: r.productId,
      variantIndex: r.variantIndex,
      name: r.name,
      code: r.code,
      price: r.price,
      stockAtLocation: r.stockAtLocation,
    });
  };

  const pickVariant = (variantIndex) => {
    const v = variantPicker.variants[variantIndex];
    setVariantPicker(null);
    queueLine({
      productId: variantPicker.productId,
      variantIndex,
      name: `${variantPicker.name} (${Object.values(v.options || {}).join('/')})`,
      code: v.sku,
      price: parseFloat(v.price ?? variantPicker.price) || 0,
      stockAtLocation: v.stockAtLocation || 0,
    });
  };

  const setAddQty = (i, q) => setAddQueue((prev) => {
    const next = [...prev];
    const clamped = Math.max(1, Math.min(parseInt(q || 1, 10), next[i].stockAtLocation));
    next[i] = { ...next[i], quantity: clamped };
    return next;
  });
  const removeAddRow = (i) => setAddQueue((prev) => prev.filter((_, idx) => idx !== i));

  const addTotal = addQueue.reduce((s, q) => s + q.price * q.quantity, 0);

  // ─── Delete a line ──────────────────────────────────────────────
  const deleteLine = (line) => {
    if (line.remaining < 1) return;
    if (!confirm(`Remove ${line.remaining} × "${line.name}" from this bill? Stock will be returned and ${fmt(line.price * line.remaining)} refunded.`)) return;
    const refundMethod = order.paymentMethod === 'pos_cash' ? 'cash'
      : order.paymentMethod === 'pos_card' ? 'card'
      : 'cash';

    const submit = async (managerOverride) => {
      const { data } = await api.post('/returns', {
        orderId: order.id,
        items: [{
          productId: line.productId,
          variantIndex: line.variantIndex,
          quantity: line.remaining,
          returnToStock: true,
        }],
        refundMethod,
        reason: 'Bill edit: line removed',
        managerOverride: managerOverride || undefined,
      });
      toast.success(`Removed · refunded ${fmt(data.salesReturn.refundAmount)}`);
      await load();
      onUpdated?.();
    };

    submit().catch((err) => {
      if (err.response?.data?.requires === 'manager_override' && onNeedOverride) {
        onNeedOverride({
          reason: err.response.data.message,
          retry: (override) => submit(override),
        });
      } else {
        toast.error(err.response?.data?.message || 'Remove failed');
      }
    });
  };

  // ─── Append line(s) with payment ────────────────────────────────
  const submitAppend = async (managerOverride) => {
    setSubmitting(true);
    try {
      const body = {
        items: addQueue.map((q) => ({
          productId: q.productId,
          variantIndex: q.variantIndex,
          quantity: q.quantity,
        })),
        payment: {
          method: payMethod,
          amountTendered: addTotal,
        },
        managerOverride: managerOverride || undefined,
      };
      await api.post(`/pos/sales/${order.id}/append`, body);
      toast.success(`Added ${addQueue.length} line(s) · ${fmt(addTotal)} collected`);
      setAddQueue([]);
      await load();
      onUpdated?.();
    } catch (err) {
      if (err.response?.data?.requires === 'manager_override' && onNeedOverride) {
        onNeedOverride({
          reason: err.response.data.message,
          retry: (override) => submitAppend(override),
        });
      } else {
        toast.error(err.response?.data?.message || 'Add failed');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !order) {
    return (
      <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="modal" style={{ maxWidth: 480 }}>Loading…</div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 700 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h3 style={{ margin: 0 }}>Edit bill — {order.orderNumber}</h3>
          <button onClick={onClose} className="link-btn">Close</button>
        </div>
        <div style={{ color: '#94a3b8', fontSize: 12, marginBottom: '0.75rem' }}>
          {new Date(order.createdAt).toLocaleString()} · paid {order.paymentMethod?.replace('pos_', '')} · total {fmt(order.totalAmount)}
        </div>

        {/* ─── Existing lines ────────────────── */}
        <div style={{ borderTop: '1px solid #334155' }}>
          {lines.map((l) => {
            const exhausted = l.remaining < 1;
            return (
              <div key={l._key} style={{
                display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 12,
                padding: '0.65rem 0', borderBottom: '1px solid #334155',
                opacity: exhausted ? 0.45 : 1,
              }}>
                <div>
                  <div style={{ fontSize: 14, textDecoration: exhausted ? 'line-through' : 'none' }}>{l.name}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>
                    {l.quantity} × {fmt(l.price)}
                    {l.refunded > 0 && <span style={{ color: '#fbbf24', marginLeft: 6 }}>({l.refunded} refunded)</span>}
                  </div>
                </div>
                <div style={{ fontWeight: 600, fontSize: 14, minWidth: 70, textAlign: 'right' }}>
                  {fmt(l.price * l.quantity)}
                </div>
                <button
                  onClick={() => deleteLine(l)}
                  disabled={exhausted}
                  title={exhausted ? 'Already refunded' : 'Remove from bill'}
                  style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: exhausted ? '#1e293b' : 'rgba(239,68,68,0.12)',
                    border: '1px solid ' + (exhausted ? '#334155' : 'rgba(239,68,68,0.3)'),
                    color: exhausted ? '#475569' : '#f87171',
                    cursor: exhausted ? 'not-allowed' : 'pointer',
                    display: 'grid', placeItems: 'center',
                  }}>
                  <HiX size={16} />
                </button>
              </div>
            );
          })}
        </div>

        {/* ─── Add line panel ────────────────── */}
        <h4 style={{ margin: '1rem 0 0.5rem' }}>Add items</h4>
        <div style={{ position: 'relative' }}>
          <HiSearch size={18} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            placeholder="Search to add a missed item…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="modal-input"
            style={{ paddingLeft: 38 }}
          />
        </div>
        {results.length > 0 && (
          <div style={{ marginTop: 6, maxHeight: 180, overflowY: 'auto' }}>
            {results.map((r) => (
              <button key={`${r.productId}-${r.variantIndex ?? 'b'}`}
                onClick={() => addItemToQueue(r)}
                disabled={!r.hasVariants && r.stockAtLocation < 1}
                style={{
                  display: 'flex', justifyContent: 'space-between', width: '100%',
                  padding: '0.55rem 0.75rem', textAlign: 'left',
                  background: '#0f172a', border: '1px solid #334155',
                  color: '#f8fafc', borderRadius: 8, marginBottom: 4,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>
                <span>
                  {r.name}
                  <span style={{ color: '#94a3b8', marginLeft: 8, fontSize: 11 }}>
                    {r.hasVariants ? `${r.variants.length} variants` : `${r.stockAtLocation} in stock`}
                  </span>
                </span>
                <span style={{ fontWeight: 600 }}>{fmt(r.price)}</span>
              </button>
            ))}
            {searching && <div style={{ fontSize: 12, color: '#94a3b8', padding: 4 }}>Searching…</div>}
          </div>
        )}

        {addQueue.length > 0 && (
          <>
            <div style={{ marginTop: '0.75rem', borderTop: '1px solid #334155', paddingTop: '0.5rem' }}>
              {addQueue.map((q, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 8, alignItems: 'center', padding: '0.4rem 0' }}>
                  <span style={{ fontSize: 14 }}>{q.name}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button onClick={() => setAddQty(i, q.quantity - 1)} style={qtyBtn}>−</button>
                    <span style={{ minWidth: 24, textAlign: 'center', fontSize: 14 }}>{q.quantity}</span>
                    <button onClick={() => setAddQty(i, q.quantity + 1)} style={qtyBtn}>+</button>
                  </div>
                  <div style={{ minWidth: 80, textAlign: 'right', fontWeight: 600 }}>{fmt(q.price * q.quantity)}</div>
                  <button onClick={() => removeAddRow(i)} style={{ ...qtyBtn, color: '#f87171' }}><HiX size={14} /></button>
                </div>
              ))}
            </div>

            <div style={{ marginTop: '0.75rem', padding: '0.75rem 1rem', background: '#0f172a', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 14, color: '#cbd5e1' }}>Customer pays</span>
              <strong style={{ fontSize: 20, color: '#fbbf24' }}>{fmt(addTotal)}</strong>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginTop: '0.5rem' }}>
              <button onClick={() => setPayMethod('cash')}
                style={payMethodBtn(payMethod === 'cash')}>
                <HiCash size={18} /> Cash
              </button>
              <button onClick={() => setPayMethod('knet')}
                style={payMethodBtn(payMethod === 'knet')}>
                KNET
              </button>
              <button onClick={() => setPayMethod('card')}
                style={payMethodBtn(payMethod === 'card')}>
                <HiCreditCard size={18} /> Card
              </button>
            </div>

            <div className="modal-actions">
              <button onClick={() => setAddQueue([])} className="modal-btn modal-btn-secondary" disabled={submitting}>Discard</button>
              <button onClick={() => submitAppend()} disabled={submitting} className="modal-btn modal-btn-primary">
                {submitting ? 'Processing…' : `Charge ${fmt(addTotal)} & add`}
              </button>
            </div>
          </>
        )}

        <p style={{ fontSize: 11, color: '#64748b', marginTop: '0.75rem' }}>
          All edits need a manager PIN. Refunds use the original payment rail.
          Added lines are at current price (any discount on the original bill
          does not auto-apply).
        </p>
      </div>

      {variantPicker && (
        <div className="modal-backdrop" onClick={() => setVariantPicker(null)} style={{ zIndex: 110 }}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <h3 style={{ margin: 0 }}>{variantPicker.name}</h3>
            <p style={{ color: '#94a3b8', fontSize: 13, margin: '4px 0 0.75rem' }}>Pick a variant</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {variantPicker.variants.map((v, i) => {
                const stock = v.stockAtLocation || 0;
                return (
                  <button key={i}
                    onClick={() => pickVariant(i)}
                    disabled={stock < 1}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '0.7rem 0.9rem', textAlign: 'left',
                      background: stock < 1 ? '#0f172a' : '#1e293b',
                      border: '1px solid #334155',
                      color: '#f8fafc', borderRadius: 8,
                      cursor: stock < 1 ? 'not-allowed' : 'pointer',
                      opacity: stock < 1 ? 0.4 : 1,
                      fontFamily: 'inherit',
                    }}>
                    <span>{Object.values(v.options || {}).join(' / ')}</span>
                    <span style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 12 }}>
                      <span style={{ color: stock < 1 ? '#f87171' : '#34d399' }}>
                        {stock < 1 ? 'Out of stock' : `${stock} in stock`}
                      </span>
                      <span style={{ fontWeight: 600 }}>{fmt(v.price ?? variantPicker.price)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="modal-actions">
              <button onClick={() => setVariantPicker(null)} className="modal-btn modal-btn-secondary">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const qtyBtn = {
  width: 26, height: 26, border: '1px solid #334155', background: '#0f172a',
  color: '#f8fafc', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
  display: 'grid', placeItems: 'center',
};

const payMethodBtn = (active) => ({
  padding: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  background: active ? '#c4784a' : '#0f172a',
  border: active ? 'none' : '1px solid #334155',
  color: active ? '#fff' : '#cbd5e1',
  borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
});
