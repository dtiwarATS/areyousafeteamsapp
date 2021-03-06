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

const getAllTeamMembers = async (context, teamId) => {
  console.log({ teamId });
  let allMembers = await (
    await TeamsInfo.getTeamMembers(context, teamId)
  ).filter((tm) => tm.aadObjectId);

  return Promise.resolve(allMembers);
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
};

const sendDirectMessageCard = async (
  context,
  teamMember,
  approvalCardResponse
) => {
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
};
const addLog = (log, message) => {
  if (log != null) {
    message = `<tr><td>${message}</td></tr>`;
    log.push(message);
  }
}
const sendProactiveMessaageToUser = async (members, msgAttachment, msgText, serviceUrl, tenantId, log) => {
  addLog(log, "sendProactiveMessaageToUser start");
  let resp = {
    "conversationId": null,
    "activityId": null
  };
  try {
    if (serviceUrl == null) {
      serviceUrl = process.env.serviceUrl;
    }

    if (tenantId == null) {
      tenantId = process.env.tenantId;
    }

    const conversationParameters = {
      isGroup: false,
      channelData: {
        tenant: {
          id: tenantId
        }
      },
      bot: {
        id: process.env.MicrosoftAppId,
        name: process.env.BotName
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
      var credentials = new MicrosoftAppCredentials(process.env.MicrosoftAppId, process.env.MicrosoftAppPassword);
      var connectorClient = new ConnectorClient(credentials, { baseUri: serviceUrl });

      const response = await connectorClient.conversations.createConversation(conversationParameters);
      const activityId = await connectorClient.conversations.sendToConversation(response.id, activity);

      resp.conversationId = response.id;
      resp.activityId = activityId.id;

      addLog(log, `response object ${JSON.stringify(resp)}`);
    }
  }
  catch (err) {
    addLog(log, "sendProactiveMessaageToUser error : ");
    addLog(log, JSON.stringify(err));
    console.log(err);
  }
  finally {
    addLog(log, "sendProactiveMessaageToUser end");
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
  addLog
};
