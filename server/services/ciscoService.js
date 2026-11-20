const https = require("https");
const axios = require("axios");
const { processSafetyBotError } = require("../models/processError");

const insecureAgent = new https.Agent({ rejectUnauthorized: false });

const escapeXml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const normalizeAxlUrl = (rawUrl) => {
  const trimmed = String(rawUrl || "").trim();
  if (!trimmed) return "";
  let url = trimmed.replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  // Accept either base host or full /axl/ path
  if (!/\/axl$/i.test(url) && !/\/axl\//i.test(url)) {
    url = `${url}/axl/`;
  } else if (/\/axl$/i.test(url)) {
    url = `${url}/`;
  }
  return url;
};

const getCucmHostFromAxlUrl = (axlUrl) => {
  try {
    return new URL(axlUrl).hostname;
  } catch {
    return "";
  }
};

const buildBasicAuthHeader = (username, password) => {
  const token = Buffer.from(
    `${String(username || "")}:${String(password || "")}`,
    "utf8",
  ).toString("base64");
  return `Basic ${token}`;
};

const getAxlNamespace = (version = "14.0") =>
  `http://www.cisco.com/AXLAPIService/${version}`;

const buildGetCcmVersionEnvelope = (version = "14.0") => `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns="${getAxlNamespace(version)}">
  <soapenv:Header/>
  <soapenv:Body>
    <ns:getCCMVersion/>
  </soapenv:Body>
</soapenv:Envelope>`;

const buildExecuteSqlEnvelope = (sql, version = "14.0") => `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns="${getAxlNamespace(version)}">
  <soapenv:Header/>
  <soapenv:Body>
    <ns:executeSQLQuery>
      <sql>${escapeXml(sql)}</sql>
    </ns:executeSQLQuery>
  </soapenv:Body>
</soapenv:Envelope>`;

const postAxl = async (cucm, soapBody, soapAction) => {
  const axlUrl = normalizeAxlUrl(cucm?.url);
  if (!axlUrl) {
    throw new Error("CUCM URL is required");
  }
  if (!cucm?.username || !cucm?.password) {
    throw new Error("CUCM username and password are required");
  }

  const response = await axios.post(axlUrl, soapBody, {
    httpsAgent: insecureAgent,
    timeout: 20000,
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: soapAction || '""',
      Authorization: buildBasicAuthHeader(cucm.username, cucm.password),
    },
    validateStatus: () => true,
  });

  const body = typeof response.data === "string" ? response.data : String(response.data || "");
  if (response.status < 200 || response.status >= 300) {
    const fault =
      body.match(/<faultstring[^>]*>([\s\S]*?)<\/faultstring>/i)?.[1] ||
      body.match(/<axlError[^>]*>[\s\S]*?<axlmessage[^>]*>([\s\S]*?)<\/axlmessage>/i)?.[1] ||
      `AXL request failed with HTTP ${response.status}`;
    const err = new Error(String(fault).trim());
    err.status = response.status;
    throw err;
  }
  if (/<faultstring/i.test(body) || /<soapenv:Fault/i.test(body)) {
    const fault =
      body.match(/<faultstring[^>]*>([\s\S]*?)<\/faultstring>/i)?.[1] ||
      "AXL SOAP fault";
    throw new Error(String(fault).trim());
  }
  return body;
};

/**
 * Verify CUCM AXL credentials via getCCMVersion.
 */
const verifyConnection = async (cucm) => {
  const versionsToTry = ["14.0", "12.5", "11.5", "10.5"];
  let lastError = null;
  for (const version of versionsToTry) {
    try {
      const body = await postAxl(
        cucm,
        buildGetCcmVersionEnvelope(version),
        `"${getAxlNamespace(version)}#getCCMVersion"`,
      );
      const ccmVersion =
        body.match(/<version[^>]*>([\s\S]*?)<\/version>/i)?.[1]?.trim() ||
        body.match(/<ns:version[^>]*>([\s\S]*?)<\/ns:version>/i)?.[1]?.trim() ||
        "";
      return {
        ok: true,
        message: ccmVersion
          ? `Connection verified (CUCM ${ccmVersion}).`
          : "Connection verified successfully.",
        version: ccmVersion || version,
      };
    } catch (err) {
      lastError = err;
      // Retry other AXL schema versions on auth/version mismatches
      if (err?.status === 401 || err?.status === 403) {
        break;
      }
    }
  }
  const {
    mapConnectionErrorToFriendlyMessage,
  } = require("./connectionErrorMapper");
  return {
    ok: false,
    message: mapConnectionErrorToFriendlyMessage(
      lastError,
      "Could not verify CUCM connection. Check URL and AXL credentials.",
    ),
  };
};

