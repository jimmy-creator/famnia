import { Router } from 'express';
import { Category } from '../models/index.js';
import { protect, admin, requirePermission } from '../middleware/auth.js';

const router = Router();

// Get all active categories (public)
router.get('/', async (req, res) => {
  try {
    const categories = await Category.findAll({
      where: { active: true },
      order: [['sortOrder', 'ASC'], ['name', 'ASC']],
    });
    res.json(categories);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get all categories including inactive (admin)
router.get('/all', protect, admin, async (req, res) => {
  try {
    const categories = await Category.findAll({
      order: [['sortOrder', 'ASC'], ['name', 'ASC']],
    });
    res.json(categories);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create category
router.post('/', protect, admin, async (req, res) => {
  try {
    const { name, nameAr, image, sortOrder } = req.body;
    if (!name) return res.status(400).json({ message: 'Name is required' });

    const existing = await Category.findOne({ where: { name } });
    if (existing) return res.status(400).json({ message: 'Category already exists' });

    const category = await Category.create({
      name,
      nameAr: nameAr || null,
      image: image || null,
      sortOrder: sortOrder || 0,
    });
    res.status(201).json(category);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update category
router.put('/:id', protect, admin, async (req, res) => {
  try {
    const category = await Category.findByPk(req.params.id);
    if (!category) return res.status(404).json({ message: 'Category not found' });
    await category.update(req.body);
    res.json(category);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete category
router.delete('/:id', protect, admin, async (req, res) => {
  try {
    const category = await Category.findByPk(req.params.id);
    if (!category) return res.status(404).json({ message: 'Category not found' });
    await category.destroy();
    res.json({ message: 'Category deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
