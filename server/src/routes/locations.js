/**
 * Location CRUD for the multi-location inventory system.
 *
 *   GET    /api/locations                   list all
 *   POST   /api/locations                   create
 *   PATCH  /api/locations/:id               update
 *   DELETE /api/locations/:id               soft-block if it has stock or orders
 *   POST   /api/locations/:id/set-online-default   mark this one as the
 *                                                  online-fulfilment default
 */
import { Router } from 'express';
import { Op } from 'sequelize';
import { Location, ProductStock, Order } from '../models/index.js';
import { protect, requirePermission } from '../middleware/auth.js';

const router = Router();

// Every ERP screen uses the location list as a filter, so any staff area
// may read it; changing locations needs the products (inventory) permission.
router.get('/', protect, requirePermission('products', 'analytics', 'orders'), async (req, res) => {
  try {
    const rows = await Location.findAll({ order: [['sortOrder', 'ASC'], ['id', 'ASC']] });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', protect, requirePermission('products'), async (req, res) => {
  try {
    const { name, code, type, address, phone, isOnlineDefault, sortOrder } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: 'Name is required' });

    // If the new location wants to be the online default, unset any prior default.
    if (isOnlineDefault) {
      await Location.update({ isOnlineDefault: false }, { where: { isOnlineDefault: true } });
    }
    const loc = await Location.create({
      name: name.trim(),
      code: code?.trim() || null,
      type: type || 'store',
      address: address?.trim() || null,
      phone: phone?.trim() || null,
      isOnlineDefault: !!isOnlineDefault,
      sortOrder: parseInt(sortOrder, 10) || 0,
    });
    res.status(201).json(loc);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.patch('/:id', protect, requirePermission('products'), async (req, res) => {
  try {
    const loc = await Location.findByPk(req.params.id);
    if (!loc) return res.status(404).json({ message: 'Location not found' });
    const fields = ['name', 'code', 'type', 'address', 'phone', 'active', 'sortOrder'];
    const updates = {};
    for (const f of fields) if (req.body[f] !== undefined) updates[f] = req.body[f];
    if (req.body.isOnlineDefault) {
      await Location.update({ isOnlineDefault: false }, { where: { isOnlineDefault: true } });
      updates.isOnlineDefault = true;
    }
    await loc.update(updates);
    res.json(loc);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/:id', protect, requirePermission('products'), async (req, res) => {
  try {
    const loc = await Location.findByPk(req.params.id);
    if (!loc) return res.status(404).json({ message: 'Location not found' });

    const stockCount = await ProductStock.count({ where: { locationId: loc.id, quantity: { [Op.gt]: 0 } } });
    if (stockCount > 0) {
      return res.status(400).json({ message: `Can't delete — ${stockCount} stock row(s) still hold inventory. Transfer them out first or zero them.` });
    }
    const orderCount = await Order.count({ where: { locationId: loc.id } });
    if (orderCount > 0) {
      return res.status(400).json({ message: `Can't delete — ${orderCount} order(s) reference this location. Mark inactive instead.` });
    }
    await loc.destroy();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/:id/set-online-default', protect, requirePermission('products'), async (req, res) => {
  try {
    const loc = await Location.findByPk(req.params.id);
    if (!loc) return res.status(404).json({ message: 'Location not found' });
    await Location.update({ isOnlineDefault: false }, { where: { isOnlineDefault: true } });
    await loc.update({ isOnlineDefault: true });
    res.json(loc);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
