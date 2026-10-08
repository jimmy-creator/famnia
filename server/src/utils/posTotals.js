import { dp } from './money.js';

/**
 * Shared money arithmetic for POS shifts — the X-report, Z-report, shift
 * close and shift summary must all agree on what went through the drawer,
 * so they all bucket sales and refunds through these helpers.
 *
 * Tenders are cash and card only (see CLAUDE.md — no KNET, no store credit).
 */

const round3 = (n) => +n.toFixed(dp());

const SINGLE_METHOD = { pos_cash: 'cash', cash: 'cash', pos_card: 'card', card: 'card' };

/** What an order was paid with: [{ method, amount }]. */
export function saleTenders(order) {
  if (Array.isArray(order.paymentBreakdown) && order.paymentBreakdown.length > 0) {
    return order.paymentBreakdown.map((tn) => ({ method: tn.method, amount: parseFloat(tn.amount || 0) }));
  }
  const method = SINGLE_METHOD[order.paymentMethod];
  return method ? [{ method, amount: parseFloat(order.totalAmount || 0) }] : [];
}

/** What a return paid back: [{ method, amount }]. */
export function refundTenders(ret) {
  if (Array.isArray(ret.refundBreakdown) && ret.refundBreakdown.length > 0) {
    return ret.refundBreakdown.map((tn) => ({ method: tn.method, amount: parseFloat(tn.amount || 0) }));
  }
  return [{ method: ret.refundMethod, amount: parseFloat(ret.refundAmount || 0) }];
}

/**
 * Spread a refund across the tenders a sale was paid with, in proportion,
 * so voiding a 10 cash + 15 card sale gives back 10 cash and 15 card. The
 * last leg takes the rounding remainder so the legs sum exactly.
 */
export function splitRefund(paidTenders, refundTotal) {
  const legs = paidTenders.filter((tn) => tn.amount > 0);
  const paid = legs.reduce((s, tn) => s + tn.amount, 0);
  if (legs.length === 0 || paid <= 0) return [{ method: 'cash', amount: round3(refundTotal) }];
  const byMethod = new Map();
  let allocated = 0;
  legs.forEach((tn, i) => {
    const amount = i === legs.length - 1
      ? round3(refundTotal - allocated)
      : round3(refundTotal * (tn.amount / paid));
    allocated = round3(allocated + amount);
    byMethod.set(tn.method, round3((byMethod.get(tn.method) || 0) + amount));
  });
  return [...byMethod.entries()]
    .map(([method, amount]) => ({ method, amount }))
    .filter((l) => l.amount > 0);
}

// Refunds are attributed to how the money actually went out (the refund's
// own method), NOT to the original order's paymentMethod, since a customer
// can pay cash today and refund onto a card tomorrow.
export function rollup(orders, returns = []) {
  const sales = { cash: 0, card: 0 };
  let totalSales = 0;
  for (const o of orders) {
    totalSales += parseFloat(o.totalAmount || 0);
    for (const tn of saleTenders(o)) {
      if (tn.method in sales) sales[tn.method] += tn.amount;
    }
  }
  const refunds = { cash: 0, card: 0 };
  let returnCount = 0;
  for (const r of returns) {
    if (r.status === 'cancelled') continue;
    returnCount += 1;
    for (const tn of refundTenders(r)) {
      if (tn.method in refunds) refunds[tn.method] += tn.amount;
    }
  }
  const totalRefunds = refunds.cash + refunds.card;
  return {
    orderCount: orders.length,
    totalSales: round3(totalSales),
    cashSales: round3(sales.cash),
    cardSales: round3(sales.card),
    returnCount,
    cashRefunds: round3(refunds.cash),
    cardRefunds: round3(refunds.card),
    netSales: round3(totalSales - totalRefunds),
  };
}
