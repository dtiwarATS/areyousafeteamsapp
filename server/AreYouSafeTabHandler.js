const crypto = require("crypto");
const sql = require("mssql");
const incidentService = require("./services/incidentService");
const path = require("path");
const poolPromise = require("./db/dbConn");
const db = require("./db");
const dbOperation = require("./db/dbOperations");
const axios = require("axios");
const tab = require("./tab/AreYouSafeTab");
const apimeth = require("./api/apiMethods");
const { processSafetyBotError } = require("./models/processError");
const { getConversationMembers } = require("./api/apiMethods");
const { formatedDate } = require("./utils/index");
const bot = require("./bot/bot");
const { AYSLog } = require("./utils/log");
const { console } = require("inspector");
const { saveToken, getToken } = require("./store");
const {
  sendPushNotification,
  getFcmTokensForUsers,
} = require("./services/fcmService");
const { decryptTenantIdFromApiKey } = require("./utils/apiKeyDecrypt");
const {
  buildTeamMap,
  formatIncidentApiPayload,
  shouldIncludeIncident,
} = require("./utils/incidentApiFormat");
const {
  buildIncFileContentUrl,
  isAllowedFileViewUrl,
} = require("./utils/incidentFileViewer");
const { Sms } = require("twilio/lib/twiml/VoiceResponse");

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve Teams ID (29:1xxx) to AAD Object ID (UUID).
 * Returns null if teamsId is falsy, already a UUID, or not found in MSTeamsTeamsUsers.
 * @param {string} teamsId - Teams user ID (e.g. 29:1xxx...)
 * @returns {Promise<string|null>} AAD Object ID or null
 */
async function resolveTeamsIdToAadObjectId(teamsId) {
  if (!teamsId || typeof teamsId !== "string") return null;
  const trimmed = teamsId.trim();
  if (!trimmed) return null;
  if (UUID_REGEX.test(trimmed)) return null;
  if (
    !trimmed.startsWith("29:") ||
    (!trimmed.includes("_") && !trimmed.includes("-"))
  )
    return null;

  try {
    const pool = await poolPromise;
    const result = await pool
      .request()
      .input("teamsId", sql.NVarChar(256), trimmed)
      .query(
        `SELECT TOP 1 user_aadobject_id FROM MSTeamsTeamsUsers WHERE user_id = @teamsId`,
      );
    const row = result?.recordset?.[0];
    return row?.user_aadobject_id || null;
  } catch (err) {
    console.error("[resolveTeamsIdToAadObjectId]", err?.message);
    return null;
  }
}

const SEND_NOTIFICATION_TIMEOUT_MS = 15000;

const escapeViewFileHtml = (value) => {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

const AUTODOWNLOAD_DOC_STYLES = {
  ".pdf": { label: "PDF", iconColor: "#D93831", typeLabel: "PDF Document" },
  ".doc": { label: "Word", iconColor: "#2B579A", typeLabel: "Word Document" },
  ".docx": { label: "Word", iconColor: "#2B579A", typeLabel: "Word Document" },
  ".txt": { label: "Text", iconColor: "#606770", typeLabel: "Text Document" },
  ".xls": {
    label: "Excel",
    iconColor: "#1D6F42",
    typeLabel: "Excel Spreadsheet",
  },
  ".xlsx": {
    label: "Excel",
    iconColor: "#1D6F42",
    typeLabel: "Excel Spreadsheet",
  },
  ".ppt": {
    label: "PPT",
    iconColor: "#D24726",
    typeLabel: "PowerPoint Presentation",
  },
  ".pptx": {
    label: "PPT",
    iconColor: "#D24726",
    typeLabel: "PowerPoint Presentation",
  },
};

const DEFAULT_AUTODOWNLOAD_DOC_STYLE = {
  label: "File",
  iconColor: "#606770",
  typeLabel: "File",
};

const getAutodownloadFileExtension = (fileName) => {
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex === -1) {
    return "";
  }
  return fileName.slice(dotIndex).toLowerCase();
};

const getAutodownloadDocStyle = (extension) => {
  return AUTODOWNLOAD_DOC_STYLES[extension] || DEFAULT_AUTODOWNLOAD_DOC_STYLE;
};

