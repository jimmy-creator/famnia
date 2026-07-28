import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

/**
 * Physical stock count (a.k.a. cycle count) at a Location.
 *
 * Lifecycle:
 *   draft       → admin started a sheet, lines being entered
 *   in_progress → at least one line counted (UI hint; same write rules as draft)
 *   posted      → variance applied to ProductStock; locked
 *   cancelled   → never posted, lines kept for audit
 *
 * Variance value posts as a single Expense (shrinkage) when total
 * counted < total expected, valued at productCost. Surplus skips the
 * expense write.
 */
const StockCount = sequelize.define('StockCount', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  countNumber: { type: DataTypes.STRING, allowNull: false, unique: true },
  locationId: { type: DataTypes.INTEGER, allowNull: false },
  status: {
    type: DataTypes.ENUM('draft', 'in_progress', 'posted', 'cancelled'),
    defaultValue: 'draft',
  },
  scope: {
    // 'full' = all SKUs at the location; 'partial' = only listed SKUs.
    // Affects whether unscanned SKUs are treated as 0-counted on post.
    type: DataTypes.ENUM('full', 'partial'),
    defaultValue: 'partial',
  },
  notes: { type: DataTypes.TEXT, allowNull: true },
  shrinkageExpenseId: { type: DataTypes.INTEGER, allowNull: true },
  totalVarianceQty: { type: DataTypes.INTEGER, defaultValue: 0 },
  totalVarianceValue: { type: DataTypes.DECIMAL(12, 3), defaultValue: 0 },
  createdBy: { type: DataTypes.INTEGER, allowNull: false },
  postedBy: { type: DataTypes.INTEGER, allowNull: true },
  postedAt: { type: DataTypes.DATE, allowNull: true },
  managerOverrideBy: { type: DataTypes.INTEGER, allowNull: true },
}, {
  indexes: [
    { fields: ['locationId'] },
    { fields: ['status'] },
    { fields: ['createdAt'] },
  ],
});

export default StockCount;
