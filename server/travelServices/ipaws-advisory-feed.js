/**
 * FEMA IPAWS All-Hazards PUBLIC CAP feed for U.S. city/area Travel Advisories.
 * Isolated from Weather Azure Maps feed.
 *
 * Prod:  https://apps.fema.gov/IPAWSOPEN_EAS_SERVICE/rest/public/recent/{timestamp}
 * Test/local (TDL): https://tdl.apps.fema.gov/IPAWSOPEN_EAS_SERVICE/rest/public/recent/{timestamp}
 * Override via process.env.IPAWS_PUBLIC_FEED_BASE
 */

const axios = require("axios");

const IPAWS_PROD_BASE =
  "https://apps.fema.gov/IPAWSOPEN_EAS_SERVICE/rest/public/recent";
const IPAWS_TDL_BASE =
  "https://tdl.apps.fema.gov/IPAWSOPEN_EAS_SERVICE/rest/public/recent";

const isProdEnv =
  String(process.env.NODE_ENV || "")
    .trim()
    .toLowerCase() === "production";

const DEFAULT_BASE =
  process.env.IPAWS_PUBLIC_FEED_BASE ||
  (isProdEnv ? IPAWS_PROD_BASE : IPAWS_TDL_BASE);

/** Look-back window when requesting recent alerts (ms). Default 24h. */
const RECENT_LOOKBACK_MS = Number(process.env.IPAWS_LOOKBACK_MS) || 24 * 60 * 60 * 1000;

const US_COUNTRY_CODES = new Set(["US", "USA", "UNITED STATES"]);

function isUsCountryCode(code) {
  return US_COUNTRY_CODES.has(String(code || "").trim().toUpperCase());
}

function textBetween(xml, tag) {
  const re = new RegExp(
    `<${tag}[^>]*>([\\s\\S]*?)</${tag}>`,
    "i",
  );
  const m = String(xml || "").match(re);
  return m ? decodeXml(m[1].trim()) : "";
}

function allTextBetween(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "gi");
  const out = [];
  let m;
  while ((m = re.exec(String(xml || ""))) !== null) {
    out.push(decodeXml(m[1].trim()));
  }
  return out;
}

function decodeXml(s) {
  return String(s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/**
 * Parse CAP severity into a travel-like level number (1-4).
 * @param {string} severity
 */
function severityToLevelNumber(severity) {
  const s = String(severity || "").toLowerCase();
  if (s === "extreme") return 4;
  if (s === "severe") return 3;
  if (s === "moderate") return 2;
  if (s === "minor" || s === "unknown") return 1;
  return 2;
}

/**
 * Point-in-polygon (ray casting). polygon = [[lon,lat], ...]
 */
function pointInPolygon(lon, lat, polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];
    const intersect =
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi + 0.0) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Parse CAP polygon string "lat,lon lat,lon ..." into [[lon,lat],...]
 */
function parseCapPolygon(polyStr) {
  const pts = [];
  const parts = String(polyStr || "")
    .trim()
    .split(/\s+/);
  for (const p of parts) {
    const [latS, lonS] = p.split(",");
    const lat = Number(latS);
    const lon = Number(lonS);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      pts.push([lon, lat]);
    }
  }
  return pts;
}

/**
 * Parse CAP circle "lat,lon radiusKm"
 */
