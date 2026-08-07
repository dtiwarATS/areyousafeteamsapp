const db = require("../db");
const { processSafetyBotError } = require("../models/processError");
const { sendProactiveMessaageToUser } = require("../api/apiMethods");
const { validatePhoneNumber } = require("../utils/phoneValidation");

const CONSENT_CHANNELS = ["sms", "whatsapp", "email", "voice"];
const PHONE_CONSENT_CHANNELS = ["sms", "whatsapp", "voice"];
const CONSENT_STATUS = {
  Pending: "Pending",
  OptedIn: "OptedIn",
  OptedOut: "OptedOut",
};
const CONSENT_ACTION = {
  Sent: "Sent",
  ReminderSent: "ReminderSent",
  Accepted: "Accepted",
  Declined: "Declined",
  Expired: "Expired",
  /** Hourly job: first sight while user had no phone (no send). */
  PhoneEligibleNoPhone: "PhoneEligibleNoPhone",
  /** Hourly job: first sight while user already had a phone (baseline, no send). */
  PhoneEligibleHadPhoneBaseline: "PhoneEligibleHadPhoneBaseline",
  /** Hourly job: consent card sent after phone appeared (dedupe). */
  PhoneEligibleSent: "PhoneEligibleSent",
};

/** History channel used only for phone-eligibility job markers (not a real opt-in channel). */
const PHONE_ELIGIBILITY_HISTORY_CHANNEL = "_eligibility";

const JOB_PERFORMED_BY = "consent-phone-eligible-job";


const CHANNEL_LABELS = {
  sms: "SMS",
  whatsapp: "WhatsApp",
  email: "Email",
  voice: "Voice Calls",
};

const DEFAULT_CONSENT_MESSAGE =
  "By clicking Submit, I consent to receive Safety Check notifications through the selected notification channels.";

const parsePhoneSourceFromIntegrationConfig = (raw) => {
  try {
    if (raw == null) return null;
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    const source = parsed?.phone?.source;
    if (source === "office365" || source === "spreadsheet") return source;
    return null;
  } catch {
    return null;
  }
};

/** Max concurrent Teams proactive sends for consent cards. */
const CONSENT_SEND_CONCURRENCY = 30;

/** In-memory eligibility sets from recent getConsentStats (reused by Send). */
const ELIGIBILITY_CACHE_TTL_MS = 10 * 60 * 1000;
/** @type {Map<string, { phoneEligibleIds: string[], emailEligibleIds: string[], expiresAt: number }>} */
const eligibilityCacheByTenant = new Map();

const getCachedConsentEligibility = (tenantId) => {
  const key = String(tenantId || "").trim();
  if (!key) return null;
  const entry = eligibilityCacheByTenant.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    eligibilityCacheByTenant.delete(key);
    return null;
  }
  return {
    phoneEligibleSet: new Set(entry.phoneEligibleIds || []),
    emailEligibleSet: new Set(entry.emailEligibleIds || []),
  };
};

const setCachedConsentEligibility = (
  tenantId,
  phoneEligibleSet,
  emailEligibleSet,
) => {
  const key = String(tenantId || "").trim();
  if (!key) return;
  eligibilityCacheByTenant.set(key, {
    phoneEligibleIds: Array.from(phoneEligibleSet || []),
    emailEligibleIds: Array.from(emailEligibleSet || []),
    expiresAt: Date.now() + ELIGIBILITY_CACHE_TTL_MS,
  });
};

/** Users who must never receive consent Adaptive Cards. */
const CONSENT_MESSAGE_EXCLUDED_USER_IDS = new Set([
  "5055a653-182c-4c5f-a4b0-1f5a9505910e",
]);

const isConsentMessageExcludedUser = (userId) => {
  if (!userId) return false;
  return CONSENT_MESSAGE_EXCLUDED_USER_IDS.has(String(userId).toLowerCase());
};

/**
 * Run async work over items with a fixed concurrency limit.
 * Only used by consent send — does not change shared bot helpers.
 */
const mapWithConcurrency = async (items, concurrency, worker) => {
  const results = new Array(items.length);
  let nextIndex = 0;

  const runWorker = async () => {
    while (nextIndex < items.length) {
      const current = nextIndex++;
      results[current] = await worker(items[current], current);
    }
  };

  const poolSize = Math.max(1, Math.min(concurrency, items.length || 1));
  await Promise.all(Array.from({ length: poolSize }, () => runWorker()));
  return results;
};

