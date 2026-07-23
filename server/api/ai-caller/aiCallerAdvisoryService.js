/**
 * AICaller advisory cascade:
 * 1) dbo.Advisory + dbo.AdvisoryDetail (org store)
 * 2) Live BotandAPI feeds (Azure Maps weather / State Dept travel)
 * 3) Third-party only if still empty (NWS alerts for weather; none for travel)
 *
 * Always go through feed helpers for step 2 — do not duplicate Azure/State Dept clients here.
 */
const selectedDb = require("../../travelServices/travel-advisory-selected-db");
const weatherFeed = require("../../travelServices/weather-advisory-feed");
const travelAdvisoryCache = require("../../travelServices/travel-advisory-cache");
const axios = require("axios");

/** 10-minute TTL cache for AICaller weather/travel results (org + live). */
const ADVISORY_RESULT_TTL_MS = 10 * 60 * 1000;
const advisoryResultCache = new Map();

function advisoryCacheKey(kind, tenantId, location) {
  return `${kind}|${String(tenantId || "").trim()}|${norm(location)}`;
}

function getCachedAdvisoryResult(key) {
  const hit = advisoryResultCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > ADVISORY_RESULT_TTL_MS) {
    advisoryResultCache.delete(key);
    return null;
  }
  return hit.value;
}

function setCachedAdvisoryResult(key, value) {
  advisoryResultCache.set(key, { at: Date.now(), value });
  return value;
}

