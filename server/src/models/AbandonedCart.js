import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const AbandonedCart = sequelize.define('AbandonedCart', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  items: {
    type: DataTypes.JSON,
    allowNull: false,
  },
  cartTotal: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
  },
  emailSent: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  emailSentAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  recovered: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  recoveredAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
});

export default AbandonedCart;
