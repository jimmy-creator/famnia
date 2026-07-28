import Razorpay from 'razorpay';
import crypto from 'crypto';
import PaytmChecksum from 'paytmchecksum';

// ============================================
// Base Payment Gateway Interface
// ============================================
class PaymentGateway {
  async createOrder(amount, currency, receipt, notes) {
    throw new Error('createOrder not implemented');
  }
  async verifyPayment(paymentData) {
    throw new Error('verifyPayment not implemented');
  }
  getCheckoutConfig(order) {
    throw new Error('getCheckoutConfig not implemented');
  }
}

// ============================================
// RAZORPAY
// ============================================
class RazorpayGateway extends PaymentGateway {
  constructor() {
    super();
    this.instance = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }

  async createOrder(amount, currency = 'INR', receipt, notes = {}) {
    const customer = notes.customer || {};
    const options = {
      amount: Math.round(amount * 100), // Razorpay expects paise (subunits)
      currency,
      receipt,
      notes: {
        order_id: String(notes.orderId || ''),
        customer_name: customer.name || '',
        customer_email: customer.email || '',
      },
    };
    const order = await this.instance.orders.create(options);
    return {
      gatewayOrderId: order.id,
      amount: order.amount / 100,
      amountInSubunits: order.amount,
      currency: order.currency,
      receipt: order.receipt,
      status: order.status,
    };
  }

  async verifyPayment({ razorpay_order_id, razorpay_payment_id, razorpay_signature }) {
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest('hex');

    const isValid = expectedSignature === razorpay_signature;

    return {
      verified: isValid,
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
    };
  }

  getCheckoutConfig(order) {
    return {
      gateway: 'razorpay',
      key: process.env.RAZORPAY_KEY_ID,
      orderId: order.gatewayOrderId,
      amount: order.amountInSubunits, // paise
      currency: order.currency,
      name: process.env.STORE_NAME || 'ShopHub',
      description: `Order ${order.receipt}`,
    };
  }
}

// ============================================
// CASHFREE (Scaffold)
// ============================================
class CashfreeGateway extends PaymentGateway {
  constructor() {
    super();
    // Initialize with:
    // process.env.CASHFREE_APP_ID
    // process.env.CASHFREE_SECRET_KEY
    // process.env.CASHFREE_ENV ('sandbox' or 'production')
  }

  async createOrder(amount, currency = 'INR', receipt, notes = {}) {
    // Cashfree API: POST https://sandbox.cashfree.com/pg/orders
    // const response = await fetch(`${baseUrl}/pg/orders`, {
    //   method: 'POST',
    //   headers: {
    //     'x-api-version': '2023-08-01',
    //     'x-client-id': process.env.CASHFREE_APP_ID,
    //     'x-client-secret': process.env.CASHFREE_SECRET_KEY,
    //     'Content-Type': 'application/json',
    //   },
    //   body: JSON.stringify({
    //     order_id: receipt,
    //     order_amount: amount,
    //     order_currency: currency,
    //     customer_details: notes.customer || {},
    //   }),
    // });
    // const data = await response.json();
    // return {
    //   gatewayOrderId: data.cf_order_id,
    //   sessionId: data.payment_session_id,
    //   amount, currency, receipt,
    // };
    throw new Error('Cashfree integration requires CASHFREE_APP_ID and CASHFREE_SECRET_KEY in .env');
  }

  async verifyPayment(paymentData) {
    // Verify using Cashfree webhook signature or GET /pg/orders/{order_id}
    throw new Error('Cashfree verification not configured');
  }

  getCheckoutConfig(order) {
    return {
      gateway: 'cashfree',
      sessionId: order.sessionId,
      orderId: order.gatewayOrderId,
    };
  }
}

// ============================================
// PAYU (Scaffold)
// ============================================
class PayUGateway extends PaymentGateway {
  constructor() {
    super();
    // Initialize with:
    // process.env.PAYU_MERCHANT_KEY
    // process.env.PAYU_MERCHANT_SALT
    // process.env.PAYU_ENV ('test' or 'production')
  }

