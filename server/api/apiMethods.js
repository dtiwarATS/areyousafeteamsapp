const {
  TeamsInfo,
  TurnContext,
  MessageFactory,
  CardFactory,
} = require("botbuilder");

const path = require("path");
const ENV_FILE = path.join(__dirname, "../.env");
require("dotenv").config({ path: ENV_FILE });
const db = require("../db");
const {
  ConnectorClient,
  MicrosoftAppCredentials,
} = require("botframework-connector");
const { AYSLog } = require("../utils/log");
const { processSafetyBotError } = require("../models/processError");

const getAllTeamMembers = async (context, teamId) => {
  console.log({ teamId });
  let allMembers = null;
  try {
    allMembers = await (
      await TeamsInfo.getTeamMembers(context, teamId)
    ).filter((tm) => tm.aadObjectId);
  } catch (err) {
    console.log(err);
  }

  return Promise.resolve(allMembers);
};

const getConversationMembers = async (
  teamId,
  serviceUrl,
  teamUserId,
  userAadObjId
) => {
  try {
    const appId = process.env.MicrosoftAppId;
    const appPass = process.env.MicrosoftAppPassword;

    var credentials = new MicrosoftAppCredentials(appId, appPass);
    connectorClient = new ConnectorClient(credentials, { baseUri: serviceUrl });

    const result = await connectorClient.conversations.getConversationMembers(
      teamId
    );
    const userInfo = result.filter((usr) => usr.id == teamUserId);
    if (userInfo?.length > 0) {
      return userInfo[0];
    }
  } catch (err) {
    processSafetyBotError(
      err,
      teamId,
      "",
      userAadObjId,
      "error in getConversationMembers -> teamUserId=" +
        teamUserId +
        " serviceUrl=" +
        serviceUrl
    );
  }
  return null;
};

const getAllTeamMembersByConnectorClient = async (teamId, serviceUrl) => {
  try {
    var credentials = new MicrosoftAppCredentials(
      process.env.MicrosoftAppId,
      process.env.MicrosoftAppPassword
    );
    var connectorClient = new ConnectorClient(credentials, {
      baseUri: serviceUrl,
    });

    const allTeamMembersData =
      await connectorClient.conversations.getConversationMembers(teamId);
    const allTeamsMembers = allTeamMembersData.filter((tm) => tm.objectId);
    return Promise.resolve(allTeamsMembers);
  } catch (err) {
    console.log(err);
  }
};

/**
 * NOTE:
 * @param teamMember should be in same format as the context.activity.from object
 * For example:
 * {
 *  id: '29:1IGzF4e50O-CYLJgJw09GLsA_F3kwNcsBk5fBkOpJcFUVBpQN3Z-gVBM_knoDN_YcgE4KwZvyy-Q4oHkX5DpjPA',
 *  name: 'Shashikant Sharma',
 *  aadObjectId: '2bff8b30-b868-46ae-ba55-711d04a84e79' (optional)
 * }
 */
const sendDirectMessage = async (
  context,
  teamMember,
  msg,
  mentionedUser = null
) => {
  try {
    let topLevelMessage = MessageFactory.text(msg);

    if (mentionedUser) {
      topLevelMessage.entities = [mentionedUser];
    }

    let ref = TurnContext.getConversationReference(context.activity);
    ref.user = teamMember;

    await context.adapter.createConversation(ref, async (t1) => {
      const ref2 = TurnContext.getConversationReference(t1.activity);
      await t1.adapter.continueConversation(ref2, async (t2) => {
        await t2.sendActivity(topLevelMessage);
      });
    });
  } catch (err) {
    processSafetyBotError(
      err,
      "",
      teamMember?.name,
      teamMember?.id,
      "error in sendDirectMessage"
    );
  }
};

////

