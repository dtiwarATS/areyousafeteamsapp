const incidentService = require("../services/incidentService");
const {
    getAllTeamMembers
  } = require("../api/apiMethods");

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

const getUsersResponse = (members) => {
    let result = {
        membersSafe: [],
        membersUnsafe: [],
        membersNotResponded: [],
    };

    members.forEach((m) => {
        const { userName, response, responseValue } = m;

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
    });

    return {
        "type": "TextBlock",
        "wrap": true,
        "text": `🔴 Need Assistance: ${result.membersUnsafe.length} | 🟡 Not responded: ${result.membersNotResponded.length} | 🟢 Safe: ${result.membersSafe.length}`
    }
}

const getCreatedByObj = async (createdByNameId, allMembers) => {
    let createdByName = "";
    if(createdByNameId != null){        
        const usrObj = allMembers.find((m) => m.id = createdByNameId);    
        if(usrObj != null && usrObj.name != null){
            createdByName = usrObj.name;
        }
    }
    
    return {
        "type": "TextBlock",
        "text": `Created by **${createdByName}**`,
        "wrap": true
    }
}

const getDashboardActionBtnObj = (incId, companyData) => {
    return {
        "type": "ActionSet",
        "actions": [
            {
                "type": "Action.ShowCard",
                "card": {
                    "type": "AdaptiveCard"
                },
                "title": "Show Details",
                "data": {
                    "incId": `${incId}`,
                    "companyData": companyData
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
            if(allIncData.length > eventIndex){       
                let eventCount = 1;
                let eventNum = 1;
                if(eventIndex > 1){
                  eventNum = Number(eventIndex) + 1;
                }                
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
                    const userResponse = getUsersResponse(incData.members);
                    const createdBy = await getCreatedByObj(incData.incCreatedBy, allTeamMembers);
                    const dashboardActionBtn = getDashboardActionBtnObj(incData.incId, companyData);
                    body.push(incNameHeader);
                    body.push(incStatusWithStartDate);
                    body.push(userResponse);
                    body.push(createdBy);
                    body.push(dashboardActionBtn);

                    eventCount++;
                    eventIndex++;
                    eventNum++;
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
                    body: body             
                };
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