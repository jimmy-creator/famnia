import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

/**
 * Physical store, warehouse or virtual location for inventory.
 *
 * For Anfal Sports: two retail stores (Yaal Mall + Branch 2).
 * `isOnlineDefault` marks the location that absorbs online-order
 * stock decrements when the order doesn't specify a fulfilment store.
 */
const Location = sequelize.define('Location', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  code: {
    // Short code for receipts / labels (e.g. "YAAL", "BR2")
    type: DataTypes.STRING(20),
    allowNull: true,
    unique: 'location_code_unique',
  },
  type: {
    type: DataTypes.ENUM('store', 'warehouse'),
    defaultValue: 'store',
  },
  address: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  isOnlineDefault: {
    // The location whose stock absorbs online order decrements when
    // the order doesn't specify a fulfilment location. Exactly one
    // location should have this true.
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  sortOrder: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
});

export default Location;
