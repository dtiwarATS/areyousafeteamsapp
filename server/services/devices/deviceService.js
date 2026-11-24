/**
 * Business logic behind the Settings › Integrations device endpoints.
 * Routes: server/devices/deviceRoutes.js. Design: SC_Teams/docs/DEVICE_INTEGRATIONS_DESIGN.md
 */
const crypto = require("crypto");
const repo = require("./deviceGroupRepo");
const defs = require("./definitions");
const adapters = require("./adapters");
require("./deviceDispatcher"); // registers the Audio Broadcast billing hook

const VERIFY_TOKEN_TTL_MS = 30 * 60 * 1000;
const MAX_DEVICES = 2000;

class DeviceError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const alertBaseUrl = () =>
  String(process.env.DEVICE_ALERTS_BASE_URL || process.env.serviceUrl || "").replace(/\/+$/, "") + "/v1/alerts/";

/** Group as sent to the Tab: never includes secrets or the alarm key. */
const toPublic = (g) => ({
  id: g.id,
  type: g.type,
  name: g.name,
  vendor: g.vendor,
  values: g.values,
  notify: g.notify,
  hasSecret: g.hasSecret,
  deviceCount: (g.devices || []).length,
  summary: defs.summaryOf(g.type, g.values),
  verifiedAt: g.verifiedAt,
  lastVerifyResult: g.lastVerifyResult,
  updatedAt: g.updatedAt,
  updatedBy: g.updatedBy,
  ...(g.type === "alarms" ? { alertUrl: alertBaseUrl() + g.publicId, lastTestAlertAt: g.lastTestAlertAt } : {}),
});

/* --------------------------- verify token (signed) -------------------------- */

const tokenKey = () => {
  const raw = process.env.DEVICE_SECRETS_KEY;
  if (!raw) throw new DeviceError(500, "DEVICE_SECRETS_KEY is not set.");
  return Buffer.from(raw, "base64");
};

const configHash = (tenantId, type, values, secretsObj) => {
  const stable = (o) =>
    JSON.stringify(
      Object.keys(o || {})
        .sort()
        .reduce((a, k) => ((a[k] = o[k]), a), {}),
    );
  const v = { ...values };
  delete v.name; // renaming doesn't need a new verify
  return crypto.createHash("sha256").update([tenantId, type, stable(v), stable(secretsObj)].join("|")).digest("base64url");
};