  async createOrder(amount, currency = 'INR', receipt, notes = {}) {
    // PayU uses form-based redirect, generate hash:
    // const hashString = `${key}|${txnid}|${amount}|${productinfo}|${firstname}|${email}|||||||||||${salt}`;
    // const hash = crypto.createHash('sha512').update(hashString).digest('hex');
    // Return form data for redirect to PayU
    throw new Error('PayU integration requires PAYU_MERCHANT_KEY and PAYU_MERCHANT_SALT in .env');
  }

  async verifyPayment(paymentData) {
    throw new Error('PayU verification not configured');
  }

  getCheckoutConfig(order) {
    return { gateway: 'payu', formData: order.formData };
  }
}

// ============================================
// PHONEPE (Scaffold)
// ============================================
class PhonePeGateway extends PaymentGateway {
  constructor() {
    super();
    // Initialize with:
    // process.env.PHONEPE_MERCHANT_ID
    // process.env.PHONEPE_SALT_KEY
    // process.env.PHONEPE_SALT_INDEX
    // process.env.PHONEPE_ENV ('sandbox' or 'production')
  }

  async createOrder(amount, currency = 'INR', receipt, notes = {}) {
    // PhonePe Standard Checkout API
    // POST https://api.phonepe.com/apis/hermes/pg/v1/pay
    throw new Error('PhonePe integration requires PHONEPE_MERCHANT_ID and PHONEPE_SALT_KEY in .env');
  }

  async verifyPayment(paymentData) {
    throw new Error('PhonePe verification not configured');
  }

  getCheckoutConfig(order) {
    return { gateway: 'phonepe', redirectUrl: order.redirectUrl };
  }
}

// ============================================
// CCAVENUE (Scaffold)
// ============================================
class CCAvenueGateway extends PaymentGateway {
  constructor() {
    super();
    // Initialize with:
    // process.env.CCAVENUE_MERCHANT_ID
    // process.env.CCAVENUE_ACCESS_CODE
    // process.env.CCAVENUE_WORKING_KEY
  }

  async createOrder(amount, currency = 'INR', receipt, notes = {}) {
    // CCAvenue uses encrypted form redirect
    throw new Error('CCAvenue integration requires CCAVENUE_MERCHANT_ID and CCAVENUE_WORKING_KEY in .env');
  }

  async verifyPayment(paymentData) {
    throw new Error('CCAvenue verification not configured');
  }

  getCheckoutConfig(order) {
    return { gateway: 'ccavenue', encryptedData: order.encryptedData };
  }
}

// ============================================
// PAYTM (Full Implementation)
// ============================================
class PaytmGateway extends PaymentGateway {
  constructor() {
    super();
    this.merchantId = process.env.PAYTM_MERCHANT_ID;
    this.merchantKey = process.env.PAYTM_MERCHANT_KEY;
    this.env = process.env.PAYTM_ENV || 'staging';
    this.baseUrl = this.env === 'production'
      ? 'https://secure.paytmpayments.com'
      : 'https://securestage.paytmpayments.com';
  }

