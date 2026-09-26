const db = require("../../config/db");
const {
  getInvoiceSettings,
  buildManualInvoiceData,
  generateInvoicePdf,
  invoiceFileName,
} = require("../../utils/invoice");
const { triggerAutoShipment } = require("../../utils/shippingSync");
const { mailOrderInvoiceById } = require("../../utils/mailer");

/* ===================== MANUAL INVOICES (ADMIN, SAVED IN DB) =====================
 * Offline / phone orders. Every invoice is stored in `manual_invoices` +
 * `manual_invoice_items`, the invoice number is always auto-generated
 * (INV-YYYY-NNNN from the row id) and the PDF renders from the saved row.
 *
 * POST   /api/admin/orders/manual-invoices        save + stream PDF
 * GET    /api/admin/orders/manual-invoices        list (search/page/limit)
 * GET    /api/admin/orders/manual-invoices/:id    detail with items
 * GET    /api/admin/orders/manual-invoices/:id/pdf  download PDF
 * DELETE /api/admin/orders/manual-invoices/:id    delete */

const { ensureManualInvoiceSchema } = require("../../utils/manualInvoiceSchema");

const manualStr = (v) => (v === undefined || v === null ? "" : String(v).trim());

const validateManualPayload = (body = {}) => {
  const {
    customer = {},
    shipping = null,
    shippingSameAsBilling = true,
    gstRate = 18,
    items = [],
  } = body;

  if (!manualStr(customer.name)) return "Customer name is required";
  if (!manualStr(customer.phone)) return "Customer phone is required";
  if (!manualStr(customer.address1)) return "Customer address is required";
  if (!manualStr(customer.city)) return "Customer city is required";
  if (!manualStr(customer.state)) return "Customer state is required";
  if (!manualStr(customer.pincode)) return "Customer pincode is required";

  if (!shippingSameAsBilling && shipping) {
    for (const [key, label] of [
      ["name", "Shipping name"],
      ["phone", "Shipping phone"],
      ["address1", "Shipping address"],
      ["city", "Shipping city"],
      ["state", "Shipping state"],
      ["pincode", "Shipping pincode"],
    ]) {
      if (!manualStr(shipping[key])) return `${label} is required`;
    }
  }

  if (!Array.isArray(items) || items.length === 0) return "Add at least one item";
  if (items.length > 100) return "Maximum 100 items per invoice";
  for (let i = 0; i < items.length; i++) {
    const it = items[i] || {};
    if (!["product", "print", "custom"].includes(it.item_type || "product")) {
      return `Item ${i + 1}: unknown item type`;
    }
    if ((it.item_type || "product") === "print" && !manualStr(it.file_name) && !manualStr(it.description)) {
      return `Item ${i + 1}: file name or description is required for a 3D print`;
    }
    if ((it.item_type || "product") !== "print" && !manualStr(it.description)) {
      return `Item ${i + 1}: description is required`;
    }
    if (!(Number(it.rate) >= 0)) return `Item ${i + 1}: enter a valid rate`;
    if (!(Number(it.qty) > 0)) return `Item ${i + 1}: quantity must be above 0`;
    if (it.disc !== undefined && it.disc !== "" && !(Number(it.disc) >= 0)) {
      return `Item ${i + 1}: enter a valid discount`;
    }
  }

  const rateNum = Number(gstRate);
  if (!(rateNum >= 0 && rateNum <= 100)) return "GST rate must be between 0 and 100";
  return null;
};

/* Map a saved DB row (+ items) back into the invoice-data builder input. */
const savedRowToInvoiceInput = (row, items) => ({
  customer: {
    name: row.customer_name,
    email: row.customer_email,
    phone: row.customer_phone,
    address1: row.billing_address1,
    address2: row.billing_address2,
    city: row.billing_city,
    state: row.billing_state,
    pincode: row.billing_pincode,
    country: row.billing_country,
  },
  shipping: row.shipping_same
    ? null
    : {
        name: row.shipping_name,
        email: row.shipping_email,
        phone: row.shipping_phone,
        address1: row.shipping_address1,
        address2: row.shipping_address2,
        city: row.shipping_city,
        state: row.shipping_state,
        pincode: row.shipping_pincode,
        country: row.shipping_country,
      },
  shippingSameAsBilling: Boolean(row.shipping_same),
  invoice: {
    number: row.invoice_number,
    date: row.invoice_date,
    saleOrder: row.sale_order,
    reference: row.reference,
  },
  gstRate: Number(row.gst_rate),
  items: (items || []).map((it) => ({
    item_type: it.item_type,
    description: it.description,
    hsn: it.hsn,
    rate: Number(it.rate),
    qty: Number(it.qty),
    disc: Number(it.disc),
  })),
  shippingCost: Number(row.shipping_cost),
  deliveryOption: row.delivery_option,
  discount: Number(row.discount),
  payment: { methodLabel: row.payment_method, status: row.payment_status },
});

