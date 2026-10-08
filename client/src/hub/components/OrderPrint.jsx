/**
 * Print surfaces for a sales order.
 *
 * Both sheets are hidden on screen and shown only while printing, so printing
 * or reprinting never changes any data — it only toggles CSS.
 */
import { BUSINESS, FEMNIA_LOGO_URL } from '@/hub/components/Brand';

const dt = (v) =>
  v ? new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const PRINT_BUSINESS_FALLBACK = {
  name: BUSINESS.name,
  location: BUSINESS.location,
  phone: BUSINESS.phone,
  currency: BUSINESS.currency,
  invoiceFooter: 'Thank you for shopping with FEMNIA.',
  labelFooter: '',
  logoUrl: '',
};

export function InvoiceSheet({ order, business = PRINT_BUSINESS_FALLBACK }) {
  const pickup = order.fulfilmentMethod === 'Customer Pickup';
  const money = (v) => `${business.currency} ${v.toFixed(2)}`;
  return (
    <div className="invoice-sheet print-only text-[11pt] text-black">
      <div className="flex items-start justify-between border-b border-black/20 pb-3">
        <div className="flex items-center gap-3">
          <img src={business.logoUrl || FEMNIA_LOGO_URL} alt={business.name} className="h-16 w-16 object-contain" />
          <div>
            <p className="text-lg font-semibold tracking-[0.3em]">{business.name.toUpperCase()}</p>
            <p className="text-[9pt]">Women&apos;s &amp; Children&apos;s Clothing</p>
            <p className="text-[9pt]">
              {business.location} · {business.phone}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-base font-semibold">TAX INVOICE</p>
          <p className="text-[10pt]">Invoice No: {order.id}</p>
          <p className="text-[10pt]">Date: {dt(order.orderDate)}</p>
          <p className="text-[10pt]">{pickup ? 'Customer Pickup' : 'Delivery'}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-6">
        <div>
          <p className="text-[9pt] font-semibold uppercase">Customer</p>
          <p>{order.customerName}</p>
          <p>{order.phone}</p>
          {order.area && <p>{order.area}</p>}
          {!pickup && order.address && <p className="whitespace-pre-line">{order.address}</p>}
          {!pickup && order.landmark && <p>Landmark: {order.landmark}</p>}
        </div>
        <div>
          <p className="text-[9pt] font-semibold uppercase">{pickup ? 'Pickup' : 'Delivery'}</p>
          {pickup ? (
            <>
              <p>Date: {dt(order.pickupDate)}</p>
              <p>Time: {order.pickupTime || '—'}</p>
              {order.pickupNotes && <p>{order.pickupNotes}</p>}
            </>
          ) : (
            <>
              <p>Date: {dt(order.deliveryDate)}</p>
              <p>Courier / driver: {order.courier || '—'}</p>
              {order.trackingNumber && <p>Tracking: {order.trackingNumber}</p>}
            </>
          )}
          <p className="mt-1">
            Payment: {order.paymentMode} · {order.paymentStatus}
          </p>
        </div>
      </div>

      <table className="mt-4 w-full border-collapse text-[10pt]">
        <thead>
          <tr className="border-y border-black/30 text-left">
            <th className="py-1">#</th>
            <th className="py-1">SKU</th>
            <th className="py-1">Item</th>
            <th className="py-1">Size</th>
            <th className="py-1">Colour</th>
            <th className="py-1 text-right">Qty</th>
            <th className="py-1 text-right">Rate</th>
            <th className="py-1 text-right">Discount</th>
            <th className="py-1 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((i, idx) => (
            <tr key={`${i.sku}-${idx}`} className="border-b border-black/10">
              <td className="py-1">{idx + 1}</td>
              <td className="py-1">{i.sku}</td>
              <td className="py-1">{i.name}</td>
              <td className="py-1">{i.size || '—'}</td>
              <td className="py-1">{i.color || '—'}</td>
              <td className="py-1 text-right">{i.quantity}</td>
              <td className="py-1 text-right">{i.unitPrice.toFixed(2)}</td>
              <td className="py-1 text-right">{i.discount.toFixed(2)}</td>
              <td className="py-1 text-right">{i.lineTotal.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 flex justify-end">
        <table className="text-[10pt]">
          <tbody>
            <tr>
              <td className="pr-6">Items total</td>
              <td className="text-right">{money(order.itemsBeforeDiscount)}</td>
            </tr>
            <tr>
              <td className="pr-6">Discount</td>
              <td className="text-right">-{money(order.totalDiscount)}</td>
            </tr>
            <tr>
              <td className="pr-6">Delivery charge</td>
              <td className="text-right">{money(order.deliveryCharge)}</td>
            </tr>
            <tr className="border-t border-black/30 font-semibold">
              <td className="pr-6 pt-1">Grand total</td>
              <td className="pt-1 text-right">{money(order.grandTotal)}</td>
            </tr>
            <tr>
              <td className="pr-6">Amount received</td>
              <td className="text-right">{money(order.amountReceived)}</td>
            </tr>
            <tr className="font-semibold">
              <td className="pr-6">Balance due</td>
              <td className="text-right">{money(order.remainingBalance)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-8 flex justify-between text-[9pt]">
        <p>{business.invoiceFooter || PRINT_BUSINESS_FALLBACK.invoiceFooter}</p>
        <p>Authorised signature: ____________________</p>
      </div>
    </div>
  );
}

/** Thermal delivery label — 100×150 mm or 100×130 mm, exactly one page. */
export function LabelSheet({ order }) {
  return (
    <div className="label-sheet print-only text-black">
      <div className="flex items-center justify-between border-b-2 border-black pb-2">
        <div className="flex items-center gap-2">
          <img src={FEMNIA_LOGO_URL} alt="FEMNIA" className="h-12 w-12 object-contain" />
          <div>
            <p className="text-base font-bold tracking-[0.25em]">FEMNIA</p>
            <p className="text-[8pt]">{BUSINESS.phone}</p>
          </div>
        </div>
        <div className="text-right text-[9pt]">
          <p className="font-bold">{order.id}</p>
          <p>{dt(order.orderDate)}</p>
        </div>
      </div>

      <div className="mt-2 text-[10pt]">
        <p className="text-[8pt] font-bold uppercase">Deliver to</p>
        <p className="text-[13pt] font-bold leading-tight">{order.customerName}</p>
        <p className="text-[12pt] font-bold">{order.phone}</p>
        {order.area && <p className="text-[10pt]">{order.area}</p>}
        <p className="whitespace-pre-line text-[10pt] leading-snug">{order.address || '—'}</p>
        {order.landmark && <p className="text-[10pt] leading-snug">Landmark: {order.landmark}</p>}
      </div>

      <div className="mt-2 border-t border-black/40 pt-2 text-[9pt]">
        <p>
          <span className="font-bold">Items:</span> {order.items.reduce((s, i) => s + i.quantity, 0)} pcs ·{' '}
          {order.items.length} line(s)
        </p>
        <p>
          <span className="font-bold">Payment:</span> {order.paymentMode} · {order.paymentStatus}
        </p>
        <p className="text-[12pt] font-bold">
          {order.remainingBalance > 0 ? `COLLECT: QAR ${order.remainingBalance.toFixed(2)}` : 'PAID — collect nothing'}
        </p>
        {order.courier && <p>Courier / driver: {order.courier}</p>}
        {order.deliveryNotes && <p className="leading-snug">Note: {order.deliveryNotes}</p>}
      </div>

      <div className="mt-2 border-t border-black/40 pt-1 text-[8pt]">
        <p>From: FEMNIA · {BUSINESS.location}</p>
        <p>Returns / help: {BUSINESS.phone}</p>
      </div>
    </div>
  );
}
