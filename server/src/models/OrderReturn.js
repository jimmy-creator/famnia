import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

/**
 * A line returned on a sales order from the staff hub. Separate from
 * SalesReturn (the till's refund flow): a hub return records the goods coming
 * back and optionally restocks them; money is handled on the order's payment.
 */
const OrderReturn = sequelize.define('OrderReturn', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  orderId: { type: DataTypes.INTEGER, allowNull: false },
  lineIndex: { type: DataTypes.INTEGER, allowNull: false },
  productId: { type: DataTypes.INTEGER, allowNull: true },
  variantIndex: { type: DataTypes.INTEGER, allowNull: true },
  sku: { type: DataTypes.STRING, allowNull: true },
  quantity: { type: DataTypes.INTEGER, allowNull: false },
  reason: { type: DataTypes.STRING(120), allowNull: false },
  restock: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  notes: { type: DataTypes.TEXT, allowNull: true },
  createdBy: { type: DataTypes.INTEGER, allowNull: true },
}, {
  updatedAt: false,
  indexes: [{ fields: ['orderId'] }],
});

export default OrderReturn;