const normalizeDirectoryNumber = (raw) => {
  const value = String(raw || "").trim();
  if (!value) return "";
  // Prefer digits for DN match; keep leading + if present for E.164 desk lines
  const digits = value.replace(/[^\d+]/g, "");
  return digits || value;
};

/**
 * Resolve registered Cisco IP phone device name + IP for a directory number.
 */
const resolvePhoneByDirectoryNumber = async (cucm, directoryNumber) => {
  const dn = normalizeDirectoryNumber(directoryNumber);
  if (!dn) return null;

  const sql = `
    select d.name as deviceName, d.description as deviceDescription
    from device d
    inner join devicenumplanmap map on map.fkdevice = d.pkid
    inner join numplan np on map.fknumplan = np.pkid
    where np.dnorpattern = '${dn.replace(/'/g, "''")}'
  `;

  let deviceName = "";
  try {
    const versionsToTry = ["14.0", "12.5", "11.5"];
    let xml = "";
    for (const version of versionsToTry) {
      try {
        xml = await postAxl(
          cucm,
          buildExecuteSqlEnvelope(sql, version),
          `"${getAxlNamespace(version)}#executeSQLQuery"`,
        );
        break;
      } catch (err) {
        if (err?.status === 401 || err?.status === 403) throw err;
      }
    }
    deviceName =
      xml.match(/<deviceName[^>]*>([\s\S]*?)<\/deviceName>/i)?.[1]?.trim() ||
      xml.match(/<name[^>]*>([\s\S]*?)<\/name>/i)?.[1]?.trim() ||
      "";
  } catch (err) {
    processSafetyBotError(
      err,
      "",
      "",
      "",
      "error in ciscoService.resolvePhoneByDirectoryNumber AXL SQL",
    );
    return null;
  }

  if (!deviceName) return null;

  const ip = await resolveDeviceIp(cucm, deviceName);
  return {
    deviceName,
    ip: ip || "",
    directoryNumber: dn,
  };
};

const buildRisSelectEnvelope = (deviceName) => `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:soap="http://schemas.cisco.com/ast/soap">
  <soapenv:Header/>
  <soapenv:Body>
    <soap:selectCmDevice>
      <soap:StateInfo></soap:StateInfo>
      <soap:CmSelectionCriteria>
        <soap:MaxReturnedDevices>10</soap:MaxReturnedDevices>
        <soap:DeviceClass>Phone</soap:DeviceClass>
        <soap:Model>255</soap:Model>
        <soap:Status>Any</soap:Status>
        <soap:NodeName></soap:NodeName>
        <soap:SelectBy>Name</soap:SelectBy>
        <soap:SelectItems>
          <soap:item>
            <soap:Item>${escapeXml(deviceName)}</soap:Item>
          </soap:item>
        </soap:SelectItems>
        <soap:Protocol>Any</soap:Protocol>
        <soap:DownloadStatus>Any</soap:DownloadStatus>
      </soap:CmSelectionCriteria>
    </soap:selectCmDevice>
  </soap:Body>
</soapenv:Envelope>`;

const resolveDeviceIp = async (cucm, deviceName) => {
  const host = getCucmHostFromAxlUrl(normalizeAxlUrl(cucm?.url));
  if (!host || !deviceName) return "";

  const risUrls = [
    `https://${host}:8443/realtimeservice2/services/RISService70`,
    `https://${host}:8443/realtimeservice/services/RisPort70`,
  ];

  for (const risUrl of risUrls) {
    try {
      const response = await axios.post(risUrl, buildRisSelectEnvelope(deviceName), {
        httpsAgent: insecureAgent,
        timeout: 15000,
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          SOAPAction: "selectCmDevice",
          Authorization: buildBasicAuthHeader(cucm.username, cucm.password),
        },
        validateStatus: () => true,
      });
      const body =
        typeof response.data === "string"
          ? response.data
          : String(response.data || "");
      if (response.status < 200 || response.status >= 300) continue;
      const ip =
        body.match(/<IPAddress[^>]*>([\s\S]*?)<\/IPAddress>/i)?.[1]?.trim() ||
        body.match(/<ns:IPAddress[^>]*>([\s\S]*?)<\/ns:IPAddress>/i)?.[1]?.trim() ||
        "";
      if (ip) return ip;
    } catch (_err) {
      // try next RIS endpoint
    }
  }
  return "";
};

