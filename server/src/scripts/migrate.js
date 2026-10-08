// npm run migrate — apply column-level schema migrations (see migrations/index.js).
// The server also runs these on boot; this is for running them by hand.
import sequelize from '../config/database.js';
import { runMigrations } from '../migrations/index.js';

try {
  await sequelize.authenticate();
  await runMigrations();
  await sequelize.close();
} catch (err) {
  console.error('[migrate] failed:', err.message);
  process.exit(1);
}
