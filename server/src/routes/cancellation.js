import { Router } from 'express';
import { Order, Product, User } from '../models/index.js';
import { protect, admin, optionalAuth } from '../middleware/auth.js';
import { sendOrderStatusUpdate } from '../services/emailService.js';
import { getPaymentGateway } from '../services/paymentGateway.js';

const router = Router();

// Customer: Cancel order
router.post('/:id/cancel', optionalAuth, async (req, res) => {
  try {
    const order = await Order.findByPk(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    // Auth check — guest must provide both email AND orderNumber
    const isOwner = req.user && order.userId === req.user.id;
    const isGuest = !req.user && order.guestEmail && req.body.email &&
      order.guestEmail === req.body.email.toLowerCase().trim() &&
      req.body.orderNumber === order.orderNumber;

    if (!isOwner && !isGuest) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // Can only cancel processing or confirmed orders
    if (!['processing', 'confirmed'].includes(order.orderStatus)) {
      return res.status(400).json({
        message: `Cannot cancel order with status "${order.orderStatus}". Only processing or confirmed orders can be cancelled.`,
      });
    }

    const { reason } = req.body;

    // Update order status
    await order.update({
      orderStatus: 'cancelled',
      cancellationReason: reason || 'Cancelled by customer',
      cancelledAt: new Date(),
    });

    // Restore stock
    for (const item of order.items) {
      await Product.increment(
        { stock: item.quantity },
        { where: { id: item.productId } }
      );
    }

    // If payment was made, initiate refund
    if (order.paymentStatus === 'paid') {
      const refundAmount = parseFloat(order.totalAmount);
      await order.update({
        refundAmount,
        refundStatus: 'pending',
        paymentStatus: 'refunded',
      });
    }

    // Send email
    let email = order.guestEmail;
    if (!email && order.userId) {
      const customer = await User.findByPk(order.userId);
      if (customer) email = customer.email;
    }
    if (email) {
      sendOrderStatusUpdate(order.toJSON(), email).catch(() => {});
    }

    res.json({
      message: 'Order cancelled successfully',
      order: order.toJSON(),
      refundInitiated: order.paymentStatus === 'refunded',
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Admin: Process refund
router.post('/:id/refund', protect, admin, async (req, res) => {
  try {
    const order = await Order.findByPk(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    if (order.paymentStatus !== 'refunded' && order.paymentStatus !== 'paid') {
      return res.status(400).json({ message: 'No payment to refund' });
    }

    const refundAmount = parseFloat(req.body.refundAmount || order.totalAmount);

    // Call gateway refund API if applicable
    if (order.paymentMethod === 'nomod' && order.trackingNumber) {
      const gateway = getPaymentGateway('nomod');
      await gateway.refund(order.trackingNumber, refundAmount, order.orderNumber);
    }

    await order.update({
      refundAmount,
      refundStatus: 'processed',
      refundedAt: new Date(),
      paymentStatus: 'refunded',
      orderStatus: order.orderStatus === 'processing' || order.orderStatus === 'confirmed' ? 'cancelled' : order.orderStatus,
    });

    // Restore stock if not already cancelled
    if (order.orderStatus !== 'cancelled') {
      for (const item of order.items) {
        await Product.increment(
          { stock: item.quantity },
          { where: { id: item.productId } }
        );
      }
    }

    // Send email
    let email = order.guestEmail;
    if (!email && order.userId) {
      const customer = await User.findByPk(order.userId);
      if (customer) email = customer.email;
    }
    if (email) {
      sendOrderStatusUpdate(order.toJSON(), email).catch(() => {});
    }

    res.json({
      message: `Refund of ${process.env.CURRENCY_SYMBOL || 'QAR'}${refundAmount.toFixed(2)} processed`,
      order: order.toJSON(),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Admin: Reject refund
router.post('/:id/refund-reject', protect, admin, async (req, res) => {
  try {
    const order = await Order.findByPk(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    await order.update({
      refundStatus: 'failed',
    });

    res.json({ message: 'Refund rejected', order: order.toJSON() });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
