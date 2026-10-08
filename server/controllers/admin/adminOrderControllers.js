const db = require("../../config/db");
const crypto = require("crypto");
const {
  getInvoiceSettings,
  buildManualInvoiceData,
  generateInvoicePdf,
  invoiceFileName,
  manualInvoiceFileName,
} = require("../../utils/invoice");
const { triggerAutoShipment } = require("../../utils/shippingSync");
const { mailOrderInvoiceById } = require("../../utils/mailer");
const { ensurePrintQuotationSchema } = require("../../utils/printQuotationSchema");

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
const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

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
  if (
    manualStr(customer.company_gstin || customer.gstin) &&
    !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(
      manualStr(customer.company_gstin || customer.gstin).toUpperCase()
    )
  ) {
    return "Enter a valid 15-character company GSTIN";
  }

  if (!shippingSameAsBilling && shipping) {
    for (const [key, label] of [
      ["name", "Shipping name"],
      ["phone", "Shipping phone"],
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
    for (const [key, label] of [
      ["filament_weight_grams", "filament weight"],
      ["print_time_hours", "print time"],
    ]) {
      if (it[key] !== undefined && it[key] !== null && it[key] !== "" && !(Number(it[key]) >= 0)) {
        return `Item ${i + 1}: enter a valid ${label}`;
      }
    }
  }

  const rateNum = Number(gstRate);
  if (!(rateNum >= 0 && rateNum <= 100)) return "GST rate must be between 0 and 100";
  if (body.amountPaid !== undefined && body.amountPaid !== null && String(body.amountPaid).trim() !== "" && !(Number(body.amountPaid) >= 0)) {
    return "Amount paid must be zero or more";
  }
  if (
    body.roundTotal !== undefined &&
    body.roundTotal !== null &&
    String(body.roundTotal).trim() !== "" &&
    !(Number(body.roundTotal) > 0)
  ) {
    return "Round figure must be a positive amount";
  }
  return null;
};

/* Map a saved DB row (+ items) back into the invoice-data builder input. */
const savedRowToInvoiceInput = (row, items) => ({
  customer: {
    name: row.customer_name,
    email: row.customer_email,
    phone: row.customer_phone,
    company_name: row.company_name,
    company_address: row.company_address,
    company_gstin: row.company_gstin,
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
  roundTotal: row.round_total,
  items: (items || []).map((it) => ({
    item_type: it.item_type,
    description: it.description,
    hsn: it.hsn,
    rate: Number(it.rate),
    qty: Number(it.qty),
    disc: Number(it.disc),
    filamentWeightGrams: it.filament_weight_grams != null && it.filament_weight_grams !== "" ? Number(it.filament_weight_grams) : null,
    printTimeHours: it.print_time_hours != null && it.print_time_hours !== "" ? Number(it.print_time_hours) : null,
  })),
  shippingCost: Number(row.shipping_cost),
  deliveryOption: row.delivery_option,
  discount: Number(row.discount),
  amountPaid: Number(row.amount_paid ?? 0),
  showSeal: row.show_seal === undefined || row.show_seal === null ? true : Number(row.show_seal) !== 0,
  payment: { methodLabel: row.payment_method, status: row.payment_status },
});

/* ===================== WHATSAPP QUOTATION → PRINT ORDER =====================
 * When a manual invoice is generated from a 3D-print quotation
 * (body.quotation_id), the admin-priced print line becomes a real
 * `printing_orders` row so it shows up under 3D Printing → 3D Printing
 * Orders. Runs inside the invoice transaction: any failure rolls the
 * whole invoice back with a clear message. */
const QUOTATION_PAY_METHOD = {
  UPI: "upi",
  Card: "card",
  "Net Banking": "net_banking",
  Wallet: "wallet",
  "Bank Transfer": "net_banking",
  Cash: "cod",
  "Cash on Delivery": "cod",
};

const linkQuotationToPrintOrder = async ({
  connection,
  quotationId,
  items,
  preview,
  customer,
  invoiceNumber,
  payment,
  invoiceId,
  gstRate = 18,
  roundFigure = null,
}) => {
  await ensurePrintQuotationSchema().catch(() => {});
  const [[quotation]] = await connection.query("SELECT * FROM print_quotations WHERE id = ?", [quotationId]);
  if (!quotation) {
    throw Object.assign(new Error("Linked quotation not found. Please refresh the quotations list."), { status: 404 });
  }
  if (quotation.status === "invoiced") {
    throw Object.assign(new Error(`Quotation #${quotationId} is already invoiced.`), { status: 400 });
  }
  const printIndices = (items || [])
    .map((it, idx) => ({ it, idx }))
    .filter(({ it }) => (it.item_type || "product") === "print")
    .map(({ idx }) => idx);
  if (!printIndices.length) {
    throw Object.assign(new Error("Add at least one 3D Print line item to invoice this quotation."), { status: 400 });
  }

  // Material must satisfy the printing_orders FK — prefer the quotation's,
  // fall back to the first active material.
  let materialId = Number(quotation.material_id) || null;
  if (materialId) {
    const [mrows] = await connection.query("SELECT id FROM printing_materials WHERE id = ? AND is_active = 1", [materialId]);
    if (!mrows.length) materialId = null;
  }
  if (!materialId) {
    const [mrows] = await connection.query("SELECT id FROM printing_materials WHERE is_active = 1 ORDER BY sort_order ASC LIMIT 1");
    if (!mrows.length) {
      throw Object.assign(new Error("No active printing material found for this order."), { status: 400 });
    }
    materialId = mrows[0].id;
  }
  let colorId = Number(quotation.color_id) || null;
  if (colorId) {
    const [crows] = await connection.query("SELECT id FROM printing_colors WHERE id = ?", [colorId]);
    if (!crows.length) colorId = null;
  }

  const payMethod = QUOTATION_PAY_METHOD[manualStr(payment?.methodLabel) || manualStr(payment?.method)] || "cod";
  const payStatus = (manualStr(payment?.status) || "PAID").toUpperCase() === "PAID" ? "paid" : "pending";
  const rate = Number(gstRate) || 0;

  // Price each print line. When the admin typed a round figure (final
  // GST-inclusive total), it is shared across the print lines in proportion
  // to their line totals — with everything going to the first print line
  // when the lines are blank — and GST is auto-split out of each share.
  const figNum = Number(roundFigure);
  const useFigure = Number.isFinite(figNum) && figNum > 0;
  const lineTotals = printIndices.map((i) => Number(preview.lines[i]?.total) || 0);
  const linesSum = lineTotals.reduce((s, v) => s + v, 0);
  const priced = printIndices.map((itemIdx, k) => {
    const src = preview.lines[itemIdx] || {};
    if (!useFigure) {
      return { itemIdx, amount: src.amount || 0, tax: src.tax || 0, total: src.total || 0, qty: Math.max(1, Number(src.qty) || 1) };
    }
    const share = linesSum > 0 ? lineTotals[k] / linesSum : k === 0 ? 1 : 0;
    const total = round2(figNum * share);
    const tax = rate > 0 ? round2((total * rate) / (100 + rate)) : 0;
    return { itemIdx, amount: round2(total - tax), tax, total, qty: Math.max(1, Number(src.qty) || 1) };
  });

  const custName = manualStr(customer.name) || quotation.customer_name;
  const custPhone = manualStr(customer.phone) || quotation.customer_phone;
  const custAddr1 = [manualStr(customer.address1), manualStr(customer.address2)].filter(Boolean).join(", ") || null;
  const finishFor = (itemIdx) =>
    ["standard", "smooth"].includes((items[itemIdx] || {}).surface_finish)
      ? items[itemIdx].surface_finish
      : "standard";

  let firstOrderId = null;
  for (const p of priced) {
    const orderNumber = "3D" + Date.now().toString(36).toUpperCase() + crypto.randomBytes(2).toString("hex").toUpperCase();
    const [orderRes] = await connection.query(
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
         company_name, company_address, company_gstin,
         payment_method, payment_status, notes
       ) VALUES (NULL, ?, 'confirmed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 50, ?, ?, NULL, NULL, ?, 0, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderNumber,
        quotation.file_name || "model",
        quotation.file_url,
        quotation.file_public_id || null,
        quotation.file_size ?? null,
        quotation.dimension_x ?? null,
        quotation.dimension_y ?? null,
        quotation.dimension_z ?? null,
        materialId,
        colorId,
        quotation.custom_color_hex || null,
        finishFor(p.itemIdx),
        p.qty,
        p.amount,
        p.amount,
        p.tax,
        p.total,
        custName,
        custPhone,
        custAddr1,
        manualStr(customer.city) || null,
        manualStr(customer.state) || null,
        manualStr(customer.pincode) || null,
        manualStr(customer.company_name || customer.company) || null,
        manualStr(customer.company_address || customer.companyAddress) || null,
        manualStr(customer.company_gstin || customer.gstin).toUpperCase() || null,
        payMethod,
        payStatus,
        `From WhatsApp quotation #${quotation.id} • Manual invoice ${invoiceNumber}`,
      ]
    );
    if (firstOrderId === null) firstOrderId = orderRes.insertId;
  }

  await connection.query(
    "UPDATE print_quotations SET status = 'invoiced', manual_invoice_id = ?, printing_order_id = ? WHERE id = ?",
    [invoiceId, firstOrderId, quotation.id]
  );
  return { orderId: firstOrderId, orderNumber: null };
};

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
      roundTotal = null,
      amountPaid = 0,
      showSeal = true,
      payment = {},
    } = req.body || {};

    const validationError = validateManualPayload(req.body || {});
    if (validationError) {
      return res.status(400).json({ success: false, message: validationError });
    }

    // Optional admin round figure — the invoice total becomes exactly this.
    const figureNum = Number(roundTotal);
    const roundFigure =
      Number.isFinite(figureNum) && figureNum > 0 ? Math.round(figureNum * 100) / 100 : null;

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
      roundTotal: roundFigure,
      amountPaid,
      showSeal: showSeal !== false,
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
           company_name, company_address, company_gstin,
           billing_address1, billing_address2, billing_city, billing_state, billing_pincode, billing_country,
           shipping_same, shipping_name, shipping_email, shipping_phone,
           shipping_address1, shipping_address2, shipping_city, shipping_state, shipping_pincode, shipping_country,
           gst_rate, subtotal, tax_total, discount, round_total, shipping_cost, grand_total, amount_paid, show_seal,
           delivery_option, payment_method, payment_status, amount_in_words, created_by)
          VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          invoice.date || new Date().toISOString().slice(0, 10),
          manualStr(invoice.saleOrder) || null,
          manualStr(invoice.reference) || null,
          manualStr(customer.name),
          manualStr(customer.email) || null,
          manualStr(customer.phone),
          manualStr(customer.company_name || customer.company) || null,
          manualStr(customer.company_address || customer.companyAddress) || null,
          manualStr(customer.company_gstin || customer.gstin).toUpperCase() || null,
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
          roundFigure,
          Number(shippingCost) || 0,
          preview.grandTotal,
          preview.amountPaid,
          showSeal !== false ? 1 : 0,
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
      // Stored download name: Invoice_<No>_Printynozzle_<Customer>_<Phone>.pdf
      const storedFileName = manualInvoiceFileName({
        invoiceNumber,
        customer: { name: manualStr(customer.name), phone: manualStr(customer.phone) },
      });
      await connection.query(
        "UPDATE manual_invoices SET invoice_number = ?, sale_order = ?, reference = ?, file_name = ? WHERE id = ?",
        [invoiceNumber, saleOrder, reference, storedFileName, invoiceId]
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
             filament_weight_grams, print_time_hours, surface_finish, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
            it.filament_weight_grams !== undefined && it.filament_weight_grams !== null && it.filament_weight_grams !== "" ? Number(it.filament_weight_grams) : null,
            it.print_time_hours !== undefined && it.print_time_hours !== null && it.print_time_hours !== "" ? Number(it.print_time_hours) : null,
            manualStr(it.surface_finish) || null,
            line.sno,
          ]
        );
      }

      // WhatsApp quotation → the priced print line becomes a real 3D print
      // order automatically (visible under 3D Printing → 3D Printing Orders).
      const quotationId = Number(req.body?.quotation_id) || null;
      if (quotationId) {
        await linkQuotationToPrintOrder({
          connection,
          quotationId,
          items,
          preview,
          customer,
          invoiceNumber,
          payment,
          invoiceId,
          gstRate: Number(gstRate),
          roundFigure,
        });
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
    res.setHeader("Content-Disposition", `attachment; filename="${rows[0].file_name || manualInvoiceFileName(data)}"`);
    res.setHeader("Content-Length", pdf.length);
    return res.send(pdf);
  } catch (error) {
    console.error("Admin createManualInvoice error:", error);
    const status = Number(error?.status) >= 400 && Number(error?.status) < 500 ? error.status : 500;
    return res.status(status).json({ success: false, message: status === 500 ? "Unable to save invoice" : error.message });
  }
};

