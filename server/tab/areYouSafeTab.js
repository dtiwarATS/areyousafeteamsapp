const {
  TeamsInfo,
  TurnContext,
  MessageFactory,
  CardFactory,
} = require("botbuilder");

const incidentService = require("../services/incidentService");
const socketService = require("../socket/socketService");
const fcmService = require("../services/fcmService");

const { sendProactiveMessaageToUser } = require("../api/apiMethods");
const path = require("path");
const ENV_FILE = path.join(__dirname, "../.env");
const db = require("../db");
const dashboard = require("../models/dashboard");
const bot = require("../bot/bot");
const {
  getCompaniesData,
  updateSuperUserDataByUserAadObjId,
  saveNARespSelectedTeams,
  getCompanyDataByTeamId,
} = require("../db/dbOperations");

require("dotenv").config({ path: ENV_FILE });

const {
  ConnectorClient,
  MicrosoftAppCredentials,
} = require("botframework-connector");
const accountSid = process.env.TWILIO_ACCOUNT_ID;
const authToken = process.env.TWILIO_ACCOUNT_AUTH_TOKEN;
const tClient = require("twilio")(accountSid, authToken);
const { Promise } = require("mssql/lib/base");
const { AYSLog } = require("../utils/log");
const {
  processSafetyBotError,
  processBotError,
} = require("../models/processError");
const { json } = require("body-parser");

class AreYouSafeTab {
  getConversationParameters = (members, tenantId) => {
    return {
      isGroup: false,
      channelData: {
        tenant: {
          id: tenantId,
        },
      },
      bot: {
        id: process.env.MicrosoftAppId,
        name: process.env.BotName,
      },
      members: members,
    };
  };

  getAllTeamMembers = async (teamId, serviceUrl) => {
    let allTeamMembers = null;
    try {
      var credentials = new MicrosoftAppCredentials(
        process.env.MicrosoftAppId,
        process.env.MicrosoftAppPassword,
      );
      var connectorClient = new ConnectorClient(credentials, {
        baseUri: serviceUrl,
      });

      allTeamMembers =
        await connectorClient.conversations.getConversationMembers(teamId);
    } catch (err) {
      processSafetyBotError(
        err,
        teamId,
        "",
        "",
        "error in getAllTeamMembers serviceUrl=" + serviceUrl,
      );
    }
    return Promise.resolve(allTeamMembers);
  };

  getStartDate = (startDate) => {
    try {
      const startTime = startDate;
      const createdDate = new Date(startTime);
      const monthName = createdDate.toLocaleString("default", {
        month: "long",
      });
      const creatdDate = createdDate.getDate();
      const createdYear = createdDate.getFullYear();
      return ` ${monthName} ${creatdDate}, ${createdYear}`;
    } catch (err) {
      processSafetyBotError(
        err,
        "",
        "",
        "",
        "error in getStartDate startDate=" + startDate,
      );
    }
  };

  getDurationInWeek = (startDate) => {
    try {
      const currentDate = new Date();
      const startDateTime = new Date(startDate);
      let dateDiff = (currentDate.getTime() - startDateTime.getTime()) / 1000;
      //let dateDiffInMonth = dateDiff / (60 * 60 * 24 * new Date(startDateTime.getFullYear(), startDateTime.getMonth(), 0).getDate());
      let dateDiffInWeek = dateDiff / (60 * 60 * 24 * 7);
      let dateDiffInDay = dateDiff / (60 * 60 * 24);
      let dateDiffInHours = dateDiff / (60 * 60);
      let dateDiffInMin = dateDiff / 60;

      if (Math.abs(parseInt(dateDiffInWeek)) >= 1)
        return Math.abs(parseInt(dateDiffInWeek)) + "w";
      else if (Math.abs(parseInt(dateDiffInDay)) >= 1)
        return Math.abs(parseInt(dateDiffInDay)) + "d";
      else if (Math.abs(parseInt(dateDiffInHours)) >= 1)
        return Math.abs(parseInt(dateDiffInHours)) + "h";
      else if (Math.abs(parseInt(dateDiffInMin)) >= 1)
        return Math.abs(parseInt(dateDiffInMin)) + "m";
      else return Math.abs(parseInt(dateDiff)) + "s";
    } catch (err) {
      processSafetyBotError(
        err,
        "",
        "",
        "",
        "error in getDurationInWeek startDate=" + startDate,
      );
    }
  };

  sortMembers = (members, incTypeId) => {
    let memberObj = null;
    try {
      if (!incTypeId || incTypeId == 1) {
        memberObj = {
          membersSafe: [],
          membersUnsafe: [],
          membersNotResponded: [],
        };

        members.forEach((m) => {
          const {
            response,
            responseValue,
            msgStatus,
            SafetyCheckVisitorsQuestion2Response,
          } = m;

          if (
            (response === "na" || response === false) &&
            msgStatus?.toString()?.trim() != null
          ) {
            memberObj.membersNotResponded.push(m);
          } else if (response === true) {
            if (responseValue === 1) {
              memberObj.membersSafe.push({
                ...m,
                SafetyCheckVisitorsQuestion3Response: null,
              });
              if (SafetyCheckVisitorsQuestion2Response == 0) {
                memberObj.membersUnsafe.push({
                  ...m,
                  userName: `${m.userName} (Visitors)`,
                });
              } else if (SafetyCheckVisitorsQuestion2Response == 1) {
                memberObj.membersSafe.push({
                  ...m,
                  userName: `${m.userName} (Visitors)`,
                });
              }
            } else if (responseValue === false || responseValue == null) {
              memberObj.membersUnsafe.push(m);
            }
          }
        });
      } else {
        memberObj = {
          notDelivered: [],
          deliveryInProgress: [],
          delivered: [],
        };
        members.forEach((m) => {
          const { isMessageDelivered, msgStatus, response } = m;

          if (!msgStatus || msgStatus?.toString()?.trim() == "") {
            memberObj.deliveryInProgress.push(m);
          } else if (isMessageDelivered === true && !response) {
            memberObj.delivered.push(m);
          } else if (isMessageDelivered === false) {
            memberObj.notDelivered.push(m);
          }
        });
      }
    } catch (err) {
      processSafetyBotError(
        err,
        "",
        "",
        "",
        "error in sortMembers members=" +
          JSON.stringify(members) +
          " incTypeId=" +
          incTypeId,
      );
    }
    return memberObj;
  };

