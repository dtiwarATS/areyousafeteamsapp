/**
 * AICaller safety-check orchestration.
 * Calls existing services only — does not change AreYouSafeTabHandler routes.
 */
const sql = require("mssql");
const db = require("../../db");
const poolPromise = require("../../db/dbConn");

async function getCompanyDataByTeamId(teamId) {
  const result = await db.getCompanyDataByTeamId
    ? db.getCompanyDataByTeamId(teamId)
    : null;
  return result;
}

/**
 * Find a LOCATION_CONFIGURATION row matching the query (manual or O365 catalog).
 */
async function findConfiguredLocation(pool, tenantId, locationQuery) {
  try {
    const result = await pool
      .request()
      .input("tenantId", sql.NVarChar(sql.MAX), String(tenantId))
      .input("q", sql.NVarChar(256), String(locationQuery).toLowerCase())
      .query(`
        SELECT TOP 1
          CITY AS city,
          COUNTRY AS country,
          DEPARTMENT AS department,
          ISOffice365Location
        FROM [dbo].[LOCATION_CONFIGURATION]
        WHERE TENENT_ID = @tenantId
          AND (
            LOWER(ISNULL(CITY, '')) LIKE '%' + @q + '%'
            OR LOWER(ISNULL(COUNTRY, '')) LIKE '%' + @q + '%'
            OR LOWER(ISNULL(CITY, '') + ', ' + ISNULL(COUNTRY, '')) LIKE '%' + @q + '%'
          )
        ORDER BY
          CASE WHEN ISOffice365Location = 1 THEN 0 ELSE 1 END,
          CITY
      `);
    const row = result.recordset?.[0];
    if (!row) return null;
    return {
      city: row.city || null,
      country: row.country || null,
      department: row.department || null,
      source: row.ISOffice365Location === 1 || row.ISOffice365Location === true ? "office365" : "manual",
    };
  } catch (err) {
    console.warn("[ai-caller] LOCATION_CONFIGURATION lookup skipped:", err.message);
    return null;
  }
}

/**
 * Users whose effective location matches `location`.
 * Prefers DYNAMIC_LOCATION (current/manual update); else O365/directory CITY.
 */
async function listUsersAtLocation({ teamId, tenantId, location, includeConfigured = true }) {
  const locationQuery = String(location || "").trim();
  if (!locationQuery) {
    return {
      locationQuery: "",
      configuredLocation: null,
      users: [],
      count: 0,
      countsBySource: { dynamic: 0, office365: 0 },
      error: "location is required",
    };
  }

  try {
    const pool = await poolPromise;
    const membersResult = await pool
      .request()
      .input("teamId", sql.NVarChar(256), String(teamId))
      .query(`
        SELECT TOP 500
          user_aadobject_id,
          user_name,
          city,
          country,
          DYNAMIC_LOCATION
        FROM MSTeamsTeamsUsers
        WHERE team_id = @teamId
      `);

    const needle = locationQuery.toLowerCase();
    const users = [];
    const countsBySource = { dynamic: 0, office365: 0 };

    for (const m of membersResult.recordset || []) {
      const dynamicLocation =
        (m.DYNAMIC_LOCATION != null && String(m.DYNAMIC_LOCATION).trim()) || null;
      const directoryCity = (m.city != null && String(m.city).trim()) || null;
      const directoryCountry = (m.country != null && String(m.country).trim()) || null;
      const directoryCombined =
        [directoryCity, directoryCountry].filter(Boolean).join(", ") || null;

      let effectiveLocation = null;
      let source = null;
      if (dynamicLocation) {
        effectiveLocation = dynamicLocation;
        source = "dynamic";
      } else if (directoryCombined || directoryCity) {
        effectiveLocation = directoryCombined || directoryCity;
        source = "office365";
      } else {
        continue;
      }

      if (!String(effectiveLocation).toLowerCase().includes(needle)) continue;

      users.push({
        id: m.user_aadobject_id,
        name: m.user_name,
        effectiveLocation,
        source,
        directoryCity,
        dynamicLocation,
      });
      countsBySource[source] += 1;
    }

    let configuredLocation = null;
    if (includeConfigured !== false && tenantId) {
      configuredLocation = await findConfiguredLocation(pool, tenantId, locationQuery);
    }

    return {
      locationQuery,
      configuredLocation,
      users,
      count: users.length,
      countsBySource,
    };
  } catch (err) {
    return {
      locationQuery,
      configuredLocation: null,
      users: [],
      count: 0,
      countsBySource: { dynamic: 0, office365: 0 },
      error: err.message,
    };
  }
}

/**
 * Resolve installation / members with defensive fallbacks so missing helpers
 * don't break the wrapper; returns structured errors instead.
 */
