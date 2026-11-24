/**
 * Device Emulator: fake vendor endpoints for testing device integrations without hardware.
 * Mounted at /sim by server/index.js ONLY when DEVICE_SIMULATOR=true (staging). Never in production.
 *
 * It behaves like real systems: only the TEST ACCOUNTS below sign in, only the listed
 * device pools / groups / players exist, everything else fails the way a real system would.
 * Every alert a fake device receives is recorded; see GET /sim/inbox.
 *
 *   Password for every test account: Test@123  (see TEST below)
 *   Cisco CUCM   : https://HOST/sim/cucm/axl/     user axl          pools DP_Test_48 (48, 44 registered) · DP_Pune (5) · DP_London (3) · DP_Empty (0)
 *   Algo         : https://HOST/sim/algo/<name>   API password      (Basic or Standard/HMAC)
 *   Axis         : https://HOST/sim/axis/<name>   user root         siren profiles Emergency, Evacuate
 *   BrightSign   : Client ID sim                  secret            players SIM001 … SIM009
 *   MagicINFO    : https://HOST/sim/magicinfo     user admin        groups 12 (3 screens) · 20 (5) · 0 (empty)
 *   Unreachable  : any address segment starting with "down" (e.g. https://HOST/sim/algo/down1)
 */
const crypto = require("crypto");
const express = require("express");
const inbox = require("./inbox");

const TEST = {
  password: "Test@123",
  ciscoUser: "axl",
  axisUser: "root",
  bsnClientId: "sim",
  magicUser: "admin",
};
const CISCO_POOLS = { DP_Test_48: 48, DP_Pune: 5, DP_London: 3, DP_Empty: 0 };
const MAGIC_GROUPS = { 12: 3, 20: 5, 0: 0 };
const BSN_PLAYERS = new Set(Array.from({ length: 9 }, (_, i) => `SIM00${i + 1}`));
const SIREN_PROFILES = ["Emergency", "Evacuate"];

const router = express.Router();
router.use(express.text({ type: ["text/xml", "application/xml", "application/soap+xml"], limit: "1mb" }));
router.use(express.urlencoded({ extended: false }));
router.use(express.json());

/* ------------------------------ auth helpers ------------------------------ */

const basicCreds = (req) => {
  const h = String(req.headers.authorization || "");
  if (!/^basic /i.test(h)) return null;
  try {
    const raw = Buffer.from(h.slice(6), "base64").toString("utf8");
    const i = raw.indexOf(":");
    return { user: raw.slice(0, i), pass: raw.slice(i + 1) };
  } catch (e) {
    return null;
  }
};

const basicOk = (req, user) => {
  const c = basicCreds(req);
  return !!c && c.user === user && c.pass === TEST.password;
};

/**
 * Algo auth: Basic admin:<API password>, or "Standard" HMAC
 *   Authorization: hmac admin:<nonce>:<sha256 hex of METHOD:uri:contentMD5:contentType:timestamp:nonce>
 * The timestamp isn't sent, so accept any second in the last 2 minutes.
 */
const algoAuthOk = (req, deviceUri) => {
  if (basicOk(req, "admin")) return true;
  const m = /^hmac admin:([^:]+):([0-9a-f]+)$/i.exec(String(req.headers.authorization || ""));
  if (!m) return false;
  const [, nonce, digest] = m;
  const md5 = String(req.headers["content-md5"] || "");
  const types = [String(req.headers["content-type"] || "").split(";")[0], "application/json"];
  const now = Math.floor(Date.now() / 1000);
  for (const ct of types) {
    for (let t = now + 5; t >= now - 120; t--) {
      const input = [req.method.toUpperCase(), deviceUri, md5, ct, String(t), nonce].join(":");
      if (crypto.createHmac("sha256", TEST.password).update(input, "utf8").digest("hex") === digest.toLowerCase()) return true;
    }
  }
  return false;
};

// Any "down*" path segment → drop the connection (simulates an unreachable device/server)
router.use((req, res, next) => {
  if (req.path.split("/").some((seg) => /^down/i.test(seg))) {
    req.socket.destroy();
    return;
  }
  next();
});

