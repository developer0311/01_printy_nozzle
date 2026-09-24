const express = require("express");
const router = express.Router();
const {
  getAllProducts,
  getProductById,
  checkDeliveryPincode,
  getProductsByCategory,
  searchProducts,
  getBestSellersMenu,
} = require("../controllers/productControllers");

router.get("/", getAllProducts);
router.get("/search", searchProducts);
router.get("/best-sellers/menu", getBestSellersMenu);
router.post("/check-pincode", checkDeliveryPincode);
router.get("/check-pincode/:pincode", checkDeliveryPincode);
router.get("/category/:slug", getProductsByCategory);
router.get("/:id", getProductById);

module.exports = router;
