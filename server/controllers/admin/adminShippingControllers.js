const db = require("../../config/db");
const delhivery = require("../../utils/delhivery");
const {
  getShippingSettings,
  createShipmentForOrder,
  syncActiveShipments,
} = require("../../utils/shippingSync");

/* ===================== GET /admin/shipping/status =====================
 * Tells the admin panel exactly what is / isn't configured so the
 * "add token in env → whole system works" promise is visible.
 */
const getShippingStatus = async (req, res) => {
  try {
    const cfg = delhivery.getConfig();
    const settings = await getShippingSettings();
    const pickupReady = Boolean(settings.pickup.name) && /^\d{6}$/.test(settings.pickup.pincode || "");
    // Live-probe which env the token actually works on (cheap pin lookup).
    // Your current token is production-only; staging returns 401.
    let tokenHealth = null;
    if (cfg.enabled) {
      try {
        tokenHealth = await delhivery.probeTokenBoth();
      } catch (e) {
        tokenHealth = { error: e.message };
      }
    }
    const effectiveEnv = settings.env || cfg.env;
    const workingEnv = tokenHealth?.workingEnv || null;
    return res.status(200).json({
      success: true,
      data: {
        provider: "delhivery",
        env: effectiveEnv,
        env_file: cfg.env,
        env_db: settings.env,
        env_mismatch: settings.env !== cfg.env,
        working_env: workingEnv,
        token_configured: cfg.enabled,
        token_health: tokenHealth,
        auto_create: settings.autoCreate,
        pickup_configured: pickupReady,
        pickup: settings.pickup,
        default_weight_g: settings.defaultWeightG,
        ready: cfg.enabled && pickupReady,
        hint:
          workingEnv && effectiveEnv !== workingEnv
            ? `Token works on "${workingEnv}" but settings/env-file say "${effectiveEnv}". Set DELHIVERY_ENV=${workingEnv} in server/.env AND Settings → Shipping → env="${workingEnv}", then restart.`
            : null,
      },
    });
  } catch (error) {
    console.error("Admin shipping status error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ===================== GET /admin/shipping/warehouses =====================
 * "Fetch pickup locations from my Delhivery account".
 * Honest answer: Delhivery Express offers NO list-all-warehouses API for a
 * plain API token (official FAQ: "reach out to your business SPOC"). So this
 * endpoint (a) probes token health on staging+production, (b) attempts the
 * only known collection endpoint best-effort, and (c) tells the admin exactly
 * where to copy the name from the Delhivery One portal for verification.
 */
const getWarehouses = async (req, res) => {
  try {
    const cfg = delhivery.getConfig();
    if (!cfg.enabled) {
      return res.status(400).json({ success: false, message: "Delhivery token not configured (DELHIVERY_API_TOKEN)" });
    }
    const settings = await getShippingSettings();
    const health = await delhivery.probeTokenBoth();
    const env = settings.env || cfg.env;
    const listed = await delhivery.listWarehouses({ env });
    return res.status(200).json({
      success: true,
      data: {
        ...listed,
        token_health: health,
        env,
        help: {
          where: "Delhivery One portal → B2C: Left Panel > Settings > Pickup Locations | PTL/B2B: Left Panel > My Facilities > Manage Warehouses",
          next: "Copy the EXACT warehouse Name (case-sensitive), then POST /admin/shipping/warehouses/verify { name, save: true, pincode?, phone?, city?, state?, address? } to validate against Delhivery and save it to Settings → Shipping.",
          note: "Delhivery has no list-all-warehouses API for token auth, so the portal copy step cannot be skipped. The verify call uses POST /api/backend/clientwarehouse/status/ which is the official existence check.",
        },
      },
    });
  } catch (error) {
    console.error("Admin list warehouses error:", error);
    const status = error && error.code === "DELHIVERY_DISABLED" ? 400 : 502;
    return res.status(status).json({ success: false, message: error.message || "Warehouse fetch failed" });
  }
};

/* ===================== POST /admin/shipping/warehouses/verify =====================
 * Body: { name, save?: boolean, pincode?, phone?, city?, state?, address? }
 * Verifies the name exists in Delhivery for the active env. With save:true,
 * writes delhivery_pickup_name (+ any supplied pickup fields) to site_settings
 * so "Admin create shipment" stops failing immediately.
 */
const verifyWarehouse = async (req, res) => {
  try {
    const { name, save = false, pincode, phone, city, state, address } = req.body || {};
    if (!String(name || "").trim()) {
      return res.status(400).json({ success: false, message: 'Warehouse "name" is required (exact name from Delhivery portal)' });
    }
    const settings = await getShippingSettings();
    const result = await delhivery.getWarehouseStatus(name, { env: settings.env });
    if (!result.exists) {
      return res.status(404).json({
        success: false,
        message: `Warehouse "${String(name).trim()}" NOT FOUND in Delhivery (${settings.env}). ${result.error || ""} Check the exact name in Delhivery One → Pickup Locations, or create it via POST /admin/shipping/warehouse.`.trim(),
        data: result,
      });
    }
    let saved = false;
    if (String(save) === "true" || save === true || save === 1) {
      const updates = { delhivery_pickup_name: String(name).trim() };
      // Status API echoes back stored fields when present — persist what we get,
      // preferring explicit body values for pincode/phone/city/state/address.
      const w = result.warehouse || {};
      if (pincode || w.pincode) updates.delhivery_pickup_pincode = String(pincode || w.pincode).trim();
      if (phone || w.phone) updates.delhivery_pickup_phone = String(phone || w.phone).trim();
      if (city || w.city) updates.delhivery_pickup_city = String(city || w.city).trim();
      if (state || w.state) updates.delhivery_pickup_state = String(state || w.state).trim();
      if (address || w.address) updates.delhivery_pickup_address = String(address || w.address).trim();
      for (const [k, v] of Object.entries(updates)) {
        await db.query(
          "INSERT INTO site_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = ?",
          [k, String(v), String(v)]
        );
      }
      saved = true;
    }
    return res.status(200).json({
      success: true,
      message: saved
        ? `Warehouse "${String(name).trim()}" verified with Delhivery and saved to Settings → Shipping`
        : `Warehouse "${String(name).trim()}" exists in Delhivery (${settings.env})`,
      data: { ...result, saved, env: settings.env },
    });
  } catch (error) {
    console.error("Admin verify warehouse error:", error);
    const status = error && error.code === "DELHIVERY_DISABLED" ? 400 : 502;
    return res.status(status).json({ success: false, message: error.message || "Warehouse verification failed" });
  }
};

/* ===================== POST /admin/shipping/shipment =====================
 * Body: { order_type: "order"|"print", order_id }
 * Manual create / retry. Works whenever the token + pickup are set,
 * regardless of the auto-create toggle.
 */
const createShipment = async (req, res) => {
  try {
    const { order_type = "order", order_id } = req.body || {};
    if (!["order", "print"].includes(order_type) || !order_id) {
      return res.status(400).json({ success: false, message: "order_type and order_id are required" });
    }
    const result = await createShipmentForOrder(order_type, order_id, { manual: true });
    if (result.skipped) {
      return res.status(400).json({ success: false, message: result.message });
    }
    return res.status(201).json({ success: true, message: "Shipment created with Delhivery", data: result });
  } catch (error) {
    console.error("Admin create shipment error:", error);
    const status = error && (error.code === "DELHIVERY_DISABLED" || /not configured|required/i.test(error.message || ""))
      ? 400
      : 502;
    return res.status(status).json({ success: false, message: error.message || "Shipment creation failed" });
  }
};

/* ===================== GET /admin/shipping/label?awb=… =====================
 * Proxies the Delhivery packing slip (PDF by default) to the admin browser.
 */
const downloadLabel = async (req, res) => {
  try {
    const awb = String(req.query.awb || "").trim();
    if (!awb) return res.status(400).json({ success: false, message: "awb is required" });
    const pdf = String(req.query.pdf || "true").toLowerCase() !== "false";
    const settings = await getShippingSettings();
    const { buffer, contentType } = await delhivery.getLabel(awb, { pdf, env: settings.env });
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="delhivery-label-${awb}.${pdf ? "pdf" : "json"}"`);
    return res.status(200).send(buffer);
  } catch (error) {
    console.error("Admin label download error:", error);
    const status = error && error.code === "DELHIVERY_DISABLED" ? 400 : 502;
    return res.status(status).json({ success: false, message: error.message || "Label download failed" });
  }
};

/* ===================== POST /admin/shipping/pickup =====================
 * Body: { pickup_date: "YYYY-MM-DD" | ["…"], slot?, awbs?: [...] }
 * Raises ONE pickup request (many shipments). Links returned request id
 * back onto the matching orders for visibility.
 */
const raisePickup = async (req, res) => {
  try {
    const { pickup_date, slot = "11:00", awbs = [] } = req.body || {};
    if (!pickup_date) {
      return res.status(400).json({ success: false, message: "pickup_date (YYYY-MM-DD) is required" });
    }
    const settings = await getShippingSettings();
    if (!settings.pickup.name) {
      return res.status(400).json({ success: false, message: "Pickup warehouse is not configured in Settings → Shipping" });
    }
    const list = Array.isArray(awbs) ? awbs.map((a) => String(a).trim()).filter(Boolean) : [];
    const result = await delhivery.requestPickup({
      pickup_location: settings.pickup.name,
      pickup_date,
      pickup_time: slot,
      expected_package_count: Math.max(list.length, 1),
      env: settings.env,
    });
    const requestId = result.requestId || null;

    let logId = null;
    try {
      const [r] = await db.query(
        `INSERT INTO pickup_requests (provider, pickup_location, pickup_date, slot, awbs, request_id, status, raw)
         VALUES ('delhivery', ?, ?, ?, ?, ?, 'requested', ?)`,
        [
          settings.pickup.name,
          Array.isArray(pickup_date) ? pickup_date[0] : pickup_date,
          slot,
          JSON.stringify(list),
          requestId,
          JSON.stringify(result.raw || {}).slice(0, 8000),
        ]
      );
      logId = r.insertId;
    } catch (e) {
      console.warn("Pickup request log skipped:", e.message);
    }

    if (requestId && list.length) {
      try {
        const placeholders = list.map(() => "?").join(",");
        await db.query(
          `UPDATE orders SET pickup_request_id = ? WHERE delhivery_awb IN (${placeholders})`,
          [requestId, ...list]
        );
        await db.query(
          `UPDATE printing_orders SET pickup_request_id = ? WHERE delhivery_awb IN (${placeholders})`,
          [requestId, ...list]
        );
      } catch (e) {
        console.warn("Linking pickup id to orders skipped:", e.message);
      }
    }

    return res.status(201).json({
      success: true,
      message: "Pickup request raised with Delhivery",
      data: { request_id: requestId, pickup_log_id: logId, packages: list.length },
    });
  } catch (error) {
    console.error("Admin raise pickup error:", error);
    const status = error && error.code === "DELHIVERY_DISABLED" ? 400 : 502;
    return res.status(status).json({ success: false, message: error.message || "Pickup request failed" });
  }
};

/* ===================== POST /admin/shipping/sync =====================
 * Body (optional): { limit } — polls Delhivery for all active AWBs.
 * Same applier the webhook uses.
 */
const syncShipments = async (req, res) => {
  try {
    const summary = await syncActiveShipments({ limit: req.body?.limit || 50 });
    if (summary.skipped) {
      return res.status(400).json({ success: false, message: summary.message });
    }
    return res.status(200).json({ success: true, message: "Tracking sync complete", data: summary });
  } catch (error) {
    console.error("Admin sync shipments error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ===================== POST /admin/shipping/warehouse =====================
 * One-time: register the pickup warehouse with Delhivery.
 */
const registerWarehouse = async (req, res) => {
  try {
    const settings = await getShippingSettings();
    const result = await delhivery.createWarehouse(req.body || {}, { env: settings.env });
    return res.status(201).json({ success: true, message: "Warehouse request sent to Delhivery", data: result });
  } catch (error) {
    console.error("Admin register warehouse error:", error);
    const status = error && error.code === "DELHIVERY_DISABLED" ? 400 : 502;
    return res.status(status).json({ success: false, message: error.message || "Warehouse registration failed" });
  }
};

/* ===================== GET /admin/shipping/waybills?count=N ===================== */
const getWaybills = async (req, res) => {
  try {
    const settings = await getShippingSettings();
    const bills = await delhivery.fetchWaybills(req.query.count || 1, { env: settings.env });
    return res.status(200).json({ success: true, data: { waybills: bills } });
  } catch (error) {
    console.error("Admin fetch waybills error:", error);
    const status = error && error.code === "DELHIVERY_DISABLED" ? 400 : 502;
    return res.status(status).json({ success: false, message: error.message || "Waybill fetch failed" });
  }
};

module.exports = {
  getShippingStatus,
  getWarehouses,
  verifyWarehouse,
  createShipment,
  downloadLabel,
  raisePickup,
  syncShipments,
  registerWarehouse,
  getWaybills,
};
