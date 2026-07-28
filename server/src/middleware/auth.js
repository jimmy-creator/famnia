import jwt from 'jsonwebtoken';
import { User } from '../models/index.js';

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

    next();
  } catch (error) {
    res.status(401).json({ message: 'Not authorized' });
  }
};

export const admin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else if (req.user && req.user.role === 'staff') {
    // Staff must have at least one permission
    const perms = req.user.permissions || [];
    if (perms.length > 0) {
      next();
    } else {
      res.status(403).json({ message: 'No permissions assigned' });
    }
  } else {
    res.status(403).json({ message: 'Admin access required' });
  }
};

// Check specific permission for staff users
export const requirePermission = (...perms) => {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Not authorized' });
    if (req.user.role === 'admin') return next(); // Admin has all permissions
    if (req.user.role === 'staff') {
      const userPerms = req.user.permissions || [];
      const hasPermission = perms.some((p) => userPerms.includes(p));
      if (hasPermission) return next();
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
      req.user = await User.findByPk(decoded.id);
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
