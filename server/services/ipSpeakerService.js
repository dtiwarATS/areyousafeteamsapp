const crypto = require("crypto");
const https = require("https");
const axios = require("axios");
const { processSafetyBotError } = require("../models/processError");

const insecureAgent = new https.Agent({ rejectUnauthorized: false });

const normalizeDeviceUrl = (rawUrl) => {
  const trimmed = String(rawUrl || "").trim();
  if (!trimmed) return "";
  let url = trimmed.replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  return url;
};

const buildBasicAuthHeader = (username, password) => {
  const token = Buffer.from(
    `${String(username || "")}:${String(password || "")}`,
    "utf8",
  ).toString("base64");
  return `Basic ${token}`;
};

const md5Hex = (value) =>
  crypto.createHash("md5").update(String(value || ""), "utf8").digest("hex");

const buildAlgoStandardHeaders = ({
  method,
  requestUri,
  body,
  password,
  contentType = "application/json",
}) => {
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = String(Math.floor(Math.random() * 1e9));
  const contentMd5 = body ? md5Hex(body) : "";
  const hmacInput = [
    method.toUpperCase(),
    requestUri,
    contentMd5,
    contentType,
    String(timestamp),
    nonce,
  ].join(":");
  // Algo expects lowercase hex HMAC digest (password + HMAC input via SHA-256).
  const hmacDigest = crypto
    .createHmac("sha256", String(password || ""))
    .update(hmacInput, "utf8")
    .digest("hex");
  const date = new Date().toUTCString();
  return {
    "Content-Type": contentType,
    "Content-MD5": contentMd5,
    Authorization: `hmac admin:${nonce}:${hmacDigest}`,
    Date: date,
  };
};

const getIpSpeakersConfigFromIntegration = (integrationConfigure) => {
  try {
    const cfg =
      typeof integrationConfigure === "string"
        ? JSON.parse(integrationConfigure)
        : integrationConfigure;
    const channel = cfg?.channels?.ipSpeakers;
    if (!channel?.enabled) return null;
    const vendor = channel.vendor === "axis" ? "axis" : "algo";
    return {
      enabled: true,
      events: {
        incident: !!channel.events?.incident,
        sos: !!channel.events?.sos,
        incidentFollowUp: !!channel.events?.incidentFollowUp,
      },
      vendor,
      algo: {
        url: String(channel.algo?.url || "").trim(),
        password: String(channel.algo?.password || ""),
        authMethod:
          channel.algo?.authMethod === "standard" ? "standard" : "basic",
        tonePath: String(channel.algo?.tonePath || "page-notif.wav"),
      },
      axis: {
        url: String(channel.axis?.url || "").trim(),
        username: String(channel.axis?.username || "").trim(),
        password: String(channel.axis?.password || ""),
        clipIndex: Number.isFinite(Number(channel.axis?.clipIndex))
          ? Number(channel.axis.clipIndex)
          : 0,
      },
    };
  } catch {
    return null;
  }
};

const verifyAlgo = async (algo) => {
  const baseUrl = normalizeDeviceUrl(algo?.url);
  if (!baseUrl) {
    return { ok: false, message: "Device URL is required for Algo." };
  }
  if (!algo?.password) {
    return { ok: false, message: "API Password is required for Algo." };
  }

  const requestUri = "/api/info/about";
  const url = `${baseUrl}${requestUri}`;
  const headers =
    algo.authMethod === "standard"
      ? buildAlgoStandardHeaders({
          method: "GET",
          requestUri,
          body: "",
          password: algo.password,
          contentType: "application/json",
        })
      : {
          Authorization: buildBasicAuthHeader("admin", algo.password),
          Accept: "application/json",
        };

  const response = await axios.get(url, {
    httpsAgent: insecureAgent,
    timeout: 15000,
    headers,
    validateStatus: () => true,
  });

  if (response.status >= 200 && response.status < 300) {
    return { ok: true, message: "Algo connection verified successfully." };
  }
  return {
    ok: false,
    message: `Algo verify failed with HTTP ${response.status}.`,
  };
};

