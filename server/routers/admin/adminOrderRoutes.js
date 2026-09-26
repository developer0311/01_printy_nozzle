const express = require("express");
const router = express.Router();
const {
  getAllOrders,
  getOrderDetails,
  updateOrderStatus,
  verifyQrPayment,
  createManualInvoice,
  listManualInvoices,
  getManualInvoice,
  downloadManualInvoicePdf,
  deleteManualInvoice,
} = require("../../controllers/admin/adminOrderControllers");
// GST invoice (JSON by default, ?format=pdf to download) — the client
// handler already permits role=admin for any order.
const { getOrderInvoice } = require("../../controllers/orderControllers");
const { protect, authorizeRoles } = require("../../middlewares/authMiddlewares");

router.use(protect, authorizeRoles("admin"));

router.get("/", getAllOrders);
router.post("/manual-invoices", createManualInvoice);
router.get("/manual-invoices", listManualInvoices);
router.get("/manual-invoices/:id/pdf", downloadManualInvoicePdf);
router.get("/manual-invoices/:id", getManualInvoice);
router.delete("/manual-invoices/:id", deleteManualInvoice);
router.get("/:id/invoice", getOrderInvoice);
router.get("/:id", getOrderDetails);
router.put("/:id/status", updateOrderStatus);
router.put("/:id/verify-payment", verifyQrPayment);

module.exports = router;
