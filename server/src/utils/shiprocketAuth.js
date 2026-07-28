import crypto from 'crypto';

const SECRET = process.env.SHIPROCKET_SECRET || '';
const API_KEY = process.env.SHIPROCKET_API_KEY || '';

/** Base64 HMAC-SHA256 of a string using the Shiprocket secret. */
export function hmacBase64(payload) {
  return crypto
    .createHmac('sha256', SECRET)
    .update(payload, 'utf8')
    .digest('base64');
}

/** Signed headers for outbound calls TO Shiprocket.
 * The docs are inconsistent on whether X-Api-Key wants "Bearer <key>" or
 * just "<key>". The working curl example uses just the raw key, so we
 * default to that. Set SHIPROCKET_API_KEY_PREFIX="Bearer " in env to add
 * the prefix if SR support tells you to. */
const PREFIX = process.env.SHIPROCKET_API_KEY_PREFIX || '';

export function signedHeaders(jsonBody) {
  return {
    'Content-Type': 'application/json',
    'X-Api-Key': `${PREFIX}${API_KEY}`,
    'X-Api-HMAC-SHA256': hmacBase64(jsonBody),
  };
}

/** Constant-time compare for an HMAC header we'd verify (currently unused —
 * Shiprocket's inbound order webhook is not signed by them. We verify via a
 * shared token URL param instead. Kept here for future use if they add
 * signing or for our own outbound webhook receipts.) */
export function safeCompare(a, b) {
  if (!a || !b) return false;
  const A = Buffer.from(a);
  const B = Buffer.from(b);
  if (A.length !== B.length) return false;
  return crypto.timingSafeEqual(A, B);
}

export const SHIPROCKET_BASE = (process.env.SHIPROCKET_BASE || 'https://checkout-api.shiprocket.com').replace(/\/$/, '');
export const SHIPROCKET_API_KEY = API_KEY;
export const SHIPROCKET_SECRET = SECRET;
