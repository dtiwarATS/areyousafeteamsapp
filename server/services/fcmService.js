const path = require('path');
const fs = require('fs');
const db = require('../db');

/**
 * FCM (Firebase Cloud Messaging) send service using Firebase Admin SDK.
 * Configure via GOOGLE_APPLICATION_CREDENTIALS (path to JSON), FCM_SERVICE_ACCOUNT_PATH, or FCM_SERVICE_ACCOUNT_JSON.
 */
let admin = null;
let app = null;

function getFirebaseApp() {
  if (app) return app;
  try {
    admin = require('firebase-admin');
  } catch (e) {
    throw new Error('FCM not configured: firebase-admin not available');
  }
  // Trim — .env values often pick up leading/trailing spaces
  const credPathRaw =
    process.env.FCM_SERVICE_ACCOUNT_PATH ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    '';
  const credPath = String(credPathRaw).trim();
  const credJson = process.env.FCM_SERVICE_ACCOUNT_JSON;
  if (credJson) {
    try {
      const serviceAccount = typeof credJson === 'string' ? JSON.parse(credJson) : credJson;
      app = admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
      return app;
    } catch (parseErr) {
      throw new Error('FCM not configured: FCM_SERVICE_ACCOUNT_JSON is invalid');
    }
  }
  if (credPath) {
    let serviceAccount;
    if (credPath.startsWith('{')) {
      try {
        serviceAccount = JSON.parse(credPath);
      } catch (parseErr) {
        throw new Error('FCM not configured: FCM_SERVICE_ACCOUNT_PATH contains invalid JSON');
      }
    } else {
      const resolvedPath = path.isAbsolute(credPath)
        ? credPath
        : path.join(process.cwd(), credPath);
      try {
        serviceAccount = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
      } catch (readErr) {
        throw new Error(
          'FCM not configured: could not read credentials from ' +
            resolvedPath +
            ' - ' +
            (readErr && readErr.message),
        );
      }
    }
    if (!serviceAccount?.private_key || !serviceAccount?.client_email) {
      throw new Error(
        'FCM not configured: service account JSON missing private_key or client_email',
      );
    }
    // Normalize PEM newlines if the key was pasted with literal \\n
    if (
      typeof serviceAccount.private_key === 'string' &&
      serviceAccount.private_key.includes('\\n')
    ) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }
    console.log(
      '[fcmService] using service account',
      serviceAccount.client_email,
      'keyId=',
      serviceAccount.private_key_id,
      'from',
      credPath,
    );
    app = admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    return app;
  }
  throw new Error(
    'FCM not configured: set GOOGLE_APPLICATION_CREDENTIALS, FCM_SERVICE_ACCOUNT_PATH, or FCM_SERVICE_ACCOUNT_JSON',
  );
}

/**
 * Send a push notification via FCM.
 * @param {string} fcmToken - Device FCM token
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {object} data - Optional key-value data payload (string values only for FCM data)
 * @param {object} [options]
 * @param {boolean} [options.dataOnly] - If true, omit notification payload so the app
 *   can display a custom Notifee notification with action buttons (Android).
 * @returns {Promise<void>}
 */
async function sendPushNotification(fcmToken, title, body, data = {}, options = {}) {
  const fb = getFirebaseApp();
  const messaging = fb.messaging();
  const dataPayload = {};
  if (data && typeof data === 'object') {
    for (const [k, v] of Object.entries(data)) {
      dataPayload[k] = String(v);
    }
  }
  // Include title/body in data so client can display when using data-only messages
  if (options.dataOnly) {
    if (title) dataPayload.title = String(title);
    if (body) dataPayload.body = String(body);
  }
  const message = {
    token: fcmToken,
    data: dataPayload,
  };
  if (!options.dataOnly) {
    message.notification = { title, body };
  } else {
    // High priority so Android wakes the app for data-only messages
    message.android = { priority: 'high' };
  }
  await messaging.send(message);
}

/**
 * Get FCM tokens from user_fcm_tokens for given user IDs (AAD Object IDs).
 * @param {string[]} userAadObjectIds - Admin user_aadobject_id values
 * @param {string} platform - 'android' | 'ios'
 * @returns {Promise<Array<{user_id: string, fcm_token: string}>>}
 */
