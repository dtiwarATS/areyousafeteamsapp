/**
 * Algo devices: IP speakers (tone) and strobe lights.
 * REST API with "Standard" (HMAC-SHA256) or Basic auth; user is always "admin".
 */
const crypto = require("crypto");
const { request, isOk, basicAuth, trimSlash, HttpStatusError } = require("./http");

const md5Hex = (v) => crypto.createHash("md5").update(String(v || ""), "utf8").digest("hex");

/** Algo "standard" auth headers (same scheme as the previous ipSpeakerService). */
const standardHeaders = ({ method, requestUri, body, password, contentType = "application/json" }) => {
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = String(Math.floor(Math.random() * 1e9));
  const contentMd5 = body ? md5Hex(body) : "";
  const hmacInput = [method.toUpperCase(), requestUri, contentMd5, contentType, String(timestamp), nonce].join(":");
  const digest = crypto.createHmac("sha256", String(password || "")).update(hmacInput, "utf8").digest("hex");
  return {
    "Content-Type": contentType,
    "Content-MD5": contentMd5,
    Authorization: `hmac admin:${nonce}:${digest}`,
    Date: new Date().toUTCString(),
  };
};

const call = async ({ baseUrl, method, path, bodyObj, password, auth }) => {
  const body = bodyObj ? JSON.stringify(bodyObj) : "";
  const headers =
    auth === "basic"
      ? { Authorization: basicAuth("admin", password), "Content-Type": "application/json", Accept: "application/json" }
      : standardHeaders({ method, requestUri: path, body, password });
  const res = await request({ method, url: trimSlash(baseUrl) + path, data: body || undefined, headers });
  if (!isOk(res)) throw new HttpStatusError(`Algo ${path} failed with HTTP ${res.status}`, res.status);
  return res.data;
};

/** Sign in check — no sound or light. */
const about = (baseUrl, password, auth) => call({ baseUrl, method: "GET", path: "/api/info/about", password, auth });

const playTone = (baseUrl, password, auth, tonePath) =>
  call({
    baseUrl,
    method: "POST",
    path: "/api/controls/tone/start",
    bodyObj: { path: String(tonePath || "page-notif.wav"), loop: false },
    password,
    auth,
  });

/**
 * Strobe for `durationSeconds`. Algo strobes keep flashing until stopped, so we schedule
 * the stop. (A process restart during the window leaves the strobe on until the device's
 * own timeout / a manual stop — acceptable for an emergency alert.)
 */
const strobe = async (baseUrl, password, auth, durationSeconds) => {
  await call({
    baseUrl,
    method: "POST",
    path: "/api/controls/strobe/start",
    bodyObj: { pattern: 2, color1: "red", color2: "blue", ledlvl: 255, holdover: false },
    password,
    auth,
  });
  const ms = Math.max(5, Math.min(600, Number(durationSeconds) || 30)) * 1000;
  setTimeout(() => {
    call({ baseUrl, method: "POST", path: "/api/controls/strobe/stop", bodyObj: {}, password, auth }).catch(() => {});
  }, ms).unref?.();
};

module.exports = { about, playTone, strobe, standardHeaders };
