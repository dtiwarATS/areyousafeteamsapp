const {
  TeamsInfo,
  TurnContext,
  MessageFactory,
  CardFactory,
} = require("botbuilder");

const path = require("path");
const ENV_FILE = path.join(__dirname, "../.env");
require("dotenv").config({ path: ENV_FILE });

const { ConnectorClient, MicrosoftAppCredentials } = require('botframework-connector');
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

const getAllTeamMembersByConnectorClient = async (teamId, serviceUrl) => {
  try {
    var credentials = new MicrosoftAppCredentials(process.env.MicrosoftAppId, process.env.MicrosoftAppPassword);
    var connectorClient = new ConnectorClient(credentials, { baseUri: serviceUrl });

    const allTeamMembersData = await connectorClient.conversations.getConversationMembers(teamId);
    const allTeamsMembers = allTeamMembersData.filter((tm) => tm.objectId);
    return Promise.resolve(allTeamsMembers);
  }
  catch (err) {
    console.log(err);
  }
}

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
    processSafetyBotError(err, "", "");
  }
};

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
    processSafetyBotError(err, "", "");
  }
};

const checkValidStatus = (statusCode) => {
  const validStatusCodeArr = [200, 201, 202, 204];
  return validStatusCodeArr.includes(Number(statusCode));
}

const sendProactiveMessaageToUser = async (members, msgAttachment, msgText, serviceUrl, tenantId, log) => {
  if (log == null) {
    log = new AYSLog();
  }
  log.addLog("sendProactiveMessaageToUser start");
  let resp = {
    "conversationId": null,
    "activityId": null,
    "status": null,
    "error": null
  };
  try {
    if (serviceUrl == null) {
      serviceUrl = process.env.serviceUrl;
    }

    if (tenantId == null) {
      tenantId = process.env.tenantId;
    }

    const appId = process.env.MicrosoftAppId;
    const appPass = process.env.MicrosoftAppPassword;
    const botName = process.env.BotName;

    const conversationParameters = {
      isGroup: false,
      channelData: {
        tenant: {
          id: tenantId
        }
      },
      bot: {
        id: appId,
        name: botName
      },
      members: members
    };

    let activity = null;
    if (msgAttachment != null) {
      activity = MessageFactory.attachment(CardFactory.adaptiveCard(msgAttachment));
    } else if (msgText != null) {
      activity = MessageFactory.text(msgText);
    }

    if (activity != null) {
      var credentials = new MicrosoftAppCredentials(appId, appPass);
      var connectorClient = new ConnectorClient(credentials, { baseUri: serviceUrl });

      const conversationResp = await connectorClient.conversations.createConversation(conversationParameters);

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
      if (conversationResp != null && conversationResp._response != null && conversationResp._response.status != null) {
        const isValidStatus = checkValidStatus(conversationResp._response.status);
        if (conversationResp.id != null && isValidStatus) {
          activityResp = await connectorClient.conversations.sendToConversation(conversationResp.id, activity);
          if (activityResp != null && activityResp._response != null && activityResp._response.status != null) {
            const isValidActivityStatus = checkValidStatus(activityResp._response.status);
            if (activityResp.id != null && isValidActivityStatus) {
              resp.status = activityResp?._response?.status;
              resp.conversationId = conversationResp.id;
              resp.activityId = activityResp.id;

              log.addLog(`response object ${JSON.stringify(resp)}`);
            } else {
              log.addLog(`Invalid activity or staus : ${activityResp?.id}  ${activityResp?._response?.status}`);
              resp.status = activityResp?._response?.status;
            }
          } else {
            log.addLog("activityResp not valid");
          }
        } else {
          log.addLog(`Invalid conversation or staus : ${conversationResp?.id}  ${conversationResp?._response?.status}`);
          resp.status = conversationResp?._response?.status;
        }
      } else {
        log.addLog("conversationResp not valid");
      }
    }
  }
  catch (err) {
    if (err.code.toLowerCase() == "conversationblockedbyuser") {

    }
    if (err?.statusCode != null) {
      resp.status = err.statusCode;
    }
    log.addLog("sendProactiveMessaageToUser error : ");
    log.addLog(JSON.stringify(err));
    log.addLog(`Error occured for user: ${JSON.stringify(members)}`);
    console.log(err);
    processSafetyBotError(err, "", "");
    resp.error = JSON.stringify(err);
  }
  finally {
    log.addLog("sendProactiveMessaageToUser end");
  }
  return Promise.resolve(resp);
}

const updateMessage = async (activityId, activity, conversationId, serviceUrl) => { //Update dashboard 
  try {
    if (serviceUrl == null) {
      serviceUrl = process.env.serviceUrl;
    }
    var credentials = new MicrosoftAppCredentials(process.env.MicrosoftAppId, process.env.MicrosoftAppPassword);
    var connectorClient = new ConnectorClient(credentials, { baseUri: serviceUrl });
    await connectorClient.conversations.updateActivity(conversationId, activityId, activity);
  }
  catch (err) {
    console.log(err);
  }
}

module.exports = {
  getAllTeamMembers,
  sendDirectMessage,
  sendDirectMessageCard,
  sendProactiveMessaageToUser,
  updateMessage,
  getAllTeamMembersByConnectorClient
};
