/**
 * Web-order and customer calls merged in from the classic admin: gateway
 * refunds, Shiprocket shipping, status emails and guest customers.
 */
import { get, send } from './api';

const orderUrl = (id, rest = '') => `/hub/orders/${encodeURIComponent(id)}${rest}`;

/** Cancel, optionally telling an online customer by email (default on for web orders). */
export const cancelOrderWithEmail = (orderId, reason, restock, emailCustomer) =>
  send('post', orderUrl(orderId, '/cancel'), {
    reason, restock, ...(emailCustomer === undefined ? {} : { emailCustomer }),
  });

/** Refund a paid online order through its gateway, or approve the customer's request. Resolves { amount, cancelled, restored, emailed }. */
export const refundOrder = (orderId, { amount, reason, emailCustomer }) =>
  send('post', orderUrl(orderId, '/refund'), { amount, reason, emailCustomer });
export const rejectRefund = (orderId, reason) => send('post', orderUrl(orderId, '/refund-reject'), { reason });

export const shippingStatusQuery = {
  queryKey: ['femnia', 'shipping-status'],
  queryFn: () => get('/hub/shipping/status'),
  staleTime: 10 * 60_000,
};
/** action: create | cancel | refresh. Resolves { message, shippingMeta }. */
export const shippingAction = (orderId, action) => send('post', orderUrl(orderId, `/shipping/${action}`));
/** doc: label | invoice | manifest. Resolves { url }. */
export const shippingDocument = (orderId, doc) => get(orderUrl(orderId, `/shipping/${doc}`));

export const guestCustomersQuery = {
  queryKey: ['femnia', 'guest-customers'],
  queryFn: () => get('/hub/customers/guests'),
  staleTime: 30_000,
};
/** A guest's orders, in the same { order, returns } shape as customer purchases. */
export const guestOrdersQuery = (email) => ({
  queryKey: ['femnia', 'guest-orders', email],
  queryFn: () => get(`/hub/customers/guest-orders?email=${encodeURIComponent(email)}`),
  enabled: Boolean(email),
});

/** The classic server-made PDF invoice for an online order (database id). */
export const pdfInvoiceUrl = (dbId) => `/api/orders/${dbId}/invoice`;
