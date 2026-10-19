// Online orders need a WhatsApp-reachable number: staff send every status
// update to it. The first number is a Qatar mobile (+974 + 8 digits); a
// second one is optional and may be from any country.
const digits = (v) => String(v ?? '').replace(/\D/g, '');

/** An error message for the order's contact numbers, or null when they are fine. */
export function contactPhoneError(address) {
  const main = digits(address?.phone);
  const local = main.startsWith('974') ? main.slice(3) : main;
  if (local.length !== 8) return 'Enter a valid Qatar mobile number (8 digits after +974).';
  const alt = digits(address?.altPhone);
  if (alt && (alt.length < 7 || alt.length > 15)) return 'The second mobile number is not valid — include the country code.';
  return null;
}
