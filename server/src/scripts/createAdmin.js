/**
 * Create or reset an admin from the command line (when a shell with node is
 * available). Does NOT drop tables or load sample data.
 *
 *   npm run create:admin -- admin@yourstore.com 'StrongPassw0rd!' 'Owner Name'
 */
import sequelize from '../config/database.js'; // also runs dotenv.config()
import { ensureAdmin } from '../bootstrapAdmin.js';

const [, , email, password, name] = process.argv;

if (!email || !password) {
  console.error("Usage: npm run create:admin -- <email> <password> [name]");
  process.exit(1);
}

try {
  await sequelize.authenticate();
  await sequelize.sync(); // create tables if missing (no force, no alter)
  const r = await ensureAdmin({ email, password, name: name || 'Admin' });
  console.log(`${r.created ? 'Created' : 'Promoted/reset'} admin: ${r.email}`);
  process.exit(0);
} catch (err) {
  console.error('Failed to create admin:', err.message);
  process.exit(1);
}
