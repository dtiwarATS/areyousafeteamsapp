/**
 * Weather alert location options from WeatherAlertSupportedCountry + WeatherAlertCity.
 * Part 1: source=all (Office 365 OFF).
 */

const poolPromise = require("../db/dbConn");

/**
 * Get all countries and cities from weather alert tables.
 * @returns {Promise<{ countries: Array<{ code: string, name: string, region: string }>, cities: Array<{ countryCode: string, countryName: string, cityName: string, state: string|null, latitude: number, longitude: number }> }>}
 */
async function getAllWeatherAlertLocations() {
  const pool = await poolPromise;

  const countriesResult = await pool.request().query(`
    SELECT Id, CountryName AS name, Code AS code, Region AS region
    FROM [dbo].[WeatherAlertSupportedCountry]
    ORDER BY CountryName
  `);

  const citiesResult = await pool.request().query(`
    SELECT
      c.Code AS countryCode,
      c.CountryName AS countryName,
      ci.CityName AS cityName,
      ci.State AS state,
      ci.Latitude AS latitude,
      ci.Longitude AS longitude
    FROM [dbo].[WeatherAlertCity] ci
    INNER JOIN [dbo].[WeatherAlertSupportedCountry] c ON c.Id = ci.CountryId
    ORDER BY c.CountryName, ci.CityName
  `);

  const countries = (countriesResult.recordset || []).map((r) => ({
    code: String(r.code || "").trim(),
    name: String(r.name || "").trim(),
    region: String(r.region || "").trim(),
  }));

  const cities = (citiesResult.recordset || []).map((r) => ({
    countryCode: String(r.countryCode || "").trim(),
    countryName: String(r.countryName || "").trim(),
    cityName: String(r.cityName || "").trim(),
    state: r.state != null ? String(r.state).trim() : null,
    latitude: Number(r.latitude),
    longitude: Number(r.longitude),
  }));

  return { countries, cities };
}

/**
 * Get weather location options for Manage Locations dropdowns.
 * Part 1 supports source=all only. Part 2 will add office365 intersect.
 * @param {'all'|'office365'} source
 * @param {{ teamId?: string }} [opts]
 */
async function getWeatherAlertLocations(source, opts = {}) {
  const mode = String(source || "all").toLowerCase();
  if (mode === "office365") {
    // Part 2: not implemented yet — fall back to all for safety
    return getAllWeatherAlertLocations();
  }
  return getAllWeatherAlertLocations();
}

module.exports = {
  getAllWeatherAlertLocations,
  getWeatherAlertLocations,
};
