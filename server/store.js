const sql = require("mssql");
const poolPromise = require("./db/dbConn");

function isUniqueViolation(err) {
  const msg = String(err?.message || "");
  return (
    err?.number === 2627 ||
    err?.number === 2601 ||
    /UNIQUE KEY|duplicate key/i.test(msg)
  );
}

/**
 * Save or update an FCM token for a user+platform in DB.
 * Safe against UNIQUE (user_id, fcm_token) — updates existing rows; insert only when needed.
 * @param {string} userId
 * @param {string} fcmToken
 * @param {string} platform - e.g. "android" | "ios"
 * @param {object} [deviceInfo]
 */
async function saveToken(userId, fcmToken, platform, deviceInfo = {}) {
  if (!userId || !fcmToken) {
    throw new Error("userId and fcmToken are required");
  }

  const normalizedPlatform = platform || "android";
  const tokenValue =
    typeof fcmToken === "string" && fcmToken.length > 500
      ? fcmToken.slice(0, 500)
      : fcmToken;

  const pool = await poolPromise;

  const bind = (req) => {
    req.input("user_id", sql.VarChar(256), userId);
    req.input("fcm_token", sql.VarChar(500), tokenValue);
    req.input("platform", sql.VarChar(20), normalizedPlatform);
    req.input(
      "os_version",
      sql.Int,
      Number.isInteger(deviceInfo?.osVersion) ? deviceInfo.osVersion : null,
    );
    req.input(
      "device_brand",
      sql.VarChar(50),
      deviceInfo?.deviceBrand || null,
    );
    req.input(
      "device_manufacturer",
      sql.VarChar(50),
      deviceInfo?.deviceManufacturer || null,
    );
    req.input(
      "device_model",
      sql.VarChar(100),
      deviceInfo?.deviceModel || null,
    );
    req.input(
      "auth_status",
      sql.TinyInt,
      Number.isInteger(deviceInfo?.authStatus) ? deviceInfo.authStatus : null,
    );
    return req;
  };

  // 1) Update existing (user_id, fcm_token) pair — satisfies uk_user_id_fcm_token
  let result = await bind(pool.request()).query(`
    UPDATE user_fcm_tokens
    SET
      platform = @platform,
      os_version = COALESCE(@os_version, os_version),
      device_brand = COALESCE(@device_brand, device_brand),
      device_manufacturer = COALESCE(@device_manufacturer, device_manufacturer),
      device_model = COALESCE(@device_model, device_model),
      auth_status = COALESCE(@auth_status, auth_status),
      updated_at = SYSUTCDATETIME()
    WHERE user_id = @user_id AND fcm_token = @fcm_token;
    SELECT @@ROWCOUNT AS rowsAffected;
  `);
  if ((result?.recordset?.[0]?.rowsAffected || 0) > 0) return;

  // 2) Reassign existing token row to this user (token moved devices/users)
  result = await bind(pool.request()).query(`
    UPDATE user_fcm_tokens
    SET
      user_id = @user_id,
      platform = @platform,
      os_version = COALESCE(@os_version, os_version),
      device_brand = COALESCE(@device_brand, device_brand),
      device_manufacturer = COALESCE(@device_manufacturer, device_manufacturer),
      device_model = COALESCE(@device_model, device_model),
      auth_status = COALESCE(@auth_status, auth_status),
      updated_at = SYSUTCDATETIME()
    WHERE fcm_token = @fcm_token;
    SELECT @@ROWCOUNT AS rowsAffected;
  `);
  if ((result?.recordset?.[0]?.rowsAffected || 0) > 0) return;

  // 3) Replace token on this user's platform row (if any)
  result = await bind(pool.request()).query(`
    UPDATE user_fcm_tokens
    SET
      fcm_token = @fcm_token,
      os_version = COALESCE(@os_version, os_version),
      device_brand = COALESCE(@device_brand, device_brand),
      device_manufacturer = COALESCE(@device_manufacturer, device_manufacturer),
      device_model = COALESCE(@device_model, device_model),
      auth_status = COALESCE(@auth_status, auth_status),
      updated_at = SYSUTCDATETIME()
    WHERE user_id = @user_id AND platform = @platform;
    SELECT @@ROWCOUNT AS rowsAffected;
  `);
  if ((result?.recordset?.[0]?.rowsAffected || 0) > 0) return;

  // 4) Insert only when nothing matched
  try {
    await bind(pool.request()).query(`
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
    `);
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    // Race: another request inserted the same pair — treat as success via update
    await bind(pool.request()).query(`
      UPDATE user_fcm_tokens
      SET
        platform = @platform,
        auth_status = COALESCE(@auth_status, auth_status),
        updated_at = SYSUTCDATETIME()
      WHERE user_id = @user_id AND fcm_token = @fcm_token;
    `);
  }
}

/**
 * Get FCM token for a user. Prefer Android token, fallback to newest token.
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
  return result?.recordset?.[0]?.fcm_token || null;
}

/**
 * Remove a stale / unregistered FCM token so it is not used again.
 */
async function deleteTokenByValue(fcmToken) {
  if (!fcmToken) return 0;
  const pool = await poolPromise;
  const request = pool.request();
  const tokenValue =
    typeof fcmToken === "string" && fcmToken.length > 500
      ? fcmToken.slice(0, 500)
      : fcmToken;
  request.input("fcm_token", sql.VarChar(500), tokenValue);
  const result = await request.query(`
    DELETE FROM user_fcm_tokens
    WHERE fcm_token = @fcm_token
  `);
  return result?.rowsAffected?.[0] || 0;
}

module.exports = { saveToken, getToken, deleteTokenByValue };