  async createOrder(amount, currency = 'INR', receipt, notes = {}) {
    const orderId = receipt;
    const customer = notes.customer || {};

    const body = {
      requestType: 'Payment',
      mid: this.merchantId,
      websiteName: this.env === 'production' ? 'DEFAULT' : 'WEBSTAGING',
      orderId: orderId,
      txnAmount: {
        value: amount.toFixed(2),
        currency: currency,
      },
      userInfo: {
        custId: String(notes.orderId || 'CUST_001'),
      },
      callbackUrl: `${process.env.SERVER_URL || 'http://localhost:3000'}/api/payment/paytm-callback`,
    };

    // Add optional fields only if they have values
    if (customer.email) body.userInfo.email = customer.email;
    if (customer.name) body.userInfo.firstName = customer.name.split(' ')[0];
    if (customer.phone) body.userInfo.mobile = customer.phone;

    const checksum = await PaytmChecksum.generateSignature(
      JSON.stringify(body),
      this.merchantKey
    );

    const paytmParams = {
      body,
      head: { signature: checksum },
    };

    const url = `${this.baseUrl}/theia/api/v1/initiateTransaction?mid=${this.merchantId}&orderId=${orderId}`;

    console.log('Paytm initiateTransaction URL:', url);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(paytmParams),
    });

    const data = await response.json();
    console.log('Paytm initiateTransaction response:', JSON.stringify(data));

    if (data.body?.resultInfo?.resultStatus === 'S') {
      return {
        gatewayOrderId: orderId,
        txnToken: data.body.txnToken,
        amount,
        currency,
        receipt: orderId,
      };
    } else {
      const msg = data.body?.resultInfo?.resultMsg || 'Failed to initiate Paytm transaction';
      const code = data.body?.resultInfo?.resultCode || 'UNKNOWN';
      throw new Error(`Paytm Error [${code}]: ${msg}`);
    }
  }

  async verifyPayment(paymentData) {
    const { orderId } = paymentData;

    const body = {
      mid: this.merchantId,
      orderId: orderId,
    };

    const checksum = await PaytmChecksum.generateSignature(
      JSON.stringify(body),
      this.merchantKey
    );

    const paytmParams = {
      body,
      head: { signature: checksum },
    };

    const url = `${this.baseUrl}/v3/order/status`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(paytmParams),
    });

    const data = await response.json();
    console.log('Paytm order status response:', JSON.stringify(data));

    const isSuccess = data.body?.resultInfo?.resultStatus === 'TXN_SUCCESS';

    return {
      verified: isSuccess,
      paymentId: data.body?.txnId,
      orderId: data.body?.orderId,
      status: data.body?.resultInfo?.resultStatus,
      message: data.body?.resultInfo?.resultMsg,
    };
  }

  getCheckoutConfig(order) {
    return {
      gateway: 'paytm',
      mid: this.merchantId,
      orderId: order.gatewayOrderId,
      txnToken: order.txnToken,
      amount: order.amount,
      currency: order.currency,
      env: this.env,
      baseUrl: this.baseUrl,
    };
  }
}

// ============================================
// STRIPE
// ============================================
let _stripe = null;
let _stripeModule = null;
async function getStripeInstance() {
  if (!_stripe) {
    if (!_stripeModule) {
      _stripeModule = (await import('stripe')).default;
    }
    _stripe = new _stripeModule(process.env.STRIPE_SECRET_KEY);
  }
  return _stripe;
}

class StripeGateway extends PaymentGateway {

