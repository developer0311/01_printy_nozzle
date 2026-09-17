const db = require("../config/db");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const { calculateCouponTotals, round2 } = require("../utils/couponHelper");
const { ensurePrintCartSchema } = require("../utils/printCartSchema");
const { sendPaymentConfirmationMail } = require("../utils/mailer");
const {
  getInvoiceSettings,
  buildOrderInvoiceData,
  buildPrintInvoiceData,
  generateInvoicePdf,
} = require("../utils/invoice");
const { triggerAutoShipment } = require("../utils/shippingSync");
require("dotenv").config();

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/* ===================== INITIATE CHECKOUT ===================== */
const initiateCheckout = async (req, res) => {
  try {
    await ensurePrintCartSchema().catch(() => {});
    // Get cart and items (products + custom 3D prints)
    const [carts] = await db.query("SELECT * FROM cart WHERE user_id = ?", [req.user.id]);
    if (carts.length === 0) {
      return res.status(400).json({ success: false, message: "Cart is empty" });
    }

    let items;
    try {
      [items] = await db.query(
        `SELECT ci.*, p.name, p.price, p.stock,
                pv.price_adjustment, pv.stock as variant_stock,
                ci.item_type, ci.unit_price as print_unit_price, ci.product_id as print_product_id
         FROM cart_items ci
         LEFT JOIN products p ON ci.product_id = p.id
         LEFT JOIN product_variants pv ON ci.variant_id = pv.id
         WHERE ci.cart_id = ?`,
        [carts[0].id]
      );
    } catch (e) {
      if (e && (e.code === "ER_BAD_FIELD_ERROR" || /Unknown column/i.test(e.message || ""))) {
        [items] = await db.query(
          `SELECT ci.*, p.name, p.price, p.stock,
                  pv.price_adjustment, pv.stock as variant_stock
           FROM cart_items ci
           JOIN products p ON ci.product_id = p.id
           LEFT JOIN product_variants pv ON ci.variant_id = pv.id
           WHERE ci.cart_id = ?`,
          [carts[0].id]
        );
      } else {
        throw e;
      }
    }

    if (items.length === 0) {
      return res.status(400).json({ success: false, message: "Cart is empty" });
    }

    const isPrintItem = (it) => it.item_type === "print" || it.print_product_id == null || it.product_id == null;

    // Check all product items are in stock (prints have no stock limit)
    for (const item of items) {
      if (isPrintItem(item)) continue;
      const availStock = item.variant_stock !== null && item.variant_stock !== undefined ? item.variant_stock : item.stock;
      if (item.quantity > availStock) {
        return res.status(400).json({
          success: false,
          message: `${item.name} has insufficient stock. Available: ${availStock}`,
        });
      }
    }

    // Calculate subtotal (products + prints)
    let subtotal = 0;
    items.forEach((item) => {
      if (isPrintItem(item)) {
        subtotal += Number(item.print_unit_price || item.unit_price || 0) * item.quantity;
      } else {
        subtotal += (Number(item.price || 0) + Number(item.price_adjustment || 0)) * item.quantity;
      }
    });
    subtotal = round2(subtotal);

    // Get settings
    const [settings] = await db.query(
      "SELECT setting_key, setting_value FROM site_settings WHERE setting_key IN ('free_shipping_threshold', 'gst_rate', 'standard_shipping_cost', 'express_shipping_cost', 'same_day_shipping_cost')"
    );
    const settingsMap = {};
    settings.forEach((s) => (settingsMap[s.setting_key] = parseFloat(s.setting_value)));

    const gstRate = settingsMap.gst_rate || 18;

    // Coupon discount — applied on FULL price incl. GST
    let couponRow = null;
    let couponInfo = null;
    if (carts[0].coupon_id) {
      const [coupons] = await db.query("SELECT * FROM coupons WHERE id = ? AND is_active = 1", [carts[0].coupon_id]);
      if (coupons.length > 0) {
        couponRow = coupons[0];
        couponInfo = { code: couponRow.code, discount_type: couponRow.discount_type, discount_value: couponRow.discount_value };
      }
    }
    const totals = calculateCouponTotals({ subtotal, gstRate, coupon: couponRow });
    const discount = totals.discount;
    const freeShippingThreshold = settingsMap.free_shipping_threshold || 999;

    // Get user addresses
    const [addresses] = await db.query(
      "SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC",
      [req.user.id]
    );

    return res.status(200).json({
      success: true,
      checkout: {
        subtotal: Math.round(subtotal * 100) / 100,
        discount: Math.round(discount * 100) / 100,
        gstRate,
        freeShippingThreshold,
        shippingOptions: {
          standard: { cost: subtotal >= freeShippingThreshold ? 0 : (settingsMap.standard_shipping_cost || 0), label: "Standard Delivery", eta: "3-5 Working Days" },
          express: { cost: settingsMap.express_shipping_cost || 99, label: "Express Delivery", eta: "1-2 Working Days" },
          same_day: { cost: settingsMap.same_day_shipping_cost || 149, label: "Same Day Delivery", eta: "Same day (Selected cities)" },
        },
        coupon: couponInfo,
        savedAddresses: addresses,
        itemCount: items.length,
      },
    });
  } catch (error) {
    console.error("Initiate checkout error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ===================== CREATE RAZORPAY ORDER ===================== */
const createRazorpayOrder = async (req, res) => {
  try {
    const { amount, order_id, order_type = "order", print_order_ids = [] } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: "Invalid amount" });
    }

    const options = {
      amount: Math.round(amount * 100), // Razorpay expects paise
      currency: "INR",
      receipt: `receipt_${order_id || Date.now()}`,
      payment_capture: 1,
    };

    const razorpayOrder = await razorpay.orders.create(options);

    // Link the gateway order to our record. Print-only checkouts live
    // solely in printing_orders (no `orders` row), so update those instead.
    if (order_type === "print") {
      const ids = (print_order_ids.length ? print_order_ids : [order_id]).filter(Boolean);
      if (ids.length) {
        await db.query(
          `UPDATE printing_orders SET razorpay_order_id = ? WHERE id IN (${ids.map(() => "?").join(",")}) AND user_id = ?`,
          [razorpayOrder.id, ...ids, req.user.id]
        );
      }
    } else if (order_id) {
      await db.query(
        "UPDATE orders SET razorpay_order_id = ? WHERE id = ? AND user_id = ?",
        [razorpayOrder.id, order_id, req.user.id]
      );
    }

    return res.status(200).json({
      success: true,
      razorpay_order_id: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      key_id: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error("Create Razorpay order error:", error);
    return res.status(500).json({ success: false, message: "Payment initiation failed" });
  }
};

/* ===================== VERIFY PAYMENT ===================== */
const verifyPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, order_id, order_type = "order", print_order_ids = [] } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: "Payment details missing" });
    }

    // Verify signature
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    const printIds = (print_order_ids.length ? print_order_ids : [order_id]).filter(Boolean);
    const isPrint = order_type === "print" && printIds.length > 0;

    if (expectedSignature !== razorpay_signature) {
      // Payment failed
      if (isPrint) {
        await db.query(
          `UPDATE printing_orders SET payment_status = 'failed' WHERE id IN (${printIds.map(() => "?").join(",")}) AND user_id = ?`,
          [...printIds, req.user.id]
        );
      } else if (order_id) {
        await db.query(
          "UPDATE orders SET payment_status = 'failed' WHERE id = ? AND user_id = ?",
          [order_id, req.user.id]
        );
      }
      return res.status(400).json({ success: false, message: "Payment verification failed" });
    }

    // Payment success — update order
    let confirmedOrder = null;
    if (isPrint) {
      await db.query(
        `UPDATE printing_orders SET payment_status = 'paid', razorpay_payment_id = ? WHERE id IN (${printIds.map(() => "?").join(",")}) AND user_id = ?`,
        [razorpay_payment_id, ...printIds, req.user.id]
      );
      // Prepaid prints are now payable → auto-create Delhivery shipments.
      printIds.forEach((pid) => triggerAutoShipment("print", pid));
      const [printRows] = await db.query(
        `SELECT po.*, pm.name AS material_name, pc.name AS color_name
         FROM printing_orders po
         LEFT JOIN printing_materials pm ON po.material_id = pm.id
         LEFT JOIN printing_colors pc ON po.color_id = pc.id
         WHERE po.id IN (${printIds.map(() => "?").join(",")}) AND po.user_id = ?`,
        [...printIds, req.user.id]
      );
      const first = printRows[0] || null;
      if (first) {
        // Shape it like an order so the confirmation mailer can reuse it.
        confirmedOrder = {
          ...first,
          payment_method_label: "Online Payment (Razorpay)",
        };
        try {
          const [userRows] = await db.query("SELECT first_name, last_name, email FROM users WHERE id = ?", [
            req.user.id,
          ]);
          const customer = userRows[0] || {};
          const recipient = first.shipping_email || customer.email;
          // GST invoice PDF for the 3D-print purchase (attached to the mail).
          let invoicePdf = null;
          let invoiceNumber = null;
          try {
            const settings = await getInvoiceSettings();
            const invoiceData = buildPrintInvoiceData({ prints: printRows, settings });
            invoiceNumber = invoiceData.invoiceNumber;
            invoicePdf = await generateInvoicePdf(invoiceData);
          } catch (pdfError) {
            console.error("Invoice PDF build failed:", pdfError.message);
          }
          sendPaymentConfirmationMail({
            to: recipient,
            name: first.shipping_name || `${customer.first_name || ""} ${customer.last_name || ""}`.trim(),
            order: confirmedOrder,
            items: printRows.map((r) => ({
              product_name: `3D Print: ${r.file_name}`,
              quantity: r.quantity,
              total: r.total_amount,
            })),
            invoicePdf,
            invoiceNumber,
          }).catch(() => {});
        } catch (mailError) {
          console.error("Confirmation email lookup failed:", mailError.message);
        }
      }
    } else if (order_id) {
      await db.query(
        `UPDATE orders SET payment_status = 'paid', status = 'confirmed',
         razorpay_payment_id = ?, razorpay_signature = ?
         WHERE id = ? AND user_id = ?`,
        [razorpay_payment_id, razorpay_signature, order_id, req.user.id]
      );
      const [orderRows] = await db.query("SELECT * FROM orders WHERE id = ? AND user_id = ?", [
        order_id,
        req.user.id,
      ]);
      confirmedOrder = orderRows[0] || null;
      // Prepaid order just got paid → auto-create the Delhivery shipment.
      if (confirmedOrder) triggerAutoShipment("order", confirmedOrder.id);
    }

    // Payment confirmation email (fire-and-forget — never blocks the response)
    if (confirmedOrder) {
      try {
        let itemRows;
        try {
          [itemRows] = await db.query(
            "SELECT product_id, item_type, product_name, variant_value, quantity, price, total FROM order_items WHERE order_id = ?",
            [confirmedOrder.id]
          );
        } catch (colError) {
          // Older installs without the print-aware order_items columns.
          [itemRows] = await db.query(
            "SELECT product_id, product_name, variant_value, quantity, price, total FROM order_items WHERE order_id = ?",
            [confirmedOrder.id]
          );
        }
        const [userRows] = await db.query("SELECT first_name, last_name, email FROM users WHERE id = ?", [
          req.user.id,
        ]);
        const customer = userRows[0] || {};
        const recipient = confirmedOrder.shipping_email || customer.email;
        // GST invoice PDF for the purchase (attached to the mail).
        let invoicePdf = null;
        let invoiceNumber = null;
        try {
          const settings = await getInvoiceSettings();
          const invoiceData = buildOrderInvoiceData({ order: confirmedOrder, items: itemRows, settings });
          invoiceNumber = invoiceData.invoiceNumber;
          invoicePdf = await generateInvoicePdf(invoiceData);
        } catch (pdfError) {
          console.error("Invoice PDF build failed:", pdfError.message);
        }
        sendPaymentConfirmationMail({
          to: recipient,
          name: confirmedOrder.shipping_name || `${customer.first_name || ""} ${customer.last_name || ""}`.trim(),
          order: confirmedOrder,
          items: itemRows,
          invoicePdf,
          invoiceNumber,
        }).catch(() => {});
      } catch (mailError) {
        console.error("Confirmation email lookup failed:", mailError.message);
      }
    }

    return res.status(200).json({
      success: true,
      message: "Payment verified successfully",
    });
  } catch (error) {
    console.error("Verify payment error:", error);
    return res.status(500).json({ success: false, message: "Payment verification error" });
  }
};

module.exports = {
  initiateCheckout,
  createRazorpayOrder,
  verifyPayment,
};
