/**
 * AICaller safety-check orchestration.
 * Calls existing services only — does not change AreYouSafeTabHandler routes.
 */
const sql = require("mssql");
const db = require("../../db");
const poolPromise = require("../../db/dbConn");

const DISTINCT_FIELDS = new Set(["city", "country", "state", "department"]);

async function getCompanyDataByTeamId(teamId) {
  const result = await db.getCompanyDataByTeamId
    ? db.getCompanyDataByTeamId(teamId)
    : null;
  return result;
}

function trimOrNull(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

function includesInsensitive(haystack, needle) {
  if (!needle) return true;
  if (!haystack) return false;
  return String(haystack).toLowerCase().includes(String(needle).toLowerCase());
}

/**
 * Resolve effective location: DYNAMIC_LOCATION if set, else directory city/state/country.
 */
function resolveMemberLocation(m) {
  const city = trimOrNull(m.city);
  const country = trimOrNull(m.country);
  const state = trimOrNull(m.state);
  const department = trimOrNull(m.department);
  const dynamicLocation = trimOrNull(m.DYNAMIC_LOCATION);
  const homeCombined = [city, state, country].filter(Boolean).join(", ") || null;

  let effectiveLocation = null;
  let source = null;
  if (dynamicLocation) {
    effectiveLocation = dynamicLocation;
    source = "dynamic";
  } else if (homeCombined || city) {
    effectiveLocation = homeCombined || city;
    source = "office365";
  }

  return {
    city,
    country,
    state,
    department,
    dynamicLocation,
    homeCombined,
    effectiveLocation,
    source,
  };
}

async function loadTeamMembers(teamId) {
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
        state,
        department,
        DYNAMIC_LOCATION
      FROM MSTeamsTeamsUsers
      WHERE team_id = @teamId
    `);
  return membersResult.recordset || [];
}

async function loadConfiguredLocations(tenantId) {
  if (!tenantId) return [];
  try {
    const pool = await poolPromise;
    const result = await pool
      .request()
      .input("tenantId", sql.NVarChar(sql.MAX), String(tenantId))
      .query(`
        SELECT
          CITY AS city,
          COUNTRY AS country,
          STATE AS state,
          DEPARTMENT AS department,
          ISOffice365Location
        FROM [dbo].[LOCATION_CONFIGURATION]
        WHERE TENENT_ID = @tenantId
      `);
    return (result.recordset || []).map((row) => ({
      city: trimOrNull(row.city),
      country: trimOrNull(row.country),
      state: trimOrNull(row.state),
      department: trimOrNull(row.department),
      source:
        row.ISOffice365Location === 1 || row.ISOffice365Location === true
          ? "office365"
          : "manual",
    }));
  } catch (err) {
    console.warn("[ai-caller] LOCATION_CONFIGURATION load skipped:", err.message);
    return [];
  }
}

/**
 * Find a LOCATION_CONFIGURATION row matching the query (manual or O365 catalog).
 * Includes STATE in select + match.
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
          STATE AS state,
          DEPARTMENT AS department,
          ISOffice365Location
        FROM [dbo].[LOCATION_CONFIGURATION]
        WHERE TENENT_ID = @tenantId
          AND (
            LOWER(ISNULL(CITY, '')) LIKE '%' + @q + '%'
            OR LOWER(ISNULL(COUNTRY, '')) LIKE '%' + @q + '%'
            OR LOWER(ISNULL(STATE, '')) LIKE '%' + @q + '%'
            OR LOWER(ISNULL(CITY, '') + ', ' + ISNULL(COUNTRY, '')) LIKE '%' + @q + '%'
            OR LOWER(ISNULL(CITY, '') + ', ' + ISNULL(STATE, '') + ', ' + ISNULL(COUNTRY, '')) LIKE '%' + @q + '%'
          )
        ORDER BY
          CASE WHEN ISOffice365Location = 1 THEN 0 ELSE 1 END,
          CITY
      `);
    const row = result.recordset?.[0];
    if (!row) return null;
    return {
      city: trimOrNull(row.city),
      country: trimOrNull(row.country),
      state: trimOrNull(row.state),
      department: trimOrNull(row.department),
      source:
        row.ISOffice365Location === 1 || row.ISOffice365Location === true
          ? "office365"
          : "manual",
    };
  } catch (err) {
    console.warn("[ai-caller] LOCATION_CONFIGURATION lookup skipped:", err.message);
    return null;
  }
}

