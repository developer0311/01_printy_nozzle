-- ============================================================
-- ElectroLab / PrintyNozzle — Complete MySQL Database Schema
-- Run this file in phpMyAdmin to create all tables & seed data
-- ============================================================

CREATE DATABASE IF NOT EXISTS printynozzle;
USE printynozzle;

-- ===================== USERS =====================
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  phone VARCHAR(20) DEFAULT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('customer', 'admin') DEFAULT 'customer',
  is_active TINYINT(1) DEFAULT 1,
  is_verified TINYINT(1) DEFAULT 1,
  avatar_url VARCHAR(500) DEFAULT NULL,
  dob DATE DEFAULT NULL,
  gender ENUM('Male', 'Female', 'Other') DEFAULT NULL,
  email_notifications TINYINT(1) DEFAULT 1,
  marketing_updates TINYINT(1) DEFAULT 0,
  order_updates TINYINT(1) DEFAULT 1,
  last_login TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ===================== ADDRESSES =====================
CREATE TABLE IF NOT EXISTS addresses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  type ENUM('Home', 'Office', 'Other') DEFAULT 'Home',
  full_name VARCHAR(200) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  email VARCHAR(255) DEFAULT NULL,
  address_line1 VARCHAR(500) NOT NULL,
  address_line2 VARCHAR(500) DEFAULT NULL,
  city VARCHAR(100) NOT NULL,
  state VARCHAR(100) NOT NULL,
  pincode VARCHAR(10) NOT NULL,
  country VARCHAR(100) DEFAULT 'India',
  is_default TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ===================== CATEGORIES =====================
CREATE TABLE IF NOT EXISTS categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  slug VARCHAR(200) NOT NULL UNIQUE,
  description TEXT DEFAULT NULL,
  image_url VARCHAR(500) DEFAULT NULL,
  parent_id INT DEFAULT NULL,
  sort_order INT DEFAULT 0,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ===================== BRANDS =====================
CREATE TABLE IF NOT EXISTS brands (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  slug VARCHAR(200) NOT NULL UNIQUE,
  logo_url VARCHAR(500) DEFAULT NULL,
  description TEXT DEFAULT NULL,
  website_url VARCHAR(300) DEFAULT NULL,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ===================== PRODUCTS =====================
CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(300) NOT NULL,
  slug VARCHAR(300) NOT NULL UNIQUE,
  tagline VARCHAR(300) DEFAULT NULL,
  badge VARCHAR(100) DEFAULT NULL,
  description TEXT DEFAULT NULL,
  short_description VARCHAR(500) DEFAULT NULL,
  sku VARCHAR(100) DEFAULT NULL UNIQUE,
  price DECIMAL(10,2) NOT NULL,
  compare_price DECIMAL(10,2) DEFAULT NULL,
  cost_price DECIMAL(10,2) DEFAULT NULL,
  category_id INT DEFAULT NULL,
  brand_id INT DEFAULT NULL,
  stock INT DEFAULT 0,
  low_stock_threshold INT DEFAULT 5,
  weight DECIMAL(8,2) DEFAULT NULL,
  dimensions VARCHAR(100) DEFAULT NULL,
  is_active TINYINT(1) DEFAULT 1,
  is_featured TINYINT(1) DEFAULT 0,
  is_bestseller TINYINT(1) DEFAULT 0,
  is_new TINYINT(1) DEFAULT 0,
  tags VARCHAR(500) DEFAULT NULL,
  meta_title VARCHAR(300) DEFAULT NULL,
  meta_description VARCHAR(500) DEFAULT NULL,
  total_sold INT DEFAULT 0,
  avg_rating DECIMAL(3,2) DEFAULT 0.00,
  review_count INT DEFAULT 0,
  
  -- Rich Product Details (Overview, Specs, Pinout, Resources, FAQs, Applications)
  highlights JSON DEFAULT NULL,
  key_features JSON DEFAULT NULL,
  specifications JSON DEFAULT NULL,
  pinout_image VARCHAR(500) DEFAULT NULL,
  pinout_description TEXT DEFAULT NULL,
  resources JSON DEFAULT NULL,
  faqs JSON DEFAULT NULL,
  applications JSON DEFAULT NULL,
  trust_badges JSON DEFAULT NULL,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE SET NULL,
  INDEX idx_category (category_id),
  INDEX idx_brand (brand_id),
  INDEX idx_price (price),
  INDEX idx_featured (is_featured),
  FULLTEXT INDEX idx_search (name, description, tags)
) ENGINE=InnoDB;

