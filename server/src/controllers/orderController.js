import { Order, Product, User, Coupon } from '../models/index.js';
const currencySymbol = process.env.CURRENCY_SYMBOL || '${currencySymbol}';
import { Op } from 'sequelize';
import { sendOrderConfirmation, sendOrderStatusUpdate, sendNewOrderNotification } from '../services/emailService.js';
import { calculateTax } from '../utils/tax.js';
import { calculateShipping } from '../utils/shipping.js';
import { autoCreateShipment } from '../services/shipping.js';

const generateOrderNumber = () => {
  const prefix = 'ORD';
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
};

// Shared: build order items with variant support
async function buildOrderItems(items) {
  const productIds = items.map((item) => item.productId);
  const products = await Product.findAll({
    where: { id: { [Op.in]: productIds } },
  });

  let totalAmount = 0;
  const orderItems = items.map((item) => {
    const product = products.find((p) => p.id === item.productId);
    if (!product) throw new Error(`Product ${item.productId} not found`);

    let price = parseFloat(product.price);
    let variantInfo = null;

    if (item.selectedVariant && product.variants && product.variants.length > 0) {
      const variant = product.variants.find((v) =>
        Object.entries(item.selectedVariant).every(([k, val]) => v.options[k] === val)
      );
      if (!variant) throw new Error(`Variant not available for ${product.name}`);
      if (variant.stock < item.quantity) {
        throw new Error(`${product.name} (${Object.values(item.selectedVariant).join(', ')}) is out of stock`);
      }
      if (variant.price != null) price = parseFloat(variant.price);
      variantInfo = { ...item.selectedVariant, sku: variant.sku };
    } else if (product.variants && product.variants.length > 0 && !item.selectedVariant) {
      throw new Error(`Please select options for ${product.name}`);
    } else {
      if (product.stock < item.quantity) {
        throw new Error(`${product.name} is out of stock`);
      }
    }

    totalAmount += price * item.quantity;

    return {
      productId: product.id,
      name: product.name,
      price,
      quantity: item.quantity,
      image: product.images?.[0] || null,
      variant: variantInfo,
      taxable: product.taxable || false,
      taxRate: product.taxable ? parseFloat(product.taxRate || 0) : 0,
      hsnCode: product.hsnCode || null,
    };
  });

  return { orderItems, totalAmount, products };
}


// Shared: reduce stock after order
async function reduceStock(items, products) {
  for (const item of items) {
    const product = products.find((p) => p.id === item.productId);
    if (item.selectedVariant && product.variants && product.variants.length > 0) {
      const updatedVariants = product.variants.map((v) => {
        const isMatch = Object.entries(item.selectedVariant).every(
          ([k, val]) => v.options[k] === val
        );
        return isMatch ? { ...v, stock: v.stock - item.quantity } : v;
      });
      await Product.update(
        {
          variants: updatedVariants,
          stock: updatedVariants.reduce((sum, v) => sum + v.stock, 0),
        },
        { where: { id: item.productId } }
      );
    } else {
      await Product.increment(
        { stock: -item.quantity },
        { where: { id: item.productId } }
      );
    }
  }
}

// Apply coupon and return discount amount
async function applyCoupon(couponCode, subtotal, userId) {
  if (!couponCode) return { discount: 0, code: null };

  const coupon = await Coupon.findOne({
    where: { code: couponCode.toUpperCase().trim(), active: true },
  });
  if (!coupon) throw new Error('Invalid coupon code');

  const now = new Date();
  if (coupon.startDate && now < new Date(coupon.startDate)) throw new Error('Coupon not active yet');
  if (coupon.endDate && now > new Date(coupon.endDate)) throw new Error('Coupon has expired');
  if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) throw new Error('Coupon usage limit reached');
  if (subtotal < parseFloat(coupon.minOrderAmount)) {
    throw new Error(`Minimum order ${currencySymbol}${parseFloat(coupon.minOrderAmount).toFixed(2)} required`);
  }

  if (coupon.perUserLimit) {
    if (userId) {
      const used = await Order.count({ where: { userId, couponCode: coupon.code } });
      if (used >= coupon.perUserLimit) throw new Error('You have already used this coupon');
    }
    // Also check guest email usage if provided
    const guestEmail = arguments[3]; // passed from createGuestOrder
    if (!userId && guestEmail) {
      const { Op } = await import('sequelize');
      const guestUsed = await Order.count({ where: { guestEmail, couponCode: coupon.code } });
      if (guestUsed >= coupon.perUserLimit) throw new Error('This coupon has already been used');
    }
  }

  let discount = 0;
  if (coupon.type === 'percentage') {
    discount = (subtotal * parseFloat(coupon.value)) / 100;
    if (coupon.maxDiscount) discount = Math.min(discount, parseFloat(coupon.maxDiscount));
  } else {
    discount = parseFloat(coupon.value);
  }
  discount = Math.min(discount, subtotal);
  discount = Math.round(discount * 100) / 100;

  // Increment usage
  await coupon.increment('usedCount');

  return { discount, code: coupon.code };
}

