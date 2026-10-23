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

// The free-delivery threshold is edited in the hub (Online Store → Delivery) and
// the classic admin (Theme tab); SHIPPING_FREE_ABOVE is only the fallback until
// someone saves it. Every storefront mention of it reads /api/settings/shipping.
export async function getShippingRates() {
  let freeAbove = NaN;
  try {
    const row = await Setting.findByPk('shipping-free-above');
    if (row?.value != null && row.value !== '') freeAbove = parseFloat(row.value);
  } catch {
    // fall back to the env default below
  }
  if (!Number.isFinite(freeAbove) || freeAbove < 0) freeAbove = parseFloat(process.env.SHIPPING_FREE_ABOVE || '135');
  return { freeAbove, flatRate: parseFloat(process.env.SHIPPING_FLAT_RATE || '10') };
}

export async function calculateShipping(subtotal, itemCount, shippingState) {
  const { freeAbove: freeThreshold, flatRate } = await getShippingRates();
  const perItemRate = parseFloat(process.env.SHIPPING_PER_ITEM || '0');
  const expressRate = parseFloat(process.env.SHIPPING_EXPRESS_RATE || '99');
  const express = (await isExpressEnabled())
    ? { express: { rate: expressRate, label: 'Express Shipping', days: '1-2 business days' } }
    : {};
  // Always free; the team arranges the pickup with the customer on WhatsApp.
  const pickup = { pickup: { rate: 0, label: 'Pickup', days: 'We will WhatsApp you when it is ready' } };

  // Free shipping above threshold
  if (subtotal >= freeThreshold) {
    return {
      standard: { rate: 0, label: 'Free Shipping', days: '1-2 business days' },
      ...express,
      ...pickup,
      freeThreshold,
    };
  }

  const standardRate = flatRate + (perItemRate * (itemCount - 1));

  return {
    standard: { rate: Math.round(standardRate * 100) / 100, label: 'Standard Shipping', days: '1-2 business days' },
    ...express,
    ...pickup,
    freeThreshold,
    amountForFree: Math.round((freeThreshold - subtotal) * 100) / 100,
  };
}
