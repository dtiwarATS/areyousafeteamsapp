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
  const credPath = process.env.FCM_SERVICE_ACCOUNT_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS;
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
    const trimmed = String(credPath).trim();
    if (trimmed.startsWith('{')) {
      try {
        serviceAccount = JSON.parse(trimmed);
      } catch (parseErr) {
        throw new Error('FCM not configured: FCM_SERVICE_ACCOUNT_PATH contains invalid JSON');
      }
    } else {
      const resolvedPath = path.isAbsolute(credPath) ? credPath : path.join(process.cwd(), credPath);
      try {
        serviceAccount = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
      } catch (readErr) {
        throw new Error('FCM not configured: could not read credentials from ' + credPath + ' - ' + (readErr && readErr.message));
      }
    }
    app = admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    return app;
  }
  throw new Error('FCM not configured: set GOOGLE_APPLICATION_CREDENTIALS, FCM_SERVICE_ACCOUNT_PATH, or FCM_SERVICE_ACCOUNT_JSON');
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
 * Send Safety Check / Safety Alert FCM pushes to members with stored device tokens.
 * Never throws — callers should fire-and-forget so Teams delivery is unaffected.
 * @param {object[]} members - Same recipient list as Teams proactive send
 * @param {object} opts
 * @param {string|number} opts.incId
 * @param {string} opts.incTitle
 * @param {string} opts.createdByName
 * @param {string} opts.teamId
 * @param {string|number} opts.incTypeId - 1 = Safety Check, 2 = Safety Alert
 */
async function sendSafetyCheckPushToMembers(members, opts = {}) {
  try {
    const {
      incId,
      incTitle = '',
      createdByName = '',
      teamId = '',
      incTypeId,
    } = opts;
    const typeId = Number(incTypeId);
    if (typeId !== 1 && typeId !== 2) return;
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

    const kindLabel = typeId === 2 ? 'Safety Alert' : 'Safety Check';
    const title = `${kindLabel} - ${incTitle}`;
    const body = `This is a safety check from ${createdByName || 'your admin'}. Mark yourself as safe, or ask for assistance.`;
    const data = {
      type: 'SAFETY_CHECK',
      incId: String(incId),
      teamId: String(teamId || ''),
      incTitle: String(incTitle || ''),
      createdByName: String(createdByName || ''),
      incTypeId: String(typeId),
    };

    const pushTasks = uniqueTokens.map(async (row) => {
      try {
        // dataOnly so Android background handler can show Notifee actions
        // (I am safe / I need assistance) instead of a plain system tray notification.
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
    });
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
};
