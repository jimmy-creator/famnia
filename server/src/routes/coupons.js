import { Router } from 'express';
import { Coupon, Order } from '../models/index.js';
import { protect, admin, requirePermission, optionalAuth } from '../middleware/auth.js';
import { Op } from 'sequelize';

const currencySymbol = process.env.CURRENCY_SYMBOL || '${currencySymbol}';

const router = Router();

// List currently-redeemable coupons (public — for the checkout discovery UI)
router.get('/available', async (req, res) => {
  try {
    const now = new Date();
    const coupons = await Coupon.findAll({
      where: {
        active: true,
        [Op.and]: [
          { [Op.or]: [{ startDate: null }, { startDate: { [Op.lte]: now } }] },
          { [Op.or]: [{ endDate: null }, { endDate: { [Op.gt]: now } }] },
        ],
      },
      attributes: [
        'code', 'description', 'type', 'value',
        'minOrderAmount', 'maxDiscount',
        'applicableCategories', 'applicablePaymentMethods',
        'endDate',
        'usageLimit', 'usedCount',
      ],
      order: [['createdAt', 'DESC']],
    });

    const visible = coupons
      .filter((c) => !c.usageLimit || c.usedCount < c.usageLimit)
      .map((c) => ({
        code: c.code,
        description: c.description,
        type: c.type,
        value: parseFloat(c.value),
        minOrderAmount: parseFloat(c.minOrderAmount),
        maxDiscount: c.maxDiscount != null ? parseFloat(c.maxDiscount) : null,
        applicableCategories: c.applicableCategories,
        applicablePaymentMethods: c.applicablePaymentMethods,
        endDate: c.endDate,
      }));

    res.json(visible);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Validate/apply a coupon code (public — guests can use too)
router.post('/apply', optionalAuth, async (req, res) => {
  try {
    const { code, cartTotal, cartCategories, cartProductIds, paymentMethod } = req.body;

    if (!code) {
      return res.status(400).json({ message: 'Coupon code is required' });
    }

    const coupon = await Coupon.findOne({
      where: { code: code.toUpperCase().trim(), active: true },
    });

    if (!coupon) {
      return res.status(404).json({ message: 'Invalid coupon code' });
    }

    // Check dates
    const now = new Date();
    if (coupon.startDate && now < new Date(coupon.startDate)) {
      return res.status(400).json({ message: 'This coupon is not active yet' });
    }
    if (coupon.endDate && now > new Date(coupon.endDate)) {
      return res.status(400).json({ message: 'This coupon has expired' });
    }

    // Check usage limit
    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
      return res.status(400).json({ message: 'This coupon has reached its usage limit' });
    }

    // Check per-user limit (only for logged-in users)
    if (req.user && coupon.perUserLimit) {
      const userUsage = await Order.count({
        where: { userId: req.user.id, couponCode: coupon.code },
      });
      if (userUsage >= coupon.perUserLimit) {
        return res.status(400).json({ message: 'You have already used this coupon' });
      }
    }

    // Check minimum order amount
    if (cartTotal < parseFloat(coupon.minOrderAmount)) {
      return res.status(400).json({
        message: `Minimum order of ${currencySymbol}${parseFloat(coupon.minOrderAmount).toFixed(2)} required`,
      });
    }

    // Check applicable categories
    if (coupon.applicableCategories && coupon.applicableCategories.length > 0 && cartCategories) {
      const hasApplicable = cartCategories.some((cat) =>
        coupon.applicableCategories.includes(cat)
      );
      if (!hasApplicable) {
        return res.status(400).json({
          message: `This coupon is only valid for: ${coupon.applicableCategories.join(', ')}`,
        });
      }
    }

    // Check applicable products
    if (coupon.applicableProducts && coupon.applicableProducts.length > 0 && cartProductIds) {
      const hasApplicable = cartProductIds.some((id) =>
        coupon.applicableProducts.includes(id)
      );
      if (!hasApplicable) {
        return res.status(400).json({
          message: 'This coupon is not valid for the items in your cart',
        });
      }
    }

    // Check applicable payment methods
    if (coupon.applicablePaymentMethods && coupon.applicablePaymentMethods.length > 0 && paymentMethod) {
      if (!coupon.applicablePaymentMethods.includes(paymentMethod)) {
        const methodNames = coupon.applicablePaymentMethods.map((m) => m.toUpperCase()).join(', ');
        return res.status(400).json({
          message: `This coupon is only valid for: ${methodNames} payment`,
        });
      }
    }

    // Calculate discount
    let discount = 0;
    if (coupon.type === 'percentage') {
      discount = (cartTotal * parseFloat(coupon.value)) / 100;
      if (coupon.maxDiscount) {
        discount = Math.min(discount, parseFloat(coupon.maxDiscount));
      }
    } else {
      discount = parseFloat(coupon.value);
    }

    // Don't let discount exceed cart total
    discount = Math.min(discount, cartTotal);
    discount = Math.round(discount * 100) / 100;

    res.json({
      valid: true,
      code: coupon.code,
      type: coupon.type,
      value: parseFloat(coupon.value),
      discount,
      description: coupon.description || `${coupon.type === 'percentage' ? coupon.value + '% off' : '${currencySymbol}' + coupon.value + ' off'}`,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ===== Admin Routes =====

// List all coupons
router.get('/', protect, admin, async (req, res) => {
  try {
    const coupons = await Coupon.findAll({ order: [['createdAt', 'DESC']] });
    res.json(coupons);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create coupon
router.post('/', protect, admin, async (req, res) => {
  try {
    const { code, description, type, value, minOrderAmount, maxDiscount, usageLimit, perUserLimit, startDate, endDate, applicableCategories, applicableProducts, applicablePaymentMethods } = req.body;

    if (!code || !type || !value) {
      return res.status(400).json({ message: 'Code, type, and value are required' });
    }

    const existing = await Coupon.findOne({ where: { code: code.toUpperCase().trim() } });
    if (existing) {
      return res.status(400).json({ message: 'Coupon code already exists' });
    }

    const coupon = await Coupon.create({
      code: code.toUpperCase().trim(),
      description,
      type,
      value,
      minOrderAmount: minOrderAmount || 0,
      maxDiscount: maxDiscount || null,
      usageLimit: usageLimit || null,
      perUserLimit: perUserLimit || 1,
      startDate: startDate || null,
      endDate: endDate || null,
      applicableCategories: applicableCategories || null,
      applicableProducts: applicableProducts || null,
      applicablePaymentMethods: applicablePaymentMethods || null,
    });

    res.status(201).json(coupon);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update coupon
router.put('/:id', protect, admin, async (req, res) => {
  try {
    const coupon = await Coupon.findByPk(req.params.id);
    if (!coupon) return res.status(404).json({ message: 'Coupon not found' });

    if (req.body.code) req.body.code = req.body.code.toUpperCase().trim();
    await coupon.update(req.body);
    res.json(coupon);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete coupon
router.delete('/:id', protect, admin, async (req, res) => {
  try {
    const coupon = await Coupon.findByPk(req.params.id);
    if (!coupon) return res.status(404).json({ message: 'Coupon not found' });
    await coupon.destroy();
    res.json({ message: 'Coupon deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