const escapeSql = (value) => {
  if (value == null) return "";
  return String(value).replace(/'/g, "''");
};

const normalizeChannel = (channel) => {
  if (!channel) return null;
  const c = String(channel).toLowerCase().trim();
  if (c === "voicecall" || c === "voice call" || c === "voice_calls") {
    return "voice";
  }
  return CONSENT_CHANNELS.includes(c) ? c : null;
};

const normalizeChannels = (channels) => {
  if (!Array.isArray(channels)) return [];
  const out = [];
  for (const ch of channels) {
    const n = normalizeChannel(ch);
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
};

const parseIntegrationConfig = (raw) => {
  if (raw == null) return null;
  try {
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
};

const isOptInRequired = (integrationConfig, channel) => {
  const ch = normalizeChannel(channel);
  if (!ch) return false;
  return !!integrationConfig?.channels?.[ch]?.optInRequired;
};

const getOptInRequiredChannels = (integrationConfig) => {
  if (!integrationConfig?.channels) return [];
  return CONSENT_CHANNELS.filter(
    (ch) => !!integrationConfig.channels[ch]?.optInRequired,
  );
};

/**
 * Filter user AAD object ids by consent for a channel.
 * If opt-in is not required for the channel, returns all userIds unchanged.
 */
const filterUserIdsByConsent = async (
  tenantId,
  userIds,
  channel,
  integrationConfig,
) => {
  try {
    const ch = normalizeChannel(channel);
    if (!ch || !Array.isArray(userIds) || userIds.length === 0) {
      return userIds || [];
    }
    if (!isOptInRequired(integrationConfig, ch)) {
      return userIds;
    }
    const safeTenant = escapeSql(tenantId);
    const idList = userIds
      .filter(Boolean)
      .map((id) => `N'${escapeSql(id)}'`)
      .join(",");
    if (!idList) return [];

    const qry = `
      SELECT UserId
      FROM UserNotificationConsent
      WHERE TenantId = N'${safeTenant}'
        AND NotificationChannel = N'${escapeSql(ch)}'
        AND ConsentStatus = N'${CONSENT_STATUS.OptedIn}'
        AND UserId IN (${idList})
    `;
    const rows = (await db.getDataFromDB(qry)) || [];
    const allowed = new Set(rows.map((r) => r.UserId));
    return userIds.filter((id) => allowed.has(id));
  } catch (err) {
    processSafetyBotError(err, "", "", "", "error in filterUserIdsByConsent");
    if (isOptInRequired(integrationConfig, channel)) {
      return [];
    }
    return userIds || [];
  }
};

/**
 * Filter phone/user objects that have an `id` (AAD object id) field.
 */
const filterUsersByConsent = async (
  tenantId,
  users,
  channel,
  integrationConfig,
) => {
  if (!Array.isArray(users) || users.length === 0) return users || [];
  const ids = users.map((u) => u.id || u.userAadObjId || u.user_aadobject_id);
  const allowed = await filterUserIdsByConsent(
    tenantId,
    ids,
    channel,
    integrationConfig,
  );
  const allowedSet = new Set(allowed);
  return users.filter((u) => {
    const id = u.id || u.userAadObjId || u.user_aadobject_id;
    return allowedSet.has(id);
  });
};

/**
 * Returns true if the user may receive the channel notification.
 * When opt-in is not required, always true.
 */
const userHasChannelConsent = async (
  tenantId,
  userId,
  channel,
  integrationConfig,
) => {
  if (!userId) return false;
  if (!isOptInRequired(integrationConfig, channel)) return true;
  const allowed = await filterUserIdsByConsent(
    tenantId,
    [userId],
    channel,
    integrationConfig,
  );
  return allowed.includes(userId);
};

/**
 * Resolve phone.source + installation fields used for consent phone counts.
 */
const getPhoneIntegrationContextForTenant = async (tenantId) => {
  const safeTenant = escapeSql(tenantId);
  const qry = `
    SELECT TOP 1
      INTEGRATION_CONFIGURE,
      PHONE_FIELD,
      IS_APP_PERMISSION_GRANTED,
      team_id AS teamId
    FROM MSTeamsInstallationDetails
    WHERE user_tenant_id = N'${safeTenant}'
    ORDER BY created_date asc
  `;
  const rows = (await db.getDataFromDB(qry)) || [];
  const row = rows[0] || null;
  if (!row) {
    return {
      phoneSource: null,
      phoneField: "businessPhones",
      isAppPermissionGranted: null,
      teamId: null,
      integrationConfigure: null,
    };
  }
  return {
    phoneSource: parsePhoneSourceFromIntegrationConfig(
      row.INTEGRATION_CONFIGURE,
    ),
    phoneField:
      row.PHONE_FIELD === "mobilePhone" ? "mobilePhone" : "businessPhones",
    isAppPermissionGranted: row.IS_APP_PERMISSION_GRANTED,
    teamId: row.teamId || null,
    integrationConfigure: row.INTEGRATION_CONFIGURE,
  };
};

/**
 * Consent phone denominator priority:
 * 1) spreadsheet selected → always DB imported phones (wins over O365 Integrations ON)
 * 2) else office365 selected (or legacy config without phone.key + Graph permission) → Graph
 * 3) else → 0 / null
 */
const isLegacyPhoneIntegrationConfig = (raw) => {
  try {
    if (raw == null) return false;
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Boolean(parsed && typeof parsed === "object" && !("phone" in parsed));
  } catch {
    return false;
  }
};

const resolveConsentPhoneSource = (phoneCtx) => {
  const explicit = phoneCtx?.phoneSource || null;
  if (explicit === "spreadsheet") return "spreadsheet";
  if (explicit === "office365") return "office365";
  if (
    isLegacyPhoneIntegrationConfig(phoneCtx?.integrationConfigure) &&
    phoneCtx?.isAppPermissionGranted
  ) {
    return "office365";
  }
  return null;
};

/**
 * @param {string} tenantId
 * @param {{ office365PhoneEligibleTotal?: number }} [options]
 */
const resolvePhoneEligibleTotal = async (tenantId, options = {}) => {
  const phoneCtx = await getPhoneIntegrationContextForTenant(tenantId);
  const source = resolveConsentPhoneSource(phoneCtx);
  // Spreadsheet always wins when selected — do not consult FILTER_ENABLED / office365.enabled.
  if (source === "spreadsheet") {
    return countValidSpreadsheetPhones(tenantId);
  }
  if (source === "office365") {
    return Number(options.office365PhoneEligibleTotal || 0);
  }
  return 0;
};

const getAllSpreadsheetPhoneUserIdSet = async (tenantId) => {
  const eligible = new Set();
  const safeTenant = escapeSql(tenantId);
  const qry = `
    SELECT DISTINCT
      user_aadobject_id AS userId,
      PHONE_NUMBER AS phoneNumber
    FROM MSTeamsTeamsUsers
    WHERE tenantid = N'${safeTenant}'
      AND user_aadobject_id IS NOT NULL
      AND user_aadobject_id <> ''
      AND PHONE_NUMBER IS NOT NULL
      AND LTRIM(RTRIM(PHONE_NUMBER)) <> ''
  `;
  const rows = (await db.getDataFromDB(qry)) || [];
  for (const row of rows) {
    const userId = String(row.userId || "").trim();
    if (!userId || eligible.has(userId)) continue;
    const validation = validatePhoneNumber(row.phoneNumber);
    if (!validation.valid) continue;
    eligible.add(userId);
  }
  return eligible;
};

const countValidSpreadsheetPhones = async (tenantId) => {
  const set = await getAllSpreadsheetPhoneUserIdSet(tenantId);
  return set.size;
};

/** Matches email send path: non-empty, not literal "null", basic address shape. */
const isValidEmailAddress = (email) => {
  const value = String(email || "").trim();
  if (!value || value.toLowerCase() === "null") return false;
  // Practical check aligned with delivery eligibility (local@domain).
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
};

const getAllEmailEligibleUserIdSet = async (tenantId) => {
  const eligible = new Set();
  const safeTenant = escapeSql(tenantId);
  const qry = `
    SELECT DISTINCT
      user_aadobject_id AS userId,
      email AS email
    FROM MSTeamsTeamsUsers
    WHERE tenantid = N'${safeTenant}'
      AND user_aadobject_id IS NOT NULL
      AND user_aadobject_id <> ''
      AND email IS NOT NULL
      AND LTRIM(RTRIM(email)) <> ''
  `;
  const rows = (await db.getDataFromDB(qry)) || [];
  for (const row of rows) {
    const userId = String(row.userId || "").trim();
    if (!userId || eligible.has(userId)) continue;
    if (!isValidEmailAddress(row.email)) continue;
    eligible.add(userId);
  }
  return eligible;
};

const countValidEmails = async (tenantId) => {
  const set = await getAllEmailEligibleUserIdSet(tenantId);
  return set.size;
};

/**
 * Among candidates, users with a valid email (same rules as countValidEmails).
 * @param {string} tenantId
 * @param {string[]} candidateUserIds
 * @returns {Promise<Set<string>>}
 */
const getEmailEligibleUserIdSet = async (tenantId, candidateUserIds) => {
  const eligible = new Set();
  if (!candidateUserIds?.length) return eligible;
  const safeTenant = escapeSql(tenantId);
  const idList = candidateUserIds.map((id) => `N'${escapeSql(id)}'`).join(",");
  const qry = `
    SELECT DISTINCT
      user_aadobject_id AS userId,
      email AS email
    FROM MSTeamsTeamsUsers
    WHERE tenantid = N'${safeTenant}'
      AND user_aadobject_id IN (${idList})
      AND email IS NOT NULL
      AND LTRIM(RTRIM(email)) <> ''
  `;
  const rows = (await db.getDataFromDB(qry)) || [];
  for (const row of rows) {
    const userId = String(row.userId || "").trim();
    if (!userId || eligible.has(userId)) continue;
    if (!isValidEmailAddress(row.email)) continue;
    eligible.add(userId);
  }
  return eligible;
};

/**
 * Keep only channels the user is eligible for (phone → SMS/WhatsApp/Voice, email → Email).
 */
const filterChannelsByEligibility = (
  channels,
  userId,
  phoneEligibleSet,
  emailEligibleSet,
) => {
  const id = String(userId || "").trim();
  if (!id) return [];
  return (channels || []).filter((ch) => {
    if (PHONE_CONSENT_CHANNELS.includes(ch)) {
      return phoneEligibleSet.has(id);
    }
    if (ch === "email") {
      return emailEligibleSet.has(id);
    }
    return false;
  });
};

const getAllTenantUserIds = async (tenantId) => {
  const safeTenant = escapeSql(tenantId);
  const qry = `
    SELECT DISTINCT user_aadobject_id AS userId
    FROM MSTeamsTeamsUsers
    WHERE tenantid = N'${safeTenant}'
      AND user_aadobject_id IS NOT NULL
      AND user_aadobject_id <> ''
  `;
  const rows = (await db.getDataFromDB(qry)) || [];
  return rows
    .map((r) => String(r.userId || "").trim())
    .filter(Boolean);
};

/**
 * Shared eligibility lists for consent count + send.
 * @param {string} tenantId
 * @param {{
 *   office365PhoneEligibleUserIds?: string[]|Set<string>,
 *   graphUsers?: Array,
 *   useCache?: boolean,
 *   writeCache?: boolean,
 * }} [options]
 * @returns {Promise<{ phoneEligibleSet: Set<string>, emailEligibleSet: Set<string> }>}
 */
const resolveConsentEligibility = async (tenantId, options = {}) => {
  const useCache = options.useCache === true;
  if (useCache) {
    const cached = getCachedConsentEligibility(tenantId);
    if (cached) {
      console.log("[consent eligibility] cache hit", {
        tenantId,
        phone: cached.phoneEligibleSet.size,
        email: cached.emailEligibleSet.size,
      });
      return cached;
    }
  }

  let phoneEligibleSet = new Set();
  try {
    const phoneCtx = await getPhoneIntegrationContextForTenant(tenantId);
    const source = resolveConsentPhoneSource(phoneCtx);
    if (source === "spreadsheet") {
      phoneEligibleSet = await getAllSpreadsheetPhoneUserIdSet(tenantId);
    } else if (source === "office365") {
      if (
        options.office365PhoneEligibleUserIds &&
        (Array.isArray(options.office365PhoneEligibleUserIds) ||
          options.office365PhoneEligibleUserIds instanceof Set)
      ) {
        phoneEligibleSet = new Set(
          Array.from(options.office365PhoneEligibleUserIds)
            .map((id) => String(id || "").trim())
            .filter(Boolean),
        );
      } else if (Array.isArray(options.graphUsers)) {
        phoneEligibleSet = getValidGraphPhoneUserIdSet(options.graphUsers);
      } else {
        const allIds = await getAllTenantUserIds(tenantId);
        phoneEligibleSet = await getOffice365PhoneUserIdSet(
          tenantId,
          allIds,
          phoneCtx?.isAppPermissionGranted,
        );
      }
    }
  } catch (err) {
    processSafetyBotError(
      err,
      "",
      "",
      "",
      "error resolving phone eligibility in resolveConsentEligibility",
    );
    phoneEligibleSet = new Set();
  }

  let emailEligibleSet = new Set();
  try {
    emailEligibleSet = await getAllEmailEligibleUserIdSet(tenantId);
  } catch (err) {
    processSafetyBotError(
      err,
      "",
      "",
      "",
      "error resolving email eligibility in resolveConsentEligibility",
    );
    emailEligibleSet = new Set();
  }

  if (options.writeCache !== false) {
    setCachedConsentEligibility(tenantId, phoneEligibleSet, emailEligibleSet);
    console.log("[consent eligibility] cache write", {
      tenantId,
      phone: phoneEligibleSet.size,
      email: emailEligibleSet.size,
    });
  }

  return { phoneEligibleSet, emailEligibleSet };
};

const extractGraphPhoneValue = (user, phoneField) => {
  if (!user) return "";
  if (phoneField === "mobilePhone") {
    return user.mobilePhone ? String(user.mobilePhone).trim() : "";
  }
  const business = Array.isArray(user.businessPhones)
    ? user.businessPhones
    : [];
  const first = business.find((p) => p != null && String(p).trim() !== "");
  return first ? String(first).trim() : "";
};

/** True if phone passes validatePhoneNumber or has enough digits (O365 often omits +). */
const isUsableGraphPhoneValue = (phone) => {
  if (!phone) return false;
  const validation = validatePhoneNumber(phone);
  const digitCount = String(phone).replace(/\D/g, "").length;
  return validation.valid || digitCount >= 7;
};

/**
 * Consent eligibility: user counts if either mobilePhone or businessPhones has a usable number.
 */
const userHasValidGraphPhone = (user) => {
  const mobile = extractGraphPhoneValue(user, "mobilePhone");
  const business = extractGraphPhoneValue(user, "businessPhones");
  return (
    isUsableGraphPhoneValue(mobile) || isUsableGraphPhoneValue(business)
  );
};

/**
 * Count unique Graph users with either mobilePhone or businessPhones available.
 * Accepts validatePhoneNumber-valid numbers, or non-empty Graph values with enough digits
 * (O365 often stores numbers without a + prefix).
 * @param {Array} graphUsers
 * @param {string} [_phoneField] unused — kept for call-site compatibility
 */
const getValidGraphPhoneUserIdSet = (graphUsers) => {
  const seen = new Set();
  if (!Array.isArray(graphUsers) || graphUsers.length === 0) return seen;
  for (const user of graphUsers) {
    const id = String(user?.id || "").trim();
    if (!id || seen.has(id)) continue;
    if (!userHasValidGraphPhone(user)) continue;
    seen.add(id);
  }
  return seen;
};

const countValidGraphPhones = (graphUsers, _phoneField) => {
  return getValidGraphPhoneUserIdSet(graphUsers).size;
};

/**
 * @param {string} tenantId
 * @param {{
 *   office365PhoneEligibleTotal?: number,
 *   office365PhoneEligibleUserIds?: string[]|Set<string>,
 *   graphUsers?: Array,
 * }} [options]
 */
const getConsentStats = async (tenantId, options = {}) => {
  const safeTenant = escapeSql(tenantId);

  const consentQry = `
    SELECT NotificationChannel, ConsentStatus, COUNT(*) AS cnt
    FROM UserNotificationConsent
    WHERE TenantId = N'${safeTenant}'
    GROUP BY NotificationChannel, ConsentStatus
  `;
  const consentRows = (await db.getDataFromDB(consentQry)) || [];

  let phoneEligibleTotal = 0;
  let emailEligibleTotal = 0;
  try {
    const eligibility = await resolveConsentEligibility(tenantId, {
      office365PhoneEligibleUserIds: options.office365PhoneEligibleUserIds,
      graphUsers: options.graphUsers,
      // Fresh lists for the panel; write cache so Send can reuse them.
      useCache: false,
      writeCache: true,
    });
    phoneEligibleTotal = eligibility.phoneEligibleSet.size;
    emailEligibleTotal = eligibility.emailEligibleSet.size;
    // Legacy callers that only pass a precomputed O365 total (no IDs) still work
    // when spreadsheet/empty source already resolved; if O365 and only total given:
    if (
      options.office365PhoneEligibleTotal != null &&
      !options.office365PhoneEligibleUserIds &&
      !options.graphUsers &&
      phoneEligibleTotal === 0 &&
      Number(options.office365PhoneEligibleTotal) > 0
    ) {
      phoneEligibleTotal = Number(options.office365PhoneEligibleTotal);
    }
  } catch (err) {
    processSafetyBotError(
      err,
      "",
      "",
      "",
      "error resolving eligibility in getConsentStats",
    );
    try {
      phoneEligibleTotal = await resolvePhoneEligibleTotal(tenantId, options);
    } catch (_) {
      phoneEligibleTotal = Number(options.office365PhoneEligibleTotal || 0);
    }
    try {
      emailEligibleTotal = await countValidEmails(tenantId);
    } catch (_) {
      emailEligibleTotal = 0;
    }
  }

  const stats = {};
  for (const ch of CONSENT_CHANNELS) {
    stats[ch] = {
      optedIn: 0,
      pending: 0,
      optedOut: 0,
      total: PHONE_CONSENT_CHANNELS.includes(ch)
        ? phoneEligibleTotal
        : emailEligibleTotal,
    };
  }
  for (const row of consentRows) {
    const ch = normalizeChannel(row.NotificationChannel);
    if (!ch || !stats[ch]) continue;
    const cnt = Number(row.cnt || 0);
    if (row.ConsentStatus === CONSENT_STATUS.OptedIn) stats[ch].optedIn = cnt;
    else if (row.ConsentStatus === CONSENT_STATUS.Pending)
      stats[ch].pending = cnt;
    else if (row.ConsentStatus === CONSENT_STATUS.OptedOut)
      stats[ch].optedOut = cnt;
  }
  return stats;
};

/**
 * Per-user consent list for a channel (admin popup).
 * status filter: "consented" | "no_response" | null (all)
 */
const getConsentUserList = async ({
  tenantId,
  channel,
  search = "",
  statuses = null,
  page = 1,
  pageSize = 10,
  sortBy = "status",
  sortDir = "asc",
}) => {
  const ch = normalizeChannel(channel);
  if (!tenantId || !ch) {
    return {
      users: [],
      total: 0,
      page: 1,
      pageSize,
      optedIn: 0,
      totalUsers: 0,
    };
  }

  const safeTenant = escapeSql(tenantId);
  const safeChannel = escapeSql(ch);
  const safeSearch = escapeSql(String(search || "").trim());
  const pageNum = Math.max(1, Number(page) || 1);
  const size = Math.min(100, Math.max(1, Number(pageSize) || 10));
  const offset = (pageNum - 1) * size;
  const dir = String(sortDir).toLowerCase() === "desc" ? "DESC" : "ASC";
  const orderCol = String(sortBy).toLowerCase() === "name" ? "name" : "status";

  // Normalize status filters: consented | not_consented (alias: no_response)
  let statusList = [];
  if (Array.isArray(statuses)) {
    statusList = statuses;
  } else if (typeof statuses === "string" && statuses.trim()) {
    statusList = statuses
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  statusList = statusList
    .map((s) => {
      const v = String(s).toLowerCase();
      if (v === "no_response" || v === "not_consented") return "not_consented";
      if (v === "consented") return "consented";
      return null;
    })
    .filter(Boolean);
  const wantConsented = statusList.includes("consented");
  const wantNotConsented = statusList.includes("not_consented");
  // Both or neither => no status filter (show all)
  const filterByStatus =
    (wantConsented || wantNotConsented) && !(wantConsented && wantNotConsented);

  let whereExtra = "";
  if (safeSearch) {
    whereExtra += `
      AND ISNULL(u.user_name, '') LIKE N'%${safeSearch}%'`;
  }
  if (filterByStatus && wantConsented) {
    whereExtra += ` AND c.ConsentStatus = N'${CONSENT_STATUS.OptedIn}'`;
  } else if (filterByStatus && wantNotConsented) {
    whereExtra += ` AND (c.ConsentStatus IS NULL OR c.ConsentStatus <> N'${CONSENT_STATUS.OptedIn}')`;
  }

  const orderBySql =
    orderCol === "name"
      ? `UserName ${dir}`
      : `CASE WHEN ConsentStatus = N'${CONSENT_STATUS.OptedIn}' THEN 0 ELSE 1 END ${dir}, UserName ASC`;

  const baseCte = `
    WITH DistinctUsers AS (
      SELECT
        u.user_aadobject_id AS UserId,
        MAX(u.user_name) AS UserName,
        MAX(c.ConsentStatus) AS ConsentStatus
      FROM MSTeamsTeamsUsers u
      LEFT JOIN UserNotificationConsent c
        ON c.TenantId = u.tenantid
       AND c.UserId = u.user_aadobject_id
       AND c.NotificationChannel = N'${safeChannel}'
      WHERE u.tenantid = N'${safeTenant}'
        AND u.user_aadobject_id IS NOT NULL
        AND u.user_aadobject_id <> ''
        ${whereExtra}
      GROUP BY u.user_aadobject_id
    )
  `;

  const countQry = `
    ${baseCte}
    SELECT COUNT(*) AS total FROM DistinctUsers
  `;
  const countRows = (await db.getDataFromDB(countQry)) || [];
  const total = Number(countRows[0]?.total || 0);

  const listQry = `
    ${baseCte}
    SELECT UserId, UserName, ConsentStatus
    FROM DistinctUsers
    ORDER BY ${orderBySql}
    OFFSET ${offset} ROWS FETCH NEXT ${size} ROWS ONLY
  `;
  const rows = (await db.getDataFromDB(listQry)) || [];

  const stats = await getConsentStats(tenantId);
  const channelStats = stats[ch] || { optedIn: 0, total: 0 };

  return {
    users: rows.map((r) => ({
      userId: r.UserId,
      userName: r.UserName || "",
      status:
        r.ConsentStatus === CONSENT_STATUS.OptedIn
          ? "consented"
          : "not_consented",
    })),
    total,
    page: pageNum,
    pageSize: size,
    optedIn: channelStats.optedIn,
    totalUsers: channelStats.total,
  };
};

const getExistingConsentMap = async (tenantId, userIds, channels) => {
  const map = new Map();
  if (!userIds?.length || !channels?.length) return map;
  const safeTenant = escapeSql(tenantId);
  const idList = userIds.map((id) => `N'${escapeSql(id)}'`).join(",");
  const chList = channels.map((ch) => `N'${escapeSql(ch)}'`).join(",");
  const qry = `
    SELECT UserId, NotificationChannel, ConsentStatus
    FROM UserNotificationConsent
    WHERE TenantId = N'${safeTenant}'
      AND UserId IN (${idList})
      AND NotificationChannel IN (${chList})
  `;
  const rows = (await db.getDataFromDB(qry)) || [];
  for (const row of rows) {
    map.set(`${row.UserId}|${row.NotificationChannel}`, row.ConsentStatus);
  }
  return map;
};

const insertHistory = async ({
  tenantId,
  userId,
  channel,
  action,
  teamsMessageId = null,
  conversationId = null,
  performedBy = null,
}) => {
  const qry = `
    INSERT INTO UserNotificationConsentHistory
      (TenantId, UserId, NotificationChannel, Action, TeamsMessageId, ConversationId, ActionDate, PerformedBy)
    VALUES (
      N'${escapeSql(tenantId)}',
      N'${escapeSql(userId)}',
      N'${escapeSql(channel)}',
      N'${escapeSql(action)}',
      ${teamsMessageId != null ? `N'${escapeSql(teamsMessageId)}'` : "NULL"},
      ${conversationId != null ? `N'${escapeSql(conversationId)}'` : "NULL"},
      SYSUTCDATETIME(),
      ${performedBy != null ? `N'${escapeSql(performedBy)}'` : "NULL"}
    )
  `;
  await db.getDataFromDB(qry);
};

const upsertConsentStatus = async ({
  tenantId,
  userId,
  channel,
  status,
  setConsentDate = false,
}) => {
  const safeTenant = escapeSql(tenantId);
  const safeUser = escapeSql(userId);
  const safeChannel = escapeSql(channel);
  const safeStatus = escapeSql(status);

  const qry = `
    MERGE UserNotificationConsent AS target
    USING (
      SELECT
        N'${safeTenant}' AS TenantId,
        N'${safeUser}' AS UserId,
        N'${safeChannel}' AS NotificationChannel
    ) AS source
    ON target.TenantId = source.TenantId
      AND target.UserId = source.UserId
      AND target.NotificationChannel = source.NotificationChannel
    WHEN MATCHED THEN
      UPDATE SET
        ConsentStatus = N'${safeStatus}',
        ConsentDate = ${setConsentDate ? "SYSUTCDATETIME()" : "target.ConsentDate"
    },
        LastUpdatedDate = SYSUTCDATETIME()
    WHEN NOT MATCHED THEN
      INSERT (TenantId, UserId, NotificationChannel, ConsentStatus, ConsentDate, CreatedDate, LastUpdatedDate)
      VALUES (
        source.TenantId,
        source.UserId,
        source.NotificationChannel,
        N'${safeStatus}',
        ${setConsentDate ? "SYSUTCDATETIME()" : "NULL"},
        SYSUTCDATETIME(),
        SYSUTCDATETIME()
      );
  `;
  await db.getDataFromDB(qry);
};

const getUsersNeedingConsent = async (tenantId, channels) => {
  const chs = normalizeChannels(channels);
  if (!chs.length) return [];
  const safeTenant = escapeSql(tenantId);
  const valuesList = chs.map((ch) => `(N'${escapeSql(ch)}')`).join(",");

  // One row per AAD user even when MSTeamsTeamsUsers has multiple team rows.
  // Prefer a row that already has conversationId.
  const qry = `
    SELECT UserId, UserName, TeamsUserId, ConversationId
    FROM (
      SELECT
        u.user_aadobject_id AS UserId,
        u.user_name AS UserName,
        u.user_id AS TeamsUserId,
        u.conversationId AS ConversationId,
        ROW_NUMBER() OVER (
          PARTITION BY u.user_aadobject_id
          ORDER BY
            CASE
              WHEN u.conversationId IS NOT NULL
                AND LTRIM(RTRIM(u.conversationId)) <> ''
                AND u.conversationId <> 'null'
              THEN 0 ELSE 1
            END,
            u.id DESC
        ) AS rn
      FROM MSTeamsTeamsUsers u
      WHERE u.tenantid = N'${safeTenant}'
        AND u.user_aadobject_id IS NOT NULL
        AND u.user_aadobject_id <> ''
        AND EXISTS (
          SELECT 1
          FROM (VALUES ${valuesList}) AS req(Channel)
          WHERE NOT EXISTS (
            SELECT 1
            FROM UserNotificationConsent c
            WHERE c.TenantId = N'${safeTenant}'
              AND c.UserId = u.user_aadobject_id
              AND c.NotificationChannel = req.Channel
              AND c.ConsentStatus = N'${CONSENT_STATUS.OptedIn}'
          )
        )
    ) ranked
    WHERE ranked.rn = 1
  `;
  const rows = (await db.getDataFromDB(qry)) || [];
  return rows;
};

/**
 * Load conversationId / teams ids for specific AAD users.
 */
const getUserConversationDetails = async (tenantId, userIds) => {
  const map = new Map();
  if (!userIds?.length) return map;
  const safeTenant = escapeSql(tenantId);
  const idList = userIds.map((id) => `N'${escapeSql(id)}'`).join(",");
  const qry = `
    SELECT
      user_aadobject_id AS UserId,
      user_name AS UserName,
      user_id AS TeamsUserId,
      conversationId AS ConversationId
    FROM MSTeamsTeamsUsers
    WHERE tenantid = N'${safeTenant}'
      AND user_aadobject_id IN (${idList})
  `;
  const rows = (await db.getDataFromDB(qry)) || [];
  for (const row of rows) {
    const existing = map.get(row.UserId);
    const rowHasId =
      row.ConversationId &&
      row.ConversationId !== "null" &&
      String(row.ConversationId).trim() !== "";
    const existingHasId =
      existing?.ConversationId &&
      existing.ConversationId !== "null" &&
      String(existing.ConversationId).trim() !== "";
    if (!existing || (!existingHasId && rowHasId)) {
      map.set(row.UserId, row);
    }
  }
  return map;
};

/**
 * Normalize UI / caller recipient objects into the shape used for proactive send.
 * Accepts camelCase (UI) or already-normalized UserId fields.
 * Returns [] when input is missing/empty so callers can fall back.
 */
const normalizeRecipientObjects = (users) => {
  if (!Array.isArray(users) || !users.length) return [];
  const recipients = [];
  for (const u of users) {
    if (!u || typeof u !== "object") continue;
    const userId = String(
      u.UserId || u.userId || u.userAadObjId || u.user_aadobject_id || "",
    ).trim();
    if (!userId) continue;
    recipients.push({
      UserId: userId,
      UserName: String(
        u.UserName || u.userName || u.title || u.user_name || "",
      ).trim(),
      TeamsUserId: String(
        u.TeamsUserId || u.teamsUserId || u.value || u.user_id || userId,
      ).trim(),
      ConversationId: normalizeStoredConversationId(
        u.ConversationId || u.conversationId,
      ),
    });
  }
  return recipients;
};

const normalizeStoredConversationId = (value) => {
  if (value == null) return null;
  const id = String(value).trim();
  if (!id || id === "null") return null;
  return id;
};

/**
 * One Adaptive Card per AAD user. Same person can have multiple
 * MSTeamsTeamsUsers rows (multi-team) — DISTINCT on all columns still
 * returns duplicates and caused double notifications.
 * MSTeamsTeamsUsers rows (multi-team).
 */
const dedupeRecipientsByUserId = (recipients) => {
  const map = new Map();
  for (const r of recipients || []) {
    const userId = r.UserId || r.user_aadobject_id;
    if (!userId) continue;
    const existing = map.get(userId);
    const rowHasId = !!normalizeStoredConversationId(r.ConversationId);
    const existingHasId = !!normalizeStoredConversationId(
      existing?.ConversationId,
    );
    if (!existing || (!existingHasId && rowHasId)) {
      map.set(userId, {
        UserId: userId,
        UserName: r.UserName || r.user_name || existing?.UserName || "",
        TeamsUserId:
          r.TeamsUserId || r.user_id || existing?.TeamsUserId || userId,
        ConversationId:
          normalizeStoredConversationId(r.ConversationId) ||
          existing?.ConversationId ||
          null,
      });
    }
  }
  return Array.from(map.values());
};

const persistConversationId = async (userId, conversationId) => {
  const id = normalizeStoredConversationId(conversationId);
  if (!userId || !id) return;
  const qry = `
    UPDATE MSTeamsTeamsUsers
    SET conversationId = N'${escapeSql(id)}'
    WHERE user_aadobject_id = N'${escapeSql(userId)}'
      AND (conversationId IS NULL OR conversationId = '' OR conversationId = 'null')
  `;
  await db.getDataFromDB(qry);
};

const getUserConsentForChannels = async (tenantId, userId, channels) => {
  const chs = normalizeChannels(channels);
  if (!chs.length) return {};
  const map = await getExistingConsentMap(tenantId, [userId], chs);
  const result = {};
  for (const ch of chs) {
    result[ch] = map.get(`${userId}|${ch}`) || null;
  }
  return result;
};

const buildConsentAdaptiveCard = ({
  message,
  channelsRequested,
  existingConsent = {},
  tenantId,
  teamId = null,
}) => {
  const chs = normalizeChannels(channelsRequested);
  const cardMessage =
    message && String(message).trim()
      ? String(message).trim()
      : DEFAULT_CONSENT_MESSAGE;

  const raw = cardMessage;
  const paragraphs = raw
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const body = [];
  if (paragraphs.length >= 2) {
    body.push({
      type: "TextBlock",
      text: paragraphs[0],
      weight: "Bolder",
      wrap: true,
      size: "Medium",
    });
    body.push({
      type: "TextBlock",
      text: paragraphs.slice(1).join("\n\n"),
      wrap: true,
      spacing: "Small",
    });
  } else {
    // Single-paragraph messages (including the FCC default) render as one primary block.
    body.push({
      type: "TextBlock",
      text: paragraphs[0] || DEFAULT_CONSENT_MESSAGE,
      wrap: true,
      size: "Medium",
    });
  }

  // Preserve channelsRequested order: OptedIn locked with green label; others selectable.
  // Teams ignores isEnabled on Input.ChoiceSet, so consented rows use TextBlocks only (read-only).
  // Use the same ColumnSet shape for every row so checkboxes/labels stay aligned.
  // Selectable channels start checked (value = channel id); users may deselect before Submit.
  for (const ch of chs) {
    const optedIn = existingConsent[ch] === CONSENT_STATUS.OptedIn;
    if (optedIn) {
      body.push({
        type: "ColumnSet",
        spacing: "Small",
        columns: [
          {
            type: "Column",
            width: "stretch",
            verticalContentAlignment: "Center",
            items: [
              {
                type: "TextBlock",
                text: `☑  ${CHANNEL_LABELS[ch]}`,
                wrap: true,
                spacing: "None",
              },
            ],
          },
          {
            type: "Column",
            width: "110px",
            verticalContentAlignment: "Center",
            items: [
              {
                type: "TextBlock",
                text: "✓ Consented",
                color: "Good",
                wrap: false,
                horizontalAlignment: "Right",
                spacing: "None",
              },
            ],
          },
        ],
      });
    } else {
      body.push({
        type: "ColumnSet",
        spacing: "Small",
        columns: [
          {
            type: "Column",
            width: "stretch",
            verticalContentAlignment: "Center",
            items: [
              {
                type: "Input.ChoiceSet",
                id: `selectedChannel_${ch}`,
                style: "expanded",
                isMultiSelect: true,
                spacing: "None",
                value: ch,
                choices: [{ title: CHANNEL_LABELS[ch], value: ch }],
              },
            ],
          },
          {
            type: "Column",
            width: "110px",
            verticalContentAlignment: "Center",
            items: [
              {
                type: "TextBlock",
                text: " ",
                wrap: false,
                spacing: "None",
              },
            ],
          },
        ],
      });
    }
  }

  body.push({
    type: "ActionSet",
    spacing: "Medium",
    actions: [
      {
        type: "Action.Execute",
        title: "Submit",
        verb: "submit_notification_consent",
        data: {
          verb: "submit_notification_consent",
          tenantId,
          teamId,
          channelsRequested: chs,
          message: cardMessage,
        },
      },
    ],
  });

  return {
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    type: "AdaptiveCard",
    version: "1.4",
    appId: process.env.MicrosoftAppId,
    body,
  };
};

const markConsentRequestSent = async ({
  tenantId,
  userId,
  channels,
  performedBy,
  teamsMessageId = null,
  conversationId = null,
  existingStatusMap = null,
}) => {
  const chs = normalizeChannels(channels);
  const statusMap =
    existingStatusMap || (await getExistingConsentMap(tenantId, [userId], chs));

  await Promise.all(
    chs.map(async (ch) => {
      const current = statusMap.get(`${userId}|${ch}`);
      if (current === CONSENT_STATUS.OptedIn) {
        return;
      }
      const isReminder =
        current === CONSENT_STATUS.Pending ||
        current === CONSENT_STATUS.OptedOut;
      await upsertConsentStatus({
        tenantId,
        userId,
        channel: ch,
        status: CONSENT_STATUS.Pending,
        setConsentDate: false,
      });
      await insertHistory({
        tenantId,
        userId,
        channel: ch,
        action: isReminder ? CONSENT_ACTION.ReminderSent : CONSENT_ACTION.Sent,
        teamsMessageId,
        conversationId,
        performedBy,
      });
    }),
  );
};

/**
 * Additive-only: mark newly selected channels as OptedIn.
 * Does not opt out or overwrite previously saved selections.
 * @returns {string[]} channels that were newly saved as OptedIn
 */
const recordConsentResponse = async ({
  tenantId,
  userId,
  selectedChannels,
  performedBy = null,
  existingConsent = null,
}) => {
  const selected = normalizeChannels(selectedChannels);
  if (!selected.length) return [];

  let consentMap = existingConsent;
  if (!consentMap) {
    consentMap = await getUserConsentForChannels(tenantId, userId, selected);
  }

  const newlySaved = [];
  for (const ch of selected) {
    if (consentMap[ch] === CONSENT_STATUS.OptedIn) {
      continue;
    }
    await upsertConsentStatus({
      tenantId,
      userId,
      channel: ch,
      status: CONSENT_STATUS.OptedIn,
      setConsentDate: true,
    });
    await insertHistory({
      tenantId,
      userId,
      channel: ch,
      action: CONSENT_ACTION.Accepted,
      performedBy: performedBy || userId,
    });
    newlySaved.push(ch);
  }
  return newlySaved;
};

const updateIntegrationOptInFlags = async (
  teamId,
  selectedChannels,
  message,
) => {
  const safeTeamId = escapeSql(teamId);
  const companyRows =
    (await db.getDataFromDB(
      `SELECT INTEGRATION_CONFIGURE FROM MSTeamsInstallationDetails WHERE team_id = N'${safeTeamId}'`,
    )) || [];
  if (!companyRows.length) return null;

  let config = parseIntegrationConfig(companyRows[0].INTEGRATION_CONFIGURE);
  if (!config || typeof config !== "object") {
    config = { office365: { enabled: false }, channels: {} };
  }
  if (!config.channels) config.channels = {};

  const selected = new Set(normalizeChannels(selectedChannels));
  for (const ch of CONSENT_CHANNELS) {
    if (!config.channels[ch]) {
      config.channels[ch] = {
        enabled: false,
        events: { incident: false, sos: false, incidentFollowUp: false },
      };
    }
    config.channels[ch].optInRequired = selected.has(ch);
  }
  if (message != null) {
    config.userConsent = {
      ...(config.userConsent || {}),
      message: String(message),
    };
  }

  const json = escapeSql(JSON.stringify(config));
  await db.getDataFromDB(
    `UPDATE MSTeamsInstallationDetails
     SET INTEGRATION_CONFIGURE = N'${json}'
     WHERE team_id = N'${safeTeamId}'`,
  );
  return config;
};

/**
 * Send consent Adaptive Cards to users needing consent for the selected channels.
 * Per user, only eligible channels are requested:
 * - SMS / WhatsApp / Voice → user must have a usable phone (O365 or spreadsheet)
 * - Email → user must have a valid email
 * Users without a phone still get a PhoneEligibleNoPhone history marker when phone
 * channels are selected, so the hourly job can send once a phone appears later.
 */
const sendConsentRequests = async ({
  tenantId,
  teamId,
  channels,
  message,
  performedBy,
  userIds = null,
  users = null,
  persistOptInFlags = true,
  companyData = null,
}) => {
  const chs = normalizeChannels(channels);
  if (!chs.length) {
    return { sent: 0, skipped: 0, error: "No channels selected" };
  }

  let integrationConfig = null;
  if (persistOptInFlags && teamId) {
    integrationConfig = await updateIntegrationOptInFlags(
      teamId,
      chs,
      message ?? DEFAULT_CONSENT_MESSAGE,
    );
  }

  let company = companyData;
  if (!company && teamId) {
    const incidentService = require("./incidentService");
    company = await incidentService.getCompanyData(teamId);
  }
  if (!company?.serviceUrl) {
    return { sent: 0, skipped: 0, error: "Company serviceUrl not found" };
  }

  const effectiveTenant =
    tenantId || company.userTenantId || company.user_tenant_id;
  if (!effectiveTenant) {
    return { sent: 0, skipped: 0, error: "TenantId not found" };
  }

  // Recipients: prefer UI objects (skip DB) → bare userIds (DB lookup) → needing consent.
  let recipients;
  const fromUi = normalizeRecipientObjects(users);
  if (fromUi.length > 0) {
    recipients = fromUi;
  } else if (Array.isArray(userIds) && userIds.length > 0) {
    const detailsMap = await getUserConversationDetails(
      effectiveTenant,
      userIds,
    );
    recipients = userIds.map((id) => {
      const details = detailsMap.get(id);
      return {
        UserId: id,
        UserName: details?.UserName || "",
        TeamsUserId: details?.TeamsUserId || id,
        ConversationId: details?.ConversationId || null,
      };
    });
  } else {
    recipients = await getUsersNeedingConsent(effectiveTenant, chs);
  }

  recipients = dedupeRecipientsByUserId(
    (recipients || []).filter((r) => {
      const id = r.UserId || r.user_aadobject_id;
      return !isConsentMessageExcludedUser(id);
    }),
  );

  if (!recipients.length) {
    return { sent: 0, skipped: 0, message: "No users need consent" };
  }

  // Fill missing conversationIds from DB so Send can reuse chats (UI often omits them).
  const missingConvUserIds = recipients
    .filter((r) => !normalizeStoredConversationId(r.ConversationId))
    .map((r) => r.UserId || r.user_aadobject_id)
    .filter(Boolean);
  if (missingConvUserIds.length) {
    try {
      const detailsMap = await getUserConversationDetails(
        effectiveTenant,
        missingConvUserIds,
      );
      recipients = recipients.map((r) => {
        const userId = r.UserId || r.user_aadobject_id;
        if (normalizeStoredConversationId(r.ConversationId)) return r;
        const details = detailsMap.get(userId);
        if (!details) return r;
        return {
          ...r,
          UserName: r.UserName || details.UserName || "",
          TeamsUserId: r.TeamsUserId || details.TeamsUserId || userId,
          ConversationId: normalizeStoredConversationId(details.ConversationId),
        };
      });
    } catch (convErr) {
      console.log(
        "Consent send: failed to fill conversationIds from DB",
        convErr?.message || convErr,
      );
    }
  }

  const recipientIds = recipients.map((r) => r.UserId || r.user_aadobject_id);
  const needsPhoneEligibility = chs.some((ch) =>
    PHONE_CONSENT_CHANNELS.includes(ch),
  );
  const needsEmailEligibility = chs.includes("email");

  let phoneEligibleSet = new Set();
  let emailEligibleSet = new Set();
  try {
    // Prefer sets from a recent getConsentStats (same who-list as the UI counts).
    const eligibility = await resolveConsentEligibility(effectiveTenant, {
      useCache: true,
      writeCache: true,
    });
    phoneEligibleSet = needsPhoneEligibility
      ? eligibility.phoneEligibleSet
      : new Set();
    emailEligibleSet = needsEmailEligibility
      ? eligibility.emailEligibleSet
      : new Set();
  } catch (eligErr) {
    processSafetyBotError(
      eligErr,
      teamId || "",
      "",
      "",
      "error resolving channel eligibility for consent send",
    );
  }

  // Phone channels selected but user has no phone yet: baseline for hourly job
  // (send only when a phone appears later). Do not create Pending phone rows.
  if (needsPhoneEligibility) {
    try {
      const noPhoneIds = recipientIds
        .map((id) => String(id || "").trim())
        .filter((id) => id && !phoneEligibleSet.has(id));
      if (noPhoneIds.length) {
        const markers = await loadPhoneEligibilityHistoryMarkers(
          effectiveTenant,
          noPhoneIds,
        );
        const toMark = [];
        for (const userId of noPhoneIds) {
          const m = markers.get(userId);
          if (m?.noPhone || m?.hadPhoneBaseline || m?.sent) continue;
          toMark.push(userId);
        }
        if (toMark.length) {
          await recordPhoneEligibilityMarkersBulk(
            effectiveTenant,
            toMark,
            CONSENT_ACTION.PhoneEligibleNoPhone,
          );
        }
      }
    } catch (markerErr) {
      processSafetyBotError(
        markerErr,
        teamId || "",
        "",
        "",
        "error recording phone-eligibility NoPhone markers on consent send",
      );
    }
  }

  // Attach per-user eligible channels; drop users with none.
  recipients = recipients
    .map((r) => {
      const userId = r.UserId || r.user_aadobject_id;
      const channelsForUser = filterChannelsByEligibility(
        chs,
        userId,
        phoneEligibleSet,
        emailEligibleSet,
      );
      return { ...r, channelsForUser };
    })
    .filter((r) => (r.channelsForUser || []).length > 0);

  if (!recipients.length) {
    return {
      sent: 0,
      skipped: 0,
      message: "No eligible users need consent for the selected channels",
    };
  }

  const eligibleRecipientIds = recipients.map(
    (r) => r.UserId || r.user_aadobject_id,
  );
  const statusMap = await getExistingConsentMap(
    effectiveTenant,
    eligibleRecipientIds,
    chs,
  );

  const cardMessage =
    message ||
    integrationConfig?.userConsent?.message ||
    DEFAULT_CONSENT_MESSAGE;

  let sent = 0;
  let skipped = 0;

  // One ConnectorClient for the whole batch (avoids recreating credentials per user).
  let batchConnectorClient = null;
  try {
    const {
      ConnectorClient,
      MicrosoftAppCredentials,
    } = require("botframework-connector");
    const credentials = new MicrosoftAppCredentials(
      process.env.MicrosoftAppId,
      process.env.MicrosoftAppPassword,
    );
    batchConnectorClient = new ConnectorClient(credentials, {
      baseUri: company.serviceUrl,
    });
  } catch (clientErr) {
    console.log(
      "Consent send: failed to create shared ConnectorClient, falling back per-user",
      clientErr?.message || clientErr,
    );
  }

  const outcomes = await mapWithConcurrency(
    recipients,
    CONSENT_SEND_CONCURRENCY,
    async (recipient) => {
      const userId = recipient.UserId || recipient.user_aadobject_id;
      if (!userId || isConsentMessageExcludedUser(userId)) {
        return "skipped";
      }

      const channelsForUser = normalizeChannels(
        recipient.channelsForUser || chs,
      );
      if (!channelsForUser.length) {
        return "skipped";
      }

      const existingConsent = {};
      for (const ch of channelsForUser) {
        existingConsent[ch] = statusMap.get(`${userId}|${ch}`) || null;
      }

      // Skip OptedIn and already-Pending (Send is not a resend).
      const channelsToSend = channelsForUser.filter((ch) => {
        const status = existingConsent[ch];
        return (
          status !== CONSENT_STATUS.OptedIn &&
          status !== CONSENT_STATUS.Pending
        );
      });
      if (!channelsToSend.length) {
        return "skipped";
      }

      const card = buildConsentAdaptiveCard({
        message: cardMessage,
        channelsRequested: channelsToSend,
        existingConsent,
        tenantId: effectiveTenant,
        teamId,
      });

      try {
        const member = {
          id: recipient.TeamsUserId || userId,
          aadObjectId: userId,
          name: recipient.UserName || "",
        };

        // Use stored conversationId when present; null → createConversation inside helper
        const existingConversationId = normalizeStoredConversationId(
          recipient.ConversationId,
        );

        const resp = await sendProactiveMessaageToUser(
          [member],
          card,
          null,
          company.serviceUrl,
          effectiveTenant,
          null,
          userId,
          existingConversationId,
          batchConnectorClient,
          null,
        );

        // Wrong/expired conversationId or send failure → skip this user, continue others
        const sendFailed =
          !!resp?.error ||
          !resp?.activityId ||
          (resp?.status != null && Number(resp.status) >= 400);

        if (sendFailed) {
          console.log(
            `Consent send skipped for user ${userId}: status=${resp?.status}, error=${resp?.error || "no activityId"}`,
          );
          return "skipped";
        }

        // Persist newly created conversationId for next sends
        if (
          !existingConversationId &&
          normalizeStoredConversationId(resp?.conversationId)
        ) {
          await persistConversationId(userId, resp.conversationId);
        }

        await markConsentRequestSent({
          tenantId: effectiveTenant,
          userId,
          channels: channelsToSend,
          performedBy: performedBy || "admin",
          teamsMessageId: resp?.activityId || null,
          conversationId:
            resp?.conversationId || existingConversationId || null,
          existingStatusMap: statusMap,
        });
        return "sent";
      } catch (err) {
        // Any unexpected error: skip this user and continue with next
        console.log(
          `Consent send skipped for user ${userId}:`,
          err?.message || err,
        );
        processSafetyBotError(
          err,
          teamId || "",
          "",
          userId,
          "error sending consent Adaptive Card",
        );
        return "skipped";
      }
    },
  );

  for (const outcome of outcomes) {
    if (outcome === "sent") sent++;
    else skipped++;
  }

  const sentUserIds = [];
  for (let i = 0; i < outcomes.length; i++) {
    if (outcomes[i] !== "sent") continue;
    const id =
      recipients[i]?.UserId || recipients[i]?.user_aadobject_id || null;
    if (id) sentUserIds.push(String(id));
  }

  return { sent, skipped, channels: chs, sentUserIds };
};

/**
 * Fetch Graph users' phones for the given AAD ids (batches of 14).
 * @returns {Promise<Array>} Graph user objects with id, businessPhones, mobilePhone
 */
const fetchGraphUsersPhones = async (tenantId, arrIds) => {
  const phone = [];
  if (!tenantId || !Array.isArray(arrIds) || !arrIds.length) return phone;

  const axios = require("axios");
  const FormData = require("form-data");
  const data = new FormData();
  data.append("grant_type", "client_credentials");
  data.append("client_Id", process.env.MicrosoftAppId);
  data.append("client_secret", process.env.MicrosoftAppPassword);
  data.append("scope", "https://graph.microsoft.com/.default");

  const tokenResp = await axios.request({
    method: "post",
    maxBodyLength: Infinity,
    url: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    data,
  });

  const scopeStr = tokenResp.data?.scope || "";
  if (scopeStr.indexOf("User.Read.All") === -1) {
    throw {
      type: "NoPhonePermission",
      message: "No phone permission granted",
    };
  }

  const accessToken = tokenResp.data.access_token;
  const GRAPH_PHONE_BATCH_SIZE = 14;
  const GRAPH_PHONE_CONCURRENCY = 8;
  const batches = [];
  for (let i = 0; i < arrIds.length; i += GRAPH_PHONE_BATCH_SIZE) {
    batches.push(arrIds.slice(i, i + GRAPH_PHONE_BATCH_SIZE));
  }

  const fetchBatch = async (slice) => {
    if (!slice.length) return [];
    const userIds = "'" + slice.join("','") + "'";
    const listResp = await axios.request({
      method: "get",
      maxBodyLength: Infinity,
      url:
        "https://graph.microsoft.com/v1.0/users?$select=displayName,id,businessPhones,mobilePhone" +
        "&$filter=id in (" +
        userIds +
        ")",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + accessToken,
      },
    });
    return Array.isArray(listResp.data?.value) ? listResp.data.value : [];
  };

  let nextBatch = 0;
  const workers = Array.from(
    {
      length: Math.max(
        1,
        Math.min(GRAPH_PHONE_CONCURRENCY, batches.length || 1),
      ),
    },
    async () => {
      while (nextBatch < batches.length) {
        const index = nextBatch++;
        const users = await fetchBatch(batches[index]);
        if (users.length) phone.push(...users);
      }
    },
  );
  await Promise.all(workers);
  return phone;
};

/** Spreadsheet: set of user ids among candidates who currently have a valid phone. */
const getSpreadsheetPhoneUserIdSet = async (tenantId, candidateUserIds) => {
  const withPhone = new Set();
  if (!candidateUserIds?.length) return withPhone;
  const safeTenant = escapeSql(tenantId);
  const idList = candidateUserIds.map((id) => `N'${escapeSql(id)}'`).join(",");
  const qry = `
    SELECT DISTINCT
      user_aadobject_id AS userId,
      PHONE_NUMBER AS phoneNumber
    FROM MSTeamsTeamsUsers
    WHERE tenantid = N'${safeTenant}'
      AND user_aadobject_id IN (${idList})
      AND PHONE_NUMBER IS NOT NULL
      AND LTRIM(RTRIM(PHONE_NUMBER)) <> ''
  `;
  const rows = (await db.getDataFromDB(qry)) || [];
  for (const row of rows) {
    const userId = String(row.userId || "").trim();
    if (!userId) continue;
    const validation = validatePhoneNumber(row.phoneNumber);
    if (validation.valid) withPhone.add(userId);
  }
  return withPhone;
};

/** O365: set of candidate user ids who currently have a usable Graph phone. */
const getOffice365PhoneUserIdSet = async (tenantId, candidateUserIds, isAppPermissionGranted) => {
  const withPhone = new Set();
  if (!candidateUserIds?.length || !isAppPermissionGranted) return withPhone;
  try {
    const graphUsers = await fetchGraphUsersPhones(tenantId, candidateUserIds);
    for (const user of graphUsers || []) {
      const id = String(user?.id || "").trim();
      if (!id || !userHasValidGraphPhone(user)) continue;
      withPhone.add(id);
    }
  } catch (err) {
    const isNoPhonePermission =
      err?.type === "NoPhonePermission" ||
      err?.message === "No phone permission granted";
    console.log(
      "getOffice365PhoneUserIdSet failed:",
      err?.message || err?.type || err,
    );
    // Expected when tenant has not granted User.Read.All — do not email.
    if (!isNoPhonePermission) {
      processSafetyBotError(
        err,
        "",
        "",
        "",
        "error fetching Graph phones for consent phone-eligible job",
      );
    }
  }
  return withPhone;
};

/**
 * Resolve which candidate users currently have a usable phone (spreadsheet or O365).
 * @param {string} tenantId
 * @param {string[]} candidateUserIds
 * @returns {Promise<Set<string>>}
 */
const resolvePhoneEligibleUserIdSet = async (tenantId, candidateUserIds) => {
  const empty = new Set();
  if (!candidateUserIds?.length) return empty;
  try {
    const phoneCtx = await getPhoneIntegrationContextForTenant(tenantId);
    const source = resolveConsentPhoneSource(phoneCtx);
    if (source === "spreadsheet") {
      return getSpreadsheetPhoneUserIdSet(tenantId, candidateUserIds);
    }
    if (source === "office365") {
      return getOffice365PhoneUserIdSet(
        tenantId,
        candidateUserIds,
        phoneCtx?.isAppPermissionGranted,
      );
    }
  } catch (err) {
    processSafetyBotError(
      err,
      "",
      "",
      "",
      "error resolving phone-eligible user set for consent send",
    );
  }
  return empty;
};

const loadPhoneEligibilityHistoryMarkers = async (tenantId, userIds) => {
  const map = new Map(); // userId -> { noPhone, hadPhoneBaseline, sent }
  if (!userIds?.length) return map;
  const safeTenant = escapeSql(tenantId);
  const idList = userIds.map((id) => `N'${escapeSql(id)}'`).join(",");
  const qry = `
    SELECT UserId, Action
    FROM UserNotificationConsentHistory
    WHERE TenantId = N'${safeTenant}'
      AND UserId IN (${idList})
      AND NotificationChannel = N'${escapeSql(PHONE_ELIGIBILITY_HISTORY_CHANNEL)}'
      AND Action IN (
        N'${CONSENT_ACTION.PhoneEligibleNoPhone}',
        N'${CONSENT_ACTION.PhoneEligibleHadPhoneBaseline}',
        N'${CONSENT_ACTION.PhoneEligibleSent}'
      )
  `;
  const rows = (await db.getDataFromDB(qry)) || [];
  for (const row of rows) {
    const userId = String(row.UserId || "").trim();
    if (!userId) continue;
    const entry = map.get(userId) || {
      noPhone: false,
      hadPhoneBaseline: false,
      sent: false,
    };
    if (row.Action === CONSENT_ACTION.PhoneEligibleNoPhone) entry.noPhone = true;
    if (row.Action === CONSENT_ACTION.PhoneEligibleHadPhoneBaseline) {
      entry.hadPhoneBaseline = true;
    }
    if (row.Action === CONSENT_ACTION.PhoneEligibleSent) entry.sent = true;
    map.set(userId, entry);
  }
  return map;
};

const recordPhoneEligibilityMarker = async (tenantId, userId, action) => {
  await insertHistory({
    tenantId,
    userId,
    channel: PHONE_ELIGIBILITY_HISTORY_CHANNEL,
    action,
    performedBy: JOB_PERFORMED_BY,
  });
};

/** Bulk-insert phone-eligibility history markers (avoids N sequential inserts on Send). */
const recordPhoneEligibilityMarkersBulk = async (tenantId, userIds, action) => {
  const ids = [
    ...new Set(
      (userIds || [])
        .map((id) => String(id || "").trim())
        .filter(Boolean),
    ),
  ];
  if (!tenantId || !ids.length || !action) return;

  const CHUNK = 100;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const values = slice
      .map(
        (userId) => `(
      N'${escapeSql(tenantId)}',
      N'${escapeSql(userId)}',
      N'${escapeSql(PHONE_ELIGIBILITY_HISTORY_CHANNEL)}',
      N'${escapeSql(action)}',
      NULL,
      NULL,
      SYSUTCDATETIME(),
      N'${escapeSql(JOB_PERFORMED_BY)}'
    )`,
      )
      .join(",\n");
    const qry = `
      INSERT INTO UserNotificationConsentHistory
        (TenantId, UserId, NotificationChannel, Action, TeamsMessageId, ConversationId, ActionDate, PerformedBy)
      VALUES
      ${values}
    `;
    await db.getDataFromDB(qry);
  }
};

/**
 * List distinct tenants that may need newly-phone-eligible consent processing.
 */
const listTenantsForPhoneEligibleConsentJob = async () => {
  // One installation row per tenant (oldest), matching getPhoneIntegrationContextForTenant.
  const qry = `
    SELECT tenantId, teamId, integrationConfigure, isAppPermissionGranted, phoneField
    FROM (
      SELECT
        user_tenant_id AS tenantId,
        team_id AS teamId,
        INTEGRATION_CONFIGURE AS integrationConfigure,
        IS_APP_PERMISSION_GRANTED AS isAppPermissionGranted,
        PHONE_FIELD AS phoneField,
        ROW_NUMBER() OVER (
          PARTITION BY user_tenant_id
          ORDER BY created_date ASC
        ) AS rn
      FROM MSTeamsInstallationDetails
      WHERE user_tenant_id IS NOT NULL
        AND user_tenant_id <> ''
        AND team_id IS NOT NULL
        AND team_id <> ''
    ) ranked
    WHERE ranked.rn = 1
  `;
  return (await db.getDataFromDB(qry)) || [];
};

const getCandidateUsersNeedingPhoneConsent = async (tenantId, phoneChannels) => {
  const chs = normalizeChannels(phoneChannels).filter((ch) =>
    PHONE_CONSENT_CHANNELS.includes(ch),
  );
  if (!chs.length) return [];
  const safeTenant = escapeSql(tenantId);
  const channelList = chs.map((ch) => `N'${escapeSql(ch)}'`).join(",");
  const valuesList = chs.map((ch) => `(N'${escapeSql(ch)}')`).join(",");
  // Pending/OptedOut rows (legacy or phone-eligible sends) OR NoPhone baseline
  // markers from eligibility-filtered admin sends (phone appears later).
  const qry = `
    SELECT DISTINCT UserId
    FROM (
      SELECT UserId
      FROM UserNotificationConsent
      WHERE TenantId = N'${safeTenant}'
        AND NotificationChannel IN (${channelList})
        AND ConsentStatus IN (
          N'${CONSENT_STATUS.Pending}',
          N'${CONSENT_STATUS.OptedOut}'
        )
      UNION
      SELECT h.UserId
      FROM UserNotificationConsentHistory h
      WHERE h.TenantId = N'${safeTenant}'
        AND h.NotificationChannel = N'${escapeSql(PHONE_ELIGIBILITY_HISTORY_CHANNEL)}'
        AND h.Action = N'${CONSENT_ACTION.PhoneEligibleNoPhone}'
        AND EXISTS (
          SELECT 1
          FROM (VALUES ${valuesList}) AS req(Channel)
          WHERE NOT EXISTS (
            SELECT 1
            FROM UserNotificationConsent c
            WHERE c.TenantId = N'${safeTenant}'
              AND c.UserId = h.UserId
              AND c.NotificationChannel = req.Channel
              AND c.ConsentStatus = N'${CONSENT_STATUS.OptedIn}'
          )
        )
    ) candidates
  `;
  const rows = (await db.getDataFromDB(qry)) || [];
  return rows
    .map((r) => String(r.UserId || "").trim())
    .filter((id) => id && !isConsentMessageExcludedUser(id));
};

/**
 * Hourly job entry: baseline users who already have phone-channel consent requests,
 * then send once when a phone appears after a no-phone baseline (history markers only).
 */
const processNewlyPhoneEligibleConsent = async () => {
  const summary = {
    tenantsChecked: 0,
    tenantsProcessed: 0,
    baselined: 0,
    queued: 0,
    sent: 0,
    skipped: 0,
  };

  const rows = await listTenantsForPhoneEligibleConsentJob();
  summary.tenantsChecked = rows.length;

  const incidentService = require("./incidentService");

  for (const row of rows) {
    const tenantId = String(row.tenantId || "").trim();
    const teamId = String(row.teamId || "").trim();
    if (!tenantId || !teamId) continue;

    try {
      const phoneCtx = {
        phoneSource: parsePhoneSourceFromIntegrationConfig(
          row.integrationConfigure,
        ),
        phoneField:
          row.phoneField === "mobilePhone" ? "mobilePhone" : "businessPhones",
        isAppPermissionGranted: row.isAppPermissionGranted,
        teamId,
        integrationConfigure: row.integrationConfigure,
      };
      const phoneSource = resolveConsentPhoneSource(phoneCtx);
      if (phoneSource !== "office365" && phoneSource !== "spreadsheet") {
        continue;
      }

      const integrationConfig = parseIntegrationConfig(row.integrationConfigure);
      const phoneOptInChannels = PHONE_CONSENT_CHANNELS.filter((ch) =>
        isOptInRequired(integrationConfig, ch),
      );
      if (!phoneOptInChannels.length) continue;

      summary.tenantsProcessed += 1;

      const candidates = await getCandidateUsersNeedingPhoneConsent(
        tenantId,
        phoneOptInChannels,
      );
      if (!candidates.length) continue;

      let withPhoneSet;
      if (phoneSource === "spreadsheet") {
        withPhoneSet = await getSpreadsheetPhoneUserIdSet(tenantId, candidates);
      } else {
        withPhoneSet = await getOffice365PhoneUserIdSet(
          tenantId,
          candidates,
          phoneCtx.isAppPermissionGranted,
        );
      }

      const markers = await loadPhoneEligibilityHistoryMarkers(
        tenantId,
        candidates,
      );

      const toSend = [];
      for (const userId of candidates) {
        const hasPhone = withPhoneSet.has(userId);
        const m = markers.get(userId) || {
          noPhone: false,
          hadPhoneBaseline: false,
          sent: false,
        };

        if (m.sent) continue;

        const hasAnyBaseline = m.noPhone || m.hadPhoneBaseline;
        if (!hasAnyBaseline) {
          // First observation — baseline only, never send.
          await recordPhoneEligibilityMarker(
            tenantId,
            userId,
            hasPhone
              ? CONSENT_ACTION.PhoneEligibleHadPhoneBaseline
              : CONSENT_ACTION.PhoneEligibleNoPhone,
          );
          summary.baselined += 1;
          continue;
        }

        if (m.noPhone && hasPhone && !m.sent) {
          toSend.push(userId);
        }
      }

      if (!toSend.length) continue;
      summary.queued += toSend.length;

      let company = null;
      try {
        company = await incidentService.getCompanyData(teamId);
      } catch (companyErr) {
        console.log(
          `consent phone-eligible job: getCompanyData failed for ${teamId}`,
          companyErr?.message || companyErr,
        );
        continue;
      }
      if (!company?.serviceUrl) continue;

      const result = await sendConsentRequests({
        tenantId,
        teamId,
        channels: phoneOptInChannels,
        message:
          integrationConfig?.userConsent?.message || DEFAULT_CONSENT_MESSAGE,
        performedBy: JOB_PERFORMED_BY,
        userIds: toSend,
        persistOptInFlags: false,
        companyData: company,
      });

      summary.sent += Number(result?.sent || 0);
      summary.skipped += Number(result?.skipped || 0);

      const sentIds = Array.isArray(result?.sentUserIds)
        ? result.sentUserIds
        : [];
      for (const userId of sentIds) {
        await recordPhoneEligibilityMarker(
          tenantId,
          userId,
          CONSENT_ACTION.PhoneEligibleSent,
        );
      }
    } catch (tenantErr) {
      console.log(
        `consent phone-eligible job failed for tenant ${tenantId}:`,
        tenantErr?.message || tenantErr,
      );

    }
  }

  return summary;
};

module.exports = {
  CONSENT_CHANNELS,
  CONSENT_STATUS,
  CONSENT_ACTION,
  CHANNEL_LABELS,
  DEFAULT_CONSENT_MESSAGE,
  PHONE_ELIGIBILITY_HISTORY_CHANNEL,
  normalizeChannel,
  normalizeChannels,
  parseIntegrationConfig,
  isOptInRequired,
  getOptInRequiredChannels,
  filterUserIdsByConsent,
  filterUsersByConsent,
  userHasChannelConsent,
  getConsentStats,
  getPhoneIntegrationContextForTenant,
  resolveConsentPhoneSource,
  countValidGraphPhones,
  getValidGraphPhoneUserIdSet,
  resolveConsentEligibility,
  getConsentUserList,
  getUsersNeedingConsent,
  getUserConsentForChannels,
  buildConsentAdaptiveCard,
  markConsentRequestSent,
  recordConsentResponse,
  updateIntegrationOptInFlags,
  sendConsentRequests,
  processNewlyPhoneEligibleConsent,
};
