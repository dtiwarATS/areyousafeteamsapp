/**
 * Shared HTTP helpers for device adapters.
 * Certificate checks are skipped on purpose: on-prem speakers, CUCM and MagicINFO servers
 * commonly use self-signed certificates (agreed in the design review).
 */
const https = require("https");
const axios = require("axios");

const insecureAgent = new https.Agent({ rejectUnauthorized: false });

const DEFAULT_TIMEOUT = 15000;

const basicAuth = (username, password) =>
  "Basic " + Buffer.from(`${String(username || "")}:${String(password || "")}`, "utf8").toString("base64");

/** axios request that never throws on HTTP status (only on network errors). */
const request = (config) =>
  axios.request({
    httpsAgent: insecureAgent,
    timeout: DEFAULT_TIMEOUT,
    validateStatus: () => true,
    maxRedirects: 0,
    ...config,
  });

const isOk = (res) => res && res.status >= 200 && res.status < 300;

/** Classify a thrown network error or a non-2xx response. */
const classify = (errOrRes) => {
  if (errOrRes && typeof errOrRes.status === "number" && errOrRes.config) {
    if (errOrRes.status === 401 || errOrRes.status === 403) return "auth";
    return "other";
  }
  const code = String(errOrRes?.code || "").toUpperCase();
  const msg = String(errOrRes?.message || "").toLowerCase();
  if (
    ["ENOTFOUND", "ECONNREFUSED", "ETIMEDOUT", "ECONNRESET", "EHOSTUNREACH", "ENETUNREACH", "ECONNABORTED", "EAI_AGAIN"].includes(code) ||
    msg.includes("timeout") ||
    msg.includes("socket hang up")
  ) {
    return "unreachable";
  }
  if (errOrRes?.status === 401 || errOrRes?.status === 403) return "auth";
  return "other";
};

const hostOf = (u) => {
  const m = /^https?:\/\/([^/\s:]+)/i.exec(String(u || ""));
  return m ? m[1] : String(u || "");
};

const trimSlash = (u) => String(u || "").trim().replace(/\/+$/, "");

/** Error carrying an HTTP status so classify() can tell auth from other failures. */
class HttpStatusError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/** Is the emulator enabled for this environment (staging only)? */
const simulatorEnabled = () => String(process.env.DEVICE_SIMULATOR || "").toLowerCase() === "true";

/** Base URL where /sim is mounted (this API's public URL). */
const simulatorBase = () =>
  trimSlash(process.env.DEVICE_SIMULATOR_BASE_URL || process.env.serviceUrl || "http://localhost:3978") + "/sim";

/** Run async fn over items with limited concurrency. */
const mapLimit = async (items, limit, fn) => {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
};

const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

module.exports = {
  insecureAgent,
  basicAuth,
  request,
  isOk,
  classify,
  hostOf,
  trimSlash,
  HttpStatusError,
  simulatorEnabled,
  simulatorBase,
  mapLimit,
  plural,
};
