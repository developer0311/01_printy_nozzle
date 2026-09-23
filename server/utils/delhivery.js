require("dotenv").config();

/**
 * Minimal Delhivery Express client (no extra dependencies — uses global fetch).
 *
 * Configuration (server/.env):
 *   DELHIVERY_ENV=staging|production        (default staging)
 *   DELHIVERY_API_TOKEN=<token>             (required to enable live calls)
 *   DELHIVERY_STAGING_BASE_URL=...          (optional override)
 *   DELHIVERY_PRODUCTION_BASE_URL=...       (optional override)
 *
 * When no token is configured every method throws a DelhiveryDisabledError
 * so callers can fall back gracefully (local pincode table, manual flow).
 * Nothing in the order pipeline may crash because Delhivery is unconfigured.
 */

const STAGING_DEFAULT = "https://staging-express.delhivery.com";
const PRODUCTION_DEFAULT = "https://track.delhivery.com";

class DelhiveryDisabledError extends Error {
  constructor(message = "Delhivery is not configured (missing DELHIVERY_API_TOKEN)") {
    super(message);
    this.name = "DelhiveryDisabledError";
    this.code = "DELHIVERY_DISABLED";
  }
}

class DelhiveryApiError extends Error {
  constructor(message, status = 0, payload = null) {
    super(message);
    this.name = "DelhiveryApiError";
    this.code = "DELHIVERY_API_ERROR";
    this.status = status;
    this.payload = payload;
  }
}

const normalizeEnv = (v) =>
  String(v || "").toLowerCase() === "production" ? "production" : "staging";

const baseUrlFor = (env) => {
  const e = normalizeEnv(env);
  return (
    e === "production"
      ? process.env.DELHIVERY_PRODUCTION_BASE_URL || PRODUCTION_DEFAULT
      : process.env.DELHIVERY_STAGING_BASE_URL || STAGING_DEFAULT
  ).replace(/\/$/, "");
};

const getConfig = () => {
  const env = normalizeEnv(process.env.DELHIVERY_ENV || "staging");
  const baseUrl = baseUrlFor(env);
  const token = (process.env.DELHIVERY_API_TOKEN || "").trim().replace(/^["']|["']$/g, "");
  return { env, baseUrl, token, enabled: Boolean(token) };
};

const requireEnabled = () => {
  const cfg = getConfig();
  if (!cfg.enabled) throw new DelhiveryDisabledError();
  return cfg;
};

const withTimeout = (ms = 20000) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, done: () => clearTimeout(timer) };
};

const authHeaders = (token, extra = {}) => ({
  "Content-Type": "application/json",
  Authorization: `Token ${token}`,
  ...extra,
});

const parseJsonSafe = async (res) => {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { _raw: text.slice(0, 2000) };
  }
};

/* Delhivery error shapes vary: { rmk, error: true|false, ... } for CMU,
 * but field-errors like { prepaid: "wallet balance ..." } for pickup, or
 * { detail: ... } for gateway errors.
 * NOTE: `error` is usually a BOOLEAN flag, never a message — reading it yields "true". */
const pickDelhiveryMessage = (data) => {
  if (!data || typeof data !== "object") return null;
  const candidates = [data.rmk, data.message, data.remark, data.remarks, data.detail];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  if (typeof data.error === "string" && data.error.trim()) return data.error.trim();
  // Last resort: join any other human-readable string fields (skip raw dumps).
  const rest = Object.entries(data)
    .filter(([k, v]) => k !== "_raw" && typeof v === "string" && v.trim() && v.length < 300)
    .map(([, v]) => v.trim());
  if (rest.length) return rest.slice(0, 3).join(" | ");
  return null;
};

const requestJson = async (path, { method = "GET", body = null, form = null, timeoutMs = 20000, env = null } = {}) => {
  const { token } = requireEnabled();
  const baseUrl = env ? baseUrlFor(env) : getConfig().baseUrl;
  const { signal, done } = withTimeout(timeoutMs);
  try {
    const headers = { Authorization: `Token ${token}`, Accept: "application/json" };
    let payload = null;
    if (form) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      payload = new URLSearchParams(form).toString();
    } else {
      headers["Content-Type"] = "application/json";
      payload = body == null ? null : typeof body === "string" ? body : JSON.stringify(body);
    }
    const res = await fetch(`${baseUrl}${path}`, { method, headers, body: payload, signal });
    const data = await parseJsonSafe(res);
    if (!res.ok) {
      const msg = pickDelhiveryMessage(data) || `Delhivery API responded with HTTP ${res.status}`;
      throw new DelhiveryApiError(String(msg).slice(0, 500), res.status, data);
    }
    return data;
  } catch (e) {
    if (e && e.name === "AbortError") {
      throw new DelhiveryApiError("Delhivery API request timed out", 0, null);
    }
    throw e;
  } finally {
    done();
  }
};

