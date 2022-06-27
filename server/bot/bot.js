const {
  StatusCodes,
  MessageFactory,
  CardFactory,
  TurnContext,
  TeamsInfo,
  Message
} = require("botbuilder");
const {
  MicrosoftAppCredentials,
  ConnectorClient,
} = require("botframework-connector");
const incidentService = require("../services/incidentService");
const path = require("path");
const {
  getAllTeamMembers,
  sendDirectMessage,
  sendDirectMessageCard,
  sendProactiveMessaageToUser,
  updateMessage
} = require("../api/apiMethods");
const { sendEmail, formatedDate, convertToAMPM } = require("../utils");
const {
  addFeedbackData,
  updateSuperUserData,
  getInstallationData,
  isAdminUser,
} = require("../db/dbOperations");

const {
  updateMainCard,
  updateCard
} = require("../models/UpdateCards");
const dashboard = require("../models/dashboard")
const { Console } = require("console");

const ENV_FILE = path.join(__dirname, "../../.env");
require("dotenv").config({ path: ENV_FILE });
const ALL_USERS = "allusers";
const SELECTED_USERS = "selectedusers";
const db = require("../db");

const newIncident = require("../view/newIncident");

const sendInstallationEmail = async (userEmailId, userName, teamName) => {
  const emailBody =
    "Hi,<br/> <br />" +
    "Below user has successfully installed AreYouSafe app in Microsoft Teams: <br />" +
    "<b>User Name: </b>" +
    userName +
    "<br />" +
    "<b>User Email: </b>" +
    userEmailId +
    "<br />" +
    "<br /><br />" +
    "Thank you, <br />" +
    "AreYouSafe Support";

  const subject = "AreYouSafe? Teams Bot | New Installation Details";
  if (process.env.IS_EMAIL_SEND == 'true')
    await sendEmail(userEmailId, subject, emailBody);
};

const invokeResponse = (card) => {
  try {
    const cardRes = {
      statusCode: StatusCodes.OK,
      type: "application/vnd.microsoft.card.adaptive",
      value: card,
    };
    const res = {
      status: StatusCodes.OK,
      body: cardRes,
    };
    return res;
  } catch (error) {
    console.log(error);
  }
};

const selectResponseCard = async (context, user) => {
  try {
    const action = context.activity?.value?.action;
    const verb = action?.verb;
    let companyData = action.data.companyData ? action.data.companyData : {};
    let isAdminOrSuperuser = false;
    isAdminOrSuperuser = true;
    if (verb === "create_onetimeincident" && isAdminOrSuperuser) {
      await createInc(context, user, companyData);
    } else if (verb === "create_recurringincident" && isAdminOrSuperuser) {
      await createRecurrInc(context, user, companyData);
    } else if (verb === "save_new_inc" && isAdminOrSuperuser) {
      await saveInc(context, action, companyData, user);
    } else if (verb === "save_new_recurr_inc" && isAdminOrSuperuser) {
      await saveRecurrInc(context, action, companyData);
    } else if (verb === "list_delete_inc" && isAdminOrSuperuser) {
      await sendDeleteIncCard(context, user, companyData);
    } else if (verb === "delete_inc" && isAdminOrSuperuser) {
      await deleteInc(context, action);
    } else if (verb === "list_inc" && isAdminOrSuperuser) {
      await viewAllInc(context, companyData);
    } else if (verb && verb === "send_approval" && isAdminOrSuperuser) {
      await sendApproval(context);
    } else if (verb && verb === "cancel_send_approval" && isAdminOrSuperuser) {
      await cancelSendApproval(context, user);
    } else if (verb && verb === "send_response") {
      await sendApprovalResponse(user, context);
    } else if (verb && verb === "submit_comment") {
      await submitComment(context, user, companyData);
    } else if (verb && verb === "view_inc_result" && isAdminOrSuperuser) {
      const incidentId = action.data.incidentSelectedVal;
      await viewSelectedIncResult(incidentId, context, companyData);
    } else if (verb && verb === "contact_us" && isAdminOrSuperuser) {
      await sendContactUsForm(context, companyData);
    } else if (verb && verb === "submit_contact_us" && isAdminOrSuperuser) {
      await submitContactUsForm(context, companyData);
    } else if (verb && verb === "view_settings" && isAdminOrSuperuser) {
      await viewSettings(context, companyData);
    } else if (verb && verb === "submit_settings" && isAdminOrSuperuser) {
      await submitSettings(context, companyData);
    } else if (verb && (verb === "dashboard_view_previous_inc" || verb == "dashboard_view_next_inc") && isAdminOrSuperuser) {
      await navigateDashboardList(context, action, verb);
    } else if (verb === "copyInc" && isAdminOrSuperuser) {
      await copyInc(context, user, action);
    } else if (verb === "closeInc" && isAdminOrSuperuser) {
      await showIncStatusConfirmationCard(context, action, "Closed");
    } else if (verb === "reopenInc" && isAdminOrSuperuser) {
      await showIncStatusConfirmationCard(context, action, "In progress");
    } else if (verb === "updateIncStatus" && isAdminOrSuperuser) {
      await updateIncStatus(context, action);
    } else if (verb === "confirmDeleteInc" && isAdminOrSuperuser) {
      await showIncDeleteConfirmationCard(context, action);
    }
    return Promise.resolve(true);
  } catch (error) {
    console.log("ERROR: ", error);
  }
};

const invokeMainActivityBoard = (companyData) => (updateMainCard(companyData));

const sendMsg = async (context) => {

  let allInstallation = await getInstallationData();

  console.log("hi msg send");
  console.log(allInstallation);
  const card = {
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    appId: process.env.MicrosoftAppId,
    body: [
      {
        type: "TextBlock",
        text: `Hello there, we have added some cool **new features** recently. 
        \n1. **Guidance section** - You can use this for additional guidance as part of your safety check message
        \n2. Create **one-time** and **recurring** safety checks from the “Create Incident” button
        \n3. Preview outgoing safety check message
        
        `,
        wrap: true,
      },
      {
        type: "TextBlock",
        text: `**Type Hi in your chat window** to access these new features
        
        **Contact us**:  [help@safetybot.in](mailto:help@safetybot.in) 
        
        With Gratitude,\n
        AreYouSafeBot team`,
        wrap: true,
      },

    ],
    type: "AdaptiveCard",
    version: "1.4",
  };
  allInstallation.filter(async function (data, index) {
    try {
      await sendDirectMessageCard(context, data, card);
    }
    catch (error) {
      console.log(error);
    }

  });
  // await context.sendActivity({
  //   attachments: [CardFactory.adaptiveCard(card)],
  // });
};

