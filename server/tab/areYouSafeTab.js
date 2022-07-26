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

    getStartDate = (startDate) => {
        const startTime = startDate;
        const createdDate = new Date(startTime);
        const monthName = createdDate.toLocaleString("default", { month: "long" });
        const creatdDate = createdDate.getDate();
        const createdYear = createdDate.getFullYear();
        return ` ${monthName} ${creatdDate}, ${createdYear}`;
    }

    getDurationInWeek = (startDate) => {
        const currentDate = new Date();
        const startDateTime = new Date(startDate);
        let dateDiff = (currentDate.getTime() - startDateTime.getTime()) / 1000;
        dateDiff /= 60 * 60 * 24 * 7;
        return Math.abs(Math.round(dateDiff));
    }

    sortMembers = (members) => {
        const memberObj = {
            membersSafe: [],
            membersUnsafe: [],
            membersNotResponded: []
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
                    const duration = this.getDurationInWeek(inc.incCreatedDate).toString() + "w";
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
}

module.exports.AreYouSafeTab = AreYouSafeTab;