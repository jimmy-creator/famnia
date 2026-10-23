// npm run cash:single-pool — run once: make "Total Available Cash" the one
// account the hub pays from and takes sales money into (the client's model:
// cash in hand, bank and Fawran are one pot). Uses only the app's ordinary
// moves — a rename, the funding-account mapping, sales-payment entries and
// cash transfers — so no existing ledger row is rewritten.
//
//  1. The pool: the account named "Total Available Cash", else the hub's
//     "Company Money" account renamed, else a new one.
//  2. Every company funding source is mapped to the pool.
//  3. Every web / staff order's received money is posted (hub/orderCash.js).
//  4. Every other active account except till drawers / card terminals is
//     settled into the pool with a cash transfer and switched off.
//
// Idempotent: a second run maps, posts and transfers nothing new.
import sequelize from '../config/database.js';
import { CashAccount, CashTransaction, CashTransfer, Setting, User, writeCashTxn } from '../models/index.js';
import { COMPANY_FUNDING_SOURCES } from '../routes/hubFinance.js';
import { resyncOrderCash } from '../hub/orderCash.js';
import { localDate } from '../utils/dates.js';

const POOL_NAME = 'Total Available Cash';
const KEEP_TYPES = ['drawer', 'card_terminal'];   // the till's own accounts

const balanceOf = async (id, transaction) => {
  const acct = await CashAccount.findByPk(id, { transaction });
  const sum = await CashTransaction.sum('amount', { where: { cashAccountId: id }, transaction });
  return Math.round(((parseFloat(acct.openingBalance) || 0) + (parseFloat(sum) || 0)) * 100) / 100;
};

const report = async () => {
  const lines = [];
  for (const a of await CashAccount.findAll({ order: [['id', 'ASC']] })) {
    lines.push(`${a.id} ${a.name}${a.active ? '' : ' (off)'}: ${await balanceOf(a.id)}`);
  }
  return lines.join('\n  ');
};

try {
  await sequelize.authenticate();
  console.log(`[cash:single-pool] before:\n  ${await report()}`);

  // 1 + 2: the pool and the mapping.
  const pool = await sequelize.transaction(async (t) => {
    let acct = await CashAccount.findOne({ where: { name: POOL_NAME }, transaction: t })
      || await CashAccount.findOne({ where: { name: 'Company Money' }, transaction: t });
    if (!acct) acct = await CashAccount.create({ name: POOL_NAME, type: 'other', openingBalance: 0 }, { transaction: t });
    await acct.update({
      name: POOL_NAME,
      active: true,
      notes: 'All company money — cash in hand, bank and Fawran together. Every funding source pays from here and every sales payment lands here.',
    }, { transaction: t });
    const mapping = Object.fromEntries(COMPANY_FUNDING_SOURCES.map((s) => [s, acct.id]));
    await Setting.upsert({ key: 'hub_funding_accounts', value: JSON.stringify(mapping) }, { transaction: t });
    return acct;
  });

  // 3: sales money.
  const before = await CashTransaction.count({ where: { sourceType: 'Order' } });
  const orders = await resyncOrderCash();
  const written = (await CashTransaction.count({ where: { sourceType: 'Order' } })) - before;
  console.log(`[cash:single-pool] ${orders} orders checked, ${written} sales-payment entries written`);

  // 4: settle the other accounts into the pool.
  const admin = await User.findOne({ where: { role: 'admin' }, order: [['id', 'ASC']] });
  const today = localDate();
  const settled = await sequelize.transaction(async (t) => {
    const out = [];
    const others = (await CashAccount.findAll({ where: { active: true }, transaction: t }))
      .filter((a) => a.id !== pool.id && !KEEP_TYPES.includes(a.type));
    for (const a of others) {
      const bal = await balanceOf(a.id, t);
      if (bal) {
        // A negative account is topped up from the pool; a positive one empties into it.
        const [fromId, toId] = bal < 0 ? [pool.id, a.id] : [a.id, pool.id];
        const amount = Math.abs(bal);
        const tr = await CashTransfer.create({
          transferNumber: `TRF-POOL-${a.id}-${Date.now().toString(36).toUpperCase()}`,
          fromAccountId: fromId, toAccountId: toId, amount, transferDate: today,
          notes: `"${a.name}" merged into "${POOL_NAME}" — one pot for all company money.`,
          status: 'completed', createdBy: admin.id,
        }, { transaction: t });
        const common = { source: 'transfer', sourceType: 'CashTransfer', sourceId: tr.id, reference: tr.transferNumber, createdBy: admin.id, transaction: t };
        await writeCashTxn({ ...common, cashAccountId: fromId, amount: -amount, description: `Merged: transfer to ${toId === pool.id ? POOL_NAME : a.name}` });
        await writeCashTxn({ ...common, cashAccountId: toId, amount, description: `Merged: transfer from ${fromId === pool.id ? POOL_NAME : a.name}` });
      }
      await a.update({
        active: false,
        notes: `${a.notes ? `${a.notes} ` : ''}Merged into "${POOL_NAME}" on ${today}.`,
      }, { transaction: t });
      out.push(`${a.name} (${bal})`);
    }
    return out;
  });
  console.log(`[cash:single-pool] merged: ${settled.length ? settled.join(', ') : 'nothing (already done)'}`);
  console.log(`[cash:single-pool] after:\n  ${await report()}`);
  await sequelize.close();
} catch (err) {
  console.error('[cash:single-pool] failed:', err.message);
  process.exit(1);
}
