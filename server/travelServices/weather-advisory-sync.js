/**
 * Sync weather advisories for selected cities.
 * For each active Weather selection, expands SelectedLocationsJson and fetches
 * severe alerts from Azure Maps per city coordinates, upserting one AdvisoryDetail
 * row per LocationKey (COUNTRY|city|state).
 * No change logging for weather.
 * Used by travelAdvisorySelectedCountries-job (cron).
 */

const weatherAdvisory = require("./weather-advisory-feed");
const {
  getActiveWeatherSelectedLocations,
  upsertSavedAdvisory,
  deleteWeatherAdvisoryDetailsNotInLocationKeys,
} = require("./travel-advisory-selected-db");

/**
 * Sync weather alerts for all active Weather-type city selections.
 * @returns {{ success: boolean, count: number, insertCount: number, updateCount: number, jobRunAt: Date, error?: string }}
 */
async function runWeatherSync() {
  const jobRunAt = new Date();
  try {
    const selected = await getActiveWeatherSelectedLocations();

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

    // Cache alerts by lat,lon to avoid duplicate API calls for identical coords
    const alertsByCoord = {};
    let updateCount = 0;
    const keysByAdvisory = new Map();

    for (const row of selected) {
      const {
        TravelAdvisorySelectedCountriesId: selectedId,
        CountryCode: countryCode,
        LocationKey: locationKey,
        latitude,
        longitude,
      } = row;

      const lat = latitude != null ? Number(latitude) : NaN;
      const lon = longitude != null ? Number(longitude) : NaN;
      if (Number.isNaN(lat) || Number.isNaN(lon)) continue;

      const coordKey = `${lat},${lon}`;
      if (!Object.prototype.hasOwnProperty.call(alertsByCoord, coordKey)) {
        try {
          alertsByCoord[coordKey] = await weatherAdvisory.getWeatherAlerts(
            lat,
            lon,
          );
        } catch (err) {
          console.error(
            `weatherAdvisorySync: failed to fetch alerts for ${locationKey || countryCode}:`,
            err && err.message,
          );
          alertsByCoord[coordKey] = [];
        }
      }

      const alerts = alertsByCoord[coordKey] || [];
      await upsertSavedAdvisory(
        selectedId,
        countryCode,
        alerts,
        jobRunAt,
        "Weather",
        locationKey || undefined,
      );
      updateCount++;

      if (locationKey) {
        if (!keysByAdvisory.has(selectedId)) {
          keysByAdvisory.set(selectedId, []);
        }
        keysByAdvisory.get(selectedId).push(locationKey);
      }
    }

    for (const [advisoryId, keys] of keysByAdvisory.entries()) {
      await deleteWeatherAdvisoryDetailsNotInLocationKeys(advisoryId, keys);
    }

    console.log(
      `weatherAdvisorySync: at ${jobRunAt.toISOString()} processed ${selected.length} city selections, updates=${updateCount}`,
    );
    return {
      success: true,
      count: selected.length,
      insertCount: 0,
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
