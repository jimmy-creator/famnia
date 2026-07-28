import { Router } from 'express';
import { Pincode } from '../models/index.js';
import { protect, admin } from '../middleware/auth.js';
import { Op } from 'sequelize';

const router = Router();

// Check delivery availability (public)
router.get('/check/:pincode', async (req, res) => {
  try {
    const { pincode } = req.params;

    if (!pincode || pincode.length < 4) {
      return res.status(400).json({ message: 'Valid pincode is required' });
    }

    // Check if pincode exists in our database
    const entry = await Pincode.findOne({
      where: { pincode, active: true },
    });

    if (entry) {
      return res.json({
        available: true,
        pincode: entry.pincode,
        city: entry.city,
        state: entry.state,
        deliveryDays: entry.deliveryDays,
        codAvailable: entry.codAvailable,
        message: `Delivery available in ${entry.deliveryDays} days`,
      });
    }

    // If no specific pincodes are configured, allow all (default open)
    const totalPincodes = await Pincode.count();
    if (totalPincodes === 0) {
      return res.json({
        available: true,
        pincode,
        deliveryDays: 7,
        codAvailable: true,
        message: 'Delivery available in 5-7 days',
      });
    }

    // Pincode not in list
    res.json({
      available: false,
      pincode,
      message: 'Sorry, delivery is not available to this pincode',
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Admin: List all pincodes
router.get('/', protect, admin, async (req, res) => {
  try {
    const { search, page = 1, limit = 50 } = req.query;
    const where = {};
    if (search) {
      where[Op.or] = [
        { pincode: { [Op.like]: `%${search}%` } },
        { city: { [Op.like]: `%${search}%` } },
        { state: { [Op.like]: `%${search}%` } },
      ];
    }

    const offset = (page - 1) * limit;
    const { count, rows } = await Pincode.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset,
      order: [['pincode', 'ASC']],
    });

    res.json({
      pincodes: rows,
      total: count,
      totalPages: Math.ceil(count / limit),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Admin: Add pincode
router.post('/', protect, admin, async (req, res) => {
  try {
    const { pincode, city, state, deliveryDays, codAvailable } = req.body;
    if (!pincode) return res.status(400).json({ message: 'Pincode is required' });

    const existing = await Pincode.findOne({ where: { pincode } });
    if (existing) return res.status(400).json({ message: 'Pincode already exists' });

    const entry = await Pincode.create({
      pincode, city, state,
      deliveryDays: deliveryDays || 7,
      codAvailable: codAvailable !== false,
    });
    res.status(201).json(entry);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Admin: Bulk add pincodes
router.post('/bulk', protect, admin, async (req, res) => {
  try {
    const { pincodes } = req.body; // Array of pincode strings or objects
    if (!pincodes || !Array.isArray(pincodes)) {
      return res.status(400).json({ message: 'Array of pincodes is required' });
    }

    let created = 0;
    let skipped = 0;

    for (const item of pincodes) {
      const pin = typeof item === 'string' ? item.trim() : item.pincode?.trim();
      if (!pin) { skipped++; continue; }

      const existing = await Pincode.findOne({ where: { pincode: pin } });
      if (existing) { skipped++; continue; }

      await Pincode.create({
        pincode: pin,
        city: typeof item === 'object' ? item.city : null,
        state: typeof item === 'object' ? item.state : null,
        deliveryDays: typeof item === 'object' ? (item.deliveryDays || 7) : 7,
        codAvailable: true,
      });
      created++;
    }

    res.json({ message: `${created} pincodes added, ${skipped} skipped`, created, skipped });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Admin: Update pincode
router.put('/:id', protect, admin, async (req, res) => {
  try {
    const entry = await Pincode.findByPk(req.params.id);
    if (!entry) return res.status(404).json({ message: 'Pincode not found' });
    await entry.update(req.body);
    res.json(entry);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Admin: Delete pincode
router.delete('/:id', protect, admin, async (req, res) => {
  try {
    const entry = await Pincode.findByPk(req.params.id);
    if (!entry) return res.status(404).json({ message: 'Pincode not found' });
    await entry.destroy();
    res.json({ message: 'Pincode deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
