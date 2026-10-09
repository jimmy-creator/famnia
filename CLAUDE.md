# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Single-store e-commerce platform (React + Vite + Express + MySQL). The storefront UI is built with **Tailwind CSS v4 + shadcn/ui** (Radix-based, JSX components in `client/src/components/ui/`). Migrated from a multi-store setup: the old `VITE_LAYOUT` build-time layout swap is gone — there is exactly one store layout in `client/src/layouts/store/` (fixed `@layout` alias). `@` aliases `client/src/`.

> **Migration status:** the storefront + customer-account pages are converted to shadcn (Navbar, Footer, ProductCard, Home, Products, ProductDetail, Cart, Checkout, OrderSuccess, Login, Register, ForgotPassword, ResetPassword, Profile, Orders, Wishlist). NOT yet converted (still rendering on the legacy CSS in `index.css`/`layout.css`): the admin panel (`pages/Admin.jsx` + `components/admin/*`) and the storefront static/content pages (AboutUs, ContactUs, policy pages, ShippingInfo). Nothing is broken — the legacy CSS is preserved, so unconverted pages keep their original look.

## Commands

```bash
# Install all dependencies (client + server)
npm run install:all

# Run both client (:5173) and server (:3000) concurrently
npm run dev

# Run individually
npm run dev:client    # Vite dev server
npm run dev:server    # Nodemon

# Build for production
npm run build

# Seed database
npm run seed

# ERP bootstrap — run ONCE after enabling the multi-location flag.
# Creates the online-default Location, backfills ProductStock from the
# legacy Product.stock/variants columns, adds starter expense categories
# and a cashier. Idempotent. Without the stock backfill every POS sale
# fails, because pos.js reads per-location stock and treats a missing
# row as zero.
cd server && npm run seed:erp

# Lint
cd client && npx eslint .

# Add a shadcn/ui component (writes JSX to src/components/ui/)
cd client && npx shadcn@latest add <component>
```

No test suite exists. There are some Python security test scripts at the root but no JS test runner.

## Architecture

### UI System (Tailwind v4 + shadcn/ui)

- Tailwind v4 via the `@tailwindcss/vite` plugin (`client/vite.config.js`). `@import "tailwindcss"` lives at the top of `client/src/index.css`, followed by the shadcn token layer.
- shadcn config in `client/components.json` (`tsx: false` → JSX output, `new-york` style, lucide icons). Components in `client/src/components/ui/`. `cn()` helper in `client/src/lib/utils.js`.
- **Theme bridge:** the shadcn tokens (`--primary`, `--background`, …) are defined in `index.css` as `var(--copper)`, `var(--bg)`, etc. — i.e. they reference the brand design tokens below them. So shadcn components inherit the brand palette, and the runtime `ThemeContext` (which overrides `--copper`/`--bg`/… ) automatically restyles shadcn components too.
- Storefront font tokens map `--font-sans → --font-body` and `--font-serif → --font-display`; use Tailwind `font-serif` for display headings.

### Single-Store Layout

`@layout` (in `client/vite.config.js`) resolves to the fixed `client/src/layouts/store/` directory: Home, Navbar, Footer, Products, ProductDetail, ProductCard, themes.js, plus static pages. `App.jsx` imports from `@layout`. Store branding/SEO env vars live in `client/.env` (VITE_STORE_NAME, VITE_SITE_TITLE, etc.) — see `client/.env.example`.

### Auth Flow

JWT stored in httpOnly cookie only (not localStorage, no Bearer header). The Axios client uses `withCredentials: true`. Auth middleware in `server/src/middleware/auth.js` reads the cookie. Roles: admin, staff (with granular permissions array), customer.

### State Management

React Context only (no Redux): AuthContext, CartContext, WishlistContext, RecentlyViewedContext, ThemeContext. Cart and wishlist persist to localStorage.

### Payment Gateways

`server/src/services/paymentGateway.js` — plugin-style abstraction over Razorpay, Paytm, Stripe, Nomod, COD, and Bank Transfer. Each gateway implements create/verify patterns. Payment route (`server/src/routes/payment.js`) orchestrates order creation, coupon validation, and gateway calls.

### Theme System

CSS variable-based theming. `client/src/themes/shared.js` defines theme objects (colors, fonts, radii). ThemeContext applies them as CSS custom properties and dynamically loads Google Fonts. Admin can change the active theme via Settings. These brand variables are what the shadcn tokens reference (see UI System above), so theme changes propagate to shadcn components automatically.

### ERP / POS

Gated behind **two** flags that must agree: `VITE_FEATURE_MULTILOC` (client, hides the ERP admin tabs and the POS routes) and `FEATURE_MULTILOC` (server, switches online orders onto the per-location inventory pool). The ERP API routes themselves are mounted unconditionally.

