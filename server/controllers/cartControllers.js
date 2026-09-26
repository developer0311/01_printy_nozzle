const db = require("../config/db");
const { calculatePrintPrice } = require("../utils/priceCalculator");
const { calculateCouponTotals, round2 } = require("../utils/couponHelper");
const { ensurePrintCartSchema } = require("../utils/printCartSchema");

/* ============ helpers ============ */

const getStoreSettings = async (connOrDb) => {
  const [settings] = await (connOrDb || db).query(
    "SELECT setting_key, setting_value FROM site_settings WHERE setting_key IN ('free_shipping_threshold', 'gst_rate')"
  );
  const map = {};
  (settings || []).forEach((s) => (map[s.setting_key] = parseFloat(s.setting_value)));
  return {
    freeShippingThreshold: map.free_shipping_threshold || 999,
    gstRate: map.gst_rate || 18,
  };
};

// Print-aware cart items query. Falls back to product-only on old DBs.
const fetchCartRows = async (cartId) => {
  await ensurePrintCartSchema().catch(() => {});
  try {
    const [rows] = await db.query(
      `SELECT ci.id, ci.quantity, ci.product_id, ci.variant_id,
              ci.item_type, ci.unit_price as print_unit_price,
              ci.file_name, ci.file_url, ci.file_public_id, ci.file_size,
              ci.dimension_x, ci.dimension_y, ci.dimension_z,
              ci.material_id, ci.color_id, ci.custom_color_hex,
              ci.infill_density, ci.surface_finish, ci.estimated_weight,
              p.name, p.slug, p.price, p.compare_price, p.stock,
              pv.variant_name, pv.variant_value, pv.price_adjustment, pv.stock as variant_stock,
              (SELECT image_url FROM product_images WHERE product_id = p.id AND is_primary = 1 LIMIT 1) as image,
              c.name as category_name,
              pm.name as material_name, pm.price_per_gram,
              pc.name as color_name, pc.hex_code as color_hex
       FROM cart_items ci
       LEFT JOIN products p ON ci.product_id = p.id
       LEFT JOIN product_variants pv ON ci.variant_id = pv.id
       LEFT JOIN categories c ON p.category_id = c.id
       LEFT JOIN printing_materials pm ON ci.material_id = pm.id
       LEFT JOIN printing_colors pc ON ci.color_id = pc.id
       WHERE ci.cart_id = ?
       ORDER BY ci.created_at DESC`,
      [cartId]
    );
    return { rows, printAware: true };
  } catch (e) {
    // Old DB without print columns — fall back to legacy product-only query
    if (e && (e.code === "ER_BAD_FIELD_ERROR" || /Unknown column/i.test(e.message || ""))) {
      const [rows] = await db.query(
        `SELECT ci.id, ci.quantity, ci.product_id, ci.variant_id,
                p.name, p.slug, p.price, p.compare_price, p.stock,
                pv.variant_name, pv.variant_value, pv.price_adjustment, pv.stock as variant_stock,
                (SELECT image_url FROM product_images WHERE product_id = p.id AND is_primary = 1 LIMIT 1) as image,
                c.name as category_name
         FROM cart_items ci
         JOIN products p ON ci.product_id = p.id
         LEFT JOIN product_variants pv ON ci.variant_id = pv.id
         LEFT JOIN categories c ON p.category_id = c.id
         WHERE ci.cart_id = ?
         ORDER BY ci.created_at DESC`,
        [cartId]
      );
      return { rows, printAware: false };
    }
    throw e;
  }
};

const isPrintRow = (row) => row.item_type === "print" || row.product_id == null;

const mapCartRow = (row) => {
  const qty = Number(row.quantity || 1);
  if (isPrintRow(row)) {
    const unit = Number(row.print_unit_price || 0);
    const material = row.material_name || "3D Print";
    const colorLabel = row.color_name || row.custom_color_hex || "Custom";
    const infill = row.infill_density || 50;
    const finish = row.surface_finish === "smooth" ? "Smooth" : "Standard";
    const dims =
      row.dimension_x != null
        ? `${Number(row.dimension_x)}×${Number(row.dimension_y)}×${Number(row.dimension_z)} mm`
        : "";
    return {
      ...row,
      item_type: "print",
      is_print: true,
      name: row.file_name ? `3D Print — ${row.file_name}` : "Custom 3D Print",
      slug: null,
      category_name: "3D Printing",
      variant_value: `${material} • ${colorLabel} • ${infill}% • ${finish}`,
      subtitle: `${material} • ${colorLabel} • ${infill}%`,
      image: "/images/rocket.png",
      unit_price: unit,
      price: unit,
      total: round2(unit * qty),
      quantity: qty,
    };
  }
  const unit = Number(row.price || 0) + Number(row.price_adjustment || 0);
  return {
    ...row,
    item_type: row.item_type || "product",
    is_print: false,
    unit_price: unit,
    total: round2(unit * qty),
    quantity: qty,
  };
};

