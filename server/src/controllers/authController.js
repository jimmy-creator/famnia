import crypto from 'crypto';
import { User, logActivity } from '../models/index.js';
import { generateToken } from '../middleware/auth.js';
import { HUB_ROLES, passwordProblem } from '../hub/permissions.js';
import { sendPasswordResetEmail } from '../services/emailService.js';

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

export const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Input validation
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }

    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
      return res.status(400).json({ message: 'Password must contain uppercase, lowercase, and a number' });
    }

    if (name.length > 100 || email.length > 254) {
      return res.status(400).json({ message: 'Input too long' });
    }

    const existingUser = await User.findOne({ where: { email: email.toLowerCase().trim() } });
    if (existingUser) {
      return res.status(400).json({ message: 'Registration failed. Please check your input.' });
    }

    // Force role to 'customer' — never trust client input for role
    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password,
      role: 'customer',
    });

    const token = generateToken(user.id);
    res.cookie('token', token, cookieOptions);

    res.status(201).json({ user });
  } catch (error) {
    res.status(500).json({ message: 'Registration failed' });
  }
};

export const login = async (req, res) => {
  try {
    // `email` stays the field name for the storefront form; hub staff may
    // type their username there instead.
    const identifier = String(req.body.email || '').toLowerCase().trim();
    const { password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const where = identifier.includes('@') ? { email: identifier } : { username: identifier };
    const user = await User.findOne({ where });
    if (!user || !user.password || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const token = generateToken(user.id);
    // Hub "Remember me on this device" unticked → a browser-session cookie.
    const { maxAge, ...sessionOnly } = cookieOptions;
    const remember = req.body.remember !== false;
    res.cookie('token', token, remember ? cookieOptions : sessionOnly);
    // Remembered so a later password change re-issues the same kind of cookie.
    res.cookie('remember', remember ? '1' : '0', remember ? cookieOptions : sessionOnly);

    // Sign-ins are recorded for working accounts; a pending or switched-off
    // account only reaches its gate screen.
    if (HUB_ROLES.includes(user.role) && (user.status || 'active') === 'active') {
      await user.update({ lastLoginAt: new Date() });
      logActivity({ userId: user.id, action: 'Login', entityType: 'Auth', ip: req.ip });
    }

    res.json({ user });
  } catch (error) {
    res.status(500).json({ message: 'Login failed' });
  }
};

export const logout = (req, res) => {
  res.cookie('token', '', { httpOnly: true, expires: new Date(0) });
  res.cookie('remember', '', { httpOnly: true, expires: new Date(0) });
  res.json({ message: 'Logged out' });
};

export const getProfile = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(req.user);
};

export const updateProfile = async (req, res) => {
  try {
    const { name, phone, address } = req.body;
    const patch = {};
    if (name !== undefined) {
      const n = String(name ?? '').trim();
      if (n.length < 2 || n.length > 100) return res.status(400).json({ message: 'Enter your full name.' });
      patch.name = n;
    }
    if (phone !== undefined) {
      const p = String(phone ?? '').trim();
      if (p && !/^[0-9+\-\s()]{6,24}$/.test(p)) return res.status(400).json({ message: 'Enter a valid phone number.' });
      patch.phone = p || null;
    }
    if (address !== undefined) patch.address = address;
    await req.user.update(patch);
    res.json(req.user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });

    const user = await User.findOne({ where: { email: email.toLowerCase().trim() } });

    // Always return success to prevent email enumeration
    if (!user) {
      return res.json({ message: 'If an account exists, a reset link has been sent' });
    }

    // Generate token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await user.update({ resetToken, resetTokenExpiry });

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    // Staff reset links land on the hub's own reset page.
    const resetPath = HUB_ROLES.includes(user.role) ? '/hub/reset-password' : '/reset-password';
    const resetUrl = `${clientUrl}${resetPath}?token=${resetToken}&email=${encodeURIComponent(user.email)}`;

    await sendPasswordResetEmail(user.email, resetUrl);

    res.json({ message: 'If an account exists, a reset link has been sent' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: 'Something went wrong' });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { email, token, password } = req.body;

    if (!email || !token || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const user = await User.findOne({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user || user.resetToken !== token) {
      return res.status(400).json({ message: 'Invalid or expired reset link' });
    }

    if (new Date() > new Date(user.resetTokenExpiry)) {
      return res.status(400).json({ message: 'Reset link has expired. Please request a new one' });
    }

    // Hub staff follow the hub rule (letter + digit); customers keep the
    // storefront rule (upper + lower + digit).
    if (HUB_ROLES.includes(user.role)) {
      const problem = passwordProblem(password);
      if (problem) return res.status(400).json({ message: problem });
    } else {
      if (password.length < 8) {
        return res.status(400).json({ message: 'Password must be at least 8 characters' });
      }
      if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
        return res.status(400).json({ message: 'Password must contain uppercase, lowercase, and a number' });
      }
    }

    await user.update({
      password,
      resetToken: null,
      resetTokenExpiry: null,
      mustChangePassword: false,
      passwordChangedAt: new Date(),
    });

    res.json({ message: 'Password reset successful. You can now login.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Something went wrong' });
  }
};

// Re-issue this device's cookie after a password change. Older tokens fail
// the passwordChangedAt check in `protect`, which signs out other devices.
async function setNewPassword(req, res, user, password) {
  await user.update({ password, mustChangePassword: false, passwordChangedAt: new Date() });
  const { maxAge, ...sessionOnly } = cookieOptions;
  res.cookie('token', generateToken(user.id), req.cookies?.remember === '0' ? sessionOnly : cookieOptions);
  logActivity({ userId: user.id, action: 'Password changed', entityType: 'Auth', ip: req.ip });
}

// Hub "My Profile → Change password".
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'All fields are required' });
    }
    if (!req.user.password || !(await req.user.comparePassword(currentPassword))) {
      return res.status(400).json({ message: 'Your current password is incorrect.' });
    }
    const problem = passwordProblem(newPassword);
    if (problem) return res.status(400).json({ message: problem });
    if (await req.user.comparePassword(newPassword)) {
      return res.status(400).json({ message: 'Your new password must be different from the current one.' });
    }
    await setNewPassword(req, res, req.user, newPassword);
    res.json({ message: 'Password changed' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ message: 'Something went wrong' });
  }
};

// Hub forced change after signing in with an admin-issued temporary password.
export const forcedPassword = async (req, res) => {
  try {
    if (!req.user.mustChangePassword) {
      return res.status(400).json({ message: 'No password change is pending.' });
    }
    const { password } = req.body;
    const problem = passwordProblem(password);
    if (problem) return res.status(400).json({ message: problem });
    if (await req.user.comparePassword(password)) {
      return res.status(400).json({ message: 'Choose a password different from the temporary one.' });
    }
    await setNewPassword(req, res, req.user, password);
    res.json({ message: 'Password saved' });
  } catch (error) {
    console.error('Forced password error:', error);
    res.status(500).json({ message: 'Something went wrong' });
  }
};
