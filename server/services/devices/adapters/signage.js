/**
 * Digital Signage adapter.
 *  BrightSign (BSN.cloud): OAuth client-credentials → per-player DWS /info (verify) and
 *    /registry key safetycheck/message (send; the player's Safety Check alert add-on shows it).
 *  Samsung MagicINFO: REST auth → devices in the group (verify + snapshot) → schedule message
 *    + deploy to the selected devices (send).
 *
 * Staging emulator: BSN.cloud has fixed hosts, so when DEVICE_SIMULATOR=true and the Client ID
 * starts with "sim", the BSN URLs point at /sim/bsn (agreed rule). MagicINFO is addressed by
 * its Server URL, so it needs no special case.
 */
const { listItems } = require("../definitions");
const { request, isOk, classify, hostOf, mapLimit, trimSlash, HttpStatusError, simulatorEnabled, simulatorBase } = require("./http");

/* ------------------------------- BrightSign ------------------------------- */

const bsnUrls = (clientId) => {
  if (simulatorEnabled() && /^sim/i.test(String(clientId || ""))) {
    const b = simulatorBase() + "/bsn";
    return { token: `${b}/auth/token`, dws: `${b}/rest/v1` };
  }
  return {
    token: "https://auth.bsn.cloud/realms/bsncloud/protocol/openid-connect/token",
    dws: "https://ws.bsn.cloud/rest/v1",
  };
};

const bsnToken = async (cid, secret) => {
  const urls = bsnUrls(cid);
  const res = await request({
    method: "POST",
    url: urls.token,
    data: new URLSearchParams({ grant_type: "client_credentials" }).toString(),
    timeout: 20000,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + Buffer.from(`${cid}:${secret}`, "utf8").toString("base64"),
      Accept: "application/json",
    },
  });
  if (!isOk(res) || !res.data?.access_token) {
    const status = res.status === 400 || res.status === 401 || res.status === 403 ? 401 : res.status;
    throw new HttpStatusError(res.data?.error_description || `BSN auth failed with HTTP ${res.status}`, status);
  }
  return { token: res.data.access_token, dws: urls.dws };
};

const bsnPlayerCall = async (ctx, method, path, serial, data) => {
  const res = await request({
    method,
    url: `${ctx.dws}${path}`,
    params: { destinationType: "player", destinationName: serial },
    data,
    timeout: 20000,
    headers: {
      Accept: "application/json, application/vnd.bsn.error+json",
      Authorization: `Bearer ${ctx.token}`,
      ...(data ? { "Content-Type": "application/json" } : {}),
    },
  });
  if (!isOk(res)) throw new HttpStatusError(`BSN ${path} failed with HTTP ${res.status}`, res.status);
  return res.data;
};

const verifyBrightSign = async (v, s) => {
  const serials = listItems(v.serials);
  const devices = serials.map((x) => ({ ref: x, label: x, meta: "BrightSign player" }));
  let ctx;
  try {
    ctx = await bsnToken(v.cid, s.csecret);
  } catch (err) {
    if (classify(err) === "auth") return { kind: "error", text: "Sign-in to BSN.cloud failed. Check the Client ID and Client Secret." };
    return { kind: "error", text: "Couldn’t reach BSN.cloud. Try again in a few minutes." };
  }
  const results = await mapLimit(serials, 5, async (serial) => {
    try {
      await bsnPlayerCall(ctx, "GET", "/info", serial);
      return { serial, ok: true };
    } catch (err) {
      return { serial, ok: false };
    }
  });
  const ok = results.filter((r) => r.ok);
  const bad = results.filter((r) => !r.ok);
  // connected = player answered at Verify; only connected players are offered on New Incident.
  devices.forEach((d) => (d.connected = results.some((r) => r.serial === d.ref && r.ok)));
  if (!ok.length) {
    return {
      kind: "error",
      text: `No players responded. Check the serial numbers and that the players are online in BSN.cloud.`,
      devices,
    };
  }
  if (bad.length) {
    return {
      kind: "warning",
      text: `${ok.length} of ${serials.length} players connected. Not reached: ${bad
        .map((b) => b.serial)
        .join(", ")}. Fix it and verify again, or save as is.`,
      devices,
    };
  }
  const count = serials.length === 1 ? "1 player" : `${serials.length} of ${serials.length} players`;
  return { kind: "success", text: `Connected. ${count} responded.`, devices };
};

const sendBrightSign = async (v, s, refs, { title, text }) => {
  let ctx;
  try {
    ctx = await bsnToken(v.cid, s.csecret);
  } catch (err) {
    return refs.map((ref) => ({ ref, ok: false, error: err.message }));
  }
  const message = `${title || "Safety Check"}: ${text || ""}`.slice(0, 500);
  return mapLimit(refs, 5, async (serial) => {
    try {
      await bsnPlayerCall(ctx, "PUT", "/registry", serial, { data: { section: "safetycheck", key: "message", value: message } });
      return { ref: serial, ok: true };
    } catch (err) {
      return { ref: serial, ok: false, error: err.message };
    }
  });
};

