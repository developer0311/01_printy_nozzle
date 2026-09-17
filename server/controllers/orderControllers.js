const db = require("../config/db");
const { calculateCouponTotals, round2 } = require("../utils/couponHelper");
const { ensurePrintCartSchema } = require("../utils/printCartSchema");
const { calculatePrintPrice } = require("../utils/priceCalculator");
const { triggerAutoShipment } = require("../utils/shippingSync");
const { mailOrderInvoiceById, mailPrintInvoiceByIds } = require("../utils/mailer");
const crypto = require("crypto");

/* ===================== FORMAT HELPER ===================== */
const formatDate = (date) => {
  if (!date) return null;
  const d = new Date(date);
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const formatDateTime = (date) => {
  if (!date) return null;
  const d = new Date(date);
  return `${d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}, ${d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}`;
};

/* ===================== BUILD ORDER TIMELINE ===================== */
const buildTimeline = (order) => {
  const steps = [
    {
      step: "Order Placed",
      key: "placed",
      timestamp: formatDateTime(order.created_at),
      is_completed: Boolean(order.created_at),
    },
    {
      step: "Packed",
      key: "packed",
      timestamp: formatDateTime(order.packed_at),
      is_completed: Boolean(order.packed_at) || ["shipped", "delivered"].includes(order.status),
    },
    {
      step: "Shipped",
      key: "shipped",
      timestamp: formatDateTime(order.shipped_at),
      carrier: order.shipping_carrier || (order.delhivery_awb ? "Delhivery" : "BlueDart Express"),
      tracking_number: order.delhivery_awb || order.tracking_number || null,
      shipping_status: order.shipping_status || null,
      is_completed: Boolean(order.shipped_at) || order.status === "delivered",
    },
    {
      step: "Out for Delivery",
      key: "out_for_delivery",
      timestamp: formatDateTime(order.out_for_delivery_at),
      is_completed: Boolean(order.out_for_delivery_at) || order.status === "delivered",
    },
    {
      step: "Delivered",
      key: "delivered",
      timestamp: formatDateTime(order.delivered_at),
      is_completed: order.status === "delivered",
    },
  ];

  if (order.status === "cancelled") {
    return [
      {
        step: "Order Placed",
        key: "placed",
        timestamp: formatDateTime(order.created_at),
        is_completed: true,
      },
      {
        step: "Cancelled",
        key: "cancelled",
        timestamp: formatDateTime(order.cancelled_at || order.updated_at),
        is_completed: true,
      },
    ];
  }

  return steps;
};

/* ===================== GET USER ORDERS (MY ORDERS PAGE) ===================== */
const getUserOrders = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, search, time_range = "last_6_months", page = 1, limit = 10 } = req.query;

    let whereClauses = ["o.user_id = ?"];
    let params = [userId];

    // Status Tab filter
    if (status && status !== "all") {
      if (status === "processing") {
        whereClauses.push("o.status IN ('pending', 'confirmed', 'processing')");
      } else {
        whereClauses.push("o.status = ?");
        params.push(status);
      }
    }

    // Time Range filter
    if (time_range === "last_6_months") {
      whereClauses.push("o.created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)");
    } else if (time_range === "this_year" || time_range === "2024") {
      whereClauses.push("YEAR(o.created_at) = YEAR(CURDATE())");
    }

    // Search by Order ID or Item name
    if (search) {
      whereClauses.push("(o.order_number LIKE ? OR EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND oi.product_name LIKE ?))");
      const term = `%${search.replace(/^#/, "")}%`;
      params.push(term, term);
    }

    const whereSql = whereClauses.join(" AND ");

    // Fetch E-commerce Product Orders
    const [orders] = await db.query(
      `SELECT o.id, o.order_number, o.status, o.total_amount, o.subtotal, o.shipping_cost,
              o.payment_method_label, o.payment_status, o.tracking_number, o.shipping_carrier,
              o.created_at, o.delivered_at, o.shipped_at
       FROM orders o
       WHERE ${whereSql}
       ORDER BY o.created_at DESC`,
      params
    );

    // Populate items & thumbnails for each order
    // (item_type tells the storefront to use the 3D-print artwork for prints)
    let orderItemsHaveType = true;
    try {
      const [colCheck] = await db.query(
        `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_items' AND COLUMN_NAME = 'item_type' LIMIT 1`
      );
      orderItemsHaveType = colCheck.length > 0;
    } catch {
      orderItemsHaveType = false;
    }
    const itemsSql = orderItemsHaveType
      ? `SELECT oi.id, oi.item_type, oi.product_name, oi.category_name, oi.variant_value, oi.price, oi.quantity, oi.total,
                COALESCE(oi.product_image, (SELECT image_url FROM product_images WHERE product_id = oi.product_id AND is_primary = 1 LIMIT 1), '') as image_url
         FROM order_items oi
         WHERE oi.order_id = ?`
      : `SELECT oi.id, oi.product_name, oi.category_name, oi.variant_value, oi.price, oi.quantity, oi.total,
                COALESCE(oi.product_image, (SELECT image_url FROM product_images WHERE product_id = oi.product_id AND is_primary = 1 LIMIT 1), '') as image_url
         FROM order_items oi
         WHERE oi.order_id = ?`;
    for (const ord of orders) {
      const [items] = await db.query(itemsSql, [ord.id]);

      ord.items = items;
      ord.items_count = items.reduce((sum, it) => sum + it.quantity, 0);
      ord.items_summary = items.map((it) => it.product_name).join(", ");
      
      const allThumbnails = items.map((it) => it.image_url);
      ord.thumbnails = allThumbnails.slice(0, 3);
      ord.additional_items_count = Math.max(0, items.length - 3);

      ord.formatted_date = formatDate(ord.created_at);
      ord.delivered_date = ord.delivered_at ? formatDate(ord.delivered_at) : null;
      ord.expected_delivery = ord.status === "delivered" 
        ? `Delivered on ${formatDate(ord.delivered_at || ord.created_at)}`
        : `Expected by ${formatDate(new Date(new Date(ord.created_at).getTime() + 4 * 24 * 60 * 60 * 1000))}`;

      // Status Pill helpers
      ord.is_3d_print = false;
      ord.can_cancel = ["pending", "confirmed"].includes(ord.status);
      ord.can_track = ["shipped", "processing"].includes(ord.status);
      ord.can_reorder = true;
      ord.can_return = ord.status === "delivered";
    }

    // Also fetch 3D Printing orders if not filtering strictly for a status unavailable in 3D prints
    let printOrders = [];
    if (!status || status === "all" || status === "processing" || status === "delivered" || status === "cancelled") {
      let pWhere = ["po.user_id = ?"];
      let pParams = [userId];

      if (status === "processing") {
        pWhere.push("po.status IN ('confirmed', 'reviewing', 'in_production', 'printing', 'quality_check')");
      } else if (status === "delivered" || status === "cancelled") {
        pWhere.push("po.status = ?");
        pParams.push(status);
      }

      if (time_range === "last_6_months") {
        pWhere.push("po.created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)");
      } else if (time_range === "this_year") {
        pWhere.push("YEAR(po.created_at) = YEAR(CURDATE())");
      }

      if (search) {
        pWhere.push("(po.order_number LIKE ? OR po.file_name LIKE ?)");
        const term = `%${search.replace(/^#/, "")}%`;
        pParams.push(term, term);
      }

      const [pRows] = await db.query(
        `SELECT po.id, po.order_number, po.status, po.total_amount, po.file_name, po.file_url, po.quantity,
                po.created_at, po.estimated_delivery,
                pm.name as material_name, pc.name as color_name, pc.hex_code
         FROM printing_orders po
         LEFT JOIN printing_materials pm ON po.material_id = pm.id
         LEFT JOIN printing_colors pc ON po.color_id = pc.id
         WHERE ${pWhere.join(" AND ")}
         ORDER BY po.created_at DESC`,
        pParams
      );

      printOrders = pRows.map((po) => ({
        id: po.id,
        order_number: po.order_number,
        status: po.status,
        status_label: po.status === "in_production" ? "In Production" : po.status.charAt(0).toUpperCase() + po.status.slice(1),
        total_amount: po.total_amount,
        formatted_date: formatDate(po.created_at),
        expected_delivery: po.status === "delivered" ? "Delivered" : `Expected by ${formatDate(new Date(new Date(po.created_at).getTime() + 4 * 24 * 60 * 60 * 1000))}`,
        is_3d_print: true,
        file_name: po.file_name,
        material_name: po.material_name,
        color_name: po.color_name,
        quantity: po.quantity,
        items_count: po.quantity,
        items_summary: `Custom 3D Print (${po.file_name}) - Material: ${po.material_name} | Color: ${po.color_name} | Qty: ${po.quantity}`,
        thumbnails: [],
        additional_items_count: 0,
        can_cancel: ["confirmed", "reviewing"].includes(po.status),
        can_track: ["shipped", "in_production", "printing"].includes(po.status),
        can_reorder: true,
        can_return: false,
      }));
    }

    // Merge standard orders & 3D print orders, sorted chronologically descending
    const allOrders = [...orders, ...printOrders].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // Simple in-memory pagination for unified feed
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const paginated = allOrders.slice(offset, offset + parseInt(limit));

    return res.status(200).json({
      success: true,
      orders: paginated,
      pagination: {
        total: allOrders.length,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(allOrders.length / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("Get user orders error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ===================== GET SINGLE ORDER DETAILS (ORDER DETAILS PAGE) ===================== */
const getOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Support lookup by ID or order_number (e.g. EL12456 or #EL12456)
    const cleanId = id.replace(/^#/, "");
    const isNumeric = !isNaN(cleanId) && !cleanId.startsWith("EL");
    const queryField = isNumeric ? "o.id = ?" : "o.order_number = ?";

    const [orders] = await db.query(
      `SELECT o.*
       FROM orders o
       WHERE ${queryField} AND (o.user_id = ? OR ? = 'admin')`,
      [cleanId, userId, req.user.role]
    );

    if (orders.length === 0) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const order = orders[0];

    // Order items
    const [items] = await db.query(
      `SELECT oi.*, p.slug as product_slug,
              COALESCE(oi.product_image, (SELECT image_url FROM product_images WHERE product_id = oi.product_id AND is_primary = 1 LIMIT 1), '') as image_url
       FROM order_items oi
       LEFT JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = ?`,
      [order.id]
    );
    order.items = items;

    // Formatted Dates & Header
    order.formatted_placed_at = formatDateTime(order.created_at);
    order.formatted_date = formatDate(order.created_at);
    order.status_pill = {
      status: order.status,
      label: order.status.charAt(0).toUpperCase() + order.status.slice(1),
      is_delivered: order.status === "delivered",
      is_cancelled: order.status === "cancelled",
    };

    // 5-Stage Stepper / Timeline
    order.timeline = buildTimeline(order);

    // Delhivery / courier shipping block + tracking history (best-effort)
    order.shipping = {
      provider: order.shipping_provider || (order.delhivery_awb ? "delhivery" : null),
      awb: order.delhivery_awb || order.tracking_number || null,
      carrier: order.shipping_carrier || (order.delhivery_awb ? "Delhivery" : null),
      shipping_status: order.shipping_status || null,
      shipment_created_at: order.shipment_created_at || null,
      shipping_synced_at: order.shipping_synced_at || null,
    };
    try {
      const { getEvents } = require("./shippingControllers");
      order.shipping_events = await getEvents("order", order.id);
    } catch {
      order.shipping_events = [];
    }

    // Addresses Breakdown
    order.shipping_address = {
      full_name: order.shipping_name,
      phone: order.shipping_phone,
      email: order.shipping_email,
      address_line1: order.shipping_address1,
      address_line2: order.shipping_address2,
      city: order.shipping_city,
      state: order.shipping_state,
      pincode: order.shipping_pincode,
      country: order.shipping_country || "India",
      formatted: `${order.shipping_address1}${order.shipping_address2 ? ', ' + order.shipping_address2 : ''}, ${order.shipping_city}, ${order.shipping_state} ${order.shipping_pincode}, ${order.shipping_country || 'India'}`
    };

    order.billing_address = {
      full_name: order.billing_name || order.shipping_name,
      phone: order.billing_phone || order.shipping_phone,
      address_line1: order.billing_address1 || order.shipping_address1,
      address_line2: order.billing_address2 || order.shipping_address2,
      city: order.billing_city || order.shipping_city,
      state: order.billing_state || order.shipping_state,
      pincode: order.billing_pincode || order.shipping_pincode,
      country: order.billing_country || order.shipping_country || "India",
      formatted: `${order.billing_address1 || order.shipping_address1}${order.billing_address2 ? ', ' + order.billing_address2 : ''}, ${order.billing_city || order.shipping_city}, ${order.billing_state || order.shipping_state} ${order.billing_pincode || order.shipping_pincode}, ${order.billing_country || 'India'}`
    };

    // Financial Summary
    order.summary = {
      items_count: items.reduce((sum, it) => sum + it.quantity, 0),
      subtotal: parseFloat(order.subtotal),
      shipping_cost: parseFloat(order.shipping_cost),
      is_shipping_free: parseFloat(order.shipping_cost) === 0,
      discount: parseFloat(order.discount),
      tax_amount: parseFloat(order.tax_amount),
      total_amount: parseFloat(order.total_amount),
    };

    // Breadcrumbs
    order.breadcrumbs = [
      { label: "Home", url: "/" },
      { label: "My Orders", url: "/orders" },
      { label: `Order #${order.order_number}`, url: `/orders/${order.order_number}` },
    ];

    return res.status(200).json({
      success: true,
      order,
    });
  } catch (error) {
    console.error("Get order by ID error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ===================== REORDER PRODUCTS (ADD ALL ITEMS TO CART) ===================== */
const reorderOrderItems = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const cleanId = id.replace(/^#/, "");
    const isNumeric = !isNaN(cleanId) && !cleanId.startsWith("EL");
    const queryField = isNumeric ? "id = ?" : "order_number = ?";

    const [orders] = await db.query(
      `SELECT id FROM orders WHERE ${queryField} AND user_id = ?`,
      [cleanId, userId]
    );

    if (orders.length === 0) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const orderId = orders[0].id;

    // Get order items
    const [items] = await db.query(
      "SELECT product_id, quantity FROM order_items WHERE order_id = ? AND product_id IS NOT NULL",
      [orderId]
    );

    if (items.length === 0) {
      return res.status(400).json({ success: false, message: "No active products to reorder" });
    }

    // Find or create cart
    let [cart] = await db.query("SELECT id FROM cart WHERE user_id = ?", [userId]);
    let cartId;
    if (cart.length === 0) {
      const [newCart] = await db.query("INSERT INTO cart (user_id) VALUES (?)", [userId]);
      cartId = newCart.insertId;
    } else {
      cartId = cart[0].id;
    }

    // Insert items into cart
    for (const item of items) {
      const [existing] = await db.query(
        "SELECT id, quantity FROM cart_items WHERE cart_id = ? AND product_id = ?",
        [cartId, item.product_id]
      );

      if (existing.length > 0) {
        await db.query(
          "UPDATE cart_items SET quantity = quantity + ? WHERE id = ?",
          [item.quantity, existing[0].id]
        );
      } else {
        await db.query(
          "INSERT INTO cart_items (cart_id, product_id, quantity) VALUES (?, ?, ?)",
          [cartId, item.product_id, item.quantity]
        );
      }
    }

    return res.status(200).json({
      success: true,
      message: "All items added to your cart successfully!",
    });
  } catch (error) {
    console.error("Reorder error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ===================== DOWNLOAD / GET INVOICE ===================== */
const getOrderInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const cleanId = id.replace(/^#/, "");
    const isNumeric = !isNaN(cleanId) && !cleanId.startsWith("EL");
    const queryField = isNumeric ? "o.id = ?" : "o.order_number = ?";

    const [orders] = await db.query(
      `SELECT o.*, u.first_name, u.last_name, u.email as customer_email
       FROM orders o
       JOIN users u ON o.user_id = u.id
       WHERE ${queryField} AND (o.user_id = ? OR ? = 'admin')`,
      [cleanId, userId, req.user.role]
    );

    if (orders.length === 0) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const order = orders[0];

    const [items] = await db.query("SELECT * FROM order_items WHERE order_id = ?", [order.id]);

    const { getInvoiceSettings, buildOrderInvoiceData, generateInvoicePdf, invoiceFileName } =
      require("../utils/invoice");
    const settings = await getInvoiceSettings();
    const data = buildOrderInvoiceData({ order, items, settings });

    // ?format=pdf → download the GST invoice PDF (used by client + email link).
    if (String(req.query.format || "").toLowerCase() === "pdf") {
      const pdf = await generateInvoicePdf(data);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${invoiceFileName(data)}"`);
      res.setHeader("Content-Length", pdf.length);
      return res.send(pdf);
    }

    const invoice = {
      invoice_number: data.invoiceNumber,
      invoice_date: data.invoiceDate,
      order_number: order.order_number,
      company: {
        name: settings.company.name,
        address: settings.company.address,
        gstin: settings.company.gstin,
        email: settings.company.email,
        phone: settings.company.phone,
      },
      customer: {
        name: order.shipping_name,
        email: order.shipping_email || order.customer_email,
        phone: order.shipping_phone,
        address: `${order.shipping_address1}${order.shipping_address2 ? ', ' + order.shipping_address2 : ''}, ${order.shipping_city}, ${order.shipping_state} ${order.shipping_pincode}`,
      },
      items: items.map((it) => ({
        description: it.product_name + (it.variant_value ? ` (${it.variant_value})` : ""),
        category: it.category_name,
        quantity: it.quantity,
        unit_price: parseFloat(it.price),
        total: parseFloat(it.total),
      })),
      lines: data.lines,
      financials: {
        subtotal: data.subtotal,
        shipping_cost: parseFloat(order.shipping_cost),
        discount: data.discount,
        gst_rate: `${data.gstRate}%`,
        tax_amount: data.taxTotal,
        grand_total: data.grandTotal,
        amount_in_words: data.amountWords,
      },
      payment: {
        method: order.payment_method_label || order.payment_method.toUpperCase(),
        status: order.payment_status.toUpperCase(),
      },
    };

    return res.status(200).json({
      success: true,
      invoice,
    });
  } catch (error) {
    console.error("Get invoice error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ===================== CREATE ORDER (CHECKOUT) ===================== */
const createOrder = async (req, res) => {
  const connection = await db.getConnection();

  /* Insert one 3D-print cart item into printing_orders and return its id/number/total.
     Used for print-only checkouts (no `orders` row) and to mirror prints
     inside mixed checkouts (the `orders` row still carries products). */
  const insertPrintingOrderRow = async ({ item, ship, payment_method, payment_status, gstRate, smoothPerGram, notes }) => {
    if (!item.material_id) {
      console.error("⛔ Printing order aborted: material_id is missing for print cart item", {
        cart_item_id: item.id,
        file_name: item.file_name,
        material_id: item.material_id,
      });
      throw new Error("A 3D print item is missing its material. Please re-add it from 3D Printing.");
    }
    const [matRows] = await connection.query(
      "SELECT price_per_gram FROM printing_materials WHERE id = ?",
      [item.material_id]
    );
    const pricePerGram = matRows.length ? parseFloat(matRows[0].price_per_gram) : 12;
    let colorAdj = 0;
    if (item.color_id) {
      const [cRows] = await connection.query(
        "SELECT price_adjustment FROM printing_colors WHERE id = ?",
        [item.color_id]
      );
      if (cRows.length) colorAdj = parseFloat(cRows[0].price_adjustment || 0);
    }
    const breakdown = calculatePrintPrice({
      estimatedWeight: parseFloat(item.estimated_weight || 20),
      pricePerGram,
      infillDensity: parseInt(item.infill_density) || 50,
      surfaceFinish: item.surface_finish || "standard",
      smoothFinishPerGram: smoothPerGram,
      colorAdjustment: colorAdj,
      quantity: parseInt(item.quantity) || 1,
      gstRate,
    });
    const printOrderNumber =
      "3D" + Date.now().toString(36).toUpperCase() + crypto.randomBytes(2).toString("hex").toUpperCase();
    const [insertRes] = await connection.query(
      `INSERT INTO printing_orders (
        user_id, order_number, status,
        file_name, file_url, file_public_id, file_size,
        dimension_x, dimension_y, dimension_z,
        material_id, color_id, custom_color_hex,
        infill_density, surface_finish, quantity,
        estimated_weight, material_cost, color_cost, finish_cost,
        subtotal, tax_amount, total_amount,
        shipping_name, shipping_phone, shipping_address1,
        shipping_city, shipping_state, shipping_pincode,
        payment_method, payment_status, notes
      ) VALUES (?, ?, 'confirmed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        printOrderNumber,
        item.file_name || "model.stl",
        item.file_url || "",
        item.file_public_id || null,
        item.file_size || null,
        item.dimension_x || null,
        item.dimension_y || null,
        item.dimension_z || null,
        item.material_id,
        item.color_id || null,
        item.custom_color_hex || null,
        parseInt(item.infill_density) || 50,
        item.surface_finish || "standard",
        parseInt(item.quantity) || 1,
        breakdown.effectiveWeight,
        breakdown.materialCost,
        breakdown.colorCost,
        breakdown.finishCost,
        breakdown.subtotal,
        breakdown.taxAmount,
        breakdown.totalAmount,
        ship.name,
        ship.phone,
        ship.address1,
        ship.city,
        ship.state,
        ship.pin,
        payment_method,
        payment_status,
        notes,
      ]
    );
    console.log(`✅ Print item stored in printing_orders: ${printOrderNumber}`);
    return {
      id: insertRes.insertId,
      order_number: printOrderNumber,
      total_amount: breakdown.totalAmount,
    };
  };

  try {
    await connection.beginTransaction();

    const userId = req.user.id;
    const {
      shipping_address_id,
      shipping_name,
      shipping_phone,
      shipping_email,
      shipping_address1,
      shipping_address2,
      shipping_city,
      shipping_state,
      shipping_pincode,
      shipping_country,
      delivery_option = "standard",
      payment_method = "cod",
      notes,
    } = req.body;

    // Get user cart
    const [cart] = await connection.query("SELECT * FROM cart WHERE user_id = ?", [userId]);
    if (cart.length === 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: "Cart is empty" });
    }

    await ensurePrintCartSchema().catch(() => {});

    let cartItems;
    try {
      [cartItems] = await connection.query(
        `SELECT ci.*, p.name as product_name, p.price, p.stock, p.category_id,
                c.name as category_name,
                pv.variant_name, pv.variant_value, pv.price_adjustment,
                ci.item_type, ci.unit_price as print_unit_price,
                ci.file_name, ci.file_url, ci.file_public_id, ci.file_size,
                ci.dimension_x, ci.dimension_y, ci.dimension_z,
                ci.material_id, ci.color_id, ci.custom_color_hex,
                ci.infill_density, ci.surface_finish, ci.estimated_weight,
                pm.name as material_name, pc.name as color_name, pc.hex_code as color_hex,
                (SELECT image_url FROM product_images WHERE product_id = p.id AND is_primary = 1 LIMIT 1) as product_image
         FROM cart_items ci
         LEFT JOIN products p ON ci.product_id = p.id
         LEFT JOIN categories c ON p.category_id = c.id
         LEFT JOIN product_variants pv ON ci.variant_id = pv.id
         LEFT JOIN printing_materials pm ON ci.material_id = pm.id
         LEFT JOIN printing_colors pc ON ci.color_id = pc.id
         WHERE ci.cart_id = ?`,
        [cart[0].id]
      );
    } catch (e) {
      if (e && (e.code === "ER_BAD_FIELD_ERROR" || /Unknown column/i.test(e.message || ""))) {
        [cartItems] = await connection.query(
          `SELECT ci.*, p.name as product_name, p.price, p.stock, p.category_id,
                  c.name as category_name,
                  pv.variant_name, pv.variant_value, pv.price_adjustment,
                  (SELECT image_url FROM product_images WHERE product_id = p.id AND is_primary = 1 LIMIT 1) as product_image
           FROM cart_items ci
           JOIN products p ON ci.product_id = p.id
           LEFT JOIN categories c ON p.category_id = c.id
           LEFT JOIN product_variants pv ON ci.variant_id = pv.id
           WHERE ci.cart_id = ?`,
          [cart[0].id]
        );
      } else {
        throw e;
      }
    }

    if (cartItems.length === 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: "Cart is empty" });
    }

    const isPrintCartItem = (it) => it.item_type === "print" || it.product_id == null;

    // Check stock & calculate subtotal (products + 3D prints)
    let subtotal = 0;
    for (const item of cartItems) {
      if (isPrintCartItem(item)) {
        const unit = parseFloat(item.print_unit_price ?? item.unit_price ?? 0);
        if (!Number.isFinite(unit) || unit < 0) {
          await connection.rollback();
          return res.status(400).json({ success: false, message: "Invalid 3D print price in cart" });
        }
        subtotal += unit * item.quantity;
        continue;
      }
      const itemStock = item.stock;
      if (itemStock == null || itemStock < item.quantity) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: `Not enough stock for ${item.product_name}. Available: ${itemStock ?? 0}`,
        });
      }
      const itemPrice = parseFloat(item.price) + parseFloat(item.price_adjustment || 0);
      subtotal += itemPrice * item.quantity;
    }
    subtotal = round2(subtotal);

    // Settings first (needed for GST-aware coupon)
    const [settings] = await connection.query(
      "SELECT setting_key, setting_value FROM site_settings WHERE setting_key IN ('free_shipping_threshold', 'standard_shipping_cost', 'express_shipping_cost', 'same_day_shipping_cost', 'gst_rate', 'smooth_finish_per_gram')"
    );
    const configMap = {};
    settings.forEach((s) => (configMap[s.setting_key] = s.setting_value));

    const gstRate = parseFloat(configMap.gst_rate || 18);

    // Coupon calculation — discount on FULL price incl. GST.
    // Coupons attach to the `orders` row, so print-only checkouts
    // (which create no `orders` row) neither consume nor discount them.
    let couponRow = null;
    let couponId = null;
    let couponCode = null;
    const hasProductItems = cartItems.some((it) => !isPrintCartItem(it));
    if (cart[0].coupon_id && hasProductItems) {
      const [coupons] = await connection.query(
        "SELECT * FROM coupons WHERE id = ? AND is_active = 1 AND (valid_until IS NULL OR valid_until > NOW())",
        [cart[0].coupon_id]
      );
      if (coupons.length > 0 && subtotal >= parseFloat(coupons[0].min_order_amount || 0)) {
        couponRow = coupons[0];
        couponId = couponRow.id;
        couponCode = couponRow.code;
        await connection.query("UPDATE coupons SET used_count = used_count + 1 WHERE id = ?", [couponRow.id]);
      }
    }
    const couponTotals = calculateCouponTotals({ subtotal, gstRate, coupon: couponRow });
    const discount = couponTotals.discount;
    const taxAmount = couponTotals.taxAmount;

    // Shipping cost
    const freeThreshold = parseFloat(configMap.free_shipping_threshold || 999);
    let shippingCost = 0;

    if (delivery_option === "express") {
      shippingCost = parseFloat(configMap.express_shipping_cost || 99);
    } else if (delivery_option === "same_day") {
      shippingCost = parseFloat(configMap.same_day_shipping_cost || 149);
    } else {
      shippingCost = subtotal >= freeThreshold ? 0 : parseFloat(configMap.standard_shipping_cost || 0);
    }

    // Total = (subtotal + GST) - discount (coupon on full incl-GST price) + shipping
    const totalAmount = round2(couponTotals.totalAmount + shippingCost);

    // Resolve address
    let shipName = shipping_name;
    let shipPhone = shipping_phone;
    let shipEmail = shipping_email;
    let shipAdd1 = shipping_address1;
    let shipAdd2 = shipping_address2;
    let shipCity = shipping_city;
    let shipState = shipping_state;
    let shipPin = shipping_pincode;
    let shipCountry = shipping_country || "India";

    if (shipping_address_id) {
      const [addr] = await connection.query("SELECT * FROM addresses WHERE id = ? AND user_id = ?", [shipping_address_id, userId]);
      if (addr.length > 0) {
        shipName = addr[0].full_name;
        shipPhone = addr[0].phone;
        shipEmail = addr[0].email;
        shipAdd1 = addr[0].address_line1;
        shipAdd2 = addr[0].address_line2;
        shipCity = addr[0].city;
        shipState = addr[0].state;
        shipPin = addr[0].pincode;
        shipCountry = addr[0].country;
      }
    }

    const orderNumber = `EL${Math.floor(10000 + Math.random() * 90000)}`;

    const printItems = cartItems.filter((it) => isPrintCartItem(it));
    const ship = {
      name: shipName,
      phone: shipPhone,
      address1: shipAdd1,
      city: shipCity,
      state: shipState,
      pin: shipPin,
    };
    const smoothPerGram = parseFloat(configMap.smooth_finish_per_gram || 3);

    // Print-only checkout: 3D prints live ONLY in printing_orders —
    // no `orders` / `order_items` rows, so they never leak into Orders.
    if (!hasProductItems) {
      const created = [];
      for (const item of printItems) {
        created.push(
          await insertPrintingOrderRow({
            item,
            ship,
            payment_method,
            payment_status: "pending",
            gstRate,
            smoothPerGram,
            notes: notes || "Placed via store checkout",
          })
        );
      }
      await connection.query("DELETE FROM cart_items WHERE cart_id = ?", [cart[0].id]);
      await connection.query("UPDATE cart SET coupon_id = NULL WHERE id = ?", [cart[0].id]);
      await connection.commit();

      const printTotal = round2(
        created.reduce((sum, r) => sum + Number(r.total_amount || 0), 0) + shippingCost
      );
      // COD print orders are payable on delivery → auto-create Delhivery
      // shipments (fire-and-forget; never blocks the response).
      if (payment_method === "cod") {
        created.forEach((r) => triggerAutoShipment("print", r.id));
        // GST invoice email for the 3D-print purchase.
        mailPrintInvoiceByIds(
          created.map((r) => r.id),
          { shippingCost, deliveryOption: delivery_option, template: "cod" }
        ).catch(() => {});
      }
      return res.status(201).json({
        success: true,
        message: "3D print order placed successfully!",
        order: {
          id: created[0].id,
          order_number: created[0].order_number,
          total_amount: printTotal.toFixed(2),
          payment_method,
          is_print_only: true,
          print_order_ids: created.map((r) => r.id),
        },
      });
    }

    const methodLabels = {
      upi: "Online Payment (Razorpay)",
      card: "Online Payment (Razorpay)",
      net_banking: "Online Payment (Razorpay)",
      wallet: "Online Payment (Razorpay)",
      cod: "Cash on Delivery",
    };

    // Insert Order
    const [orderResult] = await connection.query(
      `INSERT INTO orders 
       (user_id, order_number, status, shipping_name, shipping_phone, shipping_email,
        shipping_address1, shipping_address2, shipping_city, shipping_state, shipping_pincode, shipping_country,
        billing_name, billing_phone, billing_address1, billing_address2, billing_city, billing_state, billing_pincode, billing_country,
        delivery_option, shipping_cost, payment_method, payment_method_label, payment_status,
        subtotal, discount, tax_amount, total_amount, coupon_id, coupon_code, notes)
       VALUES (?, ?, 'confirmed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        orderNumber,
        shipName,
        shipPhone,
        shipEmail,
        shipAdd1,
        shipAdd2,
        shipCity,
        shipState,
        shipPin,
        shipCountry,
        shipName,
        shipPhone,
        shipAdd1,
        shipAdd2,
        shipCity,
        shipState,
        shipPin,
        shipCountry,
        delivery_option,
        shippingCost,
        payment_method,
        methodLabels[payment_method] || "Online Payment (Razorpay)",
        // Every new order starts "pending". Razorpay orders flip to "paid"
        // in verify-payment; this keeps the order visible under My Orders
        // even if the customer closes the gateway without paying.
        "pending",
        subtotal.toFixed(2),
        discount.toFixed(2),
        taxAmount.toFixed(2),
        totalAmount.toFixed(2),
        couponId,
        couponCode,
        notes || null,
      ]
    );

    const orderId = orderResult.insertId;

    // Insert Order Items & Deduct stock (products) / track prints
    let printAwareOrderItems = true;
    try {
      await connection.query("SELECT item_type FROM order_items LIMIT 0");
    } catch (e) {
      if (e && (e.code === "ER_BAD_FIELD_ERROR" || /Unknown column/i.test(e.message || ""))) {
        printAwareOrderItems = false;
      } else if (e && e.code === "ER_NO_SUCH_TABLE") {
        printAwareOrderItems = false;
      } else {
        // SELECT ... LIMIT 0 on empty table still works; if table missing other error, keep true
        // Check via information schema fallback: assume print-aware if ensure ran
        printAwareOrderItems = true;
      }
    }
    // More reliable: check information_schema for one print column
    try {
      const [colCheck] = await connection.query(
        `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_items' AND COLUMN_NAME = 'file_name' LIMIT 1`
      );
      printAwareOrderItems = colCheck.length > 0;
    } catch (e) {
      /* keep previous value */
    }

    for (const item of cartItems) {
      if (isPrintCartItem(item)) {
        const unit = round2(parseFloat(item.print_unit_price ?? item.unit_price ?? 0));
        const itemTotal = round2(unit * item.quantity);
        const materialLabel = item.material_name || "3D Print";
        const colorLabel = item.color_name || item.custom_color_hex || "Custom";
        const infillLabel = `${item.infill_density || 50}%`;
        const finishLabel = item.surface_finish === "smooth" ? "Smooth" : "Standard";
        const printName = `Custom 3D Print (${item.file_name || "model"})`;
        const variantSummary = `${materialLabel} • ${colorLabel} • ${infillLabel} • ${finishLabel}`;

        if (printAwareOrderItems) {
          await connection.query(
            `INSERT INTO order_items
              (order_id, product_id, product_name, product_image, category_name,
               variant_name, variant_value, price, quantity, total,
               item_type, unit_price,
               file_name, file_url, file_public_id, file_size,
               dimension_x, dimension_y, dimension_z,
               material_id, color_id, custom_color_hex,
               infill_density, surface_finish, estimated_weight)
             VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?,
               'print', ?,
               ?, ?, ?, ?,
               ?, ?, ?,
               ?, ?, ?,
               ?, ?, ?)`,
            [
              orderId,
              printName,
              "/images/rocket.png",
              "3D Printing",
              materialLabel,
              variantSummary,
              unit.toFixed(2),
              item.quantity,
              itemTotal.toFixed(2),
              unit.toFixed(2),
              item.file_name || null,
              item.file_url || null,
              item.file_public_id || null,
              item.file_size != null ? Number(item.file_size) : null,
              item.dimension_x != null ? Number(item.dimension_x) : null,
              item.dimension_y != null ? Number(item.dimension_y) : null,
              item.dimension_z != null ? Number(item.dimension_z) : null,
              item.material_id || null,
              item.color_id || null,
              item.custom_color_hex || null,
              item.infill_density || 50,
              item.surface_finish || "standard",
              item.estimated_weight != null ? Number(item.estimated_weight) : null,
            ]
          );
        } else {
          await connection.query(
            `INSERT INTO order_items (order_id, product_id, product_name, product_image, category_name, variant_name, variant_value, price, quantity, total)
             VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              orderId,
              printName,
              "/images/rocket.png",
              "3D Printing",
              materialLabel,
              variantSummary,
              unit.toFixed(2),
              item.quantity,
              itemTotal.toFixed(2),
            ]
          );
        }

        // Mirror into printing_orders so the print queue / admin keeps working
        try {
          await insertPrintingOrderRow({
            item,
            ship,
            payment_method,
            payment_status: payment_method === "cod" ? "pending" : "paid",
            gstRate,
            smoothPerGram,
            notes: `Part of e-commerce order ${orderNumber}`,
          });
        } catch (printMirrorErr) {
          console.error("⛔ Failed to mirror print item to printing_orders:", printMirrorErr.message, {
            file_name: item.file_name,
            material_id: item.material_id,
            color_id: item.color_id,
            stack: printMirrorErr.stack,
          });
        }
        continue;
      }

      const itemPrice = parseFloat(item.price) + parseFloat(item.price_adjustment || 0);
      const itemTotal = itemPrice * item.quantity;

      await connection.query(
        `INSERT INTO order_items (order_id, product_id, product_name, product_image, category_name, variant_name, variant_value, price, quantity, total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          orderId,
          item.product_id,
          item.product_name,
          item.product_image,
          item.category_name,
          item.variant_name || null,
          item.variant_value || null,
          itemPrice.toFixed(2),
          item.quantity,
          itemTotal.toFixed(2),
        ]
      );

      // Decrement product stock & increase total_sold
      await connection.query(
        "UPDATE products SET stock = stock - ?, total_sold = total_sold + ? WHERE id = ?",
        [item.quantity, item.quantity, item.product_id]
      );
    }

    // Clear cart
    await connection.query("DELETE FROM cart_items WHERE cart_id = ?", [cart[0].id]);
    await connection.query("UPDATE cart SET coupon_id = NULL WHERE id = ?", [cart[0].id]);

    await connection.commit();

    // COD orders are confirmed on placement → auto-create the Delhivery
    // shipment (fire-and-forget; prepaid orders hook in verify-payment).
    if (payment_method === "cod") {
      triggerAutoShipment("order", orderId);
      // GST invoice email for the purchase (products and/or 3D prints).
      mailOrderInvoiceById(orderId, { template: "cod" }).catch(() => {});
    }

    return res.status(201).json({
      success: true,
      message: "Order placed successfully!",
      order: {
        id: orderId,
        order_number: orderNumber,
        total_amount: totalAmount.toFixed(2),
        payment_method,
      },
    });
  } catch (error) {
    await connection.rollback();
    console.error("Create order error:", error);
    return res.status(500).json({ success: false, message: "Order creation failed" });
  } finally {
    connection.release();
  }
};

/* ===================== CANCEL ORDER ===================== */
const cancelOrder = async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const cleanId = id.replace(/^#/, "");
    const isNumeric = !isNaN(cleanId) && !cleanId.startsWith("EL");
    const queryField = isNumeric ? "id = ?" : "order_number = ?";

    const [orders] = await connection.query(
      `SELECT * FROM orders WHERE ${queryField} AND user_id = ?`,
      [cleanId, req.user.id]
    );

    if (orders.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const order = orders[0];

    if (!["pending", "confirmed", "processing"].includes(order.status)) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: `Cannot cancel order in '${order.status}' status. It may have already shipped.`,
      });
    }

    // Restore stock
    const [items] = await connection.query("SELECT product_id, quantity FROM order_items WHERE order_id = ?", [order.id]);
    for (const item of items) {
      if (item.product_id) {
        await connection.query(
          "UPDATE products SET stock = stock + ?, total_sold = GREATEST(total_sold - ?, 0) WHERE id = ?",
          [item.quantity, item.quantity, item.product_id]
        );
      }
    }

    // Restore coupon
    if (order.coupon_id) {
      await connection.query("UPDATE coupons SET used_count = GREATEST(used_count - 1, 0) WHERE id = ?", [order.coupon_id]);
    }

    await connection.query("UPDATE orders SET status = 'cancelled', cancelled_at = NOW() WHERE id = ?", [order.id]);

    await connection.commit();

    return res.status(200).json({ success: true, message: "Order cancelled successfully" });
  } catch (error) {
    await connection.rollback();
    console.error("Cancel order error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  } finally {
    connection.release();
  }
};

module.exports = {
  getUserOrders,
  getOrderById,
  createOrder,
  cancelOrder,
  reorderOrderItems,
  getOrderInvoice,
};
