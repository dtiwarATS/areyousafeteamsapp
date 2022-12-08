const incidentService = require("../services/incidentService");
const dashboard = require("../models/dashboard");

const getSafetyCheckMessageText = async (incId, createdByName, incTitle, mentionUserEntities, incRespSelectedUsers = null, incTypeId = 1) => {
    let onBehalfOf = "", responseUsers = "";
    if (incTypeId == 1) {
        if (incRespSelectedUsers == null) {
            incRespSelectedUsers = await incidentService.getIncResponseSelectedUsersList(incId);
        }
        if (incRespSelectedUsers != null && incRespSelectedUsers.length > 0) {
            for (let i = 0; i < incRespSelectedUsers.length; i++) {
                const { user_id: userId, user_name: userName } = incRespSelectedUsers[i];
                responseUsers += ((responseUsers != "") ? ", " : "") + `<at>${userName}</at>`;
                dashboard.mentionUser(mentionUserEntities, userId, userName);
            }
        }
        if (responseUsers != "") {
            onBehalfOf = ` on behalf of ${responseUsers}`;
        }
    }
    let msg = "";
    if (incTypeId == 1) {//Safety Check
        msg = `This is a safety check from <at>${createdByName}</at>${onBehalfOf}. We think you may be affected by **${incTitle}**. Mark yourself as safe, or ask for assistance.`;
    } else {
        msg = `This is a safety alert from <at>${createdByName}</at>. We think you may be affected by **${incTitle}**.`;
    }
    return msg;
};

const getSafetyCheckTypeCard = async (incTitle, incObj, companyData, incGuidance, incResponseSelectedUsersList, incTypeId) => {
    const mentionUserEntities = [];
    const safetyCheckMessageText = await getSafetyCheckMessageText(incObj.incId, incObj.incCreatedBy.name, incTitle, mentionUserEntities, incResponseSelectedUsersList, incTypeId);

    dashboard.mentionUser(mentionUserEntities, incObj.incCreatedBy.id, incObj.incCreatedBy.name);
    const cardBody = [
        {
            type: "TextBlock",
            size: "Large",
            weight: "Bolder",
            text: "Hello!"
        },
        {
            type: "TextBlock",
            separator: true,
            wrap: true,
            text: safetyCheckMessageText
        }
    ];
    if (incTypeId == 1) {
        cardBody.push({
            type: "ActionSet",
            actions: [
                {
                    type: "Action.Execute",
                    verb: "send_response",
                    title: "I am safe",
                    data: {
                        info: "i_am_safe",
                        inc: incObj,
                        companyData: companyData
                    }
                },
                {
                    type: "Action.Execute",
                    verb: "send_response",
                    title: "I need assistance",
                    data: {
                        info: "need_assistance",
                        inc: incObj,
                        companyData: companyData
                    }
                }
            ]
        });
    }
    cardBody.push({
        type: "TextBlock",
        separator: true,
        wrap: true,
        text: `**Guidance:**\n\n` + incGuidance,
    });
    return {
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
        appId: process.env.MicrosoftAppId,
        body: cardBody,
        msteams: {
            entities: mentionUserEntities
        },
        type: "AdaptiveCard",
        version: "1.4",
    };
}

const SafetyCheckCard = async (incTitle, incObj, companyData, incGuidance, incResponseSelectedUsersList, incTypeId) => {
    let card = null;
    switch (incTypeId) {
        case 1: //Safety Check
            card = await getSafetyCheckTypeCard(incTitle, incObj, companyData, incGuidance, incResponseSelectedUsersList, incTypeId);
            break;
        case 2: //Safety Alert
            card = await getSafetyCheckTypeCard(incTitle, incObj, companyData, incGuidance, null, incTypeId);
            break;
        case 3: //Important Bulletin
            card = null;
            break;
        case 4: //Travel Advisory
            card = null;
            break;
        case 5: //Stakeholder Notice
            card = null;
            break;
    }
    return card;
}

module.exports = {
    getSafetyCheckMessageText,
    SafetyCheckCard
};