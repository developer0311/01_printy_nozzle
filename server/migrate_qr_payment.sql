-- Printynozzle "Pay with QR" migration
-- Run in phpMyAdmin for existing DBs (new installs get this via query.sql + self-heal).

-- 1) Allow 'qr' payment method on product + 3D-print orders
ALTER TABLE `orders` MODIFY COLUMN `payment_method` ENUM('upi', 'card', 'net_banking', 'wallet', 'cod', 'qr') DEFAULT 'cod';
ALTER TABLE `printing_orders` MODIFY COLUMN `payment_method` ENUM('upi', 'card', 'net_banking', 'wallet', 'cod', 'qr') DEFAULT 'cod';

-- 2) Customer UPI payment screenshot proof
ALTER TABLE `orders` ADD COLUMN IF NOT EXISTS `payment_screenshot_url` VARCHAR(500) NULL AFTER `payment_status`;
ALTER TABLE `printing_orders` ADD COLUMN IF NOT EXISTS `payment_screenshot_url` VARCHAR(500) NULL AFTER `payment_status`;

-- 3) Merchant QR config (edited from Admin → Settings)
INSERT INTO site_settings (setting_key, setting_value, setting_type, description) VALUES
('qr_upi_id', 'ashitrajbanshi447-3@okicici', 'string', 'UPI ID shown on the checkout QR payment option'),
('qr_payee_name', 'Ashit Rajbanshi', 'string', 'Payee name shown on the checkout QR payment option'),
('qr_image_url', '', 'string', 'Merchant QR code image URL (uploaded from Admin Settings)')
ON DUPLICATE KEY UPDATE description = VALUES(description);
