/**
 * AICaller SOS query — MSTeamsAssistance only.
 * Additive surface for Org Safety Assistant; does not call or change tab/SOS handlers.
 */
const sql = require("mssql");
const poolPromise = require("../../db/dbConn");

function trimOrNull(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

function clampSinceDays(sinceDays) {
  let days = Number(sinceDays);
  if (!Number.isFinite(days) || days <= 0) days = 7;
  return Math.min(Math.floor(days), 365);
}

function normalizeStatusFilter(status) {
  const s = String(status || "open").trim().toLowerCase();
  if (s === "all" || s === "any") return "all";
  if (s === "closed" || s === "close") return "closed";
  return "open";
}

function toIso(v) {
  if (v == null || v === "") return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString();
  const d = new Date(v);
  if (!Number.isNaN(d.getTime())) return d.toISOString();
  return null;
}

function median(nums) {
  if (!nums.length) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10;
  }
  return Math.round(sorted[mid] * 10) / 10;
}

/**
 * Shared FROM/WHERE for SOS list + stats.
 */
function appendSosFilters(req, { teamId, sinceDays, statusFilter, city }) {
  req.input("teamId", sql.NVarChar(256), String(teamId));
  req.input("sinceDays", sql.Int, sinceDays);

  let where = `
    WHERE LTRIM(RTRIM(ISNULL(a.team_ids, ''))) = @teamId
      AND TRY_CONVERT(datetime, a.requested_date) IS NOT NULL
      AND TRY_CONVERT(datetime, a.requested_date) >= DATEADD(day, -@sinceDays, GETUTCDATE())
  `;

  if (statusFilter === "open") {
    where += ` AND LOWER(LTRIM(RTRIM(ISNULL(a.status, 'open')))) IN ('open', '') `;
  } else if (statusFilter === "closed") {
    where += ` AND LOWER(LTRIM(RTRIM(ISNULL(a.status, '')))) = 'closed' `;
  }

  if (city) {
    req.input("city", sql.NVarChar(256), `%${city}%`);
    where += `
      AND (
        ISNULL(u.CITY, '') LIKE @city
        OR ISNULL(u.DYNAMIC_LOCATION, '') LIKE @city
      )
    `;
  }

  return where;
}

/**
 * List SOS events for the mapped Teams team.
 */
async function getSosEvents({ teamId, status, city, location, sinceDays }) {
  const days = clampSinceDays(sinceDays);
  const statusFilter = normalizeStatusFilter(status);
  const cityFilter = trimOrNull(city) || trimOrNull(location) || "";
  const events = [];

  try {
    const pool = await poolPromise;
    const req = pool.request();
    const where = appendSosFilters(req, {
      teamId,
      sinceDays: days,
      statusFilter,
      city: cityFilter || null,
    });

    const sqlText = `
      SELECT TOP 40
        a.id AS sosId,
        u.user_name AS requesterName,
        u.CITY AS city,
        u.COUNTRY AS country,
        u.DEPARTMENT AS department,
        ISNULL(NULLIF(LTRIM(RTRIM(a.status)), ''), 'Open') AS status,
        TRY_CONVERT(datetime, a.requested_date) AS requestedAt,
        (
          SELECT TOP 1 tu.user_name
          FROM dbo.MSTeamsTeamsUsers tu
          WHERE tu.user_aadobject_id = a.FIRST_RESPONDER
            AND LTRIM(RTRIM(ISNULL(tu.user_name, ''))) <> ''
        ) AS firstResponderName,
        a.FIRST_RESPONDER_RESPONDED_AT AS respondedAt,
        CASE
          WHEN a.FIRST_RESPONDER_RESPONDED_AT IS NOT NULL
            AND TRY_CONVERT(datetime, a.requested_date) IS NOT NULL
          THEN DATEDIFF(
            minute,
            TRY_CONVERT(datetime, a.requested_date),
            TRY_CONVERT(datetime, a.FIRST_RESPONDER_RESPONDED_AT)
          )
          ELSE NULL
        END AS responseTimeMinutes
      FROM dbo.MSTeamsAssistance a
      LEFT JOIN dbo.MSTeamsTeamsUsers u
        ON u.user_id = a.user_id
       AND u.team_id = a.team_ids
      ${where}
      ORDER BY TRY_CONVERT(datetime, a.requested_date) DESC, a.id DESC
    `;

    const result = await req.query(sqlText);
    for (const row of result.recordset || []) {
      const mins =
        row.responseTimeMinutes != null && Number.isFinite(Number(row.responseTimeMinutes))
          ? Number(row.responseTimeMinutes)
          : null;
      events.push({
        sosId: row.sosId,
        requesterName: row.requesterName || "Unknown",
        city: row.city || undefined,
        country: row.country || undefined,
        department: row.department || undefined,
        status: row.status || "Open",
        requestedAt: toIso(row.requestedAt),
        firstResponderName: row.firstResponderName || undefined,
        respondedAt: toIso(row.respondedAt),
        responseTimeMinutes: mins,
      });
    }
    console.log("[ai-caller] getSosEvents", {
      teamId,
      sinceDays: days,
      statusFilter,
      city: cityFilter || undefined,
      count: events.length,
    });
  } catch (err) {
    console.warn("[ai-caller] getSosEvents failed:", err.message);
  }

  return {
    source: events.length ? "org_data" : "none",
    sinceDays: days,
    statusFilter,
    location: cityFilter || undefined,
    events,
    teamId,
  };
}