/* ===================== 1. PINCODE SERVICEABILITY ===================== */
const checkPincode = async (pincode, { env = null } = {}) => {
  const pin = String(pincode || "").trim();
  if (!/^\d{6}$/.test(pin)) {
    const err = new Error("Please enter a valid 6-digit Indian PIN code");
    err.code = "INVALID_PINCODE";
    throw err;
  }
  const data = await requestJson(`/c/api/pin-codes/json/?filter_codes=${pin}`, { env });
  const codes = (data && (data.delivery_codes || data.deliveryCodes || [])) || [];
  const entry = codes.find((c) => String(c?.postal_code?.pin || c?.pin || "") === pin) || codes[0] || null;
  if (!entry) {
    return { pin, serviceable: false, cod: false, prepaid: false, city: null, state: null, raw: data };
  }
  const pc = entry.postal_code || entry;
  const flag = (v) => String(v || "").toUpperCase() === "Y";
  return {
    pin,
    serviceable: true,
    cod: flag(pc.cod ?? pc.is_cod ?? entry.cod),
    prepaid: flag(pc.prepaid ?? pc.is_prepaid ?? entry.prepaid ?? "Y"),
    city: pc.city || pc.destination_city || pc.district || null,
    state: pc.state || pc.destination_state || pc.state_code || null,
    raw: entry,
  };
};

/* ===================== 2. FETCH WAYBILL(S) =====================
 * Verified live: production answers a bare JSON string, e.g. "64889610000033".
 */
const fetchWaybills = async (count = 1, { env = null } = {}) => {
  const n = Math.min(Math.max(parseInt(count, 10) || 1, 1), 100);
  const data = await requestJson(`/waybill/api/bulk/json/?count=${String(n).padStart(2, "0")}`, { env });
  const asBill = (w) => {
    if (typeof w === "string" || typeof w === "number") return String(w).trim();
    if (w && typeof w === "object") return String(w.waybill ?? w.awb ?? w.wbn ?? "").trim();
    return "";
  };
  let candidates = [];
  if (typeof data === "string" || typeof data === "number") {
    candidates = [data];
  } else if (Array.isArray(data)) {
    candidates = data;
  } else if (data && typeof data === "object") {
    const pool = data.waybills ?? data.data ?? data.wbns ?? data.wbn ?? data.numbers ?? data.waybill ?? [];
    candidates = Array.isArray(pool) ? pool : [pool];
  }
  const bills = candidates.map(asBill).filter(Boolean);
  if (!bills.length) throw new DelhiveryApiError("Delhivery returned no waybills", 200, data);
  return bills;
};

/* ===================== 3. SHIPPING CHARGES ===================== */
const getCharges = async ({ d_pin, o_pin, weight_g, cod_amount = 0, mode = "S", env = null } = {}) => {
  if (!/^\d{6}$/.test(String(d_pin || ""))) {
    const err = new Error("Destination pincode (d_pin) must be a 6-digit PIN code");
    err.code = "INVALID_PINCODE";
    throw err;
  }
  if (!/^\d{6}$/.test(String(o_pin || ""))) {
    const err = new Error("Origin pincode (o_pin) is not configured — set the pickup pincode first");
    err.code = "INVALID_PINCODE";
    throw err;
  }
  const cgm = Math.max(parseInt(weight_g, 10) || 0, 1);
  const params = new URLSearchParams({
    md: mode || "S",
    ss: "Delivered",
    d_pin: String(d_pin),
    o_pin: String(o_pin),
    cgm: String(cgm),
    pt: "Pre-paid",
    cod: String(Number(cod_amount || 0)),
  });
  const data = await requestJson(`/api/kinko/v1/invoice/charges/.json?${params.toString()}`, { env });
  const row = Array.isArray(data) ? data[0] : data;
  const amount = Number(row?.total_amount ?? row?.total ?? row?.charge ?? row?.gross_amount ?? NaN);
  return {
    amount: Number.isFinite(amount) ? Math.round(amount * 100) / 100 : null,
    currency: "INR",
    raw: data,
  };
};

