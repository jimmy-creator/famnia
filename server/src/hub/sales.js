/**
 * FEMNIA Hub sales orders over our Order model.
 *
 * The hub speaks its own vocabulary (status "Out for Delivery", payment
 * "Partially Paid", fulfilment "Customer Pickup", …), stored in the hub*
 * columns. Orders the hub has never written (web checkouts, till sales)
 * derive that view from the legacy orderStatus / paymentStatus fields, and
 * every hub write syncs those legacy fields back, so the storefront's
 * "My orders", the P&L and the sales reports keep working unchanged.
 */

export const SALES_ORDER_STATUSES = [
  'Draft', 'Confirmed', 'Awaiting Pickup', 'Out for Delivery', 'Delivered', 'Delivery Failed', 'Collected',
  'Order Fulfilled', 'Cancelled', 'Returned',
];
export const SALES_PAYMENT_METHODS = ['Cash', 'Fawran', 'Card', 'Bank Transfer', 'Online Payment', 'COD', 'Other'];
export const SALES_PAYMENT_STATUSES = ['Pending', 'Partially Paid', 'Paid', 'Refunded'];
export const RETURN_REASONS = ['Customer changed mind', 'Wrong size', 'Wrong item', 'Damaged product', 'Delivery failed', 'Other'];
export const CONTACT_EDITABLE_STATUSES = ['Draft', 'Confirmed', 'Ready for Delivery', 'Out for Delivery'];

export const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
export const clean = (v, max = 400) =>
  (v ?? '').toString().replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

