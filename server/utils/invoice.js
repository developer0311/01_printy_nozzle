const PDFDocument = require("pdfkit");
const db = require("../config/db");

/**
 * Tax-invoice PDF engine (Robu-style layout, Printynozzle branding).
 *
 * Covers every purchase channel:
 *  - e-commerce product orders (`orders` + `order_items`, prints inside
 *    mixed carts included)
 *  - print-only cart checkouts (batch of `printing_orders` rows)
 *  - direct single 3D-print orders (`printing_orders`)
 *
 * Company credentials (name, address, phone, email, GSTIN, terms, HSN
 * defaults) come from `site_settings` so they stay editable from the
 * Admin panel. Seeded with Printynozzle defaults by invoiceSchema.js.
 */

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;
const money = (n) => `Rs. ${Number(n || 0).toFixed(2)}`;

const COMPANY_DEFAULTS = {
  company_name: "Printynozzle",
  company_address:
    "145 Indira Nagar Block 3, Panihati, Sodepur, Opposite Shree Krishna Sweets, North 24 Parganas, 700110, West Bengal, India",
  company_phone: "8583928948",
  company_email: "support@printynozzle.in",
  company_gstin: "",
  company_website: "https://printynozzle.in",
  invoice_jurisdiction: "Kolkata",
  invoice_default_hsn: "85423900",
  invoice_print_hsn: "84859000",
  invoice_shipping_hsn: "996819",
};

const DEFAULT_TERMS = [
  "01) Customer Notification: Notify us within 2 days of delivery, in case the delivered product is faulty, incorrect or not as specified. Post which such claim will not be liability of Printynozzle.",
  "02) Warranty Replacement: Warranty claims result in product replacement then only product will be shipped. In case the product is unavailable, a refund will be issued as per policy.",
  "03) GST Compliance: The buyer must ensure an active GST number at the time of order booking. Inactive or missing GST number on the invoice shall be considered as B2C Supply; in such case no input tax credit can be claimed by the buyer.",
  "04) Online Orders: Buyers must provide correct GST No. and other relevant details at the time of order booking only. No subsequent changes in the GST and other details shall be considered.",
];

const STATE_CODES = {
  "andaman and nicobar": "35",
  "andhra pradesh": "37",
  assam: "18",
  bihar: "10",
  chandigarh: "04",
  chhattisgarh: "22",
  delhi: "07",
  goa: "30",
  gujarat: "24",
  haryana: "06",
  "himachal pradesh": "02",
  jharkhand: "20",
  karnataka: "29",
  kerala: "32",
  "madhya pradesh": "23",
  maharashtra: "27",
  odisha: "21",
  puducherry: "34",
  punjab: "03",
  rajasthan: "08",
  "tamil nadu": "33",
  telangana: "36",
  "uttar pradesh": "09",
  uttarakhand: "05",
  "west bengal": "19",
};

