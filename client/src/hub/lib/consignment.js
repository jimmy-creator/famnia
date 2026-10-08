/**
 * Consignment sale maths for a single cart line / order item.
 *
 * Inputs are per PIECE (product cost, other cost) plus the OP cost rule
 * (percentage of the net selling price, with a minimum QAR amount).
 * Delivery charges are never part of this calculation.
 *
 * Remaining profit = net selling value − product cost − OP cost − other cost,
 * split 50 / 50. FEMNIA keeps its OP cost, other cost and half the profit;
 * the partner receives the product cost and the other half.
 */
export const DEFAULT_OP_PERCENT = 5;
export const DEFAULT_OP_MIN = 3;

const round2 = (v) => Math.round(v * 100) / 100;

export function emptyConsignment() {
  return { partner: '', productCost: 0, opPercent: DEFAULT_OP_PERCENT, opMin: DEFAULT_OP_MIN, otherCost: 0 };
}

/**
 * @param quantity     pieces sold (already net of returns)
 * @param netLineTotal line value after item/order discounts for those pieces
 */
export function computeConsignment(input, quantity, netLineTotal) {
  const qty = Math.max(quantity, 0);
  const netSales = round2(Math.max(netLineTotal, 0));
  const perUnitSale = qty > 0 ? netSales / qty : 0;
  const opPerUnit = Math.max((perUnitSale * Math.max(input.opPercent, 0)) / 100, Math.max(input.opMin, 0));
  const productCost = round2(Math.max(input.productCost, 0) * qty);
  const opCost = round2(opPerUnit * qty);
  const otherCost = round2(Math.max(input.otherCost, 0) * qty);
  const remainingProfit = round2(netSales - productCost - opCost - otherCost);
  const profitShare = round2(remainingProfit / 2);
  return {
    quantity: qty,
    netSales,
    productCost,
    opCost,
    otherCost,
    remainingProfit,
    profitShare,
    femniaTotal: round2(opCost + otherCost + profitShare),
    partnerTotal: round2(productCost + profitShare),
  };
}