/* --------------------------------- Samsung -------------------------------- */

const magicInfoBase = (raw) => {
  let url = trimSlash(raw);
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return /\/MagicInfo$/i.test(url) ? url : `${url}/MagicInfo`;
};

const samsungAuth = async (v, s) => {
  const base = magicInfoBase(v.server);
  const res = await request({
    method: "POST",
    url: `${base}/restapi/v2.0/auth`,
    data: { username: String(v.user), password: String(s.pass) },
    timeout: 20000,
    headers: { "Content-Type": "application/json" },
  });
  const token = res.data?.token || res.data?.api_key;
  if (!isOk(res) || !token) {
    const status = res.status === 400 || res.status === 401 || res.status === 403 ? 401 : res.status;
    throw new HttpStatusError(res.data?.message || `MagicINFO auth failed with HTTP ${res.status}`, status);
  }
  return { base, token };
};

/** Displays in the MagicINFO group → [{ref,label,meta}] */
const samsungGroupDevices = async (ctx, groupId) => {
  const res = await request({
    method: "POST",
    url: `${ctx.base}/restapi/v2.0/rms/devices/filter`,
    data: { groupId: String(groupId), startIndex: 1, pageSize: 500 },
    timeout: 20000,
    headers: { "Content-Type": "application/json", api_key: ctx.token },
  });
  if (!isOk(res)) throw new HttpStatusError(`MagicINFO device list failed with HTTP ${res.status}`, res.status);
  const items = res.data?.items || res.data?.list || [];
  return items.map((d) => ({
    ref: String(d.deviceId || d.device_id || d.id),
    label: String(d.deviceName || d.device_name || d.deviceId || d.id),
    meta: "Samsung display",
  }));
};

const verifySamsung = async (v, s) => {
  let ctx;
  try {
    ctx = await samsungAuth(v, s);
  } catch (err) {
    const k = classify(err);
    if (k === "auth") return { kind: "error", text: "Sign-in to MagicINFO Server failed. Check the username and password." };
    return { kind: "error", text: `Can’t reach ${hostOf(v.server)}. Check the address and that it is reachable from the internet.` };
  }
  let devices;
  try {
    devices = await samsungGroupDevices(ctx, v.group);
  } catch (err) {
    return { kind: "error", text: `Connected to MagicINFO Server, but group ${v.group} wasn’t found. Check the group ID.` };
  }
  if (!devices.length) {
    return { kind: "error", text: `Connected to MagicINFO Server, but group ${v.group} has no displays.` };
  }
  return { kind: "success", text: "Connected to MagicINFO Server. Group found.", devices };
};

const sendSamsung = async (v, s, refs, { title, text }) => {
  try {
    const ctx = await samsungAuth(v, s);
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const startTime = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(
      now.getMinutes(),
    )}`;
    const headers = { "Content-Type": "application/json", api_key: ctx.token };
    const created = await request({
      method: "POST",
      url: `${ctx.base}/restapi/v1.0/dms/schedule/messages`,
      data: {
        name: String(title || "Safety Check").slice(0, 80),
        message: `${title || "Safety Check"}\n${text || ""}`.slice(0, 1000),
        startTime,
        repeatInterval: "NONE",
      },
      timeout: 20000,
      headers,
    });
    const messageId = created.data?.messageId || created.data?.id || created.data?.items?.[0]?.messageId;
    if (!isOk(created) || !messageId) throw new Error(`MagicINFO message create failed with HTTP ${created.status}`);
    const deployed = await request({
      method: "PUT",
      url: `${ctx.base}/restapi/v1.0/dms/schedule/messages/${encodeURIComponent(messageId)}/deploy`,
      data: { deviceIds: refs },
      timeout: 20000,
      headers,
    });
    if (!isOk(deployed)) throw new Error(`MagicINFO message deploy failed with HTTP ${deployed.status}`);
    return refs.map((ref) => ({ ref, ok: true }));
  } catch (err) {
    return refs.map((ref) => ({ ref, ok: false, error: err.message || String(err) }));
  }
};

/* ---------------------------------- API ----------------------------------- */

const verify = ({ values: v, secrets: s }) => (v.vendor === "samsung" ? verifySamsung(v, s) : verifyBrightSign(v, s));

const send = ({ values: v, secrets: s }, refs, msg) =>
  v.vendor === "samsung" ? sendSamsung(v, s, refs, msg) : sendBrightSign(v, s, refs, msg);

module.exports = { verify, send, bsnUrls, magicInfoBase };
