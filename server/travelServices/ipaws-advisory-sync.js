/**
 * Cron sync: fetch FEMA IPAWS public feed once, cache alerts, upsert Travel
 * AdvisoryDetail for active U.S. city selections that match.
 */

const ipawsFeed = require("./ipaws-advisory-feed");
const ipawsCacheDb = require("./ipaws-alert-cache-db");
const {
  getActiveTravelUsCityLocations,
  upsertSavedAdvisory,
} = require("./travel-advisory-selected-db");

/**
 * @returns {Promise<{ success: boolean, error?: string, fetched?: number, cached?: number, citiesMatched?: number }>}
 */
async function runIpawsSync() {
  const jobRunAt = new Date();
  try {
    await ipawsCacheDb.ensureIpawsAlertCacheTable();

    let parsed;
    try {
      parsed = await ipawsFeed.fetchAndParseRecentAlerts();
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      console.error("ipawsAdvisorySync: feed fetch failed:", msg);
      return { success: false, error: msg };
    }

    const alerts = Array.isArray(parsed.alerts) ? parsed.alerts : [];
    const cached = await ipawsCacheDb.upsertIpawsAlerts(alerts, jobRunAt);
    const expiredDeleted =
      await ipawsCacheDb.deleteExpiredIpawsAlerts(jobRunAt);

    // Prefer live feed alerts; if empty, match against non-expired cache.
    let matchAlerts = alerts;
    if (matchAlerts.length === 0) {
      matchAlerts = await ipawsCacheDb.getActiveIpawsAlerts(jobRunAt);
    }

    const selected = await getActiveTravelUsCityLocations();
    let citiesMatched = 0;

    for (const row of selected) {
      const loc = {
        countryCode: row.CountryCode,
        countryName: row.countryName || "United States",
        cityName: row.cityName,
        state: row.state,
        latitude: row.latitude,
        longitude: row.longitude,
      };
      const matched = ipawsFeed.getIpawsAlertsForLocationFromAlerts(
        matchAlerts,
        loc,
      );
      if (!matched.length) continue;

      const advisory = ipawsFeed.toTravelAdvisory(matched, loc);
      if (!advisory) continue;

      await upsertSavedAdvisory(
        row.TravelAdvisorySelectedCountriesId,
        "US",
        advisory,
        jobRunAt,
        "Travel",
        row.LocationKey,
      );
      citiesMatched++;
    }

    console.log(
      `ipawsAdvisorySync: fetched=${alerts.length} cachedUpserts=${cached} expiredDeleted=${expiredDeleted} matchPool=${matchAlerts.length} selectedCities=${selected.length} matched=${citiesMatched} at ${jobRunAt.toISOString()}`,
    );

    return {
      success: true,
      fetched: alerts.length,
      cached,
      expiredDeleted,
      citiesMatched,
    };
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    console.error("ipawsAdvisorySync error:", msg);
    return { success: false, error: msg };
  }
}

module.exports = { runIpawsSync };
