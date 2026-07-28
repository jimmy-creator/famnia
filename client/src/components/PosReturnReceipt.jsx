/**
 * Printable return receipt — 80mm thermal, same print CSS pattern as
 * PosReceipt. Auto-fires window.print() on mount.
 */
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { isEnabled, printReturn, getReceiptLocale } from '../lib/thermalPrinter';

export default function PosReturnReceipt({ payload, currency = 'KWD', onClose }) {
  const printedRef = useRef(false);

  useEffect(() => {
    // Print exactly once — see PosReceipt for why a ref guard (not a cleanup
    // flag) is used: StrictMode double-invoked this in dev → an extra copy.
    if (printedRef.current) return;
    printedRef.current = true;
    (async () => {
      if (isEnabled('receipt')) {
        try {
          await printReturn(payload, currency);
          onClose?.();
          return;
        } catch (err) {
          console.warn('[thermal] direct return print failed, falling back:', err.message);
        }
      }
      setTimeout(() => window.print(), 200);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sr = payload.salesReturn;
  const receiptLoc = getReceiptLocale();
  const displayCurrency = (receiptLoc === 'ar' || receiptLoc === 'bi')
    ? (import.meta.env.VITE_CURRENCY_SYMBOL_AR || 'د.ك')
    : currency;
  const fmt = (n) => `${displayCurrency} ${(parseFloat(n) || 0).toFixed(3)}`;
  const pickName = (it) => (receiptLoc === 'ar' && it.nameAr) ? it.nameAr : it.name;
  const when = sr.createdAt ? new Date(sr.createdAt).toLocaleString() : '';
  const method = sr.refundMethod === 'cash' ? 'Cash'
    : sr.refundMethod === 'card' ? 'Card'
    : 'Store Credit';

  // Portal to <body> + hide #root in print so only the receipt prints on one
  // page (fixed-position over a tall app paginated → duplicate copies).
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
          #pos-return-receipt {
            margin: 0 !important;
            width: 80mm !important; padding: 4mm !important;
            box-shadow: none !important;
            background: white !important; color: black !important;
            font-family: 'Courier New', monospace !important; font-size: 11pt !important;
          }
          #pos-return-receipt .no-print { display: none !important; }
          @page { size: 80mm auto; margin: 0; }
        }
        #pos-return-receipt {
          width: 80mm; margin: 24px auto; padding: 16px;
          background: white; color: #111;
          font-family: 'Courier New', monospace; font-size: 13px; line-height: 1.4;
          box-shadow: 0 4px 24px rgba(0,0,0,0.3);
        }
        #pos-return-receipt h2 { font-size: 16px; margin: 0; text-align: center; letter-spacing: 2px; }
        #pos-return-receipt .meta { font-size: 11px; text-align: center; margin: 4px 0 8px; }
        #pos-return-receipt hr { border: none; border-top: 1px dashed #444; margin: 8px 0; }
        #pos-return-receipt table { width: 100%; border-collapse: collapse; }
        #pos-return-receipt td { padding: 2px 0; vertical-align: top; }
        #pos-return-receipt .right { text-align: right; }
        #pos-return-receipt .total-row { font-weight: bold; font-size: 14px; }
        #pos-return-receipt .actions { display: flex; gap: 8px; justify-content: center; margin-top: 16px; }
        #pos-return-receipt .actions button {
          padding: 8px 16px; border: 1px solid #444; background: white;
          font-family: inherit; cursor: pointer;
        }
      `}</style>

      <div id="pos-return-receipt">
        <h2>RETURN RECEIPT</h2>
        <div className="meta">
          <div>{sr.Location?.name || ''}</div>
          {sr.Location?.phone && <div>Tel: {sr.Location.phone}</div>}
        </div>
        <hr />
        <div style={{ fontSize: 11 }}>
          <div>Return #: {sr.returnNumber}</div>
          <div>Original: {payload.order?.orderNumber}</div>
          <div>Date: {when}</div>
          <div>Cashier: {sr.processor?.name || '—'}</div>
          {sr.reason && <div>Reason: {sr.reason}</div>}
        </div>
        <hr />
        <table>
          <tbody>
            {(sr.items || []).map((it, i) => {
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
                  <td className="right">−{fmt(it.refundAmount)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <hr />
        <table>
          <tbody>
            <tr className="total-row">
              <td>REFUND TOTAL</td>
              <td className="right">−{fmt(sr.refundAmount)}</td>
            </tr>
            <tr>
              <td>Method</td>
              <td className="right">{method}</td>
            </tr>
          </tbody>
        </table>
        <hr />
        <div style={{ textAlign: 'center', fontSize: 11 }}>
          {sr.refundMethod === 'cash' && 'Cash returned to customer'}
          {sr.refundMethod === 'card' && 'Refund to original card'}
          {sr.refundMethod === 'store_credit' && 'Store credit issued'}
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
