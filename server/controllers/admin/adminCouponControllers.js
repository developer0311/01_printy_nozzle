const db = require("../../config/db");

/* Whether the announcement-bar column exists (legacy DBs may lack it). */
const hasAnnouncementColumn = async () => {
  try {
    const [rows] = await db.query(
      `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'coupons' AND COLUMN_NAME = 'show_in_announcement' LIMIT 1`
    );
    return rows.length > 0;
  } catch {
    return false;
  }
};

/* One coupon on the announcement bar at a time — featuring one clears the rest. */
const featureInAnnouncement = async (id = null) => {
  if (id === null || id === undefined) {
    await db.query("UPDATE coupons SET show_in_announcement = 0");
  } else {
    await db.query("UPDATE coupons SET show_in_announcement = 0 WHERE id <> ?", [id]);
  }
};

/* ===================== GET ALL COUPONS ===================== */
const getAllCoupons = async (req, res) => {
  try {
    const [coupons] = await db.query("SELECT * FROM coupons ORDER BY id DESC");
    return res.status(200).json({ success: true, data: coupons });
  } catch (error) {
    console.error("Admin getAllCoupons error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ===================== CREATE COUPON ===================== */
const createCoupon = async (req, res) => {
  try {
    const {
      code,
      discount_type,
      discount_value,
      min_order_amount,
      max_discount,
      usage_limit,
      valid_from,
      valid_until,
      is_active,
      show_in_announcement,
    } = req.body;

    if (!code || !discount_type || !discount_value) {
      return res.status(400).json({
        success: false,
        message: "Coupon code, discount type, and discount value are required",
      });
    }

    const upperCode = code.trim().toUpperCase();

    const [existing] = await db.query("SELECT id FROM coupons WHERE code = ?", [upperCode]);
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: "Coupon code already exists" });
    }

    const announceCol = await hasAnnouncementColumn();

    const [result] = await db.query(
      `INSERT INTO coupons
       (code, discount_type, discount_value, min_order_amount, max_discount, usage_limit, valid_from, valid_until, is_active${announceCol ? ", show_in_announcement" : ""})
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?${announceCol ? ", ?" : ""})`,
      [
        upperCode,
        discount_type,
        discount_value,
        min_order_amount || 0,
        max_discount || null,
        usage_limit || null,
        valid_from || null,
        valid_until || null,
        is_active !== undefined ? (is_active ? 1 : 0) : 1,
        ...(announceCol ? [show_in_announcement ? 1 : 0] : []),
      ]
    );

    // One coupon on the announcement bar at a time.
    if (announceCol && show_in_announcement) {
      await featureInAnnouncement(result.insertId);
      await db.query("UPDATE coupons SET show_in_announcement = 1 WHERE id = ?", [result.insertId]);
    }

    return res.status(201).json({
      success: true,
      message: "Coupon created successfully",
      data: { couponId: result.insertId },
    });
  } catch (error) {
    console.error("Admin createCoupon error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ===================== UPDATE COUPON ===================== */
const updateCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      code,
      discount_type,
      discount_value,
      min_order_amount,
      max_discount,
      usage_limit,
      valid_from,
      valid_until,
      is_active,
      show_in_announcement,
    } = req.body;

    // `undefined` (key absent) = leave the column untouched.
    // `""` (cleared in the form) = store NULL — numeric/date columns reject ''.
    const toNumber = (v) => (v === "" || v === null ? null : Number(v));
    const assignments = [];
    const params = [];
    const keepIfNull = (col, value) => {
      assignments.push(`${col} = COALESCE(?, ${col})`);
      params.push(value);
    };
    const setDirect = (col, value) => {
      assignments.push(`${col} = ?`);
      params.push(value);
    };

    keepIfNull("code", code ? code.trim().toUpperCase() : null);
    keepIfNull("discount_type", discount_type || null);
    keepIfNull(
      "discount_value",
      discount_value === undefined ? null : toNumber(discount_value)
    );
    keepIfNull(
      "min_order_amount",
      min_order_amount === undefined ? null : toNumber(min_order_amount)
    );
    if (max_discount !== undefined) setDirect("max_discount", toNumber(max_discount));
    if (usage_limit !== undefined) {
      setDirect(
        "usage_limit",
        usage_limit === "" || usage_limit === null ? null : parseInt(usage_limit, 10)
      );
    }
    if (valid_from !== undefined) setDirect("valid_from", valid_from === "" ? null : valid_from);
    if (valid_until !== undefined) setDirect("valid_until", valid_until === "" ? null : valid_until);
    if (is_active !== undefined) setDirect("is_active", is_active ? 1 : 0);
    // Featuring a coupon clears the flag on every other coupon.
    if (show_in_announcement !== undefined && (await hasAnnouncementColumn())) {
      if (show_in_announcement) {
        await featureInAnnouncement(id);
        setDirect("show_in_announcement", 1);
      } else {
        setDirect("show_in_announcement", 0);
      }
    }

    if (params.some((p) => typeof p === "number" && Number.isNaN(p))) {
      return res.status(400).json({ success: false, message: "Numeric fields must contain valid numbers" });
    }

    if (assignments.length === 0) {
      return res.status(200).json({ success: true, message: "Coupon updated successfully" });
    }

    const [result] = await db.query(
      `UPDATE coupons SET ${assignments.join(", ")} WHERE id = ?`,
      [...params, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Coupon not found" });
    }

    return res.status(200).json({ success: true, message: "Coupon updated successfully" });
  } catch (error) {
    console.error("Admin updateCoupon error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ===================== DELETE COUPON ===================== */
const deleteCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await db.query("DELETE FROM coupons WHERE id = ?", [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Coupon not found" });
    }

    return res.status(200).json({ success: true, message: "Coupon deleted successfully" });
  } catch (error) {
    console.error("Admin deleteCoupon error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = {
  getAllCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
};
