import nodemailer from 'nodemailer';

const smtpConfig = process.env.SMTP_HOST
  ? {
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '465'),
      secure: parseInt(process.env.SMTP_PORT || '465') === 465,
      auth: {
        user: process.env.SMTP_EMAIL,
        pass: process.env.SMTP_APP_PASSWORD,
      },
    }
  : {
      service: 'gmail',
      auth: {
        user: process.env.SMTP_EMAIL,
        pass: process.env.SMTP_APP_PASSWORD,
      },
    };

const transporter = nodemailer.createTransport(smtpConfig);

// Log SMTP status at boot so it's obvious whether email actually works.
// (Without SMTP_EMAIL + SMTP_APP_PASSWORD, all emails are silently skipped.)
export async function verifyEmailTransport() {
  if (!process.env.SMTP_EMAIL || !process.env.SMTP_APP_PASSWORD) {
    console.warn('[email] NOT configured — set SMTP_EMAIL + SMTP_APP_PASSWORD (and SMTP_HOST/SMTP_PORT for non-Gmail). All emails will be skipped.');
    return false;
  }
  try {
    await transporter.verify();
    const via = process.env.SMTP_HOST ? `${process.env.SMTP_HOST}:${process.env.SMTP_PORT || '465'}` : 'gmail';
    console.log(`[email] SMTP ready — sending as ${process.env.SMTP_EMAIL} via ${via}`);
    return true;
  } catch (err) {
    console.error(`[email] SMTP verify FAILED (${err.message}). Emails will fail to send — check credentials/host/port.`);
    return false;
  }
}

// Send a one-off test email (used by `npm run test:email`).
export async function sendTestEmail(to) {
  if (!process.env.SMTP_EMAIL || !process.env.SMTP_APP_PASSWORD) {
    throw new Error('SMTP not configured (SMTP_EMAIL / SMTP_APP_PASSWORD missing)');
  }
  return transporter.sendMail({
    from: `"${process.env.STORE_NAME || 'Fineline'}" <${process.env.SMTP_EMAIL}>`,
    to,
    subject: `Test email from ${process.env.STORE_NAME || 'Fineline'}`,
    html: '<p>✅ Your SMTP configuration works — this is a test email.</p>',
  });
}

const storeName = process.env.STORE_NAME || 'Fineline';
const storeEmail = process.env.SMTP_EMAIL;
const storePhone = process.env.STORE_PHONE || '';
const storeAddress = process.env.STORE_ADDRESS || '';

const brandColor = process.env.BRAND_COLOR || '#1a1614';
const brandLight = process.env.BRAND_LIGHT || '#faf8f5';
const brandBorder = process.env.BRAND_BORDER || '#e8e0d8';
const textMain = process.env.EMAIL_TEXT_MAIN || '#1e293b';
const textDim = process.env.EMAIL_TEXT_DIM || '#64748b';
const bgColor = process.env.EMAIL_BG || '#f1f5f9';

const currencySymbol = process.env.CURRENCY_SYMBOL || '₹';
// Display decimals — pairs with the client's VITE_CURRENCY_DECIMALS.
// store4 (KWD/fils) sets CURRENCY_DECIMALS=3; default 2 for INR/AED.
const currencyDecimals = (() => {
  const n = parseInt(process.env.CURRENCY_DECIMALS, 10);
  return Number.isFinite(n) && n >= 0 && n <= 4 ? n : 2;
})();

function formatPrice(amount) {
  return `${currencySymbol}${(parseFloat(amount) || 0).toFixed(currencyDecimals)}`;
}

