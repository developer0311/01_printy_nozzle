const db = require("../config/db");

/* ===================== GET HOME DATA ===================== */
const getHomeData = async (req, res) => {
  try {
    // Hero Banners
    const [banners] = await db.query(
      "SELECT * FROM hero_banners WHERE is_active = 1 ORDER BY sort_order ASC"
    );

    // Categories with images (all active categories display on the storefront)
    const [categories] = await db.query(
      `SELECT c.id, c.name, c.slug, c.image_url,
              (SELECT COUNT(*) FROM products WHERE category_id = c.id AND is_active = 1) as product_count
       FROM categories c
       WHERE c.is_active = 1
       ORDER BY c.sort_order ASC, c.name ASC`
    );

    // Featured / Popular Products
    const [popularProducts] = await db.query(
      `SELECT p.id, p.name, p.slug, p.price, p.compare_price, p.avg_rating, p.review_count,
              p.is_bestseller, p.is_new,
              c.name as category_name,
              (SELECT image_url FROM product_images WHERE product_id = p.id AND is_primary = 1 LIMIT 1) as primary_image
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.is_active = 1 AND (p.is_featured = 1 OR p.is_bestseller = 1)
       ORDER BY p.total_sold DESC
       LIMIT 8`
    );

    // New Arrivals
    const [newArrivals] = await db.query(
      `SELECT p.id, p.name, p.slug, p.price, p.compare_price, p.avg_rating, p.review_count,
              (SELECT image_url FROM product_images WHERE product_id = p.id AND is_primary = 1 LIMIT 1) as primary_image
       FROM products p
       WHERE p.is_active = 1 AND p.is_new = 1
       ORDER BY p.created_at DESC
       LIMIT 6`
    );

    // Site Settings
    const [settings] = await db.query(
      "SELECT setting_key, setting_value FROM site_settings WHERE setting_key IN ('site_name', 'site_tagline', 'support_email', 'support_phone', 'free_shipping_threshold', 'gst_rate')"
    );

    const siteSettings = {};
    settings.forEach((s) => (siteSettings[s.setting_key] = s.setting_value));

    // 3D Printing Materials (for homepage section)
    const [materials] = await db.query(
      "SELECT id, name, slug, description, price_per_gram, best_for FROM printing_materials WHERE is_active = 1 ORDER BY sort_order ASC"
    );

    return res.status(200).json({
      success: true,
      data: {
        banners,
        categories,
        popularProducts,
        newArrivals,
        siteSettings,
        printingMaterials: materials,
      },
    });
  } catch (error) {
    console.error("Get home data error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = { getHomeData };
