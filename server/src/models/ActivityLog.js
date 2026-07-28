import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

/**
 * Append-only audit log.
 *
 * Written from any route that performs a sensitive action — POS sale,
 * sales return, cash adjustment, PO cancel/receive/pay, expense
 * cancel, manager-override approvals. Never updated or deleted.
 *
 * `details` is a free-form JSON blob — the route decides what to
 * snapshot (amounts, items, before/after values, etc.) but should
 * keep it small.
 */
const ActivityLog = sequelize.define('ActivityLog', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  userId: { type: DataTypes.INTEGER, allowNull: true },           // actor
  action: { type: DataTypes.STRING, allowNull: false },           // e.g. 'pos_sale', 'discount_override'
  entityType: { type: DataTypes.STRING, allowNull: true },        // 'Order', 'SalesReturn', 'Expense', etc.
  entityId: { type: DataTypes.INTEGER, allowNull: true },
  details: { type: DataTypes.JSON, allowNull: true },
  managerOverrideBy: { type: DataTypes.INTEGER, allowNull: true },// User.id who approved (if applicable)
  locationId: { type: DataTypes.INTEGER, allowNull: true },
  cashierSessionId: { type: DataTypes.INTEGER, allowNull: true },
  reason: { type: DataTypes.STRING, allowNull: true },
  ip: { type: DataTypes.STRING, allowNull: true },
}, {
  updatedAt: false,                 // append-only
  indexes: [
    { fields: ['action', 'createdAt'] },
    { fields: ['userId', 'createdAt'] },
    { fields: ['entityType', 'entityId'] },
    { fields: ['locationId', 'createdAt'] },
  ],
});

export default ActivityLog;
