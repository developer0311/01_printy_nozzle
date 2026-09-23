const db = require("../config/db");

/**
 * GET /api/coupons/announcement (public)
 *
 * Returns the single coupon featured for the announcement bar, or
 * { coupon: null } when none is featured / valid. Never errors —
 * the navbar falls back to the default shipping text.
 */
const getAnnouncementCoupon = async (req, res) => {
  try {
    let rows = [];
    try {
      [rows] = await db.query(
        `SELECT code, description, discount_type, discount_value, min_order_amount
         FROM coupons
         WHERE is_active = 1 AND show_in_announcement = 1
           AND (valid_from IS NULL OR valid_from <= NOW())
           AND (valid_until IS NULL OR valid_until > NOW())
           AND (usage_limit IS NULL OR used_count < usage_limit)
         ORDER BY id DESC
         LIMIT 1`
      );
    } catch (e) {
      // Legacy DB without the flag column (or any query hiccup) → no feature.
      if (e && (e.code === "ER_BAD_FIELD_ERROR" || /Unknown column/i.test(e.message || ""))) {
        return res.status(200).json({ success: true, coupon: null });
      }
      throw e;
    }

    if (!rows.length) {
      return res.status(200).json({ success: true, coupon: null });
    }

    const c = rows[0];
    const value = Number(c.discount_value || 0);
    const offer =
      c.discount_type === "percentage" ? `Flat ${value}% OFF` : `Flat Rs. ${value} OFF`;
    const min = Number(c.min_order_amount || 0);
    const text = c.description && String(c.description).trim()
      ? String(c.description).trim()
      : `${offer}${min > 0 ? ` on orders above Rs. ${min.toLocaleString("en-IN")}` : ""}`;

    return res.status(200).json({
      success: true,
      coupon: { code: c.code, text },
    });
  } catch (error) {
    console.error("Get announcement coupon error:", error);
    return res.status(200).json({ success: true, coupon: null });
  }
};

module.exports = { getAnnouncementCoupon };
