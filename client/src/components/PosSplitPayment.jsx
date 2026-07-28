/**
 * Split-payment modal.
 *
 * Two side-by-side amount inputs: Cash and Card. Cashier types into
 * either or both; the modal tracks tendered, due, change. Submit
 * activates when the sum is at least the total (cash can overpay —
 * we calculate change but only the retained amount goes into the
 * payment breakdown sent to the server).
 *
 * Quick-fill chips help: "Exact half / Cash for rest / Card for rest".
 */
import { useState } from 'react';
import { HiCash, HiCreditCard } from 'react-icons/hi';

export default function PosSplitPayment({ total, currency = 'KWD', onClose, onConfirm, submitting }) {
  const [cash, setCash] = useState('');
  const [knet, setKnet] = useState('');
  const [card, setCard] = useState('');

  const fmt = (n) => `${currency} ${(parseFloat(n) || 0).toFixed(3)}`;
  const cashNum = parseFloat(cash) || 0;
  const knetNum = parseFloat(knet) || 0;
  const cardNum = parseFloat(card) || 0;

  // Cards / KNET terminals charge exactly the tender. Cash absorbs change.
  const cardApplied = Math.min(cardNum, total);
  const knetApplied = Math.min(knetNum, Math.max(0, total - cardApplied));
  const cashApplied = Math.max(0, total - cardApplied - knetApplied);   // what cash actually needs to cover
  const cashTendered = cashNum;
  const cashChange = Math.max(0, cashTendered - cashApplied);
  const remaining = +(total - cardApplied - knetApplied - Math.min(cashTendered, cashApplied)).toFixed(3);
  const fullyPaid = remaining <= 0.0001;

  // "X for rest" fills field X with whatever's left after the other two.
  const setCashForRest = () => setCash(Math.max(0, total - cardNum - knetNum).toFixed(3));
  const setKnetForRest = () => setKnet(Math.max(0, total - cardNum - cashNum).toFixed(3));
  const setCardForRest = () => setCard(Math.max(0, total - cashNum - knetNum).toFixed(3));

  const submit = (e) => {
    e.preventDefault();
    if (!fullyPaid) return;
    const tenders = [];
    if (cardApplied > 0) tenders.push({ method: 'card', amount: +cardApplied.toFixed(3) });
    if (knetApplied > 0) tenders.push({ method: 'knet', amount: +knetApplied.toFixed(3) });
    if (cashApplied > 0) tenders.push({ method: 'cash', amount: +cashApplied.toFixed(3) });
    onConfirm(tenders);
  };

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget && !submitting) onClose(); }}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit} style={{ maxWidth: 480 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Split payment</h3>
          <button type="button" onClick={onClose} className="link-btn">Cancel</button>
        </div>
        <div className="pay-total">{fmt(total)}</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: '0.5rem' }}>
          <div>
            <label className="modal-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <HiCash size={16} /> Cash
            </label>
            <input
              type="number" step="0.001" min={0}
              value={cash}
              onChange={(e) => setCash(e.target.value)}
              className="modal-input"
              autoFocus
              placeholder="0.000"
            />
          </div>
          <div>
            <label className="modal-label">KNET</label>
            <input
              type="number" step="0.001" min={0} max={total}
              value={knet}
              onChange={(e) => setKnet(e.target.value)}
              className="modal-input"
              placeholder="0.000"
            />
          </div>
          <div>
            <label className="modal-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <HiCreditCard size={16} /> Card
            </label>
            <input
              type="number" step="0.001" min={0} max={total}
              value={card}
              onChange={(e) => setCard(e.target.value)}
              className="modal-input"
              placeholder="0.000"
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={setCashForRest} className="quick-chip">Cash for rest</button>
          <button type="button" onClick={setKnetForRest} className="quick-chip">KNET for rest</button>
          <button type="button" onClick={setCardForRest} className="quick-chip">Card for rest</button>
        </div>

        <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: '#0f172a', borderRadius: 10, fontSize: 14, color: '#cbd5e1' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Card applied</span><strong>{fmt(cardApplied)}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>KNET applied</span><strong>{fmt(knetApplied)}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Cash applied</span><strong>{fmt(Math.min(cashTendered, cashApplied))}</strong>
          </div>
          {cashChange > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#34d399' }}>
              <span>Cash change</span><strong>{fmt(cashChange)}</strong>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, paddingTop: 6, borderTop: '1px solid #334155', fontSize: 16 }}>
            <span>{fullyPaid ? 'Fully paid' : 'Remaining'}</span>
            <strong style={{ color: fullyPaid ? '#34d399' : '#fbbf24' }}>
              {fmt(remaining)}
            </strong>
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" onClick={onClose} className="modal-btn modal-btn-secondary" disabled={submitting}>Cancel</button>
          <button type="submit" disabled={!fullyPaid || submitting} className="modal-btn modal-btn-primary">
            {submitting ? 'Processing…' : 'Confirm'}
          </button>
        </div>

        <style>{`
          .quick-chip {
            padding: 6px 10px; background: #0f172a; border: 1px solid #334155;
            color: #cbd5e1; border-radius: 100px; font-size: 12px;
            cursor: pointer; font-family: inherit;
          }
          .quick-chip:hover { background: #334155; }
        `}</style>
      </form>
    </div>
  );
}
