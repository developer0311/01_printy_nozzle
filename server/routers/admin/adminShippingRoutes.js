const express = require("express");
const router = express.Router();
const {
  getShippingStatus,
  getWarehouses,
  verifyWarehouse,
  createShipment,
  downloadLabel,
  raisePickup,
  syncShipments,
  registerWarehouse,
  getWaybills,
} = require("../../controllers/admin/adminShippingControllers");
const { protect, authorizeRoles } = require("../../middlewares/authMiddlewares");

router.use(protect, authorizeRoles("admin"));

router.get("/status", getShippingStatus);
router.get("/warehouses", getWarehouses);
router.post("/warehouses/verify", verifyWarehouse);
router.post("/shipment", createShipment);
router.get("/label", downloadLabel);
router.post("/pickup", raisePickup);
router.post("/sync", syncShipments);
router.post("/warehouse", registerWarehouse);
router.get("/waybills", getWaybills);

module.exports = router;
