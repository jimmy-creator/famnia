#!/bin/bash
# ============================================
# ShopHub VPS Deployment Script
# Run this ON the VPS after cloning the repo
# Usage: chmod +x deploy.sh && ./deploy.sh
# ============================================

set -e

echo "=========================================="
echo "  ShopHub - VPS Deployment"
echo "=========================================="

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# ===== 1. System Updates =====
echo -e "${GREEN}[1/8] Updating system...${NC}"
sudo apt update && sudo apt upgrade -y

# ===== 2. Install Node.js 20 =====
echo -e "${GREEN}[2/8] Installing Node.js 20...${NC}"
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt install -y nodejs
fi
echo "Node: $(node -v) | NPM: $(npm -v)"

# ===== 3. Install MySQL =====
echo -e "${GREEN}[3/8] Installing MySQL...${NC}"
if ! command -v mysql &> /dev/null; then
  sudo apt install -y mysql-server
  sudo systemctl start mysql
  sudo systemctl enable mysql
fi

# ===== 4. Install Nginx =====
echo -e "${GREEN}[4/8] Installing Nginx...${NC}"
if ! command -v nginx &> /dev/null; then
  sudo apt install -y nginx
  sudo systemctl start nginx
  sudo systemctl enable nginx
fi

# ===== 5. Install PM2 =====
echo -e "${GREEN}[5/8] Installing PM2...${NC}"
if ! command -v pm2 &> /dev/null; then
  sudo npm install -g pm2
fi

# ===== 6. Install Certbot (SSL) =====
echo -e "${GREEN}[6/8] Installing Certbot...${NC}"
if ! command -v certbot &> /dev/null; then
  sudo apt install -y certbot python3-certbot-nginx
fi

# ===== 7. Install Dependencies =====
echo -e "${GREEN}[7/8] Installing app dependencies...${NC}"
cd /var/www/shophub/client && npm install
cd /var/www/shophub/server && npm install --production

# ===== 8. Build Frontend =====
echo -e "${GREEN}[8/8] Building frontend...${NC}"
cd /var/www/shophub/client && npm run build

echo ""
echo -e "${GREEN}=========================================="
echo "  Installation complete!"
echo "==========================================${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Create MySQL database:  sudo mysql < /var/www/shophub/setup-db.sql"
echo "2. Edit server/.env with your credentials"
echo "3. Configure Nginx:  sudo cp /var/www/shophub/nginx.conf /etc/nginx/sites-available/shophub"
echo "4. Enable site:  sudo ln -s /etc/nginx/sites-available/shophub /etc/nginx/sites-enabled/"
echo "5. Remove default:  sudo rm /etc/nginx/sites-enabled/default"
echo "6. Get SSL:  sudo certbot --nginx -d yourdomain.com"
echo "7. Start app:  cd /var/www/shophub/server && pm2 start ecosystem.config.cjs"
echo "8. Save PM2:  pm2 save && pm2 startup"
