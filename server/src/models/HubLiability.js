import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

/**
 * Money the business owes a person who paid for an expense or asset
 * personally. `reimbursed` is the running total of HubReimbursement rows;
 * the outstanding balance shows on the balance sheet as a liability.
 */
const HubLiability = sequelize.define('HubLiability', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  entryId: { type: DataTypes.INTEGER, allowNull: false, unique: true },
  person: { type: DataTypes.STRING(120), allowNull: false },
  amount: { type: DataTypes.DECIMAL(12, 3), allowNull: false },
  reimbursed: { type: DataTypes.DECIMAL(12, 3), allowNull: false, defaultValue: 0 },
  status: { type: DataTypes.ENUM('pending', 'partially_paid', 'paid'), allowNull: false, defaultValue: 'pending' },
  notes: { type: DataTypes.TEXT, allowNull: true },
  createdBy: { type: DataTypes.INTEGER, allowNull: true },
});

export default HubLiability;
