const db = require("../config/db");
const delhivery = require("./delhivery");

/**
 * Shared Delhivery orchestration: auto-create shipments, apply tracking
 * updates (webhook + poll use the same applier), and record history.
 *
 * Design rules (production safety):
 *  - Nothing here ever throws into the order/payment flow. Async entry
 *    points catch everything and persist `shipping_error` for the admin.
 *  - Order status only ever ADVANCES from courier events, and terminal
 *    states (delivered/cancelled/returned) are never overwritten.
 *  - When Delhivery is unconfigured (no token) everything silently skips.
 */

const TERMINAL_SHIP = ["DELIVERED", "RTO_DELIVERED", "CANCELLED"];
const TERMINAL_ORDER = ["delivered", "cancelled", "returned"];

const ORDER_RANK = { pending: 0, confirmed: 1, processing: 2, shipped: 3, delivered: 4, cancelled: 5, returned: 5 };
const PRINT_RANK = {
  pending: 0, confirmed: 1, reviewing: 2, in_production: 3, printing: 4,
  quality_check: 5, shipped: 6, delivered: 7, cancelled: 8,
};

const tableFor = (type) => (type === "print" ? "printing_orders" : "orders");
const rankFor = (type, status) => {
  const map = type === "print" ? PRINT_RANK : ORDER_RANK;
  return map[status] ?? -1;
};

/* ===================== SETTINGS ===================== */
const getShippingSettings = async () => {
  const [rows] = await db.query("SELECT setting_key, setting_value FROM site_settings");
  const map = {};
  rows.forEach((r) => {
    map[r.setting_key] = r.setting_value;
  });
  return {
    env: map.delhivery_env || "staging",
    autoCreate: String(map.delhivery_auto_create || "0") === "1",
    defaultWeightG: parseInt(map.delhivery_default_weight_g, 10) || 500,
    pickup: {
      name: (map.delhivery_pickup_name || "").trim(),
      address: (map.delhivery_pickup_address || "").trim(),
      city: (map.delhivery_pickup_city || "").trim(),
      state: (map.delhivery_pickup_state || "").trim(),
      pincode: (map.delhivery_pickup_pincode || "").trim(),
      phone: (map.delhivery_pickup_phone || "").trim(),
    },
  };
};

/* ===================== EVENTS ===================== */
const recordEvent = async (type, orderId, awb, status, message, raw = null) => {
  try {
    await db.query(
      `INSERT INTO shipping_events (order_type, order_id, awb, status, message, raw)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        type,
        orderId,
        awb || null,
        status ? String(status).slice(0, 60) : null,
        message ? String(message).slice(0, 1000) : null,
        raw ? JSON.stringify(raw).slice(0, 8000) : null,
      ]
    );
  } catch (e) {
    // Events table may not exist on legacy DBs — history is best-effort.
    console.warn("⚠️ shipping event not recorded:", e.message);
  }
};

const lastEventFor = async (type, orderId, awb) => {
  try {
    const [rows] = await db.query(
      `SELECT status, message, created_at FROM shipping_events
       WHERE order_type = ? AND order_id = ? AND (awb = ? OR (? IS NULL AND awb IS NULL))
       ORDER BY id DESC LIMIT 1`,
      [type, orderId, awb || null, awb || null]
    );
    return rows[0] || null;
  } catch {
    return null;
  }
};

const setShippingError = async (type, id, message) => {
  try {
    await db.query(`UPDATE \`${tableFor(type)}\` SET shipping_error = ? WHERE id = ?`, [
      String(message || "").slice(0, 1000),
      id,
    ]);
  } catch {
    /* column may not exist yet — ignore */
  }
};

/* ===================== SHIPMENT PAYLOAD ===================== */
const digits = (v, len = 10) => {
  const d = String(v || "").replace(/\D/g, "");
  return d.length >= len ? d.slice(-len) : d;
};

