import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

/**
 * Owner capital movements. Unlike depreciation these DO move cash — each
 * entry writes one CashTransaction (source='capital'):
 *   contribution → +amount into the account
 *   drawing      → −amount out of the account
 *
 * `amount` is always stored positive; `type` carries the direction.
 *
 * Never deleted — cancelling writes a reversing CashTransaction and flips
 * the status, matching the expense-cancel pattern in routes/finance.js.
 *
 * This is also the right home for start-up cash: recording it here gives
 * the balance sheet an equity counterpart, whereas editing a cash
 * account's openingBalance creates money from nowhere.
 */
const CapitalEntry = sequelize.define('CapitalEntry', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  entryNumber: { type: DataTypes.STRING, allowNull: false, unique: true },   // CAP-XXXX
  type: { type: DataTypes.ENUM('contribution', 'drawing'), allowNull: false },
  cashAccountId: { type: DataTypes.INTEGER, allowNull: false },
  amount: { type: DataTypes.DECIMAL(12, 3), allowNull: false },
  entryDate: { type: DataTypes.DATEONLY, allowNull: false },
  ownerName: { type: DataTypes.STRING, allowNull: true },
  description: { type: DataTypes.STRING, allowNull: true },
  reference: { type: DataTypes.STRING, allowNull: true },
  attachmentUrl: { type: DataTypes.STRING, allowNull: true },
  status: { type: DataTypes.ENUM('active', 'cancelled'), defaultValue: 'active' },
  createdBy: { type: DataTypes.INTEGER, allowNull: false },
}, {
  indexes: [
    { fields: ['entryDate'] },
    { fields: ['type'] },
    { fields: ['cashAccountId'] },
    { fields: ['status'] },
  ],
});

export default CapitalEntry;
