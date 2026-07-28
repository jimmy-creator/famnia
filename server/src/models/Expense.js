import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

/**
 * Non-stock spending — rent, salaries, utilities, etc.
 *
 * `cashAccountId` is which account the money comes out of (drawer,
 * petty cash, bank). On create, an out-of-account CashTransaction
 * is written for amount = -expense.amount so balances reconcile.
 *
 * `locationId` is for cost-allocation reporting (which store ate
 * this expense). Optional — head-office expenses won't have one.
 */
const Expense = sequelize.define('Expense', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  expenseNumber: { type: DataTypes.STRING, allowNull: false, unique: true },
  expenseCategoryId: { type: DataTypes.INTEGER, allowNull: false },
  locationId: { type: DataTypes.INTEGER, allowNull: true },
  cashAccountId: { type: DataTypes.INTEGER, allowNull: false },
  amount: { type: DataTypes.DECIMAL(12, 3), allowNull: false },
  paymentMethod: {
    type: DataTypes.ENUM('cash', 'card', 'bank', 'cheque', 'other'),
    defaultValue: 'cash',
  },
  description: { type: DataTypes.STRING, allowNull: false },
  reference: { type: DataTypes.STRING, allowNull: true },    // invoice #
  expenseDate: { type: DataTypes.DATEONLY, allowNull: false },
  attachmentUrl: { type: DataTypes.STRING, allowNull: true },
  notes: { type: DataTypes.TEXT, allowNull: true },
  status: {
    type: DataTypes.ENUM('paid', 'cancelled'),
    defaultValue: 'paid',
  },
  createdBy: { type: DataTypes.INTEGER, allowNull: false },
}, {
  indexes: [
    { fields: ['expenseDate'] },
    { fields: ['expenseCategoryId'] },
    { fields: ['locationId'] },
    { fields: ['cashAccountId'] },
    { fields: ['status'] },
  ],
});

export default Expense;
