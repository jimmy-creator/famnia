import { Router } from 'express';
import { Op } from 'sequelize';
import { PriceRequest, Product, Order, User, Setting } from '../models/index.js';
import { protect, admin } from '../middleware/auth.js';
import { getPaymentGateway } from '../services/paymentGateway.js';
import { sendQuoteEmail } from '../services/emailService.js';

const router = Router();

function genRequestNumber() {
  return `B2B-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
}

function genOrderNumber() {
  return `ORD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
}

// Normalise an items array to the canonical shape we store on the request.
// Accepts client input like [{ productId, quantity }] or [{ name, quantity }] (free-form).
async function normaliseRequestItems(rawItems) {
  if (!Array.isArray(rawItems)) return [];
  const productIds = rawItems.map((i) => i.productId).filter(Boolean);
  const products = productIds.length
    ? await Product.findAll({ where: { id: { [Op.in]: productIds } } })
    : [];

  return rawItems
    .map((item) => {
      const qty = parseInt(item.quantity, 10);
      if (!qty || qty < 1) return null;

      if (item.productId) {
        const product = products.find((p) => p.id === item.productId);
        if (!product) return null;
        return {
          productId: product.id,
          name: product.name,
          quantity: qty,
          image: product.images?.[0] || null,
          category: product.category || null,
          // No unitPrice here — admin sets it when quoting
        };
      }

      // Free-form row — customer typed a name
      const name = String(item.name || '').trim();
      if (!name) return null;
      return { name, quantity: qty };
    })
    .filter(Boolean);
}

// ----------------------------------------------------------------------------
// Customer routes
// ----------------------------------------------------------------------------

// Create a price request
router.post('/requests', protect, async (req, res) => {
  try {
    const { companyName, contactName, contactPhone, contactAddress, customerNote, items } = req.body;

    if (!companyName?.trim() || !contactName?.trim()) {
      return res.status(400).json({ message: 'Company and contact name are required' });
    }
    if (!contactAddress || typeof contactAddress !== 'object') {
      return res.status(400).json({ message: 'Address is required' });
    }

    const normalisedItems = await normaliseRequestItems(items);
    // Allow zero items if they wrote a customer note (free-form-only request)
    if (normalisedItems.length === 0 && !customerNote?.trim()) {
      return res.status(400).json({ message: 'Add at least one product or write a note' });
    }

    const request = await PriceRequest.create({
      requestNumber: genRequestNumber(),
      userId: req.user.id,
      companyName: companyName.trim(),
      contactName: contactName.trim(),
      contactPhone: contactPhone?.trim() || null,
      contactAddress,
      customerNote: customerNote?.trim() || null,
      items: normalisedItems,
      status: 'pending',
    });

    res.status(201).json(request.toJSON());
  } catch (error) {
    console.error('[b2b] create request error:', error);
    res.status(500).json({ message: error.message });
  }
});