const createRecurrInc = async (context, user, companyData) => {
  try {
    let allMembers = await getAllTeamMembers(context, companyData.teamId);

    const memberChoises = allMembers.map((m) => ({
      title: m.name,
      value: m.aadObjectId,
    }));

    const eventDays = [
      { title: "Sun", value: "0" }, { title: "Mon", value: "1" }, { title: "Tue", value: "2" }, { title: "Wed", value: "3" },
      { title: "Thur", value: "4" }, { title: "Fri", value: "5" }, { title: "Sat", value: "6" }
    ];

    var nextWeekDate = new Date();
    nextWeekDate.setDate(nextWeekDate.getDate() + 7);

    const card = {
      $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
      appId: process.env.MicrosoftAppId,
      body: [
        {
          type: "TextBlock",
          size: "Large",
          weight: "Bolder",
          text: "Create Recurring Incident",
        },
        {
          type: "TextBlock",
          text: "Name of Incident",
          weight: "bolder",
          separator: true,
        },
        {
          type: "Input.Text",
          isRequired: true,
          errorMessage: "Please complete this required field.",
          placeholder: "Enter the Incident Name",
          id: "inc_title",
        },
        {
          type: "TextBlock",
          text: "Guidance",
          weight: "bolder",
          separator: true,
        },
        {
          type: "Input.Text",
          isMultiline: true,
          placeholder: "Enter the Guidance",
          id: "recGuidance",
        },
        {
          type: "ActionSet",
          actions: [
            {
              type: "Action.ToggleVisibility",
              title: "Toggle!",
              targetElements: ["lblOccursEvery", "eventDays", "lblRangeofRecurrence", "lblStartTime", "lblColumnSet", "lblEndTime", "lblColumnSet2"]
            },

          ],
        },
        {
          type: "TextBlock",
          wrap: true,
          text: "Occurs Every",
          weight: "bolder",
          id: "lblOccursEvery"
        },
        {
          type: "Input.ChoiceSet",
          weight: "bolder",
          id: "eventDays",
          style: "filtered",
          isMultiSelect: true,
          choices: eventDays,
          value: "1,2,3,4,5"
        },
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
                {
                  "type": "Input.Date",
                  "value": formatedDate("yyyy-mm-dd", (new Date())),
                  "id": "startDate"
                }
              ]
            },
            {
              "type": "Column",
              "width": "stretch",
              "items": [
                {
                  "type": "Input.Time",
                  "value": "10:00",
                  "id": "startTime"
                }
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
                {
                  "type": "Input.Date",
                  "value": formatedDate("yyyy-mm-dd", nextWeekDate),
                  "id": "endDate"
                }
              ]
            },
            {
              "type": "Column",
              "width": "stretch",
              "items": [
                {
                  "type": "Input.Time",
                  "value": "10:00",
                  "id": "endTime"
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
        {
          type: "Input.ChoiceSet",
          weight: "bolder",
          id: "selected_members",
          style: "filtered",
          isMultiSelect: true,
          placeholder: "Select users",
          choices: memberChoises,
        },
        {
          type: "TextBlock",
          size: "small",
          isSubtle: true,
          wrap: true,
          text: `⚠️ Ignore this field to send incident notification to **all teams members**`,
        },
      ],
      actions: [

        {
          type: "Action.Execute",
          verb: "Cancel_button",
          title: "Cancel",
          data: {
            info: "Back",
            companyData: companyData,
          },
          associatedInputs: "none",
        },
        {
          type: "Action.Execute",
          verb: "save_new_recurr_inc",
          title: "Submit",
          data: {
            info: "save",
            inc_created_by: user,
            companyData: companyData,
          },
        }
      ],
      type: "AdaptiveCard",
      version: "1.4",
    };

    await context.sendActivity({
      attachments: [CardFactory.adaptiveCard(card)],
    });
  } catch (error) {
    console.log(error);
  }
};

const getNewIncCard = async (context, user, companyData, errorMessage = "") => {
  let allMembers = await getAllTeamMembers(context, companyData.teamId);

  const memberChoises = allMembers.map((m) => ({
    title: m.name,
    value: m.id,
  }));
  const eventDays = [
    { title: "Sun", value: "0" }, { title: "Mon", value: "1" }, { title: "Tue", value: "2" }, { title: "Wed", value: "3" },
    { title: "Thur", value: "4" }, { title: "Fri", value: "5" }, { title: "Sat", value: "6" }
  ];
  var nextWeekDate = new Date();
  nextWeekDate.setDate(nextWeekDate.getDate() + 7);
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
      {
        type: "Input.Text",
        isRequired: true,
        errorMessage: "Please complete this required field.",
        placeholder: "Enter the Incident Name",
        id: "inc_title",
      },
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
        weight: "bolder",
        separator: true,
      },
      {
        type: "Input.Text",
        isMultiline: true,
        placeholder: "Enter the Guidance",
        id: "guidance",
      },
    ],
    actions: [
      {
        "type": "Action.ShowCard",
        "title": "One Time",
        "card": {
          "type": "AdaptiveCard",
          "body": [
            {
              type: "TextBlock",
              wrap: true,
              text: "Send the incident notification to these members (optional)",
              weight: "bolder",
              separator: true,
            },
            {
              type: "Input.ChoiceSet",
              weight: "bolder",
              id: "selected_members",
              style: "filtered",
              isMultiSelect: true,
              placeholder: "Select users",
              choices: memberChoises,
            },
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
              weight: "bolder",
              separator: true,
            },
            {
              type: "Input.ChoiceSet",
              weight: "bolder",
              id: "selected_members_response",
              style: "filtered",
              isMultiSelect: true,
              placeholder: "Select users",
              choices: memberChoises,
            },
            {
              type: "TextBlock",
              size: "small",
              isSubtle: true,
              wrap: true,
              text: `⚠️ Safety check responses will be sent to these members`,
            }
          ],
          "actions": [
            {
              type: "Action.Execute",
              verb: "Cancel_button",
              title: "Cancel",
              data: {
                info: "Back",
                companyData: companyData,
              },
              associatedInputs: "none",
            },
            {
              type: "Action.Execute",
              verb: "save_new_inc",
              title: "Submit",
              data: {
                info: "save",
                inc_created_by: user,
                companyData: companyData,
                memberChoises: memberChoises
              },
            },
          ]
        }
      },
      {
        "type": "Action.ShowCard",
        "title": "Recurring",
        "card": {
          "type": "AdaptiveCard",
          "body": [
            {
              type: "TextBlock",
              wrap: true,
              text: "Occurs Every",
              weight: "bolder",
              id: "lblOccursEvery"
            },
            {
              type: "Input.ChoiceSet",
              weight: "bolder",
              id: "eventDays",
              style: "filtered",
              isMultiSelect: true,
              choices: eventDays,
              value: "1,2,3,4,5"
            },
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
                    {
                      "type": "Input.Date",
                      "value": formatedDate("yyyy-mm-dd", (new Date())),
                      "id": "startDate"
                    }
                  ]
                },
                {
                  "type": "Column",
                  "width": "stretch",
                  "items": [
                    {
                      "type": "Input.Time",
                      "value": "10:00",
                      "id": "startTime"
                    }
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
                    {
                      "type": "Input.Date",
                      "value": formatedDate("yyyy-mm-dd", nextWeekDate),
                      "id": "endDate"
                    }
                  ]
                },
                {
                  "type": "Column",
                  "width": "stretch",
                  "items": [
                    {
                      "type": "Input.Time",
                      "value": "10:00",
                      "id": "endTime"
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
            {
              type: "Input.ChoiceSet",
              weight: "bolder",
              id: "selected_members",
              style: "filtered",
              isMultiSelect: true,
              placeholder: "Select users",
              choices: memberChoises,
            },
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
              weight: "bolder",
              separator: true,
            },
            {
              type: "Input.ChoiceSet",
              weight: "bolder",
              id: "selected_members_response",
              style: "filtered",
              isMultiSelect: true,
              placeholder: "Select users",
              choices: memberChoises,
            },
            {
              type: "TextBlock",
              size: "small",
              isSubtle: true,
              wrap: true,
              text: `⚠️ Safety check responses will be sent to these members`,
            }
          ],
          "actions": [
            {
              type: "Action.Execute",
              verb: "Cancel_button",
              title: "Cancel",
              data: {
                info: "Back",
                companyData: companyData,
              },
              associatedInputs: "none",
            },
            {
              type: "Action.Execute",
              verb: "save_new_recurr_inc",
              title: "Submit",
              data: {
                info: "save",
                inc_created_by: user,
                companyData: companyData,
                memberChoises: memberChoises
              },
            },
          ]
        }
      }
    ],
    type: "AdaptiveCard",
    version: "1.4",
  };
}

