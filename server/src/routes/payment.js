import { Router } from 'express';
import { protect, optionalAuth } from '../middleware/auth.js';
import { Order, Product, User, Coupon } from '../models/index.js';
import { getPaymentGateway, getAvailableGateways } from '../services/paymentGateway.js';
import { sendOrderConfirmation, sendPaymentConfirmation, sendNewOrderNotification } from '../services/emailService.js';
import { autoCreateShipment } from '../services/shipping.js';
import { Op } from 'sequelize';
import { calculateTax } from '../utils/tax.js';
import { calculateShipping } from '../utils/shipping.js';

// Reuse coupon logic
async function applyCouponForPayment(couponCode, subtotal, userId, orderItems = [], paymentMethod = null) {
  if (!couponCode) return { discount: 0, code: null };
  const coupon = await Coupon.findOne({
    where: { code: couponCode.toUpperCase().trim(), active: true },
  });
  if (!coupon) throw new Error('Invalid coupon code');
  const now = new Date();
  if (coupon.startDate && now < new Date(coupon.startDate)) throw new Error('Coupon not active yet');
  if (coupon.endDate && now > new Date(coupon.endDate)) throw new Error('Coupon has expired');
  if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) throw new Error('Coupon usage limit reached');
  const cs = process.env.CURRENCY_SYMBOL || '₹';
  if (subtotal < parseFloat(coupon.minOrderAmount)) throw new Error(`Minimum order ${cs}${parseFloat(coupon.minOrderAmount).toFixed(2)} required`);
  if (userId && coupon.perUserLimit) {
    const used = await Order.count({ where: { userId, couponCode: coupon.code } });
    if (used >= coupon.perUserLimit) throw new Error('You have already used this coupon');
  }
  // Check applicable categories
  if (coupon.applicableCategories?.length && orderItems.length) {
    const cartCategories = [...new Set(orderItems.map((i) => i.category).filter(Boolean))];
    const hasMatch = cartCategories.some((cat) => coupon.applicableCategories.includes(cat));
    if (!hasMatch) throw new Error(`This coupon is only valid for: ${coupon.applicableCategories.join(', ')}`);
  }

  // Check applicable products
  if (coupon.applicableProducts?.length && orderItems.length) {
    const cartProductIds = orderItems.map((i) => i.productId);
    const hasMatch = cartProductIds.some((id) => coupon.applicableProducts.includes(id));
    if (!hasMatch) throw new Error('This coupon is not valid for the items in your cart');
  }

  // Check applicable payment methods
  if (coupon.applicablePaymentMethods?.length && paymentMethod) {
    if (!coupon.applicablePaymentMethods.includes(paymentMethod)) {
      throw new Error(`This coupon is not valid for ${paymentMethod.toUpperCase()} payment`);
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
  await coupon.increment('usedCount');
  return { discount, code: coupon.code };
}

// Decrement stock for a paid order's items, including per-variant stock for
// variant products. Mirrors orderController.reduceStock, but reads the stored
// `variant` field on order items (set at order-creation time) rather than the
// cart's `selectedVariant`. Online payments confirm stock here, after verify.
async function reduceOrderStock(items) {
  for (const item of items) {
    const product = await Product.findByPk(item.productId);
    if (!product) continue;
    const variants = Array.isArray(product.variants) ? product.variants : [];
    if (item.variant && variants.length > 0) {
      const updatedVariants = variants.map((v) => {
        const isMatch = item.variant.sku
          ? v.sku === item.variant.sku
          : Object.entries(item.variant).every(([k, val]) => k === 'sku' || v.options?.[k] === val);
        return isMatch ? { ...v, stock: v.stock - item.quantity } : v;
      });
      await product.update({
        variants: updatedVariants,
        stock: updatedVariants.reduce((sum, v) => sum + v.stock, 0),
      });
    } else {
      await Product.increment({ stock: -item.quantity }, { where: { id: item.productId } });
    }
  }
}

const router = Router();

// Get available payment gateways
router.get('/gateways', (req, res) => {
  const gateways = getAvailableGateways();
  const allMethods = [];

  const disabledMethods = (process.env.DISABLED_PAYMENT_METHODS || '').split(',').map(m => m.trim().toLowerCase());

  if (!disabledMethods.includes('cod')) {
    allMethods.push({ id: 'cod', name: 'Cash on Delivery', description: 'Pay when you receive your order' });
  }
  if (!disabledMethods.includes('bank_transfer')) {
    allMethods.push({ id: 'bank_transfer', name: 'Bank Transfer', description: 'Direct bank transfer' });
  }

  allMethods.push(...gateways);
  res.json(allMethods);
});

// Calculate shipping rates
router.post('/calculate-shipping', async (req, res) => {
  try {
    const { subtotal, itemCount, shippingState } = req.body;
    const result = calculateShipping(subtotal || 0, itemCount || 1, shippingState);
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Calculate tax for cart (preview before placing order)
router.post('/calculate-tax', async (req, res) => {
  try {
    const { items, shippingState } = req.body;
    if (!items || items.length === 0) return res.json({ totalTax: 0, breakdown: null });

    const productIds = items.map((i) => i.productId);
    const products = await Product.findAll({ where: { id: { [Op.in]: productIds } } });

    const orderItems = items.map((item) => {
      const product = products.find((p) => p.id === item.productId);
      if (!product) return { taxable: false, taxRate: 0, price: 0, quantity: 0 };
      return {
        price: parseFloat(product.price),
        quantity: item.quantity,
        taxable: product.taxable || false,
        taxRate: product.taxable ? parseFloat(product.taxRate || 0) : 0,
      };
    });

    const { totalTax, breakdown } = calculateTax(orderItems);
    res.json({ totalTax, breakdown });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create payment order
router.post('/create-order', optionalAuth, async (req, res) => {
  try {
    const { items, shippingAddress, gateway = process.env.PAYMENT_GATEWAY || 'razorpay', guestEmail, couponCode } = req.body;
    const isGuest = !req.user;

    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'No items provided' });
    }

    if (isGuest && (!guestEmail || !/\S+@\S+\.\S+/.test(guestEmail))) {
      return res.status(400).json({ message: 'Valid email is required for guest checkout' });
    }

    // Calculate total from DB prices (never trust client-side amounts)
    const productIds = items.map((item) => item.productId);
    const products = await Product.findAll({
      where: { id: { [Op.in]: productIds } },
    });

    let totalAmount = 0;
    const orderItems = items.map((item) => {
      const product = products.find((p) => p.id === item.productId);
      if (!product) throw new Error(`Product ${item.productId} not found`);

      // Resolve the selected variant's price/stock — base price would otherwise
      // bill a "6 Pack" as a "1 Pack" (matches orderController.buildOrderItems).
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
      } else if (product.stock < item.quantity) {
        throw new Error(`${product.name} is out of stock`);
      }

      totalAmount += price * item.quantity;
      return {
        productId: product.id,
        name: product.name,
        category: product.category,
        price,
        quantity: item.quantity,
        image: product.images?.[0] || null,
        variant: variantInfo,
        taxable: product.taxable || false,
        taxRate: product.taxable ? parseFloat(product.taxRate || 0) : 0,
        hsnCode: product.hsnCode || null,
      };
    });

    // Apply coupon
    const { discount, code: appliedCode } = await applyCouponForPayment(
      couponCode, totalAmount, isGuest ? null : req.user.id, orderItems, gateway
    );
    const afterDiscount = Math.round((totalAmount - discount) * 100) / 100;

    // Calculate tax
    const { totalTax, breakdown: taxBreakdown } = calculateTax(orderItems);

    // Calculate shipping
    const shippingMethod = req.body.shippingMethod || 'standard';
    const shippingResult = calculateShipping(afterDiscount, orderItems.length, shippingAddress?.state);
    const shipping = shippingResult[shippingMethod]?.rate || shippingResult.standard.rate;
    // Tax is inclusive — not added on top
    const finalAmount = Math.round((afterDiscount + shipping) * 100) / 100;

    // Generate order number
    const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    // Create order in DB with pending payment
    const order = await Order.create({
      orderNumber,
      userId: isGuest ? null : req.user.id,
      guestEmail: isGuest ? guestEmail.toLowerCase().trim() : null,
      items: orderItems,
      totalAmount: finalAmount,
      shippingAddress,
      paymentMethod: gateway,
      paymentStatus: 'pending',
      orderStatus: 'processing',
      shippingCharge: shipping,
      shippingMethod,
      couponCode: appliedCode,
      discount,
      taxAmount: totalTax,
      taxBreakdown,
    });

    const customerName = isGuest ? shippingAddress.fullName : req.user.name;
    const customerEmail = isGuest ? guestEmail : req.user.email;
    const customerPhone = shippingAddress.phone || (isGuest ? '' : req.user.phone || '');

    // Create gateway payment order
    const paymentGateway = getPaymentGateway(gateway);
    const currencyCode = process.env.CURRENCY_CODE || 'INR';
    const gatewayOrder = await paymentGateway.createOrder(
      finalAmount,
      currencyCode,
      orderNumber,
      {
        orderId: order.id,
        customer: {
          name: customerName,
          email: customerEmail,
          phone: customerPhone,
        },
        items: orderItems,
        shippingAddress,
        discount,
        shipping,
      }
    );

    // Save gateway order ID
    await order.update({ trackingNumber: gatewayOrder.gatewayOrderId });

    // Return checkout config
    const checkoutConfig = paymentGateway.getCheckoutConfig(gatewayOrder);

    res.json({
      order: order.toJSON(),
      payment: {
        ...checkoutConfig,
        orderNumber,
        amount: finalAmount,
      },
    });
  } catch (error) {
    console.error('Payment create-order error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Verify payment
router.post('/verify', optionalAuth, async (req, res) => {
  try {
    const { orderNumber, gateway = process.env.PAYMENT_GATEWAY || 'razorpay', paymentData } = req.body;

    const where = { orderNumber };
    if (req.user) {
      where.userId = req.user.id;
    } else if (req.body.guestEmail) {
      where.guestEmail = req.body.guestEmail.toLowerCase().trim();
    }
    const order = await Order.findOne({ where });
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (order.paymentStatus === 'paid') {
      // Don't leak full order data — return minimal info
      return res.json({ verified: true, status: 'paid' });
    }

    const paymentGateway = getPaymentGateway(gateway);
    const result = await paymentGateway.verifyPayment(paymentData);

    console.log('Payment verify result:', result);

    if (result.verified) {
      await order.update({
        paymentStatus: 'paid',
        orderStatus: 'confirmed',
      });

      // Reduce stock (per-variant for variant products)
      await reduceOrderStock(order.items);

      // Send payment + order confirmation emails
      let email = order.guestEmail;
      if (!email && req.user) email = req.user.email;
      if (!email && order.userId) {
        const customer = await User.findByPk(order.userId);
        if (customer) email = customer.email;
      }
      if (email) {
        sendPaymentConfirmation(order.toJSON(), email).catch(() => {});
        sendOrderConfirmation(order.toJSON(), email).catch(() => {});
      }
      sendNewOrderNotification(order.toJSON()).catch(() => {});
      autoCreateShipment(order).catch((e) => console.error('[shipping] auto-create after verify failed:', e.message));

      res.json({ verified: true, order: order.toJSON(), status: result.status });
    } else if (result.status === 'PENDING') {
      // Payment is still processing (common in test mode)
      res.json({ verified: false, pending: true, status: 'PENDING', message: 'Payment is being processed' });
    } else {
      await order.update({ paymentStatus: 'failed' });
      res.json({ verified: false, status: result.status, message: result.message || 'Payment verification failed' });
    }
  } catch (error) {
    console.error('Payment verify error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Payment webhook (for server-to-server callbacks)
router.post('/webhook/:gateway', async (req, res) => {
  try {
    // Each gateway sends different webhook formats
    // For Razorpay: validate webhook signature using X-Razorpay-Signature header
    const { gateway } = req.params;
    console.log(`Webhook received for ${gateway}:`, JSON.stringify(req.body).substring(0, 200));

    // Acknowledge receipt
    res.json({ status: 'ok' });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ status: 'error' });
  }
});

// Tap Payments webhook (server-to-server). Tap POSTs here on payment status
// changes. Client-side verify on /order-success handles the user-facing
// confirmation; this endpoint just acks so Tap doesn't retry.
// Full verification is delegated to /payment/verify with gateway='tap'.
router.post('/tap-callback', async (req, res) => {
  try {
    const chargeId = req.body?.id;
    const status = String(req.body?.status || '').toUpperCase();
    console.log(`[tap-callback] charge=${chargeId} status=${status}`);
    res.json({ ok: true });
  } catch (err) {
    console.error('Tap callback error:', err);
    res.json({ ok: false });
  }
});

// Paytm browser callback — Paytm POSTs here after payment, then we redirect to frontend
router.post('/paytm-callback', async (req, res) => {
  try {
    const { ORDERID, STATUS, TXNID } = req.body;
    console.log('Paytm callback:', { ORDERID, STATUS, TXNID });

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';

    if (STATUS === 'TXN_SUCCESS') {
      // Verify and confirm the order
      const order = await Order.findOne({ where: { orderNumber: ORDERID } });
      if (order && order.paymentStatus !== 'paid') {
        const paymentGateway = getPaymentGateway('paytm');
        const result = await paymentGateway.verifyPayment({ orderId: ORDERID });

        if (result.verified) {
          await order.update({ paymentStatus: 'paid', orderStatus: 'confirmed' });
          await reduceOrderStock(order.items);

          // Send emails
          let email = order.guestEmail;
          if (!email && order.userId) {
            const customer = await User.findByPk(order.userId);
            if (customer) email = customer.email;
          }
          if (email) {
            sendPaymentConfirmation(order.toJSON(), email).catch(() => {});
            sendOrderConfirmation(order.toJSON(), email).catch(() => {});
          }
          sendNewOrderNotification(order.toJSON()).catch(() => {});
          autoCreateShipment(order).catch((e) => console.error('[shipping] auto-create after paytm callback failed:', e.message));
        }
      }
      res.redirect(`${clientUrl}/order-success?orderNumber=${ORDERID}`);
    } else {
      res.redirect(`${clientUrl}/order-success?orderNumber=${ORDERID}&status=failed`);
    }
  } catch (error) {
    console.error('Paytm callback error:', error);
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    res.redirect(`${clientUrl}/orders`);
  }
});

// Nomod — verify payment by checkout ID (called from frontend after redirect back)
router.post('/nomod-verify', optionalAuth, async (req, res) => {
  try {
    const { orderNumber, nomodCheckoutId, guestEmail } = req.body;

    const where = { orderNumber };
    if (req.user) {
      where.userId = req.user.id;
    } else if (guestEmail) {
      where.guestEmail = guestEmail.toLowerCase().trim();
    }

    const order = await Order.findOne({ where });
    if (!order) return res.status(404).json({ message: 'Order not found' });

    if (order.paymentStatus === 'paid') {
      return res.json({ verified: true, status: 'paid' });
    }

    // Use checkout ID from DB (trackingNumber) — don't trust URL param
    const checkoutId = order.trackingNumber || nomodCheckoutId;
    console.log('[Nomod verify] orderNumber:', orderNumber, '| trackingNumber:', order.trackingNumber, '| nomodCheckoutId:', nomodCheckoutId, '| paymentStatus:', order.paymentStatus);
    if (!checkoutId) return res.status(400).json({ message: 'Checkout ID not found' });

    const paymentGateway = getPaymentGateway('nomod');
    const result = await paymentGateway.verifyPayment({ sessionId: checkoutId });
    console.log('[Nomod verify] result:', JSON.stringify(result));

    if (result.verified) {
      await order.update({ paymentStatus: 'paid', orderStatus: 'confirmed' });

      await reduceOrderStock(order.items);

      let email = order.guestEmail;
      if (!email && req.user) email = req.user.email;
      if (!email && order.userId) {
        const customer = await User.findByPk(order.userId);
        if (customer) email = customer.email;
      }
      if (email) {
        sendPaymentConfirmation(order.toJSON(), email).catch(() => {});
        sendOrderConfirmation(order.toJSON(), email).catch(() => {});
      }
      sendNewOrderNotification(order.toJSON()).catch(() => {});
      autoCreateShipment(order).catch((e) => console.error('[shipping] auto-create after nomod verify failed:', e.message));

      res.json({ verified: true, order: order.toJSON(), status: result.status });
    } else {
      await order.update({ paymentStatus: 'failed' });
      res.json({ verified: false, status: result.status, message: 'Payment not completed' });
    }
  } catch (error) {
    console.error('Nomod verify error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Tamara webhook (server-to-server). Tamara POSTs order status changes here.
// Client-side verify on /order-success drives the user-facing confirmation;
// this just acks so Tamara stops retrying.
router.post('/tamara-callback', async (req, res) => {
  try {
    console.log('[tamara-callback]', JSON.stringify(req.body).slice(0, 200));
    res.json({ ok: true });
  } catch (err) {
    console.error('Tamara callback error:', err);
    res.json({ ok: false });
  }
});

// Tamara — verify (and authorise) a checkout by its Tamara order id, which we
// stored in trackingNumber at create-order time. Called from /order-success
// after the customer is redirected back. Mirrors /nomod-verify.
router.post('/tamara-verify', optionalAuth, async (req, res) => {
  try {
    const { orderNumber, guestEmail } = req.body;

    const where = { orderNumber };
    if (req.user) {
      where.userId = req.user.id;
    } else if (guestEmail) {
      where.guestEmail = guestEmail.toLowerCase().trim();
    }

    const order = await Order.findOne({ where });
    if (!order) return res.status(404).json({ message: 'Order not found' });

    if (order.paymentStatus === 'paid') {
      return res.json({ verified: true, status: 'paid' });
    }

    // Use the Tamara order id from DB (trackingNumber) — don't trust URL params.
    const tamaraOrderId = order.trackingNumber;
    if (!tamaraOrderId) return res.status(400).json({ message: 'Tamara order id not found' });

    const paymentGateway = getPaymentGateway('tamara');
    const result = await paymentGateway.verifyPayment({ orderId: tamaraOrderId });
    console.log('[Tamara verify] result:', JSON.stringify(result));

    if (result.verified) {
      await order.update({ paymentStatus: 'paid', orderStatus: 'confirmed' });

      await reduceOrderStock(order.items);

      let email = order.guestEmail;
      if (!email && req.user) email = req.user.email;
      if (!email && order.userId) {
        const customer = await User.findByPk(order.userId);
        if (customer) email = customer.email;
      }
      if (email) {
        sendPaymentConfirmation(order.toJSON(), email).catch(() => {});
        sendOrderConfirmation(order.toJSON(), email).catch(() => {});
      }
      sendNewOrderNotification(order.toJSON()).catch(() => {});
      autoCreateShipment(order).catch((e) => console.error('[shipping] auto-create after tamara verify failed:', e.message));

      res.json({ verified: true, order: order.toJSON(), status: result.status });
    } else {
      res.json({ verified: false, status: result.status, message: 'Payment not completed' });
    }
  } catch (error) {
    console.error('Tamara verify error:', error);
    res.status(500).json({ message: error.message });
  }
});

export default router;