export const createOrder = async (req, res) => {
  try {
    const { items, shippingAddress, paymentMethod, couponCode, shippingMethod = 'standard' } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'No items in order' });
    }

    const { orderItems, totalAmount, products } = await buildOrderItems(items);
    const { discount, code } = await applyCoupon(couponCode, totalAmount, req.user.id);
    const afterDiscount = Math.round((totalAmount - discount) * 100) / 100;

    const { totalTax, breakdown } = calculateTax(orderItems);

    const shippingResult = calculateShipping(afterDiscount, orderItems.length, shippingAddress?.state);
    const shippingCharge = shippingResult[shippingMethod]?.rate || shippingResult.standard.rate;

    const finalAmount = Math.round((afterDiscount + shippingCharge) * 100) / 100;

    const order = await Order.create({
      orderNumber: generateOrderNumber(),
      userId: req.user.id,
      items: orderItems,
      totalAmount: finalAmount,
      shippingAddress,
      paymentMethod,
      shippingCharge,
      shippingMethod,
      couponCode: code,
      discount,
      taxAmount: totalTax,
      taxBreakdown: breakdown,
    });

    await reduceStock(items, products);
    sendOrderConfirmation(order.toJSON(), req.user.email).catch(() => {});
    sendNewOrderNotification(order.toJSON()).catch(() => {});
    // COD orders don't go through /payment/verify so we kick off the
    // shipment here. Other gateways trigger from payment.js after verify.
    if ((paymentMethod || '').toLowerCase() === 'cod') {
      autoCreateShipment(order).catch((e) => console.error('[shipping] auto-create after COD order failed:', e.message));
    }

    res.status(201).json(order);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createGuestOrder = async (req, res) => {
  try {
    const { items, shippingAddress, paymentMethod, guestEmail, couponCode, shippingMethod = 'standard' } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'No items in order' });
    }

    if (!guestEmail || !/\S+@\S+\.\S+/.test(guestEmail)) {
      return res.status(400).json({ message: 'Valid email is required for guest checkout' });
    }

    if (!shippingAddress?.fullName || !shippingAddress?.address || !shippingAddress?.phone) {
      return res.status(400).json({ message: 'Shipping address with name, address, and phone is required' });
    }

    const { orderItems, totalAmount, products } = await buildOrderItems(items);
    const { discount, code } = await applyCoupon(couponCode, totalAmount, null, guestEmail);
    const afterDiscount = Math.round((totalAmount - discount) * 100) / 100;

    const { totalTax, breakdown } = calculateTax(orderItems);

    const shippingResult = calculateShipping(afterDiscount, orderItems.length, shippingAddress?.state);
    const shippingCharge = shippingResult[shippingMethod]?.rate || shippingResult.standard.rate;

    const finalAmount = Math.round((afterDiscount + shippingCharge) * 100) / 100;

    const order = await Order.create({
      orderNumber: generateOrderNumber(),
      userId: null,
      guestEmail: guestEmail.toLowerCase().trim(),
      items: orderItems,
      totalAmount: finalAmount,
      shippingAddress,
      paymentMethod,
      shippingCharge,
      shippingMethod,
      couponCode: code,
      discount,
      taxAmount: totalTax,
      taxBreakdown: breakdown,
    });

    await reduceStock(items, products);
    sendOrderConfirmation(order.toJSON(), guestEmail.toLowerCase().trim()).catch(() => {});
    sendNewOrderNotification(order.toJSON()).catch(() => {});
    if ((paymentMethod || '').toLowerCase() === 'cod') {
      autoCreateShipment(order).catch((e) => console.error('[shipping] auto-create after guest COD order failed:', e.message));
    }

    res.status(201).json(order);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const trackGuestOrder = async (req, res) => {
  try {
    const { orderNumber, email } = req.query;
    if (!orderNumber || !email) {
      return res.status(400).json({ message: 'Order number and email are required' });
    }
    const order = await Order.findOne({
      where: { orderNumber, guestEmail: email.toLowerCase().trim() },
    });
    if (!order) return res.status(404).json({ message: 'Order not found' });
    res.json(order);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getMyOrders = async (req, res) => {
  try {
    const orders = await Order.findAll({
      where: { userId: req.user.id },
      order: [['createdAt', 'DESC']],
    });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getOrder = async (req, res) => {
  try {
    const order = await Order.findByPk(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.userId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized' });
    }
    res.json(order);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getAllOrders = async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const where = {};
    if (status) where.orderStatus = status;
    const offset = (page - 1) * limit;
    const { count, rows } = await Order.findAndCountAll({
      where, limit: parseInt(limit), offset,
      order: [['createdAt', 'DESC']],
    });
    res.json({
      orders: rows,
      totalPages: Math.ceil(count / limit),
      currentPage: parseInt(page),
      total: count,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateOrderStatus = async (req, res) => {
  try {
    const order = await Order.findByPk(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    const { orderStatus, paymentStatus, trackingNumber } = req.body;
    const previousStatus = order.orderStatus;

    await order.update({
      ...(orderStatus && { orderStatus }),
      ...(paymentStatus && { paymentStatus }),
      ...(trackingNumber && { trackingNumber }),
    });

    if (orderStatus && orderStatus !== previousStatus) {
      let email = order.guestEmail;
      if (!email && order.userId) {
        const customer = await User.findByPk(order.userId);
        if (customer) email = customer.email;
      }
      if (email) sendOrderStatusUpdate(order.toJSON(), email).catch(() => {});
    }

    res.json(order);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
