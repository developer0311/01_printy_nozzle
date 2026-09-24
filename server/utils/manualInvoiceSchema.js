const db = require("../config/db");

/**
 * Self-healing schema for admin manual invoices (offline / phone orders).
 *
 * manual_invoices      — one row per saved invoice (header + totals).
 * manual_invoice_items — line items (products, custom 3D prints, custom rows).
 *
 * Idempotent — CREATE TABLE IF NOT EXISTS, safe to require on every boot.
 */

let ensurePromise = null;

const ensureManualInvoiceSchema = async () => {
  if (ensurePromise) return ensurePromise;
  ensurePromise = (async () => {
    try {
      const conn = await db.getConnection();
      try {
        await conn.query(`
          CREATE TABLE IF NOT EXISTS manual_invoices (
            id INT AUTO_INCREMENT PRIMARY KEY,
            invoice_number VARCHAR(50) DEFAULT NULL UNIQUE,
            invoice_date DATE DEFAULT NULL,
            sale_order VARCHAR(100) DEFAULT NULL,
            reference VARCHAR(100) DEFAULT NULL,
            customer_name VARCHAR(200) NOT NULL,
            customer_email VARCHAR(255) DEFAULT NULL,
            customer_phone VARCHAR(20) NOT NULL,
            billing_address1 VARCHAR(500) NOT NULL,
            billing_address2 VARCHAR(500) DEFAULT NULL,
            billing_city VARCHAR(100) NOT NULL,
            billing_state VARCHAR(100) NOT NULL,
            billing_pincode VARCHAR(10) NOT NULL,
            billing_country VARCHAR(100) DEFAULT 'India',
            shipping_same TINYINT(1) DEFAULT 1,
            shipping_name VARCHAR(200) DEFAULT NULL,
            shipping_email VARCHAR(255) DEFAULT NULL,
            shipping_phone VARCHAR(20) DEFAULT NULL,
            shipping_address1 VARCHAR(500) DEFAULT NULL,
            shipping_address2 VARCHAR(500) DEFAULT NULL,
            shipping_city VARCHAR(100) DEFAULT NULL,
            shipping_state VARCHAR(100) DEFAULT NULL,
            shipping_pincode VARCHAR(10) DEFAULT NULL,
            shipping_country VARCHAR(100) DEFAULT 'India',
            gst_rate DECIMAL(5,2) DEFAULT 18.00,
            subtotal DECIMAL(10,2) DEFAULT 0.00,
            tax_total DECIMAL(10,2) DEFAULT 0.00,
            discount DECIMAL(10,2) DEFAULT 0.00,
            shipping_cost DECIMAL(10,2) DEFAULT 0.00,
            grand_total DECIMAL(10,2) DEFAULT 0.00,
            delivery_option VARCHAR(20) DEFAULT 'standard',
            payment_method VARCHAR(100) DEFAULT 'Cash',
            payment_status VARCHAR(20) DEFAULT 'PAID',
            amount_in_words TEXT DEFAULT NULL,
            created_by INT DEFAULT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_manual_inv_number (invoice_number),
            INDEX idx_manual_inv_customer (customer_name),
            INDEX idx_manual_inv_created (created_at)
          ) ENGINE=InnoDB;
        `);

        await conn.query(`
          CREATE TABLE IF NOT EXISTS manual_invoice_items (
            id INT AUTO_INCREMENT PRIMARY KEY,
            invoice_id INT NOT NULL,
            item_type ENUM('product', 'print', 'custom') DEFAULT 'product',
            product_id INT DEFAULT NULL,
            description TEXT NOT NULL,
            hsn VARCHAR(50) DEFAULT NULL,
            rate DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            qty DECIMAL(10,2) NOT NULL DEFAULT 1.00,
            disc DECIMAL(10,2) DEFAULT 0.00,
            amount DECIMAL(10,2) DEFAULT 0.00,
            tax DECIMAL(10,2) DEFAULT 0.00,
            total DECIMAL(10,2) DEFAULT 0.00,
            file_name VARCHAR(300) DEFAULT NULL,
            material_name VARCHAR(100) DEFAULT NULL,
            color_name VARCHAR(100) DEFAULT NULL,
            infill_density INT DEFAULT NULL,
            surface_finish VARCHAR(20) DEFAULT NULL,
            sort_order INT DEFAULT 0,
            FOREIGN KEY (invoice_id) REFERENCES manual_invoices(id) ON DELETE CASCADE,
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
            INDEX idx_manual_item_invoice (invoice_id)
          ) ENGINE=InnoDB;
        `);

        console.log("🧾 Manual invoice tables ready");
      } finally {
        conn.release();
      }
    } catch (e) {
      console.warn(`⚠️ manual invoice schema check skipped: ${e.message}`);
    }
  })();
  return ensurePromise;
};

// Fire-and-forget on require so fresh deploys self-heal without manual SQL.
ensureManualInvoiceSchema().catch(() => {});

module.exports = { ensureManualInvoiceSchema };
