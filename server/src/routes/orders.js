import { Router } from 'express';
import {
  createOrder,
  createGuestOrder,
  trackGuestOrder,
  getMyOrders,
  getOrder,
  getAllOrders,
  updateOrderStatus,
} from '../controllers/orderController.js';
import { protect, admin, requirePermission, optionalAuth } from '../middleware/auth.js';
import { Order } from '../models/index.js';
import { generateInvoice } from '../services/invoiceService.js';

const router = Router();

router.post('/', protect, createOrder);
router.post('/guest', createGuestOrder);
router.get('/track', trackGuestOrder);
router.get('/my-orders', protect, getMyOrders);
router.get('/all', protect, admin, getAllOrders);

// Download invoice PDF
router.get('/:id/invoice', optionalAuth, async (req, res) => {
  try {
    const order = await Order.findByPk(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    // Auth check: must be order owner, admin, or guest with valid token
    const isOwner = req.user && order.userId === req.user.id;
    const isAdmin = req.user && (req.user.role === 'admin' || req.user.role === 'staff');
    // Guest access requires both email AND orderNumber match (not just email)
    const isGuest = !req.user && order.guestEmail && req.query.email &&
      order.guestEmail === req.query.email.toLowerCase().trim() &&
      req.query.orderNumber === order.orderNumber;

    if (!isOwner && !isAdmin && !isGuest) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const pdfBuffer = await generateInvoice(order.toJSON());

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=Invoice-${order.orderNumber}.pdf`,
      'Content-Length': pdfBuffer.length,
    });

    res.send(pdfBuffer);
  } catch (error) {
    console.error('Invoice error:', error);
    res.status(500).json({ message: 'Failed to generate invoice' });
  }
});

router.get('/:id', protect, getOrder);
router.put('/:id/status', protect, admin, updateOrderStatus);

export default router;
