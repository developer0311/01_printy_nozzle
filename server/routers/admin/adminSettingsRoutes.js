const express = require("express");
const router = express.Router();
const {
  getSiteSettings,
  updateSiteSettings,
  uploadQrImage,
  getAllHeroBanners,
  createHeroBanner,
  updateHeroBanner,
  deleteHeroBanner,
} = require("../../controllers/admin/adminSettingsControllers");
const { protect, authorizeRoles } = require("../../middlewares/authMiddlewares");
const { productImageUpload } = require("../../middlewares/uploadMiddleware");

router.use(protect, authorizeRoles("admin"));

// Settings
router.get("/", getSiteSettings);
router.put("/", updateSiteSettings);
router.post("/qr-image", productImageUpload.single("image"), uploadQrImage);

// Hero banners
router.get("/banners", getAllHeroBanners);
router.post("/banners", productImageUpload.single("image"), createHeroBanner);
router.put("/banners/:id", productImageUpload.single("image"), updateHeroBanner);
router.delete("/banners/:id", deleteHeroBanner);

module.exports = router;
