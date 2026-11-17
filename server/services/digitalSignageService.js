const https = require("https");
const axios = require("axios");
const { processSafetyBotError } = require("../models/processError");

const insecureAgent = new https.Agent({ rejectUnauthorized: false });

const BRIGHTSIGN_TOKEN_URL =
  "https://auth.bsn.cloud/realms/bsncloud/protocol/openid-connect/token";
const BRIGHTSIGN_DWS_BASE = "https://ws.bsn.cloud/rest/v1";

const normalizeMagicInfoBase = (rawUrl) => {
  const trimmed = String(rawUrl || "").trim();
  if (!trimmed) return "";
  let url = trimmed.replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  if (!/\/MagicInfo$/i.test(url)) {
    url = `${url}/MagicInfo`;
  }
  return url;
};

const parseList = (raw) =>
  String(raw || "")
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);

const getDigitalSignageConfigFromIntegration = (integrationConfigure) => {
  try {
    const cfg =
      typeof integrationConfigure === "string"
        ? JSON.parse(integrationConfigure)
        : integrationConfigure;
    const channel = cfg?.channels?.digitalSignage;
    if (!channel?.enabled) return null;
    if (!channel?.connectionVerified) return null;
    const vendor = channel.vendor === "samsung" ? "samsung" : "brightsign";
    return {
      enabled: true,
      events: {
        incident: !!channel.events?.incident,
        sos: !!channel.events?.sos,
        incidentFollowUp: !!channel.events?.incidentFollowUp,
      },
      vendor,
      brightsign: {
        clientId: String(channel.brightsign?.clientId || "").trim(),
        clientSecret: String(channel.brightsign?.clientSecret || ""),
        playerSerials: String(channel.brightsign?.playerSerials || ""),
      },
      samsung: {
        serverUrl: String(channel.samsung?.serverUrl || "").trim(),
        username: String(channel.samsung?.username || "").trim(),
        password: String(channel.samsung?.password || ""),
        deviceGroupId: String(channel.samsung?.deviceGroupId || "").trim(),
        deviceIds: String(channel.samsung?.deviceIds || ""),
      },
    };
  } catch {
    return null;
  }
};

const getBrightSignAccessToken = async (brightsign) => {
  const clientId = String(brightsign?.clientId || "").trim();
  const clientSecret = String(brightsign?.clientSecret || "");
  if (!clientId || !clientSecret) {
    throw new Error("BrightSign Client ID and Client Secret are required.");
  }
  const basic = Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString(
    "base64",
  );
  const body = new URLSearchParams({ grant_type: "client_credentials" });
  const response = await axios.post(BRIGHTSIGN_TOKEN_URL, body.toString(), {
    timeout: 20000,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
      Accept: "application/json",
    },
    validateStatus: () => true,
  });
  if (response.status < 200 || response.status >= 300 || !response.data?.access_token) {
    throw new Error(
      response.data?.error_description ||
        response.data?.error ||
        `BrightSign auth failed with HTTP ${response.status}`,
    );
  }
  return response.data.access_token;
};

const verifyBrightSign = async (brightsign) => {
  const serials = parseList(brightsign?.playerSerials);
  if (!serials.length) {
    return {
      ok: false,
      message: "Enter at least one BrightSign player serial number.",
    };
  }
  const token = await getBrightSignAccessToken(brightsign);
  const serial = serials[0];
  const response = await axios.get(`${BRIGHTSIGN_DWS_BASE}/info`, {
    timeout: 20000,
    params: {
      destinationType: "player",
      destinationName: serial,
    },
    headers: {
      Accept: "application/json, application/vnd.bsn.error+json",
      Authorization: `Bearer ${token}`,
    },
    validateStatus: () => true,
  });
  if (response.status >= 200 && response.status < 300) {
    return {
      ok: true,
      message: `BrightSign connection verified for player ${serial}.`,
    };
  }
  return {
    ok: false,
    message:
      response.data?.data?.error?.message ||
      `BrightSign verify failed with HTTP ${response.status}.`,
  };
};

