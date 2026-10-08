import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

/** Field-level change history of an order (hub "Change history"). Append-only. */
const OrderAuditLog = sequelize.define('OrderAuditLog', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  orderId: { type: DataTypes.INTEGER, allowNull: false },
  field: { type: DataTypes.STRING, allowNull: false },
  oldValue: { type: DataTypes.TEXT, allowNull: true },
  newValue: { type: DataTypes.TEXT, allowNull: true },
  changedBy: { type: DataTypes.INTEGER, allowNull: true },
  staffName: { type: DataTypes.STRING, allowNull: true },
}, {
  updatedAt: false,
  indexes: [{ fields: ['orderId', 'createdAt'] }],
});

export default OrderAuditLog;
