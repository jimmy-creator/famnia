import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

/**
 * A long-lived non-stock asset — shop fittings, POS hardware, a van.
 *
 * Depreciated straight-line at `depreciationRate` per YEAR, accrued one
 * twelfth per month into DepreciationEntry rows. Net book value =
 * cost − Σ DepreciationEntry.amount. `accumulatedDepreciation` is a
 * cached rollup for list queries; DepreciationEntry stays authoritative.
 *
 * Depreciation is a NON-CASH charge: the run NEVER writes a
 * CashTransaction. Only the acquisition (when paid from an account) and
 * any disposal proceeds move cash.
 *
 * Convention: an asset earns a FULL month's depreciation in the month it
 * was acquired, however late in the month that was. Chosen over
 * day-pro-rating for simplicity; the acquire form says so explicitly.
 *
 * `depreciationStartMonth` is a 'YYYY-MM' STRING, not a date, so month
 * arithmetic and comparison are timezone-proof.
 */
const FixedAsset = sequelize.define('FixedAsset', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  assetNumber: { type: DataTypes.STRING, allowNull: false, unique: true },   // FA-XXXX
  name: { type: DataTypes.STRING, allowNull: false },
  category: {
    type: DataTypes.ENUM('furniture', 'fixtures', 'equipment', 'computer',
      'vehicle', 'leasehold', 'other'),
    defaultValue: 'equipment',
  },
  locationId: { type: DataTypes.INTEGER, allowNull: true },
  supplierId: { type: DataTypes.INTEGER, allowNull: true },

  acquisitionDate: { type: DataTypes.DATEONLY, allowNull: false },
  cost: { type: DataTypes.DECIMAL(12, 3), allowNull: false },
  salvageValue: { type: DataTypes.DECIMAL(12, 3), defaultValue: 0 },
  // Percent per YEAR. 20 = fully written down over 5 years.
  depreciationRate: { type: DataTypes.DECIMAL(6, 3), defaultValue: 20 },
  // Canonical 'YYYY-MM' of the first month to charge. Defaults to the
  // month of acquisitionDate.
  depreciationStartMonth: { type: DataTypes.STRING(7), allowNull: false },
  method: { type: DataTypes.ENUM('straight_line'), defaultValue: 'straight_line' },
  // Cached rollup — recompute from DepreciationEntry for anything that matters.
  accumulatedDepreciation: { type: DataTypes.DECIMAL(12, 3), defaultValue: 0 },

  status: {
    type: DataTypes.ENUM('active', 'fully_depreciated', 'disposed', 'written_off'),
    defaultValue: 'active',
  },

  // Which account paid for it, if any. Null is legitimate (the owner
  // bought it personally) but shows up as a balance-sheet reconciling item.
  cashAccountId: { type: DataTypes.INTEGER, allowNull: true },

  disposalDate: { type: DataTypes.DATEONLY, allowNull: true },
  disposalProceeds: { type: DataTypes.DECIMAL(12, 3), allowNull: true },
  disposalCashAccountId: { type: DataTypes.INTEGER, allowNull: true },
  disposalGainLoss: { type: DataTypes.DECIMAL(12, 3), allowNull: true },   // + gain, − loss
  disposalNotes: { type: DataTypes.TEXT, allowNull: true },

  serialNumber: { type: DataTypes.STRING, allowNull: true },
  attachmentUrl: { type: DataTypes.STRING, allowNull: true },
  notes: { type: DataTypes.TEXT, allowNull: true },
  createdBy: { type: DataTypes.INTEGER, allowNull: false },
}, {
  indexes: [
    { fields: ['status'] },
    { fields: ['acquisitionDate'] },
    { fields: ['locationId'] },
    { fields: ['category'] },
    { fields: ['disposalDate'] },
  ],
});

export default FixedAsset;
