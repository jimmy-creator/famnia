import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

/**
 * Column-level schema migrations for existing databases.
 *
 * Boot runs `sequelize.sync()` without `alter` (alter piles up duplicate
 * indexes), so it creates missing TABLES but never adds COLUMNS to a table
 * that already exists. Every column added to an existing model must be listed
 * here. Each step checks the live schema first, so the whole list is safe to
 * run on every boot and on a fresh database (where sync creates the full
 * table and every step is a no-op).
 *
 * Runs from start() before sync(), and on demand via `npm run migrate`.
 */

const qi = () => sequelize.getQueryInterface();

async function describe(table) {
  try {
    return await qi().describeTable(table);
  } catch {
    return null; // table not created yet — sync will create it complete
  }
}

async function addColumnIfMissing(table, column, spec) {
  const cols = await describe(table);
  if (!cols || cols[column]) return false;
  await qi().addColumn(table, column, spec);
  return true;
}

async function indexExists(table, name) {
  const [rows] = await sequelize.query(`SHOW INDEX FROM \`${table}\` WHERE Key_name = ?`, { replacements: [name] });
  return rows.length > 0;
}

async function addIndexIfMissing(table, name, fields, unique = false) {
  if (!(await describe(table))) return false;
  if (await indexExists(table, name)) return false;
  await qi().addIndex(table, fields, { name, unique });
  return true;
}

/** Widen an ENUM column so it accepts `values` (no-op if it already does). */
async function ensureEnum(table, column, values, spec) {
  const cols = await describe(table);
  if (!cols || !cols[column]) return false;
  const current = String(cols[column].type || '');
  if (values.every((v) => current.includes(`'${v}'`))) return false;
  await qi().changeColumn(table, column, { ...spec, type: DataTypes.ENUM(...values) });
  return true;
}

