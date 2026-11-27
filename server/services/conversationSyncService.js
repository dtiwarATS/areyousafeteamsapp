const axios = require("axios");
const FormData = require("form-data");
const sql = require("mssql");
const { getActivePoolPromise } = require("../db/dbContext");
const { processSafetyBotError } = require("../models/processError");
const { saveInstalledUsers } = require("./installedUsersService");

const REQUIRED_SCOPES = [
  "User.Read.All",
  "TeamsAppInstallation.ReadForUser.All",
];
const INSTALL_BATCH_SIZE = 25;
const SAVE_BATCH_SIZE = 50;
const GRAPH_TIMEOUT_MS = 60000;

const ELIGIBLE_TEAMS_SQL = `
  SELECT DISTINCT
    i.team_id,
    i.user_tenant_id,
    i.serviceUrl
  FROM MSTeamsInstallationDetails i
  INNER JOIN MSTeamsSubscriptionDetails sd
    ON sd.ID = i.SubscriptionDetailsId
  WHERE i.uninstallation_date IS NULL
    AND ISNULL(i.team_id, '') <> ''
    AND ISNULL(i.user_tenant_id, '') <> ''
    AND ISNULL(i.serviceUrl, '') <> ''
    AND i.IS_APP_PERMISSION_GRANTED = 1
    AND i.IS_APP_PERMISSION_GRANTED <> ''
    AND sd.SubscriptionType IN (2, 3)
    AND NOT (
      sd.ExpiryDate IS NOT NULL
      AND GETDATE() > sd.ExpiryDate
    ) and i.user_tenant_id in ('881cba72-13a2-4400-bac5-c05dd4730675','60b4016c-366c-4f2f-af05-dc2fda09d07b')
`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const hasConversationId = (conversationId) =>
  conversationId !== null &&
  conversationId !== undefined &&
  String(conversationId).toLowerCase() !== "null" &&
  String(conversationId).trim().length > 0;

const isSafetyCheckApp = (app) => {
  const displayName = app?.teamsApp?.displayName || app?.displayName || "";
  return (
    displayName === "Staging - Are You Safe?" ||
    displayName === "Safety Check" ||
    displayName.includes("Are You Safe") ||
    displayName.includes("Safety Check")
  );
};

const isMissingConsentError = (err) => {
  const blob = `${err?.response?.data?.error || ""} ${err?.response?.data?.error_description || ""} ${err?.message || ""}`;
  return /consent|AADSTS65001|AADSTS70011|AADSTS53003|AADSTS700016|interaction_required|invalid_grant/i.test(
    blob,
  );
};

const graphErrorMessage = (err) =>
  err?.response?.data?.error?.message ||
  err?.response?.data?.error_description ||
  err?.message ||
  "Unknown error";

function decodeJwtPayload(accessToken) {
  const parts = String(accessToken || "").split(".");
  if (parts.length !== 3) return null;
  const padded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const json = Buffer.from(padded, "base64").toString("utf8");
  return JSON.parse(json);
}

function validateTokenScopes(accessToken) {
  try {
    const payload = decodeJwtPayload(accessToken);
    if (!payload) {
      return { valid: false, missingScopes: REQUIRED_SCOPES.slice() };
    }
    const roles = Array.isArray(payload.roles)
      ? payload.roles
      : payload.roles
        ? [payload.roles]
        : [];
    const scp = Array.isArray(payload.scp)
      ? payload.scp
      : typeof payload.scp === "string"
        ? payload.scp.split(" ").filter(Boolean)
        : [];
    const granted = new Set([...roles, ...scp]);
    const missingScopes = REQUIRED_SCOPES.filter(
      (scope) => !granted.has(scope),
    );
    return { valid: missingScopes.length === 0, missingScopes };
  } catch (err) {
    console.log("[conversationSync] token decode failed:", err?.message || err);
    return { valid: false, missingScopes: REQUIRED_SCOPES.slice() };
  }
}

async function graphGet(url, accessToken, attempt = 0) {
  try {
    return await axios.get(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: GRAPH_TIMEOUT_MS,
    });
  } catch (err) {
    if (err?.response?.status === 429 && attempt < 3) {
      const retryAfter = Number(err.response?.headers?.["retry-after"]) || 2;
      await sleep(Math.min(Math.max(retryAfter, 1), 30) * 1000);
      return graphGet(url, accessToken, attempt + 1);
    }
    const error = new Error(`Graph API error: ${graphErrorMessage(err)}`);
    error.cause = err;
    throw error;
  }
}

