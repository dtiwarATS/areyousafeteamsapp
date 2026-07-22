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

router.get("/users-by-city", async (req, res) => {
  const ids = requireMappedIds(req, res);
  if (!ids) return;
  const city = req.query.city || "";
  const result = await service.listUsersByCity({ teamId: ids.teamId, city });
  res.json(result);
});

router.get("/users-at-location", async (req, res) => {
  const ids = requireMappedIds(req, res);
  if (!ids) return;
  const location = req.query.location || "";
  if (!String(location).trim()) {
    return res.status(400).json({ error: "location is required" });
  }
  const includeConfigured =
    req.query.includeConfigured === undefined
      ? true
      : String(req.query.includeConfigured).toLowerCase() !== "false";
  const result = await service.listUsersAtLocation({
    teamId: ids.teamId,
    tenantId: ids.tenantId,
    location,
    includeConfigured,
  });
  if (result.error === "location is required") {
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
