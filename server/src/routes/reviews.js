import { Router } from 'express';
import { Review, Product, Order, User } from '../models/index.js';
import { protect, admin, requirePermission, optionalAuth } from '../middleware/auth.js';
import { Op } from 'sequelize';
import sequelize from '../config/database.js';

const router = Router();

// Get reviews for a product (public)
router.get('/product/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    const { page = 1, limit = 10, sort = 'createdAt' } = req.query;

    const offset = (page - 1) * limit;
    const { count, rows } = await Review.findAndCountAll({
      where: { productId, approved: true },
      limit: parseInt(limit),
      offset,
      order: [[sort, 'DESC']],
    });

    // Rating breakdown
    const ratingCounts = await Review.findAll({
      where: { productId, approved: true },
      attributes: [
        'rating',
        [sequelize.fn('COUNT', sequelize.col('rating')), 'count'],
      ],
      group: ['rating'],
      raw: true,
    });

    const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    ratingCounts.forEach((r) => { breakdown[r.rating] = parseInt(r.count); });

    res.json({
      reviews: rows,
      total: count,
      totalPages: Math.ceil(count / limit),
      currentPage: parseInt(page),
      breakdown,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Submit a review (logged-in users)
router.post('/', protect, async (req, res) => {
  try {
    const { productId, rating, title, comment } = req.body;

    if (!productId || !rating || !comment) {
      return res.status(400).json({ message: 'Product, rating, and comment are required' });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'Rating must be between 1 and 5' });
    }

    // Check if user already reviewed this product
    const existing = await Review.findOne({
      where: { productId, userId: req.user.id },
    });
    if (existing) {
      return res.status(400).json({ message: 'You have already reviewed this product' });
    }

    // Check if user purchased this product (verified purchase)
    const purchased = await Order.findOne({
      where: {
        userId: req.user.id,
        orderStatus: { [Op.in]: ['confirmed', 'shipped', 'delivered'] },
      },
    });
    let verified = false;
    if (purchased) {
      const items = purchased.items || [];
      verified = items.some((item) => item.productId === parseInt(productId));
    }

    const review = await Review.create({
      productId,
      userId: req.user.id,
      name: req.user.name,
      email: req.user.email,
      rating,
      title: title || null,
      comment,
      verified,
      approved: true,
      adminCreated: false,
    });

    // Update product rating
    await updateProductRating(productId);

    res.status(201).json(review);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ===== Admin Routes =====

// Get all reviews (admin)
router.get('/all', protect, admin, async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    const { count, rows } = await Review.findAndCountAll({
      limit: parseInt(limit),
      offset,
      order: [['createdAt', 'DESC']],
      include: [{ model: Product, attributes: ['name', 'slug'] }],
    });

    res.json({
      reviews: rows,
      total: count,
      totalPages: Math.ceil(count / limit),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Admin create review (for seeding/marketing)
router.post('/admin', protect, admin, async (req, res) => {
  try {
    const { productId, name, rating, title, comment, verified } = req.body;

    if (!productId || !name || !rating || !comment) {
      return res.status(400).json({ message: 'Product, name, rating, and comment are required' });
    }

    const review = await Review.create({
      productId,
      userId: null,
      name,
      email: null,
      rating,
      title: title || null,
      comment,
      verified: verified || false,
      approved: true,
      adminCreated: true,
    });

    await updateProductRating(productId);

    res.status(201).json(review);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Toggle review approval
router.put('/:id/approve', protect, admin, async (req, res) => {
  try {
    const review = await Review.findByPk(req.params.id);
    if (!review) return res.status(404).json({ message: 'Review not found' });

    await review.update({ approved: !review.approved });
    await updateProductRating(review.productId);

    res.json(review);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete review
router.delete('/:id', protect, admin, async (req, res) => {
  try {
    const review = await Review.findByPk(req.params.id);
    if (!review) return res.status(404).json({ message: 'Review not found' });

    const productId = review.productId;
    await review.destroy();
    await updateProductRating(productId);

    res.json({ message: 'Review deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Helper: recalculate product rating
async function updateProductRating(productId) {
  const result = await Review.findAll({
    where: { productId, approved: true },
    attributes: [
      [sequelize.fn('AVG', sequelize.col('rating')), 'avgRating'],
      [sequelize.fn('COUNT', sequelize.col('id')), 'numReviews'],
    ],
    raw: true,
  });

  const avgRating = result[0]?.avgRating ? parseFloat(result[0].avgRating).toFixed(2) : 0;
  const numReviews = parseInt(result[0]?.numReviews) || 0;

  await Product.update(
    { ratings: avgRating, numReviews },
    { where: { id: productId } }
  );
}

export default router;
