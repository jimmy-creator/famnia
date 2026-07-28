import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

/**
 * Move money from one CashAccount to another — e.g. drawer to bank
 * deposit, or HQ float to a branch's petty cash.
 *
 * On create, the route writes a pair of CashTransaction rows:
 *   - from account: amount = -transfer.amount, source='transfer'
 *   - to account:   amount = +transfer.amount, source='transfer'
 * both pointing back at this transfer via sourceType='CashTransfer'.
 */
const CashTransfer = sequelize.define('CashTransfer', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  transferNumber: { type: DataTypes.STRING, allowNull: false, unique: true },
  fromAccountId: { type: DataTypes.INTEGER, allowNull: false },
  toAccountId: { type: DataTypes.INTEGER, allowNull: false },
  amount: { type: DataTypes.DECIMAL(12, 3), allowNull: false },
  transferDate: { type: DataTypes.DATEONLY, allowNull: false },
  notes: { type: DataTypes.TEXT, allowNull: true },
  status: {
    type: DataTypes.ENUM('completed', 'cancelled'),
    defaultValue: 'completed',
  },
  createdBy: { type: DataTypes.INTEGER, allowNull: false },
}, {
  indexes: [
    { fields: ['transferDate'] },
    { fields: ['fromAccountId'] },
    { fields: ['toAccountId'] },
  ],
});

export default CashTransfer;
