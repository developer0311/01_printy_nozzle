const db = require("../config/db");

/**
 * Self-healing schema for the coupon announcement-bar feature.
 *
 * Adds `coupons.show_in_announcement` (only one coupon holds 1 at a time —
 * enforced by the admin coupon controllers, not by a DB constraint).
 *
 * Idempotent — safe to run on every boot. Failures are logged, never thrown.
 */

let ensurePromise = null;

const ensureCouponSchema = async () => {
  if (ensurePromise) return ensurePromise;
  ensurePromise = (async () => {
    try {
      const conn = await db.getConnection();
      try {
        const [tables] = await conn.query(
          "SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'coupons' LIMIT 1"
        );
        if (tables.length === 0) return;
        const [cols] = await conn.query(
          "SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'coupons' AND COLUMN_NAME = 'show_in_announcement' LIMIT 1"
        );
        if (cols.length === 0) {
          await conn.query(
            "ALTER TABLE `coupons` ADD COLUMN `show_in_announcement` TINYINT(1) NOT NULL DEFAULT 0"
          );
          console.log("✅ coupons.show_in_announcement column added");
        }
      } finally {
        conn.release();
      }
    } catch (e) {
      console.warn(`⚠️ coupon schema check skipped: ${e.message}`);
    }
  })();
  return ensurePromise;
};

// Fire-and-forget on require so fresh deploys self-heal without manual SQL.
ensureCouponSchema().catch(() => {});

module.exports = { ensureCouponSchema };
