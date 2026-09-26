const db = require("../config/db");

/**
 * Ensures cart_items / order_items can store custom 3D-print configurations.
 *
 * cart_items historically only supported product_id (NOT NULL) + variant_id.
 * To let 3D models be added to the cart we allow:
 *   - product_id NULL
 *   - item_type ('product' | 'print')
 *   - snapshot unit_price + full print config (file, dims, material, color...)
 *
 * This helper is idempotent — safe to call on every request / startup.
 * Failures are swallowed (logged once) so the app never crashes on old DBs.
 */

const CART_PRINT_COLUMNS = [
  ["item_type", "VARCHAR(20) DEFAULT 'product'"],
  ["unit_price", "DECIMAL(10,2) NULL"],
  ["file_name", "VARCHAR(300) NULL"],
  ["file_url", "VARCHAR(500) NULL"],
  ["file_public_id", "VARCHAR(300) NULL"],
  ["file_size", "DECIMAL(10,2) NULL"],
  ["dimension_x", "DECIMAL(8,2) NULL"],
  ["dimension_y", "DECIMAL(8,2) NULL"],
  ["dimension_z", "DECIMAL(8,2) NULL"],
  ["material_id", "INT NULL"],
  ["color_id", "INT NULL"],
  ["custom_color_hex", "VARCHAR(7) NULL"],
  ["infill_density", "INT DEFAULT 50"],
  ["surface_finish", "VARCHAR(20) DEFAULT 'standard'"],
  ["estimated_weight", "DECIMAL(10,2) NULL"],
  ["print_time_hours", "DECIMAL(10,2) NULL"],
  ["time_cost", "DECIMAL(10,2) DEFAULT 0.00"],
];

/* Printynozzle selling rate chart (admin editable via site_settings + printing_materials) */
const PRINT_RATE_SEED = [
  ["PLA", "pla", "PLA", "Easy to print, eco-friendly and great for everyday use.", 4.5, 1.24, "Prototypes, Decor, Toys", 1],
  ["PLA+", "pla-plus", "PLA+", "Upgraded PLA with higher toughness for functional prints.", 4.5, 1.24, "Functional prototypes, Toys", 2],
  ["PLA Matte", "pla-matte", "PLA-MATTE", "Matte surface finish, hides layer lines for display models.", 6.0, 1.24, "Display models, Decor", 3],
  ["PETG", "petg", "PETG", "Strong, durable and resistant to moisture and chemicals.", 5.5, 1.27, "Functional parts, Enclosures", 4],
  ["PETG HS", "petg-hs", "PETG-HS", "High-speed PETG tuned for faster printing.", 5.5, 1.27, "Functional parts, Fast prints", 5],
  ["ASA", "asa", "ASA", "UV-stable and heat resistant for outdoor parts.", 8.0, 1.07, "Outdoor parts, Automotive", 6],
  ["TPU 95A", "tpu-95a", "TPU-95A", "Flexible, rubber-like material with great durability.", 10.0, 1.21, "Wearables, Gaskets, Flexible parts", 7],
  ["ABS", "abs", "ABS", "Tough and heat resistant, ideal for functional applications.", 8.0, 1.04, "Mechanical parts, Tools", 8],
];

const PRINT_SETTINGS_SEED = [
  ["print_hours_per_gram", "0.15", "number", "Print hours estimated per gram of filament"],
  ["print_time_slabs", '[{"min":0,"max":5,"rate":50},{"min":5,"max":10,"rate":45},{"min":10,"max":20,"rate":40},{"min":20,"max":null,"rate":35}]', "json", "Hourly printing charge slabs (edited from 3D Printing > Hourly Rates)"],
  ["print_rate_0_5", "50", "number", "Printing charge ₹/hour for 0-5 hours"],
  ["print_rate_5_10", "45", "number", "Printing charge ₹/hour for 5-10 hours"],
  ["print_rate_10_20", "40", "number", "Printing charge ₹/hour for 10-20 hours"],
  ["print_rate_20_plus", "35", "number", "Printing charge ₹/hour for 20+ hours"],
];

let ensurePromise = null;
let warned = false;

const columnExists = async (conn, table, column) => {
  const [rows] = await conn.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [table, column]
  );
  return rows.length > 0;
};