const getNewIncCardNew = async (context, user, companyData, errorMessage = "", isCopy = false, incId = -1) => {
  const allMembers = await getAllTeamMembers(context, companyData.teamId);
  let incData = null;
  if (isCopy && Number(incId) > 0) {
    incData = await incidentService.getInc(incId);
    const responseSelectedUsers = await incidentService.getIncResponseSelectedUsersList(incId);
    if (responseSelectedUsers != null && responseSelectedUsers.length > 0) {
      incData["responseSelectedUsers"] = responseSelectedUsers;
    }
    else {
      incData["responseSelectedUsers"] = null;
    }
  }
  return newIncident.getNewIncCardNew(user, companyData, allMembers, errorMessage, incData, isCopy);
}

const updateIncStatus = async (context, action) => {
  try {
    const companyData = action.data.companyData ? action.data.companyData : {};
    const dashboardData = action.data.dashboardData ? action.data.dashboardData : {};
    const incId = action.data.incId ? Number(action.data.incId) : -1;
    const statusToUpdate = action.data.statusToUpdate;
    const incTitle = action.data.incTitle ? action.data.incTitle : "";
    const isUpdated = await incidentService.updateIncStatus(incId, statusToUpdate);

    if (dashboardData.ts != null && isUpdated) {
      await updateDashboardCard(context, dashboardData, companyData);

      let text = `Incident **${incTitle}** has been closed.`;
      if (statusToUpdate == "In progress") {
        text = `Incident **${incTitle}** has been reopen.`;
      }
      const cards = CardFactory.adaptiveCard(
        updateCard("", "", text)
      );

      const message = MessageFactory.attachment(cards);
      message.id = context.activity.replyToId;
      await context.updateActivity(message);
    }
  }
  catch (err) {
    console.log(err);
  }
}

const showIncDeleteConfirmationCard = async (context, action) => {
  try {
    const companyData = action.data.companyData ? action.data.companyData : {};
    const dashboardData = action.data.dashboardData ? action.data.dashboardData : {};
    const incId = action.data.incId ? Number(action.data.incId) : -1;
    const incTitle = action.data.incTitle ? action.data.incTitle : "";
    dashboardData["ts"] = context.activity.replyToId;

    const card = dashboard.getDeleteIncidentCard(incId, dashboardData, companyData, incTitle);

    await context.sendActivity({
      attachments: [CardFactory.adaptiveCard(card)],
    });
  } catch (error) {
    console.log(error);
  }
}

const showIncStatusConfirmationCard = async (context, action, statusToUpdate) => {
  try {
    const companyData = action.data.companyData ? action.data.companyData : {};
    const dashboardData = action.data.dashboardData ? action.data.dashboardData : {};
    const incId = action.data.incId ? Number(action.data.incId) : -1;
    const incTitle = action.data.incTitle ? action.data.incTitle : "";
    dashboardData["ts"] = context.activity.replyToId;

    const card = dashboard.getUpdateIncidentStatusCard(incId, dashboardData, companyData, statusToUpdate, incTitle);

    await context.sendActivity({
      attachments: [CardFactory.adaptiveCard(card)],
    });
  } catch (error) {
    console.log(error);
  }
}

const copyInc = async (context, user, action) => {
  try {
    const companyData = action.data.companyData ? action.data.companyData : {};
    const incId = action.data.incId ? Number(action.data.incId) : -1;
    const card = await getNewIncCardNew(context, user, companyData, "", true, incId);

    await context.sendActivity({
      attachments: [CardFactory.adaptiveCard(card)],
    });
  } catch (error) {
    console.log(error);
  }
}

