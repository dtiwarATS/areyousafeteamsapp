/**
 * Sync travel advisories for selected countries only (no global cache).
 * Fetches RSS feed, then for each active selected country: upserts one row in
 * TravelAdvisoryDetail and logs to TravelAdvisoryChangeLog.
 * Used by travelAdvisorySelectedCountries-job (cron) and POST /api/travel/sync.
 * Requires 3-table schema: TravelAdvisorySelection, TravelAdvisoryDetail, TravelAdvisoryChangeLog.
 */

const travelAdvisory = require("./travel-advisory-feed");
const {
  getActiveSelectedCountries,
  getSavedAdvisoryForSelectedId,
  advisoryToSnapshot,
  snapshotsEqual,
  upsertSavedAdvisory,
  insertSelectedCountryLog,
} = require("./travel-advisory-selected-db");
const { processSafetyBotError } = require("../models/processError");

/**
 * Sync advisories from RSS for selected countries only.
 * Inserts/updates TravelAdvisoryDetail and logs to TravelAdvisoryChangeLog.
 * @returns {{ success: boolean, count: number, insertCount: number, updateCount: number, jobRunAt: Date, error?: string }}
 */
async function runSync() {
  const jobRunAt = new Date();
  try {
    const [selected, advisories] = await Promise.all([
      getActiveSelectedCountries(),
      travelAdvisory.getProcessedAdvisories(),
    ]);

    if (!selected || selected.length === 0) {
      console.log(
        `travelAdvisorySync: no active selected countries at ${jobRunAt.toISOString()}`,
      );
      return {
        success: true,
        count: 0,
        insertCount: 0,
        updateCount: 0,
        jobRunAt,
      };
    }

    const advisoryByCode = {};
    for (const adv of advisories) {
      const code = (adv.countryCode || "").toUpperCase();
      if (code) advisoryByCode[code] = adv;
    }

    let insertCount = 0;
    let updateCount = 0;

    for (const row of selected) {
      const {
        TravelAdvisorySelectedCountriesId: selectedId,
        TenantId: tenantId,
        TeamId: teamId,
        CountryId: countryId,
        CountryCode: countryCode,
      } = row;

      const advisory = advisoryByCode[(countryCode || "").toUpperCase()];
      if (!advisory) continue;

      const saved = await getSavedAdvisoryForSelectedId(selectedId);
      const newSnapshot = advisoryToSnapshot(advisory);
      const oldSnapshot = saved
        ? advisoryToSnapshot({
            level: saved.Level,
            levelNumber: saved.LevelNumber,
            summary: saved.Summary,
            link: saved.Link,
            lastUpdated: saved.LastUpdated,
          })
        : null;

      if (!saved) {
        await upsertSavedAdvisory(selectedId, countryId, advisory, jobRunAt);
        insertCount++;
      } else if (!snapshotsEqual(oldSnapshot, newSnapshot)) {
        const advisoryId = await upsertSavedAdvisory(
          selectedId,
          countryId,
          advisory,
          jobRunAt,
        );
        if (oldSnapshot.levelNumber !== newSnapshot.levelNumber) {
          await insertSelectedCountryLog(
            selectedId,
            "LevelNumber",
            countryId,
            advisoryId,
            oldSnapshot,
            newSnapshot,
            jobRunAt,
          );
        }
        updateCount++;
      }
    }

    console.log(
      `travelAdvisorySync: at ${jobRunAt.toISOString()} processed ${selected.length} selected, inserts=${insertCount}, updates=${updateCount}`,
    );
    return {
      success: true,
      count: selected.length,
      insertCount,
      updateCount,
      jobRunAt,
    };
  } catch (err) {
    console.error("travelAdvisorySync error:", err);
    // processSafetyBotError(
    //   err,
    //   "",
    //   "",
    //   "",
    //   "error in travelAdvisorySync: " + (err && err.message)
    // );
    return {
      success: false,
      count: 0,
      insertCount: 0,
      updateCount: 0,
      jobRunAt,
      error: err && err.message ? err.message : String(err),
    };
  }
}

module.exports = { runSync };
