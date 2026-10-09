import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

/**
 * A FEMNIA Hub "Expenses & Assets" entry, kept in the hub's vocabulary
 * (funding source, purchased by, purchase person). Company-funded entries
 * also write the classic record — an Expense (expenseId) or a FixedAsset
 * (fixedAssetId) with its cash-ledger debit — so P&L, the daybook and the
 * balance sheet see them. "Paid Personally" entries open a HubLiability
 * instead; their cash moves only when it is reimbursed.
 */
const HubExpenseEntry = sequelize.define('HubExpenseEntry', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  entryType: { type: DataTypes.ENUM('expense', 'asset'), allowNull: false },
  reference: { type: DataTypes.STRING(40), allowNull: false, unique: true },
  txnDate: { type: DataTypes.DATEONLY, allowNull: false },
  category: { type: DataTypes.STRING(80), allowNull: false },
  item: { type: DataTypes.STRING(200), allowNull: false },
  amount: { type: DataTypes.DECIMAL(12, 3), allowNull: false },
  purchasedBy: { type: DataTypes.STRING(120), allowNull: true },
  purchasePerson: { type: DataTypes.STRING(120), allowNull: true },
  payee: { type: DataTypes.STRING(120), allowNull: true },
  paymentMethod: { type: DataTypes.STRING(30), allowNull: false },
  fundingSource: { type: DataTypes.STRING(40), allowNull: false },
  cashAccountId: { type: DataTypes.INTEGER, allowNull: true },
  receiptReference: { type: DataTypes.STRING(80), allowNull: true },
  notes: { type: DataTypes.TEXT, allowNull: true },
  expenseId: { type: DataTypes.INTEGER, allowNull: true },
  fixedAssetId: { type: DataTypes.INTEGER, allowNull: true },
  idempotencyKey: { type: DataTypes.STRING(120), allowNull: true, unique: true },
  createdBy: { type: DataTypes.INTEGER, allowNull: true },
  // Voided entries stay for the audit trail but drop out of lists, totals and P&L.
  voidedAt: { type: DataTypes.DATE, allowNull: true },
  voidReason: { type: DataTypes.STRING(200), allowNull: true },
  voidedBy: { type: DataTypes.INTEGER, allowNull: true },
}, {
  indexes: [{ fields: ['entryType', 'txnDate'] }],
});

export default HubExpenseEntry;
