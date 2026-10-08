import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';
import bcrypt from 'bcryptjs';

const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  email: {
    type: DataTypes.STRING,
    // Nullable so POS-created customers can be phone-only. Online
    // signups, admin, staff, and cashier all still require a value.
    // MySQL treats multiple NULLs as distinct so the unique index
    // still works on real addresses.
    allowNull: true,
    unique: true,
    validate: {
      isEmail(v) { if (v) {
        // Run the standard format check only when an email is supplied.
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new Error('Invalid email');
      } },
    },
  },
  password: {
    // Nullable for POS-created customers who never sign in online.
    type: DataTypes.STRING,
    allowNull: true,
  },
  role: {
    // 'delivery' = delivery staff: hub sign-in, sees only their own deliveries.
    type: DataTypes.ENUM('customer', 'admin', 'staff', 'cashier', 'delivery'),
    defaultValue: 'customer',
  },
  permissions: {
    // Staff permissions. Hub keys ("orders.create", …; see hub/permissions.js)
    // plus, until the old admin is retired, its legacy keys
    // ("products","orders","coupons","reviews","customers","analytics","categories","settings").
    type: DataTypes.JSON,
    defaultValue: null,
  },
  // Hub (staff back office) account fields. Customers and cashiers keep the
  // defaults and never see them.
  username: {
    // Optional staff login name; staff can sign in with it instead of email.
    // Unique index `user_username_unique` is added by the migration.
    type: DataTypes.STRING(32),
    allowNull: true,
  },
  status: {
    // Hub account state. Non-active hub accounts are refused by `protect`.
    type: DataTypes.ENUM('pending', 'active', 'suspended', 'deactivated'),
    allowNull: false,
    defaultValue: 'active',
  },
  mustChangePassword: {
    // Set when an admin issues a temporary password; the hub forces a change.
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  approvedBy: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  approvedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  lastLoginAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  passwordChangedAt: {
    // Tokens issued before this instant are rejected by `protect`, so a
    // password change signs out every other device.
    type: DataTypes.DATE,
    allowNull: true,
  },
  pin: {
    // 4-6 digit PIN for cashier quick-login at the POS terminal.
    // Stored hashed (bcrypt) — never plaintext. Only used for role='cashier'.
    type: DataTypes.STRING,
    allowNull: true,
  },
  homeLocationId: {
    // Cashier's default store. POS suggests this Location when starting
    // a shift, but the cashier can override.
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  // Cashier with manager privileges — can approve POS overrides
  // (large discounts, large refunds). Admin role is implicitly a
  // manager regardless of this flag.
  isManager: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  address: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  resetToken: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  resetTokenExpiry: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  hooks: {
    beforeCreate: async (user) => {
      if (user.password) user.password = await bcrypt.hash(user.password, 12);
      if (user.pin) user.pin = await bcrypt.hash(user.pin, 10);
    },
    beforeUpdate: async (user) => {
      if (user.changed('password') && user.password) {
        user.password = await bcrypt.hash(user.password, 12);
      }
      if (user.changed('pin') && user.pin) {
        user.pin = await bcrypt.hash(user.pin, 10);
      }
    },
  },
});

User.prototype.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

User.prototype.comparePin = async function (candidatePin) {
  if (!this.pin) return false;
  return bcrypt.compare(String(candidatePin), this.pin);
};

User.prototype.toJSON = function () {
  const values = { ...this.get() };
  delete values.password;
  delete values.resetToken;
  delete values.resetTokenExpiry;
  return values;
};

export default User;
