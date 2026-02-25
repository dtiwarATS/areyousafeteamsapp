/**
 * Cron job: every 6 hours.
 * Syncs advisories for selected countries only: fetches RSS, then for each active
 * selected country upserts TravelAdvisoryForSelectedCountry and logs to TravelAdvisoryChangeLog.
 * Uses 3-table schema (no global TravelAdvisories cache).
 */

const { runSync } = require("../travelServices/travel-advisory-sync");
const { processSafetyBotError } = require("../models/processError");

(async () => {
  try {
    const result = await runSync();
    if (!result.success) {
      console.warn(
        "travelAdvisorySelectedCountries-job: runSync had issues:",
        result.error,
      );
    }
  } catch (err) {
    console.error("travelAdvisorySelectedCountries-job error:", err);
    processSafetyBotError(
      err,
      "",
      "",
      "",
      "travelAdvisorySelectedCountries-job: " + (err && err.message),
    );
  }
})();