  getFormatedIncData = (incData, teamInfo, userObjId) => {
    let incFormatedData = [];
    try {
      if (incData != null && incData.length > 0) {
        let teamObj = null;
        if (teamInfo != null && teamInfo.length > 0) {
          teamObj = {};
          teamInfo.forEach((team) => {
            teamObj[team.teamId] = team.teamName;
            teamObj["userid"] = team.userid;
          });
        }

        incData.forEach((inc) => {
          const {
            incId,
            incTitle: title,
            incCreatedByName: createdBy,
            membersCount,
            messageDeliveredCount,
            incTypeId,
            additionalInfo,
            travelUpdate,
            contactInfo,
            situation,
            isTestRecord,
            teamId,
            incType,
            isSavedAsDraft,
            isSaveAsTemplate,
            updatedOn,
            incTemplate: incTemplate,
            SafetyCheckVisitorsQuestion1Response,
            SafetyCheckVisitorsQuestion2Response,
            SafetyCheckVisitorsQuestion3Response,
            EnableSendReminders,
            SendRemindersCount,
            SendRemindersTime,
            incidentMediafiles,
            responseOptions,
            selectedMembersCount,
          } = inc;

          if (messageDeliveredCount == 0 && isTestRecord) {
            return;
          }
          const status = inc.incStatusId === 2 ? "Closed" : "In progress";
          const startDate = this.getStartDate(inc.incCreatedDate);
          const duration = this.getDurationInWeek(
            inc.incCreatedDate,
          ).toString();

          let safe = null;
          let needAssistance = null;
          let notResponded = null;
          let safeCount = 0;
          let needAssistanceCount = 0;
          let notRespondedCount = 0;
          let responsePercentage = "0%";

          let notDelivered = null;
          let deliveryInProgress = null;
          let delivered = null;
          let notDeliveredCount = 0;
          let deliveryInProgressCount = 0;
          let deliveredCount = 0;

          let responses = [];
          let respOptions = JSON.parse(responseOptions);
          if (
            inc.members != null &&
            inc.members.length > 0 &&
            !isSavedAsDraft &&
            !isSaveAsTemplate
          ) {
            const memberObj = this.sortMembers(inc.members, inc.incTypeId);
            if (memberObj != null) {
              if (!incTypeId || incTypeId == 1) {
                safe = memberObj.membersSafe;
                needAssistance = memberObj.membersUnsafe;
                notResponded = memberObj.membersNotResponded;
                safeCount = memberObj.membersSafe.length;
                needAssistanceCount = memberObj.membersUnsafe.length;
                notRespondedCount = memberObj.membersNotResponded.length;

                if (needAssistanceCount > 0 || safeCount > 0) {
                  responsePercentage =
                    Math.round(
                      ((needAssistanceCount + safeCount) * 100) /
                        inc.members.length,
                    ).toString() + "%";
                }
              } else {
                notDelivered = memberObj.notDelivered;
                deliveryInProgress = memberObj.deliveryInProgress;
                delivered = memberObj.delivered;
                notDeliveredCount = memberObj.notDelivered.length;
                deliveryInProgressCount = memberObj.deliveryInProgress.length;
                deliveredCount = memberObj.delivered.length;
              }
            }
            if (incTypeId && respOptions && respOptions.length > 0) {
              respOptions.forEach((resp) => {
                const dashResp = {};
                let usersWithResponse = inc.members.filter((m) => {
                  return m.responseValue == resp.id;
                });
                dashResp.response = resp.id;
                dashResp.responseText = resp.option;
                dashResp.color = resp.color;
                dashResp.responseCount = usersWithResponse.length;
                dashResp.users = usersWithResponse;
                responses.push(dashResp);
              });
              //console.log({responses});
            }
          }

          const teamName = teamObj && teamObj[teamId] ? teamObj[teamId] : "";
          const userid = teamObj && teamObj["userid"] ? teamObj["userid"] : "";
          const incObj = {
            incId,
            status,
            title,
            createdBy,
            startDate,
            duration,
            incTypeId,
            safe,
            needAssistance,
            notResponded,
            safeCount,
            needAssistanceCount,
            notRespondedCount,
            notDelivered,
            deliveryInProgress,
            delivered,
            notDeliveredCount,
            deliveryInProgressCount,
            deliveredCount,
            responsePercentage,
            teamName,
            membersCount,
            messageDeliveredCount,
            additionalInfo,
            travelUpdate,
            contactInfo,
            situation,
            teamId,
            incType,
            isSavedAsDraft,
            isSaveAsTemplate,
            updatedOn,
            incTemplate,
            SafetyCheckVisitorsQuestion1Response,
            SafetyCheckVisitorsQuestion2Response,
            SafetyCheckVisitorsQuestion3Response,
            EnableSendReminders,
            SendRemindersCount,
            SendRemindersTime,
            incidentMediafiles,
            userid,
            responses,
            selectedMembersCount,
          };
          incFormatedData.push(incObj);
        });
      }
    } catch (err) {
      console.log(err);
      processSafetyBotError(
        err,
        "",
        "",
        userObjId,
        "error in getFormatedIncData incData=" +
          JSON.stringify(incData) +
          " teamInfo=" +
          JSON.stringify(teamInfo),
      );
    }
    return incFormatedData;
  };
  getEnable = async (teamId, userAadObjId) => {
    const useAadObjId = await incidentService.getenablecheck(teamId);
  };

