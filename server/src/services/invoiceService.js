import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Brand monogram (the "eb" mark used in the navbar/footer). Falls back to
// text-only header if the file is missing on the deploy target.
const LOGO_PATH = path.resolve(__dirname, '../../../client/public/images/elegant-bayt-monogram.png');

const storeName = process.env.STORE_NAME || 'ShopHub';
const storeTagline = process.env.STORE_TAGLINE || 'Elegance at Home';
const storeEmail = process.env.SMTP_EMAIL || '';
const storeTRN = process.env.STORE_TRN || process.env.STORE_GSTIN || '';
const storeAddress = process.env.STORE_ADDRESS || '';
const storePhone = process.env.STORE_PHONE || '';

const currencySymbol = process.env.CURRENCY_SYMBOL || 'Rs.';
// Display decimals — pairs with the client's VITE_CURRENCY_DECIMALS.
// store4 (KWD/fils) sets CURRENCY_DECIMALS=3; default 2 for INR/AED.
const currencyDecimals = (() => {
  const n = parseInt(process.env.CURRENCY_DECIMALS, 10);
  return Number.isFinite(n) && n >= 0 && n <= 4 ? n : 2;
})();

function formatPrice(amount) {
  return `${currencySymbol}${(parseFloat(amount) || 0).toFixed(currencyDecimals)}`;
}

