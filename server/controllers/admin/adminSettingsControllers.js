const db = require("../../config/db");
const { uploadFile, deleteFile } = require("../../utils/cloudinaryUploader");

/* ===================== GET SITE SETTINGS ===================== */
const getSiteSettings = async (req, res) => {
  try {
    const [settings] = await db.query("SELECT * FROM site_settings");
    const settingsMap = {};
    settings.forEach((s) => {
      settingsMap[s.setting_key] = s.setting_value;
    });

    return res.status(200).json({ success: true, data: settingsMap });
  } catch (error) {
    console.error("Admin getSiteSettings error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ===================== UPDATE SITE SETTINGS ===================== */
const updateSiteSettings = async (req, res) => {
  try {
    const settings = req.body; // e.g. { free_shipping_threshold: "500", gst_rate: "18", ... }

    for (const [key, value] of Object.entries(settings)) {
      await db.query(
        "INSERT INTO site_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = ?",
        [key, String(value), String(value)]
      );
    }

    return res.status(200).json({ success: true, message: "Settings updated successfully" });
  } catch (error) {
    console.error("Admin updateSiteSettings error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ===================== HERO BANNERS MANAGEMENT ===================== */
const getAllHeroBanners = async (req, res) => {
  try {
    const [banners] = await db.query("SELECT * FROM hero_banners ORDER BY sort_order ASC");
    return res.status(200).json({ success: true, data: banners });
  } catch (error) {
    console.error("Admin getAllHeroBanners error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const createHeroBanner = async (req, res) => {
  try {
    const { title, subtitle, link_url, button_text, sort_order, is_active } = req.body;

    if (!req.file) {
      return res.status(400).json({ success: false, message: "Banner image is required" });
    }

const uploadRes = await uploadFile(req.file, "banners", "image");

    const [result] = await db.query(
      `INSERT INTO hero_banners (title, subtitle, image_url, public_id, link_url, button_text, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        title || null,
        subtitle || null,
        uploadRes.secure_url,
        uploadRes.public_id || null,
        link_url || null,
        button_text || "Shop Now",
        sort_order || 0,
        is_active !== undefined ? (is_active ? 1 : 0) : 1,
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Hero banner created",
      data: { bannerId: result.insertId, image_url: uploadRes.secure_url },
    });
  } catch (error) {
    console.error("Admin createHeroBanner error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const updateHeroBanner = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, subtitle, link_url, button_text, sort_order, is_active } = req.body;

    let imageUrl = undefined;
    if (req.file) {
      const uploadRes = await uploadFile(req.file, "banners", "image");
      imageUrl = uploadRes.secure_url;
    }

    const [result] = await db.query(
      `UPDATE hero_banners SET
         title = ?,
         subtitle = ?,
         image_url = COALESCE(?, image_url),
         link_url = ?,
         button_text = ?,
         sort_order = COALESCE(?, sort_order),
         is_active = COALESCE(?, is_active)
       WHERE id = ?`,
      [
        title !== undefined ? title : null,
        subtitle !== undefined ? subtitle : null,
        imageUrl || null,
        link_url !== undefined ? link_url : null,
        button_text !== undefined ? button_text : null,
        sort_order !== undefined ? sort_order : null,
        is_active !== undefined ? (is_active ? 1 : 0) : null,
        id,
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Banner not found" });
    }

    return res.status(200).json({ success: true, message: "Banner updated successfully" });
  } catch (error) {
    console.error("Admin updateHeroBanner error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const deleteHeroBanner = async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await db.query("DELETE FROM hero_banners WHERE id = ?", [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Banner not found" });
    }

    return res.status(200).json({ success: true, message: "Banner deleted successfully" });
  } catch (error) {
    console.error("Admin deleteHeroBanner error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ===================== QR IMAGE UPLOAD (ADMIN) =====================
 * POST /api/admin/settings/qr-image (multipart, field "image")
 * Uploads the merchant UPI QR code and stores its URL in site_settings. */
const uploadQrImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "QR image is required" });
    }

    const uploadRes = await uploadFile(req.file, "printynozzle/settings", "image");

    await db.query(
      "INSERT INTO site_settings (setting_key, setting_value, setting_type, description) VALUES ('qr_image_url', ?, 'string', 'Merchant QR code image URL (uploaded from Admin Settings)') ON DUPLICATE KEY UPDATE setting_value = ?",
      [uploadRes.secure_url, uploadRes.secure_url]
    );

    return res.status(200).json({
      success: true,
      message: "QR code updated",
      data: { image_url: uploadRes.secure_url },
    });
  } catch (error) {
    console.error("Admin uploadQrImage error:", error);
    return res.status(500).json({ success: false, message: "QR upload failed" });
  }
};

module.exports = {
  getSiteSettings,
  updateSiteSettings,
  uploadQrImage,
  getAllHeroBanners,
  createHeroBanner,
  updateHeroBanner,
  deleteHeroBanner,
};
