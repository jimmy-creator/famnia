/** Sales-order vocabulary, mirrored from server/src/hub/sales.js. */
export const FULFILMENT_METHODS = ['Delivery', 'Customer Pickup'];

/** Where a staff-entered order came from. Web checkouts show "Website", till sales "Till". */
export const ORDER_SOURCES = ['WhatsApp', 'Instagram', 'Phone call', 'Email', 'Walk-in', 'Other'];
export const ALL_ORDER_SOURCES = ['Website', ...ORDER_SOURCES, 'Till'];

export const DELIVERY_FLOW = ['Confirmed', 'Out for Delivery', 'Delivered', 'Order Fulfilled'];
export const PICKUP_FLOW = ['Confirmed', 'Awaiting Pickup', 'Collected', 'Order Fulfilled'];

export const SALES_ORDER_STATUSES = [
  'Draft', 'Confirmed', 'Awaiting Pickup', 'Out for Delivery', 'Delivered', 'Collected', 'Order Fulfilled',
  'Cancelled', 'Returned',
];

export const SALES_PAYMENT_METHODS = ['Cash', 'Fawran', 'Card', 'Bank Transfer', 'Online Payment', 'COD', 'Other'];
export const SALES_PAYMENT_STATUSES = ['Pending', 'Partially Paid', 'Paid', 'Refunded'];

/** Where the money physically is — kept separate from the payment method. */
export const PAYMENT_HELD_IN_OPTIONS = [
  'Company Bank Account', 'Company Fawran Account', 'Cash in Hand', 'Cash Drawer', 'Mr. Nisar', 'Delivery Driver',
  'Staff Member', 'Customer Pickup Counter', 'Other',
];

export const RETURN_REASONS = ['Customer changed mind', 'Wrong size', 'Wrong item', 'Damaged product', 'Delivery failed', 'Other'];
