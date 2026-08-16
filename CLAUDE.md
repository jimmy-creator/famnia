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

**Stock has two representations.** With the flag off, `Product.stock` / `variants[].stock` are the source of truth. With it on, `ProductStock` rows per (product, variant, location) are, and `recomputeProductStock()` rolls them up into `Product.stock` for legacy readers. Anything that moves stock for a web order must go through `decrementOnlineStock()` / `restoreOnlineStock()` (`models/index.js`), which fall back to the legacy path when the flag is off — writing `Product.stock` directly instead means the next ERP action silently reverts the sale.

`Product.hideOnline` marks a product POS-only: hidden from the storefront, API, sitemap and SSR injector, still sellable at the till.

**Editing stock:** `Product.stock` is a derived rollup once the flag is on — anything writing it directly is overwritten by the next `recomputeProductStock()`. The admin product form therefore routes its figure through `syncProductStockFromForm()` (`models/index.js`), which writes the per-location rows and recomputes. It only does so when exactly **one** active Location exists; with several the destination branch is ambiguous, so it returns `'ambiguous'` and the UI points the user at Inventory rather than discarding the number.

### Accounting

`routes/accounting.js` — fixed assets, owner capital, balance sheet. Straight-line depreciation (20%/yr default) accrues monthly via `services/depreciationJob.js`, which is idempotent on a unique `(fixedAssetId, period)` index and self-healing (it always walks from the asset's start month, so downtime needs no catch-up). Depreciation writes **no** `CashTransaction` — it is non-cash by construction.

The balance sheet is an **aggregation, not a trial balance**: this is a single-entry cash ledger with no chart of accounts, so nothing forces it to balance. It reports a `reconciliation.difference` with quantified causes rather than plugging the gap. `computePnl` / `computeStockValue` (finance.js) and `computeBalance` (suppliers.js) are exported and shared so the sheet cannot drift from the screens showing the same figures.

House rules enforced in code: no supplier credit (a PO cannot be received until `amountPaid >= totalAmount`) and no customer credit (POS tenders must sum exactly to the total; `store_credit` refunds were removed).

POS tenders are **cash and card only**. KNET was inherited from the Kuwait upstream and removed — it is Kuwait's national debit network and doesn't operate in Qatar, so it offered a rail customers couldn't pay on and a drawer line that always read zero.

### Database

Sequelize ORM with MySQL. Models in `server/src/models/`. Key models: User, Product, Order, Review, Category, Coupon, Setting, Pincode, AbandonedCart, plus the ERP set (Location, ProductStock, Supplier, PurchaseOrder, CashAccount, CashTransaction, Expense, FixedAsset, DepreciationEntry, CapitalEntry, Counter). Sync behavior: `DB_SYNC_ALTER=true` enables `sync({ alter: true })` — only use in development, never in production (causes duplicate index buildup).

### Background Jobs

`server/src/services/abandonedCartJob.js`, `lowStockJob.js` and `depreciationJob.js` run as intervals started from the main server process (not separate workers). The depreciation job's boot run is what back-fills any months missed while the server was down.

## Key Conventions

- Converted pages use Tailwind utilities + shadcn components. Unconverted pages (admin, static pages) still use the legacy `s2-`-prefixed classes in `client/src/layouts/store/layout.css` and the base classes in `index.css` — both files are still loaded. When converting a page, prefer replacing its `s2-*` markup with shadcn rather than editing the old CSS.
- Product images are processed through Sharp on upload (`server/src/routes/upload.js`) — WebP conversion, resizing.
- **Dates:** `parseRange` and friends build `Date`s in LOCAL time, so never format a DATEONLY bound with `toISOString()` — on UTC+3 that shifts the window a day and leaks rows between periods. Use the exported `dateOnly()` / `monthKeyLocal()` helpers in `routes/finance.js`. Depreciation periods are `'YYYY-MM'` strings precisely to avoid this.
- **Sequelize returns DECIMAL as a string.** `row.cost + 20` concatenates while subtraction coerces, which makes the bug intermittent — `parseFloat` on every read, and `Model.sum()` returns `null` (not 0) for an empty set.
- Server env: copy `server/.env.example` → `server/.env`. Client env: `client/.env`. The client proxies `/api` and `/uploads` to localhost:3000 in dev.
- Admin panel is a single large component at `client/src/pages/Admin.jsx` with tab-based navigation.
- Email templates are inline HTML in `server/src/services/emailService.js`.

## VPS Deployment

Typical update flow:
```bash
git pull origin main
cd client && npm install && npm run build
cd ../server && npm install && pm2 reload server
```

Nginx proxies `/api` + `/uploads` to the Express PM2 process and serves `client/dist/` for static files. See `nginx.conf` and `deploy.sh`.
