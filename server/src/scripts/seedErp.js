/**
 * ERP bootstrap — the one-time setup the multi-location/POS feature needs
 * before it will work at all. Run once after enabling FEATURE_MULTILOC:
 *
 *   npm run seed:erp
 *   npm run seed:erp -- --cashier-pin 1234
 *
 * Idempotent: safe to re-run. Nothing is deleted, nothing is overwritten
 * except stock rows that don't exist yet.
 *
 * What it does, and why each part matters:
 *
 *  1. Default Location with isOnlineDefault=true.
 *     Without one, decrementOnlineStock() no-ops and online sales fall
 *     back to the legacy aggregate — the exact split-brain we're fixing.
 *
 *  2. ProductStock backfill from Product.stock / variants[].stock.
 *     THIS IS THE CRITICAL STEP. routes/pos.js reads per-location stock
 *     and treats a missing row as zero, so without the backfill every
 *     POS sale fails with "Not enough stock" even on a full shelf.
 *
 *  3. Starter ExpenseCategory rows, so the Expenses tab is usable.
 *
 *  4. A cashier user with a PIN and a homeLocationId. PosLogin derives
 *     its branch list from cashiers' home locations, so with no such
 *     user the terminal shows "No locations set up" and login is
 *     impossible.
 *
 * CashAccount rows are NOT created here — finance.js seeds a drawer, card
 * terminal, KNET terminal, petty cash and bank account automatically on
 * the next boot, once a Location exists.
 */
import sequelize from '../config/database.js';   // also runs dotenv.config()
import {
  Location, Product, ProductStock, ExpenseCategory, User,
} from '../models/index.js';

const STORE_NAME = process.env.STORE_NAME || 'Femnia Fashion';

const EXPENSE_CATEGORIES = [
  { name: 'Rent', code: 'RENT' },
  { name: 'Salaries', code: 'SAL' },
  { name: 'Utilities', code: 'UTIL' },
  { name: 'Marketing', code: 'MKT' },
  { name: 'Transport', code: 'TRANS' },
  { name: 'Packaging', code: 'PACK' },
  { name: 'Bank Charges', code: 'BANK' },
  { name: 'Shrinkage', code: 'SHRINK' },
  { name: 'Miscellaneous', code: 'MISC' },
];

function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : null;
}

// ── 1. Location ───────────────────────────────────────────────────
async function ensureLocation() {
  const existing = await Location.findOne({ where: { isOnlineDefault: true, active: true } });
  if (existing) {
    console.log(`✓ Online-default location already set: ${existing.name} (#${existing.id})`);
    return existing;
  }

  // An active location may exist without the online flag — promote it
  // rather than creating a duplicate.
  const anyActive = await Location.findOne({ where: { active: true }, order: [['id', 'ASC']] });
  if (anyActive) {
    await anyActive.update({ isOnlineDefault: true });
    console.log(`✓ Promoted existing location to online-default: ${anyActive.name} (#${anyActive.id})`);
    return anyActive;
  }

  const loc = await Location.create({
    name: `${STORE_NAME} Store`,
    code: 'MAIN',
    type: 'store',
    address: process.env.STORE_ADDRESS || null,
    phone: process.env.STORE_PHONE || null,
    active: true,
    isOnlineDefault: true,
  });
  console.log(`✓ Created location: ${loc.name} (#${loc.id})`);
  return loc;
}

// ── 2. ProductStock backfill ──────────────────────────────────────
// One row per (productId, variantIndex) seeded from the legacy columns.
// Products WITH variants get one row per variant and no base row, which
// is the shape pos.js/inventory.js expect.
async function backfillStock(locationId) {
  const products = await Product.findAll({ attributes: ['id', 'name', 'stock', 'variants'] });
  let created = 0, skipped = 0, units = 0;

  for (const p of products) {
    const variants = Array.isArray(p.variants) ? p.variants : [];
    const rows = variants.length
      ? variants.map((v, i) => ({ variantIndex: i, quantity: parseInt(v?.stock, 10) || 0 }))
      : [{ variantIndex: null, quantity: parseInt(p.stock, 10) || 0 }];

    for (const r of rows) {
      const [, made] = await ProductStock.findOrCreate({
        where: { productId: p.id, variantIndex: r.variantIndex, locationId },
        defaults: { quantity: r.quantity },
      });
      if (made) { created++; units += r.quantity; } else { skipped++; }
    }
  }

  console.log(`✓ Stock backfill: ${created} rows created (${units} units), ${skipped} already present`);
  return created;
}

// ── 3. Expense categories ─────────────────────────────────────────
async function ensureExpenseCategories() {
  let created = 0;
  for (const c of EXPENSE_CATEGORIES) {
    const [, made] = await ExpenseCategory.findOrCreate({
      where: { name: c.name },
      defaults: { code: c.code, active: true },
    });
    if (made) created++;
  }
  console.log(`✓ Expense categories: ${created} created, ${EXPENSE_CATEGORIES.length - created} already present`);
}

// ── 4. Cashier ────────────────────────────────────────────────────
async function ensureCashier(locationId) {
  const existing = await User.findOne({ where: { role: 'cashier' } });
  if (existing) {
    if (!existing.homeLocationId) {
      await existing.update({ homeLocationId: locationId });
      console.log(`✓ Set home location on existing cashier: ${existing.email}`);
    } else {
      console.log(`✓ Cashier already exists: ${existing.email}`);
    }
    return existing;
  }

  const pin = arg('--cashier-pin') || '1234';
  const email = arg('--cashier-email') || 'cashier@femnia.local';
  const password = arg('--cashier-password') || 'ChangeMe123!';

  if (!/^\d{4,6}$/.test(pin)) {
    throw new Error('--cashier-pin must be 4-6 digits');
  }

  // The model hashes both password and pin in beforeCreate hooks.
  const cashier = await User.create({
    name: 'Counter Staff',
    email,
    password,
    pin,
    role: 'cashier',
    homeLocationId: locationId,
    isManager: true,
  });
  console.log(`✓ Created cashier: ${email} (PIN ${pin}) — CHANGE THE PIN AND PASSWORD`);
  return cashier;
}

async function main() {
  if (process.env.FEATURE_MULTILOC !== 'true') {
    console.warn('⚠  FEATURE_MULTILOC is not "true" in server/.env — the ERP will stay');
    console.warn('   dormant until you set it. Seeding anyway so the data is ready.\n');
  }

  await sequelize.authenticate();
  // No force, no alter — tables must already exist. Boot the server once
  // with DB_SYNC_ALTER=true first if the ERP tables are missing.
  await sequelize.sync();

  const loc = await ensureLocation();
  await backfillStock(loc.id);
  await ensureExpenseCategories();
  await ensureCashier(loc.id);

  console.log('\nERP bootstrap complete. Restart the server to auto-seed cash accounts.');
}

try {
  await main();
  process.exit(0);
} catch (err) {
  console.error('ERP bootstrap failed:', err.message);
  console.error(err.stack);
  process.exit(1);
}
