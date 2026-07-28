-- Local dev database for the Femnia Fashion storefront.
--
--   1. Replace CHANGE_THIS_PASSWORD below with a password of your choice.
--   2. Set the same value as DB_PASSWORD in server/.env (gitignored).
--   3. Run with: sudo mysql < setup-db-famnia.sql
--
-- Placeholder rather than a literal password so no credential lands in git
-- history — same convention as setup-db.sql.
CREATE DATABASE IF NOT EXISTS famnia CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'famnia'@'localhost' IDENTIFIED BY 'CHANGE_THIS_PASSWORD';
GRANT ALL PRIVILEGES ON famnia.* TO 'famnia'@'localhost';
FLUSH PRIVILEGES;
