const { formatedDate } = require("../utils");


const getIncNameInputJson = (incData, isCopy) => {
    const incNameInputJson = {
        type: "Input.Text",
        isRequired: true,
        errorMessage: "Please complete this required field.",
        placeholder: "Enter the Incident Name",
        id: "inc_title",
    }
    if(isCopy && incData != null && incData.incTitle != null){
        incNameInputJson["value"] = `Copy of ${incData.incTitle}`;
    }
    return incNameInputJson;
}

const getIncGuidanceInputJson = (incData, isCopy) => {
    const incGuidanceInputJson = {
        type: "Input.Text",
        isMultiline: true,
        placeholder: "Enter the Guidance",
        id: "guidance",
      }
    if(isCopy && incData != null && incData.incGuidance != null){
        incGuidanceInputJson["value"] = incData.incGuidance;
    }
    return incGuidanceInputJson;
}

const getEventDaysDrpJson = (incData, isCopy) => {
    const eventDays = [
        { title: "Sun", value: "0" }, { title: "Mon", value: "1" }, { title: "Tue", value: "2" }, { title: "Wed", value: "3" },
        { title: "Thur", value: "4" }, { title: "Fri", value: "5" }, { title: "Sat", value: "6" }
    ];
    const incEventDaysDrpJson = {
        type: "Input.ChoiceSet",
        weight: "bolder",
        id: "eventDays",
        style: "filtered",
        isMultiSelect: true,
        choices: eventDays,
        value: "1,2,3,4,5"
    }
    if(isCopy && incData != null && incData.occursEvery != null){
        incEventDaysDrpJson["value"] = incData.occursEvery;
    }
    return incEventDaysDrpJson;
}

const getStartDateDPJson = (incData, isCopy) => {
    const incStartDateDPJson = {
        "type": "Input.Date",
        "value": formatedDate("yyyy-mm-dd", (new Date())),
        "id": "startDate"
    }
    if(isCopy && incData != null && incData.startDate != null) {
        const startDate = new Date(incData.startDate);
        incStartDateDPJson["value"] = formatedDate("yyyy-mm-dd", startDate);
    }
    return incStartDateDPJson;
}

const getStartTimeTPJson = (incData, isCopy) => {
    const incStartTimeTPJson = {
        "type": "Input.Time",
        "value": "10:00",
        "id": "startTime"
    }
    if(isCopy && incData != null && incData.startTime != null) {
        incStartTimeTPJson["value"] = incData.startTime;
    }
    return incStartTimeTPJson;
}

const getEndDateDPJson = (incData, isCopy) => {
    var nextWeekDate = new Date();
    nextWeekDate.setDate(nextWeekDate.getDate() + 7);

    const incEndDateDPJson = {
        "type": "Input.Date",
        "value": formatedDate("yyyy-mm-dd", nextWeekDate),
        "id": "endDate"
    }
    if(isCopy && incData != null && incData.endDate != null) {
        const endDate = new Date(incData.endDate);
        incEndDateDPJson["value"] = formatedDate("yyyy-mm-dd", endDate);
    }
    return incEndDateDPJson;
}

const getEndTimeTPJson = (incData, isCopy) => {
    const incEndTimeTPJson = {
        "type": "Input.Time",
        "value": "10:00",
        "id": "endTime"
    }
    if(isCopy && incData != null && incData.endTime != null) {
        incEndTimeTPJson["value"] = incData.endTime;
    }
    return incEndTimeTPJson;
}

const getSelectedMemberDrpJson = (incData, isCopy, memberChoises) => {
    const incSelectedMemberDrpJson = {
        type: "Input.ChoiceSet",
        weight: "bolder",
        id: "selected_members",
        style: "filtered",
        isMultiSelect: true,
        placeholder: "Select users",
        choices: memberChoises,
    }
    if(isCopy && incData != null && incData.members != null && incData.members.length > 0){
        let userId = incData.members.map((m) => m.userId);
        incSelectedMemberDrpJson["value"] = userId.toString();
    }
    return incSelectedMemberDrpJson;
}

const getResponseSelectedMemberDrpJson = (incData, isCopy, memberChoises) => {
    const incResponseSelectedMemberDrpJson = {
        type: "Input.ChoiceSet",
        weight: "bolder",
        id: "selected_members_response",
        style: "filtered",
        isMultiSelect: true,
        placeholder: "Select users",
        choices: memberChoises,
      }
    if(isCopy && incData != null && incData.responseSelectedUsers != null && incData.responseSelectedUsers.length > 0){
        let userId = incData.responseSelectedUsers.map((m) => m.user_id);
        incResponseSelectedMemberDrpJson["value"] = userId.toString();
    }
    return incResponseSelectedMemberDrpJson;
}