-- ===================== PRODUCT IMAGES =====================
CREATE TABLE IF NOT EXISTS product_images (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  image_url VARCHAR(500) NOT NULL,
  public_id VARCHAR(300) DEFAULT NULL,
  alt_text VARCHAR(300) DEFAULT NULL,
  sort_order INT DEFAULT 0,
  is_primary TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ===================== PRODUCT VARIANTS =====================
CREATE TABLE IF NOT EXISTS product_variants (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  variant_name VARCHAR(200) NOT NULL,
  variant_value VARCHAR(200) NOT NULL,
  price_adjustment DECIMAL(10,2) DEFAULT 0.00,
  stock INT DEFAULT 0,
  sku VARCHAR(100) DEFAULT NULL,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ===================== REVIEWS =====================
CREATE TABLE IF NOT EXISTS reviews (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  user_id INT NOT NULL,
  rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title VARCHAR(300) DEFAULT NULL,
  comment TEXT DEFAULT NULL,
  is_verified_purchase TINYINT(1) DEFAULT 1,
  is_approved TINYINT(1) DEFAULT 1,
  is_visible TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_review (product_id, user_id)
) ENGINE=InnoDB;

-- ===================== WISHLIST =====================
CREATE TABLE IF NOT EXISTS wishlist (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  product_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  UNIQUE KEY unique_wishlist (user_id, product_id)
) ENGINE=InnoDB;

-- ===================== CART =====================
CREATE TABLE IF NOT EXISTS cart (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  coupon_id INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ===================== CART ITEMS =====================
-- Supports both regular products AND custom 3D prints (product_id NULL + print config).
CREATE TABLE IF NOT EXISTS cart_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cart_id INT NOT NULL,
  product_id INT DEFAULT NULL,
  variant_id INT DEFAULT NULL,
  quantity INT NOT NULL DEFAULT 1,
  item_type VARCHAR(20) DEFAULT 'product',
  unit_price DECIMAL(10,2) DEFAULT NULL,
  file_name VARCHAR(300) DEFAULT NULL,
  file_url VARCHAR(500) DEFAULT NULL,
  file_public_id VARCHAR(300) DEFAULT NULL,
  file_size DECIMAL(10,2) DEFAULT NULL,
  dimension_x DECIMAL(8,2) DEFAULT NULL,
  dimension_y DECIMAL(8,2) DEFAULT NULL,
  dimension_z DECIMAL(8,2) DEFAULT NULL,
  material_id INT DEFAULT NULL,
  color_id INT DEFAULT NULL,
  custom_color_hex VARCHAR(7) DEFAULT NULL,
  infill_density INT DEFAULT 50,
  surface_finish VARCHAR(20) DEFAULT 'standard',
  estimated_weight DECIMAL(10,2) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (cart_id) REFERENCES cart(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ===================== COUPONS =====================
CREATE TABLE IF NOT EXISTS coupons (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  description VARCHAR(300) DEFAULT NULL,
  discount_type ENUM('percentage', 'fixed') NOT NULL DEFAULT 'percentage',
  discount_value DECIMAL(10,2) NOT NULL,
  min_order_amount DECIMAL(10,2) DEFAULT 0.00,
  max_discount DECIMAL(10,2) DEFAULT NULL,
  usage_limit INT DEFAULT NULL,
  used_count INT DEFAULT 0,
  is_active TINYINT(1) DEFAULT 1,
  show_in_announcement TINYINT(1) DEFAULT 0,
  valid_from DATETIME DEFAULT NULL,
  valid_until DATETIME DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ===================== ORDERS =====================
CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  order_number VARCHAR(50) NOT NULL UNIQUE,
  status ENUM('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned') DEFAULT 'pending',
  
  -- Shipping Address
  shipping_name VARCHAR(200) NOT NULL,
  shipping_phone VARCHAR(20) NOT NULL,
  shipping_email VARCHAR(255) DEFAULT NULL,
  shipping_address1 VARCHAR(500) NOT NULL,
  shipping_address2 VARCHAR(500) DEFAULT NULL,
  shipping_city VARCHAR(100) NOT NULL,
  shipping_state VARCHAR(100) NOT NULL,
  shipping_pincode VARCHAR(10) NOT NULL,
  shipping_country VARCHAR(100) DEFAULT 'India',

  -- Billing Address
  billing_name VARCHAR(200) DEFAULT NULL,
  billing_phone VARCHAR(20) DEFAULT NULL,
  billing_address1 VARCHAR(500) DEFAULT NULL,
  billing_address2 VARCHAR(500) DEFAULT NULL,
  billing_city VARCHAR(100) DEFAULT NULL,
  billing_state VARCHAR(100) DEFAULT NULL,
  billing_pincode VARCHAR(10) DEFAULT NULL,
  billing_country VARCHAR(100) DEFAULT 'India',

  -- Delivery & Carrier
  delivery_option ENUM('standard', 'express') DEFAULT 'standard',
  shipping_cost DECIMAL(10,2) DEFAULT 0.00,
  tracking_number VARCHAR(100) DEFAULT NULL,
  shipping_carrier VARCHAR(100) DEFAULT 'BlueDart Express',
  
  -- Timeline Timestamps
  packed_at DATETIME DEFAULT NULL,
  shipped_at DATETIME DEFAULT NULL,
  out_for_delivery_at DATETIME DEFAULT NULL,
  delivered_at DATETIME DEFAULT NULL,
  cancelled_at DATETIME DEFAULT NULL,

  -- Payment
  payment_method ENUM('upi', 'card', 'net_banking', 'wallet', 'cod') DEFAULT 'cod',
  payment_method_label VARCHAR(100) DEFAULT 'Cash on Delivery',
  payment_status ENUM('pending', 'paid', 'failed', 'refunded') DEFAULT 'pending',
  razorpay_order_id VARCHAR(200) DEFAULT NULL,
  razorpay_payment_id VARCHAR(200) DEFAULT NULL,
  razorpay_signature VARCHAR(500) DEFAULT NULL,
  
  -- Totals
  subtotal DECIMAL(10,2) NOT NULL,
  discount DECIMAL(10,2) DEFAULT 0.00,
  tax_amount DECIMAL(10,2) DEFAULT 0.00,
  total_amount DECIMAL(10,2) NOT NULL,
  
  coupon_id INT DEFAULT NULL,
  coupon_code VARCHAR(50) DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE SET NULL,
  INDEX idx_user (user_id),
  INDEX idx_status (status),
  INDEX idx_order_number (order_number)
) ENGINE=InnoDB;

-- ===================== ORDER ITEMS =====================
-- product_id NULL rows are custom 3D prints (with print config snapshot).
CREATE TABLE IF NOT EXISTS order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  product_id INT DEFAULT NULL,
  product_name VARCHAR(300) NOT NULL,
  product_image VARCHAR(500) DEFAULT NULL,
  category_name VARCHAR(200) DEFAULT NULL,
  variant_name VARCHAR(200) DEFAULT NULL,
  variant_value VARCHAR(200) DEFAULT NULL,
  price DECIMAL(10,2) NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  total DECIMAL(10,2) NOT NULL,
  item_type VARCHAR(20) DEFAULT 'product',
  unit_price DECIMAL(10,2) DEFAULT NULL,
  file_name VARCHAR(300) DEFAULT NULL,
  file_url VARCHAR(500) DEFAULT NULL,
  file_public_id VARCHAR(300) DEFAULT NULL,
  file_size DECIMAL(10,2) DEFAULT NULL,
  dimension_x DECIMAL(8,2) DEFAULT NULL,
  dimension_y DECIMAL(8,2) DEFAULT NULL,
  dimension_z DECIMAL(8,2) DEFAULT NULL,
  material_id INT DEFAULT NULL,
  color_id INT DEFAULT NULL,
  custom_color_hex VARCHAR(7) DEFAULT NULL,
  infill_density INT DEFAULT 50,
  surface_finish VARCHAR(20) DEFAULT 'standard',
  estimated_weight DECIMAL(10,2) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ===================== MIGRATION: 3D-PRINT-IN-CART (existing DBs) =====================
-- The server also self-heals via utils/printCartSchema.js, but running these in
-- phpMyAdmin guarantees the columns exist for older installs.

-- ===================== 3D PRINTING MATERIALS =====================
CREATE TABLE IF NOT EXISTS printing_materials (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  code VARCHAR(50) DEFAULT NULL,
  description TEXT DEFAULT NULL,
  price_per_gram DECIMAL(8,2) NOT NULL,
  density_g_cm3 DECIMAL(5,2) DEFAULT 1.24,
  best_for VARCHAR(500) DEFAULT NULL,
  is_active TINYINT(1) DEFAULT 1,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ===================== 3D PRINTING COLORS =====================
CREATE TABLE IF NOT EXISTS printing_colors (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  hex_code VARCHAR(7) NOT NULL,
  is_active TINYINT(1) DEFAULT 1,
  sort_order INT DEFAULT 0,
  price_adjustment DECIMAL(8,2) DEFAULT 0.00,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ===================== 3D PRINTING ORDERS =====================
CREATE TABLE IF NOT EXISTS printing_orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  order_number VARCHAR(50) NOT NULL UNIQUE,
  status ENUM('pending', 'confirmed', 'reviewing', 'in_production', 'printing', 'quality_check', 'shipped', 'delivered', 'cancelled') DEFAULT 'confirmed',
  
  -- File Info
  file_name VARCHAR(300) NOT NULL,
  file_url VARCHAR(500) NOT NULL,
  file_public_id VARCHAR(300) DEFAULT NULL,
  file_size DECIMAL(10,2) DEFAULT NULL,
  
  -- Dimensions (mm)
  dimension_x DECIMAL(8,2) DEFAULT NULL,
  dimension_y DECIMAL(8,2) DEFAULT NULL,
  dimension_z DECIMAL(8,2) DEFAULT NULL,
  
  -- Print Settings
  material_id INT NOT NULL,
  color_id INT DEFAULT NULL,
  custom_color_hex VARCHAR(7) DEFAULT NULL,
  infill_density INT DEFAULT 50,
  surface_finish ENUM('standard', 'smooth') DEFAULT 'standard',
  quantity INT DEFAULT 1,
  
  -- Pricing
  estimated_weight DECIMAL(8,2) DEFAULT NULL,
  material_cost DECIMAL(10,2) NOT NULL,
  color_cost DECIMAL(10,2) DEFAULT 0.00,
  finish_cost DECIMAL(10,2) DEFAULT 0.00,
  subtotal DECIMAL(10,2) NOT NULL,
  tax_amount DECIMAL(10,2) DEFAULT 0.00,
  total_amount DECIMAL(10,2) NOT NULL,
  
  -- Shipping
  shipping_name VARCHAR(200) DEFAULT NULL,
  shipping_phone VARCHAR(20) DEFAULT NULL,
  shipping_address1 VARCHAR(500) DEFAULT NULL,
  shipping_city VARCHAR(100) DEFAULT NULL,
  shipping_state VARCHAR(100) DEFAULT NULL,
  shipping_pincode VARCHAR(10) DEFAULT NULL,
  
  -- Payment
  payment_method ENUM('upi', 'card', 'net_banking', 'wallet', 'cod') DEFAULT 'cod',
  payment_status ENUM('pending', 'paid', 'failed', 'refunded') DEFAULT 'pending',
  razorpay_order_id VARCHAR(200) DEFAULT NULL,
  razorpay_payment_id VARCHAR(200) DEFAULT NULL,
  
  notes TEXT DEFAULT NULL,
  admin_notes TEXT DEFAULT NULL,
  estimated_delivery VARCHAR(100) DEFAULT '3-5 Working Days',
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (material_id) REFERENCES printing_materials(id),
  FOREIGN KEY (color_id) REFERENCES printing_colors(id) ON DELETE SET NULL,
  INDEX idx_user (user_id),
  INDEX idx_status (status)
) ENGINE=InnoDB;

-- ===================== NEWSLETTER SUBSCRIBERS =====================
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  is_active TINYINT(1) DEFAULT 1,
  subscribed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  unsubscribed_at TIMESTAMP DEFAULT NULL
) ENGINE=InnoDB;

-- ===================== HERO BANNERS =====================
CREATE TABLE IF NOT EXISTS hero_banners (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(300) DEFAULT NULL,
  subtitle VARCHAR(500) DEFAULT NULL,
  image_url VARCHAR(500) DEFAULT NULL,
  public_id VARCHAR(300) DEFAULT NULL,
  link_url VARCHAR(500) DEFAULT NULL,
  button_text VARCHAR(100) DEFAULT NULL,
  sort_order INT DEFAULT 0,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ===================== SITE SETTINGS =====================
CREATE TABLE IF NOT EXISTS site_settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  setting_key VARCHAR(100) NOT NULL UNIQUE,
  setting_value TEXT DEFAULT NULL,
  setting_type ENUM('string', 'number', 'boolean', 'json') DEFAULT 'string',
  description VARCHAR(300) DEFAULT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ===================== CONTACT MESSAGES =====================
CREATE TABLE IF NOT EXISTS contact_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(20) DEFAULT NULL,
  subject VARCHAR(300) DEFAULT NULL,
  message TEXT NOT NULL,
  is_read TINYINT(1) DEFAULT 0,
  status ENUM('pending', 'read', 'replied', 'archived') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ===================== CONTACT MESSAGE REPLIES =====================
CREATE TABLE IF NOT EXISTS contact_replies (
  id INT AUTO_INCREMENT PRIMARY KEY,
  message_id INT NOT NULL,
  sender ENUM('customer', 'staff') DEFAULT 'staff',
  sender_name VARCHAR(200) DEFAULT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (message_id) REFERENCES contact_messages(id) ON DELETE CASCADE,
  INDEX idx_message (message_id)
) ENGINE=InnoDB;

-- ===================== FAQS =====================
CREATE TABLE IF NOT EXISTS faqs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category VARCHAR(100) DEFAULT 'general',
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  sort_order INT DEFAULT 0,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ===================== PINCODES (DELIVERY SERVICE) =====================
CREATE TABLE IF NOT EXISTS serviceable_pincodes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  pincode VARCHAR(10) NOT NULL UNIQUE,
  city VARCHAR(100) NOT NULL,
  state VARCHAR(100) NOT NULL,
  estimated_days VARCHAR(50) DEFAULT '3 - 5 working days',
  cod_available TINYINT(1) DEFAULT 1,
  express_available TINYINT(1) DEFAULT 1,
  is_serviceable TINYINT(1) DEFAULT 1
) ENGINE=InnoDB;


-- ============================================================
-- SEED DATA & SAMPLE RECORDS
-- ============================================================

-- Site Settings
INSERT INTO site_settings (setting_key, setting_value, setting_type, description) VALUES
('free_shipping_threshold', '999', 'number', 'Minimum order amount for free shipping (in INR)'),
('gst_rate', '18', 'number', 'GST percentage rate'),
('standard_shipping_cost', '0', 'number', 'Standard delivery cost (free above threshold)'),
('express_shipping_cost', '99', 'number', 'Express delivery cost'),
('site_name', 'Printynozzle', 'string', 'Website name'),
('site_tagline', 'Electronics & 3D Printing', 'string', 'Website tagline'),
('support_email', 'info.printynozzle@gmail.com', 'string', 'Support email address'),
('support_phone', '9836609063', 'string', 'Support phone number'),
('whatsapp_number', '+919836609063', 'string', 'WhatsApp Support Number'),
('company_address', '145 Indira Nagar Block 3, Panihati, Sodepur, Opposite Shree Krishna Sweets, North 24 Parganas, 700110, West Bengal, India', 'string', 'Office Address'),
('business_hours', 'Mon - Sat: 10:00 AM - 7:00 PM | Sunday: Closed', 'string', 'Working Hours'),
('smooth_finish_per_gram', '3', 'number', 'Extra cost per gram for smooth finish'),
('printing_delivery_days', '3 - 5 Working Days', 'string', 'Estimated delivery window shown on the 3D printing page'),
('printing_delivery_region', 'Across India', 'string', 'Delivery region shown on the 3D printing page')
ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value);

-- Default Categories
INSERT INTO categories (name, slug, description, sort_order) VALUES
('Microcontrollers', 'microcontrollers', 'Arduino, ESP32, Raspberry Pi Pico and more', 1),
('Modules & Sensors', 'modules-sensors', 'Temperature, humidity, ultrasonic, and other sensors', 2),
('Power Supplies', 'power-supplies', 'Voltage regulators, adapters, battery modules', 3),
('Tools & Accessories', 'tools-accessories', 'Screwdrivers, soldering irons, breadboards', 4),
('Additive & 3D Parts', 'additive-3d-parts', '3D printer filaments, nozzles, and parts', 5),
('3D Printer Parts', '3d-printer-parts', 'Stepper motors, nozzles, heated beds', 6),
('Cables & Wires', 'cables-wires', 'Jumper wires, USB cables, connectors', 7),
('Displays', 'displays', 'LCD, OLED, TFT displays', 8),
('Robotics', 'robotics', 'Motors, wheels, chassis, robot kits', 9),
('IoT & Communication', 'iot-communication', 'WiFi, Bluetooth, LoRa, GSM modules', 10)
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- Default Brands
INSERT INTO brands (name, slug) VALUES
('ESPRESSIF', 'espressif'),
('Arduino', 'arduino'),
('Raspberry Pi', 'raspberry-pi'),
('HiLetgo', 'hiletgo'),
('DFRobot', 'dfrobot'),
('Seeed Studio', 'seeed-studio'),
('Adafruit', 'adafruit'),
('SparkFun', 'sparkfun')
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- 3D Printing Materials
INSERT INTO printing_materials (name, slug, code, description, price_per_gram, density_g_cm3, best_for, sort_order) VALUES
('PLA', 'pla', 'PLA', 'Easy to print, eco-friendly and great for everyday use.', 12.00, 1.24, 'Prototypes, Decor, Toys', 1),
('PETG', 'petg', 'PETG', 'Strong, durable and resistant to moisture and chemicals.', 15.00, 1.27, 'Functional parts, Enclosures', 2),
('ABS', 'abs', 'ABS', 'Tough and heat resistant, ideal for functional applications.', 14.00, 1.04, 'Mechanical parts, Tools', 3),
('TPU', 'tpu', 'TPU', 'Flexible, rubber-like material with great durability.', 18.00, 1.21, 'Wearables, Gaskets, Flexible parts', 4)
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- 3D Printing Colors
INSERT INTO printing_colors (name, hex_code, sort_order) VALUES
('Black', '#000000', 1),
('White', '#FFFFFF', 2),
('Grey', '#808080', 3),
('Red', '#FF0000', 4),
('Orange', '#FF8C00', 5),
('Yellow', '#FFD700', 6),
('Green', '#00C853', 7),
('Teal', '#009688', 8),
('Blue', '#0047FF', 9),
('Purple', '#9C27B0', 10),
('Pink', '#FF69B4', 11),
('Magenta', '#E040FB', 12)
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- General / Contact FAQs
INSERT INTO faqs (category, question, answer, sort_order) VALUES
('contact', 'How can I track my order?', 'Once your order is shipped, you will receive an SMS and email with the tracking ID and link. You can also track it anytime directly under My Orders in your profile.', 1),
('contact', 'How does the 3D printing service work?', 'Simply upload your 3D model file (STL, OBJ, or 3MF), choose your preferred material (PLA, PETG, ABS, TPU), select infill density and surface finish. Our automated calculator gives you an instant quote to place your order!', 2),
('contact', 'What payment methods do you accept?', 'We accept UPI (Google Pay, PhonePe, Paytm), Credit & Debit Cards (Visa, MasterCard, RuPay), Net Banking, and Cash on Delivery (COD) on eligible pin codes.', 3),
('contact', 'What file formats are accepted for 3D printing?', 'We accept standard .STL, .OBJ, and .3MF files up to 100MB in size.', 4),
('contact', 'Do you offer bulk discounts?', 'Yes! For large volume component orders or bulk 3D printing batches, please contact our support team via the form above or email us at info.printynozzle@gmail.com.', 5),
('contact', 'What is your return policy?', 'We provide a 7-day hassle-free replacement or return warranty on all electronic components in case of manufacturing defects.', 6);

-- Sample Serviceable Pincodes
INSERT INTO serviceable_pincodes (pincode, city, state, estimated_days, cod_available, express_available) VALUES
('560001', 'Bengaluru', 'Karnataka', '2 - 3 working days', 1, 1),
('560034', 'Bengaluru', 'Karnataka', '2 - 3 working days', 1, 1),
('110001', 'New Delhi', 'Delhi', '3 - 5 working days', 1, 1),
('400001', 'Mumbai', 'Maharashtra', '3 - 4 working days', 1, 1),
('700001', 'Kolkata', 'West Bengal', '3 - 5 working days', 1, 1),
('600001', 'Chennai', 'Tamil Nadu', '3 - 4 working days', 1, 1),
('500001', 'Hyderabad', 'Telangana', '3 - 4 working days', 1, 1)
ON DUPLICATE KEY UPDATE city = VALUES(city);

-- Admin User (info.printynozzle@gmail.com / Admin@123)
INSERT INTO users (id, first_name, last_name, email, phone, password_hash, role, is_verified) VALUES
(1, 'Admin', 'Printynozzle', 'info.printynozzle@gmail.com', '9836609063', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin', 1)
ON DUPLICATE KEY UPDATE email = VALUES(email);

-- ============================================================
-- NOTE: All dummy/sample records (sample users, products, orders,
-- reviews, wishlist, addresses, product images & demo Cloudinary URLs)
-- were removed. Add real records via the Admin Panel.
-- ============================================================