/* ===================== UPDATE MANUAL INVOICE =====================
 * PUT /api/admin/orders/manual-invoices/:id
 * Re-saves the header + replaces all line items, recomputes totals.
 * Invoice number never changes. Returns JSON (caller re-downloads the PDF). */
const updateManualInvoice = async (req, res) => {
  try {
    await ensureManualInvoiceSchema().catch(() => {});
    const { id } = req.params;

    const [existing] = await db.query("SELECT id, invoice_number FROM manual_invoices WHERE id = ?", [id]);
    if (!existing.length) {
      return res.status(404).json({ success: false, message: "Invoice not found" });
    }

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
      roundTotal = null,
      amountPaid = 0,
      showSeal = true,
      payment = {},
    } = req.body || {};

    const validationError = validateManualPayload(req.body || {});
    if (validationError) {
      return res.status(400).json({ success: false, message: validationError });
    }

    const figureNum = Number(roundTotal);
    const roundFigure =
      Number.isFinite(figureNum) && figureNum > 0 ? Math.round(figureNum * 100) / 100 : null;
    const storedFileName = manualInvoiceFileName({
      invoiceNumber: existing[0].invoice_number,
      customer: { name: manualStr(customer.name), phone: manualStr(customer.phone) },
    });

    const settings = await getInvoiceSettings();
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
      roundTotal: roundFigure,
      amountPaid,
      showSeal: showSeal !== false,
      payment,
      settings,
    });
    if (!preview.lines.length) {
      return res.status(400).json({ success: false, message: "Add at least one item" });
    }

    const sameAsBilling = shippingSameAsBilling !== false;
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      await connection.query(
        `UPDATE manual_invoices SET
          invoice_date = ?, sale_order = ?, reference = ?, file_name = ?,
          customer_name = ?, customer_email = ?, customer_phone = ?,
          company_name = ?, company_address = ?, company_gstin = ?,
          billing_address1 = ?, billing_address2 = ?, billing_city = ?, billing_state = ?, billing_pincode = ?, billing_country = ?,
          shipping_same = ?, shipping_name = ?, shipping_email = ?, shipping_phone = ?,
          shipping_address1 = ?, shipping_address2 = ?, shipping_city = ?, shipping_state = ?, shipping_pincode = ?, shipping_country = ?,
          gst_rate = ?, subtotal = ?, tax_total = ?, discount = ?, round_total = ?, shipping_cost = ?, grand_total = ?, amount_paid = ?, show_seal = ?,
          delivery_option = ?, payment_method = ?, payment_status = ?, amount_in_words = ?
        WHERE id = ?`,
        [
          invoice.date || new Date().toISOString().slice(0, 10),
          manualStr(invoice.saleOrder) || null,
          manualStr(invoice.reference) || null,
          storedFileName,
          manualStr(customer.name),
          manualStr(customer.email) || null,
          manualStr(customer.phone),
          manualStr(customer.company_name || customer.company) || null,
          manualStr(customer.company_address || customer.companyAddress) || null,
          manualStr(customer.company_gstin || customer.gstin).toUpperCase() || null,
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
          roundFigure,
          Number(shippingCost) || 0,
          preview.grandTotal,
          preview.amountPaid,
          showSeal !== false ? 1 : 0,
          manualStr(deliveryOption) || "standard",
          manualStr(payment.methodLabel) || manualStr(payment.method) || "Cash",
          (manualStr(payment.status) || "PAID").toUpperCase(),
          preview.amountWords,
          id,
        ]
      );

      await connection.query("DELETE FROM manual_invoice_items WHERE invoice_id = ?", [id]);
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
             filament_weight_grams, print_time_hours, surface_finish, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
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
            it.filament_weight_grams !== undefined && it.filament_weight_grams !== null && it.filament_weight_grams !== "" ? Number(it.filament_weight_grams) : null,
            it.print_time_hours !== undefined && it.print_time_hours !== null && it.print_time_hours !== "" ? Number(it.print_time_hours) : null,
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

    return res.status(200).json({
      success: true,
      message: "Invoice updated",
      data: { id: Number(id), invoice_number: existing[0].invoice_number },
    });
  } catch (error) {
    console.error("Admin updateManualInvoice error:", error);
    return res.status(500).json({ success: false, message: "Unable to update invoice" });
  }
};

