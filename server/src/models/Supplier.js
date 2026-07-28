import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

/**
 * Supplier (vendor) master record.
 *
 * The current outstanding balance is computed at query time rather than
 * stored, since multiple flows (PO totals, payments, returns) all move
 * the number — keeping a denormalised field would require careful
 * invalidation everywhere. `openingBalance` lets you seed an existing
 * AP balance when onboarding a supplier mid-history.
 */
const Supplier = sequelize.define('Supplier', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING, allowNull: false },
  code: { type: DataTypes.STRING, allowNull: true, unique: true },
  contactPerson: { type: DataTypes.STRING, allowNull: true },
  email: { type: DataTypes.STRING, allowNull: true },
  phone: { type: DataTypes.STRING, allowNull: true },
  address: { type: DataTypes.TEXT, allowNull: true },
  city: { type: DataTypes.STRING, allowNull: true },
  country: { type: DataTypes.STRING, allowNull: true },
  taxId: { type: DataTypes.STRING, allowNull: true },
  paymentTerms: {
    type: DataTypes.ENUM('cash', 'net15', 'net30', 'net45', 'net60', 'net90'),
    defaultValue: 'cash',
  },
  // AP that existed when this supplier was added to the system.
  openingBalance: { type: DataTypes.DECIMAL(12, 3), defaultValue: 0 },
  creditLimit: { type: DataTypes.DECIMAL(12, 3), allowNull: true },
  notes: { type: DataTypes.TEXT, allowNull: true },
  active: { type: DataTypes.BOOLEAN, defaultValue: true },
}, {
  indexes: [
    { fields: ['name'] },
    { fields: ['active'] },
  ],
});

export default Supplier;
