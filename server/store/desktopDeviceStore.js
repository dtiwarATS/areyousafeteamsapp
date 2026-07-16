const sql = require("mssql");
const poolPromise = require("../db/dbConn");

/**
 * @param {string} fingerprint
 * @returns {Promise<object|null>}
 */
async function getActiveDeviceByFingerprint(fingerprint) {
  if (!fingerprint) return null;

  const pool = await poolPromise;
  const result = await pool
    .request()
    .input("device_fingerprint", sql.NVarChar(256), fingerprint)
    .query(`
      SELECT TOP 1
        device_id,
        user_aadobject_id,
        tenant_id,
        team_id,
        machine_name,
        os_version,
        agent_version,
        [current_user],
        device_fingerprint,
        paired_at,
        last_seen_at,
        revoked_at,
        status
      FROM desktop_agent_devices
      WHERE device_fingerprint = @device_fingerprint
        AND revoked_at IS NULL
    `);

  return result?.recordset?.[0] || null;
}

/**
 * @param {{
 *   deviceId: string,
 *   userAadObjectId: string,
 *   tenantId: string,
 *   teamId: string,
 *   deviceMetadata: {
 *     machineName: string,
 *     osVersion: string,
 *     agentVersion: string,
 *     currentUser: string,
 *     deviceFingerprint: string,
 *   }
 * }} params
 */
async function upsertPairedDevice({
  deviceId,
  userAadObjectId,
  tenantId,
  teamId,
  deviceMetadata,
}) {
  const pool = await poolPromise;
  const request = pool.request();

  request.input("device_id", sql.UniqueIdentifier, deviceId);
  request.input("user_aadobject_id", sql.NVarChar(256), userAadObjectId);
  request.input("tenant_id", sql.NVarChar(64), tenantId);
  request.input("team_id", sql.NVarChar(256), teamId);
  request.input("machine_name", sql.NVarChar(128), deviceMetadata.machineName);
  request.input("os_version", sql.NVarChar(64), deviceMetadata.osVersion);
  request.input("agent_version", sql.NVarChar(32), deviceMetadata.agentVersion);
  request.input(
    "device_current_user",
    sql.NVarChar(128),
    deviceMetadata.currentUser,
  );
  request.input(
    "device_fingerprint",
    sql.NVarChar(256),
    deviceMetadata.deviceFingerprint,
  );

  await request.query(`
    IF EXISTS (
      SELECT 1
      FROM desktop_agent_devices
      WHERE device_fingerprint = @device_fingerprint
        AND revoked_at IS NULL
    )
    BEGIN
      UPDATE desktop_agent_devices
      SET
        device_id = @device_id,
        user_aadobject_id = @user_aadobject_id,
        tenant_id = @tenant_id,
        team_id = @team_id,
        machine_name = @machine_name,
        os_version = @os_version,
        agent_version = @agent_version,
        [current_user] = @device_current_user,
        paired_at = SYSUTCDATETIME(),
        last_seen_at = SYSUTCDATETIME(),
        revoked_at = NULL,
        socket_id = NULL,
        status = 'offline'
      WHERE device_fingerprint = @device_fingerprint
        AND revoked_at IS NULL;
    END
    ELSE
    BEGIN
      INSERT INTO desktop_agent_devices (
        device_id,
        user_aadobject_id,
        tenant_id,
        team_id,
        machine_name,
        os_version,
        agent_version,
        [current_user],
        device_fingerprint,
        paired_at,
        last_seen_at,
        status
      ) VALUES (
        @device_id,
        @user_aadobject_id,
        @tenant_id,
        @team_id,
        @machine_name,
        @os_version,
        @agent_version,
        @device_current_user,
        @device_fingerprint,
        SYSUTCDATETIME(),
        SYSUTCDATETIME(),
        'offline'
      );
    END
  `);
}

/**
 * @param {{ deviceId: string, userAadObjectId: string }} params
 * @returns {Promise<boolean>}
 */
async function revokeDevice({ deviceId, userAadObjectId }) {
  const pool = await poolPromise;
  const result = await pool
    .request()
    .input("device_id", sql.UniqueIdentifier, deviceId)
    .input("user_aadobject_id", sql.NVarChar(256), userAadObjectId)
    .query(`
      UPDATE desktop_agent_devices
      SET
        revoked_at = SYSUTCDATETIME(),
        status = 'offline',
        socket_id = NULL
      WHERE device_id = @device_id
        AND user_aadobject_id = @user_aadobject_id
        AND revoked_at IS NULL
    `);

  return (result?.rowsAffected?.[0] || 0) > 0;
}

/**
 * @param {string} deviceId
 * @returns {Promise<object|null>}
 */
