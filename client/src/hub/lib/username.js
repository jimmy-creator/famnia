/** Staff username rules, mirrored from server/src/routes/hubAdmin.js. */
export const USERNAME_RULE = /^[a-z0-9](?:[a-z0-9._-]{1,30}[a-z0-9])$/;

export function normalizeUsername(value) {
  return value.trim().toLowerCase();
}

export function usernameProblem(value) {
  const name = normalizeUsername(value);
  if (name.length < 3) return 'Use at least 3 characters.';
  if (name.length > 32) return 'Use 32 characters or fewer.';
  if (!USERNAME_RULE.test(name)) return 'Use letters, numbers, dots, dashes or underscores only.';
  return null;
}

const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** Generates a readable temporary password (shown once, never stored by us). */
export function generateTemporaryPassword(length = 12) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const byte of bytes) out += PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length];
  // Guarantee a letter and a digit so it satisfies the shared strength rule.
  return `${LETTERS[bytes[1] % LETTERS.length]}${out.slice(1, length - 1)}${(bytes[0] % 10).toString()}`;
}
