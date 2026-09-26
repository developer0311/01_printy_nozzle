const db = require("../config/db");

/**
 * Self-healing migration for "Pay with QR" (UPI QR + payment screenshot).
 *
 * - Adds 'qr' to orders.payment_method / printing_orders.payment_method ENUMs
 * - Adds payment_screenshot_url columns (customer's UPI payment proof)
 * - Seeds site_settings keys: qr_upi_id, qr_payee_name, qr_image_url
 *
 * Idempotent — safe to call on every request / startup.
 */

const QR_SETTINGS_SEED = [
  ["qr_upi_id", "ashitrajbanshi447-3@okicici", "string", "UPI ID shown on the checkout QR payment option"],
  ["qr_payee_name", "Ashit Rajbanshi", "string", "Payee name shown on the checkout QR payment option"],
  ["qr_image_url", "", "string", "Merchant QR code image URL (uploaded from Admin Settings)"],
];

let warned = false;

const columnExists = async (conn, table, column) => {
  const [rows] = await conn.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [table, column]
  );
  return rows.length > 0;
};

const enumHasQr = async (conn, table) => {
  try {
    const [rows] = await conn.query(
      `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'payment_method'`,
      [table]
    );
    if (!rows.length) return true; // table/column missing — nothing to do
    return String(rows[0].COLUMN_TYPE).includes("'qr'");
  } catch {
    return true;
  }
};

const ensureQrPaymentSchema = async () => {
  try {
    const conn = await db.getConnection();
    try {
      for (const table of ["orders", "printing_orders"]) {
        try {
          const [tables] = await conn.query(
            `SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`,
            [table]
          );
          if (!tables.length) continue;
          if (!(await enumHasQr(conn, table))) {
            await conn.query(
              `ALTER TABLE \`${table}\` MODIFY COLUMN \`payment_method\` ENUM('upi', 'card', 'net_banking', 'wallet', 'cod', 'qr') DEFAULT 'cod'`
            );
            console.log(`✅ ${table}.payment_method ENUM now includes 'qr'`);
          }
          if (!(await columnExists(conn, table, "payment_screenshot_url"))) {
            await conn.query(
              `ALTER TABLE \`${table}\` ADD COLUMN \`payment_screenshot_url\` VARCHAR(500) NULL AFTER \`payment_status\``
            );
            console.log(`✅ ${table}.payment_screenshot_url column added`);
          }
        } catch (e) {
          if (!warned) console.warn(`⚠️ QR schema check skipped for ${table}:`, e.message);
        }
      }

      try {
        const [sTables] = await conn.query(
          `SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'site_settings' LIMIT 1`
        );
        if (sTables.length > 0) {
          for (const [key, value, type, desc] of QR_SETTINGS_SEED) {
            try {
              // Never overwrite a value the admin already saved — only fill
              // empty slots (qr_upi_id / qr_image_url start empty by design).
              await conn.query(
                `INSERT INTO site_settings (setting_key, setting_value, setting_type, description) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE description = VALUES(description), setting_value = IF(setting_value IS NULL OR setting_value = '', VALUES(setting_value), setting_value)`,
                [key, value, type, desc]
              );
            } catch {}
          }
        }
      } catch (e) {
        if (!warned) console.warn("⚠️ QR settings seed skipped:", e.message);
      }
    } finally {
      conn.release();
    }
  } catch (e) {
    if (!warned) {
      warned = true;
      console.warn("⚠️ QR payment schema check skipped:", e.message);
    }
  }
};

// Fire-and-forget on require so fresh deploys self-heal without manual SQL.
ensureQrPaymentSchema().catch(() => {});

module.exports = { ensureQrPaymentSchema };
