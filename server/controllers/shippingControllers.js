const db = require("../config/db");
const delhivery = require("../utils/delhivery");
const { getShippingSettings, applyTrackingStatus } = require("../utils/shippingSync");

/* ===================== HELPERS ===================== */
const localPincodeLookup = async (pin) => {
  const [pins] = await db.query(
    "SELECT * FROM serviceable_pincodes WHERE pincode = ? AND is_serviceable = 1",
    [pin]
  );
  if (pins.length > 0) {
    const p = pins[0];
    return {
      serviceable: true,
      cod: Boolean(p.cod_available),
      prepaid: true,
      city: p.city,
      state: p.state,
      eta: p.estimated_days || "3 - 5 working days",
    };
  }
  // Default: every valid 6-digit PIN is deliverable across India.
  return {
    serviceable: true,
    cod: true,
    prepaid: true,
    city: null,
    state: null,
    eta: "3 - 5 working days",
  };
};

/* ===================== GET /serviceability/:pincode (PUBLIC) ===================== */
const getServiceability = async (req, res) => {
  try {
    const pin = String(req.params.pincode || "").trim();
    if (!/^\d{6}$/.test(pin)) {
      return res.status(400).json({
        success: false,
        serviceable: false,
        message: "Please enter a valid 6-digit Indian PIN code",
      });
    }

    // Prefer live Delhivery data when configured…
    const cfg = delhivery.getConfig();
    if (cfg.enabled) {
      try {
        const live = await delhivery.checkPincode(pin);
        return res.status(200).json({
          success: true,
          pincode: pin,
          serviceable: live.serviceable,
          cod_available: live.cod,
          prepaid_available: live.prepaid,
          city: live.city,
          state: live.state,
          estimated_delivery: "3 - 5 working days",
          source: "delhivery",
          message: live.serviceable
            ? `Great! PIN code ${pin} is serviceable for Fast Delivery!`
            : `Sorry, PIN code ${pin} is not serviceable yet.`,
        });
      } catch (e) {
        console.warn("Delhivery serviceability failed, using local fallback:", e.message);
      }
    }

    // …otherwise fall back to the local pincode table (never blocks checkout).
    const local = await localPincodeLookup(pin);
    return res.status(200).json({
      success: true,
      pincode: pin,
      serviceable: local.serviceable,
      cod_available: local.cod,
      prepaid_available: local.prepaid,
      city: local.city,
      state: local.state,
      estimated_delivery: local.eta,
      source: "local",
      message: `Great! PIN code ${pin} is serviceable for Fast Delivery!`,
    });
  } catch (error) {
    console.error("Shipping serviceability error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ===================== GET /charges (PUBLIC) =====================
 * Live Delhivery rate quote used by checkout while ordering.
 * Query: d_pin (required, delivery pincode), mode (optional:
 *   "standard" → Surface / "express" → Express-Air, default "standard"),
 *   weight_g (optional, defaults to Settings → fallback weight),
 *   cod_amount (optional, default 0 — checkout is prepaid-only).
 * Origin pincode always comes from the configured pickup warehouse.
 */
const getCharges = async (req, res) => {
  try {
    const cfg = delhivery.getConfig();
    if (!cfg.enabled) {
      return res.status(400).json({
        success: false,
        message: "Live shipping rates are not configured yet. Standard checkout rates apply.",
      });
    }
    const settings = await getShippingSettings();
    if (!/^\d{6}$/.test(settings.pickup.pincode || "")) {
      return res.status(400).json({
        success: false,
        message: "Pickup warehouse pincode is not configured.",
      });
    }
    const d_pin = String(req.query.d_pin || "").trim();
    if (!/^\d{6}$/.test(d_pin)) {
      return res.status(400).json({ success: false, message: "d_pin must be a 6-digit delivery pincode" });
    }
    const mode = String(req.query.mode || "standard").toLowerCase() === "express" ? "express" : "standard";
    const weight_g = parseInt(req.query.weight_g, 10) || settings.defaultWeightG;
    const cod_amount = Number(req.query.cod_amount || 0);
    const quote = await delhivery.getCharges({
      d_pin,
      o_pin: settings.pickup.pincode,
      weight_g,
      cod_amount,
      // Delhivery md codes: S = Surface (standard), E = Express (air)
      mode: mode === "express" ? "E" : "S",
      env: settings.env,
    });
    if (quote.amount == null) {
      return res.status(502).json({ success: false, message: "Delhivery returned no rate for this route yet" });
    }
    return res.status(200).json({
      success: true,
      d_pin,
      o_pin: settings.pickup.pincode,
      weight_g,
      mode,
      cod_amount,
      amount: quote.amount,
      currency: quote.currency,
      zone: quote.raw?.zone || quote.raw?.[0]?.zone || null,
      source: "delhivery",
    });
  } catch (error) {
    if (error && error.code === "INVALID_PINCODE") {
      return res.status(400).json({ success: false, message: error.message });
    }
    console.error("Shipping charges error:", error);
    const status = error && error.status ? 502 : 500;
    return res.status(status).json({ success: false, message: error.message || "Server error" });
  }
};

/* ===================== TRACKING (AUTHED, OWNER-CHECKED) ===================== */
const getEvents = async (type, orderId, limit = 20) => {
  try {
    const [rows] = await db.query(
      `SELECT status, message, created_at FROM shipping_events
       WHERE order_type = ? AND order_id = ? ORDER BY id DESC LIMIT ?`,
      [type, orderId, Math.min(parseInt(limit, 10) || 20, 50)]
    );
    return rows;
  } catch {
    return [];
  }
};

const loadOwnedOrder = async (type, id, user) => {
  const table = type === "print" ? "printing_orders" : "orders";
  const [rows] = await db.query(`SELECT * FROM \`${table}\` WHERE id = ? LIMIT 1`, [id]);
  const order = rows[0];
  if (!order) return { error: "Order not found", status: 404 };
  if (String(order.user_id) !== String(user.id) && user.role !== "admin") {
    return { error: "Order not found", status: 404 };
  }
  return { order };
};

// Refresh live status at most once per 15 minutes per order (cheap + rate-safe).
const maybeLiveRefresh = async (type, order) => {
  if (!order.delhivery_awb) return null;
  const last = order.shipping_synced_at ? new Date(order.shipping_synced_at).getTime() : 0;
  if (Date.now() - last < 15 * 60 * 1000) return null;
  try {
    const tracking = await delhivery.trackShipment(order.delhivery_awb);
    const res = await applyTrackingStatus(type, order, tracking);
    const [rows] = await db.query(
      `SELECT * FROM \`${type === "print" ? "printing_orders" : "orders"}\` WHERE id = ? LIMIT 1`,
      [order.id]
    );
    return { tracking, applied: res, order: rows[0] || order, live: true };
  } catch (e) {
    console.warn(`Live tracking refresh failed for ${order.delhivery_awb}:`, e.message);
    return null;
  }
};

const getTracking = async (req, res) => {
  try {
    const { type, id } = req.params;
    if (!["order", "print"].includes(type)) {
      return res.status(400).json({ success: false, message: "Invalid tracking type" });
    }
    const { order, error, status } = await loadOwnedOrder(type, id, req.user);
    if (error) return res.status(status).json({ success: false, message: error });

    let live = null;
    let current = order;
    if (delhivery.getConfig().enabled) {
      live = await maybeLiveRefresh(type, order);
      if (live && live.order) current = live.order;
    }
    const events = await getEvents(type, current.id);

    return res.status(200).json({
      success: true,
      data: {
        order_type: type,
        order_number: current.order_number,
        status: current.status,
        awb: current.delhivery_awb || current.tracking_number || null,
        carrier: current.shipping_carrier || (current.delhivery_awb ? "Delhivery" : null),
        shipping_status: current.shipping_status || null,
        shipping_provider: current.shipping_provider || null,
        shipment_created_at: current.shipment_created_at || null,
        shipping_synced_at: current.shipping_synced_at || null,
        refreshed_live: Boolean(live),
        events,
      },
    });
  } catch (error) {
    console.error("Get tracking error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = {
  getServiceability,
  getCharges,
  getTracking,
  getEvents,
};
