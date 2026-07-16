/**
 * Filter Azure severe weather alerts to selected monitored locations.
 *
 * Azure returns alerts for the queried lat/lon; alertAreas[].name is often a
 * zone/county (e.g. "Central Cook") rather than the city ("Chicago").
 *
 * Match rule:
 * 1. Prefer alertAreas whose name matches selected cityName or state
 *    (contains, case-insensitive, either direction).
 * 2. If no area name matches but the alert country is selected, keep the alert
 *    with all its areas (coord-scoped response from Azure).
 */

function normalize(s) {
  return String(s || "")
    .trim()
    .toLowerCase();
}

/**
 * @param {Array} alerts - Azure WeatherAlertResult[]
 * @param {Array<{ countryCode?: string, cityName: string, state?: string|null }>} locationSelections
 * @returns {Array} filtered alerts
 */
function filterAlertsBySelectedCities(alerts, locationSelections) {
  if (!Array.isArray(alerts) || alerts.length === 0) return [];
  if (!Array.isArray(locationSelections) || locationSelections.length === 0) {
    return [];
  }

  /** @type {Map<string, { cities: Set<string>, states: Set<string> }>} */
  const byCountry = new Map();
  const anyCities = new Set();
  const anyStates = new Set();

  for (const loc of locationSelections) {
    const city = normalize(loc.cityName);
    const state = normalize(loc.state);
    const code = String(loc.countryCode || "")
      .trim()
      .toUpperCase();

    if (!code) {
      if (city) anyCities.add(city);
      if (state) anyStates.add(state);
      continue;
    }

    if (!byCountry.has(code)) {
      byCountry.set(code, { cities: new Set(), states: new Set() });
    }
    const entry = byCountry.get(code);
    if (city) entry.cities.add(city);
    if (state) entry.states.add(state);
  }

  const nameMatches = (areaName, terms) => {
    for (const term of terms) {
      if (!term) continue;
      if (areaName.includes(term) || term.includes(areaName)) return true;
    }
    return false;
  };

  const filtered = [];
  for (const alert of alerts) {
    const alertCode = String(alert.countryCode || "")
      .trim()
      .toUpperCase();
    const entry = byCountry.get(alertCode);
    const hasCountrySelection = Boolean(entry);
    const hasAnySelection = anyCities.size > 0 || anyStates.size > 0;

    if (!hasCountrySelection && !hasAnySelection) continue;

    const cities = new Set([
      ...(entry?.cities || []),
      ...anyCities,
    ]);
    const states = new Set([
      ...(entry?.states || []),
      ...anyStates,
    ]);

    if (cities.size === 0 && states.size === 0 && !hasCountrySelection) {
      continue;
    }

    const areas = Array.isArray(alert.alertAreas) ? alert.alertAreas : [];
    const matchedAreas = areas.filter((area) => {
      const areaName = normalize(area?.name);
      if (!areaName) return false;
      return nameMatches(areaName, cities) || nameMatches(areaName, states);
    });

    if (matchedAreas.length > 0) {
      filtered.push({
        ...alert,
        alertAreas: matchedAreas,
      });
      continue;
    }

    // No city/state name hit (e.g. Chicago → "Central Cook"): keep coord-scoped alert
    if (hasCountrySelection || hasAnySelection) {
      filtered.push({
        ...alert,
        alertAreas: areas,
      });
    }
  }

  return filtered;
}

module.exports = {
  filterAlertsBySelectedCities,
  normalize,
};