/** Digits only, without the Qatar country code or leading zeros. */
export function normalizePhone(phone) {
  let digits = String(phone ?? '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length > 8 && digits.startsWith('974')) digits = digits.slice(3);
  return digits.replace(/^0+/, '');
}

export const samePhone = (a, b) => {
  const x = normalizePhone(a);
  return Boolean(x) && x === normalizePhone(b);
};

export const customerCode = (userId, prefix = 'CUS') => (userId ? `${prefix}-${String(userId).padStart(4, '0')}` : null);

export function channelLabel(order) {
  if (order.channel === 'web') return 'Online';
  if (order.channel === 'pos') return 'POS';
  return 'Staff';
}

/** Till sales are managed at the till (returns, voids); the hub only reads them. */
export const isTillSale = (order) => order.channel === 'pos';

const LEGACY_PAYMENT_MODES = {
  cod: 'COD', bank_transfer: 'Bank Transfer', pos_cash: 'Cash', pos_card: 'Card', pos_split: 'Cash',
  cash: 'Cash', card: 'Card', fawran: 'Fawran', online: 'Online Payment', other: 'Other',
};

/** Whether this order's goods have left stock (and not come back). */
export function stockDeducted(order) {
  if (order.stockState) return order.stockState === 'deducted';
  if (order.channel === 'pos') return order.orderStatus !== 'cancelled';
  if (order.orderStatus === 'cancelled') return false;      // legacy cancel routes restore stock
  // Checkout takes stock straight away for COD and bank transfer
  // (orderController); gateway orders only once payment is verified.
  return ['cod', 'bank_transfer'].includes(order.paymentMethod)
    || order.paymentStatus === 'paid' || order.paymentStatus === 'refunded';
}

function hubStatusOf(order) {
  if (order.hubStatus) return order.hubStatus;
  switch (order.orderStatus) {
    case 'cancelled': return 'Cancelled';
    case 'delivered': return order.channel === 'pos' ? 'Order Fulfilled' : 'Delivered';
    case 'shipped': return 'Out for Delivery';
    case 'confirmed': return 'Confirmed';
    default: return stockDeducted(order) ? 'Confirmed' : 'Draft';
  }
}

function hubPaymentStatusOf(order) {
  if (order.hubPaymentStatus) return order.hubPaymentStatus;
  if (order.paymentStatus === 'paid') return 'Paid';
  if (order.paymentStatus === 'refunded') return 'Refunded';
  return 'Pending';
}

/** The legacy orderStatus / paymentStatus a hub state corresponds to. */
export function legacyFields(hubStatus, hubPaymentStatus) {
  const orderStatus = {
    Draft: 'processing',
    Confirmed: 'confirmed',
    'Awaiting Pickup': 'confirmed',
    'Out for Delivery': 'shipped',
    'Delivery Failed': 'shipped',
    Delivered: 'delivered',
    Collected: 'delivered',
    'Order Fulfilled': 'delivered',
    Returned: 'delivered',
    Cancelled: 'cancelled',
  }[hubStatus] || 'processing';
  const paymentStatus = hubPaymentStatus === 'Paid' ? 'paid' : hubPaymentStatus === 'Refunded' ? 'refunded' : 'pending';
  return { orderStatus, paymentStatus };
}

const optionValue = (options, keys) => {
  if (!options || typeof options !== 'object') return null;
  for (const [k, v] of Object.entries(options)) {
    if (keys.includes(k.toLowerCase()) && v !== null && v !== undefined && String(v).trim()) return String(v);
  }
  return null;
};

/** One order line in the hub's shape, whichever path created it. */
export function mapItem(it, lineIndex) {
  const quantity = parseInt(it.quantity, 10) || 0;
  const unitPrice = num(it.unitPrice ?? it.price);
  const discount = num(it.discount ?? it.lineDiscount?.amount ?? 0);
  const lineTotal = it.lineTotal !== undefined && it.lineTotal !== null
    ? num(it.lineTotal)
    : round2(Math.max(quantity * unitPrice - discount, 0));
  const opts = it.variant || it.selectedVariant || null;
  const c = it.consignment || null;
  return {
    id: String(lineIndex),
    lineIndex,
    productId: it.productId ?? null,
    variantIndex: it.variantIndex ?? null,
    sku: it.sku || opts?.sku || (it.productId ? `P${it.productId}` : ''),
    name: it.name || 'Item',
    size: it.size ?? optionValue(opts, ['size', 'size/age', 'age']),
    color: it.color ?? optionValue(opts, ['color', 'colour', 'colour/variant', 'variant']),
    quantity,
    unitPrice,
    discount,
    lineTotal,
    returnedQty: parseInt(it.returnedQty, 10) || 0,
    isConsignment: Boolean(c),
    consignmentPartner: c?.partner ?? null,
    consignmentProductCost: num(c?.productCost),
    consignmentOpPercent: c ? num(c.opPercent) : 5,
    consignmentOpMin: c ? num(c.opMin) : 3,
    consignmentOtherCost: num(c?.otherCost),
  };
}

/** Order → the hub's SalesOrder shape. */
export function toSalesOrder(order, { customerPrefix = 'CUS' } = {}) {
  const ship = order.shippingAddress && typeof order.shippingAddress === 'object' ? order.shippingAddress : {};
  const items = (Array.isArray(order.items) ? order.items : []).map(mapItem);
  const itemsBeforeDiscount = round2(items.reduce((s, i) => s + i.quantity * i.unitPrice, 0));
  const deliveryCharge = num(order.shippingCharge);
  const grandTotal = num(order.totalAmount);
  const hubWritten = Boolean(order.hubStatus);
  // Hub orders carry every discount on their lines; legacy orders may also
  // have a bill discount or coupon on the header, so derive it.
  const totalDiscount = hubWritten
    ? round2(items.reduce((s, i) => s + i.discount, 0))
    : round2(Math.max(itemsBeforeDiscount + deliveryCharge - grandTotal, 0));
  const status = hubStatusOf(order);
  const paymentStatus = hubPaymentStatusOf(order);
  const amountReceived = hubWritten || order.hubPaymentStatus
    ? num(order.amountReceived)
    : (order.paymentStatus === 'paid' ? grandTotal : 0);
  const addressText = order.address
    ?? ([ship.line1, ship.line2, ship.address].filter(Boolean).join(', ') || null);
  return {
    id: order.orderNumber,
    dbId: order.id,
    channel: channelLabel(order),
    tillSale: isTillSale(order),
    customerId: order.userId ? String(order.userId) : null,
    customerCode: customerCode(order.userId, customerPrefix),
    customerName: order.customerName || ship.fullName || ship.name || 'Customer',
    phone: order.customerPhone || ship.phone || '',
    email: order.guestEmail || ship.email || null,
    area: order.area ?? (ship.city || ship.state || null),
    address: addressText,
    landmark: order.landmark ?? ship.landmark ?? null,
    orderDate: order.createdAt,
    subtotal: round2(grandTotal - deliveryCharge),
    deliveryCharge,
    grandTotal,
    paymentMode: order.hubPaymentMode || LEGACY_PAYMENT_MODES[order.paymentMethod] || 'Online Payment',
    paymentStatus,
    status,
    deliveryDate: order.deliveryDate ?? null,
    courier: order.courier ?? order.shippingMeta?.courierName ?? null,
    trackingNumber: order.trackingNumber ?? order.shippingMeta?.awb ?? null,
    deliveryNotes: order.deliveryNotes ?? null,
    confirmedAt: order.confirmedAt ?? null,
    items,
    fulfilmentMethod: order.fulfilmentMethod || (order.channel === 'pos' ? 'Customer Pickup' : 'Delivery'),
    pickupDate: order.pickupDate ?? null,
    pickupTime: order.pickupTime ?? null,
    pickupNotes: order.pickupNotes ?? null,
    amountReceived,
    remainingBalance: round2(Math.max(grandTotal - amountReceived, 0)),
    itemsBeforeDiscount,
    totalDiscount,
    paymentDate: order.paymentDate ?? null,
    paymentTime: order.paymentTime ?? null,
    paymentReference: order.paymentReference ?? null,
    paymentNotes: order.paymentNotes ?? null,
    paymentHeldIn: order.paymentHeldIn ?? null,
    paymentHolderDetails: order.paymentHolderDetails ?? null,
    cancelledAt: order.cancelledAt ?? null,
    restockedAt: order.restockedAt ?? null,
    stockDeducted: stockDeducted(order),
    labelPrintCount: order.labelPrintCount ?? 0,
    assignedTo: order.assignedTo ? String(order.assignedTo) : null,
    assignedAt: order.assignedAt ?? null,
    createdBy: order.createdBy ?? null,
    // Web-order details the classic admin showed: the real gateway (paymentMode
    // above stays in the hub's vocabulary), coupon, refund state, shipment.
    paymentGateway: order.paymentMethod || null,
    couponCode: order.couponCode || null,
    couponDiscount: num(order.discount),
    refundStatus: order.refundStatus || null,
    refundAmount: order.refundAmount != null ? num(order.refundAmount) : null,
    refundedAt: order.refundedAt ?? null,
    shippingMeta: order.shippingMeta && typeof order.shippingMeta === 'object' ? order.shippingMeta : null,
  };
}

/** Email the order belongs to: the guest address, or the customer account's. */
export async function customerEmailFor(order) {
  if (order.guestEmail) return order.guestEmail;
  if (!order.userId) return null;
  const { User } = await import('../models/index.js');
  const user = await User.findByPk(order.userId, { attributes: ['email', 'role'] });
  return user?.role === 'customer' ? user.email || null : null;
}

/**
 * Send the classic "your order is now …" email when a web order's legacy
 * status moved (the storefront customer only knows those statuses). Never
 * throws — a mail problem must not undo the order change.
 */
export async function emailStatusChange(order, previousOrderStatus) {
  try {
    if (order.channel !== 'web' || !order.orderStatus || order.orderStatus === previousOrderStatus) return false;
    const email = await customerEmailFor(order);
    if (!email) return false;
    const { sendOrderStatusUpdate } = await import('../services/emailService.js');
    await sendOrderStatusUpdate(order.toJSON ? order.toJSON() : order, email);
    return true;
  } catch (err) {
    console.error('[hub] status email failed:', err.message);
    return false;
  }
}

/**
 * Freeze the derived hub view onto a legacy order before the hub first edits
 * it, so later writes start from what staff saw.
 */
export function adoptLegacy(order, view) {
  if (order.hubStatus) return;
  order.hubStatus = view.status;
  order.hubPaymentStatus = view.paymentStatus;
  order.hubPaymentMode = view.paymentMode;
  order.fulfilmentMethod = view.fulfilmentMethod;
  order.amountReceived = view.amountReceived;
  if (!order.customerName) order.customerName = view.customerName;
  if (!order.customerPhone) order.customerPhone = view.phone;
  if (order.area == null) order.area = view.area;
  if (order.address == null) order.address = view.address;
  if (!order.stockState) order.stockState = view.stockDeducted ? 'deducted' : 'none';
  // Line values the hub edits (returnedQty, discounts) need a stable shape.
  order.items = view.items.map((i, idx) => ({
    ...(order.items[idx] || {}),
    sku: i.sku, name: i.name, size: i.size, color: i.color, quantity: i.quantity,
    price: i.unitPrice, unitPrice: i.unitPrice, discount: i.discount, lineTotal: i.lineTotal, returnedQty: i.returnedQty,
  }));
  order.changed('items', true);
}

/** Copy the hub status / payment onto the legacy fields the rest of the app reads. */
export function syncLegacy(order) {
  const { orderStatus, paymentStatus } = legacyFields(order.hubStatus, order.hubPaymentStatus);
  order.orderStatus = orderStatus;
  // A gateway-paid web order stays 'paid' unless staff explicitly refunded it.
  if (!(order.paymentStatus === 'paid' && paymentStatus === 'pending' && order.channel === 'web' && !order.hubPaymentMode)) {
    order.paymentStatus = paymentStatus;
  }
}

export function computeTotals(lines, deliveryCharge) {
  const out = lines.map((l) => ({ ...l, lineTotal: round2(Math.max(l.quantity * l.unitPrice - l.discount, 0)) }));
  const subtotal = round2(out.reduce((s, l) => s + l.lineTotal, 0));
  return {
    lines: out,
    itemsBeforeDiscount: round2(out.reduce((s, l) => s + l.quantity * l.unitPrice, 0)),
    totalDiscount: round2(out.reduce((s, l) => s + l.discount, 0)),
    subtotal,
    grandTotal: round2(subtotal + Math.max(deliveryCharge, 0)),
  };
}

export const FIELD_LABELS = {
  hubStatus: 'Status',
  deliveryDate: 'Delivery date',
  courier: 'Courier / driver',
  trackingNumber: 'Tracking number',
  deliveryNotes: 'Delivery notes',
  pickupDate: 'Pickup date',
  pickupTime: 'Pickup time',
  pickupNotes: 'Pickup notes',
  hubPaymentMode: 'Payment method',
  hubPaymentStatus: 'Payment status',
  amountReceived: 'Amount received',
  paymentDate: 'Payment date',
  paymentTime: 'Payment time',
  paymentReference: 'Transaction reference',
  paymentNotes: 'Payment notes',
  paymentHeldIn: 'Payment received in / held by',
  paymentHolderDetails: 'Payment location / holder details',
  customerName: 'Customer name',
  customerPhone: 'Mobile number',
  area: 'Area',
  address: 'Full address',
  landmark: 'Landmark',
  shippingCharge: 'Delivery charge',
  totalAmount: 'Grand total',
};