function orderItemsHTML(items) {
  return items.map((item) => `
    <tr>
      <td style="padding:12px 16px;border-bottom:1px solid ${brandBorder};font-size:14px;color:${textMain};">
        ${item.name}${item.variant ? `<br><span style="font-size:12px;color:${textDim};">${Object.entries(item.variant).map(([k,v]) => `${k}: ${v}`).join(', ')}</span>` : ''}
      </td>
      <td style="padding:12px 16px;border-bottom:1px solid ${brandBorder};font-size:14px;color:${textDim};text-align:center;">
        ${item.quantity}
      </td>
      <td style="padding:12px 16px;border-bottom:1px solid ${brandBorder};font-size:14px;color:${textMain};text-align:right;font-weight:600;">
        ${formatPrice(item.price * item.quantity)}
      </td>
    </tr>
  `).join('');
}

function baseTemplate(content) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:${bgColor};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;">

    <!-- Header -->
    <div style="background:${brandColor};padding:24px 32px;border-radius:12px 12px 0 0;text-align:center;">
      <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.3px;">
        ${storeName}
      </h1>
      ${storeAddress ? `<p style="margin:6px 0 0;font-size:12px;color:rgba(255,255,255,0.65);">${storeAddress}</p>` : ''}
    </div>

    <!-- Content -->
    <div style="background:#ffffff;padding:32px;border:1px solid ${brandBorder};border-top:none;">
      ${content}
    </div>

    <!-- Footer -->
    <div style="background:${brandLight};padding:20px 32px;border:1px solid ${brandBorder};border-top:none;border-radius:0 0 12px 12px;text-align:center;">
      <p style="margin:0;font-size:12px;color:${textDim};">
        © ${new Date().getFullYear()} ${storeName}. All rights reserved.
      </p>
      ${storePhone ? `<p style="margin:6px 0 0;font-size:12px;color:${textDim};">📞 ${storePhone}</p>` : ''}
      <p style="margin:6px 0 0;font-size:12px;color:${textDim};">
        Questions? Reply to this email or write to <a href="mailto:${storeEmail}" style="color:${brandColor};text-decoration:none;">${storeEmail}</a>
      </p>
    </div>

  </div>
