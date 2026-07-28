/**
 * Manager override PIN prompt.
 *
 * Triggered when the server returns 403 with `{requires: 'manager_override'}`
 * on a discount/refund/etc. The parent calls this modal with the
 * `reason` text from the server; the modal collects {userId, pin,
 * reason} and hands it back via onApprove so the caller can re-submit
 * the original action with the override appended.
 */
import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import api from '../api/axios';

export default function PosManagerOverride({ reasonText, onApprove, onCancel }) {
  const [managers, setManagers] = useState([]);
  const [userId, setUserId] = useState('');
  const [pin, setPin] = useState('');
  const [reason, setReason] = useState(reasonText || '');
  const [busy, setBusy] = useState(false);
  const pinRef = useRef(null);

  useEffect(() => {
    api.get('/pos/managers')
      .then(({ data }) => {
        setManagers(data);
        if (data.length === 1) setUserId(String(data[0].id));
      })
      .catch(() => toast.error('Could not load managers'));
  }, []);

  useEffect(() => {
    if (userId) pinRef.current?.focus();
  }, [userId]);

  const submit = async (e) => {
    e.preventDefault();
    if (!userId || !pin) {
      toast.error('Pick a manager and enter PIN');
      return;
    }
    setBusy(true);
    // The actual verification happens server-side when the parent
    // re-submits the original action with this override attached.
    // We don't pre-validate here to keep the round-trip count low.
    onApprove({ userId: parseInt(userId, 10), pin, reason: reason.trim() || undefined });
    setBusy(false);
  };

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <form className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h3 style={{ margin: '0 0 0.5rem' }}>Manager override</h3>
        <p style={{ color: '#94a3b8', fontSize: 13, margin: '0 0 1rem' }}>
          {reasonText || 'A manager must approve this action.'}
        </p>

        <label className="modal-label">Approving manager</label>
        <select
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className="modal-input"
          required
        >
          <option value="">— Select —</option>
          {managers.map((m) => (
            <option key={m.id} value={m.id}>{m.name} ({m.role})</option>
          ))}
        </select>

        <label className="modal-label" style={{ marginTop: '0.6rem' }}>PIN</label>
        <input
          ref={pinRef}
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
          className="modal-input"
          required
        />

        <label className="modal-label" style={{ marginTop: '0.6rem' }}>Reason (optional)</label>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="modal-input"
          placeholder="goodwill / manager approval / customer dispute"
        />

        <div className="modal-actions">
          <button type="button" onClick={onCancel} className="modal-btn modal-btn-secondary">Cancel</button>
          <button type="submit" disabled={busy || !userId || !pin} className="modal-btn modal-btn-primary">
            Approve
          </button>
        </div>

        {managers.length === 0 && (
          <p style={{ fontSize: 12, color: '#fbbf24', marginTop: '0.5rem' }}>
            No managers configured. Admin must mark a cashier as Manager in Admin → Cashiers.
          </p>
        )}
      </form>
    </div>
  );
}
