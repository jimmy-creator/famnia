import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

/**
 * A purchase order placed on a Supplier, expected at a Location.
 *
 * Workflow: draft -> sent -> partial (some items received) -> received.
 * Cancellable until any goods have been received.
 *
 * `items` is a snapshot of the order — productId, variantIndex, ordered
 * quantity, unit cost, line totals. `receivedQty` per line is tracked
 * here so we know when the PO is fully received; the actual stock-in
 * events live in PurchaseReceipt rows.
 *
 * Payment status is separate from receipt status: a PO can be fully
 * received but unpaid, or paid in advance but not yet received.
 */
const PurchaseOrder = sequelize.define('PurchaseOrder', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  poNumber: { type: DataTypes.STRING, allowNull: false, unique: true },
  supplierId: { type: DataTypes.INTEGER, allowNull: false },
  locationId: { type: DataTypes.INTEGER, allowNull: false },

  // [{ productId, variantIndex, name, sku, orderedQty, receivedQty,
  //    unitCost, taxRate, lineTotal }]
  items: { type: DataTypes.JSON, allowNull: false },

  subtotal: { type: DataTypes.DECIMAL(12, 3), defaultValue: 0 },
  taxAmount: { type: DataTypes.DECIMAL(12, 3), defaultValue: 0 },
  shippingCost: { type: DataTypes.DECIMAL(12, 3), defaultValue: 0 },
  discount: { type: DataTypes.DECIMAL(12, 3), defaultValue: 0 },
  totalAmount: { type: DataTypes.DECIMAL(12, 3), defaultValue: 0 },

  amountPaid: { type: DataTypes.DECIMAL(12, 3), defaultValue: 0 },

  status: {
    type: DataTypes.ENUM('draft', 'sent', 'partial', 'received', 'cancelled'),
    defaultValue: 'draft',
  },
  paymentStatus: {
    type: DataTypes.ENUM('unpaid', 'partial', 'paid'),
    defaultValue: 'unpaid',
  },

  expectedDate: { type: DataTypes.DATEONLY, allowNull: true },
  receivedDate: { type: DataTypes.DATE, allowNull: true },

  notes: { type: DataTypes.TEXT, allowNull: true },
  createdBy: { type: DataTypes.INTEGER, allowNull: false },
}, {
  indexes: [
    { fields: ['supplierId'] },
    { fields: ['locationId'] },
    { fields: ['status'] },
    { fields: ['paymentStatus'] },
  ],
});

export default PurchaseOrder;