/* ===================== SEARCH SAVED CUSTOMERS =====================
 * GET /api/admin/orders/manual-invoices/customers?search=
 * Returns recent distinct billing profiles for name autocomplete — typing
 * the name refills the rest of the form instantly. */
const searchManualCustomers = async (req, res) => {
  try {
    await ensureManualInvoiceSchema().catch(() => {});
    const q = String(req.query.search || "").trim();
    if (q.length < 2) {
      return res.status(200).json({ success: true, data: [] });
    }
    const term = `%${q}%`;
    const [rows] = await db.query(
      `SELECT customer_name, customer_email, customer_phone,
              company_name, company_address, company_gstin,
              billing_address1, billing_address2, billing_city, billing_state,
              billing_pincode, billing_country, shipping_same,
              shipping_name, shipping_email, shipping_phone,
              shipping_address1, shipping_address2, shipping_city, shipping_state,
              shipping_pincode, shipping_country, id
       FROM manual_invoices
       WHERE customer_name LIKE ? OR customer_phone LIKE ?
       ORDER BY id DESC LIMIT 50`,
      [term, term]
    );
    const seen = new Set();
    const customers = [];
    for (const r of rows) {
      const key = `${String(r.customer_name || "").toLowerCase()}|${String(r.customer_phone || "").replace(/\D/g, "")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      customers.push(r);
      if (customers.length >= 8) break;
    }
    return res.status(200).json({ success: true, data: customers });
  } catch (error) {
    console.error("Admin searchManualCustomers error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
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
    res.setHeader("Content-Disposition", `attachment; filename="${rows[0].file_name || manualInvoiceFileName(data)}"`);
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
  updateManualInvoice,
  searchManualCustomers,
  listManualInvoices,
  getManualInvoice,
  downloadManualInvoicePdf,
  deleteManualInvoice,
};
