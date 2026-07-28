import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

/**
 * A payment made to a supplier — reduces their outstanding AP balance.
 *
 * Can be tied to a specific PurchaseOrder (most common) or be a
 * general advance / on-account payment with purchaseOrderId=null.
 *
 * `paymentMethod` is purely descriptive at this stage. In Phase C this
 * will write a corresponding CashTransaction so the cash account
 * reconciles.
 */
const SupplierPayment = sequelize.define('SupplierPayment', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  paymentNumber: { type: DataTypes.STRING, allowNull: false, unique: true },
  supplierId: { type: DataTypes.INTEGER, allowNull: false },
  purchaseOrderId: { type: DataTypes.INTEGER, allowNull: true },
  amount: { type: DataTypes.DECIMAL(12, 3), allowNull: false },
  paymentMethod: {
    type: DataTypes.ENUM('cash', 'bank', 'card', 'cheque', 'other'),
    defaultValue: 'cash',
  },
  reference: { type: DataTypes.STRING, allowNull: true },   // cheque #, txn ref
  notes: { type: DataTypes.TEXT, allowNull: true },
  paidBy: { type: DataTypes.INTEGER, allowNull: false },
  paidAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, {
  indexes: [
    { fields: ['supplierId'] },
    { fields: ['purchaseOrderId'] },
    { fields: ['paidAt'] },
  ],
});

export default SupplierPayment;
