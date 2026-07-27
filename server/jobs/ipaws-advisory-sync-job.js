/**
 * Cron job: every 5 minutes.
 * Fetches FEMA IPAWS public feed, caches alerts, updates Travel US-city details.
 */

const { runIpawsSync } = require("../travelServices/ipaws-advisory-sync");
const { processSafetyBotError } = require("../models/processError");

(async () => {
  try {
    const result = await runIpawsSync();
    if (!result.success) {
      console.warn(
        "ipaws-advisory-sync-job: runIpawsSync had issues:",
        result.error,
      );
    }
  } catch (err) {
    console.error("ipaws-advisory-sync-job error:", err);
    processSafetyBotError(
      err,
      "",
      "",
      "",
      "ipaws-advisory-sync-job: " + (err && err.message),
    );
  }
  process.exit(0);
})();