async function getActiveDeviceById(deviceId) {
  if (!deviceId) return null;

  const pool = await poolPromise;
  const result = await pool
    .request()
    .input("device_id", sql.UniqueIdentifier, deviceId)
    .query(`
      SELECT TOP 1
        device_id,
        user_aadobject_id,
        tenant_id,
        team_id,
        machine_name,
        os_version,
        agent_version,
        [current_user],
        device_fingerprint,
        paired_at,
        last_seen_at,
        revoked_at,
        status,
        socket_id
      FROM desktop_agent_devices
      WHERE device_id = @device_id
        AND revoked_at IS NULL
    `);

  return result?.recordset?.[0] || null;
}

/**
 * @param {{ deviceId: string, socketId: string }} params
 */
async function setDeviceOnline({ deviceId, socketId }) {
  const pool = await poolPromise;
  await pool
    .request()
    .input("device_id", sql.UniqueIdentifier, deviceId)
    .input("socket_id", sql.NVarChar(128), socketId)
    .query(`
      UPDATE desktop_agent_devices
      SET
        socket_id = @socket_id,
        status = 'online',
        last_seen_at = SYSUTCDATETIME()
      WHERE device_id = @device_id
        AND revoked_at IS NULL
    `);
}

/**
 * @param {{ deviceId: string }} params
 */
async function setDeviceOffline({ deviceId }) {
  const pool = await poolPromise;
  await pool
    .request()
    .input("device_id", sql.UniqueIdentifier, deviceId)
    .query(`
      UPDATE desktop_agent_devices
      SET
        socket_id = NULL,
        status = 'offline',
        last_seen_at = SYSUTCDATETIME()
      WHERE device_id = @device_id
        AND revoked_at IS NULL
    `);
}

/**
 * @param {string[]} userAadObjectIds
 * @returns {Promise<Array<{ device_id: string, user_aadobject_id: string, tenant_id: string, socket_id: string | null }>>}
 */
async function getActiveDevicesByUserAadObjectIds(userAadObjectIds) {
  const ids = (userAadObjectIds || []).filter(
    (id) => typeof id === "string" && id.trim() !== "",
  );
  if (ids.length === 0) {
    return [];
  }

  const pool = await poolPromise;
  const request = pool.request();
  const paramNames = ids.map((id, index) => {
    const paramName = `user_aadobject_id_${index}`;
    request.input(paramName, sql.NVarChar(256), id.trim().toLowerCase());
    return `@${paramName}`;
  });

  const result = await request.query(`
    SELECT
      device_id,
      user_aadobject_id,
      tenant_id,
      socket_id
    FROM desktop_agent_devices
    WHERE LOWER(user_aadobject_id) IN (${paramNames.join(", ")})
      AND revoked_at IS NULL
  `);

  return result?.recordset || [];
}

/**
 * @param {string[]} userAadObjectIds
 * @returns {Promise<Array<{ device_id: string, user_aadobject_id: string, tenant_id: string, socket_id: string | null }>>}
 */
async function getActiveOnlineDevicesByUserAadObjectIds(userAadObjectIds) {
  const ids = (userAadObjectIds || []).filter(
    (id) => typeof id === "string" && id.trim() !== "",
  );
  if (ids.length === 0) {
    return [];
  }

  const pool = await poolPromise;
  const request = pool.request();
  const paramNames = ids.map((id, index) => {
    const paramName = `user_aadobject_id_${index}`;
    request.input(paramName, sql.NVarChar(256), id.trim());
    return `@${paramName}`;
  });

  const result = await request.query(`
    SELECT
      device_id,
      user_aadobject_id,
      tenant_id,
      socket_id
    FROM desktop_agent_devices
    WHERE user_aadobject_id IN (${paramNames.join(", ")})
      AND revoked_at IS NULL
      AND status = 'online'
  `);

  return result?.recordset || [];
}

/**
 * @param {{ deviceId: string }} params
 */
async function touchHeartbeat({ deviceId }) {
  const pool = await poolPromise;
  await pool
    .request()
    .input("device_id", sql.UniqueIdentifier, deviceId)
    .query(`
      UPDATE desktop_agent_devices
      SET last_seen_at = SYSUTCDATETIME()
      WHERE device_id = @device_id
        AND revoked_at IS NULL
    `);
}

module.exports = {
  getActiveDeviceByFingerprint,
  getActiveDeviceById,
  getActiveDevicesByUserAadObjectIds,
  getActiveOnlineDevicesByUserAadObjectIds,
  upsertPairedDevice,
  revokeDevice,
  setDeviceOnline,
  setDeviceOffline,
  touchHeartbeat,
};
