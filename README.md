# ShopHub — E-Commerce Platform

A full-stack e-commerce web application built with React (Vite) and Node.js, optimized for Hostinger Business Plan deployment.

## Tech Stack

- **Frontend:** React 18, Vite, React Router, Axios
- **Backend:** Node.js, Express, Sequelize ORM
- **Database:** MySQL
- **Auth:** JWT (httpOnly cookies + Bearer tokens), bcrypt
- **Payments:** Razorpay, Paytm (modular gateway system)
- **Email:** Nodemailer (Gmail / Hostinger / any SMTP)
- **Storage:** Local file uploads (multer)

## Features

- Product catalog with categories, search, filters, and sorting
- Product image upload with drag-and-drop (admin)
- Shopping cart with localStorage persistence
- Guest checkout + registered user checkout
- Multiple payment gateways (Razorpay, Paytm, COD, Bank Transfer)
- Order management with status tracking
- Automated order confirmation & status update emails
- Admin panel (products CRUD, order management)
- Responsive design with editorial luxury aesthetic
- Rate limiting, CSRF protection, password strength validation

## Getting Started

### Prerequisites

- Node.js 18+
- MySQL

### Setup

```bash
# Install dependencies
cd client && npm install
cd ../server && npm install

# Configure environment
cp server/.env.example server/.env
# Edit server/.env with your MySQL credentials and API keys

# Seed database
cd server && npm run seed

# Run development servers
npm run dev:server   # Backend on :3000
npm run dev:client   # Frontend on :5173
```

### Default Accounts

- **Admin:** admin@store.com / admin123
- **Customer:** john@example.com / password123

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | MySQL connection |
| `JWT_SECRET`, `JWT_EXPIRE` | JWT authentication |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Razorpay payment gateway |
| `PAYTM_MERCHANT_ID`, `PAYTM_MERCHANT_KEY`, `PAYTM_ENV` | Paytm payment gateway |
| `SMTP_EMAIL`, `SMTP_APP_PASSWORD` | Email (Gmail) |
| `SMTP_HOST`, `SMTP_PORT` | Custom SMTP (Hostinger, Zoho, etc.) |


## License

MIT — see [LICENSE](LICENSE)
