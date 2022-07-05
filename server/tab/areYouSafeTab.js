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

class AreYouSafeTab {

    getConversationParameters = (members) => {
        return {
            isGroup: false,
            channelData: {
                tenant: {
                    id: process.env.tenantId
                }
            },
            bot: {
                id: process.env.MicrosoftAppId,
                name: process.env.BotName
            },
            members: members
        };
    }

    getConnectorClient = () => {
        var credentials = new MicrosoftAppCredentials(process.env.MicrosoftAppId, process.env.MicrosoftAppPassword);
        return new ConnectorClient(credentials, { baseUri: process.env.serviceUrl });
    }

    sendMessage = async (userId) => {
        const member = [
            {
                id: "29:1fO2SnbY7d2YM2BD8cgiHv6bybXVxWJ0EHHhYF0c-F7boC5vramm41yxO1OFfGsMSq3oifj28EBPcdpLmIWUp-g",
                aadObjectId: "2117d3fc-4485-4898-8db5-4c80f11ac73c"
            }
        ]

        const activity = MessageFactory.text("msgText");
        const client = this.getConnectorClient();
        const conversationParameters = this.getConversationParameters(member);
        const response = await client.conversations.createConversation(conversationParameters);
        const activityObj = await client.conversations.sendToConversation(response.id, activity);
        return activityObj;
    }
}

module.exports.AreYouSafeTab = AreYouSafeTab;