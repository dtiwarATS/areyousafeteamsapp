/**
 * Sends an incident (or its follow-up) to the devices the sender picked on New Incident.
 * Selection is stored in INCIDENT_DEVICE_RECIPIENT, so recurring runs and follow-ups reuse it.
 * Each device result is logged to MessageActivityLog via incidentService.saveAllTypeQuerylogs.
 * SOS never alerts devices (agreed design decision).
 */
const repo = require("./deviceGroupRepo");
const adapters = require("./adapters");
const { TYPE_LABELS } = require("./definitions");
const { processSafetyBotError } = require("../../models/processError");

// Audio Broadcast calls are billed by Twilio → count them like Voice calls.
adapters.audio.setOnCallPlaced((tenantId) => repo.incrementVoiceCallCount(tenantId));

const LOG_CHANNEL = {
  cisco: "CISCO",
  speakers: "IP_SPEAKERS",
  signage: "DIGITAL_SIGNAGE",
  iot: "IOT",
  audio: "AUDIO_BROADCAST",
};

const SEND_TIMEOUT_MS = 90000;

const withTimeout = (p, ms) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`Timed out after ${ms / 1000}s`)), ms))]);

/**
 * @param {object} o
 *   incId        MSTeamsIncidents.id
 *   kind         'incident' | 'followup'
 *   messageType  value for MessageActivityLog.MessageType (e.g. 'onetime', 'recurringIncident', 'Follow-up')
 *   fallbackText text when no "Message for devices" was stored (normally the incident title)
 * @returns {Promise<{sent:number, failed:number}>}
 */
const sendForIncident = async ({ incId, kind = "incident", messageType = "onetime", fallbackText = "" }) => {
  // Lazy require: incidentService pulls in the whole bot stack.
  const incidentService = require("../incidentService");
  const totals = { sent: 0, failed: 0 };
  let rows;
  try {
    rows = await repo.getIncidentRecipients(incId);
  } catch (err) {
    processSafetyBotError(err, "", "", "", `deviceDispatcher: load recipients for incident ${incId}`);
    return totals;
  }
  if (!rows.length) return totals;

  const byGroup = new Map();
  rows.forEach((r) => {
    const key = String(r.group_id);
    if (!byGroup.has(key)) byGroup.set(key, { refs: [], message: r.device_message });
    byGroup.get(key).refs.push(r.device_ref);
  });

  const flagsCache = new Map();
  const title = kind === "followup" ? "Follow-up" : "Safety Check";

  await Promise.all(
    [...byGroup.entries()].map(async ([groupId, sel]) => {
      let group;
      try {
        group = await repo.getGroup(groupId, { withSecrets: true });
        if (!group || !adapters[group.type]) return; // deleted, or alarms (inbound only)
        if (!flagsCache.has(group.tenantId)) flagsCache.set(group.tenantId, await repo.getIntegrationFlags(group.tenantId));
        if (!flagsCache.get(group.tenantId)[group.type]) return; // integration turned off
        if (kind === "followup" ? !group.notify.followup : !group.notify.incident) return;

        const text = String(sel.message || fallbackText || "").slice(0, 1000);
        let results;
        try {
          results = await withTimeout(adapters[group.type].send(group, sel.refs, { title, text }), SEND_TIMEOUT_MS);
        } catch (err) {
          results = sel.refs.map((ref) => ({ ref, ok: false, error: err.message || String(err) }));
        }

        // Per-device status for the incident card / Devices dialog (main send only).
        if (kind === "incident") {
          repo.setRecipientStatus(incId, groupId, results).catch((err) =>
            processSafetyBotError(err, "", "", "", `deviceDispatcher: save status incident ${incId}`),
          );
        }

        const channel = LOG_CHANNEL[group.type];
        const labels = new Map((group.devices || []).map((d) => [String(d.ref), d.label]));
        results.forEach((r) => {
          if (r.ok) totals.sent++;
          else totals.failed++;
          incidentService.saveAllTypeQuerylogs(
            "",
            `${TYPE_LABELS[group.type]} – ${group.name}`,
            channel,
            labels.get(String(r.ref)) || String(r.ref),
            incId,
            r.ok ? r.status || `SENT_TO_${channel}` : r.status || "SEND_FAILED",
            messageType,
            group.name,
            text,
            r.providerId || "",
            r.ok ? "" : String(r.error || ""),
          );
        });
      } catch (err) {
        processSafetyBotError(err, "", "", "", `deviceDispatcher: group ${groupId} incident ${incId}`);
      }
    }),
  );
  return totals;
};

module.exports = { sendForIncident };
