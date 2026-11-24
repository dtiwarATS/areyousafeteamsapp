/**
 * Inbound alerts from panic buttons, fire alarms and sensors (Alarms & Sensors device groups).
 *
 *   POST /v1/alerts/:publicId
 *   Key:  X-API-Key header, or Authorization: Bearer <key>, or ?key=<key>
 *   Body: JSON { title, message, severity?, location?, id?, test? }  or  CAP 1.2 XML
 *
 * Test alert (JSON test:true / CAP <status>Test</status>) → recorded for "Verify", no SOS.
 * Real alert → SOS for the responders of the group's Country/City across all teams of the
 * tenant (same rules as a user SOS), de-duplicated for 2 minutes, max 10 SOS/min per group.
 */
const crypto = require("crypto");
const repo = require("./deviceGroupRepo");
const { safeEqual } = require("../../utils/deviceSecrets");
const { systemRequester } = require("../../utils/systemSos");
const { processSafetyBotError } = require("../../models/processError");

const DEDUPE_SECONDS = 120;
const MAX_SOS_PER_MINUTE = 10;

const xmlTag = (xml, name) => {
  const m = new RegExp(`<(?:\\w+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${name}>`, "i").exec(xml);
  return m ? m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim() : "";
};

const decodeXml = (s) =>
  String(s || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

/** Parse a CAP 1.2 or JSON body → { format, isTest, ref, title, message, location } or throws. */
const parseAlert = (body, contentType) => {
  const ct = String(contentType || "").toLowerCase();
  const text = typeof body === "string" ? body.trim() : "";
  if (ct.includes("xml") || text.startsWith("<")) {
    if (!/<(?:\w+:)?alert[\s>]/i.test(text)) throw new Error("Not a CAP alert.");
    const info = xmlTag(text, "info") || text;
    return {
      format: "cap",
      isTest: /^test$/i.test(xmlTag(text, "status")) || /^exercise$/i.test(xmlTag(text, "status")),
      ref: decodeXml(xmlTag(text, "identifier")),
      title: decodeXml(xmlTag(info, "headline") || xmlTag(info, "event")),
      message: decodeXml(xmlTag(info, "description")),
      location: decodeXml(xmlTag(xmlTag(info, "area"), "areaDesc")),
      severity: decodeXml(xmlTag(info, "severity")),
    };
  }
  let obj = body;
  if (typeof body === "string") obj = JSON.parse(body || "{}");
  if (!obj || typeof obj !== "object") throw new Error("Body must be JSON or CAP XML.");
  return {
    format: "json",
    isTest: obj.test === true || obj.test === "true",
    ref: obj.id != null ? String(obj.id) : "",
    title: String(obj.title || obj.event || "").trim(),
    message: String(obj.message || obj.description || "").trim(),
    location: String(obj.location || "").trim(),
    severity: String(obj.severity || "").trim(),
  };
};

const keyFrom = (req) => {
  const h = req.headers || {};
  if (h["x-api-key"]) return String(h["x-api-key"]).trim();
  const auth = String(h.authorization || "");
  if (/^bearer\s+/i.test(auth)) return auth.replace(/^bearer\s+/i, "").trim();
  if (req.query?.key) return String(req.query.key).trim();
  return "";
};

/** Start an SOS raised by the device group (no requesting person). */
const startSystemSos = async (group, alert) => {
  const incidentService = require("../incidentService");
  const { AreYouSafeTab } = require("../../tab/AreYouSafeTab");

  const country = group.country || "All";
  const city = group.city || "All";
  const admins = await incidentService.getSystemSosAdmins(group.tenantId, country, city);
  if (!admins.length) return { error: "no_responders" };

  const where =
    alert.location || [city !== "All" ? city : null, country !== "All" ? country : null].filter(Boolean).join(", ") || null;
  const requester = {
    ...systemRequester(group.publicId, group.name, where),
    ALERT_TEXT: [alert.title, alert.message].filter(Boolean).join(" – ").slice(0, 500) || "Alarm triggered",
  };

  const tabObj = new AreYouSafeTab();
  const saved = await tabObj.saveAssistance(admins, requester, null, requester.user_id, "null", null, "AlarmSensor");
  const sosId = saved && saved[0] ? saved[0].id : null;
  if (!sosId) return { error: "save_failed" };

  // Keep the alarm text on the SOS record (shown with the SOS in the dashboard).
  try {
    const sql = require("mssql");
    await require("../../db").executeWithRetry(
      "UPDATE MSTeamsAssistance SET comments = @c WHERE id = @id",
      { c: { type: sql.NVarChar(sql.MAX), value: requester.ALERT_TEXT }, id: { type: sql.Int, value: sosId } },
      { retries: 1, label: "alarmInbound.comments" },
    );
  } catch (e) {
    /* non-critical */
  }

  // Notify responders in the background (Teams card, SMS/email/WhatsApp per settings, push, sockets).
  tabObj
    .requestAssistance([admins, [requester]], requester.user_id, null, sosId, "true")
    .catch((err) => processSafetyBotError(err, "", "", "", `alarm SOS ${sosId} notify`));
  return { sosId, responders: admins.length };
};

/** Express handler for POST /v1/alerts/:publicId */
const handleAlert = async (req, res) => {
  let group = null;
  try {
    group = await repo.getGroupByPublicId(req.params.publicId);
    if (!group || group.type !== "alarms") return res.status(404).json({ error: "Unknown alert address." });
    const flags = await repo.getIntegrationFlags(group.tenantId);
    if (!flags.alarms) return res.status(404).json({ error: "Alarms & Sensors is turned off for this organization." });

    const raw = typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
    const key = keyFrom(req);
    if (!key || !safeEqual(key, group.apiKey)) {
      await repo.logAlert({ groupId: group.id, isTest: false, format: null, raw: raw.slice(0, 2000), result: "auth_failed" });
      return res.status(401).json({ error: "Invalid API key." });
    }

    let alert;
    try {
      alert = parseAlert(req.body, req.headers["content-type"]);
    } catch (e) {
      await repo.logAlert({ groupId: group.id, isTest: false, raw, result: "rejected" });
      return res.status(400).json({ error: "Send JSON ({\"title\":\"…\",\"message\":\"…\"}) or a CAP 1.2 alert." });
    }

    if (alert.isTest) {
      await repo.logAlert({ groupId: group.id, isTest: true, format: alert.format, alertRef: alert.ref, raw, result: "test" });
      return res.status(200).json({ ok: true, test: true, message: "Test alert received. No SOS was started." });
    }

    const ref = alert.ref || crypto.createHash("sha256").update(`${alert.title}|${alert.message}|${alert.location}`).digest("hex");
    if (await repo.isDuplicateAlert(group.id, ref, DEDUPE_SECONDS)) {
      await repo.logAlert({ groupId: group.id, format: alert.format, alertRef: ref, raw, result: "duplicate" });
      return res.status(200).json({ ok: true, duplicate: true });
    }
    if ((await repo.countRecentSosAlerts(group.id, 60)) >= MAX_SOS_PER_MINUTE) {
      await repo.logAlert({ groupId: group.id, format: alert.format, alertRef: ref, raw, result: "rejected" });
      return res.status(429).json({ error: "Too many alerts. Try again in a minute." });
    }

    const result = await startSystemSos(group, alert);
    if (result.error) {
      await repo.logAlert({ groupId: group.id, format: alert.format, alertRef: ref, raw, result: "error" });
      const msg = result.error === "no_responders" ? "No emergency responders are set up for this location." : "Could not start the SOS.";
      return res.status(result.error === "no_responders" ? 422 : 500).json({ error: msg });
    }
    await repo.logAlert({ groupId: group.id, format: alert.format, alertRef: ref, raw, result: "sos_started", sosId: result.sosId });
    return res.status(202).json({ ok: true, sosId: result.sosId });
  } catch (err) {
    processSafetyBotError(err, "", "", "", `POST /v1/alerts/${req.params.publicId}`);
    try {
      if (group) await repo.logAlert({ groupId: group.id, result: "error" });
    } catch (e) {
      /* ignore */
    }
    return res.status(500).json({ error: "Something went wrong." });
  }
};

module.exports = { handleAlert, parseAlert, startSystemSos };
