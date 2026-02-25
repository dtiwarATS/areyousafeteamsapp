/**
 * Azure Maps Weather Severe Alerts – standalone module.
 * Similar to travel-advisory-feed: one function to fetch weather alerts by coordinates.
 *
 * Usage:
 *   const weatherAdvisory = require('./weather-advisory-feed');
 *   const alerts = await weatherAdvisory.getWeatherAlerts(25.7617, -80.1918);
 */

const axios = require("axios");

const BASE_URL = "https://atlas.microsoft.com/weather/severe/alerts/json";

const SUBSCRIPTION_KEY =
  "obYON9j4Shm4ygyCXacBLfRSuokdFUwOkKPHfEw4HdZXFFv2b0zcJQQJ99BFACrJL3Jvic1jAAAgAZMP4Z5Q";
const CLIENT_ID = "19ce0910-52af-46be-b256-107ac4a9bd78";

/**
 * Fetches severe weather alerts from Azure Maps Weather API for the given coordinates.
 *
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {Promise<Array>} Processed alerts array (results with countryCode, alertId, description, category, priority, source, alertAreas)
 */
async function getWeatherAlerts(lat, lon) {
  const latNum = Number(lat);
  const lonNum = Number(lon);
  if (Number.isNaN(latNum) || Number.isNaN(lonNum)) {
    throw new Error("Valid lat and lon are required");
  }

  const params = {
    "api-version": "1.1",
    query: `${latNum},${lonNum}`,
    "subscription-key": SUBSCRIPTION_KEY,
    "x-ms-client-id": CLIENT_ID,
  };

  const response = await axios.get(BASE_URL, {
    params,
    headers: {
      "User-Agent": "AreYouSafeWeatherAdvisory/1.0",
      Accept: "application/json",
    },
    timeout: 15000,
    validateStatus: (status) => status >= 200 && status < 300,
  });

  const results = Array.isArray(response.data?.results)
    ? response.data.results
    : [];

  return results.map((r) => ({
    countryCode: r.countryCode || "",
    alertId: r.alertId,
    description: r.description || { localized: "", english: "" },
    category: r.category || "",
    priority: r.priority ?? 0,
    source: r.source || "",
    sourceId: r.sourceId,
    alertAreas: Array.isArray(r.alertAreas)
      ? r.alertAreas.map((a) => ({
          name: a.name || "",
          summary: a.summary || "",
          startTime: a.startTime || null,
          endTime: a.endTime || null,
          latestStatus: a.latestStatus || { localized: "", english: "" },
          alertDetails: a.alertDetails || "",
          alertDetailsLanguageCode: a.alertDetailsLanguageCode || "en",
        }))
      : [],
  }));
}

module.exports = {
  getWeatherAlerts,
  BASE_URL,
};
