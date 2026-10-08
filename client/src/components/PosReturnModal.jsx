/**
 * POS Return modal.
 *
 * Flow:
 *  1. Cashier types/scans an order number — or picks "No receipt", scans the
 *     items straight in, and they are refunded at today's selling price.
 *  2. Order loads with each line's max-returnable quantity (original − already
 *     returned). Cashier scans the items being handed back (or sets
 *     quantities by hand), chooses "return to stock" or not.
 *  3. Cashier picks refund method (cash / card / store credit), optional reason.
 *  4. Submit -> creates SalesReturn server-side -> parent shows a printable
 *     return receipt.
 *
 * Uses the same dark POS styling as Pos.jsx for visual continuity.
 */
import { useState, useRef, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { CURRENCY_DECIMALS } from '../utils/currency';

export default function PosReturnModal({ currency = 'KWD', onClose, onComplete, onNeedOverride }) {
  const [step, setStep] = useState('lookup');         // lookup | pick | pay
  const [orderNumber, setOrderNumber] = useState('');
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookup, setLookup] = useState(null);          // { order, returnedSoFar }
  const [lines, setLines] = useState([]);              // [{...orderItem, returnQty, returnToStock, maxReturnable, key}]
  // No-receipt return: no order to pick from, items are scanned in and
  // refunded at today's selling price (the server prices them).
  const [noReceipt, setNoReceipt] = useState(false);
  const [refundMethod, setRefundMethod] = useState('cash');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fmt = (n) => `${currency} ${(parseFloat(n) || 0).toFixed(CURRENCY_DECIMALS)}`;
  const refundTotal = lines.reduce((s, l) => s + l.price * (l.returnQty || 0), 0);

  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, [step]);

  const runLookup = async (e) => {
    e?.preventDefault();
    if (!orderNumber.trim()) return;
    setLookupBusy(true);
    try {
      const { data } = await api.get(`/returns/lookup/${encodeURIComponent(orderNumber.trim())}`);
      const built = (data.order.items || []).map((it) => {
        const vIdx = it.variantIndex ?? it.variant?.variantIndex ?? null;
        const k = `${it.productId}:${vIdx ?? 'b'}`;
        const alreadyReturned = data.returnedSoFar[k] || 0;
        const max = (parseInt(it.quantity, 10) || 0) - alreadyReturned;
        return {
          ...it,
          variantIndex: vIdx,
          alreadyReturned,
          maxReturnable: max,
          returnQty: 0,
          returnToStock: true,
          _key: k,
        };
      });
      setLookup(data);
      setLines(built);
      setStep('pick');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Order not found');
    } finally {
      setLookupBusy(false);
    }
  };

  const startNoReceipt = () => {
    setLookup(null);
    setLines([]);
    setNoReceipt(true);
    setStep('pick');
  };

  // No-receipt: resolve a scanned barcode through the till's own product
  // search (product code or variant SKU) and add it as a new line.
  const addScannedProduct = async (raw) => {
    const code = raw.toUpperCase();
    try {
      const { data } = await api.get('/pos/products', { params: { q: raw } });
      const exact = data.filter((r) => (r.code || '').toUpperCase() === code);
      const hit = exact[0] || (data.length === 1 ? data[0] : null);
      if (!hit) {
        toast.error(data.length > 1 ? `${data.length} products match "${raw}" — scan the barcode` : `${raw} not found`);
        return;
      }
      if (hit.hasVariants) {
        toast.error(`${hit.name} comes in options — scan that option's own barcode`);
        return;
      }
      const k = `${hit.productId}:${hit.variantIndex ?? 'b'}`;
      setLines((prev) => [...prev, {
        productId: hit.productId, variantIndex: hit.variantIndex ?? null,
        name: hit.name, sku: hit.code, price: hit.price,
        returnQty: 1, maxReturnable: Infinity, alreadyReturned: 0,
        returnToStock: true, _key: k,
      }]);
      toast.success(`${hit.name} × 1`, { id: 'return-scan' });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lookup failed');
    }
  };

  const setLineQty = (k, q) => {
    setLines((prev) => prev.map((l) => {
      if (l._key !== k) return l;
      const clamped = Math.max(0, Math.min(parseInt(q || 0, 10), l.maxReturnable));
      return { ...l, returnQty: clamped };
    }));
  };
  // Scanning an item on the pick step adds one of it to the return. A line
  // matches on the barcode the till sold it under (its snapshot SKU / product
  // code, or the variant SKU) or the `P<id>` fallback printed on labels for
  // products with no code.
  const [scanCode, setScanCode] = useState('');
  const scanItem = (e) => {
    e.preventDefault();
    const raw = scanCode.trim();
    const code = raw.toUpperCase();
    setScanCode('');
    if (!code) return;
    const matches = lines.filter((l) => [l.sku, l.variant?.sku, `P${l.productId}`]
      .some((c) => c && String(c).toUpperCase() === code));
    if (matches.length === 0) {
      if (noReceipt) addScannedProduct(raw);
      else toast.error(`${code} is not on this order`);
      return;
    }
    const line = matches.find((l) => l.returnQty < l.maxReturnable);
    if (!line) {
      toast.error(`All of ${matches[0].name} already picked or returned`);
      return;
    }
    setLineQty(line._key, line.returnQty + 1);
    toast.success(`${line.name} × ${line.returnQty + 1}`, { id: 'return-scan' });
  };

  const toggleToStock = (k) => {
    setLines((prev) => prev.map((l) => l._key === k ? { ...l, returnToStock: !l.returnToStock } : l));
  };

  const goToPay = () => {
    if (refundTotal <= 0) {
      toast.error('Pick at least one item');
      return;
    }
    setStep('pay');
  };

  const postReturn = async (managerOverride) => {
    const items = lines
      .filter((l) => l.returnQty > 0)
      .map((l) => ({
        productId: l.productId,
        variantIndex: l.variantIndex,
        quantity: l.returnQty,
        returnToStock: l.returnToStock,
      }));
    const { data } = await api.post('/returns', {
      // Omitted for a no-receipt return — the server prices items itself.
      orderId: lookup?.order.id,
      items,
      refundMethod,
      reason: reason || undefined,
      notes: notes || undefined,
      managerOverride: managerOverride || undefined,
    });
    toast.success(`Return ${data.salesReturn.returnNumber} created`);
    onComplete(data);
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      await postReturn();
    } catch (err) {
      if (err.response?.data?.requires === 'manager_override' && onNeedOverride) {
        onNeedOverride({
          reason: err.response.data.message,
          retry: (override) => postReturn(override),
        });
      } else {
        toast.error(err.response?.data?.message || 'Return failed');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={() => !submitting && onClose()}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Return — Step {step === 'lookup' ? 1 : step === 'pick' ? 2 : 3} of 3</h3>
          <button onClick={onClose} className="link-btn" style={{ fontSize: 14 }}>Cancel</button>
        </div>

        {step === 'lookup' && (
          <form onSubmit={runLookup} style={{ marginTop: '1rem' }}>
            <label className="modal-label">Order number</label>
            <input
              ref={inputRef}
              className="modal-input"
              placeholder="Receipt number, e.g. INV-1007"
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              autoFocus
            />
            <div className="modal-actions">
              <button type="button" onClick={startNoReceipt} className="modal-btn modal-btn-secondary">
                No receipt — scan items
              </button>
              <button type="submit" disabled={lookupBusy || !orderNumber.trim()} className="modal-btn modal-btn-primary">
                {lookupBusy ? 'Searching…' : 'Find order'}
              </button>
            </div>
          </form>
        )}

        {step === 'pick' && (lookup || noReceipt) && (
          <>
            {lookup ? (
              <div style={{ background: '#0f172a', padding: '0.75rem 1rem', borderRadius: 8, margin: '1rem 0', fontSize: 13 }}>
                <div><strong>{lookup.order.orderNumber}</strong></div>
                <div style={{ color: '#94a3b8' }}>
                  Total {fmt(lookup.order.totalAmount)} · {(lookup.order.items || []).length} items · paid {lookup.order.paymentMethod}
                </div>
                {lookup.priorReturns > 0 && (
                  <div style={{ color: '#fbbf24', fontSize: 12, marginTop: 4 }}>
                    {lookup.priorReturns} prior return{lookup.priorReturns > 1 ? 's' : ''} on this order
                  </div>
                )}
              </div>
            ) : (
              <div style={{ background: '#0f172a', padding: '0.75rem 1rem', borderRadius: 8, margin: '1rem 0', fontSize: 13 }}>
                <div><strong>No receipt</strong></div>
                <div style={{ color: '#94a3b8' }}>
                  Scan each item the customer is returning. Refunded at today&apos;s selling price.
                </div>
              </div>
            )}

            <form onSubmit={scanItem} style={{ marginBottom: '0.75rem' }}>
              <label className="modal-label">Scan item to return</label>
              <input
                ref={inputRef}
                className="modal-input"
                placeholder="Scan barcode — each scan adds one"
                value={scanCode}
                onChange={(e) => setScanCode(e.target.value)}
              />
            </form>

            <div style={{ maxHeight: '50vh', overflowY: 'auto', borderTop: '1px solid #334155' }}>
              {lines.length === 0 && (
                <div style={{ padding: '1rem 0', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                  No items yet — scan the first one
                </div>
              )}
              {lines.map((l) => {
                const isExhausted = l.maxReturnable < 1;
                return (
                  <div key={l._key} style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto auto',
                    gap: '0.75rem', padding: '0.65rem 0',
                    borderBottom: '1px solid #334155',
                    opacity: isExhausted ? 0.4 : 1,
                  }}>
                    <div>
                      <div style={{ fontSize: 14 }}>{l.name}</div>
                      <div style={{ fontSize: 12, color: '#94a3b8' }}>
                        {fmt(l.price)} ea
                        {!noReceipt && ` · sold ${l.quantity}`}
                        {l.alreadyReturned > 0 && ` · returned ${l.alreadyReturned}`}
                      </div>
                      {!isExhausted && (
                        <label style={{ fontSize: 11, color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                          <input
                            type="checkbox"
                            checked={l.returnToStock}
                            onChange={() => toggleToStock(l._key)}
                          />
                          Return to stock
                        </label>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <button
                        onClick={() => setLineQty(l._key, l.returnQty - 1)}
                        disabled={isExhausted || l.returnQty <= 0}
                        style={qtyBtn}>−</button>
                      <input
                        type="number" min={0} max={Number.isFinite(l.maxReturnable) ? l.maxReturnable : undefined}
                        value={l.returnQty}
                        onChange={(e) => setLineQty(l._key, e.target.value)}
                        disabled={isExhausted}
                        style={{ width: 50, padding: '4px 6px', background: '#0f172a', border: '1px solid #334155', color: '#f8fafc', borderRadius: 6, textAlign: 'center', fontFamily: 'inherit' }}
                      />
                      <button
                        onClick={() => setLineQty(l._key, l.returnQty + 1)}
                        disabled={isExhausted || l.returnQty >= l.maxReturnable}
                        style={qtyBtn}>+</button>
                      {Number.isFinite(l.maxReturnable) && (
                        <span style={{ fontSize: 10, color: '#64748b', marginLeft: 4 }}>/{l.maxReturnable}</span>
                      )}
                    </div>
                    <div style={{ minWidth: 70, textAlign: 'right', fontSize: 14, fontWeight: 600 }}>
                      {l.returnQty > 0 ? fmt(l.price * l.returnQty) : '—'}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 0', borderTop: '1px solid #334155', marginTop: '0.5rem' }}>
              <span style={{ color: '#cbd5e1' }}>Refund total</span>
              <strong style={{ fontSize: 18, color: '#fbbf24' }}>{fmt(refundTotal)}</strong>
            </div>

            <div className="modal-actions">
              <button onClick={() => { setStep('lookup'); setNoReceipt(false); }} className="modal-btn modal-btn-secondary">Back</button>
              <button onClick={goToPay} disabled={refundTotal <= 0} className="modal-btn modal-btn-primary">
                Next: refund method
              </button>
            </div>
          </>
        )}

        {step === 'pay' && (
          <>
            <div style={{ background: '#0f172a', padding: '0.75rem 1rem', borderRadius: 8, margin: '1rem 0', textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>Refund amount</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#fbbf24' }}>{fmt(refundTotal)}</div>
            </div>

            <label className="modal-label">Refund method</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: '0.75rem' }}>
              {['cash', 'card'].map((m) => (
                <button
                  key={m}
                  onClick={() => setRefundMethod(m)}
                  style={{
                    padding: '0.7rem',
                    background: refundMethod === m ? '#c4784a' : '#0f172a',
                    border: refundMethod === m ? 'none' : '1px solid #334155',
                    color: refundMethod === m ? '#fff' : '#cbd5e1',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontWeight: 600,
                    textTransform: 'capitalize',
                  }}>
                  {m.replace('_', ' ')}
                </button>
              ))}
            </div>

            <label className="modal-label">Reason (optional)</label>
            <input
              className="modal-input"
              placeholder="e.g. defective, wrong size, customer changed mind"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              style={{ marginBottom: '0.5rem' }}
            />
            <label className="modal-label">Notes (optional)</label>
            <textarea
              className="modal-input"
              rows={2} style={{ resize: 'vertical' }}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />

            <div className="modal-actions">
              <button onClick={() => setStep('pick')} className="modal-btn modal-btn-secondary">Back</button>
              <button onClick={submit} disabled={submitting} className="modal-btn modal-btn-primary">
                {submitting ? 'Processing…' : `Refund ${fmt(refundTotal)}`}
              </button>
            </div>
          </>
        )}
      </div>

      <style>{`
        .modal-wide { max-width: 640px; }
      `}</style>
    </div>
  );
}

const qtyBtn = {
  width: 26, height: 26, border: '1px solid #334155', background: '#0f172a',
  color: '#f8fafc', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
};