export function generateInvoice(order) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const buffers = [];

      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const items = order.items || [];
      const address = order.shippingAddress || {};
      const discount = parseFloat(order.discount) || 0;
      const taxAmount = parseFloat(order.taxAmount) || 0;
      const totalAmount = parseFloat(order.totalAmount);

      // Colors — Elegant Bayt brand (matches the storefront elegantBayt theme)
      const dark = '#16264d';       // navy (--copper)
      const copper = '#c6a24c';     // gold (--gold)
      const grey = '#5b6478';       // --text-secondary
      const lightGrey = '#e5e7eb';  // --border
      const bg = '#f5f6f9';         // --bg-warm
      const success = '#10b981';    // --success

      // ===== HEADER (navy band, monogram + two-tone wordmark + tagline) =====
      doc.rect(0, 0, 595.28, 100).fill(dark);

      let brandX = 50;
      if (fs.existsSync(LOGO_PATH)) {
        // Monogram sits in a white rounded tile, like the navbar.
        doc.roundedRect(50, 26, 48, 48, 8).fill('#ffffff');
        doc.image(LOGO_PATH, 55, 31, { fit: [38, 38], align: 'center', valign: 'center' });
        brandX = 112;
      }

      // Two-tone wordmark: first word white, rest gold (ELEGANT BAYT).
      const words = storeName.toUpperCase().split(' ');
      const firstWord = words.shift();
      const restWords = words.join(' ');
      doc.fontSize(20).font('Helvetica-Bold').fill('#ffffff')
        .text(firstWord + (restWords ? ' ' : ''), brandX, 36, { characterSpacing: 2, continued: !!restWords });
      if (restWords) doc.fill(copper).text(restWords, { characterSpacing: 2 });

      doc.fontSize(7).fill('#8fa0c9').font('Helvetica-Bold')
        .text(storeTagline.toUpperCase(), brandX, 60, { characterSpacing: 3 });

      doc.fontSize(24).fill(copper).font('Helvetica-Bold')
        .text('INVOICE', 400, 30, { width: 150, align: 'right' });

      doc.fontSize(9).fill('#aab4cd')
        .text(`#${order.orderNumber}`, 400, 58, { width: 150, align: 'right' });

      doc.fontSize(9).fill('#aab4cd')
        .text(new Date(order.createdAt).toLocaleDateString('en-QA', {
          day: 'numeric', month: 'long', year: 'numeric',
        }), 400, 72, { width: 150, align: 'right' });

      // Thin gold rule under the header band.
      doc.rect(0, 100, 595.28, 3).fill(copper);

      let y = 120;

      // ===== STORE & CUSTOMER INFO =====
      // From (Store)
      doc.fontSize(8).fill(copper).font('Helvetica-Bold')
        .text('FROM', 50, y);
      y += 14;
      doc.fontSize(10).fill(dark).font('Helvetica-Bold')
        .text(storeName, 50, y);
      y += 14;
      doc.fontSize(9).fill(grey).font('Helvetica');
      if (storeAddress) { doc.text(storeAddress, 50, y); y += 12; }
      if (storePhone) { doc.text(`Phone: ${storePhone}`, 50, y); y += 12; }
      if (storeEmail) { doc.text(`Email: ${storeEmail}`, 50, y); y += 12; }
      if (storeTRN) { doc.text(`TRN: ${storeTRN}`, 50, y); y += 12; }

      // To (Customer)
      let yRight = 120;
      doc.fontSize(8).fill(copper).font('Helvetica-Bold')
        .text('BILL TO', 350, yRight);
      yRight += 14;
      doc.fontSize(10).fill(dark).font('Helvetica-Bold')
        .text(address.fullName || 'Customer', 350, yRight);
      yRight += 14;
      doc.fontSize(9).fill(grey).font('Helvetica');
      if (address.address) { doc.text(address.address, 350, yRight); yRight += 12; }
      const cityLine = [address.city, address.state, address.zipCode].filter(Boolean).join(', ');
      if (cityLine) { doc.text(cityLine, 350, yRight); yRight += 12; }
      if (address.phone) { doc.text(`Phone: ${address.phone}`, 350, yRight); yRight += 12; }
      if (order.guestEmail) { doc.text(`Email: ${order.guestEmail}`, 350, yRight); yRight += 12; }

      y = Math.max(y, yRight) + 20;

      // ===== ORDER DETAILS BAR =====
      doc.rect(50, y, 495.28, 28).fill(bg);
      doc.fontSize(8).fill(grey).font('Helvetica-Bold');
      doc.text('ORDER NUMBER', 60, y + 8);
      doc.text('DATE', 200, y + 8);
      doc.text('PAYMENT', 310, y + 8);
      doc.text('STATUS', 430, y + 8);

      y += 28;
      doc.fontSize(9).fill(dark).font('Helvetica');
      doc.text(order.orderNumber, 60, y + 6);
      doc.text(new Date(order.createdAt).toLocaleDateString('en-QA'), 200, y + 6);
      doc.text((order.paymentMethod || 'N/A').toUpperCase(), 310, y + 6);

      const statusText = (order.paymentStatus || 'pending').toUpperCase();
      const statusColor = order.paymentStatus === 'paid' ? success : copper;
      doc.fontSize(9).fill(statusColor).font('Helvetica-Bold')
        .text(statusText, 430, y + 6);

      y += 30;

      // ===== LINE SEPARATOR =====
      doc.moveTo(50, y).lineTo(545.28, y).lineWidth(1).strokeColor(lightGrey).stroke();
      y += 10;

      // ===== ITEMS TABLE HEADER =====
      doc.rect(50, y, 495.28, 24).fill(dark);
      doc.fontSize(8).fill('#ffffff').font('Helvetica-Bold');
      doc.text('#', 60, y + 7, { width: 20 });
      doc.text('ITEM', 80, y + 7, { width: 255 });
      doc.text('QTY', 335, y + 7, { width: 40, align: 'center' });
      doc.text('RATE', 380, y + 7, { width: 70, align: 'right' });
      doc.text('AMOUNT', 460, y + 7, { width: 80, align: 'right' });
      y += 24;

      // ===== ITEMS ROWS =====
      items.forEach((item, i) => {
        if (y > 700) {
          doc.addPage();
          y = 50;
        }

        const isEven = i % 2 === 0;
        if (isEven) {
          doc.rect(50, y, 495.28, 26).fill(bg);
        }

        doc.fontSize(9).fill(dark).font('Helvetica');
        doc.text(String(i + 1), 60, y + 8, { width: 20 });

        // Item name + variant
        let itemName = item.name;
        if (item.variant) {
          const variantParts = Object.entries(item.variant)
            .filter(([k]) => k !== 'sku')
            .map(([k, v]) => `${k}: ${v}`);
          if (variantParts.length) itemName += ` (${variantParts.join(', ')})`;
        }
        doc.text(itemName, 80, y + 8, { width: 250 });

        doc.fontSize(9).fill(dark);
        doc.text(String(item.quantity), 335, y + 8, { width: 40, align: 'center' });
        doc.text(formatPrice(item.price), 380, y + 8, { width: 70, align: 'right' });
        doc.text(formatPrice(item.price * item.quantity), 460, y + 8, { width: 80, align: 'right' });

        y += 26;
      });

      y += 10;
      doc.moveTo(50, y).lineTo(545.28, y).lineWidth(0.5).strokeColor(lightGrey).stroke();
      y += 15;

      // ===== TOTALS =====
      const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

      const labelX = 350;
      const valueX = 460;
      const rowHeight = 18;

      doc.fontSize(9).fill(grey).font('Helvetica');
      doc.text('Subtotal', labelX, y, { width: 100 });
      doc.fill(dark).text(formatPrice(subtotal), valueX, y, { width: 80, align: 'right' });
      y += rowHeight;

      if (discount > 0) {
        doc.fill(grey).text(`Discount${order.couponCode ? ` (${order.couponCode})` : ''}`, labelX, y, { width: 100, height: 12, ellipsis: true });
        doc.fill(success).text(`-${formatPrice(discount)}`, valueX, y, { width: 80, align: 'right' });
        y += rowHeight;
      }

      const shippingCharge = parseFloat(order.shippingCharge) || 0;
      if (shippingCharge > 0) {
        doc.fill(grey).text(`Shipping${order.shippingMethod === 'express' ? ' (Express)' : ''}`, labelX, y, { width: 100 });
        doc.fill(dark).text(formatPrice(shippingCharge), valueX, y, { width: 80, align: 'right' });
        y += rowHeight;
      } else if (shippingCharge === 0 && order.shippingMethod) {
        doc.fill(grey).text('Shipping', labelX, y, { width: 100 });
        doc.fill(success).text('Free', valueX, y, { width: 80, align: 'right' });
        y += rowHeight;
      }

      if (taxAmount > 0) {
        doc.fill(grey).text('VAT', labelX, y, { width: 100 });
        doc.fill(dark).text(formatPrice(taxAmount), valueX, y, { width: 80, align: 'right' });
        y += rowHeight;

        doc.fill(grey).fontSize(8)
          .text('(VAT included in price)', labelX, y, { width: 200 });
        y += rowHeight;
      }

      // Total bar
      y += 5;
      doc.rect(labelX - 10, y, 205.28, 30).fill(dark);
      doc.fontSize(11).fill('#ffffff').font('Helvetica-Bold')
        .text('TOTAL', labelX, y + 8, { width: 90 });
      doc.text(formatPrice(totalAmount), valueX, y + 8, { width: 80, align: 'right' });

      y += 50;

      // ===== FOOTER =====
      if (y > 700) { doc.addPage(); y = 50; }

      doc.moveTo(50, y).lineTo(545.28, y).lineWidth(0.5).strokeColor(lightGrey).stroke();
      y += 15;

      doc.fontSize(8).fill(grey).font('Helvetica');
      doc.text('Thank you for your purchase!', 50, y, { width: 495.28, align: 'center' });
      y += 14;
      doc.fill(dark).font('Helvetica-Bold')
        .text(`${storeName} — ${storeTagline}`, 50, y, { width: 495.28, align: 'center' });
      y += 12;
      doc.fill(grey).font('Helvetica')
        .text(`${storeEmail}${storePhone ? ` • ${storePhone}` : ''}${storeTRN ? ` • TRN: ${storeTRN}` : ''}`, 50, y, { width: 495.28, align: 'center' });
      y += 14;
      doc.text('This is a computer-generated invoice and does not require a signature.', 50, y, { width: 495.28, align: 'center' });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

export default { generateInvoice };