const sendDirectMessageCard = async (
  context,
  teamMember,
  approvalCardResponse
) => {
  try {
    let ref = TurnContext.getConversationReference(context.activity);
    ref.user = teamMember;

    await context.adapter.createConversation(ref, async (t1) => {
      const ref2 = TurnContext.getConversationReference(t1.activity);
      await t1.adapter.continueConversation(ref2, async (t2) => {
        await t2.sendActivity({
          attachments: [CardFactory.adaptiveCard(approvalCardResponse)],
        });
      });
    });
  } catch (err) {
    let sendErrorEmail = true;
    if (
      err.code == "ConversationBlockedByUser" ||
      err.status == "User blocked the conversation with the bot."
    ) {
      let sqlUpdateBlockedByUser = `UPDATE MSTeamsTeamsUsers set BotBlockedByUser=1 where user_aadobject_id='${teamMember?.aadObjectId}'`;
      db.getDataFromDB(sqlUpdateBlockedByUser, teamMember?.aadObjectId);
      sendErrorEmail = false;
    }
    if (sendErrorEmail)
      processSafetyBotError(
        err,
        "",
        teamMember?.name,
        teamMember?.aadObjectId,
        "error in sendDirectMessageCard " + JSON.stringify(teamMember)
      );
  }
};

const sendMultipleDirectMessageCard = async (
  context,
  teamMember,
  ...respCard
) => {
  try {
    let ref = TurnContext.getConversationReference(context.activity);
    ref.user = teamMember;

    const attachments = respCard.map((card) => CardFactory.adaptiveCard(card));

    await context.adapter.createConversation(ref, async (t1) => {
      const ref2 = TurnContext.getConversationReference(t1.activity);
      await t1.adapter.continueConversation(ref2, async (t2) => {
        await t2.sendActivity({
          attachments: attachments,
        });
      });
    });
  } catch (err) {
    let sendErrorEmail = true;
    if (
      err.code == "ConversationBlockedByUser" ||
      err.status == "User blocked the conversation with the bot."
    ) {
      let sqlUpdateBlockedByUser = `UPDATE MSTeamsTeamsUsers set BotBlockedByUser=1 where user_aadobject_id='${teamMember?.aadObjectId}'`;
      db.getDataFromDB(sqlUpdateBlockedByUser, members[0]?.id);
      sendErrorEmail = false;
    }
    if (sendErrorEmail)
      processSafetyBotError(
        err,
        "",
        teamMember?.name,
        teamMember?.aadObjectId,
        "error in sendMultipleDirectMessageCard " + JSON.stringify(teamMember)
      );
  }
};

const checkValidStatus = (statusCode) => {
  const validStatusCodeArr = [200, 201, 202, 204];
  return validStatusCodeArr.includes(Number(statusCode));
};

const getConversationParameters = (tenantId, appId, botName, members) => {
  return {
    isGroup: false,
    channelData: {
      tenant: {
        id: tenantId,
      },
    },
    bot: {
      id: appId,
      name: botName,
    },
    members: members,
  };
};

const getUsersConversationId = async (
  tenantId,
  members,
  serviceUrl,
  userAadObjId,
  sendErrorEmail = true,
  resp = null
) => {
  let userConversationId = null;
  try {
    const appId = process.env.MicrosoftAppId;
    const appPass = process.env.MicrosoftAppPassword;
    const botName = process.env.BotName;

    const conversationParameters = getConversationParameters(
      tenantId,
      appId,
      botName,
      members
    );
    var credentials = new MicrosoftAppCredentials(appId, appPass);
    var connectorClient = new ConnectorClient(credentials, {
      baseUri: serviceUrl,
    });

    //conversationResp = await connectorClient.conversations.createConversation(conversationParameters, { timeout: 300000 });
    conversationResp = await connectorClient.conversations.createConversation(
      conversationParameters
    );
    if (conversationResp?.id != null) {
      userConversationId = conversationResp.id;
    }
  } catch (err) {
    if (resp) {
      if (err?.statusCode != null) {
        resp.status = err.statusCode;
      } else {
        resp.status = 500;
      }
      resp.error = err.message;
      resp.errObj = err;
    }
    //console.log(err);
    //if (sendErrorEmail)
    {
      processSafetyBotError(
        err,
        "",
        "",
        userAadObjId,
        "error in getUsersConversationId -> members=" +
          JSON.stringify(members) +
          " tenantId=" +
          tenantId +
          " appId=" +
          process?.env?.MicrosoftAppId +
          " botName=" +
          process?.env?.BotName
      );
    }
  }
  return userConversationId;
};

