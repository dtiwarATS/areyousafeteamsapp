/**
 * AICaller router — limited surface for Org Safety Assistant.
 * Mounted at /api/ai-caller. Does not alter existing /areyousafetabhandler routes.
 */
const express = require("express");
const { requireAiCallerAuth } = require("./aiCallerAuth");
const service = require("./aiCallerSafetyCheckService");

const router = express.Router();
router.use(requireAiCallerAuth);

function requireMappedIds(req, res) {
  const tenantId = req.query.tenantId || req.body?.teamsTenantId;
  const teamId = req.query.teamId || req.body?.teamsTeamId;
  if (!tenantId || !teamId) {
    res.status(400).json({ error: "tenantId and teamId are required (mapped from Safety Assistant ORG)" });
    return null;
  }
  return { tenantId, teamId };
}

/** Multi-filter people lookup (replaces users-by-city / country / department / at-location). */
router.get("/users", async (req, res) => {
  const ids = requireMappedIds(req, res);
  if (!ids) return;
  const result = await service.listUsers({
    teamId: ids.teamId,
    tenantId: ids.tenantId,
    city: req.query.city,
    country: req.query.country,
    state: req.query.state,
    department: req.query.department,
    name: req.query.name,
    locationMode: req.query.locationMode || "effective",
    includeConfigured: String(req.query.includeConfigured || "").toLowerCase() === "true",
  });
  if (result.error && result.count === 0 && !result.users?.length) {
    return res.status(400).json(result);
  }
  res.json(result);
});

/** Distinct city/country/state/department with counts (people and/or LOCATION_CONFIGURATION). */
router.get("/distinct-values", async (req, res) => {
  const ids = requireMappedIds(req, res);
  if (!ids) return;
  const field = req.query.field || "";
  if (!String(field).trim()) {
    return res.status(400).json({ error: "field is required (city|country|state|department)" });
  }
  const result = await service.listDistinctValues({
    teamId: ids.teamId,
    tenantId: ids.tenantId,
    field,
    scopedField: req.query.scopedField,
    scopedValue: req.query.scopedValue,
    source: req.query.source || "people",
  });
  if (result.error && !result.values?.length) {
    return res.status(400).json(result);
  }
  res.json(result);
});

router.post("/safety-check", async (req, res) => {
  const ids = requireMappedIds(req, res);
  if (!ids) return;
  if (!req.body?.userAadObjId) {
    return res.status(400).json({ error: "userAadObjId is required" });
  }
  try {
    const result = await service.createAndSendSafetyCheck({
      ...req.body,
      teamsTenantId: ids.tenantId,
      teamsTeamId: ids.teamId,
    });
    res.json(result);
  } catch (err) {
    console.error("[ai-caller] safety-check error", err);
    res.status(500).json({ error: err.message || "Failed to send safety check" });
  }
});

router.get("/checkin-status", async (req, res) => {
  const ids = requireMappedIds(req, res);
  if (!ids) return;
  const incidentId = req.query.incidentId;
  if (!incidentId) return res.status(400).json({ error: "incidentId is required" });
  const result = await service.getCheckinStatus({ teamId: ids.teamId, incidentId });
  res.json(result);
});

router.get("/active-incidents", async (req, res) => {
  const ids = requireMappedIds(req, res);
  if (!ids) return;
  const result = await service.getActiveIncidents({ tenantId: ids.tenantId, teamId: ids.teamId });
  res.json(result);
});

module.exports = router;
