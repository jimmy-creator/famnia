import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { OAuth2Client } from 'google-auth-library';
import { User } from '../models/index.js';
import { generateToken } from '../middleware/auth.js';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: 'Too many attempts. Try again later.' },
});

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

router.post('/google', authLimiter, async (req, res) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({ message: 'Google credential is required' });
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      return res.status(500).json({ message: 'Google login is not configured' });
    }

    // Verify the Google token
    const client = new OAuth2Client(clientId);
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: clientId,
    });

    const payload = ticket.getPayload();
    const { email, name, picture, sub: googleId, email_verified } = payload;

    if (!email) {
      return res.status(400).json({ message: 'Email not found in Google account' });
    }

    if (!email_verified) {
      return res.status(400).json({ message: 'Google email not verified' });
    }

    // Find or create user
    let user = await User.findOne({ where: { email: email.toLowerCase() } });

    if (user) {
      // Existing user — log them in
      const token = generateToken(user.id);
      res.cookie('token', token, cookieOptions);
      return res.json({ user });
    }

    // New user — create account
    // Generate a random password (user won't need it since they login with Google)
    const randomPassword = Math.random().toString(36).slice(-12) + 'A1!';

    user = await User.create({
      name: name || email.split('@')[0],
      email: email.toLowerCase(),
      password: randomPassword,
      role: 'customer',
    });

    const token = generateToken(user.id);
    res.cookie('token', token, cookieOptions);

    res.status(201).json({ user });
  } catch (error) {
    console.error('Google auth error:', error.message);
    res.status(401).json({ message: 'Google authentication failed' });
  }
});

export default router;
