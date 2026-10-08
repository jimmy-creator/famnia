import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

/**
 * One repayment of a HubLiability out of a company cash account. It writes
 * the cash-ledger debit (cashTransactionId) but never a second Expense or
 * FixedAsset — the entry itself already counted.
 */
const HubReimbursement = sequelize.define('HubReimbursement', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  liabilityId: { type: DataTypes.INTEGER, allowNull: false },
  paidOn: { type: DataTypes.DATEONLY, allowNull: false },
  amount: { type: DataTypes.DECIMAL(12, 3), allowNull: false },
  paymentMethod: { type: DataTypes.STRING(30), allowNull: false },
  fundingSource: { type: DataTypes.STRING(40), allowNull: false },
  cashAccountId: { type: DataTypes.INTEGER, allowNull: false },
  cashTransactionId: { type: DataTypes.INTEGER, allowNull: true },
  reference: { type: DataTypes.STRING(80), allowNull: true },
  notes: { type: DataTypes.TEXT, allowNull: true },
  idempotencyKey: { type: DataTypes.STRING(120), allowNull: true, unique: true },
  createdBy: { type: DataTypes.INTEGER, allowNull: true },
}, {
  indexes: [{ fields: ['liabilityId'] }],
});

export default HubReimbursement;
