/**
 * Settings › Integrations device endpoints + New Incident device recipients.
 * Registered from AreYouSafeTabHandler.handlerForSafetyBotTab.
 *
 * Every request carries userId (AAD object id) and teamId, like the rest of the tab API.
 * Settings endpoints require an admin of that team; the recipients list also allows users
 * who may create incidents.
 */
const express = require("express");
const repo = require("../services/devices/deviceGroupRepo");
const svc = require("../services/devices/deviceService");
const { processSafetyBotError } = require("../models/processError");

const router = express.Router();
const BASE = "/areyousafetabhandler/devices";

const param = (req, k) => {
  const v = req.body?.[k] ?? req.query?.[k];
  return v == null || v === "null" || v === "undefined" ? null : String(v);
};

/* Role cache: (userId, teamId) → { tenantId, isAdmin, canCreate } for 60 s. Saves the role
   queries on every panel / picker call (the app DB pool is small and was timing out). */
const ROLE_TTL_MS = 60 * 1000;
const roleCache = new Map();
const getRoleCached = async (userId, teamId) => {
  const key = `${userId}|${teamId}`;
  const hit = roleCache.get(key);
  if (hit && hit.exp > Date.now()) return hit.role;
  const role = await repo.getTeamRole(userId, teamId); // throws on DB error
  roleCache.set(key, { role, exp: Date.now() + ROLE_TTL_MS });
  if (roleCache.size > 5000) roleCache.delete(roleCache.keys().next().value);
  return role;
};

/** Resolves tenant + checks the caller's role. `allowCreators` also admits incident creators. */
const guard = (allowCreators = false) => async (req, res, next) => {
  const userId = param(req, "userId");
  const teamId = param(req, "teamId");
  if (!userId || !teamId) return res.status(400).json({ error: "userId and teamId are required." });
  let role;
  try {
    role = await getRoleCached(userId, teamId);
  } catch (err) {
    // DB busy / pool timeout: tell the Tab to retry instead of pretending the user isn't an admin.
    processSafetyBotError(err, teamId, "", userId, "devices guard (role lookup)");
    return res.status(503).json({ error: "The server is busy. Try again in a moment.", retry: true });
  }
  if (!role) return res.status(404).json({ error: "Team not found." });
  if (!role.isAdmin && !(allowCreators && role.canCreate)) {
    return res.status(403).json({ error: "Only admins can change integrations." });
  }
  req.device = { userId, teamId, tenantId: role.tenantId };
  next();
};

const handle = (label, fn) => async (req, res) => {
  try {
    res.json(await fn(req));
  } catch (err) {
    if (err instanceof svc.DeviceError) return res.status(err.status).json({ error: err.message, ...(err.extra || {}) });
    processSafetyBotError(err, req.device?.teamId || "", "", req.device?.userId || "", `${BASE}${label}`);
    res.status(500).json({ error: "Something went wrong. Try again." });
  }
};

const admin = guard(false);

router.get(`${BASE}/integrations`, admin, handle("/integrations", (req) => svc.getIntegrations(req.device.tenantId)));

router.put(
  `${BASE}/integrations/:type`,
  admin,
  handle("/integrations/:type", (req) =>
    svc.setEnabled(req.device.tenantId, req.params.type, req.body?.enabled === true || req.body?.enabled === "true", req.device.userId),
  ),
);

router.post(`${BASE}/groups/verify`, admin, handle("/groups/verify", (req) => svc.verify(req.device.tenantId, req.body || {})));

router.post(`${BASE}/groups`, admin, handle("/groups", (req) => svc.save(req.device.tenantId, req.device.userId, req.body || {})));

router.delete(`${BASE}/groups/:id`, admin, handle("/groups/:id", (req) => svc.remove(req.device.tenantId, req.device.userId, req.params.id)));

router.get(`${BASE}/groups/:id/alarm-key`, admin, handle("/alarm-key", (req) => svc.getAlarmKey(req.device.tenantId, req.params.id)));

router.post(
  `${BASE}/groups/:id/alarm-key/regenerate`,
  admin,
  handle("/alarm-key/regenerate", (req) => svc.regenerateAlarmKey(req.device.tenantId, req.device.userId, req.params.id)),
);

router.get(
  `${BASE}/groups/:id/alarm-test`,
  admin,
  handle("/alarm-test", (req) => svc.alarmTestStatus(req.device.tenantId, req.params.id, param(req, "since"))),
);

router.get(`${BASE}/recipients`, guard(true), handle("/recipients", (req) => svc.getRecipients(req.device.tenantId)));

/* Incident list › device delivery. Any member of the incident's team (checked in the query),
   so no admin guard; only a userId is needed. */
const member = (req, res, next) => {
  const userId = param(req, "userId");
  if (!userId) return res.status(400).json({ error: "userId is required." });
  req.device = { userId, teamId: param(req, "teamId") || "" };
  next();
};

router.post(
  `${BASE}/delivery-summaries`,
  member,
  handle("/delivery-summaries", async (req) => ({
    summaries: await svc.getDeliverySummaries(req.device.userId, Array.isArray(req.body?.incIds) ? req.body.incIds : []),
  })),
);

router.get(`${BASE}/delivery`, member, handle("/delivery", (req) => svc.getDeliveryDetails(req.device.userId, param(req, "incId"))));

module.exports = router;