  getTeamMembers = async (teamId, userAadObjId) => {
    let teamsMembers = null;
    try {
      let teamsMembersWithsSuperUserFlag = null;
      if (teamId != null && teamId != "null") {
        const superUsers = await incidentService.getSuperUsersByTeamId(teamId);
        let superUsersLeftJoinQuery = null;
        if (superUsers.length > 0) {
          const superUsersArr = superUsers[0]["super_users"]
            .split(",")
            .map((useAadObjId, index) => {
              if (useAadObjId) {
                if (index == 0) {
                  return ` select '${useAadObjId}' useAadObjId `;
                } else {
                  return ` union all select '${useAadObjId}' useAadObjId `;
                }
              }
            });
          if (superUsersArr.length > 0) {
            superUsersLeftJoinQuery =
              `left join (Select * from (` +
              superUsersArr.join(" ") +
              ") t ) tblAadObjId on tblAadObjId.useAadObjId = u.user_aadobject_id ";
          }
        }
        let CreateIncidentUsersLeftJoinQuery = null;
        const CreateIncidentUsers =
          await incidentService.getCreateIncidentUsersByTeamId(teamId);
        if (
          CreateIncidentUsers.length > 0 &&
          CreateIncidentUsers[0]["WHO_CAN_CREATE_INCIDENT"] != null &&
          CreateIncidentUsers[0]["WHO_CAN_CREATE_INCIDENT"] != ""
        ) {
          const createIncidentUsersArr = CreateIncidentUsers[0][
            "WHO_CAN_CREATE_INCIDENT"
          ]
            .split(",")
            .map((useAadObjId, index) => {
              if (useAadObjId) {
                if (index == 0) {
                  return ` select '${useAadObjId}' useAadObjId `;
                } else {
                  return ` union all select '${useAadObjId}' useAadObjId `;
                }
              }
            });
          if (createIncidentUsersArr.length > 0) {
            CreateIncidentUsersLeftJoinQuery =
              `left join (Select * from (` +
              createIncidentUsersArr.join(" ") +
              ") t1 ) tblAadObjId1 on tblAadObjId1.useAadObjId = u.user_aadobject_id ";
          }
        }
        teamsMembers = await incidentService.getAllTeamMembersByTeamId(
          teamId,
          "value",
          "title",
          userAadObjId,
          superUsersLeftJoinQuery,
          CreateIncidentUsersLeftJoinQuery,
        );
      } else if (teamId == null || teamId == "null") {
        var memberqery = `SELECT 
    MIN(tu.id) AS id,
    MIN(tu.team_id) AS team_id,
    tu.user_aadobject_id,
    MIN(tu.user_id) AS value,
    MIN(tu.user_name) AS title,
    MIN(tu.email) AS email,
    CASE 
        WHEN tu.user_aadobject_id = '${userAadObjId}'
             AND EXISTS (
                 SELECT 1
                 FROM MSTeamsInstallationDetails mid
                 WHERE mid.WHO_CAN_CREATE_INCIDENT IS NOT NULL
                   AND mid.WHO_CAN_CREATE_INCIDENT <> ''
                   AND mid.WHO_CAN_CREATE_INCIDENT LIKE '%${userAadObjId}%'
             )
        THEN CAST(1 AS BIT)
        ELSE CAST(0 AS BIT)
    END AS iscreateIncidentUser
FROM MSTeamsTeamsUsers tu
WHERE tu.team_id IN (
    SELECT team_id
    FROM MSTeamsTeamsUsers
    WHERE user_aadobject_id = '${userAadObjId}'
)
GROUP BY tu.user_aadobject_id
ORDER BY email;
`;

        teamsMembers = await db.getDataFromDB(memberqery, userAadObjId);
      }
      // else if (userAadObjId != null && userAadObjId != "null") {
      //   teamsMembers = await incidentService.getAllTeamMembersByUserAadObjId(userAadObjId);
      // }
      // const superUsers = await incidentService.getSuperUsersByTeamId(teamId);
      // let superUsersArr = [];
      // if (superUsers.length > 0) {
      //   superUsersArr = superUsers[0]["super_users"].split(",");
      // }
      // if (superUsersArr.length > 0 && teamsMembers && teamsMembers.length > 0) {
      //   teamsMembers.forEach(usr => {
      //     const isSuperUser = superUsersArr.includes(usr.userAadObjId);
      //     if (isSuperUser) {
      //       usr.isSuperUser = true;
      //     }
      //   });
      //   // teamsMembersWithsSuperUserFlag = teamsMembers.map((usr) => {

      //   //   usr.isSuperUser = isSuperUser;
      //   //   return usr;
      //   // });
      // }
      // if (teamsMembersWithsSuperUserFlag && teamsMembersWithsSuperUserFlag.length > 0) {
      //   teamsMembers = teamsMembersWithsSuperUserFlag;
      // }
    } catch (err) {
      processSafetyBotError(
        err,
        teamId,
        "",
        userAadObjId,
        "error in getTeamMembers",
      );
    }
    return Promise.resolve(teamsMembers);
  };
  GetAllMembersByTenantid = async (Tenantid) => {
    let teamsMembers = null;
    try {
      var memberqery = `
select user_name as title,user_aadobject_id as userAadObjId ,USER_ID as value,STATE as state, CITY as city,COUNTRY as country, DEPARTMENT as department,hasLicense as hasLicense ,email,conversationId,0 AS isAdmin,
    0 AS isSuperUser from MSTeamsTeamsUsers where tenantid= '${Tenantid}' and hasLicense=1

;
`;
      teamsMembers = await db.getDataFromDB(memberqery, "");
    } catch (err) {
      processSafetyBotError(err, Tenantid, "", "", "error in getTeamMembers");
    }
    return Promise.resolve(teamsMembers);
  };
  requestAssistance = async (
    data,
    userAadObjId,
    userlocation,
    requestAssistanceid,
    sendonetime,
  ) => {
    let isMessageSent = false;
    var isVisi = false;
    var LocationUrl;
    var MapUrl;
    //  var ids = data[0].map((item) => item.user_aadobject_id).join(", ");
    let userAadObjIds = data[0].map((x) => x.user_aadobject_id);
    let usrPhones = await bot.getUserPhone(
      data[0][0].IS_APP_PERMISSION_GRANTED,
      data[0][0].user_tenant_id,
      userAadObjIds,
    );
    console.log({ usrPhones });
    try {
      let admins = data[0];
      let user = data[1][0];
      if (admins != null && admins.length > 0) {
        let mentionUserEntities = [];
        dashboard.mentionUser(
          mentionUserEntities,
          user.user_id,
          user.user_name,
        );
        // var LocationUrl =
        //   "https://maps.googleapis.com/maps/api/staticmap?center=" +
        //   userlocation.lat +
        //   "," +
        //   userlocation.lon +
        //   "&zoom=14&size=400x400&key=AIzaSyB2FIiWQhNij5JqYOsx5Q-Ohg9UbgmXCwg";
        var Ulocation = "";
        if (user?.DYNAMIC_LOCATION != null) {
          Ulocation = `📍${user?.DYNAMIC_LOCATION}`;
        }
        const approvalCardResponse = {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          appId: process.env.MicrosoftAppId,
          body: [
            {
              type: "TextBlock",
              text: `**<at>${user.user_name}</at>** needs assistance.\n
              ${Ulocation}`,
              wrap: true,
            },
            ...(sendonetime == "true"
              ? [
                  {
                    type: "ActionSet",
                    actions: [
                      {
                        type: "Action.Execute",
                        title: "Accept and respond",
                        verb: "respond_to_assistance",
                        data: {
                          userAadObjId: userAadObjId,
                          requestAssistanceid: requestAssistanceid,
                          tenantId: data[0][0].user_tenant_id,
                          serviceUrl: data[0][0].serviceUrl,
                        },
                      },
                    ],
                  },
                ]
              : []),
            // {
            //   type: "Action.Image",
            //   url: `${LocationUrl}`,
            //   size: "Medium",
            //   width: "500px",
            //   height: "500px",
            // },
            // {
            //   type: "Image",
            //   url: `${LocationUrl}`,
            //   isVisible: isVisi,
            //   selectAction: {
            //     type: "Action.OpenUrl",
            //     url: `${MapUrl}`,
            //     role: "Link",
            //   },
            // },
          ],
          msteams: {
            entities: mentionUserEntities,
          },
          type: "AdaptiveCard",
          version: "1.4",
        };
        var cardLocation;
        if (userlocation != null) {
          isVisi = true;
          LocationUrl =
            "https://maps.googleapis.com/maps/api/staticmap?center=" +
            userlocation.lat +
            "," +
            userlocation.lon +
            "&zoom=20&size=400x400&&markers=color:red%7Clabel:%7C" +
            userlocation.lat +
            "," +
            userlocation.lon +
            "&key=AIzaSyB2FIiWQhNij5JqYOsx5Q-Ohg9UbgmXCwg";
          console.log({ LocationUrl });
          MapUrl =
            "https://www.bing.com/maps?rtp=adr.%7Epos." +
            userlocation.lat +
            "_" +
            userlocation.lon +
            "&cp=" +
            userlocation.lat +
            "%7E" +
            userlocation.lon +
            "&lvl=14.5";
          cardLocation = {
            type: "Image",
            url: `${LocationUrl}`,
            isVisible: isVisi,
            selectAction: {
              type: "Action.OpenUrl",
              url: `${MapUrl}`,
              role: "Link",
            },
          };
          approvalCardResponse.body.push(cardLocation);
        }

        const baseUrl =
          process.env.BASE_URL ||
          process.env.serviceUrl?.replace("/api/messages", "") ||
          "http://localhost:3978";
        const adminArr = [];
        const emittedTenants = new Set();
        for (let i = 0; i < admins.length; i++) {
          if (adminArr.includes(admins[i].user_id)) {
            continue;
          }
          adminArr.push(admins[i].user_id);
          if (
            admins[i].serviceUrl != null &&
            admins[i].user_tenant_id != null
          ) {
            let memberArr = [
              {
                id: admins[i].user_id,
                name: admins[i].user_name,
              },
            ];
            try {
              incidentService.saveAllTypeQuerylogs(
                admins[i].user_aadobject_id,
                "",
                "SOS_TEAMS",
                "",
                requestAssistanceid,
                "SENDING",
                "",
                "",
                "",
                "",
                "",
              );
              const res = await sendProactiveMessaageToUser(
                memberArr,
                approvalCardResponse,
                null,
                admins[i].serviceUrl,
                admins[i].user_tenant_id,
                null,
                userAadObjId,
              ).then(() => {
                incidentService.saveAllTypeQuerylogs(
                  admins[i].user_aadobject_id,
                  "",
                  "SOS_TEAMS",
                  "",
                  requestAssistanceid,
                  "SEND_SUCCESS",
                  "",
                  "",
                  "",
                  "",
                  "",
                );
              });
              if (!emittedTenants.has(admins[i].user_tenant_id)) {
                emittedTenants.add(admins[i].user_tenant_id);
                socketService.emitNewSosTeams(admins[i].user_tenant_id, {
                  requestAssistanceid,
                  userAadObjId,
                  user: { user_name: user.user_name, user_id: user.user_id },
                  userlocation,
                });
              }
            } catch (ex) {
              incidentService.saveAllTypeQuerylogs(
                admins[i].user_aadobject_id,
                "",
                "SOS_TEAMS",
                "",
                requestAssistanceid,
                "SENDING_ERROR",
                "",
                "",
                "",
                "",
                JSON.stringify(ex),
              );
            }

            if (
              admins[i].SOS_NOTIFICATION.includes("SMS") &&
              sendonetime == "true"
            ) {
              usrPhones.map(async (userpho) => {
                if (userpho.id == admins[i].user_aadobject_id) {
                  var num =
                    admins[i].PHONE_FIELD == "businessPhones"
                      ? userpho.businessPhones[0]
                      : userpho.mobilePhone;
                  // var num = "+91 8652473863";
                  if (num) {
                    try {
                      incidentService.saveAllTypeQuerylogs(
                        admins[i].user_aadobject_id,
                        "",
                        "SOS_SMS",
                        num.slice(-4).padStart(num.length, "x"),
                        requestAssistanceid,
                        "SENT_TO_TWILIO",
                        "",
                        "",
                        "",
                        "",
                        "",
                      );
                      // Construct accept link - use environment variable or default
                      const baseUrl =
                        process.env.BASE_URL ||
                        process.env.serviceUrl?.replace("/api/messages", "") ||
                        "http://localhost:3978";
                      const acceptLink = `${baseUrl}/acceptSOS?id=${requestAssistanceid}&adminId=${admins[i].user_aadobject_id}`;

                      var twiliosend = await tClient.messages
                        .create({
                          body: `SOS Alert: ${user.user_name} needs assistance. Accept and respond: ${acceptLink}`,
                          from: "+18023277232",
                          shortenUrls: true,
                          messagingServiceSid:
                            "MGdf47b6f3eb771ed026921c6e71017771",
                          to: num,
                        })
                        .then((res) => {
                          console.log({ res });
                          incidentService.saveAllTypeQuerylogs(
                            admins[i].user_aadobject_id,
                            "",
                            "SOS_SMS",
                            num.slice(-4).padStart(num.length, "x"),
                            requestAssistanceid,
                            "SEND_SUCCESS",
                            "",
                            "",
                            "",
                            "",
                            "",
                          );
                        });
                    } catch (err) {
                      console.log({ err });
                      incidentService.saveAllTypeQuerylogs(
                        admins[i].user_aadobject_id,
                        "",
                        "SOS_SMS",
                        num.slice(-4).padStart(num.length, "x"),
                        requestAssistanceid,
                        "SEND_FAILED",
                        "",
                        "",
                        "",
                        "",
                        JSON.stringify(err.message),
                      );
                    }
                  } else {
                    incidentService.saveAllTypeQuerylogs(
                      admins[i].user_aadobject_id,
                      "",
                      "SOS_SMS",
                      num.slice(-4).padStart(num.length, "x"),
                      requestAssistanceid,
                      "PHONE_NUM_NOT_FOUND",
                      "",
                      "",
                      "",
                      "",
                      "",
                    );
                  }
                }
              });
            }
            if (admins[i].SEND_EMAIL && sendonetime == "true") {
              try {
                var useremail = admins[i].email;
                if (useremail) {
                  try {
                    incidentService.saveAllTypeQuerylogs(
                      admins[i].user_aadobject_id,
                      "",
                      "SOS_EMAIL",
                      useremail,
                      requestAssistanceid,
                      "SENT_TO_EMAIL",
                      "",
                      "",
                      "",
                      "",
                      "",
                    );
                    // Construct accept link for email
                    const baseUrl =
                      process.env.BASE_URL ||
                      process.env.serviceUrl?.replace("/api/messages", "") ||
                      "http://localhost:3978";
                    const acceptLink = `${baseUrl}/acceptSOS?id=${requestAssistanceid}&adminId=${admins[i].user_aadobject_id}`;

                    const emailBody = `
                      <div style="font-family: Arial, sans-serif; padding: 20px;">
                        <h2 style="color: #dc3545;">SOS Alert</h2>
                        <p><strong>${user.user_name}</strong> needs assistance.</p>
                        <div style="margin: 30px 0;">
                          <a href="${acceptLink}" 
                             style="background-color: #28a745; color: white; padding: 12px 24px; 
                                    text-decoration: none; border-radius: 4px; display: inline-block; 
                                    font-weight: bold;">
                            Accept and respond
                          </a>
                        </div>
                      </div>
                    `;

                    const raw = JSON.stringify({
                      projectName: "AYS",
                      emailSubject: `Safety check - SOS`,

                      emailBody: emailBody,
                      emailTo: admins[i].email,
                      emailFrom: "donotreply@safetycheck.in",
                      authkey: "A9fG4dX2pL7qW8mZ",
                    });
                    const myHeaders = new Headers();
                    myHeaders.append("Content-Type", "application/json");
                    const requestOptions = {
                      method: "POST",
                      headers: myHeaders,
                      body: raw,
                      redirect: "follow",
                    };
                    const response = fetch(
                      "https://emailservices.azurewebsites.net/api/sendCustomEmailWithBodyParams",
                      requestOptions,
                    ).then((res) => {
                      console.log({ res });
                      incidentService.saveAllTypeQuerylogs(
                        admins[i].user_aadobject_id,
                        "",
                        "SOS_EMAIL",
                        useremail,
                        requestAssistanceid,
                        "SEND_SUCCESS",
                        "",
                        "",
                        "",
                        "",
                        "",
                      );
                    });
                  } catch (err) {
                    console.log({ err });
                    incidentService.saveAllTypeQuerylogs(
                      admins[i].user_aadobject_id,
                      "",
                      "SOS_EMAIL",
                      useremail,
                      requestAssistanceid,
                      "SEND_FAILED",
                      "",
                      "",
                      "",
                      "",
                      JSON.stringify(err.message),
                    );
                  }
                } else {
                  incidentService.saveAllTypeQuerylogs(
                    admins[i].user_aadobject_id,
                    "",
                    "SOS_EMAIL",
                    "",
                    requestAssistanceid,
                    "EMAIL_NOT_FOUND",
                    "",
                    "",
                    "",
                    "",
                    "",
                  );
                }
              } catch (err) {
                processSafetyBotError(
                  err,
                  companyData.teamId,
                  user.id,
                  null,
                  "error in sending safety check via EMAIL",
                );
              }
            }
            if (
              admins[i].SOS_NOTIFICATION.includes("WhatsApp") &&
              sendonetime == "true"
            ) {
              usrPhones.map(async (userpho) => {
                if (userpho.id == admins[i].user_aadobject_id) {
                  var num =
                    admins[i].PHONE_FIELD == "businessPhones"
                      ? userpho.businessPhones[0]
                      : userpho.mobilePhone;
                  //var num = "+918652473863";
                  if (num) {
                    try {
                      incidentService.saveAllTypeQuerylogs(
                        admins[i].user_aadobject_id,
                        "",
                        "SOS_Whatsapp",
                        num.slice(-4).padStart(num.length, "x"),
                        requestAssistanceid,
                        "SENT_TO_WHATSAPP",
                        "",
                        "",
                        "",
                        "",
                        "",
                      );
                      // Construct accept link for WhatsApp button
                      const baseUrl =
                        process.env.BASE_URL ||
                        process.env.serviceUrl?.replace("/api/messages", "") ||
                        "http://localhost:3978";
                      const acceptLink = `${baseUrl}/acceptSOS?id=${requestAssistanceid}&adminId=${admins[i].user_aadobject_id}`;

                      // Send template message first
                      let templatePayload = {
                        messaging_product: "whatsapp",
                        recipient_type: "individual",
                        to: num,
                        type: "template",
                        template: {
                          name: "safetycheck_sos",
                          language: {
                            code: "en",
                          },
                          components: [
                            {
                              type: "body",
                              parameters: [
                                {
                                  type: "text",
                                  parameter_name: "username",
                                  text: user.user_name,
                                },
                              ],
                            },
                            // {
                            //   type: "button",
                            //   sub_type: "quick_reply",
                            //   index: "0",
                            //   parameters: [
                            //     {
                            //       type: "payload",
                            //       payload: `ACCEPT_SOS_${admins[i].user_aadobject_id}_${requestAssistanceid}`,
                            //     },
                            //   ],
                            // },
                          ],
                        },
                      };

                      // Send template message
                      await bot
                        .sendWhatsappMessage(
                          templatePayload,
                          admins[i].user_aadobject_id,
                          admins[i],
                        )
                        .then((res) => {
                          console.log(res.Status);
                          if (res?.Status) {
                            incidentService.saveAllTypeQuerylogs(
                              admins[i].user_aadobject_id,
                              "",
                              "SOS_Whatsapp",
                              num.slice(-4).padStart(num.length, "x"),
                              requestAssistanceid,
                              "SEND_SUCCESS",
                              "",
                              "",
                              "",
                              "",
                              "",
                            );
                          } else if (res?.err) {
                            incidentService.saveAllTypeQuerylogs(
                              admins[i].user_aadobject_id,
                              "",
                              "SOS_Whatsapp",
                              num.slice(-4).padStart(num.length, "x"),
                              requestAssistanceid,
                              "SEND_FAILED",
                              "",
                              "",
                              "",
                              "",
                              JSON.stringify(res?.err) || "err",
                            );
                          }
                        });
                    } catch (err) {
                      console.log({ err });
                      incidentService.saveAllTypeQuerylogs(
                        admins[i].user_aadobject_id,
                        "",
                        "SOS_Whatsapp",
                        num.slice(-4).padStart(num.length, "x"),
                        requestAssistanceid,
                        "SEND_FAILED",
                        "",
                        "",
                        "",
                        "",
                        JSON.stringify(err.message),
                      );
                    }
                  } else {
                    incidentService.saveAllTypeQuerylogs(
                      admins[i].user_aadobject_id,
                      "",
                      "SOS_Whatsapp",
                      "",
                      requestAssistanceid,
                      "PHONE_NUM_NOT_FOUND",
                      "",
                      "",
                      "",
                      "",
                      "",
                    );
                  }
                }
              });
            }
          }
        }
        try {
          await fcmService.sendSosPushToAdmins(
            admins,
            user,
            userAadObjId,
            requestAssistanceid,
            baseUrl,
            incidentService,
          );
        } catch (pushErr) {
          console.error("[requestAssistance] sendSosPushToAdmins error:", pushErr);
        }
        bot.sendNSRespToTeamChannel(
          admins[0].user_tenant_id,
          approvalCardResponse,
          userAadObjId,
        );
        isMessageSent = true;
      }
    } catch (err) {
      console.log(err);
      processSafetyBotError(
        err,
        "",
        "",
        userAadObjId,
        "error in requestAssistance data=" + data,
      );
    }
    return isMessageSent;
  };

