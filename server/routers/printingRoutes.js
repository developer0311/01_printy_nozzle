const express = require("express");
const router = express.Router();
const {
  uploadPrintFile,
  getPrintingConfig,
  getMaterials,
  getColors,
  calculatePrice,
  createPrintOrder,
  getUserPrintOrders,
  getPrintOrderById,
  getPrintOrderInvoice,
} = require("../controllers/printingControllers");
const { protect } = require("../middlewares/authMiddlewares");
const { printFileUpload } = require("../middlewares/uploadMiddleware");

// Public endpoints
router.get("/materials", getMaterials);
router.get("/colors", getColors);
router.get("/config", getPrintingConfig);
router.post("/calculate-price", calculatePrice);
router.post("/upload", printFileUpload.single("file"), uploadPrintFile);

// Authenticated print order endpoints
router.post("/order", protect, createPrintOrder);
router.get("/orders", protect, getUserPrintOrders);
router.get("/orders/:id/invoice", protect, getPrintOrderInvoice);
router.get("/orders/:id", protect, getPrintOrderById);

module.exports = router;
