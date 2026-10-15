// npm run backfill:categories — create a Category row for every category a
// product carries but the Category table lacks. The hub importers used to
// write product categories without one, leaving the storefront's category
// menu and home circles empty. Idempotent; prints what it created.
import sequelize from '../config/database.js';
import { Product } from '../models/index.js';
import { ensureCategory } from '../hub/catalog.js';

try {
  await sequelize.authenticate();
  const rows = await Product.findAll({ attributes: ['category', 'categories'], raw: true });
  const names = new Set();
  for (const r of rows) {
    if (r.category) names.add(String(r.category).trim());
    let cats = r.categories;
    if (typeof cats === 'string') {
      try { cats = JSON.parse(cats); } catch { cats = []; }
    }
    if (Array.isArray(cats)) cats.forEach((c) => c && names.add(String(c).trim()));
  }
  const created = [];
  for (const name of names) {
    if (await ensureCategory(name)) created.push(name);
  }
  console.log(`[backfill:categories] ${names.size} product categories, ${created.length} created${created.length ? `: ${created.join(', ')}` : ''}`);
  await sequelize.close();
} catch (err) {
  console.error('[backfill:categories] failed:', err.message);
  process.exit(1);
}
