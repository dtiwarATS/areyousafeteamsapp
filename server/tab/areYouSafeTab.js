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
require("dotenv").config({ path: ENV_FILE });


const { ConnectorClient, MicrosoftAppCredentials } = require('botframework-connector');
const { Promise } = require("mssql/lib/base");

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
    var credentials = new MicrosoftAppCredentials(process.env.MicrosoftAppId, process.env.MicrosoftAppPassword);
    var connectorClient = new ConnectorClient(credentials, { baseUri: serviceUrl });

    const allTeamMembers = await connectorClient.conversations.getConversationMembers(teamId);
    return Promise.resolve(allTeamMembers);
  };

  getStartDate = (startDate) => {
    const startTime = startDate;
    const createdDate = new Date(startTime);
    const monthName = createdDate.toLocaleString("default", { month: "long" });
    const creatdDate = createdDate.getDate();
    const createdYear = createdDate.getFullYear();
    return ` ${monthName} ${creatdDate}, ${createdYear}`;
  };

  getDurationInWeek = (startDate) => {
    const currentDate = new Date();
    const startDateTime = new Date(startDate);
    let dateDiff = (currentDate.getTime() - startDateTime.getTime()) / 1000;
    //let dateDiffInMonth = dateDiff / (60 * 60 * 24 * new Date(startDateTime.getFullYear(), startDateTime.getMonth(), 0).getDate());
    let dateDiffInWeek = dateDiff / (60 * 60 * 24 * 7);
    let dateDiffInDay = dateDiff / (60 * 60 * 24);
    let dateDiffInHours = dateDiff / (60 * 60);
    let dateDiffInMin = dateDiff / (60);

    if (Math.abs(parseInt(dateDiffInWeek)) >= 1)
      return Math.abs(parseInt(dateDiffInWeek)) + 'w';
    else if (Math.abs(parseInt(dateDiffInDay)) >= 1)
      return Math.abs(parseInt(dateDiffInDay)) + 'd';
    else if (Math.abs(parseInt(dateDiffInHours)) >= 1)
      return Math.abs(parseInt(dateDiffInHours)) + 'h';
    else if (Math.abs(parseInt(dateDiffInMin)) >= 1)
      return Math.abs(parseInt(dateDiffInMin)) + 'm';
    else
      return Math.abs(parseInt(dateDiff)) + 's';
  }

  sortMembers = (members) => {
    const memberObj = {
      membersSafe: [],
      membersUnsafe: [],
      membersNotResponded: [],
    };

    members.forEach((m) => {
      const { response, responseValue } = m;

      if (response === "na" || response === false) {
        memberObj.membersNotResponded.push(m);
      } else if (response === true) {
        if (responseValue === true) {
          memberObj.membersSafe.push(m);
        } else if (responseValue === false || responseValue == null) {
          memberObj.membersUnsafe.push(m);
        }
      }
    });

    return memberObj;
  };

  getFormatedIncData = (incData) => {
    let incFormatedData = null;
    try {
      if (incData != null && incData.length > 0) {
        incFormatedData = incData.map((inc) => {
          const incId = inc.incId;
          const status = (inc.incStatusId === 2) ? "Closed" : "In progress";
          const title = inc.incTitle;
          const createdBy = inc.incCreatedByName;
          const startDate = this.getStartDate(inc.incCreatedDate);
          const duration = this.getDurationInWeek(inc.incCreatedDate).toString();
          let safe = null;
          let needAssistance = null;
          let notResponded = null;
          let safeCount = 0;
          let needAssistanceCount = 0;
          let notRespondedCount = 0;
          let responsePercentage = "0%";

          if (inc.members != null && inc.members.length > 0) {
            const memberObj = this.sortMembers(inc.members);
            if (memberObj != null) {
              safe = memberObj.membersSafe.sort();
              needAssistance = memberObj.membersUnsafe.sort();
              notResponded = memberObj.membersNotResponded.sort();
              safeCount = memberObj.membersSafe.length;
              needAssistanceCount = memberObj.membersUnsafe.length;
              notRespondedCount = memberObj.membersNotResponded.length;

              if (needAssistanceCount > 0 || safeCount > 0) {
                responsePercentage = Math.round(
                  ((needAssistanceCount + safeCount) * 100) / inc.members.length
                ).toString() + "%";
              }
            }
          }

          return { incId, status, title, createdBy, startDate, duration, safe, needAssistance, notResponded, safeCount, needAssistanceCount, notRespondedCount, responsePercentage };
        });
      }
    } catch (err) {
      console.log(err);
    }
    return incFormatedData;
  }

  getTeamMembers = async (teamId, userAadObjId) => {
    let teamsMembers = null;
    if (teamId != null) {
      teamsMembers = await incidentService.getAllTeamMembersByTeamId(teamId);
    } else if (userAadObjId != null) {
      teamsMembers = await incidentService.getAllTeamMembersByUserAadObjId(userAadObjId);
    }
    return Promise.resolve(teamsMembers);
  }

  requestAssistance = async (data) => {
    let isMessageSent = false;
    try {
      let admins = data[0];
      let user = data[1][0];
      if (admins != null && admins.length > 0) {
        let mentionUserEntities = [];
        dashboard.mentionUser(mentionUserEntities, user.user_id, user.user_name);
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
        for (let i = 0; i < admins.length; i++) {
          if (admins[i].serviceUrl != null && admins[i].user_tenant_id != null) {
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
              admins[i].user_tenant_id
            );
          }
        }
        isMessageSent = true;
      }
    } catch (err) {
      console.log(err);
    }
    return isMessageSent;
  };

  saveAssistance = async (adminsData, user, ts) => {
    let res = null;
    if (adminsData != null && adminsData.length > 0) {
      let sentToIds = "";
      let sentToNames = "";
      adminsData.forEach((element, index) => {
        if (element.serviceUrl != null && element.user_tenant_id != null) {
          sentToIds += (index == 0 ? "" : ",") + element.user_id;
          sentToNames += (index == 0 ? "" : (index == (adminsData.length - 1)) ? " and " : ", ") + element.user_name;
        }
      });

      if (sentToIds != "") {
        res = await db.insertDataIntoDB("MSTeamsAssistance", [
          user.user_id,
          sentToIds.trimLeft(),
          sentToNames,
          "",
          ts,
          "",
        ]);
      }
    }
    return res;
  };

  sendUserCommentToAdmin = async (data, userComment) => {
    let admins = data[0];
    let user = data[1][0];
    if (admins != null && admins.length > 0) {
      let mentionUserEntities = [];
      dashboard.mentionUser(mentionUserEntities, user.user_id, user.user_name);
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
      for (let i = 0; i < admins.length; i++) {
        if (admins[i].serviceUrl != null && admins[i].user_tenant_id != null) {
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
            admins[i].serviceurl,
            admins[i].user_tenant_id
          );
        }
      }
    }
  };

  checkDuplicateInc = async (incTitle, teamId, userAadObjId) => {
    let isDuplicate = false;
    if (teamId == null) {
      teamId = await incidentService.getTeamIdByUserAadObjId(userAadObjId);
    }
    if (teamId != null) {
      isDuplicate = await incidentService.verifyDuplicateInc(teamId, incTitle);
    }
    return Promise.resolve(isDuplicate);
  }

  getBotUserInfo = async (teamId, aadUserObjId) => {
    let userInfo = null;
    if (aadUserObjId != null) {
      try {
        if (teamId == null) {
          teamId = await incidentService.getTeamIdByUserAadObjId(userAadObjId);
        }
        userInfo = await incidentService.getUserInfo(teamId, aadUserObjId);
      } catch (err) {
        console.log(err);
      }
    }
    return Promise.resolve(userInfo);
  }

  createNewIncident = async (incObj) => {
    let newInc = null;

    try {
      if (incObj != null && incObj.incData != null) {
        let incData = incObj.incData;
        if (incData.incType === "recurringIncident" && incObj.incRecurrData != null) {
          incData = {
            ...incData,
            ...incObj.incRecurrData
          }
        }
        let memberChoises = null;
        if (incObj.incMembers != null) {
          memberChoises = incObj.incMembers;
        }
        let responseSelectedMembers = null;
        if (incObj.responseSelectedMembers != null) {
          responseSelectedMembers = incObj.responseSelectedMembers;
        }
        newInc = await incidentService.createNewInc(incData, responseSelectedMembers, memberChoises);
      }
    } catch (err) {
      console.log(err);
    }
    return Promise.resolve(newInc);
  }

  sendSafetyCheckMessage = (incId, teamId, createdByUserInfo) => {

  }
}

module.exports.AreYouSafeTab = AreYouSafeTab;