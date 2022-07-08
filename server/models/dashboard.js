const incidentService = require("../services/incidentService");

const incList = {
    "type": "TextBlock",
    "text": "Incident List",
    "wrap": true,
    "style": "heading",
    "size": "Large",
    "weight": "Bolder"
}

const getIncidentNameHeader = (eventName, addSeperator) => {
    return {
        "type": "RichTextBlock",
        "inlines": [
            {
                "type": "TextRun",
                "text": eventName,
                "weight": "Bolder",
                "size": "Large"
            }
        ],
        "separator": true
    }
}

const getIncStatusWithStartDate = (status, startTime) => {
    const createdDate = new Date(startTime);
    const monthName = createdDate.toLocaleString('default', { month: 'long' });
    const creatdDate = createdDate.getDate();
    const createdYear = createdDate.getFullYear();
    const startOn = `Started on ${monthName} ${creatdDate}, ${createdYear}`;
    return {
        "type": "ColumnSet",
        "columns": [
            {
                "type": "Column",
                "width": "auto",
                "items": [
                    {
                        "type": "TextBlock",
                        "text": status,
                        "wrap": true,
                        "color": "good",
                        "weight": "Bolder",
                        "spacing": "None"
                    }
                ],
                "spacing": "Small"
            },
            {
                "type": "Column",
                "width": "auto",
                "items": [
                    {
                        "type": "TextBlock",
                        "text": "|",
                        "wrap": true,
                        "spacing": "None"
                    }
                ],
                "spacing": "Small"
            },
            {
                "type": "Column",
                "width": "auto",
                "items": [
                    {
                        "type": "TextBlock",
                        "text": startOn,
                        "wrap": true,
                        "spacing": "None"
                    }
                ],
                "spacing": "Small"
            }
        ]
    }
}

const getDetailUsersResponse = (membersUnsafe, membersNotResponded, membersSafe, eventNum) => {
    let membersUnsafeStr = membersUnsafe.join(", ");
    let membersNotRespondedStr = membersNotResponded.join(", ");
    let membersSafeStr = membersSafe.join(", ");
    const detailsResponse = {
        "type": "ColumnSet",
        "id": `colSet${eventNum}`,
        "style": "emphasis",
        "isVisible": false,
        "columns": [
            {
                "type": "Column",
                "width": 4,
                "items": [
                    {
                        "type": "TextBlock",
                        "wrap": true,
                        "text": `**🔴 Need Assistance: ${membersUnsafe.length}**`,
                        "color": "attention"
                    },
                    {
                        "type": "TextBlock",
                        "wrap": true,
                        "text": membersUnsafeStr,
                        "isSubtle": true,
                        "spacing": "none"
                    },
                    {
                        "type": "TextBlock",
                        "wrap": true,
                        "text": `**🟡 Not Responded: ${membersNotResponded.length}**`,
                        "color": "default"
                    },
                    {
                        "type": "TextBlock",
                        "wrap": true,
                        "text": membersNotRespondedStr,
                        "isSubtle": true,
                        "spacing": "none"
                    },
                    {
                        "type": "TextBlock",
                        "wrap": true,
                        "text": `**🟢 Safe: ${membersSafe.length}**`,
                        "color": "good"
                    },
                    {
                        "type": "TextBlock",
                        "wrap": true,
                        "text": membersSafeStr,
                        "isSubtle": true,
                        "spacing": "none"
                    }
                ]
            }
        ]
    }
    return detailsResponse;
}

const mentionUser = (mentionUserEntities, userId, userName) => {
    if (mentionUserEntities != null && userId != null && userName != null) {
        const user = mentionUserEntities.find((u) => u.text == `<at>${userName}</at>`);
        if (user == null) {
            const mention = {
                type: "mention",
                text: `<at>${userName}</at>`,
                mentioned: {
                    id: userId,
                    name: userName,
                },
            };

            mentionUserEntities.push(mention);
        }
    }
}

