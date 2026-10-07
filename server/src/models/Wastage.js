import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

/**
 * Stock written off outside of a sale — damaged, defective, lost or stolen
 * stock, or pieces given away as samples.
 *
 * This is the number that silently eats the margin, so it gets its own log
 * rather than being buried in stock-count variance: a stock count tells you
 * stock went missing, a wastage entry tells you why it went and who
 * authorised it.
 *
 * Posting deducts ProductStock and, when an expense category + cash account
 * are supplied, books the cost as an Expense so it lands in the P&L. That
 * mirrors how StockCount posts its shrinkage — see routes/stockCounts.js.
 */
const Wastage = sequelize.define('Wastage', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  wastageNumber: { type: DataTypes.STRING, allowNull: false, unique: true },

  productId: { type: DataTypes.INTEGER, allowNull: false },
  variantIndex: { type: DataTypes.INTEGER, allowNull: true },
  locationId: { type: DataTypes.INTEGER, allowNull: false },

  quantity: { type: DataTypes.DECIMAL(12, 3), allowNull: false },

  // Snapshotted so the write-off value is fixed at the moment it happened.
  costPrice: { type: DataTypes.DECIMAL(10, 3), allowNull: true },
  totalCost: { type: DataTypes.DECIMAL(12, 3), defaultValue: 0 },

  reason: {
    type: DataTypes.ENUM('damaged', 'defective', 'lost', 'theft', 'sample', 'other'),
    allowNull: false,
    defaultValue: 'damaged',
  },
  notes: { type: DataTypes.TEXT, allowNull: true },

  wastageDate: { type: DataTypes.DATEONLY, allowNull: false },

  status: {
    type: DataTypes.ENUM('posted', 'cancelled'),
    defaultValue: 'posted',
  },

  // Set when the write-off was booked to the P&L.
  expenseId: { type: DataTypes.INTEGER, allowNull: true },

  createdBy: { type: DataTypes.INTEGER, allowNull: false },
  // Write-offs above the configured value threshold need a manager PIN,
  // reusing verifyManagerPin() from models/index.js.
  managerOverrideBy: { type: DataTypes.INTEGER, allowNull: true },
}, {
  indexes: [
    { fields: ['productId'] },
    { fields: ['locationId'] },
    { fields: ['wastageDate'] },
    { fields: ['reason'] },
    { fields: ['status'] },
  ],
});

export default Wastage;