const createManualInvoice = async (req, res) => {
  try {
    await ensureManualInvoiceSchema().catch(() => {});

    const {
      customer = {},
      shipping = null,
      shippingSameAsBilling = true,
      invoice = {},
      gstRate = 18,
      items = [],
      shippingCost = 0,
      deliveryOption = "standard",
      discount = 0,
      payment = {},
    } = req.body || {};

    const validationError = validateManualPayload(req.body || {});
    if (validationError) {
      return res.status(400).json({ success: false, message: validationError });
    }

    const settings = await getInvoiceSettings();

    // Compute lines/totals with the shared engine (preview numbering).
    const preview = buildManualInvoiceData({
      customer,
      shipping,
      shippingSameAsBilling: shippingSameAsBilling !== false,
      invoice: {},
      gstRate: Number(gstRate),
      items: items.map((it) => ({
        ...it,
        description:
          manualStr(it.description) ||
          (manualStr(it.file_name)
            ? `3D Print: ${manualStr(it.file_name)}${manualStr(it.material_name) ? ` — ${manualStr(it.material_name)}` : ""}`
            : `Item`),
      })),
      shippingCost,
      deliveryOption,
      discount,
      payment,
      settings,
    });
    if (!preview.lines.length) {
      return res.status(400).json({ success: false, message: "Add at least one item" });
    }

    const sameAsBilling = shippingSameAsBilling !== false;
    const connection = await db.getConnection();
    let invoiceId;
    try {
      await connection.beginTransaction();

      const [headResult] = await connection.query(
        `INSERT INTO manual_invoices
          (invoice_number, invoice_date, sale_order, reference,
           customer_name, customer_email, customer_phone,
           billing_address1, billing_address2, billing_city, billing_state, billing_pincode, billing_country,
           shipping_same, shipping_name, shipping_email, shipping_phone,
           shipping_address1, shipping_address2, shipping_city, shipping_state, shipping_pincode, shipping_country,
           gst_rate, subtotal, tax_total, discount, shipping_cost, grand_total,
           delivery_option, payment_method, payment_status, amount_in_words, created_by)
         VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          invoice.date || new Date().toISOString().slice(0, 10),
          manualStr(invoice.saleOrder) || null,
          manualStr(invoice.reference) || null,
          manualStr(customer.name),
          manualStr(customer.email) || null,
          manualStr(customer.phone),
          manualStr(customer.address1),
          manualStr(customer.address2) || null,
          manualStr(customer.city),
          manualStr(customer.state),
          manualStr(customer.pincode),
          manualStr(customer.country) || "India",
          sameAsBilling ? 1 : 0,
          sameAsBilling ? null : manualStr(shipping?.name) || null,
          sameAsBilling ? null : manualStr(shipping?.email) || null,
          sameAsBilling ? null : manualStr(shipping?.phone) || null,
          sameAsBilling ? null : manualStr(shipping?.address1) || null,
          sameAsBilling ? null : manualStr(shipping?.address2) || null,
          sameAsBilling ? null : manualStr(shipping?.city) || null,
          sameAsBilling ? null : manualStr(shipping?.state) || null,
          sameAsBilling ? null : manualStr(shipping?.pincode) || null,
          sameAsBilling ? null : manualStr(shipping?.country) || "India",
          Number(gstRate),
          preview.subtotal,
          preview.taxTotal,
          preview.discount,
          Number(shippingCost) || 0,
          preview.grandTotal,
          manualStr(deliveryOption) || "standard",
          manualStr(payment.methodLabel) || manualStr(payment.method) || "Cash",
          (manualStr(payment.status) || "PAID").toUpperCase(),
          preview.amountWords,
          req.user?.id || null,
        ]
      );
      invoiceId = headResult.insertId;

      // Automatic invoice number from the row id — unique, sequential, DB-backed.
      const year = new Date().getFullYear();
      const invoiceNumber = `INV-${year}-${String(invoiceId).padStart(4, "0")}`;
      const saleOrder = manualStr(invoice.saleOrder) || invoiceNumber.replace(/^INV-/, "");
      const reference = manualStr(invoice.reference) || invoiceNumber;
      await connection.query(
        "UPDATE manual_invoices SET invoice_number = ?, sale_order = ?, reference = ? WHERE id = ?",
        [invoiceNumber, saleOrder, reference, invoiceId]
      );

      // Resolve product ids (ignore unknown ids instead of failing the invoice).
      let lineIndex = 0;
      for (const it of items) {
        const line = preview.lines[lineIndex];
        lineIndex += 1;
        let productId = null;
        if (it.product_id) {
          try {
            const [found] = await connection.query("SELECT id FROM products WHERE id = ?", [it.product_id]);
            if (found.length) productId = it.product_id;
          } catch {
            productId = null;
          }
        }
        await connection.query(
          `INSERT INTO manual_invoice_items
            (invoice_id, item_type, product_id, description, hsn, rate, qty, disc,
             amount, tax, total, file_name, material_name, color_name, infill_density,
             surface_finish, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            invoiceId,
            ["product", "print", "custom"].includes(it.item_type) ? it.item_type : "product",
            productId,
            line.description,
            line.hsn,
            line.rate,
            line.qty,
            line.disc,
            line.amount,
            line.tax,
            line.total,
            manualStr(it.file_name) || null,
            manualStr(it.material_name) || null,
            manualStr(it.color_name) || null,
            it.infill_density ? Number(it.infill_density) : null,
            manualStr(it.surface_finish) || null,
            line.sno,
          ]
        );
      }

      await connection.commit();
    } catch (e) {
      try {
        await connection.rollback();
      } catch {
        /* ignore */
      }
      connection.release();
      throw e;
    }
    connection.release();

    // Rebuild the PDF from the saved row so file and DB can never diverge.
    const [rows] = await db.query("SELECT * FROM manual_invoices WHERE id = ?", [invoiceId]);
    const [savedItems] = await db.query(
      "SELECT * FROM manual_invoice_items WHERE invoice_id = ? ORDER BY sort_order ASC, id ASC",
      [invoiceId]
    );
    const data = buildManualInvoiceData({ ...savedRowToInvoiceInput(rows[0], savedItems), settings });
    const pdf = await generateInvoicePdf(data);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${invoiceFileName(data)}"`);
    res.setHeader("Content-Length", pdf.length);
    return res.send(pdf);
  } catch (error) {
    console.error("Admin createManualInvoice error:", error);
    return res.status(500).json({ success: false, message: "Unable to save invoice" });
  }
};