async function getFcmTokensForUsers(userAadObjectIds, platform = 'android') {
  if (!userAadObjectIds || userAadObjectIds.length === 0) {
    return [];
  }
  const sanitized = userAadObjectIds
    .filter((id) => id && typeof id === 'string')
    .map((id) => `'${String(id).replace(/'/g, "''")}'`);
  if (sanitized.length === 0) return [];
  const idsClause = sanitized.join(',');
  const sql = `SELECT user_id, fcm_token FROM user_fcm_tokens WHERE user_id IN (${idsClause}) AND platform = '${platform}' AND (auth_status = 1 OR auth_status IS NULL)`;
  const rows = await db.getDataFromDB(sql, '', true);
  return rows || [];
}

/**
 * Send SOS push notifications to admins who have Android FCM tokens.
 * @param {object[]} admins - Admin objects with user_aadobject_id, user_name
 * @param {object} user - Requester user object with user_name
 * @param {string} userAadObjId - Requester's AAD Object ID (person who clicked SOS)
 * @param {string|number} requestAssistanceid
 * @param {string} baseUrl - Base URL for accept link
 * @param {object} incidentService - For saveAllTypeQuerylogs
 */
async function sendSosPushToAdmins(admins, user, userAadObjId, requestAssistanceid, baseUrl, incidentService) {
  if (!admins || admins.length === 0) return;
  const adminIds = [...new Set(admins.map((a) => a.user_aadobject_id).filter(Boolean))];
  if (adminIds.length === 0) return;
  let tokens;
  try {
    tokens = await getFcmTokensForUsers(adminIds, 'android');
  } catch (err) {
    console.error('[sendSosPushToAdmins] getFcmTokensForUsers error:', err);
    return;
  }
  if (!tokens || tokens.length === 0) return;
  const title = 'SOS Alert';
  const body = `${user.user_name || 'Someone'} needs assistance`;
  const pushTasks = tokens.map(async (row) => {
    const adminId = row.user_id;
    const acceptLink = `${baseUrl}/acceptSOS?id=${requestAssistanceid}&adminId=${adminId}`;
    const data = {
      requestAssistanceid: String(requestAssistanceid),
      userAadObjId: String(userAadObjId || ''),
      adminId,
      acceptLink,
    };
    try {
      incidentService.saveAllTypeQuerylogs(
        adminId,
        '',
        'SOS_PUSH',
        'FCM',
        requestAssistanceid,
        'SENDING',
        '',
        '',
        '',
        '',
        '',
      );
      await sendPushNotification(row.fcm_token, title, body, data);
      incidentService.saveAllTypeQuerylogs(
        adminId,
        '',
        'SOS_PUSH',
        'FCM',
        requestAssistanceid,
        'SEND_SUCCESS',
        '',
        '',
        '',
        '',
        '',
      );
    } catch (err) {
      console.error('[sendSosPushToAdmins] sendPushNotification error:', err);
      incidentService.saveAllTypeQuerylogs(
        adminId,
        '',
        'SOS_PUSH',
        'FCM',
        requestAssistanceid,
        'SEND_FAILED',
        '',
        '',
        '',
        '',
        String((err && err.message) || ''),
      );
    }
  });
  await Promise.allSettled(pushTasks);
}

const UUID_LIKE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Prevent duplicate FCM fan-out when the tab sends the same incident in multiple batches. */
const recentSafetyCheckPushAt = new Map();
const SAFETY_CHECK_PUSH_DEBOUNCE_MS = 90 * 1000;

/**
 * Returns true once per incId within the debounce window (also records the send).
 * @param {string|number} incId
 * @returns {boolean}
 */
function shouldSendSafetyCheckPush(incId) {
  if (incId == null || incId === '') return false;
  const key = String(incId);
  const now = Date.now();
  const last = recentSafetyCheckPushAt.get(key);
  if (last != null && now - last < SAFETY_CHECK_PUSH_DEBOUNCE_MS) {
    console.log(
      '[shouldSendSafetyCheckPush] skip duplicate FCM for incId=',
      key,
      'msSinceLast=',
      now - last,
    );
    return false;
  }
  recentSafetyCheckPushAt.set(key, now);
  // light cleanup
  if (recentSafetyCheckPushAt.size > 500) {
    for (const [k, t] of recentSafetyCheckPushAt) {
      if (now - t > SAFETY_CHECK_PUSH_DEBOUNCE_MS) recentSafetyCheckPushAt.delete(k);
    }
  }
  return true;
}

