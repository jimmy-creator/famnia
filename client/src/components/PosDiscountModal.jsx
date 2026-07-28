/**
 * POS discount picker.
 *
 * Two tabs in one modal:
 *   - Manual: cashier types % or fixed amount (with optional reason).
 *     Applied locally — no server call needed.
 *   - Promo code: cashier types a Coupon code → server validates
 *     against cart items + subtotal → returns computed discount.
 *
 * Both can stack; the parent stores them separately and sends both
 * with the sale.
 */
import { useState } from 'react';
import toast from 'react-hot-toast';
import api from '../api/axios';

export default function PosDiscountModal({
  subtotal, cartItems, customer, currency = 'KWD',
  current,           // { manual?, coupon? }
  onApply,           // (next) => void
  onClose,
}) {
  const [tab, setTab] = useState(current?.coupon ? 'coupon' : 'manual');
  const [kind, setKind] = useState(current?.manual?.kind || 'percentage');
  const [value, setValue] = useState(current?.manual?.value || '');
  const [reason, setReason] = useState(current?.manual?.reason || '');
  const [code, setCode] = useState(current?.coupon?.code || '');
  const [appliedCoupon, setAppliedCoupon] = useState(current?.coupon || null);
  const [busy, setBusy] = useState(false);

  const fmt = (n) => `${currency} ${(parseFloat(n) || 0).toFixed(3)}`;

  // Live preview of the manual amount
  const manualPreview = (() => {
    const v = parseFloat(value) || 0;
    if (v <= 0) return 0;
    const calc = kind === 'percentage' ? (subtotal * v) / 100 : v;
    return +Math.min(calc, subtotal).toFixed(3);
  })();

  const applyManual = () => {
    if (manualPreview <= 0) {
      onApply({ ...current, manual: null });
    } else {
      onApply({
        ...current,
        manual: { kind, value: parseFloat(value), reason: reason.trim() || undefined },
      });
    }
    onClose();
  };

  const removeManual = () => {
    onApply({ ...current, manual: null });
    onClose();
  };

  const applyCoupon = async () => {
    if (!code.trim()) return;
    setBusy(true);
    try {
      const { data } = await api.post('/pos/preview-coupon', {
        code: code.trim(),
        items: cartItems.map((c) => ({
          productId: c.productId, category: c.category,
          price: c.price, quantity: c.quantity,
        })),
        userId: customer?.id || undefined,
      });
      setAppliedCoupon(data);
      toast.success(`${data.code} applied — ${fmt(data.discount)} off`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Invalid coupon');
      setAppliedCoupon(null);
    } finally {
      setBusy(false);
    }
  };

  const confirmCoupon = () => {
    onApply({ ...current, coupon: appliedCoupon });
    onClose();
  };

  const removeCoupon = () => {
    onApply({ ...current, coupon: null });
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Discount</h3>
          <button onClick={onClose} className="link-btn">Cancel</button>
        </div>

        <div style={{ display: 'flex', gap: 4, marginTop: '0.75rem', borderBottom: '1px solid #334155' }}>
          <button
            onClick={() => setTab('manual')}
            style={{ ...tabBtn, ...(tab === 'manual' ? tabActive : {}) }}>
            Manual
          </button>
          <button
            onClick={() => setTab('coupon')}
            style={{ ...tabBtn, ...(tab === 'coupon' ? tabActive : {}) }}>
            Promo code
          </button>
        </div>

        {tab === 'manual' && (
          <div style={{ paddingTop: '1rem' }}>
            <label className="modal-label">Discount type</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: '0.75rem' }}>
              {[['percentage', '%'], ['fixed', currency]].map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setKind(k)}
                  style={{
                    padding: '0.6rem',
                    background: kind === k ? '#c4784a' : '#0f172a',
                    border: kind === k ? 'none' : '1px solid #334155',
                    color: kind === k ? '#fff' : '#cbd5e1',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontWeight: 600,
                  }}>
                  {label}
                </button>
              ))}
            </div>

            <label className="modal-label">Amount {kind === 'percentage' ? '(%)' : `(${currency})`}</label>
            <input
              type="number" step={kind === 'percentage' ? '0.1' : '0.001'} min="0"
              max={kind === 'percentage' ? 100 : subtotal}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="modal-input"
              autoFocus
            />

            <label className="modal-label" style={{ marginTop: '0.75rem' }}>Reason (optional)</label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="modal-input"
              placeholder="loyalty / damaged / manager approval"
            />

            <div style={{ marginTop: '0.75rem', padding: '0.6rem 0.8rem', background: '#0f172a', borderRadius: 8, fontSize: 14, color: '#cbd5e1' }}>
              Discount: <strong style={{ color: '#fbbf24' }}>−{fmt(manualPreview)}</strong>
              {' · '}New subtotal: <strong>{fmt(Math.max(0, subtotal - manualPreview))}</strong>
            </div>

            <div className="modal-actions">
              {current?.manual && <button onClick={removeManual} className="modal-btn modal-btn-secondary">Remove discount</button>}
              <button onClick={applyManual} disabled={manualPreview <= 0} className="modal-btn modal-btn-primary">Apply</button>
            </div>
          </div>
        )}

        {tab === 'coupon' && (
          <div style={{ paddingTop: '1rem' }}>
            <label className="modal-label">Promo code</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                value={code}
                onChange={(e) => { setCode(e.target.value.toUpperCase()); setAppliedCoupon(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter') applyCoupon(); }}
                className="modal-input"
                placeholder="e.g. SUMMER20"
                style={{ flex: 1, textTransform: 'uppercase' }}
                autoFocus
              />
              <button onClick={applyCoupon} disabled={busy || !code.trim()} className="modal-btn modal-btn-primary" style={{ width: 120 }}>
                {busy ? '…' : 'Validate'}
              </button>
            </div>

            {appliedCoupon && (
              <div style={{ marginTop: '0.75rem', padding: '0.6rem 0.8rem', background: 'rgba(90,138,106,0.15)', borderRadius: 8, fontSize: 14, color: '#cbd5e1' }}>
                <div><strong>{appliedCoupon.code}</strong> — {appliedCoupon.type === 'percentage' ? `${appliedCoupon.value}% off` : `${currency} ${appliedCoupon.value} off`}</div>
                {appliedCoupon.description && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{appliedCoupon.description}</div>}
                <div style={{ marginTop: 4 }}>Discount: <strong style={{ color: '#fbbf24' }}>−{fmt(appliedCoupon.discount)}</strong></div>
              </div>
            )}

            <div className="modal-actions">
              {current?.coupon && <button onClick={removeCoupon} className="modal-btn modal-btn-secondary">Remove code</button>}
              <button
                onClick={confirmCoupon}
                disabled={!appliedCoupon}
                className="modal-btn modal-btn-primary">
                Apply
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const tabBtn = {
  flex: 1, padding: '0.6rem', background: 'transparent', border: 'none',
  color: '#94a3b8', cursor: 'pointer', fontFamily: 'inherit',
  fontSize: 14, borderBottom: '2px solid transparent',
};
const tabActive = { color: '#f8fafc', borderBottomColor: '#c4784a' };
