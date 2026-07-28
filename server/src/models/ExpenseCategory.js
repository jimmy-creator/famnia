import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const ExpenseCategory = sequelize.define('ExpenseCategory', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING, allowNull: false, unique: true },
  code: { type: DataTypes.STRING, allowNull: true, unique: true },
  active: { type: DataTypes.BOOLEAN, defaultValue: true },
}, {
  indexes: [{ fields: ['active'] }],
});

export default ExpenseCategory;