const createInc = async (context, user, companyData) => {
  try {
    const card = await getNewIncCardNew(context, user, companyData);

    await context.sendActivity({
      attachments: [CardFactory.adaptiveCard(card)],
    });
  } catch (error) {
    console.log(error);
  }
};
const getSafetyCheckMessageText = async (incId, createdByName, incTitle, mentionUserEntities) => {
  let onBehalfOf = "", responseUsers = "";
  const incRespSelectedUsers = await incidentService.getIncResponseSelectedUsersList(incId);
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
  const msg = `This is a safety check from <at>${createdByName}</at>${onBehalfOf}. We think you may be affected by **${incTitle}**. Mark yourself as safe, or ask for assistance.`;
  return msg;
};
const getIncConfirmationCard = async (inc_created_by, incTitle, preTextMsg, newInc, companyData, sentApprovalTo, action, incType, guidance) => {
  let mentionUserEntities = [];
  const safetyCheckMessageText = await getSafetyCheckMessageText(newInc.incId, inc_created_by.name, incTitle, mentionUserEntities);
  dashboard.mentionUser(mentionUserEntities, inc_created_by.id, inc_created_by.name);
  return {
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    appId: process.env.MicrosoftAppId,
    body: [
      {
        type: "TextBlock",
        separator: true,
        wrap: true,
        text: `**Here is the preview of the message I will be sending out:**\n\n${safetyCheckMessageText}`,
      },
      {
        type: "ActionSet",
        actions: [
          {
            type: "Action.Execute",
            title: "I am safe",
            data: {
              info: "i_am_safe",
              companyData: companyData,
            },
          },
          {
            type: "Action.Execute",
            title: "I need assistance",
            data: {
              info: "need_assistance",
              companyData: companyData,
            },
          },

        ],
      },
      {
        type: "TextBlock",
        separator: true,
        wrap: true,
        text: `**Guidance:**\n\n` + guidance,
      },
      {
        type: "RichTextBlock",
        separator: true,
        inlines: [
          {
            type: "TextRun",
            text: preTextMsg,
          },
        ],
      },
      {
        type: "ActionSet",
        actions: [
          {
            type: "Action.Execute",
            verb: "send_approval",
            title: "Yes",
            data: {
              option: "Yes",
              incident: newInc,
              companyData: companyData,
              sentApprovalTo: sentApprovalTo,
              inc_created_by,
              recurrIncData: action.data,
              incType,
              safetyCheckMessageText: safetyCheckMessageText,
              mentionUserEntities: mentionUserEntities,
              guidance
            },
          },
          {
            type: "Action.Execute",
            verb: "cancel_send_approval",
            title: "No",
            data: {
              option: "No",
              incident: { incTitle, incId: newInc.incId },
              companyData: companyData,
              inc_created_by,
              safetyCheckMessageText: safetyCheckMessageText,
              mentionUserEntities: mentionUserEntities,
              guidance
            },
          },
        ],
      },
    ],
    msteams: {
      entities: mentionUserEntities,
    },
    type: "AdaptiveCard",
    version: "1.4",
  };
}
const verifyDuplicateInc = async (teamId, incTitle) => {
  return await incidentService.verifyDuplicateInc(teamId, incTitle);
};
const showDuplicateIncError = async (context, user, companyData) => {
  const errorMessage = "The incident with the same name already exists! Please enter another incident name.";
  const card = await getNewIncCardNew(context, user, companyData, errorMessage);
  const cards = CardFactory.adaptiveCard(card);

  const message = MessageFactory.attachment(cards);
  message.id = context.activity.replyToId;
  await context.updateActivity(message);
};
const saveInc = async (context, action, companyData, user) => {
  const { inc_title: incTitle, inc_created_by, memberChoises } = action.data;
  // const isDuplicateInc = await verifyDuplicateInc(companyData.teamId, incTitle);
  // if(isDuplicateInc){
  //   await showDuplicateIncError(context, user, companyData);
  //   return;
  // }
  // const allMembers = await (
  //   await TeamsInfo.getTeamMembers(context, companyData.teamId)
  // )
  //   .filter((tm) => tm.aadObjectId)
  //   .map(
  //     (tm) =>
  //     (tm = {
  //       ...tm,
  //       messageDelivered: "na",
  //       response: "na",
  //       responseValue: "na",
  //     })
  //   );
  console.log({ inc_created_by, action });
  const newInc = await incidentService.saveInc(action.data, companyData, memberChoises);

  let sentApprovalTo = "";
  if (action.data.selected_members) {
    preTextMsg = `Should I send this message to the selected user(s)?`;
    sentApprovalTo = SELECTED_USERS;
  } else {
    preTextMsg = `Should I send this message to everyone?`;
    sentApprovalTo = ALL_USERS;
  }
  var guidance = action.data.guidance ? action.data.guidance : "No details available"
  const card = await getIncConfirmationCard(inc_created_by, incTitle, preTextMsg, newInc, companyData, sentApprovalTo, action, "onetime", guidance);

  await context.sendActivity({
    attachments: [CardFactory.adaptiveCard(card)],
  });
};

const saveRecurrInc = async (context, action, companyData) => {
  const { inc_title: incTitle, inc_created_by, memberChoises } = action.data;
  // const isDuplicateInc = await verifyDuplicateInc(companyData.teamId, incTitle);
  // if(isDuplicateInc){
  //   await showDuplicateIncError(context, user, companyData);
  //   return;
  // }
  // const allMembers = await (
  //   await TeamsInfo.getTeamMembers(context, companyData.teamId)
  // )
  //   .filter((tm) => tm.aadObjectId)
  //   .map(
  //     (tm) =>
  //     (tm = {
  //       ...tm,
  //       messageDelivered: "na",
  //       response: "na",
  //       responseValue: "na",
  //     })
  //   );  
  console.log({ inc_created_by, action });
  const newInc = await incidentService.saveRecurrInc(action.data, companyData, memberChoises);

  let sentApprovalTo = "";
  if (action.data.selected_members) {
    preTextMsg = `Should I send this message to the selected user(s) `;
    sentApprovalTo = SELECTED_USERS;
  } else {
    preTextMsg = `Should I send this message to everyone `;
    sentApprovalTo = ALL_USERS;
  }

  const startDate = new Date(action.data.startDate);
  preTextMsg += `starting from ${formatedDate("mm/dd/yyyy", startDate)} ${convertToAMPM(action.data.startTime)} according to the recurrence pattern selected?`;
  var guidance = action.data.guidance ? action.data.guidance : "No details available"

  const card = await getIncConfirmationCard(inc_created_by, incTitle, preTextMsg, newInc, companyData, sentApprovalTo, action, "recurringIncident", guidance);

  await context.sendActivity({
    attachments: [CardFactory.adaptiveCard(card)],
  });
};

const sendDeleteIncCard = async (context, user, companyData) => {
  console.log("delete incident called", companyData, user);
  try {
    const allIncidentData = await incidentService.getAllInc(companyData.teamId);

    let incList = [];
    if (allIncidentData.length > 0) {
      incList = allIncidentData.map((inc, index) => ({
        title: inc.incTitle,
        value: inc.incId,
      }));
    }

    const card = {
      type: "AdaptiveCard",
      $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
      version: "1.4",
      body: [
        {
          type: "TextBlock",
          text: "Delete Incident",
          size: "Large",
          weight: "Bolder",
        },
        {
          type: "TextBlock",
          text: "Incident List",
          wrap: true,
          separator: true,
          weight: "bolder",
        },
        {
          type: "Input.ChoiceSet",
          id: "incidentSelectedVal",
          value: incList.length > 0 && incList[0].value,
          choices: incList,
        },
      ],
      actions: [
        {
          type: "Action.Execute",
          verb: "Cancel_button",
          title: "Cancel",
          data: {
            info: "Back",
            companyData: companyData,
          },
        },
        {
          type: "Action.Execute",
          verb: "delete_inc",
          title: "Delete",
          data: {
            info: "Delete",
            companyData: companyData,
          },
        },

      ],
    };

    await context.sendActivity({
      attachments: [CardFactory.adaptiveCard(card)],
    });
  } catch (error) {
    console.log(error);
  }
};