**Stock has two representations.** With the flag off, `Product.stock` / `variants[].stock` are the source of truth. With it on, `ProductStock` rows per (product, variant, location) are, and `recomputeProductStock()` rolls them up into `Product.stock` **and `variants[].stock`** (the storefront size picker reads the latter) for legacy readers. Anything that moves stock for a web order must go through `decrementOnlineStock()` / `restoreOnlineStock()` (`models/index.js`), which fall back to the legacy path when the flag is off — writing `Product.stock` directly instead means the next ERP action silently reverts the sale.

The ERP/POS was brought over from the sibling Salla-kuwait project (Oct 2026) with Famnia's own additions kept on top. Deliberately left out: recipes/production, raw materials and units, expiry batches, the old-POS legacy import, Arabic auto-translate, and the Kuwait specifics (KNET, Keeta/Deliveroo/Talabat, 3-decimal KWD columns). The server pins `process.env.TZ` to `Asia/Qatar` (`server/src/tz.js`, override with `STORE_TIMEZONE`) and the client formats dates on the same clock (`client/src/lib/storeTime.js`). Shift money (X/Z reports, shift close, shift summary) all goes through `server/src/utils/posTotals.js` so they agree. Cashiers edit a line's price inline (server keeps `listPrice` + `priceOverridden`); price cuts, line discounts and the bill discount share the 15% manager-PIN threshold.

**Schema upgrade on an existing DB** — `sync({ alter: true })` needs two manual steps around it: `ALTER TABLE SalesReturns MODIFY orderId INT NULL` *before* (no-receipt returns; otherwise the re-added ON DELETE SET NULL foreign key is rejected), and `CREATE UNIQUE INDEX product_barcode_unique ON Products (barcode)` *after* (alter adds the column but not its named unique index). Then `npm run seed:erp`, which also re-tags pre-existing till sales from the `'web'` channel default to `'pos'` and re-derives every product's `stock` / `variants[].stock` from `ProductStock` (run it once after deploying the variant rollup, or per-size stock online stays stale).

`Product.hideOnline` marks a product POS-only: hidden from the storefront, API, sitemap and SSR injector, still sellable at the till.

**Editing stock:** `Product.stock` is a derived rollup once the flag is on — anything writing it directly is overwritten by the next `recomputeProductStock()`. The admin product form therefore routes its figure through `syncProductStockFromForm()` (`models/index.js`), which writes the per-location rows and recomputes. It only does so when exactly **one** active Location exists; with several the destination branch is ambiguous, so it returns `'ambiguous'` and the UI points the user at Inventory rather than discarding the number.

### Accounting

