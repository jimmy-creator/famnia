import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

/**
 * A file attached to a PurchaseOrder — the supplier's invoice, packing list,
 * airway bill / bill of lading, customs papers, payment proof.
 *
 * The file itself lives outside the public uploads folder (see
 * routes/purchaseOrders.js) and is only served to signed-in staff who can see
 * the PO. `storedName` is a random name on disk; `fileName` is what the user
 * uploaded and what a download is called.
 */
export const PO_DOC_TYPES = ['invoice', 'packing_list', 'cargo', 'customs', 'payment_proof', 'other'];

const PurchaseDocument = sequelize.define('PurchaseDocument', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  purchaseOrderId: { type: DataTypes.INTEGER, allowNull: false },
  docType: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'other' },
  fileName: { type: DataTypes.STRING, allowNull: false },
  storedName: { type: DataTypes.STRING(80), allowNull: false },
  mimeType: { type: DataTypes.STRING(120), allowNull: false },
  size: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  notes: { type: DataTypes.STRING(200), allowNull: true },
  uploadedBy: { type: DataTypes.INTEGER, allowNull: true },
}, {
  indexes: [{ fields: ['purchaseOrderId'] }],
});

export default PurchaseDocument;
