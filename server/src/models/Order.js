import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const Order = sequelize.define('Order', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  orderNumber: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false,
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  guestEmail: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  items: {
    type: DataTypes.JSON,
    allowNull: false,
  },
  totalAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  shippingAddress: {
    type: DataTypes.JSON,
    allowNull: false,
  },
  paymentMethod: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  paymentStatus: {
    type: DataTypes.ENUM('pending', 'paid', 'failed', 'refunded'),
    defaultValue: 'pending',
  },
  orderStatus: {
    type: DataTypes.ENUM('processing', 'confirmed', 'shipped', 'delivered', 'cancelled'),
    defaultValue: 'processing',
  },
  trackingNumber: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  cancellationReason: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  cancelledAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  refundAmount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
  },
  refundStatus: {
    // null = no refund, pending, processed, failed
    type: DataTypes.ENUM('pending', 'processed', 'failed'),
    allowNull: true,
  },
  refundedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  shippingCharge: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
  },
  shippingMethod: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  couponCode: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  // Per-tender breakdown for split-payment POS sales.
  // null = single tender (use paymentMethod as before). When set,
  // paymentMethod is 'pos_split' and this is an array like
  //   [{ method: 'cash', amount: 20.000 },
  //    { method: 'card', amount: 30.000, reference: 'tap-tx-id' }]
  // Each entry's amount is the retained amount (no cash-back/change).
  paymentBreakdown: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  discount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
  },
  taxAmount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
  },
  taxBreakdown: {
    // e.g. { totalTax: 5, inclusive: true } — single flat VAT
    type: DataTypes.JSON,
    defaultValue: null,
  },
  shippingMeta: {
    // Shiprocket Shipping integration. Populated after auto-create or
    // admin "Ship via Shiprocket" action. Shape:
    //   { srOrderId, shipmentId, awb, courierName, courierId,
    //     pickupScheduledDate, etd,
    //     currentStatus, currentStatusId, lastWebhookAt,
    //     labelUrl, invoiceUrl, manifestUrl,
    //     scans: [{date, status, activity, location, srStatus, srStatusLabel}],
    //     lastError? }
    type: DataTypes.JSON,
    defaultValue: null,
  },
  locationId: {
    // Which physical location fulfilled (online: the isOnlineDefault
    // location; POS: the store where the cashier rang it up).
    // null for legacy orders placed before multi-location was introduced.
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  cashierSessionId: {
    // Set when the order was rung up through the POS during a shift.
    // null for online orders.
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  channel: {
    // Sales channel the order arrived through — drives the channel split in
    // the sales report. Phone/WhatsApp orders are rung up at the till.
    // Orders that predate this column are backfilled by scripts/seedErp.js
    // (till sales → 'pos'); otherwise they'd all read as 'web'.
    // 'staff' = a sales order entered in the staff hub (/hub/pos).
    type: DataTypes.ENUM('web', 'pos', 'phone', 'whatsapp', 'other', 'staff'),
    defaultValue: 'web',
    allowNull: false,
  },
  channelRef: {
    // External reference for the order (e.g. the WhatsApp chat or phone
    // order number), for tracing it during reconciliation.
    type: DataTypes.STRING,
    allowNull: true,
  },

  // ── FEMNIA Hub sales-order fields ──
  // The hub's own status / payment vocabulary ("Out for Delivery",
  // "Partially Paid", …). Null on orders the hub has never touched; those
  // derive their hub view from orderStatus / paymentStatus. Every hub write
  // also syncs orderStatus / paymentStatus so the storefront and reports
  // keep reading the legacy fields (see server/src/hub/sales.js).
  hubStatus: { type: DataTypes.STRING(30), allowNull: true },
  hubPaymentStatus: { type: DataTypes.STRING(20), allowNull: true },
  hubPaymentMode: { type: DataTypes.STRING(30), allowNull: true },
  fulfilmentMethod: { type: DataTypes.STRING(20), allowNull: true },   // Delivery | Customer Pickup
  // Customer / address snapshot as entered by staff (web orders keep theirs
  // in shippingAddress).
  customerName: { type: DataTypes.STRING, allowNull: true },
  customerPhone: { type: DataTypes.STRING(30), allowNull: true },
  area: { type: DataTypes.STRING, allowNull: true },
  address: { type: DataTypes.TEXT, allowNull: true },
  landmark: { type: DataTypes.STRING, allowNull: true },
  amountReceived: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  paymentDate: { type: DataTypes.DATEONLY, allowNull: true },
  paymentTime: { type: DataTypes.STRING(20), allowNull: true },
  paymentReference: { type: DataTypes.STRING, allowNull: true },
  paymentNotes: { type: DataTypes.TEXT, allowNull: true },
  paymentHeldIn: { type: DataTypes.STRING(60), allowNull: true },
  paymentHolderDetails: { type: DataTypes.STRING(200), allowNull: true },
  deliveryDate: { type: DataTypes.DATEONLY, allowNull: true },
  courier: { type: DataTypes.STRING(80), allowNull: true },
  deliveryNotes: { type: DataTypes.TEXT, allowNull: true },
  pickupDate: { type: DataTypes.DATEONLY, allowNull: true },
  pickupTime: { type: DataTypes.STRING(20), allowNull: true },
  pickupNotes: { type: DataTypes.TEXT, allowNull: true },
  confirmedAt: { type: DataTypes.DATE, allowNull: true },
  restockedAt: { type: DataTypes.DATE, allowNull: true },
  // none | deducted | restored — whether this order's stock left the shelf.
  // Null for orders the hub has never handled (derived; see hub/sales.js).
  stockState: { type: DataTypes.STRING(10), allowNull: true },
  // Retried confirmations carry the same key, so stock is deducted once.
  idempotencyKey: { type: DataTypes.STRING(120), allowNull: true, unique: 'order_idempotency_unique' },
  labelSize: { type: DataTypes.STRING(10), allowNull: true },
  labelPrintCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  // Delivery staff assignment.
  assignedTo: { type: DataTypes.INTEGER, allowNull: true },
  assignedAt: { type: DataTypes.DATE, allowNull: true },
  assignedBy: { type: DataTypes.INTEGER, allowNull: true },
  createdBy: { type: DataTypes.INTEGER, allowNull: true },
}, {
  indexes: [
    { fields: ['channel'] },
  ],
});

export default Order;
