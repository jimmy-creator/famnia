/**
 * Refund valuation — what a sold unit is actually worth back.
 *
 * An order line's `price` is the GROSS unit price. Discounts live in two
 * places:
 *   - `line.lineDiscount.amount` — that line's own discount, already summed
 *     for the full sold quantity.
 *   - `order.discount` — the order's total discount, which *includes* the
 *     line discounts plus the manual and coupon discounts stacked on top.
 *
 * So refunding `price × qty` hands back more than the customer paid. This
 * takes each line's value net of its own discount, then spreads the
 * order-level slice (manual + coupon) proportionally across those values.
 * Refunding every unit therefore sums back to exactly what was collected.
 *
 * Deliberately derived from `order.discount` rather than `order.totalAmount`:
 * online orders fold tax and shipping into the total, and neither is ours to
 * prorate across the goods.
 */

// Value of a whole line after its own line discount, before the order-level slice.
function lineNet(line) {
  const gross = (parseFloat(line.price) || 0) * (parseInt(line.quantity, 10) || 0);
  return Math.max(0, gross - (parseFloat(line.lineDiscount?.amount) || 0));
}

/**
 * Build a valuer for one order.
 * @returns {(line: object, qty: number) => number} net refund value of `qty`
 *          units of `line`, rounded to 3dp (fils).
 */
export function refundValuer(order) {
  const items = order.items || [];
  // Lines added after the fact (POS bill editor) were charged at full price —
  // the bill discount was struck before they existed, so they don't share it.
  const shares = (it) => !it.appendedAt;
  const base = items.filter(shares).reduce((s, it) => s + lineNet(it), 0);
  const lineOffTotal = items.reduce(
    (s, it) => s + (parseFloat(it.lineDiscount?.amount) || 0), 0,
  );
  // What's left of order.discount once the line discounts are accounted for.
  const orderLevelOff = Math.max(0, (parseFloat(order.discount) || 0) - lineOffTotal);
  const factor = base > 0 ? Math.max(0, (base - orderLevelOff) / base) : 1;

  return (line, qty) => {
    const soldQty = parseInt(line.quantity, 10) || 0;
    const n = parseInt(qty, 10) || 0;
    if (soldQty <= 0 || n <= 0) return 0;
    const net = (lineNet(line) / soldQty) * n;
    return +(shares(line) ? net * factor : net).toFixed(3);
  };
}