/**
 * Multi-filter people lookup.
 * locationMode: effective (default) | home | travelers
 */
async function listUsers({
  teamId,
  tenantId,
  city,
  country,
  state,
  department,
  name,
  locationMode = "effective",
  includeConfigured = false,
}) {
  const filters = {
    city: trimOrNull(city),
    country: trimOrNull(country),
    state: trimOrNull(state),
    department: trimOrNull(department),
    name: trimOrNull(name),
    locationMode: String(locationMode || "effective").toLowerCase(),
  };

  const mode = ["effective", "home", "travelers"].includes(filters.locationMode)
    ? filters.locationMode
    : "effective";

  const hasFilter =
    filters.city ||
    filters.country ||
    filters.state ||
    filters.department ||
    filters.name ||
    mode === "travelers";

  if (!hasFilter) {
    return {
      users: [],
      count: 0,
      filtersApplied: filters,
      error: "Provide at least one filter: city, country, state, department, name, or locationMode=travelers",
    };
  }

  try {
    const members = await loadTeamMembers(teamId);
    const users = [];

    for (const m of members) {
      const loc = resolveMemberLocation(m);
      const displayName = trimOrNull(m.user_name) || "";

      if (filters.name && !includesInsensitive(displayName, filters.name)) continue;
      if (filters.department && !includesInsensitive(loc.department, filters.department)) continue;

      if (mode === "travelers") {
        if (!loc.dynamicLocation) continue;
        const homeCity = loc.city || "";
        if (homeCity && includesInsensitive(loc.dynamicLocation, homeCity)) continue;
        // still apply geo filters against effective (current) location
        if (filters.city && !includesInsensitive(loc.dynamicLocation, filters.city)) continue;
        if (filters.state && !includesInsensitive(loc.dynamicLocation, filters.state) && !includesInsensitive(loc.state, filters.state)) {
          continue;
        }
        if (filters.country && !includesInsensitive(loc.dynamicLocation, filters.country) && !includesInsensitive(loc.country, filters.country)) {
          continue;
        }
      } else if (mode === "home") {
        if (filters.city && !includesInsensitive(loc.city, filters.city)) continue;
        if (filters.state && !includesInsensitive(loc.state, filters.state)) continue;
        if (filters.country && !includesInsensitive(loc.country, filters.country)) continue;
      } else {
        // effective: match city/state/country against effective location string, with directory fallbacks
        const geoHaystack = [loc.effectiveLocation, loc.city, loc.state, loc.country]
          .filter(Boolean)
          .join(" ");
        if (filters.city && !includesInsensitive(geoHaystack, filters.city)) continue;
        if (filters.state && !includesInsensitive(geoHaystack, filters.state)) continue;
        if (filters.country && !includesInsensitive(geoHaystack, filters.country)) continue;
        if (!loc.effectiveLocation && !filters.name && !filters.department) continue;
      }

      users.push({
        id: m.user_aadobject_id,
        name: m.user_name,
        city: loc.city,
        country: loc.country,
        state: loc.state,
        department: loc.department,
        dynamicLocation: loc.dynamicLocation,
        effectiveLocation: loc.effectiveLocation,
        source: loc.source,
      });
    }

    let configuredLocation = null;
    if (includeConfigured && tenantId && (filters.city || filters.state || filters.country)) {
      const pool = await poolPromise;
      const q = filters.city || filters.state || filters.country;
      configuredLocation = await findConfiguredLocation(pool, tenantId, q);
    }

    return {
      users,
      count: users.length,
      filtersApplied: { ...filters, locationMode: mode },
      configuredLocation,
    };
  } catch (err) {
    return {
      users: [],
      count: 0,
      filtersApplied: filters,
      error: err.message,
    };
  }
}

function fieldValueFromRow(row, field) {
  if (field === "city") return trimOrNull(row.city);
  if (field === "country") return trimOrNull(row.country);
  if (field === "state") return trimOrNull(row.state);
  if (field === "department") return trimOrNull(row.department);
  return null;
}