const buildShipmentPayload = (type, order, items, settings) => {
  const phone = digits(order.shipping_phone) || digits(settings.pickup.phone);
  if (!/^\d{6}$/.test(String(order.shipping_pincode || ""))) {
    throw new Error(`Invalid delivery pincode "${order.shipping_pincode}"`);
  }
  if (!phone) throw new Error("No valid consignee phone number on the order");

  const names = (items || [])
    .map((it) => it.product_name || it.file_name || "Item")
    .filter(Boolean);
  const productsDesc =
    names.length <= 2
      ? names.join(", ")
      : `${names.slice(0, 2).join(", ")} +${names.length - 2} more`;
  const total = Number(order.total_amount || 0);
  const isCod = order.payment_method === "cod" && order.payment_status !== "paid";

  let weightG = settings.defaultWeightG;
  if (type === "print") {
    const w = Number(order.estimated_weight || 0) * Number(order.quantity || 1);
    if (w > 0) weightG = Math.max(Math.round(w), 50);
  }

  const created = order.created_at ? new Date(order.created_at) : new Date();
  return {
    name: String(order.shipping_name || "Customer").slice(0, 100),
    add: String(order.shipping_address1 || "").slice(0, 200),
    pin: String(order.shipping_pincode),
    city: String(order.shipping_city || "").slice(0, 50),
    state: String(order.shipping_state || "").slice(0, 50),
    country: "India",
    phone,
    order: String(order.order_number),
    payment_mode: isCod ? "COD" : "Prepaid",
    total_amount: total,
    cod_amount: isCod ? total : 0,
    products_desc: productsDesc.slice(0, 120) || "General merchandise",
    order_date: created.toISOString().slice(0, 10),
    weight: weightG,
    quantity: type === "print" ? Number(order.quantity || 1) : undefined,
    return_name: settings.pickup.name || undefined,
    return_add: settings.pickup.address || undefined,
    return_city: settings.pickup.city || undefined,
    return_state: settings.pickup.state || undefined,
    return_country: "India",
    return_pin: settings.pickup.pincode || undefined,
    return_phone: digits(settings.pickup.phone) || undefined,
  };
};

/* ===================== CREATE SHIPMENT FOR AN ORDER ===================== */
const createShipmentForOrder = async (type, id, { manual = false } = {}) => {
  const cfg = delhivery.getConfig();
  if (!cfg.enabled) {
    return { skipped: "disabled", message: "Delhivery token not configured" };
  }
  const settings = await getShippingSettings();
  if (!manual && !settings.autoCreate) {
    return { skipped: "auto-off", message: "Auto-create is off (enable in Settings or create manually)" };
  }
  if (!settings.pickup.name || !/^\d{6}$/.test(settings.pickup.pincode || "")) {
    throw new Error(
      "Pickup warehouse name + pincode must be configured in Settings → Shipping. " +
        "Copy the EXACT pickup name from your Delhivery One portal (B2C: Settings → Pickup Locations; PTL: My Facilities → Manage Warehouses), " +
        "then use Admin → Shipping → Verify & Save (GET /admin/shipping/warehouses, POST /admin/shipping/warehouses/verify) to validate it. " +
        "Delhivery has no list-all-warehouses API for token auth, so auto-fetch is not possible."
    );
  }
  if (settings.env !== cfg.env) {
    console.warn(
      `⚠️ Delhivery env mismatch: Settings says "${settings.env}" but server .env (DELHIVERY_ENV) is "${cfg.env}". ` +
        `Using "${settings.env}" for this call — restart the server after aligning DELHIVERY_ENV=${settings.env}.`
    );
  }

  const table = tableFor(type);
  const [rows] = await db.query(`SELECT * FROM \`${table}\` WHERE id = ? LIMIT 1`, [id]);
  const order = rows[0];
  if (!order) throw new Error("Order not found");
  if (TERMINAL_ORDER.includes(order.status)) {
    return { skipped: "terminal", message: `Order already ${order.status}` };
  }
  if (order.delhivery_awb) {
    return { skipped: "exists", message: "Shipment already exists", awb: order.delhivery_awb };
  }
  if (!manual && order.payment_method !== "cod" && order.payment_status !== "paid") {
    return { skipped: "unpaid", message: "Waiting for payment confirmation" };
  }

  let items = [];
  if (type === "order") {
    const [itemRows] = await db.query(
      "SELECT product_name, file_name, quantity, price, total FROM order_items WHERE order_id = ?",
      [id]
    );
    items = itemRows;
  } else {
    items = [{ product_name: `3D Print: ${order.file_name}`, quantity: order.quantity }];
  }

  const payload = buildShipmentPayload(type, order, items, settings);
  const result = await delhivery.createShipment({
    pickup_location: settings.pickup.name,
    shipments: [payload],
    env: settings.env,
  });
  const pkg = (result.packages || [])[0] || {};
  const awb = String(pkg.waybill || pkg.awb || "").trim();
  if (!awb) {
    const hint = pkg.remarks || pkg.status || "unknown";
    throw new Error(
      "Delhivery accepted the request but returned no AWB (" + String(hint) + "). Check the Delhivery panel."
    );
  }

  const updates = {
    shipping_provider: "delhivery",
    delhivery_awb: awb,
    shipping_status: "MANIFESTED",
    shipment_created_at: new Date(),
    shipping_error: null,
    shipping_synced_at: new Date(),
  };
  if (type === "order") {
    updates.tracking_number = awb;
    updates.shipping_carrier = "Delhivery";
  }
  const sets = Object.keys(updates).map((k) => `\`${k}\` = ?`).join(", ");
  await db.query(`UPDATE \`${table}\` SET ${sets} WHERE id = ?`, [...Object.values(updates), id]);

  await recordEvent(type, id, awb, "MANIFESTED", `Shipment created with Delhivery (AWB ${awb})`, pkg);
  return { success: true, awb, shipping_status: "MANIFESTED" };
};