const getUsersResponse = (members, mentionUserEntities, eventNum) => {
    let result = {
        membersSafe: [],
        membersUnsafe: [],
        membersNotResponded: [],
    };

    members.forEach((m) => {
        const { userId, userName, response, responseValue } = m;

        if (response == "na" || response == false) {
            result.membersNotResponded.push(`<at>${userName}</at>`);
            mentionUser(mentionUserEntities, userId, userName);
        }
        else if (response == true) {
            if (responseValue == true) {
                result.membersSafe.push(`<at>${userName}</at>`);
            } else if (responseValue == false || responseValue == null) {
                result.membersUnsafe.push(`<at>${userName}</at>`);
            }
            mentionUser(mentionUserEntities, userId, userName);
        }
    });

    const detailResponse = getDetailUsersResponse(result.membersUnsafe, result.membersNotResponded, result.membersSafe, eventNum);
    const shortResponse = {
        "type": "TextBlock",
        "wrap": true,
        "text": `🔴 Need Assistance: ${result.membersUnsafe.length} | 🟡 Not responded: ${result.membersNotResponded.length} | 🟢 Safe: ${result.membersSafe.length}`
    }
    return {
        "detailResponse": detailResponse,
        "shortResponse": shortResponse,
        "mentionUserEntities": mentionUserEntities
    }
}

const getCreatedByObj = async (createdByNameId, allMembers, mentionUserEntities) => {
    let createdByName = "";
    if (createdByNameId != null) {
        const usrObj = allMembers.find((m) => m.id == createdByNameId);
        if (usrObj != null && usrObj.id != null && usrObj.name != null) {
            createdByName = usrObj.name;
            mentionUser(mentionUserEntities, usrObj.id, usrObj.name);
        }
    }

    if (createdByName != "") {
        createdByName = `**<at>${createdByName}</at>**`;
    }
    return {
        "type": "TextBlock",
        "text": `Created by ${createdByName}`,
        "wrap": true
    }
}

const getDashboardActionBtnObj = (incId, companyData, eventNum, lastPageEventIndex, incStatus, incTitle) => {
    const dashboardData = { "lastPageEventIndex": lastPageEventIndex };
    return {
        "type": "ColumnSet",
        "columns": [
            {
                "type": "Column",
                "width": "auto",
                "id": `colShowDetails${eventNum}`,
                "spacing": "Small",
                "items": [
                    {
                        "type": "ActionSet",
                        "spacing": "none",
                        "actions": [
                            {
                                "type": "Action.ToggleVisibility",
                                "title": "Show Details",
                                "targetElements": [`colSet${eventNum}`, `colHideDetails${eventNum}`, `colShowDetails${eventNum}`]
                            }
                        ]
                    }
                ]
            },
            {
                "type": "Column",
                "width": "auto",
                "id": `colHideDetails${eventNum}`,
                "isVisible": false,
                "spacing": "Small",
                "items": [
                    {
                        "type": "ActionSet",
                        "spacing": "none",
                        "actions": [
                            {
                                "type": "Action.ToggleVisibility",
                                "title": "Hide Details",
                                "targetElements": [`colSet${eventNum}`, `colShowDetails${eventNum}`, `colHideDetails${eventNum}`]
                            }
                        ]
                    }
                ]
            },
            {
                "type": "Column",
                "width": "auto",
                "spacing": "Small",
                "isVisible": (incStatus == "In progress"),
                "items": [
                    {
                        "type": "ActionSet",
                        "spacing": "none",
                        "actions": [
                            {
                                "type": "Action.Execute",
                                "title": "Copy",
                                "verb": "copyInc",
                                "data": {
                                    "incId": `${incId}`,
                                    "companyData": companyData,
                                    "dashboardData": dashboardData,
                                }
                            },
                            {
                                "type": "Action.Execute",
                                "title": "Close",
                                "verb": "closeInc",
                                "data": {
                                    "incId": `${incId}`,
                                    "companyData": companyData,
                                    "dashboardData": dashboardData,
                                    "incTitle": incTitle
                                }
                            }
                        ]
                    }
                ]
            },
            {
                "type": "Column",
                "width": "auto",
                "spacing": "Small",
                "isVisible": (incStatus == "Closed"),
                "items": [
                    {
                        "type": "ActionSet",
                        "spacing": "none",
                        "actions": [
                            {
                                "type": "Action.Execute",
                                "title": "Reopen",
                                "verb": "reopenInc",
                                "data": {
                                    "incId": `${incId}`,
                                    "companyData": companyData,
                                    "dashboardData": dashboardData,
                                    "incTitle": incTitle
                                }
                            },
                            {
                                "type": "Action.Execute",
                                "title": "Delete",
                                "verb": "confirmDeleteInc",
                                "data": {
                                    "incId": `${incId}`,
                                    "companyData": companyData,
                                    "dashboardData": dashboardData,
                                    "incTitle": incTitle
                                }
                            }
                        ]
                    }
                ]
            }
        ]
    }
}

