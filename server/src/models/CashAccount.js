import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

/**
 * Any account that holds money — a cash drawer, petty cash, bank,
 * card-terminal float, etc. Balance is computed at query time as
 * openingBalance + SUM(CashTransaction.amount) where signs convey
 * direction (positive = money in, negative = money out).
 *
 * `locationId` is optional: a drawer belongs to a specific location,
 * a bank account usually doesn't.
 */
const CashAccount = sequelize.define('CashAccount', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING, allowNull: false },
  code: { type: DataTypes.STRING, allowNull: true, unique: true },
  type: {
    type: DataTypes.ENUM('drawer', 'petty_cash', 'bank', 'card_terminal', 'knet_terminal', 'other'),
    allowNull: false,
    defaultValue: 'drawer',
  },
  locationId: { type: DataTypes.INTEGER, allowNull: true },
  openingBalance: { type: DataTypes.DECIMAL(12, 3), defaultValue: 0 },
  notes: { type: DataTypes.TEXT, allowNull: true },
  active: { type: DataTypes.BOOLEAN, defaultValue: true },
}, {
  indexes: [
    { fields: ['type'] },
    { fields: ['locationId'] },
    { fields: ['active'] },
  ],
});

export default CashAccount;
