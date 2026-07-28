import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const Pincode = sequelize.define('Pincode', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  pincode: {
    type: DataTypes.STRING(10),
    allowNull: false,
  },
  city: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  state: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  deliveryDays: {
    type: DataTypes.INTEGER,
    defaultValue: 7,
  },
  codAvailable: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
});

export default Pincode;
