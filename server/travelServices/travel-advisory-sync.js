/**
 * Sync travel advisories for selected countries only (no global cache).
 * Fetches RSS feed, then for each active selected country: upserts one row in
 * AdvisoryDetail and logs to AdvisoryChangeLog.
 * Used by travelAdvisorySelectedCountries-job (cron) and POST /api/travel/sync.
 * Requires 3-table schema: Advisory, AdvisoryDetail, AdvisoryChangeLog.
 */

const travelAdvisory = require("./travel-advisory-feed");
const {
  getActiveSelectedCountries,
  getSavedAdvisoryForSelectedIdAndCountry,
  advisoryToSnapshot,
  snapshotsEqual,
  upsertSavedAdvisory,
  insertSelectedCountryLog,
} = require("./travel-advisory-selected-db");
const sql = require("mssql");
const poolPromise = require("../db/dbConn");

function splitCountryCodes(raw) {
  return String(raw || "")
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
}

function isEmptySummaryOrDescription(summary, description) {
  const sum = String(summary || "").trim();
  const desc = String(description || "").trim();
  return (
    !desc ||
    !sum ||
    sum === "No summary available" ||
    sum === "-" ||
    desc === "-"
  );
}

/**
 * Resolve country codes for an Advisory row from CountryCode and SelectedLocationsJson.
 * @param {object} row
 * @returns {Promise<string[]>}
 */
async function resolveSelectedCountryCodes(row) {
  const fromColumn = splitCountryCodes(row.CountryCode);
  const codes = new Set(fromColumn);
  try {
    const pool = await poolPromise;
    const result = await pool
      .request()
      .input("Id", sql.Int, row.TravelAdvisorySelectedCountriesId).query(`
        SELECT SelectedLocationsJson, AdvisoryType
        FROM [dbo].[Advisory]
        WHERE Id = @Id
      `);
    const rec = (result.recordset || [])[0];
    if (rec && String(rec.AdvisoryType || "").toLowerCase() === "weather") {
      return [];
    }
    if (rec && rec.SelectedLocationsJson) {
      const parsed = JSON.parse(rec.SelectedLocationsJson);
      if (Array.isArray(parsed)) {
        for (const loc of parsed) {
          const city = String(loc.cityName || "").trim();
          const code = String(loc.countryCode || "")
            .trim()
            .toUpperCase();
          // Country-level Travel only (skip US city IPAWS keys)
          if (code && !city) codes.add(code);
          else if (code && code !== "US" && code !== "USA") codes.add(code);
        }
      }
    }
  } catch {
    // keep codes from CountryCode column
  }
  return [...codes];
}

/**
 * Sync advisories from RSS for selected countries only.
 * Inserts/updates AdvisoryDetail and logs to AdvisoryChangeLog.
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
    let processedCountries = 0;

    for (const row of selected) {
      const selectedId = row.TravelAdvisorySelectedCountriesId;
      const countryCodes = await resolveSelectedCountryCodes(row);
      if (countryCodes.length === 0) continue;

      for (const countryCode of countryCodes) {
        const advisory = advisoryByCode[countryCode];
        if (!advisory) continue;
        processedCountries++;

        const saved = await getSavedAdvisoryForSelectedIdAndCountry(
          selectedId,
          countryCode,
        );
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

        const needsEmptyBackfill =
          saved &&
          isEmptySummaryOrDescription(saved.Summary, saved.Description);

        if (!saved) {
          await upsertSavedAdvisory(
            selectedId,
            countryCode,
            advisory,
            jobRunAt,
            "Travel",
          );
          insertCount++;
        } else if (
          needsEmptyBackfill ||
          !snapshotsEqual(oldSnapshot, newSnapshot)
        ) {
          const advisoryDetailId = await upsertSavedAdvisory(
            selectedId,
            countryCode,
            advisory,
            jobRunAt,
            "Travel",
          );
          if (
            oldSnapshot &&
            oldSnapshot.levelNumber !== newSnapshot.levelNumber
          ) {
            await insertSelectedCountryLog(
              selectedId,
              "LevelNumber",
              countryCode,
              advisoryDetailId,
              oldSnapshot,
              newSnapshot,
              jobRunAt,
            );
          }
          updateCount++;
        }
      }
    }

    console.log(
      `travelAdvisorySync: at ${jobRunAt.toISOString()} selections=${selected.length}, countries=${processedCountries}, inserts=${insertCount}, updates=${updateCount}`,
    );
    return {
      success: true,
      count: processedCountries,
      insertCount,
      updateCount,
      jobRunAt,
    };
  } catch (err) {
    console.error("travelAdvisorySync error:", err);
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
