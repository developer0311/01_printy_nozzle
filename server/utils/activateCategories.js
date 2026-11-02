const db = require("../config/db");

/**
 * Self-healing migration: ensure every existing catalog category is active
 * (is_active = 1) so it displays on the user side storefront.
 *
 * New categories default to is_active = 1 via the table schema and the admin
 * "Active category" toggle is on by default in create/edit modals. This script
 * backfills categories that were created before the toggle existed or that were
 * accidentally deactivated, so they all show on the user side by default.
 *
 * Idempotent — safe to require on every boot.
 */

let ensurePromise = null;
let warned = false;

const ensureCategoriesActive = async () => {
  if (ensurePromise) return ensurePromise;
  ensurePromise = (async () => {
    try {
      const conn = await db.getConnection();
      try {
        // Ensure the is_active column exists (defensive for older installs).
        const [cols] = await conn.query(
          `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'categories' AND COLUMN_NAME = 'is_active' LIMIT 1`
        );
        if (!cols.length) {
          await conn.query("ALTER TABLE `categories` ADD COLUMN `is_active` TINYINT(1) DEFAULT 1");
          console.log("✅ categories.is_active column added");
        }

        // Activate every existing category so all of them display on the user side.
        const [result] = await conn.query("UPDATE `categories` SET `is_active` = 1");
        console.log(`✅ Categories activated: ${result.affectedRows} category(ies) set to is_active = 1`);
        console.log("🗂️  Categories ready for storefront display");
      } finally {
        conn.release();
      }
    } catch (e) {
      if (!warned) {
        warned = true;
        console.warn(`⚠️ activate categories migration skipped: ${e.message}`);
      }
    }
  })();
  return ensurePromise;
};

// Fire-and-forget on require so fresh deploys self-heal without manual SQL.
ensureCategoriesActive().catch(() => {});

module.exports = { ensureCategoriesActive };