// List own requests
router.get('/requests/mine', protect, async (req, res) => {
  try {
    const rows = await PriceRequest.findAll({
      where: { userId: req.user.id },
      order: [['createdAt', 'DESC']],
    });
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Initiate online payment for a quoted request (customer-facing)
router.post('/requests/:id/pay-init', protect, async (req, res) => {
  try {
    const request = await PriceRequest.findByPk(req.params.id);
    if (!request) return res.status(404).json({ message: 'Request not found' });
    if (request.userId !== req.user.id) return res.status(403).json({ message: 'Not authorized' });
    if (request.status !== 'quoted') return res.status(400).json({ message: 'Request is not in a payable state' });
    if (request.paymentMethod !== 'online') return res.status(400).json({ message: 'This quote is set for bank transfer' });
    if (request.quotedValidUntil && new Date(request.quotedValidUntil) < new Date()) {
      return res.status(400).json({ message: 'This quote has expired' });
    }

    const gatewayName = req.body.gateway || process.env.PAYMENT_GATEWAY || 'razorpay';
    const gateway = getPaymentGateway(gatewayName);
    const currency = request.quotedCurrency || process.env.CURRENCY_CODE || 'INR';

    const gatewayOrder = await gateway.createOrder(
      parseFloat(request.quotedTotal),
      currency,
      request.requestNumber,
      {
        orderId: request.id,
        customer: {
          name: request.contactName,
          email: req.user.email,
          phone: request.contactPhone || '',
        },
        items: request.items,
      }
    );

    await request.update({
      paymentGateway: gatewayName,
      paymentOrderId: gatewayOrder.gatewayOrderId,
    });

    res.json({
      ...gateway.getCheckoutConfig(gatewayOrder),
      requestNumber: request.requestNumber,
      amount: parseFloat(request.quotedTotal),
    });
  } catch (error) {
    console.error('[b2b] pay-init error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Verify online payment (customer-facing) — converts the quote to an Order on success
router.post('/requests/:id/verify-payment', protect, async (req, res) => {
  try {
    const request = await PriceRequest.findByPk(req.params.id);
    if (!request) return res.status(404).json({ message: 'Request not found' });
    if (request.userId !== req.user.id) return res.status(403).json({ message: 'Not authorized' });
    if (request.status === 'paid') return res.json({ verified: true, status: 'paid', orderId: request.orderId });

    const gateway = getPaymentGateway(request.paymentGateway || 'razorpay');
    const result = await gateway.verifyPayment(req.body.paymentData || req.body);

    if (!result.verified) {
      return res.json({ verified: false, status: result.status, message: result.message || 'Payment not completed' });
    }

    const order = await convertRequestToOrder(request);
    res.json({ verified: true, status: 'paid', order: order.toJSON() });
  } catch (error) {
    console.error('[b2b] verify-payment error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Customer cancellation of own pending/quoted request
router.patch('/requests/:id/cancel', protect, async (req, res) => {
  try {
    const request = await PriceRequest.findByPk(req.params.id);
    if (!request) return res.status(404).json({ message: 'Request not found' });

    const isOwner = request.userId === req.user.id;
    const isAdmin = req.user.role === 'admin' || req.user.role === 'staff';
    if (!isOwner && !isAdmin) return res.status(403).json({ message: 'Not authorized' });

    if (request.status === 'paid') return res.status(400).json({ message: 'Cannot cancel a paid quote' });
    await request.update({ status: 'cancelled' });
    res.json(request.toJSON());
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ----------------------------------------------------------------------------
// Admin / staff routes
// ----------------------------------------------------------------------------

// List all requests, optional status filter
router.get('/requests', protect, admin, async (req, res) => {
  try {
    const where = {};
    if (req.query.status) where.status = req.query.status;
    const rows = await PriceRequest.findAll({
      where,
      order: [['createdAt', 'DESC']],
      include: [{ model: User, attributes: ['id', 'name', 'email'] }],
    });
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Single request — accessible to owner OR admin/staff
router.get('/requests/:id', protect, async (req, res) => {
  try {
    const request = await PriceRequest.findByPk(req.params.id, {
      include: [{ model: User, attributes: ['id', 'name', 'email'] }],
    });
    if (!request) return res.status(404).json({ message: 'Request not found' });

    const isOwner = request.userId === req.user.id;
    const isAdmin = req.user.role === 'admin' || req.user.role === 'staff';
    if (!isOwner && !isAdmin) return res.status(403).json({ message: 'Not authorized' });

    // Strip internal note for non-admins
    const data = request.toJSON();
    if (!isAdmin) delete data.internalNote;
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Admin sends/updates the quote (sets prices + emails customer)
router.patch('/requests/:id/quote', protect, admin, async (req, res) => {
  try {
    const request = await PriceRequest.findByPk(req.params.id);
    if (!request) return res.status(404).json({ message: 'Request not found' });

    const {
      items,             // [{ productId?, name, quantity, unitPrice, lineTotal? }]
      quotedTotal,
      quotedCurrency,
      quotedValidUntil,
      adminNote,
      internalNote,
      paymentMethod,     // 'online' | 'bank_transfer'
      sendEmail = true,
    } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Items with prices are required' });
    }
    if (!quotedTotal || parseFloat(quotedTotal) <= 0) {
      return res.status(400).json({ message: 'Quoted total must be positive' });
    }
    if (paymentMethod && !['online', 'bank_transfer'].includes(paymentMethod)) {
      return res.status(400).json({ message: 'Invalid payment method' });
    }

    // Sanitise items — preserve productId/image/category but require unitPrice + quantity
    const pricedItems = items.map((it) => ({
      productId: it.productId || null,
      name: String(it.name || '').trim(),
      quantity: parseInt(it.quantity, 10) || 0,
      unitPrice: parseFloat(it.unitPrice) || 0,
      lineTotal: it.lineTotal != null ? parseFloat(it.lineTotal) : (parseFloat(it.unitPrice) || 0) * (parseInt(it.quantity, 10) || 0),
      image: it.image || null,
      category: it.category || null,
    }));

    await request.update({
      items: pricedItems,
      quotedTotal: parseFloat(quotedTotal),
      quotedCurrency: quotedCurrency || process.env.CURRENCY_CODE || 'INR',
      quotedValidUntil: quotedValidUntil || null,
      adminNote: adminNote?.trim() || null,
      internalNote: internalNote?.trim() || null,
      paymentMethod: paymentMethod || request.paymentMethod || 'online',
      status: 'quoted',
    });

    if (sendEmail) {
      const customer = await User.findByPk(request.userId);
      if (customer?.email) {
        // Pull bank details from Settings — only used when bank_transfer method is offered
        const bankSetting = await Setting.findByPk('b2b_bank_details');
        sendQuoteEmail({
          to: customer.email,
          customerName: request.contactName || customer.name,
          request: request.toJSON(),
          bankDetails: bankSetting?.value || '',
        }).catch((err) => console.error('[b2b] sendQuoteEmail error:', err.message));
      }
    }

    res.json(request.toJSON());
  } catch (error) {
    console.error('[b2b] quote error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Admin marks a bank-transfer request as paid (manual confirmation)
router.patch('/requests/:id/mark-paid', protect, admin, async (req, res) => {
  try {
    const request = await PriceRequest.findByPk(req.params.id);
    if (!request) return res.status(404).json({ message: 'Request not found' });
    if (request.status === 'paid') return res.json(request.toJSON());
    if (request.status !== 'quoted') return res.status(400).json({ message: 'Only quoted requests can be marked paid' });

    const order = await convertRequestToOrder(request);
    res.json({ request: request.toJSON(), order: order.toJSON() });
  } catch (error) {
    console.error('[b2b] mark-paid error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Admin freely edits status (per user request — admin can manually move between states)
router.patch('/requests/:id/status', protect, admin, async (req, res) => {
  try {
    const { status } = req.body;
    const valid = ['pending', 'quoted', 'paid', 'cancelled', 'expired'];
    if (!valid.includes(status)) return res.status(400).json({ message: 'Invalid status' });

    const request = await PriceRequest.findByPk(req.params.id);
    if (!request) return res.status(404).json({ message: 'Request not found' });

    // 'paid' should go through mark-paid to also spawn the Order row — guide admin there.
    if (status === 'paid' && request.status !== 'paid') {
      return res.status(400).json({ message: 'Use mark-paid to record payment (it also creates the order)' });
    }

    await request.update({ status });
    res.json(request.toJSON());
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

// Convert a 'quoted' PriceRequest into a real Order row.
// Per product spec, B2B orders do NOT decrement stock (often pre-orders against future shipments).
async function convertRequestToOrder(request) {
  const orderItems = request.items.map((it) => ({
    productId: it.productId || null,
    name: it.name,
    category: it.category || null,
    price: parseFloat(it.unitPrice || 0),
    quantity: parseInt(it.quantity, 10) || 0,
    image: it.image || null,
    taxable: false,
    taxRate: 0,
  }));

  const order = await Order.create({
    orderNumber: genOrderNumber(),
    userId: request.userId,
    items: orderItems,
    totalAmount: parseFloat(request.quotedTotal),
    shippingAddress: request.contactAddress,
    paymentMethod: request.paymentMethod === 'bank_transfer' ? 'bank_transfer' : (request.paymentGateway || 'online'),
    paymentStatus: 'paid',
    orderStatus: 'confirmed',
    shippingCharge: 0,
    discount: 0,
    taxAmount: 0,
  });

  await request.update({
    status: 'paid',
    paidAt: new Date(),
    orderId: order.id,
  });

  return order;
}

export default router;