/* ===================== LIST MANUAL INVOICES ===================== */
const listManualInvoices = async (req, res) => {
  try {
    await ensureManualInvoiceSchema().catch(() => {});
    const { page = 1, limit = 20, search = "" } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let where = "1=1";
    const params = [];
    if (search) {
      where += " AND (m.invoice_number LIKE ? OR m.customer_name LIKE ? OR m.customer_phone LIKE ?)";
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM manual_invoices m WHERE ${where}`, params);
    const [rows] = await db.query(
      `SELECT m.*, (SELECT COUNT(*) FROM manual_invoice_items WHERE invoice_id = m.id) AS item_count
       FROM manual_invoices m WHERE ${where}
       ORDER BY m.id DESC LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset]
    );

    return res.status(200).json({
      success: true,
      data: {
        invoices: rows,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          totalPages: Math.ceil(total / Number(limit)),
        },
      },
    });
  } catch (error) {
    console.error("Admin listManualInvoices error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ===================== MANUAL INVOICE DETAIL ===================== */
const getManualInvoice = async (req, res) => {
  try {
    await ensureManualInvoiceSchema().catch(() => {});
    const { id } = req.params;
    const [rows] = await db.query("SELECT * FROM manual_invoices WHERE id = ?", [id]);
    if (!rows.length) {
      return res.status(404).json({ success: false, message: "Invoice not found" });
    }
    const [items] = await db.query(
      "SELECT * FROM manual_invoice_items WHERE invoice_id = ? ORDER BY sort_order ASC, id ASC",
      [id]
    );
    return res.status(200).json({ success: true, data: { ...rows[0], items } });
  } catch (error) {
    console.error("Admin getManualInvoice error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ===================== MANUAL INVOICE PDF ===================== */
const downloadManualInvoicePdf = async (req, res) => {
  try {
    await ensureManualInvoiceSchema().catch(() => {});
    const { id } = req.params;
    const [rows] = await db.query("SELECT * FROM manual_invoices WHERE id = ?", [id]);
    if (!rows.length) {
      return res.status(404).json({ success: false, message: "Invoice not found" });
    }
    const [items] = await db.query(
      "SELECT * FROM manual_invoice_items WHERE invoice_id = ? ORDER BY sort_order ASC, id ASC",
      [id]
    );
    const settings = await getInvoiceSettings();
    const data = buildManualInvoiceData({ ...savedRowToInvoiceInput(rows[0], items), settings });
    const pdf = await generateInvoicePdf(data);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${invoiceFileName(data)}"`);
    res.setHeader("Content-Length", pdf.length);
    return res.send(pdf);
  } catch (error) {
    console.error("Admin downloadManualInvoicePdf error:", error);
    return res.status(500).json({ success: false, message: "Unable to generate invoice" });
  }
};

/* ===================== DELETE MANUAL INVOICE ===================== */
const deleteManualInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query("SELECT id FROM manual_invoices WHERE id = ?", [id]);
    if (!rows.length) {
      return res.status(404).json({ success: false, message: "Invoice not found" });
    }
    await db.query("DELETE FROM manual_invoices WHERE id = ?", [id]);
    return res.status(200).json({ success: true, message: "Invoice deleted" });
  } catch (error) {
    console.error("Admin deleteManualInvoice error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ===================== GET ALL ORDERS (ADMIN) ===================== */
const getAllOrders = async (req, res) => {
  try {
    const { page = 1, limit = 20, status = "", payment_status = "", search = "", from_date = "", to_date = "" } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let whereClauses = ["1=1"];
    let params = [];

    if (status) {
      whereClauses.push("o.status = ?");
      params.push(status);
    }

    if (payment_status) {
      whereClauses.push("o.payment_status = ?");
      params.push(payment_status);
    }

    if (search) {
      whereClauses.push("(o.order_number LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ? OR o.shipping_phone LIKE ?)");
      const term = `%${search}%`;
      params.push(term, term, term, term, term);
    }

    if (from_date) {
      whereClauses.push("o.created_at >= ?");
      params.push(from_date);
    }

    if (to_date) {
      whereClauses.push("o.created_at <= ?");
      params.push(`${to_date} 23:59:59`);
    }

    const whereSql = whereClauses.join(" AND ");

    const runOrdersQuery = (extraWhere) =>
      db.query(
        `SELECT o.*,
                u.first_name, u.last_name, u.email,
                (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) AS item_count
         FROM orders o
         LEFT JOIN users u ON o.user_id = u.id
         WHERE ${whereSql}${extraWhere}
         ORDER BY o.id DESC
         LIMIT ? OFFSET ?`,
        [...params, Number(limit), Number(offset)]
      );

    const runCountQuery = (extraWhere) =>
      db.query(
        `SELECT COUNT(*) AS total
         FROM orders o
         LEFT JOIN users u ON o.user_id = u.id
         WHERE ${whereSql}${extraWhere}`,
        params
      );

    // Pure 3D-print checkouts live only in printing_orders — keep them out
    // of the product Orders list. Fall back gracefully on legacy DBs that
    // lack the order_items.item_type column.
    const printOnlyExclusion = ` AND NOT (
      EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id)
      AND NOT EXISTS (
        SELECT 1 FROM order_items oi
        WHERE oi.order_id = o.id AND (oi.item_type IS NULL OR oi.item_type <> 'print')
      )
    )`;

    let orders;
    let total;
    try {
      const [countRes] = await runCountQuery(printOnlyExclusion);
      total = countRes[0].total;
      [orders] = await runOrdersQuery(printOnlyExclusion);
    } catch (exclusionError) {
      if (exclusionError && (exclusionError.code === "ER_BAD_FIELD_ERROR" || /Unknown column/i.test(exclusionError.message || ""))) {
        const [countRes] = await runCountQuery("");
        total = countRes[0].total;
        [orders] = await runOrdersQuery("");
      } else {
        throw exclusionError;
      }
    }

    // Attach a compact item list for the admin table (thumbnails + names).
    if (orders.length) {
      try {
        const [items] = await db.query(
          `SELECT order_id, product_name, product_image, quantity, price
           FROM order_items WHERE order_id IN (${orders.map(() => "?").join(",")})
           ORDER BY order_id DESC, id ASC`,
          orders.map((o) => o.id)
        );
        const byOrder = {};
        items.forEach((it) => {
          (byOrder[it.order_id] = byOrder[it.order_id] || []).push(it);
        });
        orders.forEach((o) => {
          o.items = byOrder[o.id] || [];
        });
      } catch {
        orders.forEach((o) => {
          o.items = [];
        });
      }
    }

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
    console.error("Admin getAllOrders error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ===================== GET ORDER DETAILS (ADMIN) ===================== */
const getOrderDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const [orders] = await db.query(
      `SELECT o.*, u.first_name, u.last_name, u.email, u.phone AS user_phone
       FROM orders o
       LEFT JOIN users u ON o.user_id = u.id
       WHERE o.id = ?`,
      [id]
    );

    if (orders.length === 0) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const order = orders[0];

    // Order items
    const [items] = await db.query(
      `SELECT oi.*, p.slug,
              (SELECT image_url FROM product_images WHERE product_id = oi.product_id AND is_primary = 1 LIMIT 1) AS image_url
       FROM order_items oi
       LEFT JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = ?`,
      [id]
    );
    order.items = items;

    return res.status(200).json({ success: true, data: order });
  } catch (error) {
    console.error("Admin getOrderDetails error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ===================== UPDATE ORDER STATUS ===================== */
const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, order_status, payment_status, tracking_number, shipping_carrier, notes } = req.body;
    const nextStatus = status || order_status;

    const [existing] = await db.query("SELECT * FROM orders WHERE id = ?", [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    await db.query(
      `UPDATE orders SET
         status = COALESCE(?, status),
         payment_status = COALESCE(?, payment_status),
         tracking_number = COALESCE(?, tracking_number),
         shipping_carrier = COALESCE(?, shipping_carrier),
         notes = COALESCE(?, notes)
       WHERE id = ?`,
      [
        nextStatus || null,
        payment_status || null,
        tracking_number || null,
        shipping_carrier || null,
        notes || null,
        id,
      ]
    );

    return res.status(200).json({ success: true, message: "Order updated successfully" });
  } catch (error) {
    console.error("Admin updateOrderStatus error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ===================== VERIFY QR PAYMENT =====================
 * PUT /api/admin/orders/:id/verify-payment { verified: true|false }
 * Approve → payment paid + shipment auto-created + confirmation invoice mail.
 * Reject → payment failed (customer can be asked to retry). */
const verifyQrPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { verified } = req.body;

    const [existing] = await db.query("SELECT * FROM orders WHERE id = ?", [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }
    if (existing[0].payment_method !== "qr") {
      return res.status(400).json({ success: false, message: "Only QR orders can be verified here" });
    }

    if (verified) {
      await db.query("UPDATE orders SET payment_status = 'paid' WHERE id = ?", [id]);
      triggerAutoShipment("order", Number(id));
      mailOrderInvoiceById(Number(id)).catch(() => {});
      return res.status(200).json({ success: true, message: "QR payment approved — order confirmed" });
    }

    await db.query("UPDATE orders SET payment_status = 'failed' WHERE id = ?", [id]);
    return res.status(200).json({ success: true, message: "QR payment rejected" });
  } catch (error) {
    console.error("Admin verifyQrPayment error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = {
  getAllOrders,
  getOrderDetails,
  updateOrderStatus,
  verifyQrPayment,
  createManualInvoice,
  listManualInvoices,
  getManualInvoice,
  downloadManualInvoicePdf,
  deleteManualInvoice,
};