  saveAssistance = async (
    adminsData,
    user,
    ts,
    userAadObjId,
    userlocation,
    UserDataUpdateID,
  ) => {
    let res = null;
    try {
      if (adminsData != null && adminsData.length > 0) {
        let sentToIds = [];
        let teamIds = "";
        let sentToNames = "";
        const userTemasArr = [];
        const userTemasObj = {};
        adminsData.forEach((element, index) => {
          if (element.serviceUrl != null && element.user_tenant_id != null) {
            const teamName = element.team_name;
            if (userTemasObj[teamName] == null) {
              userTemasArr.push(teamName);
              userTemasObj[teamName] = [];
              teamIds +=
                teamIds === "" ? element.team_id : ", " + element.team_id;
            }
            userTemasObj[teamName].push(element.user_name);
            if (!sentToIds.includes(element.user_id)) {
              sentToIds.push(element.user_id);
            }
          }
        });

        if (userTemasArr.length == 1) {
          const teamName = userTemasArr[0];
          const adminsArr = userTemasObj[teamName];
          if (adminsArr && adminsArr.length > 0) {
            adminsArr.forEach((usrName, index) => {
              sentToNames +=
                (index == 0
                  ? ""
                  : index == adminsArr.length - 1
                    ? " and "
                    : ", ") + usrName;
            });
          }
        } else if (userTemasArr.length > 1) {
          const allAdmins = [];
          userTemasArr.forEach((teamName, index) => {
            const adminsArr = userTemasObj[teamName];
            if (adminsArr && adminsArr.length > 0) {
              const currentTeamAdminsArr = [];
              let currentTeamsAdminsStr = "";
              adminsArr.forEach((usrName, index) => {
                if (!allAdmins.includes(usrName)) {
                  allAdmins.push(usrName);
                  currentTeamAdminsArr.push(usrName);
                  currentTeamsAdminsStr +=
                    (currentTeamsAdminsStr === ""
                      ? ""
                      : index == adminsArr.length - 1
                        ? " and "
                        : ", ") + usrName;
                }
              });

              if (currentTeamAdminsArr.length > 0) {
                sentToNames += "\n";
                sentToNames += `${teamName + " - "}`;
                sentToNames += currentTeamsAdminsStr;
              }
            }
          });
        }

        if (sentToIds != "" && UserDataUpdateID == null) {
          res = await db.insertDataIntoDB("MSTeamsAssistance", [
            user.user_id,
            sentToIds.join(","),
            sentToNames,
            "",
            ts,
            "",
            teamIds,
            "null",
          ]);
        } else {
          const updatequerry = `update MSTeamsAssistance set UserLocation='${userlocation}' where id=${UserDataUpdateID}`;
          res = await db.updateDataIntoDB(updatequerry);
        }
      }
    } catch (err) {
      processSafetyBotError(
        err,
        "",
        "",
        userAadObjId,
        "error in saveAssistance adminsData=" + JSON.stringify(adminsData),
      );
    }
    return res;
  };

