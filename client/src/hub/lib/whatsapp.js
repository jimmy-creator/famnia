/**
 * Drafted WhatsApp messages to a customer about their order. Nothing is sent
 * automatically: staff press the button, WhatsApp opens on their own phone or
 * computer with the message filled in, and they send it themselves.
 */
const money = (v) => `QAR ${Number(v || 0).toFixed(2)}`;

/** A wa.me number: digits only, Qatar's 974 added to a bare 8-digit local number. */
export function waNumber(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 8) d = `974${d}`;
  return d.length >= 8 ? d : '';
}

export function whatsappLink(phone, text) {
  const n = waNumber(phone);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : null;
}

function itemLines(items = []) {
  return items.map((i, idx) => {
    const options = [i.size, i.color].filter(Boolean).join(' / ');
    return [
      `${idx + 1}. ${i.name}${options ? ` (${options})` : ''}`,
      i.productCode ? `   Product code: ${i.productCode}` : null,
      `   Qty: ${i.quantity}${i.lineTotal != null ? ` · ${money(i.lineTotal)}` : ''}`,
    ].filter(Boolean).join('\n');
  });
}

const dateText = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : null);

/** The opening line for each order status. `status` uses the hub's vocabulary. */
function statusLine(order) {
  const pickup = order.fulfilmentMethod === 'Customer Pickup';
  switch (order.status) {
    case 'Draft':
      return 'Thank you for your order! Here are the details — please reply to confirm and we will process it right away.';
    case 'Pending':
    case 'Confirmed':
      return pickup
        ? 'Good news — your order is *confirmed*. We will let you know as soon as it is ready for pickup.'
        : `Good news — your order is *confirmed* and will be delivered${order.deliveryDate ? ` on *${dateText(order.deliveryDate)}*` : ' within 1–2 days'}.`;
    case 'Awaiting Pickup':
      return 'Your order is *ready for pickup*. Please reply with a convenient time and we will share the pickup details.';
    case 'Out for Delivery':
      return 'Your order is *out for delivery* and will reach you shortly. Please keep your phone reachable.';
    case 'Delivery Failed':
      return 'We tried to deliver your order but could not reach you. Please reply with a convenient time and we will arrange delivery again.';
    case 'Delivered':
      return 'Your order has been *delivered*. We hope you love it!';
    case 'Collected':
      return 'Thank you for collecting your order. We hope you love it!';
    case 'Order Fulfilled':
      return 'Your order is *complete*. Thank you for shopping with FEMNIA!';
    case 'Returned':
      return 'Your return has been *received and processed*.';
    case 'Cancelled':
      return 'Your order has been *cancelled*. If this was not expected, please reply to this message and we will help.';
    default:
      return `Your order status is now: *${order.status}*.`;
  }
}

/** The full message for an order in its current state. */
export function orderStatusMessage(order) {
  const balance = order.remainingBalance ?? Math.max((order.grandTotal || 0) - (order.amountReceived || 0), 0);
  const paid = order.paymentStatus === 'Paid' || (order.grandTotal > 0 && balance <= 0);
  const showMoney = !['Cancelled', 'Returned'].includes(order.status);
  const pickup = order.fulfilmentMethod === 'Customer Pickup';
  const delivery = Number(order.deliveryCharge) || 0;
  const totalNote = pickup ? '' : delivery > 0 ? ` (delivery charge ${money(delivery)} included)` : ' (free delivery)';
  return [
    `Hi ${order.customerName || 'there'},`,
    '',
    statusLine(order),
    '',
    `*Order ${order.id}*`,
    ...itemLines(order.items),
    '',
    showMoney && order.grandTotal != null ? `Total: ${money(order.grandTotal)}${totalNote}` : null,
    showMoney && order.grandTotal != null ? (paid ? 'Payment: Paid ✅' : `Amount to pay: ${money(balance)}`) : null,
    showMoney && order.grandTotal != null && !paid ? `You can pay by *Fawran* or *cash* on ${pickup ? 'pickup' : 'delivery'}.` : null,
    order.trackingNumber && order.status === 'Out for Delivery' ? `Tracking: ${order.trackingNumber}${order.courier ? ` (${order.courier})` : ''}` : null,
    order.fulfilmentMethod !== 'Customer Pickup' && order.address && ['Draft', 'Confirmed', 'Pending', 'Out for Delivery'].includes(order.status)
      ? `Delivery address: ${[order.address, order.area].filter(Boolean).join(', ')}`
      : null,
    '',
    order.status === 'Delivered' || order.status === 'Collected' || order.status === 'Order Fulfilled'
      ? 'Exchanges are possible within 7 days for unused items with tags and barcodes intact.'
      : null,
    'Thank you for shopping with FEMNIA! 💖',
  ].filter((l) => l != null).join('\n').replace(/\n{3,}/g, '\n\n');
}