function norm(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function locationMatches(haystack, needle) {
  const h = norm(haystack);
  const n = norm(needle);
  if (!h || !n) return false;
  return h === n || h.includes(n) || n.includes(h);
}

/** Expand user location into searchable aliases (codes + alternate names). */
function locationAliases(location) {
  const n = norm(location);
  const aliases = new Set([n]);
  if (!n) return [...aliases];

  // United States
  if (
    n === "us" ||
    n === "usa" ||
    n === "u.s." ||
    n === "u.s.a." ||
    n === "united states" ||
    n === "united states of america" ||
    n === "america"
  ) {
    aliases.add("us");
    aliases.add("usa");
    aliases.add("united states");
  }

  // Congo — prefer DRC (CD); also accept Republic of the Congo (CG)
  if (
    n === "congo" ||
    n === "drc" ||
    n === "congo (drc)" ||
    n.includes("democratic republic of the congo") ||
    n.includes("democratic republic of congo") ||
    n === "zaire"
  ) {
    aliases.add("cd");
    aliases.add("drc");
    aliases.add("congo");
    aliases.add("congo (drc)");
    aliases.add("democratic republic of the congo");
  }
  if (
    n === "republic of the congo" ||
    n === "congo-brazzaville" ||
    n === "congo (brazzaville)" ||
    n === "cg"
  ) {
    aliases.add("cg");
    aliases.add("republic of the congo");
    aliases.add("congo-brazzaville");
  }

  return [...aliases];
}

function isUsCountryLevel(location) {
  const n = norm(location);
  return (
    n === "us" ||
    n === "usa" ||
    n === "u.s." ||
    n === "u.s.a." ||
    n === "united states" ||
    n === "united states of america"
  );
}

function anyAliasMatch(haystack, aliases) {
  return aliases.some((a) => locationMatches(haystack, a));
}

function compactAdvisory({ title, severity, description, effective_until, updatedAt }) {
  return {
    title: title || "Advisory",
    severity: severity != null ? String(severity) : "",
    description: description || "",
    effective_until: effective_until || null,
    updatedAt: updatedAt || null,
  };
}

function sourceLabelFor(kind, source) {
  if (source === "org_selected") return "Organization tracked advisories";
  if (source === "live_unselected") {
    return kind === "travel" ? "Live State Department feed" : "Live Azure Maps weather";
  }
  if (source === "third_party") return "National Weather Service (NWS)";
  return null;
}

/** Attach human-readable source + fetch timestamp to every advisory response. */
function withAdvisoryMeta(kind, payload) {
  const source = payload.source || "none";
  const fetchedAt = new Date().toISOString();
  return {
    ...payload,
    source,
    sourceLabel: sourceLabelFor(kind, source),
    fetchedAt,
  };
}

function mapAzureAlerts(alerts, locationLabel) {
  const out = [];
  for (const a of alerts || []) {
    const areas = a.alertAreas || [];
    if (!areas.length) {
      out.push(
        compactAdvisory({
          title: a.description?.english || a.description?.localized || a.category || "Weather alert",
          severity: a.level || a.category || "",
          description: a.description?.english || a.description?.localized || "",
          effective_until: null,
        })
      );
      continue;
    }
    for (const area of areas) {
      out.push(
        compactAdvisory({
          title:
            area.name ||
            a.description?.english ||
            a.category ||
            `Weather alert near ${locationLabel}`,
          severity: a.level || area.latestStatus?.english || "",
          description: area.summary || area.alertDetails || a.description?.english || "",
          effective_until: area.endTime || null,
        })
      );
    }
  }
  return out;
}

function mapTravelRows(rows) {
  return (rows || []).map((r) =>
    compactAdvisory({
      title: r.title || `${r.country || r.countryCode || "Travel"} advisory`,
      severity: r.level || (r.levelNumber != null ? String(r.levelNumber) : ""),
      description: r.summary || r.description || "",
      effective_until: r.lastUpdated || r.pubDate || null,
      updatedAt: r.lastUpdated || r.pubDate || null,
    })
  );
}

function parseSelectedLocations(locationSelections) {
  return (locationSelections || []).map((loc) => ({
    city: loc.city || loc.cityName || loc.name || "",
    state: loc.state || loc.stateCode || "",
    country: loc.country || loc.countryName || loc.countryCode || "",
    countryCode: loc.countryCode || "",
    latitude: loc.latitude != null ? Number(loc.latitude) : loc.lat != null ? Number(loc.lat) : NaN,
    longitude:
      loc.longitude != null ? Number(loc.longitude) : loc.lon != null ? Number(loc.lon) : NaN,
    locationKey: loc.locationKey || loc.LocationKey || null,
  }));
}

function filterOrgWeather(advisories, location) {
  const aliases = locationAliases(location);
  const usWide = isUsCountryLevel(location);
  return (advisories || []).filter((a) => {
    if (usWide) {
      const code = norm(a.countryCode);
      const key = norm(a.LocationKey);
      if (code === "us" || key.startsWith("us|") || key === "us") return true;
    }
    if (aliases.some((al) => anyAliasMatch(a.LocationKey, [al]))) return true;
    if (aliases.some((al) => anyAliasMatch(a.country, [al]) || anyAliasMatch(a.countryCode, [al]))) {
      return true;
    }
    if (a.title && aliases.some((al) => anyAliasMatch(a.title, [al]))) return true;
    try {
      if (a.ApiResponseJson) {
        const raw =
          typeof a.ApiResponseJson === "string" ? JSON.parse(a.ApiResponseJson) : a.ApiResponseJson;
        const arr = Array.isArray(raw) ? raw : raw ? [raw] : [];
        for (const item of arr) {
          if (usWide && norm(item.countryCode) === "us") return true;
          for (const area of item.alertAreas || []) {
            if (aliases.some((al) => anyAliasMatch(area.name, [al]))) return true;
          }
        }
      }
    } catch {
      /* ignore */
    }
    return false;
  });
}

function orgWeatherToCompact(rows) {
  const out = [];
  for (const r of rows) {
    let fromApi = [];
    try {
      if (r.ApiResponseJson) {
        const raw =
          typeof r.ApiResponseJson === "string" ? JSON.parse(r.ApiResponseJson) : r.ApiResponseJson;
        fromApi = mapAzureAlerts(Array.isArray(raw) ? raw : raw ? [raw] : [], r.LocationKey || r.country);
      }
    } catch {
      /* ignore */
    }
    if (fromApi.length) {
      out.push(...fromApi);
    } else {
      out.push(
        compactAdvisory({
          title: r.title || r.LocationKey || "Weather advisory",
          severity: r.level || "",
          description: r.summary || r.description || "",
          effective_until: r.lastUpdated || null,
          updatedAt: r.lastUpdated || null,
        })
      );
    }
  }
  return out;
}

async function geocodeLocation(location) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", location);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  const res = await axios.get(url.toString(), {
    headers: { "User-Agent": "AreYouSafeAICaller/1.0", Accept: "application/json" },
    timeout: 10000,
  });
  const hit = Array.isArray(res.data) ? res.data[0] : null;
  if (!hit) return null;
  return { lat: Number(hit.lat), lon: Number(hit.lon) };
}

async function resolveCoords(location, locationSelections) {
  const locs = parseSelectedLocations(locationSelections);
  const aliases = locationAliases(location);
  const match = locs.find(
    (l) =>
      aliases.some(
        (al) =>
          locationMatches(l.city, al) ||
          locationMatches(l.state, al) ||
          locationMatches(l.country, al)
      ) &&
      !Number.isNaN(l.latitude) &&
      !Number.isNaN(l.longitude)
  );
  if (match) return { lat: match.latitude, lon: match.longitude };
  if (isUsCountryLevel(location)) return null; // use nationwide NWS instead of one point
  return geocodeLocation(location);
}

