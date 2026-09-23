require("dotenv").config();
const app = require("./app");

const PORT = process.env.PORT || process.env.SERVER_PORT || 3000;

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`🚀 Printynozzle Server is running on port ${PORT}`);
  });

  // Periodic Delhivery tracking sync (poll fallback beside the webhook).
  // No-op unless DELHIVERY_API_TOKEN is set. Interval via
  // DELHIVERY_SYNC_MINUTES (default 15). Set 0 to disable.
  try {
    const minutes = parseInt(process.env.DELHIVERY_SYNC_MINUTES || "15", 10);
    if (minutes > 0) {
      const { syncActiveShipments } = require("./utils/shippingSync");
      const runSync = async () => {
        try {
          const summary = await syncActiveShipments({ limit: 50 });
          if (summary && !summary.skipped && summary.checked > 0) {
            console.log(
              `🔄 Delhivery sync: ${summary.checked} checked, ${summary.updated} advanced, ${summary.failed} failed`
            );
          }
        } catch (e) {
          console.warn("⚠️ Delhivery scheduled sync failed:", e.message);
        }
      };
      const timer = setInterval(runSync, minutes * 60 * 1000);
      if (timer.unref) timer.unref();
      console.log(`⏱️ Delhivery tracking sync every ${minutes} min`);
    }
  } catch (e) {
    console.warn("⚠️ Delhivery sync scheduler skipped:", e.message);
  }
}

module.exports = app;