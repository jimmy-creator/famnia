/**
 * Per-sale price override for one POS cart line.
 *
 * The cashier types the price actually being charged for this sale. The
 * catalog price is untouched — the override rides along on the cart line
 * and is applied by the server when the sale commits.
 */
import { useState } from 'react';

export default function PosPriceOverrideModal({
  line,              // cart line { name, price (catalog), priceOverride?, quantity }
  currency = 'KWD',
  onApply,           // (price|null) => void
  onClose,
}) {
  const [value, setValue] = useState(
    line.priceOverride != null ? String(line.priceOverride) : '',
  );

  const fmt = (n) => `${currency} ${(parseFloat(n) || 0).toFixed(3)}`;
  const catalog = parseFloat(line.price) || 0;
  const typed = value.trim() === '' ? null : parseFloat(value);
  const valid = typed != null && Number.isFinite(typed) && typed >= 0;
  const effective = valid ? typed : catalog;
  const delta = +(effective - catalog).toFixed(3);

  const apply = () => {
    if (!valid) return;
    // Typing the catalog price back is the same as clearing the override.
    onApply(+typed.toFixed(3) === +catalog.toFixed(3) ? null : +typed.toFixed(3));
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Price for this sale</h3>
          <button onClick={onClose} className="link-btn">Cancel</button>
        </div>
        <p style={{ color: 'var(--pos-text-2)', fontSize: 13, margin: '0.4rem 0 1rem' }}>
          {line.name} · catalog price {fmt(catalog)}
        </p>

        <label className="modal-label">New unit price ({currency})</label>
        <input
          type="number" step="0.001" min="0"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && valid) apply(); }}
          className="modal-input"
          placeholder={catalog.toFixed(3)}
          autoFocus
        />

        <div style={{ marginTop: '0.75rem', padding: '0.6rem 0.8rem', background: 'var(--pos-bg)', borderRadius: 8, fontSize: 14, color: 'var(--pos-label)' }}>
          {delta !== 0 && (
            <>
              {delta < 0 ? 'Down ' : 'Up '}
              <strong style={{ color: delta < 0 ? 'var(--pos-warn)' : 'var(--pos-success)' }}>
                {fmt(Math.abs(delta))}
              </strong>
              {' per unit · '}
            </>
          )}
          Line total: <strong>{fmt(effective * line.quantity)}</strong>
          {' '}({line.quantity} × {fmt(effective)})
        </div>

        <div className="modal-actions">
          {line.priceOverride != null && (
            <button onClick={() => { onApply(null); onClose(); }} className="modal-btn modal-btn-secondary">
              Reset to catalog
            </button>
          )}
          <button onClick={apply} disabled={!valid} className="modal-btn modal-btn-primary">Apply</button>
        </div>
      </div>
    </div>
  );
}
