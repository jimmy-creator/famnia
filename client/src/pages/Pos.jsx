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
  HiSearch, HiX, HiPrinter, HiArrowLeft, HiTag, HiInbox,
} from 'react-icons/hi';
import { isSupported as usbSupported, isEnabled as printerEnabled, kickDrawer } from '../lib/thermalPrinter';
import api from '../api/axios';
import { plural } from '../lib/utils';
import { beep, errorTone } from '../lib/sounds';
import { CurrencySymbol, CURRENCY_DECIMALS, PRICE_STEP } from '../utils/currency';
import PosReceipt from '../components/PosReceipt';
import PosReportReceipt from '../components/PosReportReceipt';
import PosReturnModal from '../components/PosReturnModal';
import PosReturnReceipt from '../components/PosReturnReceipt';
import PosCustomerPicker from '../components/PosCustomerPicker';
import PosDiscountModal from '../components/PosDiscountModal';
import PosLineDiscountModal from '../components/PosLineDiscountModal';
import PosManagerOverride from '../components/PosManagerOverride';
import PosRecentSales from '../components/PosRecentSales';
import PosSplitPayment from '../components/PosSplitPayment';
import PosPrinterSettings from '../components/PosPrinterSettings';
import PosBillEditor from '../components/PosBillEditor';
import PosLabelPrint from '../components/PosLabelPrint';

const CURRENCY = import.meta.env.VITE_CURRENCY_CODE || 'KWD';
// Card button sub-options — which network the terminal charged.
const CARD_TYPES = [
  { value: 'mastercard', label: 'Mastercard' },
  { value: 'visa', label: 'Visa' },
];
const HELD_KEY = 'pos-held-bills';

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

// Initials placeholder for products with no image — a lot of the catalogue
// has none, and an empty grey box gives the cashier nothing to aim at.
function monogram(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase();
}

