/* eslint-disable react-refresh/only-export-components */
/**
 * Shared barcode-label rendering + browser-print sheet.
 *
 * Used by BOTH the admin Barcode Labels screen and the POS "Print label"
 * modal so the printed output is identical. The print target is portaled to
 * <body>; in print, #root is hidden so only the labels lay out (no blank
 * trailing pages). Call window.print() to print.
 */
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import JsBarcode from 'jsbarcode';
import { CURRENCY_DECIMALS } from '../utils/currency';

export const LABEL_SIZES = [
  { id: 'small', label: '40 × 25 mm', width: 40, height: 25, barcodeH: 26, fontPt: 8 },
  { id: 'medium', label: '50 × 30 mm', width: 50, height: 30, barcodeH: 30, fontPt: 9 },
  { id: 'large', label: '80 × 50 mm', width: 80, height: 50, barcodeH: 44, fontPt: 11 },
];

export const STORE_NAME = import.meta.env.VITE_STORE_NAME || 'Femnia Fashion';

export function BarcodeSvg({ value, height = 30 }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || !value) return;
    try {
      JsBarcode(ref.current, String(value), {
        format: 'CODE128',
        displayValue: false,
        height,
        margin: 0,
        background: '#ffffff',
        lineColor: '#000000',
      });
      // Fill the label width at a FIXED height. Without this, width:100% +
      // height:auto scales a short barcode up proportionally on wide labels,
      // making it tall enough to collide with a 2-line product name above.
      const w = ref.current.getAttribute('width');
      const h = ref.current.getAttribute('height');
      if (w && h) {
        ref.current.setAttribute('viewBox', `0 0 ${w} ${h}`);
        ref.current.setAttribute('preserveAspectRatio', 'none');
      }
    } catch {
      /* invalid value — render empty */
    }
  }, [value, height]);
  return <svg ref={ref} style={{ width: '100%', height: `${height}px`, display: 'block' }} />;
}

// Barcode value: the product's own code when it has one, else a "P<id>"
// fallback so every product is still scannable. The POS resolves both —
// an exact code match first, then the P<id> form back to the product id.
// (Upstream used an arbitrary id+8012000 offset; that numbering belongs to
// a different store, so it is deliberately not carried over.)
export const barcodeForProduct = (product) =>
  product.code || (product.productId ? `P${product.productId}` : '');

export function Label({ product, size, show, currency }) {
  const codeForBarcode = barcodeForProduct(product);
  return (
    <div className="bc-label" style={{
      width: `${size.width}mm`,
      height: `${size.height}mm`,
      padding: '1mm 1.2mm',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
    }}>
      {show.brand && (
        <div className="bc-brand" style={{ fontSize: `${Math.max(6, size.fontPt - 1)}pt`, fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase', lineHeight: 1.05 }}>
          {STORE_NAME}
        </div>
      )}
      {show.name && (
        <div className="bc-name" style={{ fontSize: `${size.fontPt}pt`, lineHeight: 1.1, fontWeight: 600, marginTop: show.brand ? '0.3mm' : 0, WebkitLineClamp: size.id === 'small' ? 1 : 2 }}>
          {product.name}
        </div>
      )}
      {show.barcode && (
        <div style={{ width: '100%', marginTop: '0.6mm' }}>
          <BarcodeSvg value={codeForBarcode} height={size.barcodeH} />
        </div>
      )}
      {show.sku && (
        <div className="bc-sku" style={{ fontSize: `${size.fontPt - 1}pt`, letterSpacing: '1.5px', fontFamily: 'ui-monospace, monospace', marginTop: '0.2mm' }}>
          {codeForBarcode}
        </div>
      )}
      {show.price && (
        <div className="bc-price" style={{ fontSize: `${size.fontPt + 2}pt`, fontWeight: 800, marginTop: '0.4mm' }}>
          {currency} {(parseFloat(product.price) || 0).toFixed(CURRENCY_DECIMALS)}
        </div>
      )}
    </div>
  );
}

// The shared label + print CSS. Also styles the on-screen preview (admin) since
// .bc-label / .bc-layout-* are defined here.
export function BarcodeLabelStyles({ size, layout }) {
  return (
    <style>{`
      .bc-layout-sheet { display: flex; flex-wrap: wrap; gap: 2mm; }
      .bc-layout-roll { display: flex; flex-direction: column; gap: 1mm; align-items: flex-start; }
      .bc-print-only { display: none; }
      .bc-label {
        background: white; color: black;
        border: 1px solid #cbd5e1;
        display: flex; flex-direction: column;
        font-family: 'Inter', -apple-system, sans-serif;
        overflow: hidden; box-sizing: border-box;
        page-break-inside: avoid;
      }
      /* Never let a child shrink below its content — otherwise a long name's
         box collapses and its text overlaps the barcode. Excess clips at the
         bottom (overflow:hidden) instead. */
      .bc-label > * { flex-shrink: 0; }
      .bc-name {
        overflow: hidden; text-overflow: ellipsis; display: -webkit-box;
        -webkit-line-clamp: 2; -webkit-box-orient: vertical;
      }

      @media print {
        /* Collapse the entire app; only the portaled labels remain in flow,
           so the printed page count == the labels (no blank trailing pages). */
        #root { display: none !important; }
        .no-print { display: none !important; }

        .bc-print-only {
          display: block !important;
          position: static !important;
          padding: 0 !important; margin: 0 !important;
          background: #fff !important;
        }
        .bc-label { border: none !important; margin: 0 !important; page-break-inside: avoid; }

        .bc-print-only.bc-layout-sheet { display: flex !important; flex-wrap: wrap !important; gap: 0 !important; }
        .bc-print-only.bc-layout-roll { display: block !important; }
        .bc-layout-roll .bc-label { page-break-after: always !important; break-after: page !important; }
        .bc-layout-roll .bc-label:last-child { page-break-after: auto !important; break-after: auto !important; }
      }
      ${layout === 'roll' ? `
      /* Roll printing: one global @page sized to the selected label, so the
         printer feeds one label per page. The label prints 1mm under the page
         height so its content never reaches the page boundary (that boundary
         touch split the price onto the next sticker + spawned phantom pages). */
      @media print {
        @page { size: ${size.width}mm ${size.height}mm; margin: 0; }
        .bc-print-only.bc-layout-roll .bc-label { height: ${size.height - 1}mm !important; }
      }
      ` : ''}
    `}</style>
  );
}

// Portaled, print-only sheet. Render it (hidden on screen) and call
// window.print() to print. `labels` is already flattened (one per sticker).
export function BarcodeLabelSheet({ labels, size, show, currency, layout = 'roll' }) {
  if (!labels?.length) return null;
  return createPortal(
    <div id="bc-print-area" className={`bc-print-only bc-layout-${layout}`} data-w={size.width}>
      {labels.map((q, i) => (
        <Label key={`p${i}`} product={q} size={size} show={show} currency={currency} />
      ))}
    </div>,
    document.body,
  );
}
