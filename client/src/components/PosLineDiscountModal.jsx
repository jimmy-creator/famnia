/**
 * Per-line POS discount.
 *
 * Cashier picks % or a fixed amount off ONE cart line — a fixed amount is
 * per item, so it multiplies by the line quantity. Applied locally —
 * the parent keeps it on the cart line and sends it with the sale, where
 * the server recomputes it from the real product price.
 */
import { useState } from 'react';

export default function PosLineDiscountModal({
  line,              // cart line { name, price, priceOverride?, quantity, lineDiscount? }
  currency = 'KWD',
  onApply,           // (lineDiscount|null) => void
  onClose,
}) {
  const [kind, setKind] = useState(line.lineDiscount?.kind || 'percentage');
  const [value, setValue] = useState(line.lineDiscount?.value ?? '');

  const fmt = (n) => `${currency} ${(parseFloat(n) || 0).toFixed(3)}`;
  // A per-sale price override wins over the catalog price, same as the cart.
  const unitPrice = line.priceOverride != null ? line.priceOverride : line.price;
  const gross = +(unitPrice * line.quantity).toFixed(3);

  const preview = (() => {
    const v = parseFloat(value) || 0;
    if (v <= 0) return 0;
    const calc = kind === 'percentage' ? (gross * v) / 100 : v * line.quantity;
    return +Math.min(calc, gross).toFixed(3);
  })();

  const apply = () => {
    onApply(preview <= 0 ? null : { kind, value: parseFloat(value) });
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Item discount</h3>
          <button onClick={onClose} className="link-btn">Cancel</button>
        </div>
        <p style={{ color: 'var(--pos-text-2)', fontSize: 13, margin: '0.4rem 0 1rem' }}>
          {line.name} · {line.quantity} × {fmt(unitPrice)} = {fmt(gross)}
        </p>

        <label className="modal-label">Discount type</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: '0.75rem' }}>
          {[['percentage', '%'], ['fixed', currency]].map(([k, label]) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              style={{
                padding: '0.6rem',
                background: kind === k ? 'var(--pos-accent)' : 'var(--pos-bg)',
                border: kind === k ? 'none' : '1px solid var(--pos-line)',
                color: kind === k ? 'var(--pos-on-accent)' : 'var(--pos-label)',
                borderRadius: 8,
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontWeight: 600,
              }}>
              {label}
            </button>
          ))}
        </div>

        <label className="modal-label">Amount {kind === 'percentage' ? '(%)' : `(${currency} per item)`}</label>
        <input
          type="number" step={kind === 'percentage' ? '0.1' : '0.001'} min="0"
          max={kind === 'percentage' ? 100 : unitPrice}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && preview > 0) apply(); }}
          className="modal-input"
          autoFocus
        />

        <div style={{ marginTop: '0.75rem', padding: '0.6rem 0.8rem', background: 'var(--pos-bg)', borderRadius: 8, fontSize: 14, color: 'var(--pos-label)' }}>
          Discount: <strong style={{ color: 'var(--pos-warn)' }}>−{fmt(preview)}</strong>
          {' · '}Line total: <strong>{fmt(Math.max(0, gross - preview))}</strong>
        </div>

        <div className="modal-actions">
          {line.lineDiscount && (
            <button onClick={() => { onApply(null); onClose(); }} className="modal-btn modal-btn-secondary">
              Remove discount
            </button>
          )}
          <button onClick={apply} disabled={preview <= 0} className="modal-btn modal-btn-primary">Apply</button>
        </div>
      </div>
    </div>
  );
}
