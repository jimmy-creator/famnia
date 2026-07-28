import { Router } from 'express';
import { AbandonedCart, Order } from '../models/index.js';
import { protect, admin, optionalAuth } from '../middleware/auth.js';
import { sendAbandonedCartEmail } from '../services/emailService.js';
import { Op } from 'sequelize';

const router = Router();

// Save cart state (called from frontend when user has items + email)
router.post('/save', optionalAuth, async (req, res) => {
  try {
    const { email, items, cartTotal } = req.body;

    if (!email || !items || items.length === 0) {
      return res.status(400).json({ message: 'Email and items required' });
    }

    // Check if user already has a recent abandoned cart
    const existing = await AbandonedCart.findOne({
      where: {
        email: email.toLowerCase().trim(),
        recovered: false,
        createdAt: { [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    });

    if (existing) {
      // Update existing cart
      await existing.update({
        items,
        cartTotal,
        userId: req.user?.id || null,
      });
      return res.json({ message: 'Cart updated' });
    }

    await AbandonedCart.create({
      email: email.toLowerCase().trim(),
      userId: req.user?.id || null,
      items,
      cartTotal,
    });

    res.json({ message: 'Cart saved' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Mark cart as recovered (called when order is placed)
router.post('/recover', optionalAuth, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.json({ message: 'ok' });

    await AbandonedCart.update(
      { recovered: true, recoveredAt: new Date() },
      { where: { email: email.toLowerCase().trim(), recovered: false } }
    );

    res.json({ message: 'Cart recovered' });
  } catch (error) {
    res.json({ message: 'ok' });
  }
});

// Admin: View abandoned carts
router.get('/', protect, admin, async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const offset = (page - 1) * limit;

    const where = {};
    if (status === 'pending') { where.emailSent = false; where.recovered = false; }
    else if (status === 'sent') { where.emailSent = true; where.recovered = false; }
    else if (status === 'recovered') { where.recovered = true; }

    const { count, rows } = await AbandonedCart.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset,
      order: [['createdAt', 'DESC']],
    });

    // Stats
    const total = await AbandonedCart.count();
    const pending = await AbandonedCart.count({ where: { emailSent: false, recovered: false } });
    const sent = await AbandonedCart.count({ where: { emailSent: true, recovered: false } });
    const recovered = await AbandonedCart.count({ where: { recovered: true } });

    res.json({
      carts: rows,
      total: count,
      totalPages: Math.ceil(count / limit),
      stats: { total, pending, sent, recovered },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Admin: Manually send recovery email
router.post('/:id/send', protect, admin, async (req, res) => {
  try {
    const cart = await AbandonedCart.findByPk(req.params.id);
    if (!cart) return res.status(404).json({ message: 'Cart not found' });

    if (cart.recovered) {
      return res.status(400).json({ message: 'Cart already recovered' });
    }

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const recoveryUrl = `${clientUrl}/cart`;

    await sendAbandonedCartEmail(cart.email, cart.items, cart.cartTotal, recoveryUrl);
    await cart.update({ emailSent: true, emailSentAt: new Date() });

    res.json({ message: 'Recovery email sent' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Admin: Delete abandoned cart
router.delete('/:id', protect, admin, async (req, res) => {
  try {
    const cart = await AbandonedCart.findByPk(req.params.id);
    if (!cart) return res.status(404).json({ message: 'Cart not found' });
    await cart.destroy();
    res.json({ message: 'Deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
