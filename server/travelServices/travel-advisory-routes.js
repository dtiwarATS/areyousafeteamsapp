/**
 * Travel Advisory API routes.
 * Advisories list comes from RSS feed (cached 5 min). Selected countries and saved advisories from DB (3-table schema).
 *
 * Mounted at /api/travel. Endpoints:
 *   GET  /api/travel/advisories           ?level&country&countryCode&limit&offset&sortBy&sortOrder
 *   GET  /api/travel/advisories/:country
 *   GET  /api/travel/advisories/level/:level
 *   GET  /api/travel/countries
 *   GET  /api/travel/selected           ?tenantId=&teamId=&includeAdvisory=
 *   POST /api/travel/selected           body: tenantId, teamId, countryId|countryCode, advisoryType, createdByUserId
 *   GET  /api/travel/selected/:id/logs  ?limit=
 *   PATCH /api/travel/selected/:id      body: lastUpdatedByUserId (deactivate)
 *   DELETE /api/travel/selected/:id
 *   GET  /api/travel/raw
 *   GET  /api/travel/cache/stats
 *   POST /api/travel/cache/refresh
 *   POST /api/travel/sync (manual trigger: sync selected countries from RSS)
 *   GET  /api/travel/health
 *
 * Requires 3-table schema: TravelAdvisorySelection, TravelAdvisoryDetail, TravelAdvisoryChangeLog.
 */

const express = require("express");
const router = express.Router();
const selectedDb = require("./travel-advisory-selected-db");
const travelAdvisory = require("./travel-advisory-feed");

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let cachedAdvisories = null;
let cacheUpdatedAt = null;

