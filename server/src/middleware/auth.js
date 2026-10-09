import jwt from 'jsonwebtoken';
import { User } from '../models/index.js';
import { HUB_ROLES, LEGACY_KEYS, hasPermission } from '../hub/permissions.js';

// Endpoints a hub account may still call while it is not active or still
// holds a temporary password — just enough for the hub's gate screens to
// explain the state and let the user fix it or sign out.
const GATE_ALLOWED = new Set([
  '/api/auth/profile',
  '/api/auth/forced-password',
  '/api/hub/access',
]);

/** True when the token predates the user's last password change. */
function tokenRevoked(user, decoded) {
  if (!user.passwordChangedAt || !decoded.iat) return false;
  // JWT iat is whole seconds; allow the same second the change was made in.
  return decoded.iat * 1000 < new Date(user.passwordChangedAt).getTime() - 1000;
}

export const protect = async (req, res, next) => {
  try {
    let token = req.cookies?.token; // Cookie-only — no Bearer token fallback

    if (!token) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findByPk(decoded.id);

    if (!req.user) {
      return res.status(401).json({ message: 'User not found' });
    }
    if (tokenRevoked(req.user, decoded)) {
      return res.status(401).json({ message: 'Your session has expired. Please sign in again.' });
    }

    if (HUB_ROLES.includes(req.user.role)) {
      const path = req.originalUrl.split('?')[0];
      // The profile is readable at the gate (to explain the state), not editable.
      const gateOk = GATE_ALLOWED.has(path) && (path !== '/api/auth/profile' || req.method === 'GET');
      if (!gateOk) {
        if (req.user.status && req.user.status !== 'active') {
          return res.status(403).json({ message: 'Your account is not active.', code: 'ACCOUNT_INACTIVE' });
        }
        if (req.user.mustChangePassword) {
          return res.status(403).json({ message: 'Choose your own password to continue.', code: 'PASSWORD_CHANGE_REQUIRED' });
        }
      }
    }

    next();
  } catch (error) {
    res.status(401).json({ message: 'Not authorized' });
  }
};

export const admin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else if (req.user && req.user.role === 'staff') {
    // Staff need at least one classic-admin permission. Hub-only staff
    // (keys like "orders.create") are not let into the old admin endpoints
    // this guards — storefront settings, coupons, order status.
    const perms = req.user.permissions || [];
    if (perms.length && LEGACY_KEYS.some((k) => hasPermission(req.user, k))) {
      next();
    } else {
      res.status(403).json({ message: 'No permissions assigned' });
    }
  } else {
    res.status(403).json({ message: 'Admin access required' });
  }
};

// Check specific permission for staff users. Accepts legacy keys
// ('products', …) and hub keys ('orders.create', …); a hub key also satisfies
// the legacy key that covers it (see hub/permissions.js).
export const requirePermission = (...perms) => {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Not authorized' });
    if (req.user.role === 'admin') return next(); // Admin has all permissions
    if (req.user.role === 'staff' || req.user.role === 'delivery') {
      if (perms.some((p) => hasPermission(req.user, p))) return next();
    }
    res.status(403).json({ message: 'You do not have permission for this action' });
  };
};

// Sets req.user if token exists, but doesn't block if missing
export const optionalAuth = async (req, res, next) => {
  try {
    let token = req.cookies?.token; // Cookie-only — no Bearer token fallback
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findByPk(decoded.id);
      req.user = user && !tokenRevoked(user, decoded) ? user : null;
    }
  } catch (error) {
    // Token invalid — continue as guest
    req.user = null;
  }
  next();
};

export const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE,
  });
};

/**
 * Guard for POS endpoints. The cashier login flow signs a JWT with
 * { id, role: 'cashier', sessionId, locationId } and stores it in the
 * same `token` cookie. We verify the cookie, confirm the user still
 * exists with role='cashier', and attach `req.cashierSessionId` /
 * `req.cashierLocationId` for the route to use.
 */
export const protectCashier = async (req, res, next) => {
  try {
    const token = req.cookies?.token;
    if (!token) return res.status(401).json({ message: 'Not authenticated as cashier' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'cashier' || !decoded.sessionId) {
      return res.status(401).json({ message: 'Not a cashier session' });
    }

    const user = await User.findByPk(decoded.id);
    if (!user || user.role !== 'cashier') {
      return res.status(401).json({ message: 'Cashier account not found' });
    }
    req.user = user;
    req.cashierSessionId = decoded.sessionId;
    req.cashierLocationId = decoded.locationId;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Invalid cashier session' });
  }
};
