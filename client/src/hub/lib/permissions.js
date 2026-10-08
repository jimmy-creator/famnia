/**
 * Mirror of the server's permission check (server/src/hub/permissions.js).
 * Hides buttons the user can't use — never the only guard; the API enforces.
 */
export function can(access, key) {
  if (!access || access.status !== 'active') return false;
  return access.isAdmin || access.permissions.includes(key);
}
