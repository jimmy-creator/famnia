# Deploying Fineline to Hostinger

Hostinger Business/Cloud uses **LiteSpeed + Phusion Passenger** to run Node apps.
The Express server (`server/src/index.js`) serves **everything** — the API
(`/api`), uploaded images (`/uploads`), and the built React client
(`client/dist/`). There is **one Node process**; you do not need nginx, PM2, or
the `deploy.sh`/`nginx.conf` files in this repo (those are for a plain VPS).

Repo: `github.com/jimmy-creator/fineline`

---

## How the pieces fit

```
Passenger ──► server/app.cjs ──(dynamic import)──► server/src/index.js
                                                      ├── /api/*        Express routes
                                                      ├── /uploads/*    static, from UPLOADS_DIR
                                                      └── /*            client/dist + per-URL SEO HTML
```

- **`server/app.cjs`** is a tiny CommonJS shim. Passenger requires a CommonJS
  startup file, but the real server is an ES module — `app.cjs` does
  `import('./src/index.js')` and logs any boot crash to
  `server/startup-error.log`. **This is the Passenger "startup file."**
- Passenger sets `process.env.PORT` itself; the `PORT` in `.env` is ignored in
  production.
- `client/dist` must exist next to `server/` (the server resolves it as
  `../../client/dist`). The root `npm install` builds it automatically — see below.

---

## 1. Create the Node app in hPanel

**hPanel → Website → Advanced → Node.js** (or "Setup Node.js App"):

| Field | Value |
|---|---|
| Node version | 18 or 20 (LTS) |
| Application mode | `Production` |
| Application root | the folder you deploy into, e.g. `domains/<domain>/public_html` |
| Application URL | your domain |
| Application startup file | `server/app.cjs` |

The startup file path is **relative to the application root**, so with the repo
checked out at the application root it is `server/app.cjs`.

---

## 2. Get the code onto the server

Use the app root chosen above. Either clone:

```bash
cd ~/domains/<domain>/public_html
git clone https://github.com/jimmy-creator/fineline.git .
```

…or upload a zip and extract. The repo must keep its `client/` + `server/`
layout intact.

---

## 3. Create the database

**hPanel → Databases → MySQL Databases**: create a database + user, grant the
user all privileges on it. Note the **DB name, user, password** (Hostinger
prefixes them, e.g. `u123456_fineline`).

Tables are created automatically on first boot (`sequelize.sync`). You do not
run migrations.

---

## 4. Set environment variables

In the Node app screen there's an **environment variables** section. These are
available both at build time (so the client bakes the right branding) and at
runtime. Set at minimum:

### Server (runtime)
```
NODE_ENV=production
DB_HOST=127.0.0.1            # IMPORTANT: not "localhost" — see gotchas
DB_PORT=3306
DB_NAME=u123456_fineline
DB_USER=u123456_fineline
DB_PASSWORD=<your db password>

JWT_SECRET=<long random string>
JWT_EXPIRE=7d

CLIENT_URL=https://<your-domain>   # used for CORS, password-reset & payment links
UPLOADS_DIR=/home/<user>/domains/<domain>/uploads   # persist images across redeploys

# Currency shown in emails / invoices / schema
CURRENCY_SYMBOL=AED
CURRENCY_CODE=AED
CURRENCY_DECIMALS=2

# First admin (delete these two after first successful login + restart)
BOOTSTRAP_ADMIN_EMAIL=you@example.com
BOOTSTRAP_ADMIN_PASSWORD=<temp strong password>
BOOTSTRAP_ADMIN_NAME=Admin
```

### Client branding (baked into the bundle at build time)
The `VITE_*` values default from `client/.env.production`, but anything you set
here as a real env var **overrides** that file. At minimum set the real domain:
```
VITE_SITE_URL=https://<your-domain>
VITE_STORE_NAME=Fineline
VITE_SITE_TITLE=Fineline — Online Store
VITE_CURRENCY_SYMBOL=AED
VITE_CURRENCY_CODE=AED
VITE_CURRENCY_DECIMALS=2
```
> `VITE_*` are PUBLIC and frozen at build time. If you change one, you must
> **rebuild** (re-run install) for it to take effect.

Optional, only if you use them: SMTP vars (email), payment gateway keys
(`RAZORPAY_*`, `NOMOD_API_KEY`, `STRIPE_*`, …). A gateway only appears at
checkout when its key is set.

---

## 5. Install + build

In the Node app screen click **Run NPM Install** (or run `npm install` in the
app root via SSH). The root `package.json` has:

```jsonc
"postinstall": "npm run install:all && npm run build:client"
```

So a single `npm install` installs client + server deps **and builds
`client/dist`**. No separate build step is needed.

If you prefer to do it by hand over SSH:
```bash
cd ~/domains/<domain>/public_html
npm install            # installs everything + builds client (via postinstall)
# or explicitly:
npm run build
```

---

## 6. Start / restart

Click **Restart** in the Node app screen (or `touch tmp/restart.txt` in the app
root — Passenger watches that file). Visit your domain.

---

## 7. Seed (optional)

To load demo categories/products over SSH:
```bash
cd ~/domains/<domain>/public_html/server
npm run seed
```
Only run this on an empty store — it's for first-time setup.

---

## Gotchas (learned the hard way on the sister store)

- **503 with empty logs.** Passenger swallows ESM boot errors. Check
  `server/startup-error.log` — `app.cjs` writes the real stack trace there.
- **`SequelizeAccessDeniedError … '@'::1'`.** `localhost` resolves to IPv6
  `::1`, which Hostinger MySQL rejects. Use **`DB_HOST=127.0.0.1`**.
- **Product images / admin edit show blank.** Hostinger MariaDB returns JSON
  columns as strings. This repo already handles it (global `afterFind` parse
  hook) — just make sure you deploy current `main`.
- **Images disappear after every redeploy.** A clean checkout wipes
  `server/uploads`. Set **`UPLOADS_DIR`** to an absolute path *outside* the
  deploy tree (step 4) so uploads survive.
- **Password-reset email links point to `localhost`.** Set `CLIENT_URL` to the
  real domain (step 4) — links are built from it.
- **WhatsApp/social preview image missing.** Make sure `VITE_SITE_URL` is the
  real `https://` domain so og:image URLs resolve.
- **Banner reloads on every refresh.** Already fixed — `/uploads` is served with
  `max-age=1y, immutable`. Just deploy current `main`.
- **Build "URI malformed" / missing `VITE_*`.** Caused by undefined
  `%VITE_*%` placeholders in `index.html`. `client/.env.production` is committed
  precisely to prevent this — don't delete it.
- **First admin.** Use the `BOOTSTRAP_ADMIN_*` env vars (step 4); after logging
  in once, **delete those vars and restart** so the password isn't left in the
  app config. Alternatively `cd server && npm run create:admin -- <email> <pass> [name]`.

---

## Redeploy (after pushing new commits)

```bash
cd ~/domains/<domain>/public_html
git pull origin main
npm install            # rebuilds client/dist via postinstall
# then click Restart in hPanel, or:
touch tmp/restart.txt
```
