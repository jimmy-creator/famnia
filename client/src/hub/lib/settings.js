/**
 * Business settings helpers (client side). The server (routes/hubAdmin.js)
 * repeats the same validation and is the real guard; this mirror lets the
 * form flag problems before saving.
 */
export const parseList = (raw) =>
  raw
    .split(/[\n,]/)
    .map((v) => v.trim())
    .filter(Boolean);

export const serializeList = (items) => items.join(', ');

/** Case-insensitive duplicate guard for a managed list. */
export function listDuplicate(items, candidate) {
  const key = candidate.trim().toLowerCase();
  return items.some((i) => i.trim().toLowerCase() === key);
}

export function dedupeList(items) {
  const out = [];
  for (const item of items) {
    const value = item.trim();
    if (value && !listDuplicate(out, value)) out.push(value);
  }
  return out;
}

const PREFIX_RE = /^[A-Z][A-Z0-9]{1,7}$/;

export function validateSettings(next) {
  const errors = {};
  if (!next.businessName.trim()) errors.businessName = 'Business name is required.';
  if (!next.location.trim()) errors.location = 'Location is required.';
  if (!/^[0-9+\-\s]{6,20}$/.test(next.phone.trim())) errors.phone = 'Enter a valid phone number.';
  if (!/^[A-Z]{2,5}$/.test(next.currency.trim())) errors.currency = 'Use a currency code such as QAR.';
  if (!PREFIX_RE.test(next.invoicePrefix.trim()))
    errors.invoicePrefix = 'Use 2–8 capital letters or digits, starting with a letter.';
  if (!PREFIX_RE.test(next.customerPrefix.trim()))
    errors.customerPrefix = 'Use 2–8 capital letters or digits, starting with a letter.';
  if (!next.defaultOrderStatus.trim()) errors.defaultOrderStatus = 'Choose a default order status.';
  if (!Number.isFinite(next.defaultDeliveryCharge) || next.defaultDeliveryCharge < 0)
    errors.defaultDeliveryCharge = 'Enter 0 or more.';
  if (!next.courierNames.length) errors.courierNames = 'Add at least one courier or driver.';
  if (!Number.isInteger(next.defaultReorderLevel) || next.defaultReorderLevel < 0)
    errors.defaultReorderLevel = 'Enter a whole number of 0 or more.';
  if (!Number.isInteger(next.lowStockRule) || next.lowStockRule < 0)
    errors.lowStockRule = 'Enter a whole number of 0 or more.';
  if (!Number.isFinite(next.reorderMultiplier) || next.reorderMultiplier < 1)
    errors.reorderMultiplier = 'Enter 1 or more.';
  if (next.logoUrl.trim() && !/^https:\/\/[^\s]+$/i.test(next.logoUrl.trim()))
    errors.logoUrl = 'Use a full https:// image address, or leave it empty for the FEMNIA logo.';
  if (next.invoiceFooter.length > 200) errors.invoiceFooter = 'Keep the footer under 200 characters.';
  if (next.labelFooter.length > 200) errors.labelFooter = 'Keep the footer under 200 characters.';
  for (const key of ['categories', 'sizes', 'colours', 'paymentMethods', 'paymentHolders']) {
    if (!next[key].length) errors[key] = 'Add at least one entry.';
  }
  return errors;
}
