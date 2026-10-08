import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

/**
 * One hub spreadsheet import (New Products / Stock In / Mixed) — the hub's own
 * import, separate from routes/bulkProducts.js. Products and stock movements
 * it creates carry its id so the batch can be reported on and reversed.
 */
const ImportBatch = sequelize.define('ImportBatch', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  batchType: { type: DataTypes.STRING(20), allowNull: false },   // new_products | stock_in | mixed
  filename: { type: DataTypes.STRING, allowNull: false },
  fileHash: { type: DataTypes.STRING(64), allowNull: true },
  // Processing | Completed | Completed with Errors | Failed | Reversed
  status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'Processing' },
  totalRows: { type: DataTypes.INTEGER, defaultValue: 0 },
  successRows: { type: DataTypes.INTEGER, defaultValue: 0 },
  failedRows: { type: DataTypes.INTEGER, defaultValue: 0 },
  unitsAdded: { type: DataTypes.INTEGER, defaultValue: 0 },
  totalCost: { type: DataTypes.DECIMAL(14, 3), defaultValue: 0 },
  skus: { type: DataTypes.JSON, allowNull: true },
  report: { type: DataTypes.JSON, allowNull: true },
  reversedAt: { type: DataTypes.DATE, allowNull: true },
  reversedBy: { type: DataTypes.INTEGER, allowNull: true },
  reverseReason: { type: DataTypes.STRING(500), allowNull: true },
  createdBy: { type: DataTypes.INTEGER, allowNull: true },
}, {
  indexes: [{ fields: ['fileHash'] }],
});

export default ImportBatch;
