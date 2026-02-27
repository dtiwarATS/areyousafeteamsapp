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
    const resolvedPath = path.isAbsolute(credPath) ? credPath : path.join(process.cwd(), credPath);
    try {
      const serviceAccount = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
      app = admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
      return app;
    } catch (readErr) {
      throw new Error('FCM not configured: could not read credentials from ' + credPath + ' - ' + (readErr && readErr.message));
    }
  }
  throw new Error('FCM not configured: set GOOGLE_APPLICATION_CREDENTIALS, FCM_SERVICE_ACCOUNT_PATH, or FCM_SERVICE_ACCOUNT_JSON');
}

/**
 * Send a push notification via FCM.
 * @param {string} fcmToken - Device FCM token
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {object} data - Optional key-value data payload (string values only for FCM data)
 * @returns {Promise<void>}
 */
async function sendPushNotification(fcmToken, title, body, data = {}) {
  const fb = getFirebaseApp();
  const messaging = fb.messaging();
  const dataPayload = {};
  if (data && typeof data === 'object') {
    for (const [k, v] of Object.entries(data)) {
      dataPayload[k] = String(v);
    }
  }
  const message = {
    token: fcmToken,
    notification: { title, body },
    data: dataPayload
  };
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
  // const pushTasks = tokens.map(async (row) => {
  //   const adminId = row.user_id;
  //   const acceptLink = `${baseUrl}/acceptSOS?id=${requestAssistanceid}&adminId=${adminId}`;
  //   const data = {
  //     requestAssistanceid: String(requestAssistanceid),
  //     userAadObjId: String(userAadObjId || ''),
  //     adminId,
  //     acceptLink,
  //   };
  //   try {
  //     incidentService.saveAllTypeQuerylogs(
  //       adminId,
  //       '',
  //       'SOS_PUSH',
  //       'FCM',
  //       requestAssistanceid,
  //       'SENDING',
  //       '',
  //       '',
  //       '',
  //       '',
  //       '',
  //     );
  //     await sendPushNotification(row.fcm_token, title, body, data);
  //     incidentService.saveAllTypeQuerylogs(
  //       adminId,
  //       '',
  //       'SOS_PUSH',
  //       'FCM',
  //       requestAssistanceid,
  //       'SEND_SUCCESS',
  //       '',
  //       '',
  //       '',
  //       '',
  //       '',
  //     );
  //   } catch (err) {
  //     console.error('[sendSosPushToAdmins] sendPushNotification error:', err);
  //     incidentService.saveAllTypeQuerylogs(
  //       adminId,
  //       '',
  //       'SOS_PUSH',
  //       'FCM',
  //       requestAssistanceid,
  //       'SEND_FAILED',
  //       '',
  //       '',
  //       '',
  //       '',
  //       String((err && err.message) || ''),
  //     );
  //   }
  // });
  await Promise.allSettled(pushTasks);
}

module.exports = { sendPushNotification, getFcmTokensForUsers, sendSosPushToAdmins };
