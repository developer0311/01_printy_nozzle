const db = require("../config/db");
const crypto = require("crypto");
const { uploadFile } = require("../utils/cloudinaryUploader");
const { calculatePrintPrice } = require("../utils/priceCalculator");
const { triggerAutoShipment } = require("../utils/shippingSync");
const { mailPrintInvoiceByIds } = require("../utils/mailer");

/* ===================== HELPERS ===================== */
const formatDateTime = (dt) => {
  if (!dt) return null;
  try {
    return new Date(dt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return null;
  }
};

const PRINT_STATUS_ORDER = ["confirmed", "reviewing", "in_production", "printing", "quality_check", "shipped", "delivered"];

const buildPrintTimeline = (order) => {
  if (order.status === "cancelled") {
    return [
      { step: "Order Placed", key: "placed", timestamp: formatDateTime(order.created_at), is_completed: true },
      { step: "Cancelled", key: "cancelled", timestamp: formatDateTime(order.updated_at), is_completed: true },
    ];
  }

  const currentIdx = PRINT_STATUS_ORDER.indexOf(order.status);
  const awb = order.delhivery_awb || null;
  const steps = [
    { step: "Order Placed", key: "placed", timestamp: formatDateTime(order.created_at), is_completed: true },
    { step: "Reviewing", key: "reviewing", timestamp: null, is_completed: currentIdx >= 1 },
    { step: "In Production", key: "in_production", timestamp: null, is_completed: currentIdx >= 2 },
    { step: "Printing", key: "printing", timestamp: null, is_completed: currentIdx >= 3 },
    { step: "Quality Check", key: "quality_check", timestamp: null, is_completed: currentIdx >= 4 },
    {
      step: "Shipped", key: "shipped", timestamp: null, is_completed: currentIdx >= 5,
      carrier: awb ? "Delhivery" : null, tracking_number: awb, shipping_status: order.shipping_status || null,
    },
    { step: "Delivered", key: "delivered", timestamp: null, is_completed: currentIdx >= 6 },
  ];

  return steps;
};

/* ===================== UPLOAD PRINT FILE ===================== */
const uploadPrintFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "Please upload a 3D model file (.STL, .OBJ, or .3MF)" });
    }

    // Upload to Cloudinary as raw file
    const result = await uploadFile({
      filePath: req.file.path,
      folder: "printynozzle/prints",
      resourceType: "raw",
      publicId: `print_${Date.now()}_${Math.round(Math.random() * 1e4)}`,
    });

    return res.status(200).json({
      success: true,
      message: "File uploaded successfully",
      file: {
        name: req.file.originalname,
        url: result.url,
        public_id: result.public_id,
        size: (req.file.size / (1024 * 1024)).toFixed(2), // MB
      },
    });
  } catch (error) {
    console.error("Upload print file error:", error);
    return res.status(500).json({ success: false, message: "File upload failed" });
  }
};

/* ===================== GET PRINTING CONFIG ===================== */
const getPrintPricingSettings = async (connOrDb) => {
  const [settings] = await (connOrDb || db).query(
    "SELECT setting_key, setting_value FROM site_settings WHERE setting_key IN ('gst_rate', 'smooth_finish_per_gram', 'free_shipping_threshold', 'printing_delivery_days', 'printing_delivery_region', 'print_hours_per_gram', 'print_time_slabs', 'print_rate_0_5', 'print_rate_5_10', 'print_rate_10_20', 'print_rate_20_plus')"
  );
  const map = {};
  (settings || []).forEach((s) => (map[s.setting_key] = s.setting_value));
  return {
    gst_rate: map.gst_rate,
    smooth_finish_per_gram: map.smooth_finish_per_gram,
    free_shipping_threshold: map.free_shipping_threshold,
    printing_delivery_days: map.printing_delivery_days,
    printing_delivery_region: map.printing_delivery_region,
    print_hours_per_gram: map.print_hours_per_gram !== undefined ? Number(map.print_hours_per_gram) : 0.15,
    print_time_slabs: map.print_time_slabs || "",
    print_rate_0_5: map.print_rate_0_5 !== undefined ? Number(map.print_rate_0_5) : 50,
    print_rate_5_10: map.print_rate_5_10 !== undefined ? Number(map.print_rate_5_10) : 45,
    print_rate_10_20: map.print_rate_10_20 !== undefined ? Number(map.print_rate_10_20) : 40,
    print_rate_20_plus: map.print_rate_20_plus !== undefined ? Number(map.print_rate_20_plus) : 35,
  };
};

