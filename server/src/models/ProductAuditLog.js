import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

/** Field-level product change history, per SKU (hub "Product changes"). Append-only. */
const ProductAuditLog = sequelize.define('ProductAuditLog', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  productId: { type: DataTypes.INTEGER, allowNull: false },
  variantIndex: { type: DataTypes.INTEGER, allowNull: true },
  sku: { type: DataTypes.STRING, allowNull: true },
  field: { type: DataTypes.STRING, allowNull: false },
  oldValue: { type: DataTypes.TEXT, allowNull: true },
  newValue: { type: DataTypes.TEXT, allowNull: true },
  changedBy: { type: DataTypes.INTEGER, allowNull: true },
}, {
  updatedAt: false,
  indexes: [{ fields: ['productId', 'variantIndex'] }],
});

export default ProductAuditLog;
