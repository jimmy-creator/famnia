// WhatsApp is for enquiries only — orders are placed through the website's
// checkout. A chat link is just a pre-filled message; nothing is saved.
export const WHATSAPP_NUMBER = '97466543343';

export const whatsappUrl = (text) =>
  `https://wa.me/${WHATSAPP_NUMBER}${text ? `?text=${encodeURIComponent(text)}` : ''}`;

export function openWhatsApp(text) {
  window.open(whatsappUrl(text), '_blank', 'noopener,noreferrer');
}

const variantText = (v) => (v ? Object.entries(v).map(([k, val]) => `${k}: ${val}`).join(', ') : '');

/** A question about one product, straight from its page. */
export function productEnquiryMessage({ name, productCode, selectedVariant, url }) {
  const variant = variantText(selectedVariant);
  return [
    'Hi, I have a question about this product:',
    '',
    `*${name}*`,
    productCode ? `Product code: ${productCode}` : null,
    variant || null,
    '',
    url,
  ].filter((l) => l != null).join('\n');
}