const updateDashboardCard = async (context, dashboardData, companyData) => {
  const allTeamMembers = await getAllTeamMembers(context, companyData.teamId);
  let eventIndex = 0;
  if (dashboardData != null && dashboardData.lastPageEventIndex != null) {
    eventIndex = dashboardData.lastPageEventIndex;
  }
  dashboardData["eventIndex"] = eventIndex;
  const dashboardCard = await dashboard.getIncidentTileDashboardCard(dashboardData, companyData, allTeamMembers);
  const dsCard = CardFactory.adaptiveCard(dashboardCard);
  const dsMessage = MessageFactory.attachment(dsCard);
  dsMessage.id = dashboardData.ts;
  await context.updateActivity(dsMessage);
}

const deleteInc = async (context, action) => {
  try {
    let incId = -1;
    const deleteFromDashboard = (action.data.deleteFromDashboard == true);
    if (deleteFromDashboard) {
      incId = action.data.incId ? Number(action.data.incId) : -1;
    }
    else {
      incId = action.data.incidentSelectedVal;
    }

    const incName = await incidentService.deleteInc(incId);

    if (deleteFromDashboard && incName != null) {
      const companyData = action.data.companyData ? action.data.companyData : {};
      const dashboardData = action.data.dashboardData ? action.data.dashboardData : {};
      if (dashboardData.ts != null) {
        await updateDashboardCard(context, dashboardData, companyData);
      }
    }

    if (incName != null) {
      const deleteText = `The incident **${incName}** has been deleted successfully.`;
      const cards = CardFactory.adaptiveCard(
        updateCard("", "", deleteText)
      );

      const message = MessageFactory.attachment(cards);
      message.id = context.activity.replyToId;
      await context.updateActivity(message);
    }
  }
  catch (err) {
    console.log(err);
  }
};

const viewAllInc = async (context, companyData) => {
  try {
    const allTeamMembers = await getAllTeamMembers(context, companyData.teamId);
    const dashboardCard = await dashboard.getIncidentTileDashboardCard(null, companyData, allTeamMembers);
    if (dashboardCard != null) {
      await context.sendActivity({
        attachments: [CardFactory.adaptiveCard(dashboardCard)],
      });
    }
  }
  catch (err) {
    console.log(err);
  }
};

const viewAllIncOld = async (context, companyData, dashboardStyle) => {
  try {
    const allIncidentData = await incidentService.getAllInc(companyData.teamId);

    let incList = [];
    if (allIncidentData.length > 0) {
      incList = allIncidentData.map((inc, index) => ({
        title: inc.incTitle,
        value: inc.incId,
      }));
    }

    const card = {
      type: "AdaptiveCard",
      $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
      version: "1.4",
      body: [
        {
          type: "TextBlock",
          text: "View Incident Dashboard",
          size: "Large",
          weight: "Bolder",
        },
        {
          type: "TextBlock",
          text: "Incident List",
          wrap: true,
          separator: true,
          weight: "bolder",
        },
        {
          type: "Input.ChoiceSet",
          id: "incidentSelectedVal",
          placeholder: "Select an Incident",
          value: incList.length > 0 && incList[0].value,
          choices: incList,
          isRequired: incList.length > 0 ? true : false,
        },
      ],
      actions: [
        {
          type: "Action.Execute",
          verb: "Cancel_button",
          title: "Cancel",
          data: {
            info: "Back",
            companyData: companyData,
          },
        },
        {
          type: "Action.Execute",
          verb: incList.length > 0 ? "view_inc_result" : "view_inc_close",
          title: "Submit",
          data: {
            companyData: companyData,
          },
        },

      ],
    };

    await context.sendActivity({
      attachments: [CardFactory.adaptiveCard(card)],
    });
  } catch (error) {
    console.log(error);
  }
};

