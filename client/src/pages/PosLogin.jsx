import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { CurrencySymbol } from '../utils/currency';
import { STAFF_BASE } from '../App';

/**
 * POS login terminal screen.
 *
 * Three-step flow:
 *   1. Pick the Location (this terminal's store)
 *   2. Pick your cashier name from the list
 *   3. Enter your PIN
 *      - if you already have an open shift: resumed immediately
 *      - else: prompts for opening cash before opening a new shift
 *
 * Lives at a non-obvious /<staff-base>/login path (see STAFF_BASE in App.jsx)
 * outside the regular admin auth flow. Once authenticated the cashier stays
 * logged in until they close the shift.
 */
export default function PosLogin() {
  const navigate = useNavigate();
  const [step, setStep] = useState('loading');     // loading | location | cashier | pin | opening
  const [locations, setLocations] = useState([]);
  const [cashiers, setCashiers] = useState([]);
  const [locationId, setLocationId] = useState(() => parseInt(localStorage.getItem('pos.locationId') || '', 10) || null);
  const [cashier, setCashier] = useState(null);    // {id, name, homeLocationId}
  const [pin, setPin] = useState('');
  const [openingCash, setOpeningCash] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const pinRef = useRef(null);

  useEffect(() => {
    Promise.all([
      api.get('/locations').catch(() => api.get('/cashier/cashiers').then(() => ({ data: [] }))),
      api.get('/cashier/cashiers'),
    ]).then(([locRes, cashRes]) => {
      // /api/locations is admin-protected so an unauth'd POS terminal can't list them.
      // Fallback: derive locations from the cashiers' homeLocation field.
      let locs = Array.isArray(locRes?.data) ? locRes.data : [];
      if (locs.length === 0) {
        const seen = new Map();
        for (const c of cashRes.data) {
          if (c.homeLocation && !seen.has(c.homeLocation.id)) seen.set(c.homeLocation.id, c.homeLocation);
        }
        locs = Array.from(seen.values());
      }
      setLocations(locs);
      setCashiers(cashRes.data);
      if (locationId && locs.find((l) => l.id === locationId)) {
        setStep('cashier');
      } else {
        setStep('location');
      }
    }).catch(() => {
      toast.error('Could not load POS data');
      setStep('location');
    });
  }, []);     // eslint-disable-line react-hooks/exhaustive-deps

  const pickLocation = (l) => {
    setLocationId(l.id);
    localStorage.setItem('pos.locationId', String(l.id));
    setStep('cashier');
  };

  const pickCashier = (c) => {
    setCashier(c);
    setPin('');
    setStep('pin');
    setTimeout(() => pinRef.current?.focus(), 50);
  };

  const tryLogin = async (withOpeningCash) => {
    setSubmitting(true);
    try {
      const body = { userId: cashier.id, pin, locationId };
      if (withOpeningCash !== undefined) body.openingCash = withOpeningCash;
      const { data } = await api.post('/cashier/login', body);
      toast.success(data.resumed ? 'Shift resumed' : 'Shift opened');
      navigate(STAFF_BASE);
    } catch (err) {
      const status = err.response?.status;
      const detail = err.response?.data;
      if (status === 409 && detail?.requires === 'openingCash') {
        setStep('opening');
      } else {
        toast.error(detail?.message || 'Login failed');
        setPin('');
        pinRef.current?.focus();
      }
    } finally { setSubmitting(false); }
  };

  if (step === 'loading') {
    return <div className="pos-shell"><p className="pos-loading">Loading…</p></div>;
  }

  return (
    <div className="pos-shell">
      <div className="pos-card">
        <div className="pos-header">
          <h1>POS Terminal</h1>
          {locationId && <p className="pos-meta">📍 {locations.find((l) => l.id === locationId)?.name || `Location #${locationId}`}</p>}
        </div>

        {step === 'location' && (
          <>
            <h2>Choose your store</h2>
            <div className="pos-list">
              {locations.length === 0 ? (
                <p className="pos-loading">No locations set up. Ask an admin to create one in admin → Locations.</p>
              ) : locations.map((l) => (
                <button key={l.id} className="pos-tile" onClick={() => pickLocation(l)}>
                  <span className="pos-tile-name">{l.name}</span>
                  {l.code && <span className="pos-tile-meta">{l.code}</span>}
                </button>
              ))}
            </div>
          </>
        )}

        {step === 'cashier' && (
          <>
            <h2>Who's at the till?</h2>
            <div className="pos-list">
              {cashiers.length === 0 ? (
                <p className="pos-loading">No cashier accounts yet. Ask an admin to add one in admin → Cashiers.</p>
              ) : cashiers.map((c) => (
                <button key={c.id} className="pos-tile" onClick={() => pickCashier(c)}>
                  <span className="pos-tile-name">{c.name}</span>
                  {c.homeLocation && <span className="pos-tile-meta">{c.homeLocation.name}</span>}
                </button>
              ))}
            </div>
            <button className="pos-link" onClick={() => setStep('location')}>← Change location</button>
          </>
        )}

        {step === 'pin' && (
          <>
            <h2>Hi {cashier.name}, enter your PIN</h2>
            <form onSubmit={(e) => { e.preventDefault(); tryLogin(); }}>
              <input
                ref={pinRef}
                type="password"
                inputMode="numeric"
                pattern="\d*"
                autoComplete="off"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="••••"
                className="pos-pin-input"
                autoFocus
              />
              <button type="submit" className="pos-btn-primary" disabled={submitting || pin.length < 4}>
                {submitting ? 'Checking…' : 'Sign in'}
              </button>
            </form>
            <button className="pos-link" onClick={() => { setCashier(null); setStep('cashier'); }}>← Different cashier</button>
          </>
        )}

        {step === 'opening' && (
          <>
            <h2>Open new shift</h2>
            <p className="pos-loading">
              No open shift for {cashier.name}. Count the cash in the drawer and enter the opening amount.
            </p>
            <form onSubmit={(e) => { e.preventDefault(); tryLogin(parseFloat(openingCash) || 0); }}>
              <label className="pos-label">
                Opening cash (<CurrencySymbol />)
                <input
                  type="number" step="0.001" min={0}
                  value={openingCash}
                  onChange={(e) => setOpeningCash(e.target.value)}
                  placeholder="0.000"
                  className="pos-cash-input"
                  autoFocus
                />
              </label>
              <button type="submit" className="pos-btn-primary" disabled={submitting || openingCash === ''}>
                {submitting ? 'Opening…' : 'Open shift'}
              </button>
            </form>
            <button className="pos-link" onClick={() => setStep('pin')}>← Back</button>
          </>
        )}
      </div>

      <style>{`
        .pos-shell {
          min-height: 100vh;
          background: #0f172a;
          color: #f8fafc;
          display: grid;
          place-items: center;
          padding: 2rem 1rem;
          font-family: -apple-system, 'SF Pro Text', 'Segoe UI', Roboto, Arial, sans-serif;
        }
        .pos-card {
          background: #1e293b;
          border: 1px solid #334155;
          border-radius: 18px;
          padding: 2.5rem;
          width: 100%;
          max-width: 500px;
          box-shadow: 0 20px 60px -20px rgba(0, 0, 0, 0.6);
        }
        .pos-header h1 {
          font-size: 1.4rem;
          margin: 0 0 0.4rem;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: #cbd5e1;
        }
        .pos-meta {
          margin: 0 0 1.5rem;
          font-size: 0.85rem;
          color: #94a3b8;
        }
        .pos-card h2 {
          font-size: 1.5rem;
          font-weight: 600;
          margin: 0 0 1.25rem;
        }
        .pos-loading { color: #94a3b8; font-size: 0.95rem; margin: 0 0 1rem; }
        .pos-list {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 0.75rem;
          margin-bottom: 1.25rem;
        }
        .pos-tile {
          background: #0f172a;
          border: 1px solid #334155;
          border-radius: 12px;
          padding: 1.25rem 1rem;
          color: #f8fafc;
          font-family: inherit;
          text-align: left;
          cursor: pointer;
          display: flex; flex-direction: column; gap: 0.3rem;
          transition: all 0.15s;
        }
        .pos-tile:hover { background: #1e293b; border-color: #475569; transform: translateY(-1px); }
        .pos-tile-name { font-size: 1.05rem; font-weight: 600; }
        .pos-tile-meta { font-size: 0.78rem; color: #94a3b8; }
        .pos-pin-input {
          width: 100%;
          font-size: 2.5rem;
          letter-spacing: 0.8em;
          text-align: center;
          padding: 1rem;
          background: #0f172a;
          border: 1px solid #334155;
          border-radius: 10px;
          color: #f8fafc;
          font-family: inherit;
          margin-bottom: 1rem;
        }
        .pos-cash-input {
          display: block;
          width: 100%;
          font-size: 1.5rem;
          padding: 0.75rem 1rem;
          background: #0f172a;
          border: 1px solid #334155;
          border-radius: 10px;
          color: #f8fafc;
          font-family: inherit;
          margin-top: 0.4rem;
          margin-bottom: 1rem;
        }
        .pos-label { font-size: 0.9rem; color: #cbd5e1; }
        .pos-btn-primary {
          width: 100%;
          background: #c4784a;
          color: #fff;
          border: none;
          border-radius: 10px;
          padding: 0.85rem;
          font-size: 1rem;
          font-weight: 600;
          font-family: inherit;
          cursor: pointer;
          transition: background 0.15s;
        }
        .pos-btn-primary:hover:not(:disabled) { background: #b56a3e; }
        .pos-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .pos-link {
          background: none;
          border: none;
          color: #94a3b8;
          font-size: 0.85rem;
          margin-top: 1rem;
          cursor: pointer;
          font-family: inherit;
          padding: 0;
        }
        .pos-link:hover { color: #cbd5e1; }
      `}</style>
    </div>
  );
}