const formatAutodownloadFileSize = (size) => {
  if (size == null || size === "") {
    return "";
  }
  const raw = String(size).trim();
  if (/[a-zA-Z]/.test(raw)) {
    return raw;
  }
  const bytes = Number(raw);
  if (!Number.isFinite(bytes) || bytes < 0) {
    return raw;
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const buildAutodownloadIconSvg = (label, iconColor) => {
  const safeLabel = escapeViewFileHtml(label.slice(0, 4).toUpperCase());
  const safeColor = escapeViewFileHtml(iconColor);
  return `<svg class="file-icon" xmlns="http://www.w3.org/2000/svg" width="40" height="48" viewBox="0 0 40 48" aria-hidden="true"><path d="M8 2h18l10 10v34a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" fill="${safeColor}"/><path d="M26 2v10h10" fill="none" stroke="white" stroke-width="1.5" opacity="0.7"/><text x="20" y="31" text-anchor="middle" fill="white" font-size="9" font-weight="bold" font-family="Segoe UI, Arial, sans-serif">${safeLabel}</text></svg>`;
};

const buildAutodownloadMetadataLine = (fileSize, typeLabel) => {
  const formattedSize = formatAutodownloadFileSize(fileSize);
  if (formattedSize) {
    return `${formattedSize} \u2022 ${typeLabel}`;
  }
  return typeLabel;
};

const handlerForSafetyBotTab = (app) => {
  const tabObj = new tab.AreYouSafeTab();

  app.get("/areyousafetabhandler/getUserPermission", async (req, res) => {
    const userObjId = req.query.userId;
    const teamId =
      req.query.teamId != null && req.query.teamId != "null"
        ? req.query.teamId
        : null;
    let isAdmin = false;

    let responseObj = {
      isInstalledInTeam: true,
    };

    try {
      const botUserInfo = await tabObj.getBotUserInfo(
        req.query.teamId,
        userObjId,
      );
      dbOperation
        .verifyAdminUserForDashboardTab(req.query.userId, teamId)
        .then(async (safetyInitiatorObj) => {
          isAdmin = safetyInitiatorObj.isAdmin;
          responseObj.isAdmin = isAdmin;
          const userLicenseDetails = await dbOperation.getUserLicenseDetails(
            userObjId,
            teamId,
          );
          responseObj.hasValidLicense = userLicenseDetails.hasLicense;
          //responseObj.safetyInitiator = safetyInitiatorObj.safetyInitiator;

          let { companyData, isInstalledInTeam } =
            await incidentService.isBotInstalledInTeam(userObjId);
          responseObj.isInstalledInTeam = isInstalledInTeam;

          let botUserInfoObj = {};
          if (botUserInfo && botUserInfo.length > 0) {
            botUserInfoObj = botUserInfo[0];
          }
          responseObj.botUserInfo = {
            ...botUserInfoObj,
            companyData,
            userLicenseDetails,
          };

          res.send(responseObj);
          return;
        })
        .catch((err) => {
          console.log(err);
          processSafetyBotError(
            err,
            "",
            "",
            userObjId,
            "Error in /areyousafetabhandler/getUserPermission -> verifyAdminUserForDashboardTab",
          );
        });
    } catch (err) {
      processSafetyBotError(
        err,
        "",
        "",
        userObjId,
        "Error in /areyousafetabhandler/getUserPermission",
      );
    }
  });

  const LOGIN_CODE_LENGTH = 6;
  const DEFAULT_LOGIN_CODE_EXPIRY_SECONDS = 300;
  const LOGIN_CODE_EXPIRY_SECONDS =
    Number.parseInt(process.env.LOGIN_CODE_EXPIRY_SECONDS, 10) ||
    DEFAULT_LOGIN_CODE_EXPIRY_SECONDS;

  app.post("/areyousafetabhandler/generate-login-code", async (req, res) => {
    const userId =
      typeof req.body?.userId === "string" ? req.body.userId.trim() : "";

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId is required",
      });
    }

    const code = crypto
      .randomInt(0, 10 ** LOGIN_CODE_LENGTH)
      .toString()
      .padStart(LOGIN_CODE_LENGTH, "0");

    const expiresAtUtc = new Date(
      Date.now() + LOGIN_CODE_EXPIRY_SECONDS * 1000,
    );

    try {
      const pool = await poolPromise;
      await pool
        .request()
        .input("code", sql.NVarChar(10), code)
        .input("expiresAt", sql.DateTime2, expiresAtUtc)
        .input("userId", sql.NVarChar(256), userId).query(`
          UPDATE MSTeamsTeamsUsers 
          SET Generated_code = @code, Generated_code_expires_at = @expiresAt 
          WHERE user_aadobject_id = @userId OR user_id = @userId
        `);
    } catch (err) {
      console.error("Error saving login code to MSTeamsTeamsUsers:", err);
      processSafetyBotError(
        err,
        "",
        "",
        userId,
        "error in /areyousafetabhandler/generate-login-code",
      );
      return res.status(500).json({
        success: false,
        message: "Failed to save login code",
      });
    }

    return res.status(200).json({
      success: true,
      userId,
      code,
      expiresInSeconds: LOGIN_CODE_EXPIRY_SECONDS,
      expiresAtUtc: expiresAtUtc.toISOString(),
    });
  });

  app.post("/areyousafetabhandler/verify-login-code", async (req, res) => {
    const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
    const fcmToken =
      typeof req.body?.fcmToken === "string" ? req.body.fcmToken.trim() : "";

    if (!code) {
      return res.status(400).json({
        success: false,
        message: "code is required",
      });
    }
    if (!fcmToken) {
      return res.status(400).json({
        success: false,
        message: "fcmToken is required to link the device to the user",
      });
    }

    try {
      const pool = await poolPromise;

      const userResult = await pool
        .request()
        .input("code", sql.NVarChar(10), code).query(`
          SELECT TOP 1 team_id, user_aadobject_id, user_name, email,tenantid
          FROM MSTeamsTeamsUsers
          WHERE Generated_code = @code
            AND (Generated_code_expires_at IS NULL OR Generated_code_expires_at > SYSUTCDATETIME())
        `);

      const user = userResult?.recordset?.[0];
      if (!user) {
        return res.status(401).json({
          success: false,
          message: "Invalid or expired code",
        });
      }

      const userAadObjectId = user.user_aadobject_id;

      await pool
        .request()
        .input("user_aadobject_id", sql.NVarChar(256), userAadObjectId)
        .input("fcm_token", sql.VarChar(500), fcmToken).query(`
          UPDATE user_fcm_tokens
          SET user_id = @user_aadobject_id
          WHERE fcm_token = @fcm_token
        `);

      return res.status(200).json({
        success: true,
        team_id: user.team_id,
        user_aadobject_id: user.user_aadobject_id,
        user_name: user.user_name,
        email: user.email,
        tenantid: user.tenantid,
      });
    } catch (err) {
      console.error("Error in verify-login-code:", err);
      processSafetyBotError(
        err,
        "",
        "",
        "",
        "error in /areyousafetabhandler/verify-login-code",
      );
      return res.status(500).json({
        success: false,
        message: "Failed to verify login code",
      });
    }
  });

  app.get("/areyousafetabhandler/getTemplateList", async (req, res) => {
    const userObjId = req.query.userId;
    try {
      incidentService
        .getTemplateList(userObjId)
        .then((templateList) => {
          res.send(templateList);
        })
        .catch((err) => {
          console.log(err);
        });
    } catch (err) {
      processSafetyBotError(
        err,
        "",
        "",
        userObjId,
        "error in /areyousafetabhandler/getTemplateList",
      );
    }
  });
  const getUserPhone = async (refreshToken, tenantId, arrIds) => {
    var phone = [""];
    phone.pop();
    try {
      let data = new FormData();
      data.append("grant_type", "client_credentials");
      data.append("client_Id", process.env.MicrosoftAppId);
      data.append("client_secret", process.env.MicrosoftAppPassword);
      data.append("scope", "https://graph.microsoft.com/.default");

      let config = {
        method: "post",
        maxBodyLength: Infinity,
        url: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
        data: data,
        // timeout: 10000,
      };
      await axios
        .request(config)
        .then(async (response) => {
          // console.log(response.data);
          if (response.data.scope?.indexOf("User.Read.All") == -1) {
            throw {
              type: "NoPhonePermission",
              message: "No phone permission granted",
            };
          } else {
            let accessToken = response.data.access_token;
            // console.log({ arrIds });
            var startIndex = 0;
            var endIndex = 14;
            if (endIndex > arrIds.length) endIndex = arrIds.length;
            // console.log({ endIndex });
            while (endIndex <= arrIds.length && startIndex != endIndex) {
              var userIds = arrIds.slice(startIndex, endIndex).toString();
              if (userIds.length) {
                userIds = "'" + userIds.replaceAll(",", "','") + "'";
                // console.log({ userIds });
                startIndex = endIndex;
                endIndex = startIndex + 14;
                if (endIndex > arrIds.length) endIndex = arrIds.length;

                let config = {
                  method: "get",
                  maxBodyLength: Infinity,
                  // timeout: 10000,
                  url:
                    "https://graph.microsoft.com/v1.0/users?$select=displayName,id,businessPhones,mobilePhone" +
                    "&$filter=id in (" +
                    userIds +
                    ")",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: "Bearer " + accessToken,
                  },
                  // data: data,
                };
                var requestDate = new Date();
                var a = await axios
                  .request(config)
                  .then((response) => {
                    phone.push(...response.data.value);
                    // console.log({ phone });
                    // var data = {
                    //   status: status,
                    //   teamData: teamData,
                    // };
                  })
                  .catch((error) => {
                    console.log({
                      "error in get users phone number requestDate": error,
                    });
                    processSafetyBotError(
                      error,
                      "",
                      "",
                      "",
                      "error in get users phone number requestDateTime : " +
                        requestDate +
                        " ErrorDateTime: " +
                        new Date(),
                      "",
                      false,
                      "",
                    );
                    throw {
                      type: "GraphApiError",
                      error: error,
                      message:
                        "Error fetching user phone numbers from Graph API",
                    };
                  });
              } else {
                return;
              }
            }
            // console.log({ finalphone: phone });
          }
        })
        .catch((error) => {
          console.log(
            "error at get access token in get users phone number",
            error,
          );
          // If it's already a custom error object, rethrow it
          if (error.type) {
            throw error;
          }
          // Handle axios errors
          if (error.response && error.response.data) {
            if (
              error.response.data.error == "invalid_grant" &&
              error.response.data.error_description &&
              error.response.data.error_description
                .toString()
                .indexOf("The refresh token has expired due to inactivity.") >=
                0
            ) {
              throw {
                type: "authFailed",
                message: "Authentication failed: refresh token expired",
                error: error,
                errorResponse: error.response.data,
              };
            } else if (
              error.response.data.error == "invalid_grant" ||
              error.response.data.error == "interaction_required" ||
              error.response.data.error == "insufficient_claims"
            ) {
              throw {
                type: "invalid_grant",
                message: "Invalid grant or interaction required",
                error: error,
                errorResponse: error.response.data,
              };
            }
          }
          // Generic error
          console.log({
            "error in get access token from microsoft at get users phone number":
              error,
          });
          processSafetyBotError(
            error,
            "",
            "",
            "",
            "error in get access token from microsoft at get users phone number",
            "",
            false,
            "",
          );
          throw {
            type: "UnknownError",
            error: error,
            message: "Unknown error occurred while fetching phone data",
            errorResponse: error.response?.data || null,
          };
        });
      return phone;
    } catch (err) {
      // If it's already a custom error object, rethrow it
      if (err.type) {
        throw err;
      }
      // Wrap unexpected errors
      console.log("Unexpected error in getUserPhone:", err);
      throw {
        type: "UnknownError",
        error: err,
        message: "Unexpected error in getUserPhone",
      };
    }
  };
  app.get("/areyousafetabhandler/getuserphonedata", async (req, res) => {
    const userObjId = req.query.userId;
    const teamid = req.query.teamid;
    try {
      const teamInfo = await incidentService.getUserTeamInfoData(userObjId);
      var memberqery = "";
      memberqery = `select * from MSTeamsTeamsUsers where team_id in(select team_id from MSTeamsInstallationDetails where user_obj_id='${userObjId}' and IS_APP_PERMISSION_GRANTED is NOT NULL)`;
      var teamsMembers = await db.getDataFromDB(memberqery, userObjId);
      let userAadObjIds = teamsMembers.map((x) => x.user_aadobject_id);
      if (teamInfo[0]?.length && teamInfo) {
        const phoneDataPromises = teamInfo[0].map(async (team) => {
          if (team.IS_APP_PERMISSION_GRANTED) {
            try {
              let phonedata = await getUserPhone(
                team.IS_APP_PERMISSION_GRANTED,
                team.tenant_id,
                userAadObjIds,
              );
              return phonedata.map((item) => {
                const match = teamsMembers.find(
                  (u) => u.user_aadobject_id === item.id,
                );
                return {
                  ...item,
                  user_id: match ? match.user_id : null,
                };
              });
            } catch (phoneError) {
              // Return error object instead of throwing, so one team's error doesn't break all
              console.log(
                "Error fetching phone data for team:",
                team.tenant_id,
                phoneError,
              );
              return {
                error: true,
                errorType: phoneError.type || "UnknownError",
                errorMessage:
                  phoneError.message || "Failed to fetch phone data",
                tenantId: team.tenant_id,
                errorDetails: phoneError.error || phoneError,
                // Include original error response data for access token errors
                errorResponse:
                  phoneError.errorResponse ||
                  phoneError.error?.response?.data ||
                  phoneError.response?.data ||
                  null,
              };
            }
          } else {
            return []; // no refresh_token, return empty array
          }
        });

        const allPhoneData = await Promise.all(phoneDataPromises);
        // Separate errors from valid data
        const errors = [];
        const validData = [];
        let accessTokenError = null; // Track access token errors

        allPhoneData.forEach((item) => {
          if (Array.isArray(item)) {
            validData.push(...item);
          } else if (item && item.error) {
            // Check if this is an access token error that should be sent to UI
            if (
              item.errorType === "authFailed" ||
              item.errorType === "invalid_grant" ||
              item.errorType === "NoPhonePermission"
            ) {
              accessTokenError = item;
            }
            errors.push(item);
          }
        });

        // Flatten array of arrays for valid data
        const flattenedData = validData;

        // Build response - include access token error flags for UI (matching original format)
        const response = {
          data: flattenedData,
        };

        // Add access token error flags if present (UI expects these specific flags)
        if (accessTokenError) {
          if (accessTokenError.errorType === "authFailed") {
            response.authFailed = true;
          } else if (accessTokenError.errorType === "invalid_grant") {
            response.invalid_grant = true;
          } else if (accessTokenError.errorType === "NoPhonePermission") {
            response.NoPhonePermission = true;
          }
          // Include the error details from access token failure
          if (accessTokenError.errorResponse) {
            response.error = accessTokenError.errorResponse;
          } else if (accessTokenError.errorDetails) {
            response.error = accessTokenError.errorDetails;
          }
        } else if (errors.length > 0) {
          // If there are other errors (not access token errors), include them
          response.errors = errors;
        }

        console.log({ flattenedData, errors, accessTokenError });
        res.send(response);
      } else {
        res.send({ data: [], errors: [] });
      }

      console.log(teamInfo);
    } catch (err) {
      processSafetyBotError(
        err,
        "",
        "",
        userObjId,
        "error in /areyousafetabhandler/getuserphonedata",
      );
      // Send error to UI
      res.status(500).send({
        data: [],
        errors: [
          {
            error: true,
            errorType: "ServerError",
            errorMessage:
              err.message || "An error occurred while fetching phone data",
            errorDetails: err,
          },
        ],
      });
    }
  });
  app.get("/areyousafetabhandler/getAllIncData", async (req, res) => {
    const userObjId = req.query.userId;
    const teamId =
      req.query.teamId != null && req.query.teamId != "null"
        ? req.query.teamId
        : null;
    try {
      let isAdmin = false;
      const tabObj = new tab.AreYouSafeTab(userObjId);
      const teamInfo = await incidentService.getUserTeamInfo(userObjId);
      dbOperation
        .verifyAdminUserForDashboardTab(req.query.userId, teamId)
        .then((safetyInitiatorObj) => {
          isAdmin = safetyInitiatorObj.isAdmin;
          //const safetyInitiator = safetyInitiatorObj.safetyInitiator;
          const responseObj = {
            respData: "no permission",
            isAdmin,
            isWhoCanCreateIncident: safetyInitiatorObj.isWhoCanCreateInc,
          };
          const sendRespData = (incData) => {
            const formatedIncData = tabObj.getFormatedIncData(
              incData,
              teamInfo[0],
              userObjId,
            );
            responseObj.respData = formatedIncData;
            res.send(responseObj);
          };
          if (
            (safetyInitiatorObj != null && safetyInitiatorObj.isAdmin) ||
            safetyInitiatorObj.isWhoCanCreateInc
          ) {
            if (req.query.teamId != null && req.query.teamId != "null") {
              incidentService
                .getAllIncByTeamId(req.query.teamId, "desc", userObjId)
                .then((incData) => {
                  sendRespData(incData);
                })
                .catch((err) => {
                  console.log(err);
                });
            } else {
              incidentService
                .getAllIncByUserId(userObjId, "desc")
                .then((incData) => {
                  sendRespData(incData);
                })
                .catch((err) => {
                  console.log(err);
                });
            }
          } else {
            res.send(responseObj);
          }
        })
        .catch((err) => {
          console.log(err);
          processSafetyBotError(
            err,
            "",
            "",
            userObjId,
            "error in /areyousafetabhandler/getAllIncData -> verifyAdminUserForDashboardTab",
          );
        });
    } catch (err) {
      processSafetyBotError(
        err,
        "",
        "",
        userObjId,
        "error in /areyousafetabhandler/getAllIncData",
      );
    }
  });

  app.get("/incidents", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ error: "Missing or invalid Authorization header" });
    }
    const apiKey = authHeader.slice("Bearer ".length).trim();
    if (!apiKey) {
      return res
        .status(401)
        .json({ error: "Missing or invalid Authorization header" });
    }

    let tenantId;
    try {
      tenantId = decryptTenantIdFromApiKey(apiKey);
    } catch (err) {
      console.log(err);
      return res.status(500).json({ error: "API key decryption failed" });
    }
    if (!tenantId) {
      return res.status(401).json({ error: "Invalid API key" });
    }

    try {
      const tabObj = new tab.AreYouSafeTab(null);
      const teamInfo = await incidentService.getTeamInfoByTenantId(tenantId);
      const teamMap = buildTeamMap(teamInfo);
      const incidentId = req.query.incidentId;

      const buildPayload = async (inc) => {
        const activityLog =
          await incidentService.getMessageActivityLogByIncidentId(inc.incId);
        return formatIncidentApiPayload(
          inc,
          activityLog,
          teamMap[inc.teamId] || "",
          tabObj,
        );
      };

      if (incidentId != null && incidentId !== "null") {
        const parsedId = parseInt(incidentId, 10);
        if (!Number.isFinite(parsedId)) {
          return res.status(400).json({ error: "Invalid incidentId" });
        }
        const incData = await incidentService.getIncByTenantId(
          tenantId,
          parsedId,
          "desc",
        );
        if (!incData || incData.length === 0) {
          return res.status(404).json({ error: "Incident not found" });
        }
        return res.json(await buildPayload(incData[0]));
      }

      const incData = await incidentService.getAllIncByTenantId(
        tenantId,
        "desc",
      );
      const filteredIncidents = (incData || []).filter(shouldIncludeIncident);
      const payloads = await Promise.all(filteredIncidents.map(buildPayload));
      res.json(payloads);
    } catch (err) {
      console.log(err);
      processSafetyBotError(
        err,
        "",
        "",
        "",
        "error in /incidents tenantId=" + tenantId,
      );
      res.status(500).json({ error: "Failed to fetch incidents" });
    }
  });

  app.delete("/areyousafetabhandler/deleteIncident", (req, res) => {
    const userAadObjId = req.query.userAadObjId;
    try {
      incidentService
        .deleteInc(req.query.incid, userAadObjId)
        .then((incData) => {
          res.send(incData !== null);
        })
        .catch((err) => {
          console.log(err);
          processSafetyBotError(
            err,
            "",
            "",
            userAadObjId,
            "error in /areyousafetabhandler/deleteIncident -> deleteInc then incId=" +
              req.query.incid,
          );
        });
    } catch (err) {
      processSafetyBotError(
        err,
        "",
        "",
        userAadObjId,
        "error in /areyousafetabhandler/deleteIncident incId=" +
          req.query.incid,
      );
    }
  });

  app.put("/areyousafetabhandler/updateincstatus", (req, res) => {
    const incId = req.query.incid;
    const incStatus = req.query.incstatus;
    const userAadObjId = req.query.userAadObjId;
    try {
      incidentService
        .updateIncStatus(incId, incStatus, userAadObjId)
        .then((incData) => {
          res.send(incData);
        })
        .catch((err) => {
          console.log(err);
          processSafetyBotError(
            err,
            "",
            "",
            userAadObjId,
            "error in /areyousafetabhandler/updateincstatus then -> incId=" +
              incId +
              " incStatus=" +
              incStatus,
          );
        });
    } catch (err) {
      processSafetyBotError(
        err,
        "",
        "",
        userAadObjId,
        "error in /areyousafetabhandler/updateincstatus -> incId=" +
          incId +
          " incStatus=" +
          incStatus,
      );
    }
  });

  app.get("/areyousafetabhandler/getTeamsMembers", async (req, res) => {
    const teamId = req.query.teamId;
    const userAadObjId = req.query.userAadObjId;
    try {
      const tabObj = new tab.AreYouSafeTab();
      const teamsMember = await tabObj.getTeamMembers(teamId, userAadObjId);
      res.send(teamsMember);
    } catch (err) {
      processSafetyBotError(
        err,
        teamId,
        "",
        userAadObjId,
        "error in /areyousafetabhandler/getTeamsMembers",
      );
    }
  });
  app.get("/areyousafetabhandler/GetAllMembersByTenantid", async (req, res) => {
    const Tenantid = req.query.Tenantid;
    const userAadObjId = "";
    try {
      const tabObj = new tab.AreYouSafeTab();
      const teamsMember = await tabObj.GetAllMembersByTenantid(
        Tenantid,
        userAadObjId,
      );
      res.send(teamsMember);
    } catch (err) {
      processSafetyBotError(
        err,
        Tenantid,
        "",
        userAadObjId,
        "error in /areyousafetabhandler/getTeamsMembers",
      );
    }
  });
  app.get("/areyousafetabhandler/getEnableSafetyCheck", async (req, res) => {
    const teamId = req.query.teamId;
    const userAadObjId = req.query.userAadObjId;
    try {
      const tabObj = new tab.AreYouSafeTab();
      const enablesafety = await tabObj.getenablecheck(teamId);
      if (enablesafety.length) {
        const SafetycheckForVisitorsDetails = enablesafety[0];
        res.send(SafetycheckForVisitorsDetails);
      } else {
        res.send(null);
      }
    } catch (err) {
      processSafetyBotError(
        err,
        teamId,
        "",
        userAadObjId,
        "error in /areyousafetabhandler/getEnableSafetyCheck",
      );
    }
  });

  app.get("/areyousafetabhandler/getSendSMS", async (req, res) => {
    const teamId = req.query.teamId;
    const userAadObjId = req.query.userAadObjId;
    try {
      const tabObj = new tab.AreYouSafeTab();
      const data = await tabObj.getSendSMS(teamId);
      if (data.length) {
        const sendSMSDetails = data[0];
        res.send(sendSMSDetails);
      } else {
        res.send(null);
      }
    } catch (err) {
      processSafetyBotError(
        err,
        teamId,
        "",
        userAadObjId,
        "error in /areyousafetabhandler/getSendSMS",
      );
    }
  });

  app.get("/areyousafetabhandler/getEmergencyContacts", async (req, res) => {
    const teamId = req.query.teamId;
    const userAadObjId = req.query.userAadObjId;
    try {
      const tabObj = new tab.AreYouSafeTab();
      const data = await tabObj.getEmergencyContacts(teamId);
      if (data.length) {
        const emergencyContacts = data[0];
        res.send(emergencyContacts);
      } else {
        res.send(null);
      }
    } catch (err) {
      processSafetyBotError(
        err,
        teamId,
        "",
        userAadObjId,
        "error in /areyousafetabhandler/getEmergencyContacts",
      );
    }
  });
  app.post("/areyousafetabhandler/deleteSOSResponder", async (req, res) => {
    const teamId = req.query.teamId;
    const city = req.query.city;
    const country = req.query.country;
    const department = req.query.department;
    try {
      const tabObj = new tab.AreYouSafeTab();
      await tabObj.deleteSOSResponder(teamId, city, country, department);
      res.send("success");
    } catch (err) {
      processSafetyBotError(
        err,
        teamId,
        "",
        userAadObjId,
        "error in /areyousafetabhandler/deleteSOSResponder",
      );
    }
  });
  app.post("/areyousafetabhandler/saveSOSResponder", async (req, res) => {
    const teamId = req.query.teamId;
    const rowsToSave = req.query.rowsToSave;
    try {
      const tabObj = new tab.AreYouSafeTab();
      await tabObj.saveSOSResponder(teamId, rowsToSave);
      res.send("success");
    } catch (err) {
      processSafetyBotError(
        err,
        teamId,
        "",
        userAadObjId,
        "error in /areyousafetabhandler/saveSOSResponder",
      );
    }
  });

  app.post("/areyousafetabhandler/setSendSMS", async (req, res) => {
    const teamId = req.query.teamId;
    const sendSMS = req.query.sendSMS;
    const phoneField = req.query.phoneField;
    try {
      const tabObj = new tab.AreYouSafeTab();
      await tabObj.setSendSMS(teamId, sendSMS, phoneField);
      res.send("success");
    } catch (err) {
      processSafetyBotError(
        err,
        teamId,
        "",
        userAadObjId,
        "error in /areyousafetabhandler/getSendSMS",
      );
    }
  });
  app.post("/areyousafetabhandler/setfields", async (req, res) => {
    const tenantId = req.query.tenantId;
    const sendSMS = req.query.sendSMS;
    const phoneField = req.query.phoneField;
    const userAadObjId = req.query.userAadObjId;
    try {
      const tabObj = new tab.AreYouSafeTab();
      await tabObj.setfields(tenantId, sendSMS, phoneField, userAadObjId);
      res.send("success");
    } catch (err) {
      processSafetyBotError(
        err,
        tenantId,
        "",
        userAadObjId,
        "error in /areyousafetabhandler/getSendSMS",
      );
    }
  });
  app.post("/areyousafetabhandler/setSendEmail", async (req, res) => {
    const teamId = req.query.teamId;
    const setSendEmail = req.query.setSendEmail;
    try {
      const tabObj = new tab.AreYouSafeTab();
      await tabObj.setSendEmail(teamId, setSendEmail);
      res.send("success");
    } catch (err) {
      processSafetyBotError(
        err,
        teamId,
        "",
        userAadObjId,
        "error in /areyousafetabhandler/setSendEmail",
      );
    }
  });
  app.post("/areyousafetabhandler/SavesmsInfoDisplay", async (req, res) => {
    const teamId = req.query.teamId;
    const Smsdisplayoption = req.query.Smsdisplayoption;
    try {
      const tabObj = new tab.AreYouSafeTab();
      await tabObj.SavesmsInfoDisplay(teamId, Smsdisplayoption);
      res.send("success");
    } catch (err) {
      processSafetyBotError(
        err,
        teamId,
        "",
        userAadObjId,
        "error in /areyousafetabhandler/getSendSMS",
      );
    }
  });
  app.post("/areyousafetabhandler/saveFilterChecked", async (req, res) => {
    const teamId = req.query.teamId;
    const filterEnabled = req.query.filterEnabled;
    try {
      const tabObj = new tab.AreYouSafeTab();
      await tabObj.saveFilterChecked(teamId, filterEnabled);
      res.send("success");
    } catch (err) {
      processSafetyBotError(
        err,
        teamId,
        "",
        userAadObjId,
        "error in /areyousafetabhandler/saveFilterChecked",
      );
    }
  });

  app.post("/areyousafetabhandler/saveSafetyCheckFilter", async (req, res) => {
    const {
      id,
      tenantId,
      filterName,
      filterJson,
      createdByUserId,
      updatedByUserId,
    } = req.body;
    try {
      if (!tenantId || !filterName || filterJson === undefined) {
        return res.status(400).json({
          error:
            "Missing required parameters: tenantId, filterName, filterJson",
        });
      }
      const isUpdate = id != null && !isNaN(Number(id)) && Number(id) > 0;
      if (!isUpdate && !createdByUserId) {
        return res.status(400).json({
          error: "Missing required parameter: createdByUserId",
        });
      }
      const tabObj = new tab.AreYouSafeTab();
      const result = await tabObj.saveSafetyCheckFilter(req.body);
      if (result?.success) {
        return res.json({ success: true, id: result.id });
      }
      return res
        .status(result?.statusCode === 404 ? 404 : 500)
        .json({ error: result?.error || "Error saving filter" });
    } catch (err) {
      processSafetyBotError(
        err,
        tenantId || "",
        "",
        createdByUserId || updatedByUserId || "",
        "error in /areyousafetabhandler/saveSafetyCheckFilter",
      );
      return res.status(500).json({ error: "Error saving filter" });
    }
  });

  app.get(
    "/areyousafetabhandler/getSavedSafetyCheckFilters",
    async (req, res) => {
      const tenantId = req.query.tenantId;
      try {
        if (!tenantId) {
          return res
            .status(400)
            .json({ error: "Missing required parameter: tenantId" });
        }
        const tabObj = new tab.AreYouSafeTab();
        const rows = await tabObj.getSavedSafetyCheckFilters(tenantId);
        res.json(Array.isArray(rows) ? rows : []);
      } catch (err) {
        processSafetyBotError(
          err,
          tenantId || "",
          "",
          "",
          "error in /areyousafetabhandler/getSavedSafetyCheckFilters",
        );
        res.json([]);
      }
    },
  );

  app.delete(
    "/areyousafetabhandler/deleteSavedSafetyCheckFilter",
    async (req, res) => {
      const { id } = req.query;
      try {
        if (!id) {
          return res.status(400).json({
            error: "Missing required parameter: id",
          });
        }
        const tabObj = new tab.AreYouSafeTab();
        const result = await tabObj.deleteSavedSafetyCheckFilter(id);
        if (result?.success) {
          return res.json({ success: true });
        }
        return res
          .status(result?.statusCode === 404 ? 404 : 500)
          .json({ error: result?.error || "Error deleting filter" });
      } catch (err) {
        processSafetyBotError(
          err,
          id || "",
          "",
          "",
          "error in /areyousafetabhandler/deleteSavedSafetyCheckFilter",
        );
        return res.status(500).json({ error: "Error deleting filter" });
      }
    },
  );

  app.post("/areyousafetabhandler/manageColumns", async (req, res) => {
    const teamId = req.body.teamId;
    const settingName = req.body.settingName;
    const value = req.body.selectedColumns;
    const userId = req.body.userId;
    try {
      if (!teamId || !settingName || !userId) {
        res.status(400).send({
          error: "Missing required parameters: teamId, settingName, userId",
        });
        return;
      }
      const tabObj = new tab.AreYouSafeTab();
      await tabObj.manageColumns(teamId, settingName, value || "", userId);
      res.send("success");
    } catch (err) {
      processSafetyBotError(
        err,
        teamId,
        "",
        userId,
        "error in /areyousafetabhandler/manageColumns",
      );
      res.status(500).send({ error: "Error: Please try again" });
    }
  });
  app.post("/areyousafetabhandler/setSendWhatsapp", async (req, res) => {
    const teamId = req.query.teamId;
    const sendWhatsapp = req.query.sendWhatsapp;
    const phoneField = req.query.phoneField;
    try {
      const tabObj = new tab.AreYouSafeTab();
      await tabObj.setSendWhatsapp(teamId, sendWhatsapp, phoneField);
      res.send("success");
    } catch (err) {
      processSafetyBotError(
        err,
        teamId,
        "",
        userAadObjId,
        "error in /areyousafetabhandler/setSendWhatsapp",
      );
    }
  });
  app.post("/areyousafetabhandler/setavailableforapp", async (req, res) => {
    const teamId = req.query.teamId;
    const tenantId = req.query.tenantId;
    const availablefor = req.query.availablefor;
    const userAadObjId = req.query.userAadObjId;
    try {
      const tabObj = new tab.AreYouSafeTab();
      await tabObj.setavailableforapp(
        availablefor,
        tenantId,
        teamId,
        userAadObjId,
      );
      res.send("success");
    } catch (err) {
      processSafetyBotError(
        err,
        teamId,
        "",
        userAadObjId,
        "error in /areyousafetabhandler/setavailableforapp",
      );
    }
  });
  app.post("/areyousafetabhandler/setSuperAdmin", async (req, res) => {
    const teamId = req.query.teamId;

    const superAdmin = req.query.superAdmin;
    const userAadObjId = req.query.userId;
    try {
      const tabObj = new tab.AreYouSafeTab();
      await tabObj.setSuperAdmin(superAdmin, teamId, userAadObjId);
      res.send("success");
    } catch (err) {
      processSafetyBotError(
        err,
        teamId,
        "",
        userAadObjId,
        "error in /areyousafetabhandler/setSOSNotification",
      );
    }
  });
  app.post("/areyousafetabhandler/setSOSNotification", async (req, res) => {
    const teamId = req.query.teamId;

    const SosNotificationFor = req.query.SosNotificationFor;
    try {
      const tabObj = new tab.AreYouSafeTab();
      await tabObj.SosNotificationFor(SosNotificationFor, teamId);
      res.send("success");
    } catch (err) {
      processSafetyBotError(
        err,
        teamId,
        "",
        userAadObjId,
        "error in /areyousafetabhandler/setSOSNotification",
      );
    }
  });
  app.post(
    "/areyousafetabhandler/setFollowUpIncidentNotification",
    async (req, res) => {
      const teamId = req.query.teamId;

      const FollowUpIncidentNotificationFor =
        req.query.FollowUpIncidentNotificationFor;
      try {
        const tabObj = new tab.AreYouSafeTab();
        await tabObj.followUpIncidentNotificationFor(
          FollowUpIncidentNotificationFor,
          teamId,
        );
        res.send("success");
      } catch (err) {
        processSafetyBotError(
          err,
          teamId,
          "",
          userAadObjId,
          "error in /areyousafetabhandler/setSOSNotification",
        );
      }
    },
  );
  app.post(
    "/areyousafetabhandler/setIncidentMessagesNotification",
    async (req, res) => {
      const teamId = req.query.teamId;

      const IncidentMessagesNotificationFor =
        req.query.IncidentMessagesNotificationFor;
      try {
        const tabObj = new tab.AreYouSafeTab();
        await tabObj.IncidentMessagesNotificationFor(
          IncidentMessagesNotificationFor,
          teamId,
        );
        res.send("success");
      } catch (err) {
        processSafetyBotError(
          err,
          teamId,
          "",
          userAadObjId,
          "error in /areyousafetabhandler/setSOSNotification",
        );
      }
    },
  );
  app.post("/areyousafetabhandler/setLanguagePreference", async (req, res) => {
    const teamId = req.query.teamId;
    const tenantid = req.query.tenantid;
    const language = req.query.language;
    const userAadObjId = req.query.userAadObjId;
    const languageId = req.query.languageId;
    try {
      const tabObj = new tab.AreYouSafeTab();
      await tabObj.setLanguagePreference(
        language,
        teamId,
        tenantid,
        userAadObjId,
        languageId,
      );
      res.send("success");
    } catch (err) {
      processSafetyBotError(
        err,
        teamId,
        "",
        userAadObjId,
        "error in /areyousafetabhandler/setSOSNotification",
      );
    }
  });
  app.get("/areyousafetabhandler/getAllLanguages", async (req, res) => {
    try {
      const pool = await poolPromise;
      const result = await pool.request().query(`
        SELECT
          LANGUAGE_ID AS id,
          LANGUAGE AS label,
          CULTURE_CODE AS value
        FROM SYS_LANGUAGE
        ORDER BY LANGUAGE ASC
      `);
      res.json(result.recordset || []);
    } catch (err) {
      processSafetyBotError(
        err,
        "",
        "",
        "",
        "error in /areyousafetabhandler/getAllLanguages",
      );
      res.status(500).json({ error: "Failed to fetch languages" });
    }
  });
  // app.post("/areyousafetabhandler/setRefreshToken", async (req, res) => {
  //   const teamId = req.query.teamId;
  //   const refresh_token = req.query.refresh_token;
  //   const field = req.query.field;
  //   console.log({ teamId, refresh_token });
  //   try {
  //     const tabObj = new tab.AreYouSafeTab();
  //     const data = await tabObj.saveRefreshToken(teamId, refresh_token, field);
  //     tabObj.fetchDataAndUpdateDB(teamId);
  //     console.log(data);
  //     if (data.length) {
  //       res.send("success");
  //     } else {
  //       res.send(null);
  //     }
  //   } catch (err) {
  //     console.log(err);
  //     processSafetyBotError(
  //       err,
  //       teamId,
  //       "",
  //       userAadObjId,
  //       "error in /areyousafetabhandler/setRefreshToken"
  //     );
  //   }
  // });
  app.post("/areyousafetabhandler/saveAppPermission", async (req, res) => {
    const teamId = req.query.teamId;
    const field = req.query.field;
    const IsAppPermissionGranted = req.query.IsAppPermissionGranted;
    const tenantid = req.query.tenantid;
    console.log({ teamId, IsAppPermissionGranted });
    try {
      const tabObj = new tab.AreYouSafeTab();
      const data = await tabObj.saveAppPermission(
        teamId,
        IsAppPermissionGranted == "True" ? true : false,
        tenantid,
        field,
      );
      tabObj.fetchDataAndUpdateDB(teamId);
      console.log(data);
      if (data.length) {
        res.send("success");
      } else {
        res.send(null);
      }
    } catch (err) {
      console.log(err);
      processSafetyBotError(
        err,
        teamId,
        "",
        userAadObjId,
        "error in /areyousafetabhandler/setRefreshToken",
      );
    }
  });
  app.post("/areyousafetabhandler/registerFcmToken", async (req, res) => {
    console.log(
      "[registerFcmToken] REQUEST received, body:",
      JSON.stringify(req.body, null, 2),
    );
    const { userId, fcmToken, platform, basicPhoneInfo, extra } =
      req.body || {};
    if (!userId || !fcmToken) {
      console.log("[registerFcmToken] REJECTED: userId or fcmToken missing");
      return res
        .status(400)
        .json({ ok: false, error: "userId and fcmToken required" });
    }
    const deviceInfo = {};
    if (basicPhoneInfo) {
      deviceInfo.osVersion = basicPhoneInfo.osVersion ?? null;
      const pc = basicPhoneInfo.platformConstants || {};
      deviceInfo.deviceBrand = pc.Brand ?? null;
      deviceInfo.deviceManufacturer = pc.Manufacturer ?? null;
      deviceInfo.deviceModel = pc.Model ?? null;
    }
    if (extra && typeof extra.authStatus === "number") {
      deviceInfo.authStatus = extra.authStatus;
    }
    console.log("[registerFcmToken] Calling saveToken with:", {
      userId,
      fcmToken,
      platform: platform || "android",
      deviceInfo,
    });
    try {
      await saveToken(userId, fcmToken, platform || "android", deviceInfo);
      console.log("[registerFcmToken] saveToken SUCCESS for userId:", userId);
      res.status(200).json({ ok: true });
    } catch (e) {
      console.error("[registerFcmToken] error:", e?.message);
      res.status(500).json({ ok: false, error: e?.message });
    }
  });
  app.post("/areyousafetabhandler/trackUserActivity", async (req, res) => {
    try {
      const events = Array.isArray(req.body?.events) ? req.body.events : [];

      if (!events.length) {
        return res.sendStatus(204);
      }

      const pool = await poolPromise;
      const now = new Date();

      let values = [];
      let request = pool.request();

      events.forEach((e, index) => {
        const sessionId = typeof e?.sessionId === "string" ? e.sessionId : "";
        const eventName = typeof e?.eventName === "string" ? e.eventName : "";
        const moduleName =
          typeof e?.moduleName === "string" ? e.moduleName : "";
        const actionName =
          typeof e?.actionName === "string" ? e.actionName : "";

        if (!sessionId || !eventName || !moduleName || !actionName) {
          throw new Error(
            "Each event must include sessionId, eventName, moduleName, and actionName",
          );
        }

        values.push(`
        (
          @UserId${index},
          @TeamId${index},
          @TenantId${index},
          @SessionId${index},
          @EventName${index},
          @ModuleName${index},
          @ActionName${index},
          @Metadata${index},
          @EventDateTime${index},
          @CreatedAt${index}
        )
      `);

        request
          .input(
            `UserId${index}`,
            sql.NVarChar(100),
            typeof e?.userId === "string" ? e.userId : null,
          )
          .input(
            `TeamId${index}`,
            sql.NVarChar(100),
            typeof e?.teamId === "string" ? e.teamId : null,
          )
          .input(
            `TenantId${index}`,
            sql.NVarChar(100),
            typeof e?.tenantId === "string" ? e.tenantId : null,
          )
          .input(`SessionId${index}`, sql.NVarChar(200), sessionId)
          .input(`EventName${index}`, sql.NVarChar(200), eventName)
          .input(`ModuleName${index}`, sql.NVarChar(200), moduleName)
          .input(`ActionName${index}`, sql.NVarChar(200), actionName)
          .input(
            `Metadata${index}`,
            sql.NVarChar(sql.MAX),
            typeof e?.metadata === "string" ? e.metadata : null,
          )
          .input(`EventDateTime${index}`, sql.DateTime, now)
          .input(`CreatedAt${index}`, sql.DateTime, now);
      });

      const query = `
      INSERT INTO UserActivityLogs (
        UserId,
        TeamId,
        TenantId,
        SessionId,
        EventName,
        ModuleName,
        ActionName,
        Metadata,
        EventDateTime,
        CreatedAt
      )
      VALUES ${values.join(",")}
    `;

      await request.query(query);

      return res.status(200).json({
        ok: true,
        inserted: events.length,
      });
    } catch (err) {
      console.error("[trackUserActivity] error:", err);

      return res.status(500).json({
        ok: false,
        error: err.message || "Failed to log events",
      });
    }
  });
  app.post("/areyousafetabhandler/sendNotification", async (req, res) => {
    const startMs = Date.now();
    const { userId, title, body, data } = req.body || {};
    if (!userId || !title) {
      return res
        .status(400)
        .json({ ok: false, error: "userId and title required" });
    }

    const runWithTimeout = async () => {
      let fcmToken = await getToken(userId);
      if (!fcmToken) {
        const tokens = await getFcmTokensForUsers([userId], "android");
        fcmToken = tokens && tokens.length > 0 ? tokens[0].fcm_token : null;
      }
      if (!fcmToken) {
        const aadObjectId = await resolveTeamsIdToAadObjectId(userId);
        if (aadObjectId) {
          console.log(
            "[sendNotification] resolved Teams ID to AAD Object ID, lookupMs:",
            Date.now() - startMs,
          );
          fcmToken = await getToken(aadObjectId);
          if (!fcmToken) {
            const tokens = await getFcmTokensForUsers([aadObjectId], "android");
            fcmToken = tokens && tokens.length > 0 ? tokens[0].fcm_token : null;
          }
        }
      }
      if (!fcmToken) {
        console.log(
          "[sendNotification] no token, lookupMs:",
          Date.now() - startMs,
        );
        return {
          ok: false,
          status: 404,
          body: { ok: false, error: "No FCM token for this userId" },
        };
      }
      console.log(
        "[sendNotification] token found, lookupMs:",
        Date.now() - startMs,
      );
      await sendPushNotification(fcmToken, title, body || "", data || {});
      return { ok: true, status: 200, body: { ok: true } };
    };

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(
        () => reject(new Error("sendNotification timeout")),
        SEND_NOTIFICATION_TIMEOUT_MS,
      );
    });

    try {
      const result = await Promise.race([runWithTimeout(), timeoutPromise]);
      if (result?.status === 404) {
        return res.status(404).json(result.body);
      }
      console.log("[sendNotification] done, totalMs:", Date.now() - startMs);
      return res.status(200).json(result.body);
    } catch (err) {
      const totalMs = Date.now() - startMs;
      console.error("[sendNotification]", err?.message, "totalMs:", totalMs);
      if (err?.message === "sendNotification timeout") {
        return res.status(504).json({ ok: false, error: "Request timeout" });
      }
      return res.status(500).json({ ok: false, error: err.message });
    }
  });
  app.get("/areyousafetabhandler/getAssistanceData", (req, res) => {
    const userAadObjId = req.query.userId;
    try {
      incidentService
        .getAssistanceData(userAadObjId, "desc")
        .then((incData) => {
          res.send(incData);
        })
        .catch((err) => {
          console.log(err);
          processSafetyBotError(
            err,
            "",
            "",
            userAadObjId,
            "error in /areyousafetabhandler/getAssistanceData -> then",
          );
        });
    } catch (err) {
      processSafetyBotError(
        err,
        "",
        "",
        userAadObjId,
        "error in /areyousafetabhandler/getAssistanceData",
      );
    }
  });
  app.get("/areyousafetabhandler/getAllUserAssistanceData", (req, res) => {
    const userAadObjId = req.query.userId;
    const teamid = req.query.teamid;
    try {
      incidentService
        .getAllUserAssistanceData(userAadObjId, teamid)
        .then((incData) => {
          res.send(incData);
        })
        .catch((err) => {
          console.log(err);
          processSafetyBotError(
            err,
            "",
            "",
            userAadObjId,
            "error in /areyousafetabhandler/getAllUserAssistanceData -> then",
          );
        });
    } catch (err) {
      processSafetyBotError(
        err,
        "",
        "",
        userAadObjId,
        "error in /areyousafetabhandler/getAssistanceData",
      );
    }
  });
  const SendSOSClosedCardToRequester = async (
    requestedUserData,
    closedByUserData,
    serviceUrl,
    user_tenant_id,
    userAadObjId,
    comment,
  ) => {
    try {
      //requestedUserData should have 2 properties: user_id and user_name
      //closedByUserData should have 2 properties: user_id and user_name
      let requestedUser = requestedUserData[0];
      let closedByUser = closedByUserData[0];
      if (requestedUserData != null) {
        const approvalCardResponse = {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          appId: process.env.MicrosoftAppId,
          body: [
            {
              type: "TextBlock",
              text: `🔔 **SOS Request Closed**`,
              wrap: true,
            },
            {
              type: "TextBlock",
              text: `Your SOS request raised on **${new Date().toLocaleString(
                "en-US",
                {
                  month: "short",
                  day: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: true,
                },
              )}** has been marked as closed by **<at>${
                closedByUser.user_name
              }</at>**.`,
              wrap: true,
            },
            {
              type: "TextBlock",
              text: `**Message:** ${comment}`,
              wrap: true,
            },
            {
              type: "TextBlock",
              text: `If this was closed by mistake, please go to the **Dashboard** tab and click **I Need Assistance** again.`,
              wrap: true,
            },
          ],
          msteams: {
            entities: [
              {
                type: "mention",
                text: `<at>${closedByUser.user_name}</at>`,
                mentioned: {
                  id: closedByUser.user_id,
                  name: closedByUser.user_name,
                },
              },
            ],
          },
          type: "AdaptiveCard",
          version: "1.4",
        };
        let memberArr = [
          {
            id: requestedUser.user_id,
            name: requestedUser.user_name,
          },
        ];

        const res = await apimeth.sendProactiveMessaageToUser(
          memberArr,
          approvalCardResponse,
          null,
          serviceUrl,
          user_tenant_id,
          null,
          userAadObjId,
        );
      }
    } catch (err) {
      processSafetyBotError(
        err,
        "",
        "",
        userAadObjId,
        "error in SendSOSClosedCardToRequester data=" + JSON.stringify(data),
      );
    }
  };
  app.put("/areyousafetabhandler/updatesosassistancestatus", (req, res) => {
    const data = req.query;
    const reqBody = req.body;
    // const userAadObjId = data.userAadObjId;
    //const TeamId = req.query.teamid;
    const assistanceuseraadobjectid = data.assistanceuseraadobjectid;
    const assistanceuserId = data.assistanceuserId;
    const assistanceusername = data.assistanceusername;
    const assistId = data.assistId;
    const closedbyuser = data.closedbyuser;
    const serviceurl = data.serviceurl;
    const tenentid = data.tenentid;
    const closedByUserName = data.closedByUserName;
    const comment = data.comment;
    try {
      if (data) {
        let ts = req.query.ts;
        if (ts != null) {
          ts = ts.replace(/-/g, "/");
        }
        incidentService
          .updateSosStatus(assistId, ts, closedbyuser, closedbyuser)
          .then(async (respData) => {
            await SendSOSClosedCardToRequester(
              [
                {
                  user_id: assistanceuserId,
                  user_name: assistanceusername,
                },
              ],
              [
                {
                  user_id: closedbyuser,
                  user_name: closedByUserName,
                },
              ],

              serviceurl,
              tenentid,
              assistanceuseraadobjectid,
              comment,
            );
            res.send(true);
          })
          .catch((err) => {
            console.log(err);
            processSafetyBotError(
              err,
              TeamId,
              "",
              userAadObjId,
              "error in /areyousafetabhandler/addCommentToAssistance -> then -> comment=" +
                reqBody.comment,
            );
            res.send(false);
          });
      }
    } catch (err) {
      processSafetyBotError(
        err,
        TeamId,
        "",
        userAadObjId,
        "error in /areyousafetabhandler/addCommentToAssistance -> then -> comment=" +
          reqBody.comment,
      );
    }
  });
  app.get("/areyousafetabhandler/requestAssistance", async (req, res) => {
    console.log("came in request");
    const userAadObjId = req.query.userId;
    var userlocation = "null";
    const TeamId = req.query.teamid;
    if (req.query.loc != undefined) {
      userlocation = req.query.loc;
    }
    var UserDataUpdateID = null;
    if (req.query.ID != undefined) {
      UserDataUpdateID = req.query.ID;
    }
    try {
      let incData = await incidentService.getAdminsOrEmergencyContacts(
        userAadObjId,
        TeamId,
      );
      if (
        incData === null ||
        (Array.isArray(incData) && incData.length === 0) ||
        incData[0].length === 0
      ) {
        res.send("no safety officers");
        return;
      }
      let admins = incData[0];
      let user = incData[1][0];
      let assistanceData = null;
      const tabObj = new tab.AreYouSafeTab();
      if (admins && admins.length > 0) {
        let ts = req.query.ts;
        if (ts != null) {
          ts = ts.replace(/-/g, "/");
        }
        assistanceData = await tabObj.saveAssistance(
          admins,
          user,
          ts,
          userAadObjId,
          userlocation,
          UserDataUpdateID,
        );
      }
      console.log(assistanceData);
      if (assistanceData != null && assistanceData.length > 0) {
        assistanceData = assistanceData[0];
      } else {
        assistanceData = "no safety officers";
      }
      res.send(assistanceData);
    } catch (err) {
      processSafetyBotError(
        err,
        "",
        "",
        userAadObjId,
        "error in /areyousafetabhandler/requestAssistance",
      );
    }
  });

  app.post(
    "/areyousafetabhandler/sendNeedAssistanceProactiveMessage",
    async (req, res) => {
      const userAadObjId = req.query.userId;
      const teamId = req.query.teamId;
      let incData = null;
      var requestAssistanceid = req.query.requestAssistance;
      var issendemail = req.query.issendemail;
      try {
        incData = await incidentService.getAdminsOrEmergencyContacts(
          userAadObjId,
          teamId,
        );
      } catch (err) {
        console.log(err);
        processSafetyBotError(
          err,
          teamId,
          "",
          userAadObjId,
          "error in /areyousafetabhandler/sendNeedAssistanceProactiveMessage -> getEmergencyContacts",
        );
      }
      if (
        incData === null ||
        (Array.isArray(incData) && incData.length === 0) ||
        incData[0].length === 0
      ) {
        incData = JSON.parse(req.body.data.adminlist);
      }
      var userlocation = null;
      if (req.body.data.ulocData != undefined && req.body.data.ulocData != "") {
        userlocation = JSON.parse(req.body.data.ulocData);
      }
      try {
        const tabObj = new tab.AreYouSafeTab();
        const isProactiveMessageSent = await tabObj.requestAssistance(
          incData,
          userAadObjId,
          userlocation,
          requestAssistanceid,
          issendemail,
        );
        res.send(isProactiveMessageSent);
      } catch (err) {
        processSafetyBotError(
          err,
          "",
          "",
          userAadObjId,
          "error in /areyousafetabhandler/sendNeedAssistanceProactiveMessage -> userlocation=" +
            userlocation +
            " req.query.adminlist=" +
            req.body.data,
        );
      }
    },
  );
  app.get(
    "/areyousafetabhandler/DeleteNeedAssistanceData",
    async (req, res) => {
      const AssistanceID = req.query.id;
      const Deletassistancedata =
        await tabObj.DeleteNeedAssistanceData(AssistanceID);
      res.send(Deletassistancedata);

      console.log(res);
      console.log({ AssistanceID });
    },
  );
  app.put("/areyousafetabhandler/addCommentToAssistance", (req, res) => {
    const data = req.query;
    const reqBody = req.body;
    const userAadObjId = data.userAadObjId;
    const TeamId = req.query.teamid;
    const assistId = req.query.assistId;
    try {
      if (reqBody && reqBody.comment != null && reqBody.comment != "") {
        let ts = req.query.ts;
        if (ts != null) {
          ts = ts.replace(/-/g, "/");
        }
        incidentService
          .addComment(data.assistId, reqBody.comment, ts, userAadObjId)
          .then(async (respData) => {
            let admins = await incidentService.getAdminsOrEmergencyContacts(
              userAadObjId,
              TeamId,
            );
            if (
              admins != null ||
              (Array.isArray(admins) && admins.length > 0) ||
              admins[0].length > 0
            ) {
              const tabObj = new tab.AreYouSafeTab();
              tabObj.sendUserCommentToAdmin(
                admins,
                reqBody.comment,
                userAadObjId,
                assistId,
              );
            }
            res.send(true);
          })
          .catch((err) => {
            console.log(err);
            processSafetyBotError(
              err,
              TeamId,
              "",
              userAadObjId,
              "error in /areyousafetabhandler/addCommentToAssistance -> then -> comment=" +
                reqBody.comment,
            );
            res.send(false);
          });
      }
    } catch (err) {
      processSafetyBotError(
        err,
        TeamId,
        "",
        userAadObjId,
        "error in /areyousafetabhandler/addCommentToAssistance -> then -> comment=" +
          reqBody.comment,
      );
    }
  });

  // Web endpoint to accept SOS via link (for SMS/Email)
  app.get("/acceptSOS", async (req, res) => {
    try {
      const requestAssistanceid = req.query.id;
      const adminAadObjId = req.query.adminId;
      const adminPhone = req.query.phone;

      if (!requestAssistanceid) {
        return res.status(400).send(`
          <html>
            <head><title>SOS Response</title></head>
            <body style="font-family: Arial, sans-serif; padding: 20px;">
              <h2>Error</h2>
              <p>Missing required parameters.</p>
            </body>
          </html>
        `);
      }

      // Get admin info by phone or aadObjectId
      let adminInfo = null;
      if (adminAadObjId) {
        const adminQuery = `SELECT u.user_id, u.user_name, u.user_aadobject_id, u.email, 
          d.serviceUrl, d.user_tenant_id, d.team_id
          FROM MSTeamsTeamsUsers u
          LEFT JOIN MSTeamsInstallationDetails d ON u.team_id = d.team_id
          WHERE u.user_aadobject_id = '${adminAadObjId}' 
          AND d.serviceUrl IS NOT NULL AND d.user_tenant_id IS NOT NULL
          AND d.uninstallation_date IS NULL`;
        const adminResult = await db.getDataFromDB(adminQuery, adminAadObjId);
        if (adminResult && adminResult.length > 0) {
          adminInfo = adminResult[0];
        }
      } else if (adminPhone) {
        // Try to find admin by phone number (this would require phone lookup)
        // For now, we'll need adminAadObjId - but we can enhance this later
        return res.status(400).send(`
          <html>
            <head><title>SOS Response</title></head>
            <body style="font-family: Arial, sans-serif; padding: 20px;">
              <h2>Error</h2>
              <p>Please use the admin ID parameter.</p>
            </body>
          </html>
        `);
      }

      if (!adminInfo) {
        return res.status(404).send(`
          <html>
            <head><title>SOS Response</title></head>
            <body style="font-family: Arial, sans-serif; padding: 20px;">
              <h2>Error</h2>
              <p>Admin not found. Please ensure you're using the correct link.</p>
            </body>
          </html>
        `);
      }

      // Get assistance request info
      const assistanceQuery = `SELECT user_id, sent_to_ids FROM MSTeamsAssistance WHERE id = ${requestAssistanceid}`;
      const assistanceData = await db.getDataFromDB(
        assistanceQuery,
        adminInfo.user_aadobject_id,
      );

      if (!assistanceData || assistanceData.length === 0) {
        return res.status(404).send(`
          <html>
            <head><title>SOS Response</title></head>
            <body style="font-family: Arial, sans-serif; padding: 20px;">
              <h2>Error</h2>
              <p>SOS request not found.</p>
            </body>
          </html>
        `);
      }

      // Check if already responded
      const checkQuery = `SELECT FIRST_RESPONDER, FIRST_RESPONDER_RESPONDED_AT FROM MSTeamsAssistance WHERE id = ${requestAssistanceid}`;
      const existingResponse = await db.getDataFromDB(
        checkQuery,
        adminInfo.user_aadobject_id,
      );

      if (
        existingResponse &&
        existingResponse.length > 0 &&
        existingResponse[0].FIRST_RESPONDER
      ) {
        const firstResponderId = existingResponse[0].FIRST_RESPONDER;
        if (firstResponderId === adminInfo.user_aadobject_id) {
          return res.send(`
            <html>
              <head><title>SOS Response</title></head>
              <body style="font-family: Arial, sans-serif; padding: 20px; text-align: center;">
                <h2 style="color: #28a745;">✓ You are already the first responder for this SOS.</h2>
                <p>Thank you for your response.</p>
              </body>
            </html>
          `);
        } else {
          return res.send(`
            <html>
              <head><title>SOS Response</title></head>
              <body style="font-family: Arial, sans-serif; padding: 20px; text-align: center;">
                <h2 style="color: #ffc107;">⚠ Someone else has already responded to this SOS.</h2>
                <p>Another responder is handling this request.</p>
              </body>
            </html>
          `);
        }
      }

      // // Process acceptance - update database
      // const updateQuery = `UPDATE MSTeamsAssistance SET FIRST_RESPONDER = '${adminInfo.user_aadobject_id}', FIRST_RESPONDER_RESPONDED_AT = GETDATE() WHERE id = ${requestAssistanceid}`;
      // await db.updateDataIntoDB(updateQuery, adminInfo.user_aadobject_id);

      // Get requester info
      const requesterQuery = `SELECT user_id, user_name, user_aadobject_id, email FROM MSTeamsTeamsUsers WHERE user_id = '${assistanceData[0].user_id}'`;
      const requesterInfo = await db.getDataFromDB(
        requesterQuery,
        adminInfo.user_aadobject_id,
      );
      const requester =
        requesterInfo && requesterInfo.length > 0 ? requesterInfo[0] : null;

      // Get list of other admins/responders who were notified
      let otherAdminNames = [];
      if (assistanceData[0].sent_to_ids) {
        const sendToIds = assistanceData[0].sent_to_ids;
        // Remove duplicates using Set and filter out current admin
        const adminUserIds = [
          ...new Set(
            sendToIds
              .split(",")
              .map((id) => id.trim())
              .filter((id) => id && id !== "" && id !== adminInfo.user_id),
          ),
        ];

        if (adminUserIds.length > 0) {
          const adminIdsStr = adminUserIds.map((id) => `'${id}'`).join(",");
          const otherAdminsQuery = `SELECT DISTINCT user_name FROM MSTeamsTeamsUsers WHERE user_id IN (${adminIdsStr})`;
          const otherAdminsResult = await db.getDataFromDB(
            otherAdminsQuery,
            adminInfo.user_aadobject_id,
          );
          if (otherAdminsResult && otherAdminsResult.length > 0) {
            // Remove duplicate names using Set
            otherAdminNames = [
              ...new Set(
                otherAdminsResult
                  .map((admin) => admin.user_name)
                  .filter((name) => name && name.trim() !== ""),
              ),
            ];
          }
        }
      }

      // Build notification message
      let notificationMessage = "You are now the first responder.";
      if (requester) {
        if (otherAdminNames.length > 0) {
          // Format: "requester and the following emergency contacts have been notified: admin1, admin2, and admin3"
          let contactsList = "";
          if (otherAdminNames.length === 1) {
            contactsList = otherAdminNames[0];
          } else if (otherAdminNames.length === 2) {
            contactsList = `${otherAdminNames[0]} and ${otherAdminNames[1]}`;
          } else {
            const lastAdmin = otherAdminNames[otherAdminNames.length - 1];
            const otherAdmins = otherAdminNames.slice(0, -1).join(", ");
            contactsList = `${otherAdmins}, and ${lastAdmin}`;
          }
          notificationMessage += ` ${requester.user_name} and the following emergency contacts have been notified: ${contactsList}.`;
        } else {
          notificationMessage += ` ${requester.user_name} has been notified.`;
        }
      } else if (otherAdminNames.length > 0) {
        // Fallback if no requester but there are other admins
        if (otherAdminNames.length === 1) {
          notificationMessage += ` ${otherAdminNames[0]} has been notified.`;
        } else if (otherAdminNames.length === 2) {
          notificationMessage += ` ${otherAdminNames[0]} and ${otherAdminNames[1]} have been notified.`;
        } else {
          const lastAdmin = otherAdminNames[otherAdminNames.length - 1];
          const otherAdmins = otherAdminNames.slice(0, -1).join(", ");
          notificationMessage += ` ${otherAdmins}, and ${lastAdmin} have been notified.`;
        }
      }

      // Import botActivityHandler to use the notification logic
      const { BotActivityHandler } = require("./bot/botActivityHandler");
      const botHandler = new BotActivityHandler();

      // Create a mock user object for the handler
      const mockUser = {
        id: adminInfo.user_id,
        name: adminInfo.user_name,
        aadObjectId: adminInfo.user_aadobject_id,
      };

      // Call the async handler to send notifications (don't await to return response quickly)
      botHandler
        .handleRespondToAssistanceAsync(
          null, // context (not needed for web)
          requester ? requester.user_aadobject_id : assistanceData[0].user_id,
          requestAssistanceid,
          adminInfo.user_tenant_id,
          adminInfo.serviceUrl,
          mockUser,
        )
        .catch((err) => {
          console.log("Error in handleRespondToAssistanceAsync:", err);
          processSafetyBotError(
            err,
            "",
            "",
            adminInfo.user_aadobject_id,
            "error in /acceptSOS - handleRespondToAssistanceAsync",
          );
        });

      // Return success page
      res.send(`
        <html>
          <head>
            <title>SOS Response Accepted</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center; background-color: #f5f5f5;">
            <div style="max-width: 600px; margin: 0 auto; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
              <h1 style="color: #28a745; margin-bottom: 20px;">✓ Success!</h1>
              <h2 style="color: #333; margin-bottom: 20px;">${notificationMessage}</h2>
            </div>
          </body>
        </html>
      `);
    } catch (err) {
      console.log("Error in /acceptSOS:", err);
      processSafetyBotError(err, "", "", "", "error in /acceptSOS");
      res.status(500).send(`
        <html>
          <head><title>SOS Response Error</title></head>
          <body style="font-family: Arial, sans-serif; padding: 20px;">
            <h2 style="color: #dc3545;">Error</h2>
            <p>An error occurred while processing your response. Please try again or contact support.</p>
          </body>
        </html>
      `);
    }
  });

  // Helper function to send WhatsApp message directly
  const sendWhatsAppMessage = async (to, body) => {
    try {
      const token = process.env.WHATSAPP_TOKEN;
      const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

      if (!token || !phoneNumberId) {
        console.log("WhatsApp token or phone number ID not configured");
        return null;
      }

      let payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: to,
        type: "text",
        text: {
          body: body,
        },
      };

      let response = await axios.post(
        `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      );

      console.log(
        "WhatsApp message sent:",
        response.data || response.message || response,
      );
      return response;
    } catch (error) {
      console.log(
        "Error sending WhatsApp message:",
        error.response?.data || error.message,
      );
      throw error;
    }
  };

  // Web endpoint to accept SOS via WhatsApp button
  app.get("/whatsappAcceptSOS", async (req, res) => {
    try {
      const requestAssistanceid = req.query.id;
      const adminAadObjId = req.query.adminId;
      const adminPhone = req.query.phone; // WhatsApp phone number

      if (!requestAssistanceid || !adminAadObjId) {
        if (adminPhone) {
          try {
            await sendWhatsAppMessage(
              adminPhone,
              "Error: Missing required parameters. Please try again.",
            );
          } catch (err) {
            console.log("Error sending WhatsApp error message:", err);
          }
        }
        return res.status(400).send("Missing required parameters");
      }

      // Get admin info by aadObjectId
      const adminQuery = `SELECT u.user_id, u.user_name, u.user_aadobject_id, u.email, 
        d.serviceUrl, d.user_tenant_id, d.team_id
        FROM MSTeamsTeamsUsers u
        LEFT JOIN MSTeamsInstallationDetails d ON u.team_id = d.team_id
        WHERE u.user_aadobject_id = '${adminAadObjId}' 
        AND d.serviceUrl IS NOT NULL AND d.user_tenant_id IS NOT NULL
        AND d.uninstallation_date IS NULL`;
      const adminResult = await db.getDataFromDB(adminQuery, adminAadObjId);
      const adminInfo =
        adminResult && adminResult.length > 0 ? adminResult[0] : null;

      if (!adminInfo) {
        if (adminPhone) {
          try {
            await sendWhatsAppMessage(
              adminPhone,
              "Error: Admin not found. Please ensure you're using the correct link.",
            );
          } catch (err) {
            console.log("Error sending WhatsApp error message:", err);
          }
        }
        return res.status(404).send("Admin not found");
      }

      // Get assistance request info
      const assistanceQuery = `SELECT user_id, sent_to_ids FROM MSTeamsAssistance WHERE id = ${requestAssistanceid}`;
      const assistanceData = await db.getDataFromDB(
        assistanceQuery,
        adminInfo.user_aadobject_id,
      );

      if (!assistanceData || assistanceData.length === 0) {
        if (adminPhone) {
          try {
            await sendWhatsAppMessage(
              adminPhone,
              "Error: SOS request not found.",
            );
          } catch (err) {
            console.log("Error sending WhatsApp error message:", err);
          }
        }
        return res.status(404).send("SOS request not found");
      }

      // Check if already responded
      const checkQuery = `SELECT FIRST_RESPONDER, FIRST_RESPONDER_RESPONDED_AT FROM MSTeamsAssistance WHERE id = ${requestAssistanceid}`;
      const existingResponse = await db.getDataFromDB(
        checkQuery,
        adminInfo.user_aadobject_id,
      );

      if (
        existingResponse &&
        existingResponse.length > 0 &&
        existingResponse[0].FIRST_RESPONDER
      ) {
        const firstResponderId = existingResponse[0].FIRST_RESPONDER;
        if (firstResponderId === adminInfo.user_aadobject_id) {
          // Send WhatsApp confirmation message
          if (adminPhone) {
            try {
              await sendWhatsAppMessage(
                adminPhone,
                "You are already the first responder for this SOS. Thank you for your response.",
              );
              incidentService.saveAllTypeQuerylogs(
                adminInfo.user_aadobject_id,
                "",
                "SOS_WHATSAPP_ACCEPT",
                adminPhone.slice(-4).padStart(adminPhone.length, "x"),
                requestAssistanceid,
                "ALREADY_RESPONDED",
                "",
                "",
                "",
                "You are already the first responder for this SOS.",
                "",
              );
            } catch (waErr) {
              console.log("Error sending WhatsApp confirmation:", waErr);
            }
          }
          return res.status(200).send("OK");
        } else {
          // Send WhatsApp message that someone else responded
          if (adminPhone) {
            try {
              await sendWhatsAppMessage(
                adminPhone,
                "Someone else has already responded to this SOS. Another responder is handling this request.",
              );
              incidentService.saveAllTypeQuerylogs(
                adminInfo.user_aadobject_id,
                "",
                "SOS_WHATSAPP_ACCEPT",
                adminPhone.slice(-4).padStart(adminPhone.length, "x"),
                requestAssistanceid,
                "ALREADY_RESPONDED_BY_OTHER",
                "",
                "",
                "",
                "Someone else has already responded to this SOS.",
                "",
              );
            } catch (waErr) {
              console.log("Error sending WhatsApp confirmation:", waErr);
            }
          }
          return res.status(200).send("OK");
        }
      }

      // Process acceptance - update database
      // const updateQuery = `UPDATE MSTeamsAssistance SET FIRST_RESPONDER = '${adminInfo.user_aadobject_id}', FIRST_RESPONDER_RESPONDED_AT = GETDATE() WHERE id = ${requestAssistanceid}`;
      // await db.updateDataIntoDB(updateQuery, adminInfo.user_aadobject_id);

      // Get requester info
      const requesterQuery = `SELECT user_id, user_name, user_aadobject_id, email FROM MSTeamsTeamsUsers WHERE user_id = '${assistanceData[0].user_id}'`;
      const requesterInfo = await db.getDataFromDB(
        requesterQuery,
        adminInfo.user_aadobject_id,
      );
      const requester =
        requesterInfo && requesterInfo.length > 0 ? requesterInfo[0] : null;

      // Get list of other admins/responders who were notified
      let otherAdminNames = [];
      if (assistanceData[0].sent_to_ids) {
        const sendToIds = assistanceData[0].sent_to_ids;
        const adminUserIds = [
          ...new Set(
            sendToIds
              .split(",")
              .map((id) => id.trim())
              .filter((id) => id && id !== "" && id !== adminInfo.user_id),
          ),
        ];

        if (adminUserIds.length > 0) {
          const adminIdsStr = adminUserIds.map((id) => `'${id}'`).join(",");
          const otherAdminsQuery = `SELECT DISTINCT user_name FROM MSTeamsTeamsUsers WHERE user_id IN (${adminIdsStr})`;
          const otherAdminsResult = await db.getDataFromDB(
            otherAdminsQuery,
            adminInfo.user_aadobject_id,
          );
          if (otherAdminsResult && otherAdminsResult.length > 0) {
            otherAdminNames = [
              ...new Set(
                otherAdminsResult
                  .map((admin) => admin.user_name)
                  .filter((name) => name && name.trim() !== ""),
              ),
            ];
          }
        }
      }

      // Build notification message
      let notificationMessage = "You are now the first responder.";
      if (requester) {
        if (otherAdminNames.length > 0) {
          let contactsList = "";
          if (otherAdminNames.length === 1) {
            contactsList = otherAdminNames[0];
          } else if (otherAdminNames.length === 2) {
            contactsList = `${otherAdminNames[0]} and ${otherAdminNames[1]}`;
          } else {
            const lastAdmin = otherAdminNames[otherAdminNames.length - 1];
            const otherAdmins = otherAdminNames.slice(0, -1).join(", ");
            contactsList = `${otherAdmins}, and ${lastAdmin}`;
          }
          notificationMessage += ` ${requester.user_name} and the following emergency contacts have been notified: ${contactsList}.`;
        } else {
          notificationMessage += ` ${requester.user_name} has been notified.`;
        }
      } else if (otherAdminNames.length > 0) {
        if (otherAdminNames.length === 1) {
          notificationMessage += ` ${otherAdminNames[0]} has been notified.`;
        } else if (otherAdminNames.length === 2) {
          notificationMessage += ` ${otherAdminNames[0]} and ${otherAdminNames[1]} have been notified.`;
        } else {
          const lastAdmin = otherAdminNames[otherAdminNames.length - 1];
          const otherAdmins = otherAdminNames.slice(0, -1).join(", ");
          notificationMessage += ` ${otherAdmins}, and ${lastAdmin} have been notified.`;
        }
      }

      // Send WhatsApp confirmation message
      if (adminPhone) {
        try {
          await sendWhatsAppMessage(adminPhone, notificationMessage);
          incidentService.saveAllTypeQuerylogs(
            adminInfo.user_aadobject_id,
            "",
            "SOS_WHATSAPP_ACCEPT",
            adminPhone.slice(-4).padStart(adminPhone.length, "x"),
            requestAssistanceid,
            "SEND_SUCCESS",
            "",
            "",
            "",
            notificationMessage,
            "",
          );
        } catch (waErr) {
          console.log("Error sending WhatsApp confirmation:", waErr);
          incidentService.saveAllTypeQuerylogs(
            adminInfo.user_aadobject_id,
            "",
            "SOS_WHATSAPP_ACCEPT",
            "",
            requestAssistanceid,
            "SEND_FAILED",
            "",
            "",
            "",
            notificationMessage,
            JSON.stringify(waErr.message || waErr),
          );
        }
      }

      // Import botActivityHandler to use the notification logic
      const { BotActivityHandler } = require("./bot/botActivityHandler");
      const botHandler = new BotActivityHandler();

      const mockUser = {
        id: adminInfo.user_id,
        name: adminInfo.user_name,
        aadObjectId: adminInfo.user_aadobject_id,
      };

      // Call the async handler to send notifications
      botHandler
        .handleRespondToAssistanceAsync(
          null,
          requester ? requester.user_aadobject_id : assistanceData[0].user_id,
          requestAssistanceid,
          adminInfo.user_tenant_id,
          adminInfo.serviceUrl,
          mockUser,
        )
        .catch((err) => {
          console.log("Error in handleRespondToAssistanceAsync:", err);
          processSafetyBotError(
            err,
            "",
            "",
            adminInfo.user_aadobject_id,
            "error in /whatsappAcceptSOS - handleRespondToAssistanceAsync",
          );
        });

      // Return success response
      return res.status(200).send("OK");
    } catch (err) {
      console.log("Error in /whatsappAcceptSOS:", err);
      processSafetyBotError(err, "", "", "", "error in /whatsappAcceptSOS");

      // Send error message via WhatsApp if phone number is available
      const adminPhone = req.query.phone;
      if (adminPhone) {
        try {
          await sendWhatsAppMessage(
            adminPhone,
            "An error occurred while processing your response. Please try again or contact support.",
          );
        } catch (waErr) {
          console.log("Error sending WhatsApp error message:", waErr);
        }
      }

      return res.status(500).send("Internal Server Error");
    }
  });

  app.get("/areyousafetabhandler/checkduplicateInc", async (req, res) => {
    const qs = req.query;
    try {
      const tabObj = new tab.AreYouSafeTab();
      const isDuplicate = await tabObj.checkDuplicateInc(
        qs.incTitle,
        qs.teamId,
        qs.userAadObjId,
      );
      res.send(isDuplicate);
    } catch (err) {
      console.log(err);
      processSafetyBotError(
        err,
        qs.teamId,
        "",
        qs.userAadObjId,
        "error in /areyousafetabhandler/checkduplicateInc -> qs.incTitle=" +
          qs.incTitle,
      );
      res.send({ error: "Error: Please try again" });
    }
  });

  app.post("/areyousafetabhandler/createnewincident", async (req, res) => {
    try {
      const reqBody = req.body;
      const qs = req.query;
      const userAadObjId = qs.userAadObjId;
      const tabObj = new tab.AreYouSafeTab();
      const newInc = await tabObj.createNewIncident(reqBody, userAadObjId);
      res.send(newInc);
    } catch (err) {
      console.log(err);
      processSafetyBotError(
        err,
        "",
        "",
        req.query.userAadObjId,
        "error in /areyousafetabhandler/createnewincident",
      );
      res.send({ error: "Error: Please try again" });
    }
  });

  app.post("/areyousafetabhandler/FileSave", async (req, res) => {
    try {
      const reqBody = req.body;
      const qs = req.query;
      const userAadObjId = qs.userAadObjId;
      const tabObj = new tab.AreYouSafeTab();
      const FileData = await tabObj.InsertFileIntoDB(reqBody, userAadObjId);
      res.send(FileData);
    } catch (err) {
      console.log(err);
      processSafetyBotError(
        err,
        "",
        "",
        req.query.userAadObjId,
        "error in /areyousafetabhandler/FileSave",
      );
      res.send({ error: "Error: Please try again" });
    }
  });

  app.post("/areyousafetabhandler/DeleteFile", async (req, res) => {
    try {
      const reqBody = req.body;
      const qs = req.query;
      const userAadObjId = qs.userAadObjId;
      const tabObj = new tab.AreYouSafeTab();
      const DeleteFileData = await tabObj.DeleteFile(reqBody, userAadObjId);
      res.send(DeleteFileData);
    } catch (err) {
      console.log(err);
      processSafetyBotError(
        err,
        "",
        "",
        req.query.userAadObjId,
        "error in /areyousafetabhandler/DeleteFile",
      );
      res.send({ error: "Error: Please try again" });
    }
  });

  app.post("/areyousafetabhandler/saveInstalledUsersToDB", async (req, res) => {
    try {
      console.log("=== Received request to save installed users to DB ===");
      const { users, tenantId, serviceUrl, teamId, botServiceUrl } = req.body;

      console.log("=== Received request to save installed users to DB ===");
      console.log("Tenant ID:", tenantId);
      console.log("Service URL:", serviceUrl);
      console.log("Team ID (from query):", teamId);
      console.log("Number of users:", users ? users.length : 0);
      console.log("Users data:", JSON.stringify(users, null, 2));

      if (!users || !Array.isArray(users) || users.length === 0) {
        return res.send({
          success: false,
          error: "No users provided or users array is empty",
        });
      }

      if (!tenantId) {
        return res.send({
          success: false,
          error: "Tenant ID is required",
        });
      }
      // Use mssql for parameterized queries
      const sql = require("mssql");
      const pool = await poolPromise;

      const toSqlNVarChar = (value) =>
        `N'${String(value).replace(/'/g, "''")}'`;
      const toSqlNVarCharOrNull = (value) => {
        if (value === null || value === undefined) return "NULL";
        const str = String(value);
        if (str.length === 0) return "NULL";
        return toSqlNVarChar(str);
      };
      const hasConversationId = (conversationId) =>
        conversationId !== null &&
        conversationId !== undefined &&
        String(conversationId).toLowerCase() !== "null" &&
        String(conversationId).length > 0;
      const getKey = (team, aad) => `${team}::${aad}`;

      // Normalize users (preserve input order for response)
      const normalized = users.map((user, index) => {
        const userTeamId = user.team_id || user.teamId || teamId;
        const userAadObjectId =
          user.aadObjectId ||
          user.objectId ||
          user.aadUserId ||
          user.user_aadobject_id;
        const userId =
          user.user_id || user.userId || user.id || userAadObjectId;
        const userName =
          user.user_name ||
          user.userName ||
          user.displayName ||
          user.name ||
          "";
        const userPrincipalName =
          user.userPrincipalName || user.user_principal_name || user.upn || "";
        const email = user.email || user.mail || "";
        const userRole = user.userRole || user.user_role || user.role || "User";
        const isTeamMember =
          user.IS_TEAM_MEMBER !== undefined
            ? user.IS_TEAM_MEMBER
            : user.isTeamMember !== undefined
              ? user.isTeamMember
              : 1;

        const isValid = Boolean(userTeamId && userAadObjectId);
        return {
          index,
          original: user,
          isValid,
          team_id: userTeamId,
          user_aadobject_id: userAadObjectId,
          user_id: userId,
          user_name: userName,
          userPrincipalName,
          email,
          tenantid: tenantId,
          userRole,
          IS_TEAM_MEMBER: isTeamMember ? 1 : 0,
          hasLicense: 1,
          conversationId: null,
          conversation: false,
        };
      });

      let skippedCount = 0;
      for (const u of normalized) {
        if (!u.isValid) skippedCount++;
      }

      const validUsers = normalized.filter((u) => u.isValid);
      if (validUsers.length === 0) {
        return res.send({
          success: false,
          error: "No valid users to save after validation",
          skippedCount,
          totalUsers: users.length,
        });
      }

      // Batch pre-check: which users already have conversationId in DB
      const keysValuesClause = validUsers
        .map(
          (u) =>
            `(${toSqlNVarChar(u.team_id)}, ${toSqlNVarChar(u.user_aadobject_id)})`,
        )
        .join(",\n    ");

      const precheckQuery = `
        SELECT 
          source.team_id,
          source.user_aadobject_id,
          existing.conversationId
        FROM (VALUES
          ${keysValuesClause}
        ) AS source (team_id, user_aadobject_id)
        LEFT JOIN MSTeamsTeamsUsers AS existing
          ON existing.team_id = source.team_id
         AND existing.user_aadobject_id = source.user_aadobject_id;
      `;

      const precheckResult = await pool.request().query(precheckQuery);
      const existingConversationMap = new Map();
      for (const row of precheckResult.recordset || []) {
        existingConversationMap.set(
          getKey(row.team_id, row.user_aadobject_id),
          row.conversationId,
        );
      }

      let alreadyHadConversationCount = 0;
      for (const u of validUsers) {
        const existingConversationId = existingConversationMap.get(
          getKey(u.team_id, u.user_aadobject_id),
        );
        if (hasConversationId(existingConversationId)) {
          u.conversationId = existingConversationId;
          u.conversation = true;
          alreadyHadConversationCount++;
        }
      }

      // Create conversations only for users missing conversationId
      let createdConversationCount = 0;
      for (const u of validUsers) {
        if (u.conversation) continue;

        const newConversationId = await apimeth.getUsersConversationId(
          tenantId,
          [
            {
              id: u.user_aadobject_id, // REQUIRED
              name: u.user_name,
            },
          ],
          botServiceUrl,
          u.user_aadobject_id,
        );

        console.log("Conversation ID fetch result:", {
          userName: u.user_name,
          conversationId: newConversationId,
        });

        if (hasConversationId(newConversationId)) {
          u.conversationId = newConversationId;
          u.conversation = true;
          createdConversationCount++;
        }
      }

      // Upsert users (insert new rows; update missing conversationId when available)
      const upsertValuesClause = validUsers
        .map((u) => {
          return `(
          ${toSqlNVarChar(u.team_id)},
          ${toSqlNVarChar(u.user_aadobject_id)},
          ${toSqlNVarCharOrNull(u.user_id)},
          ${toSqlNVarCharOrNull(u.user_name)},
          ${toSqlNVarCharOrNull(u.userPrincipalName)},
          ${toSqlNVarCharOrNull(u.email)},
          ${toSqlNVarCharOrNull(u.tenantid)},
          ${toSqlNVarCharOrNull(u.userRole)},
          ${u.IS_TEAM_MEMBER},
          ${toSqlNVarCharOrNull(u.conversationId)},
          ${u.hasLicense}
        )`;
        })
        .join(",\n    ");

      const mergeQuery = `
        MERGE INTO MSTeamsTeamsUsers AS target
        USING (VALUES
          ${upsertValuesClause}
        ) AS source
        (
          team_id, user_aadobject_id, user_id, user_name, userPrincipalName, email, tenantid, userRole, IS_TEAM_MEMBER, conversationId, hasLicense
        )
        ON target.team_id = source.team_id
       AND target.user_aadobject_id = source.user_aadobject_id
        WHEN MATCHED THEN
          UPDATE SET
            user_id = source.user_id,
            user_name = source.user_name,
            userPrincipalName = source.userPrincipalName,
            email = source.email,
            tenantid = source.tenantid,
            userRole = source.userRole,
            IS_TEAM_MEMBER = source.IS_TEAM_MEMBER,
            hasLicense = source.hasLicense,
            conversationId = CASE
              WHEN (target.conversationId IS NULL OR target.conversationId = 'null')
               AND (source.conversationId IS NOT NULL AND source.conversationId <> 'null')
              THEN source.conversationId
              ELSE target.conversationId
            END
        WHEN NOT MATCHED THEN
          INSERT (team_id, user_aadobject_id, user_id, user_name, userPrincipalName, email, tenantid, userRole, IS_TEAM_MEMBER, conversationId, hasLicense)
          VALUES (source.team_id, source.user_aadobject_id, source.user_id, source.user_name, source.userPrincipalName, source.email, source.tenantid, source.userRole, source.IS_TEAM_MEMBER, source.conversationId, source.hasLicense);
      `;

      const mergeResult = await pool.request().query(mergeQuery);

      const usersWithConversationFlag = normalized.map((u) => ({
        ...u.original,
        conversation: Boolean(u.conversation),
      }));

      console.log(
        `✅ Processed ${users.length} users. valid=${validUsers.length}, skipped=${skippedCount}, alreadyHadConversation=${alreadyHadConversationCount}, createdConversation=${createdConversationCount}`,
      );

      res.send({
        success: true,
        message: `Processed ${users.length} users`,
        totalUsers: users.length,
        validCount: validUsers.length,
        skippedCount,
        alreadyHadConversationCount,
        createdConversationCount,
        dbRowsAffected: mergeResult?.rowsAffected,
        users: usersWithConversationFlag,
      });
    } catch (err) {
      console.log("Error in saveInstalledUsersToDB:", err);
      processSafetyBotError(
        err,
        "",
        "",
        "",
        "error in /areyousafetabhandler/saveInstalledUsersToDB",
      );
      res.send({ error: "Error: Please try again" });
    }
  });

  app.post("/areyousafetabhandler/sendSafetyCheckMessage", async (req, res) => {
    try {
      const qs = req.query;
      const incId = qs.incId;
      const teamId = qs.teamId;
      const createdByUserInfo = req.body;
      const userAadObjId = qs.userAadObjId;
      const resendSafetyCheck = qs.resendSafetyCheck;
      //const responseOptionData = JSON.parse(qs.responseOptionData);
      const tabObj = new tab.AreYouSafeTab();

      tabObj
        .sendSafetyCheckMessage(
          incId,
          teamId,
          createdByUserInfo,
          userAadObjId,
          resendSafetyCheck,
        )
        .then((safetyCheckSend) => {
          res.send(safetyCheckSend);
        });
    } catch (err) {
      console.log(err);
      processSafetyBotError(
        err,
        req.query.teamId,
        "",
        req.query.userAadObjId,
        "error in /areyousafetabhandler/sendSafetyCheckMessage incid=" +
          req.query.incId,
      );
      res.send({ error: "Error: Please try again" });
    }
  });
  app.post(
    "/areyousafetabhandler/NewsendSafetyCheckMessage",
    async (req, res) => {
      try {
        const qs = req.query;
        const incId = qs.incId;
        const teamId = qs.teamId;
        const createdByUserInfo = req.body.createByInfo;
        const companyData = req.body.createByInfo.companyData;
        const members = req.body.members;
        const incdata = req.body.incdata;
        const userAadObjId = qs.userAadObjId;
        const resendSafetyCheck = qs.resendSafetyCheck || false;
        const isLastBatch = qs.isLastBatch;
        const isFirstBatch = qs.isFirstBatch;
        //const responseOptionData = JSON.parse(qs.responseOptionData);
        const tabObj = new tab.AreYouSafeTab();
        const log = new AYSLog();
        await bot
          .NewsendSafetyCheckMessageAsync(
            incId,
            teamId,
            createdByUserInfo,
            log,
            userAadObjId,
            resendSafetyCheck,
            incdata,
            members,
            companyData,
            isLastBatch,
            isFirstBatch,
          )
          .then((safetyCheckSend) => {
            res.send(safetyCheckSend);
          });
      } catch (err) {
        console.log(err);
        processSafetyBotError(
          err,
          req.query.teamId,
          "",
          req.query.userAadObjId,
          "error in /areyousafetabhandler/sendSafetyCheckMessage incid=" +
            req.query.incId,
        );
        res.send({ error: "Error: Please try again" });
      }
    },
  );
  app.get("/areyousafetabhandler/getUserTeamInfo", async (req, res) => {
    const userAadObjId = req.query.userAadObjId;
    const tabObj = new tab.AreYouSafeTab();
    const userTeamInfo = await tabObj.getUserTeamInfo(userAadObjId);
    res.send(userTeamInfo);
  });
  app.get("/areyousafetabhandler/getFilterData", async (req, res) => {
    const teamId = req.query.teamId;

    const source = req.query.source || "office365";
    const tabObj = new tab.AreYouSafeTab();
    const filterData = await tabObj.getFilterData(teamId, source);
    res.send(filterData);
  });

  app.get("/areyousafetabhandler/GetManualLocations/", async (req, res) => {
    const tenantId = req.query.tenantId || req.query.teamId;
    const userAadObjId = req.query.userAadObjId || "";

    if (!tenantId) {
      return res.status(400).json({ error: "tenantId is required" });
    }

    try {
      const tabObj = new tab.AreYouSafeTab();
      const locations = await tabObj.getManualLocations(tenantId);
      res.json({ data: Array.isArray(locations) ? locations : [] });
    } catch (err) {
      console.log(err);
      processSafetyBotError(
        err,
        tenantId,
        "",
        userAadObjId,
        "error in /areyousafetabhandler/GetManualLocations",
      );
      res.status(500).json({ error: "Error fetching manual locations" });
    }
  });

  app.post("/areyousafetabhandler/SaveManualLocations/", async (req, res) => {
    const tenantId = req.body?.tenantId || req.body?.teamId;
    const userAadObjId = req.body?.userAadObjId || "";

    if (!tenantId) {
      return res.status(400).json({ error: "tenantId is required" });
    }

    try {
      const tabObj = new tab.AreYouSafeTab();
      const result = await tabObj.saveManualLocations({
        tenantId,
        userAadObjId,
        locations: req.body?.locations,
      });

      if (result?.success) {
        return res.json(result);
      }

      return res
        .status(result?.statusCode || 500)
        .json({ error: result?.error || "Failed to save manual locations" });
    } catch (err) {
      console.log(err);
      processSafetyBotError(
        err,
        tenantId,
        "",
        userAadObjId,
        "error in /areyousafetabhandler/SaveManualLocations",
      );
      res.status(500).json({ error: "Failed to save manual locations" });
    }
  });

  app.post("/areyousafetabhandler/DeleteManualLocation/", async (req, res) => {
    const id = Number(req.body?.id);
    const userAadObjId = req.body?.userAadObjId || "";

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, error: "id is required" });
    }

    try {
      const tabObj = new tab.AreYouSafeTab();
      const result = await tabObj.deleteManualLocation(id);

      if (result?.success) {
        return res.json(result);
      }

      return res.status(result?.statusCode || 500).json({
        success: false,
        error: result?.error || "Failed to delete manual location",
      });
    } catch (err) {
      console.log(err);
      processSafetyBotError(
        err,
        "",
        "",
        userAadObjId,
        "error in /areyousafetabhandler/DeleteManualLocation",
      );
      res
        .status(500)
        .json({ success: false, error: "Failed to delete manual location" });
    }
  });

  app.put("/areyousafetabhandler/contactus", async (req, res) => {
    const email = req.query.email;
    const msg = req.query.msg;
    const userId = req.query.userId;
    const userName = req.query.userName;
    try {
      const tabObj = new tab.AreYouSafeTab();
      await tabObj.submitContactUs(email, msg, userId, userName);
      res.send(true);
    } catch (err) {
      console.log(err);
      processSafetyBotError(
        err,
        "",
        userName,
        userId,
        "error in /areyousafetabhandler/contactus -> email=" +
          email +
          " msg=" +
          msg,
      );
      res.send(false);
    }
  });

  app.get("/areyousafetabhandler/getSuperUsersByTeamId", async (req, res) => {
    const teamId = req.query.teamid;
    try {
      const tabObj = new tab.AreYouSafeTab();
      const superUsers = await tabObj.getSuperUsersByTeamId(teamId);
      res.send(superUsers);
    } catch (err) {
      processSafetyBotError(
        err,
        teamId,
        "",
        null,
        "error in /areyousafetabhandler/getSuperUsersByTeamId",
      );
    }
  });

  app.post("/areyousafetabhandler/saveUserSetting", async (req, res) => {
    const reqBody = req.body;
    try {
      const tabObj = new tab.AreYouSafeTab();
      const isUpdated = await tabObj.saveUserSetting(reqBody);
      if (isUpdated) {
        res.send("Your App Settings have been saved successfully.");
      } else {
        res.send({ error: "Error: Please try again" });
      }
    } catch (err) {
      console.log(err);
      processSafetyBotError(
        err,
        "",
        "",
        reqBody.userAadObjId,
        "error in /areyousafetabhandler/saveUserSetting",
      );
      res.send({ error: "Error: Please try again" });
    }
  });

  app.get("/areyousafetabhandler/getIncDataToCopyInc", async (req, res) => {
    const incId = req.query.incid;
    const userAadObjId = req.query.userAadObjId;
    try {
      if (incId && Number(incId) > 0) {
        const incData = await tabObj.getIncDataToCopyInc(incId, userAadObjId);
        res.send(incData);
      } else {
        res.send(null);
      }
    } catch (err) {
      processSafetyBotError(
        err,
        "",
        "",
        userAadObjId,
        "error in /areyousafetabhandler/getIncDataToCopyInc incId=" + incId,
      );
    }
  });

  app.post("/areyousafetabhandler/processError", async (req, res) => {
    try {
      const reqBody = req.body;
      const tabObj = new tab.AreYouSafeTab();
      await tabObj.processError(reqBody);
    } catch (err) {
      console.log(err);
    }
  });

  app.get("/areyousafetabhandler/getSafetyCheckProgress", (req, res) => {
    const { incid, incType, teamId, userAadObjId } = req.query;

    try {
      incidentService
        .getSafetyCheckProgress(incid, incType, teamId, userAadObjId)
        .then((progress) => {
          progress.respIncId = incid;
          res.send(progress);
        })
        .catch((err) => {
          console.log(err);
          processSafetyBotError(
            err,
            teamId,
            "",
            userAadObjId,
            "error in /areyousafetabhandler/getSafetyCheckProgress incid=" +
              incid +
              " incType=" +
              incType,
          );
          res.send(0);
        });
    } catch (err) {
      processSafetyBotError(
        err,
        teamId,
        "",
        userAadObjId,
        "error in /areyousafetabhandler/getSafetyCheckProgress incid=" +
          incid +
          " incType=" +
          incType,
      );
      res.send(0);
    }
  });

  app.get("/areyousafetabhandler/getNAReapSelectedTeams", (req, res) => {
    const { teamId, userAadObjId } = req.query;

    try {
      incidentService
        .getNAReapSelectedTeams(teamId, userAadObjId)
        .then((data) => {
          res.send(data);
        })
        .catch((err) => {
          console.log(err);
          processSafetyBotError(
            err,
            teamId,
            "",
            userAadObjId,
            "error in /areyousafetabhandler/getNAReapSelectedTeams then",
          );
          res.send(0);
        });
    } catch (err) {
      processSafetyBotError(
        err,
        teamId,
        "",
        userAadObjId,
        "error in /areyousafetabhandler/getNAReapSelectedTeams",
      );
      res.send(0);
    }
  });

  app.get("/areyousafetabhandler/getMemberInfo", (req, res) => {
    const { teamId, serviceUrl, teamUserId, userAadObjId } = req.query;

    try {
      getConversationMembers(teamId, serviceUrl, teamUserId, userAadObjId)
        .then((data) => {
          res.send(data);
        })
        .catch((err) => {
          console.log(err);
          processSafetyBotError(
            err,
            teamId,
            "",
            userAadObjId,
            "error in areyousafetabhandler/getMemberInfo serviceUrl=" +
              serviceUrl +
              " teamUserId=" +
              teamUserId,
          );
          res.send(0);
        });
    } catch (err) {
      processSafetyBotError(
        err,
        "",
        "",
        userAadObjId,
        "error in areyousafetabhandler/getMemberInfo serviceUrl=" +
          serviceUrl +
          " teamUserId=" +
          teamUserId,
      );
      res.send(0);
    }
  });

  app.post("/areyousafetabhandler/updateSafetyCheckStatus", (req, res) => {
    const {
      respId,
      isRecurring,
      isSafe,
      userAadObjId,
      respTimestamp,
      adminName,
      resuserid,
      resusername,
      incType,
    } = req.query;
    try {
      incidentService
        .updateSafetyCheckStatus(
          respId,
          isRecurring === "true",
          isSafe,
          respTimestamp,
          adminName,
          userAadObjId,
          resuserid,
          resusername,
          incType,
        )
        .then((data) => {
          if (data) {
            res.send("true");
          } else {
            res.send("false");
          }
        })
        .catch((err) => {
          console.log(err);
          processSafetyBotError(
            err,
            "",
            "",
            userAadObjId,
            "error in /areyousafetabhandler/updateSafetyCheckStatus",
          );
          res.send("false");
        });
    } catch (err) {
      processSafetyBotError(
        err,
        "",
        "",
        userAadObjId,
        "error in /areyousafetabhandler/updateSafetyCheckStatus",
      );
      res.send("false");
    }
  });

  app.post(
    "/areyousafetabhandler/trackSafetyCheckResponse/",
    async (req, res) => {
      const { incId, teamId, userAadObjId, responseOption, comment } =
        req.body ?? {};

      try {
        const parsedIncId = Number(incId);
        if (!Number.isFinite(parsedIncId) || parsedIncId <= 0) {
          return res.send({ success: false, error: "Invalid incId" });
        }
        if (!userAadObjId || typeof userAadObjId !== "string") {
          return res.send({ success: false, error: "Missing userAadObjId" });
        }

        // Map UI text to the existing DB convention:
        // response=1 (responded), response_value=1 (safe) or 2 (need assistance)
        const raw = (responseOption ?? "").toString().trim();
        const lower = raw.toLowerCase();
        let responseValue = Number.parseInt(raw, 10);
        if (!Number.isFinite(responseValue)) {
          responseValue = null;
        }
        if (responseValue == null) {
          if (lower === "i am safe" || lower === "i_am_safe") responseValue = 1;
          else if (lower === "i need assistance" || lower === "need_assistance")
            responseValue = 2;
        }

        if (responseValue !== 1 && responseValue !== 2) {
          return res.send({
            success: false,
            error: "Invalid responseOption",
          });
        }

        const respTimestamp = formatedDate("yyyy-MM-dd hh:mm:ss", new Date());

        const pool = await poolPromise;
        const sql = require("mssql");

        let query = "";

        // ✅ CASE 2: USER_AAD_OBJ_ID

        query = `
      UPDATE MSTeamsMemberResponses SET response = 1 , response_value = ${responseValue}, timestamp = '${respTimestamp}', response_via = 'Teams',comment = '${comment ?? ""}' WHERE inc_id = ${incId} AND user_id in (select  top 1 user_id from MSTeamsTeamsUsers where user_aadobject_id= '${userAadObjId}')


      `;

        const request = pool.request();
        const result = await request.query(query);
        return res.send({ success: true });
      } catch (err) {
        console.log(err);
        processSafetyBotError(
          err,
          teamId ?? "",
          "",
          userAadObjId ?? "",
          "error in /areyousafetabhandler/trackSafetyCheckResponse incId=" +
            incId,
        );
        return res.send({
          success: false,
          error: err?.message || "Failed to track response",
        });
      }
    },
  );

  app.get("/areyousafetabhandler/getEmergencyContactUsers", (req, res) => {
    console.log("came in request");

    const userAadObjId = req.query.userId;
    const TeamId = req.query.teamid;

    try {
      incidentService
        .getAdminsOrEmergencyContacts(userAadObjId, TeamId)
        .then(async (adminData) => {
          if (
            adminData === null ||
            (Array.isArray(adminData) && adminData.length === 0)
          ) {
            res.send(null);

            return;
          }

          res.send(adminData);
        })

        .catch((err) => {
          console.log(err);
          processSafetyBotError(
            err,
            TeamId,
            "",
            userAadObjId,
            "error in /areyousafetabhandler/getEmergencyContactUsers",
          );

          res.send(null);
        });
    } catch (err) {
      processSafetyBotError(
        err,
        "",
        "",
        userAadObjId,
        "error in /areyousafetabhandler/getEmergencyContactUsers",
      );
    }
  });
  app.get("/areyousafetabhandler/getAdminList", (req, res) => {
    console.log("came in request");

    const userAadObjId = req.query.userId;
    const TeamId = req.query.teamid;

    try {
      incidentService

        .getAdmins(userAadObjId, TeamId)

        .then(async (adminData) => {
          if (
            adminData === null ||
            (Array.isArray(adminData) && adminData.length === 0)
          ) {
            res.send(null);

            return;
          }

          res.send(adminData);
        })

        .catch((err) => {
          console.log(err);

          processSafetyBotError(
            err,
            TeamId,
            "",
            userAadObjId,
            "error in /areyousafetabhandler/getAdminList",
          );

          res.send(null);
        });
    } catch (err) {
      processSafetyBotError(
        err,
        "",
        "",
        userAadObjId,
        "error in /areyousafetabhandler/getAdminList",
      );
    }
  });
  const Phonescope =
    "User.Read email openid profile offline_access User.ReadBasic.All User.Read.All";
  // app.get("/areyousafetabhandler/AdminConsentInfo", async (req, res) => {
  //   const SSOCode = req.query.code || "";
  //   var details = req.query.state?.toString();
  //   const Tdata = details?.split("$$$");
  //   let field = Tdata?.[1];
  //   const teamId = Tdata?.[0];
  //   console.log({ AdminconsentinfoteamId: teamId });
  //   var Tscope =
  //     "User.Read email openid profile offline_access User.ReadBasic.All User.Read.All";
  //   //log("Got the resposne in AdminConsentInfo", { query: req.query });
  //   const aadTokenEndPoint =
  //     "https://login.microsoftonline.com/common/oauth2/v2.0/token";
  //   if (SSOCode == "") {
  //     res.json("No authentication.");
  //     return;
  //   } else {
  //     const oAuthOBOParams = {
  //       grant_type: "authorization_code",
  //       client_Id: process.env.MicrosoftAppId,
  //       client_secret: process.env.MicrosoftAppPassword,
  //       // client_Id: client_id,
  //       // client_secret: client_secret,
  //       code: SSOCode,
  //       scope: Tscope,
  //       redirect_uri: `${process.env.serviceUrl}/areyousafetabhandler/AdminConsentInfo`,
  //     };

  //     const oAuthOboRequest = Object.keys(oAuthOBOParams)
  //       .map(
  //         (key, index) => `${key}=${encodeURIComponent(oAuthOBOParams[key])}`
  //       )
  //       .join("&");

  //     const HEADERS = {
  //       "content-type": "application/x-www-form-urlencoded",
  //     };

  //     try {
  //       const response = await axios.post(aadTokenEndPoint, oAuthOboRequest, {
  //         headers: HEADERS,
  //         // timeout: 10000,
  //       });
  //       if (response.status === 200) {
  //         const refreshToken = response.data.refresh_token
  //           ? response.data.refresh_token
  //           : "";
  //         // log({ refreshToken });
  //         // log(teamId);
  //         field =
  //           field.toLowerCase() == "whatsapp"
  //             ? "send_whatsapp"
  //             : field.toLowerCase() == "filter"
  //             ? "FILTER_ENABLED"
  //             : "send_sms";
  //         let config = {
  //           method: "post",
  //           maxBodyLength: Infinity,
  //           url: `${process.env.serviceUrl}/areyousafetabhandler/setRefreshToken?teamId=${teamId}&refresh_token=${refreshToken}&field=${field}`,
  //           // timeout: 10000,
  //         };
  //         axios
  //           .request(config)

  //           .then((response) => {
  //             const msg = `<div style="text-align: center;margin-left: 25%;background: white;padding: 30px;margin: auto;vertical-align: middle;position: absolute;top: 50%;right: 0px;bottom: 50%;left: 0px;display: inline-table;font-family: &quot;Montserrat&quot;, sans-serif;"><h1 style=" margin-bottom: 20px;font-weight: 700;font-family: &quot;Montserrat&quot;, sans-serif;font-size: 70px;">Safety Check</h1><div style="vertical-align:middle; text-align:center; box-shadow:none;padding:0px"><img src="https://areyousafe.in/img/SafetyBot%20Icon.png" style=" width: 150px;"></div><h3 style="margin-bottom: 5px;font-size: 31px;">Thank you for granting permission(s)</h3> <label style="font-family: &quot;Montserrat&quot;, sans-serif;font-weight: 700;display: inline-block;padding: 10px 20px;border-radius: 4px;color: #fff;color: #5783db;text-decoration: none;font-size: 21px;">Go back to Teams and reload the Safety check tab</label></div>`;
  //             res.status(200).send(msg);
  //           })
  //           .catch((error) => {
  //             console.log({ "Error in Saving refresh token": error });
  //             processSafetyBotError(
  //               error,
  //               teamId,
  //               "",
  //               "",
  //               "Error in Saving refresh token, isRefershTokenBlank: " +
  //                 (refreshToken ? "true" : "false")
  //             );
  //           });
  //       } else {
  //         if (
  //           response.data.error === "invalid_grant" ||
  //           response.data.error === "interaction_required" ||
  //           response.data.error == "insufficient_claims"
  //         ) {
  //           res.status(403).json({ error: "consent_required" });
  //         } else {
  //           res.status(500).json({ error: "Could not exchange access token" });
  //         }
  //       }
  //     } catch (error) {
  //       console.log({ "Calling the Axios": JSON.stringify(error) });
  //       processSafetyBotError(
  //         error,
  //         teamId,
  //         "",
  //         "",
  //         "Error in processing grant permission in adminconsentinfo"
  //       );
  //       //log({ error: `unknown error ${error}` });
  //       res.status(400).json({ error: `unknown error ${error}` });
  //     }
  //   }
  // });
  app.get("/areyousafetabhandler/AllAdminConsentInfo", async (req, res) => {
    var details = req.query.state?.toString();
    const Tdata = details?.split("$$$");
    let field = Tdata?.[1];
    const teamId = Tdata?.[0];
    const tenantid = req.query.tenant;
    let IsAppPermissionGranted = req.query.admin_consent;
    const axios = require("axios");
    if (IsAppPermissionGranted) {
      field =
        field.toLowerCase() == "whatsapp"
          ? "send_whatsapp"
          : field.toLowerCase() == "filter"
            ? "FILTER_ENABLED"
            : field.toLowerCase() == "null"
              ? "null"
              : "send_sms";
      let config = {
        method: "post",
        maxBodyLength: Infinity,
        url: `${process.env.serviceUrl}/areyousafetabhandler/saveAppPermission?teamId=${teamId}&tenantid=${tenantid}&IsAppPermissionGranted=${IsAppPermissionGranted}&field=${field}`,
        // timeout: 10000,
      };
      axios
        .request(config)

        .then((response) => {
          const msg = `<div style="text-align: center;margin-left: 25%;background: white;padding: 30px;margin: auto;vertical-align: middle;position: absolute;top: 50%;right: 0px;bottom: 50%;left: 0px;display: inline-table;font-family: &quot;Montserrat&quot;, sans-serif;"><h1 style=" margin-bottom: 20px;font-weight: 700;font-family: &quot;Montserrat&quot;, sans-serif;font-size: 70px;">Safety Check</h1><div style="vertical-align:middle; text-align:center; box-shadow:none;padding:0px"><img src="https://areyousafe.in/img/SafetyBot%20Icon.png" style=" width: 150px;"></div><h3 style="margin-bottom: 5px;font-size: 31px;">Thank you for granting permission(s)</h3> <label style="font-family: &quot;Montserrat&quot;, sans-serif;font-weight: 700;display: inline-block;padding: 10px 20px;border-radius: 4px;color: #fff;color: #5783db;text-decoration: none;font-size: 21px;">Go back to Teams and reload the Safety check tab</label></div>`;
          res.status(200).send(msg);
        })
        .catch((error) => {
          // console.log({
          //   "Error in Saving AllAdminConsentInfo_IsAppPermissionGranted": error,
          // });
          processBotError(
            error,
            teamId,
            "",
            "",
            "Error in Saving AllAdminConsentInfo_IsAppPermissionGranted: " +
              IsAppPermissionGranted,
          );
        });
    }
  });
  app.get("/posresp", async (req, res) => {
    try {
      console.log("Inside /posresp:", req.query);
      const isfromemail = req?.query?.isfrom ? true : false;
      const userAgent = req.headers["user-agent"] || "";
      const acceptHeader = req.headers["accept"] || "";
      console.log("User-Agent:", userAgent);
      console.log("Accept Header:", acceptHeader);

      // --- 1. Known bot / crawler user agents ---
      const botAgents = [
        "Google-PageRenderer",
        "Google (+https://developers.google.com/+/web/snippet/)",
        "Slackbot-LinkExpanding",
        "Discordbot",
        "TelegramBot",
        "WhatsApp",
        "Twitterbot",
      ];

      if (botAgents.some((agent) => userAgent.includes(agent))) {
        console.log("Ignored known bot/crawler:", userAgent);
        return res.status(204).end();
      }

      // --- 2. Android prefetch / preview detection ---
      if (
        req.method === "HEAD" ||
        !acceptHeader.includes("text/html") ||
        userAgent.includes("okhttp") || // Android system prefetch
        userAgent.includes("wv") || // Android WebView
        userAgent.includes("WhatsApp") // WhatsApp preview
      ) {
        console.log("Ignored Android preview/prefetch:", userAgent);
        return res.status(204).end();
      }

      // --- 4. Process actual SMS link click ---
      const { userId, eventId } = req.query;
      if (!userId || !eventId) {
        console.log("Missing userId or eventId in query");
        return res.status(400).send("Missing required parameters");
      }

      console.log("Processing real click for SMS:", { userId, eventId });

      await bot.proccessSMSLinkClick(
        userId,
        eventId,
        "YES",
        isfromemail ? "Email" : "SMS",
      );

      bot.SaveSmsLog(
        userId,
        "LINK_CLICKED",
        "YES",
        JSON.stringify({ eventId, userId }),
        null,
        null,
        eventId,
      );

      incidentService.saveAllTypeQuerylogs(
        userId,
        "",
        isfromemail ? "Email" : "SMS",
        "",
        eventId,
        "LINK_CLICKED",
        "",
        "",
        "",
        "YES",
        "",
      );

      // --- 5. Redirect to confirmation page ---
      const redirectUrl = `${
        process.env.SMS_CONFIRMATION_URL
      }?userId=${userId}&eventId=${eventId}&isfrom=${
        isfromemail ? "Email" : "SMS"
      }`;
      console.log("Redirecting user to:", redirectUrl);
      return res.redirect(redirectUrl);
    } catch (err) {
      console.error("Error in /posresp:", err);
      return res.status(500).send("Internal Server Error");
    }
  });
  app.get("/IncDetails", async (req, res) => {
    try {
      console.log("Inside /IncDetails:", req.query);
      let eventid = req.query.eventId;

      const query = `
      SELECT 
        I.*,
        T.team_name
      FROM MSTeamsIncidents AS I
      LEFT JOIN MSTeamsInstallationDetails AS T
        ON I.team_id = T.team_id
      WHERE I.id = ${eventid}
    `;

      const result = await db.getDataFromDB(query);
      const incdata = result[0];

      if (!incdata) {
        return res.status(404).send("No record found");
      }

      // ✅ Send the complete HTML (with Tailwind and render script)
      const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Incident Notifications</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body {
      font-family: 'Inter', sans-serif;
    }
    .notification-card {
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
      border: 1px solid #f8f9fa;
    }
  </style>
</head>
<body class="bg-gray-100 flex flex-col items-center min-h-screen py-8 px-4">
  

  <main class="w-full max-w-lg" id="messageContainer"></main>

  <script>
    function renderNotification(incdata) {
      const createdDate = new Date(incdata.created_date);
      const formattedDate = createdDate.toLocaleString("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      });

      let cardHTML = "";

      switch (incdata.inc_type_id) {
        case 4:
          cardHTML = \`
            <section class="notification-card bg-white rounded-xl mb-8">
              <header class="p-5 border-b border-gray-100">
                <div class="flex items-center space-x-3 mb-2">
                  <span class="text-3xl text-orange-600">🧭</span>
                  <h2 class="text-xl font-bold text-gray-800">Travel Advisory</h2>
                </div>
                <p class="text-sm text-gray-500">
                  This message was issued by <span class="text-orange-600 font-semibold">\${incdata.CREATED_BY_NAME }</span>.
                </p>
              </header>

              <div class="p-5 space-y-6">
                <div>
                  <p class="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">Travel Advisory</p>
                  <p class="text-lg font-medium text-gray-900">\${incdata.inc_name}</p>
                </div>

                <div class="pt-5 border-t border-gray-100">
                  <p class="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">Travel Update</p>
                  <p class="text-base text-gray-700">\${incdata.travelUpdate || ''}</p>
                </div>

                <div class="p-3 bg-yellow-50 border-l-4 border-yellow-500 rounded-md">
                  <p class="text-xs font-semibold uppercase tracking-wider text-yellow-800 mb-1">Guidance</p>
                  <p class="text-sm text-yellow-700">\${incdata.guidance || ''}</p>
                </div>

                <div class="pt-5 border-t border-gray-100">
                  <p class="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">Contact Information</p>
                  <p class="text-sm text-gray-700">\${incdata.contactInfo || ''}</p>
                </div>
              </div>

              <footer class="bg-gray-50 p-3 border-t border-gray-200 text-center">
                <p class="text-xs text-gray-500 italic">
                  Sent on \${formattedDate} by <span class="text-orange-600 font-medium">\${incdata.CREATED_BY_NAME }</span>
                </p>
              </footer>
            </section>\`;
          break;

        case 2:
          cardHTML = \`
            <section class="notification-card bg-white rounded-xl mb-8">
              <header class="p-5 border-b border-gray-100">
                <div class="flex items-center space-x-3 mb-2">
                  <span class="text-3xl text-red-600">⚠️</span>
                  <h2 class="text-xl font-bold text-gray-800">Safety Alert</h2>
                </div>
                <p class="text-sm text-gray-500">
                  This message was issued by <span class="text-red-600 font-semibold">\${incdata.CREATED_BY_NAME }</span>.
                </p>
              </header>

              <div class="p-5 space-y-6">
                <div>
                  <p class="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">Title</p>
                  <p class="text-lg font-medium text-gray-900">\${incdata.inc_name}</p>
                </div>

                <div class="pt-5 border-t border-gray-100 p-3 bg-red-50 border-l-4 border-red-500 rounded-md">
                  <p class="text-xs font-semibold uppercase tracking-wider text-red-800 mb-1">Guidance</p>
                  <p class="text-sm text-red-700 font-medium">\${incdata.guidance}</p>
                </div>
              </div>

              <footer class="bg-gray-50 p-3 border-t border-gray-200 text-center">
                <p class="text-xs text-gray-500 italic">
                  Sent on \${formattedDate} by <span class="text-red-600 font-medium">\${incdata.CREATED_BY_NAME }</span>
                </p>
              </footer>
            </section>\`;
          break;

        case 3:
          cardHTML = \`
            <section class="notification-card bg-white rounded-xl mb-8">
              <header class="p-5 border-b border-gray-100">
                <div class="flex items-center space-x-3 mb-2">
                  <span class="text-3xl text-indigo-600">ℹ️</span>
                  <h2 class="text-xl font-bold text-gray-800">Important Bulletin</h2>
                </div>
                <p class="text-sm text-gray-500">
                  This message was issued by <span class="text-indigo-600 font-semibold">\${incdata.CREATED_BY_NAME }</span>.
                </p>
              </header>

              <div class="p-5 space-y-6">
                <div>
                  <p class="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">Title</p>
                  <p class="text-lg font-medium text-gray-900">\${incdata.inc_name}</p>
                </div>

                <div class="pt-5 border-t border-gray-100">
                  <p class="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">Guidance</p>
                  <p class="text-base text-gray-700">\${incdata.guidance}</p>
                </div>

                <div class="pt-5 border-t border-gray-100 p-3 bg-indigo-50 border-l-4 border-indigo-500 rounded-md">
                  <p class="text-xs font-semibold uppercase tracking-wider text-indigo-800 mb-1">Additional Information</p>
                  <p class="text-sm text-indigo-700">\${incdata.additionalInfo}</p>
                </div>
              </div>

              <footer class="bg-gray-50 p-3 border-t border-gray-200 text-center">
                <p class="text-xs text-gray-500 italic">
                  Sent on \${formattedDate} by <span class="text-indigo-600 font-medium">\${incdata.CREATED_BY_NAME }</span>
                </p>
              </footer>
            </section>\`;
          break;

        case 5:
          cardHTML = \`
            <section class="notification-card bg-white rounded-xl mb-8">
              <header class="p-5 border-b border-gray-100">
                <div class="flex items-center space-x-3 mb-2">
                  <span class="text-3xl text-teal-600">📨</span>
                  <h2 class="text-xl font-bold text-gray-800">Stakeholder Notice</h2>
                </div>
                <p class="text-sm text-gray-500">
                  This message was issued by <span class="text-teal-600 font-semibold">\${incdata.CREATED_BY_NAME }</span>.
                </p>
              </header>

              <div class="p-5 space-y-6">
                <div>
                  <p class="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">Title</p>
                  <p class="text-lg font-medium text-gray-900">\${incdata.inc_name}</p>
                </div>

                <div class="pt-5 border-t border-gray-100">
                  <p class="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">Situation</p>
                  <p class="text-base text-gray-700">\${incdata.situation || ''}</p>
                </div>

                <div class="pt-5 border-t border-gray-100">
                  <p class="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">Additional Information</p>
                  <p class="text-base text-gray-700">\${incdata.additionalInfo || ''}</p>
                </div>
              </div>

              <footer class="bg-gray-50 p-3 border-t border-gray-200 text-center">
                <p class="text-xs text-gray-500 italic">
                  Sent on \${formattedDate} by <span class="text-teal-600 font-medium">\${incdata.CREATED_BY_NAME }</span>
                </p>
              </footer>
            </section>\`;
          break;
      }

      document.getElementById("messageContainer").innerHTML = cardHTML;
    }

    const incdata = ${JSON.stringify(incdata)};
    renderNotification(incdata);
  </script>
</body>
</html>
`;

      res.setHeader("Content-Type", "text/html");
      res.status(200).send(html);
    } catch (err) {
      console.error("Error in /IncDetails:", err);
      res.status(500).send("Internal Server Error");
    }
  });

  app.get("/negresp", async (req, res) => {
    try {
      console.log("Inside /negresp:", req.query);
      const isfromemail = req?.query?.isfrom ? true : false;
      const userAgent = req.headers["user-agent"] || "";
      const acceptHeader = req.headers["accept"] || "";
      console.log("User-Agent:", userAgent);
      console.log("Accept Header:", acceptHeader);

      // --- 1. Known bot/crawler agents ---
      const botAgents = [
        "Google-PageRenderer",
        "Google (+https://developers.google.com/+/web/snippet/)",
        "Slackbot-LinkExpanding",
        "Discordbot",
        "TelegramBot",
        "WhatsApp",
        "Twitterbot",
      ];

      if (botAgents.some((agent) => userAgent.includes(agent))) {
        console.log("Ignored known bot/crawler:", userAgent);
        return res.status(204).end(); // No Content
      }

      // --- 2. Android prefetch / preview detection ---
      if (
        req.method === "HEAD" ||
        !acceptHeader.includes("text/html") ||
        userAgent.includes("okhttp") || // Android system fetch
        userAgent.includes("wv") || // Android WebView
        userAgent.includes("WhatsApp") // WhatsApp preview
      ) {
        console.log("Ignored Android preview/prefetch:", userAgent);
        return res.status(204).end();
      }

      // --- 4. Process actual click ---
      const { userId, eventId } = req.query;
      if (!userId || !eventId) {
        console.log("Missing userId or eventId in query");
        return res.status(400).send("Missing required parameters");
      }

      console.log("Processing real click for SMS:", { userId, eventId });

      await bot.proccessSMSLinkClick(
        userId,
        eventId,
        "NO",
        isfromemail ? "Email" : "SMS",
      );

      bot.SaveSmsLog(
        userId,
        "LINK_CLICKED",
        "NO",
        JSON.stringify({ eventId, userId }),
        null,
        null,
        eventId,
      );

      incidentService.saveAllTypeQuerylogs(
        userId,
        "",
        isfromemail ? "Email" : "SMS",
        "",
        eventId,
        "LINK_CLICKED",
        "",
        "",
        "",
        "NO",
        "",
      );

      // --- 5. Redirect to confirmation page ---
      const redirectUrl = `${
        process.env.SMS_CONFIRMATION_URL
      }?userId=${userId}&eventId=${eventId}&isfrom=${
        isfromemail ? "Email" : "SMS"
      }`;
      console.log("Redirecting user to:", redirectUrl);
      return res.redirect(redirectUrl);
    } catch (err) {
      console.error("Error in /negresp:", err);
      return res.status(500).send("Internal Server Error");
    }
  });

  app.post("/smscomment", async (req, res) => {
    console.log("got reply for sms comment", req.body);
    let { userId, eventId, comments, isfrom } = req.body;
    const isfromemail = isfrom ? true : false;
    console.log({ userId, eventId, comments });
    await bot.processCommentViaLink(userId, eventId, comments);

    incidentService.saveAllTypeQuerylogs(
      userId,
      "",
      isfromemail ? "Email" : "SMS",
      "",
      eventId,
      "SMS_COMMENT",
      "",
      "",
      "",
      `${comments}`,
      "",
    );
    res.status(200);
  });
  app.post("/handleWhatsappResponse", async (req, res) => {
    const body = req.body;
    const message = req.body.message;
    const from = message.from; // user's WhatsApp number
    const type = message.type;

    // Handle button replies
    if (type === "button") {
      const buttonPayload = message.button.payload;
      console.log(`User ${from} clicked: ${buttonPayload}`);

      // Check if this is an SOS accept button
      if (buttonPayload && buttonPayload.startsWith("ACCEPT_SOS_")) {
        const payloadParts = buttonPayload.split("_");
        if (payloadParts.length >= 4) {
          const adminId = payloadParts[2];
          const requestAssistanceid = payloadParts[3];
          // Redirect to WhatsApp accept SOS endpoint
          const baseUrl =
            process.env.BASE_URL ||
            process.env.serviceUrl?.replace("/api/messages", "") ||
            "http://localhost:3978";
          const acceptUrl = `${baseUrl}/whatsappAcceptSOS?id=${requestAssistanceid}&adminId=${adminId}&phone=${from}`;
          console.log(`Redirecting WhatsApp SOS accept to: ${acceptUrl}`);
          // Process the acceptance (we'll handle this in the endpoint)
          // For now, we'll process it directly here or redirect
          try {
            // Make internal call to process the acceptance
            const axios = require("axios");
            await axios.get(acceptUrl).catch((err) => {
              console.log("Error calling whatsappAcceptSOS:", err.message);
            });
          } catch (err) {
            console.log("Error processing WhatsApp SOS accept:", err);
          }
        }
      } else {
        // Handle other button payloads (existing logic)
        let response = buttonPayload.split("_");
        if (response.length > 2) {
          let userId = response[1];
          let incId = response[2];
          let resp = response[0];
          let runat = response[3] || null;
          await bot.proccessWhatsappClick(
            userId,
            incId,
            resp.toUpperCase(),
            from,
            runat,
          );
        }
      }
    } else if (type == "interactive") {
      const interactiveType = message.interactive.type;
      if (interactiveType === "list_reply") {
        const buttonPayload = message.interactive.list_reply.id;
        console.log(`User ${from} clicked: ${buttonPayload}`);
        let response = buttonPayload.split("_");
        if (response.length > 2) {
          let userId = response[1];
          let incId = response[2];
          let resp = response[0];
          let runat = response[3] || null;
          await bot.proccessWhatsappClick(
            userId,
            incId,
            resp.toUpperCase(),
            from,
            runat,
          );
        }
      }
    } else if (type === "text") {
      console.log(`User ${from} sent message: ${message.text.body}`);
    }
    res.sendStatus(200);
  });
  app.post("/whatsapp", async (req, res) => {
    const body = req.body;

    console.log("Incoming Webhook:", JSON.stringify(body, null, 2));
    if (body.object) {
      if (
        body.entry &&
        body.entry[0].changes &&
        body.entry[0].changes[0].value.messages
      ) {
        const message = body.entry[0].changes[0].value.messages[0];
        const from = message.from; // user's WhatsApp number
        const type = message.type;

        // Handle button replies
        if (type === "button") {
          const buttonPayload = message.button.payload;
          console.log(`User ${from} clicked: ${buttonPayload}`);

          // Check if this is an SOS accept button
          if (buttonPayload && buttonPayload.startsWith("ACCEPT_SOS_")) {
            const payloadParts = buttonPayload.split("_");
            if (payloadParts.length >= 4) {
              const adminId = payloadParts[2];
              const requestAssistanceid = payloadParts[3];
              // Redirect to WhatsApp accept SOS endpoint
              const baseUrl =
                process.env.BASE_URL ||
                process.env.serviceUrl?.replace("/api/messages", "") ||
                "http://localhost:3978";
              const acceptUrl = `${baseUrl}/whatsappAcceptSOS?id=${requestAssistanceid}&adminId=${adminId}&phone=${from}`;
              console.log(`Redirecting WhatsApp SOS accept to: ${acceptUrl}`);
              // Process the acceptance (we'll handle this in the endpoint)
              try {
                // Make internal call to process the acceptance
                await axios.get(acceptUrl).catch((err) => {
                  console.log("Error calling whatsappAcceptSOS:", err.message);
                });
              } catch (err) {
                console.log("Error processing WhatsApp SOS accept:", err);
              }
            }
          } else {
            // Handle other button payloads (existing logic)
            let response = buttonPayload.split("_");
            if (response.length > 2) {
              let userId = response[1];
              let incId = response[2];
              let resp = response[0];
              let runat = response[3] || null;
              await bot.proccessWhatsappClick(
                userId,
                incId,
                resp.toUpperCase(),
                from,
                runat,
              );
            }
          }
        } else if (type == "interactive") {
          const interactiveType = message.interactive.type;
          if (interactiveType === "list_reply") {
            const buttonPayload = message.interactive.list_reply.id;
            console.log(`User ${from} clicked: ${buttonPayload}`);
            let response = buttonPayload.split("_");
            if (response.length > 2) {
              let userId = response[1];
              let incId = response[2];
              let resp = response[0];
              await bot.proccessWhatsappClick(
                userId,
                incId,
                resp.toUpperCase(),
                from,
              );
            }
          }
        } else if (type === "text") {
          console.log(`User ${from} sent message: ${message.text.body}`);
        }
      }

      res.sendStatus(200);
    } else {
      res.sendStatus(404);
    }
  });
  app.get("/whatsapp", async (req, res) => {
    const verifyToken = "areyousafewhatsapptoken"; // same as set in Meta Dashboard

    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === verifyToken) {
      console.log("WEBHOOK_VERIFIED");
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  });

  // Add Message Activity Log endpoint
  app.get("/areyousafetabhandler/getMessageActivityLog", async (req, res) => {
    try {
      const { incId, userAadObjId } = req.query;

      console.log(
        "getMessageActivityLog called with incId:",
        incId,
        "userAadObjId:",
        userAadObjId,
      );
      const parsedIncId = parseInt(incId);
      if (!parsedIncId || !incId || !userAadObjId) {
        return res.status(400).json({ error: "Missing required parameters" });
      }

      // SQL query to get MessageActivityLog data using the view
      const query = `
        SELECT *
        FROM vw_MessageActivityLogWithUser
        WHERE IncidentId = @incId
        ORDER BY MessageSendDateTime DESC
      `;

      // Use mssql to specify type
      const sql = require("mssql");
      const pool = await poolPromise;
      const result = await pool
        .request()
        .input("incId", sql.Int, parsedIncId)
        .query(query);

      console.log("MessageActivityLog DB result:", result.recordset);
      res.json(result.recordset || []);
    } catch (error) {
      console.error("Error fetching MessageActivityLog:", error);
      processSafetyBotError(
        error,
        "",
        "",
        req.query.userAadObjId,
        "Error in /areyousafetabhandler/getMessageActivityLog",
      );
      res.status(500).json({ error: "Failed to fetch message activity log" });
    }
  });

  app.get("/areyousafetabhandler/getHistory", async (req, res) => {
    try {
      const { incidentId } = req.query;
      const parsedIncidentId = parseInt(incidentId, 10);
      if (!incidentId || !Number.isFinite(parsedIncidentId)) {
        return res.status(400).json({ error: "Missing required parameters" });
      }

      const query = `
DECLARE @IncidentIdParam VARCHAR(50) = @incidentId ;
 
SELECT
    ACL.*,  
    AST.requested_date,
    AST.closed_at,
    AST.closed_by_user,
    AST.FIRST_RESPONDER_RESPONDED_AT,
    AST.FIRST_RESPONDER,
    AST.comments,
    AST.comment_date,
    AST.status,
    TU.user_name
 
FROM [dbo].[MessageActivityLog] ACL
 
LEFT JOIN [dbo].[MSTeamsAssistance] AST
    ON AST.id = ACL.IncidentId
 
LEFT JOIN [dbo].[MSTeamsTeamsUsers] TU
    ON TU.user_aadobject_id = ACL.UserId
 
WHERE
    TRY_CAST(@IncidentIdParam AS INT) IS NOT NULL
    AND ACL.IncidentId = TRY_CAST(@IncidentIdParam AS varchar)and MessageSentVia!='SOS_RESPONSE_EMAIL'
 
ORDER BY ACL.EventDateTime DESC;
`;
      const pool = await poolPromise;
      const result = await pool
        .request()
        .input("incidentId", sql.Int, parsedIncidentId)
        .query(query);

      res.json(result.recordset || []);
    } catch (error) {
      console.error("Error fetching History:", error);
      processSafetyBotError(
        error,
        "",
        "",
        req.query.userAadObjId,
        "Error in /areyousafetabhandler/getHistory",
      );
      res.status(500).json({ error: "Failed to fetch history" });
    }
  });

  app.get("/areyousafetabhandler/getSOSLog", async (req, res) => {
    const userAadObjId = req.query.userAadObjId;
    const teamId = req.query.teamId;

    console.log(
      "getSOSLog called with teamId:",
      teamId,
      "userAadObjId:",
      userAadObjId,
    );

    try {
      incidentService
        .getAllUserAssistanceData(userAadObjId, teamId)
        .then((sosData) => {
          console.log("SOSLog data retrieved successfully");
          res.send(sosData);
        })
        .catch((err) => {
          console.log(err);
          processSafetyBotError(
            err,
            "",
            "",
            userAadObjId,
            "error in /areyousafetabhandler/getSOSLog -> then",
          );
          res.status(500).json({ error: "Failed to fetch SOS log" });
        });
    } catch (error) {
      console.error("Error fetching SOSLog:", error);
      processSafetyBotError(
        error,
        "",
        "",
        userAadObjId,
        "Error in /areyousafetabhandler/getSOSLog",
      );
      res.status(500).json({ error: "Failed to fetch SOS log" });
    }
  });
  app.get("/areyousafetabhandler/weatheradvisorywebhook", async (req, res) => {
    console.log({ weatheradvisorywebhook: req, res });
  });

  const travelSelectedDb = require("./travelServices/travel-advisory-selected-db");
  const travelAdvisory = require("./travelServices/travel-advisory-feed");
  app.get("/areyousafetabhandler/getCountries", async (req, res) => {
    try {
      const countries = await travelSelectedDb.getAllCountriesFromDb();
      res.json({ success: true, data: countries });
    } catch (err) {
      //  processSafetyBotError(err, "", "", "", "getCountries");
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get(
    "/areyousafetabhandler/getTravelAdvisoryByTeam/",
    async (req, res) => {
      try {
        const teamId = req.query.teamId || (req.body && req.body.teamId) || "";
        const AdvisoryType =
          req.query.advisoryType || (req.body && req.body.advisoryType) || "";
        const tenantId =
          req.query.tenantId || (req.body && req.body.tenantId) || "";
        const data = await travelSelectedDb.getTravelAdvisoryByTeamData(
          tenantId ? "" : teamId,
          tenantId || undefined,
          AdvisoryType || "",
        );

        res.json({ success: true, data });
      } catch (err) {
        console.error(
          "Error in /areyousafetabhandler/getTravelAdvisoryByTeam:",
          err,
        );
        res
          .status(500)
          .json({ success: false, error: err.message, data: null });
      }
    },
  );

  app.get(
    "/areyousafetabhandler/getTravelAdvisorySelection/",
    async (req, res) => {
      try {
        const tenantId =
          req.query.tenantId || (req.body && req.body.tenantId) || "";
        if (!tenantId) {
          return res.status(400).json({
            success: false,
            error: "tenantId is required",
          });
        }
        const rows =
          await travelSelectedDb.getActiveSelectedCountriesForTenantTeam(
            tenantId,
            "",
          );
        const countryCodes = (rows || []).map((r) => r.CountryCode || "");
        res.json({ success: true, data: { countryCodes } });
      } catch (err) {
        console.error(
          "Error in /areyousafetabhandler/getTravelAdvisorySelection:",
          err,
        );
        res
          .status(500)
          .json({ success: false, error: err.message, data: null });
      }
    },
  );

  app.post(
    "/areyousafetabhandler/saveTravelAdvisorySelection/",
    async (req, res) => {
      try {
        const body = req.body || {};
        const tenantId = body.tenantId || req.query.tenantId || "";
        const userId = body.userId || req.query.userId || "";
        const advisoryType = body.type || req.query.type || "";
        const coordsStr = body.coords || req.query.coords || "";
        const countryCodes = Array.isArray(body.countryCodes)
          ? body.countryCodes
          : [];

        if (!tenantId) {
          return res.status(400).json({
            success: false,
            error: "tenantId is required",
          });
        }
        if (!userId) {
          return res.status(400).json({
            success: false,
            error: "userId is required",
          });
        }
        const result = await travelSelectedDb.saveTravelAdvisorySelections(
          tenantId,
          "",
          userId,
          countryCodes,
          advisoryType,
        );

        let detailSavedCount = 0;
        let advisoriesList = [];
        const requestedCodesSet = new Set(
          (countryCodes || [])
            .map((c) => String(c).trim().toUpperCase())
            .filter(Boolean),
        );
        if (requestedCodesSet.size > 0 && advisoryType == "Travel") {
          const selections =
            await travelSelectedDb.getActiveSelectedCountriesForTenantTeam(
              tenantId,
              "",
              "Travel",
            );
          const filtered = selections.filter((row) => {
            const countryCodes = (row.CountryCode || "")
              .split(",")
              .map((c) => c.trim().toUpperCase());

            return countryCodes.some((code) => requestedCodesSet.has(code));
          });
          if (filtered.length > 0) {
            const advisories = await travelAdvisory.getProcessedAdvisories();
            const advisoryByCode = {};
            for (const adv of advisories) {
              const code = (adv.countryCode || "").toUpperCase();
              if (code) advisoryByCode[code] = adv;
            }
            const now = new Date();
            for (const row of filtered) {
              const selectedId = row.TravelAdvisorySelectedCountriesId;
              const countryCodes = (row.CountryCode || "")
                .split(",")
                .map((c) => c.trim().toUpperCase());

              for (const code of countryCodes) {
                const advisory = advisoryByCode[code];
                if (advisory) {
                  await travelSelectedDb.upsertSavedAdvisory(
                    selectedId,
                    code,
                    advisory,
                    now,
                    "Travel",
                  );
                  detailSavedCount++;
                }
              }
            }
          }
        } else if (advisoryType == "Weather") {
          {
            const parts = String(coordsStr)
              .trim()
              .split(/[,\s]+/);
            const lat = parseFloat(parts[0]);
            const lon = parseFloat(parts[1]);
            if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
              const weatherAdvisory = require("./travelServices/weather-advisory-feed");
              const results = await weatherAdvisory.getWeatherAlerts(lat, lon);
              const selections =
                await travelSelectedDb.getActiveSelectedCountriesForTenantTeam(
                  tenantId,
                  "",
                  "Weather",
                );
              const now = new Date();
              for (const row of selections) {
                const advisoryId = row.TravelAdvisorySelectedCountriesId;
                const countryCode =
                  results.length > 0
                    ? (results[0].countryCode || "").trim()
                    : "";
                await travelSelectedDb.upsertSavedAdvisory(
                  advisoryId,
                  countryCode,
                  results,
                  now,
                  "Weather",
                );
                detailSavedCount++;
              }
            }
          }
        }

        res.json({
          success: true,
          savedCount: result.savedCount,
          skipped: result.skipped,
          deletedCount:
            result.deletedCount != null && result.deletedCount > 0
              ? result.deletedCount
              : undefined,
          detailSavedCount: detailSavedCount > 0 ? detailSavedCount : undefined,

          invalidCodes:
            result.invalidCodes && result.invalidCodes.length
              ? result.invalidCodes
              : undefined,
        });
      } catch (err) {
        //  processSafetyBotError(err, "", "", "", "saveTravelAdvisorySelection");
        res.status(500).json({ success: false, error: err.message });
      }
    },
  );

  app.get("/areyousafetabhandler/getSelectedLanguageData", async (req, res) => {
    const language = req.query.language;
    const userAadObjId = req.query.userAadObjId || "";

    try {
      if (!language) {
        return res
          .status(400)
          .json({ error: "Language parameter is required" });
      }

      const pool = await poolPromise;
      const sql = require("mssql");

      // SQL query matching the C# version - using language parameter
      // Note: The C# version has two SELECT statements, but we'll use the language parameter
      const query = `
SELECT 
    'Language' AS AttributeName, 
    SL.LANGUAGE AS TranslatedAttribute, 
    SL.LANGUAGE AS Language,
    SL.CULTURE_CODE AS CULTURECODE
FROM 
    SYS_LANGUAGE SL
WHERE 
    SL.LANGUAGE = @language
UNION ALL
SELECT 
    SA.ATTRIBUTE AS AttributeName,
    SADT.ATTRIBUTE AS TranslatedAttribute,
    SL.LANGUAGE AS Language,
    SL.CULTURE_CODE AS CULTURECODE
FROM 
    SYS_ATTRIBUTE_DEF SA
INNER JOIN 
    SYS_ATTRIBUTE_DEF_TRANS SADT 
ON 
    SA.ATTRIBUTE_ID = SADT.ATTRIBUTE_ID
INNER JOIN 
    SYS_LANGUAGE SL 
ON 
    SADT.LANGUAGE_ID = SL.LANGUAGE_ID
WHERE 
    SL.LANGUAGE = @language;`;

      const result = await pool
        .request()
        .input("language", sql.NVarChar, language)
        .query(query);

      // Format the result similar to C# code structure
      const formattedResult = {};

      // Process the result set (C# code processes DataTable, we process recordset)
      if (result.recordset && result.recordset.length > 0) {
        const formattedResult1 = {};
        let languageName = "";

        result.recordset.forEach((row) => {
          const key = row.AttributeName;
          const value = {
            AttributeName: row.AttributeName,
            TranslatedAttribute: row.TranslatedAttribute,
            Language: row.Language,
            CULTURECODE: row.CULTURECODE,
          };

          languageName = row.Language;
          // Add or overwrite the key in the dictionary
          formattedResult1[key] = value;
        });

        formattedResult[languageName] = formattedResult1;
      }

      // Convert to JSON and send response (matching C# JsonConvert.SerializeObject)
      res.json(formattedResult);
    } catch (err) {
      console.log(err);
      processSafetyBotError(
        err,
        "",
        "",
        userAadObjId,
        "error in /areyousafetabhandler/getSelectedLanguageData -> language=" +
          language,
      );
      res.status(500).json({ error: "Error fetching language data" });
    }
  });

  app.get("/areyousafetabhandler/getSelectedLanguage", async (req, res) => {
    const teamId = req.query.teamId;
    const userId = req.query.userId || req.query.userAadObjId;
    const userAadObjId = userId || "";

    try {
      if (!userId) {
        return res.status(400).json({ error: "UserId parameter is required" });
      }

      const pool = await poolPromise;
      const sql = require("mssql");
      let query = "";
      let request = pool.request();

      // If teamId is null or "null", find all teams user belongs to and get top 1 team's language
      if (!teamId || teamId === "null" || teamId === "") {
        query = `
          SELECT 
            LANGUAGE,
            team_id AS teamId,
            team_name AS teamName
          FROM MSTeamsInstallationDetails
          WHERE team_id IN (
            SELECT TOP 1 team_id
            FROM MSTeamsTeamsUsers
            WHERE user_aadobject_id = @userId
            ORDER BY team_id
          )
          AND LANGUAGE IS NOT NULL
          AND LANGUAGE <> '';
        `;
        request.input("userId", sql.NVarChar, userId);
      } else {
        // If teamId is not null, fetch language based on teamId
        query = `
          SELECT TOP 1
            LANGUAGE,
            team_id AS teamId,
            team_name AS teamName
          FROM MSTeamsInstallationDetails
          WHERE team_id = @teamId
            AND (user_obj_id = @userId OR super_users LIKE @userIdLike)
            AND uninstallation_date IS NULL
            AND LANGUAGE IS NOT NULL
            AND LANGUAGE <> '';
        `;
        request.input("teamId", sql.NVarChar, teamId);
        request.input("userId", sql.NVarChar, userId);
        request.input("userIdLike", sql.NVarChar, `%${userId}%`);
      }

      const result = await request.query(query);

      if (result.recordset && result.recordset.length > 0) {
        const languageData = result.recordset[0];
        res.json({
          language: languageData.LANGUAGE,
          teamId: languageData.teamId,
          teamName: languageData.teamName,
        });
      } else {
        // If no language found, return null or default
        res.json({
          language: null,
          teamId: teamId || null,
          teamName: null,
        });
      }
    } catch (err) {
      console.log(err);
      processSafetyBotError(
        err,
        teamId || "",
        "",
        userAadObjId,
        "error in /areyousafetabhandler/getSelectedLanguage -> teamId=" +
          teamId +
          " userId=" +
          userId,
      );
      res.status(500).json({ error: "Error fetching selected language" });
    }
  });
  app.get("/areyousafetabhandler/getAccessToken", async (req, res) => {
    const clientTenantId = req.query.tenantId;

    try {
      let data = new FormData();

      data.append("client_Id", process.env.MicrosoftAppId);

      data.append("client_secret", process.env.MicrosoftAppPassword);

      data.append("scope", "https://graph.microsoft.com/.default");

      data.append("grant_type", "client_credentials");

      let config = {
        method: "post",

        maxBodyLength: Infinity,

        url: `https://login.microsoftonline.com/${clientTenantId}/oauth2/v2.0/token`,

        data: data,
      };

      await axios.request(config).then(async (response) => {
        let accessToken = response.data.access_token;

        res.send({ accessToken });
      });
    } catch (err) {
      console.log(err);
    }

    res.send(false);
  });

  app.get("/areyousafetabhandler/SaveDynamicLocation", async (req, res) => {
    const userid = req.query.userid;
    const location = req.query.location;
    const source = req.query.source;
    try {
      const tabObj = new tab.AreYouSafeTab();
      await tabObj.setDynamicLocation(userid, location, source);
      res.send("success");
    } catch (err) {
      processSafetyBotError(
        err,
        teamId,
        "",
        userAadObjId,
        "error in /areyousafetabhandler/setSOSNotification",
      );
    }
  });
  app.post("/areyousafetabhandler/saveAITokenUsage", async (req, res) => {
    const userid = req.body.userId;
    const totalTokens = req.body.totalTokens;
    try {
      const tabObj = new tab.AreYouSafeTab();
      await tabObj.SaveAiTotalToken(userid, totalTokens);
      res.send("success");
    } catch (err) {
      processSafetyBotError(
        err,
        teamId,
        "",
        userAadObjId,
        "error in /areyousafetabhandler/setSOSNotification",
      );
    }
  });
  app.get("/areyousafetabhandler/GetUserLocationData", async (req, res) => {
    const userAadObjId = req.query.userAadObjId || "";
    const teamId = req.query.teamId || "";
    try {
      const pool = await poolPromise;
      const sql = require("mssql");

      let combinedQuery = `
        SELECT COUNTRY, CITY, STATE, DEPARTMENT
        FROM MSTeamsTeamsUsers
        WHERE 
            COUNTRY IS NOT NULL AND LTRIM(RTRIM(COUNTRY)) <> ''
        AND CITY IS NOT NULL AND LTRIM(RTRIM(CITY)) <> ''
        AND STATE IS NOT NULL AND LTRIM(RTRIM(STATE)) <> ''
        AND DEPARTMENT IS NOT NULL AND LTRIM(RTRIM(DEPARTMENT)) <> '';`;

      if (userAadObjId) {
        combinedQuery += `
        SELECT 
            CASE 
                WHEN EXISTS (
                    SELECT 1
                    FROM MSTeamsInstallationDetails mid
                    JOIN MSTeamsTeamsUsers tu
                        ON tu.TEAM_ID = mid.TEAM_ID
                    WHERE mid.FILTER_ENABLED = 1
                      AND tu.user_aadobject_id = @userAadObjId
                )
                THEN 1 ELSE 0
            END AS FILTER_ENABLED;`;
      }

      const request = pool.request();
      if (userAadObjId) {
        request.input("userAadObjId", sql.NVarChar, userAadObjId);
      }

      const result = await request.query(combinedQuery);

      const response = {
        locationData: result.recordsets[0] || [],
        filterEnabled:
          userAadObjId &&
          result.recordsets[1] &&
          result.recordsets[1].length > 0
            ? result.recordsets[1][0].FILTER_ENABLED
            : null,
      };

      res.json(response);
    } catch (err) {
      console.log(err);
      processSafetyBotError(
        err,
        teamId,
        "",
        userAadObjId,
        "error in /areyousafetabhandler/GetUserLocationData",
      );
      res.status(500).json({ error: "Error fetching user location data" });
    }
  });
  app.post("/voicecall", async (req, res) => {
    const digit = req.body.Digits;
    const incidentId = req.body.incidentId;
    const userId = req.body.userId;

    console.log("Digit:", digit);
    console.log("Incident:", incidentId);
    console.log("User:", userId);

    res.type("text/xml");

    if (digit === "1") {
      res.send(`<Response><Say>Thank you. Marked safe.</Say></Response>`);
      await bot.proccessSMSLinkClick(userId, incidentId, "YES", "VoiceCall");

      // Log positive acknowledgement via voice, similar to /posresp
      await bot.SaveSmsLog(
        userId,
        "VOICE_CALL",
        "YES",
        JSON.stringify({ eventId: incidentId, userId }),
        null,
        null,
        incidentId,
      );

      await incidentService.saveAllTypeQuerylogs(
        userId,
        "",
        "VOICE_CALL",
        "",
        incidentId,
        "VOICE_Call_REPLAY",
        "",
        "",
        "",
        "YES",
        "",
      );
    } else if (digit === "2") {
      res.send(`<Response><Say>Help request recorded.</Say></Response>`);
      await bot.proccessSMSLinkClick(userId, incidentId, "NO", "VoiceCall");

      // Log negative acknowledgement via voice, similar to /negresp
      await bot.SaveSmsLog(
        userId,
        "VOICE_CALL",
        "NO",
        JSON.stringify({ eventId: incidentId, userId }),
        null,
        null,
        incidentId,
      );

      await incidentService.saveAllTypeQuerylogs(
        userId,
        "",
        "VOICE_CALL",
        "",
        incidentId,
        "VOICE_Call_REPLAY",
        "",
        "",
        "",
        "NO",
        "",
      );
    } else {
      res.send(`<Response><Say>Invalid input.</Say></Response>`);
    }
  });
  app.post("/callstatus", async (req, res) => {
    const incidentId = req.body.IncidentId;
    const userId = req.body.userid;
    const { CallSid, CallStatus, From, To, CallDuration } = req.body;

    console.log("got reply for callstatus", {
      incidentId,
      userId,
      body: req.body,
    });

    try {
      let internalStatus;
      switch (CallStatus) {
        case "queued":
          internalStatus = "CALL_QUEUED";
          break;
        case "in-progress":
          internalStatus = "CALL_IN_PROGRESS";
          break;
        case "completed":
          internalStatus = "CALL_COMPLETED";
          break;
        case "no-answer":
          internalStatus = "CALL_NO_ANSWER";
          break;
        default:
          internalStatus = "CALL_STATUS_UNKNOWN";
          break;
      }

      const maskedTo =
        To && To.length > 4 ? To.slice(-4).padStart(To.length, "x") : To;

      const payload = {
        CallSid,
        CallStatus,
        From,
        To: maskedTo,
        CallDuration,
        incidentId,
        userId,
      };

      if (incidentId && userId) {
        await SaveSmsLog(
          userId,
          internalStatus,
          "Voice call status update",
          JSON.stringify(payload),
          CallSid,
          null,
          incidentId,
        );

        await incidentService.saveAllTypeQuerylogs(
          userId,
          "",
          "VOICE_CALL_STATUS",
          maskedTo || "",
          incidentId,
          internalStatus,
          "VOICE_CALL",
          "STATUS_UPDATE",
          JSON.stringify(payload),
          "",
          "",
        );
      }
    } catch (err) {
      console.log("Error while processing /callstatus", err);
    }

    // Always acknowledge Twilio webhook quickly
    res.sendStatus(200);
  });
  app.post("/twilio-status", (req, res) => {
    const status = req.body.MessageStatus;
    const messageSid = req.body.MessageSid;

    // 👇 your custom params
    const eventId = req.query.eventId;
    const userId = req.query.userId;
    const phone = req.body.To;
    console.log("Event:", eventId);
    console.log("User:", userId);
    console.log("Status:", status);

    // Always acknowledge Twilio webhook quickly
    res.sendStatus(200);

    const maskedPhone = (phone || "")
      .slice(-4)
      .padStart((phone || "").length || 4, "x");
    const normalizedStatus =
      typeof status === "string" ? status.toLowerCase() : "";
    if (normalizedStatus !== "delivered" || !messageSid) {
      const voiceInitiatePayload = {
        eventId: eventId,
        userId: userId,
        SMS_ID: messageSid,
        Status: status,
      };
      incidentService.saveAllTypeQuerylogs(
        userId || "",
        "",
        "SMS",
        maskedPhone,
        eventId || "",
        "STATUS_UPDATE",
        "",
        "",
        "",
        "",
        "",
        JSON.stringify(voiceInitiatePayload),
      );
    } else {
      const accountSid = process.env.TWILIO_ACCOUNT_ID;
      const authToken = process.env.TWILIO_ACCOUNT_AUTH_TOKEN;
      if (!accountSid || !authToken) {
        console.log(
          "[twilio-status] Missing TWILIO_ACCOUNT_ID/TWILIO_ACCOUNT_AUTH_TOKEN; cannot fetch message details",
        );
        return;
      }

      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages/${messageSid}.json`;
      axios
        .get(twilioUrl, { auth: { username: accountSid, password: authToken } })
        .then(async (resp) => {
          console.log("[twilio-status] Twilio message details:", resp?.data);
          const price =
            Math.abs(
              parseFloat(resp?.data?.price ?? resp?.data?.Price ?? 0) || 0,
            ) || 0;
          const numSegments = parseInt(resp?.data?.num_segments, 10) || 1;
          const voiceInitiatePayload = {
            eventId: eventId,
            userId: userId,
            SMS_ID: messageSid,
            Status: status,
            Price: price,
            Segments: numSegments,
          };
          incidentService.saveAllTypeQuerylogs(
            userId || "",
            "",
            "SMS",
            maskedPhone,
            eventId || "",
            "STATUS_UPDATE",
            "",
            "",
            JSON.stringify(resp?.data || {}),
            "",
            "",
            JSON.stringify(voiceInitiatePayload),
          );

          // Update BILLING_USAGE_DETAILS JSON: SMS.usedBalance += price, SMS.usedSegment += num_segments
          if (eventId && (price > 0 || numSegments > 0)) {
            try {
              const pool = await poolPromise;
              const selRes = await pool
                .request()
                .input("eventId", sql.Int, parseInt(eventId, 10) || 0)
                .query(
                  `SELECT s.ID, s.BILLING_USAGE_DETAILS
                   FROM MSTeamsSubscriptionDetails s
                   INNER JOIN MSTeamsInstallationDetails i ON i.SubscriptionDetailsId = s.ID
                   INNER JOIN MSTeamsIncidents inc ON inc.team_id = i.team_id
                   WHERE inc.id = @eventId AND i.SubscriptionDetailsId IS NOT NULL`,
                );
              const row = selRes?.recordset?.[0];
              if (row) {
                let usage;
                try {
                  usage =
                    typeof row.BILLING_USAGE_DETAILS === "string"
                      ? JSON.parse(row.BILLING_USAGE_DETAILS || "{}")
                      : row.BILLING_USAGE_DETAILS || {};
                } catch {
                  console.log(
                    "[twilio-status] Invalid BILLING_USAGE_DETAILS JSON, skipping update",
                  );
                  return;
                }
                if (!usage.SMS) usage.SMS = {};
                usage.SMS.usedBalance = (usage.SMS.usedBalance ?? 0) + price;
                usage.SMS.usedSegment =
                  (usage.SMS.usedSegment ?? 0) + numSegments;
                const newJson = JSON.stringify(usage);
                await pool
                  .request()
                  .input("id", sql.Int, row.ID)
                  .input("json", sql.NVarChar(sql.MAX), newJson)
                  .query(
                    "UPDATE MSTeamsSubscriptionDetails SET BILLING_USAGE_DETAILS = @json WHERE ID = @id",
                  );
                console.log(
                  "[twilio-status] Updated BILLING_USAGE_DETAILS SMS.usedBalance +",
                  price,
                  "usedSegment +",
                  numSegments,
                );
              }
            } catch (dbErr) {
              console.log(
                "[twilio-status] Error updating BILLING_USAGE_DETAILS:",
                dbErr?.message,
              );
            }
          }
        })
        .catch((err) => {
          const statusCode = err?.response?.status;
          const body = err?.response?.data;
          console.log("[twilio-status] Twilio fetch failed:", {
            messageSid,
            statusCode,
            body,
            error: err?.message,
          });
        });
    }
  });
  app.get("/areyousafetabhandler/getLicenseAlert", async (req, res) => {
    const userId = req.query.userId || "";
    const teamId =
      req.query.teamId && req.query.teamId !== "null" ? req.query.teamId : "";

    const noBanner = { showBanner: false };

    const licenseCountsSubquery = `
        LEFT JOIN (
            SELECT
                ID2.user_tenant_id,
                SUM(CASE WHEN TU.hasLicense = 1 THEN 1 ELSE 0 END) AS LICENSED_USERS,
                SUM(CASE WHEN TU.hasLicense = 0 OR TU.hasLicense IS NULL THEN 1 ELSE 0 END) AS UNLICENSED_COUNT
            FROM MSTeamsInstallationDetails ID2
            LEFT JOIN MSTeamsTeamsUsers TU
                ON TU.TEAM_ID = ID2.TEAM_ID
            GROUP BY ID2.user_tenant_id
        ) U
            ON U.user_tenant_id = ID.user_tenant_id`;

    const buildResponse = (row) => {
      const purchasedLicenses = Number(row.UserLimit) || 0;
      const licensedUsers = Number(row.LICENSED_USERS) || 0;
      const unlicensedCount = Number(row.UNLICENSED_COUNT) || 0;

      const showBanner =
        unlicensedCount > 0 &&
        licensedUsers >= purchasedLicenses &&
        purchasedLicenses > 0;

      const userEmailId = row.UserEmailId || "";
      const buyLicensesUrl = `https://admin.cloud.microsoft/?#/subscriptions`;
      const manageLicensesUrl = userEmailId
        ? `https://safetycheckteamssubscriptionpage.azurewebsites.net/?isFromSafetyBot=true&emailid=${encodeURIComponent(userEmailId)}`
        : "https://safetycheckteamssubscriptionpage.azurewebsites.net/?isFromSafetyBot=true";
      return {
        showBanner,
        unlicensedCount: showBanner ? unlicensedCount : 0,
        purchasedLicenses: showBanner ? purchasedLicenses : 0,
        buyLicensesUrl,
        manageLicensesUrl,
      };
    };

    try {
      if (!teamId && !userId) {
        return res.status(400).json({
          success: false,
          error: "teamId or userId is required",
        });
      }

      const safetyInitiatorObj =
        await dbOperation.verifyAdminUserForDashboardTab(
          userId,
          teamId || null,
        );
      if (!safetyInitiatorObj?.isAdmin) {
        return res.json({ success: true, data: noBanner });
      }

      const pool = await poolPromise;
      let query = "";

      if (teamId) {
        query = `
          SELECT
    SD.UserLimit,
    SD.UserEmailId,
    SD.SubscriptionType,
    U.LICENSED_USERS,
    U.UNLICENSED_COUNT
FROM MSTeamsInstallationDetails ID
INNER JOIN MSTeamsSubscriptionDetails SD
    ON ID.SubscriptionDetailsId = SD.ID
LEFT JOIN (
    SELECT
        TEAM_ID,
        SUM(CASE WHEN hasLicense = 1 THEN 1 ELSE 0 END) AS LICENSED_USERS,
        SUM(CASE WHEN hasLicense = 0 OR hasLicense IS NULL THEN 1 ELSE 0 END) AS UNLICENSED_COUNT
    FROM MSTeamsTeamsUsers
    GROUP BY TEAM_ID
) U
    ON U.TEAM_ID = ID.TEAM_ID
WHERE ID.TEAM_ID = @teamId
  AND SD.SubscriptionType = 3;
      `;
      } else {
        query = `
           SELECT DISTINCT
    SD.UserLimit,
    SD.UserEmailId,
    SD.SubscriptionType,
    C.LICENSED_USERS,
    C.UNLICENSED_COUNT
FROM MSTeamsInstallationDetails ID
INNER JOIN MSTeamsSubscriptionDetails SD
    ON SD.ID = ID.SubscriptionDetailsId
CROSS APPLY
(
    SELECT
        SUM(CASE WHEN TU.hasLicense = 1 THEN 1 ELSE 0 END) AS LICENSED_USERS,
        SUM(CASE WHEN TU.hasLicense = 0 OR TU.hasLicense IS NULL THEN 1 ELSE 0 END) AS UNLICENSED_COUNT
    FROM MSTeamsTeamsUsers TU
    WHERE TU.TEAM_ID IN
    (
        SELECT DISTINCT TEAM_ID
        FROM MSTeamsInstallationDetails
        WHERE user_obj_id = ID.user_obj_id
    )
) C
WHERE ID.user_obj_id = @userAadObjId;
      `;
      }

      const request = pool.request();
      if (teamId) {
        request.input("teamId", sql.NVarChar, teamId);
      }
      if (userId) {
        request.input("userAadObjId", sql.NVarChar, userId);
      }

      const result = await request.query(query);

      if (!result.recordset || result.recordset.length === 0) {
        return res.json({ success: true, data: noBanner });
      }

      res.json({
        success: true,
        data: buildResponse(result.recordset[0]),
      });
    } catch (err) {
      console.log(err);
      processSafetyBotError(
        err,
        teamId,
        "",
        userId,
        "error in /areyousafetabhandler/getLicenseAlert",
      );
      res
        .status(500)
        .json({ success: false, error: "Error fetching license alert" });
    }
  });

  app.get("/areyousafetabhandler/getSubscription", async (req, res) => {
    const userAadObjId = req.query.userId || "";
    const teamId = req.query.teamId || "";

    try {
      const pool = await poolPromise;
      const sql = require("mssql");

      let query = "";

      // ✅ CASE 1: TEAM_ID
      if (teamId) {
        query = `
        SELECT 
            SD.*,
            U.TOTAL_USERS,
            U.LICENSED_USERS
        FROM MSTeamsInstallationDetails ID
        INNER JOIN MSTeamsSubscriptionDetails SD 
            ON ID.SubscriptionDetailsId = SD.ID
        LEFT JOIN (
            SELECT 
                ID2.user_tenant_id,
                COUNT(TU.USER_ID) AS TOTAL_USERS,
                SUM(CASE WHEN TU.hasLicense = 1 THEN 1 ELSE 0 END) AS LICENSED_USERS
            FROM MSTeamsInstallationDetails ID2
            LEFT JOIN MSTeamsTeamsUsers TU 
                ON TU.TEAM_ID = ID2.TEAM_ID
            GROUP BY ID2.user_tenant_id
        ) U 
            ON U.user_tenant_id = ID.user_tenant_id
        WHERE ID.TEAM_ID = @teamId;
      `;
      }

      // ✅ CASE 2: USER_AAD_OBJ_ID
      else if (userAadObjId) {
        query = `
        SELECT 
            SD.*,
            U.TOTAL_USERS,
            U.LICENSED_USERS
        FROM MSTeamsTeamsUsers TU
        INNER JOIN MSTeamsInstallationDetails ID 
            ON TU.TEAM_ID = ID.TEAM_ID
        INNER JOIN MSTeamsSubscriptionDetails SD 
            ON ID.SubscriptionDetailsId = SD.ID
        LEFT JOIN (
            SELECT 
                ID2.user_tenant_id,
                COUNT(TU2.USER_ID) AS TOTAL_USERS,
                SUM(CASE WHEN TU2.hasLicense = 1 THEN 1 ELSE 0 END) AS LICENSED_USERS
            FROM MSTeamsInstallationDetails ID2
            LEFT JOIN MSTeamsTeamsUsers TU2 
                ON TU2.TEAM_ID = ID2.TEAM_ID
            GROUP BY ID2.user_tenant_id
        ) U 
            ON U.user_tenant_id = ID.user_tenant_id
        WHERE TU.user_aadobject_id = @userAadObjId;
      `;
      } else {
        return res
          .status(400)
          .json({ error: "teamId or userAadObjId is required" });
      }

      const request = pool.request();

      if (teamId) {
        request.input("teamId", sql.NVarChar, teamId);
      }

      if (userAadObjId) {
        request.input("userAadObjId", sql.NVarChar, userAadObjId);
      }

      const result = await request.query(query);

      res.json({
        subscriptionData: result.recordset || [],
      });
    } catch (err) {
      console.log(err);
      processSafetyBotError(
        err,
        teamId,
        "",
        userAadObjId,
        "error in /areyousafetabhandler/getSubscription",
      );
      res.status(500).json({ error: "Error fetching subscription data" });
    }
  });
  app.get("/areyousafetabhandler/GetAuditTrail", async (req, res) => {
    const userAadObjId = req.query.userId || "";
    const teamId = req.query.teamId || "";

    try {
      const pool = await poolPromise;
      const sql = require("mssql");

      let query = "";

      // ✅ CASE 2: USER_AAD_OBJ_ID

      query = `
       SELECT DISTINCT
    A.AUDIT_TRAIL_ID,
    A.UPDATED_IN,
    A.ENTITY_ID,
    A.ACTION,
    A.TEAM_ID,
    A.FIELD_NAME,
    A.[FROM],
    A.[TO],
	A.UPDATED_BY,
    ISNULL(UB.user_name, A.UPDATED_BY) AS UPDATED_BY_NAME,
    A.UPDATED_DATETIME
FROM AUDIT_TRAIL A
LEFT JOIN MSTeamsTeamsUsers UB 
    ON UB.user_aadobject_id = A.UPDATED_BY
WHERE 
    A.ENTITY_ID = '${teamId}'
    AND A.UPDATED_IN = 'MSTeamsInstallationDetails' and A.UPDATED_BY IS NOT NULL
ORDER BY 
    A.UPDATED_DATETIME DESC;


      `;

      const request = pool.request();

      if (teamId) {
        request.input("teamId", sql.NVarChar, teamId);
      }

      const result = await request.query(query);

      res.json({
        AuditTrailData: result.recordset || [],
      });
    } catch (err) {
      console.log(err);
      processSafetyBotError(
        err,
        teamId,
        "",
        userAadObjId,
        "error in /areyousafetabhandler/getSubscription",
      );
      res.status(500).json({ error: "Error fetching subscription data" });
    }
  });

  app.get("/viewfile/content", async (req, res) => {
    try {
      const fileUrl = req.query.url;
      const fileName = req.query.name || "file";
      const isDownload = req.query.download === "1";

      if (!fileUrl || !isAllowedFileViewUrl(fileUrl)) {
        return res.status(400).send("Invalid file URL");
      }

      const response = await axios.get(fileUrl, {
        responseType: "stream",
        maxRedirects: 5,
        timeout: 120000,
      });

      const contentType =
        response.headers["content-type"] || "application/octet-stream";
      res.setHeader("Content-Type", contentType);

      if (isDownload) {
        const safeFileName = fileName.replace(/["\\]/g, "_");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${safeFileName}"`,
        );
      } else {
        res.setHeader("Content-Disposition", "inline");
      }

      response.data.pipe(res);
    } catch (err) {
      console.error("viewfile/content error:", err.message);
      res.status(500).send("Unable to fetch file");
    }
  });

  app.get("/viewfile/autodownload", (req, res) => {
    const fileUrl = req.query.url;
    const fileName = req.query.name || "file";
    const fileSize = req.query.size;

    if (!fileUrl || !isAllowedFileViewUrl(fileUrl)) {
      return res.status(400).send("Invalid file URL");
    }

    const downloadUrl = buildIncFileContentUrl(fileUrl, fileName, true);
    if (!downloadUrl) {
      return res.status(500).send("Download URL is not configured");
    }

    const extension = getAutodownloadFileExtension(fileName);
    const docStyle = getAutodownloadDocStyle(extension);
    const metadataLine = buildAutodownloadMetadataLine(
      fileSize,
      docStyle.typeLabel,
    );
    const fileIconSvg = buildAutodownloadIconSvg(
      docStyle.label,
      docStyle.iconColor,
    );

    const safeDownloadUrl = escapeViewFileHtml(downloadUrl);
    const safeFileName = escapeViewFileHtml(fileName);
    const safeMetadataLine = escapeViewFileHtml(metadataLine);

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Downloading ${safeFileName}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: "Segoe UI", Arial, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 24px 16px;
      background: #f3f2f1;
      color: #242424;
    }
    .page {
      width: 100%;
      max-width: 560px;
      text-align: center;
      position: relative;
    }
    .decor {
      position: absolute;
      color: #e1dfdd;
      font-size: 18px;
      font-weight: 300;
      pointer-events: none;
      user-select: none;
    }
    .decor-1 { top: 8px; left: 18%; }
    .decor-2 { top: 28px; right: 16%; font-size: 22px; }
    .decor-3 { top: 72px; left: 8%; width: 10px; height: 10px; border: 2px solid #e1dfdd; border-radius: 50%; }
    .decor-4 { top: 54px; right: 10%; font-size: 14px; }
    .hero-icon {
      width: 88px;
      height: 88px;
      margin: 0 auto 20px;
      border-radius: 50%;
      background: #dff6dd;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .hero-icon svg { display: block; }
    h1 {
      margin: 0 0 8px;
      font-size: 28px;
      line-height: 1.25;
      font-weight: 700;
      color: #201f1e;
    }
    .subtitle {
      margin: 0 0 28px;
      font-size: 15px;
      color: #605e5c;
    }
    .file-card {
      display: flex;
      align-items: center;
      gap: 14px;
      background: #fff;
      border: 1px solid #edebe9;
      border-radius: 12px;
      padding: 16px 18px;
      text-align: left;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
      margin-bottom: 16px;
    }
    .file-icon {
      width: 40px;
      height: 48px;
      flex: 0 0 auto;
    }
    .file-details {
      flex: 1;
      min-width: 0;
    }
    .file-name {
      margin: 0 0 4px;
      font-size: 16px;
      font-weight: 700;
      color: #201f1e;
      word-break: break-word;
    }
    .file-meta {
      margin: 0;
      font-size: 13px;
      color: #605e5c;
    }
    .fallback-banner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      background: #f3faf2;
      border: 1px solid #c7eac5;
      border-radius: 12px;
      padding: 14px 16px;
      text-align: left;
      margin-bottom: 20px;
    }
    .fallback-copy {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      min-width: 0;
    }
    .info-icon {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: #107c10;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      font-weight: 700;
      flex: 0 0 auto;
      margin-top: 1px;
    }
    .fallback-title {
      margin: 0 0 2px;
      font-size: 14px;
      font-weight: 700;
      color: #201f1e;
    }
    .fallback-text {
      margin: 0;
      font-size: 12px;
      color: #605e5c;
    }
    .download-btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      flex: 0 0 auto;
      border: 1px solid #107c10;
      background: #fff;
      color: #107c10;
      border-radius: 8px;
      padding: 8px 14px;
      font-size: 13px;
      font-weight: 600;
      text-decoration: none;
      cursor: pointer;
      white-space: nowrap;
    }
    .download-btn:hover { background: #f3faf2; }
    .footer-secure {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      margin: 0 0 8px;
      font-size: 13px;
      color: #107c10;
      font-weight: 600;
    }
    .footer-note {
      margin: 0;
      font-size: 12px;
      color: #8a8886;
    }
    @media (max-width: 520px) {
      h1 { font-size: 24px; }
      .fallback-banner {
        flex-direction: column;
        align-items: stretch;
      }
      .download-btn { justify-content: center; }
    }
  </style>
</head>
<body>
  <div class="page">
    <span class="decor decor-1">+</span>
    <span class="decor decor-2">+</span>
    <span class="decor decor-3"></span>
    <span class="decor decor-4">+</span>

    <div class="hero-icon" aria-hidden="true">
      <svg width="42" height="42" viewBox="0 0 42 42" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="10" y="5" width="22" height="28" rx="2" stroke="#107C10" stroke-width="2" fill="#fff"/>
        <path d="M15 18h12M15 22h12M15 26h8" stroke="#107C10" stroke-width="1.5" stroke-linecap="round"/>
        <path d="M21 30v8M17 34l4 4 4-4" stroke="#107C10" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>

    <h1>Your file is ready</h1>
    

    <div class="file-card">
      ${fileIconSvg}
      <div class="file-details">
        <p class="file-name">${safeFileName}</p>
        <p class="file-meta">${safeMetadataLine}</p>
      </div>
    </div>

    <div class="fallback-banner">
      <div class="fallback-copy">
        <span class="info-icon" aria-hidden="true">i</span>
        <div>
          <p class="fallback-title">If the download doesn't start automatically</p>
          <p class="fallback-text">It may take a few seconds depending on your connection.</p>
        </div>
      </div>
      <a class="download-btn" id="manual-download" href="${safeDownloadUrl}">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M7 2v7M4.5 6.5L7 9l2.5-2.5" stroke="#107C10" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M2.5 11.5h9" stroke="#107C10" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        Download File
      </a>
    </div>

   
    <p class="footer-note">You can close this tab once your download begins.</p>
  </div>
  <script>
    (function () {
      const downloadUrl = ${JSON.stringify(downloadUrl)};
      const manualDownloadEl = document.getElementById("manual-download");

      manualDownloadEl.addEventListener("click", function (event) {
        event.preventDefault();
        window.location.href = downloadUrl;
      });

      try {
        const link = document.createElement("a");
        link.href = downloadUrl;
        link.download = ${JSON.stringify(fileName)};
        link.style.display = "none";
        document.body.appendChild(link);
        link.click();
      } catch (err) {
        window.location.href = downloadUrl;
      }
    })();
  </script>
</body>
</html>`);
  });
};

module.exports.handlerForSafetyBotTab = handlerForSafetyBotTab;
