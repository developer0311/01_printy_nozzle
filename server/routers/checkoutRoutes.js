const express = require("express");
const router = express.Router();
const {
  initiateCheckout,
  createRazorpayOrder,
  verifyPayment,
  uploadPaymentScreenshot,
} = require("../controllers/checkoutControllers");
const { protect } = require("../middlewares/authMiddlewares");
const { paymentScreenshotUpload } = require("../middlewares/uploadMiddleware");

router.use(protect); // Checkout operations require login

router.post("/initiate", initiateCheckout);
router.post("/razorpay-order", createRazorpayOrder);
router.post("/verify-payment", verifyPayment);
router.post("/payment-screenshot", paymentScreenshotUpload.single("screenshot"), uploadPaymentScreenshot);

module.exports = router;