const sendProactiveMessaageToUserAsync = async (
  members,
  activity,
  msgText,
  serviceUrl,
  tenantId,
  log,
  userAadObjId,
  conversationId = null,
  connectorClient = null,
  callbackFn = null,
  index = null,
  delay = 100,
  memberObj = null,
  msgNotSentArr = [],
  sendErrorEmail = true,
  retryCounter = null
) => {
  let resp = {
    userId: members[0]?.id,
    conversationId: conversationId || null,
    activityId: null,
    status: null,
    error: null,
    errorCode: null,
    errObj: null,
    memberObj,
    newConversationId: null,
    retryCounter,
    isSafetyCheckTitleResponse: false,
  };
  try {
    // let activity = null;
    // if (msgAttachment != null) {
    //   activity = MessageFactory.attachment(CardFactory.adaptiveCard(msgAttachment));
    // } else if (msgText != null) {
    //   activity = MessageFactory.text(msgText);
    // }
    if (msgText != null) {
      activity = MessageFactory.text(msgText);
      resp.isSafetyCheckTitleResponse = true;
    }
    if (activity != null) {
      if (connectorClient == null) {
        const appId = process.env.MicrosoftAppId;
        const appPass = process.env.MicrosoftAppPassword;

        var credentials = new MicrosoftAppCredentials(appId, appPass);
        connectorClient = new ConnectorClient(credentials, {
          baseUri: serviceUrl,
        });
      }

      const sendToConversation = () => {
        console.log("inside sendToConversation");
        //connectorClient.conversations.sendToConversation(conversationId, activity, { timeout: 20000 })
        connectorClient.conversations
          .sendToConversation(conversationId, activity)
          .then((activityResp) => {
            if (
              activityResp != null &&
              activityResp._response != null &&
              activityResp._response.status != null
            ) {
              resp.status = activityResp?._response?.status;
              const isValidActivityStatus = checkValidStatus(
                activityResp._response.status
              );
              if (activityResp.id != null && isValidActivityStatus) {
                resp.conversationId = conversationId;
                resp.activityId = activityResp.id;
              }
            }
            if (callbackFn != null && typeof callbackFn === "function") {
              callbackFn(resp, index);
            }
          })
          .catch((err) => {
            resp.errorCode = err.code;
            if (
              err.code !== "ConversationBlockedByUser" &&
              err.message != "Invalid user identity in provided tenant"
            ) {
              msgNotSentArr.push(memberObj);
            }
            if (
              err.code == "ConversationBlockedByUser" ||
              err.status == "User blocked the conversation with the bot."
            ) {
              let sqlUpdateBlockedByUser = `UPDATE MSTeamsTeamsUsers set BotBlockedByUser=1 where user_id='${members[0]?.id}'`;
              db.getDataFromDB(sqlUpdateBlockedByUser, members[0]?.id);
              sendErrorEmail = false;
            }
            if (sendErrorEmail) {
              processSafetyBotError(
                err,
                "",
                members[0]?.name,
                members[0]?.id,
                userAadObjId
              );
            }
            if (callbackFn != null && typeof callbackFn === "function") {
              if (err?.statusCode != null) {
                resp.status = err.statusCode;
              } else {
                resp.status = 500;
              }
              resp.error = err.message;
              resp.errObj = err;
              //console.log(`Error: sendToConversation ${err}`);
              callbackFn(resp, index);
            }
          });
      };
      if (conversationId == null || conversationId == "null") {
        conversationId = await getUsersConversationId(
          tenantId,
          members,
          serviceUrl,
          userAadObjId,
          sendErrorEmail,
          resp
        );
        if (conversationId != null && conversationId != "null") {
          resp.newConversationId = conversationId;
        }
      }
      if (conversationId != null && conversationId != "null") {
        sendToConversation();
        // setTimeout(async () => {
        //   sendToConversation();
        // }, delay);
        // console.log({ delay });
      } else {
        if (callbackFn != null && typeof callbackFn === "function") {
          if (resp.error != "Invalid user identity in provided tenant") {
            msgNotSentArr.push(memberObj);
          }
          callbackFn(resp, index);
        }
      }
    }
  } catch (err) {
    if (callbackFn != null && typeof callbackFn === "function") {
      if (err?.statusCode != null) {
        resp.status = err.statusCode;
      } else {
        resp.status = 500;
      }
      resp.error = err.message;
      resp.errObj = err;
      //console.log(`Error: sendToConversation ${err}`);
      msgNotSentArr.push(memberObj);
      callbackFn(resp, index);
    }
    //if (sendErrorEmail)
    {
      processSafetyBotError(
        err,
        "",
        members[0]?.name,
        members[0]?.id,
        "error in sendProactiveMessaageToUserAsync " + userAadObjId
      );
    }
  }
  //return Promise.resolve(resp);
};

