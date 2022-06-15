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
        "type": "TextBlock",
        "text": eventName,
        "wrap": true,
        "separator": addSeperator,
        "weight": "Bolder",
        "size": "Large"
    }
 }

 const getIncStatusWithStartDate = (status, startTime) => {
    const createdDate = new Date(startTime);
    const monthName = createdDate.toLocaleString('default', { month: 'long' });
    const creatdDate = createdDate.getDate();
    const createdYear = createdDate.getFullYear();
    const startOn = `${monthName} ${creatdDate}, ${createdYear}`;
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
                        "color": "Attention",
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

 const getDetailUsersResponse = (membersUnsafe, membersNotResponded, membersSafe) => {
    let membersUnsafeStr = membersUnsafe.join(", ");
    let membersNotRespondedStr = membersNotResponded.join(", ");
    let membersSafeStr = membersSafe.join(", ");
    const detailsResponse = [
        {
            "type": "ColumnSet",
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
                        }
                    ]
                }
            ]
        },
        {
            "type": "ColumnSet",
            "columns": [
                {
                    "type": "Column",
                    "width": 4,
                    "items": [
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
                        }
                    ]
                }
            ]
        },
        {
            "type": "ColumnSet",
            "columns": [
                {
                    "type": "Column",
                    "width": 4,
                    "items": [
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
    ]
    return detailsResponse;
 }

const getUsersResponse = (members, mentionUserEntities) => {    
    let result = {
        membersSafe: [],
        membersUnsafe: [],
        membersNotResponded: [],
    };

    members.forEach((m) => {
        const {userId, userName, response, responseValue } = m;

        if (response == "na" || response == false) {
            result.membersNotResponded.push(`<at>${userName}</at>`);
        }
        if (response == true) {
            if (responseValue == true) {
                result.membersSafe.push(`<at>${userName}</at>`);
            } else if (responseValue == false || responseValue == null) {
                result.membersUnsafe.push(`<at>${userName}</at>`);
            }
        }

        const mention = {
            type: "mention",
            text: `<at>${userName}</at>`,
            mentioned: {
              id: userId,
              name: userName,
            },
          };
      
        mentionUserEntities.push(mention);
    });

    const detailResponse = getDetailUsersResponse(result.membersUnsafe, result.membersNotResponded, result.membersSafe);
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

const getCreatedByObj = async (createdByNameId, allMembers) => {
    let createdByName = "";
    if(createdByNameId != null) {
        const usrObj = allMembers.find((m) => m.id = createdByNameId);    
        if(usrObj != null && usrObj.name != null){
            createdByName = usrObj.name;
        }
    }
    
    return {
        "type": "TextBlock",
        "text": `Created by **<at>${createdByName}</at>**`,
        "wrap": true
    }
}

const getDashboardActionBtnObj = (incId, companyData, detailResponse) => {
    return {
        "type": "ActionSet",
        "actions": [
            {
                "type": "Action.ShowCard",
                "card": {
                    "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
                    "version": "1.4",
                    "type": "AdaptiveCard",
                    "body": detailResponse                                      
                },
                "title": "Show Details",
                "data": {
                    "incId": `${incId}`,
                    "companyData": companyData,
                }               
            },
            {
                "type": "Action.Execute",
                "title": "Copy",
                "data": {
                    "incId": `${incId}`,
                    "companyData": companyData
                }
            },
            {
                "type": "Action.Execute",
                "title": "Close",
                "data": {
                    "incId": `${incId}`,
                    "companyData": companyData
                }
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
    let card = null;
    try{
        const allIncData = await incidentService.getAllIncByTeamId(companyData.teamId);
    
        if(allIncData != null && allIncData.length > 0){
            let eventIndex = 0;
            if(dashboardData != null && dashboardData.eventIndex != null){
                if(dashboardData.eventIndex > 0){
                    eventIndex = dashboardData.eventIndex;
                }    
                
                if(allIncData.length == eventIndex){
                    eventIndex -= 2;
                }
            }
    
            const previousIndex = (eventIndex - 2);
            let body = [];
            let uniquementionUserEntities = null;
            if(allIncData.length > eventIndex){       
                let eventCount = 1;
                let eventNum = 1;
                if(eventIndex > 1){
                  eventNum = Number(eventIndex) + 1;
                }
                const mentionUserEntities = [];
                for(let i = (allIncData.length - eventIndex); i >= 1; i--){
                    if(eventCount > 2) {
                        break;
                    }
        
                    if(body.length == 0){
                        body.push(incList);
                    }
                    const incData = allIncData[i-1];
                    const addSeperator = (eventCount == 1);
                    const eventName = `${eventNum} ${incData.incTitle} ` + (incData.incType == "recurring" ? "(recurring)" : "");
                    const incNameHeader = getIncidentNameHeader(eventName, addSeperator);
                    const incStatusWithStartDate = getIncStatusWithStartDate("In-progress", incData.incCreatedDate);
                    const userResponseObj = getUsersResponse(incData.members, mentionUserEntities);
                    const createdBy = await getCreatedByObj(incData.incCreatedBy, allTeamMembers);
                    const dashboardActionBtn = getDashboardActionBtnObj(incData.incId, companyData, userResponseObj.detailResponse, userResponseObj.mentionUserEntities);
                    body.push(incNameHeader);
                    body.push(incStatusWithStartDate);
                    body.push(userResponseObj.shortResponse);
                    body.push(createdBy);
                    body.push(dashboardActionBtn);

                    eventCount++;
                    eventIndex++;
                    eventNum++;
                }

                if(mentionUserEntities.length > 0){
                    uniquementionUserEntities =  [...new Set(mentionUserEntities)];
                }                

                if(body.length > 0 && allIncData.length > 2){
                    const isPreviousBtnVisible = (eventIndex > 2); 
                    const isNextBtnVisible = (eventIndex < allIncData.length);
                    const navBtnObj = getNextPreviousBtnObj(eventIndex, previousIndex, isPreviousBtnVisible, isNextBtnVisible, companyData);
                    body.push(navBtnObj);
                }
            }
            if(body.length > 0){
                card = {
                    type: "AdaptiveCard",
                    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
                    version: "1.4",
                    body: body,
                    "msteams": {
                        "entities": [{
                            "type": "mention",
                            "text": "<at>Sandesh Sawant</at>",
                            "mentioned": {
                              "id": "29:14xKzHoGhohgIpMI5zrDD2IuwD4XLWQHK-uN09QacAGO-r5MkSx2kuoKdB1hEKneuePknoF22_Oiwv0R0yz6KHA",
                              "name": "Sandesh Sawant"
                            }
                        }]
                    }         
                };
                if(uniquementionUserEntities != null){
                    card["msteams"] = {
                        "entities": uniquementionUserEntities
                    }
                }
            }
        }
    }
    catch(err){
        console.log(err);
    }    
    return card;
}

module.exports = {
    getIncidentTileDashboardCard
}