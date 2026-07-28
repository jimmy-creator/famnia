/**
 * Shiprocket Shipping API authentication.
 *
 * Different from Checkout (utils/shiprocketAuth.js) — Shipping uses a
 * Bearer token from email/password login, not HMAC. Token is valid for
 * roughly 24 hours.
 *
 * Singleton: token cached in memory until expiry, refreshed on demand.
 * On 401 from any downstream call, force a fresh login and retry once.
 *
 * Required env:
 *   SHIPROCKET_SHIP_EMAIL     — API user email (NOT main login)
 *   SHIPROCKET_SHIP_PASSWORD  — API user password (sent to main login mailbox)
 *   SHIPROCKET_SHIP_BASE      — defaults to https://apiv2.shiprocket.in/v1/external
 */
const BASE = (process.env.SHIPROCKET_SHIP_BASE || 'https://apiv2.shiprocket.in/v1/external').replace(/\/$/, '');
const EMAIL = process.env.SHIPROCKET_SHIP_EMAIL || '';
const PASSWORD = process.env.SHIPROCKET_SHIP_PASSWORD || '';

let cachedToken = null;
let cachedExpiry = 0;
const SAFETY_WINDOW_MS = 60 * 60 * 1000; // refresh 1h before expiry to be safe

export const SHIPROCKET_SHIP_BASE = BASE;
export const SHIPROCKET_SHIP_ENABLED = !!(EMAIL && PASSWORD);

async function login() {
  if (!SHIPROCKET_SHIP_ENABLED) {
    throw new Error('SHIPROCKET_SHIP_EMAIL / SHIPROCKET_SHIP_PASSWORD not set');
  }
  const resp = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const text = await resp.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { _raw: text }; }
  if (!resp.ok || !data.token) {
    throw new Error(`SR login failed (${resp.status}): ${data.message || text.slice(0, 200)}`);
  }
  cachedToken = data.token;
  // SR doesn't reliably return expires_in. Treat as 23h to stay safe.
  cachedExpiry = Date.now() + (23 * 60 * 60 * 1000);
  console.log('[shipAuth] obtained new token, valid until', new Date(cachedExpiry).toISOString());
  return cachedToken;
}

export async function getToken({ force = false } = {}) {
  if (!force && cachedToken && Date.now() < cachedExpiry - SAFETY_WINDOW_MS) {
    return cachedToken;
  }
  return login();
}

export function clearToken() {
  cachedToken = null;
  cachedExpiry = 0;
}

/**
 * Authenticated fetch helper. Auto-refreshes token on 401 and retries once.
 * Returns the parsed JSON body and the response status.
 */
export async function srFetch(path, init = {}) {
  if (!SHIPROCKET_SHIP_ENABLED) {
    throw new Error('Shiprocket Shipping disabled (no credentials)');
  }
  const url = path.startsWith('http') ? path : `${BASE}${path.startsWith('/') ? '' : '/'}${path}`;

  const send = async () => {
    const token = await getToken();
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    };
    const resp = await fetch(url, { ...init, headers });
    const text = await resp.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { _raw: text }; }
    return { resp, data };
  };

  let { resp, data } = await send();
  if (resp.status === 401) {
    // Token may have expired earlier than we thought — force refresh + retry once.
    console.warn('[shipAuth] 401 from SR, forcing token refresh');
    clearToken();
    ({ resp, data } = await send());
  }
  return { ok: resp.ok, status: resp.status, data };
}