const getNextPreviousBtnObj = (nextIndex, previousIndex, isPreviousBtnVisible, isNextBtnVisible, companyData) => {
    return {
        "type": "ColumnSet",
        "separator": true,
        "columns": [
            {
                "type": "Column",
                "width": "auto",
                "items": [
                    {
                        "type": "ActionSet",
                        "actions": [
                            {
                                "type": "Action.Execute",
                                "title": "<< Previous",
                                "verb": "dashboard_view_previous_inc",
                                "data": {
                                    "eventIndex": `${previousIndex}`,
                                    "companyData": companyData
                                }
                            }
                        ]
                    }
                ],
                "isVisible": isPreviousBtnVisible
            },
            {
                "type": "Column",
                "width": "auto",
                "items": [
                    {
                        "type": "ActionSet",
                        "actions": [
                            {
                                "type": "Action.Execute",
                                "title": "Next >>",
                                "verb": "dashboard_view_next_inc",
                                "data": {
                                    "eventIndex": `${nextIndex}`,
                                    "companyData": companyData
                                }
                            }
                        ]
                    }
                ],
                "isVisible": isNextBtnVisible
            }
        ]
    }
}

const getIncidentTileDashboardCard = async (dashboardData, companyData, allTeamMembers) => {
    let body = [], mentionUserEntities = [], card = null;
    try {
        const allIncData = await incidentService.getAllIncByTeamId(companyData.teamId);

        if (allIncData != null && allIncData.length > 0) {
            let eventIndex = 0;
            let lastPageEventIndex = 0;
            if (dashboardData != null && dashboardData.eventIndex != null) {
                if (dashboardData.eventIndex > 0) {
                    eventIndex = dashboardData.eventIndex;
                    lastPageEventIndex = dashboardData.eventIndex;
                }

                if (allIncData.length == eventIndex) { //When there is only one incident on last page. If user delete that incident then this code will set the previous page eventIndex to navigate back  
                    eventIndex -= 2;
                }
            }

            const previousIndex = (eventIndex - 2);

            if (allIncData.length > eventIndex) {
                let eventCount = 1;
                let eventNum = 1;
                if (eventIndex > 1) {
                    eventNum = Number(eventIndex) + 1;
                }
                for (let i = (allIncData.length - eventIndex); i >= 1; i--) {
                    if (eventCount > 2) {
                        break;
                    }

                    if (body.length == 0) {
                        body.push(incList);
                    }
                    const incData = allIncData[i - 1];
                    const addSeperator = (eventCount == 1);
                    const eventName = `${eventNum}. ${incData.incTitle} ` + (incData.incType == "recurringIncident" ? "(recurring)" : "");
                    let incStatus = "In progress";
                    if (incData.incStatusId != null && incData.incStatusId == 2) {
                        incStatus = "Closed";
                    }
                    const incNameHeader = getIncidentNameHeader(eventName, addSeperator);
                    const incStatusWithStartDate = getIncStatusWithStartDate(incStatus, incData.incCreatedDate);

                    let incMembers = incData.members;
                    if (incData.incType == "recurringIncident") {
                        incMembers = await incidentService.getRecurrenceMembersResponse(incData.incId);
                    }

                    const userResponseObj = getUsersResponse(incMembers, mentionUserEntities, eventNum);
                    const createdBy = await getCreatedByObj(incData.incCreatedBy, allTeamMembers, mentionUserEntities);
                    const dashboardActionBtn = getDashboardActionBtnObj(incData.incId, companyData, eventNum, lastPageEventIndex, incStatus, incData.incTitle);
                    body.push(incNameHeader);
                    body.push(incStatusWithStartDate);
                    body.push(userResponseObj.shortResponse);
                    body.push(createdBy);
                    body.push(dashboardActionBtn);
                    body.push(userResponseObj.detailResponse);

                    eventCount++;
                    eventIndex++;
                    eventNum++;
                }

                if (body.length > 0 && allIncData.length > 2) {
                    const isPreviousBtnVisible = (eventIndex > 2);
                    const isNextBtnVisible = (eventIndex < allIncData.length);
                    const navBtnObj = getNextPreviousBtnObj(eventIndex, previousIndex, isPreviousBtnVisible, isNextBtnVisible, companyData);
                    body.push(navBtnObj);
                }
            }
        }
        else {
            const emptyInc = {
                "type": "TextBlock",
                "wrap": true,
                "text": "👋 Hello! You do not have any incident running at the moment!!!"
            }
            body.push(emptyInc);
        }
        if (body.length > 0) {
            card = {
                "type": "AdaptiveCard",
                "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
                "version": "1.4",
                "body": body,
                "msteams": {
                    "entities": mentionUserEntities
                }
            }
        }
    }
    catch (err) {
        console.log(err);
    }
    return card;
}

