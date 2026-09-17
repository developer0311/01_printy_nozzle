const express = require("express");
const router = express.Router();
const {
  getAllOrders,
  getOrderDetails,
  updateOrderStatus,
} = require("../../controllers/admin/adminOrderControllers");
// GST invoice (JSON by default, ?format=pdf to download) — the client
// handler already permits role=admin for any order.
const { getOrderInvoice } = require("../../controllers/orderControllers");
const { protect, authorizeRoles } = require("../../middlewares/authMiddlewares");

router.use(protect, authorizeRoles("admin"));

router.get("/", getAllOrders);
router.get("/:id/invoice", getOrderInvoice);
router.get("/:id", getOrderDetails);
router.put("/:id/status", updateOrderStatus);

module.exports = router;
