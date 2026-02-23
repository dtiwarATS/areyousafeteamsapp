const path = require('path');
const fs = require('fs');

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

module.exports = { sendPushNotification };
