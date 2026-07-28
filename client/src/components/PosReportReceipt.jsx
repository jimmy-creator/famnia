/**
 * X-report (mid-shift snapshot) or Z-report (closed-shift final) — printable
 * on the same 80mm paper as the sales receipt. Same print CSS pattern as
 * PosReceipt: hides everything else, auto-fires window.print().
 */
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { isEnabled, printReport } from '../lib/thermalPrinter';

export default function PosReportReceipt({ report, currency = 'KWD', onClose }) {
  const printedRef = useRef(false);

  useEffect(() => {
    // Print exactly once — see PosReceipt for why a ref guard (not a cleanup
    // flag) is used: StrictMode double-invoked this in dev → an extra copy.
    if (printedRef.current) return;
    printedRef.current = true;
    (async () => {
      if (isEnabled('receipt')) {
        try {
          await printReport(report, currency);
          onClose?.();
          return;
        } catch (err) {
          console.warn('[thermal] direct report print failed, falling back:', err.message);
        }
      }
      setTimeout(() => window.print(), 200);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fmt = (n) => `${currency} ${(parseFloat(n) || 0).toFixed(3)}`;
  const t = report.type === 'Z' ? 'Z-REPORT' : 'X-REPORT';
  const session = report.session || {};
  const opened = session.openedAt ? new Date(session.openedAt).toLocaleString() : '—';
  const closed = session.closedAt ? new Date(session.closedAt).toLocaleString() : '—';

  // Portal to <body> + hide #root in print so only the report prints on one
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
          #pos-report {
            margin: 0 !important;
            width: 80mm !important;
            padding: 4mm !important;
            box-shadow: none !important;
            background: white !important;
            color: black !important;
            font-family: 'Courier New', monospace !important;
            font-size: 11pt !important;
          }
          #pos-report .no-print { display: none !important; }
          @page { size: 80mm auto; margin: 0; }
        }
        #pos-report {
          width: 80mm; margin: 24px auto; padding: 16px;
          background: white; color: #111;
          font-family: 'Courier New', monospace; font-size: 13px; line-height: 1.4;
          box-shadow: 0 4px 24px rgba(0,0,0,0.3);
        }
        #pos-report h2 { font-size: 16px; margin: 0; text-align: center; letter-spacing: 2px; }
        #pos-report .meta { font-size: 11px; text-align: center; margin: 4px 0 8px; }
        #pos-report hr { border: none; border-top: 1px dashed #444; margin: 8px 0; }
        #pos-report table { width: 100%; border-collapse: collapse; }
        #pos-report td { padding: 2px 0; vertical-align: top; }
        #pos-report .right { text-align: right; }
        #pos-report .strong { font-weight: bold; }
        #pos-report .actions { display: flex; gap: 8px; justify-content: center; margin-top: 16px; }
        #pos-report .actions button {
          padding: 8px 16px; border: 1px solid #444; background: white;
          font-family: inherit; cursor: pointer;
        }
      `}</style>

      <div id="pos-report">
        <h2>{t}</h2>
        <div className="meta">
          <div>{report.location?.name || 'Anfal Sports'}</div>
          {report.location?.phone && <div>Tel: {report.location.phone}</div>}
        </div>
        <hr />

        <div style={{ fontSize: 11 }}>
          <div>Cashier: <span className="strong">{report.cashier?.name || '—'}</span></div>
          <div>Opened: {opened}</div>
          {report.type === 'Z' && <div>Closed: {closed}</div>}
          {report.generatedAt && <div>Printed: {new Date(report.generatedAt).toLocaleString()}</div>}
        </div>
        <hr />

        <table>
          <tbody>
            <tr><td>Orders</td><td className="right">{report.orderCount}</td></tr>
            <tr><td>Cash sales</td><td className="right">{fmt(report.cashSales)}</td></tr>
            <tr><td>Card sales</td><td className="right">{fmt(report.cardSales)}</td></tr>
            {(report.cashRefunds > 0 || report.cardRefunds > 0) && (
              <>
                <tr><td>Cash refunds</td><td className="right">−{fmt(report.cashRefunds)}</td></tr>
                <tr><td>Card refunds</td><td className="right">−{fmt(report.cardRefunds)}</td></tr>
              </>
            )}
            <tr className="strong" style={{ fontSize: 14 }}>
              <td>NET SALES</td>
              <td className="right">{fmt(report.netSales)}</td>
            </tr>
          </tbody>
        </table>
        <hr />

        <table>
          <tbody>
            <tr><td>Opening cash</td><td className="right">{fmt(report.openingCash)}</td></tr>
            <tr><td>+ Cash sales</td><td className="right">{fmt(report.cashSales)}</td></tr>
            <tr><td>− Cash refunds</td><td className="right">{fmt(report.cashRefunds)}</td></tr>
            <tr className="strong">
              <td>Expected drawer</td>
              <td className="right">{fmt(report.expectedCash)}</td>
            </tr>
            {report.type === 'Z' && (
              <>
                <tr><td>Counted cash</td><td className="right">{fmt(report.closingCash)}</td></tr>
                <tr className="strong" style={{ color: report.variance < 0 ? '#b00' : (report.variance > 0 ? '#080' : '#000') }}>
                  <td>VARIANCE</td>
                  <td className="right">{report.variance >= 0 ? '+' : ''}{fmt(report.variance)}</td>
                </tr>
              </>
            )}
          </tbody>
        </table>

        {report.topItems?.length > 0 && (
          <>
            <hr />
            <div className="strong" style={{ fontSize: 12, marginBottom: 4 }}>TOP ITEMS</div>
            <table>
              <tbody>
                {report.topItems.map((it, i) => (
                  <tr key={i}>
                    <td>{it.name}</td>
                    <td className="right">{it.qty} × {fmt(it.revenue / Math.max(it.qty, 1))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <hr />
        <div style={{ textAlign: 'center', fontSize: 11 }}>
          {report.type === 'Z' ? '— END OF SHIFT —' : '— MID-SHIFT REPORT —'}
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
