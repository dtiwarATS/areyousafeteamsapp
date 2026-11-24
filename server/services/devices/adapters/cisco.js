/**
 * Cisco IP Phones adapter (CUCM).
 *  verify: AXL getCCMVersion (sign-in) → AXL SQL: phones in the device pool (snapshot)
 *          → RIS selectCmDevice: how many are registered
 *  send:   RIS (selected device names → IPs) → POST CiscoIPPhoneExecute to each phone /CGI/Execute
 *
 * RIS and AXL live on the same host/port; the RIS URL is derived from the AXL URL (any path
 * prefix before /axl is kept, which is also how the staging emulator is addressed).
 */
const { request, isOk, basicAuth, classify, hostOf, mapLimit, HttpStatusError } = require("./http");

const escapeXml = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const AXL_VERSIONS = ["14.0", "12.5", "11.5", "10.5"];
const ns = (v) => `http://www.cisco.com/AXLAPIService/${v}`;

/** https://host:8443/axl/  (adds /axl/ when only a host is given) */
const normalizeAxlUrl = (raw) => {
  let url = String(raw || "").trim().replace(/\/+$/, "");
  if (!url) return "";
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  if (/\/axl$/i.test(url)) return `${url}/`;
  if (/\/axl\//i.test(url)) return url.endsWith("/") ? url : `${url}/`;
  return `${url}/axl/`;
};

/** RIS endpoints next to the AXL URL (same origin + same path prefix). */
const risUrls = (axlUrl) => {
  const u = new URL(axlUrl);
  const prefix = u.pathname.replace(/\/axl\/?$/i, "");
  const base = `${u.origin}${prefix}`;
  return [`${base}/realtimeservice2/services/RISService70`, `${base}/realtimeservice/services/RisPort70`];
};

const soap = async (url, envelope, soapAction, cfg) => {
  const res = await request({
    method: "POST",
    url,
    data: envelope,
    timeout: 20000,
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: soapAction,
      Authorization: basicAuth(cfg.user, cfg.pass),
    },
  });
  const body = typeof res.data === "string" ? res.data : String(res.data || "");
  if (!isOk(res) || /<(\w+:)?Fault[\s>]/i.test(body)) {
    const fault =
      body.match(/<faultstring[^>]*>([\s\S]*?)<\/faultstring>/i)?.[1] ||
      body.match(/<axlmessage[^>]*>([\s\S]*?)<\/axlmessage>/i)?.[1] ||
      `HTTP ${res.status}`;
    throw new HttpStatusError(String(fault).trim(), res.status);
  }
  return body;
};

/** Try AXL schema versions newest → oldest; stop on auth errors. Returns { body, version }. */
const axl = async (cfg, buildBody, op) => {
  const url = normalizeAxlUrl(cfg.url);
  let last;
  for (const v of AXL_VERSIONS) {
    try {
      const envelope = `<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns="${ns(
        v,
      )}"><soapenv:Header/><soapenv:Body>${buildBody()}</soapenv:Body></soapenv:Envelope>`;
      return { body: await soap(url, envelope, `"${ns(v)}#${op}"`, cfg), version: v };
    } catch (err) {
      last = err;
      if (err.status === 401 || err.status === 403 || classify(err) === "unreachable") break;
    }
  }
  throw last;
};

// Exact tag name (so "IP" doesn't match "IPAddress"), optional namespace prefix and attributes.
const tag = (xml, name) =>
  xml.match(new RegExp(`<(?:\\w+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${name}>`, "i"))?.[1]?.trim() || "";