/**
 * Aggregate SOS stats for the mapped Teams team.
 */
async function getSosStats({ teamId, city, location, sinceDays }) {
  const days = clampSinceDays(sinceDays);
  const cityFilter = trimOrNull(city) || trimOrNull(location) || "";

  const empty = {
    source: "none",
    sinceDays: days,
    location: cityFilter || undefined,
    total: 0,
    openCount: 0,
    closedCount: 0,
    respondedCount: 0,
    unrespondedCount: 0,
    avgResponseTimeMinutes: null,
    medianResponseTimeMinutes: null,
    teamId,
  };

  try {
    const pool = await poolPromise;
    const req = pool.request();
    const where = appendSosFilters(req, {
      teamId,
      sinceDays: days,
      statusFilter: "all",
      city: cityFilter || null,
    });

    const sqlText = `
      SELECT
        a.id AS sosId,
        LOWER(LTRIM(RTRIM(ISNULL(a.status, 'open')))) AS statusNorm,
        CASE
          WHEN a.FIRST_RESPONDER_RESPONDED_AT IS NOT NULL
            AND TRY_CONVERT(datetime, a.requested_date) IS NOT NULL
          THEN DATEDIFF(
            minute,
            TRY_CONVERT(datetime, a.requested_date),
            TRY_CONVERT(datetime, a.FIRST_RESPONDER_RESPONDED_AT)
          )
          ELSE NULL
        END AS responseTimeMinutes
      FROM dbo.MSTeamsAssistance a
      LEFT JOIN dbo.MSTeamsTeamsUsers u
        ON u.user_id = a.user_id
       AND u.team_id = a.team_ids
      ${where}
    `;

    const result = await req.query(sqlText);
    const rows = result.recordset || [];
    if (!rows.length) {
      console.log("[ai-caller] getSosStats", { teamId, sinceDays: days, total: 0 });
      return empty;
    }

    let openCount = 0;
    let closedCount = 0;
    const responseMins = [];
    for (const row of rows) {
      const st = row.statusNorm || "open";
      if (st === "closed") closedCount += 1;
      else openCount += 1;
      if (row.responseTimeMinutes != null && Number.isFinite(Number(row.responseTimeMinutes))) {
        const m = Number(row.responseTimeMinutes);
        if (m >= 0) responseMins.push(m);
      }
    }

    const respondedCount = responseMins.length;
    const unrespondedCount = rows.length - respondedCount;
    const avg =
      respondedCount > 0
        ? Math.round((responseMins.reduce((a, b) => a + b, 0) / respondedCount) * 10) / 10
        : null;

    const payload = {
      source: "org_data",
      sinceDays: days,
      location: cityFilter || undefined,
      total: rows.length,
      openCount,
      closedCount,
      respondedCount,
      unrespondedCount,
      avgResponseTimeMinutes: avg,
      medianResponseTimeMinutes: median(responseMins),
      teamId,
    };
    console.log("[ai-caller] getSosStats", {
      teamId,
      sinceDays: days,
      total: payload.total,
      avgResponseTimeMinutes: avg,
    });
    return payload;
  } catch (err) {
    console.warn("[ai-caller] getSosStats failed:", err.message);
    return { ...empty, error: err.message };
  }
}

module.exports = {
  getSosEvents,
  getSosStats,
};