const sendProactiveMessaageToUser = async (
  members,
  msgAttachment,
  msgText,
  serviceUrl,
  tenantId,
  log,
  userAadObjId,
  conversationId = null,
  connectorClient = null,
  filesData = null
) => {
  if (log == null) {
    log = new AYSLog();
  }
  //log.addLog("sendProactiveMessaageToUser start");
  let resp = {
    conversationId: null,
    activityId: null,
    status: null,
    error: null,
  };
  try {
    let activity = null;
    if (msgAttachment != null) {
      activity = MessageFactory.attachment(
        CardFactory.adaptiveCard(msgAttachment)
      );
    } else if (msgText != null) {
      activity = MessageFactory.text(msgText);
    }
    if (filesData != null && filesData.length > 0) {
      const cardBody = [];
      if (filesData.length == 1) {
        cardBody.push({
          type: "Image",
          url: filesData[0].Blob,
          msTeams: {
            allowExpand: true,
          },
        });
      } else {
        let columns = [];
        filesData.forEach((incFile, index) => {
          if (index % 2 == 0) {
            columns = [];
            let cs = {
              type: "ColumnSet",
              columns: columns,
            };
            cardBody.push(cs);
          }
          let columnItems = [];
          columnItems.push({
            type: "Image",
            url: incFile.Blob,
            msTeams: {
              allowExpand: true,
            },
          });
          let column = {
            type: "Column",
            items: columnItems,
          };
          columns.push(column);
        });
      }
      let card = {
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
        appId: process.env.MicrosoftAppId,
        body: cardBody,
        type: "AdaptiveCard",
        version: "1.4",
      };
      activity.attachments.push(CardFactory.adaptiveCard(card));
    }
    if (activity != null) {
      if (connectorClient == null) {
        const appId = process.env.MicrosoftAppId;
        const appPass = process.env.MicrosoftAppPassword;

        var credentials = new MicrosoftAppCredentials(appId, appPass);
        connectorClient = new ConnectorClient(credentials, {
          baseUri: serviceUrl,
        });
      }

      if (conversationId == null || conversationId == "null") {
        conversationId = await getUsersConversationId(
          tenantId,
          members,
          serviceUrl,
          userAadObjId
        );
        // const conversationResp = await connectorClient.conversations.createConversation(conversationParameters);
        // if (conversationResp?.id != null) {
        //   conversationId = conversationResp.id;
        // }
      }

      // HTTP status code	      Meaning
      // 200	                  The request succeeded.
      // 201	                  The request succeeded.
      // 202	                  The request was accepted for processing.
      // 204	                  The request succeeded but no content was returned.
      // 400	                  The request was malformed or otherwise incorrect.
      // 401	                  The bot isn't yet authenticated.
      // 403	                  The bot isn't authorized to perform the requested operation.
      // 404	                  The requested resource wasn't found.
      // 405	                  The channel does not support the requested operation.
      // 500	                  An internal server error occurred.
      // 503	                  The service is temporarily unavailable.

      let activityResp = null;
      if (conversationId != null && conversationId != "null") {
        activityResp = await connectorClient.conversations.sendToConversation(
          conversationId,
          activity
        );
        if (
          activityResp != null &&
          activityResp._response != null &&
          activityResp._response.status != null
        ) {
          const isValidActivityStatus = checkValidStatus(
            activityResp._response.status
          );
          if (activityResp.id != null && isValidActivityStatus) {
            resp.status = activityResp?._response?.status;
            resp.conversationId = conversationId;
            resp.activityId = activityResp.id;

            log.addLog(`response object ${JSON.stringify(resp)}`);
          } else {
            log.addLog(
              `Invalid activity or staus : ${activityResp?.id}  ${activityResp?._response?.status}`
            );
            resp.status = activityResp?._response?.status;
          }
        } else {
          log.addLog("activityResp not valid");
        }
      } else {
        log.addLog(`Invalid conversation or staus : ${conversationId}`);
      }
    }
  } catch (err) {
    if (err?.statusCode != null) {
      resp.status = err.statusCode;
    }
    log.addLog("sendProactiveMessaageToUser error : ");
    log.addLog(JSON.stringify(err));
    log.addLog(`Error occured for user: ${JSON.stringify(members)}`);
    console.log(err);
    processSafetyBotError(
      err,
      "",
      "",
      userAadObjId,
      "error in sendProactiveMessaageToUser" + JSON.stringify(members)
    );
    resp.error = JSON.stringify(err);
  } finally {
    log.addLog("sendProactiveMessaageToUser end");
  }
  return Promise.resolve(resp);
};

