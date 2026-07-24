/**
 * Weather alert location options for Manage Locations dropdowns.
 * source=all      → supported CountryList + CityList (fast); optional q searches all CityList
 * source=manual   → LOCATION_CONFIGURATION (ISOffice365Location null/0) + available flag
 * source=office365 → LOCATION_CONFIGURATION (ISOffice365Location=1) + available flag
 *
 * Full CountryList/CityList catalog is cached in memory (warmed at server startup).
 * source=all search filters that cache; invalidate after CountryList/CityList updates
 * and restart the app process (or call invalidateWeatherAlertLocationsCache).
 */

const sql = require("mssql");
const poolPromise = require("../db/dbConn");

const CITY_SEARCH_MIN_CHARS = 3;
const CITY_SEARCH_DEFAULT_LIMIT = 100;

/**
 * Full catalog: all countries/cities with available = IsWeatherAlertSupported.
 * @type {{ countries: Array, cities: Array } | null}
 */
let cachedCatalog = null;
/** @type {Promise<{ countries: Array, cities: Array }> | null} */
let loadPromise = null;

/**
 * Load all countries + cities from CountryList / CityList (DB hit).
 * Includes unsupported rows so search can return available: false.
 * @returns {Promise<{ countries: Array, cities: Array }>}
 */
