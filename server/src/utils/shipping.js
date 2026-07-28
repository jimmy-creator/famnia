// Shipping rate calculation
// Configurable via .env — defaults provided

export function calculateShipping(subtotal, itemCount, shippingState) {
  const freeThreshold = parseFloat(process.env.SHIPPING_FREE_ABOVE || '500');
  const flatRate = parseFloat(process.env.SHIPPING_FLAT_RATE || '49');
  const perItemRate = parseFloat(process.env.SHIPPING_PER_ITEM || '0');
  const expressRate = parseFloat(process.env.SHIPPING_EXPRESS_RATE || '99');

  // Free shipping above threshold
  if (subtotal >= freeThreshold) {
    return {
      standard: { rate: 0, label: 'Free Shipping', days: '5-7 business days' },
      express: { rate: expressRate, label: 'Express Shipping', days: '1-2 business days' },
      freeThreshold,
    };
  }

  const standardRate = flatRate + (perItemRate * (itemCount - 1));

  return {
    standard: { rate: Math.round(standardRate * 100) / 100, label: 'Standard Shipping', days: '5-7 business days' },
    express: { rate: expressRate, label: 'Express Shipping', days: '1-2 business days' },
    freeThreshold,
    amountForFree: Math.round((freeThreshold - subtotal) * 100) / 100,
  };
}
