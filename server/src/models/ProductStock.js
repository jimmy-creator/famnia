import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

/**
 * Per-location stock for a product (or product variant).
 *
 * One row per (productId, variantIndex, locationId). variantIndex is
 * null for products with no variants — matches index into the JSON
 * `Product.variants` array otherwise.
 *
 * Product.stock is kept in sync via afterCreate/afterUpdate/afterDestroy
 * hooks in models/index.js (sum of all ProductStock rows for a product)
 * so legacy code that reads Product.stock continues to work.
 */
const ProductStock = sequelize.define('ProductStock', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  productId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  variantIndex: {
    // null = base product (no variants). Otherwise index into Product.variants[].
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  locationId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  quantity: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  reorderThreshold: {
    // Optional per-location low-stock alert level.
    type: DataTypes.INTEGER,
    allowNull: true,
  },
}, {
  indexes: [
    // One row per (product, variant, location) — enforces idempotent upserts.
    { unique: true, fields: ['productId', 'variantIndex', 'locationId'], name: 'product_variant_location_unique' },
    { fields: ['locationId'] },
    { fields: ['productId'] },
  ],
});

export default ProductStock;