/**
 * Collect unique AAD object IDs from member rows used in Safety Check fan-out.
 * @param {object[]} members
 * @returns {string[]}
 */
function collectMemberAadIds(members) {
  if (!members || members.length === 0) return [];
  const ids = new Set();
  for (const member of members) {
    if (!member) continue;
    const candidates = [
      member.userAadObjId,
      member.user_aadobject_id,
      member.aadObjectId,
    ];
    for (const c of candidates) {
      if (c && typeof c === 'string' && c.trim()) {
        ids.add(c.trim());
      }
    }
    // Some member lists store AAD UUID in `id` instead of Teams conversation id
    if (member.id && typeof member.id === 'string' && UUID_LIKE.test(member.id.trim())) {
      ids.add(member.id.trim());
    }
  }
  return [...ids];
}

/**
 * Build FCM title + body to match Teams proactive activity summary
 * (same copy as sendProactiveMessageAsync / getSafetyCheckMessageText).
 */
function buildTeamsStylePushCopy({
  incTypeId,
  incTitle = '',
  createdByName = '',
  incGuidance = '',
  cardSnapshot = null,
}) {
  const typeId = Number(incTypeId);
  const creator = createdByName || 'your admin';
  const titleMap = {
    1: `Safety Check - ${incTitle}`,
    2: `Safety Alert - ${incTitle}`,
    3: `Important Bulletin - ${incTitle}`,
    4: `Travel Advisory - ${incTitle}`,
    5: `Stakeholder Notice - ${incTitle}`,
  };
  const title = titleMap[typeId] || `Safety Check - ${incTitle}`;

  // Prefer localized intro from Teams card snapshot when available
  let body = cardSnapshot?.intro || '';
  if (!body) {
    if (typeId === 1) {
      if (incGuidance) {
        body = String(incGuidance)
          .replace(/<IncidentCreator>/g, creator)
          .replace(/<IncidentTitle>/g, incTitle);
      } else {
        body = `This is a safety check from ${creator}. We think you may be affected by ${incTitle}. Mark yourself as safe, or ask for assistance.`;
      }
    } else if (typeId === 2) {
      body = `This is a safety alert from ${creator}. We think you may be affected by ${incTitle}.`;
    } else if (typeId === 3) {
      body = `This is an important bulletin from ${creator}`;
    } else if (typeId === 4) {
      body = `This is a travel advisory from ${creator}`;
    } else if (typeId === 5) {
      body = `This is a stakeholder notice from ${creator}`;
    } else {
      body = `This is a safety check from ${creator}. We think you may be affected by ${incTitle}. Mark yourself as safe, or ask for assistance.`;
    }
  }

  // Notification tray is plain text (no Adaptive Card markdown / @mentions)
  body = body
    .replace(/<\/?at>/gi, '')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return { title, body, typeId: Number.isFinite(typeId) ? typeId : 1 };
}

/**
 * Map member AAD id → LANGUAGE_ID (same field Teams uses for Adaptive Cards).
 */
function collectMemberLanguageMap(members) {
  const map = new Map();
  if (!members || members.length === 0) return map;
  for (const member of members) {
    if (!member) continue;
    const lang =
      member.LANGUAGE_ID ?? member.languageId ?? member.language_id ?? null;
    const candidates = [
      member.userAadObjId,
      member.user_aadobject_id,
      member.aadObjectId,
      member.id && UUID_LIKE.test(String(member.id).trim())
        ? String(member.id).trim()
        : null,
    ];
    for (const c of candidates) {
      if (c && typeof c === 'string' && c.trim()) {
        map.set(c.trim(), lang != null && lang !== '' ? lang : 10000);
      }
    }
  }
  return map;
}

/**
 * Send incident FCM pushes to members with stored device tokens (all inc types).
 * Builds the same card content as SafetyCheckCard, per member LANGUAGE_ID when known.
 * Never throws — callers should fire-and-forget so Teams delivery is unaffected.
 */