async function listUsersByCity({ teamId, city }) {
  try {
    // Prefer existing DB helpers when present
    if (typeof db.getAllMembersByTeamId === "function") {
      const members = await db.getAllMembersByTeamId(teamId);
      const filtered = (members || []).filter((m) => {
        const c = (m.city || m.City || m.officeLocation || "").toString().toLowerCase();
        return !city || c.includes(String(city).toLowerCase());
      });
      return {
        users: filtered.map((m) => ({
          id: m.user_aadobject_id || m.userAadObjId || m.id,
          name: m.user_name || m.displayName || m.name,
          city: m.city || m.City || m.officeLocation || null,
        })),
        count: filtered.length,
      };
    }

    // Fallback: query MSTeamsTeamsUsers if a generic query helper exists
    if (typeof db.executeQuery === "function") {
      const rows = await db.executeQuery(
        `SELECT TOP 500 user_aadobject_id, user_name, city
         FROM MSTeamsTeamsUsers WHERE team_id = @teamId`,
        { teamId }
      );
      const filtered = (rows || []).filter((m) => {
        const c = (m.city || "").toString().toLowerCase();
        return !city || c.includes(String(city).toLowerCase());
      });
      return {
        users: filtered.map((m) => ({
          id: m.user_aadobject_id,
          name: m.user_name,
          city: m.city,
        })),
        count: filtered.length,
      };
    }

    return {
      users: [],
      count: 0,
      note: "Member listing helper not available; configure DB helpers or stub for local testing.",
    };
  } catch (err) {
    return { users: [], count: 0, error: err.message };
  }
}

async function createAndSendSafetyCheck(payload) {
  const {
    teamsTeamId: teamId,
    userAadObjId,
    title,
    message,
    city,
    memberIds,
  } = payload;

  // Lazy-require existing modules so this file can load even if paths differ
  let createNewIncident;
  let NewsendSafetyCheckMessageAsync;
  try {
    const tab = require("../../tab/areYouSafeTab");
    createNewIncident = tab.createNewIncident;
  } catch (e) {
    createNewIncident = null;
  }
  try {
    const bot = require("../../bot");
    NewsendSafetyCheckMessageAsync = bot.NewsendSafetyCheckMessageAsync;
  } catch (e) {
    NewsendSafetyCheckMessageAsync = null;
  }

  if (!createNewIncident || !NewsendSafetyCheckMessageAsync) {
    // Safe stub response when services cannot be loaded (dev / incomplete wire-up)
    return {
      stub: true,
      message: "AICaller received safety-check request; existing create/send modules not loaded in this environment.",
      teamId,
      userAadObjId,
      title,
      previewMessage: message,
      city,
      memberIds: memberIds || [],
    };
  }

  const membersResult = await listUsersByCity({ teamId, city: city || "" });
  const members = (memberIds && memberIds.length)
    ? membersResult.users.filter((u) => memberIds.includes(u.id))
    : membersResult.users;

  const incData = {
    title: title || "Safety check",
    guidance: message || "",
    team_id: teamId,
    created_by: userAadObjId,
  };

  const created = await createNewIncident(userAadObjId, {
    incData,
    incMembers: members.map((m) => ({ value: m.id, label: m.name })),
  });

  const incId = created?.incId || created?.incid || created?.id;
  if (!incId) {
    return { error: "Incident create did not return an id", created };
  }

  await NewsendSafetyCheckMessageAsync({
    query: {
      incId,
      teamId,
      userAadObjId,
      isFirstBatch: true,
      isLastBatch: true,
    },
    body: {
      createByInfo: { user_id: userAadObjId, user_name: "Safety Assistant" },
      members: members.map((m) => ({ value: m.id, label: m.name })),
      incdata: {
        title: title || "Safety check",
        guidance: message || "",
        selectedMembers: members.map((m) => m.id),
        incCreatedBy: userAadObjId,
      },
    },
  });

  return {
    stub: false,
    incidentId: incId,
    sentTo: members.length,
    city: city || null,
    title,
  };
}

async function getActiveIncidents({ tenantId, teamId }) {
  try {
    if (typeof db.getAllIncData === "function") {
      const data = await db.getAllIncData(teamId);
      return { incidents: data || [] };
    }
    return {
      incidents: [],
      note: "getAllIncData not available; wire to incidentService when ready.",
      tenantId,
      teamId,
    };
  } catch (err) {
    return { incidents: [], error: err.message };
  }
}

async function getCheckinStatus({ teamId, incidentId }) {
  try {
    if (typeof db.getSafetyCheckProgress === "function") {
      const progress = await db.getSafetyCheckProgress(incidentId, teamId);
      return { incidentId, progress };
    }
    return {
      incidentId,
      note: "Progress helper not available yet.",
      teamId,
    };
  } catch (err) {
    return { incidentId, error: err.message };
  }
}

module.exports = {
  listUsersByCity,
  listUsersAtLocation,
  createAndSendSafetyCheck,
  getActiveIncidents,
  getCheckinStatus,
  getCompanyDataByTeamId,
};