async function listGraphCollection(firstUrl, accessToken) {
  const items = [];
  let nextLink = firstUrl;
  try {
    while (nextLink) {
      const response = await graphGet(nextLink, accessToken);
      const data = response.data || {};
      if (Array.isArray(data.value)) {
        items.push(...data.value);
      }
      nextLink = data["@odata.nextLink"] || null;
    }
    return items;
  } catch (err) {
    if (items.length > 0) {
      console.warn(
        `[conversationSync] returning partial Graph page (${items.length}):`,
        err?.message || err,
      );
      return items;
    }
    throw err;
  }
}

async function getGraphAccessToken(tenantId) {
  const data = new FormData();
  data.append("client_Id", process.env.MicrosoftAppId);
  data.append("client_secret", process.env.MicrosoftAppPassword);
  data.append("scope", "https://graph.microsoft.com/.default");
  data.append("grant_type", "client_credentials");

  const response = await axios.request({
    method: "post",
    maxBodyLength: Infinity,
    url: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    data,
    headers: data.getHeaders(),
    timeout: GRAPH_TIMEOUT_MS,
  });
  return response.data?.access_token || null;
}

async function loadEligibleTeams() {
  const pool = await getActivePoolPromise();
  const result = await pool.request().query(ELIGIBLE_TEAMS_SQL);
  return result.recordset || [];
}

function groupTeamsByTenant(teams) {
  const byTenant = new Map();
  for (const team of teams) {
    const tenantId = String(team.user_tenant_id || "").trim();
    const teamId = String(team.team_id || "").trim();
    const serviceUrl = String(team.serviceUrl || "").trim();
    if (!tenantId || !teamId || !serviceUrl) continue;
    if (!byTenant.has(tenantId)) byTenant.set(tenantId, []);
    byTenant.get(tenantId).push({
      team_id: teamId,
      serviceUrl,
    });
  }
  return byTenant;
}

async function loadExistingConversationIds(tenantId, teams) {
  const byTeam = new Map();
  for (const team of teams) {
    byTeam.set(String(team.team_id).toLowerCase(), new Set());
  }
  if (teams.length === 0) return byTeam;

  const pool = await getActivePoolPromise();
  const request = pool.request();
  request.input("tenantId", sql.NVarChar, tenantId);
  const teamParams = teams.map((team, index) => {
    const name = `team${index}`;
    request.input(name, sql.NVarChar, team.team_id);
    return `@${name}`;
  });

  const result = await request.query(`
    SELECT team_id, user_aadobject_id, conversationId
    FROM MSTeamsTeamsUsers
    WHERE tenantid = @tenantId
      AND team_id IN (${teamParams.join(", ")})
      AND conversationId IS NOT NULL
      AND LTRIM(RTRIM(conversationId)) <> ''
      AND LOWER(LTRIM(RTRIM(conversationId))) <> 'null'
  `);

  for (const row of result.recordset || []) {
    const teamKey = String(row.team_id || "").toLowerCase();
    const userKey = String(row.user_aadobject_id || "").toLowerCase();
    if (
      !byTeam.has(teamKey) ||
      !userKey ||
      !hasConversationId(row.conversationId)
    ) {
      continue;
    }
    byTeam.get(teamKey).add(userKey);
  }
  return byTeam;
}

function hasConversationOnEveryTeam(userId, existingByTeam) {
  const key = String(userId || "").toLowerCase();
  if (!key || existingByTeam.size === 0) return false;
  for (const userIds of existingByTeam.values()) {
    if (!userIds.has(key)) return false;
  }
  return true;
}

async function listEnabledUsers(accessToken) {
  const filter = encodeURIComponent("accountEnabled eq true");
  const url = `https://graph.microsoft.com/v1.0/users?$select=id,displayName,mail,userPrincipalName,accountEnabled&$filter=${filter}&$top=999`;
  return listGraphCollection(url, accessToken);
}

