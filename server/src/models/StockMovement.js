import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

/**
 * Stock ledger — one row per change to a ProductStock quantity.
 *
 * Written automatically by the ProductStock hooks in models/index.js, so every
 * path that moves stock (POS, returns, transfers, counts, wastage, purchasing,
 * online orders, imports, the hub's Stock In / Stock Out / adjustments) lands
 * here. The hub attaches the details its screens show (reference, supplier,
 * batch, reason); other paths get a kind derived from the request.
 *
 * Invariant: for every (product, variant, location), SUM(quantity) equals
 * ProductStock.quantity. reconcileStockLedger() restores it at boot if a raw
 * write ever bypassed the hooks.
 *
 * Rows are never deleted or have their quantity changed; only the
 * informational batch fields may be corrected (audited).
 */
export const MOVEMENT_KINDS = [
  'opening',          // opening balance / new product's starting stock
  'stock_in',         // received stock (hub Stock In, purchase receipts)
  'sale',             // sold (POS or online)
  'sale_void',        // a voided POS sale put back
  'return',           // customer return restocked
  'cancel_restock',   // cancelled order's stock put back
  'stock_out',        // hub manual Stock Out
  'wastage',          // ERP wastage write-off
  'supplier_return',  // goods returned to a supplier
  'adjustment',       // counted correction / product form / inventory screen
  'count',            // posted stock count
  'transfer',         // moved between locations (nets to zero overall)
  'import',           // product import (colleague's bulk import)
  'other',
];

const StockMovement = sequelize.define('StockMovement', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  productId: { type: DataTypes.INTEGER, allowNull: false },
  variantIndex: { type: DataTypes.INTEGER, allowNull: true },
  locationId: { type: DataTypes.INTEGER, allowNull: true },
  quantity: { type: DataTypes.INTEGER, allowNull: false },   // signed: + in, − out
  kind: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'other' },
  reference: { type: DataTypes.STRING(80), allowNull: true },
  txnDate: { type: DataTypes.DATEONLY, allowNull: false },
  unitCost: { type: DataTypes.DECIMAL(12, 3), allowNull: true },
  supplier: { type: DataTypes.STRING, allowNull: true },
  invoiceRef: { type: DataTypes.STRING, allowNull: true },
  receivedBy: { type: DataTypes.STRING, allowNull: true },
  handledBy: { type: DataTypes.STRING, allowNull: true },
  referenceNote: { type: DataTypes.STRING, allowNull: true },
  rack: { type: DataTypes.STRING, allowNull: true },
  shelfLocation: { type: DataTypes.STRING, allowNull: true },
  reason: { type: DataTypes.STRING, allowNull: true },
  notes: { type: DataTypes.TEXT, allowNull: true },
  batchNumber: { type: DataTypes.STRING, allowNull: true },
  sourceCountry: { type: DataTypes.STRING, allowNull: true },
  wholesaler: { type: DataTypes.STRING, allowNull: true },
  // Retried submissions carry the same key; the unique index stops a double count.
  idempotencyKey: { type: DataTypes.STRING(120), allowNull: true, unique: 'stock_movement_idem_unique' },
  importBatchId: { type: DataTypes.INTEGER, allowNull: true },
  orderId: { type: DataTypes.INTEGER, allowNull: true },
  createdBy: { type: DataTypes.INTEGER, allowNull: true },
}, {
  indexes: [
    { fields: ['productId', 'variantIndex'] },
    { fields: ['kind', 'txnDate'] },
    { fields: ['importBatchId'] },
  ],
});

export default StockMovement;
