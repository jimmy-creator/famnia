import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

/**
 * One cashier shift at one Location.
 *
 * Opened with declared `openingCash` (counted by cashier before sales).
 * Closed with declared `closingCash` — variance = closingCash -
 * (openingCash + cash sales - cash refunds) tells you if the drawer is
 * over/short.
 *
 * Orders fired through the POS during this shift reference the session
 * via Order.cashierSessionId for per-cashier reporting.
 */
const CashierSession = sequelize.define('CashierSession', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  locationId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  openingCash: {
    type: DataTypes.DECIMAL(12, 3),     // KWD has 3 decimal places
    defaultValue: 0,
  },
  closingCash: {
    type: DataTypes.DECIMAL(12, 3),
    allowNull: true,
  },
  // Computed at close-shift time; positive = drawer over, negative = short.
  cashVariance: {
    type: DataTypes.DECIMAL(12, 3),
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('open', 'closed'),
    defaultValue: 'open',
  },
  openedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  closedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
}, {
  indexes: [
    { fields: ['userId', 'status'] },     // quick lookup: "is this cashier currently open?"
    { fields: ['locationId', 'status'] }, // and: "any open sessions at this store?"
  ],
});

export default CashierSession;