const playAlgoTone = async (algo, _title, _text) => {
  const baseUrl = normalizeDeviceUrl(algo?.url);
  const requestUri = "/api/controls/tone/start";
  const bodyObj = {
    path: String(algo?.tonePath || "page-notif.wav"),
    loop: false,
  };
  const body = JSON.stringify(bodyObj);
  const headers =
    algo.authMethod === "standard"
      ? buildAlgoStandardHeaders({
          method: "POST",
          requestUri,
          body,
          password: algo.password,
        })
      : {
          Authorization: buildBasicAuthHeader("admin", algo.password),
          "Content-Type": "application/json",
        };

  const response = await axios.post(`${baseUrl}${requestUri}`, body, {
    httpsAgent: insecureAgent,
    timeout: 15000,
    headers,
    validateStatus: () => true,
  });
  if (response.status >= 200 && response.status < 300) {
    return { ok: true };
  }
  throw new Error(`Algo tone start failed with HTTP ${response.status}`);
};

const verifyAxis = async (axis) => {
  const baseUrl = normalizeDeviceUrl(axis?.url);
  if (!baseUrl) {
    return { ok: false, message: "Device URL is required for Axis." };
  }
  if (!axis?.username || !axis?.password) {
    return {
      ok: false,
      message: "Username and Password are required for Axis.",
    };
  }
  const url = `${baseUrl}/axis-cgi/param.cgi?action=list&group=MediaClip`;
  const response = await axios.get(url, {
    httpsAgent: insecureAgent,
    timeout: 15000,
    auth: {
      username: String(axis.username),
      password: String(axis.password),
    },
    validateStatus: () => true,
  });
  if (response.status >= 200 && response.status < 300) {
    return { ok: true, message: "Axis connection verified successfully." };
  }
  return {
    ok: false,
    message: `Axis verify failed with HTTP ${response.status}.`,
  };
};

const playAxisClip = async (axis) => {
  const baseUrl = normalizeDeviceUrl(axis?.url);
  const clip = Number.isFinite(Number(axis?.clipIndex))
    ? Number(axis.clipIndex)
    : 0;
  const url = `${baseUrl}/axis-cgi/mediaclip.cgi?action=play&clip=${encodeURIComponent(
    clip,
  )}`;
  const response = await axios.get(url, {
    httpsAgent: insecureAgent,
    timeout: 15000,
    auth: {
      username: String(axis.username || ""),
      password: String(axis.password || ""),
    },
    validateStatus: () => true,
  });
  if (response.status >= 200 && response.status < 300) {
    return { ok: true };
  }
  throw new Error(`Axis clip play failed with HTTP ${response.status}`);
};

const verifyConnection = async ({ vendor, algo, axis }) => {
  try {
    if (vendor === "axis") {
      return await verifyAxis(axis);
    }
    return await verifyAlgo(algo);
  } catch (err) {
    processSafetyBotError(
      err,
      "",
      "",
      "",
      "error in ipSpeakerService.verifyConnection",
    );
    return {
      ok: false,
      message: err?.message || "Could not verify IP Speakers connection.",
    };
  }
};

const sendAlert = async (config, title, text) => {
  if (!config?.enabled) {
    return { ok: false, skipped: true, reason: "DISABLED" };
  }
  try {
    if (config.vendor === "axis") {
      await playAxisClip(config.axis);
      return { ok: true, vendor: "axis" };
    }
    await playAlgoTone(config.algo, title, text);
    return { ok: true, vendor: "algo" };
  } catch (err) {
    processSafetyBotError(
      err,
      "",
      "",
      "",
      "error in ipSpeakerService.sendAlert",
    );
    return {
      ok: false,
      reason: "SEND_FAILED",
      message: err?.message || "IP Speakers send failed",
    };
  }
};

module.exports = {
  getIpSpeakersConfigFromIntegration,
  verifyConnection,
  sendAlert,
  normalizeDeviceUrl,
};
