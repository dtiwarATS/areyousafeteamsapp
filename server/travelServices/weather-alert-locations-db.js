/**
 * Weather alert location options for Manage Locations dropdowns.
 * source=all      → WeatherAlertSupportedCountry + WeatherAlertCity (all available)
 * source=manual   → LOCATION_CONFIGURATION (ISOffice365Location null/0) + available flag
 * source=office365 → LOCATION_CONFIGURATION (ISOffice365Location=1) + available flag
 */

const sql = require("mssql");
const poolPromise = require("../db/dbConn");

/**
 * Get all countries and cities from weather alert tables.
 * @returns {Promise<{ countries: Array, cities: Array }>}
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
    available: true,
  }));

  const cities = (citiesResult.recordset || []).map((r) => ({
    countryCode: String(r.countryCode || "").trim(),
    countryName: String(r.countryName || "").trim(),
    cityName: String(r.cityName || "").trim(),
    state: r.state != null ? String(r.state).trim() : null,
    latitude: Number(r.latitude),
    longitude: Number(r.longitude),
    available: true,
  }));

  return { countries, cities };
}

/**
 * Load WeatherAlertSupportedCountry lookup maps (by name and by code).
 * @returns {Promise<{ byName: Map<string, { code: string, name: string, region: string }>, byCode: Map<string, { code: string, name: string, region: string }> }>}
 */
async function loadSupportedCountryLookup() {
  const pool = await poolPromise;
  const result = await pool.request().query(`
    SELECT CountryName AS name, Code AS code, Region AS region
    FROM [dbo].[WeatherAlertSupportedCountry]
  `);

  const byName = new Map();
  const byCode = new Map();

  for (const r of result.recordset || []) {
    const name = String(r.name || "").trim();
    const code = String(r.code || "").trim();
    const region = String(r.region || "").trim();
    if (!name && !code) continue;
    const entry = { code, name, region };
    if (name) byName.set(name.toUpperCase(), entry);
    if (code) byCode.set(code.toUpperCase(), entry);
  }

  return { byName, byCode };
}

/**
 * Normalize LOCATION_CONFIGURATION rows and mark availability vs WeatherAlertSupportedCountry.
 * @param {Array<{ country?: string, city?: string }>} rows
 * @param {{ byName: Map, byCode: Map }} supported
 */
function normalizeConfiguredLocationsWithAvailability(rows, supported) {
  const countryMap = new Map();
  const cities = [];
  const cityKeys = new Set();
  const { byName, byCode } = supported || {
    byName: new Map(),
    byCode: new Map(),
  };

  for (const row of rows || []) {
    const orgCountry = String(row.country || "").trim();
    const cityName = String(row.city || "").trim();
    if (!orgCountry && !cityName) continue;

    const matched =
      (orgCountry && byName.get(orgCountry.toUpperCase())) ||
      (orgCountry && byCode.get(orgCountry.toUpperCase())) ||
      null;

    const available = Boolean(matched);
    const countryCode = available
      ? matched.code || orgCountry
      : orgCountry;
    const countryName = available ? matched.name || orgCountry : orgCountry;
    const region = available ? matched.region || "" : "";

    const countryKey = String(countryCode || countryName).toUpperCase();
    if (orgCountry && !countryMap.has(countryKey)) {
      countryMap.set(countryKey, {
        code: countryCode,
        name: countryName,
        region,
        available,
      });
    }

    if (!cityName || !orgCountry) continue;
    const key = `${countryKey}|${cityName.toLowerCase()}`;
    if (cityKeys.has(key)) continue;
    cityKeys.add(key);

    cities.push({
      countryCode,
      countryName,
      cityName,
      state: null,
      latitude: null,
      longitude: null,
      available,
    });
  }

  const countries = [...countryMap.values()].sort((a, b) => {
    // Available first, then by name
    if (a.available !== b.available) return a.available ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  cities.sort(
    (a, b) =>
      a.countryName.localeCompare(b.countryName) ||
      a.cityName.localeCompare(b.cityName),
  );

  return { countries, cities };
}

/**
 * Locations from LOCATION_CONFIGURATION for a tenant, filtered by Office365 flag.
 * @param {string} tenantId
 * @param {'manual'|'office365'} mode
 */
async function getConfiguredWeatherAlertLocations(tenantId, mode) {
  const tid = String(tenantId || "").trim();
  if (!tid) {
    return { countries: [], cities: [] };
  }

  const pool = await poolPromise;
  const request = pool
    .request()
    .input("tenantId", sql.NVarChar(sql.MAX), tid);

  const office365Filter =
    mode === "office365"
      ? "AND LC.ISOffice365Location = 1"
      : "AND (LC.ISOffice365Location IS NULL OR LC.ISOffice365Location = 0)";

  const result = await request.query(`
    SELECT DISTINCT
      LC.COUNTRY AS country,
      LC.CITY AS city
    FROM [dbo].[LOCATION_CONFIGURATION] LC
    WHERE LC.TENENT_ID = @tenantId
      ${office365Filter}
      AND (
        (LC.COUNTRY IS NOT NULL AND LTRIM(RTRIM(LC.COUNTRY)) <> '')
        OR (LC.CITY IS NOT NULL AND LTRIM(RTRIM(LC.CITY)) <> '')
      )
    ORDER BY LC.COUNTRY, LC.CITY
  `);

  const supported = await loadSupportedCountryLookup();
  return normalizeConfiguredLocationsWithAvailability(
    result.recordset || [],
    supported,
  );
}

/**
 * Manual locations from LOCATION_CONFIGURATION (ISOffice365Location null/0).
 * @param {string} tenantId
 */
async function getManualWeatherAlertLocations(tenantId) {
  return getConfiguredWeatherAlertLocations(tenantId, "manual");
}

/**
 * Office 365 locations from LOCATION_CONFIGURATION (ISOffice365Location=1).
 * @param {string} tenantId
 */
async function getOffice365WeatherAlertLocations(tenantId) {
  return getConfiguredWeatherAlertLocations(tenantId, "office365");
}

/**
 * Get weather location options for Manage Locations dropdowns.
 * @param {'all'|'office365'|'manual'} source
 * @param {{ teamId?: string, tenantId?: string }} [opts]
 */
async function getWeatherAlertLocations(source, opts = {}) {
  const mode = String(source || "all").toLowerCase();
  const tenantId = opts.tenantId || "";

  if (mode === "manual") {
    return getManualWeatherAlertLocations(tenantId);
  }
  if (mode === "office365") {
    return getOffice365WeatherAlertLocations(tenantId);
  }
  return getAllWeatherAlertLocations();
}

module.exports = {
  getAllWeatherAlertLocations,
  getWeatherAlertLocations,
  getManualWeatherAlertLocations,
  getOffice365WeatherAlertLocations,
};
