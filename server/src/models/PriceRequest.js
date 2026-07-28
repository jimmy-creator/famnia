import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const PriceRequest = sequelize.define('PriceRequest', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  requestNumber: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false,
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  companyName: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  contactName: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  contactPhone: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  contactAddress: {
    // JSON so we can reuse this directly as Order.shippingAddress when converted
    // shape: { fullName, phone, line1, line2, city, state, postalCode, country }
    type: DataTypes.JSON,
    allowNull: false,
  },
  customerNote: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  items: {
    // Free-form line items. Shape per row:
    //   { productId?, name, quantity, unitPrice?, lineTotal?, image? }
    // productId is optional — admin can quote for off-catalogue items.
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: [],
  },
  status: {
    type: DataTypes.ENUM('pending', 'quoted', 'paid', 'cancelled', 'expired'),
    defaultValue: 'pending',
  },
  quotedTotal: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
  },
  quotedCurrency: {
    type: DataTypes.STRING(8),
    allowNull: true,
  },
  quotedValidUntil: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  adminNote: {
    // Visible to the customer in the quote email + detail page
    type: DataTypes.TEXT,
    allowNull: true,
  },
  internalNote: {
    // Admin-only — not shown to the customer
    type: DataTypes.TEXT,
    allowNull: true,
  },
  paymentMethod: {
    // null until admin picks one when sending the quote
    type: DataTypes.ENUM('online', 'bank_transfer'),
    allowNull: true,
  },
  paymentGateway: {
    // Which gateway was used for online payment (razorpay/stripe/etc.)
    type: DataTypes.STRING,
    allowNull: true,
  },
  paymentOrderId: {
    // Gateway order id (Razorpay order_xxx, Stripe session, etc.)
    type: DataTypes.STRING,
    allowNull: true,
  },
  paidAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  orderId: {
    // FK → Order, populated once paid and converted into a real order row
    type: DataTypes.INTEGER,
    allowNull: true,
  },
});

export default PriceRequest;
