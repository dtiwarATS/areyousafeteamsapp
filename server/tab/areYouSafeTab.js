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

    getConversationParameters = (members, tenantId) => {
        return {
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
    }

    getAllTeamMembers = async (teamId, serviceUrl) => {
        var credentials = new MicrosoftAppCredentials(process.env.MicrosoftAppId, process.env.MicrosoftAppPassword);
        var connectorClient = new ConnectorClient(credentials, { baseUri: serviceUrl });

        const allTeamMembers = await connectorClient.conversations.getConversationMembers(teamId);
        return Promise.resolve(allTeamMembers);
    }
}

module.exports.AreYouSafeTab = AreYouSafeTab;