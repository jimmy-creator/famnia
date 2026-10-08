/**
 * Thermal delivery label — 100×130 mm (default) or 100×150 mm, exactly one
 * page. Styled by the dl-* rules in hub.css; printing never changes data.
 */
const dash = (v) => (v && String(v).trim() ? String(v).trim() : '—');

/** "Abaya × 2 (FEM0001,FEM0002) - Dress × 1", grouped by item name. */
function itemSummary(order, productCodes = {}) {
  if (!order.items.length) return '—';
  const grouped = new Map();
  for (const i of order.items) {
    const name = (i.name ?? '').trim() || i.sku;
    const key = name.toLowerCase();
    const code = productCodes[i.sku];
    const entry = grouped.get(key);
    if (entry) {
      entry.quantity += i.quantity;
      if (code && !entry.codes.includes(code)) entry.codes.push(code);
    } else {
      grouped.set(key, { name, quantity: i.quantity, codes: code ? [code] : [] });
    }
  }
  return [...grouped.values()]
    .map((g) => `${g.name} × ${g.quantity}${g.codes.length ? ` (${g.codes.join(',')})` : ''}`)
    .join(' - ');
}

const LABEL_BUSINESS_FALLBACK = {
  name: 'FEMNIA',
  location: 'Qatar',
  phone: 'WhatsApp-66543343',
  currency: 'QAR',
  footer: '',
};

function paymentBlock(order, currency) {
  const balance = Math.max(0, order.grandTotal - order.amountReceived);
  if (order.paymentStatus === 'Paid' || balance <= 0) {
    return { label: 'PAID', value: `${currency} ${order.grandTotal.toFixed(2)}` };
  }
  const cod = order.paymentMode === 'COD' || order.paymentMode === 'Cash';
  return { label: cod ? 'COD TO COLLECT' : 'BALANCE DUE', value: `${currency} ${balance.toFixed(2)}` };
}

export function DeliveryLabel({ order, size, business = LABEL_BUSINESS_FALLBACK, productCodes = {} }) {
  const pay = paymentBlock(order, business.currency);
  return (
    <div className={`dl-root ${size === '100x150' ? 'dl-root--150' : ''}`}>
      <div className="dl-header">
        <span className="dl-brand">{business.name.toUpperCase()}</span>
      </div>
      <p className="dl-subtitle">DELIVERY LABEL</p>
      <div className="dl-row">
        <div className="dl-cell dl-cell--label">FROM</div>
        <div className="dl-cell dl-cell--plain">FEMNIA | Qatar | WhatsApp-66543343</div>
      </div>
      <div className="dl-row">
        <div className="dl-cell dl-cell--label">CUSTOMER</div>
        <div className="dl-cell dl-cell--value dl-strong">{dash(order.customerName)}</div>
      </div>
      <div className="dl-row">
        <div className="dl-cell dl-cell--label">PHONE</div>
        <div className="dl-cell dl-cell--value dl-strong">{dash(order.phone)}</div>
      </div>
      <div className="dl-row">
        <div className="dl-cell dl-cell--label">AREA</div>
        <div className="dl-cell dl-cell--value">{dash(order.area)}</div>
      </div>
      <div className="dl-row dl-row--grow">
        <div className="dl-cell dl-cell--label">ADDRESS</div>
        <div className="dl-cell dl-cell--value dl-clamp">
          {dash(order.address)}
          {order.landmark ? ` (${order.landmark})` : ''}
        </div>
      </div>
      <div className="dl-row dl-row--grow">
        <div className="dl-cell dl-cell--label">ITEM NAME</div>
        <div className="dl-cell dl-cell--value dl-clamp">{itemSummary(order, productCodes)}</div>
      </div>
      <div className="dl-foot">
        <div className="dl-row">
          <div className="dl-cell dl-cell--label dl-half dl-center">{pay.label}</div>
          <div className="dl-cell dl-cell--label dl-half dl-center">ORDER NO.</div>
        </div>
        <div className="dl-row">
          <div className="dl-cell dl-cell--value dl-half dl-center dl-big">{pay.value}</div>
          <div className="dl-cell dl-cell--value dl-half dl-center dl-big">{dash(order.id)}</div>
        </div>
        {business.footer.trim() && <p className="dl-note">{business.footer.trim()}</p>}
      </div>
    </div>
  );
}
