import fs from 'node:fs';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import hpp from 'hpp';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import sequelize from './config/database.js';
import { User, Product, Order } from './models/index.js';
import { bootstrapAdminFromEnv } from './bootstrapAdmin.js';
import { uploadsDir } from './config/uploadsDir.js';
import { verifyEmailTransport } from './services/emailService.js';
import authRoutes from './routes/auth.js';
import productRoutes from './routes/products.js';
import orderRoutes from './routes/orders.js';
import uploadRoutes from './routes/upload.js';
import paymentRoutes from './routes/payment.js';
import couponRoutes from './routes/coupons.js';
import reviewRoutes from './routes/reviews.js';
import analyticsRoutes from './routes/analytics.js';
import settingsRoutes from './routes/settings.js';
import customerRoutes from './routes/customers.js';
import categoryRoutes from './routes/categories.js';
import bulkProductRoutes from './routes/bulkProducts.js';
import cancellationRoutes from './routes/cancellation.js';
import staffRoutes from './routes/staff.js';
import googleAuthRoutes from './routes/googleAuth.js';
import pincodeRoutes from './routes/pincodes.js';
import abandonedCartRoutes from './routes/abandonedCart.js';
import contactRoutes from './routes/contact.js';
import b2bRoutes from './routes/b2b.js';
import shiprocketRoutes from './routes/shiprocket.js';
import shippingRoutes from './routes/shipping.js';
import locationRoutes from './routes/locations.js';
import inventoryRoutes from './routes/inventory.js';
import stockTransferRoutes from './routes/stockTransfers.js';
import cashierRoutes from './routes/cashier.js';
import posRoutes from './routes/pos.js';
import reportsRoutes from './routes/reports.js';
import returnsRoutes from './routes/returns.js';
import suppliersRoutes from './routes/suppliers.js';
import purchaseOrdersRoutes from './routes/purchaseOrders.js';
import purchaseReturnsRoutes from './routes/purchaseReturns.js';
import financeRoutes, { seedDefaultAccountsIfEmpty } from './routes/finance.js';
import activityLogRoutes from './routes/activityLog.js';
import stockCountsRoutes from './routes/stockCounts.js';
import { registerShiprocketHooks } from './services/shiprocketSync.js';
import { startAbandonedCartJob } from './services/abandonedCartJob.js';
import { startLowStockJob } from './services/lowStockJob.js';
import sitemapRoutes from './routes/sitemap.js';
import { sanitizeInput, preventInjection, forceHttps } from './middleware/security.js';
import htmlInject from './middleware/htmlInject.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Force HTTPS in production
app.use(forceHttps);

// Trust proxy (for Hostinger/Nginx)
app.set('trust proxy', 1);

// Security headers
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// CORS
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.CLIENT_URL || true
    : process.env.CLIENT_URL,
  credentials: true,
}));

// Prevent HTTP parameter pollution
app.use(hpp());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 500 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Body parsing with size limits
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser());

// Input sanitization (XSS + injection prevention)
app.use(sanitizeInput);
app.use(preventInjection);

// Serve uploaded images
// Uploaded images have unique hashed filenames (a replaced image gets a new
// URL), so they're immutable — cache hard in the browser. Without this they
// served max-age=0 and re-downloaded on every refresh (banner "reload" flash).
app.use('/uploads', express.static(uploadsDir, { maxAge: '1y', immutable: true }));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/bulk-products', bulkProductRoutes);
app.use('/api/orders', cancellationRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/auth', googleAuthRoutes);
app.use('/api/pincodes', pincodeRoutes);
app.use('/api/abandoned-cart', abandonedCartRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/b2b', b2bRoutes);
app.use('/api/shiprocket', shiprocketRoutes);
app.use('/api/shipping', shippingRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/stock-transfers', stockTransferRoutes);
app.use('/api/cashier', cashierRoutes);
app.use('/api/pos', posRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/returns', returnsRoutes);
app.use('/api/suppliers', suppliersRoutes);
app.use('/api/purchase-orders', purchaseOrdersRoutes);
app.use('/api/purchase-returns', purchaseReturnsRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/activity-log', activityLogRoutes);
app.use('/api/stock-counts', stockCountsRoutes);
app.use('/', sitemapRoutes);

// Serve the built client bundles. Needed on hosts WITHOUT nginx (e.g.
// LiteSpeed + Phusion Passenger on Hostinger Business), where every request
// reaches this Node app instead of nginx serving dist/ via try_files.
// `index: false` so htmlInject below owns HTML routes (per-URL meta); this
// only serves the hashed /assets/* bundles, favicon, and static images.
// Hashed asset filenames are content-addressed, so cache them hard.
const CLIENT_DIST = path.join(__dirname, '../../client/dist');
app.use(express.static(CLIENT_DIST, {
  index: false,
  maxAge: '1y',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
  },
}));

// Per-URL HTML meta injection — serves dist/index.html with rewritten
// <title>/meta/canonical + Product/Breadcrumb JSON-LD for page routes.
// Works behind nginx (proxying non-asset routes here) OR standalone under
// LiteSpeed/Passenger (the express.static above serves the assets first).
// In local dev this sees nothing — Vite serves HTML on :5173 and only /api/
// requests reach Express.
app.use(htmlInject);

// Error handler — never leak stack traces in production
app.use((err, req, res, next) => {
  console.error(`[ERROR] ${req.method} ${req.originalUrl}:`, err.message);
  if (process.env.NODE_ENV !== 'production') {
    console.error(err.stack);
  }
  const status = err.status || 500;
  res.status(status).json({
    message: process.env.NODE_ENV === 'production'
      ? 'Something went wrong'
      : err.message,
  });
});

const PORT = process.env.PORT || 5000;

const start = async () => {
  try {
    await sequelize.authenticate();
    console.log('Database connected');
    await sequelize.sync({ alter: process.env.DB_SYNC_ALTER === 'true' });
    console.log('Models synced');

    // Create/promote an admin from BOOTSTRAP_ADMIN_* env vars (no shell needed).
    await bootstrapAdminFromEnv();

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      verifyEmailTransport().catch(() => {}); // logs whether SMTP email works
      startAbandonedCartJob();
      startLowStockJob();
      registerShiprocketHooks();
      seedDefaultAccountsIfEmpty().catch((err) =>
        console.error('[finance/seed]', err.message)
      );
    });
  } catch (error) {
    // Passenger/LiteSpeed often swallows stdout/stderr → a 503 with "empty
    // logs". Persist the real reason to a file in the app root so it's
    // findable (most common cause: bad DB_* creds or DB doesn't exist).
    const detail = `[${new Date().toISOString()}] Failed to start server:\n${error?.stack || error}\n`;
    try { fs.appendFileSync(path.join(__dirname, '../startup-error.log'), detail); } catch { /* ignore */ }
    console.error(detail);
    process.exit(1);
  }
};

start();
