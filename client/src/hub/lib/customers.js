/** Digits only, without the Qatar country code or leading zeros (mirrors the server). */
export function normalizePhone(phone) {
  let digits = (phone ?? '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length > 8 && digits.startsWith('974')) digits = digits.slice(3);
  return digits.replace(/^0+/, '');
}

export function samePhone(a, b) {
  const x = normalizePhone(a);
  return Boolean(x) && x === normalizePhone(b);
}

/** Search by name, customer code, area or mobile (primary or alternate), normalized. */
export function filterCustomers(list, query) {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  const digits = normalizePhone(q);
  return list.filter((c) => {
    if (c.name.toLowerCase().includes(q) || (c.code ?? '').toLowerCase().includes(q)) return true;
    if ((c.area ?? '').toLowerCase().includes(q)) return true;
    if (!digits) return false;
    return normalizePhone(c.phone).includes(digits) || normalizePhone(c.altPhone).includes(digits);
  });
}
