/**
 * POS sales terminal.
 *
 * Two-pane layout: product search/scan on the left, cart + payment on the
 * right. Search input is permanently autofocused so a USB barcode scanner
 * (which emits keystrokes + Enter) goes straight into the cart.
 *
 *   - Enter on the search box triggers an exact-code lookup; if there's
 *     exactly one match it's added directly.
 *   - Variant products show a chooser modal before being added.
 *   - "Close shift" lives in the top bar; receipt printing fires after
 *     a successful sale via the PosReceipt component.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { STAFF_BASE } from '../App';
import toast from 'react-hot-toast';
import {
  HiShoppingCart, HiClock, HiReply, HiChartBar,
  HiLogout, HiOutlineLogout, HiUserCircle, HiCash, HiCreditCard,
  HiSearch, HiX, HiPrinter,
} from 'react-icons/hi';
import api from '../api/axios';
import { CurrencySymbol } from '../utils/currency';
import PosReceipt from '../components/PosReceipt';
import PosReportReceipt from '../components/PosReportReceipt';
import PosReturnModal from '../components/PosReturnModal';
import PosReturnReceipt from '../components/PosReturnReceipt';
import PosCustomerPicker from '../components/PosCustomerPicker';
import PosDiscountModal from '../components/PosDiscountModal';
import PosManagerOverride from '../components/PosManagerOverride';
import PosRecentSales from '../components/PosRecentSales';
import PosSplitPayment from '../components/PosSplitPayment';
import PosPrinterSettings from '../components/PosPrinterSettings';
import PosBillEditor from '../components/PosBillEditor';

const CURRENCY = import.meta.env.VITE_CURRENCY_CODE || 'KWD';

// Small live clock for the POS top bar — purely cosmetic.
function PosClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="topbar-clock">
      {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
    </span>
  );
}

export default function Pos() {
  const navigate = useNavigate();
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const [cart, setCart] = useState([]);            // {productId, variantIndex, name, price, quantity, stockAtLocation}
  const [variantPicker, setVariantPicker] = useState(null);  // product-search-result with hasVariants
  const [linkedCustomer, setLinkedCustomer] = useState(null);   // null = walk-in
  const [discount, setDiscount] = useState(null);                // { manual?, coupon? } | null
  const [discountOpen, setDiscountOpen] = useState(false);
  const [pendingOverride, setPendingOverride] = useState(null);  // { reason, retry } | null
  const [recentOpen, setRecentOpen] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const [printerOpen, setPrinterOpen] = useState(false);
  const [editBill, setEditBill] = useState(null);   // orderNumber | null
  const [payOpen, setPayOpen] = useState(null);    // 'cash' | 'card' | null
  const [tendered, setTendered] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [closeForm, setCloseForm] = useState(null);
  const [report, setReport] = useState(null);   // X or Z report payload
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnReceipt, setReturnReceipt] = useState(null);

  const searchRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    api.get('/cashier/me')
      .then((res) => setMe(res.data))
      .catch(() => navigate(`${STAFF_BASE}/login`))
      .finally(() => setLoading(false));
  }, [navigate]);

  // Keep the scanner-input focused — bounce focus back if the user clicks elsewhere
  // (unless a modal is open).
  useEffect(() => {
    if (variantPicker || payOpen || receipt || closeForm || report || returnOpen || returnReceipt || discountOpen || pendingOverride || recentOpen || splitOpen || printerOpen || editBill) return;
    const interval = setInterval(() => {
      if (document.activeElement !== searchRef.current && !document.activeElement?.matches?.('input, textarea, button')) {
        searchRef.current?.focus();
      }
    }, 1500);
    return () => clearInterval(interval);
  }, [variantPicker, payOpen, receipt, closeForm, report, returnOpen, returnReceipt, discountOpen, pendingOverride, recentOpen, splitOpen, printerOpen, editBill]);

  const runSearch = useCallback(async (q) => {
    if (!q.trim()) { setResults([]); return; }
    setSearching(true);
    try {
      const { data } = await api.get('/pos/products', { params: { q } });
      setResults(data);
    } catch (err) {
      console.error(err);
    } finally {
      setSearching(false);
    }
  }, []);

  // Debounced typed search (250ms) — barcode scanner triggers immediate on Enter.
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(query), 250);
    return () => clearTimeout(debounceRef.current);
  }, [query, runSearch]);

  // Reset highlight when results change.
  useEffect(() => { setHighlightIdx(0); }, [results]);

  if (loading) return <div style={{ minHeight: '100vh', background: '#0f172a', color: '#94a3b8', display: 'grid', placeItems: 'center' }}>Loading…</div>;
  if (!me) return null;

  const { user, session } = me;

  const addToCart = (item) => {
    if (item.hasVariants) {
      setVariantPicker(item);
      return;
    }
    if (item.stockAtLocation < 1) {
      toast.error('Out of stock at this location');
      return;
    }
    setCart((prev) => {
      const key = `${item.productId}:${item.variantIndex ?? 'b'}`;
      const idx = prev.findIndex((c) => `${c.productId}:${c.variantIndex ?? 'b'}` === key);
      if (idx >= 0) {
        const next = [...prev];
        const newQty = next[idx].quantity + 1;
        if (newQty > item.stockAtLocation) {
          toast.error(`Only ${item.stockAtLocation} in stock`);
          return prev;
        }
        next[idx] = { ...next[idx], quantity: newQty };
        return next;
      }
      return [...prev, {
        productId: item.productId,
        variantIndex: item.variantIndex,
        name: item.name,
        price: item.price,
        quantity: 1,
        stockAtLocation: item.stockAtLocation,
      }];
    });
    setQuery('');
    setResults([]);
    searchRef.current?.focus();
  };

  const pickVariant = (variantIndex) => {
    const v = variantPicker.variants[variantIndex];
    setVariantPicker(null);
    addToCart({
      productId: variantPicker.productId,
      variantIndex,
      name: `${variantPicker.name} (${Object.values(v.options || {}).join('/')})`,
      code: v.sku,
      price: parseFloat(v.price ?? variantPicker.price) || 0,
      stockAtLocation: v.stockAtLocation || 0,
      hasVariants: false,
    });
  };

  const setQty = (idx, qty) => {
    setCart((prev) => {
      const next = [...prev];
      const max = next[idx].stockAtLocation;
      const q = Math.max(1, Math.min(qty, max));
      next[idx] = { ...next[idx], quantity: q };
      return next;
    });
  };
  const removeLine = (idx) => setCart((prev) => prev.filter((_, i) => i !== idx));

  const subTotal = cart.reduce((s, c) => s + c.price * c.quantity, 0);
  // Compute discount preview the same way the server does. Manual
  // discount applies to subtotal; coupon already carries its computed
  // amount from the preview call (server re-validates on commit).
  const manualOff = (() => {
    if (!discount?.manual) return 0;
    const v = parseFloat(discount.manual.value) || 0;
    const calc = discount.manual.kind === 'percentage' ? (subTotal * v) / 100 : v;
    return +Math.min(calc, subTotal).toFixed(3);
  })();
  const couponOff = discount?.coupon ? +(parseFloat(discount.coupon.discount) || 0).toFixed(3) : 0;
  const discountTotal = +Math.min(manualOff + couponOff, subTotal).toFixed(3);
  const total = +Math.max(0, subTotal - discountTotal).toFixed(3);

  // ─── Search keyboard handling ───────────────────────────────────
  // Enter on a single result -> add. Enter with multiple -> add the
  // highlighted row. Arrows move the highlight. Escape clears the
  // query so the cashier can re-scan.
  const onSearchKey = (e) => {
    if (e.key === 'Escape') {
      setQuery('');
      setResults([]);
      return;
    }
    if (e.key === 'ArrowDown' && results.length > 0) {
      e.preventDefault();
      setHighlightIdx((i) => Math.min(i + 1, results.length - 1));
      return;
    }
    if (e.key === 'ArrowUp' && results.length > 0) {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (results.length === 1) addToCart(results[0]);
    else if (results.length > 1) addToCart(results[Math.min(highlightIdx, results.length - 1)]);
    else if (results.length === 0 && query.trim()) toast.error('No match');
  };

  const postSale = async (paymentPayload, managerOverride) => {
    const body = {
      items: cart.map((c) => ({ productId: c.productId, variantIndex: c.variantIndex, quantity: c.quantity })),
      userId: linkedCustomer?.id || undefined,
      couponCode: discount?.coupon?.code || undefined,
      manualDiscount: discount?.manual || undefined,
      managerOverride: managerOverride || undefined,
      payment: paymentPayload,
    };
    const { data } = await api.post('/pos/sale', body);
    setReceipt(data);
    setCart([]);
    setLinkedCustomer(null);
    setDiscount(null);
    setTendered('');
    setPayOpen(null);
    setSplitOpen(false);
    searchRef.current?.focus();
  };

  const submitSale = async () => {
    if (cart.length === 0) return;
    setSubmitting(true);
    try {
      await postSale({
        method: payOpen,
        amountTendered: payOpen === 'cash' ? parseFloat(tendered) : total,
      });
    } catch (err) {
      if (err.response?.data?.requires === 'manager_override') {
        setPendingOverride({
          reason: err.response.data.message,
          retry: (override) => postSale({
            method: payOpen,
            amountTendered: payOpen === 'cash' ? parseFloat(tendered) : total,
          }, override),
        });
      } else {
        toast.error(err.response?.data?.message || 'Sale failed');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const submitSplit = async (tenders) => {
    if (cart.length === 0) return;
    setSubmitting(true);
    try {
      await postSale({ tenders });
    } catch (err) {
      if (err.response?.data?.requires === 'manager_override') {
        setPendingOverride({
          reason: err.response.data.message,
          retry: (override) => postSale({ tenders }, override),
        });
      } else {
        toast.error(err.response?.data?.message || 'Sale failed');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const signOut = async () => {
    await api.post('/cashier/logout').catch(() => {});
    navigate(`${STAFF_BASE}/login`);
  };

  const openXReport = async () => {
    try {
      const { data } = await api.get('/reports/x');
      setReport(data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not load X-report');
    }
  };

  // On close: fire the Z-report *before* the JWT cookie is wiped, then
  // navigate to the staff login when the report dialog is dismissed.
  const submitClose = async (e) => {
    e.preventDefault();
    try {
      const sessionId = session.id;
      // Fetch the Z-report data first (still has the cashier JWT)
      const { data: zData } = await api.get(`/reports/z/${sessionId}`).catch(() => ({ data: null }));
      const { data } = await api.post('/cashier/shift/close', closeForm);
      const v = data.variance;
      toast.success(`Shift closed · variance ${v >= 0 ? '+' : ''}${v}`);
      setCloseForm(null);
      if (zData) {
        // Overlay merges the freshly closed counts.
        setReport({ ...zData, closingCash: data.session.closingCash, variance: data.variance, type: 'Z' });
      } else {
        navigate(`${STAFF_BASE}/login`);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    }
  };

  const closeReport = () => {
    const wasZ = report?.type === 'Z';
    setReport(null);
    if (wasZ) navigate(`${STAFF_BASE}/login`);
  };

  const fmt = (n) => `${CURRENCY} ${(parseFloat(n) || 0).toFixed(3)}`;
  const cashChange = payOpen === 'cash' && tendered ? +(parseFloat(tendered) - total).toFixed(3) : 0;

  return (
    <div className="pos-app">
      {/* ─── Left action rail ────────────────────── */}
      <aside className="pos-rail">
        <div className="rail-brand">{(session.Location?.name || 'POS').slice(0, 1)}</div>
        <button className="rail-btn rail-btn-active" title="Sell">
          <HiShoppingCart size={22} /><span>Sell</span>
        </button>
        <button className="rail-btn" onClick={() => setRecentOpen(true)} title="Recent sales">
          <HiClock size={22} /><span>Recent</span>
        </button>
        <button className="rail-btn" onClick={() => setReturnOpen(true)} title="Returns">
          <HiReply size={22} /><span>Return</span>
        </button>
        <button className="rail-btn" onClick={openXReport} title="X-report">
          <HiChartBar size={22} /><span>X-report</span>
        </button>
        <div className="rail-spacer" />
        <button className="rail-btn" onClick={() => setPrinterOpen(true)} title="Printer">
          <HiPrinter size={22} /><span>Printer</span>
        </button>
        <button className="rail-btn rail-btn-warn" onClick={() => setCloseForm({ closingCash: '', notes: '' })} title="Close shift">
          <HiLogout size={22} /><span>Close</span>
        </button>
        <button className="rail-btn" onClick={signOut} title="Sign out">
          <HiOutlineLogout size={22} /><span>Exit</span>
        </button>
      </aside>

      {/* ─── Slim info bar ───────────────────────── */}
      <header className="pos-topbar">
        <div className="topbar-info">
          <span className="topbar-loc">{session.Location?.name || `Location #${session.locationId}`}</span>
          <span className="topbar-sep">·</span>
          <HiUserCircle size={16} style={{ verticalAlign: '-3px', marginRight: 4 }} />
          <span className="topbar-cashier">{user.name}</span>
        </div>
        <PosClock />
      </header>

      <div className="pos-grid">
        {/* ─── Left: search + results ────────────── */}
        <section className="pos-left">
          <div className="search-bar">
            <HiSearch className="search-icon" size={20} />
            <input
              ref={searchRef}
              type="text"
              autoFocus
              placeholder="Scan barcode or search products…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onSearchKey}
              className="search-input"
            />
            <div className="search-trailing">
              {searching && <span className="search-spinner" />}
              {query && !searching && (
                <button
                  onClick={() => { setQuery(''); setResults([]); searchRef.current?.focus(); }}
                  className="search-clear"
                  aria-label="Clear">
                  <HiX size={16} />
                </button>
              )}
              {!query && (
                <kbd className="search-hint">↵ to add</kbd>
              )}
            </div>
          </div>

          {query.trim() && (
            <div className="results-meta">
              {searching && 'Searching…'}
              {!searching && results.length > 0 && `${results.length} result${results.length === 1 ? '' : 's'} · ↑↓ to navigate`}
              {!searching && results.length === 0 && 'No matches'}
            </div>
          )}

          <div className="results-list">
            {results.length === 0 && !query.trim() && (
              <div className="results-empty">
                <HiSearch size={32} style={{ opacity: 0.3, marginBottom: 12 }} />
                <div>Scan a barcode or type a product name</div>
                <div style={{ fontSize: 12, marginTop: 8, color: 'var(--pos-text-3)' }}>
                  Press <kbd className="kbd-inline">↵</kbd> to add · <kbd className="kbd-inline">Esc</kbd> to clear
                </div>
              </div>
            )}
            {results.map((r, i) => (
              <button
                key={`${r.productId}-${r.variantIndex ?? 'b'}-${i}`}
                className={`result-item ${i === highlightIdx ? 'is-highlighted' : ''}`}
                onClick={() => addToCart(r)}
                onMouseEnter={() => setHighlightIdx(i)}
                disabled={!r.hasVariants && r.stockAtLocation < 1}
                ref={i === highlightIdx ? (el) => el?.scrollIntoView({ block: 'nearest' }) : undefined}
              >
                <div className="result-main">
                  <div className="result-name">{r.name}</div>
                  <div className="result-meta">
                    {r.code && <span className="result-sku">SKU {r.code}</span>}
                    {r.hasVariants
                      ? <span className="badge">{r.variants.length} variants</span>
                      : <span className={`stock-pill ${r.stockAtLocation < 1 ? 'stock-out' : 'stock-ok'}`}>
                          <span className="stock-dot" />
                          {r.stockAtLocation} in stock
                        </span>}
                  </div>
                </div>
                <div className="result-price">{fmt(r.price)}</div>
              </button>
            ))}
          </div>
        </section>

        {/* ─── Right: cart + checkout ────────────── */}
        <aside className="pos-right">
          <div className="cart-header">
            <h2>Cart</h2>
            {cart.length > 0 && <button className="link-btn" onClick={() => setCart([])}>Clear</button>}
          </div>

          <div className="cart-list">
            {cart.length === 0 && <div className="cart-empty">No items yet</div>}
            {cart.map((c, i) => (
              <div key={i} className="cart-line">
                <div className="cart-line-info">
                  <div className="cart-line-name">{c.name}</div>
                  <div className="cart-line-price">{fmt(c.price)} ea</div>
                </div>
                <div className="cart-line-controls">
                  <button onClick={() => setQty(i, c.quantity - 1)}>−</button>
                  <span>{c.quantity}</span>
                  <button onClick={() => setQty(i, c.quantity + 1)}>+</button>
                  <button onClick={() => removeLine(i)} className="cart-remove">✕</button>
                </div>
                <div className="cart-line-total">{fmt(c.price * c.quantity)}</div>
              </div>
            ))}
          </div>

          <div className="cart-customer">
            <PosCustomerPicker
              customer={linkedCustomer}
              onSelect={setLinkedCustomer}
              onClear={() => setLinkedCustomer(null)}
            />
          </div>

          <div className="cart-totals">
            <button
              className="discount-btn"
              onClick={() => setDiscountOpen(true)}
              disabled={cart.length === 0}>
              {discount?.manual || discount?.coupon
                ? `Discount applied · −${fmt(discountTotal)}`
                : '+ Add discount'}
            </button>
            {discountTotal > 0 && (
              <>
                <div className="sub-row"><span>Subtotal</span><span>{fmt(subTotal)}</span></div>
                <div className="sub-row discount-row"><span>Discount</span><span>−{fmt(discountTotal)}</span></div>
              </>
            )}
            <div className="total-row">
              <span>Total</span>
              <strong>{fmt(total)}</strong>
            </div>
          </div>

          <div className="pay-buttons">
            <button
              disabled={cart.length === 0}
              onClick={() => { setPayOpen('cash'); setTendered(total.toFixed(3)); }}
              className="pay-btn pay-btn-cash">
              <HiCash size={22} /> Cash
            </button>
            <button
              disabled={cart.length === 0}
              onClick={() => setPayOpen('knet')}
              className="pay-btn pay-btn-knet">
              KNET
            </button>
            <button
              disabled={cart.length === 0}
              onClick={() => setPayOpen('card')}
              className="pay-btn pay-btn-card">
              <HiCreditCard size={22} /> Card
            </button>
          </div>
          <button
            disabled={cart.length === 0}
            onClick={() => setSplitOpen(true)}
            className="split-link">
            or split between cash &amp; card →
          </button>
        </aside>
      </div>

      {/* ─── Variant picker ─────────────────── */}
      {variantPicker && (
        <div className="modal-backdrop" onClick={() => setVariantPicker(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{variantPicker.name}</h3>
            <p style={{ color: '#94a3b8', fontSize: 13, margin: '0 0 1rem' }}>Choose a variant</p>
            <div className="variant-list">
              {variantPicker.variants.map((v, i) => {
                const stock = v.stockAtLocation || 0;
                return (
                  <button
                    key={i}
                    className="variant-btn"
                    onClick={() => pickVariant(i)}
                    disabled={stock < 1}>
                    <span>{Object.values(v.options || {}).join(' / ')}</span>
                    <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <span className={stock < 1 ? 'stock-out' : 'stock-ok'} style={{ fontSize: 12 }}>
                        {stock < 1 ? 'Out of stock' : `${stock} in stock`}
                      </span>
                      <span style={{ color: '#cbd5e1' }}>{fmt(v.price ?? variantPicker.price)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <button className="link-btn" onClick={() => setVariantPicker(null)} style={{ marginTop: '0.75rem' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* ─── Payment modal ──────────────────── */}
      {payOpen && (
        <div className="modal-backdrop" onClick={() => !submitting && setPayOpen(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{payOpen === 'cash' ? 'Cash payment' : payOpen === 'knet' ? 'KNET payment' : 'Card payment'}</h3>
            <div className="pay-total">{fmt(total)}</div>
            {payOpen === 'cash' && (
              <>
                <label className="modal-label">Amount tendered (<CurrencySymbol />)</label>
                <input
                  type="number" step="0.001" min={total}
                  value={tendered}
                  onChange={(e) => setTendered(e.target.value)}
                  className="modal-input"
                  autoFocus
                />
                <div className="pay-change">
                  Change: <strong>{fmt(Math.max(0, cashChange))}</strong>
                </div>
                <div className="quick-cash">
                  {[total, Math.ceil(total), Math.ceil(total / 5) * 5, Math.ceil(total / 10) * 10].map((v, i) => (
                    <button key={i} onClick={() => setTendered(v.toFixed(3))}>{fmt(v)}</button>
                  ))}
                </div>
              </>
            )}
            {(payOpen === 'card' || payOpen === 'knet') && (
              <p style={{ color: '#94a3b8', fontSize: 14 }}>
                Charge the customer on the {payOpen === 'knet' ? 'KNET' : 'card'} terminal, then confirm below.
              </p>
            )}
            <div className="modal-actions">
              <button onClick={() => setPayOpen(null)} disabled={submitting} className="modal-btn modal-btn-secondary">Cancel</button>
              <button
                onClick={submitSale}
                disabled={submitting || (payOpen === 'cash' && cashChange < 0)}
                className="modal-btn modal-btn-primary">
                {submitting ? 'Processing…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Close-shift modal ──────────────── */}
      {closeForm && (
        <div className="modal-backdrop" onClick={() => setCloseForm(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submitClose}>
            <h3>Close shift</h3>
            <label className="modal-label">Closing cash count (<CurrencySymbol />)</label>
            <input
              type="number" step="0.001" min={0}
              value={closeForm.closingCash}
              onChange={(e) => setCloseForm({ ...closeForm, closingCash: e.target.value })}
              required autoFocus
              className="modal-input"
            />
            <label className="modal-label" style={{ marginTop: '0.75rem' }}>Notes (optional)</label>
            <textarea
              rows={2}
              value={closeForm.notes}
              onChange={(e) => setCloseForm({ ...closeForm, notes: e.target.value })}
              className="modal-input"
              style={{ resize: 'vertical' }}
            />
            <div className="modal-actions">
              <button type="button" onClick={() => setCloseForm(null)} className="modal-btn modal-btn-secondary">Cancel</button>
              <button type="submit" className="modal-btn modal-btn-primary">Confirm close</button>
            </div>
          </form>
        </div>
      )}

      {/* ─── Receipt overlay ──────────────────── */}
      {/* PosReceipt renders its own overlay via a body portal (print isolation). */}
      {receipt && (
        <PosReceipt payload={receipt} currency={CURRENCY} onClose={() => setReceipt(null)} />
      )}

      {/* ─── X/Z report overlay ───────────────── */}
      {/* PosReportReceipt renders its own overlay via a body portal (print isolation). */}
      {report && (
        <PosReportReceipt report={report} currency={CURRENCY} onClose={closeReport} />
      )}

      {/* ─── Printer settings ─────────────────── */}
      {printerOpen && (
        <PosPrinterSettings onClose={() => setPrinterOpen(false)} />
      )}

      {/* ─── Split payment ────────────────────── */}
      {splitOpen && (
        <PosSplitPayment
          total={total}
          currency={CURRENCY}
          submitting={submitting}
          onClose={() => setSplitOpen(false)}
          onConfirm={submitSplit}
        />
      )}

      {/* ─── Recent sales picker ──────────────── */}
      {recentOpen && (
        <PosRecentSales
          currency={CURRENCY}
          onClose={() => setRecentOpen(false)}
          onNeedOverride={(req) => setPendingOverride(req)}
          onEdit={(orderNumber) => { setRecentOpen(false); setEditBill(orderNumber); }}
          onPrint={(payload) => { setRecentOpen(false); setReceipt(payload); }}
        />
      )}

      {/* ─── Bill editor (add / remove lines) ──── */}
      {editBill && (
        <PosBillEditor
          orderNumber={editBill}
          currency={CURRENCY}
          onClose={() => setEditBill(null)}
          onNeedOverride={(req) => setPendingOverride(req)}
          onUpdated={() => { /* parent refresh hook — bill editor reloads itself */ }}
        />
      )}

      {/* ─── Manager override ─────────────────── */}
      {pendingOverride && (
        <PosManagerOverride
          reasonText={pendingOverride.reason}
          onCancel={() => setPendingOverride(null)}
          onApprove={async (override) => {
            try {
              await pendingOverride.retry(override);
              setPendingOverride(null);
              toast.success('Approved by manager');
            } catch (err) {
              toast.error(err.response?.data?.message || 'Override rejected');
            }
          }}
        />
      )}

      {/* ─── Discount modal ───────────────────── */}
      {discountOpen && (
        <PosDiscountModal
          subtotal={subTotal}
          cartItems={cart}
          customer={linkedCustomer}
          currency={CURRENCY}
          current={discount}
          onApply={setDiscount}
          onClose={() => setDiscountOpen(false)}
        />
      )}

      {/* ─── Return flow + receipt ────────────── */}
      {returnOpen && (
        <PosReturnModal
          currency={CURRENCY}
          onClose={() => setReturnOpen(false)}
          onComplete={(data) => { setReturnOpen(false); setReturnReceipt(data); }}
          onNeedOverride={(req) => setPendingOverride({
            reason: req.reason,
            retry: async (override) => {
              await req.retry(override);
              setReturnOpen(false);
            },
          })}
        />
      )}
      {/* PosReturnReceipt renders its own overlay via a body portal (print isolation). */}
      {returnReceipt && (
        <PosReturnReceipt payload={returnReceipt} currency={CURRENCY} onClose={() => setReturnReceipt(null)} />
      )}

      <style>{`
        /* ── Palette ────────────────────────────── */
        .pos-app {
          --pos-bg: #0a0f1e;
          --pos-surface: #131a2e;
          --pos-elevated: #1a2340;
          --pos-border: rgba(255,255,255,0.06);
          --pos-border-strong: rgba(255,255,255,0.12);
          --pos-text: #f3f4f6;
          --pos-text-2: #94a3b8;
          --pos-text-3: #64748b;
          --pos-accent: #d97757;       /* warmer copper */
          --pos-accent-soft: rgba(217,119,87,0.12);
          --pos-success: #34d399;
          --pos-card: #2563eb;
          --pos-warn: #fbbf24;
          --pos-danger: #ef4444;

          min-height: 100vh; background: var(--pos-bg); color: var(--pos-text);
          display: grid;
          grid-template-columns: 88px 1fr;
          grid-template-rows: 56px 1fr;
          grid-template-areas: "rail topbar" "rail grid";
          font-family: -apple-system, 'SF Pro Text', 'Inter', 'Segoe UI', Roboto, Arial, sans-serif;
          font-feature-settings: 'tnum' 1;
        }

        /* ── Left action rail ───────────────────── */
        .pos-rail {
          grid-area: rail;
          background: var(--pos-surface);
          border-right: 1px solid var(--pos-border);
          display: flex; flex-direction: column; align-items: center;
          gap: 4px; padding: 12px 6px;
        }
        .rail-brand {
          width: 44px; height: 44px; border-radius: 12px;
          background: linear-gradient(135deg, var(--pos-accent), #c4784a);
          color: #fff; display: grid; place-items: center;
          font-weight: 700; font-size: 18px; letter-spacing: -0.5px;
          margin-bottom: 8px;
        }
        .rail-btn {
          width: 68px; padding: 8px 4px; border-radius: 10px;
          background: transparent; border: none; color: var(--pos-text-2);
          display: flex; flex-direction: column; align-items: center; gap: 4px;
          font-family: inherit; font-size: 11px; font-weight: 500;
          cursor: pointer; transition: background .15s ease, color .15s ease;
        }
        .rail-btn:hover { background: var(--pos-elevated); color: var(--pos-text); }
        .rail-btn-active {
          background: var(--pos-accent-soft); color: var(--pos-accent);
        }
        .rail-btn-warn { color: var(--pos-warn); }
        .rail-btn-warn:hover { background: rgba(251,191,36,0.10); color: var(--pos-warn); }
        .rail-spacer { flex: 1; }

        /* ── Top bar (info only) ────────────────── */
        .pos-topbar {
          grid-area: topbar;
          display: flex; justify-content: space-between; align-items: center;
          padding: 0 1.25rem;
          background: var(--pos-surface);
          border-bottom: 1px solid var(--pos-border);
        }
        .topbar-info { font-size: 0.88rem; }
        .topbar-loc { font-weight: 600; color: var(--pos-text); }
        .topbar-sep { margin: 0 0.5rem; color: var(--pos-text-3); }
        .topbar-cashier { color: var(--pos-text-2); }
        .topbar-clock { color: var(--pos-text-2); font-size: 0.85rem; font-variant-numeric: tabular-nums; }

        /* ── Main grid ──────────────────────────── */
        .pos-grid {
          grid-area: grid;
          display: grid; grid-template-columns: 1fr 440px;
          min-height: 0;
        }
        @media (max-width: 900px) {
          .pos-app { grid-template-columns: 64px 1fr; }
          .rail-btn span { display: none; }
          .pos-grid { grid-template-columns: 1fr; }
        }

        .pos-left, .pos-right { padding: 1.25rem 1.5rem; display: flex; flex-direction: column; min-height: 0; }
        .pos-right {
          background: var(--pos-surface);
          border-left: 1px solid var(--pos-border);
          padding: 1.25rem;
        }

        /* ── Search ─────────────────────────────── */
        .search-bar {
          position: relative; display: flex; align-items: center;
          background: var(--pos-elevated);
          border: 1px solid var(--pos-border-strong);
          border-radius: 14px;
          padding: 0 1rem;
          transition: border-color .15s ease, box-shadow .15s ease;
          margin-bottom: 0.75rem;
        }
        .search-bar:focus-within {
          border-color: var(--pos-accent);
          box-shadow: 0 0 0 4px var(--pos-accent-soft);
        }
        .search-icon { color: var(--pos-text-2); flex-shrink: 0; }
        .search-input {
          flex: 1; min-width: 0;
          padding: 1rem 0.85rem;
          background: transparent;
          border: none; outline: none;
          color: var(--pos-text);
          font-size: 1.05rem; font-family: inherit;
        }
        .search-input::placeholder { color: var(--pos-text-3); }
        .search-trailing { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
        .search-spinner {
          width: 16px; height: 16px;
          border: 2px solid var(--pos-border-strong);
          border-top-color: var(--pos-accent);
          border-radius: 50%;
          animation: pos-spin 0.7s linear infinite;
        }
        @keyframes pos-spin { to { transform: rotate(360deg); } }
        .search-clear {
          width: 28px; height: 28px;
          background: transparent; border: none; color: var(--pos-text-2);
          border-radius: 8px; cursor: pointer;
          display: grid; place-items: center;
        }
        .search-clear:hover { background: var(--pos-bg); color: var(--pos-text); }
        .search-hint, .kbd-inline {
          background: var(--pos-bg);
          border: 1px solid var(--pos-border-strong);
          color: var(--pos-text-2);
          font-size: 11px; font-family: inherit; font-weight: 500;
          padding: 2px 7px; border-radius: 6px;
          font-variant-numeric: tabular-nums;
        }
        .kbd-inline { padding: 1px 5px; margin: 0 2px; }
        .results-meta {
          font-size: 0.72rem; color: var(--pos-text-3);
          text-transform: uppercase; letter-spacing: 1px; font-weight: 500;
          padding: 0 4px 8px;
        }

        /* ── Results ────────────────────────────── */
        .results-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; padding-right: 4px; }
        .results-empty {
          padding: 3rem 1rem; text-align: center; color: var(--pos-text-2);
          font-size: 0.9rem; display: flex; flex-direction: column; align-items: center;
        }
        .result-item {
          display: flex; justify-content: space-between; align-items: center;
          background: var(--pos-surface);
          border: 1px solid var(--pos-border);
          border-radius: 12px;
          padding: 0.9rem 1.1rem; cursor: pointer; text-align: left;
          font-family: inherit; color: var(--pos-text);
          transition: transform .12s ease, border-color .12s ease, background .12s ease;
        }
        .result-item:hover:not(:disabled),
        .result-item.is-highlighted:not(:disabled) {
          background: var(--pos-elevated);
          border-color: var(--pos-accent);
          transform: translateX(2px);
        }
        .result-item:disabled { opacity: 0.4; cursor: not-allowed; }
        .result-name { font-size: 0.95rem; font-weight: 500; }
        .result-meta { display: flex; gap: 0.5rem; font-size: 0.72rem; margin-top: 0.3rem; align-items: center; flex-wrap: wrap; }
        .result-sku { color: var(--pos-text-3); font-family: 'SF Mono', monospace; font-size: 0.7rem; }
        .stock-pill {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 2px 8px 2px 6px; border-radius: 100px;
          font-size: 0.7rem; font-weight: 500;
        }
        .stock-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
        .stock-ok { color: var(--pos-success); background: rgba(52,211,153,0.10); }
        .stock-out { color: var(--pos-danger); background: rgba(239,68,68,0.10); }
        .badge {
          background: var(--pos-accent-soft); color: var(--pos-accent);
          padding: 2px 8px; border-radius: 100px; font-size: 0.7rem; font-weight: 500;
        }
        .result-price { font-weight: 600; font-size: 1rem; color: var(--pos-text); font-variant-numeric: tabular-nums; }

        /* ── Cart ───────────────────────────────── */
        .cart-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.75rem; }
        .cart-header h2 { font-size: 0.78rem; margin: 0; color: var(--pos-text-3); text-transform: uppercase; letter-spacing: 1px; font-weight: 600; }
        .link-btn { background: transparent; border: none; color: var(--pos-accent); cursor: pointer; font-size: 0.82rem; padding: 0; font-family: inherit; }
        .link-btn:hover { color: #f08d6c; text-decoration: underline; }

        .cart-list { flex: 1; overflow-y: auto; min-height: 100px; margin: 0 -0.25rem; padding: 0 0.25rem; }
        .cart-empty { padding: 3rem 0; text-align: center; color: var(--pos-text-3); font-size: 0.85rem; }
        .cart-line {
          display: grid; grid-template-columns: 1fr auto auto; gap: 0.6rem;
          align-items: center; padding: 0.7rem 0;
          border-bottom: 1px solid var(--pos-border);
        }
        .cart-line:last-child { border-bottom: none; }
        .cart-line-name { font-size: 0.88rem; font-weight: 500; line-height: 1.25; }
        .cart-line-price { font-size: 0.72rem; color: var(--pos-text-2); margin-top: 2px; }
        .cart-line-controls { display: flex; align-items: center; gap: 4px; }
        .cart-line-controls button {
          width: 28px; height: 28px;
          border: 1px solid var(--pos-border-strong);
          background: var(--pos-elevated);
          color: var(--pos-text); border-radius: 8px; cursor: pointer;
          font-family: inherit; font-size: 14px; display: grid; place-items: center;
        }
        .cart-line-controls button:hover { background: var(--pos-accent-soft); border-color: var(--pos-accent); color: var(--pos-accent); }
        .cart-line-controls span { min-width: 24px; text-align: center; font-size: 0.9rem; font-weight: 500; font-variant-numeric: tabular-nums; }
        .cart-remove { color: var(--pos-danger) !important; border-color: rgba(239,68,68,0.3) !important; }
        .cart-remove:hover { background: rgba(239,68,68,0.12) !important; border-color: var(--pos-danger) !important; }
        .cart-line-total { font-size: 0.9rem; font-weight: 600; min-width: 80px; text-align: right; font-variant-numeric: tabular-nums; }

        .cart-customer { margin: 1rem 0 0.5rem; }

        /* ── Totals ─────────────────────────────── */
        .cart-totals {
          padding: 0.75rem 0 0; border-top: 1px solid var(--pos-border);
        }
        .total-row {
          display: flex; justify-content: space-between; align-items: baseline;
          font-size: 1.5rem; padding: 0.5rem 0;
          font-variant-numeric: tabular-nums;
        }
        .total-row strong { color: var(--pos-accent); font-weight: 700; }
        .discount-btn {
          width: 100%; padding: 0.6rem 0.85rem; margin-bottom: 0.5rem;
          background: transparent; border: 1px dashed var(--pos-border-strong);
          color: var(--pos-text-2); cursor: pointer; font-family: inherit;
          font-size: 0.82rem; border-radius: 8px;
          transition: all .15s ease;
        }
        .discount-btn:hover:not(:disabled) {
          border-color: var(--pos-accent); color: var(--pos-accent);
          background: var(--pos-accent-soft);
        }
        .discount-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .sub-row {
          display: flex; justify-content: space-between;
          font-size: 0.85rem; color: var(--pos-text-2);
          padding: 0.2rem 0; font-variant-numeric: tabular-nums;
        }
        .sub-row.discount-row { color: var(--pos-warn); }

        /* ── Payment buttons ────────────────────── */
        .pay-buttons {
          display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.6rem;
          margin-top: 1rem;
        }
        .pay-btn {
          padding: 1.1rem; border: none; border-radius: 14px;
          font-size: 1.05rem; font-weight: 700;
          color: #fff; cursor: pointer; font-family: inherit;
          display: inline-flex; align-items: center; justify-content: center; gap: 8px;
          transition: transform .12s ease, filter .12s ease;
        }
        .pay-btn:disabled { opacity: 0.3; cursor: not-allowed; }
        .pay-btn:hover:not(:disabled) { transform: translateY(-1px); filter: brightness(1.06); }
        .pay-btn-cash { background: var(--pos-success); color: #052e23; }
        .pay-btn-card { background: var(--pos-card); }
        .pay-btn-knet { background: #7c3aed; }    /* purple — distinct from card blue */
        .split-link {
          display: block; width: 100%; margin-top: 0.6rem;
          padding: 0.5rem;
          background: transparent; border: none;
          color: var(--pos-text-2); font-family: inherit; font-size: 0.82rem;
          cursor: pointer; text-align: center;
        }
        .split-link:hover:not(:disabled) { color: var(--pos-accent); }
        .split-link:disabled { opacity: 0.3; cursor: not-allowed; }

        .modal-backdrop {
          position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 100;
          display: grid; place-items: center; padding: 1rem;
        }
        .modal {
          background: #1e293b; border: 1px solid #334155; border-radius: 14px;
          padding: 1.5rem; max-width: 480px; width: 100%;
        }
        .modal h3 { margin: 0 0 1rem; color: #f8fafc; }
        .pay-total { font-size: 2rem; font-weight: 700; color: #c4784a; text-align: center; margin: 0.5rem 0 1rem; }
        .modal-label { display: block; font-size: 0.85rem; color: #cbd5e1; margin-bottom: 0.3rem; }
        .modal-input {
          width: 100%; padding: 0.75rem 1rem; background: #0f172a; border: 1px solid #334155;
          color: #f8fafc; border-radius: 8px; font-size: 1.1rem; font-family: inherit;
        }
        .pay-change { margin-top: 0.75rem; font-size: 1.1rem; text-align: center; color: #cbd5e1; }
        .pay-change strong { color: #4ade80; }
        .quick-cash { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.4rem; margin-top: 0.75rem; }
        .quick-cash button {
          padding: 0.6rem 0.3rem; background: #0f172a; border: 1px solid #334155;
          color: #cbd5e1; border-radius: 6px; cursor: pointer; font-family: inherit; font-size: 0.85rem;
        }
        .quick-cash button:hover { background: #334155; }

        .modal-actions { display: flex; gap: 0.5rem; margin-top: 1.25rem; }
        .modal-btn {
          flex: 1; padding: 0.85rem; border-radius: 10px; font-size: 1rem; font-weight: 600;
          cursor: pointer; font-family: inherit; border: none;
        }
        .modal-btn-primary { background: #c4784a; color: #fff; }
        .modal-btn-primary:hover:not(:disabled) { background: #b56a3e; }
        .modal-btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
        .modal-btn-secondary { background: transparent; border: 1px solid #334155; color: #cbd5e1; }
        .modal-btn-secondary:hover:not(:disabled) { background: #334155; }

        .variant-list { display: flex; flex-direction: column; gap: 0.4rem; }
        .variant-btn {
          display: flex; justify-content: space-between; padding: 0.85rem 1rem;
          background: #0f172a; border: 1px solid #334155; color: #f8fafc;
          border-radius: 8px; cursor: pointer; font-family: inherit; font-size: 0.95rem;
        }
        .variant-btn:hover:not(:disabled) { background: #334155; border-color: #c4784a; }
        .variant-btn:disabled { opacity: 0.4; cursor: not-allowed; }
      `}</style>
    </div>
  );
}
