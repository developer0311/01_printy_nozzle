const express = require("express");
const router = express.Router();
const { getAnnouncementCoupon } = require("../controllers/couponControllers");

// Public — the storefront announcement bar reads this on every load.
router.get("/announcement", getAnnouncementCoupon);

module.exports = router;