const formatInvoiceDate = (d) => {
  const dt = d ? new Date(d) : new Date();
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${dt.getFullYear()}`;
};

const placeOfSupply = (state) => {
  if (!state) return "";
  const code = STATE_CODES[String(state).trim().toLowerCase()];
  return code ? `${code} - ${state}` : String(state);
};

/* ===================== SETTINGS ===================== */

const getInvoiceSettings = async () => {
  let rows = [];
  try {
    [rows] = await db.query("SELECT setting_key, setting_value FROM site_settings");
  } catch {
    rows = [];
  }
  const map = {};
  rows.forEach((r) => {
    map[r.setting_key] = r.setting_value;
  });
  const pick = (key) =>
    map[key] !== undefined && map[key] !== null && String(map[key]).trim() !== ""
      ? String(map[key])
      : COMPANY_DEFAULTS[key];
  const nonempty = (v) => (v !== undefined && v !== null && String(v).trim() !== "" ? String(v) : "");
  const company = {
    name: pick("company_name"),
    address: pick("company_address"),
    // Invoice-specific keys win; generic support_* are only a fallback
    // (older DBs carry placeholder support_phone/support_email values).
    phone: nonempty(map.company_phone) || nonempty(map.support_phone) || COMPANY_DEFAULTS.company_phone,
    email: nonempty(map.company_email) || nonempty(map.support_email) || COMPANY_DEFAULTS.company_email,
    gstin: nonempty(map.company_gstin),
    website: pick("company_website"),
  };
  const gstRate = Number(map.gst_rate || 18);
  const jurisdiction =
    map.invoice_jurisdiction && String(map.invoice_jurisdiction).trim()
      ? String(map.invoice_jurisdiction)
      : COMPANY_DEFAULTS.invoice_jurisdiction;
  const hsns = {
    product: map.invoice_default_hsn || COMPANY_DEFAULTS.invoice_default_hsn,
    print: map.invoice_print_hsn || COMPANY_DEFAULTS.invoice_print_hsn,
    shipping: map.invoice_shipping_hsn || COMPANY_DEFAULTS.invoice_shipping_hsn,
  };
  const rawTerms =
    map.invoice_terms && String(map.invoice_terms).trim()
      ? String(map.invoice_terms)
      : DEFAULT_TERMS.join("|");
  const terms = rawTerms
    .split("|")
    .map((t) => t.trim())
    .filter(Boolean);
  return { company, gstRate: Number.isFinite(gstRate) ? gstRate : 18, jurisdiction, hsns, terms };
};

/* ===================== AMOUNT IN WORDS ===================== */

const ONES = [
  "", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE",
  "TEN", "ELEVEN", "TWELVE", "THIRTEEN", "FOURTEEN", "FIFTEEN", "SIXTEEN",
  "SEVENTEEN", "EIGHTEEN", "NINETEEN",
];
const TENS = ["", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY"];

const twoDigits = (n) => {
  if (n < 20) return ONES[n];
  return `${TENS[Math.floor(n / 10)]}${n % 10 ? `-${ONES[n % 10]}` : ""}`;
};

const threeDigits = (n) => {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  let out = h ? `${ONES[h]} HUNDRED${rest ? ` AND ${twoDigits(rest)}` : ""}` : twoDigits(rest);
  return out;
};

const integerInWords = (n) => {
  if (!n) return "ZERO";
  const parts = [];
  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const rest = n % 1000;
  if (crore) parts.push(`${threeDigits(crore)} CRORE`);
  if (lakh) parts.push(`${twoDigits(lakh)} LAKH`);
  if (thousand) parts.push(`${twoDigits(thousand)} THOUSAND`);
  if (rest) parts.push(threeDigits(rest));
  return parts.join(" ");
};

const amountInWords = (value) => {
  const total = round2(value);
  const rupees = Math.floor(total);
  const paise = Math.round((total - rupees) * 100);
  let words = `${integerInWords(rupees)} INDIAN RUPEE`;
  if (paise > 0) words += ` AND ${twoDigits(paise)} PAISE`;
  return words;
};

/* ===================== INVOICE DATA BUILDERS ===================== */

const addressLines = (prefix, o) => {
  const bits = [o[`${prefix}_address1`], o[`${prefix}_address2`], o[`${prefix}_city`]]
    .filter(Boolean)
    .join(", ");
  const region = [o[`${prefix}_state`], o[`${prefix}_pincode`]].filter(Boolean).join(", ");
  return { bits, region, country: o[`${prefix}_country`] || "India" };
};

/**
 * Standard e-commerce order invoice (products + mixed-cart prints).
 * Shipping is added as a taxed delivery line (HSN 996819) by splitting
 * the stored inclusive shipping_cost into base + GST, so the grand
 * total always equals the charged order.total_amount.
 */
const buildOrderInvoiceData = ({ order, items = [], settings }) => {
  const { company, gstRate, jurisdiction, hsns, terms } = settings;
  const rate = Number(order.gst_rate_applied || gstRate || 18);

  const lines = (items || []).map((it, idx) => {
    const isPrint = it.item_type === "print" || it.product_id == null;
    const unit = round2(it.price);
    const qty = Number(it.quantity || 1);
    const amount = round2(unit * qty);
    const tax = round2((amount * rate) / 100);
    const label = isPrint
      ? `${it.product_name || "Custom 3D Print"}${it.variant_value ? ` — ${it.variant_value}` : ""}`
      : `${it.product_id ? `[${it.product_id}] ` : ""}${it.product_name || "Item"}${it.variant_value ? ` (${it.variant_value})` : ""}`;
    return {
      sno: idx + 1,
      description: label,
      hsn: isPrint ? hsns.print : hsns.product,
      rate: unit,
      qty,
      disc: 0,
      amount,
      taxRate: rate,
      tax,
      total: round2(amount + tax),
    };
  });

  // Delivery line (tax-inclusive split, like the reference template)
  const shippingCost = round2(order.shipping_cost);
  if (shippingCost > 0) {
    const base = round2((shippingCost * 100) / (100 + rate));
    const tax = round2(shippingCost - base);
    lines.push({
      sno: lines.length + 1,
      description: `Delivery (${order.delivery_option || "standard"})`,
      hsn: hsns.shipping,
      rate: base,
      qty: 1,
      disc: 0,
      amount: base,
      taxRate: rate,
      tax,
      total: shippingCost,
    });
  }

  const subtotal = round2(lines.reduce((s, l) => s + l.amount, 0));
  const taxTotal = round2(lines.reduce((s, l) => s + l.tax, 0));
  const discount = round2(order.discount);
  // Recomputed from lines so Subtotal + Taxes - Discount always balances.
  const grandTotal = round2(subtotal + taxTotal - discount);
  const qtyTotal = lines.reduce((s, l) => s + Number(l.qty || 0), 0);

  const bill = addressLines("billing", {
    billing_address1: order.billing_address1 || order.shipping_address1,
    billing_address2: order.billing_address2 || order.shipping_address2,
    billing_city: order.billing_city || order.shipping_city,
    billing_state: order.billing_state || order.shipping_state,
    billing_pincode: order.billing_pincode || order.shipping_pincode,
    billing_country: order.billing_country || order.shipping_country,
  });
  const ship = addressLines("shipping", order);

  const invoiceNumber = `INV-${order.order_number}`;
  return {
    kind: "order",
    invoiceNumber,
    invoiceDate: formatInvoiceDate(order.created_at),
    saleOrder: order.order_number,
    reference: invoiceNumber,
    company,
    jurisdiction,
    terms,
    paymentTerms: "Immediate Payment",
    reverseCharge: "No",
    payment: {
      method: order.payment_method_label || String(order.payment_method || "").toUpperCase(),
      status: String(order.payment_status || "").toUpperCase(),
    },
    customer: {
      name: order.billing_name || order.shipping_name || "Customer",
      email: order.shipping_email || order.customer_email || "",
      phone: order.billing_phone || order.shipping_phone || "",
      line1: bill.bits,
      line2: `${bill.region}${bill.region ? ", " : ""}${bill.country}`,
      placeOfSupply: placeOfSupply(order.billing_state || order.shipping_state),
    },
    shipping: {
      name: order.shipping_name || "",
      line1: ship.bits,
      line2: `${ship.region}${ship.region ? ", " : ""}${ship.country}`,
      phone: order.shipping_phone || "",
      email: order.shipping_email || order.customer_email || "",
    },
    lines,
    gstRate: rate,
    qtyTotal,
    subtotal,
    discount,
    taxTotal,
    grandTotal,
    amountWords: amountInWords(grandTotal),
  };
};

/**
 * 3D-print invoice — one row per printing_orders record, optional
 * shared delivery line for print-only cart checkouts.
 */
const buildPrintInvoiceData = ({ prints = [], settings, shippingCost = 0, deliveryOption = "standard" }) => {
  const { company, gstRate, jurisdiction, hsns, terms } = settings;
  const first = prints[0] || {};
  const rate = Number(first.gst_rate_applied || gstRate || 18);

  const lines = prints.map((p, idx) => {
    const qty = Number(p.quantity || 1);
    const amount = round2(p.subtotal);
    const tax = round2(p.tax_amount);
    const unit = qty ? round2(amount / qty) : amount;
    const spec = [p.material_name, p.color_name || p.custom_color_hex, p.infill_density ? `${p.infill_density}%` : null, p.surface_finish]
      .filter(Boolean)
      .join(" • ");
    return {
      sno: idx + 1,
      description: `3D Print: ${p.file_name || "model"}${spec ? ` — ${spec}` : ""}`,
      hsn: hsns.print,
      rate: unit,
      qty,
      disc: 0,
      amount,
      taxRate: rate,
      tax,
      total: round2(p.total_amount),
    };
  });

  const shipTotal = round2(shippingCost);
  if (shipTotal > 0) {
    const base = round2((shipTotal * 100) / (100 + rate));
    lines.push({
      sno: lines.length + 1,
      description: `Delivery (${deliveryOption})`,
      hsn: hsns.shipping,
      rate: base,
      qty: 1,
      disc: 0,
      amount: base,
      taxRate: rate,
      tax: round2(shipTotal - base),
      total: shipTotal,
    });
  }

  const subtotal = round2(lines.reduce((s, l) => s + l.amount, 0));
  const taxTotal = round2(lines.reduce((s, l) => s + l.tax, 0));
  const grandTotal = round2(lines.reduce((s, l) => s + l.total, 0));
  const qtyTotal = lines.reduce((s, l) => s + Number(l.qty || 0), 0);

  const ship = {
    name: first.shipping_name || "",
    line1: [first.shipping_address1, first.shipping_city].filter(Boolean).join(", "),
    line2: [[first.shipping_state, first.shipping_pincode].filter(Boolean).join(", "), "India"]
      .filter(Boolean)
      .join(", "),
  };
  const invoiceNumber =
    prints.length === 1 ? `INV-${first.order_number}` : `INV-${first.order_number || "3D"}-BATCH`;
  return {
    kind: "print",
    invoiceNumber,
    invoiceDate: formatInvoiceDate(first.created_at),
    saleOrder: prints.map((p) => p.order_number).join(", "),
    reference: invoiceNumber,
    company,
    jurisdiction,
    terms,
    paymentTerms: "Immediate Payment",
    reverseCharge: "No",
    payment: {
      method: first.payment_method === "cod" ? "Cash on Delivery" : "Online Payment (Razorpay)",
      status: String(first.payment_status || "").toUpperCase(),
    },
    customer: {
      name: first.shipping_name || "Customer",
      email: first.shipping_email || first.customer_email || "",
      phone: first.shipping_phone || "",
      line1: ship.line1,
      line2: ship.line2,
      placeOfSupply: placeOfSupply(first.shipping_state),
    },
    shipping: { name: first.shipping_name || "", line1: ship.line1, line2: ship.line2, phone: first.shipping_phone || "", email: first.shipping_email || first.customer_email || "" },
    lines,
    gstRate: rate,
    qtyTotal,
    subtotal,
    discount: 0,
    taxTotal,
    grandTotal,
    amountWords: amountInWords(grandTotal),
  };
};

const invoiceFileName = (data) =>
  `Invoice-${String(data.invoiceNumber || "invoice").replace(/[^A-Za-z0-9-_]+/g, "-")}.pdf`;

/* ===================== PDF RENDERING ===================== */

const ORANGE = "#EA580C";
const NAVY = "#1E3A8A";
const INK = "#111827";
const MUTED = "#4B5563";
const BAND = "#E5E7EB";
const STRIPE = "#F3F4F6";

const PAGE_W = 595.28; // A4
const MARGIN = 36;
const CONTENT_W = PAGE_W - MARGIN * 2;
const TOP = 40;
const BOTTOM = 770; // content limit; footer drawn later in 790..825

const COLS = [
  { key: "sno", label: "#", w: 20, align: "left" },
  { key: "description", label: "Description", w: 163, align: "left" },
  { key: "hsn", label: "HSN", w: 50, align: "left" },
  { key: "rate", label: "Rate", w: 56, align: "right" },
  { key: "qty", label: "Qty", w: 30, align: "right" },
  { key: "disc", label: "Disc", w: 44, align: "right" },
  { key: "amount", label: "Amount", w: 56, align: "right" },
  { key: "igst", label: "IGST", w: 56, align: "right" },
  { key: "total", label: "Total", w: 48, align: "right" },
];

const cellText = (line, key) => {
  switch (key) {
    case "sno":
      return String(line.sno);
    case "description":
      return line.description;
    case "hsn":
      return String(line.hsn || "");
    case "rate":
      return money(line.rate);
    case "qty":
      return Number(line.qty).toFixed(2);
    case "disc":
      return money(line.disc);
    case "amount":
      return money(line.amount);
    case "igst":
      return `${money(line.tax)}\n(${Number(line.taxRate).toFixed(1)}%)`;
    case "total":
      return money(line.total);
    default:
      return "";
  }
};

const generateInvoicePdf = (data) =>
  new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: MARGIN, bufferPages: true });
      const chunks = [];
      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      let y = TOP;

      /* ---------- Top title ---------- */
      doc.font("Helvetica").fontSize(8).fillColor(MUTED);
      doc.text("TAX INVOICE (Original for Recipient)", MARGIN, y - 12, {
        width: CONTENT_W,
        align: "center",
      });

      /* ---------- Header: brand (left) + company (right) ---------- */
      const brandY = y;
      doc.font("Helvetica-Bold").fontSize(21).fillColor(ORANGE);
      doc.text(data.company.name.toUpperCase(), MARGIN, brandY, { width: 250 });
      doc.font("Helvetica-Bold").fontSize(10).fillColor(NAVY);
      doc.text("Your Ideas, Our Prints", MARGIN, doc.y + 1, { width: 250 });
      if (data.company.website) {
        doc.font("Helvetica").fontSize(7.5).fillColor(MUTED);
        doc.text(data.company.website, MARGIN, doc.y + 2, { width: 250 });
      }
      const brandBottom = doc.y;

      const compX = MARGIN + 320;
      const compW = CONTENT_W - 320;
      doc.font("Helvetica-Bold").fontSize(11).fillColor(INK);
      doc.text(data.company.name.toUpperCase(), compX, brandY, { width: compW });
      doc.font("Helvetica").fontSize(7.5).fillColor(INK);
      const compLines = [data.company.address];
      if (data.company.phone) compLines.push(`Phone: ${data.company.phone}`);
      if (data.company.email) compLines.push(`Email: ${data.company.email}`);
      if (data.company.gstin) compLines.push(`GSTIN: ${data.company.gstin}`);
      compLines.forEach((line) => {
        doc.text(line, compX, doc.y + 2, { width: compW });
      });
      y = Math.max(brandBottom, doc.y) + 14;

      const ensureSpace = (h) => {
        if (y + h > BOTTOM) {
          doc.addPage();
          y = TOP;
        }
      };

      const drawBand = () => {
        const c1 = MARGIN;
        const c2 = MARGIN + 175;
        const c3 = MARGIN + 350;
        const bandH = 118;
        ensureSpace(bandH + 8);
        const bandY = y;
        doc.rect(MARGIN, bandY, CONTENT_W, bandH).fill(BAND);
        doc.fillColor(INK);
        // Customer
        doc.font("Helvetica-Bold").fontSize(8);
        doc.text("Customer", c1 + 6, bandY + 6, { width: 160 });
        doc.font("Helvetica-Bold").fontSize(8.5);
        doc.text(data.customer.name || "Customer", c1 + 6, bandY + 18, { width: 160 });
        doc.font("Helvetica").fontSize(7.5);
        let cy = bandY + 30;
        [data.customer.line1, data.customer.line2].filter(Boolean).forEach((t) => {
          doc.text(t, c1 + 6, cy, { width: 160 });
          cy = doc.y + 1;
        });
        if (data.customer.phone) {
          doc.text(`Phone: ${data.customer.phone}`, c1 + 6, cy, { width: 160 });
          cy = doc.y + 1;
        }
        if (data.customer.email) {
          doc.text(data.customer.email, c1 + 6, cy, { width: 160 });
          cy = doc.y + 1;
        }
        if (data.customer.placeOfSupply) {
          doc.text(`Place of Supply: ${data.customer.placeOfSupply}`, c1 + 6, cy, { width: 160 });
        }
        // Shipping
        doc.font("Helvetica-Bold").fontSize(8);
        doc.text("Shipping Address", c2 + 6, bandY + 6, { width: 160 });
        doc.font("Helvetica-Bold").fontSize(8.5);
        doc.text(data.shipping.name || data.customer.name || "Customer", c2 + 6, bandY + 18, { width: 160 });
        doc.font("Helvetica").fontSize(7.5);
        let sy = bandY + 30;
        [data.shipping.line1, data.shipping.line2].filter(Boolean).forEach((t) => {
          doc.text(t, c2 + 6, sy, { width: 160 });
          sy = doc.y + 1;
        });
        if (data.shipping.phone) {
          doc.text(`Phone: ${data.shipping.phone}`, c2 + 6, sy, { width: 160 });
          sy = doc.y + 1;
        }
        if (data.shipping.email) {
          doc.text(data.shipping.email, c2 + 6, sy, { width: 160 });
        }
        // Invoice meta
        doc.font("Helvetica-Bold").fontSize(12);
        doc.text(`Invoice# ${data.invoiceNumber}`, c3 + 6, bandY + 6, { width: 158 });
        doc.font("Helvetica").fontSize(7.5).fillColor(INK);
        const meta = [
          ["Invoice Date:", data.invoiceDate],
          ["Sale Order:", data.saleOrder],
          ["Reference:", data.reference],
        ];
        let my = bandY + 30;
        meta.forEach(([k, v]) => {
          doc.font("Helvetica-Bold").text(k, c3 + 6, my, { width: 158, continued: false });
          doc.font("Helvetica").text(String(v || ""), c3 + 6, doc.y, { width: 158 });
          my = doc.y + 4;
        });
        y = bandY + bandH + 10;
      };

      drawBand();

      /* ---------- Items table ---------- */
      const headerH = 18;
      const drawTableHeader = () => {
        ensureSpace(headerH + 20);
        doc.rect(MARGIN, y, CONTENT_W, headerH).fill(BAND);
        doc.fillColor(INK).font("Helvetica-Bold").fontSize(7.5);
        let x = MARGIN;
        COLS.forEach((c) => {
          doc.text(c.label, x + 3, y + 5, { width: c.w - 6, align: c.align });
          x += c.w;
        });
        y += headerH;
      };

      drawTableHeader();
      doc.font("Helvetica").fontSize(7.5);
      data.lines.forEach((line, idx) => {
        // measure row height (description + IGST wrap)
        doc.font("Helvetica").fontSize(7.5);
        const descH = doc.heightOfString(line.description, { width: COLS[1].w - 6 });
        const rowH = Math.max(22, descH + 8);
        if (y + rowH > BOTTOM) {
          doc.addPage();
          y = TOP;
          drawTableHeader();
          doc.font("Helvetica").fontSize(7.5);
        }
        if (idx % 2 === 1) doc.rect(MARGIN, y, CONTENT_W, rowH).fill(STRIPE);
        doc.fillColor(INK);
        let x = MARGIN;
        COLS.forEach((c) => {
          const opts = { width: c.w - 6, align: c.align };
          if (c.key === "igst") {
            doc.text(money(line.tax), x + 3, y + 4, opts);
            doc.fontSize(6.5).fillColor(MUTED);
            doc.text(`(${Number(line.taxRate).toFixed(1)}%)`, x + 3, doc.y, opts);
            doc.fontSize(7.5).fillColor(INK);
          } else {
            doc.text(cellText(line, c.key), x + 3, y + 4, opts);
          }
          x += c.w;
        });
        y += rowH;
      });

      // Qty total strip
      const stripH = 18;
      if (y + stripH > BOTTOM) {
        doc.addPage();
        y = TOP;
      }
      doc.rect(MARGIN, y, CONTENT_W, stripH).fill(STRIPE);
      doc.fillColor(INK).font("Helvetica-Bold").fontSize(7.5);
      const totalLabelX = COLS.slice(0, 4).reduce((s, c) => s + c.w, 0);
      doc.text("Total:", MARGIN + totalLabelX + 3, y + 5, { width: 60, align: "right" });
      doc.text(Number(data.qtyTotal).toFixed(3), MARGIN + totalLabelX + 63, y + 5, {
        width: 60,
        align: "left",
      });
      y += stripH + 12;

      /* ---------- Summary: tax table (left) + totals (right) ---------- */
      const taxLabel = `${Number(data.gstRate).toFixed(0)}% IGST (Sale)`;
      const leftW = 250;
      const summH = 62;
      if (y + summH > BOTTOM) {
        doc.addPage();
        y = TOP;
      }
      const sumY = y;
      doc.rect(MARGIN, sumY, leftW, 18).fill(BAND);
      doc.fillColor(INK).font("Helvetica-Bold").fontSize(7.5);
      doc.text("Item", MARGIN + 4, sumY + 5, { width: 40 });
      doc.text("Taxes", MARGIN + 70, sumY + 5, { width: 100 });
      doc.text("Amount", MARGIN + 175, sumY + 5, { width: 70, align: "right" });
      doc.font("Helvetica").fontSize(7.5);
      doc.text("1", MARGIN + 4, sumY + 24, { width: 40 });
      doc.text(taxLabel, MARGIN + 70, sumY + 24, { width: 100 });
      doc.text(money(data.taxTotal), MARGIN + 175, sumY + 24, { width: 70, align: "right" });

      const rightX = MARGIN + 300;
      const rightW = CONTENT_W - 300;
      doc.font("Helvetica").fontSize(8).fillColor(INK);
      const totals = [
        ["Subtotal", money(data.subtotal), false],
        ...(data.discount > 0 ? [["Discount", `- ${money(data.discount)}`, false]] : []),
        ["Taxes", money(data.taxTotal), false],
        ["Total", money(data.grandTotal), true],
      ];
      let ty = sumY + 2;
      totals.forEach(([k, v, bold]) => {
        doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 9 : 8);
        doc.text(k, rightX, ty, { width: 110 });
        doc.text(v, rightX + 115, ty, { width: rightW - 115, align: "right" });
        ty += bold ? 16 : 14;
      });
      y = Math.max(sumY + summH, ty) + 8;

      /* ---------- Amount in words ---------- */
      if (y + 24 > BOTTOM) {
        doc.addPage();
        y = TOP;
      }
      doc.font("Helvetica-Bold").fontSize(8).fillColor(INK);
      doc.text(`Amount in Words: ${data.amountWords}`, MARGIN, y, { width: CONTENT_W });
      y = doc.y + 14;

      /* ---------- Terms ---------- */
      const termBlock = [
        `Payment terms: ${data.paymentTerms}`,
        `Whether tax is payable under reverse charge: ${data.reverseCharge}`,
        "",
        "Terms & Conditions",
        ...data.terms,
      ];
      doc.font("Helvetica").fontSize(7.5).fillColor(INK);
      termBlock.forEach((t) => {
        if (!t) {
          y += 4;
          return;
        }
        const bold = /^(Terms & Conditions|Payment terms|Whether tax)/.test(t);
        doc.font(bold ? "Helvetica-Bold" : "Helvetica");
        const h = doc.heightOfString(t, { width: CONTENT_W });
        if (y + h > BOTTOM) {
          doc.addPage();
          y = TOP;
        }
        doc.text(t, MARGIN, y, { width: CONTENT_W });
        y = doc.y + 3;
      });

      y += 8;
      if (y + 40 > BOTTOM) {
        doc.addPage();
        y = TOP;
      }
      doc.font("Helvetica-Bold").fontSize(8).fillColor(INK);
      doc.text("This is a computer generated Invoice.", MARGIN, y, { width: CONTENT_W, align: "center" });
      y = doc.y + 8;
      doc.text(`Subject to ${data.jurisdiction} Jurisdiction`, MARGIN, y, {
        width: CONTENT_W,
        align: "center",
      });

      /* ---------- Footers with page numbers ---------- */
      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(i);
        doc.strokeColor("#111827").lineWidth(1);
        doc.moveTo(MARGIN, 792).lineTo(PAGE_W - MARGIN, 792).stroke();
        doc.font("Helvetica").fontSize(7).fillColor(INK);
        const bits = [data.company.name.toUpperCase(), data.company.phone, data.company.email]
          .filter(Boolean)
          .join("   •   ");
        const gstBit = data.company.gstin ? `   •   ${data.company.gstin}` : "";
        doc.text(`${bits}${gstBit}`, MARGIN, 797, { width: CONTENT_W, align: "center" });
        doc.fontSize(7).fillColor(MUTED);
        doc.text(`${i + 1}  /  ${range.count}`, MARGIN, 810, { width: CONTENT_W, align: "center" });
      }

      doc.end();
    } catch (e) {
      reject(e);
    }
  });

module.exports = {
  getInvoiceSettings,
  buildOrderInvoiceData,
  buildPrintInvoiceData,
  generateInvoicePdf,
  invoiceFileName,
  amountInWords,
};
