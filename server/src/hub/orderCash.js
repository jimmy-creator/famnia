import { Op } from 'sequelize';
import sequelize from '../config/database.js';
import { CashTransaction, Order, writeCashTxn } from '../models/index.js';
import { COMPANY_FUNDING_SOURCES, accountForSource } from '../routes/hubFinance.js';
import { round2, toSalesOrder } from './sales.js';

/**
 * Sales money into Cash & Bank. Every save of a web or staff order reconciles
 * its CashTransaction rows (sourceType 'Order') to the money the order holds,
 * by appending the difference — so a payment recorded, corrected, moved to
 * another holder, returned or refunded books once, on every path (hub routes,
 * delivery updates, backup imports). Till sales post their own tenders and are
 * skipped.
 *
 * The money an order holds (same rule as the dashboard): what was received —
 * the full total once it is marked Paid, even if the amount was left blank —
 * less the value of returned items; nothing for drafts, cancelled or refunded
 * orders. It lands in the account its "Payment received in / held by" maps to
 * (Settings → Funding accounts). Money held by a person (a driver, a staff
 * member) counts as Cash in Hand: the business treats it as available cash.
 */

// Order holders whose names differ from the funding source they are.
const HOLDER_FUNDING_SOURCE = {
  'Company Bank Account': 'Company Bank',
  'Company Fawran Account': 'Fawran',
};

/** The company funding source an order's payment holder is; a person or blank holder is Cash in Hand. */
export function holderSource(heldIn) {
  const name = String(heldIn || '').trim();
  if (HOLDER_FUNDING_SOURCE[name]) return HOLDER_FUNDING_SOURCE[name];
  return COMPANY_FUNDING_SOURCES.find((s) => s.toLowerCase() === name.toLowerCase()) || 'Cash in Hand';
}

/** The money an order holds now, net of returned items. */
export function orderCashHeld(v) {
  if (['Draft', 'Cancelled'].includes(v.status) || v.paymentStatus === 'Refunded') return 0;
  const received = Math.max(v.amountReceived, v.paymentStatus === 'Paid' ? v.grandTotal : 0);
  if (received <= 0) return 0;
  const returned = v.items.reduce((s, it) => (it.quantity > 0
    ? s + (it.lineTotal / it.quantity) * Math.min(it.returnedQty, it.quantity)
    : s), 0);
  return round2(Math.max(received - returned, 0));
}

export async function syncOrderCash(order, transaction = null) {
  if (order.channel === 'pos') return;
  const v = toSalesOrder(order);
  const target = orderCashHeld(v);

  const rows = await CashTransaction.findAll({
    where: { sourceType: 'Order', sourceId: order.id }, attributes: ['cashAccountId', 'amount'], raw: true, transaction,
  });
  if (!target && !rows.length) return;
  const held = new Map();
  for (const r of rows) held.set(r.cashAccountId, round2((held.get(r.cashAccountId) || 0) + (parseFloat(r.amount) || 0)));

  const account = target > 0 ? await accountForSource(holderSource(v.paymentHeldIn), transaction) : null;
  // The first posting lands on the payment (or order) date; later corrections on the day they are made.
  const firstDate = v.paymentDate ? new Date(`${v.paymentDate}T12:00:00`) : new Date(v.orderDate);
  const date = rows.length ? new Date() : firstDate;
  const post = (cashAccountId, amount, source, description) => writeCashTxn({
    cashAccountId, amount, source, sourceType: 'Order', sourceId: order.id, reference: order.orderNumber, description, date, transaction,
  });

  for (const [cashAccountId, sum] of held) {
    if (cashAccountId === account?.id || !sum) continue;
    const why = v.paymentStatus === 'Refunded' ? 'refunded' : v.status === 'Cancelled' ? 'order cancelled'
      : account ? `moved to ${account.name}` : 'no longer received';
    await post(cashAccountId, -sum, account ? 'sale' : 'return', `Payment ${why} · ${order.orderNumber}`);
  }
  if (account) {
    const delta = round2(target - (held.get(account.id) || 0));
    if (delta) {
      const label = held.has(account.id)
        ? (delta < 0 ? 'Refund / payment reduced' : 'Payment corrected')
        : `Payment received${v.paymentHeldIn ? ` (${v.paymentHeldIn})` : ''}`;
      await post(account.id, delta, delta < 0 ? 'return' : 'sale', `${label} · ${order.orderNumber}`);
    }
  }
}

/** Re-run the sync for every web and staff order (after a funding-account remap, or once on upgrade). */
export async function resyncOrderCash() {
  return sequelize.transaction(async (t) => {
    const orders = await Order.findAll({ where: { channel: { [Op.ne]: 'pos' } }, transaction: t });
    for (const order of orders) await syncOrderCash(order, t);
    return orders.length;
  });
}

Order.addHook('afterSave', 'orderCash', (order, options) => syncOrderCash(order, options.transaction || null));
