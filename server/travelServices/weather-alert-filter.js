/**
 * Filter Azure severe weather alerts to selected monitored locations.
 *
 * Prefer provenance tags (`locationKeys`) set when alerts were fetched for a
 * city's lat/lon. Fall back to city name matching on alertAreas.
 * Do not keep all alerts for a country when a specific city is selected.
 */

function normalize(s) {
  return String(s || "")
    .trim()
    .toLowerCase();
}

function normalizeToken(s) {
  return normalize(s).replace(/[^a-z0-9\u00c0-\u024f]+/gi, "");
}

function locationSelectionKey(loc) {
  return `${String(loc.countryCode || "").toUpperCase()}|${loc.cityName}|${loc.state || ""}`;
}

/**
 * Match area name to a city term without treating "Miyako" as "Miyako-machi".
 * Compares place tokens (split on comma/slash/space; hyphens stay in the token).
 */
function nameMatches(areaName, terms) {
  const areaNorm = normalize(areaName);
  if (!areaNorm) return false;

  const areaTokens = new Set(
    areaNorm
      .split(/[,/]| +/)
      .map((p) => normalizeToken(p))
      .filter(Boolean),
  );
  areaTokens.add(normalizeToken(areaName));

  for (const term of terms) {
    if (!term) continue;
    const termToken = normalizeToken(term);
    if (!termToken) continue;
    if (areaTokens.has(termToken)) return true;
  }
  return false;
}

/**
 * @param {Array} alerts - Azure WeatherAlertResult[] (optional locationKeys)
 * @param {Array<{ countryCode?: string, cityName: string, state?: string|null }>} locationSelections
 * @returns {Array} filtered alerts
 */
function filterAlertsBySelectedCities(alerts, locationSelections) {
  if (!Array.isArray(alerts) || alerts.length === 0) return [];
  if (!Array.isArray(locationSelections) || locationSelections.length === 0) {
    return [];
  }

  const selectedKeys = new Set(
    locationSelections.map((loc) => locationSelectionKey(loc)),
  );

  /** @type {Map<string, Set<string>>} */
  const citiesByCountry = new Map();
  const anyCities = new Set();

  for (const loc of locationSelections) {
    const city = normalize(loc.cityName);
    const code = String(loc.countryCode || "")
      .trim()
      .toUpperCase();

    if (!code) {
      if (city) anyCities.add(city);
      continue;
    }

    if (!citiesByCountry.has(code)) {
      citiesByCountry.set(code, new Set());
    }
    if (city) citiesByCountry.get(code).add(city);
  }

  const filtered = [];
  for (const alert of alerts) {
    const keys = Array.isArray(alert.locationKeys) ? alert.locationKeys : [];

    if (keys.length > 0) {
      const matchedKeys = keys.filter((k) => selectedKeys.has(k));
      if (matchedKeys.length === 0) continue;
      filtered.push({
        ...alert,
        locationKeys: matchedKeys,
      });
      continue;
    }

    const alertCode = String(alert.countryCode || "")
      .trim()
      .toUpperCase();
    const countryCities = citiesByCountry.get(alertCode);
    const hasCountrySelection = Boolean(countryCities);
    const hasAnySelection = anyCities.size > 0;

    if (!hasCountrySelection && !hasAnySelection) continue;

    const cities = new Set([...(countryCities || []), ...anyCities]);
    if (cities.size === 0) continue;

    const areas = Array.isArray(alert.alertAreas) ? alert.alertAreas : [];
    const matchedAreas = areas.filter((area) => {
      const areaName = normalize(area?.name);
      if (!areaName) return false;
      return nameMatches(areaName, cities);
    });

    if (matchedAreas.length > 0) {
      filtered.push({
        ...alert,
        alertAreas: matchedAreas,
      });
    }
  }

  return filtered;
}

module.exports = {
  filterAlertsBySelectedCities,
  locationSelectionKey,
  normalize,
};
