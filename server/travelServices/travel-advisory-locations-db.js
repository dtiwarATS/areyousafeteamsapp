/**
 * Travel Advisory location options for the Travel Alerts search dropdown.
 * Always returns the full CountryList + CityList (no O365/manual/weather filters).
 */

const sql = require("mssql");
const poolPromise = require("../db/dbConn");

const SEARCH_MIN_CHARS = 3;
const SEARCH_DEFAULT_LIMIT = 100;

/**
 * Escape LIKE wildcards for SQL Server parameterized patterns.
 * @param {string} value
 */
function escapeLikePattern(value) {
  return String(value || "")
    .replace(/\[/g, "[[]")
    .replace(/%/g, "[%]")
    .replace(/_/g, "[_]");
}

/**
 * All countries + cities from CountryList / CityList.
 * @returns {Promise<{ countries: Array, cities: Array }>}
 */
async function getAllTravelAdvisoryLocations() {
  const pool = await poolPromise;

  const countriesResult = await pool.request().query(`
    SELECT Id, CountryName AS name, Code AS code, Region AS region
    FROM [dbo].[CountryList]
    WHERE CountryName IS NOT NULL AND LTRIM(RTRIM(CountryName)) <> ''
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
    FROM [dbo].[CityList] ci
    INNER JOIN [dbo].[CountryList] c ON c.Id = ci.CountryId
    WHERE ci.CityName IS NOT NULL AND LTRIM(RTRIM(ci.CityName)) <> ''
    ORDER BY c.CountryName, ci.CityName
  `);

  const countries = (countriesResult.recordset || []).map((r) => ({
    code: String(r.code || "").trim(),
    name: String(r.name || "").trim(),
    region: String(r.region || "").trim(),
    available: true,
  }));

  const cities = (citiesResult.recordset || []).map((r) => ({
    countryCode: String(r.countryCode || "").trim(),
    countryName: String(r.countryName || "").trim(),
    cityName: String(r.cityName || "").trim(),
    state: r.state != null ? String(r.state).trim() : null,
    latitude:
      r.latitude != null && Number.isFinite(Number(r.latitude))
        ? Number(r.latitude)
        : null,
    longitude:
      r.longitude != null && Number.isFinite(Number(r.longitude))
        ? Number(r.longitude)
        : null,
    available: true,
  }));

  return { countries, cities };
}

/**
 * Search CityList for Travel Advisory dropdown (Weather-style single city query).
 * Returns cities only; countries is always [] for API compatibility.
 * @param {string} query
 * @param {number} [limit]
 * @returns {Promise<{ countries: Array, cities: Array }>}
 */
async function searchTravelAdvisoryLocations(
  query,
  limit = SEARCH_DEFAULT_LIMIT,
) {
  const q = String(query || "").trim();
  if (q.length < SEARCH_MIN_CHARS) {
    return { countries: [], cities: [] };
  }

  const pool = await poolPromise;
  const pattern = `%${escapeLikePattern(q)}%`;
  const prefixPattern = `${escapeLikePattern(q)}%`;
  const top = Math.min(
    Math.max(Number(limit) || SEARCH_DEFAULT_LIMIT, 1),
    200,
  );

  const result = await pool
    .request()
    .input("pattern", sql.NVarChar(400), pattern)
    .input("prefixPattern", sql.NVarChar(400), prefixPattern)
    .input("limit", sql.Int, top)
    .query(`
      SELECT TOP (@limit)
        c.Code AS countryCode,
        c.CountryName AS countryName,
        ci.CityName AS cityName,
        ci.State AS state,
        ci.Latitude AS latitude,
        ci.Longitude AS longitude
      FROM [dbo].[CityList] ci
      INNER JOIN [dbo].[CountryList] c ON c.Id = ci.CountryId
      WHERE
        ci.CityName LIKE @pattern
        OR ISNULL(ci.State, '') LIKE @pattern
        OR c.CountryName LIKE @pattern
      ORDER BY
        CASE WHEN ci.CityName LIKE @prefixPattern THEN 0 ELSE 1 END,
        ci.CityName,
        c.CountryName
    `);

  const cities = (result.recordset || []).map((r) => ({
    countryCode: String(r.countryCode || "").trim(),
    countryName: String(r.countryName || "").trim(),
    cityName: String(r.cityName || "").trim(),
    state: r.state != null ? String(r.state).trim() : null,
    latitude:
      r.latitude != null && Number.isFinite(Number(r.latitude))
        ? Number(r.latitude)
        : null,
    longitude:
      r.longitude != null && Number.isFinite(Number(r.longitude))
        ? Number(r.longitude)
        : null,
    available: true,
  }));

  return { countries: [], cities };
}

/**
 * Travel location options for the Travel Alerts search dropdown.
 * Optional opts.q (3+ chars) searches CityList (cities only, like Weather).
 * @param {{ q?: string }} [opts]
 * @returns {Promise<{ countries: Array, cities: Array }>}
 */
async function getTravelAdvisoryLocations(opts = {}) {
  const q = String(opts.q || "").trim();
  if (q.length >= SEARCH_MIN_CHARS) {
    return searchTravelAdvisoryLocations(q);
  }
  return getAllTravelAdvisoryLocations();
}

module.exports = {
  getAllTravelAdvisoryLocations,
  searchTravelAdvisoryLocations,
  getTravelAdvisoryLocations,
  SEARCH_MIN_CHARS,
};
