// Shipping rate calculation
// Configurable via .env — defaults provided

import { Setting } from '../models/index.js';

// Express delivery is hidden until an admin turns it on (hub → Online Store →
// Delivery), so it is left out of the options entirely while off — the
// checkout then never offers it and the order routes fall back to standard.
export async function isExpressEnabled() {
  try {
    const row = await Setting.findByPk('shipping-express');
    return row?.value ? JSON.parse(row.value).enabled === true : false;
  } catch {
    return false;
  }
}

export async function calculateShipping(subtotal, itemCount, shippingState) {
  const freeThreshold = parseFloat(process.env.SHIPPING_FREE_ABOVE || '100');
  const flatRate = parseFloat(process.env.SHIPPING_FLAT_RATE || '10');
  const perItemRate = parseFloat(process.env.SHIPPING_PER_ITEM || '0');
  const expressRate = parseFloat(process.env.SHIPPING_EXPRESS_RATE || '99');
  const express = (await isExpressEnabled())
    ? { express: { rate: expressRate, label: 'Express Shipping', days: '1-2 business days' } }
    : {};

  // Free shipping above threshold
  if (subtotal >= freeThreshold) {
    return {
      standard: { rate: 0, label: 'Free Shipping', days: '1-2 business days' },
      ...express,
      freeThreshold,
    };
  }

  const standardRate = flatRate + (perItemRate * (itemCount - 1));

  return {
    standard: { rate: Math.round(standardRate * 100) / 100, label: 'Standard Shipping', days: '1-2 business days' },
    ...express,
    freeThreshold,
    amountForFree: Math.round((freeThreshold - subtotal) * 100) / 100,
  };
}
