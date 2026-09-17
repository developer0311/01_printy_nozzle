const db = require("../../config/db");

/* ===================== GET ALL 3D PRINT ORDERS ===================== */
const getAllPrintOrders = async (req, res) => {
  try {
    const { page = 1, limit = 20, status = "", payment_status = "", search = "" } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let whereClauses = ["1=1"];
    let params = [];

    if (status) {
      whereClauses.push("po.status = ?");
      params.push(status);
    }

    if (payment_status) {
      whereClauses.push("po.payment_status = ?");
      params.push(payment_status);
    }

    if (search) {
      whereClauses.push("(po.order_number LIKE ? OR po.file_name LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ?)");
      const term = `%${search}%`;
      params.push(term, term, term, term, term);
    }

    const whereSql = whereClauses.join(" AND ");

    const [countRes] = await db.query(
      `SELECT COUNT(*) AS total
       FROM printing_orders po
       LEFT JOIN users u ON po.user_id = u.id
       WHERE ${whereSql}`,
      params
    );
    const total = countRes[0].total;

    const [orders] = await db.query(
      `SELECT po.*,
              u.first_name, u.last_name, u.email, u.phone AS user_phone,
              m.name AS material_name,
              c.name AS color_name, c.hex_code AS color_hex
       FROM printing_orders po
       LEFT JOIN users u ON po.user_id = u.id
       LEFT JOIN printing_materials m ON po.material_id = m.id
       LEFT JOIN printing_colors c ON po.color_id = c.id
       WHERE ${whereSql}
       ORDER BY po.id DESC
       LIMIT ? OFFSET ?`,
      [...params, Number(limit), Number(offset)]
    );

    return res.status(200).json({
      success: true,
      data: {
        orders,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          totalPages: Math.ceil(total / Number(limit)),
        },
      },
    });
  } catch (error) {
    console.error("Admin getAllPrintOrders error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ===================== GET PRINT ORDER DETAILS ===================== */
const getPrintOrderDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const [orders] = await db.query(
      `SELECT po.*,
              u.first_name, u.last_name, u.email, u.phone AS user_phone,
              m.name AS material_name, m.density_g_cm3, m.price_per_gram,
              c.name AS color_name, c.hex_code AS color_hex
       FROM printing_orders po
       LEFT JOIN users u ON po.user_id = u.id
       LEFT JOIN printing_materials m ON po.material_id = m.id
       LEFT JOIN printing_colors c ON po.color_id = c.id
       WHERE po.id = ?`,
      [id]
    );

    if (orders.length === 0) {
      return res.status(404).json({ success: false, message: "3D print order not found" });
    }

    return res.status(200).json({ success: true, data: orders[0] });
  } catch (error) {
    console.error("Admin getPrintOrderDetails error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ===================== UPDATE PRINT ORDER STATUS ===================== */
const updatePrintOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, order_status, payment_status, tracking_number, shipping_carrier, admin_notes } = req.body;
    const nextStatus = status || order_status;

    const [existing] = await db.query("SELECT * FROM printing_orders WHERE id = ?", [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: "3D print order not found" });
    }

    await db.query(
      `UPDATE printing_orders SET
         status = COALESCE(?, status),
         payment_status = COALESCE(?, payment_status),
         admin_notes = COALESCE(?, admin_notes)
       WHERE id = ?`,
      [
        nextStatus || null,
        payment_status || null,
        admin_notes || null,
        id,
      ]
    );

    return res.status(200).json({ success: true, message: "Print order status updated" });
  } catch (error) {
    console.error("Admin updatePrintOrderStatus error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ===================== MATERIALS MANAGEMENT ===================== */
const getAllMaterials = async (req, res) => {
  try {
    const [materials] = await db.query("SELECT * FROM printing_materials ORDER BY id ASC");
    return res.status(200).json({ success: true, data: materials });
  } catch (error) {
    console.error("Admin getAllMaterials error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const createMaterial = async (req, res) => {
  try {
    const { name, code, slug, description, price_per_gram, density_g_cm3, is_active } = req.body;

    if (!name || !code || !price_per_gram) {
      return res.status(400).json({ success: false, message: "Name, code, and price per gram are required" });
    }

    const [result] = await db.query(
      "INSERT INTO printing_materials (name, slug, code, description, price_per_gram, density_g_cm3, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [name, (slug || name).toLowerCase().replace(/\s+/g, "-"), code.toUpperCase(), description || null, price_per_gram, density_g_cm3 || 1.24, is_active !== undefined ? (is_active ? 1 : 0) : 1]
    );

    return res.status(201).json({ success: true, message: "Material created", data: { materialId: result.insertId } });
  } catch (error) {
    console.error("Admin createMaterial error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const updateMaterial = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, code, description, price_per_gram, density_g_cm3, is_active } = req.body;

    const [result] = await db.query(
      `UPDATE printing_materials SET
         name = COALESCE(?, name),
         code = COALESCE(?, code),
         description = COALESCE(?, description),
         price_per_gram = COALESCE(?, price_per_gram),
         density_g_cm3 = COALESCE(?, density_g_cm3),
         is_active = COALESCE(?, is_active)
       WHERE id = ?`,
      [
        name || null,
        code ? code.toUpperCase() : null,
        description !== undefined ? description : null,
        price_per_gram || null,
        density_g_cm3 || null,
        is_active !== undefined ? (is_active ? 1 : 0) : null,
        id,
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Material not found" });
    }

    return res.status(200).json({ success: true, message: "Material updated successfully" });
  } catch (error) {
    console.error("Admin updateMaterial error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const deleteMaterial = async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await db.query("DELETE FROM printing_materials WHERE id = ?", [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Material not found" });
    }

    return res.status(200).json({ success: true, message: "Material deleted successfully" });
  } catch (error) {
    console.error("Admin deleteMaterial error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ===================== COLORS MANAGEMENT ===================== */
const getAllColors = async (req, res) => {
  try {
    const [colors] = await db.query("SELECT * FROM printing_colors ORDER BY id ASC");
    return res.status(200).json({ success: true, data: colors });
  } catch (error) {
    console.error("Admin getAllColors error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const createColor = async (req, res) => {
  try {
    const { name, hex_code, is_active } = req.body;

    if (!name || !hex_code) {
      return res.status(400).json({ success: false, message: "Name and hex code are required" });
    }

    const [result] = await db.query(
      "INSERT INTO printing_colors (name, hex_code, is_active) VALUES (?, ?, ?)",
      [name, hex_code, is_active !== undefined ? (is_active ? 1 : 0) : 1]
    );

    return res.status(201).json({ success: true, message: "Color created", data: { colorId: result.insertId } });
  } catch (error) {
    console.error("Admin createColor error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const updateColor = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, hex_code, is_active } = req.body;

    const [result] = await db.query(
      `UPDATE printing_colors SET
         name = COALESCE(?, name),
         hex_code = COALESCE(?, hex_code),
         is_active = COALESCE(?, is_active)
       WHERE id = ?`,
      [name || null, hex_code || null, is_active !== undefined ? (is_active ? 1 : 0) : null, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Color not found" });
    }

    return res.status(200).json({ success: true, message: "Color updated successfully" });
  } catch (error) {
    console.error("Admin updateColor error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const deleteColor = async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await db.query("DELETE FROM printing_colors WHERE id = ?", [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Color not found" });
    }

    return res.status(200).json({ success: true, message: "Color deleted successfully" });
  } catch (error) {
    console.error("Admin deleteColor error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ===================== GET PRINT ORDER INVOICE (ADMIN, JSON / PDF) ===================== */
const getPrintOrderInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const isNumeric = /^\d+$/.test(String(id).trim());
    const queryField = isNumeric ? "po.id = ?" : "po.order_number = ?";

    const [rows] = await db.query(
      `SELECT po.*,
              u.first_name, u.last_name, u.email AS customer_email, u.phone AS user_phone,
              m.name AS material_name, c.name AS color_name, c.hex_code AS color_hex
       FROM printing_orders po
       LEFT JOIN users u ON po.user_id = u.id
       LEFT JOIN printing_materials m ON po.material_id = m.id
       LEFT JOIN printing_colors c ON po.color_id = c.id
       WHERE ${queryField}`,
      [String(id).trim()]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "3D print order not found" });
    }

    const {
      getInvoiceSettings,
      buildPrintInvoiceData,
      generateInvoicePdf,
      invoiceFileName,
    } = require("../../utils/invoice");
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
    console.error("Admin getPrintOrderInvoice error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = {
  getAllPrintOrders,
  getPrintOrderDetails,
  getPrintOrderInvoice,
  updatePrintOrderStatus,
  getAllMaterials,
  createMaterial,
  updateMaterial,
  deleteMaterial,
  getAllColors,
  createColor,
  updateColor,
  deleteColor,
};
