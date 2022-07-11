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

    sendMessage = async (userId) => {

    }
}

module.exports.AreYouSafeTab = AreYouSafeTab;