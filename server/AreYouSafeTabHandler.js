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
      data.append("grant_type", "refresh_token");
      data.append("client_Id", process.env.MicrosoftAppId);
      data.append("client_secret", process.env.MicrosoftAppPassword);
      data.append("refresh_token", refreshToken);

      let config = {
        method: "post",
        maxBodyLength: Infinity,
        url: `https://login.microsoftonline.com/${tenantId}/oauth2/token`,
        data: data,
        // timeout: 10000,
      };
      await axios
        .request(config)
        .then(async (response) => {
          // console.log(response.data);
          if (response.data.scope?.indexOf("User.Read.All") == -1) {
            res.json({ NoPhonePermission: true });
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
                      teamId,
                      "",
                      "",
                      "error in get users phone number requestDateTime : " +
                        requestDate +
                        " ErrorDateTime: " +
                        new Date(),
                      TeamName,
                      false,
                      clientVersion
                    );
                    res.json({ error: error });
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
          // console.log(error);
          if (
            error.response.data.error == "invalid_grant" &&
            error.response.data.error_description &&
            error.response.data.error_description
              .toString()
              .indexOf("The refresh token has expired due to inactivity.") >= 0 //&&
            //  teamId == "19:3684c109f05f44efb4fb54a988d70286@thread.tacv2"
          ) {
            res.json({ authFailed: true });
          } else if (
            error.response.data.error == "invalid_grant" ||
            error.response.data.error == "interaction_required" ||
            error.response.data.error == "insufficient_claims"
          ) {
            res.json({ invalid_grant: true });
          } else {
            console.log({
              "error in get access token from microsoft at get users phone number":
                error,
            });
            processSafetyBotError(
              error,
              teamId,
              "",
              "",
              "error in get access token from microsoft at get users phone number",
              TeamName,
              false,
              clientVersion
            );
            res.json({ error: error });
          }
        });
      return phone;
    } catch (err) {
      console.log(err);
    }
    return phone;
  };
  app.get("/areyousafetabhandler/getuserphonedata", async (req, res) => {
    const userObjId = req.query.userId;
    const teamid = req.query.teamid;
    try {
      const teamInfo = await incidentService.getUserTeamInfoData(userObjId);
      var memberqery = "";
      memberqery = `select * from MSTeamsTeamsUsers where team_id in(select team_id from MSTeamsInstallationDetails where user_obj_id='${userObjId}' and refresh_token is NOT NULL)`;
      var teamsMembers = await db.getDataFromDB(memberqery, userObjId);
      let userAadObjIds = teamsMembers.map((x) => x.user_aadobject_id);
      if (teamInfo[0].length && teamInfo) {
        teamInfo[0].map(async (team) => {
          if (team.refresh_token) {
            var phonedata = await getUserPhone(
              team.refresh_token,
              team.tenant_id,
              userAadObjIds
            );
            phonedata = phonedata.map((item) => {
              const match = teamsMembers.find(
                (u) => u.user_aadobject_id === item.id
              );
              return {
                ...item,
                user_id: match ? match.user_id : null,
              };
            });
            console.log({ phonedata });
            res.send(phonedata);
          }
        });
      } else {
        res.send([]);
      }

      console.log(teamInfo);
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

  app.post("/areyousafetabhandler/setRefreshToken", async (req, res) => {
    const teamId = req.query.teamId;
    const refresh_token = req.query.refresh_token;
    const field = req.query.field;
    console.log({ teamId, refresh_token });
    try {
      const tabObj = new tab.AreYouSafeTab();
      const data = await tabObj.saveRefreshToken(teamId, refresh_token, field);
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
    userAadObjId
  ) => {
    try {
      //requestedUserData should have 2 properties: user_id and user_name
      //closedByUserData should have 2 properties: user_id and user_name
      let requestedUser = requestedUserData[0];
      //let closedByUser = closedByUserData[0];
      if (requestedUserData != null) {
        const approvalCardResponse = {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          appId: process.env.MicrosoftAppId,
          body: [
            {
              type: "TextBlock",
              text: `User <at>${requestedUser.user_name}</at> has closed your SOS Request`,
              wrap: true,
            },
          ],
          msteams: {
            entities: [
              {
                type: "mention",
                text: `<at>${requestedUser.user_name}</at>`,
                mentioned: {
                  id: requestedUser.user_id,
                  name: requestedUser.user_name,
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
    try {
      if (data) {
        let ts = req.query.ts;
        if (ts != null) {
          ts = ts.replace(/-/g, "/");
        }
        incidentService
          .updateSosStatus(assistId, ts, closedbyuser, closedbyuser)
          .then(async (respData) => {
            var userdata = [
              {
                user_id: assistanceuseraadobjectid,
                user_name: assistanceusername,
              },
            ];
            const res = await SendSOSClosedCardToRequester(
              userdata,
              [],
              serviceurl,
              tenentid,
              assistanceuseraadobjectid
            );
            // if (
            //   admins != null ||
            //   (Array.isArray(admins) && admins.length > 0) ||
            //   admins[0].length > 0
            // ) {
            //   const tabObj = new tab.AreYouSafeTab();
            //   tabObj.sendUserCommentToAdmin(
            //     admins,
            //     reqBody.comment,
            //     userAadObjId
            //   );
            // }
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
      if (req.body.data.Location != undefined) {
        userlocation = JSON.parse(req.body.data.Location);
      }
      try {
        const tabObj = new tab.AreYouSafeTab();
        const isProactiveMessageSent = await tabObj.requestAssistance(
          incData,
          userAadObjId,
          userlocation
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
                userAadObjId
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
      const safetyCheckSend = await tabObj.sendSafetyCheckMessage(
        incId,
        teamId,
        createdByUserInfo,
        userAadObjId,
        resendSafetyCheck
      );
      res.send(safetyCheckSend);
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
    } = req.query;
    try {
      incidentService
        .updateSafetyCheckStatus(
          respId,
          isRecurring === "true",
          isSafe,
          respTimestamp,
          adminName,
          userAadObjId
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
  app.get("/areyousafetabhandler/AdminConsentInfo", async (req, res) => {
    const SSOCode = req.query.code || "";
    var details = req.query.state?.toString();
    const Tdata = details?.split("$$$");
    let field = Tdata?.[1];
    const teamId = Tdata?.[0];
    console.log({ AdminconsentinfoteamId: teamId });
    var Tscope =
      "User.Read email openid profile offline_access User.ReadBasic.All User.Read.All";
    //log("Got the resposne in AdminConsentInfo", { query: req.query });
    const aadTokenEndPoint =
      "https://login.microsoftonline.com/common/oauth2/v2.0/token";
    if (SSOCode == "") {
      res.json("No authentication.");
      return;
    } else {
      const oAuthOBOParams = {
        grant_type: "authorization_code",
        client_Id: process.env.MicrosoftAppId,
        client_secret: process.env.MicrosoftAppPassword,
        // client_Id: client_id,
        // client_secret: client_secret,
        code: SSOCode,
        scope: Tscope,
        redirect_uri: `${process.env.serviceUrl}/areyousafetabhandler/AdminConsentInfo`,
      };

      const oAuthOboRequest = Object.keys(oAuthOBOParams)
        .map(
          (key, index) => `${key}=${encodeURIComponent(oAuthOBOParams[key])}`
        )
        .join("&");

      const HEADERS = {
        "content-type": "application/x-www-form-urlencoded",
      };

      try {
        const response = await axios.post(aadTokenEndPoint, oAuthOboRequest, {
          headers: HEADERS,
          // timeout: 10000,
        });
        if (response.status === 200) {
          const refreshToken = response.data.refresh_token
            ? response.data.refresh_token
            : "";
          // log({ refreshToken });
          // log(teamId);
          field =
            field.toLowerCase() == "whatsapp"
              ? "send_whatsapp"
              : field.toLowerCase() == "filter"
              ? "FILTER_ENABLED"
              : "send_sms";
          let config = {
            method: "post",
            maxBodyLength: Infinity,
            url: `${process.env.serviceUrl}/areyousafetabhandler/setRefreshToken?teamId=${teamId}&refresh_token=${refreshToken}&field=${field}`,
            // timeout: 10000,
          };
          axios
            .request(config)

            .then((response) => {
              const msg = `<div style="text-align: center;margin-left: 25%;background: white;padding: 30px;margin: auto;vertical-align: middle;position: absolute;top: 50%;right: 0px;bottom: 50%;left: 0px;display: inline-table;font-family: &quot;Montserrat&quot;, sans-serif;"><h1 style=" margin-bottom: 20px;font-weight: 700;font-family: &quot;Montserrat&quot;, sans-serif;font-size: 70px;">Are You Safe?</h1><div style="vertical-align:middle; text-align:center; box-shadow:none;padding:0px"><img src="https://areyousafe.in/img/SafetyBot%20Icon.png" style=" width: 150px;"></div><h3 style="margin-bottom: 5px;font-size: 31px;">Thank you for granting permission(s)</h3> <label style="font-family: &quot;Montserrat&quot;, sans-serif;font-weight: 700;display: inline-block;padding: 10px 20px;border-radius: 4px;color: #fff;color: #5783db;text-decoration: none;font-size: 21px;">Go back to Teams and reload the Safety check tab</label></div>`;
              res.status(200).send(msg);
            })
            .catch((error) => {
              console.log({ "Error in Saving refresh token": error });
              processSafetyBotError(
                error,
                teamId,
                "",
                "",
                "Error in Saving refresh token, isRefershTokenBlank: " +
                  (refreshToken ? "true" : "false")
              );
            });
        } else {
          if (
            response.data.error === "invalid_grant" ||
            response.data.error === "interaction_required" ||
            response.data.error == "insufficient_claims"
          ) {
            res.status(403).json({ error: "consent_required" });
          } else {
            res.status(500).json({ error: "Could not exchange access token" });
          }
        }
      } catch (error) {
        console.log({ "Calling the Axios": JSON.stringify(error) });
        processSafetyBotError(
          error,
          teamId,
          "",
          "",
          "Error in processing grant permission in adminconsentinfo"
        );
        //log({ error: `unknown error ${error}` });
        res.status(400).json({ error: `unknown error ${error}` });
      }
    }
  });

  app.get("/posresp", async (req, res) => {
    const userAgent = req.headers["user-agent"];
    console.log("useragent", userAgent);
    const botAgents = [
      "Google-PageRenderer",
      "Google (+https://developers.google.com/+/web/snippet/)",
      // Add more if you find other auto-clickers
    ];
    if (botAgents.some((agent) => userAgent.includes(agent))) {
      console.log("Ignored auto-click from bot/crawler:", userAgent);
      return res.status(204).end(); // No Content
    }
    console.log("got reply for sms", req.query);
    let { userId, eventId } = req.query;
    console.log({ userId, eventId });
    await bot.proccessSMSLinkClick(userId, eventId, "YES");
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
      "SMS",
      "",
      eventId,
      "LINK_CLICKED",
      "",
      "",
      "",
      "YES",
      ""
    );
    res.redirect(
      process.env.SMS_CONFIRMATION_URL +
        "?userId=" +
        userId +
        "&eventId=" +
        eventId
    );
  });
  app.get("/negresp", async (req, res) => {
    const userAgent = req.headers["user-agent"];
    console.log("useragent", userAgent);
    const botAgents = [
      "Google-PageRenderer",
      "Google (+https://developers.google.com/+/web/snippet/)",
      // Add more if you find other auto-clickers
    ];
    if (botAgents.some((agent) => userAgent.includes(agent))) {
      console.log("Ignored auto-click from bot/crawler:", userAgent);
      return res.status(204).end(); // No Content
    }
    console.log("got reply for sms", req.query);
    let { userId, eventId } = req.query;
    console.log({ userId, eventId });
    await bot.proccessSMSLinkClick(userId, eventId, "NO");
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
      "SMS",
      "",
      eventId,
      "LINK_CLICKED",
      "",
      "",
      "",
      "NO",
      ""
    );
    res.redirect(
      process.env.SMS_CONFIRMATION_URL +
        "?userId=" +
        userId +
        "&eventId=" +
        eventId
    );
  });
  app.post("/smscomment", async (req, res) => {
    console.log("got reply for sms comment", req.body);
    let { userId, eventId, comments } = req.body;
    console.log({ userId, eventId, comments });
    await bot.processCommentViaLink(userId, eventId, comments);

    incidentService.saveAllTypeQuerylogs(
      userId,
      "",
      "SMS",
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

      if (!incId || !userAadObjId) {
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
        .input("incId", sql.Int, parseInt(incId))
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
};

module.exports.handlerForSafetyBotTab = handlerForSafetyBotTab;