const getUpdateIncidentStatusCard = (incId, dashboardData, companyData, statusToUpdate, incTitle) => {
    let btnTitle = "Close Incident";
    let msgText = "Are you sure you want to close this incident?";

    if (statusToUpdate == "In progress") {
        btnTitle = "Reopen Incident";
        msgText = "Are you sure you want to reopen this incident?";
    }

    const card = {
        "type": "AdaptiveCard",
        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
        "version": "1.4",
        "body": [
            {
                "type": "TextBlock",
                "text": msgText,
                "wrap": true,
                "weight": "Bolder"
            },
            {
                "type": "ActionSet",
                "actions": [
                    {
                        "type": "Action.Execute",
                        "title": "Cancel",
                        "verb": "Cancel_button"
                    },
                    {
                        "type": "Action.Execute",
                        "title": btnTitle,
                        "verb": "updateIncStatus",
                        "data": {
                            "incId": incId,
                            "statusToUpdate": statusToUpdate,
                            "dashboardData": dashboardData,
                            "companyData": companyData,
                            "incTitle": incTitle
                        }
                    }
                ]
            }
        ]
    }
    return card;
}

const getDeleteIncidentCard = (incId, dashboardData, companyData, incTitle) => {
    let msgText = "Are you sure you want to delete this incident?";

    const card = {
        "type": "AdaptiveCard",
        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
        "version": "1.4",
        "body": [
            {
                "type": "TextBlock",
                "text": msgText,
                "wrap": true,
                "weight": "Bolder"
            },
            {
                "type": "ActionSet",
                "actions": [
                    {
                        "type": "Action.Execute",
                        "title": "Cancel",
                        "verb": "Cancel_button"
                    },
                    {
                        "type": "Action.Execute",
                        "title": "Delete Incident",
                        "verb": "delete_inc",
                        "data": {
                            "incId": incId,
                            "dashboardData": dashboardData,
                            "companyData": companyData,
                            "incTitle": incTitle,
                            "deleteFromDashboard": true,
                        }
                    }
                ]
            }
        ]
    }
    return card;
}

module.exports = {
    getIncidentTileDashboardCard,
    mentionUser,
    getUpdateIncidentStatusCard,
    getDeleteIncidentCard
}