</body>
</html>`;
}

// ============================================
// ORDER CONFIRMATION
// ============================================
export async function sendOrderConfirmation(order, customerEmail) {
  const address = order.shippingAddress;
  const items = order.items;

  const html = baseTemplate(`
    <div style="text-align:center;margin-bottom:24px;">
      <div style="width:56px;height:56px;background:#dcfce7;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px;">
        <span style="font-size:28px;">✓</span>
      </div>
      <h2 style="margin:0 0 4px;font-size:22px;color:${textMain};">Order Confirmed!</h2>
      <p style="margin:0;font-size:14px;color:${textDim};">Thank you for your purchase</p>
    </div>

    <div style="background:${brandLight};border:1px solid ${brandBorder};border-radius:8px;padding:16px;margin-bottom:24px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:5px 0;font-size:13px;color:${textDim};">Order Number</td>
          <td style="padding:5px 0;font-size:13px;color:${textMain};text-align:right;font-weight:600;">${order.orderNumber}</td>
        </tr>
        <tr>
          <td style="padding:5px 0;font-size:13px;color:${textDim};">Date</td>
          <td style="padding:5px 0;font-size:13px;color:${textMain};text-align:right;">${new Date(order.createdAt).toLocaleDateString('en-AE', { day: 'numeric', month: 'long', year: 'numeric' })}</td>
        </tr>
        <tr>
          <td style="padding:5px 0;font-size:13px;color:${textDim};">Payment Method</td>
          <td style="padding:5px 0;font-size:13px;color:${textMain};text-align:right;text-transform:capitalize;">${order.paymentMethod}</td>
        </tr>
        <tr>
          <td style="padding:5px 0;font-size:13px;color:${textDim};">Payment Status</td>
          <td style="padding:5px 0;font-size:13px;color:${order.paymentStatus === 'paid' ? '#16a34a' : '#d97706'};text-align:right;text-transform:capitalize;font-weight:600;">${order.paymentStatus}</td>
        </tr>
      </table>
    </div>

    <h3 style="margin:0 0 12px;font-size:13px;color:${textDim};text-transform:uppercase;letter-spacing:1.5px;">Items Ordered</h3>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
      <thead>
        <tr style="background:${brandLight};">
          <th style="padding:10px 16px;text-align:left;font-size:11px;color:${textDim};text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid ${brandBorder};">Item</th>
          <th style="padding:10px 16px;text-align:center;font-size:11px;color:${textDim};text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid ${brandBorder};">Qty</th>
          <th style="padding:10px 16px;text-align:right;font-size:11px;color:${textDim};text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid ${brandBorder};">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${orderItemsHTML(items)}
      </tbody>
    </table>

    <div style="border-top:2px solid ${brandColor};padding-top:12px;text-align:right;margin-bottom:24px;">
      <span style="font-size:18px;font-weight:700;color:${textMain};">Total: ${formatPrice(order.totalAmount)}</span>
    </div>

    <h3 style="margin:0 0 8px;font-size:13px;color:${textDim};text-transform:uppercase;letter-spacing:1.5px;">Shipping Address</h3>
    <div style="background:${brandLight};border:1px solid ${brandBorder};border-radius:8px;padding:16px;font-size:14px;color:${textMain};line-height:1.7;">
      <strong>${address.fullName}</strong><br>
      ${address.address}<br>
      ${address.city}, ${address.state} ${address.zipCode}<br>
      📞 ${address.phone}
    </div>
  `);

  return sendEmail(customerEmail, `Order Confirmed - ${order.orderNumber}`, html);
}

// ============================================
// ORDER STATUS UPDATE
// ============================================
export async function sendOrderStatusUpdate(order, customerEmail) {
  const statusMessages = {
    confirmed: { emoji: '✓', title: 'Order Confirmed', desc: 'Your order has been confirmed and is being prepared.', color: '#3b82f6' },
    shipped: { emoji: '📦', title: 'Order Shipped', desc: 'Your order is on its way!', color: '#8b5cf6' },
    delivered: { emoji: '✅', title: 'Order Delivered', desc: 'Your order has been delivered. Enjoy!', color: '#10b981' },
    cancelled: { emoji: '✕', title: 'Order Cancelled', desc: 'Your order has been cancelled.', color: '#ef4444' },
  };

  const status = statusMessages[order.orderStatus] || { emoji: '📋', title: 'Order Update', desc: `Your order status is now: ${order.orderStatus}`, color: '#8a7e76' };

  const html = baseTemplate(`
    <div style="text-align:center;margin-bottom:24px;">
      <div style="width:56px;height:56px;background:${status.color}15;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px;">
        <span style="font-size:28px;">${status.emoji}</span>
      </div>
      <h2 style="margin:0 0 4px;font-size:22px;color:${textMain};">${status.title}</h2>
      <p style="margin:0;font-size:14px;color:${textDim};">${status.desc}</p>
    </div>

    <div style="background:${brandLight};border:1px solid ${brandBorder};border-radius:6px;padding:16px;margin-bottom:24px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:4px 0;font-size:13px;color:${textDim};">Order Number</td>
          <td style="padding:4px 0;font-size:13px;color:${textMain};text-align:right;font-weight:600;">${order.orderNumber}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;font-size:13px;color:${textDim};">Status</td>
          <td style="padding:4px 0;font-size:13px;color:${status.color};text-align:right;font-weight:600;text-transform:capitalize;">${order.orderStatus}</td>
        </tr>
        ${order.trackingNumber && order.orderStatus === 'shipped' ? `
        <tr>
          <td style="padding:4px 0;font-size:13px;color:${textDim};">Tracking Number</td>
          <td style="padding:4px 0;font-size:13px;color:${textMain};text-align:right;font-weight:600;">${order.trackingNumber}</td>
        </tr>
        ` : ''}
        <tr>
          <td style="padding:4px 0;font-size:13px;color:${textDim};">Total</td>
          <td style="padding:4px 0;font-size:13px;color:${textMain};text-align:right;font-weight:600;">${formatPrice(order.totalAmount)}</td>
        </tr>
      </table>
    </div>
  `);

  return sendEmail(customerEmail, `${status.title} - ${order.orderNumber}`, html);
}

// ============================================
// PAYMENT CONFIRMATION
// ============================================
export async function sendPaymentConfirmation(order, customerEmail) {
  const html = baseTemplate(`
    <div style="text-align:center;margin-bottom:24px;">
      <div style="width:56px;height:56px;background:#dcfce7;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px;">
        <span style="font-size:28px;">💳</span>
      </div>
      <h2 style="margin:0 0 4px;font-size:22px;color:${textMain};">Payment Received</h2>
      <p style="margin:0;font-size:14px;color:${textDim};">We've received your payment of ${formatPrice(order.totalAmount)}</p>
    </div>

    <div style="background:${brandLight};border:1px solid ${brandBorder};border-radius:6px;padding:16px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:4px 0;font-size:13px;color:${textDim};">Order Number</td>
          <td style="padding:4px 0;font-size:13px;color:${textMain};text-align:right;font-weight:600;">${order.orderNumber}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;font-size:13px;color:${textDim};">Amount Paid</td>
          <td style="padding:4px 0;font-size:13px;color:#5a8a6a;text-align:right;font-weight:600;">${formatPrice(order.totalAmount)}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;font-size:13px;color:${textDim};">Payment Method</td>
          <td style="padding:4px 0;font-size:13px;color:${textMain};text-align:right;text-transform:capitalize;">${order.paymentMethod}</td>
        </tr>
      </table>
    </div>
  `);

  return sendEmail(customerEmail, `Payment Received - ${order.orderNumber}`, html);
}

// ============================================
// SEND EMAIL HELPER
// ============================================
async function sendEmail(to, subject, html) {
  if (!process.env.SMTP_EMAIL || !process.env.SMTP_APP_PASSWORD) {
    console.log(`[Email skipped] No SMTP config. Would send to ${to}: ${subject}`);
    return null;
  }

  try {
    const info = await transporter.sendMail({
      from: `"${storeName}" <${storeEmail}>`,
      to,
      subject,
      html,
    });
    console.log(`[Email sent] ${subject} → ${to} (${info.messageId})`);
    return info;
  } catch (error) {
    console.error(`[Email failed] ${subject} → ${to}:`, error.message);
    return null;
  }
}

// ============================================
// PASSWORD RESET
// ============================================
export async function sendPasswordResetEmail(email, resetUrl) {
  const html = baseTemplate(`
    <div style="text-align:center;margin-bottom:24px;">
      <div style="width:56px;height:56px;background:rgba(196,120,74,0.12);border-radius:50%;display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px;">
        <span style="font-size:28px;">🔒</span>
      </div>
      <h2 style="margin:0 0 4px;font-size:22px;color:${textMain};">Reset Your Password</h2>
      <p style="margin:0;font-size:14px;color:${textDim};">We received a request to reset your password</p>
    </div>

    <p style="font-size:14px;color:${textMain};line-height:1.6;margin-bottom:24px;">
      Click the button below to set a new password. This link is valid for <strong>1 hour</strong>.
    </p>

    <div style="text-align:center;margin-bottom:24px;">
      <a href="${resetUrl}" style="display:inline-block;padding:14px 32px;background:${brandColor};color:#ffffff;text-decoration:none;border-radius:999px;font-size:14px;font-weight:600;letter-spacing:0.5px;">
        Reset Password
      </a>
    </div>

    <p style="font-size:12px;color:${textDim};line-height:1.6;">
      If you didn't request this, you can safely ignore this email. Your password will remain unchanged.
    </p>

    <div style="margin-top:20px;padding-top:16px;border-top:1px solid ${brandBorder};">
      <p style="font-size:11px;color:${textDim};word-break:break-all;">
        If the button doesn't work, copy this link:<br>${resetUrl}
      </p>
    </div>
  `);

  return sendEmail(email, `Reset Your Password - ${storeName}`, html);
}

// ============================================
// ABANDONED CART RECOVERY
// ============================================
export async function sendAbandonedCartEmail(email, items, cartTotal, recoveryUrl) {
  const itemsHtml = items.map((item) => `
    <tr>
      <td style="padding:10px 16px;border-bottom:1px solid ${brandBorder};font-size:14px;color:${textMain};">
        ${item.name}${item.quantity > 1 ? ` x ${item.quantity}` : ''}
      </td>
      <td style="padding:10px 16px;border-bottom:1px solid ${brandBorder};font-size:14px;color:${textMain};text-align:right;">
        ${formatPrice(item.price * item.quantity)}
      </td>
    </tr>
  `).join('');

  const html = baseTemplate(`
    <div style="text-align:center;margin-bottom:24px;">
      <div style="width:56px;height:56px;background:rgba(196,120,74,0.12);border-radius:50%;display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px;">
        <span style="font-size:28px;">🛒</span>
      </div>
      <h2 style="margin:0 0 4px;font-size:22px;color:${textMain};">You Left Something Behind!</h2>
      <p style="margin:0;font-size:14px;color:${textDim};">Your shopping cart is waiting for you</p>
    </div>

    <p style="font-size:14px;color:${textMain};line-height:1.6;margin-bottom:20px;">
      Looks like you left some great items in your cart. Don't worry — we've saved them for you!
    </p>

    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
      <thead>
        <tr style="background:${brandLight};">
          <th style="padding:10px 16px;text-align:left;font-size:11px;color:${textDim};text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid ${brandBorder};">Item</th>
          <th style="padding:10px 16px;text-align:right;font-size:11px;color:${textDim};text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid ${brandBorder};">Price</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
      </tbody>
    </table>

    <div style="text-align:right;margin-bottom:24px;">
      <span style="font-size:16px;font-weight:700;color:${textMain};">Total: ${formatPrice(cartTotal)}</span>
    </div>

    <div style="text-align:center;margin-bottom:24px;">
      <a href="${recoveryUrl}" style="display:inline-block;padding:14px 40px;background:${brandColor};color:#ffffff;text-decoration:none;border-radius:999px;font-size:14px;font-weight:600;letter-spacing:0.5px;">
        Complete Your Purchase
      </a>
    </div>

    <p style="font-size:12px;color:${textDim};text-align:center;line-height:1.6;">
      If you have any questions, reply to this email. We're happy to help!
    </p>
  `);

  return sendEmail(email, `You left items in your cart - ${storeName}`, html);
}

// ============================================
// NEW ORDER NOTIFICATION (Admin/Staff)
// ============================================
export async function sendNewOrderNotification(order) {
  const notifyEmails = process.env.ORDER_NOTIFY_EMAILS || '';
  if (!notifyEmails) return;

  const recipients = notifyEmails.split(',').map(e => e.trim()).filter(Boolean);
  if (recipients.length === 0) return;

  const address = order.shippingAddress || {};
  const items = order.items || [];
  const customerEmail = order.guestEmail || 'Registered user';

  const html = baseTemplate(`
    <div style="text-align:center;margin-bottom:24px;">
      <div style="width:56px;height:56px;background:#dcfce7;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px;">
        <span style="font-size:28px;">🛍️</span>
      </div>
      <h2 style="margin:0 0 4px;font-size:22px;color:${textMain};">New Order Received!</h2>
      <p style="margin:0;font-size:14px;color:${textDim};">${order.orderNumber}</p>
    </div>

    <div style="background:${brandLight};border:1px solid ${brandBorder};border-radius:6px;padding:16px;margin-bottom:24px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:4px 0;font-size:13px;color:${textDim};">Customer</td>
          <td style="padding:4px 0;font-size:13px;color:${textMain};text-align:right;font-weight:600;">${address.fullName || 'N/A'}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;font-size:13px;color:${textDim};">Email</td>
          <td style="padding:4px 0;font-size:13px;color:${textMain};text-align:right;">${customerEmail}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;font-size:13px;color:${textDim};">Phone</td>
          <td style="padding:4px 0;font-size:13px;color:${textMain};text-align:right;">${address.phone || 'N/A'}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;font-size:13px;color:${textDim};">Payment</td>
          <td style="padding:4px 0;font-size:13px;color:${order.paymentStatus === 'paid' ? '#5a8a6a' : '#c4784a'};text-align:right;text-transform:capitalize;font-weight:600;">${order.paymentMethod} — ${order.paymentStatus}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;font-size:13px;color:${textDim};">Total</td>
          <td style="padding:4px 0;font-size:18px;color:${textMain};text-align:right;font-weight:700;">${formatPrice(order.totalAmount)}</td>
        </tr>
      </table>
    </div>

    <h3 style="margin:0 0 12px;font-size:15px;color:${textMain};text-transform:uppercase;letter-spacing:1px;">Items</h3>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
      <thead>
        <tr style="background:${brandLight};">
          <th style="padding:10px 16px;text-align:left;font-size:11px;color:${textDim};text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid ${brandBorder};">Item</th>
          <th style="padding:10px 16px;text-align:center;font-size:11px;color:${textDim};text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid ${brandBorder};">Qty</th>
          <th style="padding:10px 16px;text-align:right;font-size:11px;color:${textDim};text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid ${brandBorder};">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${orderItemsHTML(items)}
      </tbody>
    </table>

    <h3 style="margin:24px 0 8px;font-size:15px;color:${textMain};text-transform:uppercase;letter-spacing:1px;">Shipping To</h3>
    <div style="background:${brandLight};border:1px solid ${brandBorder};border-radius:6px;padding:16px;font-size:14px;color:${textMain};line-height:1.6;">
      ${address.fullName || ''}<br>
      ${address.address || ''}<br>
      ${address.city || ''}, ${address.state || ''} ${address.zipCode || ''}<br>
      Phone: ${address.phone || ''}
    </div>
  `);

  const subject = `🛍️ New Order ${order.orderNumber} — ${formatPrice(order.totalAmount)}`;

  await Promise.all(
    recipients.map(email => sendEmail(email, subject, html).catch(() => {}))
  );
}

// ============================================
// B2B QUOTE EMAIL
// ============================================
export async function sendQuoteEmail({ to, customerName, request, bankDetails }) {
  const clientUrl = (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '');
  const quoteUrl = `${clientUrl}/wholesale/my-quotes/${request.id}`;
  const currency = request.quotedCurrency || process.env.CURRENCY_CODE || 'QAR';
  const symbol = currency === 'INR' ? '₹' : (currency === 'USD' ? '$' : (currency === 'QAR' ? 'QAR ' : `${currency} `));
  const fmt = (n) => `${symbol}${(parseFloat(n) || 0).toFixed(currencyDecimals)}`;

  const validUntil = request.quotedValidUntil
    ? new Date(request.quotedValidUntil).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  const itemsRows = (request.items || []).map((it) => `
    <tr>
      <td style="padding:12px 16px;border-bottom:1px solid ${brandBorder};font-size:14px;color:${textMain};">${it.name}</td>
      <td style="padding:12px 16px;border-bottom:1px solid ${brandBorder};font-size:14px;color:${textDim};text-align:center;">${it.quantity}</td>
      <td style="padding:12px 16px;border-bottom:1px solid ${brandBorder};font-size:14px;color:${textDim};text-align:right;">${fmt(it.unitPrice)}</td>
      <td style="padding:12px 16px;border-bottom:1px solid ${brandBorder};font-size:14px;color:${textMain};text-align:right;font-weight:600;">${fmt(it.lineTotal)}</td>
    </tr>
  `).join('');

  const onlineBlock = request.paymentMethod === 'online' ? `
    <div style="margin:24px 0;text-align:center;">
      <a href="${quoteUrl}" style="display:inline-block;background:${brandColor};color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-size:15px;font-weight:600;">Pay online</a>
      <p style="margin:12px 0 0;font-size:12px;color:${textDim};">Opens a secure checkout in your browser.</p>
    </div>
  ` : '';

  const bankBlock = request.paymentMethod === 'bank_transfer' && bankDetails ? `
    <div style="margin:24px 0;padding:16px;background:${brandLight};border:1px solid ${brandBorder};border-radius:8px;">
      <h3 style="margin:0 0 12px;font-size:14px;font-weight:600;color:${textMain};">Bank transfer details</h3>
      <pre style="margin:0;font-family:'SF Mono',Menlo,monospace;font-size:13px;color:${textMain};white-space:pre-wrap;">${String(bankDetails).replace(/</g, '&lt;')}</pre>
      <p style="margin:12px 0 0;font-size:12px;color:${textDim};">Once paid, please reply to this email with the transaction reference. We'll confirm and dispatch.</p>
    </div>
  ` : '';

  const noteBlock = request.adminNote ? `
    <div style="margin:16px 0;padding:14px 16px;background:${brandLight};border-left:3px solid ${brandColor};border-radius:4px;">
      <p style="margin:0;font-size:14px;color:${textMain};line-height:1.6;">${String(request.adminNote).replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p>
    </div>
  ` : '';

  const html = baseTemplate(`
    <h2 style="margin:0 0 8px;font-size:20px;color:${textMain};font-weight:600;">Your quote is ready</h2>
    <p style="margin:0 0 20px;font-size:14px;color:${textDim};line-height:1.6;">
      Hi ${customerName || 'there'}, here is the pricing for request <strong>${request.requestNumber}</strong>.
    </p>

    ${noteBlock}

    <table style="width:100%;border-collapse:collapse;margin:16px 0;border:1px solid ${brandBorder};border-radius:8px;overflow:hidden;">
      <thead>
        <tr style="background:${brandLight};">
          <th style="padding:10px 16px;text-align:left;font-size:12px;font-weight:600;color:${textDim};text-transform:uppercase;letter-spacing:0.04em;">Item</th>
          <th style="padding:10px 16px;text-align:center;font-size:12px;font-weight:600;color:${textDim};text-transform:uppercase;letter-spacing:0.04em;">Qty</th>
          <th style="padding:10px 16px;text-align:right;font-size:12px;font-weight:600;color:${textDim};text-transform:uppercase;letter-spacing:0.04em;">Unit</th>
          <th style="padding:10px 16px;text-align:right;font-size:12px;font-weight:600;color:${textDim};text-transform:uppercase;letter-spacing:0.04em;">Total</th>
        </tr>
      </thead>
      <tbody>${itemsRows}</tbody>
      <tfoot>
        <tr>
          <td colspan="3" style="padding:14px 16px;text-align:right;font-size:14px;color:${textDim};">Total</td>
          <td style="padding:14px 16px;text-align:right;font-size:16px;font-weight:700;color:${textMain};">${fmt(request.quotedTotal)}</td>
        </tr>
      </tfoot>
    </table>

    ${validUntil ? `<p style="margin:0 0 16px;font-size:13px;color:${textDim};">Quote valid until <strong style="color:${textMain};">${validUntil}</strong>.</p>` : ''}

    ${onlineBlock}
    ${bankBlock}

    <p style="margin:24px 0 0;font-size:13px;color:${textDim};line-height:1.6;">
      You can also view this quote anytime at <a href="${quoteUrl}" style="color:${brandColor};">${quoteUrl}</a>.
    </p>
  `);

  return sendEmail(to, `Your quote ${request.requestNumber} — ${fmt(request.quotedTotal)}`, html);
}

export default { sendOrderConfirmation, sendOrderStatusUpdate, sendPaymentConfirmation, sendPasswordResetEmail, sendAbandonedCartEmail, sendNewOrderNotification, sendQuoteEmail };