const getNewIncCardNew = async (user, companyData, allMembers, errorMessage = "", incData = null, isCopy = false) => {  
    const memberChoises = allMembers.map((m) => ({
      title: m.name,
      value: m.id
    }));

    const incNameInputJson = getIncNameInputJson(incData, isCopy);
    const incGuidanceInputJson = getIncGuidanceInputJson(incData, isCopy);
    const incEventDaysDrpJson = getEventDaysDrpJson(incData, isCopy);
    const incStartDateDPJson = getStartDateDPJson(incData, isCopy);
    const incStartTimeTPJson = getStartTimeTPJson(incData, isCopy);
    const incEndDateDPJson = getEndDateDPJson(incData, isCopy);
    const incEndTimeTPJson = getEndTimeTPJson(incData, isCopy);
    const incSelectedMemberDrpJson = getSelectedMemberDrpJson(incData, isCopy, memberChoises);
    const incResponseSelectedMemberDrpJson = getResponseSelectedMemberDrpJson(incData, isCopy, memberChoises);
    return {
      $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
      appId: process.env.MicrosoftAppId,
      body: [
        {
          type: "TextBlock",
          size: "Large",
          weight: "Bolder",
          text: "Create Incident",
        },
        {
          type: "TextBlock",
          text: "Name of Incident",
          weight: "bolder",
          separator: true,
        },
        incNameInputJson,
        {
          "type": "TextBlock",
          "text": errorMessage,
          "wrap": true,
          "isVisible": !(errorMessage == null || errorMessage == ""),
          "color": "Warning"
        },
        {
          type: "TextBlock",
          text: "Guidance",
          weight: "bolder"
        },
        incGuidanceInputJson,
        {
          "type": "ColumnSet",
          "id" : "colSetOneTime",
          "columns": [
            {
              "type": "Column",
              "width": "stretch",
              "items": [
                {
                  "type": "ActionSet",
                  "actions": [
                    {
                      "type": "Action.ToggleVisibility",
                      "title": "Recurring",
                      "targetElements": ["colSetOneTime", "colSetRecurring", "asbtnSaveOneTimeInc", "asbtnSaveRecurrInc"]
                    }
                  ]
                }                  
              ]
            }
          ]
        },
        {
          "type": "ColumnSet",
          "id" : "colSetRecurring",
          "isVisible" : false,
          "columns": [
            {
              "type": "Column",
              "width": "stretch",
              "items": [
                {
                  "type": "ActionSet",
                  "actions": [
                    {
                        "type": "Action.ToggleVisibility",
                        "title": "One Time",
                        "targetElements": ["colSetOneTime", "colSetRecurring", "asbtnSaveOneTimeInc", "asbtnSaveRecurrInc"]
                    }
                  ]
                },
                {
                  type: "TextBlock",
                  wrap: true,
                  text: "Occurs Every",
                  weight: "bolder",
                  id: "lblOccursEvery"
                },
                incEventDaysDrpJson,
                {
                  type: "TextBlock",
                  wrap: true,
                  text: "Range of Recurrence",
                  weight: "bolder",
                  id: "lblRangeofRecurrence"
                },
                {
                  type: "TextBlock",
                  wrap: true,
                  text: "Start Date and Time",
                  id: "lblStartTime"
                },
                {
                  "type": "ColumnSet",
                  "id": "lblColumnSet",
                  "columns": [
                    {
                      "type": "Column",
                      "width": "stretch",
                      "items": [
                        incStartDateDPJson
                      ]
                    },
                    {
                      "type": "Column",
                      "width": "stretch",
                      "items": [
                        incStartTimeTPJson
                      ]
                    }
                  ]
                },
                {
                  type: "TextBlock",
                  wrap: true,
                  text: "End Date and Time",
                  id: "lblEndTime"
                },
                {
                  "type": "ColumnSet",
                  "id": "lblColumnSet2",
                  "columns": [
                    {
                      "type": "Column",
                      "width": "stretch",
                      "items": [
                        incEndDateDPJson
                      ]
                    },
                    {
                      "type": "Column",
                      "width": "stretch",
                      "items": [
                        incEndTimeTPJson
                      ]
                    }
                  ]
                }               
              ]
            }
          ]
        },
        {
          type: "TextBlock",
          wrap: true,
          text: "Send the incident notification to these members (optional)",
          weight: "bolder",
        },
        incSelectedMemberDrpJson,
        {
          type: "TextBlock",
          size: "small",
          isSubtle: true,
          wrap: true,
          text: `⚠️ Ignore this field to send incident notification to **all teams members**`,
        },
        {
          type: "TextBlock",
          wrap: true,
          text: "Select users where the Incident response should be sent (optional)",
          weight: "bolder"
        },
        incResponseSelectedMemberDrpJson,
        {
          type: "TextBlock",
          size: "small",
          isSubtle: true,
          wrap: true,
          text: `⚠️ Safety check responses will be sent to these members`,
        },
        {
          "type": "ActionSet",
          "id": "asbtnSaveOneTimeInc",
          "separator": true,
          "actions": [
            {
              type: "Action.Execute",
              verb: "Cancel_button",
              title: "Cancel",
              data: {
                info: "Back",
                companyData: companyData,
              },
              associatedInputs: "none"
            },
            {
              type: "Action.Execute",
              verb: "save_new_inc",
              title: "Submit",
              "id": "btnSaveOneTimeInc",
              data: {
                info: "save",
                inc_created_by: user,
                companyData: companyData,
                memberChoises: memberChoises
              }
            }
          ]
        },
        {
          "type": "ActionSet",
          "id": "asbtnSaveRecurrInc",
          "isVisible": false,        
          "separator": true,
          "actions": [
            {
              type: "Action.Execute",
              verb: "Cancel_button",
              title: "Cancel",
              data: {
                info: "Back",
                companyData: companyData,
              },
              associatedInputs: "none"
            },
            {
              type: "Action.Execute",
              verb: "save_new_recurr_inc",
              title: "Submit",
              "id": "btnSaveRecurrInc",            
              data: {
                info: "save",
                inc_created_by: user,
                companyData: companyData,
                memberChoises: memberChoises
              }
            }
          ]
        }
      ],    
      type: "AdaptiveCard",
      version: "1.4",
    };
}

module.exports = {
    getNewIncCardNew
}