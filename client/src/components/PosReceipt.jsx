/**
 * Printable receipt for in-store POS sales.
 *
 * Sized for 80mm thermal paper. The print CSS hides everything outside
 * `#pos-receipt` so `window.print()` produces just the receipt — no nav,
 * cart, or admin chrome.
 */
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { isEnabled, printSale, getReceiptLocale } from '../lib/thermalPrinter';

export default function PosReceipt({ payload, currency = 'KWD', onClose }) {
  const { order, change, amountTendered, location, cashier } = payload;
  const printedRef = useRef(false);

  useEffect(() => {
    // Print exactly once. React 18 StrictMode runs mount effects twice in dev,
    // which sent the thermal printer two jobs → an extra copy. A ref guard is
    // the right tool here (a cleanup-based flag would suppress onClose, since
    // StrictMode's cleanup fires before the printSale await resolves).
    if (printedRef.current) return;
    printedRef.current = true;
    (async () => {
      if (isEnabled('receipt')) {
        try {
          const openDrawer = payload.order.paymentMethod === 'pos_cash'
            || payload.order.paymentMethod === 'pos_split';
          await printSale(payload, currency, openDrawer);
          onClose?.();
          return;
        } catch (err) {
          console.warn('[thermal] direct print failed, falling back:', err.message);
        }
      }
      setTimeout(() => window.print(), 200);
    })();
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
  const methodLabel = (pm) => pm === 'pos_cash' ? 'Cash'
    : pm === 'pos_knet' ? 'KNET'
    : pm === 'pos_card' ? 'Card' : 'Card';
  const method = breakdown ? 'Split' : methodLabel(order.paymentMethod);
  const tenderLabel = (m) => m === 'cash' ? 'Cash' : m === 'knet' ? 'KNET' : 'Card';

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
        }
        @media print {
          body > #root { display: none !important; }
          .pos-receipt-overlay {
            position: static !important; background: none !important;
            display: block !important; padding: 0 !important; z-index: auto !important;
          }
          #pos-receipt {
            margin: 0 !important;
            width: 80mm !important;
            padding: 4mm !important;
            box-shadow: none !important;
            background: white !important;
            color: black !important;
            font-family: 'Courier New', monospace !important;
            font-size: 11pt !important;
          }
          #pos-receipt .no-print { display: none !important; }
          @page { size: 80mm auto; margin: 0; }
        }
        #pos-receipt {
          width: 80mm;
          margin: 24px auto;
          padding: 16px;
          background: white;
          color: #111;
          font-family: 'Courier New', monospace;
          font-size: 13px;
          line-height: 1.4;
          box-shadow: 0 4px 24px rgba(0,0,0,0.3);
        }
        #pos-receipt h2 { font-size: 16px; margin: 0; text-align: center; }
        #pos-receipt .meta { font-size: 11px; text-align: center; margin: 4px 0 8px; }
        #pos-receipt hr { border: none; border-top: 1px dashed #444; margin: 8px 0; }
        #pos-receipt table { width: 100%; border-collapse: collapse; }
        #pos-receipt td { padding: 2px 0; vertical-align: top; }
        #pos-receipt .right { text-align: right; }
        #pos-receipt .total-row { font-weight: bold; font-size: 14px; }
        #pos-receipt .actions { display: flex; gap: 8px; justify-content: center; margin-top: 16px; }
        #pos-receipt .actions button {
          padding: 8px 16px; border: 1px solid #444; background: white;
          font-family: inherit; cursor: pointer;
        }
      `}</style>

      <div id="pos-receipt">
        <h2>{location?.name || 'Anfal Sports'}</h2>
        <div className="meta">
          {location?.address && <div>{location.address}</div>}
          {location?.phone && <div>Tel: {location.phone}</div>}
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
              const sku = it.sku || it.variant?.sku || null;
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
            {parseFloat(order.discount || 0) > 0 && (() => {
              const subtotal = (order.items || []).reduce((s, it) => s + (parseFloat(it.price) || 0) * (parseInt(it.quantity, 10) || 0), 0);
              return (
                <>
                  <tr><td>Subtotal</td><td className="right">{fmt(subtotal)}</td></tr>
                  <tr><td>Discount{order.couponCode ? ` (${order.couponCode})` : ''}</td><td className="right">−{fmt(order.discount)}</td></tr>
                </>
              );
            })()}
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

        <div className="actions no-print">
          <button onClick={() => window.print()}>Print again</button>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
