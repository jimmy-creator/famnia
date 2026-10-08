/** Print helpers shared by Invoices & Labels and the order details sheet. */
export const LABEL_SIZES = ['100x130', '100x150'];
const LABEL_SIZE_KEY = 'femnia.labelSize';

function stored() {
  try {
    return window.localStorage.getItem(LABEL_SIZE_KEY);
  } catch {
    return null;
  }
}

export function readLabelSize() {
  return stored() === '100x150' ? '100x150' : '100x130';
}

/** True when a user has explicitly chosen a size (settings default applies otherwise). */
export const hasStoredLabelSize = () => stored() !== null;

export function storeLabelSize(size) {
  try {
    window.localStorage.setItem(LABEL_SIZE_KEY, size);
  } catch {
    /* storage unavailable — the choice lasts for this page only */
  }
}

/** URL of the stand-alone label page (outside the hub shell). */
export const deliveryLabelUrl = (orderId, size, autoprint) =>
  `/hub/print/delivery-label/${encodeURIComponent(orderId)}?size=${size}${autoprint ? '&autoprint=1' : ''}`;

/**
 * Prints either the A4 invoice or a thermal label (100x150 mm / 100x130 mm).
 * Reprinting never touches inventory — it only toggles print CSS.
 */
export function printDocument(kind, labelSize = '100x130') {
  const styleId = 'femnia-print-page-rule';
  document.getElementById(styleId)?.remove();
  const style = document.createElement('style');
  style.id = styleId;
  const mm = labelSize === '100x130' ? '100mm 130mm' : '100mm 150mm';
  style.textContent = kind === 'label' ? `@page { size: ${mm}; margin: 0; }` : '@page { size: A4; margin: 12mm; }';
  document.head.appendChild(style);
  const classes =
    kind === 'label'
      ? labelSize === '100x130'
        ? ['printing-label', 'printing-label-130']
        : ['printing-label']
      : ['printing-invoice'];
  document.body.classList.add(...classes);
  const cleanup = () => {
    document.body.classList.remove(...classes);
    style.remove();
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();
  window.setTimeout(cleanup, 2000);
}