/* Fire-and-forget hook for the payment/order flow — never throws. */
const triggerAutoShipment = (type, id) => {
  setImmediate(async () => {
    try {
      const res = await createShipmentForOrder(type, id, { manual: false });
      if (res && res.success) {
        console.log(`📦 Delhivery shipment auto-created for ${type} #${id} (AWB ${res.awb})`);
      }
    } catch (e) {
      if (e && e.code === "DELHIVERY_DISABLED") return; // not configured → stay silent
      console.error(`⛔ Delhivery auto-shipment failed for ${type} #${id}:`, e.message);
      await setShippingError(type, id, `Auto-shipment failed: ${e.message} (retry from Admin → Orders)`);
      try {
        await recordEvent(type, id, null, "SHIPMENT_FAILED", `Auto-shipment failed: ${e.message}`, null);
      } catch {
        /* ignore */
      }
    }
  });
};

/* ===================== LOOKUP BY AWB ===================== */
const findOrderByAwb = async (awb) => {
  const clean = String(awb || "").trim();
  if (!clean) return null;
  const [o] = await db.query("SELECT *, 'order' AS _type FROM orders WHERE delhivery_awb = ? LIMIT 1", [clean]);
  if (o.length) return { type: "order", order: o[0] };
  const [p] = await db.query("SELECT *, 'print' AS _type FROM printing_orders WHERE delhivery_awb = ? LIMIT 1", [clean]);
  if (p.length) return { type: "print", order: p[0] };
  return null;
};

/* ===================== APPLY TRACKING UPDATE =====================
 * Single funnel for webhook + poll + manual sync. Advances order status,
 * stamps courier timestamps, records history. Never regresses.
 */