/* ===================== 4. CREATE / UPDATE SHIPMENT (CMU) =====================
 * payload: { pickup_location: "NAME", shipments: [ { name, add, pin, city, state,
 *   country, phone, order, payment_mode: "Prepaid"|"COD", total_amount, cod_amount?,
 *   products_desc?, order_date?, seller_add?, return_*?... , waybill? } ] }
 */
const createShipment = async ({ pickup_location, shipments, env = null }) => {
  if (!pickup_location) throw new Error("pickup_location (warehouse name) is required");
  if (!Array.isArray(shipments) || !shipments.length) throw new Error("At least one shipment is required");
  // Delhivery quirks (verified live against production):
  //  - NO trailing slash: /api/cmu/create.json/ ignores the POST body
  //    ("format key missing in POST"); /api/cmu/create.json parses it.
  //  - pickup_location must be an OBJECT { name }; a bare string crashes
  //    their handler ("'str' object has no attribute 'get'").
  const pickupObj =
    typeof pickup_location === "string" ? { name: pickup_location } : pickup_location;
  const data = await requestJson("/api/cmu/create.json", {
    method: "POST",
    form: { format: "json", data: JSON.stringify({ pickup_location: pickupObj, shipments }) },
    timeoutMs: 30000,
    env,
  });
  const pkgs = data?.packages || data?.data?.packages || [];
  const ok = data?.success === true || data?.success === "true" || (Array.isArray(pkgs) && pkgs.some((p) => p?.status === true || /success/i.test(String(p?.status || p?.remarks || ""))));
  if (!ok && !pkgs.length) {
    throw new DelhiveryApiError(
      String(pickDelhiveryMessage(data) || "Delhivery rejected the shipment request").slice(0, 500),
      200,
      data
    );
  }
  return { success: Boolean(ok), packages: pkgs, raw: data };
};

/* ===================== 5. TRACK SHIPMENT ===================== */
const trackShipment = async (waybill, { env = null } = {}) => {
  const wb = String(waybill || "").trim();
  if (!wb) throw new Error("Waybill is required");
  const data = await requestJson(`/api/v1/packages/json/?waybill=${encodeURIComponent(wb)}&ref_ids=`, { env });
  const list = data?.ShipmentData || data?.shipment_data || [];
  const first = Array.isArray(list) ? list[0] : list;
  const ship = first?.Shipment || first || {};
  const statusObj = ship.Status || {};
  return {
    awb: String(ship.AWB || ship.WayBill || wb),
    orderId: ship.OrderID || ship.RefNum || ship.ReferenceNo || null,
    pickupDate: ship.PickUpDate || null,
    status: statusObj.Status || ship.Status || null,
    statusLocation: statusObj.StatusLocation || null,
    statusDateTime: statusObj.StatusDateTime || null,
    instructions: statusObj.Instructions || null,
    scans: Array.isArray(ship.Scans) ? ship.Scans : [],
    raw: ship,
  };
};

/* ===================== 6. SHIPPING LABEL =====================
 * packing_slip never returns the PDF directly. Verified live:
 *  - pdf=true  → JSON { packages: [{ pdf_download_link: "<presigned S3 url>" }] }
 *  - pdf=false → JSON { packages: [{ wbn, name, address, ... }] } (label data)
 * So for pdf=true we follow the presigned link and proxy the real PDF bytes.
 */
