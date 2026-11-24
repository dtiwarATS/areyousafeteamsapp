/**
 * Device Emulator: fake vendor endpoints for testing device integrations without hardware.
 * Mounted at /sim by server/index.js ONLY when DEVICE_SIMULATOR=true (staging). Never in production.
 *
 * Outcomes are chosen by the address you type in Settings:
 *   any path segment starting with "down"  → connection dropped (unreachable)
 *   "auth-fail" segment, or username "fail" / Client ID "sim-fail" → 401 (wrong credentials)
 *   anything else → success
 * Every alert a fake device receives is recorded; see GET /sim/inbox.
 *
 * Addresses to use (replace HOST with this API's host):
 *   Algo   speaker/strobe : https://HOST/sim/algo/ok1, https://HOST/sim/algo/down1
 *   Axis   speaker/siren  : https://HOST/sim/axis/ok1           (siren profiles: Emergency, Evacuate)
 *   Cisco  CUCM URL       : https://HOST/sim/cucm/axl/          (pool DP_Test_48 → 48 phones, DP_Empty → none)
 *   BrightSign            : Client ID sim (or sim-fail), any secret, serials e.g. SIM001, SIM002, DOWN1
 *   Samsung MagicINFO     : Server URL https://HOST/sim/magicinfo, group 12 (3 displays), 0 = empty, missing = not found
 */
const express = require("express");
const inbox = require("./inbox");

const router = express.Router();
router.use(express.text({ type: ["text/xml", "application/xml", "application/soap+xml"], limit: "1mb" }));
router.use(express.urlencoded({ extended: false }));
router.use(express.json());

/* ----------------------------- outcome helpers ---------------------------- */

const basicUser = (req) => {
  const h = String(req.headers.authorization || "");
  if (!/^basic /i.test(h)) return null;
  try {
    return Buffer.from(h.slice(6), "base64").toString("utf8").split(":")[0];
  } catch (e) {
    return null;
  }
};

// Any "down*" path segment → drop the connection (simulates an unreachable device/server)
router.use((req, res, next) => {
  if (req.path.split("/").some((seg) => /^down/i.test(seg))) {
    req.socket.destroy();
    return;
  }
  next();
});

const authFails = (req, id) => id === "auth-fail" || basicUser(req) === "fail" || !req.headers.authorization;

/* --------------------------------- Algo ---------------------------------- */

router.get("/algo/:id/api/info/about", (req, res) => {
  if (authFails(req, req.params.id)) return res.status(401).json({ error: "Unauthorized" });
  res.json({ "audio.model": "8301", "about.firmware": "5.7.1", id: req.params.id });
});

router.post("/algo/:id/api/controls/tone/start", (req, res) => {
  if (authFails(req, req.params.id)) return res.status(401).json({ error: "Unauthorized" });
  const body = typeof req.body === "string" ? safeJson(req.body) : req.body;
  inbox.record({ vendor: "Algo speaker", device: req.params.id, action: `Played tone ${body?.path || ""}` });
  res.json({ status: "ok" });
});

router.post("/algo/:id/api/controls/strobe/start", (req, res) => {
  if (authFails(req, req.params.id)) return res.status(401).json({ error: "Unauthorized" });
  inbox.record({ vendor: "Algo strobe", device: req.params.id, action: "Strobe started" });
  res.json({ status: "ok" });
});

router.post("/algo/:id/api/controls/strobe/stop", (req, res) => {
  inbox.record({ vendor: "Algo strobe", device: req.params.id, action: "Strobe stopped" });
  res.json({ status: "ok" });
});

/* --------------------------------- Axis ---------------------------------- */

router.get("/axis/:id/axis-cgi/param.cgi", (req, res) => {
  if (authFails(req, req.params.id)) return res.status(401).send("Unauthorized");
  res.type("text/plain").send("root.MediaClip.M0.Name=Evacuation\nroot.MediaClip.M1.Name=Alert tone\n");
});

router.get("/axis/:id/axis-cgi/mediaclip.cgi", (req, res) => {
  if (authFails(req, req.params.id)) return res.status(401).send("Unauthorized");
  inbox.record({ vendor: "Axis speaker", device: req.params.id, action: `Played clip ${req.query.clip}` });
  res.type("text/plain").send("OK");
});