function filterTravelByLocation(advisories, location, locationSelections) {
  const aliases = locationAliases(location);
  const selectedNames = parseSelectedLocations(locationSelections).flatMap((l) =>
    [l.country, l.countryCode, l.city].filter(Boolean)
  );

  return (advisories || []).filter((a) => {
    if (aliases.some((al) => anyAliasMatch(a.country, [al]))) return true;
    if (aliases.some((al) => anyAliasMatch(a.countryCode, [al]))) return true;
    if (a.title && aliases.some((al) => anyAliasMatch(a.title, [al]))) return true;
    // SelectedLocationsJson country names e.g. "Congo (DRC)"
    if (selectedNames.some((s) => aliases.some((al) => locationMatches(s, al)))) {
      // only keep this advisory if its code/title also loosely relates
      return (
        aliases.some((al) => anyAliasMatch(a.countryCode, [al])) ||
        aliases.some((al) => anyAliasMatch(a.title, [al])) ||
        aliases.some((al) => anyAliasMatch(a.country, [al]))
      );
    }
    return false;
  });
}

function travelLevelNumber(row) {
  if (row.levelNumber != null && !Number.isNaN(Number(row.levelNumber))) {
    return Number(row.levelNumber);
  }
  const level = String(row.level || row.title || "");
  const m = level.match(/level\s*([1-4])/i);
  return m ? Number(m[1]) : 0;
}

/** National Weather Service — point alerts. */
async function getNwsAlertsAtPoint(lat, lon) {
  const url = `https://api.weather.gov/alerts/active?point=${lat},${lon}`;
  return fetchNwsAlerts(url);
}

/** National Weather Service — all active US alerts (capped). */
async function getNwsAlertsNationwide() {
  return fetchNwsAlerts("https://api.weather.gov/alerts/active?status=actual");
}

async function fetchNwsAlerts(url) {
  const res = await axios.get(url, {
    headers: {
      Accept: "application/geo+json",
      "User-Agent": "AreYouSafeAICaller/1.0 (org-safety-assistant)",
    },
    timeout: 15000,
    validateStatus: (s) => s >= 200 && s < 500,
  });
  if (res.status >= 400) return [];
  const features = Array.isArray(res.data?.features) ? res.data.features : [];
  const severityRank = { Extreme: 0, Severe: 1, Moderate: 2, Minor: 3, Unknown: 4 };
  const sorted = [...features].sort((a, b) => {
    const sa = severityRank[a?.properties?.severity] ?? 5;
    const sb = severityRank[b?.properties?.severity] ?? 5;
    return sa - sb;
  });
  return sorted.slice(0, 25).map((f) => {
    const p = f.properties || {};
    return compactAdvisory({
      title: p.event || p.headline || "NWS alert",
      severity: p.severity || p.urgency || "",
      description: [p.headline, p.areaDesc, p.description].filter(Boolean).join(" — ").slice(0, 2000),
      effective_until: p.expires || p.ends || null,
      updatedAt: p.sent || p.effective || p.onset || null,
    });
  });
}

/**
 * Weather: Advisory(Weather) + Detail → Azure Maps feed → NWS (US third-party).
 */
async function getWeatherAlertsForAiCaller({ tenantId, location }) {
  const loc = String(location || "").trim();
  if (!loc) {
    return withAdvisoryMeta("weather", {
      source: "none",
      location: "",
      advisories: [],
      error: "location is required",
    });
  }

  const cacheKey = advisoryCacheKey("weather", tenantId, loc);
  const cached = getCachedAdvisoryResult(cacheKey);
  if (cached) {
    console.log("[ai-caller] weather-alerts cache hit", { tenantId, location: loc });
    return withAdvisoryMeta("weather", cached);
  }

  console.log("[ai-caller] weather-alerts", { tenantId, location: loc });

  // 1) Org store
  const data = await selectedDb.getTravelAdvisoryByTeamData("", tenantId, "Weather");
  const matchedRows = filterOrgWeather(data.advisories, loc);
  const fromOrg = orgWeatherToCompact(matchedRows);
  if (fromOrg.length > 0) {
    return setCachedAdvisoryResult(
      cacheKey,
      withAdvisoryMeta("weather", {
        source: "org_selected",
        location: loc,
        advisories: fromOrg,
      })
    );
  }

  const usWide = isUsCountryLevel(loc);

  // Country-level US: skip single-point geocode; use nationwide NWS
  if (usWide) {
    try {
      const nws = await getNwsAlertsNationwide();
      if (nws.length) {
        return setCachedAdvisoryResult(
          cacheKey,
          withAdvisoryMeta("weather", {
            source: "third_party",
            location: loc,
            advisories: nws,
          })
        );
      }
    } catch (err) {
      console.warn("[ai-caller] weather NWS nationwide failed:", err.message);
    }
    return setCachedAdvisoryResult(
      cacheKey,
      withAdvisoryMeta("weather", {
        source: "none",
        location: loc,
        advisories: [],
      })
    );
  }

  let coords = null;
  try {
    coords = await resolveCoords(loc, data.locationSelections);
  } catch (err) {
    console.warn("[ai-caller] weather geocode failed:", err.message);
  }

  // 2) Live Azure Maps
  if (coords) {
    try {
      const live = await weatherFeed.getWeatherAlerts(coords.lat, coords.lon);
      const advisories = mapAzureAlerts(live, loc);
      if (advisories.length) {
        return setCachedAdvisoryResult(
          cacheKey,
          withAdvisoryMeta("weather", {
            source: "live_unselected",
            location: loc,
            advisories,
          })
        );
      }
    } catch (err) {
      console.warn("[ai-caller] weather Azure live failed:", err.message);
    }

    // 3) NWS at point
    try {
      const nws = await getNwsAlertsAtPoint(coords.lat, coords.lon);
      if (nws.length) {
        return setCachedAdvisoryResult(
          cacheKey,
          withAdvisoryMeta("weather", {
            source: "third_party",
            location: loc,
            advisories: nws,
          })
        );
      }
    } catch (err) {
      console.warn("[ai-caller] weather NWS point failed:", err.message);
    }
  }

  return setCachedAdvisoryResult(
    cacheKey,
    withAdvisoryMeta("weather", {
      source: "none",
      location: loc,
      advisories: [],
    })
  );
}

