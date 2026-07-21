/**
 * Location configuration (Settings → Configure Locations) dropdown data.
 * Countries: full CountryList (not filtered by IsWeatherAlertSupported).
 * Cities: CityList for the selected country (includes State for "City (State)" labels).
 */

const sql = require("mssql");
const poolPromise = require("../db/dbConn");

/**
 * All countries for Configure Locations country dropdown from CountryList.
 * @returns {Promise<Array<{ name: string, code: string }>>}
 */
async function getLocationConfigCountries() {
  const pool = await poolPromise;
  const result = await pool.request().query(`
    SELECT
      LTRIM(RTRIM(CountryName)) AS name,
      LTRIM(RTRIM(Code)) AS code
    FROM [dbo].[CountryList]
    WHERE CountryName IS NOT NULL AND LTRIM(RTRIM(CountryName)) <> ''
    ORDER BY CountryName
  `);

  return (result.recordset || []).map((r) => ({
    name: String(r.name || "").trim(),
    code: String(r.code || "").trim(),
  }));
}

/**
 * Cities for a selected country (by code and/or name), with state for display.
 * @param {{ countryCode?: string, countryName?: string }} opts
 * @returns {Promise<Array<{ countryCode: string, countryName: string, cityName: string, state: string|null }>>}
 */
async function getLocationConfigCities(opts = {}) {
  const countryCode = String(opts.countryCode || "")
    .trim()
    .toUpperCase();
  const countryName = String(opts.countryName || "").trim();

  if (!countryCode && !countryName) {
    return [];
  }

  const pool = await poolPromise;
  const request = pool.request();
  request.input("countryCode", sql.NVarChar(32), countryCode || null);
  request.input("countryName", sql.NVarChar(256), countryName || null);

  const result = await request.query(`
    SELECT
      c.Code AS countryCode,
      c.CountryName AS countryName,
      ci.CityName AS cityName,
      ci.State AS state
    FROM [dbo].[CityList] ci
    INNER JOIN [dbo].[CountryList] c ON c.Id = ci.CountryId
    WHERE (
      (@countryCode IS NOT NULL AND @countryCode <> ''
        AND UPPER(LTRIM(RTRIM(c.Code))) = @countryCode)
      OR
      (@countryName IS NOT NULL AND @countryName <> ''
        AND UPPER(LTRIM(RTRIM(c.CountryName))) = UPPER(@countryName))
    )
    ORDER BY ci.CityName, ci.State
  `);

  return (result.recordset || []).map((r) => ({
    countryCode: String(r.countryCode || "").trim(),
    countryName: String(r.countryName || "").trim(),
    cityName: String(r.cityName || "").trim(),
    state:
      r.state != null && String(r.state).trim() !== ""
        ? String(r.state).trim()
        : null,
  }));
}

module.exports = {
  getLocationConfigCountries,
  getLocationConfigCities,
};
