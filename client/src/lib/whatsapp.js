import { CURRENCY, formatPrice } from '../utils/currency';
import { productCodeOf } from './productCode';

// WhatsApp orders are only a pre-filled chat message — nothing is saved on
// the server. Customers often don't confirm, so staff enter the sale in the
// hub themselves once it's agreed in the chat.
export const WHATSAPP_NUMBER = '97466543343';

export const whatsappUrl = (text) =>
  `https://wa.me/${WHATSAPP_NUMBER}${text ? `?text=${encodeURIComponent(text)}` : ''}`;

export function openWhatsApp(text) {
  window.open(whatsappUrl(text), '_blank', 'noopener,noreferrer');
}

const money = (n) => `${CURRENCY} ${formatPrice(n)}`;
const variantText = (v) => (v ? Object.entries(v).map(([k, val]) => `${k}: ${val}`).join(', ') : '');

function itemLines(items) {
  return items.map((it, i) => {
    const variant = variantText(it.selectedVariant);
    const code = productCodeOf(it, it.selectedVariant);
    return [
      `${i + 1}. ${it.name}${variant ? ` (${variant})` : ''}`,
      code ? `   Product code: ${code}` : null,
      `   ${it.quantity} × ${money(it.price)} = ${money(parseFloat(it.price) * it.quantity)}`,
    ].filter((l) => l != null).join('\n');
  });
}

/** One product straight from its page. */
export function productOrderMessage({ name, productCode, price, quantity, selectedVariant, url }) {
  const variant = variantText(selectedVariant);
  return [
    "Hi, I'd like to order:",
    '',
    `*${name}*`,
    productCode ? `Product code: ${productCode}` : null,
    variant || null,
    `Qty: ${quantity}`,
    `Price: ${money(parseFloat(price) * quantity)}`,
    '',
    url,
  ].filter((l) => l != null).join('\n');
}

/** The whole cart, before delivery details are known. */
export function cartOrderMessage(items, subtotal) {
  return [
    "Hi, I'd like to order:",
    '',
    ...itemLines(items),
    '',
    `Subtotal: ${money(subtotal)}`,
  ].join('\n');
}

/** Checkout: items, totals and the delivery details the customer filled in. */
export function checkoutOrderMessage({ items, subtotal, discount, couponCode, shipping, total, address, pickup = false }) {
  return [
    "Hi, I'd like to place this order:",
    '',
    ...itemLines(items),
    '',
    `Subtotal: ${money(subtotal)}`,
    discount > 0 ? `Discount${couponCode ? ` (${couponCode})` : ''}: -${money(discount)}` : null,
    pickup ? 'Pickup: Free' : `Delivery: ${shipping > 0 ? money(shipping) : 'Free'}`,
    `*Total: ${money(total)}*${!pickup && shipping > 0 ? ' (delivery charge included)' : ''}`,
    '',
    pickup ? '*I will pick up the order*' : '*Deliver to*',
    address.fullName,
    address.phone,
    address.altPhone || null,
    address.address || null,
    address.city || null,
    address.email || null,
  ].filter((l) => l != null).join('\n');
}
