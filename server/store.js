/**
 * In-memory store for FCM tokens (userId -> token + metadata).
 * For production, replace with a database table keyed by userId (e.g. MSSQL via server/db/dbConn.js).
 */
const tokensByUserId = new Map();

/**
 * Save or update FCM token for a user. Overwrites existing token for that userId.
 * @param {string} userId
 * @param {string} fcmToken
 * @param {string} platform - e.g. 'android' | 'ios'
 * @param {object} [deviceInfo] - optional { osVersion, deviceBrand, deviceManufacturer, deviceModel, authStatus }
 */
function saveToken(userId, fcmToken, platform, deviceInfo = {}) {
  tokensByUserId.set(userId, {
    fcmToken,
    platform: platform || 'android',
    deviceInfo: deviceInfo || {},
    updatedAt: new Date()
  });
  return Promise.resolve();
}

/**
 * Get the stored FCM token for a user.
 * @param {string} userId
 * @returns {Promise<string|null>} FCM token or null if not found
 */
function getToken(userId) {
  const entry = tokensByUserId.get(userId);
  return Promise.resolve(entry ? entry.fcmToken : null);
}

module.exports = { saveToken, getToken };
