/**
 * Shared 5-minute cache for State Dept travel advisories (RSS → processed).
 * Used by public /api/travel routes and AICaller live travel fallback.
 */
const travelAdvisory = require("./travel-advisory-feed");

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let cachedAdvisories = null;
let cacheUpdatedAt = null;

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

function getCacheMeta() {
  return {
    cachedAdvisories,
    cacheUpdatedAt,
    CACHE_TTL_MS,
  };
}

module.exports = {
  CACHE_TTL_MS,
  mapFeedItemToAdvisory,
  getAdvisoriesData,
  clearCache,
  getCacheMeta,
};