/**
 * Travel: Advisory(Travel) + Detail → State Dept RSS (shared 5m feed cache).
 */
async function getTravelAdvisoriesForAiCaller({ tenantId, location }) {
  const loc = String(location || "").trim();
  if (!loc) {
    return withAdvisoryMeta("travel", {
      source: "none",
      location: "",
      advisories: [],
      error: "location is required",
    });
  }

  const cacheKey = advisoryCacheKey("travel", tenantId, loc);
  const cached = getCachedAdvisoryResult(cacheKey);
  if (cached) {
    console.log("[ai-caller] travel-advisories cache hit", { tenantId, location: loc });
    return withAdvisoryMeta("travel", cached);
  }

  console.log("[ai-caller] travel-advisories", { tenantId, location: loc });

  // 1) Org store
  const data = await selectedDb.getTravelAdvisoryByTeamData("", tenantId, "Travel");
  console.log("[ai-caller] travel org rows", {
    tenantId,
    advisoryCount: (data.advisories || []).length,
    countryCodes: data.countryCodes,
  });
  const matched = filterTravelByLocation(data.advisories, loc, data.locationSelections);
  if (matched.length > 0) {
    return setCachedAdvisoryResult(
      cacheKey,
      withAdvisoryMeta("travel", {
        source: "org_selected",
        location: loc,
        advisories: mapTravelRows(matched),
      })
    );
  }

  // 2) Live State Dept (shared RSS cache — do not cold-parse every miss)
  try {
    const live = await travelAdvisoryCache.getAdvisoriesData();
    const aliases = locationAliases(loc);

    if (isUsCountryLevel(loc)) {
      // No "United States" destination row — return high-severity outbound advisories
      const high = (live || []).filter((a) => travelLevelNumber(a) >= 3);
      if (high.length) {
        return setCachedAdvisoryResult(
          cacheKey,
          withAdvisoryMeta("travel", {
            source: "live_unselected",
            location: loc,
            note: "State Dept advisories are for travel destinations abroad (outbound from the US). Showing Level 3–4 destinations.",
            advisories: mapTravelRows(high.slice(0, 30)),
          })
        );
      }
    }

    const liveMatched = (live || []).filter(
      (a) =>
        aliases.some((al) => locationMatches(a.country, al)) ||
        aliases.some((al) => locationMatches(a.countryCode, al)) ||
        aliases.some((al) => locationMatches(a.title, al))
    );
    if (liveMatched.length) {
      return setCachedAdvisoryResult(
        cacheKey,
        withAdvisoryMeta("travel", {
          source: "live_unselected",
          location: loc,
          advisories: mapTravelRows(liveMatched),
        })
      );
    }
  } catch (err) {
    console.warn("[ai-caller] travel live feed failed:", err.message);
    return setCachedAdvisoryResult(
      cacheKey,
      withAdvisoryMeta("travel", {
        source: "none",
        location: loc,
        advisories: [],
        error: err.message,
      })
    );
  }

  return setCachedAdvisoryResult(
    cacheKey,
    withAdvisoryMeta("travel", {
      source: "none",
      location: loc,
      advisories: [],
    })
  );
}

module.exports = {
  getWeatherAlertsForAiCaller,
  getTravelAdvisoriesForAiCaller,
  compactAdvisory,
  mapAzureAlerts,
  locationMatches,
  locationAliases,
};
