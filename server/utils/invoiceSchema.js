const db = require("../config/db");

/**
 * Self-healing seeds for the invoice PDF + invoice email system.
 *
 * Adds Printynozzle company / invoice `site_settings` keys so the
 * Tax Invoice header, footer, terms and HSN defaults are editable
 * from the Admin panel (generic site-settings update endpoint).
 *
 * Idempotent — existing values are never overwritten.
 */

const INVOICE_SETTING_SEEDS = [
  ["company_name", "Printynozzle", "string", "Legal/company name printed on invoices"],
  [
    "company_address",
    "145 Indira Nagar Block 3, Panihati, Sodepur, Opposite Shree Krishna Sweets, North 24 Parganas, 700110, West Bengal, India",
    "string",
    "Company address printed on invoices",
  ],
  ["company_phone", "8583928948", "string", "Company phone printed on invoices"],
  ["company_email", "support@printynozzle.in", "string", "Company email printed on invoices"],
  ["company_gstin", "", "string", "Company GSTIN printed on invoices (blank = hidden)"],
  ["company_website", "https://printynozzle.in", "string", "Company website printed on invoices"],
  ["invoice_jurisdiction", "Kolkata", "string", "Jurisdiction line on invoices (Subject to X Jurisdiction)"],
  ["invoice_default_hsn", "85423900", "string", "Fallback HSN for product lines without one"],
  ["invoice_print_hsn", "84859000", "string", "HSN used for custom 3D-print lines"],
  ["invoice_shipping_hsn", "996819", "string", "HSN used for the delivery/shipping line"],
  [
    "invoice_terms",
    "01) Customer Notification: Notify us within 2 days of delivery, in case the delivered product is faulty, incorrect or not as specified. Post which such claim will not be liability of Printynozzle.|02) Warranty Replacement: Warranty claims result in product replacement then only product will be shipped. In case the product is unavailable, a refund will be issued as per policy.|03) GST Compliance: The buyer must ensure an active GST number at the time of order booking. Inactive or missing GST number on the invoice shall be considered as B2C Supply; in such case no input tax credit can be claimed by the buyer.|04) Online Orders: Buyers must provide correct GST No. and other relevant details at the time of order booking only. No subsequent changes in the GST and other details shall be considered.",
    "string",
    "Invoice Terms & Conditions lines (| separated)",
  ],
];

let ensurePromise = null;

const ensureInvoiceSchema = async () => {
  if (ensurePromise) return ensurePromise;
  ensurePromise = (async () => {
    try {
      const conn = await db.getConnection();
      try {
        for (const [key, value, type, desc] of INVOICE_SETTING_SEEDS) {
          try {
            await conn.query(
              `INSERT INTO site_settings (setting_key, setting_value, setting_type, description)
               VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE setting_value = setting_value`,
              [key, value, type, desc]
            );
          } catch (e) {
            console.warn(`⚠️ Could not seed invoice setting ${key}: ${e.message}`);
          }
        }

        // One-time cleanup: older installs carry ElectroLab placeholder
        // credentials — swap those known dummies for Printynozzle defaults.
        // Admin-edited (non-dummy) values are never touched.
        try {
          const [addrRows] = await conn.query(
            "SELECT setting_value FROM site_settings WHERE setting_key = 'company_address'"
          );
          const addr = (addrRows[0]?.setting_value || "").toLowerCase();
          if (addr.includes("maker street") || addr.includes("koramangala") || addr.includes("electrolab")) {
            await conn.query(
              "UPDATE site_settings SET setting_value = ? WHERE setting_key = 'company_address'",
              [
                "145 Indira Nagar Block 3, Panihati, Sodepur, Opposite Shree Krishna Sweets, North 24 Parganas, 700110, West Bengal, India",
              ]
            );
            console.log("🧾 Invoice company address updated to Printynozzle default");
          }
        } catch (e) {
          console.warn(`⚠️ Could not refresh invoice company address: ${e.message}`);
        }
      } finally {
        conn.release();
      }
    } catch (e) {
      console.warn(`⚠️ invoice schema check skipped: ${e.message}`);
    }
  })();
  return ensurePromise;
};

// Fire-and-forget on require so fresh deploys self-heal without manual SQL.
ensureInvoiceSchema().catch(() => {});

module.exports = { ensureInvoiceSchema };