const getCartSubtotal = async (cartId) => {
  const { rows } = await fetchCartRows(cartId);
  let subtotal = 0;
  rows.forEach((r) => {
    const mapped = mapCartRow(r);
    subtotal += mapped.total;
  });
  return { rows, subtotal: round2(subtotal) };
};

/* ===================== GET CART ===================== */
const getCart = async (req, res) => {
  try {
    // Get or create cart
    let [carts] = await db.query("SELECT * FROM cart WHERE user_id = ?", [req.user.id]);

    if (carts.length === 0) {
      const [result] = await db.query("INSERT INTO cart (user_id) VALUES (?)", [req.user.id]);
      carts = [{ id: result.insertId, user_id: req.user.id, coupon_id: null }];
    }

    const cart = carts[0];
    const { rows } = await fetchCartRows(cart.id);
    const cartItems = rows.map(mapCartRow);
    const subtotal = round2(cartItems.reduce((s, it) => s + it.total, 0));

    // Get coupon if applied — discount is on FULL price incl. GST
    let coupon = null;
    let couponRow = null;
    if (cart.coupon_id) {
      const [coupons] = await db.query(
        "SELECT * FROM coupons WHERE id = ? AND is_active = 1 AND (valid_until IS NULL OR valid_until > NOW())",
        [cart.coupon_id]
      );
      if (coupons.length > 0) {
        couponRow = coupons[0];
        coupon = coupons[0];
      }
    }

    const { freeShippingThreshold, gstRate } = await getStoreSettings();
    const totals = calculateCouponTotals({ subtotal, gstRate, coupon: couponRow });

    const shippingFree = subtotal >= freeShippingThreshold;

    return res.status(200).json({
      success: true,
      cart: {
        id: cart.id,
        items: cartItems,
        itemCount: cartItems.length,
        subtotal: totals.subtotal,
        discount: totals.discount,
        shipping: shippingFree ? 0 : null, // null means not yet calculated (depends on option)
        shippingFree,
        freeShippingThreshold,
        taxAmount: totals.taxAmount,
        gstRate,
        // Total = (subtotal + GST) - discount (coupon applied over full incl-GST price)
        totalAmount: totals.totalAmount,
        coupon: coupon
          ? { id: coupon.id, code: coupon.code, discount_type: coupon.discount_type, discount_value: coupon.discount_value }
          : null,
      },
    });
  } catch (error) {
    console.error("Get cart error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ===================== ADD TO CART (products) ===================== */
const addToCart = async (req, res) => {
  try {
    await ensurePrintCartSchema().catch(() => {});
    const { product_id, variant_id, quantity = 1 } = req.body;

    if (!product_id) {
      return res.status(400).json({ success: false, message: "Product ID is required" });
    }

    // Verify product exists and is active
    const [products] = await db.query(
      "SELECT id, name, stock, price FROM products WHERE id = ? AND is_active = 1",
      [product_id]
    );

    if (products.length === 0) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    // Check stock
    const availableStock = variant_id
      ? (await db.query("SELECT stock FROM product_variants WHERE id = ?", [variant_id]))[0][0]?.stock || 0
      : products[0].stock;

    if (availableStock < quantity) {
      return res.status(400).json({ success: false, message: "Insufficient stock" });
    }

    // Get or create cart
    let [carts] = await db.query("SELECT id FROM cart WHERE user_id = ?", [req.user.id]);

    if (carts.length === 0) {
      const [result] = await db.query("INSERT INTO cart (user_id) VALUES (?)", [req.user.id]);
      carts = [{ id: result.insertId }];
    }

    const cartId = carts[0].id;

    // Check if item already in cart
    const [existingItems] = await db.query(
      "SELECT id, quantity FROM cart_items WHERE cart_id = ? AND product_id = ? AND (variant_id = ? OR (variant_id IS NULL AND ? IS NULL))",
      [cartId, product_id, variant_id || null, variant_id || null]
    );

    if (existingItems.length > 0) {
      const newQty = existingItems[0].quantity + parseInt(quantity);
      if (newQty > availableStock) {
        return res.status(400).json({ success: false, message: "Insufficient stock for requested quantity" });
      }
      await db.query("UPDATE cart_items SET quantity = ? WHERE id = ?", [newQty, existingItems[0].id]);
    } else {
      try {
        await db.query(
          "INSERT INTO cart_items (cart_id, product_id, variant_id, quantity, item_type) VALUES (?, ?, ?, ?, 'product')",
          [cartId, product_id, variant_id || null, parseInt(quantity)]
        );
      } catch (e) {
        if (e && (e.code === "ER_BAD_FIELD_ERROR" || /Unknown column.*item_type/i.test(e.message || ""))) {
          await db.query(
            "INSERT INTO cart_items (cart_id, product_id, variant_id, quantity) VALUES (?, ?, ?, ?)",
            [cartId, product_id, variant_id || null, parseInt(quantity)]
          );
        } else {
          throw e;
        }
      }
    }

    return res.status(200).json({
      success: true,
      message: `${products[0].name} added to cart`,
    });
  } catch (error) {
    console.error("Add to cart error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ===================== ADD 3D PRINT TO CART ===================== */
const addPrintToCart = async (req, res) => {
  try {
    await ensurePrintCartSchema();
    const {
      file_name,
      file_url,
      file_public_id,
      file_size,
      dimension_x,
      dimension_y,
      dimension_z,
      material_id,
      color_id,
      custom_color_hex,
      infill_density = 50,
      surface_finish = "standard",
      quantity = 1,
      estimated_weight,
    } = req.body;

    if (!file_name || !material_id || !estimated_weight) {
      return res.status(400).json({
        success: false,
        message: "File name, material, and estimated weight are required",
      });
    }

    const qty = Math.max(1, Math.min(99, parseInt(quantity) || 1));

    // Validate material
    const [materials] = await db.query(
      "SELECT * FROM printing_materials WHERE id = ? AND is_active = 1",
      [material_id]
    );
    if (materials.length === 0) {
      return res.status(404).json({ success: false, message: "Material not found" });
    }

    // Color adjustment (optional)
    let colorAdjustment = 0;
    if (color_id) {
      const [colors] = await db.query("SELECT price_adjustment FROM printing_colors WHERE id = ?", [color_id]);
      if (colors.length > 0) colorAdjustment = Number(colors[0].price_adjustment || 0);
    }

    // Settings for pricing (material + time-based charges + GST)
    const [settings] = await db.query(
      "SELECT setting_key, setting_value FROM site_settings WHERE setting_key IN ('gst_rate', 'smooth_finish_per_gram', 'print_hours_per_gram', 'print_time_slabs', 'print_rate_0_5', 'print_rate_5_10', 'print_rate_10_20', 'print_rate_20_plus')"
    );
    const settingsMap = {};
    (settings || []).forEach((s) => {
      if (s.setting_key === "print_time_slabs") {
        settingsMap[s.setting_key] = s.setting_value || "";
      } else {
        settingsMap[s.setting_key] = parseFloat(s.setting_value);
      }
    });
    const timeRates = {
      rate_0_5: settingsMap.print_rate_0_5 || 50,
      rate_5_10: settingsMap.print_rate_5_10 || 45,
      rate_10_20: settingsMap.print_rate_10_20 || 40,
      rate_20_plus: settingsMap.print_rate_20_plus || 35,
    };

    const pricing = calculatePrintPrice({
      estimatedWeight: parseFloat(estimated_weight),
      pricePerGram: parseFloat(materials[0].price_per_gram),
      infillDensity: parseInt(infill_density) || 50,
      surfaceFinish: surface_finish === "smooth" ? "smooth" : "standard",
      smoothFinishPerGram: settingsMap.smooth_finish_per_gram || 3,
      colorAdjustment,
      quantity: 1,
      gstRate: settingsMap.gst_rate || 18,
      hoursPerGram: settingsMap.print_hours_per_gram || 0.15,
      timeSlabs: settingsMap.print_time_slabs || undefined,
      timeRates,
    });

    const unitPrice = round2(pricing.perUnitCost);

    // Get or create cart
    let [carts] = await db.query("SELECT id FROM cart WHERE user_id = ?", [req.user.id]);
    if (carts.length === 0) {
      const [result] = await db.query("INSERT INTO cart (user_id) VALUES (?)", [req.user.id]);
      carts = [{ id: result.insertId }];
    }
    const cartId = carts[0].id;

    try {
      await db.query(
        `INSERT INTO cart_items
          (cart_id, product_id, variant_id, quantity, item_type, unit_price,
           file_name, file_url, file_public_id, file_size,
           dimension_x, dimension_y, dimension_z,
           material_id, color_id, custom_color_hex,
           infill_density, surface_finish, estimated_weight, print_time_hours, time_cost)
         VALUES (?, NULL, NULL, ?, 'print', ?,
           ?, ?, ?, ?,
           ?, ?, ?,
           ?, ?, ?,
           ?, ?, ?, ?, ?)`,
        [
          cartId,
          qty,
          unitPrice,
          file_name,
          file_url || null,
          file_public_id || null,
          file_size != null ? Number(file_size) : null,
          dimension_x != null ? Number(dimension_x) : null,
          dimension_y != null ? Number(dimension_y) : null,
          dimension_z != null ? Number(dimension_z) : null,
          material_id,
          color_id || null,
          custom_color_hex || null,
          parseInt(infill_density) || 50,
          surface_finish === "smooth" ? "smooth" : "standard",
          parseFloat(estimated_weight),
          pricing.printTimeHours,
          pricing.timeCost,
        ]
      );
    } catch (e) {
      if (e && (e.code === "ER_BAD_FIELD_ERROR" || /Unknown column/i.test(e.message || ""))) {
        await db.query(
          `INSERT INTO cart_items
            (cart_id, product_id, variant_id, quantity, item_type, unit_price,
             file_name, file_url, file_public_id, file_size,
             dimension_x, dimension_y, dimension_z,
             material_id, color_id, custom_color_hex,
             infill_density, surface_finish, estimated_weight)
           VALUES (?, NULL, NULL, ?, 'print', ?,
             ?, ?, ?, ?,
             ?, ?, ?,
             ?, ?, ?,
             ?, ?, ?)`,
          [
            cartId,
            qty,
            unitPrice,
            file_name,
            file_url || null,
            file_public_id || null,
            file_size != null ? Number(file_size) : null,
            dimension_x != null ? Number(dimension_x) : null,
            dimension_y != null ? Number(dimension_y) : null,
            dimension_z != null ? Number(dimension_z) : null,
            material_id,
            color_id || null,
            custom_color_hex || null,
            parseInt(infill_density) || 50,
            surface_finish === "smooth" ? "smooth" : "standard",
            parseFloat(estimated_weight),
          ]
        );
      } else {
        throw e;
      }
    }

    return res.status(200).json({
      success: true,
      message: `Custom 3D print (${file_name}) added to cart`,
      item: { unit_price: unitPrice, quantity: qty, print_time_hours: pricing.printTimeHours, time_cost: pricing.timeCost },
    });
  } catch (error) {
    console.error("Add print to cart error:", error);
    if (error && (error.code === "ER_BAD_FIELD_ERROR" || /Unknown column/i.test(error.message || ""))) {
      return res.status(500).json({
        success: false,
        message: "Custom 3D prints in cart need a DB upgrade. Please run the latest query.sql migration (cart_items print columns).",
      });
    }
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ===================== UPDATE CART ITEM ===================== */
const updateCartItem = async (req, res) => {
  try {
    const { item_id, quantity } = req.body;

    if (!item_id || !quantity || quantity < 1) {
      return res.status(400).json({ success: false, message: "Valid item ID and quantity required" });
    }

    // Verify ownership (works for both product + print rows)
    const [items] = await db.query(
      `SELECT ci.id, ci.product_id, ci.variant_id, ci.item_type, p.stock, pv.stock as variant_stock
       FROM cart_items ci
       JOIN cart c ON ci.cart_id = c.id
       LEFT JOIN products p ON ci.product_id = p.id
       LEFT JOIN product_variants pv ON ci.variant_id = pv.id
       WHERE ci.id = ? AND c.user_id = ?`,
      [item_id, req.user.id]
    );

    if (items.length === 0) {
      return res.status(404).json({ success: false, message: "Cart item not found" });
    }

    const row = items[0];
    const qty = Math.min(99, parseInt(quantity));
    if (row.item_type === "print" || row.product_id == null) {
      await db.query("UPDATE cart_items SET quantity = ? WHERE id = ?", [qty, item_id]);
      return res.status(200).json({ success: true, message: "Cart updated" });
    }

    const availableStock = row.variant_stock !== null && row.variant_stock !== undefined ? row.variant_stock : row.stock;
    if (qty > availableStock) {
      return res.status(400).json({ success: false, message: "Insufficient stock" });
    }

    await db.query("UPDATE cart_items SET quantity = ? WHERE id = ?", [qty, item_id]);

    return res.status(200).json({ success: true, message: "Cart updated" });
  } catch (error) {
    console.error("Update cart item error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ===================== REMOVE CART ITEM ===================== */
const removeCartItem = async (req, res) => {
  try {
    const { id } = req.params;

    const [result] = await db.query(
      `DELETE ci FROM cart_items ci
       JOIN cart c ON ci.cart_id = c.id
       WHERE ci.id = ? AND c.user_id = ?`,
      [id, req.user.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Cart item not found" });
    }

    return res.status(200).json({ success: true, message: "Item removed from cart" });
  } catch (error) {
    console.error("Remove cart item error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ===================== CLEAR CART ===================== */
const clearCart = async (req, res) => {
  try {
    const [carts] = await db.query("SELECT id FROM cart WHERE user_id = ?", [req.user.id]);

    if (carts.length > 0) {
      await db.query("DELETE FROM cart_items WHERE cart_id = ?", [carts[0].id]);
      await db.query("UPDATE cart SET coupon_id = NULL WHERE id = ?", [carts[0].id]);
    }

    return res.status(200).json({ success: true, message: "Cart cleared" });
  } catch (error) {
    console.error("Clear cart error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ===================== APPLY COUPON ===================== */
const applyCoupon = async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ success: false, message: "Coupon code is required" });
    }

    const [coupons] = await db.query(
      `SELECT * FROM coupons 
       WHERE code = ? AND is_active = 1 
       AND (valid_from IS NULL OR valid_from <= NOW()) 
       AND (valid_until IS NULL OR valid_until > NOW())
       AND (usage_limit IS NULL OR used_count < usage_limit)`,
      [code.toUpperCase()]
    );

    if (coupons.length === 0) {
      return res.status(404).json({ success: false, message: "Invalid or expired coupon code" });
    }

    const coupon = coupons[0];

    // Get cart + subtotal (products + 3D prints)
    const [carts] = await db.query("SELECT id FROM cart WHERE user_id = ?", [req.user.id]);
    if (carts.length === 0) {
      return res.status(400).json({ success: false, message: "Cart is empty" });
    }

    const { subtotal } = await getCartSubtotal(carts[0].id);

    if (!subtotal || subtotal <= 0) {
      return res.status(400).json({ success: false, message: "Cart is empty" });
    }

    if (subtotal < Number(coupon.min_order_amount || 0)) {
      return res.status(400).json({
        success: false,
        message: `Minimum order amount of ₹${coupon.min_order_amount} required for this coupon`,
      });
    }

    // Apply coupon to cart
    await db.query("UPDATE cart SET coupon_id = ? WHERE id = ?", [coupon.id, carts[0].id]);

    // Preview discount on FULL price incl. GST
    const { gstRate } = await getStoreSettings();
    const totals = calculateCouponTotals({ subtotal, gstRate, coupon });

    return res.status(200).json({
      success: true,
      message: "Coupon applied successfully",
      coupon: {
        id: coupon.id,
        code: coupon.code,
        discount_type: coupon.discount_type,
        discount_value: coupon.discount_value,
        discount_amount: totals.discount,
      },
    });
  } catch (error) {
    console.error("Apply coupon error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ===================== REMOVE COUPON ===================== */
const removeCoupon = async (req, res) => {
  try {
    await db.query("UPDATE cart SET coupon_id = NULL WHERE user_id = ?", [req.user.id]);

    return res.status(200).json({ success: true, message: "Coupon removed" });
  } catch (error) {
    console.error("Remove coupon error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = {
  getCart,
  addToCart,
  addPrintToCart,
  updateCartItem,
  removeCartItem,
  clearCart,
  applyCoupon,
  removeCoupon,
};