router.post("/axis/:id/axis-cgi/siren_and_light.cgi", (req, res) => {
  if (authFails(req, req.params.id)) return res.status(401).send("Unauthorized");
  const body = typeof req.body === "string" ? safeJson(req.body) : req.body;
  if (body?.method === "listProfiles") {
    return res.json({ apiVersion: "1.0", method: "listProfiles", data: { profiles: [{ name: "Emergency" }, { name: "Evacuate" }] } });
  }
  if (body?.method === "start") {
    const name = body?.params?.name;
    if (!["Emergency", "Evacuate"].includes(name)) {
      return res.json({ apiVersion: "1.0", method: "start", error: { code: 2104, message: "Profile not found" } });
    }
    inbox.record({ vendor: "Axis strobe siren", device: req.params.id, action: `Started profile ${name}` });
    return res.json({ apiVersion: "1.0", method: "start", data: {} });
  }
  res.json({ apiVersion: "1.0", error: { code: 1000, message: "Unknown method" } });
});

/* --------------------------------- Cisco --------------------------------- */

const DESCS = ["Reception", "Floor 2 – Desk 14", "Floor 3 – Meeting room", "Security desk", "Floor 3 – Desk 2", "Boardroom"];

const poolPhones = (pool) => {
  if (/empty/i.test(pool)) return [];
  const m = /_(\d+)$/.exec(pool);
  const n = Math.min(m ? Number(m[1]) : 5, 500);
  let seed = 0;
  for (const ch of pool) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const prefix = ("00" + seed.toString(16).toUpperCase()).slice(-8);
  return Array.from({ length: n }, (_, i) => ({
    name: `SEP${prefix}${String(i + 1).padStart(4, "0")}`,
    description: DESCS[i % DESCS.length],
  }));
};

const soapEnvelope = (inner) =>
  `<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body>${inner}</soapenv:Body></soapenv:Envelope>`;

const xmlEsc = (v) => String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

router.post("/cucm/axl", (req, res) => cucmAxl(req, res));
router.post("/cucm/axl/", (req, res) => cucmAxl(req, res));

const cucmAxl = (req, res) => {
  if (basicUser(req) === "fail" || !req.headers.authorization) return res.status(401).send("Unauthorized");
  const body = String(req.body || "");
  res.type("text/xml");
  if (/getCCMVersion/i.test(body)) {
    return res.send(
      soapEnvelope(`<ns:getCCMVersionResponse xmlns:ns="http://www.cisco.com/AXL/API/14.0"><return><componentVersion><version>14.0.1.13900-155</version></componentVersion></return></ns:getCCMVersionResponse>`),
    );
  }
  if (/executeSQLQuery/i.test(body)) {
    const pool = (/dp\.name\s*=\s*'([^']*)'/i.exec(body.replace(/&apos;/g, "'")) || [])[1] || "";
    const rows = poolPhones(pool)
      .map((p) => `<row><name>${xmlEsc(p.name)}</name><description>${xmlEsc(p.description)}</description></row>`)
      .join("");
    return res.send(soapEnvelope(`<ns:executeSQLQueryResponse xmlns:ns="http://www.cisco.com/AXL/API/14.0"><return>${rows}</return></ns:executeSQLQueryResponse>`));
  }
  res.status(500).send(soapEnvelope("<soapenv:Fault><faultstring>Unsupported AXL request in emulator</faultstring></soapenv:Fault>"));
};

const risHandler = (req, res) => {
  if (basicUser(req) === "fail" || !req.headers.authorization) return res.status(401).send("Unauthorized");
  const body = String(req.body || "");
  const names = [...body.matchAll(/<(?:\w+:)?Item>([^<]+)<\/(?:\w+:)?Item>/gi)].map((m) => m[1].trim());
  const phoneBase = `${req.get("host")}${req.baseUrl}/ciscophone`;
  // Every 10th phone is "unregistered" so the registered count differs from the pool size.
  const devices = names
    .filter((n) => !/0$/.test(n))
    .map(
      (n) =>
        `<item><Name>${xmlEsc(n)}</Name><DirNumber>1000</DirNumber><Status>Registered</Status><IPAddress><item><IP>${xmlEsc(
          `${phoneBase}/${n}`,
        )}</IP><IPAddrType>ipv4</IPAddrType></item></IPAddress></item>`,
    )
    .join("");
  res
    .type("text/xml")
    .send(
      soapEnvelope(
        `<ns1:selectCmDeviceResponse xmlns:ns1="http://schemas.cisco.com/ast/soap"><ns1:selectCmDeviceReturn><SelectCmDeviceResult><TotalDevicesFound>${
          devices.split("<Name>").length - 1
        }</TotalDevicesFound><CmNodes><item><ReturnCode>Ok</ReturnCode><Name>cucm-sim-pub</Name><CmDevices>${devices}</CmDevices></item></CmNodes></SelectCmDeviceResult></ns1:selectCmDeviceReturn></ns1:selectCmDeviceResponse>`,
      ),
    );
};
router.post("/cucm/realtimeservice2/services/RISService70", risHandler);
router.post("/cucm/realtimeservice/services/RisPort70", risHandler);