const updateMessage = async (
  activityId,
  activity,
  conversationId,
  serviceUrl
) => {
  //Update dashboard
  try {
    if (serviceUrl == null) {
      serviceUrl = process.env.serviceUrl;
    }
    var credentials = new MicrosoftAppCredentials(
      process.env.MicrosoftAppId,
      process.env.MicrosoftAppPassword
    );
    var connectorClient = new ConnectorClient(credentials, {
      baseUri: serviceUrl,
    });
    await connectorClient.conversations.updateActivity(
      conversationId,
      activityId,
      activity
    );
  } catch (err) {
    console.log(err);
  }
};

const sentActivityToTeamChannel = async (
  context,
  msgAttachment,
  teamsChannelId,
  userAadObjId
) => {
  try {
    const activity = MessageFactory.attachment(
      CardFactory.adaptiveCard(msgAttachment)
    );
    const [reference] = await TeamsInfo.sendMessageToTeamsChannel(
      context,
      activity,
      teamsChannelId,
      process.env.MicrosoftAppId
    );

    await context.adapter.continueConversationAsync(
      process.env.MicrosoftAppId,
      reference,
      async (turnContext) => {
        await turnContext.sendActivity(activity);
      }
    );
  } catch (err) {
    processSafetyBotError(
      err,
      "",
      "",
      userAadObjId,
      "sentActivityToTeamChannel"
    );
  }
};

const sendProactiveMessaageToSelectedChannel = async (
  msgAttachment,
  channelId,
  serviceUrl,
  userAadObjId,
  incId = ""
) => {
  try {
    if (msgAttachment != null) {
      const appId = process.env.MicrosoftAppId;
      const appPass = process.env.MicrosoftAppPassword;
      const botName = process.env.BotName;
      const activity = MessageFactory.attachment(
        CardFactory.adaptiveCard(msgAttachment)
      );

      const conversationParameters = {
        bot: {
          id: appId,
          name: botName,
        },
        isGroup: true,
        conversationType: "channel",
        channelData: {
          channel: { id: channelId },
        },
        activity: activity,
      };

      var credentials = new MicrosoftAppCredentials(appId, appPass);
      var connectorClient = new ConnectorClient(credentials, {
        baseUri: serviceUrl,
      });

      await connectorClient.conversations.createConversation(
        conversationParameters
      );
    }
  } catch (err) {
    processSafetyBotError(
      err,
      channelId,
      "",
      userAadObjId,
      `sendProactiveMessaageToSelectedChannel ${incId}`
    );
  }
};

module.exports = {
  getAllTeamMembers,
  sendDirectMessage,
  sendDirectMessageCard,
  sendProactiveMessaageToUser,
  updateMessage,
  getAllTeamMembersByConnectorClient,
  getUsersConversationId,
  sendProactiveMessaageToUserAsync,
  sentActivityToTeamChannel,
  sendProactiveMessaageToSelectedChannel,
  sendMultipleDirectMessageCard,
  getConversationMembers,
};