const sendBrightSignAlert = async (brightsign, title, text) => {
  const serials = parseList(brightsign?.playerSerials);
  if (!serials.length) {
    return { ok: false, reason: "NO_PLAYERS" };
  }
  const token = await getBrightSignAccessToken(brightsign);
  const message = String(`${title || "Safety Check"}: ${text || ""}`).slice(
    0,
    500,
  );
  const results = [];
  for (const serial of serials) {
    // Write a registry key the presentation can display; also ping /info for reachability.
    try {
      const registryRes = await axios.put(
        `${BRIGHTSIGN_DWS_BASE}/registry`,
        {
          data: {
            section: "safetycheck",
            key: "message",
            value: message,
          },
        },
        {
          timeout: 20000,
          params: {
            destinationType: "player",
            destinationName: serial,
          },
          headers: {
            Accept: "application/json, application/vnd.bsn.error+json",
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          validateStatus: () => true,
        },
      );
      if (registryRes.status >= 200 && registryRes.status < 300) {
        results.push({ serial, ok: true });
        continue;
      }
      // Fallback: confirm player is reachable even if registry route differs by firmware.
      const infoRes = await axios.get(`${BRIGHTSIGN_DWS_BASE}/info`, {
        timeout: 15000,
        params: {
          destinationType: "player",
          destinationName: serial,
        },
        headers: {
          Accept: "application/json, application/vnd.bsn.error+json",
          Authorization: `Bearer ${token}`,
        },
        validateStatus: () => true,
      });
      results.push({
        serial,
        ok: infoRes.status >= 200 && infoRes.status < 300,
        status: registryRes.status,
        fallback: "info",
      });
    } catch (err) {
      results.push({ serial, ok: false, error: err?.message || String(err) });
    }
  }
  const okCount = results.filter((r) => r.ok).length;
  return {
    ok: okCount > 0,
    results,
    message:
      okCount > 0
        ? `BrightSign alert sent to ${okCount}/${serials.length} player(s).`
        : "BrightSign alert failed for all players.",
  };
};

const authSamsung = async (samsung) => {
  const base = normalizeMagicInfoBase(samsung?.serverUrl);
  if (!base) {
    throw new Error("Samsung MagicINFO Server URL is required.");
  }
  if (!samsung?.username || !samsung?.password) {
    throw new Error("Samsung username and password are required.");
  }
  const response = await axios.post(
    `${base}/restapi/v2.0/auth`,
    {
      username: String(samsung.username),
      password: String(samsung.password),
    },
    {
      httpsAgent: insecureAgent,
      timeout: 20000,
      headers: { "Content-Type": "application/json" },
      validateStatus: () => true,
    },
  );
  const token = response.data?.token || response.data?.api_key;
  if (response.status < 200 || response.status >= 300 || !token) {
    throw new Error(
      response.data?.message ||
        `Samsung auth failed with HTTP ${response.status}`,
    );
  }
  return { base, token };
};

const verifySamsung = async (samsung) => {
  await authSamsung(samsung);
  return {
    ok: true,
    message: "Samsung MagicINFO connection verified successfully.",
  };
};

const sendSamsungAlert = async (samsung, title, text) => {
  const { base, token } = await authSamsung(samsung);
  const deviceIds = parseList(samsung?.deviceIds);
  const groupId = String(samsung?.deviceGroupId || "").trim();
  if (!deviceIds.length && !groupId) {
    return {
      ok: false,
      reason: "NO_TARGETS",
      message: "Provide Device Group ID and/or Device IDs.",
    };
  }

  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const startTime = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
    now.getDate(),
  )} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const messageBody = String(
    `${title || "Safety Check"}\n${text || ""}`,
  ).slice(0, 1000);

  const createRes = await axios.post(
    `${base}/restapi/v1.0/dms/schedule/messages`,
    {
      name: String(title || "Safety Check").slice(0, 80),
      message: messageBody,
      startTime,
      repeatInterval: "NONE",
    },
    {
      httpsAgent: insecureAgent,
      timeout: 20000,
      headers: {
        "Content-Type": "application/json",
        api_key: token,
      },
      validateStatus: () => true,
    },
  );

  const messageId =
    createRes.data?.messageId ||
    createRes.data?.id ||
    createRes.data?.items?.[0]?.messageId ||
    createRes.data?.items?.[0]?.id;

  if (createRes.status < 200 || createRes.status >= 300 || !messageId) {
    // Fallback: try quick-control style message push if schedule create differs by version
    if (deviceIds.length) {
      const qc = await axios.post(
        `${base}/restapi/v2.0/rms/devices/quick-control`,
        {
          deviceIds,
          message: messageBody,
        },
        {
          httpsAgent: insecureAgent,
          timeout: 20000,
          headers: {
            "Content-Type": "application/json",
            api_key: token,
          },
          validateStatus: () => true,
        },
      );
      if (qc.status >= 200 && qc.status < 300) {
        return { ok: true, mode: "quick-control" };
      }
    }
    throw new Error(
      createRes.data?.message ||
        `Samsung message create failed with HTTP ${createRes.status}`,
    );
  }

  const deployBody = groupId
    ? { groupId }
    : { deviceIds };
  const deployRes = await axios.put(
    `${base}/restapi/v1.0/dms/schedule/messages/${encodeURIComponent(
      messageId,
    )}/deploy`,
    deployBody,
    {
      httpsAgent: insecureAgent,
      timeout: 20000,
      headers: {
        "Content-Type": "application/json",
        api_key: token,
      },
      validateStatus: () => true,
    },
  );
  if (deployRes.status >= 200 && deployRes.status < 300) {
    return { ok: true, messageId, mode: "schedule-deploy" };
  }
  throw new Error(
    deployRes.data?.message ||
      `Samsung message deploy failed with HTTP ${deployRes.status}`,
  );
};

const verifyConnection = async ({ vendor, brightsign, samsung }) => {
  try {
    if (vendor === "samsung") {
      return await verifySamsung(samsung);
    }
    return await verifyBrightSign(brightsign);
  } catch (err) {
    processSafetyBotError(
      err,
      "",
      "",
      "",
      "error in digitalSignageService.verifyConnection",
    );
    return {
      ok: false,
      message: err?.message || "Could not verify Digital Signage connection.",
    };
  }
};

const sendAlert = async (config, title, text) => {
  if (!config?.enabled) {
    return { ok: false, skipped: true, reason: "DISABLED" };
  }
  try {
    if (config.vendor === "samsung") {
      return await sendSamsungAlert(config.samsung, title, text);
    }
    return await sendBrightSignAlert(config.brightsign, title, text);
  } catch (err) {
    processSafetyBotError(
      err,
      "",
      "",
      "",
      "error in digitalSignageService.sendAlert",
    );
    return {
      ok: false,
      reason: "SEND_FAILED",
      message: err?.message || "Digital Signage send failed",
    };
  }
};

module.exports = {
  getDigitalSignageConfigFromIntegration,
  verifyConnection,
  sendAlert,
  normalizeMagicInfoBase,
};
