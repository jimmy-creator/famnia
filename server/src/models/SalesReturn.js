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
 *
 * A no-receipt return has no Order (orderId null) — items are priced at the
 * product's selling price at the time of the return.
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
    allowNull: true,   // null for a no-receipt return (customer has no bill)
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
    // No store_credit: the store extends no customer credit, and the
    // value had no redemption path anywhere in the system.
    type: DataTypes.ENUM('cash', 'card'),
    allowNull: false,
  },
  // Set only when one refund goes out over several rails — voiding a split
  // sale refunds each tender it was paid with: [{ method, amount }].
  // refundMethod then holds the largest leg. Null means refundMethod alone.
  refundBreakdown: {
    type: DataTypes.JSON,
    allowNull: true,
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
