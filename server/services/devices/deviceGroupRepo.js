/**
 * Data access for device integrations. All queries are parameterised.
 * Tables: DEVICE_INTEGRATION, DEVICE_GROUP, INCIDENT_DEVICE_RECIPIENT, DEVICE_ALERT_LOG
 * (server/migrations/device-integrations.sql).
 */
const sql = require("mssql");
const { executeWithRetry } = require("../../db");
const secrets = require("../../utils/deviceSecrets");
const defs = require("./definitions");

const q = (query, inputs, label) => executeWithRetry(query, inputs, { label: label || "deviceGroupRepo" });

const parseJson = (s, fallback) => {
  if (!s) return fallback;
  try {
    return JSON.parse(s);
  } catch (e) {
    return fallback;
  }
};

/** DB row -> group object (secrets decrypted only when asked). */
const toGroup = (row, { withSecrets = false } = {}) => {
  if (!row) return null;
  const g = {
    id: row.id,
    publicId: row.public_id,
    tenantId: row.tenant_id,
    type: row.type,
    name: row.name,
    vendor: row.vendor,
    values: parseJson(row.config_json, {}),
    notify: { incident: !!row.notify_incident, followup: !!row.notify_followup },
    devices: parseJson(row.devices_json, []),
    verifiedAt: row.verified_at,
    lastVerifyResult: row.last_verify_result,
    country: row.country,
    city: row.city,
    lastTestAlertAt: row.last_test_alert_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
  g.values.name = row.name;
  if (row.type === "alarms") {
    g.values.country = row.country || "All";
    g.values.city = row.city || "All";
  }
  const sec = row.secrets_enc ? secrets.decryptJson(row.secrets_enc) : {};
  g.hasSecret = defs.secretFlags(row.type, sec);
  if (withSecrets) {
    g.secrets = sec;
    g.apiKey = row.api_key_enc ? secrets.decrypt(row.api_key_enc) : null;
  }
  return g;
};

/* ------------------------------------------------------------------ */
/* Tenant lookup                                                       */
/* ------------------------------------------------------------------ */

const getTenantIdForTeam = async (teamId) => {
  const r = await q(
    `SELECT TOP 1 user_tenant_id FROM MSTeamsInstallationDetails WHERE team_id = @teamId`,
    { teamId: { type: sql.VarChar(100), value: String(teamId || "") } },
    "getTenantIdForTeam",
  );
  return r.recordset[0]?.user_tenant_id || null;
};

/**
 * Role + tenant for the device endpoints in ONE parameterised query (same rules as
 * dbOperations.isAdminUser / isWhoCanCreateIncident). Throws on DB errors, so a pool
 * timeout surfaces as "busy" instead of looking like "not an admin".
 */
const getTeamRole = async (userId, teamId) => {
  const r = await q(
    `SELECT TOP 1 user_tenant_id,
       MAX(CASE WHEN user_obj_id = @u OR super_users LIKE @like THEN 1 ELSE 0 END) OVER () AS is_admin,
       MAX(CASE WHEN WHO_CAN_CREATE_INCIDENT LIKE @like THEN 1 ELSE 0 END) OVER () AS can_create
     FROM MSTeamsInstallationDetails
     WHERE team_id = @t AND uninstallation_date IS NULL`,
    {
      u: { type: sql.VarChar(255), value: String(userId) },
      like: { type: sql.NVarChar(300), value: `%${String(userId)}%` },
      t: { type: sql.VarChar(255), value: String(teamId) },
    },
    "getTeamRole",
  );
  const row = r.recordset[0];
  if (!row) return null;
  return { tenantId: row.user_tenant_id, isAdmin: !!row.is_admin, canCreate: !!row.can_create };
};

/* ------------------------------------------------------------------ */
/* Integrations (on/off)                                               */
/* ------------------------------------------------------------------ */

const getIntegrationFlags = async (tenantId) => {
  const r = await q(
    `SELECT type, enabled FROM DEVICE_INTEGRATION WHERE tenant_id = @tenantId`,
    { tenantId: { type: sql.VarChar(255), value: tenantId } },
  );
  const out = {};
  defs.TYPES.forEach((t) => (out[t] = false));
  r.recordset.forEach((row) => (out[row.type] = !!row.enabled));
  return out;
};

const setIntegrationEnabled = async (tenantId, type, enabled, updatedBy) => {
  await q(
    `MERGE DEVICE_INTEGRATION AS t
     USING (SELECT @tenantId AS tenant_id, @type AS type) AS s
       ON t.tenant_id = s.tenant_id AND t.type = s.type
     WHEN MATCHED THEN UPDATE SET enabled = @enabled, updated_at = SYSUTCDATETIME(), updated_by = @updatedBy
     WHEN NOT MATCHED THEN INSERT (tenant_id, type, enabled, updated_by) VALUES (@tenantId, @type, @enabled, @updatedBy);`,
    {
      tenantId: { type: sql.VarChar(255), value: tenantId },
      type: { type: sql.VarChar(20), value: type },
      enabled: { type: sql.Bit, value: enabled ? 1 : 0 },
      updatedBy: { type: sql.NVarChar(255), value: updatedBy || null },
    },
    "setIntegrationEnabled",
  );
};

/* ------------------------------------------------------------------ */
/* Groups                                                              */
/* ------------------------------------------------------------------ */

const listGroups = async (tenantId, { type, withSecrets = false } = {}) => {
  const r = await q(
    `SELECT * FROM DEVICE_GROUP
     WHERE tenant_id = @tenantId AND is_deleted = 0 ${type ? "AND type = @type" : ""}
     ORDER BY type, created_at`,
    {
      tenantId: { type: sql.VarChar(255), value: tenantId },
      ...(type ? { type: { type: sql.VarChar(20), value: type } } : {}),
    },
    "listGroups",
  );
  return r.recordset.map((row) => toGroup(row, { withSecrets }));
};

const getGroup = async (id, { tenantId, withSecrets = false } = {}) => {
  const r = await q(
    `SELECT * FROM DEVICE_GROUP WHERE id = @id AND is_deleted = 0 ${tenantId ? "AND tenant_id = @tenantId" : ""}`,
    {
      id: { type: sql.UniqueIdentifier, value: id },
      ...(tenantId ? { tenantId: { type: sql.VarChar(255), value: tenantId } } : {}),
    },
    "getGroup",
  );
  return toGroup(r.recordset[0], { withSecrets });
};

const getGroupByPublicId = async (publicId) => {
  const r = await q(
    `SELECT * FROM DEVICE_GROUP WHERE public_id = @publicId AND is_deleted = 0`,
    { publicId: { type: sql.VarChar(40), value: String(publicId || "") } },
    "getGroupByPublicId",
  );
  return toGroup(r.recordset[0], { withSecrets: true });
};

const isNameTaken = async (tenantId, type, name, exceptId) => {
  const r = await q(
    `SELECT TOP 1 id FROM DEVICE_GROUP
     WHERE tenant_id = @tenantId AND type = @type AND is_deleted = 0
       AND LOWER(LTRIM(RTRIM(name))) = LOWER(LTRIM(RTRIM(@name)))
       ${exceptId ? "AND id <> @exceptId" : ""}`,
    {
      tenantId: { type: sql.VarChar(255), value: tenantId },
      type: { type: sql.VarChar(20), value: type },
      name: { type: sql.NVarChar(100), value: name },
      ...(exceptId ? { exceptId: { type: sql.UniqueIdentifier, value: exceptId } } : {}),
    },
    "isNameTaken",
  );
  return r.recordset.length > 0;
};

/**
 * Insert or update a group.
 * `values` = non-secret values (incl. name, and for alarms country/city)
 * `secretsObj` = full secrets to store (already merged with stored ones)
 */
const saveGroup = async ({ id, tenantId, type, values, secretsObj, notify, devices, verifyText, verified, user }) => {
  const config = { ...values };
  delete config.name;
  delete config.country;
  delete config.city;
  const common = {
    tenantId: { type: sql.VarChar(255), value: tenantId },
    type: { type: sql.VarChar(20), value: type },
    name: { type: sql.NVarChar(100), value: values.name },
    vendor: { type: sql.VarChar(20), value: defs.vendorOf(type, values) },
    config: { type: sql.NVarChar(sql.MAX), value: JSON.stringify(config) },
    secretsEnc: { type: sql.NVarChar(sql.MAX), value: secrets.encryptJson(secretsObj) },
    nInc: { type: sql.Bit, value: notify?.incident === false ? 0 : 1 },
    nFol: { type: sql.Bit, value: notify?.followup === false ? 0 : 1 },
    devices: { type: sql.NVarChar(sql.MAX), value: devices ? JSON.stringify(devices) : null },
    verifyText: { type: sql.NVarChar(500), value: verifyText ? String(verifyText).slice(0, 500) : null },
    verified: { type: sql.Bit, value: verified ? 1 : 0 },
    country: { type: sql.NVarChar(255), value: type === "alarms" ? values.country || "All" : null },
    city: { type: sql.NVarChar(255), value: type === "alarms" ? values.city || "All" : null },
    user: { type: sql.NVarChar(255), value: user || null },
  };

  if (id) {
    await q(
      `UPDATE DEVICE_GROUP SET
         name = @name, vendor = @vendor, config_json = @config, secrets_enc = @secretsEnc,
         notify_incident = @nInc, notify_followup = @nFol,
         devices_json = COALESCE(@devices, devices_json),
         verified_at = CASE WHEN @verified = 1 THEN SYSUTCDATETIME() ELSE verified_at END,
         last_verify_result = COALESCE(@verifyText, last_verify_result),
         country = @country, city = @city,
         updated_at = SYSUTCDATETIME(), updated_by = @user
       WHERE id = @id AND tenant_id = @tenantId AND type = @type AND is_deleted = 0`,
      { ...common, id: { type: sql.UniqueIdentifier, value: id } },
      "updateGroup",
    );
    return getGroup(id, { tenantId });
  }

  const isAlarm = type === "alarms";
  const r = await q(
    `INSERT INTO DEVICE_GROUP
       (public_id, tenant_id, type, name, vendor, config_json, secrets_enc, notify_incident, notify_followup,
        devices_json, verified_at, last_verify_result, api_key_enc, country, city, created_by, updated_by)
     OUTPUT INSERTED.id
     VALUES (@publicId, @tenantId, @type, @name, @vendor, @config, @secretsEnc, @nInc, @nFol,
        @devices, CASE WHEN @verified = 1 THEN SYSUTCDATETIME() ELSE NULL END, @verifyText, @apiKeyEnc,
        @country, @city, @user, @user)`,
    {
      ...common,
      publicId: { type: sql.VarChar(40), value: secrets.newPublicId() },
      apiKeyEnc: { type: sql.NVarChar(500), value: isAlarm ? secrets.encrypt(secrets.newAlarmApiKey()) : null },
    },
    "insertGroup",
  );
  return getGroup(r.recordset[0].id, { tenantId });
};

const softDeleteGroup = async (tenantId, id, user) => {
  await q(
    `UPDATE DEVICE_GROUP SET is_deleted = 1, updated_at = SYSUTCDATETIME(), updated_by = @user
     WHERE id = @id AND tenant_id = @tenantId`,
    {
      id: { type: sql.UniqueIdentifier, value: id },
      tenantId: { type: sql.VarChar(255), value: tenantId },
      user: { type: sql.NVarChar(255), value: user || null },
    },
    "softDeleteGroup",
  );
};

const regenerateAlarmKey = async (tenantId, id, user) => {
  const key = secrets.newAlarmApiKey();
  await q(
    `UPDATE DEVICE_GROUP SET api_key_enc = @k, updated_at = SYSUTCDATETIME(), updated_by = @user
     WHERE id = @id AND tenant_id = @tenantId AND type = 'alarms' AND is_deleted = 0`,
    {
      k: { type: sql.NVarChar(500), value: secrets.encrypt(key) },
      id: { type: sql.UniqueIdentifier, value: id },
      tenantId: { type: sql.VarChar(255), value: tenantId },
      user: { type: sql.NVarChar(255), value: user || null },
    },
    "regenerateAlarmKey",
  );
  return key;
};

/* ------------------------------------------------------------------ */
/* Alarm alert log                                                     */
/* ------------------------------------------------------------------ */

const logAlert = async ({ groupId, isTest, format, alertRef, raw, result, sosId }) => {
  await q(
    `INSERT INTO DEVICE_ALERT_LOG (group_id, is_test, payload_format, alert_ref, raw_payload, result, sos_id)
     VALUES (@g, @t, @f, @ref, @raw, @res, @sos)`,
    {
      g: { type: sql.UniqueIdentifier, value: groupId },
      t: { type: sql.Bit, value: isTest ? 1 : 0 },
      f: { type: sql.VarChar(10), value: format || null },
      ref: { type: sql.NVarChar(255), value: alertRef ? String(alertRef).slice(0, 255) : null },
      raw: { type: sql.NVarChar(sql.MAX), value: raw ? String(raw).slice(0, 20000) : null },
      res: { type: sql.VarChar(20), value: result },
      sos: { type: sql.Int, value: sosId || null },
    },
    "logAlert",
  );
  if (isTest && result === "test") {
    await q(`UPDATE DEVICE_GROUP SET last_test_alert_at = SYSUTCDATETIME() WHERE id = @g`, {
      g: { type: sql.UniqueIdentifier, value: groupId },
    });
  }
};

/** Has an alert with this ref (or any alert, when no ref) for this group started an SOS in the last N seconds? */
const isDuplicateAlert = async (groupId, alertRef, windowSeconds = 120) => {
  const r = await q(
    `SELECT TOP 1 id FROM DEVICE_ALERT_LOG
     WHERE group_id = @g AND result = 'sos_started' AND alert_ref = @ref
       AND received_at > DATEADD(second, -@w, SYSUTCDATETIME())`,
    {
      g: { type: sql.UniqueIdentifier, value: groupId },
      ref: { type: sql.NVarChar(255), value: String(alertRef).slice(0, 255) },
      w: { type: sql.Int, value: windowSeconds },
    },
    "isDuplicateAlert",
  );
  return r.recordset.length > 0;
};

const countRecentSosAlerts = async (groupId, windowSeconds = 60) => {
  const r = await q(
    `SELECT COUNT(*) AS n FROM DEVICE_ALERT_LOG
     WHERE group_id = @g AND result = 'sos_started' AND received_at > DATEADD(second, -@w, SYSUTCDATETIME())`,
    { g: { type: sql.UniqueIdentifier, value: groupId }, w: { type: sql.Int, value: windowSeconds } },
    "countRecentSosAlerts",
  );
  return r.recordset[0]?.n || 0;
};

/** For Alarms "Verify": what arrived since `since` (ISO)? */
const getAlertTestStatus = async (groupId, since) => {
  const r = await q(
    `SELECT TOP 1 result, is_test, received_at FROM DEVICE_ALERT_LOG
     WHERE group_id = @g AND received_at >= @since AND result IN ('test', 'auth_failed')
     ORDER BY CASE result WHEN 'test' THEN 0 ELSE 1 END, received_at DESC`,
    { g: { type: sql.UniqueIdentifier, value: groupId }, since: { type: sql.DateTime2, value: new Date(since) } },
    "getAlertTestStatus",
  );
  const row = r.recordset[0];
  if (!row) return { status: "waiting" };
  return { status: row.result === "test" ? "received" : "auth_failed", at: row.received_at };
};

/* ------------------------------------------------------------------ */
/* Incident device recipients                                          */
/* ------------------------------------------------------------------ */

const saveIncidentRecipients = async (incidentId, rows, deviceMessage) => {
  for (const row of rows) {
    await q(
      `INSERT INTO INCIDENT_DEVICE_RECIPIENT (incident_id, group_id, device_ref, device_label, device_message)
       VALUES (@inc, @g, @ref, @label, @msg)`,
      {
        inc: { type: sql.Int, value: Number(incidentId) },
        g: { type: sql.UniqueIdentifier, value: row.groupId },
        ref: { type: sql.NVarChar(500), value: String(row.ref).slice(0, 500) },
        label: { type: sql.NVarChar(500), value: row.label ? String(row.label).slice(0, 500) : null },
        msg: { type: sql.NVarChar(1000), value: deviceMessage ? String(deviceMessage).slice(0, 1000) : null },
      },
      "saveIncidentRecipients",
    );
  }
};

const clearIncidentRecipients = async (incidentId) => {
  await q(`DELETE FROM INCIDENT_DEVICE_RECIPIENT WHERE incident_id = @inc`, {
    inc: { type: sql.Int, value: Number(incidentId) },
  });
};

const getIncidentRecipients = async (incidentId) => {
  const r = await q(
    `SELECT group_id, device_ref, device_label, device_message
     FROM INCIDENT_DEVICE_RECIPIENT WHERE incident_id = @inc`,
    { inc: { type: sql.Int, value: Number(incidentId) } },
    "getIncidentRecipients",
  );
  return r.recordset;
};

/** Audio Broadcast calls are billed by Twilio: count them like Voice calls. */
const incrementVoiceCallCount = async (tenantId) => {
  if (!tenantId) return;
  await q(
    `UPDATE MSTeamsInstallationDetails
     SET SENT_VOICE_CALL_COUNT = ISNULL(SENT_VOICE_CALL_COUNT, 0) + 1
     WHERE user_tenant_id = @tenantId AND ISNULL(isDeleted, 0) = 0`,
    { tenantId: { type: sql.VarChar(255), value: tenantId } },
    "incrementVoiceCallCount",
  );
};

module.exports = {
  getTeamRole,
  incrementVoiceCallCount,
  getTenantIdForTeam,
  getIntegrationFlags,
  setIntegrationEnabled,
  listGroups,
  getGroup,
  getGroupByPublicId,
  isNameTaken,
  saveGroup,
  softDeleteGroup,
  regenerateAlarmKey,
  logAlert,
  isDuplicateAlert,
  countRecentSosAlerts,
  getAlertTestStatus,
  saveIncidentRecipients,
  clearIncidentRecipients,
  getIncidentRecipients,
};
