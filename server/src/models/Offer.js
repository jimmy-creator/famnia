import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

/**
 * A timed sale on chosen products ("National Day", "Weekend offer"). While it
 * runs, the storefront shows and charges the offer price — see
 * services/offers.js. Hub orders and the till keep the normal price; the hub
 * only offers it as a one-click choice.
 */
const Offer = sequelize.define('Offer', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING(120), allowNull: false },
  // Store-local (Asia/Qatar) instants; the offer runs startsAt <= now < endsAt.
  startsAt: { type: DataTypes.DATE, allowNull: false },
  endsAt: { type: DataTypes.DATE, allowNull: false },
  // 'percent': every listed product is `discountValue`% off (sizes keep their own price differences).
  // 'price': each item carries its own offer price for all its sizes / colours.
  discountType: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'percent' },
  discountValue: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
  // [{ productId, price? }]
  items: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
  active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  createdBy: { type: DataTypes.INTEGER, allowNull: true },
}, {
  indexes: [{ fields: ['active', 'endsAt'] }],
});

export default Offer;
