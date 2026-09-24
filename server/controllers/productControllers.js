const db = require("../config/db");

/* ===================== HELPER: PARSE JSON SAFELY ===================== */
const safeJsonParse = (val, fallback = null) => {
  if (!val) return fallback;
  if (typeof val === "object") return val;
  try {
    return JSON.parse(val);
  } catch (e) {
    return fallback;
  }
};

/* ===================== GET ALL PRODUCTS (CATALOG) ===================== */
const getAllProducts = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 12,
      category,
      brand,
      minPrice,
      maxPrice,
      rating,
      sort = "newest",
      featured,
      bestseller,
      search,
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    let whereClauses = ["p.is_active = 1"];
    let params = [];

    if (category) {
      whereClauses.push("(c.slug = ? OR p.category_id = ?)");
      params.push(category, category);
    }

    if (brand) {
      whereClauses.push("(b.slug = ? OR p.brand_id = ?)");
      params.push(brand, brand);
    }

    if (minPrice) {
      whereClauses.push("p.price >= ?");
      params.push(parseFloat(minPrice));
    }

    if (maxPrice) {
      whereClauses.push("p.price <= ?");
      params.push(parseFloat(maxPrice));
    }

    if (rating) {
      whereClauses.push("p.avg_rating >= ?");
      params.push(parseFloat(rating));
    }

    if (featured === "true" || featured === "1") {
      whereClauses.push("p.is_featured = 1");
    }

    if (bestseller === "true" || bestseller === "1") {
      whereClauses.push("p.is_bestseller = 1");
    }

    if (search) {
      whereClauses.push("(p.name LIKE ? OR p.description LIKE ? OR p.tags LIKE ?)");
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    let orderBy = "p.id DESC";
    if (sort === "price_asc" || sort === "price_low") orderBy = "p.price ASC";
    else if (sort === "price_desc" || sort === "price_high") orderBy = "p.price DESC";
    else if (sort === "popular" || sort === "bestselling") orderBy = "p.total_sold DESC";
    else if (sort === "rating") orderBy = "p.avg_rating DESC";
    else if (sort === "name_asc") orderBy = "p.name ASC";

    const whereSql = whereClauses.join(" AND ");

    // Count
    const [countResult] = await db.query(
      `SELECT COUNT(*) as total 
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       LEFT JOIN brands b ON p.brand_id = b.id
       WHERE ${whereSql}`,
      params
    );
    const total = countResult[0].total;

    // Rows
    const [products] = await db.query(
      `SELECT p.id, p.name, p.slug, p.tagline, p.badge, p.short_description, 
              p.price, p.compare_price, p.stock, p.avg_rating, p.review_count,
              p.is_bestseller, p.is_featured, p.is_new,
              c.name as category_name, c.slug as category_slug,
              b.name as brand_name,
              (SELECT image_url FROM product_images WHERE product_id = p.id AND is_primary = 1 LIMIT 1) as primary_image,
              CASE 
                WHEN p.compare_price > p.price 
                THEN ROUND(((p.compare_price - p.price) / p.compare_price) * 100)
                ELSE 0 
              END as discount_percent
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       LEFT JOIN brands b ON p.brand_id = b.id
       WHERE ${whereSql}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    return res.status(200).json({
      success: true,
      products,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("Get all products error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ===================== GET PRODUCT BY ID OR SLUG (DETAIL PAGE) ===================== */
const getProductById = async (req, res) => {
  try {
    const { id } = req.params;

    // Support lookup by either numeric ID or slug (e.g. esp32-devkit-v1)
    const isNumeric = !isNaN(id) && !isNaN(parseFloat(id));
    const queryField = isNumeric ? "p.id = ?" : "p.slug = ?";

    const [products] = await db.query(
      `SELECT p.*,
              c.id as category_id, c.name as category_name, c.slug as category_slug,
              b.id as brand_id, b.name as brand_name, b.logo_url as brand_logo,
              CASE 
                WHEN p.compare_price > p.price 
                THEN ROUND(((p.compare_price - p.price) / p.compare_price) * 100)
                ELSE 0 
              END as discount_percent,
              (p.stock > 0) as is_in_stock
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       LEFT JOIN brands b ON p.brand_id = b.id
       WHERE ${queryField} AND p.is_active = 1`,
      [id]
    );

    if (products.length === 0) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    const product = products[0];

    // Parse JSON fields
    product.highlights = safeJsonParse(product.highlights, []);
    product.key_features = safeJsonParse(product.key_features, []);
    product.specifications = safeJsonParse(product.specifications, {});
    product.resources = safeJsonParse(product.resources, []);
    product.faqs = safeJsonParse(product.faqs, []);
    product.applications = safeJsonParse(product.applications, []);
    product.trust_badges = safeJsonParse(product.trust_badges, [
      "Original & High Quality",
      "Tested Before Shipping",
      "7 Days Easy Returns",
      "Fast Delivery Across India"
    ]);

    // Product Images
    const [images] = await db.query(
      "SELECT id, image_url, alt_text, is_primary, sort_order FROM product_images WHERE product_id = ? ORDER BY is_primary DESC, sort_order ASC",
      [product.id]
    );
    product.images = images;
    product.primary_image = images.length > 0 ? (images.find(img => img.is_primary) || images[0]).image_url : null;

    // Product Variants
    const [variants] = await db.query(
      "SELECT id, variant_name, variant_value, price_adjustment, stock, sku FROM product_variants WHERE product_id = ? AND is_active = 1",
      [product.id]
    );
    product.variants = variants;

    // Breadcrumbs
    product.breadcrumbs = [
      { label: "Home", url: "/" },
      { label: "Products", url: "/products" },
      { label: product.category_name || "Catalog", url: `/products/category/${product.category_slug || ""}` },
      { label: product.name, url: `/products/${product.slug}` },
    ];

    // Reviews Breakdown & Distribution
    const [reviewStats] = await db.query(
      `SELECT 
         COUNT(*) as total_reviews,
         COALESCE(AVG(rating), 0) as avg_rating,
         SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END) as count_5,
         SUM(CASE WHEN rating = 4 THEN 1 ELSE 0 END) as count_4,
         SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END) as count_3,
         SUM(CASE WHEN rating = 2 THEN 1 ELSE 0 END) as count_2,
         SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) as count_1
       FROM reviews
       WHERE product_id = ? AND is_visible = 1`,
      [product.id]
    );

    const stats = reviewStats[0];
    const totalRev = Number(stats.total_reviews) || 0;

    product.rating_breakdown = {
      avg_rating: Number(stats.avg_rating).toFixed(1),
      total_reviews: totalRev,
      distribution: {
        5: { count: Number(stats.count_5) || 0, percentage: totalRev ? Math.round((stats.count_5 / totalRev) * 100) : 0 },
        4: { count: Number(stats.count_4) || 0, percentage: totalRev ? Math.round((stats.count_4 / totalRev) * 100) : 0 },
        3: { count: Number(stats.count_3) || 0, percentage: totalRev ? Math.round((stats.count_3 / totalRev) * 100) : 0 },
        2: { count: Number(stats.count_2) || 0, percentage: totalRev ? Math.round((stats.count_2 / totalRev) * 100) : 0 },
        1: { count: Number(stats.count_1) || 0, percentage: totalRev ? Math.round((stats.count_1 / totalRev) * 100) : 0 },
      },
    };

    // Recent 5 Reviews
    const [recentReviews] = await db.query(
      `SELECT r.id, r.rating, r.title, r.comment, r.is_verified_purchase, r.created_at,
              u.first_name, u.last_name, u.avatar_url
       FROM reviews r
       JOIN users u ON r.user_id = u.id
       WHERE r.product_id = ? AND r.is_visible = 1
       ORDER BY r.created_at DESC
       LIMIT 5`,
      [product.id]
    );
    product.recent_reviews = recentReviews;

    // Related Products (in same category or brand)
    const [relatedProducts] = await db.query(
      `SELECT p.id, p.name, p.slug, p.tagline, p.price, p.compare_price, p.avg_rating, p.review_count,
              (SELECT image_url FROM product_images WHERE product_id = p.id AND is_primary = 1 LIMIT 1) as primary_image,
              CASE 
                WHEN p.compare_price > p.price 
                THEN ROUND(((p.compare_price - p.price) / p.compare_price) * 100)
                ELSE 0 
              END as discount_percent
       FROM products p
       WHERE p.category_id = ? AND p.id != ? AND p.is_active = 1
       ORDER BY p.total_sold DESC, p.avg_rating DESC
       LIMIT 6`,
      [product.category_id || 1, product.id]
    );
    product.related_products = relatedProducts;

    return res.status(200).json({
      success: true,
      product,
    });
  } catch (error) {
    console.error("Get product by ID/slug error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ===================== CHECK PINCODE DELIVERY AVAILABILITY ===================== */
const checkDeliveryPincode = async (req, res) => {
  try {
    const { pincode } = req.body.pincode ? req.body : req.params;

    if (!pincode || pincode.trim().length !== 6 || isNaN(pincode)) {
      return res.status(400).json({
        success: false,
        is_serviceable: false,
        message: "Please enter a valid 6-digit Indian PIN code",
      });
    }

    const cleanPin = pincode.trim();

    const [pins] = await db.query(
      "SELECT * FROM serviceable_pincodes WHERE pincode = ? AND is_serviceable = 1",
      [cleanPin]
    );

    if (pins.length > 0) {
      const pinData = pins[0];
      return res.status(200).json({
        success: true,
        pincode: cleanPin,
        is_serviceable: true,
        city: pinData.city,
        state: pinData.state,
        estimated_delivery: pinData.estimated_days || "3 - 5 working days",
        cod_available: Boolean(pinData.cod_available),
        express_available: Boolean(pinData.express_available),
        message: `Usually delivers in ${pinData.estimated_days || "3 - 5 working days"} to ${pinData.city}`,
      });
    }

    // Every valid 6-digit PIN code is deliverable across India.
    // Known pincodes get their city-specific ETA; all others fall back
    // to the standard delivery window instead of being rejected.
    return res.status(200).json({
      success: true,
      pincode: cleanPin,
      is_serviceable: true,
      estimated_delivery: "3 - 5 working days",
      cod_available: true,
      express_available: true,
      message: `Great! PIN code ${cleanPin} is serviceable for Fast Delivery!`,
    });
  } catch (error) {
    console.error("Check pincode delivery error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ===================== GET PRODUCTS BY CATEGORY ===================== */
const getProductsByCategory = async (req, res) => {
  try {
    const { slug } = req.params;
    const { page = 1, limit = 12, sort = "newest" } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const [categories] = await db.query("SELECT * FROM categories WHERE slug = ? AND is_active = 1", [slug]);
    if (categories.length === 0) {
      return res.status(404).json({ success: false, message: "Category not found" });
    }

    const category = categories[0];

    let orderBy = "p.created_at DESC";
    if (sort === "price_low") orderBy = "p.price ASC";
    else if (sort === "price_high") orderBy = "p.price DESC";
    else if (sort === "popular") orderBy = "p.total_sold DESC";
    else if (sort === "rating") orderBy = "p.avg_rating DESC";

    const [countResult] = await db.query(
      "SELECT COUNT(*) as total FROM products WHERE category_id = ? AND is_active = 1",
      [category.id]
    );

    const [products] = await db.query(
      `SELECT p.id, p.name, p.slug, p.tagline, p.badge, p.short_description, p.price, p.compare_price,
              p.stock, p.avg_rating, p.review_count, p.is_bestseller, p.is_new,
              (SELECT image_url FROM product_images WHERE product_id = p.id AND is_primary = 1 LIMIT 1) as primary_image,
              CASE 
                WHEN p.compare_price > p.price 
                THEN ROUND(((p.compare_price - p.price) / p.compare_price) * 100)
                ELSE 0 
              END as discount_percent
       FROM products p
       WHERE p.category_id = ? AND p.is_active = 1
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`,
      [category.id, parseInt(limit), offset]
    );

    return res.status(200).json({
      success: true,
      category,
      products,
      pagination: {
        total: countResult[0].total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(countResult[0].total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("Get products by category error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ===================== SEARCH PRODUCTS ===================== */
const searchProducts = async (req, res) => {
  try {
    const { q, page = 1, limit = 12 } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({ success: false, message: "Search query must be at least 2 characters" });
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const searchTerm = `%${q.trim()}%`;

    const [countResult] = await db.query(
      "SELECT COUNT(*) as total FROM products WHERE is_active = 1 AND (name LIKE ? OR description LIKE ? OR tags LIKE ?)",
      [searchTerm, searchTerm, searchTerm]
    );

    const [products] = await db.query(
      `SELECT p.id, p.name, p.slug, p.tagline, p.short_description, p.price, p.compare_price,
              p.stock, p.avg_rating, p.review_count,
              c.name as category_name,
              (SELECT image_url FROM product_images WHERE product_id = p.id AND is_primary = 1 LIMIT 1) as primary_image
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.is_active = 1 AND (p.name LIKE ? OR p.description LIKE ? OR p.tags LIKE ?)
       ORDER BY p.total_sold DESC
       LIMIT ? OFFSET ?`,
      [searchTerm, searchTerm, searchTerm, parseInt(limit), offset]
    );

    return res.status(200).json({
      success: true,
      query: q.trim(),
      products,
      pagination: {
        total: countResult[0].total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(countResult[0].total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("Search products error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ===================== BEST SELLERS MENU (NAVBAR MEGA MENU) =====================
   Top 6 best-selling categories with top 6 best-selling products each.
   Fully automatic — ranked by actual user orders via products.total_sold,
   which is incremented on every order placement and decremented on cancel. */
const getBestSellersMenu = async (req, res) => {
  try {
    // Top 6 categories by total units sold (fallback to product count so the
    // menu is never empty on a fresh store with zero orders).
    const [categories] = await db.query(
      `SELECT c.id, c.name, c.slug, c.image_url,
              COALESCE(SUM(p.total_sold), 0) AS units_sold,
              COUNT(p.id) AS product_count
       FROM categories c
       LEFT JOIN products p ON p.category_id = c.id AND p.is_active = 1
       WHERE c.is_active = 1
       GROUP BY c.id, c.name, c.slug, c.image_url
       ORDER BY units_sold DESC, product_count DESC, c.sort_order ASC
       LIMIT 6`
    );

    if (categories.length === 0) {
      return res.status(200).json({ success: true, categories: [] });
    }

    // Top 6 products per category by units sold (automatic from orders).
    const categoriesWithProducts = await Promise.all(
      categories.map(async (cat) => {
        const [products] = await db.query(
          `SELECT p.id, p.name, p.slug, p.price, p.compare_price,
                  p.avg_rating, p.review_count, p.total_sold,
                  c.name AS category_name, c.slug AS category_slug,
                  (SELECT image_url FROM product_images WHERE product_id = p.id AND is_primary = 1 LIMIT 1) AS primary_image,
                  CASE
                    WHEN p.compare_price > p.price
                    THEN ROUND(((p.compare_price - p.price) / p.compare_price) * 100)
                    ELSE 0
                  END AS discount_percent
           FROM products p
           LEFT JOIN categories c ON p.category_id = c.id
           WHERE p.category_id = ? AND p.is_active = 1
           ORDER BY p.total_sold DESC, p.avg_rating DESC, p.id DESC
           LIMIT 6`,
          [cat.id]
        );
        return {
          id: cat.id,
          name: cat.name,
          slug: cat.slug,
          image_url: cat.image_url,
          units_sold: Number(cat.units_sold) || 0,
          product_count: Number(cat.product_count) || 0,
          products,
        };
      })
    );

    return res.status(200).json({ success: true, categories: categoriesWithProducts });
  } catch (error) {
    console.error("Get best sellers menu error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = {
  getAllProducts,
  getProductById,
  checkDeliveryPincode,
  getProductsByCategory,
  searchProducts,
  getBestSellersMenu,
};
