/**
 * Sync weather advisories for selected countries.
 * For each active Weather-type selection, fetches severe alerts from Azure Maps
 * by country coordinates and upserts into AdvisoryDetail.
 * No change logging for weather.
 * Used by travelAdvisorySelectedCountries-job (cron).
 */

const weatherAdvisory = require("./weather-advisory-feed");
const {
  getActiveWeatherSelectedCountries,
  upsertSavedAdvisory,
} = require("./travel-advisory-selected-db");

/**
 * Sync weather alerts for all active Weather-type selections.
 * Groups by country code to avoid duplicate API calls, then upserts each selection.
 * @returns {{ success: boolean, count: number, insertCount: number, updateCount: number, jobRunAt: Date, error?: string }}
 */
async function runWeatherSync() {
  const jobRunAt = new Date();
  try {
    const selected = await getActiveWeatherSelectedCountries();

    if (!selected || selected.length === 0) {
      console.log(
        `weatherAdvisorySync: no active weather selections at ${jobRunAt.toISOString()}`,
      );
      return {
        success: true,
        count: 0,
        insertCount: 0,
        updateCount: 0,
        jobRunAt,
      };
    }

    const alertsByCode = {};
    const coordsByCode = {};
    for (const row of selected) {
      const code = (row.CountryCode || "").toUpperCase();
      if (code && row.latitude != null && row.longitude != null) {
        coordsByCode[code] = { lat: row.latitude, lon: row.longitude };
      }
    }

    for (const code of Object.keys(coordsByCode)) {
      try {
        const { lat, lon } = coordsByCode[code];
        alertsByCode[code] = await weatherAdvisory.getWeatherAlerts(lat, lon);
      } catch (err) {
        console.error(
          `weatherAdvisorySync: failed to fetch alerts for ${code}:`,
          err && err.message,
        );
        alertsByCode[code] = [];
      }
    }

    let insertCount = 0;
    let updateCount = 0;

    for (const row of selected) {
      const {
        TravelAdvisorySelectedCountriesId: selectedId,
        CountryCode: countryCode,
      } = row;

      const code = (countryCode || "").toUpperCase();
      const alerts = alertsByCode[code];
      if (!alerts) continue;

      await upsertSavedAdvisory(
        selectedId,
        countryCode,
        alerts,
        jobRunAt,
        "Weather",
      );
      updateCount++;
    }

    console.log(
      `weatherAdvisorySync: at ${jobRunAt.toISOString()} processed ${selected.length} selected, updates=${updateCount}`,
    );
    return {
      success: true,
      count: selected.length,
      insertCount,
      updateCount,
      jobRunAt,
    };
  } catch (err) {
    console.error("weatherAdvisorySync error:", err);
    return {
      success: false,
      count: 0,
      insertCount: 0,
      updateCount: 0,
      jobRunAt,
      error: err && err.message ? err.message : String(err),
    };
  }
}

module.exports = { runWeatherSync };