  sendUserCommentToAdmin = async (
    data,
    userComment,
    userAadObjId,
    requestAssistanceid,
  ) => {
    try {
      let admins = data[0];
      let user = data[1][0];
      if (admins != null && admins.length > 0) {
        let mentionUserEntities = [];
        dashboard.mentionUser(
          mentionUserEntities,
          user.user_id,
          user.user_name,
        );
        const approvalCardResponse = {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          appId: process.env.MicrosoftAppId,
          body: [
            {
              type: "TextBlock",
              text: `User **<at>${user.user_name}</at>** has commented : ${userComment}`,
              wrap: true,
            },
          ],
          msteams: {
            entities: mentionUserEntities,
          },
          type: "AdaptiveCard",
          version: "1.4",
        };
        const adminArr = [];
        for (let i = 0; i < admins.length; i++) {
          if (adminArr.includes(admins[i].user_id)) {
            continue;
          }
          adminArr.push(admins[i].user_id);
          if (
            admins[i].serviceUrl != null &&
            admins[i].user_tenant_id != null
          ) {
            let memberArr = [
              {
                id: admins[i].user_id,
                name: admins[i].user_name,
              },
            ];
            try {
              incidentService.saveAllTypeQuerylogs(
                admins[i].user_aadobject_id,
                "",
                "SOS_TEAMS",
                "",
                requestAssistanceid,
                "SENDING",
                "",
                "",
                "",
                userComment,
                "",
              );
              const res = await sendProactiveMessaageToUser(
                memberArr,
                approvalCardResponse,
                null,
                admins[i].serviceUrl,
                admins[i].user_tenant_id,
                null,
                userAadObjId,
              ).then(() => {
                incidentService.saveAllTypeQuerylogs(
                  admins[i].user_aadobject_id,
                  "",
                  "SOS_TEAMS",
                  "",
                  requestAssistanceid,
                  "SEND_SUCCESS",
                  "",
                  "",
                  "",
                  userComment,
                  "",
                );
              });
            } catch (ex) {
              incidentService.saveAllTypeQuerylogs(
                admins[i].user_aadobject_id,
                "",
                "SOS_TEAMS",
                "",
                requestAssistanceid,
                "SENDING_ERROR",
                "",
                "",
                "",
                userComment,
                JSON.stringify(ex),
              );
            }
            if (admins[i].SOS_NOTIFICATION.includes("SMS")) {
              usrPhones.map(async (userpho) => {
                if (userpho.id == admins[i].user_aadobject_id) {
                  var num =
                    admins[i].PHONE_FIELD == "businessPhones"
                      ? userpho.businessPhones[0]
                      : userpho.mobilePhone;
                  // var num = "+91 8652473863";
                  if (num) {
                    try {
                      incidentService.saveAllTypeQuerylogs(
                        admins[i].user_aadobject_id,
                        num.slice(-4).padStart(num.length, "x"),
                        "SOS_SMS",
                        num.slice(-4).padStart(num.length, "x"),
                        requestAssistanceid,
                        "SENT_TO_TWILIO",
                        "",
                        "",
                        "",
                        userComment,
                        "",
                      );
                      var twiliosend = await tClient.messages
                        .create({
                          body: `${user.user_name} added a comment - ${userComment}`,
                          from: "+18023277232",
                          shortenUrls: true,
                          messagingServiceSid:
                            "MGdf47b6f3eb771ed026921c6e71017771",
                          to: num,
                        })
                        .then((res) => {
                          console.log({ res });
                          incidentService.saveAllTypeQuerylogs(
                            admins[i].user_aadobject_id,
                            "",
                            "SOS_SMS",
                            num.slice(-4).padStart(num.length, "x"),
                            requestAssistanceid,
                            "SEND_SUCCESS",
                            "",
                            "",
                            "",
                            userComment,
                            "",
                          );
                        });
                    } catch (err) {
                      console.log({ err });
                      incidentService.saveAllTypeQuerylogs(
                        admins[i].user_aadobject_id,
                        "",
                        "SOS_SMS",
                        num.slice(-4).padStart(num.length, "x"),
                        requestAssistanceid,
                        "SEND_FAILED",
                        "",
                        "",
                        "",
                        userComment,
                        JSON.stringify(err.message),
                      );
                    }
                  } else {
                    incidentService.saveAllTypeQuerylogs(
                      admins[i].user_aadobject_id,
                      "",
                      "SOS_SMS",
                      "",
                      requestAssistanceid,
                      "PHONE_NUM_NOT_FOUND",
                      "",
                      "",
                      "",
                      userComment,
                      "",
                    );
                  }
                }
              });
            }
            // if (
            //   admins[i].SOS_NOTIFICATION.includes("WhatsApp") &&
            //   sendonetime == "true"
            // ) {
            //   usrPhones.map(async (userpho) => {
            //     if (userpho.id == admins[i].user_aadobject_id) {
            //       var num =
            //         admins[i].PHONE_FIELD == "businessPhones"
            //           ? userpho.businessPhones[0]
            //           : userpho.mobilePhone;
            //       //var num = "+918652473863";
            //       if (num) {
            //         try {
            //           incidentService.saveAllTypeQuerylogs(
            //             admins[i].user_aadobject_id,
            //             "",
            //             "SOS_Whatsapp",
            //             num.slice(-4).padStart(num.length, "x"),
            //             requestAssistanceid,
            //             "SENT_TO_WHATSAPP",
            //             "",
            //             "",
            //             "",
            //             "",
            //             ""
            //           );
            //           let payload = {
            //             messaging_product: "whatsapp",
            //             recipient_type: "individual",
            //             to: num,
            //             type: "template",
            //             template: {
            //               name: "safetycheck_sos",
            //               language: {
            //                 code: "en",
            //               },
            //               components: [
            //                 {
            //                   type: "body",
            //                   parameters: [
            //                     {
            //                       parameter_name: "username",
            //                       type: "text",
            //                       text: `${user.user_name}`, // {{1}} - Company Name
            //                     },
            //                   ],
            //                 },
            //               ],
            //             },
            //           };
            //           await bot
            //             .sendWhatsappMessage(
            //               payload,
            //               admins[i].user_aadobject_id,
            //               admins[i]
            //             )
            //             .then((res) => {
            //               console.log(res.Status);
            //               if (res?.Status) {
            //                 incidentService.saveAllTypeQuerylogs(
            //                   admins[i].user_aadobject_id,
            //                   "",
            //                   "SOS_Whatsapp",
            //                   num.slice(-4).padStart(num.length, "x"),
            //                   requestAssistanceid,
            //                   "SEND_SUCCESS",
            //                   "",
            //                   "",
            //                   "",
            //                   "",
            //                   ""
            //                 );
            //               } else if (res?.err) {
            //                 incidentService.saveAllTypeQuerylogs(
            //                   admins[i].user_aadobject_id,
            //                   "",
            //                   "SOS_Whatsapp",
            //                   num.slice(-4).padStart(num.length, "x"),
            //                   requestAssistanceid,
            //                   "SEND_FAILED",
            //                   "",
            //                   "",
            //                   "",
            //                   "",
            //                   JSON.stringify(res?.err) || "err"
            //                 );
            //               }
            //             });
            //         } catch (err) {
            //           console.log({ err });
            //           incidentService.saveAllTypeQuerylogs(
            //             admins[i].user_aadobject_id,
            //             "",
            //             "SOS_Whatsapp",
            //             num.slice(-4).padStart(num.length, "x"),
            //             requestAssistanceid,
            //             "SEND_FAILED",
            //             "",
            //             "",
            //             "",
            //             "",
            //             JSON.stringify(err.message)
            //           );
            //         }
            //       } else {
            //         incidentService.saveAllTypeQuerylogs(
            //           admins[i].user_aadobject_id,
            //           "",
            //           "SOS_Whatsapp",
            //           "",
            //           requestAssistanceid,
            //           "PHONE_NUM_NOT_FOUND",
            //           "",
            //           "",
            //           "",
            //           "",
            //           ""
            //         );
            //       }
            //     }
            //   });
            // }
          }
        }
        bot.sendNSRespToTeamChannel(
          admins[0].user_tenant_id,
          approvalCardResponse,
          userAadObjId,
        );
      }
    } catch (err) {
      processSafetyBotError(
        err,
        "",
        "",
        userAadObjId,
        "error in sendUserCommentToAdmin data=" + JSON.stringify(data),
      );
    }
  };

