const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const cors = require("cors");
const helmet = require("helmet");
require("dotenv").config();

// Self-healing DB migration for 3D-print-in-cart columns (idempotent)
try {
  require("./utils/printCartSchema");
} catch (e) {
  console.warn("⚠️ printCartSchema preload skipped:", e.message);
}

// Self-healing DB migration for Delhivery shipping columns/tables (idempotent)
try {
  require("./utils/delhiverySchema");
} catch (e) {
  console.warn("⚠️ delhiverySchema preload skipped:", e.message);
}

// Seed Printynozzle invoice company settings (idempotent)
try {
  require("./utils/invoiceSchema");
} catch (e) {
  console.warn("⚠️ invoiceSchema preload skipped:", e.message);
}

// Client Routers
const authRoutes = require("./routers/authRoutes");
const profileRoutes = require("./routers/profileRoutes");
const homeRoutes = require("./routers/homeRoutes");
const productRoutes = require("./routers/productRoutes");
const categoryRoutes = require("./routers/categoryRoutes");
const brandRoutes = require("./routers/brandRoutes");
const cartRoutes = require("./routers/cartRoutes");
const orderRoutes = require("./routers/orderRoutes");
const checkoutRoutes = require("./routers/checkoutRoutes");
const printingRoutes = require("./routers/printingRoutes");
const reviewRoutes = require("./routers/reviewRoutes");
const newsletterRoutes = require("./routers/newsletterRoutes");
const contactRoutes = require("./routers/contactRoutes");
const shippingRoutes = require("./routers/shippingRoutes");
const webhookRoutes = require("./routers/webhookRoutes");

// Admin Routers
const adminDashboardRoutes = require("./routers/admin/adminDashboardRoutes");
const adminProductRoutes = require("./routers/admin/adminProductRoutes");
const adminCategoryRoutes = require("./routers/admin/adminCategoryRoutes");
const adminBrandRoutes = require("./routers/admin/adminBrandRoutes");
const adminOrderRoutes = require("./routers/admin/adminOrderRoutes");
const adminPrintingRoutes = require("./routers/admin/adminPrintingRoutes");
const adminUserRoutes = require("./routers/admin/adminUserRoutes");
const adminCouponRoutes = require("./routers/admin/adminCouponRoutes");
const adminSettingsRoutes = require("./routers/admin/adminSettingsRoutes");
const adminNewsletterRoutes = require("./routers/admin/adminNewsletterRoutes");
const adminReviewRoutes = require("./routers/admin/adminReviewRoutes");
const adminShippingRoutes = require("./routers/admin/adminShippingRoutes");

const app = express();

/* ================= MIDDLEWARES ================= */
app.use(helmet());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());

const allowedOrigins = [
  process.env.FRONTEND_URL_1,
  process.env.FRONTEND_URL_2,
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:5174",
  "http://localhost:8000",
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const normalizedOrigin = origin.replace(/\/$/, "");
      if (allowedOrigins.includes(normalizedOrigin) || process.env.NODE_ENV !== "production") {
        return callback(null, true);
      }
      console.warn("⚠️ CORS Origin blocked:", normalizedOrigin);
      return callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Razorpay-Signature"],
  })
);

app.options("*", cors());

/* ================= HEALTH CHECK ================= */
app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "OK", timestamp: new Date().toISOString() });
});

/* ================= CLIENT API ROUTES ================= */
app.use("/api/auth", authRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/home", homeRoutes);
app.use("/api/products", productRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/brands", brandRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/checkout", checkoutRoutes);
app.use("/api/printing", printingRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/newsletter", newsletterRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/shipping", shippingRoutes);
app.use("/api/webhooks", webhookRoutes);

/* ================= ADMIN API ROUTES ================= */
app.use("/api/admin/dashboard", adminDashboardRoutes);
app.use("/api/admin/products", adminProductRoutes);
app.use("/api/admin/categories", adminCategoryRoutes);
app.use("/api/admin/brands", adminBrandRoutes);
app.use("/api/admin/orders", adminOrderRoutes);
app.use("/api/admin/printing", adminPrintingRoutes);
app.use("/api/admin/users", adminUserRoutes);
app.use("/api/admin/coupons", adminCouponRoutes);
app.use("/api/admin/settings", adminSettingsRoutes);
app.use("/api/admin/newsletter", adminNewsletterRoutes);
app.use("/api/admin/reviews", adminReviewRoutes);
app.use("/api/admin/shipping", adminShippingRoutes);

/* ================= 404 HANDLER ================= */
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
});

/* ================= GLOBAL ERROR HANDLER ================= */
app.use((err, req, res, next) => {
  console.error("SERVER ERROR:", err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});

module.exports = app;
