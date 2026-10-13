/**
 * Import a FEMNIA Hub backup / import-template workbook from the command
 * line — the same import as Hub → Settings → Backup → Import data.
 *
 *   npm run import:hub -- <file.xlsx>                     preview only (default)
 *   npm run import:hub -- <file.xlsx> --commit            import
 *   npm run import:hub -- <file.xlsx> --commit --as=admin@store.com
 *
 * Records are attributed to --as (default: the first Admin). Nothing is
 * saved unless every row is valid; see src/hub/dataImport.js.
 */
import '../tz.js';   // dates on the store's clock, as the server
import fs from 'fs';
import sequelize from '../config/database.js';   // also runs dotenv.config()
import { User } from '../models/index.js';
import { importData, readWorkbook } from '../hub/dataImport.js';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const commit = args.includes('--commit');
const as = (args.find((a) => a.startsWith('--as=')) || '').slice(5);

if (!file) {
  console.error('Usage: npm run import:hub -- <file.xlsx> [--commit] [--as=<admin email or username>]');
  process.exit(1);
}

try {
  const admin = await User.findOne({
    where: as ? { role: 'admin', [as.includes('@') ? 'email' : 'username']: as } : { role: 'admin' },
    order: [['id', 'ASC']],
  });
  if (!admin) throw new Error(as ? `No admin account ${as}.` : 'No admin account exists.');
  const report = await importData(readWorkbook(fs.readFileSync(file)), { userId: admin.id, dryRun: !commit });

  console.log(`\n${commit ? 'IMPORT' : 'PREVIEW'} of ${file} as ${admin.email || admin.username}`);
  for (const [sheet, counts] of Object.entries(report.counts)) {
    console.log(`  ${sheet.padEnd(18)} ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')}`);
  }
  if (report.cashDebited.length) {
    console.log('\n  Cash accounts debited (set their opening balances to match reality):');
    for (const c of report.cashDebited) console.log(`    ${c.account}: ${c.amount.toFixed(2)}`);
  }
  if (report.unmatchedStaff.length) console.log(`\n  Staff with no hub account here (recorded under ${admin.name}): ${report.unmatchedStaff.join(', ')}`);
  if (report.examplesSkipped) console.log(`\n  ${report.examplesSkipped} EXAMPLE- row(s) skipped.`);
  if (report.warningCount) {
    console.log(`\n  ${report.warningCount} warning(s):`);
    for (const w of report.warnings) console.log(`    [${w.sheet}${w.row ? ` row ${w.row}` : ''}] ${w.message}`);
  }
  if (report.errorCount) {
    console.log(`\n  ${report.errorCount} error(s) — nothing was saved:`);
    for (const e of report.errors) console.log(`    [${e.sheet}${e.row ? ` row ${e.row}` : ''}] ${e.message}`);
  }
  console.log(report.committed ? '\nImported.' : `\nNothing saved${commit ? '' : ' (preview). Re-run with --commit to import'}.`);
  await sequelize.close();
  process.exit(report.errorCount ? 1 : 0);
} catch (err) {
  console.error(`\nImport failed: ${err.message}`);
  await sequelize.close();
  process.exit(1);
}
