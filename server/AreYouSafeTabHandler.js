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
        userObjId
      );
      dbOperation
        .verifyAdminUserForDashboardTab(req.query.userId, teamId)
        .then(async (safetyInitiatorObj) => {
          isAdmin = safetyInitiatorObj.isAdmin;
          responseObj.isAdmin = isAdmin;
          const userLicenseDetails = await dbOperation.getUserLicenseDetails(
            userObjId,
            teamId
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
            "Error in /areyousafetabhandler/getUserPermission -> verifyAdminUserForDashboardTab"
          );
        });
    } catch (err) {
      processSafetyBotError(
        err,
        "",
        "",
        userObjId,
        "Error in /areyousafetabhandler/getUserPermission"
      );
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
        "error in /areyousafetabhandler/getTemplateList"
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
                      ""
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
            error
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
            ""
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
                userAadObjIds
              );
              return phonedata.map((item) => {
                const match = teamsMembers.find(
                  (u) => u.user_aadobject_id === item.id
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
                phoneError
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
        "error in /areyousafetabhandler/getuserphonedata"
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
          };
          const sendRespData = (incData) => {
            const formatedIncData = tabObj.getFormatedIncData(
              incData,
              teamInfo[0],
              userObjId
            );
            responseObj.respData = formatedIncData;
            res.send(responseObj);
          };
          if (safetyInitiatorObj != null && safetyInitiatorObj.isAdmin) {
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
            "error in /areyousafetabhandler/getAllIncData -> verifyAdminUserForDashboardTab"
          );
        });
    } catch (err) {
      processSafetyBotError(
        err,
        "",
        "",
        userObjId,
        "error in /areyousafetabhandler/getAllIncData"
      );
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
              req.query.incid
          );
        });
    } catch (err) {
      processSafetyBotError(
        err,
        "",
        "",
        userAadObjId,
        "error in /areyousafetabhandler/deleteIncident incId=" + req.query.incid
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
              incStatus
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
          incStatus
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
        "error in /areyousafetabhandler/getTeamsMembers"
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
        userAadObjId
      );
      res.send(teamsMember);
    } catch (err) {
      processSafetyBotError(
        err,
        Tenantid,
        "",
        userAadObjId,
        "error in /areyousafetabhandler/getTeamsMembers"
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
        "error in /areyousafetabhandler/getEnableSafetyCheck"
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
        "error in /areyousafetabhandler/getSendSMS"
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
        "error in /areyousafetabhandler/getEmergencyContacts"
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
        "error in /areyousafetabhandler/deleteSOSResponder"
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
        "error in /areyousafetabhandler/saveSOSResponder"
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
        "error in /areyousafetabhandler/getSendSMS"
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
        "error in /areyousafetabhandler/setSendEmail"
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
        "error in /areyousafetabhandler/getSendSMS"
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
        "error in /areyousafetabhandler/saveFilterChecked"
      );
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
        "error in /areyousafetabhandler/setSendWhatsapp"
      );
    }
  });
  app.post("/areyousafetabhandler/setavailableforapp", async (req, res) => {
    const teamId = req.query.teamId;
    const tenantId = req.query.tenantId;
    const availablefor = req.query.availablefor;
    try {
      const tabObj = new tab.AreYouSafeTab();
      await tabObj.setavailableforapp(availablefor, tenantId, teamId);
      res.send("success");
    } catch (err) {
      processSafetyBotError(
        err,
        teamId,
        "",
        userAadObjId,
        "error in /areyousafetabhandler/setavailableforapp"
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
        "error in /areyousafetabhandler/setSOSNotification"
      );
    }
  });
  app.post("/areyousafetabhandler/setLanguagePreference", async (req, res) => {
    const teamId = req.query.teamId;
    const tenantid = req.query.tenantid;
    const language = req.query.language;
    try {
      const tabObj = new tab.AreYouSafeTab();
      await tabObj.setLanguagePreference(language, teamId, tenantid);
      res.send("success");
    } catch (err) {
      processSafetyBotError(
        err,
        teamId,
        "",
        userAadObjId,
        "error in /areyousafetabhandler/setSOSNotification"
      );
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
        field
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
        "error in /areyousafetabhandler/setRefreshToken"
      );
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
            "error in /areyousafetabhandler/getAssistanceData -> then"
          );
        });
    } catch (err) {
      processSafetyBotError(
        err,
        "",
        "",
        userAadObjId,
        "error in /areyousafetabhandler/getAssistanceData"
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
            "error in /areyousafetabhandler/getAllUserAssistanceData -> then"
          );
        });
    } catch (err) {
      processSafetyBotError(
        err,
        "",
        "",
        userAadObjId,
        "error in /areyousafetabhandler/getAssistanceData"
      );
    }
  });
  const SendSOSClosedCardToRequester = async (
    requestedUserData,
    closedByUserData,
    serviceUrl,
    user_tenant_id,
    userAadObjId,
    comment
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
                }
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
          userAadObjId
        );
      }
    } catch (err) {
      processSafetyBotError(
        err,
        "",
        "",
        userAadObjId,
        "error in SendSOSClosedCardToRequester data=" + JSON.stringify(data)
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
              comment
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
                reqBody.comment
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
          reqBody.comment
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
        TeamId
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
          UserDataUpdateID
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
        "error in /areyousafetabhandler/requestAssistance"
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
          teamId
        );
      } catch (err) {
        console.log(err);
        processSafetyBotError(
          err,
          teamId,
          "",
          userAadObjId,
          "error in /areyousafetabhandler/sendNeedAssistanceProactiveMessage -> getEmergencyContacts"
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
          issendemail
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
            req.body.data
        );
      }
    }
  );
  app.get(
    "/areyousafetabhandler/DeleteNeedAssistanceData",
    async (req, res) => {
      const AssistanceID = req.query.id;
      const Deletassistancedata = await tabObj.DeleteNeedAssistanceData(
        AssistanceID
      );
      res.send(Deletassistancedata);

      console.log(res);
      console.log({ AssistanceID });
    }
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
              TeamId
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
                assistId
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
                reqBody.comment
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
          reqBody.comment
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
        adminInfo.user_aadobject_id
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
        adminInfo.user_aadobject_id
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
        adminInfo.user_aadobject_id
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
              .filter((id) => id && id !== "" && id !== adminInfo.user_id)
          ),
        ];

        if (adminUserIds.length > 0) {
          const adminIdsStr = adminUserIds.map((id) => `'${id}'`).join(",");
          const otherAdminsQuery = `SELECT DISTINCT user_name FROM MSTeamsTeamsUsers WHERE user_id IN (${adminIdsStr})`;
          const otherAdminsResult = await db.getDataFromDB(
            otherAdminsQuery,
            adminInfo.user_aadobject_id
          );
          if (otherAdminsResult && otherAdminsResult.length > 0) {
            // Remove duplicate names using Set
            otherAdminNames = [
              ...new Set(
                otherAdminsResult
                  .map((admin) => admin.user_name)
                  .filter((name) => name && name.trim() !== "")
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
          mockUser
        )
        .catch((err) => {
          console.log("Error in handleRespondToAssistanceAsync:", err);
          processSafetyBotError(
            err,
            "",
            "",
            adminInfo.user_aadobject_id,
            "error in /acceptSOS - handleRespondToAssistanceAsync"
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

  app.get("/areyousafetabhandler/checkduplicateInc", async (req, res) => {
    const qs = req.query;
    try {
      const tabObj = new tab.AreYouSafeTab();
      const isDuplicate = await tabObj.checkDuplicateInc(
        qs.incTitle,
        qs.teamId,
        qs.userAadObjId
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
          qs.incTitle
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
        "error in /areyousafetabhandler/createnewincident"
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
        "error in /areyousafetabhandler/FileSave"
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
        "error in /areyousafetabhandler/DeleteFile"
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
          resendSafetyCheck
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
          req.query.incId
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
            isFirstBatch
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
            req.query.incId
        );
        res.send({ error: "Error: Please try again" });
      }
    }
  );
  app.get("/areyousafetabhandler/getUserTeamInfo", async (req, res) => {
    const userAadObjId = req.query.userAadObjId;
    const tabObj = new tab.AreYouSafeTab();
    const userTeamInfo = await tabObj.getUserTeamInfo(userAadObjId);
    res.send(userTeamInfo);
  });
  app.get("/areyousafetabhandler/getFilterData", async (req, res) => {
    const teamId = req.query.teamId;
    const tabObj = new tab.AreYouSafeTab();
    const filterData = await tabObj.getFilterData(teamId);
    res.send(filterData);
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
          msg
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
        "error in /areyousafetabhandler/getSuperUsersByTeamId"
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
        "error in /areyousafetabhandler/saveUserSetting"
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
        "error in /areyousafetabhandler/getIncDataToCopyInc incId=" + incId
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
              incType
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
          incType
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
            "error in /areyousafetabhandler/getNAReapSelectedTeams then"
          );
          res.send(0);
        });
    } catch (err) {
      processSafetyBotError(
        err,
        teamId,
        "",
        userAadObjId,
        "error in /areyousafetabhandler/getNAReapSelectedTeams"
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
              teamUserId
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
          teamUserId
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
          incType
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
            "error in /areyousafetabhandler/updateSafetyCheckStatus"
          );
          res.send("false");
        });
    } catch (err) {
      processSafetyBotError(
        err,
        "",
        "",
        userAadObjId,
        "error in /areyousafetabhandler/updateSafetyCheckStatus"
      );
      res.send("false");
    }
  });

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
            "error in /areyousafetabhandler/getEmergencyContactUsers"
          );

          res.send(null);
        });
    } catch (err) {
      processSafetyBotError(
        err,
        "",
        "",
        userAadObjId,
        "error in /areyousafetabhandler/getEmergencyContactUsers"
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
            "error in /areyousafetabhandler/getAdminList"
          );

          res.send(null);
        });
    } catch (err) {
      processSafetyBotError(
        err,
        "",
        "",
        userAadObjId,
        "error in /areyousafetabhandler/getAdminList"
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
              IsAppPermissionGranted
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
        isfromemail ? "Email" : "SMS"
      );

      bot.SaveSmsLog(
        userId,
        "LINK_CLICKED",
        "YES",
        JSON.stringify({ eventId, userId }),
        null,
        null,
        eventId
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
        ""
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
        isfromemail ? "Email" : "SMS"
      );

      bot.SaveSmsLog(
        userId,
        "LINK_CLICKED",
        "NO",
        JSON.stringify({ eventId, userId }),
        null,
        null,
        eventId
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
        ""
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
      ""
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
          runat
        );
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
            runat
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
              runat
            );
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
                from
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
        userAadObjId
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
        "Error in /areyousafetabhandler/getMessageActivityLog"
      );
      res.status(500).json({ error: "Failed to fetch message activity log" });
    }
  });

  app.get("/areyousafetabhandler/getSOSLog", async (req, res) => {
    const userAadObjId = req.query.userAadObjId;
    const teamId = req.query.teamId;

    console.log(
      "getSOSLog called with teamId:",
      teamId,
      "userAadObjId:",
      userAadObjId
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
            "error in /areyousafetabhandler/getSOSLog -> then"
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
        "Error in /areyousafetabhandler/getSOSLog"
      );
      res.status(500).json({ error: "Failed to fetch SOS log" });
    }
  });
  app.get("/areyousafetabhandler/weatheradvisorywebhook", async (req, res) => {
    console.log({ weatheradvisorywebhook: req, res });
  });

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
          language
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
          userId
      );
      res.status(500).json({ error: "Error fetching selected language" });
    }
  });
};

module.exports.handlerForSafetyBotTab = handlerForSafetyBotTab;
