/**
 * Travel Advisory location options for the Travel Alerts search dropdown.
 * Always returns the full CountryList + CityList (no O365/manual/weather filters).
 *
 * Catalog is loaded once into an in-memory cache (warmed at server startup).
 * Search requests filter that cache; invalidate after CountryList/CityList updates
 * and restart the app process (or call invalidateTravelAdvisoryLocationsCache
 * from the running server).
 */

const poolPromise = require("../db/dbConn");

const SEARCH_MIN_CHARS = 3;
const SEARCH_DEFAULT_LIMIT = 100;

/** @type {{ countries: Array, cities: Array } | null} */
let cachedCatalog = null;
/** @type {Promise<{ countries: Array, cities: Array }> | null} */
let loadPromise = null;

/**
 * Load all countries + cities from CountryList / CityList (DB hit).
 * @returns {Promise<{ countries: Array, cities: Array }>}
 */
async function fetchAllTravelAdvisoryLocationsFromDb() {
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
 * Ensure catalog is in memory (single-flight; concurrent callers share one load).
 * @returns {Promise<{ countries: Array, cities: Array }>}
 */
async function ensureCatalogLoaded() {
  if (cachedCatalog) {
    return cachedCatalog;
  }
  if (!loadPromise) {
    loadPromise = fetchAllTravelAdvisoryLocationsFromDb()
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
function invalidateTravelAdvisoryLocationsCache() {
  cachedCatalog = null;
  loadPromise = null;
}

/**
 * Warm catalog cache (for server startup). Safe to call multiple times.
 * @returns {Promise<{ countries: Array, cities: Array }>}
 */
async function warmTravelAdvisoryLocationsCache() {
  return ensureCatalogLoaded();
}

/**
 * All countries + cities from cache (loads from DB on first call).
 * @returns {Promise<{ countries: Array, cities: Array }>}
 */
async function getAllTravelAdvisoryLocations() {
  return ensureCatalogLoaded();
}

/**
 * Search cached CityList for Travel Advisory dropdown (Weather-style).
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

  const catalog = await ensureCatalogLoaded();
  const qLower = q.toLowerCase();
  const top = Math.min(
    Math.max(Number(limit) || SEARCH_DEFAULT_LIMIT, 1),
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
    });
  }

  matched.sort((a, b) => {
    if (a.prefix !== b.prefix) return a.prefix - b.prefix;
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

  const cities = matched.slice(0, top).map((m) => m.city);
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
  warmTravelAdvisoryLocationsCache,
  invalidateTravelAdvisoryLocationsCache,
  SEARCH_MIN_CHARS,
};