  checkDuplicateInc = async (incTitle, teamId, userAadObjId) => {
    let isDuplicate = false;
    try {
      if (teamId == null || teamId == "null" || teamId == "") {
        teamId = await incidentService.getTeamIdByUserAadObjId(userAadObjId);
      }
      if ((teamId != null && teamId != "null") || teamId != "") {
        isDuplicate = await incidentService.verifyDuplicateInc(
          teamId,
          incTitle,
        );
      }
    } catch (err) {
      processSafetyBotError(
        err,
        teamId,
        "",
        userAadObjId,
        "error in checkDuplicateInc incTitle=" + incTitle,
      );
    }
    return Promise.resolve(isDuplicate);
  };

  getBotUserInfo = async (teamId, aadUserObjId) => {
    let userInfo = null;
    if (aadUserObjId != null) {
      try {
        if (teamId == null || teamId == "null") {
          teamId = await incidentService.getTeamIdByUserAadObjId(aadUserObjId);
        }
        userInfo = await incidentService.getUserInfo(teamId, aadUserObjId);
      } catch (err) {
        console.log(err);
        processSafetyBotError(
          err,
          teamId,
          "",
          aadUserObjId,
          "error in getBotUserInfo",
        );
      }
    }
    return Promise.resolve(userInfo);
  };

