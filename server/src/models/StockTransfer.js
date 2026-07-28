import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

/**
 * Stock movement between two Locations.
 *
 * Lifecycle:
 *   pending  → admin filled in items, hasn't dispatched yet
 *   in_transit → source location decremented, destination not yet incremented
 *   completed  → destination incremented; movement closed
 *   cancelled  → reverted (if was in_transit, source is incremented back)
 *
 * `items` JSON shape:
 *   [{ productId, variantIndex|null, quantity, name?, sku? }]
 */
const StockTransfer = sequelize.define('StockTransfer', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  transferNumber: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false,
  },
  fromLocationId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  toLocationId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  items: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: [],
  },
  status: {
    type: DataTypes.ENUM('pending', 'in_transit', 'completed', 'cancelled'),
    defaultValue: 'pending',
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  createdBy: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  dispatchedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  completedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
});

export default StockTransfer;