const applyTrackingStatus = async (type, order, tracking) => {
  const table = tableFor(type);
  const norm = delhivery.normalizeStatus(tracking?.status);
  const now = new Date();
  const stamp = tracking?.statusDateTime ? new Date(tracking.statusDateTime) : now;
  const at = Number.isNaN(stamp.getTime()) ? now : stamp;

  // Dedupe: same status reported twice (webhook + poll) → one event.
  const last = await lastEventFor(type, order.id, order.delhivery_awb);
  const scanLine = [norm.label, tracking?.statusLocation, tracking?.instructions].filter(Boolean).join(" • ");
  const isRepeat = last && last.status === norm.key && (last.message || "") === scanLine;

  const patch = { shipping_status: norm.key, shipping_synced_at: now };
  const orderPatch = {};
  const rankNow = rankFor(type, order.status);

  const advance = (to, extra = {}) => {
    if (TERMINAL_ORDER.includes(order.status)) return; // never touch terminal orders
    if (rankFor(type, to) >= rankNow) {
      orderPatch.status = to;
      Object.assign(orderPatch, extra);
    }
  };

  switch (norm.key) {
    case "MANIFESTED":
      break; // label created — order flow untouched
    case "PICKED_UP":
    case "IN_TRANSIT":
      advance(type === "print" ? "shipped" : "shipped", type === "order" ? { shipped_at: at } : {});
      break;
    case "OUT_FOR_DELIVERY":
      advance(type === "print" ? "shipped" : "shipped", type === "order" ? { shipped_at: order.shipped_at || at, out_for_delivery_at: at } : {});
      break;
    case "DELIVERED":
      advance("delivered", type === "order" ? { shipped_at: order.shipped_at || at, delivered_at: at } : {});
      break;
    case "RTO":
      if (type === "order") advance("returned", {});
      break; // prints: keep production status, shipping_status shows RTO
    case "RTO_DELIVERED":
      if (type === "order") advance("returned", {});
      break;
    case "CANCELLED":
      advance("cancelled", type === "order" ? { cancelled_at: at } : {});
      break;
    default:
      break; // EXCEPTION / OTHER / UNKNOWN → history only
  }

  const sets = { ...patch, ...orderPatch };
  const keys = Object.keys(sets);
  if (keys.length) {
    await db.query(`UPDATE \`${table}\` SET ${keys.map((k) => `\`${k}\` = ?`).join(", ")} WHERE id = ?`, [
      ...keys.map((k) => sets[k]),
      order.id,
    ]);
  }
  if (!isRepeat) {
    await recordEvent(type, order.id, order.delhivery_awb, norm.key, scanLine || norm.label, {
      status: tracking?.status,
      location: tracking?.statusLocation,
      datetime: tracking?.statusDateTime,
    });
  }
  return { status: norm.key, orderStatus: orderPatch.status || order.status, changed: Boolean(orderPatch.status) };
};

/* ===================== POLL SYNC (cron / manual) ===================== */
const syncActiveShipments = async ({ limit = 50 } = {}) => {
  const cfg = delhivery.getConfig();
  if (!cfg.enabled) return { skipped: "disabled", message: "Delhivery token not configured" };
  const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);

  const [orders] = await db.query(
    `SELECT *, 'order' AS _t FROM orders
     WHERE delhivery_awb IS NOT NULL AND delhivery_awb <> ''
       AND NOT (status IN ('delivered','cancelled','returned') AND shipping_status IN (${TERMINAL_SHIP.map(() => "?").join(",")}))
     ORDER BY shipping_synced_at IS NULL DESC, shipping_synced_at ASC LIMIT ?`,
    [...TERMINAL_SHIP, lim]
  );
  const [prints] = await db.query(
    `SELECT *, 'print' AS _t FROM printing_orders
     WHERE delhivery_awb IS NOT NULL AND delhivery_awb <> ''
       AND NOT (status IN ('delivered','cancelled','returned') AND shipping_status IN (${TERMINAL_SHIP.map(() => "?").join(",")}))
     ORDER BY shipping_synced_at IS NULL DESC, shipping_synced_at ASC LIMIT ?`,
    [...TERMINAL_SHIP, lim]
  );
  const due = [...orders.map((o) => ({ type: "order", order: o })), ...prints.map((o) => ({ type: "print", order: o }))].slice(0, lim);

  const summary = { checked: 0, updated: 0, failed: 0, errors: [] };
  const settings = await getShippingSettings();
  for (const { type, order } of due) {
    try {
      const tracking = await delhivery.trackShipment(order.delhivery_awb, { env: settings.env });
      const res = await applyTrackingStatus(type, order, tracking);
      summary.checked += 1;
      if (res.changed) summary.updated += 1;
    } catch (e) {
      summary.checked += 1;
      summary.failed += 1;
      if (summary.errors.length < 5) summary.errors.push(`${order.delhivery_awb}: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 300)); // be gentle with rate limits
  }
  return summary;
};

module.exports = {
  TERMINAL_SHIP,
  getShippingSettings,
  recordEvent,
  lastEventFor,
  buildShipmentPayload,
  createShipmentForOrder,
  triggerAutoShipment,
  findOrderByAwb,
  applyTrackingStatus,
  syncActiveShipments,
};
