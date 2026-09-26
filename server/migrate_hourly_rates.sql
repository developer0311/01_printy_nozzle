-- Printynozzle Hourly Rates migration (dynamic slabs for the 3D Printing > Hourly Rates tab)
-- Run in phpMyAdmin for existing DBs (new installs get this via query.sql + self-heal).

INSERT INTO site_settings (setting_key, setting_value, setting_type, description) VALUES
('print_time_slabs', '[{"min":0,"max":5,"rate":50},{"min":5,"max":10,"rate":45},{"min":10,"max":20,"rate":40},{"min":20,"max":null,"rate":35}]', 'json', 'Hourly printing charge slabs (edited from 3D Printing > Hourly Rates)')
ON DUPLICATE KEY UPDATE description = VALUES(description), setting_value = IF(setting_value IS NULL OR setting_value = '', VALUES(setting_value), setting_value);