async function fetchFullWeatherAlertCatalogFromDb() {
  const pool = await poolPromise;

  const countriesResult = await pool.request().query(`
    SELECT
      CountryName AS name,
      Code AS code,
      Region AS region,
      IsWeatherAlertSupported AS isWeatherAlertSupported
    FROM [dbo].[CountryList]
    WHERE CountryName IS NOT NULL AND LTRIM(RTRIM(CountryName)) <> ''
    ORDER BY CountryName
  `);

  const citiesResult = await pool.request().query(`
    SELECT
      c.Code AS countryCode,
      c.CountryName AS countryName,
      c.IsWeatherAlertSupported AS isWeatherAlertSupported,
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
    available: Boolean(r.isWeatherAlertSupported),
  }));

  const cities = (citiesResult.recordset || []).map((r) => ({
    countryCode: String(r.countryCode || "").trim(),
    countryName: String(r.countryName || "").trim(),
    cityName: String(r.cityName || "").trim(),
    state: r.state != null ? String(r.state).trim() : null,
    latitude: Number(r.latitude),
    longitude: Number(r.longitude),
    available: Boolean(r.isWeatherAlertSupported),
  }));

  return { countries, cities };
}

/**
 * Ensure full catalog is in memory (single-flight).
 * @returns {Promise<{ countries: Array, cities: Array }>}
 */
async function ensureCatalogLoaded() {
  if (cachedCatalog) {
    return cachedCatalog;
  }
  if (!loadPromise) {
    loadPromise = fetchFullWeatherAlertCatalogFromDb()
      .then((catalog) => {
        cachedCatalog = catalog;
        loadPromise = null;
        return catalog;
      })
      .catch((err) => {
        loadPromise = null;
        throw err;
      });
  }
  return loadPromise;
}

/**
 * Clear in-memory catalog. Call after CountryList/CityList updates on the
 * running server process. Standalone seed CLI cannot clear the app process —
 * restart the tab-handler server after re-seeding.
 */
function invalidateWeatherAlertLocationsCache() {
  cachedCatalog = null;
  loadPromise = null;
}

/**
 * Warm catalog cache (for server startup). Safe to call multiple times.
 * @returns {Promise<{ countries: Array, cities: Array }>}
 */
async function warmWeatherAlertLocationsCache() {
  return ensureCatalogLoaded();
}

/**
 * Supported countries + cities only (IsWeatherAlertSupported = 1).
 * Served from in-memory catalog after first load.
 * @returns {Promise<{ countries: Array, cities: Array }>}
 */
async function getAllWeatherAlertLocations() {
  const catalog = await ensureCatalogLoaded();
  return {
    countries: catalog.countries.filter((c) => c.available),
    cities: catalog.cities.filter((c) => c.available),
  };
}

/**
 * Search cached CityList (including unsupported countries) for the dropdown.
 * Unsupported cities are returned with available: false.
 * @param {string} query
 * @param {number} [limit]
 * @returns {Promise<Array>}
 */
async function searchWeatherAlertCities(
  query,
  limit = CITY_SEARCH_DEFAULT_LIMIT,
) {
  const q = String(query || "").trim();
  if (q.length < CITY_SEARCH_MIN_CHARS) return [];

  const catalog = await ensureCatalogLoaded();
  const qLower = q.toLowerCase();
  const top = Math.min(
    Math.max(Number(limit) || CITY_SEARCH_DEFAULT_LIMIT, 1),
    200,
  );

  const matched = [];
  for (const city of catalog.cities) {
    const cityName = city.cityName || "";
    const state = city.state || "";
    const countryName = city.countryName || "";
    const cityLower = cityName.toLowerCase();
    const stateLower = state.toLowerCase();
    const countryLower = countryName.toLowerCase();

    if (
      !cityLower.includes(qLower) &&
      !stateLower.includes(qLower) &&
      !countryLower.includes(qLower)
    ) {
      continue;
    }

    matched.push({
      city,
      prefix: cityLower.startsWith(qLower) ? 0 : 1,
      unsupported: city.available ? 0 : 1,
    });
  }

  matched.sort((a, b) => {
    if (a.prefix !== b.prefix) return a.prefix - b.prefix;
    if (a.unsupported !== b.unsupported) return a.unsupported - b.unsupported;
    const cityCmp = (a.city.cityName || "").localeCompare(
      b.city.cityName || "",
      undefined,
      { sensitivity: "base" },
    );
    if (cityCmp !== 0) return cityCmp;
    return (a.city.countryName || "").localeCompare(
      b.city.countryName || "",
      undefined,
      { sensitivity: "base" },
    );
  });

  return matched.slice(0, top).map((m) => m.city);
}

/**
 * Load CountryList lookup maps (by name and by code) for IsWeatherAlertSupported = 1 only.
 * Uses cached catalog when available.
 * @returns {Promise<{ byName: Map<string, { code: string, name: string, region: string }>, byCode: Map<string, { code: string, name: string, region: string }> }>}
 */
async function loadSupportedCountryLookup() {
  const catalog = await ensureCatalogLoaded();
  const byName = new Map();
  const byCode = new Map();

  for (const c of catalog.countries) {
    if (!c.available) continue;
    const name = String(c.name || "").trim();
    const code = String(c.code || "").trim();
    const region = String(c.region || "").trim();
    if (!name && !code) continue;
    const entry = { code, name, region };
    if (name) byName.set(name.toUpperCase(), entry);
    if (code) byCode.set(code.toUpperCase(), entry);
  }

  return { byName, byCode };
}

/**
 * Parse a coordinate value from a SQL row; null when missing/invalid.
 * @param {*} value
 * @returns {number|null}
 */
function toCoordinate(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Normalize LOCATION_CONFIGURATION rows and mark availability vs supported CountryList.
 * @param {Array} rows
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

    const joinedCode = String(row.countryCode || "").trim();
    const joinedName = String(row.countryName || "").trim();
    const available =
      row.isWeatherAlertSupported != null
        ? Boolean(Number(row.isWeatherAlertSupported))
        : Boolean(matched);
    const countryCode = joinedCode || matched?.code || orgCountry;
    const countryName = joinedName || matched?.name || orgCountry;
    const region = String(row.region || matched?.region || "").trim();

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

    const latitude = toCoordinate(row.latitude);
    const longitude = toCoordinate(row.longitude);
    const state =
      row.state != null && String(row.state).trim() !== ""
        ? String(row.state).trim()
        : null;

    cities.push({
      countryCode,
      countryName,
      cityName,
      state,
      latitude,
      longitude,
      available,
    });
  }

  const countries = [...countryMap.values()].sort((a, b) => {
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
    SELECT
      LC.COUNTRY AS country,
      LC.CITY AS city,
      c.Code AS countryCode,
      c.CountryName AS countryName,
      c.Region AS region,
      c.IsWeatherAlertSupported AS isWeatherAlertSupported,
      COALESCE(ci.State, LC.STATE) AS state,
      ci.Latitude AS latitude,
      ci.Longitude AS longitude
    FROM [dbo].[LOCATION_CONFIGURATION] LC
    OUTER APPLY (
      SELECT TOP 1 Id, Code, CountryName, Region, IsWeatherAlertSupported
      FROM [dbo].[CountryList]
      WHERE UPPER(LTRIM(RTRIM(LC.COUNTRY))) IN (
          UPPER(LTRIM(RTRIM(CountryName))),
          UPPER(LTRIM(RTRIM(Code)))
        )
      ORDER BY CountryName
    ) c
    OUTER APPLY (
      SELECT TOP 1 State, Latitude, Longitude
      FROM [dbo].[CityList]
      WHERE CountryId = c.Id
        AND UPPER(LTRIM(RTRIM(LC.CITY))) = UPPER(LTRIM(RTRIM(CityName)))
        AND (
          LC.STATE IS NULL
          OR LTRIM(RTRIM(LC.STATE)) = ''
          OR UPPER(LTRIM(RTRIM(ISNULL(State, '')))) = UPPER(LTRIM(RTRIM(LC.STATE)))
        )
      ORDER BY State
    ) ci
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

async function getManualWeatherAlertLocations(tenantId) {
  return getConfiguredWeatherAlertLocations(tenantId, "manual");
}

async function getOffice365WeatherAlertLocations(tenantId) {
  return getConfiguredWeatherAlertLocations(tenantId, "office365");
}

/**
 * Get weather location options for Manage Locations dropdowns.
 * Optional opts.q (3+ chars) searches the full CityList for source=all.
 * @param {'all'|'office365'|'manual'} source
 * @param {{ teamId?: string, tenantId?: string, q?: string }} [opts]
 */
async function getWeatherAlertLocations(source, opts = {}) {
  const mode = String(source || "all").toLowerCase();
  const tenantId = opts.tenantId || "";
  const q = String(opts.q || "").trim();

  if (mode === "manual") {
    return getManualWeatherAlertLocations(tenantId);
  }
  if (mode === "office365") {
    return getOffice365WeatherAlertLocations(tenantId);
  }

  if (q.length >= CITY_SEARCH_MIN_CHARS) {
    const cities = await searchWeatherAlertCities(q);
    return { countries: [], cities };
  }

  return getAllWeatherAlertLocations();
}

module.exports = {
  getAllWeatherAlertLocations,
  getWeatherAlertLocations,
  getManualWeatherAlertLocations,
  getOffice365WeatherAlertLocations,
  searchWeatherAlertCities,
  warmWeatherAlertLocationsCache,
  invalidateWeatherAlertLocationsCache,
};