/* --------------------------------- Algo ---------------------------------- */

const algoGuard = (req, res, next) => {
  const uri = req.path.replace(/^\/algo\/[^/]+/, ""); // e.g. /api/info/about
  if (!algoAuthOk(req, uri)) return res.status(401).json({ error: "Unauthorized" });
  next();
};

router.get("/algo/:id/api/info/about", algoGuard, (req, res) => {
  res.json({ "audio.model": "8301", "about.firmware": "5.7.1", id: req.params.id });
});

router.post("/algo/:id/api/controls/tone/start", algoGuard, (req, res) => {
  const body = typeof req.body === "string" ? safeJson(req.body) : req.body;
  inbox.record({ vendor: "Algo speaker", device: req.params.id, action: `Played tone ${body?.path || ""}` });
  res.json({ status: "ok" });
});

router.post("/algo/:id/api/controls/strobe/start", algoGuard, (req, res) => {
  inbox.record({ vendor: "Algo strobe", device: req.params.id, action: "Strobe started" });
  res.json({ status: "ok" });
});

router.post("/algo/:id/api/controls/strobe/stop", algoGuard, (req, res) => {
  inbox.record({ vendor: "Algo strobe", device: req.params.id, action: "Strobe stopped" });
  res.json({ status: "ok" });
});

/* --------------------------------- Axis ---------------------------------- */

const axisGuard = (req, res, next) => {
  if (!basicOk(req, TEST.axisUser)) return res.status(401).send("Unauthorized");
  next();
};

router.get("/axis/:id/axis-cgi/param.cgi", axisGuard, (req, res) => {
  res.type("text/plain").send("root.MediaClip.M0.Name=Evacuation\nroot.MediaClip.M1.Name=Alert tone\n");
});

router.get("/axis/:id/axis-cgi/mediaclip.cgi", axisGuard, (req, res) => {
  inbox.record({ vendor: "Axis speaker", device: req.params.id, action: `Played clip ${req.query.clip}` });
  res.type("text/plain").send("OK");
});

router.post("/axis/:id/axis-cgi/siren_and_light.cgi", axisGuard, (req, res) => {
  const body = typeof req.body === "string" ? safeJson(req.body) : req.body;
  if (body?.method === "listProfiles") {
    return res.json({ apiVersion: "1.0", method: "listProfiles", data: { profiles: SIREN_PROFILES.map((name) => ({ name })) } });
  }
  if (body?.method === "start") {
    const name = body?.params?.name;
    if (!SIREN_PROFILES.includes(name)) {
      return res.json({ apiVersion: "1.0", method: "start", error: { code: 2104, message: "Profile not found" } });
    }
    inbox.record({ vendor: "Axis strobe siren", device: req.params.id, action: `Started profile ${name}` });
    return res.json({ apiVersion: "1.0", method: "start", data: {} });
  }
  res.json({ apiVersion: "1.0", error: { code: 1000, message: "Unknown method" } });
});

/* --------------------------------- Cisco --------------------------------- */

const DESCS = ["Reception", "Floor 2 – Desk 14", "Floor 3 – Meeting room", "Security desk", "Floor 3 – Desk 2", "Boardroom"];