  async createOrder(amount, currency = 'QAR', receipt, notes = {}) {
    const customer = notes.customer || {};
    const session = await (await getStripeInstance()).checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: currency.toLowerCase(),
          product_data: { name: `Order ${receipt}` },
          unit_amount: Math.round(amount * 100),
        },
        quantity: 1,
      }],
      customer_email: customer.email || undefined,
      metadata: { orderNumber: receipt, orderId: String(notes.orderId || '') },
      success_url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/order-success?orderNumber=${receipt}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/checkout?cancelled=true`,
    });

    return {
      gatewayOrderId: session.id,
      sessionId: session.id,
      sessionUrl: session.url,
      amount,
      currency,
      receipt,
    };
  }

  async verifyPayment(paymentData) {
    const { sessionId } = paymentData;
    const session = await (await getStripeInstance()).checkout.sessions.retrieve(sessionId);
    return {
      verified: session.payment_status === 'paid',
      paymentId: session.payment_intent,
      orderId: session.metadata?.orderNumber,
      status: session.payment_status,
    };
  }

  getCheckoutConfig(order) {
    return {
      gateway: 'stripe',
      sessionId: order.sessionId,
      sessionUrl: order.sessionUrl,
      orderId: order.gatewayOrderId,
      amount: order.amount,
      currency: order.currency,
    };
  }
}

// ============================================
// NOMOD (Hosted Checkout — UAE)
// ============================================
class NomodGateway extends PaymentGateway {
  constructor() {
    super();
    this.apiKey = process.env.NOMOD_API_KEY;
    this.baseUrl = 'https://api.nomod.com';
    this.clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  }

  async createOrder(amount, currency = 'QAR', receipt, notes = {}) {
    const customer = notes.customer || {};
    const orderItems = notes.items || [];

    // Build items array — Nomod requires item_id, name, unit_amount
    const items = orderItems.length > 0
      ? orderItems.map(item => {
          const unitAmount = parseFloat(item.price).toFixed(2);
          const qty = item.quantity || 1;
          return {
            item_id: String(item.productId || item.id || item.name),
            name: item.name,
            quantity: qty,
            unit_amount: unitAmount,
            total_amount: (parseFloat(unitAmount) * qty).toFixed(2),
          };
        })
      : [{
          item_id: receipt,
          name: `Order ${receipt}`,
          quantity: 1,
          unit_amount: amount.toFixed(2),
          total_amount: amount.toFixed(2),
        }];

    const body = {
      reference_id: receipt,
      amount: amount.toFixed(2),
      currency: currency.toUpperCase(),
      items,
      metadata: { order_number: receipt },
      success_url: `${this.clientUrl}/order-success?orderNumber=${receipt}&gateway=nomod`,
      failure_url: `${this.clientUrl}/checkout?payment=failed`,
      cancelled_url: `${this.clientUrl}/checkout?cancelled=true`,
    };

    if (customer.name || customer.email || customer.phone) {
      body.customer = {};
      if (customer.name) {
        const parts = customer.name.trim().split(/\s+/);
        body.customer.first_name = parts[0];
        body.customer.last_name = parts.length > 1 ? parts.slice(1).join(' ') : parts[0];
      }
      if (customer.email) body.customer.email = customer.email;
      if (customer.phone) body.customer.phone_number = customer.phone;
    }

    console.log('[Nomod] success_url:', body.success_url);

    const response = await fetch(`${this.baseUrl}/v1/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': this.apiKey,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(`Nomod error: ${JSON.stringify(data)}`);
    }

    return {
      gatewayOrderId: data.id,
      sessionId: data.id,
      sessionUrl: data.url || data.checkout_url || data.link,
      amount,
      currency,
      receipt,
    };
  }

  async verifyPayment({ sessionId }) {
    const response = await fetch(`${this.baseUrl}/v1/checkout/${sessionId}`, {
      headers: { 'X-API-KEY': this.apiKey },
    });

    const data = await response.json();

    // Session status: paid, created, cancelled, expired
    const sessionPaid = data.status === 'paid';

    // Also check charges array — a charge with status 'paid' confirms payment
    const charges = data.charges || [];
    const paidCharge = charges.find(c => c.status === 'paid');

    const isPaid = sessionPaid || !!paidCharge;

    return {
      verified: isPaid,
      paymentId: paidCharge?.id || charges[0]?.id || sessionId,
      orderId: data.reference_id,
      status: data.status,
    };
  }

  async refund(checkoutId, amount, referenceId) {
    const body = {
      amount: amount.toFixed(2),
      idempotency_key: `refund-${referenceId}-${Date.now()}`,
      reference_id: referenceId,
      reason: 'Refund requested by merchant',
    };

    const response = await fetch(`${this.baseUrl}/v1/checkout/${checkoutId}/refund`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': this.apiKey,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(`Nomod refund error: ${JSON.stringify(data)}`);
    }

    return {
      refundId: data.refund_id,
      chargeId: data.charge_id,
      status: data.status,
      amount: data.amount,
    };
  }

  getCheckoutConfig(order) {
    return {
      gateway: 'nomod',
      sessionId: order.sessionId,
      sessionUrl: order.sessionUrl,
      orderId: order.gatewayOrderId,
      amount: order.amount,
      currency: order.currency,
    };
  }
}

// ============================================
// TAP PAYMENTS (Kuwait / GCC)
// Hosted-redirect Charge API. Auth: Bearer <secret_key>.
// KWD uses 3 decimal places (e.g. 1.500 KWD); amount is sent as a
// decimal in major units, not subunits.
// Docs: https://developers.tap.company/reference/create-a-charge
// ============================================
class TapGateway extends PaymentGateway {
  constructor() {
    super();
    this.secretKey = process.env.TAP_SECRET_KEY;
    this.publicKey = process.env.TAP_PUBLIC_KEY;
    this.baseUrl = 'https://api.tap.company/v2';
    this.clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  }