function ProductTile({ p, onPick, fmt }) {
  // A sized product shows its stock summed over the sizes here — the old
  // badge was the size count, styled like a stock figure, and read as one.
  const stock = p.hasVariants
    ? (p.variants || []).reduce((s, v) => s + (v.stockAtLocation || 0), 0)
    : p.stockAtLocation;
  const out = stock < 1;
  return (
    <button className="prod-tile" onClick={() => onPick(p)} disabled={!p.hasVariants && out}>
      <div className="prod-thumb">
        {p.image
          ? <img src={p.image} alt="" loading="lazy" />
          : <span className="prod-monogram">{monogram(p.name)}</span>}
      </div>
      <div className="prod-name">{p.name}</div>
      <div className="prod-foot">
        <span className="prod-price">{fmt(p.price)}</span>
        <span className={out ? 'stock-out' : 'stock-ok'} title={p.hasVariants ? `${p.variants.length} sizes` : undefined}>{stock}</span>
      </div>
    </button>
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
  // Held bills: [{ id, cart, linkedCustomer, discount }]. Kept in the browser
  // so a refresh doesn't lose a waiting customer's bill.
  const [held, setHeld] = useState(() => {
    try { return JSON.parse(localStorage.getItem(HELD_KEY)) || []; } catch { return []; }
  });
  useEffect(() => {
    try { localStorage.setItem(HELD_KEY, JSON.stringify(held)); } catch { /* storage blocked — held bills just won't survive a refresh */ }
  }, [held]);
  const [variantPicker, setVariantPicker] = useState(null);  // product-search-result with hasVariants
  const [linkedCustomer, setLinkedCustomer] = useState(null);   // null = walk-in
  const [discount, setDiscount] = useState(null);                // { manual?, coupon? } | null
  const [deliveryInput, setDeliveryInput] = useState('');        // optional delivery charge
  // Browse-without-scanning: category tiles → product grid, plus a
  // quick-pick rail of featured/best-selling items.
  const [categories, setCategories] = useState([]);
  const [quickPicks, setQuickPicks] = useState(null);
  const [browseCat, setBrowseCat] = useState(null);
  const [browseProducts, setBrowseProducts] = useState([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  // Per-line discount — index into cart, or null.
  const [lineDiscountFor, setLineDiscountFor] = useState(null);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [priceEdit, setPriceEdit] = useState(null);              // { idx, value } while a cart price is being edited
  const [qtyEdit, setQtyEdit] = useState(null);                  // { idx, value } while a cart quantity is being typed
  const qtyCancelRef = useRef(false);                            // Esc pressed: the blur that follows must not commit
  const [pendingOverride, setPendingOverride] = useState(null);  // { reason, retry } | null
  const [recentOpen, setRecentOpen] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const [printerOpen, setPrinterOpen] = useState(false);
  const [labelPrintOpen, setLabelPrintOpen] = useState(false);
  // Mobile only: the cart is a bottom sheet rather than a side panel,
  // because a phone has no room for both and the till must always be
  // one tap from Total and Pay.
  const [cartOpen, setCartOpen] = useState(false);
  const [editBill, setEditBill] = useState(null);   // orderNumber | null
  const [payOpen, setPayOpen] = useState(null);    // 'cash' | 'card' | null
  const [cardType, setCardType] = useState(null);  // CARD_TYPES value, card payments only
  const [tendered, setTendered] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState(null);
  // A reprint from Recent sales previews first instead of printing on open.
  const [receiptReprint, setReceiptReprint] = useState(false);
  const [closeForm, setCloseForm] = useState(null);
  const [report, setReport] = useState(null);   // X or Z report payload
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnReceipt, setReturnReceipt] = useState(null);
  // Bumped after a sale/return so any on-screen search results re-fetch
  // their stock counts instead of showing the pre-sale numbers.
  const [stockVersion, setStockVersion] = useState(0);

  const searchRef = useRef(null);
  const cartListRef = useRef(null);
  const scrollToLine = useRef(null);                             // cart line key to bring into view after the next render
  const lastAddedRef = useRef(null);                             // cart line key a typed quantity applies to
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
    if (variantPicker || payOpen || receipt || closeForm || report || returnOpen || returnReceipt || discountOpen || pendingOverride || recentOpen || splitOpen || printerOpen || editBill || lineDiscountFor != null || labelPrintOpen) return;
    const interval = setInterval(() => {
      if (document.activeElement !== searchRef.current && !document.activeElement?.matches?.('input, textarea, button')) {
        searchRef.current?.focus();
      }
    }, 1500);
    return () => clearInterval(interval);
  }, [variantPicker, payOpen, receipt, closeForm, report, returnOpen, returnReceipt, discountOpen, pendingOverride, recentOpen, splitOpen, printerOpen, editBill, lineDiscountFor, labelPrintOpen]);

  // The query the current `results` belong to. A scanner types the code
  // and hits Enter within a few ms — well inside the debounce — so Enter
  // must not trust results that are empty or left over from a partial code.
  // Bring the line just added/scanned into view, so a long cart never
  // hides what the cashier just rang up.
  useEffect(() => {
    const k = scrollToLine.current;
    if (!k) return;
    scrollToLine.current = null;
    cartListRef.current?.querySelector(`[data-line="${k}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [cart]);

  const latestQueryRef = useRef('');
  const runSearch = useCallback(async (q) => {
    latestQueryRef.current = q;
    if (!q.trim()) { setResults([]); return []; }
    setSearching(true);
    try {
      const { data } = await api.get('/pos/products', { params: { q } });
      // Drop responses for a query that has since been replaced.
      if (latestQueryRef.current !== q) return null;
      setResults(data);
      return data;
    } catch (err) {
      console.error(err);
      return null;
    } finally {
      setSearching(false);
    }
  }, []);

  // Debounced typed search (250ms) — barcode scanner triggers immediate on Enter.
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(query), 250);
    return () => clearTimeout(debounceRef.current);
  }, [query, runSearch, stockVersion]);

  // Reset highlight when results change.
  useEffect(() => { setHighlightIdx(0); }, [results]);

  // Browse data — loaded once. Not everything on a rail is labelled, so
  // the till needs a way to sell without a barcode.
  useEffect(() => {
    api.get('/pos/categories').then((r) => setCategories(r.data)).catch(() => {});
    api.get('/pos/quick-products').then((r) => setQuickPicks(r.data)).catch(() => {});
  }, []);

  // Load a category's products when one is picked.
  useEffect(() => {
    if (!browseCat) { setBrowseProducts([]); return; }
    setBrowseLoading(true);
    api.get('/pos/products', { params: { category: browseCat.name } })
      .then((r) => setBrowseProducts(r.data))
      .catch(() => setBrowseProducts([]))
      .finally(() => setBrowseLoading(false));
  }, [browseCat]);

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
      errorTone();
      return;
    }
    const key = `${item.productId}:${item.variantIndex ?? 'b'}`;
    const inCart = cart.find((c) => `${c.productId}:${c.variantIndex ?? 'b'}` === key);
    if (inCart && inCart.quantity + 1 > item.stockAtLocation) {
      toast.error(`Only ${item.stockAtLocation} in stock`);
      errorTone();
      return;
    }
    beep();
    scrollToLine.current = key;
    lastAddedRef.current = key;
    setCart((prev) => {
      const idx = prev.findIndex((c) => `${c.productId}:${c.variantIndex ?? 'b'}` === key);
      if (idx >= 0) {
        if (prev[idx].quantity + 1 > item.stockAtLocation) return prev;
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [...prev, {
        productId: item.productId,
        variantIndex: item.variantIndex,
        name: item.name,
        price: item.price,
        listPrice: item.price,
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

  // Hold the current bill (customer still deciding) and ring up others;
  // picking a held bill swaps it with whatever is on screen.
  const holdBill = () => {
    if (cart.length === 0) return;
    setHeld((h) => [...h, { id: Date.now(), cart, linkedCustomer, discount }]);
    setCart([]);
    setLinkedCustomer(null);
    setDiscount(null);
    lastAddedRef.current = null;
    searchRef.current?.focus();
  };
  const resumeBill = (id) => {
    const bill = held.find((b) => b.id === id);
    if (!bill) return;
    setHeld((h) => [
      ...h.filter((b) => b.id !== id),
      ...(cart.length > 0 ? [{ id: Date.now(), cart, linkedCustomer, discount }] : []),
    ]);
    setCart(bill.cart);
    setLinkedCustomer(bill.linkedCustomer);
    setDiscount(bill.discount);
    lastAddedRef.current = null;   // a typed qty must not hit a line of the swapped-in bill
    searchRef.current?.focus();
  };
  const dropBill = (id) => setHeld((h) => h.filter((b) => b.id !== id));

  // Special price for this customer. Cuts below list count toward the
  // manager-override discount threshold on the server.
  const commitPrice = () => {
    if (!priceEdit) return;
    const p = parseFloat(priceEdit.value);
    if (!(p >= 0)) {
      toast.error('Enter a valid price');
    } else {
      setCart((prev) => prev.map((c, i) => (i === priceEdit.idx ? { ...c, price: +p.toFixed(CURRENCY_DECIMALS) } : c)));
    }
    setPriceEdit(null);
    searchRef.current?.focus();
  };

  // Typed quantity: blank/0 keeps the old value, over-stock caps at stock.
  const commitQty = () => {
    if (qtyCancelRef.current) { qtyCancelRef.current = false; setQtyEdit(null); return; }
    if (!qtyEdit) return;
    const q = parseInt(qtyEdit.value, 10);
    const line = cart[qtyEdit.idx];
    if (!(q >= 1)) {
      toast.error('Enter a quantity of at least 1');
    } else if (line) {
      if (q > line.stockAtLocation) toast.error(`Only ${line.stockAtLocation} in stock`);
      setQty(qtyEdit.idx, q);
    }
    setQtyEdit(null);
  };

  // A line's price is what's charged — the catalogue price unless the
  // cashier edited it (commitPrice). Line discounts come off that.
  const lineOffOf = (c) => {
    if (!c.lineDiscount) return 0;
    const gross = c.price * c.quantity;
    const v = parseFloat(c.lineDiscount.value) || 0;
    const calc = c.lineDiscount.kind === 'percentage' ? (gross * v) / 100 : v * c.quantity;
    return +Math.min(calc, gross).toFixed(CURRENCY_DECIMALS);
  };

  const cartCount = cart.reduce((n, c) => n + c.quantity, 0);
  const subTotal = cart.reduce((s, c) => s + c.price * c.quantity, 0);
  const lineOffTotal = +cart.reduce((s, c) => s + lineOffOf(c), 0).toFixed(CURRENCY_DECIMALS);
  const afterLines = +Math.max(0, subTotal - lineOffTotal).toFixed(CURRENCY_DECIMALS);
  // Mirror the server's waterfall: lines → manual bill discount → coupon.
  // The coupon amount comes from the preview call; the server re-validates
  // and recomputes everything on commit.
  const manualOff = (() => {
    if (!discount?.manual) return 0;
    const v = parseFloat(discount.manual.value) || 0;
    const calc = discount.manual.kind === 'percentage' ? (afterLines * v) / 100 : v;
    return +Math.min(calc, afterLines).toFixed(CURRENCY_DECIMALS);
  })();
  const couponOff = discount?.coupon ? +(parseFloat(discount.coupon.discount) || 0).toFixed(CURRENCY_DECIMALS) : 0;
  const discountTotal = +Math.min(lineOffTotal + manualOff + couponOff, subTotal).toFixed(CURRENCY_DECIMALS);
  // Delivery rides on top of the discounted goods and is never discounted,
  // matching the server's calculation in routes/pos.js.
  const deliveryCharge = Math.max(0, parseFloat(deliveryInput) || 0);
  const total = +(Math.max(0, subTotal - discountTotal) + deliveryCharge).toFixed(CURRENCY_DECIMALS);

  // ─── Search keyboard handling ───────────────────────────────────
  // Enter on a single result -> add. Enter with multiple -> add the
  // highlighted row. Arrows move the highlight. Escape clears the
  // query so the cashier can re-scan.
  const onSearchKey = async (e) => {
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
    // A short number typed in the scan box sets the quantity of the item
    // just added (scan → 6 → Enter = 6 of it), so the cashier never leaves
    // the box. Barcodes are longer than 4 digits; a number that is exactly a
    // product code still adds that product.
    const typed = query.trim();
    const lastIdx = lastAddedRef.current
      ? cart.findIndex((c) => `${c.productId}:${c.variantIndex ?? 'b'}` === lastAddedRef.current)
      : -1;
    if (/^\d{1,4}$/.test(typed) && lastIdx >= 0) {
      clearTimeout(debounceRef.current);
      const found = await runSearch(typed);
      const isCode = (found || []).some((r) => String(r.code || '').toLowerCase() === typed.toLowerCase());
      if (!isCode) {
        setQuery('');
        setResults([]);
        const n = parseInt(typed, 10);
        const line = cart[lastIdx];
        if (n < 1) { toast.error('Enter a quantity of at least 1'); errorTone(); return; }
        if (n > line.stockAtLocation) { toast.error(`Only ${line.stockAtLocation} in stock`); errorTone(); }
        else beep();
        setQty(lastIdx, n);
        scrollToLine.current = lastAddedRef.current;
        return;
      }
    }
    let list = results;
    let pick = highlightIdx;
    if (latestQueryRef.current !== query || searching) {
      // Results aren't for what's in the box yet (fresh scan) — search now.
      clearTimeout(debounceRef.current);
      list = await runSearch(query);
      if (!list) return;
      pick = 0;   // exact code/barcode matches come back first
    }
    if (list.length === 1) addToCart(list[0]);
    else if (list.length > 1) addToCart(list[Math.min(pick, list.length - 1)]);
    else if (query.trim()) { toast.error('No match'); errorTone(); }
  };

  const postSale = async (paymentPayload, managerOverride) => {
    const body = {
      items: cart.map((c) => ({
        productId: c.productId,
        variantIndex: c.variantIndex,
        quantity: c.quantity,
        price: c.price !== c.listPrice ? c.price : undefined,
        lineDiscount: c.lineDiscount || undefined,
      })),
      userId: linkedCustomer?.id || undefined,
      couponCode: discount?.coupon?.code || undefined,
      manualDiscount: discount?.manual || undefined,
      managerOverride: managerOverride || undefined,
      deliveryCharge: deliveryCharge || undefined,
      payment: paymentPayload,
    };
    const { data } = await api.post('/pos/sale', body);
    setReceipt(data);
    setStockVersion((v) => v + 1);
    setCart([]);
    setLinkedCustomer(null);
    setDiscount(null);
    setDeliveryInput('');
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
        cardType: payOpen === 'card' ? cardType : undefined,
      });
    } catch (err) {
      if (err.response?.data?.requires === 'manager_override') {
        setPendingOverride({
          reason: err.response.data.message,
          retry: (override) => postSale({
            method: payOpen,
            amountTendered: payOpen === 'cash' ? parseFloat(tendered) : total,
            cardType: payOpen === 'card' ? cardType : undefined,
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

  // No-sale drawer open: kick via the receipt printer, then log it.
  const openDrawer = async () => {
    if (!usbSupported() || !printerEnabled('receipt')) {
      toast.error('Receipt printer not set up — pair it under Printer');
      return;
    }
    try {
      await kickDrawer();
    } catch (err) {
      toast.error(`Drawer did not open: ${err.message}`);
      return;
    }
    api.post('/pos/drawer-open').catch(() => {});
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
        // zData.session was fetched before the close, so take closedAt from the
        // close response (falling back to now) or the Z-report shows "Closed: —".
        setReport({
          ...zData,
          session: { ...zData.session, closedAt: data.session?.closedAt || new Date().toISOString() },
          closingCash: data.session.closingCash, variance: data.variance, type: 'Z',
        });
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

  const fmt = (n) => `${CURRENCY} ${(parseFloat(n) || 0).toFixed(CURRENCY_DECIMALS)}`;
  const cashChange = payOpen === 'cash' && tendered ? +(parseFloat(tendered) - total).toFixed(CURRENCY_DECIMALS) : 0;

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
        <button className="rail-btn" onClick={() => setLabelPrintOpen(true)} title="Print barcode labels">
          <HiTag size={22} /><span>Labels</span>
        </button>
        <button className="rail-btn" onClick={openDrawer} title="Open cash drawer (no sale)">
          <HiInbox size={22} /><span>Drawer</span>
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
              <div className="browse">
                {browseCat ? (
                  <>
                    <div className="browse-head">
                      <button className="browse-back" onClick={() => setBrowseCat(null)}>
                        <HiArrowLeft size={16} /> All categories
                      </button>
                      <span className="browse-title">{browseCat.name}</span>
                    </div>
                    {browseLoading && <div className="browse-hint">Loading…</div>}
                    {!browseLoading && browseProducts.length === 0 && (
                      <div className="browse-hint">Nothing in this category</div>
                    )}
                    <div className="tile-grid">
                      {browseProducts.map((p) => (
                        <ProductTile key={p.productId} p={p} onPick={addToCart} fmt={fmt} />
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    {quickPicks?.topSellers?.length > 0 && (
                      <>
                        <div className="browse-title">Best sellers</div>
                        <div className="tile-grid">
                          {quickPicks.topSellers.slice(0, 8).map((p) => (
                            <ProductTile key={'t' + p.productId} p={p} onPick={addToCart} fmt={fmt} />
                          ))}
                        </div>
                      </>
                    )}
                    {categories.length > 0 && (
                      <>
                        <div className="browse-title">Browse</div>
                        <div className="cat-grid">
                          {categories.map((c) => (
                            <button key={c.id} className="cat-tile" onClick={() => setBrowseCat(c)}>
                              <span className="cat-name">{c.name}</span>
                              <span className="cat-count">{c.productCount} item{c.productCount === 1 ? '' : 's'}</span>
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                    {categories.length === 0 && !quickPicks && (
                      <div className="results-empty">
                        <HiSearch size={32} style={{ opacity: 0.3, marginBottom: 12 }} />
                        <div>Scan a barcode or type a product name</div>
                        <div style={{ fontSize: 12, marginTop: 8, color: 'var(--pos-text-3)' }}>
                          Press <kbd className="kbd-inline">↵</kbd> to add · <kbd className="kbd-inline">Esc</kbd> to clear
                          <br />After adding, type a quantity + <kbd className="kbd-inline">↵</kbd> to change it
                        </div>
                      </div>
                    )}
                  </>
                )}
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
        <aside className={`pos-right ${cartOpen ? 'is-open' : ''}`}>
          <button className="cart-sheet-close" onClick={() => setCartOpen(false)} aria-label="Close cart">
            <HiX size={20} />
          </button>
          <div className="cart-header">
            <h2>Cart</h2>
            {cart.length > 0 && (
              <span style={{ display: 'flex', gap: '0.9rem' }}>
                <button className="link-btn" onClick={holdBill} title="Put this bill aside and start another">Hold</button>
                <button className="link-btn" onClick={() => setCart([])}>Clear</button>
              </span>
            )}
          </div>
          {held.length > 0 && (
            <div className="held-bills">
              {held.map((b, n) => (
                <span key={b.id} className="held-bill">
                  <button onClick={() => resumeBill(b.id)} title={cart.length > 0 ? 'Switch to this bill (the current one is held)' : 'Resume this bill'}>
                    {b.linkedCustomer?.name || `Bill ${n + 1}`} · {plural(b.cart.reduce((s, c) => s + c.quantity, 0), 'item')} · {fmt(b.cart.reduce((s, c) => s + c.price * c.quantity, 0))}
                  </button>
                  <button className="held-bill-x" onClick={() => dropBill(b.id)} aria-label="Discard held bill" title="Discard">×</button>
                </span>
              ))}
            </div>
          )}

          <div className="cart-list" ref={cartListRef}>
            {cart.length === 0 && <div className="cart-empty">No items yet</div>}
            {cart.map((c, i) => (
              <div key={i} className="cart-line" data-line={`${c.productId}:${c.variantIndex ?? 'b'}`}>
                <div className="cart-line-info">
                  <div className="cart-line-name">{c.name}</div>
                  {priceEdit?.idx === i ? (
                    <input
                      className="cart-line-price-input"
                      type="number" min="0" step={PRICE_STEP} autoFocus
                      value={priceEdit.value}
                      onChange={(e) => setPriceEdit({ idx: i, value: e.target.value })}
                      onBlur={commitPrice}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitPrice();
                        if (e.key === 'Escape') { setPriceEdit(null); searchRef.current?.focus(); }
                      }}
                    />
                  ) : (
                    <button
                      className="cart-line-price"
                      title="Edit price"
                      onClick={() => setPriceEdit({ idx: i, value: String(c.price) })}
                    >
                      {c.price !== c.listPrice && <s>{fmt(c.listPrice)}</s>} {fmt(c.price)} ea ✎
                    </button>
                  )}
                  {c.lineDiscount && (
                    <span className="line-off">
                      −{c.lineDiscount.kind === 'percentage'
                        ? `${c.lineDiscount.value}%`
                        : fmt(c.lineDiscount.value)}
                    </span>
                  )}
                  <div className="cart-line-actions">
                    <button onClick={() => setLineDiscountFor(i)}>% off</button>
                  </div>
                </div>
                <div className="cart-line-controls">
                  <button onClick={() => setQty(i, c.quantity - 1)}>−</button>
                  <input
                    className="cart-line-qty"
                    type="text" inputMode="numeric" maxLength={String(c.stockAtLocation).length}
                    aria-label={`Quantity of ${c.name}`}
                    value={qtyEdit?.idx === i ? qtyEdit.value : c.quantity}
                    onFocus={(e) => { setQtyEdit({ idx: i, value: String(c.quantity) }); e.target.select(); }}
                    // Digits only (a number input took "1e9"), and never more
                    // than is in stock — the box stops at the stock figure.
                    onChange={(e) => {
                      let value = e.target.value.replace(/\D/g, '');
                      if (value && parseInt(value, 10) > c.stockAtLocation) {
                        value = String(c.stockAtLocation);
                        toast.error(`Only ${c.stockAtLocation} in stock`, { id: 'pos-qty-stock' });
                      }
                      setQtyEdit({ idx: i, value });
                    }}
                    onBlur={commitQty}
                    // Leaving the box is what commits (onBlur), so Enter just
                    // hands focus back to the scanner; Esc flags the blur that
                    // follows to drop the typed value instead.
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') searchRef.current?.focus();
                      if (e.key === 'Escape') { qtyCancelRef.current = true; searchRef.current?.focus(); }
                    }}
                  />
                  <button onClick={() => {
                    if (c.quantity >= c.stockAtLocation) toast.error(`Only ${c.stockAtLocation} in stock`, { id: 'pos-qty-stock' });
                    else setQty(i, c.quantity + 1);
                  }}>+</button>
                  <button onClick={() => removeLine(i)} className="cart-remove">✕</button>
                </div>
                <div className="cart-line-total">{fmt(c.price * c.quantity - lineOffOf(c))}</div>
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
            {(discountTotal > 0 || deliveryCharge > 0) && (
              <>
                <div className="sub-row"><span>Subtotal</span><span>{fmt(subTotal)}</span></div>
                {discountTotal > 0 && (
                  <div className="sub-row discount-row"><span>Discount</span><span>−{fmt(discountTotal)}</span></div>
                )}
                {deliveryCharge > 0 && (
                  <div className="sub-row"><span>Delivery</span><span>{fmt(deliveryCharge)}</span></div>
                )}
              </>
            )}
            <div className="sub-row delivery-input-row">
              <span>Delivery charge</span>
              <input
                type="number" step={PRICE_STEP} min="0" placeholder="0"
                value={deliveryInput}
                disabled={cart.length === 0}
                onChange={(e) => setDeliveryInput(e.target.value)}
              />
            </div>
            <div className="total-row">
              <span>Total</span>
              <strong>{fmt(total)}</strong>
            </div>
          </div>

          <div className="pay-buttons">
            <button
              disabled={cart.length === 0}
              onClick={() => { setPayOpen('cash'); setTendered(total.toFixed(CURRENCY_DECIMALS)); }}
              className="pay-btn pay-btn-cash">
              <HiCash size={22} /> Cash
            </button>
            <button
              disabled={cart.length === 0}
              onClick={() => { setPayOpen('card'); setCardType(null); }}
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

      {/* Mobile-only summary bar. The cart sheet is off-screen by default,
          so this is what keeps the running total and a route to Pay visible
          at all times — without it the cashier has to scroll the whole
          catalogue to find out what they've rung up. */}
      <button className="cart-bar" onClick={() => setCartOpen(true)}>
        <span className="cart-bar-count">
          {cartCount === 0 ? 'Cart empty' : `${cartCount} item${cartCount === 1 ? '' : 's'}`}
        </span>
        <span className="cart-bar-total">{fmt(total)}</span>
        <span className="cart-bar-cta">{cartCount === 0 ? 'Open' : 'Pay →'}</span>
      </button>

      {/* Tapping outside the sheet closes it. */}
      {cartOpen && <div className="cart-scrim" onClick={() => setCartOpen(false)} />}

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
            <h3>{payOpen === 'cash' ? 'Cash payment' : 'Card payment'}</h3>
            <div className="pay-total">{fmt(total)}</div>
            {payOpen === 'cash' && (
              <>
                <label className="modal-label">Amount tendered (<CurrencySymbol />)</label>
                <input
                  type="number" step={PRICE_STEP} min={total}
                  value={tendered}
                  onChange={(e) => setTendered(e.target.value)}
                  className="modal-input"
                  autoFocus
                />
                <div className="pay-change">
                  Change: <strong>{fmt(Math.max(0, cashChange))}</strong>
                </div>
                <div className="quick-cash">
                  {/* Round totals make several suggestions equal — show each amount once. */}
                  {[...new Set([total, Math.ceil(total), Math.ceil(total / 5) * 5, Math.ceil(total / 10) * 10].map((v) => v.toFixed(CURRENCY_DECIMALS)))].map((v) => (
                    <button key={v} onClick={() => setTendered(v)}>{fmt(v)}</button>
                  ))}
                </div>
              </>
            )}
            {payOpen === 'card' && (
              <div className="card-types">
                {CARD_TYPES.map((c) => (
                  <button key={c.value} onClick={() => setCardType(c.value)}
                    className={cardType === c.value ? 'active' : ''}>
                    {c.label}
                  </button>
                ))}
              </div>
            )}
            {payOpen === 'card' && (
              <p style={{ color: '#94a3b8', fontSize: 14 }}>
                {!cardType
                  ? 'Choose the card type above.'
                  : 'Charge the customer on the card terminal, then confirm below.'}
              </p>
            )}
            <div className="modal-actions">
              <button onClick={() => setPayOpen(null)} disabled={submitting} className="modal-btn modal-btn-secondary">Cancel</button>
              <button
                onClick={submitSale}
                disabled={submitting || (payOpen === 'cash' && cashChange < 0) || (payOpen === 'card' && !cardType)}
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
              type="number" step={PRICE_STEP} min={0}
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
        <PosReceipt
          payload={receipt}
          currency={CURRENCY}
          autoPrint={!receiptReprint}
          onClose={() => { setReceipt(null); setReceiptReprint(false); }}
        />
      )}

      {/* ─── X/Z report overlay ───────────────── */}
      {/* PosReportReceipt renders its own overlay via a body portal (print isolation). */}
      {report && (
        <PosReportReceipt report={report} currency={CURRENCY} onClose={closeReport} autoPrint={report.type === 'Z'} />
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
          onPrint={(payload) => { setRecentOpen(false); setReceiptReprint(true); setReceipt(payload); }}
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

      {lineDiscountFor != null && cart[lineDiscountFor] && (
        <PosLineDiscountModal
          line={cart[lineDiscountFor]}
          currency={CURRENCY}
          onApply={(ld) => setCart((prev) => prev.map((c, i) => (
            i === lineDiscountFor ? { ...c, lineDiscount: ld } : c
          )))}
          onClose={() => setLineDiscountFor(null)}
        />
      )}

      {labelPrintOpen && (
        <PosLabelPrint currency={CURRENCY} onClose={() => setLabelPrintOpen(false)} />
      )}

      {/* ─── Return flow + receipt ────────────── */}
      {returnOpen && (
        <PosReturnModal
          currency={CURRENCY}
          onClose={() => setReturnOpen(false)}
          onComplete={(data) => { setReturnOpen(false); setReturnReceipt(data); setStockVersion((v) => v + 1); }}
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

          /* Exactly the window's height: the cart and the results list scroll
             inside their panels. With min-height a long cart grew the whole
             page instead, so the cart itself never scrolled. */
          height: 100vh; height: 100dvh; overflow: hidden;
          background: var(--pos-bg); color: var(--pos-text);
          display: grid;
          grid-template-columns: 88px 1fr;
          grid-template-rows: 56px minmax(0, 1fr);
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
        /* Desktop-only chrome, hidden until the mobile block turns it on. */
        .cart-bar, .cart-scrim, .cart-sheet-close { display: none; }

        /* ── Mobile / small tablet ──────────────────────────────
           The old rule here just collapsed .pos-grid to one column, which
           pushed the cart below the entire browse grid — a till where you
           scroll past the catalogue to reach Pay. Instead: the rail becomes
           a bottom nav, the cart becomes a bottom sheet, and a summary bar
           keeps the total and a route to Pay permanently on screen. */
        @media (max-width: 900px) {
          .pos-app {
            /* Single source of truth for the bottom nav height — the summary
               bar sits on top of it and the content pads clear of both. */
            --pos-navh: 64px;
            grid-template-columns: 1fr;
            grid-template-rows: 56px 1fr auto;
            grid-template-areas: "topbar" "grid" "rail";
            /* Room for the summary bar, which sits above the rail. */
            padding-bottom: 0;
          }

          /* Rail becomes a bottom nav. It must be FIXED, not just the last
             grid row — as a flow row it scrolls off the moment the product
             list is taller than the viewport, which is almost always. */
          .pos-rail {
            position: fixed; left: 0; right: 0; bottom: 0; z-index: 40;
            box-sizing: border-box;
            height: calc(var(--pos-navh) + env(safe-area-inset-bottom));
            flex-direction: row; justify-content: space-around; align-items: center;
            background: var(--pos-surface);
            border-right: none; border-top: 1px solid var(--pos-border);
            padding: 4px 4px calc(4px + env(safe-area-inset-bottom));
            gap: 0; overflow-x: auto;
          }
          .rail-brand { display: none; }
          .rail-spacer { display: none; }
          /* min-width:0 so all nine actions share the width evenly — at
             56px the last one (Exit) fell off the edge behind a scroll. */
          .rail-btn { width: auto; min-width: 0; flex: 1 1 0; font-size: 9.5px; padding: 6px 1px; }
          .rail-btn span { white-space: nowrap; }
          .rail-btn span { display: block; }

          .pos-grid { grid-template-columns: 1fr; }
          /* Clear both fixed bars (nav ~58px + summary ~50px) so the last
             product tile isn't trapped underneath them. */
          .pos-left { padding: 1rem 1rem calc(var(--pos-navh) + 60px + env(safe-area-inset-bottom)); }

          /* Cart becomes a bottom sheet. Off-screen until opened; the
             visibility toggle keeps it out of the tab order while hidden. */
          .pos-right {
            position: fixed; left: 0; right: 0; bottom: 0;
            max-height: 88vh; z-index: 60;
            border-left: none; border-top: 1px solid var(--pos-border-strong);
            border-radius: 16px 16px 0 0;
            box-shadow: 0 -8px 32px rgba(0,0,0,0.5);
            transform: translateY(100%); visibility: hidden;
            transition: transform .22s ease, visibility .22s;
            overflow-y: auto;
            padding-bottom: calc(1.25rem + env(safe-area-inset-bottom));
          }
          .pos-right.is-open { transform: translateY(0); visibility: visible; }
          /* The slide is decoration. If motion is suppressed, the sheet must
             still open — a cashier can't be locked out of Pay by an
             animation that never runs. */
          @media (prefers-reduced-motion: reduce) {
            .pos-right { transition: none; }
          }

          /* Keep the header's Clear link out from under the close button. */
          .cart-header { padding-right: 34px; }
          .cart-sheet-close {
            display: block; position: absolute; top: 10px; right: 12px;
            background: transparent; border: none; color: var(--pos-text-2);
            cursor: pointer; padding: 4px; line-height: 0;
          }

          .cart-scrim {
            display: block; position: fixed; inset: 0;
            background: rgba(0,0,0,0.5); z-index: 55;
          }

          /* Summary bar — sits directly above the bottom nav. */
          .cart-bar {
            display: flex; align-items: center; gap: 0.75rem;
            position: fixed; left: 0; right: 0; z-index: 50;
            bottom: calc(var(--pos-navh) + env(safe-area-inset-bottom));
            padding: 0.7rem 1rem;
            background: var(--pos-elevated);
            border: none; border-top: 1px solid var(--pos-border-strong);
            color: var(--pos-text); font-family: inherit; font-size: 0.9rem;
            cursor: pointer; text-align: left;
          }
          .cart-bar-count { color: var(--pos-text-2); }
          .cart-bar-total { margin-left: auto; font-weight: 700; font-variant-numeric: tabular-nums; }
          .cart-bar-cta {
            background: var(--pos-accent); color: #fff;
            padding: 0.35rem 0.75rem; border-radius: 8px;
            font-weight: 600; font-size: 0.85rem; white-space: nowrap;
          }

          /* Tighter chrome on a narrow screen. */
          .search-hint { display: none; }
          .topbar-clock { display: none; }
          .tile-grid { grid-template-columns: repeat(auto-fill, minmax(108px, 1fr)); }
          .cat-grid { grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); }
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

        /* ── Browse without scanning ─────────────── */
        .browse { padding: 0.25rem 0 1rem; }
        .browse-head { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem; }
        .browse-back {
          display: inline-flex; align-items: center; gap: 0.35rem;
          background: var(--pos-surface); color: var(--pos-text-2);
          border: 1px solid var(--pos-border); border-radius: 8px;
          padding: 0.35rem 0.6rem; font-size: 0.8rem; cursor: pointer;
        }
        .browse-back:hover { color: var(--pos-text); border-color: var(--pos-border-strong); }
        .browse-title {
          font-size: 0.78rem; font-weight: 700; letter-spacing: 0.06em;
          text-transform: uppercase; color: var(--pos-text-3);
          margin: 0.85rem 0 0.5rem;
        }
        .browse-hint { padding: 1.5rem; text-align: center; color: var(--pos-text-3); font-size: 0.85rem; }

        .cat-grid {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 0.6rem;
        }
        .cat-tile {
          display: flex; flex-direction: column; gap: 0.25rem; align-items: flex-start;
          background: var(--pos-surface); border: 1px solid var(--pos-border);
          border-radius: 10px; padding: 0.85rem 0.75rem; cursor: pointer; text-align: left;
        }
        .cat-tile:hover { border-color: var(--pos-accent); background: var(--pos-elevated); }
        .cat-name { font-size: 0.92rem; font-weight: 600; color: var(--pos-text); }
        .cat-count { font-size: 0.75rem; color: var(--pos-text-3); }

        .tile-grid {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(132px, 1fr)); gap: 0.6rem;
        }
        .prod-tile {
          display: flex; flex-direction: column; gap: 0.4rem;
          background: var(--pos-surface); border: 1px solid var(--pos-border);
          border-radius: 10px; padding: 0.5rem; cursor: pointer; text-align: left;
        }
        .prod-tile:hover:not(:disabled) { border-color: var(--pos-accent); background: var(--pos-elevated); }
        .prod-tile:disabled { opacity: 0.4; cursor: not-allowed; }
        .prod-thumb {
          aspect-ratio: 1; border-radius: 8px; overflow: hidden;
          background: var(--pos-elevated); display: grid; place-items: center;
        }
        .prod-thumb img { width: 100%; height: 100%; object-fit: cover; }
        .prod-monogram { font-size: 1.3rem; font-weight: 700; color: var(--pos-text-3); letter-spacing: 0.04em; }
        .prod-name {
          font-size: 0.8rem; font-weight: 500; color: var(--pos-text); line-height: 1.25;
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
        }
        .prod-foot {
          display: flex; justify-content: space-between; align-items: center;
          font-size: 0.78rem; font-variant-numeric: tabular-nums;
        }
        .prod-price { font-weight: 600; color: var(--pos-accent); }
        .prod-foot .stock-ok { color: var(--pos-success); }
        .prod-foot .stock-out { color: var(--pos-text-3); }
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
        /* Label-print dialog (PosLabelPrint) — results and the picked item. */
        .label-result, .label-selected {
          display: flex; align-items: center; gap: 0.75rem; width: 100%;
          padding: 0.6rem 0.75rem; border-radius: 8px; color: inherit; font: inherit;
          background: transparent; border: 1px solid transparent; text-align: left;
        }
        .label-result { cursor: pointer; }
        .label-result:hover { background: var(--pos-surface); border-color: var(--pos-border-strong); }
        .label-selected { border-color: var(--pos-border-strong); margin-bottom: 0.75rem; }
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

        .held-bills { display: flex; flex-wrap: wrap; gap: 0.4rem; margin: -0.25rem 0 0.75rem; flex-shrink: 0; }
        .held-bill { display: inline-flex; align-items: center; background: var(--pos-accent-soft); border-radius: 100px; }
        .held-bill button {
          background: transparent; border: none; color: var(--pos-accent); cursor: pointer;
          font-family: inherit; font-size: 0.78rem; font-weight: 600; padding: 0.3rem 0.2rem 0.3rem 0.7rem;
        }
        .held-bill .held-bill-x { padding: 0.3rem 0.6rem 0.3rem 0.3rem; font-size: 0.95rem; line-height: 1; }
        .held-bill button:hover { text-decoration: underline; }
        .cart-header, .cart-customer, .cart-totals { flex-shrink: 0; }
        .cart-list {
          flex: 1; overflow-y: auto; min-height: 100px; margin: 0 -0.25rem; padding: 0 0.5rem 0 0.25rem;
          overscroll-behavior: contain;
          scrollbar-gutter: stable;
        }
        /* Always-visible scrollbar, so it's obvious there's more cart below. */
        .cart-list, .results-list { scrollbar-width: auto; scrollbar-color: rgba(255,255,255,0.32) var(--pos-elevated); }
        .cart-list::-webkit-scrollbar, .results-list::-webkit-scrollbar { width: 10px; }
        .cart-list::-webkit-scrollbar-track, .results-list::-webkit-scrollbar-track { background: var(--pos-elevated); border-radius: 5px; }
        .cart-list::-webkit-scrollbar-thumb, .results-list::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.32); border-radius: 5px; border: 2px solid var(--pos-elevated);
        }
        .cart-list::-webkit-scrollbar-thumb:hover, .results-list::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.5); }
        .cart-empty { padding: 3rem 0; text-align: center; color: var(--pos-text-3); font-size: 0.85rem; }
        .cart-line {
          display: grid; grid-template-columns: 1fr auto auto; gap: 0.6rem;
          align-items: center; padding: 0.7rem 0;
          border-bottom: 1px solid var(--pos-border);
        }
        .cart-line:last-child { border-bottom: none; }
        .cart-line-name { font-size: 0.88rem; font-weight: 500; line-height: 1.25; }
        .line-off { color: var(--pos-warn); font-size: 0.72rem; margin-left: 0.4rem; }
        .cart-line-actions { display: flex; gap: 0.3rem; margin-top: 4px; }
        .cart-line-actions button {
          background: transparent; color: var(--pos-text-3);
          border: 1px solid var(--pos-border); border-radius: 5px;
          padding: 0.1rem 0.35rem; font-size: 0.68rem; cursor: pointer;
        }
        .cart-line-actions button:hover { color: var(--pos-text); border-color: var(--pos-border-strong); }
        .cart-line-price {
          font-size: 0.72rem; color: var(--pos-text-2); margin-top: 2px;
          background: none; border: none; padding: 0; cursor: pointer; font-family: inherit;
        }
        .cart-line-price:hover { color: var(--pos-accent); }
        .cart-line-price s { color: var(--pos-text-3); }
        .cart-line-price-input {
          width: 90px; margin-top: 2px; padding: 2px 6px; font-size: 0.8rem;
          border: 1px solid var(--pos-accent); border-radius: 6px;
          background: var(--pos-elevated); color: var(--pos-text); font-family: inherit;
        }
        .cart-line-controls { display: flex; align-items: center; gap: 4px; }
        .cart-line-controls button {
          width: 28px; height: 28px;
          border: 1px solid var(--pos-border-strong);
          background: var(--pos-elevated);
          color: var(--pos-text); border-radius: 8px; cursor: pointer;
          font-family: inherit; font-size: 14px; display: grid; place-items: center;
        }
        .cart-line-controls button:hover { background: var(--pos-accent-soft); border-color: var(--pos-accent); color: var(--pos-accent); }
        .cart-line-qty {
          width: 44px; height: 28px; padding: 0 4px; text-align: center;
          font-size: 0.9rem; font-weight: 500; font-variant-numeric: tabular-nums; font-family: inherit;
          border: 1px solid transparent; border-radius: 8px;
          background: transparent; color: var(--pos-text);
        }
        .cart-line-qty:hover { border-color: var(--pos-border-strong); }
        .cart-line-qty:focus { outline: none; border-color: var(--pos-accent); background: var(--pos-elevated); }
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
        .delivery-input-row { align-items: center; padding: 0.35rem 0; }
        .delivery-input-row input {
          width: 90px; text-align: right; padding: 0.3rem 0.45rem;
          background: var(--pos-elevated); color: var(--pos-text);
          border: 1px solid var(--pos-border); border-radius: 6px;
          font-size: 0.85rem; font-variant-numeric: tabular-nums;
        }
        .delivery-input-row input:disabled { opacity: 0.4; cursor: not-allowed; }

        /* ── Payment buttons ────────────────────── */
        .pay-buttons {
          display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem;
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
        .card-types { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.5rem; margin: 0.75rem 0; }
        .card-types button {
          padding: 0.8rem 0.5rem; background: #0f172a; border: 1px solid #334155;
          color: #cbd5e1; border-radius: 8px; cursor: pointer; font-family: inherit; font-size: 0.95rem; font-weight: 600;
        }
        .card-types button:hover { background: #334155; }
        .card-types button.active { background: var(--pos-card); border-color: var(--pos-card); color: #fff; }

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