const signToken = (hash, kind) => {
  const payload = Buffer.from(JSON.stringify({ h: hash, k: kind, e: Date.now() + VERIFY_TOKEN_TTL_MS })).toString("base64url");
  const sig = crypto.createHmac("sha256", tokenKey()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
};

const checkToken = (token, hash) => {
  const [payload, sig] = String(token || "").split(".");
  if (!payload || !sig) return false;
  const expected = crypto.createHmac("sha256", tokenKey()).update(payload).digest("base64url");
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  try {
    const p = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return p.h === hash && p.e > Date.now() && (p.k === "success" || p.k === "warning");
  } catch (e) {
    return false;
  }
};

/* --------------------------------- helpers --------------------------------- */

const assertType = (type) => {
  if (!defs.TYPES.includes(type)) throw new DeviceError(400, "Unknown integration type.");
};

/**
 * Normalise what the Tab sent and merge stored secrets (blank password = keep the saved one).
 * Returns { values, secretsObj, stored } where secretsObj only keeps secrets visible for the vendor/mode.
 */
const prepare = async (tenantId, type, groupId, rawValues, rawSecrets) => {
  assertType(type);
  let stored = null;
  if (groupId) {
    stored = await repo.getGroup(groupId, { tenantId, withSecrets: true });
    if (!stored || stored.type !== type) throw new DeviceError(404, "Device group not found.");
  }
  const { values, secrets } = defs.normalize(type, rawValues || {}, rawSecrets || {});
  const merged = { ...(stored?.secrets || {}), ...secrets };
  const secretsObj = {};
  defs.DEFS[type].fields.forEach((f) => {
    if (f.secret && merged[f.k] && defs.DEFS[type].vendorKey == null) secretsObj[f.k] = merged[f.k];
    else if (f.secret && merged[f.k]) {
      const vk = defs.DEFS[type].vendorKey;
      if (!f.vendor || f.vendor.includes(values[vk])) secretsObj[f.k] = merged[f.k];
    }
  });
  return { values, secretsObj, stored };
};

const sanitizeDevices = (devices) =>
  (Array.isArray(devices) ? devices : [])
    .slice(0, MAX_DEVICES)
    .filter((d) => d && d.ref != null && String(d.ref).length)
    .map((d) => ({
      ref: String(d.ref).slice(0, 500),
      label: String(d.label || d.ref).slice(0, 500),
      meta: String(d.meta || "").slice(0, 200),
      // false = not reachable / not registered at Verify (hidden on New Incident). Missing = unknown → shown.
      ...(d.connected === false ? { connected: false } : {}),
    }));

/* ---------------------------------- API ----------------------------------- */

const getIntegrations = async (tenantId) => {
  const [enabled, groups] = await Promise.all([repo.getIntegrationFlags(tenantId), repo.listGroups(tenantId)]);
  return { enabled, groups: groups.map(toPublic), alertBaseUrl: alertBaseUrl() };
};

const setEnabled = async (tenantId, type, enabled, user) => {
  assertType(type);
  if (enabled) {
    const groups = await repo.listGroups(tenantId, { type });
    if (!groups.length) throw new DeviceError(400, "Add a device group before turning this on.");
  }
  await repo.setIntegrationEnabled(tenantId, type, !!enabled, user);
  return { type, enabled: !!enabled };
};

const verify = async (tenantId, { type, groupId, values: rawValues, secrets: rawSecrets, notify }) => {
  if (type === "alarms") throw new DeviceError(400, "Alarms & Sensors is verified with a test alert.");
  const { values, secretsObj, stored } = await prepare(tenantId, type, groupId, rawValues, rawSecrets);
  const errors = defs.validate(type, values, secretsObj, { notify: notify || { incident: true } });
  delete errors.name; // name isn't needed to verify
  delete errors._notify;
  if (Object.keys(errors).length) {
    return { kind: "error", text: "Fix the highlighted fields, then verify again.", summary: "Fix the highlighted fields", errors };
  }

  const result = await adapters[type].verify({ tenantId, values, secrets: secretsObj });
  const devices = sanitizeDevices(result.devices);
  const hash = configHash(tenantId, type, values, secretsObj);
  const out = { kind: result.kind, text: result.text, summary: result.summary || result.text, deviceCount: devices.length, devices };
  if (result.kind !== "error") out.verifyToken = signToken(hash, result.kind);

  // Re-verifying a saved group with unchanged connection settings refreshes its saved device list
  // straight away (which phones are registered / speakers respond), so New Incident shows the right
  // devices without the admin having to change a field just to enable Save.
  if (stored && result.kind !== "error" && devices.length) {
    const storedHash = configHash(tenantId, type, { ...stored.values }, stored.secrets || {});
    if (storedHash === hash) {
      await repo.updateSnapshot(tenantId, stored.id, devices, result.text);
      out.savedSnapshot = true;
    }
  }
  return out;
};

const save = async (tenantId, user, { type, groupId, values: rawValues, secrets: rawSecrets, notify, verifyToken, devices, verifyText }) => {
  const { values, secretsObj, stored } = await prepare(tenantId, type, groupId, rawValues, rawSecrets);
  const nameTakenFlag = await repo.isNameTaken(tenantId, type, values.name || "", groupId || null);
  const errors = defs.validate(type, values, secretsObj, {
    nameTaken: () => nameTakenFlag,
    notify: notify || { incident: true, followup: true },
  });
  if (Object.keys(errors).length) throw new DeviceError(400, "Fix the highlighted fields.", { errors });

  let snapshot = null;
  let verified = false;
  if (type !== "alarms") {
    const hash = configHash(tenantId, type, values, secretsObj);
    const unchanged =
      stored && configHash(tenantId, type, { ...stored.values }, stored.secrets || {}) === hash && !!stored.verifiedAt;
    if (checkToken(verifyToken, hash)) {
      verified = true;
      snapshot = sanitizeDevices(devices);
      if (!snapshot.length) throw new DeviceError(400, "Verify the connection before saving.");
    } else if (!unchanged) {
      throw new DeviceError(400, "Verify the connection before saving.");
    }
    // unchanged connection settings (e.g. only name / notifications edited) keep the stored snapshot
  }

  const group = await repo.saveGroup({
    id: groupId || null,
    tenantId,
    type,
    values,
    secretsObj,
    notify: type === "alarms" ? { incident: true, followup: true } : notify,
    devices: snapshot,
    verifyText: verified ? verifyText || null : null,
    verified,
    user,
  });
  // Saving the first group turns the integration on (mockup).
  await repo.setIntegrationEnabled(tenantId, type, true, user);
  return toPublic(group);
};

const remove = async (tenantId, user, groupId) => {
  const group = await repo.getGroup(groupId, { tenantId });
  if (!group) throw new DeviceError(404, "Device group not found.");
  await repo.softDeleteGroup(tenantId, groupId, user);
  const left = await repo.listGroups(tenantId, { type: group.type });
  let integrationTurnedOff = false;
  if (!left.length) {
    await repo.setIntegrationEnabled(tenantId, group.type, false, user);
    integrationTurnedOff = true;
  }
  return { deleted: true, type: group.type, integrationTurnedOff };
};

const getAlarmKey = async (tenantId, groupId) => {
  const g = await repo.getGroup(groupId, { tenantId, withSecrets: true });
  if (!g || g.type !== "alarms") throw new DeviceError(404, "Device group not found.");
  return { apiKey: g.apiKey, alertUrl: alertBaseUrl() + g.publicId };
};

const regenerateAlarmKey = async (tenantId, user, groupId) => {
  const g = await repo.getGroup(groupId, { tenantId });
  if (!g || g.type !== "alarms") throw new DeviceError(404, "Device group not found.");
  const apiKey = await repo.regenerateAlarmKey(tenantId, groupId, user);
  return { apiKey, alertUrl: alertBaseUrl() + g.publicId };
};

const alarmTestStatus = async (tenantId, groupId, since) => {
  const g = await repo.getGroup(groupId, { tenantId });
  if (!g || g.type !== "alarms") throw new DeviceError(404, "Device group not found.");
  const t = Date.parse(since);
  if (!Number.isFinite(t)) throw new DeviceError(400, "Invalid 'since'.");
  const s = await repo.getAlertTestStatus(groupId, new Date(t).toISOString());
  if (s.status === "received") return { ...s, kind: "success", text: "Test alert received. No SOS was started." };
  if (s.status === "auth_failed")
    return { ...s, kind: "error", text: "A test alert arrived with a wrong API key. Copy the key again into your system." };
  return s;
};

/** Data for the New Incident "Select Device Recipients" picker. */
const getRecipients = async (tenantId) => {
  const [enabled, groups] = await Promise.all([repo.getIntegrationFlags(tenantId), repo.listGroups(tenantId)]);
  // Only: integration switched on · group verified · ticked for incidents · devices that were
  // connected at the last Verify (registered phone, responding speaker/player). Empty groups are hidden.
  return {
    groups: groups
      .filter((g) => g.type !== "alarms" && enabled[g.type] && g.notify.incident && g.verifiedAt)
      .map((g) => ({
        id: g.id,
        type: g.type,
        integration: defs.TYPE_LABELS[g.type],
        name: g.name,
        devices: (g.devices || []).filter((d) => d.connected !== false),
      }))
      .filter((g) => g.devices.length > 0),
  };
};

/**
 * Validate + store the devices picked on New Incident.
 * selection: [{ groupId, deviceRefs: [] }]
 */
const saveIncidentSelection = async (tenantId, incidentId, selection, deviceMessage) => {
  if (!Array.isArray(selection) || !selection.length) return { saved: 0 };
  const { groups } = await getRecipients(tenantId);
  const byId = new Map(groups.map((g) => [String(g.id).toLowerCase(), g]));
  const rows = [];
  selection.forEach((sel) => {
    const g = byId.get(String(sel?.groupId || "").toLowerCase());
    if (!g) return; // not this tenant's / disabled / not ticked for incidents
    const known = new Map(g.devices.map((d) => [String(d.ref), d]));
    [...new Set((sel.deviceRefs || []).map(String))].forEach((ref) => {
      const d = known.get(ref);
      if (d) rows.push({ groupId: g.id, ref: d.ref, label: d.label });
    });
  });
  if (rows.length) await repo.saveIncidentRecipients(incidentId, rows, deviceMessage);
  return { saved: rows.length };
};

/** Incident list: { incId: {total, sent, failed, pending} } for incidents with devices. */
const getDeliverySummaries = async (userId, incIds) => repo.getDeliverySummaries(userId, incIds);

/** "Devices" dialog: one row per device picked for the incident, failed first. */
const getDeliveryDetails = async (userId, incId) => {
  if (!Number.isInteger(Number(incId)) || Number(incId) <= 0) throw new DeviceError(400, "incId is required.");
  const rows = await repo.getDeliveryDetails(userId, incId);
  if (rows === null) throw new DeviceError(403, "You can't see this incident.");
  const metaCache = new Map();
  const order = { failed: 0, pending: 1, sent: 2 };
  const devices = rows.map((r) => {
    const gid = String(r.group_id);
    if (!metaCache.has(gid)) {
      let list = [];
      try {
        list = JSON.parse(r.devices_json || "[]");
      } catch (e) {
        /* ignore */
      }
      metaCache.set(gid, new Map(list.map((d) => [String(d.ref), d])));
    }
    const d = metaCache.get(gid).get(String(r.device_ref)) || {};
    const status = r.st === "sent" ? "sent" : r.st === "failed" ? "failed" : "sending";
    return {
      ref: r.device_ref,
      name: r.device_label || d.label || r.device_ref,
      group: r.type ? `${defs.TYPE_LABELS[r.type] || r.type} – ${r.group_name}` : "Deleted device group",
      meta: d.meta || "",
      status,
      reason: status === "failed" ? r.send_error || "Not sent." : "",
      sentAt: r.sent_at,
    };
  });
  devices.sort((a, b) => order[a.status === "sending" ? "pending" : a.status] - order[b.status === "sending" ? "pending" : b.status]);
  return {
    total: devices.length,
    sent: devices.filter((d) => d.status === "sent").length,
    failed: devices.filter((d) => d.status === "failed").length,
    sending: devices.filter((d) => d.status === "sending").length,
    devices,
  };
};

module.exports = {
  DeviceError,
  getIntegrations,
  setEnabled,
  verify,
  save,
  remove,
  getAlarmKey,
  regenerateAlarmKey,
  alarmTestStatus,
  getRecipients,
  saveIncidentSelection,
  getDeliverySummaries,
  getDeliveryDetails,
  alertBaseUrl,
};