const toTimeRates = (s) => ({
  rate_0_5: Number(s.print_rate_0_5 ?? 50),
  rate_5_10: Number(s.print_rate_5_10 ?? 45),
  rate_10_20: Number(s.print_rate_10_20 ?? 40),
  rate_20_plus: Number(s.print_rate_20_plus ?? 35),
});

const getPrintingConfig = async (req, res) => {
  try {
    const settingsMap = await getPrintPricingSettings();
    return res.status(200).json({ success: true, settings: settingsMap });
  } catch (error) {
    console.error("Get printing config error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ===================== GET MATERIALS ===================== */
const getMaterials = async (req, res) => {
  try {
    const [materials] = await db.query(
      "SELECT * FROM printing_materials WHERE is_active = 1 ORDER BY sort_order ASC"
    );

    return res.status(200).json({ success: true, materials });
  } catch (error) {
    console.error("Get materials error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ===================== GET COLORS ===================== */
const getColors = async (req, res) => {
  try {
    const [colors] = await db.query(
      "SELECT * FROM printing_colors WHERE is_active = 1 ORDER BY sort_order ASC"
    );

    return res.status(200).json({ success: true, colors });
  } catch (error) {
    console.error("Get colors error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ===================== CALCULATE PRINT PRICE ===================== */
const calculatePrice = async (req, res) => {
  try {
    const {
      estimated_weight,
      material_id,
      color_id,
      infill_density = 50,
      surface_finish = "standard",
      quantity = 1,
    } = req.body;

    if (!estimated_weight || !material_id) {
      return res.status(400).json({ success: false, message: "Estimated weight and material are required" });
    }

    // Get material
    const [materials] = await db.query("SELECT * FROM printing_materials WHERE id = ? AND is_active = 1", [material_id]);
    if (materials.length === 0) {
      return res.status(404).json({ success: false, message: "Material not found" });
    }

    // Get color adjustment
    let colorAdjustment = 0;
    if (color_id) {
      const [colors] = await db.query("SELECT price_adjustment FROM printing_colors WHERE id = ?", [color_id]);
      if (colors.length > 0) colorAdjustment = colors[0].price_adjustment;
    }

    // Get GST rate, smooth finish cost + time-based charge settings
    const pricingSettings = await getPrintPricingSettings();
    const settingsMap = {
      smooth_finish_per_gram: parseFloat(pricingSettings.smooth_finish_per_gram),
      gst_rate: parseFloat(pricingSettings.gst_rate),
    };

    const pricing = calculatePrintPrice({
      estimatedWeight: parseFloat(estimated_weight),
      pricePerGram: parseFloat(materials[0].price_per_gram),
      infillDensity: parseInt(infill_density),
      surfaceFinish: surface_finish,
      smoothFinishPerGram: settingsMap.smooth_finish_per_gram || 3,
      colorAdjustment,
      quantity: parseInt(quantity),
      gstRate: settingsMap.gst_rate || 18,
      hoursPerGram: pricingSettings.print_hours_per_gram || 0.15,
      timeSlabs: pricingSettings.print_time_slabs || undefined,
      timeRates: toTimeRates(pricingSettings),
    });

    return res.status(200).json({
      success: true,
      pricing: {
        ...pricing,
        material_name: materials[0].name,
        price_per_gram: materials[0].price_per_gram,
      },
    });
  } catch (error) {
    console.error("Calculate price error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ===================== CREATE PRINT ORDER ===================== */
const createPrintOrder = async (req, res) => {
  try {
    const {
      file_name, file_url, file_public_id, file_size,
      dimension_x, dimension_y, dimension_z,
      material_id, color_id, custom_color_hex,
      infill_density = 50, surface_finish = "standard", quantity = 1,
      estimated_weight,
      shipping_name, shipping_phone, shipping_address1,
      shipping_city, shipping_state, shipping_pincode,
      payment_method = "cod",
      notes,
    } = req.body;

    /* -------- Validation -------- */
    if (!file_name || !file_url || !material_id || !estimated_weight) {
      return res.status(400).json({ success: false, message: "File, material, and estimated weight are required" });
    }

    // Get material
    const [materials] = await db.query("SELECT * FROM printing_materials WHERE id = ? AND is_active = 1", [material_id]);
    if (materials.length === 0) {
      return res.status(404).json({ success: false, message: "Material not found" });
    }

    // Get color
    let colorAdjustment = 0;
    if (color_id) {
      const [colors] = await db.query("SELECT price_adjustment FROM printing_colors WHERE id = ?", [color_id]);
      if (colors.length > 0) colorAdjustment = colors[0].price_adjustment;
    }

    // Get settings (material + time-based charges + GST)
    const pricingSettings = await getPrintPricingSettings();
    const settingsMap = {
      smooth_finish_per_gram: parseFloat(pricingSettings.smooth_finish_per_gram),
      gst_rate: parseFloat(pricingSettings.gst_rate),
    };

    // Calculate price — Final = material charge + printing-time charge
    const pricing = calculatePrintPrice({
      estimatedWeight: parseFloat(estimated_weight),
      pricePerGram: parseFloat(materials[0].price_per_gram),
      infillDensity: parseInt(infill_density),
      surfaceFinish: surface_finish,
      smoothFinishPerGram: settingsMap.smooth_finish_per_gram || 3,
      colorAdjustment,
      quantity: parseInt(quantity),
      gstRate: settingsMap.gst_rate || 18,
      hoursPerGram: pricingSettings.print_hours_per_gram || 0.15,
      timeSlabs: pricingSettings.print_time_slabs || undefined,
      timeRates: toTimeRates(pricingSettings),
    });

    // Generate order number
    const orderNumber = "3D" + Date.now().toString(36).toUpperCase() + crypto.randomBytes(2).toString("hex").toUpperCase();

    // Create order (stores material + time breakup for invoice/admin)
    let result;
    try {
      [result] = await db.query(
        `INSERT INTO printing_orders (
          user_id, order_number, status,
          file_name, file_url, file_public_id, file_size,
          dimension_x, dimension_y, dimension_z,
          material_id, color_id, custom_color_hex,
          infill_density, surface_finish, quantity,
          estimated_weight, print_time_hours, material_cost, time_cost, color_cost, finish_cost,
          subtotal, tax_amount, total_amount,
          shipping_name, shipping_phone, shipping_address1,
          shipping_city, shipping_state, shipping_pincode,
          payment_method, payment_status, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          req.user.id, orderNumber, "confirmed",
          file_name, file_url, file_public_id || null, file_size || null,
          dimension_x || null, dimension_y || null, dimension_z || null,
          material_id, color_id || null, custom_color_hex || null,
          parseInt(infill_density), surface_finish, parseInt(quantity),
          pricing.effectiveWeight, pricing.printTimeHours, pricing.materialCost, pricing.timeCost, pricing.colorCost, pricing.finishCost,
          pricing.subtotal, pricing.taxAmount, pricing.totalAmount,
          shipping_name || null, shipping_phone || null, shipping_address1 || null,
          shipping_city || null, shipping_state || null, shipping_pincode || null,
          payment_method, payment_method === "cod" ? "pending" : "pending",
          notes || null,
        ]
      );
    } catch (insertErr) {
      // Older DBs without time columns — fall back to legacy insert
      if (insertErr && (insertErr.code === "ER_BAD_FIELD_ERROR" || /Unknown column/i.test(insertErr.message || ""))) {
        [result] = await db.query(
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
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            req.user.id, orderNumber, "confirmed",
            file_name, file_url, file_public_id || null, file_size || null,
            dimension_x || null, dimension_y || null, dimension_z || null,
            material_id, color_id || null, custom_color_hex || null,
            parseInt(infill_density), surface_finish, parseInt(quantity),
            pricing.effectiveWeight, pricing.materialCost, pricing.colorCost, pricing.finishCost,
            pricing.subtotal, pricing.taxAmount, pricing.totalAmount,
            shipping_name || null, shipping_phone || null, shipping_address1 || null,
            shipping_city || null, shipping_state || null, shipping_pincode || null,
            payment_method, payment_method === "cod" ? "pending" : "pending",
            notes || null,
          ]
        );
      } else {
        throw insertErr;
      }
    }

    // COD print orders are payable on delivery → auto-create Delhivery
    // shipment (fire-and-forget; prepaid hooks in verify-payment).
    if (payment_method === "cod") {
      triggerAutoShipment("print", result.insertId);
      // GST invoice email for the 3D-print purchase.
      mailPrintInvoiceByIds([result.insertId], { template: "cod" }).catch(() => {});
    }

    return res.status(201).json({
      success: true,
      message: "3D print order placed successfully",
      order: {
        id: result.insertId,
        order_number: orderNumber,
        total_amount: pricing.totalAmount,
        estimated_delivery: "3-5 Working Days",
      },
    });
  } catch (error) {
    console.error("Create print order error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ===================== GET USER PRINT ORDERS ===================== */
const getUserPrintOrders = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const [countResult] = await db.query(
      "SELECT COUNT(*) as total FROM printing_orders WHERE user_id = ?",
      [req.user.id]
    );

    const [orders] = await db.query(
      `SELECT po.*, pm.name as material_name, pc.name as color_name, pc.hex_code
       FROM printing_orders po
       JOIN printing_materials pm ON po.material_id = pm.id
       LEFT JOIN printing_colors pc ON po.color_id = pc.id
       WHERE po.user_id = ?
       ORDER BY po.created_at DESC
       LIMIT ? OFFSET ?`,
      [req.user.id, parseInt(limit), offset]
    );

    const ordersWithTimeline = orders.map((o) => ({
      ...o,
      timeline: buildPrintTimeline(o),
    }));

    return res.status(200).json({
      success: true,
      orders: ordersWithTimeline,
      pagination: {
        total: countResult[0].total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(countResult[0].total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("Get user print orders error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ===================== GET PRINT ORDER BY ID ===================== */
const getPrintOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    // Support lookup by numeric id or order_number (e.g. 3DABC123)
    const isNumeric = /^\d+$/.test(String(id).trim());
    const queryField = isNumeric ? "po.id = ?" : "po.order_number = ?";

    const [orders] = await db.query(
      `SELECT po.*, pm.name as material_name, pm.price_per_gram,
              pc.name as color_name, pc.hex_code
       FROM printing_orders po
       JOIN printing_materials pm ON po.material_id = pm.id
       LEFT JOIN printing_colors pc ON po.color_id = pc.id
       WHERE ${queryField} AND po.user_id = ?`,
      [String(id).trim(), req.user.id]
    );

    if (orders.length === 0) {
      return res.status(404).json({ success: false, message: "Print order not found" });
    }

    const order = orders[0];
    order.timeline = buildPrintTimeline(order);

    // Delhivery / courier shipping block + tracking history (best-effort)
    order.shipping = {
      provider: order.shipping_provider || (order.delhivery_awb ? "delhivery" : null),
      awb: order.delhivery_awb || null,
      carrier: order.delhivery_awb ? "Delhivery" : null,
      shipping_status: order.shipping_status || null,
      shipment_created_at: order.shipment_created_at || null,
      shipping_synced_at: order.shipping_synced_at || null,
    };
    try {
      const { getEvents } = require("./shippingControllers");
      order.shipping_events = await getEvents("print", order.id);
    } catch {
      order.shipping_events = [];
    }

    return res.status(200).json({ success: true, order });
  } catch (error) {
    console.error("Get print order by ID error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ===================== GET PRINT ORDER INVOICE (JSON / PDF) ===================== */
const getPrintOrderInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const isNumeric = /^\d+$/.test(String(id).trim());
    const queryField = isNumeric ? "po.id = ?" : "po.order_number = ?";

    const [rows] = await db.query(
      `SELECT po.*, pm.name as material_name, pc.name as color_name,
              u.first_name, u.last_name, u.email as customer_email
       FROM printing_orders po
       LEFT JOIN printing_materials pm ON po.material_id = pm.id
       LEFT JOIN printing_colors pc ON po.color_id = pc.id
       JOIN users u ON po.user_id = u.id
       WHERE ${queryField} AND po.user_id = ?`,
      [String(id).trim(), req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "Print order not found" });
    }

    const {
      getInvoiceSettings,
      buildPrintInvoiceData,
      generateInvoicePdf,
      invoiceFileName,
    } = require("../utils/invoice");
    const settings = await getInvoiceSettings();
    const data = buildPrintInvoiceData({ prints: rows, settings });

    // ?format=pdf → download the GST invoice PDF.
    if (String(req.query.format || "").toLowerCase() === "pdf") {
      const pdf = await generateInvoicePdf(data);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${invoiceFileName(data)}"`);
      res.setHeader("Content-Length", pdf.length);
      return res.send(pdf);
    }

    return res.status(200).json({
      success: true,
      invoice: {
        invoice_number: data.invoiceNumber,
        invoice_date: data.invoiceDate,
        order_number: rows[0].order_number,
        company: {
          name: settings.company.name,
          address: settings.company.address,
          gstin: settings.company.gstin,
          email: settings.company.email,
          phone: settings.company.phone,
        },
        customer: data.customer,
        lines: data.lines,
        financials: {
          subtotal: data.subtotal,
          discount: data.discount,
          gst_rate: `${data.gstRate}%`,
          tax_amount: data.taxTotal,
          grand_total: data.grandTotal,
          amount_in_words: data.amountWords,
        },
        payment: data.payment,
      },
    });
  } catch (error) {
    console.error("Get print invoice error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = {
  uploadPrintFile,
  getPrintingConfig,
  getMaterials,
  getColors,
  calculatePrice,
  createPrintOrder,
  getUserPrintOrders,
  getPrintOrderById,
  getPrintOrderInvoice,
};