async function sendSafetyCheckPushToMembers(members, opts = {}) {
  try {
    const {
      incId,
      incTitle = '',
      createdByName = '',
      teamId = '',
      incTypeId,
      incGuidance = '',
      additionalInfo = '',
      travelUpdate = '',
      contactInfo = '',
      situation = '',
      responseOptionData = null,
      translatedtext = null,
      isDrill = false,
    } = opts;
    if (!incId) return;

    const userIds = collectMemberAadIds(members);
    if (userIds.length === 0) return;

    let tokens = [];
    try {
      const [androidTokens, iosTokens] = await Promise.all([
        getFcmTokensForUsers(userIds, 'android'),
        getFcmTokensForUsers(userIds, 'ios'),
      ]);
      tokens = [...(androidTokens || []), ...(iosTokens || [])];
    } catch (err) {
      console.error('[sendSafetyCheckPushToMembers] getFcmTokensForUsers error:', err);
      return;
    }
    if (!tokens.length) return;

    // Deduplicate by token in case the same device appears twice
    const seen = new Set();
    const uniqueTokens = tokens.filter((row) => {
      if (!row?.fcm_token || seen.has(row.fcm_token)) return false;
      seen.add(row.fcm_token);
      return true;
    });

    const langByUser = collectMemberLanguageMap(members);
    const { buildMobileCardSnapshot } = require('../models/mobileSafetyCheckCard');

    // Group tokens by language so each user gets the same localized card as Teams
    const tokensByLang = new Map();
    for (const row of uniqueTokens) {
      const lang = langByUser.get(row.user_id) ?? 10000;
      const key = String(lang);
      if (!tokensByLang.has(key)) tokensByLang.set(key, []);
      tokensByLang.get(key).push(row);
    }

    const incObj = {
      incId,
      incCreatedBy: { name: createdByName },
      responseOptionData: responseOptionData || {
        responseOptions: [
          { id: 1, option: 'I am safe', color: '#4CAF50' },
          { id: 2, option: 'I need assistance', color: '#F44336' },
        ],
        responseType: 'buttons',
      },
      isDrill: !!isDrill,
      translatedtext,
      TRANSLATED_TEXT_JSON: translatedtext,
    };

    const pushTasks = [];
    for (const [langKey, langTokens] of tokensByLang) {
      const cardSnapshot = buildMobileCardSnapshot(
        incTitle,
        incObj,
        incGuidance,
        incTypeId,
        additionalInfo,
        travelUpdate,
        contactInfo,
        situation,
        langKey,
      );
      const { title, body, typeId } = buildTeamsStylePushCopy({
        incTypeId,
        incTitle,
        createdByName,
        incGuidance: cardSnapshot.incGuidance || incGuidance,
        cardSnapshot,
      });

      // Keep FCM data under size limits — card JSON is the in-app source of truth
      let cardJson = JSON.stringify(cardSnapshot);
      if (cardJson.length > 3500) {
        cardJson = JSON.stringify({
          ...cardSnapshot,
          sections: (cardSnapshot.sections || []).map((s) => ({
            label: s.label,
            text: String(s.text || '').slice(0, 400),
          })),
          intro: String(cardSnapshot.intro || '').slice(0, 500),
          incGuidance: String(cardSnapshot.incGuidance || '').slice(0, 400),
          additionalInfo: String(cardSnapshot.additionalInfo || '').slice(0, 400),
          travelUpdate: String(cardSnapshot.travelUpdate || '').slice(0, 400),
          contactInfo: String(cardSnapshot.contactInfo || '').slice(0, 400),
          situation: String(cardSnapshot.situation || '').slice(0, 400),
        });
      }

      const data = {
        type: 'SAFETY_CHECK',
        incId: String(incId),
        teamId: String(teamId || ''),
        incTitle: String(incTitle || ''),
        createdByName: String(createdByName || ''),
        incTypeId: String(typeId),
        languageId: String(langKey),
        title: String(title),
        body: String(body),
        cardJson,
        isDrill: cardSnapshot.isDrill ? '1' : '0',
      };

      for (const row of langTokens) {
        pushTasks.push(
          (async () => {
            try {
              await sendPushNotification(row.fcm_token, title, body, data, {
                dataOnly: true,
              });
            } catch (err) {
              console.error(
                '[sendSafetyCheckPushToMembers] sendPushNotification error for user',
                row.user_id,
                err?.message || err,
              );
            }
          })(),
        );
      }
    }
    await Promise.allSettled(pushTasks);
  } catch (err) {
    console.error('[sendSafetyCheckPushToMembers] unexpected error:', err?.message || err);
  }
}

module.exports = {
  sendPushNotification,
  getFcmTokensForUsers,
  sendSosPushToAdmins,
  sendSafetyCheckPushToMembers,
  shouldSendSafetyCheckPush,
  buildTeamsStylePushCopy,
};
