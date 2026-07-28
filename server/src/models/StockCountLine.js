import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

/**
 * One product/variant line in a StockCount.
 *
 * expectedQty snapshots ProductStock.quantity when the line is added.
 * countedQty is set by the user as they scan/enter. variance is
 * computed (countedQty - expectedQty) and persisted on post so reports
 * stay accurate even if stock changes later.
 *
 * costPrice snapshots Product.costPrice at the moment of post so the
 * shrinkage Expense value is fixed.
 */
const StockCountLine = sequelize.define('StockCountLine', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  stockCountId: { type: DataTypes.INTEGER, allowNull: false },
  productId: { type: DataTypes.INTEGER, allowNull: false },
  variantIndex: { type: DataTypes.INTEGER, allowNull: true },
  sku: { type: DataTypes.STRING, allowNull: true },
  name: { type: DataTypes.STRING, allowNull: true },
  expectedQty: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  countedQty: { type: DataTypes.INTEGER, allowNull: true },
  variance: { type: DataTypes.INTEGER, allowNull: true },
  costPrice: { type: DataTypes.DECIMAL(12, 3), allowNull: true },
  varianceValue: { type: DataTypes.DECIMAL(12, 3), allowNull: true },
  reason: { type: DataTypes.STRING, allowNull: true },
}, {
  indexes: [
    { fields: ['stockCountId'] },
    { fields: ['productId'] },
  ],
});

export default StockCountLine;