  createNewIncident = async (incObj, userAadObjId) => {
    let newInc = null;
    try {
      if (incObj != null && incObj.incData != null) {
        let incData = incObj.incData;
        let incId = incObj?.incId ? incObj.incId : -1;
        if (
          incData.incType === "recurringIncident" &&
          incObj.incRecurrData != null
        ) {
          incData = {
            ...incData,
            ...incObj.incRecurrData,
          };
        }
        let memberChoises = null;
        if (incObj.incMembers != null) {
          memberChoises = incObj.incMembers;
        }
        let responseSelectedMembers = null;
        if (incObj.responseSelectedMembers != null) {
          responseSelectedMembers = incObj.responseSelectedMembers;
        }
        let teamIds = null;
        if (incObj.userTeamInfo != null) {
          teamIds = incObj.userTeamInfo;
        }
        let responseSelectedTeams = null;
        if (incObj.responseSelectedTeams != null) {
          responseSelectedTeams = incObj.responseSelectedTeams;
        }
        incData.guidance = incData.guidance.toString().replace(/\\n/g, "\n\n");
        incData.additionalInfo = incData.additionalInfo
          .toString()
          .replace(/\\n/g, "\n\n");
        incData.contactInfo = incData.contactInfo
          .toString()
          .replace(/\\n/g, "\n\n");
        incData.situation = incData.situation
          .toString()
          .replace(/\\n/g, "\n\n");
        incData.incTitle = incData.incTitle.trim();
        incData.incTemplate = incData.incTemplate.trim();
        newInc = await incidentService.createNewInc(
          incData,
          responseSelectedMembers,
          memberChoises,
          userAadObjId,
          responseSelectedTeams,
          teamIds,
          incId,
          incObj.tempfileincId,
        );
      }
    } catch (err) {
      console.log(err);
      processSafetyBotError(
        err,
        "",
        "",
        userAadObjId,
        "error in createNewIncident incObj=" + incObj,
      );
    }
    return Promise.resolve(newInc);
  };
  InsertFileIntoDB = async (filedata, userAadObjId) => {
    let filevalues = Object.keys(filedata).map((key) => filedata[key]);

    const res = await db.insertDataIntoDB("filesdata", filevalues);

    console.log(res);
  };

  DeleteFile = async (filedata, userAadObjId) => {
    let deletfile = `delete from filesdata where inc_id=${filedata.inc_id} and File_name='${filedata.filename}'`;
    const res = await db.updateDataIntoDB(deletfile);

    console.log(res);
  };

  DeleteNeedAssistanceData = async (id) => {
    if (id) {
      let DeleteAssistance = `delete from MSTeamsAssistance where id=${id}`;
      const res = await db.updateDataIntoDB(DeleteAssistance);
    }
  };

  sendSafetyCheckMessage = async (
    incId,
    teamId,
    createdByUserInfo,
    userAadObjId,
    resendSafetyCheck,
  ) => {
    const log = new AYSLog();
    try {
      const safetyCheckSend = await bot.sendSafetyCheckMessageAsync(
        incId,
        teamId,
        createdByUserInfo,
        log,
        userAadObjId,
        resendSafetyCheck,
      );
      return Promise.resolve(safetyCheckSend);
    } catch (err) {
      console.log(err);
      processSafetyBotError(
        err,
        teamId,
        createdByUserInfo?.user_name,
        userAadObjId,
        "error in sendSafetyCheckMessage incId=" +
          incId +
          " resendSafetyCheck=" +
          resendSafetyCheck,
      );
      return true;
    } finally {
      //await log.saveLog(incId);
    }
  };

  getUserTeamInfo = async (userAadObjId) => {
    let userTeamInfo = null;
    try {
      userTeamInfo = await incidentService.getUserTeamInfo(userAadObjId);
    } catch (err) {
      processSafetyBotError(err, "", "", "", "error in getUserTeamInfo");
    }
    return Promise.resolve(userTeamInfo);
  };

  getFilterData = async (teamId) => {
    let filterData = null;
    try {
      filterData = await incidentService.getFilterData(teamId);
    } catch (err) {
      processSafetyBotError(err, "", "", "", "error in getFilterData");
    }
    return Promise.resolve(filterData);
  };

  submitContactUs = async (email, msg, userId, userName) => {
    try {
      const companyData = await getCompaniesData(userId);
      if (companyData != null) {
        bot.sendNewContactEmail(email, msg, companyData, userName);
      }
    } catch (err) {
      processSafetyBotError(
        err,
        "",
        userName,
        userId,
        "error in submitContactUs email=" + email + " msg=" + msg,
      );
    }
  };

  getSuperUsersByTeamId = async (teamId) => {
    let superUsers = null;
    try {
      superUsers = await incidentService.getSuperUsersByTeamId(teamId);
    } catch (err) {
      processSafetyBotError(
        err,
        teamId,
        "",
        null,
        "error in getSuperUsersByTeamId",
      );
    }
    return Promise.resolve(superUsers);
  };

  getenablecheck = async (teamId) => {
    let superUsers = null;
    try {
      superUsers = await incidentService.getenablecheck(teamId);
    } catch (err) {
      processSafetyBotError(err, teamId, "", null, "error in getenablecheck");
    }
    return Promise.resolve(superUsers);
  };

  getSendSMS = async (teamId) => {
    let superUsers = null;
    try {
      superUsers = await incidentService.getSendSMS(teamId);
    } catch (err) {
      processSafetyBotError(err, teamId, "", null, "error in getSendSMS");
    }
    return Promise.resolve(superUsers);
  };

  getEmergencyContacts = async (teamId) => {
    let emergencyContacts = null;
    try {
      emergencyContacts =
        await incidentService.getEmergencyContactsList(teamId);
    } catch (err) {
      processSafetyBotError(
        err,
        teamId,
        "",
        null,
        "error in getEmergencyContacts",
      );
    }
    return Promise.resolve(emergencyContacts);
  };
  deleteSOSResponder = async (teamId, city, country, department) => {
    let res = null;
    try {
      res = await incidentService.deleteSOSResponder(
        teamId,
        city,
        country,
        department,
      );
    } catch (err) {
      processSafetyBotError(
        err,
        teamId,
        "",
        null,
        "error in deleteSOSResponder",
      );
    }
    return Promise.resolve(res);
  };
  saveSOSResponder = async (teamId, rowsToSave) => {
    let res = null;
    try {
      res = await incidentService.saveSOSResponder(teamId, rowsToSave);
    } catch (err) {
      processSafetyBotError(err, teamId, "", null, "error in saveSOSResponder");
    }
    return Promise.resolve(res);
  };