router.post("/ciscophone/:name/CGI/Execute", (req, res) => {
  let xml = req.body && req.body.XML ? String(req.body.XML) : String(req.body || "");
  let title = "";
  let text = "";
  try {
    const dataUri = (/URL="Data:text\/plain,([^"]*)"/i.exec(xml) || [])[1] || "";
    const inner = decodeURIComponent(dataUri.replace(/&amp;/g, "&"));
    title = (/<Title>([\s\S]*?)<\/Title>/i.exec(inner) || [])[1] || "";
    text = (/<Text>([\s\S]*?)<\/Text>/i.exec(inner) || [])[1] || "";
  } catch (e) {
    /* ignore */
  }
  inbox.record({ vendor: "Cisco IP phone", device: req.params.name, action: "Screen text", title, text });
  res.type("text/xml").send('<?xml version="1.0" encoding="utf-8"?><CiscoIPPhoneResponse><ResponseItem Status="0" Data="Success" URL=""/></CiscoIPPhoneResponse>');
});

/* ------------------------------- BrightSign ------------------------------ */

router.post("/bsn/auth/token", (req, res) => {
  const user = basicUser(req);
  if (!user || /fail/i.test(user)) return res.status(401).json({ error: "invalid_client", error_description: "Invalid client credentials" });
  res.json({ access_token: "sim-token-" + Date.now(), token_type: "Bearer", expires_in: 3600 });
});

router.get("/bsn/rest/v1/info", (req, res) => {
  const serial = String(req.query.destinationName || "");
  if (/down|missing/i.test(serial)) return res.status(404).json({ data: { error: { message: "Player not found" } } });
  res.json({ data: { result: { serial, model: "XT1144", FWVersion: "8.5.47" } } });
});

router.put("/bsn/rest/v1/registry", (req, res) => {
  const serial = String(req.query.destinationName || "");
  if (/down|missing/i.test(serial)) return res.status(404).json({ data: { error: { message: "Player not found" } } });
  const body = typeof req.body === "string" ? safeJson(req.body) : req.body;
  inbox.record({ vendor: "BrightSign player", device: serial, action: "Showing alert", text: body?.data?.value || "" });
  res.json({ data: { result: { success: true } } });
});

/* ------------------------------- MagicINFO ------------------------------- */

router.post("/magicinfo/restapi/v2.0/auth", (req, res) => {
  const body = typeof req.body === "string" ? safeJson(req.body) : req.body;
  if (!body?.username || /fail/i.test(body.username)) return res.status(401).json({ message: "Invalid username or password" });
  res.json({ token: "sim-magicinfo-" + Date.now() });
});

router.post("/magicinfo/restapi/v2.0/rms/devices/filter", (req, res) => {
  const body = typeof req.body === "string" ? safeJson(req.body) : req.body;
  const g = String(body?.groupId || "");
  if (!g || /missing/i.test(g)) return res.status(404).json({ message: "Group not found" });
  const n = g === "0" ? 0 : 3;
  res.json({
    items: Array.from({ length: n }, (_, i) => ({ deviceId: `G${g}-D${i + 1}`, deviceName: `Lobby screen ${i + 1}` })),
    totalCount: n,
  });
});

const messages = new Map();
router.post("/magicinfo/restapi/v1.0/dms/schedule/messages", (req, res) => {
  const body = typeof req.body === "string" ? safeJson(req.body) : req.body;
  const id = "MSG-" + Date.now();
  messages.set(id, body?.message || "");
  if (messages.size > 200) messages.delete(messages.keys().next().value);
  res.json({ messageId: id });
});

router.put("/magicinfo/restapi/v1.0/dms/schedule/messages/:id/deploy", (req, res) => {
  const body = typeof req.body === "string" ? safeJson(req.body) : req.body;
  const text = messages.get(req.params.id) || "";
  (body?.deviceIds || [body?.groupId || "?"]).forEach((d) =>
    inbox.record({ vendor: "Samsung display", device: d, action: "Showing alert", text }),
  );
  res.json({ status: "Success" });
});

/* --------------------------------- Inbox --------------------------------- */

router.get("/inbox.json", (req, res) => res.json(inbox.list()));
router.delete("/inbox", (req, res) => {
  inbox.clear();
  res.json({ cleared: true });
});
router.get("/inbox", (req, res) => res.type("html").send(inbox.html()));

function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch (e) {
    return {};
  }
}

module.exports = router;
