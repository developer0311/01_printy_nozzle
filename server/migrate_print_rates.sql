-- Printynozzle 3D Printing Selling Rate Chart migration
-- Run in phpMyAdmin for existing DBs (new installs get this via query.sql + self-heal).

-- 1) Time-based charge settings (admin editable in Settings tab)
INSERT INTO site_settings (setting_key, setting_value, setting_type, description) VALUES
('print_hours_per_gram', '0.15', 'number', 'Print hours estimated per gram of filament'),
('print_rate_0_5', '50', 'number', 'Printing charge Rs/hour for 0-5 hours'),
('print_rate_5_10', '45', 'number', 'Printing charge Rs/hour for 5-10 hours'),
('print_rate_10_20', '40', 'number', 'Printing charge Rs/hour for 10-20 hours'),
('print_rate_20_plus', '35', 'number', 'Printing charge Rs/hour for 20+ hours')
ON DUPLICATE KEY UPDATE setting_value = IF(setting_value IS NULL OR setting_value = '', VALUES(setting_value), setting_value);

-- 2) Material selling rates (Rs/g, admin editable in 3D Printing > Materials)
INSERT INTO printing_materials (name, slug, code, description, price_per_gram, density_g_cm3, best_for, sort_order, is_active) VALUES
('PLA', 'pla', 'PLA', 'Easy to print, eco-friendly and great for everyday use.', 4.50, 1.24, 'Prototypes, Decor, Toys', 1, 1),
('PLA+', 'pla-plus', 'PLA+', 'Upgraded PLA with higher toughness for functional prints.', 4.50, 1.24, 'Functional prototypes, Toys', 2, 1),
('PLA Matte', 'pla-matte', 'PLA-MATTE', 'Matte surface finish, hides layer lines for display models.', 6.00, 1.24, 'Display models, Decor', 3, 1),
('PETG', 'petg', 'PETG', 'Strong, durable and resistant to moisture and chemicals.', 5.50, 1.27, 'Functional parts, Enclosures', 4, 1),
('PETG HS', 'petg-hs', 'PETG-HS', 'High-speed PETG tuned for faster printing.', 5.50, 1.27, 'Functional parts, Fast prints', 5, 1),
('ASA', 'asa', 'ASA', 'UV-stable and heat resistant for outdoor parts.', 8.00, 1.07, 'Outdoor parts, Automotive', 6, 1),
('TPU 95A', 'tpu-95a', 'TPU-95A', 'Flexible, rubber-like material with great durability.', 10.00, 1.21, 'Wearables, Gaskets, Flexible parts', 7, 1),
('ABS', 'abs', 'ABS', 'Tough and heat resistant, ideal for functional applications.', 8.00, 1.04, 'Mechanical parts, Tools', 8, 1)
ON DUPLICATE KEY UPDATE price_per_gram = VALUES(price_per_gram), density_g_cm3 = VALUES(density_g_cm3), best_for = VALUES(best_for), code = VALUES(code), description = VALUES(description);

-- 3) Time-breakup columns for orders + cart (safe to re-run)
ALTER TABLE `printing_orders` ADD COLUMN IF NOT EXISTS `print_time_hours` DECIMAL(10,2) NULL AFTER `estimated_weight`;
ALTER TABLE `printing_orders` ADD COLUMN IF NOT EXISTS `time_cost` DECIMAL(10,2) DEFAULT 0.00 AFTER `material_cost`;
ALTER TABLE `cart_items` ADD COLUMN IF NOT EXISTS `print_time_hours` DECIMAL(10,2) NULL AFTER `estimated_weight`;
ALTER TABLE `cart_items` ADD COLUMN IF NOT EXISTS `time_cost` DECIMAL(10,2) DEFAULT 0.00 AFTER `estimated_weight`;
ALTER TABLE `order_items` ADD COLUMN IF NOT EXISTS `print_time_hours` DECIMAL(10,2) NULL AFTER `estimated_weight`;
ALTER TABLE `order_items` ADD COLUMN IF NOT EXISTS `time_cost` DECIMAL(10,2) DEFAULT 0.00 AFTER `estimated_weight`;