const STEPS = [
  // ── 2026-10 FEMNIA Hub: staff accounts ──────────────────────────────
  ['Users.role += delivery', () => ensureEnum('Users', 'role',
    ['customer', 'admin', 'staff', 'cashier', 'delivery'], { allowNull: true, defaultValue: 'customer' })],
  ['Users.username', () => addColumnIfMissing('Users', 'username', { type: DataTypes.STRING(32), allowNull: true })],
  ['Users.username unique', () => addIndexIfMissing('Users', 'user_username_unique', ['username'], true)],
  ['Users.status', () => addColumnIfMissing('Users', 'status', {
    type: DataTypes.ENUM('pending', 'active', 'suspended', 'deactivated'), allowNull: false, defaultValue: 'active',
  })],
  ['Users.mustChangePassword', () => addColumnIfMissing('Users', 'mustChangePassword', {
    type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false,
  })],
  ['Users.approvedBy', () => addColumnIfMissing('Users', 'approvedBy', { type: DataTypes.INTEGER, allowNull: true })],
  ['Users.approvedAt', () => addColumnIfMissing('Users', 'approvedAt', { type: DataTypes.DATE, allowNull: true })],
  ['Users.lastLoginAt', () => addColumnIfMissing('Users', 'lastLoginAt', { type: DataTypes.DATE, allowNull: true })],
  ['Users.passwordChangedAt', () => addColumnIfMissing('Users', 'passwordChangedAt', { type: DataTypes.DATE, allowNull: true })],

  // ── 2026-10 FEMNIA Hub: catalogue (phase 2) ─────────────────────────
  ['Products.designModel', () => addColumnIfMissing('Products', 'designModel', { type: DataTypes.STRING, allowNull: true })],
  ['Products.rack', () => addColumnIfMissing('Products', 'rack', { type: DataTypes.STRING, allowNull: true })],
  ['Products.shelfLocation', () => addColumnIfMissing('Products', 'shelfLocation', { type: DataTypes.STRING, allowNull: true })],
  ['Products.notes', () => addColumnIfMissing('Products', 'notes', { type: DataTypes.TEXT, allowNull: true })],
  ['Products.batchNumber', () => addColumnIfMissing('Products', 'batchNumber', { type: DataTypes.STRING, allowNull: true })],
  ['Products.sourceCountry', () => addColumnIfMissing('Products', 'sourceCountry', { type: DataTypes.STRING, allowNull: true })],
  ['Products.wholesaler', () => addColumnIfMissing('Products', 'wholesaler', { type: DataTypes.STRING, allowNull: true })],
  ['Products.importBatchId', () => addColumnIfMissing('Products', 'importBatchId', { type: DataTypes.INTEGER, allowNull: true })],

  // ── 2026-10 FEMNIA Hub: sales orders & customers (phase 3) ──────────
  ['Orders.channel += staff', () => ensureEnum('Orders', 'channel',
    ['web', 'pos', 'phone', 'whatsapp', 'other', 'staff'], { allowNull: false, defaultValue: 'web' })],
  ...[
    ['hubStatus', DataTypes.STRING(30)], ['hubPaymentStatus', DataTypes.STRING(20)], ['hubPaymentMode', DataTypes.STRING(30)],
    ['fulfilmentMethod', DataTypes.STRING(20)], ['customerName', DataTypes.STRING], ['customerPhone', DataTypes.STRING(30)],
    ['area', DataTypes.STRING], ['address', DataTypes.TEXT], ['landmark', DataTypes.STRING],
    ['paymentDate', DataTypes.DATEONLY], ['paymentTime', DataTypes.STRING(20)], ['paymentReference', DataTypes.STRING],
    ['paymentNotes', DataTypes.TEXT], ['paymentHeldIn', DataTypes.STRING(60)], ['paymentHolderDetails', DataTypes.STRING(200)],
    ['deliveryDate', DataTypes.DATEONLY], ['courier', DataTypes.STRING(80)], ['deliveryNotes', DataTypes.TEXT],
    ['pickupDate', DataTypes.DATEONLY], ['pickupTime', DataTypes.STRING(20)], ['pickupNotes', DataTypes.TEXT],
    ['confirmedAt', DataTypes.DATE], ['restockedAt', DataTypes.DATE], ['stockState', DataTypes.STRING(10)],
    ['idempotencyKey', DataTypes.STRING(120)], ['labelSize', DataTypes.STRING(10)],
    ['assignedTo', DataTypes.INTEGER], ['assignedAt', DataTypes.DATE], ['assignedBy', DataTypes.INTEGER],
    ['createdBy', DataTypes.INTEGER],
  ].map(([col, type]) => [`Orders.${col}`, () => addColumnIfMissing('Orders', col, { type, allowNull: true })]),
  ['Orders.amountReceived', () => addColumnIfMissing('Orders', 'amountReceived', {
    type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0,
  })],
  ['Orders.labelPrintCount', () => addColumnIfMissing('Orders', 'labelPrintCount', {
    type: DataTypes.INTEGER, allowNull: false, defaultValue: 0,
  })],
  ['Orders.idempotencyKey unique', () => addIndexIfMissing('Orders', 'order_idempotency_unique', ['idempotencyKey'], true)],
  ['Orders.assignedTo index', () => addIndexIfMissing('Orders', 'order_assigned_to', ['assignedTo'])],
  ...[['altPhone', DataTypes.STRING(30)], ['area', DataTypes.STRING], ['landmark', DataTypes.STRING], ['customerNotes', DataTypes.TEXT]]
    .map(([col, type]) => [`Users.${col}`, () => addColumnIfMissing('Users', col, { type, allowNull: true })]),
];

export async function runMigrations({ log = console.log } = {}) {
  let applied = 0;
  for (const [name, step] of STEPS) {
    if (await step()) {
      applied += 1;
      log(`[migrate] applied: ${name}`);
    }
  }
  if (applied === 0) log('[migrate] schema up to date');
  return applied;
}
