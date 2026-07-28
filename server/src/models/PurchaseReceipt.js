import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

/**
 * Goods Received Note — one event of stock arriving for a PO.
 *
 * A single PO can have multiple receipts if goods arrive in batches.
 * When created the route increments ProductStock at the receiving
 * Location and bumps PurchaseOrder.items[].receivedQty so the PO's
 * "outstanding" view is accurate.
 */
const PurchaseReceipt = sequelize.define('PurchaseReceipt', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  grnNumber: { type: DataTypes.STRING, allowNull: false, unique: true },
  purchaseOrderId: { type: DataTypes.INTEGER, allowNull: false },
  locationId: { type: DataTypes.INTEGER, allowNull: false },
  // [{ productId, variantIndex, quantity, unitCost }]
  items: { type: DataTypes.JSON, allowNull: false },
  notes: { type: DataTypes.TEXT, allowNull: true },
  receivedBy: { type: DataTypes.INTEGER, allowNull: false },
  receivedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, {
  indexes: [
    { fields: ['purchaseOrderId'] },
    { fields: ['locationId', 'receivedAt'] },
  ],
});

export default PurchaseReceipt;