function rowMatchesScope(row, scopedField, scopedValue) {
  if (!scopedField || !scopedValue) return true;
  const v = fieldValueFromRow(row, scopedField);
  return includesInsensitive(v, scopedValue);
}

/**
 * Distinct org field values with counts.
 * source: people | configured | both
 */
async function listDistinctValues({
  teamId,
  tenantId,
  field,
  scopedField,
  scopedValue,
  source = "people",
}) {
  const f = String(field || "").toLowerCase().trim();
  if (!DISTINCT_FIELDS.has(f)) {
    return {
      values: [],
      totalDistinct: 0,
      field: f,
      error: "field must be one of: city, country, state, department",
    };
  }

  const src = ["people", "configured", "both"].includes(String(source).toLowerCase())
    ? String(source).toLowerCase()
    : "people";
  const scopeField = scopedField ? String(scopedField).toLowerCase().trim() : null;
  const scopeValue = trimOrNull(scopedValue);
  if (scopeField && !DISTINCT_FIELDS.has(scopeField)) {
    return {
      values: [],
      totalDistinct: 0,
      field: f,
      error: "scopedField must be one of: city, country, state, department",
    };
  }

  try {
    const map = new Map(); // value -> { value, count, fromConfigured }

    if (src === "people" || src === "both") {
      const members = await loadTeamMembers(teamId);
      for (const m of members) {
        const loc = resolveMemberLocation(m);
        const row = {
          city: loc.city,
          country: loc.country,
          state: loc.state,
          department: loc.department,
        };
        if (!rowMatchesScope(row, scopeField, scopeValue)) continue;
        const value = fieldValueFromRow(row, f);
        if (!value) continue;
        const key = value.toLowerCase();
        const prev = map.get(key);
        if (prev) prev.count += 1;
        else map.set(key, { value, count: 1, fromConfigured: false });
      }
    }

    if (src === "configured" || src === "both") {
      const configured = await loadConfiguredLocations(tenantId);
      for (const row of configured) {
        if (!rowMatchesScope(row, scopeField, scopeValue)) continue;
        const value = fieldValueFromRow(row, f);
        if (!value) continue;
        const key = value.toLowerCase();
        const prev = map.get(key);
        if (prev) {
          if (src === "configured") prev.count += 1;
          // both: keep people count; mark also configured
          prev.fromConfigured = prev.fromConfigured || true;
        } else {
          map.set(key, {
            value,
            count: src === "configured" ? 1 : 0,
            fromConfigured: true,
          });
        }
      }
    }

    const values = [...map.values()].sort((a, b) => a.value.localeCompare(b.value));
    return {
      values,
      totalDistinct: values.length,
      field: f,
      scoped_to: scopeField && scopeValue ? { field: scopeField, value: scopeValue } : null,
      source: src,
    };
  } catch (err) {
    return {
      values: [],
      totalDistinct: 0,
      field: f,
      error: err.message,
    };
  }
}

/** @deprecated Prefer listUsers — kept for safety-check city estimate compatibility shape */
async function listUsersByCity({ teamId, city }) {
  return listUsers({ teamId, city: city || "", locationMode: "effective" });
}

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
  const result = await listUsers({
    teamId,
    tenantId,
    city: locationQuery,
    locationMode: "effective",
    includeConfigured,
  });
  // Also try matching as country/state by treating the whole string as a geo needle via city filter (haystack)
  const countsBySource = { dynamic: 0, office365: 0 };
  for (const u of result.users || []) {
    if (u.source === "dynamic") countsBySource.dynamic += 1;
    else if (u.source === "office365") countsBySource.office365 += 1;
  }
  return {
    locationQuery,
    configuredLocation: result.configuredLocation || null,
    users: (result.users || []).map((u) => ({
      id: u.id,
      name: u.name,
      effectiveLocation: u.effectiveLocation,
      source: u.source,
      directoryCity: u.city,
      dynamicLocation: u.dynamicLocation,
    })),
    count: result.count,
    countsBySource,
    error: result.error,
  };
}

