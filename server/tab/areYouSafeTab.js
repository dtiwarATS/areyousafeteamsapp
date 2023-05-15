const {
  TeamsInfo,
  TurnContext,
  MessageFactory,
  CardFactory,
} = require("botbuilder");

const incidentService = require("../services/incidentService");

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
} = require("../db/dbOperations");

require("dotenv").config({ path: ENV_FILE });

const {
  ConnectorClient,
  MicrosoftAppCredentials,
} = require("botframework-connector");
const { Promise } = require("mssql/lib/base");
const { AYSLog } = require("../utils/log");
const {
  processSafetyBotError,
  processBotError,
} = require("../models/processError");

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
        process.env.MicrosoftAppPassword
      );
      var connectorClient = new ConnectorClient(credentials, {
        baseUri: serviceUrl,
      });

      allTeamMembers =
        await connectorClient.conversations.getConversationMembers(teamId);
    } catch (err) {
      processSafetyBotError(err, "", "");
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
      processSafetyBotError(err, "", "");
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
      processSafetyBotError(err, "", "");
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
          const { response, responseValue, msgStatus } = m;

          if (
            (response === "na" || response === false) &&
            msgStatus?.toString()?.trim() != null
          ) {
            memberObj.membersNotResponded.push(m);
          } else if (response === true) {
            if (responseValue === true) {
              memberObj.membersSafe.push(m);
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
          const { isMessageDelivered, msgStatus } = m;

          if (!msgStatus || msgStatus?.toString()?.trim() == "") {
            memberObj.deliveryInProgress.push(m);
          } else if (isMessageDelivered === true) {
            memberObj.delivered.push(m);
          } else if (isMessageDelivered === false) {
            memberObj.notDelivered.push(m);
          }
        });
      }
    } catch (err) {
      processSafetyBotError(err, "", "");
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
          } = inc;

          if (messageDeliveredCount == 0 && isTestRecord) {
            return;
          }
          const status = inc.incStatusId === 2 ? "Closed" : "In progress";
          const startDate = this.getStartDate(inc.incCreatedDate);
          const duration = this.getDurationInWeek(
            inc.incCreatedDate
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
                      inc.members.length
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
          }

          const teamName = teamObj && teamObj[teamId] ? teamObj[teamId] : "";

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
          };
          incFormatedData.push(incObj);
        });
      }
    } catch (err) {
      console.log(err);
      processSafetyBotError(err, "", "", userObjId);
    }
    return incFormatedData;
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

        teamsMembers = await incidentService.getAllTeamMembersByTeamId(
          teamId,
          "value",
          "title",
          userAadObjId,
          superUsersLeftJoinQuery
        );
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
      processSafetyBotError(err, teamId, "", userAadObjId);
    }
    return Promise.resolve(teamsMembers);
  };

  requestAssistance = async (data, userAadObjId) => {
    let isMessageSent = false;
    try {
      let admins = data[0];
      let user = data[1][0];
      if (admins != null && admins.length > 0) {
        let mentionUserEntities = [];
        dashboard.mentionUser(
          mentionUserEntities,
          user.user_id,
          user.user_name
        );
        const approvalCardResponse = {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          appId: process.env.MicrosoftAppId,
          body: [
            {
              type: "TextBlock",
              text: `User <at>${user.user_name}</at> needs assistance.`,
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
            const res = await sendProactiveMessaageToUser(
              memberArr,
              approvalCardResponse,
              null,
              admins[i].serviceUrl,
              admins[i].user_tenant_id,
              null,
              userAadObjId
            );
          }
        }
        bot.sendNSRespToTeamChannel(
          admins[0].user_tenant_id,
          approvalCardResponse,
          userAadObjId
        );
        isMessageSent = true;
      }
    } catch (err) {
      console.log(err);
      processSafetyBotError(err, "", "", userAadObjId);
    }
    return isMessageSent;
  };

  saveAssistance = async (adminsData, user, ts, userAadObjId) => {
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

        if (sentToIds != "") {
          res = await db.insertDataIntoDB("MSTeamsAssistance", [
            user.user_id,
            sentToIds.join(","),
            sentToNames,
            "",
            ts,
            "",
            teamIds,
          ]);
        }
      }
    } catch (err) {
      processSafetyBotError(err, "", "", userAadObjId);
    }
    return res;
  };

  sendUserCommentToAdmin = async (data, userComment, userAadObjId) => {
    try {
      let admins = data[0];
      let user = data[1][0];
      if (admins != null && admins.length > 0) {
        let mentionUserEntities = [];
        dashboard.mentionUser(
          mentionUserEntities,
          user.user_id,
          user.user_name
        );
        const approvalCardResponse = {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          appId: process.env.MicrosoftAppId,
          body: [
            {
              type: "TextBlock",
              text: `User <at>${user.user_name}</at> has commented : ${userComment}`,
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
            const res = await sendProactiveMessaageToUser(
              memberArr,
              approvalCardResponse,
              null,
              admins[i].serviceUrl,
              admins[i].user_tenant_id,
              null,
              userAadObjId
            );
          }
        }
        bot.sendNSRespToTeamChannel(
          admins[0].user_tenant_id,
          approvalCardResponse,
          userAadObjId
        );
      }
    } catch (err) {
      processSafetyBotError(err, "", "", userAadObjId);
    }
  };

  checkDuplicateInc = async (incTitle, teamId, userAadObjId) => {
    let isDuplicate = false;
    try {
      if (teamId == null || teamId == "null") {
        teamId = await incidentService.getTeamIdByUserAadObjId(userAadObjId);
      }
      if (teamId != null && teamId != "null") {
        isDuplicate = await incidentService.verifyDuplicateInc(
          teamId,
          incTitle
        );
      }
    } catch (err) {
      processSafetyBotError(err, teamId, "", userAadObjId);
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
        processSafetyBotError(err, teamId, "", aadUserObjId);
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
          incId
        );
      }
    } catch (err) {
      console.log(err);
      processSafetyBotError(err, "", "", userAadObjId);
    }
    return Promise.resolve(newInc);
  };

  sendSafetyCheckMessage = async (
    incId,
    teamId,
    createdByUserInfo,
    userAadObjId,
    resendSafetyCheck
  ) => {
    const log = new AYSLog();
    try {
      const safetyCheckSend = await bot.sendSafetyCheckMessageAsync(
        incId,
        teamId,
        createdByUserInfo,
        log,
        userAadObjId,
        resendSafetyCheck
      );
      return Promise.resolve(safetyCheckSend);
    } catch (err) {
      console.log(err);
      processSafetyBotError(
        err,
        teamId,
        createdByUserInfo?.user_name,
        userAadObjId
      );
      return true;
    } finally {
      await log.saveLog(incId);
    }
  };

  getUserTeamInfo = async (userAadObjId) => {
    let userTeamInfo = null;
    try {
      userTeamInfo = await incidentService.getUserTeamInfo(userAadObjId);
    } catch (err) {
      processSafetyBotError(err, "", "");
    }
    return Promise.resolve(userTeamInfo);
  };

  submitContactUs = async (email, msg, userId, userName) => {
    try {
      const companyData = await getCompaniesData(userId);
      if (companyData != null) {
        bot.sendNewContactEmail(email, msg, companyData, userName);
      }
    } catch (err) {
      processSafetyBotError(err, "", userName, userId);
    }
  };

  getSuperUsersByTeamId = async (teamId) => {
    let superUsers = null;
    try {
      superUsers = await incidentService.getSuperUsersByTeamId(teamId);
    } catch (err) {
      processSafetyBotError(err, teamId, "", null);
    }
    return Promise.resolve(superUsers);
  };

  saveUserSetting = async ({
    teamId,
    superUsers,
    userAadObjId,
    selectedTeams,
  }) => {
    let result = null;
    try {
      saveNARespSelectedTeams(teamId, selectedTeams, userAadObjId);
      result = await updateSuperUserDataByUserAadObjId(
        userAadObjId,
        teamId,
        superUsers
      );
    } catch (err) {
      processSafetyBotError(err, teamId, "", userAadObjId);
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
        incResponseTeamsData = null;
      let incDataToCopy = await incidentService.getIncDataToCopyInc(
        incId,
        selectedUsers,
        teamId,
        userAadObjId
      );

      if (incDataToCopy != null && incDataToCopy.length > 0) {
        incSelectedMembersData = incDataToCopy[0];
        incResponseMembersData = incDataToCopy[1];
        incResponseTeamsData = incDataToCopy[2];
      }

      return {
        incData,
        incResponseMembersData,
        incSelectedMembersData,
        incResponseTeamsData,
      };
    } catch (err) {
      processSafetyBotError(err, "", "");
    }
  };

  processError = async (reqBody) => {
    processBotError(reqBody);
  };
}

module.exports.AreYouSafeTab = AreYouSafeTab;
