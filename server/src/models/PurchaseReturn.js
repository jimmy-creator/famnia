import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

/**
 * Stock being returned to a Supplier (defective, over-ordered, etc).
 *
 * Decrements ProductStock at the originating Location. The corresponding
 * money movement is one of:
 *   - credit_note: supplier issues a credit, reducing AP balance (no
 *     immediate cash movement). Most common.
 *   - cash / bank: supplier refunds the cash. Tied to a CashAccount
 *     in Phase C.
 *
 * Optional purchaseOrderId links the return to the PO the goods came
 * in on; if null this is a standalone return (e.g. found defective
 * stock with no traceable PO).
 */
const PurchaseReturn = sequelize.define('PurchaseReturn', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  returnNumber: { type: DataTypes.STRING, allowNull: false, unique: true },
  supplierId: { type: DataTypes.INTEGER, allowNull: false },
  purchaseOrderId: { type: DataTypes.INTEGER, allowNull: true },
  locationId: { type: DataTypes.INTEGER, allowNull: false },

  // [{ productId, variantIndex, name, quantity, unitCost, refundAmount }]
  items: { type: DataTypes.JSON, allowNull: false },

  totalAmount: { type: DataTypes.DECIMAL(12, 3), defaultValue: 0 },
  refundMethod: {
    type: DataTypes.ENUM('credit_note', 'cash', 'bank'),
    defaultValue: 'credit_note',
  },
  reason: { type: DataTypes.STRING, allowNull: true },
  notes: { type: DataTypes.TEXT, allowNull: true },
  status: {
    type: DataTypes.ENUM('completed', 'cancelled'),
    defaultValue: 'completed',
  },
  createdBy: { type: DataTypes.INTEGER, allowNull: false },
}, {
  indexes: [
    { fields: ['supplierId'] },
    { fields: ['purchaseOrderId'] },
    { fields: ['locationId', 'createdAt'] },
  ],
});

export default PurchaseReturn;
