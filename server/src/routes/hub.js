import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { User, logActivity } from '../models/index.js';
import { protect, generateToken } from '../middleware/auth.js';
import {
  HUB_ROLES, PERMISSION_GROUPS, PERMISSION_PRESETS, PRESET_NAMES, accessFor, passwordProblem,
} from '../hub/permissions.js';

/**
 * FEMNIA Hub (staff back office at /hub) — account and permission plumbing.
 * Feature endpoints live with their domain routes; this file only answers
 * "who is signed in and what may they do".
 */
const router = Router();

const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { message: 'Too many sign-up attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const hubOnly = (req, res, next) => {
  if (!HUB_ROLES.includes(req.user.role)) {
    return res.status(403).json({ message: 'Staff access only' });
  }
  next();
};

// "New staff member? Create an account". The account starts pending with no
// permissions, so it can sign in only to see "awaiting approval" until an
// admin approves it in Staff & Permissions.
router.post('/signup', signupLimiter, async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').toLowerCase().trim();
    const { password } = req.body;
    if (name.length < 2 || name.length > 100) {
      return res.status(400).json({ message: 'Enter your full name.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return res.status(400).json({ message: 'Enter a valid email address.' });
    }
    const problem = passwordProblem(password);
    if (problem) return res.status(400).json({ message: problem });
    if (await User.findOne({ where: { email } })) {
      // Same wording as the storefront register: no account enumeration.
      return res.status(400).json({ message: 'Could not create the account. Please check your details.' });
    }
    const user = await User.create({
      name, email, password, role: 'staff', status: 'pending', permissions: [],
    });
    logActivity({ userId: user.id, action: 'Staff signup', entityType: 'User', entityId: user.id, ip: req.ip });
    res.cookie('token', generateToken(user.id), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.status(201).json({ user });
  } catch (error) {
    console.error('Hub signup error:', error);
    res.status(500).json({ message: 'Could not create the account.' });
  }
});

// The hub's access summary. Reachable while the account is pending,
// suspended or holds a temporary password (see GATE_ALLOWED in auth.js), so
// the hub can explain why it won't open.
router.get('/access', protect, hubOnly, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(accessFor(req.user));
});

router.get('/permission-catalogue', protect, hubOnly, (req, res) => {
  res.json({ groups: PERMISSION_GROUPS, presets: PERMISSION_PRESETS, presetNames: PRESET_NAMES });
});

export default router;