async function checkUserInstalled(user, accessToken) {
  try {
    const apps = await listGraphCollection(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(user.id)}/teamwork/installedApps?$expand=teamsApp`,
      accessToken,
    );
    return { user, installed: apps.some(isSafetyCheckApp) };
  } catch (err) {
    console.log(
      `[conversationSync] install check failed for ${user.id}:`,
      err?.message || err,
    );
    return { user, installed: false };
  }
}

function toSavePayload(user) {
  return {
    aadUserId: user.id,
    userId: user.id,
    id: user.id,
    displayName: user.displayName || "",
    userName: user.displayName || "",
    userPrincipalName: user.userPrincipalName || "",
    email: user.mail || user.userPrincipalName || "",
    mail: user.mail || "",
  };
}

async function saveTeamUsers(users, tenantId, team) {
  let createdConversationCount = 0;
  for (let i = 0; i < users.length; i += SAVE_BATCH_SIZE) {
    const batch = users.slice(i, i + SAVE_BATCH_SIZE).map(toSavePayload);
    const result = await saveInstalledUsers(
      batch,
      tenantId,
      team.team_id,
      team.serviceUrl,
    );
    if (!result?.success) {
      throw new Error(result?.error || "saveInstalledUsers failed");
    }
    createdConversationCount += result.createdConversationCount || 0;
  }
  return createdConversationCount;
}

async function syncTenant(tenantId, teams) {
  let accessToken;
  try {
    accessToken = await getGraphAccessToken(tenantId);
  } catch (err) {
    if (isMissingConsentError(err)) {
      return { skipped: true, reason: "consent_not_granted" };
    }
    throw err;
  }

  if (!accessToken) {
    return { skipped: true, reason: "no_access_token" };
  }

  const scopeCheck = validateTokenScopes(accessToken);
  if (!scopeCheck.valid) {
    return {
      skipped: true,
      reason: "missing_scopes",
      missingScopes: scopeCheck.missingScopes,
    };
  }

  const users = await listEnabledUsers(accessToken);
  const existingByTeam = await loadExistingConversationIds(tenantId, teams);
  const needsInstallCheck = users.filter(
    (user) => user?.id && !hasConversationOnEveryTeam(user.id, existingByTeam),
  );

  const installed = [];
  for (let i = 0; i < needsInstallCheck.length; i += INSTALL_BATCH_SIZE) {
    const batch = needsInstallCheck.slice(i, i + INSTALL_BATCH_SIZE);
    const results = await Promise.all(
      batch.map((user) => checkUserInstalled(user, accessToken)),
    );
    for (const result of results) {
      if (result.installed) installed.push(result.user);
    }
  }

  let createdConversationCount = 0;
  for (const team of teams) {
    const already =
      existingByTeam.get(String(team.team_id).toLowerCase()) || new Set();
    const toSave = installed.filter(
      (user) => !already.has(String(user.id).toLowerCase()),
    );
    if (toSave.length === 0) continue;

    try {
      createdConversationCount += await saveTeamUsers(toSave, tenantId, team);
    } catch (err) {
      console.error(
        `[conversationSync] save failed tenant=${tenantId} team=${team.team_id}:`,
        err?.message || err,
      );
      processSafetyBotError(
        err,
        team.team_id,
        "",
        "",
        `Error in conversationSync save teamId=${team.team_id}`,
      );
    }
  }

  console.log(
    `[conversationSync] tenant ${tenantId}: users=${users.length}, checked=${needsInstallCheck.length}, installed=${installed.length}, created=${createdConversationCount}, teams=${teams.length}`,
  );

  return {
    skipped: false,
    usersListed: users.length,
    installChecked: needsInstallCheck.length,
    installed: installed.length,
    createdConversationCount,
  };
}

async function syncConversationIds() {
  if (!process.env.MicrosoftAppId || !process.env.MicrosoftAppPassword) {
    throw new Error(
      "MicrosoftAppId and MicrosoftAppPassword are required for conversation sync",
    );
  }

  const teams = await loadEligibleTeams();
  const byTenant = await groupTeamsByTenant(teams);
  const summary = {
    teamCount: teams.length,
    tenantCount: byTenant.size,
    skippedTenants: 0,
    failedTenants: 0,
    usersListed: 0,
    installChecked: 0,
    installed: 0,
    createdConversationCount: 0,
  };

  console.log(
    `[conversationSync] ${summary.teamCount} active trial/paid teams across ${summary.tenantCount} tenants`,
  );

  for (const [tenantId, tenantTeams] of byTenant) {
    try {
      const result = await syncTenant(tenantId, tenantTeams);
      if (result.skipped) {
        summary.skippedTenants += 1;
        console.log(
          `[conversationSync] skipped tenant ${tenantId}: ${result.reason}`,
          result.missingScopes || "",
        );
        continue;
      }
      summary.usersListed += result.usersListed || 0;
      summary.installChecked += result.installChecked || 0;
      summary.installed += result.installed || 0;
      summary.createdConversationCount += result.createdConversationCount || 0;
    } catch (err) {
      summary.failedTenants += 1;
      console.error(
        `[conversationSync] tenant ${tenantId} failed:`,
        err?.message || err,
      );
      processSafetyBotError(
        err,
        "",
        "",
        "",
        `Error in conversationSync tenantId=${tenantId}`,
      );
    }
  }

  return summary;
}

module.exports = {
  syncConversationIds,
};
