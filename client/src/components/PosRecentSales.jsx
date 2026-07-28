/**
 * Recent-sales picker for the current cashier shift.
 *
 * Shows the cashier's recent POS orders with a Void action per row.
 * Voiding requires a manager PIN — the parent (Pos.jsx) handles the
 * override modal via onNeedOverride, same pattern as the return flow.
 */
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { HiPrinter } from 'react-icons/hi';
import api from '../api/axios';

export default function PosRecentSales({ currency = 'KWD', onClose, onNeedOverride, onEdit, onPrint }) {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);

  const fmt = (n) => `${currency} ${(parseFloat(n) || 0).toFixed(3)}`;

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/pos/recent-sales');
      setSales(data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not load sales');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const postVoid = async (orderId, managerOverride) => {
    const { data } = await api.post(`/pos/sales/${orderId}/void`, {
      managerOverride: managerOverride || undefined,
    });
    toast.success(`Sale voided · refunded ${fmt(data.salesReturn.refundAmount)}`);
    load();
  };

  const startVoid = async (sale) => {
    try {
      await postVoid(sale.id);
    } catch (err) {
      if (err.response?.data?.requires === 'manager_override' && onNeedOverride) {
        onNeedOverride({
          reason: err.response.data.message,
          retry: (override) => postVoid(sale.id, override),
        });
      } else {
        toast.error(err.response?.data?.message || 'Void failed');
      }
    }
  };

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Recent sales — this shift</h3>
          <button onClick={onClose} className="link-btn">Close</button>
        </div>

        {loading && <p style={{ color: '#94a3b8', padding: '1rem 0' }}>Loading…</p>}
        {!loading && sales.length === 0 && (
          <p style={{ color: '#94a3b8', padding: '1rem 0' }}>No sales yet in this shift.</p>
        )}

        {!loading && sales.length > 0 && (
          <div style={{ marginTop: '0.75rem', maxHeight: '60vh', overflowY: 'auto' }}>
            {sales.map((s) => {
              const fullyVoid = parseFloat(s.refundAmount || 0) >= parseFloat(s.totalAmount);
              const remaining = +(parseFloat(s.totalAmount) - parseFloat(s.refundAmount || 0)).toFixed(3);
              return (
                <div key={s.id} style={{
                  display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '0.75rem',
                  padding: '0.75rem', border: '1px solid #334155', borderRadius: 8,
                  marginBottom: '0.4rem', background: fullyVoid ? '#1e293b66' : '#0f172a',
                  opacity: fullyVoid ? 0.5 : 1,
                }}>
                  <div>
                    <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#94a3b8' }}>{s.orderNumber}</div>
                    <div style={{ fontSize: 13 }}>
                      {(s.items || []).length} items · {new Date(s.createdAt).toLocaleTimeString()} · {s.paymentMethod === 'pos_cash' ? 'Cash' : 'Card'}
                    </div>
                    {s.shippingAddress?.fullName && s.shippingAddress.fullName !== 'Walk-in' && (
                      <div style={{ fontSize: 12, color: '#cbd5e1' }}>{s.shippingAddress.fullName}</div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 600 }}>{fmt(s.totalAmount)}</div>
                    {parseFloat(s.refundAmount || 0) > 0 && (
                      <div style={{ fontSize: 12, color: '#fbbf24' }}>
                        {fullyVoid ? 'VOIDED' : `−${fmt(s.refundAmount)} refunded`}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {onPrint && (
                      <button
                        onClick={async () => {
                          try {
                            const { data } = await api.get(`/pos/sales/${s.id}/receipt`);
                            onPrint(data);
                          } catch (err) {
                            toast.error(err.response?.data?.message || 'Could not load receipt');
                          }
                        }}
                        title="Reprint receipt"
                        style={{
                          padding: '0.4rem 0.55rem', background: '#1e293b', color: '#cbd5e1',
                          border: '1px solid #334155', borderRadius: 6, cursor: 'pointer',
                          fontFamily: 'inherit', display: 'grid', placeItems: 'center',
                        }}>
                        <HiPrinter size={14} />
                      </button>
                    )}
                    {!fullyVoid && onEdit && (
                      <button
                        onClick={() => onEdit(s.orderNumber)}
                        style={{
                          padding: '0.4rem 0.7rem', background: '#1e293b', color: '#cbd5e1',
                          border: '1px solid #334155', borderRadius: 6, cursor: 'pointer',
                          fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: 600,
                        }}>
                        Edit
                      </button>
                    )}
                    {!fullyVoid && (
                      <button
                        onClick={() => {
                          if (!confirm(`Void sale ${s.orderNumber}? Refund ${fmt(remaining)} ${s.paymentMethod === 'pos_cash' ? 'in cash' : 'to card'}, return all items to stock.`)) return;
                          startVoid(s);
                        }}
                        style={{
                          padding: '0.4rem 0.7rem', background: '#7f1d1d', color: '#fff',
                          border: 'none', borderRadius: 6, cursor: 'pointer',
                          fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: 600,
                        }}>
                        Void
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p style={{ fontSize: 11, color: '#64748b', marginTop: '0.5rem' }}>
          Voiding requires a manager PIN. To make small corrections, use Return instead.
        </p>
      </div>
    </div>
  );
}