/** Phones in a device pool → [{ref, label, meta}] */
const listPoolPhones = async (cfg) => {
  const pool = String(cfg.pool).replace(/'/g, "''");
  const sqlText =
    "select d.name, d.description from device d inner join devicepool dp on d.fkdevicepool = dp.pkid " +
    `where dp.name = '${pool}' and d.tkclass = 1 order by d.name`;
  const { body } = await axl(cfg, () => `<ns:executeSQLQuery><sql>${escapeXml(sqlText)}</sql></ns:executeSQLQuery>`, "executeSQLQuery");
  const rows = body.match(/<row>[\s\S]*?<\/row>/gi) || [];
  return rows
    .map((r) => ({ name: tag(r, "name"), description: tag(r, "description") }))
    .filter((r) => r.name)
    .map((r) => ({ ref: r.name, label: r.name, meta: r.description || "Cisco IP phone" }));
};

/** RIS: registered device name → IP, for up to 200 names per call. */
const risLookup = async (cfg, names) => {
  const out = {};
  if (!names.length) return out;
  const urls = risUrls(normalizeAxlUrl(cfg.url));
  for (let i = 0; i < names.length; i += 200) {
    const chunk = names.slice(i, i + 200);
    const envelope =
      `<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:soap="http://schemas.cisco.com/ast/soap">` +
      `<soapenv:Header/><soapenv:Body><soap:selectCmDevice><soap:StateInfo></soap:StateInfo><soap:CmSelectionCriteria>` +
      `<soap:MaxReturnedDevices>${chunk.length}</soap:MaxReturnedDevices><soap:DeviceClass>Phone</soap:DeviceClass>` +
      `<soap:Model>255</soap:Model><soap:Status>Registered</soap:Status><soap:NodeName></soap:NodeName><soap:SelectBy>Name</soap:SelectBy>` +
      `<soap:SelectItems>${chunk.map((n) => `<soap:item><soap:Item>${escapeXml(n)}</soap:Item></soap:item>`).join("")}</soap:SelectItems>` +
      `<soap:Protocol>Any</soap:Protocol><soap:DownloadStatus>Any</soap:DownloadStatus></soap:CmSelectionCriteria></soap:selectCmDevice></soapenv:Body></soapenv:Envelope>`;
    let body = null;
    let last;
    for (const url of urls) {
      try {
        body = await soap(url, envelope, "selectCmDevice", cfg);
        break;
      } catch (err) {
        last = err;
        if (err.status === 401 || err.status === 403) throw err;
      }
    }
    if (body == null) throw last;
    // Split on device <Name> tags; within each segment take the first IP.
    const re = /<(?:\w+:)?Name>([^<]+)<\/(?:\w+:)?Name>/gi;
    const hits = [];
    let m;
    while ((m = re.exec(body))) hits.push({ name: m[1].trim(), at: m.index });
    hits.forEach((h, idx) => {
      const seg = body.slice(h.at, idx + 1 < hits.length ? hits[idx + 1].at : body.length);
      const ip =
        tag(seg, "IP") || // RIS70: <IPAddress><item><IP>…</IP>
        (/<(?:\w+:)?IPAddress[^>]*>([^<]+)</i.exec(seg)?.[1] || "").trim(); // older flat form
      if (ip && chunk.includes(h.name)) out[h.name] = ip;
    });
  }
  return out;
};

const pushToPhone = async (cfg, ip, title, text) => {
  const textXml =
    `<?xml version="1.0" encoding="UTF-8"?><CiscoIPPhoneText><Title>${escapeXml(String(title || "Safety Check").slice(0, 32))}</Title>` +
    `<Text>${escapeXml(String(text || "").slice(0, 255))}</Text><Prompt>Exit</Prompt></CiscoIPPhoneText>`;
  const execute =
    `<?xml version="1.0" encoding="UTF-8"?><CiscoIPPhoneExecute>` +
    `<ExecuteItem Priority="0" URL="${escapeXml(`Data:text/plain,${encodeURIComponent(textXml)}`)}"/></CiscoIPPhoneExecute>`;
  // Phones expect the form field XML=<payload>
  const form = `XML=${encodeURIComponent(execute)}`;
  let last;
  for (const scheme of ["https", "http"]) {
    try {
      const res = await request({
        method: "POST",
        url: `${scheme}://${ip}/CGI/Execute`,
        data: form,
        timeout: 10000,
        headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: basicAuth(cfg.user, cfg.pass) },
      });
      if (isOk(res) && !/CiscoIPPhoneError/i.test(String(res.data || ""))) return true;
      last = new HttpStatusError(`Phone push failed with HTTP ${res.status}`, res.status);
    } catch (err) {
      last = err;
    }
  }
  throw last;
};

const cfgOf = ({ values: v, secrets: s }) => ({ url: v.url, user: v.user, pass: s.pass, pool: v.pool });

const verify = async (group) => {
  const cfg = cfgOf(group);
  try {
    await axl(cfg, () => "<ns:getCCMVersion/>", "getCCMVersion");
  } catch (err) {
    const k = classify(err);
    if (k === "auth") return { kind: "error", text: "Sign-in to CUCM failed. Check the username and password." };
    if (k === "unreachable")
      return { kind: "error", text: `Can’t reach ${hostOf(cfg.url)}. Check the address and that it is reachable from the internet.` };
    return { kind: "error", text: "CUCM didn’t accept the request. Check the CUCM URL and that the user has AXL access." };
  }
  let devices;
  try {
    devices = await listPoolPhones(cfg);
  } catch (err) {
    return { kind: "error", text: "Connected to CUCM, but couldn’t read the phones. Check the user has AXL read access." };
  }
  if (!devices.length) {
    return { kind: "error", text: `No phones found in device pool ${cfg.pool}. Check the device pool name.` };
  }
  try {
    const ips = await risLookup(
      cfg,
      devices.map((d) => d.ref),
    );
    const registered = Object.keys(ips).length;
    if (!registered) {
      return {
        kind: "error",
        text: `Connected to CUCM, but none of the ${devices.length} phones in ${cfg.pool} are registered.`,
        devices: devices.map((d) => ({ ...d, connected: false })),
      };
    }
    return {
      kind: "success",
      text: `Connected to CUCM. ${registered} registered phone${registered === 1 ? "" : "s"} found in ${cfg.pool}.`,
      summary:
        `${registered} registered phone${registered === 1 ? "" : "s"} in ${cfg.pool}` +
        (devices.length > registered ? ` · ${devices.length - registered} not registered (not alerted)` : ""),
      // connected = registered with CUCM; only connected phones are offered on New Incident.
      devices: devices.map((d) => ({ ...d, connected: !!ips[d.ref] })),
    };
  } catch (err) {
    return {
      kind: "warning",
      text: `Connected to CUCM. ${devices.length} phones found in ${cfg.pool}, but their registration couldn’t be checked. Check the user has the Standard CCM Admin Users and Standard RealtimeAndTraceCollection roles.`,
      summary: `${devices.length} phones in ${cfg.pool} · registration not checked`,
      devices,
    };
  }
};

const send = async (group, refs, { title, text }) => {
  const cfg = cfgOf(group);
  let ips = {};
  try {
    ips = await risLookup(cfg, refs);
  } catch (err) {
    return refs.map((ref) => ({ ref, ok: false, error: "RIS lookup failed: " + (err.message || err), status: "SEND_FAILED" }));
  }
  return mapLimit(refs, 10, async (ref) => {
    const ip = ips[ref];
    if (!ip) return { ref, ok: false, status: "DEVICE_IP_NOT_FOUND", error: "Phone not registered" };
    try {
      await pushToPhone(cfg, ip, title, text);
      return { ref, ok: true };
    } catch (err) {
      return { ref, ok: false, error: err.message || String(err) };
    }
  });
};

module.exports = { verify, send, normalizeAxlUrl, risUrls };