const getOneTimeDashboardCard = async (incidentId, runAt = null) => {
  const inc = await incidentService.getInc(incidentId, runAt);

  let result = {
    eventName: inc.incTitle,
    membersSafe: [],
    membersUnsafe: [],
    membersNotResponded: [],
  };

  const mentionUserEntities = [];

  // process result for event dashboard
  inc.members.forEach((m) => {
    const { userId, userName, response, responseValue } = m;

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

  let membersUnsafeStr = result.membersUnsafe.join(", ");
  let membersNotRespondedStr = result.membersNotResponded.join(", ");
  let membersSafeStr = result.membersSafe.join(", ");

  console.log("membersNotRespondedStr", membersNotRespondedStr);

  const card = {
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    type: "AdaptiveCard",
    version: "1.4",
    body: [
      {
        type: "TextBlock",
        text: `👋 Incident Name: ${inc.incTitle}`,
        size: "Large",
        weight: "Bolder",
        wrap: true,
      },
      {
        type: "ColumnSet",
        columns: [
          {
            type: "Column",
            width: 4,
            items: [
              {
                type: "TextBlock",
                wrap: true,
                text: `**Need Assistance: ${result.membersUnsafe.length}**`,
                color: "attention",
              },
              {
                type: "TextBlock",
                wrap: true,
                text: membersUnsafeStr,
                isSubtle: true,
                spacing: "none",
              },
            ],
          },
        ],
        separator: true,
      },
      {
        type: "ColumnSet",
        columns: [
          {
            type: "Column",
            width: 4,
            items: [
              {
                type: "TextBlock",
                wrap: true,
                text: `**Not Responded: ${result.membersNotResponded.length}**`,
                color: "default",
              },
              {
                type: "TextBlock",
                wrap: true,
                text: membersNotRespondedStr,
                isSubtle: true,
                spacing: "none",
              },
            ],
          },
        ],
      },
      {
        type: "ColumnSet",
        spacing: "medium",
        columns: [
          {
            type: "Column",
            width: 4,
            items: [
              {
                type: "TextBlock",
                text: `**Safe: ${result.membersSafe.length}**`,
                color: "good",
              },
              {
                type: "TextBlock",
                wrap: true,
                text: membersSafeStr,
                isSubtle: true,
                spacing: "none",
              },
            ],
          },
        ],
      }
    ],
    msteams: {
      entities: mentionUserEntities,
    },
  };
  return card;
}

const viewSelectedIncResult = async (incidentId, context, companyData) => {
  const lastRunAt = await incidentService.getLastRunAt(incidentId);
  const activityId = await viewIncResult(incidentId, context, companyData, null, lastRunAt);
  return Promise.resolve(activityId);
}

const viewIncResult = async (incidentId, context, companyData, incData, runAt = null, dashboardCard = null) => {
  console.log("viewIncResult called", incidentId);
  if (incidentId === undefined) {
    await context.sendActivity(
      MessageFactory.text(`👋 Hello!! Please select an Incident.`)
    );
    return Promise.resolve(true);
  }

  if (dashboardCard == null) {
    dashboardCard = await getOneTimeDashboardCard(incidentId, runAt);
  }

  let activityId = null;
  if (incData != null && incData.activityId != null && incData.conversationId != null) {
    activityId = incData.activityId;
    const conversationId = incData.conversationId;
    const dashboardAdaptiveCard = CardFactory.adaptiveCard(dashboardCard);
    dashboardAdaptiveCard.id = activityId;

    const activity = MessageFactory.attachment(dashboardAdaptiveCard);
    activity.id = activityId;

    updateMessage(activityId, activity, conversationId);
  }
  else {
    const activity = await context.sendActivity({
      attachments: [CardFactory.adaptiveCard(dashboardCard)],
    });
    activityId = activity.id;
  }
  return Promise.resolve(activityId);
};

const getSaftyCheckCard = async (incTitle, incObj, companyData, incGuidance) => {
  let mentionUserEntities = [];
  const safetyCheckMessageText = await getSafetyCheckMessageText(incObj.incId, incObj.incCreatedBy.name, incTitle, mentionUserEntities);
  dashboard.mentionUser(mentionUserEntities, incObj.incCreatedBy.id, incObj.incCreatedBy.name);
  return {
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    appId: process.env.MicrosoftAppId,
    body: [
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
      },
      {
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
      },
      {
        type: "TextBlock",
        separator: true,
        wrap: true,
        text: `**Guidance:**\n\n` + incGuidance,
      }
    ],
    msteams: {
      entities: mentionUserEntities
    },
    type: "AdaptiveCard",
    version: "1.4",
  };
}

const sendCardToIndividualUser = async (context, userId, approvalCard) => {
  try {
    let activityId = null;
    let conversationId = null;
    var ref = TurnContext.getConversationReference(context.activity);
    ref.user = userId;
    await context.adapter.createConversation(ref, async (t1) => {
      const ref2 = TurnContext.getConversationReference(t1.activity);
      await t1.adapter.continueConversation(ref2, async (t2) => {
        const activity = await t2.sendActivity({
          attachments: [CardFactory.adaptiveCard(approvalCard)],
        });
        activityId = activity.id;
      });
    });
  }
  catch (err) {
    console.log(err);
  }
  return activityId;
}

const sendCommentToSelectedMembers = async (incId, context, approvalCardResponse) => {
  try {
    const incRespSelectedUsers = await incidentService.getIncResponseSelectedUsersList(incId);
    if (incRespSelectedUsers != null && incRespSelectedUsers.length > 0) {
      for (let i = 0; i < incRespSelectedUsers.length; i++) {
        let memberArr = [{
          id: incRespSelectedUsers[i].user_id,
          name: incRespSelectedUsers[i].user_name
        }];
        const result = await sendProactiveMessaageToUser(memberArr, approvalCardResponse);
      }
    }
  }
  catch (err) {
    console.log(err);
  }
}

const sendApprovalResponseToSelectedMembers = async (incId, context, approvalCardResponse) => { //If user click on Need assistance, then send message to selected users 
  try {
    const incRespSelectedUsers = await incidentService.getIncResponseSelectedUsersList(incId);
    if (incRespSelectedUsers != null && incRespSelectedUsers.length > 0) {
      for (let i = 0; i < incRespSelectedUsers.length; i++) {
        let memberArr = [{
          id: incRespSelectedUsers[i].user_id,
          name: incRespSelectedUsers[i].user_name
        }];
        const result = await sendProactiveMessaageToUser(memberArr, approvalCardResponse);
      }
    }
  }
  catch (err) {
    console.log(err);
  }
}

const updateIncResponseOfSelectedMembers = async (incId, runAt, dashboardCard) => {
  try {
    const incResponseUserTSData = await incidentService.getIncResponseUserTS(incId, runAt);
    if (incResponseUserTSData != null && incResponseUserTSData.length > 0) {
      for (let i = 0; i < incResponseUserTSData.length; i++) {
        const activityId = incResponseUserTSData[i].activityId;
        const conversationId = incResponseUserTSData[i].conversationId;
        const dashboardAdaptiveCard = CardFactory.adaptiveCard(dashboardCard);
        dashboardAdaptiveCard.id = activityId;

        const activity = MessageFactory.attachment(dashboardAdaptiveCard);
        activity.id = activityId;

        await updateMessage(activityId, activity, conversationId);
      }
    }
  }
  catch (err) {
    console.log(err);
  }
}

const sendIncResponseToSelectedMembers = async (incId, dashboardCard, runAt) => {
  try {
    let sql = "";
    runAt = (runAt == null) ? '' : runAt;
    const incRespSelectedUsers = await incidentService.getIncResponseSelectedUsersList(incId);
    if (incRespSelectedUsers != null && incRespSelectedUsers.length > 0) {
      await Promise.all(
        incRespSelectedUsers.map(async (u) => {
          let memberArr = [{
            id: u.user_id,
            name: u.user_name
          }];
          const result = await sendProactiveMessaageToUser(memberArr, dashboardCard);
          if (result.activityId != null) {
            sql += `INSERT INTO MSTeamsIncResponseUserTS(incResponseSelectedUserId, runAt, conversationId, activityId) VALUES(${u.id}, '${runAt}', '${result.conversationId}', '${result.activityId}');`;
          }
        })
      )
    }
    if (sql != "") {
      await incidentService.saveIncResponseUserTS(sql);
    }
  }
  catch (err) {
    console.log(err);
  }
}

const sendApproval = async (context) => {
  const action = context.activity.value.action;
  const { incident, companyData, sentApprovalTo } = action.data;
  const { incId, incTitle, selectedMembers, incCreatedBy, responseSelectedUsers } = incident;

  let allMembers = await getAllTeamMembers(context, companyData.teamId);

  const incCreatedByUserObj = allMembers.find((m) => m.id === incCreatedBy);

  let allMembersArr = allMembers.map(
    (tm) =>
    (tm = {
      ...tm,
      messageDelivered: "na",
      response: "na",
      responseValue: "na",
    })
  );

  if (selectedMembers.length > 0) {
    allMembersArr = allMembersArr.filter((m) =>
      selectedMembers?.includes(m.id)
    );
  }

  const incWithAddedMembers = await incidentService.addMembersIntoIncData(
    incId,
    allMembersArr,
    incCreatedBy
  );
  const incGuidance = await incidentService.getIncGuidance(incId);
  if (action.data.incType == "onetime") {
    let dashboardCard = await getOneTimeDashboardCard(incId, null);

    const activityId = await viewIncResult(incId, context, companyData, incident, null, dashboardCard);
    const conversationId = context.activity.conversation.id;

    // send approval msg to all users
    allMembersArr.forEach(async (teamMember) => {
      let incObj = {
        incId,
        incTitle,
        incCreatedBy: incCreatedByUserObj,
        activityId,
        conversationId
      }
      var guidance = incGuidance ? incGuidance : "No details available"
      const approvalCard = await getSaftyCheckCard(incTitle, incObj, companyData, guidance);

      await sendCardToIndividualUser(context, teamMember, approvalCard);
    });
    await sendIncResponseToSelectedMembers(incId, dashboardCard);
  }
  else if (action.data.incType == "recurringIncident") {
    const userTimeZone = context.activity.entities[0].timezone;
    await incidentService.saveRecurrSubEventInc(action.data, companyData, userTimeZone);
  }
};

const cancelSendApproval = async (context, user) => {
  const action = context.activity.value.action;
  const { incTitle, incId } = action.data.incident;
  await incidentService.deleteInc(incId);
};

const sendIncStatusValidation = async (context, incStatusId) => {
  try {
    const action = context.activity.value.action;
    const { incTitle, incCreatedBy } = action.data.inc;
    if (incStatusId == -1) {
      const approvalCardResponse = {
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
        appId: process.env.MicrosoftAppId,
        body: [
          {
            type: "TextBlock",
            text: 'This incident is no longer available.',
            wrap: true,
          },
        ],
        type: "AdaptiveCard",
        version: "1.4",
      };
      await context.sendActivity({
        attachments: [CardFactory.adaptiveCard(approvalCardResponse)],
      });
    } else if (incStatusId == 2) {
      const mentionedCreatedBy = [];
      dashboard.mentionUser(mentionedCreatedBy, incCreatedBy.id, incCreatedBy.name);
      const approvalCardResponse = {
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
        appId: process.env.MicrosoftAppId,
        body: [
          {
            type: "TextBlock",
            text: `The **${incTitle}** is closed. Please contact <at>${incCreatedBy.name}</at>`,
            wrap: true,
          },
        ],
        msteams: {
          entities: mentionedCreatedBy
        },
        type: "AdaptiveCard",
        version: "1.4",
      };
      await context.sendActivity({
        attachments: [CardFactory.adaptiveCard(approvalCardResponse)],
      });
    }
  }
  catch (err) {
    console.log(err);
  }
}

const sendApprovalResponse = async (user, context) => {
  try {
    const action = context.activity.value.action;
    const { info: response, inc, companyData } = action.data;
    const { incId, incTitle, incCreatedBy } = inc;

    const runAt = (inc.runAt != null) ? inc.runAt : null;
    if (response === "i_am_safe") {
      await incidentService.updateIncResponseData(incId, user.id, 1, inc);
    } else {
      await incidentService.updateIncResponseData(incId, user.id, 0, inc);
      const approvalCardResponse = {
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
        appId: process.env.MicrosoftAppId,
        body: [
          {
            type: "TextBlock",
            text: `User <at>${user.name}</at> needs assistance for Incident: **${incTitle}**`,
            wrap: true,
          },
        ],
        msteams: {
          entities: [
            {
              type: "mention",
              text: `<at>${user.name}</at>`,
              mentioned: user,
            },
          ],
        },
        type: "AdaptiveCard",
        version: "1.4",
      };
      //send new msg just to emulate msg is being updated
      await sendDirectMessageCard(context, incCreatedBy, approvalCardResponse);
      await sendApprovalResponseToSelectedMembers(incId, context, approvalCardResponse);
    }

    const dashboardCard = await getOneTimeDashboardCard(incId, runAt);
    const activityId = await viewIncResult(incId, context, companyData, inc, runAt, dashboardCard);
    await updateIncResponseOfSelectedMembers(incId, runAt, dashboardCard);
  } catch (error) {
    console.log(error);
  }
};

const submitComment = async (context, user, companyData) => {
  try {
    const action = context.activity.value.action;
    const { userId, incId, incTitle, incCreatedBy, eventResponse, commentVal, inc } = action.data;

    if (commentVal) {
      const mentionedUser = {
        type: "mention",
        mentioned: user,
        text: `<at>${user.name}</at>`,
      };
      msgText = `The user <at>${user.name}</at> has commented for incident **${incTitle}**:\n${commentVal}`;
      const approvalCardResponse = {
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
        appId: process.env.MicrosoftAppId,
        body: [
          {
            type: "TextBlock",
            text: `User <at>${user.name}</at> has commented for incident **${incTitle}**:\n${commentVal}`,
            wrap: true,
          },
        ],
        msteams: {
          entities: [
            {
              type: "mention",
              text: `<at>${user.name}</at>`,
              mentioned: user,
            },
          ],
        },
        type: "AdaptiveCard",
        version: "1.4",
      };
      //send new msg just to emulate msg is being updated
      await sendDirectMessageCard(context, incCreatedBy, approvalCardResponse);
      await sendCommentToSelectedMembers(incId, context, approvalCardResponse);
      await incidentService.updateIncResponseComment(incId, userId, commentVal, inc);
    }
  } catch (error) {
    console.log(error);
  }
};

const sendContactUsForm = async (context, companyData) => {
  try {
    const card = {
      $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
      type: "AdaptiveCard",
      version: "1.4",
      body: [
        {
          type: "TextBlock",
          size: "Large",
          weight: "Bolder",
          text: "Contact Us",
        },
        {
          type: "TextBlock",
          text: "Email Address",
          wrap: true,
          separator: true,
          weight: "bolder",
        },
        {
          type: "Input.Text",
          placeholder: "Enter your Email",
          style: "email",
          id: "emailVal",
          isRequired: true,
          errorMessage: "Email field is required with valid email-id",
          regex: "^[\\w-\\.]+@([\\w-]+\\.)+[\\w-]{2,4}$",
        },
        {
          type: "TextBlock",
          text: "Comment/Question",
          wrap: true,
          separator: true,
          weight: "bolder",
        },
        {
          type: "Input.Text",
          placeholder: "Enter your comment or question",
          id: "feedbackVal",
          isMultiline: true,
          isRequired: true,
          errorMessage: "Comment/Question is required",
        },
      ],
      actions: [
        {
          type: "Action.Execute",
          verb: "Cancel_button",
          title: "Cancel",
          data: {
            info: "Back",
            companyData: companyData,
          },
          associatedInputs: "none",
        },
        {
          type: "Action.Execute",
          verb: "submit_contact_us",
          title: "Submit",
          data: {
            companyData: companyData,
          },
        },

      ],
    };

    await context.sendActivity({
      attachments: [CardFactory.adaptiveCard(card)],
    });
  } catch (error) {
    console.log(error);
  }
};

const submitContactUsForm = async (context, companyData) => {
  try {
    const { emailVal, feedbackVal } = context.activity.value.action.data;

    if (emailVal && feedbackVal) {
      // save feedback data into DB
      // then send the response

      const feedbackDataObj = {
        userId: companyData.userId,
        teamId: companyData.teamId,
        userEmail: emailVal,
        feedbackContent: feedbackVal,
      };

      await addFeedbackData(feedbackDataObj);

      const emailBody =
        "Hi,<br/> <br />" +
        "Below user has provided feedback for AreYouSafe app installed in Microsoft Teams : <br />" +
        "<b>User Name: </b>" +
        companyData.userName +
        "<br />" +
        "<b>Email: </b>" +
        emailVal +
        "<br />" +
        "<b>Teams Name: </b>" +
        companyData.teamName +
        "<br />" +
        "<b>Feedback: </b>" +
        feedbackVal +
        "<br />" +
        "<br /><br />" +
        "Thank you, <br />" +
        "AreYouSafe Support";

      const subject = "AreYouSafe Teams Bot | Feedback";

      await sendEmail(emailVal, subject, emailBody);
    }
  } catch (error) {
    console.log(error);
  }
};

const viewSettings = async (context, companyData) => {
  let allMembers = await getAllTeamMembers(context, companyData.teamId);

  // remove admin user
  allMembers = allMembers.filter((m) => m.id != companyData.userId);
  // console.log("allMembers in viewSettings >> ", allMembers);

  const memberChoises = allMembers.map((m) => ({
    title: m.name,
    value: m.aadObjectId,
  }));

  const preSelectedSuperUsers = allMembers
    .filter((m) => companyData.superUsers?.includes(m.aadObjectId))
    .map((m) => ({
      title: m.name,
      value: m.aadObjectId,
    }));

  // console.log("preSelectedSuperUsers >> ", preSelectedSuperUsers);

  const card = {
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    appId: process.env.MicrosoftAppId,
    body: [
      {
        type: "TextBlock",
        size: "Large",
        weight: "Bolder",
        text: "Settings",
      },
      {
        type: "TextBlock",
        text: "Select the users who should have the ability to create an incident (optional)",
        wrap: true,
        separator: true,
        weight: "bolder",
      },
      {
        type: "Input.ChoiceSet",
        placeholder: "Select users",
        id: "selected_superusers",
        style: "filtered",
        isMultiSelect: true,
        value:
          preSelectedSuperUsers.length > 0 &&
          preSelectedSuperUsers.map((m) => m.value).join(","),
        choices: memberChoises,
      },
    ],
    actions: [
      {
        type: "Action.Execute",
        verb: "Cancel_button",
        title: "Cancel",
        data: {
          info: "Back",
          companyData: companyData,
        },
        associatedInputs: "none",
      },
      {
        type: "Action.Execute",
        verb: "submit_settings",
        title: "Submit",
        data: {
          info: "submit",
          companyData: companyData,
        },
      },

    ],
    type: "AdaptiveCard",
    version: "1.4",
  };

  await context.sendActivity({
    attachments: [CardFactory.adaptiveCard(card)],
  });
};

const submitSettings = async (context, companyData) => {
  const selected_superusers =
    context.activity.value.action?.data?.selected_superusers;
  // console.log("selected_superusers >> ", selected_superusers);

  await updateSuperUserData(
    companyData.userId,
    companyData.teamId,
    selected_superusers
  );
};

const sendRecurrEventMsg = async (subEventObj, incId, incTitle) => {
  let successflag = true;
  try {
    if (subEventObj.incType == "recurringIncident") {
      if (subEventObj.eventMembers.length == 0) {
        return;
      }

      const incCreatedByUserArr = [];
      const incCreatedByUserObj = {
        id: subEventObj.createdById,
        name: subEventObj.createdByName
      }
      incCreatedByUserArr.push(incCreatedByUserObj);

      const dashboardCard = await getOneTimeDashboardCard(incId);
      const dashboardResponse = await sendProactiveMessaageToUser(incCreatedByUserArr, dashboardCard);
      await sendIncResponseToSelectedMembers(incId, dashboardCard, subEventObj.runAt);

      let incObj = {
        incId,
        incTitle,
        incType: subEventObj.incType,
        runAt: subEventObj.runAt,
        incCreatedBy: incCreatedByUserObj,
        conversationId: dashboardResponse.conversationId,
        activityId: dashboardResponse.activityId
      }
      var incGuidance = await incidentService.getIncGuidance(incId);
      incGuidance = incGuidance ? incGuidance : "No details available"
      const approvalCard = await getSaftyCheckCard(incTitle, incObj, subEventObj.companyData, incGuidance);

      for (let i = 0; i < subEventObj.eventMembers.length; i++) {
        let member = [{
          id: subEventObj.eventMembers[i].user_id,
          name: subEventObj.eventMembers[i].user_name
        }];
        await sendProactiveMessaageToUser(member, approvalCard);

        const respDetailsObj = {
          memberResponsesId: subEventObj.eventMembers[i].id,
          runAt: subEventObj.runAt,
          conversationId: dashboardResponse.conversationId,
          activityId: dashboardResponse.activityId
        }
        await incidentService.addMemberResponseDetails(respDetailsObj);
      }

      const recurrCompletedCard = {
        "type": "AdaptiveCard",
        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
        "version": "1.5",
        "body": [
          {
            "type": "TextBlock",
            "text": "Incident Message:",
            "wrap": true,
            "weight": "Bolder"
          },
          {
            "type": "TextBlock",
            "text": `Your safety check message for **${incTitle}** has been sent to all the users`,
            "wrap": true
          }
        ]
      }

      await sendProactiveMessaageToUser(incCreatedByUserArr, recurrCompletedCard);
      successflag = true;
    }
  } catch (err) {
    //successflag = false;
    console.log(err);
  }
  return successflag;
}

const sendIntroductionMessage = async (context, from) => {
  const cards = {
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    type: "AdaptiveCard",
    version: "1.0",
    body: [
      {
        type: "TextBlock",
        text: "**I work best when added to a Team.**",
        wrap: true,
      },
      {
        type: "TextBlock",
        text: "Please follow these steps: ",
        wrap: true,
      },
      {
        type: "TextBlock",
        text: "1. Navigate to MS Teams App store\r2. Search AreYouSafe? and click on the AreYouSafe? Bot card\r3. Click on the top arrow button and select the **“Add to a team“** option",
        wrap: true,
      },
      {
        type: "TextBlock",
        text: "If you need any help or want to share feedback, feel free to reach out to my makers at [help@safetybot.in](mailto:help@safetybot.in)",
        wrap: true,
      },
      {
        type: "Image",
        url: "https://announcebot.in/img/InstallDetails.png?id=0",
      },
    ],
  };
  await sendDirectMessageCard(context, from, cards);
}

const navigateDashboardList = async (context, action, verb) => {
  try {
    const dashboardData = action.data;
    const companyData = dashboardData.companyData;
    const allTeamMembers = await getAllTeamMembers(context, companyData.teamId);
    const dashboardCard = await dashboard.getIncidentTileDashboardCard(dashboardData, companyData, allTeamMembers);

    const cards = CardFactory.adaptiveCard(dashboardCard);
    const message = MessageFactory.attachment(cards);
    message.id = context.activity.replyToId;
    await context.updateActivity(message);
  }
  catch (err) {
    console.log(err);
  }
}

module.exports = {
  invokeResponse,
  sendInstallationEmail,
  selectResponseCard,
  invokeMainActivityBoard,
  createInc,
  saveInc,
  sendRecurrEventMsg,
  sendIntroductionMessage,
  verifyDuplicateInc,
  showDuplicateIncError,
  sendMsg,
  sendIncStatusValidation
};