async function createAndSendSafetyCheck(payload) {
  const {
    teamsTenantId: tenantId,
    teamsTeamId: teamId,
    userAadObjId,
    title,
    message,
    city,
    country,
    state,
    department,
    memberIds,
  } = payload;

  const { AreYouSafeTab } = require("../../tab/areYouSafeTab");
  const bot = require("../../bot/bot");
  const { getCompanyDataByTeamId } = require("../../db/dbOperations");
  const { AYSLog } = require("../../utils/log");
  const {
    buildOnetimeIncDataLikeTab,
    buildIncMembers,
  } = require("./aiCallerTabPayload");

  const filters = {
    city: trimOrNull(city),
    country: trimOrNull(country),
    state: trimOrNull(state),
    department: trimOrNull(department),
  };
  const explicitIds = Array.isArray(memberIds)
    ? memberIds.map((id) => String(id)).filter(Boolean)
    : [];

  const hasFilter =
    filters.city ||
    filters.country ||
    filters.state ||
    filters.department ||
    explicitIds.length > 0;

  if (!hasFilter) {
    return {
      error:
        "Provide at least one recipient filter: city, country, state, department, or memberIds",
    };
  }

  let membersPool;
  if (filters.city || filters.country || filters.state || filters.department) {
    membersPool = await listUsers({
      teamId,
      tenantId,
      city: filters.city,
      country: filters.country,
      state: filters.state,
      department: filters.department,
      locationMode: "effective",
    });
    if (membersPool.error && !(membersPool.users || []).length) {
      return { error: membersPool.error || "Failed to resolve recipients" };
    }
  } else {
    // memberIds only — load team and intersect
    const members = await loadTeamMembers(teamId);
    membersPool = {
      users: members.map((m) => ({
        id: m.user_aadobject_id,
        name: m.user_name,
      })),
    };
  }

  let users = membersPool.users || [];
  if (explicitIds.length) {
    const idSet = new Set(explicitIds);
    users = users.filter((u) => idSet.has(String(u.id)));
  }

  if (!users.length) {
    return {
      error: "No recipients matched the given filters",
      filters,
      memberIds: explicitIds,
    };
  }

  const selectedIds = users.map((u) => u.id);
  const createdByName = "Safety Assistant";
  const incData = buildOnetimeIncDataLikeTab({
    title,
    message,
    teamId,
    userAadObjId,
    createdByName,
    selectedMemberIds: selectedIds,
  });
  const incMembers = buildIncMembers(users);

  const tab = new AreYouSafeTab();
  const created = await tab.createNewIncident(
    { incData, incMembers, incId: -1 },
    userAadObjId
  );

  const incId = created?.incId || created?.incid || created?.id;
  if (!incId) {
    return { error: "Incident create did not return an id", created };
  }

  const companyData = await getCompanyDataByTeamId(teamId, userAadObjId);
  if (!companyData) {
    return {
      error: "companyData not found for team — ensure the Teams app is installed",
      incidentId: incId,
    };
  }

  const createByInfo = {
    user_id: userAadObjId,
    user_name: createdByName,
    companyData,
  };

  // Tab passes the Incident model from create (incGuidance, selectedMembers, …)
  const incdataForSend = {
    ...created,
    incId,
    incTitle: created.incTitle || incData.incTitle,
    incGuidance: created.incGuidance || incData.guidance,
    guidance: created.incGuidance || incData.guidance,
    selectedMembers:
      typeof created.selectedMembers === "string" && created.selectedMembers
        ? created.selectedMembers
        : selectedIds.join(","),
    incCreatedBy: created.incCreatedBy || userAadObjId,
    teamId: created.teamId || teamId,
    incType: created.incType || "onetime",
    incTypeId: created.incTypeId || 1,
    responseType: created.responseType || incData.responseType,
    responseOptions: created.responseOptions || incData.responseOptions,
    translatedMessages: created.translatedMessages || "",
  };

  const log = new AYSLog();
  await bot.NewsendSafetyCheckMessageAsync(
    incId,
    teamId,
    createByInfo,
    log,
    userAadObjId,
    false,
    incdataForSend,
    incMembers,
    companyData,
    "true",
    "true"
  );

  return {
    stub: false,
    incidentId: incId,
    sentTo: users.length,
    city: filters.city,
    country: filters.country,
    state: filters.state,
    department: filters.department,
    title: incData.incTitle,
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

async function resolveLatestSafetyCheckIncidentId(teamId) {
  try {
    const pool = await poolPromise;
    const result = await pool
      .request()
      .input("teamId", sql.NVarChar(256), String(teamId))
      .query(`
        SELECT TOP 1 id AS incidentId
        FROM dbo.MSTeamsIncidents
        WHERE team_id = @teamId
          AND (INC_TYPE_ID = 1 OR INC_TYPE_ID IS NULL)
          AND ISNULL(isSavedAsDraft, 0) = 0
          AND ISNULL(isSaveAsTemplate, 0) = 0
        ORDER BY created_date DESC, id DESC
      `);
    return result.recordset?.[0]?.incidentId ?? null;
  } catch (err) {
    console.warn("[ai-caller] resolveLatestSafetyCheckIncidentId failed:", err.message);
    return null;
  }
}

function memberDisplayName(m) {
  return (
    trimOrNull(m?.userName) ||
    trimOrNull(m?.user_name) ||
    trimOrNull(m?.name) ||
    trimOrNull(m?.user_id) ||
    "Unknown"
  );
}

function namesFromMembers(list) {
  return (list || []).map(memberDisplayName);
}

function buildStatusSummary(payload) {
  const c = payload.counts || {};
  const clip = (arr) => {
    if (!arr?.length) return "";
    const shown = arr.slice(0, 5).join(", ");
    return arr.length > 5 ? ` (${shown} +${arr.length - 5} more)` : ` (${shown})`;
  };
  return [
    `Safe: ${c.safe ?? 0}${clip(payload.safe)}`,
    `Need assistance: ${c.needAssistance ?? 0}${clip(payload.needAssistance)}`,
    `Not responded: ${c.notResponded ?? 0}${clip(payload.notResponded)}`,
  ].join(" — ");
}

async function getCheckinStatus({ teamId, incidentId, userAadObjId }) {
  try {
    const incidentService = require("../../services/incidentService");
    const { AreYouSafeTab } = require("../../tab/areYouSafeTab");

    let resolvedId = incidentId ? Number(incidentId) || incidentId : null;
    let latest = false;
    if (!resolvedId) {
      resolvedId = await resolveLatestSafetyCheckIncidentId(teamId);
      latest = true;
      if (!resolvedId) {
        return { error: "No safety-check incidents found for this team", teamId };
      }
    }

    const inc = await incidentService.getInc(resolvedId, null, userAadObjId || null);
    if (!inc || !inc.incId) {
      return { error: "Incident not found", incidentId: resolvedId, teamId };
    }

    const members = Array.isArray(inc.members) ? inc.members : [];
    const tab = new AreYouSafeTab();
    const sorted = tab.sortMembers(members, inc.incTypeId || 1) || {
      membersSafe: [],
      membersUnsafe: [],
      membersNotResponded: [],
    };

    const safe = namesFromMembers(sorted.membersSafe);
    const needAssistance = namesFromMembers(sorted.membersUnsafe);
    let notResponded = namesFromMembers(sorted.membersNotResponded);

    // Members not classified by sortMembers → treat as not responded
    const named = new Set([...safe, ...needAssistance, ...notResponded]);
    for (const m of members) {
      const n = memberDisplayName(m);
      if (!named.has(n)) {
        notResponded.push(n);
        named.add(n);
      }
    }

    const status = {
      safe,
      needAssistance,
      notResponded,
      counts: {
        safe: safe.length,
        needAssistance: needAssistance.length,
        notResponded: notResponded.length,
      },
    };

    return {
      incidentId: inc.incId || resolvedId,
      title: inc.incTitle || null,
      teamId,
      latest,
      status,
      ...status,
      summary: buildStatusSummary(status),
    };
  } catch (err) {
    return { incidentId, teamId, error: err.message };
  }
}

module.exports = {
  listUsers,
  listDistinctValues,
  listUsersByCity,
  listUsersAtLocation,
  createAndSendSafetyCheck,
  getActiveIncidents,
  getCheckinStatus,
  getCompanyDataByTeamId,
};