const buildPhoneTextXml = (title, text) =>
  `<?xml version="1.0" encoding="UTF-8"?>` +
  `<CiscoIPPhoneText>` +
  `<Title>${escapeXml(String(title || "Safety Check").slice(0, 32))}</Title>` +
  `<Text>${escapeXml(String(text || "").slice(0, 255))}</Text>` +
  `<Prompt>Exit</Prompt>` +
  `</CiscoIPPhoneText>`;

const buildPhoneExecuteXml = (title, text) => {
  const dataUri = `Data:text/plain,${encodeURIComponent(
    buildPhoneTextXml(title, text),
  )}`;
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<CiscoIPPhoneExecute>` +
    `<ExecuteItem Priority="0" URL="${escapeXml(dataUri)}"/>` +
    `</CiscoIPPhoneExecute>`
  );
};

/**
 * Push an alert-only CiscoIPPhoneText display to a phone IP.
 */
const pushAlertToPhoneIp = async (cucm, phoneIp, title, text) => {
  const ip = String(phoneIp || "").trim();
  if (!ip) {
    throw new Error("Phone IP address not available");
  }

  const executeXml = buildPhoneExecuteXml(title, text);
  const endpoints = [
    `https://${ip}/CGI/Execute`,
    `http://${ip}/CGI/Execute`,
  ];

  let lastError = null;
  for (const endpoint of endpoints) {
    try {
      const response = await axios.post(endpoint, executeXml, {
        httpsAgent: insecureAgent,
        timeout: 10000,
        headers: {
          "Content-Type": "application/xml; charset=utf-8",
          Authorization: buildBasicAuthHeader(cucm.username, cucm.password),
        },
        validateStatus: () => true,
      });
      if (response.status >= 200 && response.status < 300) {
        return { ok: true, endpoint, status: response.status };
      }
      // Some phones accept Execute without auth when web access is open
      if (response.status === 401 || response.status === 403) {
        const retry = await axios.post(endpoint, executeXml, {
          httpsAgent: insecureAgent,
          timeout: 10000,
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
          },
          validateStatus: () => true,
        });
        if (retry.status >= 200 && retry.status < 300) {
          return { ok: true, endpoint, status: retry.status };
        }
        lastError = new Error(`Phone push failed with HTTP ${retry.status}`);
      } else {
        lastError = new Error(`Phone push failed with HTTP ${response.status}`);
      }
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error("Phone push failed");
};

/**
 * Send alert-only notification to a user's Cisco IP phone using business phone DN.
 */
const sendAlertToDirectoryNumber = async (cucm, directoryNumber, title, text) => {
  const phone = await resolvePhoneByDirectoryNumber(cucm, directoryNumber);
  if (!phone?.deviceName) {
    return {
      ok: false,
      skipped: true,
      reason: "DEVICE_NOT_FOUND",
      directoryNumber,
    };
  }
  if (!phone.ip) {
    return {
      ok: false,
      skipped: true,
      reason: "DEVICE_IP_NOT_FOUND",
      directoryNumber,
      deviceName: phone.deviceName,
    };
  }

  await pushAlertToPhoneIp(cucm, phone.ip, title, text);
  return {
    ok: true,
    directoryNumber,
    deviceName: phone.deviceName,
    ip: phone.ip,
  };
};

const getCiscoConfigFromIntegration = (integrationConfigure) => {
  try {
    const cfg =
      typeof integrationConfigure === "string"
        ? JSON.parse(integrationConfigure)
        : integrationConfigure;
    const channel = cfg?.channels?.cisco;
    if (!channel?.enabled) return null;
    if (!channel?.connectionVerified) return null;
    const cucm = channel.cucm || {};
    if (!cucm.url || !cucm.username || !cucm.password) return null;
    return {
      enabled: true,
      events: {
        incident: !!channel.events?.incident,
        sos: !!channel.events?.sos,
        incidentFollowUp: !!channel.events?.incidentFollowUp,
      },
      cucm: {
        url: String(cucm.url || "").trim(),
        username: String(cucm.username || "").trim(),
        password: String(cucm.password || ""),
      },
    };
  } catch {
    return null;
  }
};

module.exports = {
  verifyConnection,
  resolvePhoneByDirectoryNumber,
  sendAlertToDirectoryNumber,
  pushAlertToPhoneIp,
  getCiscoConfigFromIntegration,
  normalizeAxlUrl,
  normalizeDirectoryNumber,
};