const getLabel = async (waybill, { pdf = true, env = null } = {}) => {
  const { token } = requireEnabled();
  const baseUrl = env ? baseUrlFor(env) : getConfig().baseUrl;
  const wb = String(waybill || "").trim();
  if (!wb) throw new Error("Waybill is required");
  const { signal, done } = withTimeout(60000);
  try {
    const res = await fetch(
      `${baseUrl}/api/p/packing_slip?wbns=${encodeURIComponent(wb)}&pdf=${pdf ? "true" : "false"}`,
      { headers: { Authorization: `Token ${token}`, Accept: "application/json" }, signal }
    );
    if (!res.ok) {
      throw new DelhiveryApiError(`Delhivery label request failed (HTTP ${res.status})`, res.status, null);
    }
    const data = await parseJsonSafe(res);
    const pkg = data?.packages?.[0] || data?.data?.packages?.[0] || null;
    if (!pkg) {
      throw new DelhiveryApiError(
        pickDelhiveryMessage(data) || `No label found for AWB ${wb} (shipment may not be manifested yet)`,
        200,
        data
      );
    }
    if (!pdf) {
      const json = JSON.stringify(data);
      return { buffer: Buffer.from(json, "utf8"), contentType: "application/json" };
    }
    const link = pkg.pdf_download_link || pkg.pdf_link || pkg.link || null;
    if (!link) {
      throw new DelhiveryApiError(
        pickDelhiveryMessage(data) || `Delhivery returned no PDF link for AWB ${wb} yet — try again in a minute`,
        200,
        data
      );
    }
    // Presigned S3 URL — no auth header, valid ~24h (X-Amz-Expires=86400).
    const pdfRes = await fetch(link, { signal });
    if (!pdfRes.ok) {
      throw new DelhiveryApiError(`Label PDF download failed (HTTP ${pdfRes.status})`, pdfRes.status, null);
    }
    const buf = Buffer.from(await pdfRes.arrayBuffer());
    if (buf.length < 1000) {
      throw new DelhiveryApiError("Label PDF came back empty — try again in a minute", 200, null);
    }
    return { buffer: buf, contentType: pdfRes.headers.get("content-type") || "application/pdf" };
  } catch (e) {
    if (e && e.name === "AbortError") throw new DelhiveryApiError("Delhivery label request timed out", 0, null);
    throw e;
  } finally {
    done();
  }
};

/* ===================== 7. RAISE PICKUP REQUEST ===================== */
const requestPickup = async ({ pickup_location, pickup_date, pickup_time = "11:00", expected_package_count = 1, env = null } = {}) => {
  if (!pickup_location) throw new Error("pickup_location is required");
  const dates = Array.isArray(pickup_date) ? pickup_date : [pickup_date].filter(Boolean);
  const data = await requestJson("/fm/request/new/", {
    method: "POST",
    form: {
      format: "json",
      data: JSON.stringify({
        pickup_location,
        pickup_date: dates.length ? dates : undefined,
        pickup_time,
        expected_package_count,
      }),
    },
    timeoutMs: 30000,
    env,
  });
  const requestId =
    data?.pickup_id || data?.pickup_token_number || data?.data?.pickup_id || data?.id || null;
  return { requestId, raw: data };
};

/* ===================== WAREHOUSE (one-time setup) ===================== */
const createWarehouse = async (fields = {}, { env = null } = {}) => {
  const required = ["name", "phone", "address", "city", "pin", "state"];
  for (const k of required) {
    if (!String(fields[k] || "").trim()) throw new Error(`Warehouse field "${k}" is required`);
  }
  const data = await requestJson("/api/backend/clientwarehouse/create/", {
    method: "POST",
    form: {
      name: fields.name,
      phone: fields.phone,
      address: fields.address,
      city: fields.city,
      pin: String(fields.pin),
      state: fields.state,
      country: fields.country || "India",
      ...(fields.email ? { email: fields.email } : {}),
    },
    timeoutMs: 30000,
    env: fields.env || env,
  });
  return { raw: data };
};

/* ===================== WAREHOUSE / PICKUP LOCATION =====================
 * Delhivery Express has NO "list all warehouses" API for a plain API token.
 * Pickup names live in the Delhivery One portal:
 *   B2C  → Settings > Pickup Locations
 *   B2B/PTL → My Facilities > Manage Warehouses
 * What the API *does* offer is a verifier: POST
 * /api/backend/clientwarehouse/status/ { name } → { success, data, error }.
 * Use getWarehouseStatus() to confirm the exact name before manifesting,
 * otherwise CMU fails with "ClientWarehouse matching query does not exist".
 */
const getWarehouseStatus = async (name, { env = null } = {}) => {
  const clean = String(name || "").trim();
  if (!clean) throw new Error('Warehouse "name" is required');
  const data = await requestJson("/api/backend/clientwarehouse/status/", {
    method: "POST",
    body: { name: clean },
    timeoutMs: 20000,
    env,
  });
  // Delhivery sometimes answers XML (no Accept) — normalize _raw XML too.
  let norm = data;
  if (norm && typeof norm._raw === "string") {
    const xml = norm._raw;
    const ok = /<success>\s*True\s*<\/success>/i.test(xml);
    const errM = /<error>([\s\S]*?)<\/error>/i.exec(xml);
    norm = { success: ok, data: { name: clean }, error: errM ? errM[1].trim() : xml.slice(0, 300) };
  }
  const exists = norm?.success === true;
  const d = (norm?.data && typeof norm.data === "object" ? norm.data : {}) || {};
  return {
    name: clean,
    exists,
    warehouse: exists
      ? {
          name: d.name || d.warehouse_name || clean,
          address: d.address || d.return_address || null,
          city: d.city || d.return_city || null,
          state: d.state || d.return_state || null,
          pincode: d.pincode || d.pin || d.return_pin || null,
          phone: d.phone || d.return_phone || null,
          email: d.email || null,
          active: d.active ?? true,
        }
      : null,
    raw: norm,
    error: exists ? null : String(norm?.error || "Warehouse not found in Delhivery for this token/env"),
  };
};

