import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

/**
 * The unified money-movement ledger.
 *
 * Every row is one signed amount against one CashAccount:
 *   amount > 0  → money coming IN to the account
 *   amount < 0  → money going OUT of the account
 *
 * `source` is a coarse tag (sale, return, expense, supplier_payment,
 * transfer, opening, adjust) and `sourceType` + `sourceId` point to
 * the row that triggered the entry (Order, SalesReturn, Expense,
 * SupplierPayment, CashTransfer, manual).
 *
 * This is the source of truth for cash-account balances and the
 * backing query for Phase D's Daybook.
 */
const CashTransaction = sequelize.define('CashTransaction', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  cashAccountId: { type: DataTypes.INTEGER, allowNull: false },
  amount: { type: DataTypes.DECIMAL(12, 3), allowNull: false },
  source: {
    type: DataTypes.ENUM('sale', 'return', 'expense', 'supplier_payment',
                         'transfer', 'opening', 'adjust', 'other'),
    allowNull: false,
  },
  sourceType: { type: DataTypes.STRING, allowNull: true },  // 'Order', 'Expense' …
  sourceId: { type: DataTypes.INTEGER, allowNull: true },
  reference: { type: DataTypes.STRING, allowNull: true },   // e.g. order #, GRN #
  description: { type: DataTypes.STRING, allowNull: true },
  date: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  createdBy: { type: DataTypes.INTEGER, allowNull: true },
}, {
  indexes: [
    { fields: ['cashAccountId', 'date'] },
    { fields: ['source'] },
    { fields: ['sourceType', 'sourceId'] },
    { fields: ['date'] },
  ],
});

export default CashTransaction;
