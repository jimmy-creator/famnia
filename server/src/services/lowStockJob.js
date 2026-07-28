import { Product } from '../models/index.js';
import { Op } from 'sequelize';

const LOW_STOCK_THRESHOLD = parseInt(process.env.LOW_STOCK_THRESHOLD || '5');

// Send email using the shared sendEmail
async function sendLowStockAlert(products) {
  if (!process.env.SMTP_EMAIL || !process.env.SMTP_APP_PASSWORD) return;

  const { default: nodemailer } = await import('nodemailer');

  const smtpConfig = process.env.SMTP_HOST
    ? {
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '465'),
        secure: parseInt(process.env.SMTP_PORT || '465') === 465,
        auth: { user: process.env.SMTP_EMAIL, pass: process.env.SMTP_APP_PASSWORD },
      }
    : { service: 'gmail', auth: { user: process.env.SMTP_EMAIL, pass: process.env.SMTP_APP_PASSWORD } };

  const transporter = nodemailer.createTransport(smtpConfig);
  const storeName = process.env.STORE_NAME || 'ShopHub';
  const adminEmail = process.env.ADMIN_ALERT_EMAIL || process.env.SMTP_EMAIL;

  const outOfStock = products.filter((p) => p.stock === 0);
  const lowStock = products.filter((p) => p.stock > 0 && p.stock <= LOW_STOCK_THRESHOLD);

  let rows = '';
  for (const p of outOfStock) {
    rows += `<tr><td style="padding:8px 12px;border-bottom:1px solid #e8e0d8;font-size:14px;">${p.name}</td><td style="padding:8px 12px;border-bottom:1px solid #e8e0d8;font-size:14px;color:#ef4444;font-weight:700;text-align:center;">0</td><td style="padding:8px 12px;border-bottom:1px solid #e8e0d8;font-size:14px;color:#ef4444;font-weight:600;">Out of Stock</td></tr>`;
  }
  for (const p of lowStock) {
    rows += `<tr><td style="padding:8px 12px;border-bottom:1px solid #e8e0d8;font-size:14px;">${p.name}</td><td style="padding:8px 12px;border-bottom:1px solid #e8e0d8;font-size:14px;color:#f59e0b;font-weight:700;text-align:center;">${p.stock}</td><td style="padding:8px 12px;border-bottom:1px solid #e8e0d8;font-size:14px;color:#f59e0b;font-weight:600;">Low Stock</td></tr>`;
  }

  const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f5f0eb;font-family:-apple-system,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:20px;">
  <div style="background:#1a1614;padding:24px 32px;border-radius:8px 8px 0 0;text-align:center;">
    <h1 style="margin:0;color:#f5f0eb;font-size:20px;">Inventory Alert</h1>
  </div>
  <div style="background:#fff;padding:24px 32px;border:1px solid #e8e0d8;border-top:none;">
    <p style="font-size:14px;color:#2c2420;margin-bottom:16px;">
      <strong>${outOfStock.length}</strong> product${outOfStock.length !== 1 ? 's' : ''} out of stock and
      <strong>${lowStock.length}</strong> product${lowStock.length !== 1 ? 's' : ''} with low stock (≤${LOW_STOCK_THRESHOLD}).
    </p>
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr style="background:#faf8f5;">
          <th style="padding:8px 12px;text-align:left;font-size:11px;color:#8a7e76;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #e8e0d8;">Product</th>
          <th style="padding:8px 12px;text-align:center;font-size:11px;color:#8a7e76;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #e8e0d8;">Stock</th>
          <th style="padding:8px 12px;text-align:left;font-size:11px;color:#8a7e76;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #e8e0d8;">Status</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
  <div style="background:#faf8f5;padding:16px 32px;border:1px solid #e8e0d8;border-top:none;border-radius:0 0 8px 8px;text-align:center;">
    <p style="margin:0;font-size:12px;color:#8a7e76;">${storeName} — Inventory Management</p>
  </div>
</div>
</body>
</html>`;

  try {
    await transporter.sendMail({
      from: `"${storeName}" <${process.env.SMTP_EMAIL}>`,
      to: adminEmail,
      subject: `Inventory Alert: ${outOfStock.length} out of stock, ${lowStock.length} low stock`,
      html,
    });
    console.log(`[Low Stock] Alert sent to ${adminEmail}`);
  } catch (error) {
    console.error(`[Low Stock] Email failed:`, error.message);
  }
}

async function checkLowStock() {
  try {
    const products = await Product.findAll({
      where: {
        active: true,
        stock: { [Op.lte]: LOW_STOCK_THRESHOLD },
      },
      attributes: ['id', 'name', 'stock'],
      order: [['stock', 'ASC']],
    });

    if (products.length === 0) return;

    await sendLowStockAlert(products);
  } catch (error) {
    console.error('[Low Stock] Check error:', error.message);
  }
}

export function startLowStockJob() {
  const intervalHours = parseInt(process.env.LOW_STOCK_CHECK_HOURS || '24');
  console.log(`[Low Stock] Job started — checking every ${intervalHours}h, threshold: ≤${LOW_STOCK_THRESHOLD}`);
  setInterval(checkLowStock, intervalHours * 60 * 60 * 1000);
  // Run once on start after 30 seconds
  setTimeout(checkLowStock, 30000);
}
