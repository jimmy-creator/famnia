/**
 * Printable receipt for in-store POS sales.
 *
 * Sized for 80mm thermal paper. The print CSS hides everything outside
 * `#pos-receipt` so `window.print()` produces just the receipt — no nav,
 * cart, or admin chrome.
 */
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import JsBarcode from 'jsbarcode';
import { isEnabled, printSale, getReceiptLocale, RECEIPT_STORE } from '../lib/thermalPrinter';

// autoPrint=false shows the receipt without firing the printer — used for
// reprints from Recent sales, where printing is a deliberate click. Only a
// fresh sale (autoPrint) opens the cash drawer.
export default function PosReceipt({ payload, currency = 'KWD', onClose, autoPrint = true }) {
  const { order, change, amountTendered, cardType, location, cashier } = payload;
  const printedRef = useRef(false);
  const barcodeRef = useRef(null);
  const logoRef = useRef(null);

  const print = async (openDrawer = false) => {
    if (isEnabled('receipt')) {
      try {
        await printSale(payload, currency, openDrawer);
        onClose?.();
        return;
      } catch (err) {
        console.warn('[thermal] direct print failed, falling back:', err.message);
      }
    }
    // Don't print before the logo has loaded, or the header comes out blank.
    const logo = logoRef.current;
    if (logo && !logo.complete) {
      await new Promise((resolve) => { logo.onload = resolve; logo.onerror = resolve; });
    }
    setTimeout(() => window.print(), 200);
  };

  // Receipt number as Code128 so the Return screen can scan it back in.
  // Drawn synchronously on mount, before the print effect below fires.
  useEffect(() => {
    if (!barcodeRef.current || !order.orderNumber) return;
    try {
      JsBarcode(barcodeRef.current, order.orderNumber, {
        format: 'CODE128', displayValue: false, height: 40, margin: 0,
      });
    } catch {
      /* invalid value — render empty */
    }
  }, [order.orderNumber]);

  useEffect(() => {
    // Print exactly once. React 18 StrictMode runs mount effects twice in dev,
    // which sent the thermal printer two jobs → an extra copy. A ref guard is
    // the right tool here (a cleanup-based flag would suppress onClose, since
    // StrictMode's cleanup fires before the printSale await resolves).
    if (!autoPrint || printedRef.current) return;
    printedRef.current = true;
    print(payload.order.paymentMethod === 'pos_cash' || payload.order.paymentMethod === 'pos_split');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const receiptLoc = getReceiptLocale();
  const displayCurrency = (receiptLoc === 'ar' || receiptLoc === 'bi')
    ? (import.meta.env.VITE_CURRENCY_SYMBOL_AR || 'د.ك')
    : currency;
  const fmt = (n) => `${displayCurrency} ${(parseFloat(n) || 0).toFixed(3)}`;
  const pickName = (it) => (receiptLoc === 'ar' && it.nameAr) ? it.nameAr : it.name;
  const when = order.createdAt ? new Date(order.createdAt).toLocaleString() : '';
  const breakdown = Array.isArray(order.paymentBreakdown) ? order.paymentBreakdown : null;
  const methodLabel = (pm) => (pm === 'pos_cash' ? 'Cash' : cardType || 'Card');
  const method = breakdown ? 'Split' : methodLabel(order.paymentMethod);
  const tenderLabel = (m) => (m === 'cash' ? 'Cash' : 'Card');

  // Rendered through a portal to <body> so the print stylesheet can hide the
  // whole app (#root) and leave ONLY the receipt. The previous approach kept
  // #pos-receipt position:fixed over a visibility:hidden app — but a tall app
  // paginated into 2 pages and fixed elements repeat on every page, so the
  // receipt printed twice. Hiding #root makes the document exactly one page.
  return createPortal(
    <div className="pos-receipt-overlay">
      <style>{`
        .pos-receipt-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 100;
          display: grid; place-items: center; padding: 1rem;
          /* Scroll a receipt taller than the viewport so the buttons stay reachable. */
          overflow-y: auto;
        }
        @media print {
          body > #root { display: none !important; }
          .pos-receipt-overlay {
            position: static !important; background: none !important;
            display: block !important; padding: 0 !important; z-index: auto !important;
            overflow: visible !important;
          }
          #pos-receipt {
            margin: 0 !important;
            width: 72mm !important;
            padding: 2mm !important;
            box-shadow: none !important;
            background: white !important;
            color: black !important;
            font-family: 'Courier New', monospace !important;
            font-size: 10pt !important;
          }
          #pos-receipt .no-print { display: none !important; }
          @page { size: 80mm auto; margin: 0; }
        }
        #pos-receipt {
          width: 72mm;
          margin: 24px auto;
          padding: 16px;
          background: white;
          color: #111;
          font-family: 'Courier New', monospace;
          font-size: 13px;
          line-height: 1.4;
          box-shadow: 0 4px 24px rgba(0,0,0,0.3);
        }
        #pos-receipt .logo { display: block; width: 60%; height: auto; margin: 0 auto 6px; }
        #pos-receipt h2 { font-size: 16px; margin: 0; text-align: center; }
        #pos-receipt .meta { font-size: 11px; text-align: center; margin: 4px 0 8px; }
        #pos-receipt hr { border: none; border-top: 1px dashed #444; margin: 8px 0; }
        #pos-receipt table { width: 100%; border-collapse: collapse; }
        #pos-receipt td { padding: 2px 0; vertical-align: top; }
        #pos-receipt, #pos-receipt * { box-sizing: border-box; }
        /* Long SKUs/emails wrap instead of pushing the amount column off the paper. */
        #pos-receipt { overflow-wrap: anywhere; }
        #pos-receipt .right { text-align: right; white-space: nowrap; padding-left: 6px; }
        #pos-receipt .total-row { font-weight: bold; font-size: 14px; }
        #pos-receipt .actions {
          display: flex; gap: 8px; justify-content: center; margin-top: 16px;
          /* Pinned to the bottom of the scrolling overlay so Close is always on screen. */
          position: sticky; bottom: 0; background: white; padding: 8px 0;
        }
        #pos-receipt .actions button {
          padding: 8px 16px; border: 1px solid #444; background: white;
          font-family: inherit; cursor: pointer;
        }
      `}</style>

      <div id="pos-receipt">
        {/* Mirrors the thermal path, which prints the same mark via the
            encoder's raster image support. onError hides it rather than
            leaving a broken-image icon on a customer's receipt. */}
        <img
          ref={logoRef} className="logo" src={RECEIPT_STORE.logo} alt=""
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
        <h2>{location?.name || RECEIPT_STORE.name}</h2>
        <div className="meta">
          {(location?.address || RECEIPT_STORE.address) && <div>{location?.address || RECEIPT_STORE.address}</div>}
          {(location?.phone || RECEIPT_STORE.phone) && <div>Tel: {location?.phone || RECEIPT_STORE.phone}</div>}
          {RECEIPT_STORE.email && <div>{RECEIPT_STORE.email}</div>}
        </div>
        <hr />
        <div style={{ fontSize: 11 }}>
          <div>Receipt: {order.orderNumber}</div>
          <div>Date: {when}</div>
          <div>Cashier: {cashier?.name || '—'}</div>
          {order.shippingAddress?.fullName && order.shippingAddress.fullName !== 'Walk-in' && (
            <div>Customer: {order.shippingAddress.fullName}</div>
          )}
        </div>
        <hr />
        <table>
          <tbody>
            {(order.items || []).map((it, i) => {
              const sku = it.barcode || it.sku || it.variant?.sku || null;
              const dispName = pickName(it);
              return (
                <tr key={i}>
                  <td>
                    {dispName}
                    {receiptLoc === 'bi' && it.nameAr && it.nameAr !== it.name && (
                      <div style={{ fontSize: 11, color: '#444', direction: 'rtl' }}>{it.nameAr}</div>
                    )}
                    <div style={{ fontSize: 11, color: '#444' }}>
                      {sku && <span style={{ fontFamily: 'monospace' }}>{sku} · </span>}
                      {it.quantity} × {fmt(it.price)}
                    </div>
                  </td>
                  <td className="right">{fmt(it.price * it.quantity)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <hr />
        <table>
          <tbody>
            {/* Show the subtotal whenever anything sits between it and the
                total — a discount, a delivery charge, or both. */}
            {(parseFloat(order.discount || 0) > 0 || parseFloat(order.shippingCharge || 0) > 0) && (() => {
              const subtotal = (order.items || []).reduce((s, it) => s + (parseFloat(it.price) || 0) * (parseInt(it.quantity, 10) || 0), 0);
              return (
                <>
                  <tr><td>Subtotal</td><td className="right">{fmt(subtotal)}</td></tr>
                  {parseFloat(order.discount || 0) > 0 && (
                    <tr><td>Discount{order.couponCode ? ` (${order.couponCode})` : ''}</td><td className="right">−{fmt(order.discount)}</td></tr>
                  )}
                </>
              );
            })()}
            {parseFloat(order.shippingCharge || 0) > 0 && (
              <tr><td>Delivery</td><td className="right">{fmt(order.shippingCharge)}</td></tr>
            )}
            <tr className="total-row">
              <td>TOTAL</td>
              <td className="right">{fmt(order.totalAmount)}</td>
            </tr>
            {breakdown ? breakdown.map((tn, i) => (
              <tr key={i}>
                <td>Paid ({tenderLabel(tn.method)})</td>
                <td className="right">{fmt(tn.amount)}</td>
              </tr>
            )) : (
              <tr>
                <td>Paid ({method})</td>
                <td className="right">{fmt(amountTendered ?? order.totalAmount)}</td>
              </tr>
            )}
            {change > 0 && !breakdown && (
              <tr>
                <td>Change</td>
                <td className="right">{fmt(change)}</td>
              </tr>
            )}
          </tbody>
        </table>
        <hr />
        <div style={{ textAlign: 'center', fontSize: 11 }}>
          Thank you for shopping with us!
        </div>
        {order.orderNumber && (
          <div style={{ marginTop: 8, textAlign: 'center' }}>
            <svg ref={barcodeRef} style={{ width: '100%', height: 'auto', display: 'block' }} />
            <div style={{ fontSize: 10 }}>{order.orderNumber}</div>
          </div>
        )}

        <div className="actions no-print">
          {autoPrint
            ? <button onClick={() => window.print()}>Print again</button>
            : <button onClick={() => print()}>Print</button>}
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
