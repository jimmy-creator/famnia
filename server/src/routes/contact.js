import { Router } from 'express';
import nodemailer from 'nodemailer';

const router = Router();

const smtpConfig = process.env.SMTP_HOST
  ? {
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '465'),
      secure: parseInt(process.env.SMTP_PORT || '465') === 465,
      auth: { user: process.env.SMTP_EMAIL, pass: process.env.SMTP_APP_PASSWORD },
    }
  : {
      service: 'gmail',
      auth: { user: process.env.SMTP_EMAIL, pass: process.env.SMTP_APP_PASSWORD },
    };

const transporter = nodemailer.createTransport(smtpConfig);

// Get store contact info (public)
router.get('/info', (req, res) => {
  res.json({
    email: process.env.STORE_CONTACT_EMAIL || process.env.SMTP_EMAIL || '',
    phone: process.env.STORE_PHONE || '',
    address: process.env.STORE_ADDRESS || '',
    hours: process.env.STORE_HOURS || 'Mon - Sat: 9AM - 7PM',
    storeName: process.env.STORE_NAME || 'ShopHub',
  });
});

// Send contact form message
router.post('/send', async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;

    if (!name || !email || !subject || !message) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const storeName = process.env.STORE_NAME || 'ShopHub';
    const notifyEmail = process.env.STORE_CONTACT_EMAIL || process.env.ORDER_NOTIFY_EMAILS?.split(',')[0] || process.env.SMTP_EMAIL;

    if (!notifyEmail) {
      return res.status(500).json({ message: 'Store email not configured' });
    }

    // Email to store admin
    await transporter.sendMail({
      from: `"${storeName} Contact Form" <${process.env.SMTP_EMAIL}>`,
      to: notifyEmail,
      replyTo: email,
      subject: `[Contact] ${subject}`,
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
          <h2 style="margin:0 0 20px;color:#1a1614;">New Contact Message</h2>
          <table style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="padding:8px 0;font-size:13px;color:#8a7e76;width:80px;">Name</td>
              <td style="padding:8px 0;font-size:14px;color:#2c2420;font-weight:600;">${name}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;font-size:13px;color:#8a7e76;">Email</td>
              <td style="padding:8px 0;font-size:14px;color:#2c2420;"><a href="mailto:${email}">${email}</a></td>
            </tr>
            <tr>
              <td style="padding:8px 0;font-size:13px;color:#8a7e76;">Subject</td>
              <td style="padding:8px 0;font-size:14px;color:#2c2420;">${subject}</td>
            </tr>
          </table>
          <div style="margin-top:16px;padding:16px;background:#f8f8f8;border-radius:8px;font-size:14px;color:#2c2420;line-height:1.7;white-space:pre-wrap;">${message}</div>
          <p style="margin-top:20px;font-size:12px;color:#b5aaa2;">Reply directly to this email to respond to ${name}.</p>
        </div>
      `,
    });

    // Auto-reply to customer
    await transporter.sendMail({
      from: `"${storeName}" <${process.env.SMTP_EMAIL}>`,
      to: email,
      subject: `We received your message — ${storeName}`,
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
          <h2 style="margin:0 0 12px;color:#1a1614;">Thank you, ${name}!</h2>
          <p style="font-size:14px;color:#2c2420;line-height:1.7;">
            We've received your message and will get back to you as soon as possible. Here's a copy of what you sent:
          </p>
          <div style="margin:16px 0;padding:16px;background:#f8f8f8;border-radius:8px;">
            <p style="margin:0 0 4px;font-size:13px;color:#8a7e76;">Subject: ${subject}</p>
            <p style="margin:0;font-size:14px;color:#2c2420;line-height:1.7;white-space:pre-wrap;">${message}</p>
          </div>
          <p style="font-size:12px;color:#b5aaa2;">— ${storeName} Team</p>
        </div>
      `,
    }).catch(() => {});

    res.json({ success: true });
  } catch (error) {
    console.error('Contact form error:', error);
    res.status(500).json({ message: 'Failed to send message. Please try again.' });
  }
});

export default router;