  async createOrder(amount, currency = 'QAR', receipt, notes = {}) {
    const customer = notes.customer || {};
    const orderItems = notes.items || [];

    // Most GCC currencies are 2-decimal; only KWD/BHD/OMR use 3. QAR is 2.
    const fmt = (n) => Number.parseFloat(n).toFixed(['KWD', 'BHD', 'OMR'].includes(currency.toUpperCase()) ? 3 : 2);

    // Split phone into country_code + number. Default to Qatar (+974).
    let countryCode = '974';
    let phoneNumber = '';
    if (customer.phone) {
      const cleaned = String(customer.phone).replace(/[^\d]/g, '');
      if (cleaned.startsWith('974') && cleaned.length > 3) {
        countryCode = '974';
        phoneNumber = cleaned.slice(3);
      } else {
        phoneNumber = cleaned;
      }
    }

    const [firstName, ...lastParts] = String(customer.name || 'Customer').trim().split(/\s+/);
    const lastName = lastParts.join(' ') || firstName;

    const body = {
      amount: fmt(amount),
      currency: currency.toUpperCase(),
      threeDSecure: true,
      save_card: false,
      description: `Order ${receipt}`,
      statement_descriptor: (process.env.STORE_NAME || 'Elegant Bayt').slice(0, 22),
      reference: { transaction: receipt, order: String(notes.orderId || receipt) },
      receipt: { email: !!customer.email, sms: !!phoneNumber },
      customer: {
        first_name: firstName,
        last_name: lastName,
        email: customer.email || undefined,
        ...(phoneNumber ? { phone: { country_code: countryCode, number: phoneNumber } } : {}),
      },
      source: { id: 'src_all' },           // "all" lets the hosted page show KNET / cards / Apple Pay / etc.
      redirect: { url: `${this.clientUrl}/order-success?orderNumber=${receipt}&gateway=tap` },
      post:     { url: `${process.env.SERVER_URL || ''}/api/payment/tap-callback` },
    };

    const resp = await fetch(`${this.baseUrl}/charges/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.secretKey}`,
      },
      body: JSON.stringify(body),
    });
    const data = await resp.json();

    if (!resp.ok || !data.id) {
      throw new Error(`Tap create charge error: ${data?.errors?.[0]?.description || data?.message || JSON.stringify(data).slice(0, 300)}`);
    }

    const redirectUrl = data?.transaction?.url || data?.redirect?.url;
    if (!redirectUrl) {
      throw new Error('Tap did not return a hosted-checkout URL');
    }

    return {
      gatewayOrderId: data.id,
      chargeId: data.id,
      sessionUrl: redirectUrl,
      amount,
      currency,
      receipt,
    };
  }

  async verifyPayment({ chargeId }) {
    if (!chargeId) throw new Error('Tap verify requires chargeId');
    const resp = await fetch(`${this.baseUrl}/charges/${chargeId}`, {
      headers: { Authorization: `Bearer ${this.secretKey}` },
    });
    const data = await resp.json();
    const status = String(data?.status || '').toUpperCase();
    const verified = status === 'CAPTURED' || status === 'AUTHORIZED';
    return {
      verified,
      paymentId: data?.id,
      orderId: data?.reference?.transaction,
      status,
      message: data?.response?.message || data?.errors?.[0]?.description,
    };
  }

  getCheckoutConfig(order) {
    return {
      gateway: 'tap',
      chargeId: order.chargeId,
      sessionUrl: order.sessionUrl,
      orderId: order.gatewayOrderId,
      amount: order.amount,
      currency: order.currency,
    };
  }
}

// ============================================
// TAMARA (Buy Now Pay Later — UAE / GCC)
// Hosted-redirect checkout. Auth: Bearer <api token>.
// Flow: create checkout -> consumer approves on Tamara -> redirect back ->
// GET order status; when "approved" the merchant must AUTHORISE the order to
// confirm it (BNPL-specific extra step vs. a normal card charge).
// Docs: https://docs.tamara.co  (REST API behind the official tamara-sdk).
// ============================================
class TamaraGateway extends PaymentGateway {
  constructor() {
    super();
    this.apiToken = process.env.TAMARA_API_TOKEN;
    this.baseUrl = process.env.TAMARA_API_URL || 'https://api-sandbox.tamara.co';
    this.clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    this.serverUrl = process.env.SERVER_URL || 'http://localhost:3000';
    this.paymentType = process.env.TAMARA_PAYMENT_TYPE || 'PAY_BY_INSTALMENTS';
    this.instalments = parseInt(process.env.TAMARA_INSTALMENTS || '3', 10);
  }