const ensureTable = async (conn, table, allowNullProduct) => {
  // Check table exists first
  const [tables] = await conn.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`,
    [table]
  );
  if (tables.length === 0) return;

  for (const [col, def] of CART_PRINT_COLUMNS) {
    try {
      if (!(await columnExists(conn, table, col))) {
        await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${col}\` ${def}`);
      }
    } catch (e) {
      // Ignore duplicate / permission errors — app continues with fallback queries
      if (!warned) console.warn(`⚠️ Could not add ${table}.${col}:`, e.message);
    }
  }

  if (allowNullProduct) {
    try {
      // Make product_id nullable so print rows can have NULL product_id
      await conn.query(`ALTER TABLE \`${table}\` MODIFY COLUMN \`product_id\` INT NULL`);
    } catch (e) {
      if (!warned) console.warn(`⚠️ Could not modify ${table}.product_id:`, e.message);
    }
  }
};

const ensurePrintOrdersTable = async (conn) => {
  try {
    const [tables] = await conn.query(
      `SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'printing_orders' LIMIT 1`
    );
    if (tables.length === 0) {      await conn.query(`
        CREATE TABLE IF NOT EXISTS printing_orders (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          order_number VARCHAR(50) NOT NULL UNIQUE,
          status ENUM('pending', 'confirmed', 'reviewing', 'in_production', 'printing', 'quality_check', 'shipped', 'delivered', 'cancelled') DEFAULT 'confirmed',
          file_name VARCHAR(300) NOT NULL,
          file_url VARCHAR(500) NOT NULL,
          file_public_id VARCHAR(300) DEFAULT NULL,
          file_size DECIMAL(10,2) DEFAULT NULL,
          dimension_x DECIMAL(8,2) DEFAULT NULL,
          dimension_y DECIMAL(8,2) DEFAULT NULL,
          dimension_z DECIMAL(8,2) DEFAULT NULL,
          material_id INT NOT NULL,
          color_id INT DEFAULT NULL,
          custom_color_hex VARCHAR(7) DEFAULT NULL,
          infill_density INT DEFAULT 50,
          surface_finish ENUM('standard', 'smooth') DEFAULT 'standard',
          quantity INT DEFAULT 1,
          estimated_weight DECIMAL(8,2) DEFAULT NULL,
          print_time_hours DECIMAL(10,2) DEFAULT NULL,
          material_cost DECIMAL(10,2) NOT NULL,
          time_cost DECIMAL(10,2) DEFAULT 0.00,
          color_cost DECIMAL(10,2) DEFAULT 0.00,
          finish_cost DECIMAL(10,2) DEFAULT 0.00,
          subtotal DECIMAL(10,2) NOT NULL,
          tax_amount DECIMAL(10,2) DEFAULT 0.00,
          total_amount DECIMAL(10,2) NOT NULL,
          shipping_name VARCHAR(200) DEFAULT NULL,
          shipping_phone VARCHAR(20) DEFAULT NULL,
          shipping_address1 VARCHAR(500) DEFAULT NULL,
          shipping_city VARCHAR(100) DEFAULT NULL,
          shipping_state VARCHAR(100) DEFAULT NULL,
          shipping_pincode VARCHAR(10) DEFAULT NULL,
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
          INDEX idx_user (user_id),
          INDEX idx_status (status)
        ) ENGINE=InnoDB
      `);
      console.log("✅ printing_orders table created (self-heal)");
    } else {
      // Ensure status ENUM includes 'confirmed' (added for mixed-order flow)
      const [colRows] = await conn.query(
        `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'printing_orders' AND COLUMN_NAME = 'status'`
      );
      if (colRows.length > 0 && !colRows[0].COLUMN_TYPE.includes("'confirmed'")) {
        await conn.query(
          `ALTER TABLE printing_orders MODIFY COLUMN status ENUM('pending','confirmed','reviewing','in_production','printing','quality_check','shipped','delivered','cancelled') DEFAULT 'confirmed'`
        );
        console.log("✅ printing_orders.status ENUM updated to include 'confirmed'");
      }
      // Migrate any existing pending rows to confirmed
      await conn.query(`UPDATE printing_orders SET status = 'confirmed' WHERE status = 'pending'`);
      // Time-based charge columns (rate chart: Final = material + time)
      try {
        if (!(await columnExists(conn, "printing_orders", "print_time_hours"))) {
          await conn.query("ALTER TABLE `printing_orders` ADD COLUMN `print_time_hours` DECIMAL(10,2) NULL AFTER `estimated_weight`");
        }
        if (!(await columnExists(conn, "printing_orders", "time_cost"))) {
          await conn.query("ALTER TABLE `printing_orders` ADD COLUMN `time_cost` DECIMAL(10,2) DEFAULT 0.00 AFTER `material_cost`");
        }
      } catch (e) {
        if (!warned) console.warn("⚠️ Could not add printing_orders time columns:", e.message);
      }
    }
  } catch (e) {
    if (!warned) console.warn("⚠️ Could not ensure printing_orders table:", e.message);
  }
};

