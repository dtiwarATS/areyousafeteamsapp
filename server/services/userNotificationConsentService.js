const db = require("../db");
const { processSafetyBotError } = require("../models/processError");
const { sendProactiveMessaageToUser } = require("../api/apiMethods");

const CONSENT_CHANNELS = ["sms", "whatsapp", "email", "voice"];
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
};

const CHANNEL_LABELS = {
  sms: "SMS",
  whatsapp: "WhatsApp",
  email: "Email",
  voice: "Voice Calls",
};

const DEFAULT_CONSENT_MESSAGE =
  "Choose how you'd like to receive Safety Check notifications.\n\nSelect one or more options below, then click Submit.";

/** Max concurrent Teams proactive sends for consent cards. */
const CONSENT_SEND_CONCURRENCY = 10;

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
  await Promise.all(
    Array.from({ length: poolSize }, () => runWorker()),
  );
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
    processSafetyBotError(
      err,
      "",
      "",
      "",
      "error in filterUserIdsByConsent",
    );
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

const getConsentStats = async (tenantId) => {
  const safeTenant = escapeSql(tenantId);
  const totalQry = `
    SELECT COUNT(DISTINCT user_aadobject_id) AS totalUsers
    FROM MSTeamsTeamsUsers
    WHERE tenantid = N'${safeTenant}'
      AND user_aadobject_id IS NOT NULL
      AND user_aadobject_id <> ''
  `;
  const totalRows = (await db.getDataFromDB(totalQry)) || [];
  const totalUsers = Number(totalRows[0]?.totalUsers || 0);

  const consentQry = `
    SELECT NotificationChannel, ConsentStatus, COUNT(*) AS cnt
    FROM UserNotificationConsent
    WHERE TenantId = N'${safeTenant}'
    GROUP BY NotificationChannel, ConsentStatus
  `;
  const consentRows = (await db.getDataFromDB(consentQry)) || [];

  const stats = {};
  for (const ch of CONSENT_CHANNELS) {
    stats[ch] = { optedIn: 0, pending: 0, optedOut: 0, total: totalUsers };
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
        ConsentDate = ${
          setConsentDate ? "SYSUTCDATETIME()" : "target.ConsentDate"
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

const normalizeStoredConversationId = (value) => {
  if (value == null) return null;
  const id = String(value).trim();
  if (!id || id === "null") return null;
  return id;
};

/**
 * One Adaptive Card per AAD user. Same person can have multiple
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
  justSavedChannels = null,
}) => {
  const chs = normalizeChannels(channelsRequested);
  const defaultTitle =
    "Choose how you'd like to receive Safety Check notifications.";
  const defaultInstruction =
    "Select one or more options below, then click Submit.";
  const cardMessage =
    message && String(message).trim()
      ? String(message).trim()
      : DEFAULT_CONSENT_MESSAGE;

  const raw = cardMessage;
  const paragraphs = raw
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  let title = defaultTitle;
  let instruction = defaultInstruction;
  if (paragraphs.length >= 2) {
    title = paragraphs[0];
    instruction = paragraphs.slice(1).join("\n\n");
  } else if (paragraphs.length === 1) {
    // Prefer custom body under the default title unless the single block is only the title.
    if (paragraphs[0] === defaultTitle) {
      instruction = defaultInstruction;
    } else if (
      paragraphs[0].startsWith(defaultTitle) &&
      paragraphs[0].length > defaultTitle.length
    ) {
      instruction = paragraphs[0]
        .slice(defaultTitle.length)
        .replace(/^\.\s*/, "")
        .trim() || defaultInstruction;
    } else {
      instruction = paragraphs[0];
    }
  }

  const body = [
    {
      type: "TextBlock",
      text: title,
      weight: "Bolder",
      wrap: true,
      size: "Medium",
    },
    {
      type: "TextBlock",
      text: instruction,
      wrap: true,
      spacing: "Small",
    },
  ];

  // Preserve channelsRequested order: OptedIn locked with green label; others selectable.
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
            items: [
              {
                type: "Input.ChoiceSet",
                id: `saved_${ch}`,
                style: "expanded",
                isMultiSelect: true,
                isEnabled: false,
                value: ch,
                choices: [{ title: CHANNEL_LABELS[ch], value: ch }],
              },
            ],
          },
          {
            type: "Column",
            width: "auto",
            verticalContentAlignment: "Center",
            items: [
              {
                type: "TextBlock",
                text: "✓ Consented",
                color: "Good",
                wrap: false,
              },
            ],
          },
        ],
      });
    } else {
      body.push({
        type: "Input.ChoiceSet",
        id: `selectedChannel_${ch}`,
        style: "expanded",
        isMultiSelect: true,
        spacing: "Small",
        choices: [{ title: CHANNEL_LABELS[ch], value: ch }],
      });
    }
  }

  const justSaved = normalizeChannels(justSavedChannels || []);
  if (justSaved.length) {
    const labels = justSaved.map((ch) => CHANNEL_LABELS[ch]).join(", ");
    body.push({
      type: "TextBlock",
      text: `✓ Your preferences have been saved: ${labels}.`,
      wrap: true,
      spacing: "Medium",
    });
  }

  return {
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    type: "AdaptiveCard",
    version: "1.4",
    appId: process.env.MicrosoftAppId,
    body,
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
    existingStatusMap ||
    (await getExistingConsentMap(tenantId, [userId], chs));

  for (const ch of chs) {
    const current = statusMap.get(`${userId}|${ch}`);
    if (current === CONSENT_STATUS.OptedIn) {
      continue;
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
  }
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
 */
const sendConsentRequests = async ({
  tenantId,
  teamId,
  channels,
  message,
  performedBy,
  userIds = null,
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

  let recipients;
  if (Array.isArray(userIds) && userIds.length > 0) {
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

  const recipientIds = recipients.map((r) => r.UserId || r.user_aadobject_id);
  const statusMap = await getExistingConsentMap(
    effectiveTenant,
    recipientIds,
    chs,
  );

  const cardMessage =
    message ||
    integrationConfig?.userConsent?.message ||
    DEFAULT_CONSENT_MESSAGE;

  let sent = 0;
  let skipped = 0;

  const outcomes = await mapWithConcurrency(
    recipients,
    CONSENT_SEND_CONCURRENCY,
    async (recipient) => {
      const userId = recipient.UserId || recipient.user_aadobject_id;
      if (!userId || isConsentMessageExcludedUser(userId)) {
        return "skipped";
      }

      const existingConsent = {};
      for (const ch of chs) {
        existingConsent[ch] = statusMap.get(`${userId}|${ch}`) || null;
      }

      const needsAny = chs.some(
        (ch) => existingConsent[ch] !== CONSENT_STATUS.OptedIn,
      );
      if (!needsAny) {
        return "skipped";
      }

      const card = buildConsentAdaptiveCard({
        message: cardMessage,
        channelsRequested: chs,
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
          null,
          null,
        );

        // Wrong/expired conversationId or send failure → skip this user, continue others
        const sendFailed =
          !!resp?.error ||
          !resp?.activityId ||
          (resp?.status != null &&
            Number(resp.status) >= 400);

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
          channels: chs,
          performedBy: performedBy || "admin",
          teamsMessageId: resp?.activityId || null,
          conversationId:
            resp?.conversationId || existingConversationId || null,
          existingStatusMap: statusMap,
        });
        return "sent";
      } catch (err) {
        // Any unexpected error: skip this user and continue with next
        console.log(`Consent send skipped for user ${userId}:`, err?.message || err);
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

  return { sent, skipped, channels: chs };
};

module.exports = {
  CONSENT_CHANNELS,
  CONSENT_STATUS,
  CONSENT_ACTION,
  CHANNEL_LABELS,
  DEFAULT_CONSENT_MESSAGE,
  normalizeChannel,
  normalizeChannels,
  parseIntegrationConfig,
  isOptInRequired,
  getOptInRequiredChannels,
  filterUserIdsByConsent,
  filterUsersByConsent,
  userHasChannelConsent,
  getConsentStats,
  getUsersNeedingConsent,
  getUserConsentForChannels,
  buildConsentAdaptiveCard,
  markConsentRequestSent,
  recordConsentResponse,
  updateIntegrationOptInFlags,
  sendConsentRequests,
};