  async _request(path, { method = 'GET', body } = {}) {
    const resp = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiToken}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await resp.json().catch(() => ({}));
    return { ok: resp.ok, status: resp.status, data };
  }

  async createOrder(amount, currency = 'QAR', receipt, notes = {}) {
    const customer = notes.customer || {};
    const addr = notes.shippingAddress || {};
    const orderItems = notes.items || [];
    const dp = ['KWD', 'BHD', 'OMR'].includes(currency.toUpperCase()) ? 3 : 2;
    const round = (n) => Math.round(Number(n) * 10 ** dp) / 10 ** dp;
    const money = (n) => ({ amount: round(n), currency: currency.toUpperCase() });

    const [firstName, ...lastParts] = String(customer.name || addr.fullName || 'Customer').trim().split(/\s+/);
    const lastName = lastParts.join(' ') || firstName;
    const phone = String(customer.phone || addr.phone || '').replace(/[^\d+]/g, '');

    const items = (orderItems.length ? orderItems : [{ name: `Order ${receipt}`, price: amount, quantity: 1, productId: receipt }])
      .map((it) => {
        const qty = it.quantity || 1;
        const item = {
          reference_id: String(it.productId || it.id || it.name),
          type: 'Physical',
          name: it.name,
          sku: String(it.productId || it.id || receipt),
          quantity: qty,
          unit_price: money(it.price),
          total_amount: money(parseFloat(it.price) * qty),
          tax_amount: money(0),
          discount_amount: money(0),
        };
        if (typeof it.image === 'string' && /^https?:\/\//.test(it.image)) item.image_url = it.image;
        return item;
      });

    // Tamara validates: total_amount = sum(item.total_amount) + shipping - discount + tax.
    // Prices here are VAT-inclusive, so order-level tax_amount is 0. Reconcile the
    // shipping/discount split against the authoritative finalAmount.
    const itemsSum = round(items.reduce((s, it) => s + it.total_amount.amount, 0));
    let shippingAmt = round(notes.shipping || 0);
    let discountAmt = round(notes.discount || 0);
    if (Math.abs(round(itemsSum + shippingAmt - discountAmt) - round(amount)) > 0.01) {
      const diff = round(amount - itemsSum); // net of shipping minus discount
      shippingAmt = diff >= 0 ? diff : 0;
      discountAmt = diff < 0 ? -diff : 0;
    }

    const address = {
      first_name: firstName,
      last_name: lastName,
      line1: addr.address || '',
      city: addr.city || '',
      region: addr.state || '',
      country_code: 'AE',
      phone_number: phone,
    };

    const body = {
      order_reference_id: receipt,
      total_amount: money(amount),
      tax_amount: money(0),
      shipping_amount: money(shippingAmt),
      ...(discountAmt > 0 ? { discount: { name: 'Discount', amount: money(discountAmt) } } : {}),
      description: `Order ${receipt}`,
      country_code: 'AE',
      payment_type: this.paymentType,
      instalments: this.instalments,
      locale: 'en_US',
      items,
      consumer: {
        first_name: firstName,
        last_name: lastName,
        phone_number: phone,
        email: customer.email || '',
      },
      shipping_address: address,
      billing_address: address,
      merchant_url: {
        success: `${this.clientUrl}/order-success?orderNumber=${receipt}&gateway=tamara`,
        failure: `${this.clientUrl}/checkout?payment=failed`,
        cancel: `${this.clientUrl}/checkout?cancelled=true`,
        notification: `${this.serverUrl}/api/payment/tamara-callback`,
      },
    };

    const { ok, data } = await this._request('/checkout', { method: 'POST', body });
    if (!ok || !data.checkout_url) {
      const msg = data?.message || data?.errors?.[0]?.error_code || JSON.stringify(data).slice(0, 300);
      throw new Error(`Tamara create checkout error: ${msg}`);
    }

    return {
      gatewayOrderId: data.order_id,
      checkoutId: data.checkout_id,
      sessionUrl: data.checkout_url,
      amount,
      currency,
      receipt,
    };
  }

  async verifyPayment({ orderId }) {
    if (!orderId) throw new Error('Tamara verify requires the Tamara orderId');

    const detail = await this._request(`/orders/${orderId}`);
    let status = String(detail.data?.status || '').toLowerCase();

    // BNPL: an "approved" order is not yet captured/confirmed — authorise it.
    if (status === 'approved') {
      const auth = await this._request(`/orders/${orderId}/authorise`, { method: 'POST' });
      if (auth.ok) status = String(auth.data?.order_status || 'authorised').toLowerCase();
    }

    const verified = ['authorised', 'fully_captured', 'partially_captured'].includes(status);
    return {
      verified,
      paymentId: orderId,
      orderId: detail.data?.order_reference_id,
      status,
    };
  }

  getCheckoutConfig(order) {
    return {
      gateway: 'tamara',
      checkoutId: order.checkoutId,
      sessionUrl: order.sessionUrl,
      orderId: order.gatewayOrderId,
      amount: order.amount,
      currency: order.currency,
    };
  }
}

