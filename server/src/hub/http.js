import { logActivity } from '../models/index.js';
import { HUB_ROLES, hasPermission } from './permissions.js';

/** Shared request plumbing for the hub's route files. */

export const can = (req, key) => hasPermission(req.user, key);

/** Hub roles only, holding at least one of `keys`. */
export const need = (...keys) => (req, res, next) => {
  if (!HUB_ROLES.includes(req.user.role)) return res.status(403).json({ message: 'Staff access only' });
  if (keys.some((k) => can(req, k))) return next();
  return res.status(403).json({ message: 'You do not have permission to perform this action.' });
};

export const bad = (message, status = 400) => Object.assign(new Error(message), { status });

/** Turns thrown errors into JSON: `err.status` errors keep their message, others are logged. */
export const wrap = (label, fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ message: 'This was already recorded — no duplicate was created.' });
    }
    const status = err.status || 500;
    if (status === 500) console.error(`[${label}]`, req.method, req.originalUrl, err);
    return res.status(status).json({ message: status === 500 ? 'Something went wrong. Please try again.' : err.message });
  }
};

/** Activity log entry in the hub's shape (module + record + description). */
export function hubLog(req, action, module, recordId = null, description = null) {
  return logActivity({
    userId: req.user.id,
    action,
    entityType: module,
    details: { recordId, description: description ? String(description).slice(0, 500) : null },
    ip: req.ip,
  });
}
