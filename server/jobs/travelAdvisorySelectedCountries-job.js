/**
 * Cron job: every 6 hours.
 * Syncs travel advisories (RSS) and weather advisories (Azure Maps)
 * for selected countries. Each sync runs independently so a failure
 * in one does not block the other.
 */

const { runSync } = require("../travelServices/travel-advisory-sync");
const { runWeatherSync } = require("../travelServices/weather-advisory-sync");
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

  try {
    const result = await runWeatherSync();
    if (!result.success) {
      console.warn(
        "travelAdvisorySelectedCountries-job: runWeatherSync had issues:",
        result.error,
      );
    }
  } catch (err) {
    console.error(
      "travelAdvisorySelectedCountries-job weatherSync error:",
      err,
    );
    processSafetyBotError(
      err,
      "",
      "",
      "",
      "travelAdvisorySelectedCountries-job weatherSync: " +
        (err && err.message),
    );
  }
})();