// ============================================
// Gateway Factory
// ============================================
const gateways = {
  razorpay: RazorpayGateway,
  cashfree: CashfreeGateway,
  payu: PayUGateway,
  phonepe: PhonePeGateway,
  ccavenue: CCAvenueGateway,
  paytm: PaytmGateway,
  stripe: StripeGateway,
  nomod: NomodGateway,
  tap: TapGateway,
  tamara: TamaraGateway,
};

export function getPaymentGateway(name) {
  const gatewayName = name || process.env.PAYMENT_GATEWAY || 'razorpay';
  const GatewayClass = gateways[gatewayName];
  if (!GatewayClass) {
    throw new Error(`Unknown payment gateway: ${gatewayName}. Available: ${Object.keys(gateways).join(', ')}`);
  }
  return new GatewayClass();
}

export function getAvailableGateways() {
  const available = [];

  if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
    available.push({ id: 'razorpay', name: 'Razorpay', description: 'Cards, UPI, Wallets, Net Banking' });
  }
  if (process.env.CASHFREE_APP_ID && process.env.CASHFREE_SECRET_KEY) {
    available.push({ id: 'cashfree', name: 'Cashfree', description: 'Cards, UPI, Wallets, Net Banking' });
  }
  if (process.env.PAYU_MERCHANT_KEY && process.env.PAYU_MERCHANT_SALT) {
    available.push({ id: 'payu', name: 'PayU', description: 'Cards, UPI, Wallets, EMI' });
  }
  if (process.env.PHONEPE_MERCHANT_ID && process.env.PHONEPE_SALT_KEY) {
    available.push({ id: 'phonepe', name: 'PhonePe', description: 'UPI, Cards, Wallets' });
  }
  if (process.env.CCAVENUE_MERCHANT_ID && process.env.CCAVENUE_WORKING_KEY) {
    available.push({ id: 'ccavenue', name: 'CCAvenue', description: 'Cards, Net Banking, UPI, Wallets' });
  }
  if (process.env.PAYTM_MERCHANT_ID && process.env.PAYTM_MERCHANT_KEY) {
    available.push({ id: 'paytm', name: 'Paytm', description: 'UPI, Cards, Wallets, Net Banking' });
  }
  if (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PUBLISHABLE_KEY) {
    available.push({ id: 'stripe', name: 'Stripe', description: 'Cards, Apple Pay, Google Pay' });
  }
  if (process.env.NOMOD_API_KEY) {
    available.push({ id: 'nomod', name: 'Nomod', description: 'Cards, Apple Pay, Google Pay, Tabby, Tamara' });
  }
  if (process.env.TAP_SECRET_KEY) {
    available.push({ id: 'tap', name: 'Card / Apple Pay / Google Pay', description: 'Secure payment via Tap — cards, Apple Pay & Google Pay' });
  }
  if (process.env.TAMARA_API_TOKEN) {
    available.push({ id: 'tamara', name: 'Tamara', description: 'Pay in instalments — 0% interest, Sharia-compliant' });
  }

  return available;
}

export default { getPaymentGateway, getAvailableGateways };
