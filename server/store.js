const sql = require("mssql");
const poolPromise = require("./db/dbConn");

/**
 * Save or update an FCM token for a user+platform in DB.
 * @param {string} userId
 * @param {string} fcmToken
 * @param {string} platform - e.g. "android" | "ios"
 * @param {object} [deviceInfo] - optional { osVersion, deviceBrand, deviceManufacturer, deviceModel, authStatus }
 */
async function saveToken(userId, fcmToken, platform, deviceInfo = {}) {
  if (!userId || !fcmToken) {
    throw new Error("userId and fcmToken are required");
  }

  const normalizedPlatform = platform || "android";
  const pool = await poolPromise;
  const request = pool.request();

  request.input("user_id", sql.VarChar(256), userId);
  request.input("fcm_token", sql.VarChar(500), fcmToken);
  request.input("platform", sql.VarChar(20), normalizedPlatform);
  request.input(
    "os_version",
    sql.Int,
    Number.isInteger(deviceInfo?.osVersion) ? deviceInfo.osVersion : null,
  );
  request.input(
    "device_brand",
    sql.VarChar(50),
    deviceInfo?.deviceBrand || null,
  );
  request.input(
    "device_manufacturer",
    sql.VarChar(50),
    deviceInfo?.deviceManufacturer || null,
  );
  request.input(
    "device_model",
    sql.VarChar(100),
    deviceInfo?.deviceModel || null,
  );
  request.input(
    "auth_status",
    sql.TinyInt,
    Number.isInteger(deviceInfo?.authStatus) ? deviceInfo.authStatus : null,
  );

  await request.query(`
    IF EXISTS (
      SELECT 1
      FROM user_fcm_tokens
      WHERE user_id = @user_id AND platform = @platform
    )
    BEGIN
      UPDATE user_fcm_tokens
      SET
        fcm_token = @fcm_token,
        os_version = @os_version,
        device_brand = @device_brand,
        device_manufacturer = @device_manufacturer,
        device_model = @device_model,
        auth_status = @auth_status,
        updated_at = SYSUTCDATETIME()
      WHERE user_id = @user_id AND platform = @platform;
    END
    ELSE
    BEGIN
      INSERT INTO user_fcm_tokens (
        user_id,
        fcm_token,
        platform,
        os_version,
        device_brand,
        device_manufacturer,
        device_model,
        auth_status,
        created_at,
        updated_at
      ) VALUES (
        @user_id,
        @fcm_token,
        @platform,
        @os_version,
        @device_brand,
        @device_manufacturer,
        @device_model,
        @auth_status,
        SYSUTCDATETIME(),
        SYSUTCDATETIME()
      );
    END
  `);
}

/**
 * Get FCM token for a user. Prefer Android token, fallback to newest token.
 * @param {string} userId
 * @returns {Promise<string|null>} FCM token or null if not found
 */
async function getToken(userId) {
  if (!userId) return null;

  const pool = await poolPromise;
  const request = pool.request();
  request.input("user_id", sql.VarChar(256), userId);

  const result = await request.query(`
    SELECT TOP 1 fcm_token
    FROM user_fcm_tokens
    WHERE user_id = @user_id
    ORDER BY CASE WHEN platform = 'android' THEN 0 ELSE 1 END, updated_at DESC
  `);

  if (!result?.recordset?.length) return null;
  return result.recordset[0].fcm_token || null;
}

module.exports = { saveToken, getToken };
