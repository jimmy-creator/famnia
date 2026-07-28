-- Run with: sudo mysql < setup-db.sql
CREATE DATABASE IF NOT EXISTS ecom_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'shophub'@'localhost' IDENTIFIED BY 'CHANGE_THIS_PASSWORD';
GRANT ALL PRIVILEGES ON ecom_db.* TO 'shophub'@'localhost';
FLUSH PRIVILEGES;