function pointInCircle(lon, lat, circleStr) {
  const m = String(circleStr || "")
    .trim()
    .match(/^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/);
  if (!m) return false;
  const cLat = Number(m[1]);
  const cLon = Number(m[2]);
  const radiusKm = Number(m[3]);
  if (![cLat, cLon, radiusKm].every(Number.isFinite)) return false;
  const R = 6371;
  const dLat = ((lat - cLat) * Math.PI) / 180;
  const dLon = ((lon - cLon) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((cLat * Math.PI) / 180) *
      Math.cos((lat * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  const d = 2 * R * Math.asin(Math.sqrt(a));
  return d <= radiusKm;
}

/**
 * Split CAP XML into alert blocks.
 * @param {string} xml
 * @returns {string[]}
 */
function splitAlertBlocks(xml) {
  const blocks = [];
  const re = /<alert\b[\s\S]*?<\/alert>/gi;
  let m;
  while ((m = re.exec(String(xml || ""))) !== null) {
    blocks.push(m[0]);
  }
  // Some feeds return a bare list without root; also try <entry> Atom wrappers
  if (blocks.length === 0) {
    const entryRe = /<entry\b[\s\S]*?<\/entry>/gi;
    while ((m = entryRe.exec(String(xml || ""))) !== null) {
      const content = textBetween(m[0], "content") || m[0];
      const inner = content.match(/<alert\b[\s\S]*?<\/alert>/i);
      blocks.push(inner ? inner[0] : m[0]);
    }
  }
  return blocks;
}

/**
 * Parse one CAP alert XML block into a normalized object.
 * @param {string} block
 */
function parseCapAlert(block) {
  const infoBlock =
    (String(block).match(/<info\b[\s\S]*?<\/info>/i) || [])[0] || block;
  const areaBlocks = [];
  const areaRe = /<area\b[\s\S]*?<\/area>/gi;
  let am;
  while ((am = areaRe.exec(infoBlock)) !== null) {
    areaBlocks.push(am[0]);
  }

  const areas = areaBlocks.map((ab) => ({
    areaDesc: textBetween(ab, "areaDesc"),
    polygons: allTextBetween(ab, "polygon").map(parseCapPolygon),
    circles: allTextBetween(ab, "circle"),
    geocodes: (() => {
      const codes = [];
      const geoRe = /<geocode>[\s\S]*?<\/geocode>/gi;
      let gm;
      while ((gm = geoRe.exec(ab)) !== null) {
        codes.push({
          name: textBetween(gm[0], "valueName"),
          value: textBetween(gm[0], "value"),
        });
      }
      return codes;
    })(),
  }));

  const severity = textBetween(infoBlock, "severity");
  const levelNumber = severityToLevelNumber(severity);
  const headline = textBetween(infoBlock, "headline");
  const event = textBetween(infoBlock, "event");
  const description = textBetween(infoBlock, "description");
  const instruction = textBetween(infoBlock, "instruction");
  const identifier = textBetween(block, "identifier");
  const sent = textBetween(block, "sent");
  const expires = textBetween(infoBlock, "expires");
  const onset = textBetween(infoBlock, "onset");
  const effective = textBetween(infoBlock, "effective");
  const web = textBetween(infoBlock, "web");
  const senderName = textBetween(infoBlock, "senderName");
  const responseType = textBetween(infoBlock, "responseType");
  const categories = allTextBetween(infoBlock, "category")
    .map((c) => String(c || "").trim())
    .filter(Boolean);
  const category = categories[0] || "";

  return {
    id: identifier || `${event}-${sent}`,
    title: headline || event || "IPAWS Alert",
    event,
    level: severity ? `Severity: ${severity}` : `Level ${levelNumber}`,
    levelNumber,
    severity,
    responseType: responseType || null,
    categories,
    category: category || event || null,
    summary: description || headline || event || "",
    // Keep description = CAP description only; instruction is separate for Additional Information
    description: description || "",
    instruction: instruction || "",
    link: web || null,
    web: web || null,
    pubDate: sent || null,
    sent: sent || null,
    onset: onset || null,
    effective: effective || onset || sent || null,
    expires: expires || null,
    source: senderName || "FEMA IPAWS / National Weather Service",
    senderName: senderName || null,
    areas,
    countryCode: "US",
    country: "United States",
  };
}

/**
 * Weather/Met alerts belong on the Weather Alerts tab (Azure Maps), not Travel IPAWS.
 * @param {object} alert
 */
function isMetWeatherAlert(alert) {
  const cats =
    Array.isArray(alert?.categories) && alert.categories.length > 0
      ? alert.categories
      : [alert?.category].filter(Boolean);
  return cats.some((c) => String(c).trim().toLowerCase() === "met");
}

/**
 * Whether an alert applies to the given city coordinates / name.
 * @param {object} alert
 * @param {{ cityName: string, state?: string|null, latitude?: number|null, longitude?: number|null }} loc
 */
function alertMatchesLocation(alert, loc) {
  const city = String(loc.cityName || "").trim().toLowerCase();
  const state = loc.state != null ? String(loc.state).trim().toLowerCase() : "";
  const lat = Number(loc.latitude);
  const lon = Number(loc.longitude);
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lon);

  const areas = Array.isArray(alert.areas) ? alert.areas : [];
  if (areas.length === 0) {
    // No area geometry — fall back to title/summary text match
    const blob = `${alert.title || ""} ${alert.summary || ""}`.toLowerCase();
    return city && blob.includes(city);
  }

  for (const area of areas) {
    const desc = String(area.areaDesc || "").toLowerCase();
    if (city && desc.includes(city)) return true;
    if (city && state && desc.includes(city) && desc.includes(state)) return true;

    if (hasCoords) {
      for (const poly of area.polygons || []) {
        if (pointInPolygon(lon, lat, poly)) return true;
      }
      for (const circle of area.circles || []) {
        if (pointInCircle(lon, lat, circle)) return true;
      }
    }
  }
  return false;
}

/**
 * Fetch raw recent IPAWS PUBLIC CAP XML.
 * @returns {Promise<string>}
 */
async function fetchRecentCapXml() {
  // FEMA expects ISO-8601 UTC (e.g. 2026-07-23T08:00:00Z), not epoch ms.
  const sinceIso = new Date(Date.now() - RECENT_LOOKBACK_MS)
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z");
  const url = `${DEFAULT_BASE.replace(/\/$/, "")}/${sinceIso}`;
  try {
    const res = await axios.get(url, {
      timeout: 30000,
      responseType: "text",
      headers: { Accept: "application/xml, text/xml, */*" },
      validateStatus: (s) => s >= 200 && s < 500,
    });
    if (res.status >= 400) {
      throw new Error(`IPAWS feed HTTP ${res.status} url=${url}`);
    }
    return typeof res.data === "string" ? res.data : String(res.data || "");
  } catch (err) {
    if (err && err.message && String(err.message).includes("url=")) {
      throw err;
    }
    const msg = err && err.message ? err.message : String(err);
    throw new Error(`${msg} url=${url}`);
  }
}

/**
 * Get IPAWS alerts matching a U.S. city selection.
 * @param {{ cityName: string, state?: string|null, latitude?: number|null, longitude?: number|null, countryCode?: string }} loc
 * @returns {Promise<object[]>} normalized alert objects
 */
async function getIpawsAlertsForLocation(loc) {
  const code = String(loc?.countryCode || "US").trim().toUpperCase();
  if (loc?.countryCode && !isUsCountryCode(code)) {
    return [];
  }
  const city = String(loc?.cityName || "").trim();
  if (!city) return [];

  let xml = "";
  try {
    xml = await fetchRecentCapXml();
  } catch (err) {
    console.error(
      "IPAWS fetch failed:",
      err && err.message ? err.message : err,
    );
    return [];
  }

  const blocks = splitAlertBlocks(xml);
  const alerts = [];
  for (const block of blocks) {
    try {
      const alert = parseCapAlert(block);
      // Exclude CAP Category=Met (weather) — shown on Weather Alerts tab
      if (isMetWeatherAlert(alert)) continue;
      if (alertMatchesLocation(alert, loc)) {
        alerts.push(alert);
      }
    } catch (parseErr) {
      // skip malformed alert
    }
  }
  return alerts;
}

/**
 * Build a Travel-shaped advisory for upsert from IPAWS alerts for one city.
 * @param {object[]} alerts
 * @param {{ countryCode: string, countryName?: string, cityName: string, state?: string|null }} loc
 */
function toTravelAdvisory(alerts, loc) {
  const list = Array.isArray(alerts) ? alerts : [];
  const primary = list[0];
  const cityLabel = [loc.cityName, loc.state, loc.countryName || "United States"]
    .filter(Boolean)
    .join(", ");

  if (!primary) {
    return {
      id: `ipaws-none-${loc.cityName}`,
      title: `No active IPAWS alerts for ${cityLabel}`,
      level: "No active alerts",
      levelNumber: 1,
      link: null,
      pubDate: new Date().toISOString(),
      summary: `No active FEMA IPAWS alerts for ${cityLabel}.`,
      description: "",
      instruction: "",
      category: "IPAWS Alert",
      severity: null,
      responseType: null,
      expires: null,
      source: "FEMA IPAWS / National Weather Service",
      country: loc.countryName || "United States",
      countryCode: "US",
      lastUpdated: new Date(),
      restrictions: [],
      recommendations: [],
      apiResponseJson: JSON.stringify([]),
    };
  }

  const maxLevel = Math.max(...list.map((a) => Number(a.levelNumber) || 1));
  const additional =
    primary.instruction ||
    [primary.description, primary.instruction].filter(Boolean).join("\n\n") ||
    "";
  return {
    id: primary.id,
    title: primary.title,
    level: primary.level,
    levelNumber: maxLevel,
    link: primary.link || primary.web || null,
    pubDate: primary.pubDate || primary.sent || null,
    summary: primary.summary,
    // Persist full alert text for Additional Information (instruction preferred)
    description: additional || primary.description || "",
    instruction: primary.instruction || "",
    category: primary.category || primary.event || null,
    severity: primary.severity || null,
    responseType: primary.responseType || null,
    expires: primary.expires || null,
    source: primary.source || "FEMA IPAWS / National Weather Service",
    country: loc.countryName || "United States",
    countryCode: "US",
    lastUpdated: primary.pubDate ? new Date(primary.pubDate) : new Date(),
    restrictions: [],
    recommendations: [],
    apiResponseJson: JSON.stringify(list),
  };
}

module.exports = {
  isUsCountryCode,
  getIpawsAlertsForLocation,
  toTravelAdvisory,
  alertMatchesLocation,
  fetchRecentCapXml,
  isMetWeatherAlert,
};
