import Setting from '../models/Setting.js';
import Counter from '../models/Counter.js';

const COUNTER_NAME = 'pos_invoice';

// Prefix + starting number are admin-configurable (Settings), falling back
// to env, then sensible defaults. `pos_invoice_start` lets a store continue
// from its previous system's last invoice number (e.g. 49456).
async function getConfig() {
  const [prefixRow, startRow] = await Promise.all([
    Setting.findByPk('pos_invoice_prefix'),
    Setting.findByPk('pos_invoice_start'),
  ]);
  const prefix = (prefixRow?.value ?? process.env.POS_INVOICE_PREFIX ?? 'INV-');
  const start = parseInt(startRow?.value ?? process.env.POS_INVOICE_START ?? '1', 10) || 1;
  return { prefix, start };
}

/**
 * Atomically allocate the next POS invoice number within the caller's
 * transaction. The Counter row is locked FOR UPDATE so two simultaneous
 * sales can't be issued the same number. Returns e.g. "INV-49456".
 *
 * The first ever call seeds the counter at the configured start value;
 * pre-seeding the row (Settings save / startup) makes even that path
 * race-free, but POS sale concurrency is low so the unlocked insert is fine.
 */
export async function nextInvoiceNumber(transaction) {
  const { prefix, start } = await getConfig();
  const row = await Counter.findByPk(COUNTER_NAME, {
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  let next;
  if (!row) {
    next = start;
    await Counter.create({ name: COUNTER_NAME, value: next }, { transaction });
  } else {
    next = Number(row.value) + 1;
    row.value = next;
    await row.save({ transaction });
  }
  return `${prefix}${next}`;
}

export default { nextInvoiceNumber };
