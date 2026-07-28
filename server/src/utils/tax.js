// VAT is INCLUDED in product price (price-inclusive model)
// Extract tax from the selling price: tax = price - (price / (1 + rate/100))

export function calculateTax(orderItems) {
  let totalTax = 0;

  for (const item of orderItems) {
    if (!item.taxable || !item.taxRate) continue;
    const itemTotal = item.price * item.quantity;
    // Extract tax from inclusive price
    const taxAmount = Math.round((itemTotal - (itemTotal / (1 + item.taxRate / 100))) * 100) / 100;
    totalTax += taxAmount;
  }

  totalTax = Math.round(totalTax * 100) / 100;

  // UAE VAT is a single flat tax — no CGST/SGST/IGST split.
  const breakdown = { totalTax, inclusive: true };

  return { totalTax, breakdown };
}
