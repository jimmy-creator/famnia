import { Router } from 'express';
import { User } from '../models/index.js';
import { protect, admin } from '../middleware/auth.js';
import { Op } from 'sequelize';
import bcrypt from 'bcryptjs';

const router = Router();

const AVAILABLE_PERMISSIONS = [
  { id: 'products', label: 'Products', desc: 'Create, edit, delete products' },
  { id: 'orders', label: 'Orders', desc: 'View and manage orders' },
  { id: 'coupons', label: 'Coupons', desc: 'Manage discount codes' },
  { id: 'reviews', label: 'Reviews', desc: 'Moderate reviews' },
  { id: 'customers', label: 'Customers', desc: 'View customer data' },
  { id: 'analytics', label: 'Analytics', desc: 'View dashboard and reports' },
  { id: 'categories', label: 'Categories', desc: 'Manage categories' },
  { id: 'settings', label: 'Settings', desc: 'Theme and store settings' },
];

// Get available permissions list
router.get('/permissions', protect, admin, (req, res) => {
  res.json(AVAILABLE_PERMISSIONS);
});

// List staff members; ?role=cashier to filter cashiers only.
router.get('/', protect, admin, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only admin can manage staff' });
    }
    const roles = req.query.role === 'cashier'
      ? ['cashier']
      : ['admin', 'staff'];
    const staff = await User.findAll({
      where: { role: { [Op.in]: roles } },
      attributes: ['id', 'name', 'email', 'phone', 'role', 'permissions', 'homeLocationId', 'isManager', 'createdAt'],
      order: [['role', 'ASC'], ['createdAt', 'DESC']],
    });
    res.json(staff);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create staff or cashier account. role='cashier' uses pin + homeLocationId.
router.post('/', protect, admin, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only admin can create staff' });
    }

    const { name, email, password, permissions, role, pin, homeLocationId, isManager } = req.body;
    const targetRole = role === 'cashier' ? 'cashier' : 'staff';

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }
    if (targetRole === 'cashier') {
      if (!pin || !/^\d{4,6}$/.test(String(pin))) {
        return res.status(400).json({ message: 'Cashier PIN must be 4–6 digits' });
      }
    }

    const existing = await User.findOne({ where: { email: email.toLowerCase().trim() } });
    if (existing) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    const userData = {
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password,
      role: targetRole,
    };
    if (targetRole === 'staff') userData.permissions = permissions || [];
    if (targetRole === 'cashier') {
      userData.pin = String(pin);
      if (homeLocationId) userData.homeLocationId = parseInt(homeLocationId, 10);
      userData.isManager = !!isManager;
    }

    const user = await User.create(userData);
    res.status(201).json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update staff permissions
router.put('/:id', protect, admin, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only admin can update staff' });
    }

    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Can't modify the main admin
    if (user.role === 'admin' && user.id !== req.user.id) {
      return res.status(403).json({ message: 'Cannot modify another admin' });
    }

    const { name, permissions, password, pin, homeLocationId, isManager } = req.body;
    const updates = {};
    if (name) updates.name = name.trim();
    if (permissions !== undefined && user.role !== 'cashier') updates.permissions = permissions;
    if (password && password.length >= 8) updates.password = password;
    if (user.role === 'cashier') {
      if (pin && /^\d{4,6}$/.test(String(pin))) updates.pin = String(pin);
      if (homeLocationId !== undefined) updates.homeLocationId = homeLocationId ? parseInt(homeLocationId, 10) : null;
      if (isManager !== undefined) updates.isManager = !!isManager;
    }

    await user.update(updates);
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete staff account
router.delete('/:id', protect, admin, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only admin can delete staff' });
    }

    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.role === 'admin') {
      return res.status(403).json({ message: 'Cannot delete admin account' });
    }

    if (user.role !== 'staff' && user.role !== 'cashier') {
      return res.status(400).json({ message: 'Can only delete staff or cashier accounts' });
    }

    await user.destroy();
    res.json({ message: 'Staff account deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