`routes/accounting.js` — fixed assets, owner capital, balance sheet. Straight-line depreciation (20%/yr default) accrues monthly via `services/depreciationJob.js`, which is idempotent on a unique `(fixedAssetId, period)` index and self-healing (it always walks from the asset's start month, so downtime needs no catch-up). Depreciation writes **no** `CashTransaction` — it is non-cash by construction. The same goes for stock losses: wastage write-offs and stock-count variances only move stock, and `computePnl` reads them straight off posted `Wastage` / `StockCount` rows as a non-cash `stockLosses` line (rows from before this carry an `expenseId` / `shrinkageExpenseId` and are skipped, since their Expense already counts). Never book them as an Expense — that debits a cash account and counts the loss twice.

The balance sheet is an **aggregation, not a trial balance**: this is a single-entry cash ledger with no chart of accounts, so nothing forces it to balance. It reports a `reconciliation.difference` with quantified causes rather than plugging the gap. `computePnl` / `computeStockValue` (finance.js) and `computeBalance` (suppliers.js) are exported and shared so the sheet cannot drift from the screens showing the same figures.

House rules enforced in code: no supplier credit (a PO cannot be received until `amountPaid >= totalAmount`), no customer credit (POS tenders must sum exactly to the total; `store_credit` refunds were removed), and no overdrawn accounts — back-office outflows (expenses, cash transfers, supplier payments, asset purchases, owner drawings) pass `requireFunds: true` to `writeCashTxn()`, which refuses a payment the account can't cover. Till refunds are exempt: the drawer's ledger balance excludes the opening float.

**Money precision** comes from `CURRENCY_DECIMALS` (server `.env`) / `VITE_CURRENCY_DECIMALS` (client `.env`) — 2 for QAR. Client money display and POS arithmetic use `CURRENCY_DECIMALS` / `PRICE_STEP` from `utils/currency.jsx`; the server's POS paths round with `dp()` from `utils/money.js` (read at call time — dotenv loads after imports). The two must round alike or tenders stop matching totals. ERP DB columns are DECIMAL(…,3) and unit/landed costs may carry a third decimal; that's storage precision, not display.

POS tenders are **cash and card only**. KNET was inherited from the Kuwait upstream and removed — it is Kuwait's national debit network and doesn't operate in Qatar, so it offered a rail customers couldn't pay on and a drawer line that always read zero.

### FEMNIA Hub (staff back office, `/hub`)

A replica of the client's "FEMNIA Hub" design (a Lovable app), being rebuilt screen by screen on this backend to replace `/admin` and `/admin/erp`, which stay reachable until every screen has moved. Code lives in `client/src/hub/` (lazy-loaded `HubApp.jsx`, own router subtree, @tanstack/react-query, sonner toasts) and `server/src/hub/` + `routes/hub.js`.

- **Own design system, scoped to `html.hub-theme`** (`client/src/hub/hub.css`, imported by `index.css`). `HubApp` adds the class to `<html>` while mounted — not a wrapper div — so Radix portals inherit it. Tokens are `!important` because ThemeContext writes the storefront's brand vars inline on `<html>`. The radius scale lives in a non-inline `@theme` block in `index.css` precisely so the hub can override it.
- **Own shadcn copies in `client/src/hub/ui/`** — ported from the design's (older, forwardRef) components, which look different from the storefront's `components/ui/`. Use these inside the hub, never the storefront ones.
- **Permissions:** `server/src/hub/permissions.js` is the catalogue (≈60 keys like `orders.create`, presets, `accessFor`). Roles admin / staff / **delivery**. `requirePermission('products')` also accepts the hub keys that imply a legacy key, so hub-created staff can use old endpoints during the transition.
- **Account gate:** hub accounts carry `status` (pending/active/suspended/deactivated), `mustChangePassword`, `username` (sign in with it instead of email), `passwordChangedAt`. `protect` refuses non-active or must-change accounts except on `/api/auth/profile`, `/api/auth/forced-password`, `/api/hub/access`; tokens issued before `passwordChangedAt` are rejected (a password change signs out other devices).

- **Catalogue as SKUs:** the hub lists one row per SKU = a product without variants, or one `variants[]` entry, keyed `productId:variantIndex` (`base` when no variants). SKU-level values (costPrice, rack, shelfLocation, reorderLevel, active, opening batch) live on the variant object, falling back to Product columns (`server/src/hub/catalog.js`). **Never splice `variants[]`** — ProductStock rows and past orders reference indexes; removed variants are kept with `archived: true` (storefront and order matching skip them). Hub catalogue/stock API: `routes/hubCatalog.js` under `/api/hub`.
- **Sales orders are `Order` rows** (`routes/hubSales.js`, `server/src/hub/sales.js`). Hub orders use `channel: 'staff'`, numbers like `FEM-0001` (Counter `hub_order`), and the hub vocabulary in `hub*` columns (`hubStatus`, `hubPaymentStatus`, `hubPaymentMode`, `fulfilmentMethod`, `amountReceived`, …). `toSalesOrder()` derives that view for web/till orders that never had it, `adoptLegacy()` freezes it before the hub first edits one, and `syncLegacy()` writes `orderStatus`/`paymentStatus` back on every hub write — the P&L, reports and "My orders" read only the legacy fields. Lines carry `productId`, `variantIndex`, `costPrice` and `returnedQty`. **Confirm is the only step that deducts stock**; `stockState` (`none`/`deducted`/`restored`) makes every restore happen once, including the legacy cancel/refund path (`restoreOnlineStock` honours it). Till sales (`channel: 'pos'`) are read-only in the hub. Hub customers are `role: 'customer'` Users (code `CUS-0001` from the id).
- **Delivery** (`routes/hubDelivery.js`): `delivery`-role Users get assigned orders (`Order.assignedTo`). They never read the order list — `/delivery/mine` returns safe fields only and `/delivery/:number/update` is their one write path (their "Pending" = a not-yet-started Confirmed order). Only an admin can change an order that is Delivered **and** Paid, on any path.
- **Expenses & Assets** (`routes/hubFinance.js`): `HubExpenseEntry` keeps the hub's vocabulary (funding source, purchased by). A company funding source maps to a `CashAccount` (Settings → Funding accounts; unmapped = same-named account, created on first use) and the entry also writes the classic record — an `Expense` or a `FixedAsset` — with a `requireFunds` cash debit. "Paid Personally" opens a `HubLiability` and writes no Expense: `computePnl` counts those expenses on their own date, the balance sheet carries the unpaid part as `personalPayable`, and a `HubReimbursement` only debits cash. Never create an Expense for a reimbursement — the expense already counted.
- **Dashboard / Reports** (`routes/hubReports.js`): the financial summary is `computePnl`, so hub Reports and the classic P&L can't disagree. Staff/settings/backup/catalogue-replace live in `routes/hubAdmin.js`.
- **One admin — ERP merged into the hub.** The hub sidebar (`AppShell.jsx` NAV_GROUPS) is the single menu. Hub screens absorbed the classic features they overlapped with (products storefront fields + gallery + categories, web-order refunds / Shiprocket / status emails, guest customers, unified expenses with void + categories, all fixed assets, dashboard charts, filtered activity log, SQL backup/restore, shop-label printing). ERP-only screens are hub pages at `/hub/m/:screen` (`hub/lib/erpScreens.js` → `pages/Erp.jsx` rendered with `embedded screen=<tab>`); store extras (carts, B2B quotes, reviews, coupons, theme) at `/hub/store` (`pages/Admin.jsx` `embedded`). Those embedded screens gate on classic keys — the hub passes `accessFor().legacy` so hub staff see what the server allows. `.hub-legacy` in hub.css repaints them in the hub palette; edit the classic components, not a copy, and keep `/admin` and `/admin/erp` working (the user keeps `/admin` live).

### Stock ledger (`StockMovement`)

Every ProductStock quantity change writes a signed `StockMovement` row via ProductStock `afterCreate`/`afterUpdate` hooks (`services/stockLedger.js`), so history covers POS, returns, transfers, counts, wastage, purchasing, online orders and imports without each route opting in. The hook names the movement from an explicit `withStockContext()` (hub Stock In/Out/adjust/import pass reference, supplier, batch, idempotency key) or else from the request path. **Change ProductStock only through instance `create`/`update`** — `Model.update`/`increment`/raw SQL bypass the hooks (boot's `reconcileStockLedger()` repairs such drift as an adjustment, and on first boot opened every existing row with an `opening` movement). Hub inventory columns are ledger sums: Opening + In − Sales − Manual Out ± Adjust = Current.

### Database

**Column migrations run on boot.** `server/src/migrations/index.js` holds idempotent add-column / add-index / widen-ENUM steps, run from `start()` before `sync()` (and by `npm run migrate`). Boot's `sync()` creates new tables but never adds columns to existing ones, so **every column added to an existing model must get a step there** or production breaks on deploy.

Sequelize ORM with MySQL. Models in `server/src/models/`. Key models: User, Product, Order, Review, Category, Coupon, Setting, Pincode, AbandonedCart, plus the ERP set (Location, ProductStock, Supplier, PurchaseOrder, CashAccount, CashTransaction, Expense, FixedAsset, DepreciationEntry, CapitalEntry, Counter, Wastage). Sync behavior: `DB_SYNC_ALTER=true` enables `sync({ alter: true })` — only use in development, never in production (causes duplicate index buildup).

### Background Jobs

`server/src/services/abandonedCartJob.js`, `lowStockJob.js` and `depreciationJob.js` run as intervals started from the main server process (not separate workers). The depreciation job's boot run is what back-fills any months missed while the server was down.

## Key Conventions

- Converted pages use Tailwind utilities + shadcn components. Unconverted pages (admin, static pages) still use the legacy `s2-`-prefixed classes in `client/src/layouts/store/layout.css` and the base classes in `index.css` — both files are still loaded. When converting a page, prefer replacing its `s2-*` markup with shadcn rather than editing the old CSS.
- Product images are processed through Sharp on upload (`server/src/routes/upload.js`) — WebP conversion, resizing.
- **Dates:** `parseRange` and friends build `Date`s in LOCAL time, so never format a DATEONLY bound with `toISOString()` — on UTC+3 that shifts the window a day and leaks rows between periods. Use the exported `dateOnly()` / `monthKeyLocal()` helpers in `routes/finance.js`. Depreciation periods are `'YYYY-MM'` strings precisely to avoid this.
- **Sequelize returns DECIMAL as a string.** `row.cost + 20` concatenates while subtraction coerces, which makes the bug intermittent — `parseFloat` on every read, and `Model.sum()` returns `null` (not 0) for an empty set.
- Server env: copy `server/.env.example` → `server/.env`. Client env: `client/.env`. The client proxies `/api` and `/uploads` to localhost:3000 in dev.
- The admin is split across two sibling pages, both tab-based: `client/src/pages/Admin.jsx` (`/admin` — catalog, orders, customers, coupons, theme) and `client/src/pages/Erp.jsx` (`/admin/erp` — inventory, purchasing, finance, assets, POS ops, reports, audit, backup). Erp.jsx keeps its tab in `?tab=` so screens are linkable; admins land there after login. Tab bodies live in `client/src/components/admin/*`; Products and Categories are self-contained (`ProductsManager`, `CategoriesManager`) and served from both pages.
- Email templates are inline HTML in `server/src/services/emailService.js`.

## VPS Deployment

Typical update flow:
```bash
git pull origin main
cd client && npm install && npm run build
cd ../server && npm install && pm2 reload server
```

Nginx proxies `/api` + `/uploads` to the Express PM2 process and serves `client/dist/` for static files. See `nginx.conf` and `deploy.sh`.
