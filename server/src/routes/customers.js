import { Router } from 'express';
import { User, Order } from '../models/index.js';
import { protect, admin, requirePermission } from '../middleware/auth.js';
import sequelize from '../config/database.js';
import { Op } from 'sequelize';

const router = Router();

// Get all registered customers
router.get('/', protect, admin, async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const offset = (page - 1) * limit;

    const where = { role: 'customer' };
    if (search) {
      where[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } },
        { phone: { [Op.like]: `%${search}%` } },
      ];
    }

    const { count, rows } = await User.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset,
      order: [['createdAt', 'DESC']],
      attributes: ['id', 'name', 'email', 'phone', 'address', 'createdAt'],
    });

    // Get order counts and totals for each customer
    const customerIds = rows.map((u) => u.id);
    const orderStats = await Order.findAll({
      where: { userId: { [Op.in]: customerIds } },
      attributes: [
        'userId',
        [sequelize.fn('COUNT', sequelize.col('id')), 'orderCount'],
        [sequelize.fn('SUM', sequelize.col('totalAmount')), 'totalSpent'],
      ],
      group: ['userId'],
      raw: true,
    });

    const statsMap = {};
    orderStats.forEach((s) => {
      statsMap[s.userId] = {
        orderCount: parseInt(s.orderCount),
        totalSpent: parseFloat(s.totalSpent) || 0,
      };
    });

    const customers = rows.map((u) => ({
      ...u.toJSON(),
      orderCount: statsMap[u.id]?.orderCount || 0,
      totalSpent: statsMap[u.id]?.totalSpent || 0,
    }));

    res.json({
      customers,
      total: count,
      totalPages: Math.ceil(count / limit),
      currentPage: parseInt(page),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get guest customers (unique emails from orders with no userId)
router.get('/guests', protect, admin, async (req, res) => {
  try {
    const guestOrders = await Order.findAll({
      where: { userId: null, guestEmail: { [Op.not]: null } },
      attributes: [
        'guestEmail',
        [sequelize.fn('COUNT', sequelize.col('id')), 'orderCount'],
        [sequelize.fn('SUM', sequelize.col('totalAmount')), 'totalSpent'],
        [sequelize.fn('MAX', sequelize.col('createdAt')), 'lastOrder'],
      ],
      group: ['guestEmail'],
      order: [[sequelize.fn('MAX', sequelize.col('createdAt')), 'DESC']],
      raw: true,
    });

    // Get shipping details from latest order for each guest
    const guests = [];
    for (const g of guestOrders) {
      const latestOrder = await Order.findOne({
        where: { guestEmail: g.guestEmail, userId: null },
        order: [['createdAt', 'DESC']],
        attributes: ['shippingAddress'],
      });

      guests.push({
        email: g.guestEmail,
        name: latestOrder?.shippingAddress?.fullName || '-',
        phone: latestOrder?.shippingAddress?.phone || '-',
        address: latestOrder?.shippingAddress
          ? `${latestOrder.shippingAddress.address || ''}, ${latestOrder.shippingAddress.city || ''}`
          : '-',
        orderCount: parseInt(g.orderCount),
        totalSpent: parseFloat(g.totalSpent) || 0,
        lastOrder: g.lastOrder,
      });
    }

    res.json(guests);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get a customer's order history
router.get('/:id/orders', protect, admin, async (req, res) => {
  try {
    const orders = await Order.findAll({
      where: { userId: req.params.id },
      order: [['createdAt', 'DESC']],
    });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get a guest's order history
router.get('/guest-orders', protect, admin, async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ message: 'Email required' });

    const orders = await Order.findAll({
      where: { guestEmail: email.toLowerCase().trim(), userId: null },
      order: [['createdAt', 'DESC']],
    });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