function getRequestId(req) {
  return (
    req.headers["x-request-id"] ||
    `req_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  );
}

function mapFeedItemToAdvisory(adv) {
  return {
    country: adv.country,
    countryCode: adv.countryCode,
    level: adv.level,
    levelNumber: adv.levelNumber ?? 0,
    title: adv.title,
    summary: adv.summary || "No summary available",
    restrictions: Array.isArray(adv.restrictions) ? adv.restrictions : [],
    recommendations: Array.isArray(adv.recommendations)
      ? adv.recommendations
      : [],
    link: adv.link,
    pubDate: adv.pubDate,
    lastUpdated: adv.lastUpdated ? new Date(adv.lastUpdated) : null,
  };
}

async function getAdvisoriesData() {
  if (
    cachedAdvisories &&
    cacheUpdatedAt &&
    Date.now() - cacheUpdatedAt < CACHE_TTL_MS
  ) {
    return cachedAdvisories;
  }
  const advisories = await travelAdvisory.getProcessedAdvisories();
  cachedAdvisories = Array.isArray(advisories)
    ? advisories.map(mapFeedItemToAdvisory)
    : [];
  cacheUpdatedAt = Date.now();
  return cachedAdvisories;
}

function clearCache() {
  cachedAdvisories = null;
  cacheUpdatedAt = null;
}

function applyFilters(advisories, filters) {
  let out = [...advisories];
  if (filters.level) {
    out = out.filter((a) =>
      a.level.toLowerCase().includes(String(filters.level).toLowerCase()),
    );
  }
  if (filters.country) {
    out = out.filter((a) =>
      a.country.toLowerCase().includes(String(filters.country).toLowerCase()),
    );
  }
  if (filters.countryCode) {
    const code = String(filters.countryCode).toLowerCase();
    out = out.filter((a) => a.countryCode.toLowerCase() === code);
  }
  return out;
}

function applySorting(advisories, sortBy, sortOrder) {
  const order = (sortOrder || "desc").toLowerCase();
  const by = (sortBy || "pubDate").toLowerCase();
  const sorted = [...advisories];
  sorted.sort((a, b) => {
    let aVal, bVal;
    if (by === "country") {
      aVal = a.country.toLowerCase();
      bVal = b.country.toLowerCase();
    } else if (by === "level") {
      aVal = a.levelNumber;
      bVal = b.levelNumber;
    } else {
      aVal = new Date(a.pubDate).getTime();
      bVal = new Date(b.pubDate).getTime();
    }
    if (aVal < bVal) return order === "asc" ? -1 : 1;
    if (aVal > bVal) return order === "asc" ? 1 : -1;
    return 0;
  });
  return sorted;
}

// ----- GET /advisories -----
router.get("/advisories", async (req, res, next) => {
  try {
    const limit = Math.min(
      100,
      Math.max(1, parseInt(req.query.limit, 10) || 50),
    );
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const sortBy = ["pubDate", "country", "level"].includes(req.query.sortBy)
      ? req.query.sortBy
      : "pubDate";
    const sortOrder = ["asc", "desc"].includes(req.query.sortOrder)
      ? req.query.sortOrder
      : "desc";

    let advisories = await getAdvisoriesData();
    advisories = applyFilters(advisories, {
      level: req.query.level,
      country: req.query.country,
      countryCode: req.query.countryCode,
    });
    advisories = applySorting(advisories, sortBy, sortOrder);

    const total = advisories.length;
    const data = advisories.slice(offset, offset + limit);

    res.json({
      data,
      pagination: {
        page: Math.floor(offset / limit) + 1,
        all: true,
      },
      timestamp: new Date().toISOString(),
      requestId: getRequestId(req),
    });
  } catch (err) {
    next(err);
  }
});

// ----- GET /advisories/level/:level (must be before /advisories/:country) -----
router.get("/advisories/level/:level", async (req, res, next) => {
  try {
    const level = req.params.level;
    if (!level || !String(level).trim()) {
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: [{ msg: "Level parameter is required" }],
        timestamp: new Date().toISOString(),
        requestId: getRequestId(req),
      });
    }

    const advisories = await getAdvisoriesData();
    const q = String(level).toLowerCase();
    const data = advisories.filter((a) => a.level.toLowerCase().includes(q));

    res.json({
      success: true,
      data,
      message: `Found ${data.length} advisories with level containing "${level}"`,
      timestamp: new Date().toISOString(),
      requestId: getRequestId(req),
    });
  } catch (err) {
    next(err);
  }
});

// ----- GET /advisories/:country -----
// :country is interpreted as exact country name or country code only (no partial match).
router.get("/advisories/:country", async (req, res, next) => {
  try {
    const country = req.params.country;
    if (!country || !String(country).trim()) {
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: [{ msg: "Country parameter is required" }],
        timestamp: new Date().toISOString(),
        requestId: getRequestId(req),
      });
    }

    const advisories = await getAdvisoriesData();
    const q = String(country).toLowerCase().trim();

    let advisory = advisories.find(
      (a) => a.country.toLowerCase() === q || a.countryCode.toLowerCase() === q,
    );
    if (!advisory) {
      advisory = advisories.find((a) => {
        const c = a.country.toLowerCase();
        if (
          (q.includes("ivory") && c.includes("ivoire")) ||
          (q.includes("ivoire") && c.includes("ivory"))
        )
          return true;
        return false;
      });
    }

    const result = {
      success: true,
      data: advisory || null,
      message: advisory
        ? `Advisory found for ${advisory.country}`
        : `No advisory found for "${country}". Please check the country name or try searching for similar names.`,
      timestamp: new Date().toISOString(),
      requestId: getRequestId(req),
    };

    if (!advisory) return res.status(404).json(result);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ----- GET /countries (from feed; legacy) -----
router.get("/countries", async (req, res, next) => {
  try {
    const advisories = await getAdvisoriesData();
    const countries = advisories
      .map((a) => ({ name: a.country, code: a.countryCode, level: a.level }))
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json({
      success: true,
      data: { countries },
      message: `Found ${countries.length} countries with travel advisories`,
      timestamp: new Date().toISOString(),
      requestId: getRequestId(req),
    });
  } catch (err) {
    next(err);
  }
});

// ----- GET /countries/list (from Countries table: id, name, code for dropdown) -----
router.get("/countries/list", async (req, res, next) => {
  try {
    const countries = await selectedDb.getCountriesFromDb();
    res.json({
      success: true,
      data: countries,
      message: `Found ${countries.length} countries`,
      timestamp: new Date().toISOString(),
      requestId: getRequestId(req),
    });
  } catch (err) {
    next(err);
  }
});

// ----- GET /selected (list selected countries for tenant/team) -----
router.get("/selected", async (req, res, next) => {
  try {
    const tenantId = req.query.tenantId || req.body?.tenantId || "";
    const teamId = req.query.teamId || req.body?.teamId || "";
    const includeAdvisory = req.query.includeAdvisory !== "false";
    const list = await selectedDb.getSelectedCountriesForTenantTeam(
      tenantId,
      teamId,
      includeAdvisory,
    );
    res.json({
      success: true,
      data: list,
      message: `Found ${list.length} selected countries`,
      timestamp: new Date().toISOString(),
      requestId: getRequestId(req),
    });
  } catch (err) {
    next(err);
  }
});

// ----- POST /selected (add selected country; body: countryId or countryCode required) -----
router.post("/selected", async (req, res, next) => {
  try {
    const {
      tenantId,
      teamId,
      countryId,
      countryCode,
      advisoryType,
      createdByUserId,
    } = req.body || {};
    if (!tenantId || !teamId) {
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: [{ msg: "tenantId, teamId are required" }],
        timestamp: new Date().toISOString(),
        requestId: getRequestId(req),
      });
    }
    if (countryId == null && !countryCode) {
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: [{ msg: "countryId or countryCode is required" }],
        timestamp: new Date().toISOString(),
        requestId: getRequestId(req),
      });
    }
    const result = await selectedDb.addSelectedCountry({
      tenantId,
      teamId,
      countryId: countryId != null ? countryId : undefined,
      countryCode: countryCode ? String(countryCode) : undefined,
      advisoryType: advisoryType || "Travel",
      createdByUserId: createdByUserId || "",
    });
    res.status(201).json({
      success: true,
      data: result,
      message: "Selected country added",
      timestamp: new Date().toISOString(),
      requestId: getRequestId(req),
    });
  } catch (err) {
    if (err.code === "MISSING_COUNTRY") {
      return res.status(400).json({
        success: false,
        error: err.message || "Country not found in Countries table",
        timestamp: new Date().toISOString(),
        requestId: getRequestId(req),
      });
    }
    if (
      err.name === "RequestError" &&
      err.message &&
      err.message.includes("duplicate")
    ) {
      return res.status(409).json({
        success: false,
        error: "Duplicate selection for this tenant/team/country/type",
        timestamp: new Date().toISOString(),
        requestId: getRequestId(req),
      });
    }
    next(err);
  }
});

// ----- GET /selected/:id/logs (logs show FieldName e.g. LevelNumber when field changed) -----
router.get("/selected/:id/logs", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: "Invalid id",
        timestamp: new Date().toISOString(),
        requestId: getRequestId(req),
      });
    }
    const limit = Math.min(
      100,
      Math.max(1, parseInt(req.query.limit, 10) || 50),
    );
    const logs = await selectedDb.getLogsForSelectedCountry(id, limit);
    res.json({
      success: true,
      data: logs,
      message: `Found ${logs.length} log entries`,
      timestamp: new Date().toISOString(),
      requestId: getRequestId(req),
    });
  } catch (err) {
    next(err);
  }
});

// ----- PATCH /selected/:id (deactivate) -----
router.patch("/selected/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: "Invalid id",
        timestamp: new Date().toISOString(),
        requestId: getRequestId(req),
      });
    }
    const lastUpdatedByUserId =
      (req.body && req.body.lastUpdatedByUserId) || "";
    await selectedDb.deactivateSelectedCountry(id, lastUpdatedByUserId);
    res.json({
      success: true,
      data: { id, isActive: false },
      message: "Selected country deactivated",
      timestamp: new Date().toISOString(),
      requestId: getRequestId(req),
    });
  } catch (err) {
    next(err);
  }
});

// ----- DELETE /selected/:id -----
router.delete("/selected/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: "Invalid id",
        timestamp: new Date().toISOString(),
        requestId: getRequestId(req),
      });
    }
    await selectedDb.deleteSelectedCountry(id);
    res.json({
      success: true,
      data: { id },
      message: "Selected country removed",
      timestamp: new Date().toISOString(),
      requestId: getRequestId(req),
    });
  } catch (err) {
    next(err);
  }
});

// ----- GET /raw -----
router.get("/raw", async (req, res, next) => {
  try {
    const advisories = await getAdvisoriesData();
    const rawData = advisories.slice(0, 100).map((adv) => ({
      country: adv.country,
      countryCode: adv.countryCode,
      level: adv.level,
      levelNumber: adv.levelNumber,
      title: adv.title,
      summary: adv.summary,
      restrictions: adv.restrictions,
      recommendations: (adv.recommendations || []).slice(0, 5),
      link: adv.link,
      lastUpdated: adv.lastUpdated,
    }));

    res.json({
      success: true,
      data: rawData,
      message: `Raw data for ${rawData.length} countries`,
      timestamp: new Date().toISOString(),
      requestId: getRequestId(req),
    });
  } catch (err) {
    next(err);
  }
});

// ----- GET /cache/stats -----
router.get("/cache/stats", (req, res) => {
  const lastUpdated = cacheUpdatedAt
    ? new Date(cacheUpdatedAt).toISOString()
    : null;
  const ageSec = cacheUpdatedAt ? (Date.now() - cacheUpdatedAt) / 1000 : null;
  const remainingTTL =
    cachedAdvisories && cacheUpdatedAt
      ? Math.max(0, CACHE_TTL_MS / 1000 - ageSec)
      : 0;

  res.json({
    success: true,
    data: {
      keys: cachedAdvisories ? ["travel_advisories", "last_updated"] : [],
      count: cachedAdvisories ? cachedAdvisories.length : 0,
      lastUpdated,
      remainingTTL,
      isDataStale:
        !cachedAdvisories ||
        !cacheUpdatedAt ||
        Date.now() - cacheUpdatedAt >= CACHE_TTL_MS,
    },
    message: "Cache statistics retrieved successfully",
    timestamp: new Date().toISOString(),
    requestId: getRequestId(req),
  });
});

// ----- POST /sync (manual trigger sync from RSS to DB) -----
router.post("/sync", async (req, res, next) => {
  try {
    const { runSync } = require("./travel-advisory-sync");
    const result = await runSync();
    clearCache();

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error || "Sync failed",
        count: result.count,
        jobRunAt: result.jobRunAt?.toISOString(),
        timestamp: new Date().toISOString(),
        requestId: getRequestId(req),
      });
    }

    res.json({
      success: true,
      data: {
        count: result.count,
        jobRunAt: result.jobRunAt?.toISOString(),
      },
      message: `Sync completed: ${result.count} advisories synced`,
      timestamp: new Date().toISOString(),
      requestId: getRequestId(req),
    });
  } catch (err) {
    next(err);
  }
});

// ----- POST /cache/refresh -----
router.post("/cache/refresh", async (req, res, next) => {
  try {
    clearCache();
    const advisories = await getAdvisoriesData();

    res.json({
      success: true,
      data: true,
      message: `Cache refreshed successfully with ${advisories.length} advisories`,
      timestamp: new Date().toISOString(),
      requestId: getRequestId(req),
    });
  } catch (err) {
    next(err);
  }
});

// ----- GET /health -----
router.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "Travel Advisory API is healthy",
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || "1.0.0",
    uptime: process.uptime(),
    requestId: getRequestId(req),
  });
});

module.exports = router;