  setSendSMS = async (teamId, sendSMS, phoneField) => {
    let res = null;
    try {
      res = await incidentService.setSendSMS(teamId, sendSMS, phoneField);
    } catch (err) {
      processSafetyBotError(err, teamId, "", null, "error in setSendSMS");
    }
    return Promise.resolve(res);
  };
  SavesmsInfoDisplay = async (teamId, dsiplaysmsinfo) => {
    let res = null;
    try {
      res = await incidentService.SavesmsInfoDisplay(teamId, dsiplaysmsinfo);
    } catch (err) {
      processSafetyBotError(
        err,
        teamId,
        "",
        null,
        "error in SavesmsInfoDisplay",
      );
    }
    return Promise.resolve(res);
  };
  setSendEmail = async (teamId, sendemail) => {
    let res = null;
    try {
      res = await incidentService.setSendEmail(teamId, sendemail);
    } catch (err) {
      processSafetyBotError(err, teamId, "", null, "error in setSendEmail");
    }
    return Promise.resolve(res);
  };
  saveFilterChecked = async (teamId, filterEnabled) => {
    let res = null;
    try {
      res = await incidentService.saveFilterChecked(teamId, filterEnabled);
    } catch (err) {
      processSafetyBotError(
        err,
        teamId,
        "",
        null,
        "error in saveFilterChecked",
      );
    }
    return Promise.resolve(res);
  };
  manageColumns = async (teamId, settingName, value, userId) => {
    let res = null;
    try {
      res = await incidentService.manageColumns(
        teamId,
        settingName,
        value,
        userId,
      );
    } catch (err) {
      processSafetyBotError(err, teamId, "", userId, "error in manageColumns");
    }
    return Promise.resolve(res);
  };
  setSendWhatsapp = async (teamId, sendWhatsapp, phoneField) => {
    let res = null;
    try {
      res = await incidentService.setSendWhatsapp(
        teamId,
        sendWhatsapp,
        phoneField,
      );
    } catch (err) {
      processSafetyBotError(err, teamId, "", null, "error in setsendWhatsapp");
    }
    return Promise.resolve(res);
  };
  setavailableforapp = async (AVAILABLE_FOR, tenantId, teamId) => {
    let res = null;
    try {
      res = await incidentService.setavailableforapp(
        AVAILABLE_FOR,
        tenantId,
        teamId,
      );
    } catch (err) {
      processSafetyBotError(err, teamId, "", null, "error in setsendWhatsapp");
    }
    return Promise.resolve(res);
  };
  SosNotificationFor = async (AVAILABLE_FOR, teamId) => {
    let res = null;
    try {
      res = await incidentService.SosNotificationFor(
        AVAILABLE_FOR,

        teamId,
      );
    } catch (err) {
      processSafetyBotError(
        err,
        teamId,
        "",
        null,
        "error in SosNotificationFor",
      );
    }
    return Promise.resolve(res);
  };

  setLanguagePreference = async (language, teamId, tenantid) => {
    let res = null;
    try {
      res = await incidentService.setLanguagePreference(
        language,

        teamId,
        tenantid,
      );
    } catch (err) {
      processSafetyBotError(
        err,
        teamId,
        "",
        null,
        "error in SosNotificationFor",
      );
    }
    return Promise.resolve(res);
  };
  setDynamicLocation = async (userid, location) => {
    let res = null;
    try {
      res = await incidentService.setDynamicLocation(userid, location);
    } catch (err) {
      processSafetyBotError(err, "", "", userid, "error in setDynamicLocation");
    }
    return Promise.resolve(res);
  };
  // saveRefreshToken = async (teamId, refresh_token, field) => {
  //   let res = null;
  //   try {
  //     res = await incidentService.saveRefreshToken(
  //       teamId,
  //       refresh_token,
  //       field
  //     );
  //     console.log({ res });
  //   } catch (err) {
  //     processSafetyBotError(err, teamId, "", null, "error in saveRefreshToken");
  //   }
  //   return Promise.resolve(res);
  // };
  saveAppPermission = async (
    teamId,
    IsAppPermissionGranted,
    tenantid,
    field,
  ) => {
    let res = null;
    try {
      res = await incidentService.saveAppPermission(
        teamId,
        IsAppPermissionGranted,
        tenantid,
        field,
      );
      console.log({ res });
    } catch (err) {
      processSafetyBotError(
        err,
        teamId,
        "",
        null,
        "error in saveAppPermission",
      );
    }
    return Promise.resolve(res);
  };

  saveUserSetting = async ({
    teamId,
    superUsers,
    userAadObjId,
    selectedTeams,
    EnableSafetycheckForVisitors,
    SafetycheckForVisitorsQuestion1,
    SafetycheckForVisitorsQuestion2,
    SafetycheckForVisitorsQuestion3,
    emergencyContactsStr,
    iscreateIncidentUser,
  }) => {
    let result = null;
    try {
      saveNARespSelectedTeams(teamId, selectedTeams, userAadObjId);
      result = await updateSuperUserDataByUserAadObjId(
        userAadObjId,
        teamId,
        superUsers,
        EnableSafetycheckForVisitors,
        SafetycheckForVisitorsQuestion1,
        SafetycheckForVisitorsQuestion2,
        SafetycheckForVisitorsQuestion3,
        emergencyContactsStr,
        iscreateIncidentUser,
      );
    } catch (err) {
      processSafetyBotError(
        err,
        teamId,
        "",
        userAadObjId,
        "error in saveUserSetting",
      );
    }
    return Promise.resolve(result);
  };

  getIncDataToCopyInc = async (incId, userAadObjId) => {
    try {
      let teamId = "",
        selectedUsers = "";
      const incData = await incidentService.getInc(incId, null, userAadObjId);
      if (incData) {
        teamId = incData.teamId;
        selectedUsers = incData.selectedMembers;
      }

      // const incSelectedMembersData = await incidentService.getIncSelectedMembers(selectedUsers, teamId, userAadObjId);
      // const incResponseMembersData = await incidentService.getIncResponseMembers(incId, teamId, userAadObjId);

      let incSelectedMembersData = null,
        incResponseMembersData = null,
        incResponseTeamsData = null,
        incidentMediafiles = null;
      let incDataToCopy = await incidentService.getIncDataToCopyInc(
        incId,
        selectedUsers,
        teamId,
        userAadObjId,
      );

      if (incDataToCopy != null && incDataToCopy.length > 0) {
        incSelectedMembersData = incDataToCopy[0];
        incResponseMembersData = incDataToCopy[1];
        incResponseTeamsData = incDataToCopy[2];
        incidentMediafiles = incDataToCopy[3];
      }

      return {
        incData,
        incResponseMembersData,
        incSelectedMembersData,
        incResponseTeamsData,
        incidentMediafiles,
      };
    } catch (err) {
      processSafetyBotError(err, "", "", "", "error in getIncDataToCopyInc");
    }
  };

  fetchDataAndUpdateDB = async (teamId) => {
    try {
      const companyData = await getCompanyDataByTeamId(teamId);
      await incidentService
        .getUserInfoByTeamId(teamId)
        .then(async (userInfo) => {
          if (userInfo && userInfo.length > 0) {
            let userIds = userInfo.map((user) => user.user_aadobject_id);
            if (companyData.IS_APP_PERMISSION_GRANTED) {
              await bot.getUserDetails(
                companyData.userTenantId,
                companyData.IS_APP_PERMISSION_GRANTED,
                userIds,
              );
            }
          }
        });
    } catch (err) {
      processSafetyBotError(
        err,
        "",
        "",
        userAadObjId,
        "error in fetchDataAndUpdateDB data=" + JSON.stringify(data),
      );
    }
  };

  processError = async (reqBody) => {
    processBotError(reqBody);
  };
}

module.exports.AreYouSafeTab = AreYouSafeTab;
