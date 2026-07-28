import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const Product = sequelize.define('Product', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  slug: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  code: {
    // Internal product code / SKU for admin/staff reference (not customer-facing)
    type: DataTypes.STRING,
    allowNull: true,
    unique: 'product_code_unique',
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  // Optional Arabic translations — used by store4 (Anfal Kuwait).
  // Storefront falls back to `name` / `description` if these are null.
  nameAr: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  descriptionAr: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  price: {
    // 3 decimals so KWD (fils) stores exactly; 2-decimal currencies (INR/AED)
    // are unaffected. Display precision is controlled client-side by
    // VITE_CURRENCY_DECIMALS / formatPrice().
    type: DataTypes.DECIMAL(10, 3),
    allowNull: false,
  },
  comparePrice: {
    type: DataTypes.DECIMAL(10, 3),
    allowNull: true,
  },
  // Cost price for COGS / margin reporting (Phase D). Snapshotted into
  // Order.items at sale time so historical P&L is stable when cost
  // changes later.
  costPrice: {
    type: DataTypes.DECIMAL(10, 3),
    allowNull: true,
  },
  category: {
    // PRIMARY category (denormalized). Read everywhere — POS, finance,
    // coupon rules, shiprocket, sitemap, related products. Always kept equal
    // to categories[0] by the beforeValidate hook below.
    type: DataTypes.STRING,
    allowNull: false,
  },
  categories: {
    // Full set of categories this product belongs to (array of category
    // names). categories[0] mirrors `category`. A product matches a storefront
    // ?category=X filter if X is its primary OR appears in this array.
    type: DataTypes.JSON,
    defaultValue: [],
  },
  brand: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  stock: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  images: {
    type: DataTypes.JSON,
    defaultValue: [],
  },
  featured: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  ratings: {
    type: DataTypes.DECIMAL(3, 2),
    defaultValue: 0,
  },
  numReviews: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  taxable: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  taxRate: {
    // VAT rate (%): 0 (zero-rated/exempt) or 5 (standard UAE VAT)
    type: DataTypes.DECIMAL(5, 2),
    defaultValue: 0,
  },
  hsnCode: {
    // Harmonized System code (optional; for tax/customs classification)
    type: DataTypes.STRING,
    allowNull: true,
  },
  weight: {
    // Net weight per unit in kilograms. Used by Shiprocket Checkout for
    // shipping rate calculation. Falls back to 0.1 (100g) if null.
    type: DataTypes.DECIMAL(8, 3),
    allowNull: true,
  },
  variantOptions: {
    // e.g. { "Size": ["S","M","L"], "Color": ["Red","Blue"] }
    type: DataTypes.JSON,
    defaultValue: null,
  },
  variants: {
    // e.g. [{ options: {Size:"M",Color:"Red"}, sku:"SKU-M-RED", price:null, stock:10 }]
    type: DataTypes.JSON,
    defaultValue: null,
  },
});

// Keep the denormalized primary `category` in sync with the `categories`
// array so the rest of the app (which only reads `category`) never breaks:
//   - categories[0] is the primary
//   - `category` is always present in `categories`
//   - if only `category` was set (legacy rows, bulk CSV), seed the array from it
// Runs on create AND update for every code path (controller, bulk import, POS).
Product.beforeValidate((product) => {
  let cats = Array.isArray(product.categories) ? product.categories : [];
  cats = [...new Set(cats.map((c) => (typeof c === 'string' ? c.trim() : '')).filter(Boolean))];
  if (cats.length === 0 && product.category) cats = [product.category];
  if (cats.length > 0) product.category = cats[0];
  product.categories = cats;
});

export default Product;