/** Phones in a known pool; unknown pools have none (AXL returns no rows). */
const poolPhones = (pool) => {
  const n = CISCO_POOLS[pool];
  if (!n) return [];
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

const ciscoGuard = (req, res, next) => {
  if (!basicOk(req, TEST.ciscoUser)) return res.status(401).send("Unauthorized");
  next();
};

const cucmAxl = (req, res) => {
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
router.post("/cucm/axl", ciscoGuard, cucmAxl);
router.post("/cucm/axl/", ciscoGuard, cucmAxl);

const risHandler = (req, res) => {
  const body = String(req.body || "");
  const names = [...body.matchAll(/<(?:\w+:)?Item>([^<]+)<\/(?:\w+:)?Item>/gi)].map((m) => m[1].trim());
  const phoneBase = `${req.get("host")}${req.baseUrl}/ciscophone`;
  // Every 10th phone is "unregistered", so the registered count differs from the pool size.
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
router.post("/cucm/realtimeservice2/services/RISService70", ciscoGuard, risHandler);
router.post("/cucm/realtimeservice/services/RisPort70", ciscoGuard, risHandler);

router.post("/ciscophone/:name/CGI/Execute", ciscoGuard, (req, res) => {
  const xml = req.body && req.body.XML ? String(req.body.XML) : String(req.body || "");
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

const bsnTokens = new Set();

router.post("/bsn/auth/token", (req, res) => {
  const c = basicCreds(req);
  if (!c || c.user !== TEST.bsnClientId || c.pass !== TEST.password) {
    return res.status(401).json({ error: "invalid_client", error_description: "Invalid client credentials" });
  }
  const token = "sim-bsn-" + crypto.randomBytes(8).toString("hex");
  bsnTokens.add(token);
  if (bsnTokens.size > 500) bsnTokens.delete(bsnTokens.values().next().value);
  res.json({ access_token: token, token_type: "Bearer", expires_in: 3600 });
});

const bsnGuard = (req, res, next) => {
  const token = String(req.headers.authorization || "").replace(/^bearer\s+/i, "");
  if (!bsnTokens.has(token)) return res.status(401).json({ data: { error: { message: "Unauthorized" } } });
  const serial = String(req.query.destinationName || "");
  if (!BSN_PLAYERS.has(serial)) return res.status(404).json({ data: { error: { message: "Player not found" } } });
  next();
};

router.get("/bsn/rest/v1/info", bsnGuard, (req, res) => {
  res.json({ data: { result: { serial: req.query.destinationName, model: "XT1144", FWVersion: "8.5.47" } } });
});

router.put("/bsn/rest/v1/registry", bsnGuard, (req, res) => {
  const body = typeof req.body === "string" ? safeJson(req.body) : req.body;
  inbox.record({ vendor: "BrightSign player", device: String(req.query.destinationName), action: "Showing alert", text: body?.data?.value || "" });
  res.json({ data: { result: { success: true } } });
});

/* ------------------------------- MagicINFO ------------------------------- */

const magicTokens = new Set();

router.post("/magicinfo/restapi/v2.0/auth", (req, res) => {
  const body = typeof req.body === "string" ? safeJson(req.body) : req.body;
  if (body?.username !== TEST.magicUser || body?.password !== TEST.password) {
    return res.status(401).json({ message: "Invalid username or password" });
  }
  const token = "sim-magicinfo-" + crypto.randomBytes(8).toString("hex");
  magicTokens.add(token);
  if (magicTokens.size > 500) magicTokens.delete(magicTokens.values().next().value);
  res.json({ token });
});

const magicGuard = (req, res, next) => {
  if (!magicTokens.has(String(req.headers.api_key || ""))) return res.status(401).json({ message: "Unauthorized" });
  next();
};

router.post("/magicinfo/restapi/v2.0/rms/devices/filter", magicGuard, (req, res) => {
  const body = typeof req.body === "string" ? safeJson(req.body) : req.body;
  const g = String(body?.groupId ?? "");
  if (!(g in MAGIC_GROUPS)) return res.status(404).json({ message: "Group not found" });
  const n = MAGIC_GROUPS[g];
  res.json({
    items: Array.from({ length: n }, (_, i) => ({ deviceId: `G${g}-D${i + 1}`, deviceName: `Lobby screen ${i + 1}` })),
    totalCount: n,
  });
});

const messages = new Map();
router.post("/magicinfo/restapi/v1.0/dms/schedule/messages", magicGuard, (req, res) => {
  const body = typeof req.body === "string" ? safeJson(req.body) : req.body;
  const id = "MSG-" + Date.now();
  messages.set(id, body?.message || "");
  if (messages.size > 200) messages.delete(messages.keys().next().value);
  res.json({ messageId: id });
});

router.put("/magicinfo/restapi/v1.0/dms/schedule/messages/:id/deploy", magicGuard, (req, res) => {
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
module.exports.TEST = TEST;