const ensurePrintPricingSeed = async (conn) => {
  try {
    const [sTables] = await conn.query(
      `SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'site_settings' LIMIT 1`
    );
    if (sTables.length > 0) {
      for (const [key, value, type, desc] of PRINT_SETTINGS_SEED) {
        try {
          await conn.query(
            `INSERT INTO site_settings (setting_key, setting_value, setting_type, description) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE setting_value = IF(setting_value IS NULL OR setting_value = '', VALUES(setting_value), setting_value)`,
            [key, value, type, desc]
          );
        } catch {}
      }
    }
    const [mTables] = await conn.query(
      `SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'printing_materials' LIMIT 1`
    );
    if (mTables.length > 0) {
      for (const [name, slug, code, description, price, density, bestFor, sort] of PRINT_RATE_SEED) {
        try {
          await conn.query(
            `INSERT INTO printing_materials (name, slug, code, description, price_per_gram, density_g_cm3, best_for, sort_order, is_active)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
             ON DUPLICATE KEY UPDATE price_per_gram = VALUES(price_per_gram), density_g_cm3 = VALUES(density_g_cm3), best_for = VALUES(best_for), code = VALUES(code), description = VALUES(description)`,
            [name, slug, code, description, price, density, bestFor, sort]
          );
        } catch {}
      }
    }
  } catch (e) {
    if (!warned) console.warn("⚠️ Could not seed print pricing:", e.message);
  }
};

const ensurePrintCartSchema = async () => {
  if (ensurePromise) return ensurePromise;
  ensurePromise = (async () => {
    try {
      const conn = await db.getConnection();
      try {
        await ensureTable(conn, "cart_items", true);
        await ensureTable(conn, "order_items", false);
        await ensurePrintOrdersTable(conn);
        await ensurePrintPricingSeed(conn);
        // Track last login for the admin Users table (old DBs lack the column).
        try {
          if (!(await columnExists(conn, "users", "last_login"))) {
            await conn.query("ALTER TABLE `users` ADD COLUMN `last_login` TIMESTAMP NULL DEFAULT NULL");
          }
        } catch (e) {
          if (!warned) console.warn("⚠️ Could not add users.last_login:", e.message);
        }
        // Every product with gallery images needs exactly one primary image —
        // storefront cards read only `primary_image`, so without this they
        // fall back to the dummy even when gallery photos exist.
        try {
          await conn.query(`
            UPDATE product_images SET is_primary = 1 WHERE id IN (
              SELECT first_id FROM (
                SELECT MIN(pi.id) AS first_id FROM product_images pi
                LEFT JOIN product_images prim ON prim.product_id = pi.product_id AND prim.is_primary = 1
                WHERE prim.id IS NULL GROUP BY pi.product_id
              ) t
            )`);
        } catch (e) {
          if (!warned) console.warn("⚠️ Could not backfill primary product images:", e.message);
        }
      } finally {
        conn.release();
      }
    } catch (e) {
      if (!warned) {
        warned = true;
        console.warn("⚠️ print-cart schema check skipped:", e.message);
      }
    }
  })();
  return ensurePromise;
};

// Fire-and-forget on require so fresh deploys self-heal without manual SQL.
ensurePrintCartSchema().catch(() => {});

module.exports = { ensurePrintCartSchema, CART_PRINT_COLUMNS };
