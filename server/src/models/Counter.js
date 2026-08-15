import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

/**
 * Named monotonic counters for human-facing sequence numbers (e.g. the
 * POS invoice sequence "INV-49456"). Read + bumped inside the caller's
 * transaction with a FOR UPDATE row lock so concurrent sales can't collide.
 */
const Counter = sequelize.define('Counter', {
  name: {
    type: DataTypes.STRING,
    primaryKey: true,
    allowNull: false,
  },
  value: {
    type: DataTypes.BIGINT,
    allowNull: false,
    defaultValue: 0,
  },
});

export default Counter;
