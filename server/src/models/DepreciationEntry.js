import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

/**
 * One month's depreciation charge for one asset. Append-only.
 *
 * The unique (fixedAssetId, period) index IS the idempotency guarantee —
 * the background job, the admin "Run depreciation" button and a lazy
 * report read can all fire at once and the database will still only ever
 * hold one row per asset per month.
 *
 * `period` is the canonical key ('YYYY-MM'): a string, so it sorts and
 * compares correctly with plain < / > and needs no timezone reasoning.
 * `periodDate` is the last calendar day of that month, stored DATEONLY
 * purely so date-range report filters work like Expense.expenseDate.
 *
 * Writes NO CashTransaction — depreciation is non-cash by construction
 * and must never move a cash balance or a daybook total.
 */
const DepreciationEntry = sequelize.define('DepreciationEntry', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  fixedAssetId: { type: DataTypes.INTEGER, allowNull: false },
  period: { type: DataTypes.STRING(7), allowNull: false },       // 'YYYY-MM'
  periodDate: { type: DataTypes.DATEONLY, allowNull: false },    // last day of period
  amount: { type: DataTypes.DECIMAL(12, 3), allowNull: false },  // always positive
  bookValueAfter: { type: DataTypes.DECIMAL(12, 3), allowNull: false },
  method: { type: DataTypes.ENUM('straight_line'), defaultValue: 'straight_line' },
  runId: { type: DataTypes.STRING, allowNull: true },            // groups one run
  createdBy: { type: DataTypes.INTEGER, allowNull: true },       // null = system job
}, {
  indexes: [
    { unique: true, fields: ['fixedAssetId', 'period'], name: 'asset_period_unique' },
    { fields: ['periodDate'] },
    { fields: ['period'] },
    { fields: ['runId'] },
  ],
});

export default DepreciationEntry;
