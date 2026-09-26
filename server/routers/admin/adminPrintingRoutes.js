const express = require("express");
const router = express.Router();
const {
  getAllPrintOrders,
  getPrintOrderDetails,
  getPrintOrderInvoice,
  updatePrintOrderStatus,
  verifyQrPayment,
  getAllMaterials,
  createMaterial,
  updateMaterial,
  deleteMaterial,
  getAllColors,
  createColor,
  updateColor,
  deleteColor,
} = require("../../controllers/admin/adminPrintingControllers");
const { protect, authorizeRoles } = require("../../middlewares/authMiddlewares");

router.use(protect, authorizeRoles("admin"));

// Print orders
router.get("/orders", getAllPrintOrders);
router.get("/orders/:id/invoice", getPrintOrderInvoice);
router.get("/orders/:id", getPrintOrderDetails);
router.put("/orders/:id/status", updatePrintOrderStatus);
router.put("/orders/:id/verify-payment", verifyQrPayment);

// Materials management
router.get("/materials", getAllMaterials);
router.post("/materials", createMaterial);
router.put("/materials/:id", updateMaterial);
router.delete("/materials/:id", deleteMaterial);

// Colors management
router.get("/colors", getAllColors);
router.post("/colors", createColor);
router.put("/colors/:id", updateColor);
router.delete("/colors/:id", deleteColor);

module.exports = router;
