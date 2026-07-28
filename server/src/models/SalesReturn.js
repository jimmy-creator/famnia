import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

/**
 * A return of items from a previously paid Order.
 *
 * Created at the POS counter (cashierSessionId attached) or by admin
 * (cashierSessionId null). Each return is a money-out event independent
 * of the original sale's payment timing — refundMethod is the actual
 * out-the-drawer / out-the-card-rail movement happening now.
 *
 * Stock is incremented at THIS return's locationId, which may differ
 * from the original Order.locationId if e.g. a customer returns at the
 * other branch.
 *
 * The original Order's refundAmount is also bumped (additively) so the
 * customer's order history reflects total refunded against that order.
 */
const SalesReturn = sequelize.define('SalesReturn', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  returnNumber: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  orderId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  locationId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  cashierSessionId: {
    type: DataTypes.INTEGER,
    allowNull: true,   // null for admin-initiated returns
  },
  // [{productId, variantIndex, name, price, quantity, refundAmount, returnToStock}]
  items: {
    type: DataTypes.JSON,
    allowNull: false,
  },
  refundAmount: {
    type: DataTypes.DECIMAL(12, 3),
    allowNull: false,
    defaultValue: 0,
  },
  refundMethod: {
    type: DataTypes.ENUM('cash', 'card', 'knet', 'store_credit'),
    allowNull: false,
  },
  reason: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  processedBy: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  status: {
    type: DataTypes.ENUM('completed', 'cancelled'),
    defaultValue: 'completed',
  },
}, {
  indexes: [
    { fields: ['orderId'] },
    { fields: ['locationId', 'createdAt'] },
    { fields: ['cashierSessionId'] },
    { fields: ['refundMethod', 'createdAt'] },
  ],
});

export default SalesReturn;