/* Best-effort "list" — documents the platform limitation while trying the
 * only known collection endpoint. Always resolves; never throws for 4xx. */
const listWarehouses = async ({ env = null } = {}) => {
  try {
    const data = await requestJson("/api/backend/clientwarehouses/", {
      method: "POST",
      body: {},
      timeoutMs: 20000,
      env,
    });
    const arr = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
    return {
      supported: arr.length > 0,
      warehouses: arr.map((w) => ({
        name: w?.name || w?.warehouse_name || null,
        city: w?.city || null,
        pincode: w?.pincode || w?.pin || null,
        phone: w?.phone || null,
        active: w?.active ?? true,
      })).filter((w) => w.name),
      raw: data,
    };
  } catch (e) {
    return {
      supported: false,
      warehouses: [],
      error: e?.message || "Warehouse listing is not supported for API-token auth",
      raw: e?.payload || null,
    };
  }
};

/* Checks whether the configured token works against staging / production.
 * Uses the cheap pincode lookup so we never create side effects. */
const probeToken = async (env) => {
  const target = normalizeEnv(env);
  try {
    await requestJson("/c/api/pin-codes/json/?filter_codes=400001", { env: target, timeoutMs: 15000 });
    return { env: target, ok: true, baseUrl: baseUrlFor(target) };
  } catch (e) {
    return { env: target, ok: false, baseUrl: baseUrlFor(target), error: e?.message || "probe failed", status: e?.status ?? 0 };
  }
};

const probeTokenBoth = async () => {
  const [staging, production] = await Promise.all([probeToken("staging"), probeToken("production")]);
  const workingEnv = production.ok ? "production" : staging.ok ? "staging" : null;
  return { staging, production, workingEnv };
};

/* ===================== STATUS NORMALIZATION =====================
 * Maps Delhivery's free-text shipment status to a stable key the app can act on.
 */
const normalizeStatus = (rawStatus) => {
  const s = String(rawStatus || "").toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
  const has = (...words) => words.some((w) => s.includes(w));
  if (!s) return { key: "UNKNOWN", label: rawStatus || "Unknown" };
  if (has("rto deliver")) return { key: "RTO_DELIVERED", label: rawStatus };
  if (has("rto")) return { key: "RTO", label: rawStatus };
  if (has("deliver") && !has("out for", "out-for")) return { key: "DELIVERED", label: rawStatus };
  if (has("out for delivery")) return { key: "OUT_FOR_DELIVERY", label: rawStatus };
  if (has("cancel")) return { key: "CANCELLED", label: rawStatus };
  if (has("lost", "damage")) return { key: "EXCEPTION", label: rawStatus };
  if (has("pick", "pickup", "picked")) {
    if (has("transit", "dispatch", "shed", "hub", "destination", "reach", "arriv", "linehaul", "connect")) {
      return { key: "IN_TRANSIT", label: rawStatus };
    }
    return { key: "PICKED_UP", label: rawStatus };
  }
  if (has("transit", "dispatch", "shed", "hub", "destination", "reach", "arriv", "linehaul", "connect", "shipped")) {
    return { key: "IN_TRANSIT", label: rawStatus };
  }
  if (has("manifest", "pending", "ready to ship", "ready for pickup", "booked", "created", "scheduled")) {
    return { key: "MANIFESTED", label: rawStatus };
  }
  return { key: "OTHER", label: rawStatus };
};

module.exports = {
  DelhiveryDisabledError,
  DelhiveryApiError,
  getConfig,
  baseUrlFor,
  normalizeEnv,
  checkPincode,
  fetchWaybills,
  getCharges,
  createShipment,
  trackShipment,
  getLabel,
  requestPickup,
  createWarehouse,
  getWarehouseStatus,
  listWarehouses,
  probeToken,
  probeTokenBoth,
  normalizeStatus,
};
