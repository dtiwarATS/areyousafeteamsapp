const {
  StatusCodes,
  MessageFactory,
  CardFactory,
  TurnContext,
  TeamsInfo,
  Message,
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
  updateMessage,
  addLog,
  getAllTeamMembersByConnectorClient,
  sendProactiveMessaageToUserAsync,
  sentActivityToTeamChannel,
  sendProactiveMessaageToSelectedChannel,
} = require("../api/apiMethods");
const { sendEmail, formatedDate, convertToAMPM } = require("../utils");
const {
  addFeedbackData,
  updateSuperUserData,
  getInstallationData,
  isAdminUser,
  saveLog,
  addTeamMember,
  getCompanyDataByTeamId,
} = require("../db/dbOperations");

const accountSid = process.env.TWILIO_ACCOUNT_ID;
const authToken = process.env.TWILIO_ACCOUNT_AUTH_TOKEN;
const tClient = require("twilio")(accountSid, authToken);
const dashboard = require("../models/dashboard");

const ENV_FILE = path.join(__dirname, "../../.env");
require("dotenv").config({ path: ENV_FILE });
const ALL_USERS = "allusers";
const SELECTED_USERS = "selectedusers";
const db = require("../db");
const { AYSLog } = require("../utils/log");
const {
  updateMainCard,
  updateCard,
  updateSendApprovalMessage,
  updateSubmitCommentCard,
  updateSafeMessage,
  updateDeleteCard,
  updateSesttingsCard,
  updateContactSubmitCard,
  updateSafeMessageqestion1,
  updateSafeMessageqestion2,
  updateSafeMessageqestion3,
} = require("../models/UpdateCards");

const newIncident = require("../view/newIncident");
const { processSafetyBotError } = require("../models/processError");
const {
  getAfterUsrSubscribedTypeOneCard,
  getAfterUsrSubscribedTypeTwoCard,
} = require("./subscriptionCard");
const axios = require("axios");
const https = require("https");

const {
  getSafetyCheckMessageText,
  SafetyCheckCard,
  getSafetyCheckTypeCard,
} = require("../models/SafetyCheckCard");
const { json } = require("body-parser");
const { count } = require("console");

const sendInstallationEmail = async (userEmailId, userName, teamName) => {
  try {
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
    if (process.env.IS_EMAIL_SEND == "true") {
      await sendEmail(userEmailId, subject, emailBody);
    }
  } catch (err) {
    processSafetyBotError(err, teamName, userName, userEmailId);
  }
};

const sendUninstallationEmail = async (userEmailId, userName) => {
  try {
    const emailBody =
      "Hi,<br/> <br />" +
      "Below user has uninstalled AreYouSafe app in Microsoft Teams: <br />" +
      "<b>User Name: </b>" +
      userName +
      "<br />" +
      "<b>User Email: </b>" +
      userEmailId +
      "<br />" +
      "<br /><br />" +
      "Thank you, <br />" +
      "AreYouSafe Support";

    const subject = "AreYouSafe? Teams Bot | New Uninstallation Details";
    if (process.env.IS_EMAIL_SEND == "true") {
      await sendEmail(userEmailId, subject, emailBody);
    }
  } catch (err) {
    processSafetyBotError(err, "", userName, userEmailId);
  }
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
    // let isAdminOrSuperuser = false;
    // isAdminOrSuperuser = true;
    if (verb === "create_onetimeincident") {
      await createInc(context, user, companyData);
    } else if (verb === "create_recurringincident") {
      await createRecurrInc(context, user, companyData);
    } else if (verb === "save_new_inc") {
      await saveInc(context, action, companyData, user);
    } else if (verb === "save_new_recurr_inc") {
      await saveRecurrInc(context, action, companyData);
    } else if (verb === "list_delete_inc") {
      await sendDeleteIncCard(context, user, companyData);
    } else if (verb === "delete_inc") {
      const adaptiveCard = await deleteInc(context, action);
      return Promise.resolve(adaptiveCard);
    } else if (verb === "list_inc") {
      await viewAllInc(context, companyData);
    } else if (verb && verb === "send_approval") {
      await sendApproval(context);
    } else if (verb && verb === "cancel_send_approval") {
      await cancelSendApproval(context, user);
    } else if (verb && verb === "send_response") {
      sendApprovalResponse(user, context);
    } else if (verb && verb === "submit_comment") {
      await submitComment(context, user, companyData);
    } else if (verb && verb === "contact_us") {
      await sendContactUsForm(context, companyData);
    } else if (verb && verb === "submit_contact_us") {
      await submitContactUsForm(context, companyData);
    } else if (verb && verb === "view_settings") {
      await viewSettings(context, companyData);
    } else if (verb && verb === "submit_settings") {
      await submitSettings(context, companyData);
    } else if (
      verb &&
      (verb === "dashboard_view_previous_inc" ||
        verb == "dashboard_view_next_inc")
    ) {
      const adaptiveCard = await navigateDashboardList(context, action, verb);
      return Promise.resolve(adaptiveCard);
    } else if (verb === "copyInc") {
      await copyInc(context, user, action);
    } else if (verb === "closeInc") {
      await showIncStatusConfirmationCard(context, action, "Closed");
    } else if (verb === "reopenInc") {
      await showIncStatusConfirmationCard(context, action, "In progress");
    } else if (verb === "updateIncStatus") {
      const adaptiveCard = await updateIncStatus(context, action);
      return Promise.resolve(adaptiveCard);
    } else if (verb === "confirmDeleteInc") {
      await showIncDeleteConfirmationCard(context, action);
    } else if (verb === "add_user_info") {
      await addUserInfoByTeamId(context);
    } else if (verb === "newUsrSubscriptionType1") {
      await processnewUsrSubscriptionType1(context, action, companyData);
    } else if (verb === "newUsrSubscriptionType2") {
      await processnewUsrSubscriptionType2(context, action);
    } else if (verb === "triggerTestSafetyCheckMessage") {
      await triggerTestSafetyCheckMessage(context, action, user.aadObjectId); //
    } else if (verb === "safetyVisitorQuestion1") {
      await Question1safetyVisitor(context, user, 1);
    } else if (verb === "safetyVisitorQuestion2") {
      await Question1safetyVisitor(context, user, 2);
    } else if (verb === "safetyVisitorQuestion3") {
      await Question1safetyVisitor(context, user, 3);
    }

    return Promise.resolve(true);
  } catch (error) {
    console.log("ERROR: ", error);
  }
};

const processnewUsrSubscriptionType1 = async (context, action, companyData) => {
  try {
    const userEmail = action?.data?.userEmail;
    const card = CardFactory.adaptiveCard(
      getAfterUsrSubscribedTypeOneCard(userEmail, companyData)
    );

    const message = MessageFactory.attachment(card);
    message.id = context.activity.replyToId;
    await context.updateActivity(message);
  } catch (err) {
    processSafetyBotError(
      err,
      "",
      "",
      "",
      "error in processnewUsrSubscriptionType1 companyData=" +
        JSON.stringify(companyData) +
        " userEmail=" +
        action?.data?.userEmail
    );
  }
};

const processnewUsrSubscriptionType2 = async (context, action) => {
  try {
    let companyData = action.data.companyData ? action.data.companyData : {};
    const card = CardFactory.adaptiveCard(
      getAfterUsrSubscribedTypeTwoCard(
        context?.activity?.from?.name,
        companyData
      )
    );
    const message = MessageFactory.attachment(card);
    message.id = context.activity.replyToId;
    await context.updateActivity(message);

    const tenantId = context?.activity?.conversation?.tenantId;
    await incidentService.updateSubscriptionType(2, tenantId, "1");
  } catch (err) {
    processSafetyBotError(
      err,
      "",
      "",
      "",
      "error in processnewUsrSubscriptionType2 companyData=" +
        JSON.stringify(action?.data?.companyData)
    );
  }
};

const updateUserInfo = async (context, teams, tenantId) => {
  try {
    let installationids = [];
    if (teams != null && teams.length > 0) {
      for (let i = 0; i < teams.length; i++) {
        const team = teams[i];
        const allTeamMembers = await getAllTeamMembers(context, team.team_id);
        if (allTeamMembers && allTeamMembers.length > 0) {
          await addTeamMember(team.team_id, allTeamMembers);
        }
        installationids.push(team.id);
      }
      if (installationids != null && installationids.length > 0) {
        await incidentService.updateUserInfoFlag(
          installationids.join(","),
          tenantId
        );
      }
    }
  } catch (err) {
    console.log(err);
  }
};

const updateServiceUrl = async (context, tenantId) => {
  try {
    const teams = await incidentService.getAllTeamsIdByTenantId(tenantId);
    if (teams != null && teams.length > 0) {
      const serviceUrl = context.activity.serviceUrl;
      let installationids = [];
      for (let i = 0; i < teams.length; i++) {
        installationids.push(teams[i].id);
      }
      if (installationids.length > 0) {
        await incidentService.saveServiceUrl(installationids, serviceUrl);
      }
    }
  } catch (err) {
    console.log(err);
  }
};

const invokeMainActivityBoard = async (context, companyData) => {
  // if (companyData != null && companyData.isUserInfoSaved == null) {
  //   if (teams == null) {
  //     teams = await incidentService.getAllTeamsIdByTenantId(tenantId);
  //   }
  //   await updateUserInfo(context, teams);
  // }

  return updateMainCard(companyData);
};

const sendMsg = async (context) => {
  let allInstallation = await getInstallationData();

  console.log("hi msg send");
  console.log(allInstallation);
  const card = {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.4",
    body: [
      {
        type: "TextBlock",
        text: "Hello there, we have added a cool **new feature** recently. ",
        wrap: true,
      },
      {
        type: "TextBlock",
        text: "- Admins can now save an Incident as a draft.",
        wrap: true,
      },
      {
        type: "TextBlock",
        text: "To access this feature in:",
        wrap: true,
      },
      {
        type: "TextBlock",
        text: "**Chat:** Go to the Chat section -> AreYouSafe? Bot -> Click the **Create Incident** button",
        wrap: true,
      },
      {
        type: "TextBlock",
        text: "**Team:** Go to the Teams section -> Go to the General channel under the team for which AreYouSafe? Bot is installed -> AreYouSafe? tab -> Click the **Create Incident** button",
        wrap: true,
      },
      {
        type: "TextBlock",
        text: "Have questions? [Email](mailto:help@areyousafe.in) | [Chat](https://teams.microsoft.com/l/chat/0/0?users=npingale@ats360.com) | [Schedule call](https://calendly.com/nehapingale/short-call) \n\nWith Gratitude,\n\nAreYouSafeBot team",
        wrap: true,
      },
    ],
  };
  allInstallation.filter(async function (data, index) {
    try {
      await sendDirectMessageCard(context, data, card);
    } catch (error) {
      console.log(error);
    }
  });
};

const createRecurrInc = async (context, user, companyData) => {
  try {
    let allMembers = await getAllTeamMembers(context, companyData.teamId);

    const memberChoises = allMembers.map((m) => ({
      title: m.name,
      value: m.aadObjectId,
    }));

    const eventDays = [
      { title: "Sun", value: "0" },
      { title: "Mon", value: "1" },
      { title: "Tue", value: "2" },
      { title: "Wed", value: "3" },
      { title: "Thur", value: "4" },
      { title: "Fri", value: "5" },
      { title: "Sat", value: "6" },
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
              targetElements: [
                "lblOccursEvery",
                "eventDays",
                "lblRangeofRecurrence",
                "lblStartTime",
                "lblColumnSet",
                "lblEndTime",
                "lblColumnSet2",
              ],
            },
          ],
        },
        {
          type: "TextBlock",
          wrap: true,
          text: "Occurs Every",
          weight: "bolder",
          id: "lblOccursEvery",
        },
        {
          type: "Input.ChoiceSet",
          weight: "bolder",
          id: "eventDays",
          style: "filtered",
          isMultiSelect: true,
          choices: eventDays,
          value: "1,2,3,4,5",
        },
        {
          type: "TextBlock",
          wrap: true,
          text: "Range of Recurrence",
          weight: "bolder",
          id: "lblRangeofRecurrence",
        },
        {
          type: "TextBlock",
          wrap: true,
          text: "Start Date and Time",
          id: "lblStartTime",
        },
        {
          type: "ColumnSet",
          id: "lblColumnSet",
          columns: [
            {
              type: "Column",
              width: "stretch",
              items: [
                {
                  type: "Input.Date",
                  value: formatedDate("yyyy-MM-dd", new Date()),
                  id: "startDate",
                },
              ],
            },
            {
              type: "Column",
              width: "stretch",
              items: [
                {
                  type: "Input.Time",
                  value: "10:00",
                  id: "startTime",
                },
              ],
            },
          ],
        },
        {
          type: "TextBlock",
          wrap: true,
          text: "End Date and Time",
          id: "lblEndTime",
        },
        {
          type: "ColumnSet",
          id: "lblColumnSet2",
          columns: [
            {
              type: "Column",
              width: "stretch",
              items: [
                {
                  type: "Input.Date",
                  value: formatedDate("yyyy-MM-dd", nextWeekDate),
                  id: "endDate",
                },
              ],
            },
            {
              type: "Column",
              width: "stretch",
              items: [
                {
                  type: "Input.Time",
                  value: "10:00",
                  id: "endTime",
                },
              ],
            },
          ],
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
        },
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

const getNewIncCardNew = async (
  context,
  user,
  companyData,
  errorMessage = "",
  isCopy = false,
  incId = -1
) => {
  const allMembers = await getAllTeamMembers(context, companyData.teamId);
  let incData = null;
  if (isCopy && Number(incId) > 0) {
    incData = await incidentService.getInc(incId);
    const responseSelectedUsers =
      await incidentService.getIncResponseSelectedUsersList(incId);
    if (responseSelectedUsers != null && responseSelectedUsers.length > 0) {
      incData["responseSelectedUsers"] = responseSelectedUsers;
    } else {
      incData["responseSelectedUsers"] = null;
    }
  }
  return newIncident.getNewIncCardNew(
    user,
    companyData,
    allMembers,
    errorMessage,
    incData,
    isCopy
  );
};

const updateIncStatus = async (context, action) => {
  try {
    const companyData = action.data.companyData ? action.data.companyData : {};
    const dashboardData = action.data.dashboardData
      ? action.data.dashboardData
      : {};
    const incId = action.data.incId ? Number(action.data.incId) : -1;
    const statusToUpdate = action.data.statusToUpdate;
    const incTitle = action.data.incTitle ? action.data.incTitle : "";
    const isUpdated = await incidentService.updateIncStatus(
      incId,
      statusToUpdate
    );
    let adaptiveCard = null;
    if (dashboardData.ts != null && isUpdated) {
      await updateDashboardCard(context, dashboardData, companyData);

      let text = `Incident **${incTitle}** has been closed.`;
      if (statusToUpdate == "In progress") {
        text = `Incident **${incTitle}** has been reopen.`;
      }
      adaptiveCard = updateCard("", "", text);
      const cards = CardFactory.adaptiveCard(adaptiveCard);

      const message = MessageFactory.attachment(cards);
      message.id = context.activity.replyToId;
      await context.updateActivity(message);

      return adaptiveCard;
    }
  } catch (err) {
    console.log(err);
  }
};

const showIncDeleteConfirmationCard = async (context, action) => {
  try {
    const companyData = action.data.companyData ? action.data.companyData : {};
    const dashboardData = action.data.dashboardData
      ? action.data.dashboardData
      : {};
    const incId = action.data.incId ? Number(action.data.incId) : -1;
    const incTitle = action.data.incTitle ? action.data.incTitle : "";
    dashboardData["ts"] = context.activity.replyToId;

    const card = dashboard.getDeleteIncidentCard(
      incId,
      dashboardData,
      companyData,
      incTitle
    );
    const adaptiveCard = CardFactory.adaptiveCard(card);
    await context.sendActivity({
      attachments: [adaptiveCard],
    });

    if (context.activity.replyToId != null) {
      await updateDashboardCard(context, dashboardData, companyData);
    }
  } catch (error) {
    console.log(error);
  }
};

const showIncStatusConfirmationCard = async (
  context,
  action,
  statusToUpdate
) => {
  try {
    const companyData = action.data.companyData ? action.data.companyData : {};
    const dashboardData = action.data.dashboardData
      ? action.data.dashboardData
      : {};
    const incId = action.data.incId ? Number(action.data.incId) : -1;
    const incTitle = action.data.incTitle ? action.data.incTitle : "";
    dashboardData["ts"] = context.activity.replyToId;

    const card = dashboard.getUpdateIncidentStatusCard(
      incId,
      dashboardData,
      companyData,
      statusToUpdate,
      incTitle
    );
    const adaptiveCard = CardFactory.adaptiveCard(card);
    await context.sendActivity({
      attachments: [adaptiveCard],
    });

    if (context.activity.replyToId != null) {
      await updateDashboardCard(context, dashboardData, companyData);
    }
  } catch (error) {
    console.log(error);
  }
};

const copyInc = async (context, user, action) => {
  try {
    const companyData = action.data.companyData ? action.data.companyData : {};
    const incId = action.data.incId ? Number(action.data.incId) : -1;
    const card = await getNewIncCardNew(
      context,
      user,
      companyData,
      "",
      true,
      incId
    );
    const adaptiveCard = CardFactory.adaptiveCard(card);
    await context.sendActivity({
      attachments: [adaptiveCard],
    });

    if (context.activity.replyToId != null) {
      const dashboardData = action.data.dashboardData
        ? action.data.dashboardData
        : {};
      dashboardData["ts"] = context.activity.replyToId;
      await updateDashboardCard(context, dashboardData, companyData);
    }
  } catch (error) {
    console.log(error);
  }
};

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
// const getSafetyCheckMessageText = async (incId, createdByName, incTitle, mentionUserEntities, incRespSelectedUsers = null) => {
//   let onBehalfOf = "", responseUsers = "";
//   if (incRespSelectedUsers == null) {
//     incRespSelectedUsers = await incidentService.getIncResponseSelectedUsersList(incId);
//   }
//   if (incRespSelectedUsers != null && incRespSelectedUsers.length > 0) {
//     for (let i = 0; i < incRespSelectedUsers.length; i++) {
//       const { user_id: userId, user_name: userName } = incRespSelectedUsers[i];
//       responseUsers += ((responseUsers != "") ? ", " : "") + `<at>${userName}</at>`;
//       dashboard.mentionUser(mentionUserEntities, userId, userName);
//     }
//   }
//   if (responseUsers != "") {
//     onBehalfOf = ` on behalf of ${responseUsers}`;
//   }
//   const msg = `This is a safety check from <at>${createdByName}</at>${onBehalfOf}. We think you may be affected by **${incTitle}**. Mark yourself as safe, or ask for assistance.`;
//   return msg;
// };

const getIncConfirmationCard = async (
  inc_created_by,
  incTitle,
  preTextMsg,
  newInc,
  companyData,
  sentApprovalTo,
  action,
  incType,
  guidance
) => {
  let mentionUserEntities = [];
  const safetyCheckMessageText = await getSafetyCheckMessageText(
    newInc.incId,
    inc_created_by.name,
    incTitle,
    mentionUserEntities,
    null,
    1
  );
  dashboard.mentionUser(
    mentionUserEntities,
    inc_created_by.id,
    inc_created_by.name
  );
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
      // {
      //   type: "TextBlock",
      //   separator: true,
      //   wrap: true,
      //   text: `**Guidance:**\n\n` + guidance,
      // },
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
              guidance,
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
              guidance,
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
};

const verifyDuplicateInc = async (teamId, incTitle) => {
  return await incidentService.verifyDuplicateInc(teamId, incTitle);
};
const showDuplicateIncError = async (context, user, companyData) => {
  const errorMessage =
    "The incident with the same name already exists! Please enter another incident name.";
  const card = await getNewIncCardNew(context, user, companyData, errorMessage);
  const cards = CardFactory.adaptiveCard(card);

  const message = MessageFactory.attachment(cards);
  message.id = context.activity.replyToId;
  await context.updateActivity(message);
};
const saveInc = async (context, action, companyData, user) => {
  const { inc_title: incTitle, inc_created_by, memberChoises } = action.data;
  const serviceUrl = context.activity.serviceUrl;

  //console.log({ inc_created_by, action });
  const newInc = await incidentService.saveInc(
    action.data,
    companyData,
    memberChoises,
    serviceUrl
  );

  let sentApprovalTo = "";
  if (action.data.selected_members) {
    preTextMsg = `Should I send this message to the selected user(s)?`;
    sentApprovalTo = SELECTED_USERS;
  } else {
    preTextMsg = `Should I send this message to everyone?`;
    sentApprovalTo = ALL_USERS;
  }
  var guidance = action.data.guidance ? action.data.guidance : "";
  const card = await getIncConfirmationCard(
    inc_created_by,
    incTitle,
    preTextMsg,
    newInc,
    companyData,
    sentApprovalTo,
    action,
    "onetime",
    guidance
  );

  await context.sendActivity({
    attachments: [CardFactory.adaptiveCard(card)],
  });
};

const saveRecurrInc = async (context, action, companyData) => {
  const { inc_title: incTitle, inc_created_by, memberChoises } = action.data;
  const serviceUrl = context.activity.serviceUrl;
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
  const newInc = await incidentService.saveRecurrInc(
    action.data,
    companyData,
    memberChoises,
    serviceUrl
  );

  let sentApprovalTo = "";
  if (action.data.selected_members) {
    preTextMsg = `Should I send this message to the selected user(s) `;
    sentApprovalTo = SELECTED_USERS;
  } else {
    preTextMsg = `Should I send this message to everyone `;
    sentApprovalTo = ALL_USERS;
  }

  const startDate = new Date(action.data.startDate);
  preTextMsg += `starting from ${formatedDate(
    "MM/dd/yyyy",
    startDate
  )} ${convertToAMPM(
    action.data.startTime
  )} according to the recurrence pattern selected?`;
  var guidance = action.data.guidance ? action.data.guidance : "";

  const card = await getIncConfirmationCard(
    inc_created_by,
    incTitle,
    preTextMsg,
    newInc,
    companyData,
    sentApprovalTo,
    action,
    "recurringIncident",
    guidance
  );

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
  const dashboardCard = await dashboard.getIncidentTileDashboardCard(
    dashboardData,
    companyData,
    allTeamMembers
  );
  const dsCard = CardFactory.adaptiveCard(dashboardCard);
  const dsMessage = MessageFactory.attachment(dsCard);
  dsMessage.id = dashboardData.ts;
  await context.updateActivity(dsMessage);
  return dsCard;
};

const deleteInc = async (context, action) => {
  try {
    let incId = -1;
    let adaptiveCard = null;
    const deleteFromDashboard = action.data.deleteFromDashboard == true;
    if (deleteFromDashboard) {
      incId = action.data.incId ? Number(action.data.incId) : -1;
    } else {
      incId = action.data.incidentSelectedVal;
    }

    const incName = await incidentService.deleteInc(incId);

    if (deleteFromDashboard && incName != null) {
      const companyData = action.data.companyData
        ? action.data.companyData
        : {};
      const dashboardData = action.data.dashboardData
        ? action.data.dashboardData
        : {};
      if (dashboardData.ts != null) {
        await updateDashboardCard(context, dashboardData, companyData);
      }
    }

    if (incName != null) {
      const deleteText = `The incident **${incName}** has been deleted successfully.`;
      adaptiveCard = updateCard("", "", deleteText);
      const card = CardFactory.adaptiveCard(adaptiveCard);

      const message = MessageFactory.attachment(card);
      message.id = context.activity.replyToId;
      await context.updateActivity(message);
    }

    return adaptiveCard;
  } catch (err) {
    console.log(err);
  }
};

const viewAllInc = async (context, companyData) => {
  try {
    const allTeamMembers = await getAllTeamMembers(context, companyData.teamId);
    const dashboardCard = await dashboard.getIncidentTileDashboardCard(
      null,
      companyData,
      allTeamMembers
    );
    if (dashboardCard != null) {
      await context.sendActivity({
        attachments: [CardFactory.adaptiveCard(dashboardCard)],
      });
    }
  } catch (err) {
    console.log(err);
  }
};

const getOneTimeDashboardCard = async (
  incidentId,
  runAt = null,
  userObjId = null
) => {
  let card = null;
  try {
    let inc = await incidentService.getInc(incidentId, runAt);

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

    //console.log("membersNotRespondedStr", membersNotRespondedStr);

    card = {
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
        },
      ],
      msteams: {
        entities: mentionUserEntities,
      },
    };
  } catch (err) {
    processSafetyBotError(
      err,
      "",
      "",
      userObjId,
      "error in incidentId=" + incidentId
    );
  }
  return card;
};

const getOneTimeDashboardCardAsync = async (
  incidentId,
  runAt = null,
  userAadObjId = null
) => {
  return new Promise(async (resolve, reject) => {
    const dashboardCard = await getOneTimeDashboardCard(
      incidentId,
      runAt,
      userAadObjId
    );
    if (dashboardCard != null) {
      resolve(dashboardCard);
    } else {
      reject(dashboardCard);
    }
  });
};

const viewIncResult = async (
  incidentId,
  context,
  companyData,
  incData,
  runAt = null,
  dashboardCard = null,
  serviceUrl = null
) => {
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
  if (
    incData != null &&
    incData.activityId != null &&
    incData.conversationId != null &&
    incData.conversationId != "null"
  ) {
    activityId = incData.activityId;
    const conversationId = incData.conversationId;
    const dashboardAdaptiveCard = CardFactory.adaptiveCard(dashboardCard);
    dashboardAdaptiveCard.id = activityId;

    const activity = MessageFactory.attachment(dashboardAdaptiveCard);
    activity.id = activityId;

    updateMessage(activityId, activity, conversationId, serviceUrl);
  } else {
    const activity = await context.sendActivity({
      attachments: [CardFactory.adaptiveCard(dashboardCard)],
    });
    activityId = activity.id;
  }
  return Promise.resolve(activityId);
};

const getSaftyCheckCard = async (
  incTitle,
  incObj,
  companyData,
  incGuidance,
  incResponseSelectedUsersList
) => {
  let mentionUserEntities = [];
  const safetyCheckMessageText = await getSafetyCheckMessageText(
    incObj.incId,
    incObj.incCreatedBy.name,
    incTitle,
    mentionUserEntities,
    incResponseSelectedUsersList,
    1
  );
  dashboard.mentionUser(
    mentionUserEntities,
    incObj.incCreatedBy.id,
    incObj.incCreatedBy.name
  );
  return {
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    appId: process.env.MicrosoftAppId,
    body: [
      {
        type: "TextBlock",
        size: "Large",
        weight: "Bolder",
        text: "Hello!",
      },
      {
        type: "TextBlock",
        separator: true,
        wrap: true,
        text: safetyCheckMessageText,
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
              companyData: companyData,
            },
          },
          {
            type: "Action.Execute",
            verb: "send_response",
            title: "I need assistance",
            data: {
              info: "need_assistance",
              inc: incObj,
              companyData: companyData,
            },
          },
        ],
      },
      // {
      //   type: "TextBlock",
      //   separator: true,
      //   wrap: true,
      //   text: `**Guidance:**\n\n` + incGuidance,
      // }
    ],
    msteams: {
      entities: mentionUserEntities,
    },
    type: "AdaptiveCard",
    version: "1.4",
  };
};

const sendCardToIndividualUser = async (context, userId, approvalCard) => {
  let activityId = null;
  let conversationId = null;
  try {
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
  } catch (err) {
    console.log(err);
  }
  return activityId;
};

const sendCommentToSelectedMembers = async (
  incId,
  context,
  approvalCardResponse
) => {
  try {
    const serviceUrl = context?.activity?.serviceUrl;
    const tenantId = context?.activity?.conversation?.tenantId;
    const incRespSelectedUsers =
      await incidentService.getIncResponseSelectedUsersList(incId);
    if (incRespSelectedUsers != null && incRespSelectedUsers.length > 0) {
      for (let i = 0; i < incRespSelectedUsers.length; i++) {
        let memberArr = [
          {
            id: incRespSelectedUsers[i].user_id,
            name: incRespSelectedUsers[i].user_name,
          },
        ];
        const result = await sendProactiveMessaageToUser(
          memberArr,
          approvalCardResponse,
          null,
          serviceUrl,
          tenantId
        );
      }
    }
  } catch (err) {
    console.log(err);
  }
};

const sendApprovalResponseToSelectedMembers = async (
  incId,
  context,
  approvalCardResponse
) => {
  //If user click on Need assistance, then send message to selected users
  try {
    const serviceUrl = context?.activity?.serviceUrl;
    const tenantId = context?.activity?.conversation?.tenantId;
    const incRespSelectedUsers =
      await incidentService.getIncResponseSelectedUsersList(incId);
    if (incRespSelectedUsers != null && incRespSelectedUsers.length > 0) {
      for (let i = 0; i < incRespSelectedUsers.length; i++) {
        let memberArr = [
          {
            id: incRespSelectedUsers[i].user_id,
            name: incRespSelectedUsers[i].user_name,
          },
        ];
        const result = await sendProactiveMessaageToUser(
          memberArr,
          approvalCardResponse,
          null,
          serviceUrl,
          tenantId
        );
      }
    }
  } catch (err) {
    console.log(err);
  }
};

const sendApprovalResponseToSelectedTeams = async (
  incId,
  serviceUrl,
  approvalCardResponse,
  userAadObjId
) => {
  //If user click on Need assistance, then send message to selected users
  try {
    const incRespSelectedChannels =
      await incidentService.getIncResponseSelectedChannelList(incId);
    // const serviceUrl = context?.activity?.serviceUrl;
    if (incRespSelectedChannels != null && incRespSelectedChannels.length > 0) {
      for (let i = 0; i < incRespSelectedChannels.length; i++) {
        const channelId = incRespSelectedChannels[i]?.channelId;
        if (channelId && serviceUrl) {
          await sendProactiveMessaageToSelectedChannel(
            approvalCardResponse,
            channelId,
            serviceUrl,
            userAadObjId,
            incId
          );
        }
      }
    }
  } catch (err) {
    processSafetyBotError(
      err,
      "",
      "",
      userAadObjId,
      "sendApprovalResponseToSelectedTeams"
    );
  }
};

const updateIncResponseOfSelectedMembers = async (
  incId,
  runAt,
  dashboardCard,
  serviceUrl
) => {
  try {
    const incResponseUserTSData = await incidentService.getIncResponseUserTS(
      incId,
      runAt
    );
    if (incResponseUserTSData != null && incResponseUserTSData.length > 0) {
      for (let i = 0; i < incResponseUserTSData.length; i++) {
        const activityId = incResponseUserTSData[i].activityId;
        const conversationId = incResponseUserTSData[i].conversationId;
        const dashboardAdaptiveCard = CardFactory.adaptiveCard(dashboardCard);
        dashboardAdaptiveCard.id = activityId;

        const activity = MessageFactory.attachment(dashboardAdaptiveCard);
        activity.id = activityId;
        if (conversationId && conversationId != "null")
          await updateMessage(activityId, activity, conversationId, serviceUrl);
      }
    }
  } catch (err) {
    console.log(err);
  }
};

const sendIncResponseToSelectedMembers = async (
  incId,
  dashboardCard,
  runAt,
  contextServiceUrl,
  userTenantId,
  log,
  userAadObjId
) => {
  if (log == null) {
    log = new AYSLog();
  }
  try {
    let sql = "";
    log.addLog("sendIncResponseToSelectedMembers start. ");

    runAt = runAt == null ? "" : runAt;
    const incRespSelectedUsers =
      await incidentService.getIncResponseSelectedUsersList(
        incId,
        userAadObjId
      );
    let serviceUrl = null;
    let tenantId = null;
    if (
      contextServiceUrl != null &&
      contextServiceUrl != "" &&
      userTenantId != null &&
      userTenantId != ""
    ) {
      serviceUrl = contextServiceUrl;
      tenantId = userTenantId;
    } else {
      const userTenantDetails = await incidentService.getUserTenantDetails(
        incId,
        userAadObjId
      );

      if (userTenantDetails != null) {
        serviceUrl = userTenantDetails.serviceUrl;
        tenantId = userTenantDetails.user_tenant_id;
      }
    }

    log.addLog(` serviceUrl : ${serviceUrl}`);
    log.addLog(
      `incRespSelectedUsers data : ${JSON.stringify(incRespSelectedUsers)}`
    );

    if (incRespSelectedUsers != null && incRespSelectedUsers.length > 0) {
      await Promise.all(
        incRespSelectedUsers.map(async (u) => {
          let memberArr = [
            {
              id: u.user_id,
              name: u.user_name,
            },
          ];
          const result = await sendProactiveMessaageToUser(
            memberArr,
            dashboardCard,
            null,
            serviceUrl,
            tenantId,
            log,
            userAadObjId
          );
          log.addLog(` activityId :  ${result.activityId} `);
          if (result.activityId != null) {
            sql += `INSERT INTO MSTeamsIncResponseUserTS(incResponseSelectedUserId, runAt, conversationId, activityId) VALUES(${u.id}, '${runAt}', '${result.conversationId}', '${result.activityId}');`;
          }
        })
      );
    }
    if (sql != "") {
      log.addLog(` sql Insert saveIncResponseUserTS start`);
      await incidentService.saveIncResponseUserTS(sql, userAadObjId);
      log.addLog(` sql Inser saveIncResponseUserTS end`);
    }
  } catch (err) {
    log.addLog(` An Error occured: ${JSON.stringify(err)}`);
    console.log(err);
    processSafetyBotError(err, "", "", userAadObjId);
  } finally {
    log.addLog(` sendIncResponseToSelectedMembers end.`);
  }
  return Promise.resolve(true);
};

const sendtestmessage = async () => {
  console.log("Start sendtestmessage");
  try {
    const incCreatedByUserObj = {
      id: "29:14xKzHoGhohgIpMI5zrDD2IuwD4XLWQHK-uN09QacAGO-r5MkSx2kuoKdB1hEKneuePknoF22_Oiwv0R0yz6KHA",
      name: "Sandesh Sawant",
    };

    const companyData = await getCompanyDataByTeamId(
      "19:Aou6-jqp9KF8FL_Yum5AG_Pg7NP2FweAAsm9CaVSoGQ1@thread.tacv2"
    );
    const { serviceUrl, userTenantId } = companyData;
    const incData = await incidentService.getInc(100662);
    const { incId, incTitle, incType } = incData;

    let incObj = {
      incId,
      incTitle,
      incType,
      runAt: null,
      incCreatedBy: incCreatedByUserObj,
    };
    let incGuidance =
      "this is a fire Drill , Please Exit the Building or check in if you are not in the Building";

    const approvalCard = await getSaftyCheckCard(
      incTitle,
      incObj,
      companyData,
      incGuidance
    );
    let member = [
      {
        id: "29:14xKzHoGhohgIpMI5zrDD2IuwD4XLWQHK-uN09QacAGO-r5MkSx2kuoKdB1hEKneuePknoF22_Oiwv0R0yz6KHA",
        name: "Sandesh Sawant",
      },
    ];
    const response = await sendProactiveMessaageToUser(
      member,
      approvalCard,
      null,
      serviceUrl,
      userTenantId,
      incCreatedByUserObj.id
    );
    console.log(response);
  } catch (err) {
    console.log(err);
  }
  console.log("End sendtestmessage");
};

const logTimeInSeconds = (startTime, message) => {
  let endTime = new Date().getTime();
  let seconds = (endTime - startTime) / 1000;
  console.log(`${message} ${seconds}`);
};

//Send message after received response new
const sendProactiveMessageAsync = async (
  allMembersArr,
  incData,
  incObj,
  companyData,
  serviceUrl,
  userAadObjId,
  userTenantId,
  log,
  resolveFn,
  rejectFn,
  runAt = null,
  incFilesData = null
) => {
  try {
    if (log == null) {
      log = new AYSLog();
    }
    const isRecurringInc = runAt != null;
    const {
      incTitle,
      incTypeId,
      additionalInfo,
      travelUpdate,
      contactInfo,
      situation,
    } = incData;

    let titalmessage = null;
    if (incTypeId == 1) {
      titalmessage = `Safety Check - ${incTitle}`;
    } else if (incTypeId == 2) {
      titalmessage = `Safety Alert - ${incTitle}`;
    } else if (incTypeId == 3) {
      titalmessage = `Important Bulletin - ${incTitle}`;
    } else if (incTypeId == 4) {
      titalmessage = `Travel Advisory - ${incTitle}`;
    } else if (incTypeId == 5) {
      titalmessage = `Stakeholder Notice - ${incTitle}`;
    }
    log.addLog(
      `Start Saftey Check card Sending:IncId-${incObj.incId},TeamId-${incData.teamId}, SelectedMember-${incData.selectedMembers},CreatedByUSerId-${companyData.userId}`
    );
    log.addLog(`${JSON.stringify(incData)}`);
    const approvalCard = await SafetyCheckCard(
      incTitle,
      incObj,
      companyData,
      incObj.incGuidance,
      incObj.incResponseSelectedUsersList,
      incTypeId,
      additionalInfo,
      travelUpdate,
      contactInfo,
      situation
    );
    const activity = MessageFactory.attachment(
      CardFactory.adaptiveCard(approvalCard)
    );
    log.addLog(`Card Create Successfully `);
    if (incFilesData != null && incFilesData.length > 0) {
      const cardBody = [];
      if (incFilesData.length == 1) {
        cardBody.push({
          type: "Image",
          url: incFilesData[0].Blob,
          msTeams: {
            allowExpand: true,
          },
        });
      } else {
        let columns = [];
        incFilesData.forEach((incFile, index) => {
          if (index % 2 == 0) {
            columns = [];
            let cs = {
              type: "ColumnSet",
              columns: columns,
            };
            cardBody.push(cs);
          }
          let columnItems = [];
          columnItems.push({
            type: "Image",
            url: incFile.Blob,
            msTeams: {
              allowExpand: true,
            },
          });
          let column = {
            type: "Column",
            items: columnItems,
          };
          columns.push(column);
        });
      }
      let card = {
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
        appId: process.env.MicrosoftAppId,
        body: cardBody,
        type: "AdaptiveCard",
        version: "1.4",
      };
      activity.attachments.push(CardFactory.adaptiveCard(card));
    }

    const appId = process.env.MicrosoftAppId;
    const appPass = process.env.MicrosoftAppPassword;

    var credentials = new MicrosoftAppCredentials(appId, appPass);
    var connectorClient = new ConnectorClient(credentials, {
      baseUri: serviceUrl,
    });

    let messageCount = 0;

    const dbPool = await db.getPoolPromise(userAadObjId);
    let sqlUpdateMsgDeliveryStatus = "";
    let updateStartTime = null;
    let allMembersArrCount = Array.isArray(allMembersArr)
      ? allMembersArr.length
      : 0;
    let retryLog = [];
    const updateMsgDeliveryStatus = (sql) => {
      if (sql != "") {
        sqlUpdateMsgDeliveryStatus = "";
        const promise = db
          .updateDataIntoDBAsync(sql, dbPool, userAadObjId)
          .then((resp) => {})
          .catch((err) => {
            sqlUpdateMsgDeliveryStatus += sql;
            processSafetyBotError(
              err,
              "",
              "",
              userAadObjId,
              "error in updateMsgDeliveryStatus -> then - > sql=" + sql
            );
          });

        if (!promise) {
          sqlUpdateMsgDeliveryStatus += sql;
        }
      }
    };

    let msgNotSentArr = [],
      retryCounter = 0,
      retryCountTill = 10,
      respTime = new Date().getTime(),
      recurTimerDelay = 1000,
      rps = 1;

    const respTimeInterval = setInterval(() => {
      try {
        const currentTime = new Date().getTime();
        if ((currentTime - respTime) / 1000 >= 300) {
          clearInterval(respTimeInterval);
          resolveFn(true);
          return;
        }
        if ((currentTime - respTime) / 1000 >= 150) {
          if (msgNotSentArr.length > 0 && retryCounter < retryCountTill) {
            reSendMessage();
          } else if (messageCount == allMembersArr.length) {
            clearInterval(respTimeInterval);
            resolveFn(true);
          }
        }
      } catch (err) {
        console.log(err);
        processSafetyBotError(
          err,
          "",
          "",
          userAadObjId,
          "error in respTimeInterval"
        );
      }
    }, 50000);

    const reSendMessage = () => {
      try {
        retryCounter++;
        if (sqlUpdateMsgDeliveryStatus != "") {
          updateMsgDeliveryStatus(sqlUpdateMsgDeliveryStatus);
        }
        messageCount = 0;

        if (allMembersArr && Array.isArray(allMembersArr)) {
          const arrRespNotReceived = allMembersArr.filter((item) => {
            return !item.isResponseReceived;
          });
          if (arrRespNotReceived && arrRespNotReceived.length > 0) {
            msgNotSentArr = [...msgNotSentArr, ...arrRespNotReceived];
          }
        }

        allMembersArr = msgNotSentArr;
        allMembersArrCount = Array.isArray(allMembersArr)
          ? allMembersArr.length
          : 0;
        msgNotSentArr = [];
        sendProactiveMessage(allMembersArr);
      } catch (err) {
        console.log(err);
        processSafetyBotError(
          err,
          "",
          "",
          userAadObjId,
          "error in reSendMessage"
        );
      }
    };

    const callbackFn = (msgResp, index) => {
      try {
        if (msgResp?.retryCounter && msgResp.retryCounter != retryCounter) {
          return;
        }

        respTime = new Date().getTime();
        messageCount += 1;
        //console.log({ "end i ": index, messageCount });

        let isMessageDelivered = 0;
        if (
          msgResp?.conversationId != null &&
          msgResp?.conversationId != "null" &&
          (msgResp?.activityId != null ||
            msgResp?.memberObj?.isResponseReceived)
        ) {
          isMessageDelivered = 1;
        }
        const status = msgResp?.status == null ? null : Number(msgResp?.status);
        const error = msgResp?.error == null ? null : msgResp?.error;
        const respMemberObj = msgResp.memberObj;

        respMemberObj.isResponseReceived = true;

        if (
          error == null ||
          msgResp.errorCode == "ConversationBlockedByUser" ||
          error == "Invalid user identity in provided tenant" ||
          retryCounter == retryCountTill
        ) {
          if (
            msgResp.errorCode == "ConversationBlockedByUser" ||
            status == "User blocked the conversation with the bot."
          ) {
            let sqlUpdateBlockedByUser = `UPDATE MSTeamsTeamsUsers set BotBlockedByUser=1 where user_aadobject_id='${userAadObjId}'`;
            db.getDataFromDB(sqlUpdateBlockedByUser, userAadObjId);
            isMessageDelivered = 0;
          }
          if (isRecurringInc) {
            if (
              msgResp.isSafetyCheckTitleResponse === undefined ||
              !msgResp.isSafetyCheckTitleResponse
            ) {
              log.addLog(`For isRecurringInc Incident`);
              sqlUpdateMsgDeliveryStatus += ` insert into MSTeamsMemberResponsesRecurr(memberResponsesId, runAt, is_message_delivered, response, response_value, comment, conversationId, activityId, message_delivery_status, message_delivery_error,LastReminderSentAT) 
              values(${
                respMemberObj.memberResponsesId
              }, '${runAt}', ${isMessageDelivered}, 0, NULL, NULL, '${
                msgResp?.conversationId
              }', '${msgResp?.activityId}', ${status}, '${error}', ${
                isMessageDelivered == 1 ? "GETDATE()" : "NULL"
              }); `;
            }
          } else {
            log.addLog(`For OneTime Incident`);
            sqlUpdateMsgDeliveryStatus += ` update MSTeamsMemberResponses set is_message_delivered = ${isMessageDelivered}, message_delivery_status = ${status}, message_delivery_error = '${error}', LastReminderSentAT = ${
              isMessageDelivered == 1 ? "GETDATE()" : "NULL"
            } where inc_id = ${incObj.incId} and user_id = '${
              msgResp.userId
            }'; `;
          }
        }

        if (
          respMemberObj.conversationId == null &&
          msgResp.newConversationId != null &&
          msgResp.newConversationId != "null"
        ) {
          respMemberObj.conversationId = msgResp.newConversationId;

          sqlUpdateMsgDeliveryStatus += ` update msteamsteamsusers set conversationId = '${msgResp.newConversationId}' where user_id = '${msgResp.userId}' ;`;
        }

        if (!error) {
          console.log({
            usrId: msgResp.userId,
            name: respMemberObj.name,
            index,
            messageCount,
            retryCounter,
            allMembersArrCount,
          });
        } else {
          console.log({
            error: `status ${status}`,
            usrId: msgResp.userId,
            name: respMemberObj.name,
            index,
            messageCount,
            retryCounter,
            allMembersArrCount,
          });
        }

        if (updateStartTime == null) {
          updateStartTime = new Date().getTime();
        }
        let updateEndTime = new Date().getTime();
        updateEndTime = (updateEndTime - updateStartTime) / 2000;

        if (
          sqlUpdateMsgDeliveryStatus != "" &&
          updateEndTime != null &&
          Number(updateEndTime) >= 2
        ) {
          updateStartTime = null;
          console.log("inside first ", { msgResp });
          updateMsgDeliveryStatus(sqlUpdateMsgDeliveryStatus);
        }
        const totalMessageCountAfterTitleNotification =
          allMembersArr.length * 2;
        console.log({
          messageCount,
          totalMessageCountAfterTitleNotification,
          sqlUpdateMsgDeliveryStatus,
        });
        if (messageCount == totalMessageCountAfterTitleNotification) {
          if (msgNotSentArr.length > 0 && retryCounter < retryCountTill) {
            reSendMessage();
          } else {
            if (respTimeInterval != null) {
              try {
                clearInterval(respTimeInterval);
              } catch (err) {
                console.log(err);
                processSafetyBotError(
                  err,
                  "",
                  "",
                  userAadObjId,
                  "error in clear respTimeInterval"
                );
              }
            }
            if (sqlUpdateMsgDeliveryStatus != "") {
              console.log("inside second ", { msgResp });
              updateMsgDeliveryStatus(sqlUpdateMsgDeliveryStatus);
            }
            console.log({ retryLog });
            //processSafetyBotError("Retry Log", "", "", userAadObjId, retryLog);
            resolveFn(true);
          }
        }
      } catch (err) {
        processSafetyBotError(
          err,
          "",
          "",
          userAadObjId,
          "error in callbackFn msgResp=" + msgResp + " index=" + index
        );
      }
    };

    const sendProactiveMessage = (membersToSendMessageArray) => {
      retryLog.push({
        "memberCount:": membersToSendMessageArray?.length,
        retryCounter,
      });
      console.log({
        "memberCount:": membersToSendMessageArray?.length,
        retryCounter,
      });
      let delay = 0;
      const sendErrorEmail = retryCounter == retryCountTill;
      let endIndex =
        membersToSendMessageArray.length > rps
          ? rps
          : membersToSendMessageArray.length;

      const afterMessageSent = (msgResp, index) => {
        console.log({ msgResp });
        callbackFn(msgResp, index);

        //callbackFn(msgResp, index);
        if (endIndex < membersToSendMessageArray.length) {
          let startIndex = endIndex;
          endIndex = endIndex + 1;

          if (startIndex % 45 == 0) {
            console.log({ startIndex, endIndex });
            setTimeout(() => {
              fnRecursiveCall(startIndex, endIndex);
            }, recurTimerDelay);
          } else {
            fnRecursiveCall(startIndex, endIndex);
          }
          console.log("fnRecursiveCall End");
        }
      };

      const fnRecursiveCall = (startIndex, endIndex) => {
        try {
          const i = startIndex;
          const member = membersToSendMessageArray[i];
          if (member) {
            let memberArr = [
              {
                id: member.id,
                name: member.name,
              },
            ];
            const conversationId = member.conversationId;
            sendProactiveMessaageToUserAsync(
              memberArr,
              null,
              titalmessage,
              serviceUrl,
              userTenantId,
              log,
              userAadObjId,
              conversationId,
              connectorClient,
              afterMessageSent,
              i,
              delay,
              member,
              msgNotSentArr,
              sendErrorEmail,
              retryCounter
            );
            setTimeout(() => {
              sendProactiveMessaageToUserAsync(
                memberArr,
                activity,
                null,
                serviceUrl,
                userTenantId,
                log,
                userAadObjId,
                conversationId,
                connectorClient,
                afterMessageSent,
                i,
                delay,
                member,
                msgNotSentArr,
                sendErrorEmail,
                retryCounter
              );
            }, 1000);
            console.log({ i });
          }
        } catch (err) {
          console.log(err);
          processSafetyBotError(
            err,
            "",
            "",
            userAadObjId,
            " error in fnRecursiveCall startIndex=" +
              startIndex +
              " endIndex=" +
              endIndex
          );
        }
      };
      console.log("fnRecursiveCall start");
      fnRecursiveCall(0, endIndex);
    };
    sendProactiveMessage(allMembersArr);
  } catch (err) {
    log.addLog(` An Error occured: ${JSON.stringify(err)}`);
    console.log(err);
    processSafetyBotError(
      err,
      "",
      "",
      userAadObjId,
      "error in sendProactiveMessageAsync incData=" +
        JSON.stringify(incData) +
        " companyData=" +
        JSON.stringify(companyData)
    );
    rejectFn(err);
  } finally {
    log.addLog(` Send SafteyCheck card  end.`);
  }
};

const sendSafetyCheckMsgViaSMS = async (companyData, users, incId, incTitle) => {
  let tenantId = companyData.userTenantId;
  let refresh_token = companyData.refresh_token;
  let usrPhones = await getUserPhone(refresh_token, tenantId, users);
  let counter = 0;
  for (let user of usrPhones) {
    try {
      if ((user.businessPhones.length > 0 && user.businessPhones[0] != "") || user.mobilePhone != "") {
        let phone = user.businessPhones.length > 0 && user.businessPhones[0] != "" ?
          user.businessPhones[0] : user.mobilePhone;
        let safeUrl =
          process.env.serviceUrl +
          "/posresp?userId=" +
          encodeURIComponent(user.id) +
          "&eventId=" +
          encodeURIComponent(incId);
        let notSafeUrl =
          process.env.serviceUrl +
          "/negresp?userId=" +
          encodeURIComponent(user.id) +
          "&eventId=" +
          encodeURIComponent(incId);

        let body =
          "Safety check from " +
          companyData.teamName +
          " - " +
          incTitle +
          " \nWe're checking to see if you are safe. \nClick " +
          safeUrl +
          " if you are safe, " +
          "or " +
          notSafeUrl +
          " if you need help.";
        await tClient.messages
          .create({
            body: body,
            from: "+18023277232",
            shortenUrls: true,
            messagingServiceSid: "MGdf47b6f3eb771ed026921c6e71017771",
            to: phone,
          });
        counter++;
      }
      if (companyData.SubscriptionType == 2) {
        incidentService.updateSentSMSCount(companyData.teamId, counter);
      }
    } catch (err) {
      processSafetyBotError(err, companyData.teamId, user.id, null, "error in sending safety check via SMS");
    }
  }
}


const proccessSMSLinkClick = async (userId, eventId, text) => {
  if (userId && eventId) {
    const incData = await incidentService.getInc(eventId, null, userId);
    const compData = await incidentService.getCompanyData(incData.teamId);
    const users = await incidentService.getUserInfo(incData.teamId, userId);
    let user = users[0];
    let context = {
      activity: {
        serviceUrl: compData.serviceUrl,
        conversation: {
          tenantId: compData.userTenantId
        }
      }
    }
    incidentService.updateSafetyCheckStatusViaSMSLink(eventId, text == "YES" ? 1 : 0, userId, compData.teamId);
    if (text != "YES") {
      const approvalCardResponse = {
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
        appId: process.env.MicrosoftAppId,
        body: [
          {
            type: "TextBlock",
            text: `User <at>${user.user_name}</at> needs assistance for Incident: **${incData.incTitle}** `,
            wrap: true,
          },
        ],
        msteams: {
          entities: [
            {
              type: "mention",
              text: `<at>${user.user_name}</at>`,
              mentioned: {
                id: user.user_id,
                name: user.user_name,
              },
            },
          ],
        },
        type: "AdaptiveCard",
        version: "1.4",
      };
      //send new msg just to emulate msg is being updated
      //await sendDirectMessageCard(context, incCreatedBy, approvalCardResponse);
      const serviceUrl = context?.activity?.serviceUrl;
      await sendApprovalResponseToSelectedMembers(
        eventId,
        context,
        approvalCardResponse
      );
      await sendApprovalResponseToSelectedTeams(
        eventId,
        serviceUrl,
        approvalCardResponse,
        userId
      );
    }
    acknowledgeSMSReplyInTeams(text, compData, incData.incCreatedBy, incData.incCreatedByName, user);
  }
}

const acknowledgeSMSReplyInTeams = async (msgText, companyData, incCreatedById, incCreatedByName, user) => {
  try {
    let responseText = "";
    if (msgText === "YES") {
      responseText = `Glad you're safe! Your safety status has been sent to <at>${incCreatedByName}</at>`;
    } else {
      responseText = `Sorry to hear that! We have informed <at>${incCreatedByName}</at> of your situation and someone will be reaching out to you as soon as possible.`;
    }

    const { serviceUrl, userTenantId } = companyData;
    const incData = await incidentService.getInc(100662);

    const approvalCard = {
      $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
      appId: process.env.MicrosoftAppId,
      body: [
        {
          type: "TextBlock",
          text: responseText,
          wrap: true,
        },
      ],
      msteams: {
        entities: [
          {
            type: "mention",
            text: `<at>${incCreatedByName}</at>`,
            mentioned: {
              id: incCreatedById,
              name: incCreatedByName,
            },
          },
        ],
      },
      type: "AdaptiveCard",
      version: "1.4",
    };
    let member = [
      {
        id: user.user_id,
        name: user.user_name,
      },
    ];
    const response = await sendProactiveMessaageToUser(
      member,
      approvalCard,
      null,
      serviceUrl,
      userTenantId,
      null,
      user.user_aadobject_id
    );
    console.log(response);
  } catch (err) {
    console.log(err);
  }
}

const SaveSmsLog = async (userid, status, SMS_TEXT, RAW_DATA) => {
  let superUsers = null;
  try {
    superUsers = await incidentService.SaveSmsLog(userid, status, SMS_TEXT, RAW_DATA);
  } catch (err) {
    processSafetyBotError(err, "", "", null, "error in saveSMSLog");
  }
  return Promise.resolve(superUsers);
}


const getUserPhone = async (refreshToken, tenantId, arrIds) => {
  try {
    let data = new FormData();
  data.append("grant_type", "refresh_token");
  data.append("client_Id", process.env.MicrosoftAppId);
  data.append("client_secret", process.env.MicrosoftAppPassword);
  data.append("refresh_token", refreshToken);

  let config = {
    method: "post",
    maxBodyLength: Infinity,
    url: `https://login.microsoftonline.com/${tenantId}/oauth2/token`,
    data: data,
    // timeout: 10000,
  };       
  var phone = [""];
  phone.pop();
    await axios
    .request(config)
    .then(async (response) => {
      // console.log(response.data);
      if (response.data.scope?.indexOf("User.Read.All") == -1) {
        res.json({ NoPhonePermission: true });
      } else {
        let accessToken = response.data.access_token;
        // console.log({ arrIds });
        var startIndex = 0;
        var endIndex = 14;
        if (endIndex > arrIds.length) endIndex = arrIds.length; 
        // console.log({ endIndex });
        while (endIndex <= arrIds.length && startIndex != endIndex) {
          var userIds = arrIds.slice(startIndex, endIndex).toString();
          if (userIds.length) {
            userIds = "'" + userIds.replaceAll(",", "','") + "'";
            // console.log({ userIds });
            startIndex = endIndex;
            endIndex = startIndex + 14;
            if (endIndex > arrIds.length) endIndex = arrIds.length;

            let config = {
              method: "get",
              maxBodyLength: Infinity,
              // timeout: 10000,
              url:
                "https://graph.microsoft.com/v1.0/users?$select=displayName,id,businessPhones,mobilePhone" +
                "&$filter=id in (" +
                userIds +
                ")",
              headers: {
                "Content-Type": "application/json",
                Authorization: "Bearer " + accessToken,
              },
              // data: data,
            };
            var requestDate = new Date();
            var a = await axios
              .request(config)
              .then((response) => {
                phone.push(...response.data.value);
                // console.log({ phone });
                // var data = {
                //   status: status,
                //   teamData: teamData,
                // };
              })
              .catch((error) => {
                console.log({
                  "error in get users phone number requestDate": error,
                });
                processSafetyBotError(
                  error,
                  teamId,
                  "",
                  "",
                  "error in get users phone number requestDateTime : " +
                  requestDate +
                  " ErrorDateTime: " +
                  new Date(),
                  TeamName,
                  false,
                  clientVersion
                );
                res.json({ error: error });
              });
          } else {
            return;
          }
        }
        // console.log({ finalphone: phone });
      }
    })
    .catch((error) => {
      console.log("error at get access token in get users phone number");
      // console.log(error);
      if (
        error.response.data.error == "invalid_grant" &&
        error.response.data.error_description &&
        error.response.data.error_description
          .toString()
          .indexOf("The refresh token has expired due to inactivity.") >= 0 //&&
        //  teamId == "19:3684c109f05f44efb4fb54a988d70286@thread.tacv2"
      ) {
        res.json({ authFailed: true });
      } else if (
        error.response.data.error == "invalid_grant" ||
        error.response.data.error == "interaction_required" ||
        error.response.data.error == "insufficient_claims"
      ) {
        res.json({ invalid_grant: true });
      } else {
        console.log({
          "error in get access token from microsoft at get users phone number":
            error,
        });
        processSafetyBotError(
          error,
          teamId,
          "",
          "",
          "error in get access token from microsoft at get users phone number",
          TeamName,
          false,
          clientVersion
        );
        res.json({ error: error });
      }
    });
  return phone;
  } catch (err) {
    console.log(err);
  }
}
// const sendProactiveMessageAsync = async (allMembersArr, incData, incObj, companyData, serviceUrl, userAadObjId, userTenantId, log, resolveFn, rejectFn, runAt = null) => {
//   try {
//     const isRecurringInc = (runAt != null);
//     const { incTitle, incTypeId, additionalInfo, travelUpdate, contactInfo, situation } = incData;
//     const approvalCard = await SafetyCheckCard(incTitle, incObj, companyData, incObj.incGuidance, incObj.incResponseSelectedUsersList, incTypeId, additionalInfo, travelUpdate, contactInfo, situation);
//     const activity = MessageFactory.attachment(CardFactory.adaptiveCard(approvalCard));
//     const appId = process.env.MicrosoftAppId;
//     const appPass = process.env.MicrosoftAppPassword;

//     var credentials = new MicrosoftAppCredentials(appId, appPass);
//     var connectorClient = new ConnectorClient(credentials, { baseUri: serviceUrl });

//     let messageCount = 0;

//     const dbPool = await db.getPoolPromise(userAadObjId);
//     let sqlUpdateMsgDeliveryStatus = "";
//     let updateStartTime = null;
//     let allMembersArrCount = (Array.isArray(allMembersArr)) ? allMembersArr.length : 0;
//     let retryLog = [];
//     const updateMsgDeliveryStatus = (sql) => {
//       if (sql != "") {
//         sqlUpdateMsgDeliveryStatus = "";
//         const promise = db.updateDataIntoDBAsync(sql, dbPool, userAadObjId)
//           .then((resp) => {

//           })
//           .catch((err) => {
//             sqlUpdateMsgDeliveryStatus += sql;
//             processSafetyBotError(err, "", "", userAadObjId, sql);
//           });

//         if (!promise) {
//           sqlUpdateMsgDeliveryStatus += sql;
//         }
//       }
//     }

//     let msgNotSentArr = [], retryCounter = 0, retryCountTill = 10, respTime = (new Date()).getTime(), recurTimerDelay = 1000, rps = 4;

//     const respTimeInterval = setInterval(() => {
//       try {
//         const currentTime = (new Date()).getTime();
//         if ((currentTime - respTime) / 1000 >= 300) {
//           clearInterval(respTimeInterval);
//           resolveFn(true);
//           return;
//         }
//         if ((currentTime - respTime) / 1000 >= 150) {
//           if (msgNotSentArr.length > 0 && retryCounter < retryCountTill) {
//             reSendMessage();
//           } else if (messageCount == allMembersArr.length) {
//             clearInterval(respTimeInterval);
//             resolveFn(true);
//           }
//         }
//       } catch (err) {
//         console.log(err);
//         processSafetyBotError(err, "", "", userAadObjId);
//       }
//     }, 50000);

//     const reSendMessage = () => {
//       try {
//         retryCounter++;
//         if (sqlUpdateMsgDeliveryStatus != "") {
//           updateMsgDeliveryStatus(sqlUpdateMsgDeliveryStatus);
//         }
//         messageCount = 0;

//         if (allMembersArr && Array.isArray(allMembersArr)) {
//           const arrRespNotReceived = allMembersArr.filter((item) => {
//             return !item.isResponseReceived;
//           });
//           if (arrRespNotReceived && arrRespNotReceived.length > 0) {
//             msgNotSentArr = [...msgNotSentArr, ...arrRespNotReceived];
//           }
//         }

//         allMembersArr = msgNotSentArr;
//         allMembersArrCount = (Array.isArray(allMembersArr)) ? allMembersArr.length : 0;
//         msgNotSentArr = [];
//         sendProactiveMessage(allMembersArr);
//       } catch (err) {
//         console.log(err);
//         processSafetyBotError(err, "", "", userAadObjId);
//       }
//     }

//     const callbackFn = (msgResp, index) => {
//       try {
//         if (msgResp?.retryCounter && msgResp.retryCounter != retryCounter) {
//           return;
//         }

//         respTime = (new Date()).getTime();
//         messageCount += 1;
//         //console.log({ "end i ": index, messageCount });

//         let isMessageDelivered = 0;
//         if (msgResp?.conversationId != null && msgResp?.activityId != null) {
//           isMessageDelivered = 1;
//         }
//         const status = (msgResp?.status == null) ? null : Number(msgResp?.status);
//         const error = (msgResp?.error == null) ? null : msgResp?.error;
//         const respMemberObj = msgResp.memberObj;

//         respMemberObj.isResponseReceived = true;

//         if (error == null || msgResp.errorCode == "ConversationBlockedByUser" || error == "Invalid user identity in provided tenant" || retryCounter == retryCountTill) {
//           if (isRecurringInc) {
//             sqlUpdateMsgDeliveryStatus += ` insert into MSTeamsMemberResponsesRecurr(memberResponsesId, runAt, is_message_delivered, response, response_value, comment, conversationId, activityId, message_delivery_status, message_delivery_error)
//               values(${respMemberObj.memberResponsesId}, '${runAt}', ${isMessageDelivered}, 0, NULL, NULL, '${msgResp?.conversationId}', '${msgResp?.activityId}', ${status}, '${error}'); `;
//           } else {
//             sqlUpdateMsgDeliveryStatus += ` update MSTeamsMemberResponses set is_message_delivered = ${isMessageDelivered}, message_delivery_status = ${status}, message_delivery_error = '${error}' where inc_id = ${incObj.incId} and user_id = '${msgResp.userId}'; `;
//           }
//         }

//         if (respMemberObj.conversationId == null && msgResp.newConversationId != null) {
//           respMemberObj.conversationId = msgResp.newConversationId;

//           sqlUpdateMsgDeliveryStatus += ` update msteamsteamsusers set conversationId = '${msgResp.newConversationId}' where user_id = '${msgResp.userId}' ;`;
//         }

//         if (!error) {
//           console.log({ "usrId": msgResp.userId, "name": respMemberObj.name, index, messageCount, retryCounter, allMembersArrCount });
//         } else {
//           console.log({ "error": `status ${status}`, "usrId": msgResp.userId, "name": respMemberObj.name, index, messageCount, retryCounter, allMembersArrCount });
//         }

//         if (updateStartTime == null) {
//           updateStartTime = (new Date()).getTime();
//         }
//         let updateEndTime = (new Date()).getTime();
//         updateEndTime = (updateEndTime - updateStartTime) / 2000;

//         if (sqlUpdateMsgDeliveryStatus != "" && updateEndTime != null && Number(updateEndTime) >= 2) {
//           updateStartTime = null;
//           updateMsgDeliveryStatus(sqlUpdateMsgDeliveryStatus);
//         }

//         if (messageCount == allMembersArr.length) {
//           if (msgNotSentArr.length > 0 && retryCounter < retryCountTill) {
//             reSendMessage();
//           } else {
//             if (respTimeInterval != null) {
//               try {
//                 clearInterval(respTimeInterval);
//               } catch (err) {
//                 console.log(err);
//                 processSafetyBotError(err, "", "", userAadObjId);
//               }
//             }
//             if (sqlUpdateMsgDeliveryStatus != "") {
//               updateMsgDeliveryStatus(sqlUpdateMsgDeliveryStatus);
//             }
//             console.log({ retryLog });
//             //processSafetyBotError("Retry Log", "", "", userAadObjId, retryLog);
//             resolveFn(true);
//           }
//         }
//       } catch (err) {
//         processSafetyBotError(err, "", "", userAadObjId);
//       }
//     }

//     const sendProactiveMessage = (membersToSendMessageArray) => {
//       retryLog.push({ "memberCount:": membersToSendMessageArray?.length, retryCounter });
//       console.log({ "memberCount:": membersToSendMessageArray?.length, retryCounter });
//       let delay = 0;
//       const sendErrorEmail = (retryCounter == retryCountTill);

//       const fnRecursiveCall = (startIndex, endIndex) => {
//         for (let i = startIndex; i < endIndex; i++) {
//           try {
//             const member = membersToSendMessageArray[i];
//             if (member) {
//               let memberArr = [{
//                 id: member.id,
//                 name: member.name
//               }];
//               const conversationId = member.conversationId;
//               sendProactiveMessaageToUserAsync(memberArr, activity, null, serviceUrl, userTenantId, log, userAadObjId, conversationId, connectorClient, callbackFn, i, delay, member, msgNotSentArr, sendErrorEmail, retryCounter);
//               console.log({ i });
//             }
//           } catch (err) {
//             console.log(err);
//             processSafetyBotError(err, "", "", userAadObjId);
//           }
//         }
//         if (endIndex < membersToSendMessageArray.length) {
//           startIndex = endIndex;
//           endIndex = endIndex + rps;
//           if (endIndex > membersToSendMessageArray.length) {
//             endIndex = membersToSendMessageArray.length;
//           }
//           recurTimerDelay = 1000;
//           if (startIndex % 60 == 0) {
//             console.log({ startIndex, endIndex });
//             recurTimerDelay = 30000;
//           }
//           setTimeout(() => {
//             fnRecursiveCall(startIndex, endIndex);
//             console.log("fnRecursiveCall End");
//           }, recurTimerDelay);
//         }
//       }
//       let endIndex = (membersToSendMessageArray.length > rps) ? rps : membersToSendMessageArray.length;
//       console.log("fnRecursiveCall start");
//       fnRecursiveCall(0, endIndex);

//       // membersToSendMessageArray.map((member, index) => {
//       //   try {
//       //     let memberArr = [{
//       //       id: member.id,
//       //       name: member.name
//       //     }];
//       //     const conversationId = member.conversationId;
//       //     sendProactiveMessaageToUserAsync(memberArr, activity, null, serviceUrl, userTenantId, log, userAadObjId, conversationId, connectorClient, callbackFn, index, delay, member, msgNotSentArr, sendErrorEmail);
//       //   } catch (err) {
//       //     processSafetyBotError(err, "", "", userAadObjId);
//       //   }
//       //   delay += 500;
//       // });
//     }
//     sendProactiveMessage(allMembersArr);
//   } catch (err) {
//     console.log(err);
//     processSafetyBotError(err, "", "", userAadObjId);
//     rejectFn(err);
//   }
// }

const sendSafetyCheckMessageAsync = async (
  incId,
  teamId,
  createdByUserInfo,
  log,
  userAadObjId,
  resendSafetyCheck = false
) => {
  return new Promise(async (resolve, reject) => {
    try {
      let {
        companyData,
        incData,
        allMembers,
        incGuidance,
        incResponseSelectedUsersList,
        incFilesData,
      } = await incidentService.getRequiredDataToSendMessage(
        incId,
        teamId,
        userAadObjId,
        "id",
        "name",
        resendSafetyCheck
      );
      const { incTitle, selectedMembers, incCreatedBy, incType, incTypeId } =
        incData;
      const { serviceUrl, userTenantId, userId } = companyData;
      if (resendSafetyCheck || resendSafetyCheck === "true") {
        createdByUserInfo.user_id = userId;
      }
      let selectedMembersArr = [];
      if (
        typeof selectedMembers == "string" &&
        selectedMembers &&
        selectedMembers?.split(",").length > 0
      ) {
        selectedMembersArr = selectedMembers?.split(",");
      } else if (selectedMembers && selectedMembers.length > 0)
        selectedMembersArr = selectedMembers;

      let allMembersArr = [];
      if (selectedMembersArr && selectedMembersArr?.length > 0) {
        allMembersArr = allMembers.filter((tm) =>
          selectedMembersArr.includes(tm.id)
        );
      } else {
        allMembersArr = allMembers;
      }
      if (!resendSafetyCheck || resendSafetyCheck === "false") {
        await incidentService.addMembersIntoIncData(
          incId,
          allMembersArr,
          incCreatedBy,
          userAadObjId
        );
      }
      // logTimeInSeconds(startTime, `addMembersIntoIncData end`);
      // startTime = (new Date()).getTime();

      if (Number(incTypeId) == 1 && incType == "recurringIncident") {
        const userTimeZone = createdByUserInfo.userTimeZone;
        const actionData = { incident: incData };
        if (!resendSafetyCheck || resendSafetyCheck === "false") {
          await incidentService.saveRecurrSubEventInc(
            actionData,
            companyData,
            userTimeZone
          );
        }
        resolve(true);
      } else {
        incGuidance = incGuidance ? incGuidance : "";
        const incCreatedByUserObj = {
          id: createdByUserInfo.user_id,
          name: createdByUserInfo.user_name,
        };
        let incObj = {
          incId,
          incTitle,
          incType,
          runAt: null,
          incCreatedBy: incCreatedByUserObj,
          incGuidance,
          incResponseSelectedUsersList,
        };
        sendProactiveMessageAsync(
          allMembersArr,
          incData,
          incObj,
          companyData,
          serviceUrl,
          userAadObjId,
          userTenantId,
          log,
          resolve,
          reject,
          null,
          incFilesData
        );
        if (companyData.send_sms && (companyData.SubscriptionType == 3 || (companyData.SubscriptionType == 2 && companyData.sent_sms_count <= 50))) {
          let userAadObjIds = allMembersArr.map(x => x.userAadObjId);
          sendSafetyCheckMsgViaSMS(companyData, userAadObjIds, incId, incTitle);
        }
        /*const incCreatedByUserArr = [];
        const incCreatedByUserObj = {
          id: createdByUserInfo.user_id,
          name: createdByUserInfo.user_name
        }
        incCreatedByUserArr.push(incCreatedByUserObj);
 
        let incObj = {
          incId,
          incTitle,
          incType,
          runAt: null,
          incCreatedBy: incCreatedByUserObj,
          startTime
        }
        incGuidance = incGuidance ? incGuidance : "";
 
        const approvalCard = await SafetyCheckCard(incTitle, incObj, companyData, incGuidance, incResponseSelectedUsersList, incTypeId, additionalInfo, travelUpdate, contactInfo, situation);
 
        logTimeInSeconds(startTime, `getSaftyCheckCard end`);
        startTime = (new Date()).getTime();
 
        const appId = process.env.MicrosoftAppId;
        const appPass = process.env.MicrosoftAppPassword;
 
        var credentials = new MicrosoftAppCredentials(appId, appPass);
        var connectorClient = new ConnectorClient(credentials, { baseUri: serviceUrl });
 
        let messageCount = 0;
 
        const dbPool = await db.getPoolPromise(userAadObjId);
        let sqlUpdateMsgDeliveryStatus = "";
        let updateStartTime = null;
 
        const updateMsgDeliveryStatus = (sql) => {
          if (sql != "") {
            sqlUpdateMsgDeliveryStatus = "";
            db.updateDataIntoDBAsync(sql, dbPool, userAadObjId)
              .then((resp) => {
 
              })
              .catch((err) => {
                processSafetyBotError(err, "", "", userAadObjId, sql);
              });
          }
        }
 
        let msgNotSentArr = [], retryCounter = 1, respTime = (new Date()).getTime();
 
        const respTimeInterval = setInterval(() => {
          try {
            const currentTime = (new Date()).getTime();
            if ((currentTime - respTime) / 1000 >= 120) {
              if (msgNotSentArr.length > 0 && retryCounter <= 3) {
                reSendMessage();
              } else if (messageCount == allMembersArr.length) {
                clearInterval(respTimeInterval);
                resolve(true);
              }
            }
          } catch (err) {
            console.log(err);
            processSafetyBotError(err, "", "", userAadObjId);
          }
        }, 120000);
 
        const reSendMessage = () => {
          try {
            messageCount = 0;
            allMembersArr = msgNotSentArr;
            msgNotSentArr = [];
            sendProactiveMessage(allMembersArr);
          } catch (err) {
            console.log(err);
            processSafetyBotError(err, "", "", userAadObjId);
          }
          retryCounter++;
        }
 
        const callbackFn = (msgResp, index) => {
          try {
            respTime = (new Date()).getTime();
            messageCount += 1;
            //console.log({ "end i ": index, messageCount });
 
            let isMessageDelivered = 0;
            if (msgResp?.conversationId != null && msgResp?.activityId != null) {
              isMessageDelivered = 1;
            }
            const status = (msgResp?.status == null) ? null : Number(msgResp?.status);
            const error = (msgResp?.error == null) ? null : msgResp?.error;
            sqlUpdateMsgDeliveryStatus += ` update MSTeamsMemberResponses set is_message_delivered = ${isMessageDelivered}, message_delivery_status = ${status}, message_delivery_error = '${error}' where inc_id = ${incId} and user_id = '${msgResp.userId}'; `;
 
            if (updateStartTime == null) {
              updateStartTime = (new Date()).getTime();
            }
            let updateEndTime = (new Date()).getTime();
            updateEndTime = (updateEndTime - updateStartTime) / 1000;
 
            if (sqlUpdateMsgDeliveryStatus != "" && updateEndTime != null && Number(updateEndTime) >= 1) {
              updateStartTime = null;
              updateMsgDeliveryStatus(sqlUpdateMsgDeliveryStatus);
            }
 
            if (messageCount == allMembersArr.length) {
              if (msgNotSentArr.length > 0 && retryCounter <= 3) {
                reSendMessage();
              } else {
                if (respTimeInterval != null) {
                  try {
                    clearInterval(respTimeInterval);
                  } catch (err) {
                    console.log(err);
                    processSafetyBotError(err, "", "", userAadObjId);
                  }
                }
              }
 
              logTimeInSeconds(startTime, `Sent all message end`);
              logTimeInSeconds(initStartTime, `TotalTime`);
              if (sqlUpdateMsgDeliveryStatus != "") {
                setTimeout(() => {
                  updateMsgDeliveryStatus(sqlUpdateMsgDeliveryStatus);
                }, 500);
              }
              resolve(true);
            }
          } catch (err) {
            processSafetyBotError(err, "", "", userAadObjId);
          }
        }
 
        const sendProactiveMessage = (membersToSendMessageArray) => {
          let delay = 0;
          membersToSendMessageArray.map((member, index) => {
            try {
              let memberArr = [{
                id: member.id,
                name: member.name
              }];
              const conversationId = member.conversationId;
              sendProactiveMessaageToUserAsync(memberArr, activity, null, serviceUrl, userTenantId, log, userAadObjId, conversationId, connectorClient, callbackFn, index, delay, member, msgNotSentArr);
            } catch (err) {
              processSafetyBotError(err, "", "", userAadObjId);
            }
            delay += 500;
          });
        }
        sendProactiveMessage(allMembersArr);*/
      }
    } catch (err) {
      console.log(`sendSafetyCheckMessage error: ${err} `);
      processSafetyBotError(
        err,
        teamId,
        "",
        userAadObjId,
        "error in sendSafetyCheckMessageAsync incId=" +
          incId +
          " createdByUserInfo=" +
          JSON.stringify(createdByUserInfo) +
          " resendSafetyCheck=" +
          resendSafetyCheck
      );
      resolve(false);
    }
  });
};

const sendSafetyCheckMessage = async (
  incId,
  teamId,
  createdByUserInfo,
  log,
  userAadObjId
) => {
  let safetyCheckSend = false;
  log.addLog("sendSafetyCheckMessage start");
  log.addLog(`sendSafetyCheckMessage incId: ${incId} `);
  try {
    const companyData = await getCompanyDataByTeamId(teamId, userAadObjId);
    const incData = await incidentService.getInc(incId, null, userAadObjId);
    let allMembers = await incidentService.getAllTeamMembersByTeamId(
      teamId,
      "id",
      "name",
      userAadObjId
    );
    const { incTitle, selectedMembers, incCreatedBy, incType } = incData;
    const { serviceUrl, userTenantId } = companyData;

    let allMembersArr = allMembers.map(
      (tm) =>
        (tm = {
          ...tm,
          messageDelivered: "na",
          response: "na",
          responseValue: "na",
        })
    );

    if (selectedMembers != null && selectedMembers?.split(",").length > 0) {
      allMembersArr = allMembersArr.filter((m) =>
        selectedMembers?.split(",").includes(m.id)
      );
    }

    log.addLog(`allMembersArr ${JSON.stringify(allMembersArr)} `);

    const incWithAddedMembers = await incidentService.addMembersIntoIncData(
      incId,
      allMembersArr,
      incCreatedBy,
      userAadObjId
    );
    log.addLog(`incType: ${incType} `);
    if (incType == "onetime") {
      log.addLog(`onetime start`);
      const incCreatedByUserArr = [];
      const incCreatedByUserObj = {
        id: createdByUserInfo.user_id,
        name: createdByUserInfo.user_name,
      };
      incCreatedByUserArr.push(incCreatedByUserObj);

      log.addLog("Send Dashboard Resp Start");
      //const dashboardCard = await getOneTimeDashboardCard(incId);
      //const dashboardResponse = await sendProactiveMessaageToUser(incCreatedByUserArr, dashboardCard, null, serviceUrl, userTenantId, log, userAadObjId);
      //await sendIncResponseToSelectedMembers(incId, dashboardCard, null, serviceUrl, userTenantId, log, userAadObjId);
      log.addLog("Send Dashboard Resp End");
      let incObj = {
        incId,
        incTitle,
        incType,
        runAt: null,
        incCreatedBy: incCreatedByUserObj,
      };
      let incGuidance = await incidentService.getIncGuidance(incId);
      incGuidance = incGuidance ? incGuidance : "";

      log.addLog("Send Safety Check Start");
      const approvalCard = await getSaftyCheckCard(
        incTitle,
        incObj,
        companyData,
        incGuidance
      );
      for (let i = 0; i < allMembersArr.length; i++) {
        let member = [
          {
            id: allMembersArr[i].id,
            name: allMembersArr[i].name,
          },
        ];
        const msgResp = await sendProactiveMessaageToUser(
          member,
          approvalCard,
          null,
          serviceUrl,
          userTenantId,
          log,
          userAadObjId
        );
        let isMessageDelivered = 1;
        if (
          msgResp?.conversationId != "null" &&
          msgResp?.conversationId != null &&
          msgResp?.activityId != null
        ) {
          isMessageDelivered = 1;
          // await incidentService.updateMessageDeliveredStatus(incId, allMembersArr[i].id, 1, msgResp);
        } else {
          isMessageDelivered = 0;
          // await incidentService.updateMessageDeliveredStatus(incId, allMembersArr[i].id, 0, msgResp);
        }
        await incidentService.updateMessageDeliveredStatus(
          incId,
          allMembersArr[i].id,
          isMessageDelivered,
          msgResp
        );
      }
      log.addLog("Send Safety Check End");
      log.addLog(`onetime end`);
    } else if (incType == "recurringIncident") {
      log.addLog(`recurringIncident start`);
      const userTimeZone = createdByUserInfo.userTimeZone;
      const actionData = { incident: incData };
      await incidentService.saveRecurrSubEventInc(
        actionData,
        companyData,
        userTimeZone
      );
      log.addLog(`recurringIncident end`);
    }
    safetyCheckSend = true;
  } catch (err) {
    log.addLog(`sendSafetyCheckMessage error: ${err.toString()} `);
    console.log(`sendSafetyCheckMessage error: ${err} `);
    processSafetyBotError(
      err,
      teamId,
      "",
      userAadObjId,
      "error in sendSafetyCheckMessageAsync incId=" +
        incId +
        " createdByUserInfo=" +
        JSON.stringify(createdByUserInfo)
    );
  }
  log.addLog(`sendSafetyCheckMessage end`);
  return Promise.resolve(safetyCheckSend);
};

const sendApproval = async (context) => {
  const action = context.activity.value.action;
  const { incident, companyData, sentApprovalTo } = action.data;
  const {
    incId,
    incTitle,
    selectedMembers,
    incCreatedBy,
    responseSelectedUsers,
  } = incident;
  const serviceUrl = context.activity.serviceUrl;
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

    const activityId = await viewIncResult(
      incId,
      context,
      companyData,
      incident,
      null,
      dashboardCard,
      serviceUrl
    );
    const conversationId = context.activity.conversation.id;

    // send approval msg to all users
    allMembersArr.forEach(async (teamMember) => {
      let incObj = {
        incId,
        incTitle,
        incCreatedBy: incCreatedByUserObj,
        activityId,
        conversationId,
      };
      var guidance = incGuidance ? incGuidance : "";
      const approvalCard = await getSaftyCheckCard(
        incTitle,
        incObj,
        companyData,
        guidance
      );

      await sendCardToIndividualUser(context, teamMember, approvalCard);
    });
    //await sendIncResponseToSelectedMembers(incId, dashboardCard, null, serviceUrl);
  } else if (action.data.incType == "recurringIncident") {
    const userTimeZone = context.activity.entities[0].timezone;
    await incidentService.saveRecurrSubEventInc(
      action.data,
      companyData,
      userTimeZone
    );
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
            text: "This incident is no longer available.",
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
      dashboard.mentionUser(
        mentionedCreatedBy,
        incCreatedBy.id,
        incCreatedBy.name
      );
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
          entities: mentionedCreatedBy,
        },
        type: "AdaptiveCard",
        version: "1.4",
      };
      await context.sendActivity({
        attachments: [CardFactory.adaptiveCard(approvalCardResponse)],
      });
    }
  } catch (err) {
    console.log(err);
  }
};

const sendApprovalResponse = async (user, context) => {
  try {
    const action = context.activity.value.action;
    const { info: response, inc, companyData } = action.data;
    const { incId, incTitle, incCreatedBy } = inc;
    let respDate = new Date();
    if (
      context?.activity?.rawLocalTimestamp != null &&
      context.activity.rawLocalTimestamp.toString().split("+").length > 0
    ) {
      respDate = new Date(
        context.activity.rawLocalTimestamp.toString().split("+")[0]
      );
    }
    const respTimestamp = formatedDate("yyyy-MM-dd hh:mm:ss", respDate);
    const runAt = inc.runAt != null ? inc.runAt : null;
    if (response === "i_am_safe") {
      incidentService.updateIncResponseData(
        incId,
        user.id,
        1,
        inc,
        respTimestamp
      );
    } else {
      incidentService.updateIncResponseData(
        incId,
        user.id,
        0,
        inc,
        respTimestamp
      );
      const approvalCardResponse = {
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
        appId: process.env.MicrosoftAppId,
        body: [
          {
            type: "TextBlock",
            text: `User <at>${user.name}</at> needs assistance for Incident: **${incTitle}** `,
            wrap: true,
          },
        ],
        msteams: {
          entities: [
            {
              type: "mention",
              text: `<at>${user.name}</at>`,
              mentioned: {
                id: user.id,
                name: user.name,
              },
            },
          ],
        },
        type: "AdaptiveCard",
        version: "1.4",
      };
      //send new msg just to emulate msg is being updated
      //await sendDirectMessageCard(context, incCreatedBy, approvalCardResponse);
      const serviceUrl = context?.activity?.serviceUrl;
      await sendApprovalResponseToSelectedMembers(
        incId,
        context,
        approvalCardResponse
      );
      await sendApprovalResponseToSelectedTeams(
        incId,
        serviceUrl,
        approvalCardResponse,
        user.aadObjectId
      );
      sendAcknowledmentinSMS(companyData, [user.aadObjectId], response === "i_am_safe" ? "I am safe" : "I need assistance");
    }

    //const dashboardCard = await getOneTimeDashboardCard(incId, runAt);
    //const serviceUrl = context.activity.serviceUrl;
    //const activityId = await viewIncResult(incId, context, companyData, inc, runAt, dashboardCard, serviceUrl);
    //await updateIncResponseOfSelectedMembers(incId, runAt, dashboardCard, serviceUrl);
  } catch (error) {
    console.log(error);
    processSafetyBotError(
      error,
      "",
      "",
      user.aadObjectId,
      "sendApprovalResponse"
    );
  }
};

const sendAcknowledmentinSMS = async (companyData, users, text) => {
  let tenantId = companyData.userTenantId;
  let refresh_token = companyData.refresh_token;
  let usrPhones = await getUserPhone(refresh_token, tenantId, users);
  let counter = 0;
  for (let user of usrPhones) {
    try {
      if ((user.businessPhones.length > 0 && user.businessPhones[0] != "") || user.mobilePhone != "") {
        let phone = user.businessPhones.length > 0 && user.businessPhones[0] != "" ?
          user.businessPhones[0] : user.mobilePhone;

        let body =
          `Your safety status has been recorded as ${text} and ${companyData.teamName} teams has been notified`;
        await tClient.messages
          .create({
            body: body,
            from: "+18023277232",
            shortenUrls: true,
            messagingServiceSid: "MGdf47b6f3eb771ed026921c6e71017771",
            to: phone,
          });
        counter++;
      }
      if (companyData.SubscriptionType == 2) {
        incidentService.updateSentSMSCount(companyData.teamId, counter);
      }
    } catch (err) {
      processSafetyBotError(err, companyData.teamId, user.id, null, "error in sending acknowledgement via SMS");
    }
  }
}

const submitComment = async (context, user, companyData) => {
  try {
    const action = context.activity.value.action;
    const {
      userId,
      incId,
      incTitle,
      incCreatedBy,
      eventResponse,
      commentVal,
      inc,
    } = action.data;

    if (commentVal) {
      const approvalCardResponse = {
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
        appId: process.env.MicrosoftAppId,
        body: [
          {
            type: "TextBlock",
            text: `User <at>${user.name}</at> has commented for incident **${incTitle}**: \n${commentVal} `,
            wrap: true,
          },
        ],
        msteams: {
          entities: [
            {
              type: "mention",
              text: `<at>${user.name}</at>`,
              mentioned: {
                id: user.id,
                name: user.name,
              },
            },
          ],
        },
        type: "AdaptiveCard",
        version: "1.4",
      };
      //send new msg just to emulate msg is being updated
      //await sendDirectMessageCard(context, incCreatedBy, approvalCardResponse);
      const serviceUrl = context?.activity?.serviceUrl;
      await sendCommentToSelectedMembers(incId, context, approvalCardResponse);
      await incidentService.updateIncResponseComment(
        incId,
        userId,
        commentVal,
        inc
      );
      await sendApprovalResponseToSelectedTeams(
        incId,
        serviceUrl,
        approvalCardResponse,
        user.aadObjectId
      );
    }
  } catch (error) {
    console.log(error);
    processSafetyBotError(
      error,
      "",
      user.name,
      user.aadObjectId,
      "error in submitComment context=" +
        JSON.stringify(context) +
        " companyData=" +
        JSON.stringify(companyData)
    );
  }
};

const Question1safetyVisitor = async (
  context,
  user,

  questionNumber
) => {
  try {
    const action = context.activity.value.action;
    const {
      userId,
      incId,
      incTitle,
      incCreatedBy,
      eventResponse,
      commentVal,
      inc,
      info,
      safetyVisitorQuestion1,
      safetyVisitorQuestion2,
      safetyVisitorQuestion3,
      EnableSafetycheckForVisitors,
      info: response,
    } = action.data;
    let dataToBeUpdated = "";
    let loggerName = "";
    if (questionNumber === 1) {
      dataToBeUpdated = info == "question1_yes" ? 1 : 0;
      loggerName = "Visittor Safety Question 1";
    }
    if (questionNumber === 2) {
      dataToBeUpdated = info == "question2_yes" ? 1 : 0;
      loggerName = "Visittor Safety Question 2";
      if (response == "question2_yes") {
        const approvalCardResponse = {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          appId: process.env.MicrosoftAppId,
          body: [
            {
              type: "TextBlock",
              text: `<at>${user.name}</at> has visitors who are **safe** `,
              wrap: true,
            },
          ],
          msteams: {
            entities: [
              {
                type: "mention",
                text: `<at>${user.name}</at>`,
                mentioned: {
                  id: user.id,
                  name: user.name,
                },
              },
            ],
          },
          type: "AdaptiveCard",
          version: "1.4",
        };

        //send new msg just to emulate msg is being updated
        //await sendDirectMessageCard(context, incCreatedBy, approvalCardResponse);
        const serviceUrl = context?.activity?.serviceUrl;
        await sendCommentToSelectedMembers(
          incId,
          context,
          approvalCardResponse
        );
        await sendApprovalResponseToSelectedTeams(
          incId,
          serviceUrl,
          approvalCardResponse,
          user.aadObjectId
        );
      }
    }
    if (questionNumber === 3) {
      dataToBeUpdated = commentVal;
      loggerName = "Visittor Safety Question 3";
    }

    await incidentService.safteyvisiterresponseupdate(
      incId,
      userId,
      commentVal,
      inc,
      questionNumber,
      dataToBeUpdated
    );

    if (questionNumber === 3 && commentVal) {
      const approvalCardResponse = {
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
        appId: process.env.MicrosoftAppId,
        body: [
          {
            type: "TextBlock",
            text: `<at>${user.name}</at> has visitors who **need assistance**  \n\n${commentVal} `,
            wrap: true,
          },
        ],
        msteams: {
          entities: [
            {
              type: "mention",
              text: `<at>${user.name}</at>`,
              mentioned: {
                id: user.id,
                name: user.name,
              },
            },
          ],
        },
        type: "AdaptiveCard",
        version: "1.4",
      };

      //send new msg just to emulate msg is being updated
      //await sendDirectMessageCard(context, incCreatedBy, approvalCardResponse);
      const serviceUrl = context?.activity?.serviceUrl;
      await sendCommentToSelectedMembers(incId, context, approvalCardResponse);
      await incidentService.updateIncResponseComment(
        incId,
        userId,
        commentVal,
        inc
      );

      await sendApprovalResponseToSelectedTeams(
        incId,
        serviceUrl,
        approvalCardResponse,
        user.aadObjectId
      );
    }
  } catch (error) {
    console.log(error);
    processSafetyBotError(
      error,
      "",
      user.name,
      user.aadObjectId,
      "error in Question1safetyVisitor loggerName=" +
        loggerName +
        " context=" +
        JSON.stringify(context) +
        " questionNumber=" +
        questionNumber
    );
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

const sendNewContactEmail = async (
  emailVal,
  feedbackVal,
  companyData,
  userName = ""
) => {
  try {
    const feedbackDataObj = {
      userId: companyData.userId,
      teamId: companyData.teamId,
      userEmail: emailVal,
      feedbackContent: feedbackVal,
    };

    await addFeedbackData(feedbackDataObj);

    const emailBody =
      "Hi,<br/> <br />" +
      "Below user has provided feedback for AreYouSafe app installed in Microsoft Teams : " +
      "<br />" +
      `${
        userName !== "" ? "<b>User Name</b>: " + userName + " <br />" : " "
      } ` +
      "<b>Email: </b>" +
      emailVal +
      "<br />" +
      "<b>Feedback: </b>" +
      feedbackVal +
      "<br />" +
      "<br /><br />" +
      "Thank you, <br />" +
      "AreYouSafe Support";

    const subject = "AreYouSafe Teams Bot | Feedback";

    await sendEmail(emailVal, subject, emailBody);
  } catch (err) {
    console.log(err);
    processSafetyBotError(
      err,
      "",
      userName,
      "",
      "error in sendNewContactEmail emailVal=" + emailVal
    );
  }
};

const submitContactUsForm = async (context, companyData) => {
  try {
    const { emailVal, feedbackVal } = context.activity.value.action.data;

    if (emailVal && feedbackVal) {
      // save feedback data into DB
      // then send the response

      await sendNewContactEmail(emailVal, feedbackVal, companyData);
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


const sendProactiveMessaageToUserTest = async () => {
  try {
    const appId = "f1739c01-2e62-404b-80d4-72f79582ba0f";
    const appPass = "ZrR7Q~hC7ng9ex3u7cuuFMMaBxxVjtaYJfi3h";
    const botName = "Are You Safe?";

    let serviceUrl = "https://smba.trafficmanager.net/amer/";
    let tenantId = "66d2bcc3-ec97-41a8-b764-803d784b248f";

    let members = [
      {
        id: "29:1jjP5OtI7Mig9aNRxH0ZpD64Jj3VW7Yb3CFS1P1i02eIFg8l4xlQkpdEQPV8RCNcXYgTo-ddHK2rxmy4x2UlxAw",
        name: "IW User 03",
      },
    ];

    const incCreatedByUserObj = {
      id: "29:1Rnu8OsmSpGVxsEyWIVtQlC4Q73YTwB4MgYPr_h_pR-3QxBEFrdD3jG-DFgWOR3InT4ApIOStPNcayMDPEE06rA",
      name: "Global + Billing Admin 01",
    };

    let incObj = {
      incId: 100786,
      incTitle: "Recurring",
      incType: "recurringIncident",
      runAt: "2022-11-03T06:05:00.000Z",
      incCreatedBy: incCreatedByUserObj,
      conversationId: null,
      activityId: null,
    };
    let companyData = await incidentService.getCompanyData(
      "19:GbxQTzrKLXdE1rQ2G_IP7TuyLhKe0SdRKWTsDh5A1R81@thread.tacv2"
    );
    var incGuidance = await incidentService.getIncGuidance(incObj.incId);
    incGuidance = incGuidance ? incGuidance : "";
    const msgAttachment = await getSaftyCheckCard(
      incObj.incTitle,
      incObj,
      companyData,
      incGuidance
    );

    const conversationParameters = {
      isGroup: false,
      channelData: {
        tenant: {
          id: tenantId,
        },
      },
      bot: {
        id: appId,
        name: botName,
      },
      members: members,
    };

    let activity = null;
    if (msgAttachment != null) {
      activity = MessageFactory.attachment(
        CardFactory.adaptiveCard(msgAttachment)
      );
    }

    if (activity != null) {
      var credentials = new MicrosoftAppCredentials(appId, appPass);
      var connectorClient = new ConnectorClient(credentials, {
        baseUri: serviceUrl,
      });

      let conversationResp =
        await connectorClient.conversations.createConversation(
          conversationParameters
        );
      let activityResp = await connectorClient.conversations.sendToConversation(
        conversationResp.id,
        activity
      );
    }
  } catch (err) {
    console.log(err);
  }
  return Promise.resolve(resp);
};

const sendProactiveMessaageToChannel = async () => {
  try {
    const appId = "b7710cbf-d5f0-4046-a207-7375df3de460";
    const appPass = "KKb7Q~yDbZnyXuu.R3oCs3xwQcZE0Pb~-NgnW";
    const botName = "Are You Safe?";

    let serviceUrl = "https://smba.trafficmanager.net/amer/";

    const msgAttachment = {
      $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
      appId: appId,
      body: [
        {
          type: "TextBlock",
          size: "Large",
          weight: "Bolder",
          text: "Sending message in teams channel..",
        },
      ],
      type: "AdaptiveCard",
      version: "1.4",
    };
    let activity = null;
    if (msgAttachment != null) {
      activity = MessageFactory.attachment(
        CardFactory.adaptiveCard(msgAttachment)
      );
    }
    const conversationParameters = {
      bot: {
        id: appId,
        name: botName,
      },
      isGroup: true,
      conversationType: "channel",
      channelData: {
        channel: {
          id: "19:-hsC9OMcGeta4Ke-bYtIVS4HFxNJZ8D8fYK50KZi7q01@thread.tacv2",
        },
      },
      activity: {
        type: "message",
        attachments: [CardFactory.adaptiveCard(msgAttachment)],
      },
    };

    if (activity != null) {
      var credentials = new MicrosoftAppCredentials(appId, appPass);
      var connectorClient = new ConnectorClient(credentials, {
        baseUri: serviceUrl,
      });

      let conversationResp =
        await connectorClient.conversations.createConversation(
          conversationParameters
        );
      //let activityResp = await connectorClient.conversations.sendToConversation(conversationResp.id, activity);
    }
  } catch (err) {
    console.log(err);
  }
  return Promise.resolve(resp);
};

const sendRecurrEventMsgAsync = async (
  incCreatedByUserObj,
  serviceUrl,
  userTenantId,
  subEventObj,
  incId,
  incTitle,
  log
) => {
  let incGuidance = await incidentService.getIncGuidance(incId);
  incGuidance = incGuidance ? incGuidance : "";
  let incObj = {
    incId,
    incTitle,
    incType: subEventObj.incType,
    runAt: subEventObj.runAt,
    incCreatedBy: incCreatedByUserObj,
    incGuidance,
    incResponseSelectedUsersList: null,
  };
  return new Promise((resolve, reject) => {
    sendProactiveMessageAsync(
      subEventObj.eventMembers,
      subEventObj,
      incObj,
      subEventObj.companyData,
      serviceUrl,
      "",
      userTenantId,
      log,
      resolve,
      reject,
      subEventObj.runAt,
      subEventObj.filesData
    );
  });
};

const sendRecurrEventMsg = async (subEventObj, incId, incTitle, log) => {
  // let successflag = true;
  try {
    if (subEventObj.incType == "recurringIncident") {
      if (subEventObj.eventMembers.length == 0) {
        return;
      }
      const serviceUrl = subEventObj.companyData.serviceUrl;
      const userTenantId = subEventObj.companyData.userTenantId;
      const incCreatedByUserObj = {
        id: subEventObj.createdById,
        name: subEventObj.createdByName,
      };
      const incCreatedByUserArr = [incCreatedByUserObj];
      await sendRecurrEventMsgAsync(
        incCreatedByUserObj,
        serviceUrl,
        userTenantId,
        subEventObj,
        incId,
        incTitle,
        log
      );
      const recurrCompletedCard = {
        type: "AdaptiveCard",
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
        version: "1.5",
        body: [
          {
            type: "TextBlock",
            text: "Incident Message:",
            wrap: true,
            weight: "Bolder",
          },
          {
            type: "TextBlock",
            text: `Your safety check message for **${incTitle}** has been sent to all the users`,
            wrap: true,
          },
        ],
      };

      await sendProactiveMessaageToUser(
        incCreatedByUserArr,
        recurrCompletedCard,
        null,
        serviceUrl,
        userTenantId,
        log,
        subEventObj.createdById
      );
      /*
      const incCreatedByUserArr = [];
      const incCreatedByUserObj = {
        id: subEventObj.createdById,
        name: subEventObj.createdByName
      }
      incCreatedByUserArr.push(incCreatedByUserObj);

      const serviceUrl = subEventObj.companyData.serviceUrl;
      const userTenantId = subEventObj.companyData.userTenantId;

      let incObj = {
        incId,
        incTitle,
        incType: subEventObj.incType,
        runAt: subEventObj.runAt,
        incCreatedBy: incCreatedByUserObj
      }
      var incGuidance = await incidentService.getIncGuidance(incId);
      incGuidance = incGuidance ? incGuidance : "";
      const approvalCard = await getSaftyCheckCard(incTitle, incObj, subEventObj.companyData, incGuidance);

      for (let i = 0; i < subEventObj.eventMembers.length; i++) {
        let member = [{
          id: subEventObj.eventMembers[i].user_id,
          name: subEventObj.eventMembers[i].user_name
        }];
        const msgResp = await sendProactiveMessaageToUser(member, approvalCard, null, serviceUrl, userTenantId, log, subEventObj.createdById);

        const conversationId = (msgResp?.conversationId == null) ? null : Number(msgResp?.conversationId);
        const activityId = (msgResp?.activityId == null) ? null : Number(msgResp?.activityId);
        const status = (msgResp?.status == null) ? null : Number(msgResp?.status);
        const error = (msgResp?.error == null) ? null : msgResp?.error;
        const isDelivered = (activityId != null) ? 1 : 0;
        const respDetailsObj = {
          memberResponsesId: subEventObj.eventMembers[i].id,
          runAt: subEventObj.runAt,
          status,
          error,
          isDelivered
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

      sendProactiveMessaageToUser(incCreatedByUserArr, recurrCompletedCard, null, serviceUrl, userTenantId, log, subEventObj.createdById);
      // successflag = true;
      */
    }
  } catch (err) {
    //successflag = false;
    console.log(err);
    processSafetyBotError(
      err,
      "",
      "",
      "",
      "error in sendRecurrEventMsg subEventObj=" +
        JSON.stringify(subEventObj) +
        " incId=" +
        incId +
        " incTitle=" +
        incTitle +
        " log=" +
        log
    );
  }
  // return successflag;
};

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
        text: "1. Navigate to MS Teams App store\r2. Search AreYouSafe? and click on the AreYouSafe? bot card\r3. Click on the top arrow button and select the **“Add to a team“** option",
        wrap: true,
      },
      {
        type: "TextBlock",
        text: "If you need any help or want to share feedback, feel free to reach out to my makers at [help@areyousafe.in](mailto:help@areyousafe.in)",
        wrap: true,
      },
      {
        type: "Image",
        //convert image to base 64 using url: https://www.base64encoder.io/image-to-base64-converter/
        url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAABGEAAANxCAYAAABE4aQnAAAgAElEQVR4Aey9iXsc1bXuff+F77v3u4EEcsIUhgBJOJxzgIRAEgIJkECAMHtiMHgOGZmTEKaQhDDYEDCYMcHYlmRjW5Y8W5Ily5bBeJ7wPGqWbM2S1/e81V7tpa2q7mqp1epWv/U8raqu2sPav72ruvartff+X8KNBEiABEiABEiABEiABEiABEiABEiABEig3wn8r37PgRmQAAmQAAmQAAmQAAmQAAmQAAmQAAmQAAkIRRg2AhIgARIgARIgARIgARIgARIgARIgARJIAQGKMCmAzCxIgARIgARIgARIgARIgARIgARIgARIgCIM2wAJkAAJkAAJkAAJkAAJkAAJkAAJkAAJpIAARZgUQGYWJEACJEACJEACJEACJEACJEACJEACJEARhm2ABEiABEiABEiABEiABEiABEiABEiABFJAgCJMCiAzCxIgARIgARIgARIgARIgARIgARIgARKgCMM2QAIkQAIkQAIkQAIkQAIkQAIkQAIkQAIpIEARJgWQmQUJkAAJkAAJkAAJkAAJkAAJkAAJkAAJUIRhGyABEiABEiABEiABEiABEiABEiABEiCBFBCgCJMCyMyCBEiABEiABEiABEiABEiABEiABEiABCjCsA2QAAmQAAmQAAmQAAmQAAmQAAmQAAmQQAoIUIRJAWRmQQIkQAIkQAIkQAIkQAIkQAIkQAIkQAIUYdgGSIAESIAESIAESIAESIAESIAESIAESCAFBCjCpAAysyABEiABEiABEiABEiABEiABEiABEiABijBsAyRAAiRAAiRAAiRAAiRAAiRAAiRAAiSQAgIUYVIAmVmQAAmQAAmQAAmQAAmQAAmQAAmQAAmQAEUYtgESIAESIAESIAESIAESIAESIAESIAESSAEBijApgMwsSIAESIAESIAESIAESIAESIAESIAESIAiDNsACZAACZAACZAACZAACZAACZAACZAACaSAAEWYFEBmFiRAAiRAAiRAAiRAAiRAAiRAAiRAAiRAEYZtgARIgARIgARIgARIgARIgARIgARIgARSQIAiTAogMwsSIAESIAESIAESIAESIAESIAESIAESoAjDNkACJEACJEACJEACJEACJEACJEACJEACKSBAESYFkJkFCZAACZAACZAACZAACZAA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zbvHE08gorjCStjviIu5Zn4w7zey/2i1dB3rSp6hTIkESIAESIAESIAESIAESIAESIAESKBPBCjC9AlfciJjwtzig+vkv2aPiS5hnYgYo2Gx/PWjZZOlsa1Jjh07lhzjmAoJkAAJkAAJkAAJkAAJkAAJkAAJkEBSCFCESQrG5CSy92il/GrF63JWzjA56/hy1SqwuN4wZ+SemJT367kjPAFnZeVmae/i/C/JqQ2mQgIkQAIkQAIkQAIkQAIkQAIkQALJJUARJrk8+5xaa2e7LNy3Wr4ze7w3T4w7VwxEGf18PXe4nD59iPxlzVQ50tZM75c+02cCJEACJEACJEACJEACJEACJEACJNB/BCjC9B/bPqVc33ZU3t1aKBfPHiOn5wzx5onxvGJyIisfnTZjiPy+YrLsO1pF8aVPpBmZBEiABEiABEiABEiABEiABEiABFJDgCJMajj3Opemjhb5YNtCuXz2BE+MOWPaEHly9buy50hlr9NkRBIgARIgARIgARIgARIgARIgARIggdQToAiTeubMkQRIgARIgARIgARIgARIgARIgARIIAsJUITJwkpnkUmABEiABEiABEiABEiABEiABEiABFJPgCJM6pkzRxIgARIgARIgARIgARIgARIgARIggSwkQBEmCyudRSYBEiABEiABEiABEiABEiABEiABEkg9AYowqWfOHEmABEiABEiABEiABEiABEiABEiABLKQAEWYLKx0FpkESIAESIAESIAESIAESIAESIAESCD1BCjCpJ45cyQBEiABEiABEiABEiABEiABEiABEshCAhRhsrDSWWQSIAESIAESIAESIAESIAESIAESIIHUE6AIk3rmzJEESIAESIAESIAESIAESIAESIAESCALCVCEycJKZ5FJgARIgARIgARIgARIgARIgARIgARST4AiTOqZM0cSIAESIAESIAESIAESIAESIAESIIEsJEARJgsrnUUmARIgARIgARIgARIgARIgARIgARJIPQGKMKlnzhxJgARIgARIgARIgARIgARIgARIgASykABFmCysdBaZBEiABEiABEiABEiABEiABEiABEgg9QQowqSeOXMkARIgARIgARIgARIgARIgARIgARLIQgIUYbKw0llkEiABEiABEiABEiABEiABEiABEiCB1BOgCJN65syRBEiABEiABEiABEiABEiABEiABEggCwlQhMnCSmeRSYAESIAESIAESIAESIAESIAESIAEUk+AIkzqmTNHEiABEiABEiABEiABEiABEiABEiCBLCRAESYLK51FJgESIAESIAESIAESIAESIAESIAESSD2B0CJMzSlnCj9kwDbANsA2EK4NpP5xzhxJgARIgARIgARIgARIgATSnQBFGIpLFNfYBtgG+qENpPvDn/aRAAmQAAmQAAmQAAmQAAmkngBFmH7ofNFTIJynADmR02BuA6l/nDNHEiABEiABEiABEiABEiCBdCfQKxEm3QtF+0iABEhgIAhYUWkgt/BwUgAAIABJREFU8meeJEACJEACJEACJEACJEAC6U2AIkx61w+tIwESyCACFGEyqLJoKgmQAAmQAAmQAAmQAAkMAAGKMAMAnVmSAAkMTgIUYQZnvbJUJEACJEACJEACJEACJJAsAhRhkkWS6ZAACWQ9AYowWd8ECIAESIAESIAESIAESIAEYhKgCBMTDy+SAAmQQHgCFGHCs2JIEiABEiABEiABEiABEshGAhRhsrHWWWYSIIF+IUARpl+wMlESIAESIAESIAESIAESGDQEKMIMmqpkQUiABAaaAEWYga4B5k8CJEACJEACJEACJEAC6U2AIkx61w+tIwESyCACFGEyqLJoKgmQAAmQAAmQAAmQAAkMAAGKMAMAnVmSAAkMTgIUYQZnvbJUJEACJEACJEACJEACJJAsAhRhkkWS6ZAACWQ9AYowWd8ECIAESIAESIAESIAESIAEYhKgCBMTDy+SAAmQQHgCFGHCs2JIEiABEiABEiABEiABEshGAhRhsrHWWWYSIIF+IUARpl+wMlESIAESIAESIAESIAESGDQEKMIMmqpkQUiABAaaAEWYga4B5k8CJEACJEACJEACJEAC6U2AIkx61w+tIwESyCACFGEyqLJoKgmQAAmQAAmQAAmQAAkMAIGMEGGOHTsm/JAB20Dmt4EBeMalNEuKMCnFzcxIgARIgARIgARIgARIIOMIpKUI49fZ7urqEn7IgG0gM9uA3z2dzud6+ySnCNNbcoxHAiRAAiRAAiRAAiRAAtlBIO1EGO2YaWe7s7NT9NPR0SH8kAHbQOa1Ab2HcV/j2N3r9VTXrearNsEufQZhn+hGESZRYgxPAiRAAiRAAiRAAiRAAtlFIK1EGO38aAdtadEh+cNT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BEqgBErgugh0E+a6xrPZlEAJPCGBbsI8Ify6LoESKIESKIESKIESKIELINBNmAsYpIZYAiVwGQS6CXMZ49QoS6AESqAESqAESqAESuCpCNxpE8YfNHr87TdlUAadA50DOQee6qZevyVQAiVQAiVQAiVQAiVQAudLoJsw/0ofHvPhseedE50D958D53vbb2QlUAIlUAIlUAIlUAIlUAJPRaCbMN2E6Sd5Ogc6Bx5gDjzVTb1+S6AESqAESqAESqAESqAEzpfA7k2Y802hkZVACZRACZRACZRACZRACZRACZRACZTA+RPoJsz5j1EjLIESKIESKIESKIESKIESKIESKIESuAIC3YS5gkFsCiVQAiVQAiVQAiVQAiVQAiVQAiVQAudPoJsw5z9GjbAESqAESqAESqAESqAESqAESqAESuAKCHQT5goGsSmUQAmUQAmUQAmUQAmUQAmUQAmUQAmcP4Fuwpz/GDXCEiiBEiiBEiiBEiiBEiiBEiiBEiiBKyBwNZswb731lZvv+PZvu329++67VzA0TaEESqAESqAESqAESqAESqAESqAESuCaCFzEJoxvsGijZdpkcZmp/5oGrbmUQAmUQAmUQAmUQAmUQAmUQAmUQAlcHoGz34T5+OOPb77v859/8SkXbcL88Be/+AnS57IJozg+8+lP3bz//vufiLENJVACJVACJVACJVACJVACJVACJVACz5fA2W/CaDNDmxp81Uj1d736ys1HH3300qidwyaMNocUXzdhXhqanpRACZTAsybg72N6r3rsovdLvW/2U6KPTf66/WnNo/8k03+WPXZhTj/F9fTYudZfCVw7Ab03PcSz0zH3iad+nz5mjC8p1mPyem6yZ78Jw+aKFpBfeuONF5sxuZhETpsg2fdYg9pNmMciXT8lUAKPQUALmNdff+32k31603/1lVfGT/nxicWHWETpvrqyi1/JPEThnu7/CXDsQx+LpWPflyTvfvM/HxSbYoHBVlwsRI+N4VRMFetTPayfKofa+SSBHFfNwZynn9Q6TQtzemve39XTsbbveo3fNb7qXS+BY+feOZPgvUn3iUNF702r9/lDulv9e3le0jV8SbFujU37bm7OehOGC1gLUS3gvvbee7cXqc7zotYbMQtWXczq53x1YbsMsr5IZaKnv2z3c+yoXvntxCuBEiiBSyCgBcyeTRjdA7VB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",
      },
    ],
  };
  await sendDirectMessageCard(context, from, cards);
};

const navigateDashboardList = async (context, action, verb) => {
  try {
    const dashboardData = action.data;
    const companyData = dashboardData.companyData;
    const allTeamMembers = await getAllTeamMembers(context, companyData.teamId);
    const dashboardCard = await dashboard.getIncidentTileDashboardCard(
      dashboardData,
      companyData,
      allTeamMembers
    );

    const cards = CardFactory.adaptiveCard(dashboardCard);
    const message = MessageFactory.attachment(cards);
    message.id = context.activity.replyToId;
    await context.updateActivity(message);

    // const activity = MessageFactory.attachment(cards);
    // activity.id = context.activity.replyToId;
    // const serviceUrl = context?.activity?.serviceUrl;
    // await updateMessage(context.activity.replyToId, activity, context.activity.conversation.id, serviceUrl);
    // return dashboardCard;
    return true;
  } catch (err) {
    console.log(err);
  }
};

const addUserInfoByTeamId = async (context) => {
  try {
    const teamId = context.activity.value.action.data.teamId;
    if (teamId != null) {
      const allMembers = await getAllTeamMembers(context, teamId);
      if (allMembers != null) {
        await addTeamMember(teamId, allMembers);
      }
    }
  } catch (err) {
    console.log(err);
    processSafetyBotError(
      err,
      "",
      "",
      "",
      "error in addUserInfoByTeamId context=" + JSON.stringify(context)
    );
  }
};

const addteamsusers = async (context) => {
  const log = new AYSLog();
  try {
    log.addLog(`addteamsusers Start`);
    const allCompanyData = await incidentService.getAllCompanyData();
    let sqlUpdateIsUserInfoSavedFlag = "";
    if (allCompanyData != null && allCompanyData.length > 0) {
      await Promise.all(
        allCompanyData.map(async (cmpData, index) => {
          const { id, team_id: teamid, serviceUrl } = cmpData;
          try {
            log.addLog(`Inside loop start teamid: ${JSON.stringify(teamid)} `);

            const allTeamMembers = await getAllTeamMembersByConnectorClient(
              teamid,
              serviceUrl
            );
            if (allTeamMembers != null && allTeamMembers.length > 0) {
              const isUserInfoSaved = await addTeamMember(
                teamid,
                allTeamMembers
              );
              if (isUserInfoSaved) {
                sqlUpdateIsUserInfoSavedFlag += ` update MSTeamsInstallationDetails set isUserInfoSaved = 1 where id = ${id}; `;
              }
              log.addLog(`isUserInfoSaved: ${isUserInfoSaved} `);
            }
          } catch (err) {
            log.addLog(
              `addteamsusers Error inside loop error details: ${JSON.stringify(
                err
              )} `
            );
            processSafetyBotError(
              err,
              teamid,
              "",
              "",
              "error in addteamsusers ->  getAllTeamMembersByConnectorClient -> cmpData=" +
                JSON.stringify(cmpData)
            );
          } finally {
            log.addLog(`Inside loop start teamid: ${JSON.stringify(teamid)} `);
          }
        })
      );
      if (sqlUpdateIsUserInfoSavedFlag != "") {
        await incidentService.updateDataIntoDB(sqlUpdateIsUserInfoSavedFlag);
      }
    }
  } catch (err) {
    log.addLog(`addteamsusers Error ${JSON.stringify(err)} `);
    console.log(err);
    processSafetyBotError(
      err,
      "",
      "",
      "",
      "error in addteamsusers context=" + JSON.stringify(context)
    );
  } finally {
    log.addLog(`addteamsusers End`);
    await log.saveLog();
  }
};

const sendNSRespToTeamChannel = async (
  userTeamId,
  adaptiveCard,
  userAadObjId
) => {
  try {
    const sqlWhere = ` where a.tenantId = '${userTeamId}' `;
    const channelData = await incidentService.getNAReapSelectedTeams(
      "",
      userAadObjId,
      sqlWhere
    );
    if (channelData && channelData.length > 0) {
      await Promise.all(
        channelData.map(async (data) => {
          const channelId = data.channelId;
          const serviceUrl = data.serviceUrl;
          await sendProactiveMessaageToSelectedChannel(
            adaptiveCard,
            channelId,
            serviceUrl,
            userAadObjId
          );
        })
      );
    }
  } catch (err) {
    console.log(err);
    processSafetyBotError(
      err,
      userTeamId,
      "",
      userAadObjId,
      "error in sendNSRespToTeamChannel adaptiveCard=" +
        JSON.stringify(adaptiveCard)
    );
  }
};

const createTestIncident = async (
  context,
  incCreatedBy,
  incCreatedByName,
  teamsMembers,
  teamId,
  userAadObjId,
  from,
  companyData
) => {
  const memberChoises = [];
  let selectedMembers = "";
  teamsMembers.forEach((usr) => {
    memberChoises.push({ value: usr.id, title: usr.name });
    selectedMembers += selectedMembers != "" ? "," + usr.id : usr.id;
  });
  try {
    const incData = {
      incTitle: "Sample Drill", //Test - Safety Check - Test
      incType: "onetime",
      channelId: teamId,
      teamId,
      selectedMembers,
      incCreatedBy,
      createdDate: new Date(Date.now()).toISOString(),
      occursEvery: "",
      startDate: "",
      startTime: "",
      endDate: "",
      endTime: "",
      incCreatedByName,
      guidance: "",
      incStatusId: 1,
      incTypeId: 1,
      additionalInfo: "",
      travelUpdate: "",
      contactInfo: "",
      situation: "",
      isTestRecord: true,
      isSavedAsDraft: false,
      isSaveAsTemplate: false,
      updatedOn: "",
      template_name: "",
      EnableSendReminders: false,
      SendRemindersCount: 3,
      SendRemindersTime: 5,
    };
    const newInc = await incidentService.createNewInc(
      incData,
      incCreatedBy,
      memberChoises,
      userAadObjId,
      null,
      null
    );
    return newInc;
    // if (newInc && newInc.incId) {
    //   const safetyCheckMessageText = `This is a **${incData.incTitle}** from <at>${incCreatedByName}</at>. Please click any of the buttons below to help them test the bot.`;
    //   const previewCard = await getSafetyCheckTypeCard(newInc.incTitle, newInc, null, null, null, 1, safetyCheckMessageText, incCreatedBy, incCreatedByName, true);
    //   if (previewCard != null) {
    //     previewCard.body[0] = {
    //       type: "TextBlock",
    //       wrap: true,
    //       text: `Let's get started by sending a **${incData.incTitle}** message to your team members. Here is the preview:`
    //     }

    //     const continuePreText = {
    //       type: "TextBlock",
    //       wrap: true,
    //       separator: true,
    //       text: `Click on **Continue** to send this message to everyone.`
    //     }

    //     const continueBtnActionSet = {
    //       "type": "ActionSet",
    //       "actions": [
    //         {
    //           "type": "Action.Execute",
    //           "title": "Continue",
    //           "verb": "triggerTestSafetyCheckMessage",
    //           "data": {
    //             inc: newInc,
    //             companyData: companyData
    //           }
    //         }
    //       ]
    //     }
    //     previewCard.body.push(continuePreText);
    //     previewCard.body.push(continueBtnActionSet);
    //     await sendDirectMessageCard(context, from, previewCard);
    //   }
    // }
  } catch (err) {
    console.log(err);
    processSafetyBotError(
      err,
      teamId,
      "",
      userAadObjId,
      "error in createTestIncident teamsMembers=" + JSON.stringify(teamsMembers)
    );
  }
};

const triggerTestSafetyCheckMessage = async (context, action, userAadObjId) => {
  try {
    await context.sendActivities([{ type: "typing" }]);
    const companyData = action.data.companyData;
    if (!companyData) {
      return;
    }
    const teamId = companyData.teamId;
    const allMembersInfo = await getAllTeamMembers(context, teamId);
    if (!allMembersInfo || allMembersInfo.length == 0) {
      return [];
    }
    const adminUserInfo = allMembersInfo.find(
      (m) => m.id === context.activity.from.id
    );
    if (!adminUserInfo) {
      return;
    }
    const incData = await createTestIncident(
      context,
      adminUserInfo.id,
      adminUserInfo.name,
      allMembersInfo,
      teamId,
      userAadObjId,
      context.activity.from,
      companyData
    );
    if (incData) {
      const log = new AYSLog();
      const { incId, incCreatedBy, incCreatedByName } = incData;

      const createdByUserInfo = {
        user_id: incCreatedBy,
        user_name: incCreatedByName,
      };
      await sendSafetyCheckMessageAsync(
        incId,
        teamId,
        createdByUserInfo,
        log,
        userAadObjId
      );

      const msg = `Thanks! The sample safety check message has been sent to all your team members. You can view their responses in the **Dashboard tab** and access all other features as  well.`;
      await sendDirectMessage(context, context.activity.from, msg);
    }
  } catch (err) {
    console.log(err);
    processSafetyBotError(
      err,
      "",
      "",
      userAadObjId,
      "triggerTestSafetyCheckMessage"
    );
  }
};
const onInvokeActivity = async (context) => {
  try {
    let log = new AYSLog();
    const companyData = context.activity?.value?.action?.data?.companyData;
    const uVerb = context.activity?.value?.action?.verb;
    let adaptiveCard = null;
    console.log({ uVerb });

    if (uVerb == "add_user_info") {
      addUserInfoByTeamId(context);
    } else if (
      uVerb === "create_onetimeincident" ||
      uVerb === "contact_us" ||
      uVerb === "view_settings" ||
      uVerb === "list_inc" ||
      uVerb === "list_delete_inc"
    ) {
      await context.sendActivities([{ type: "typing" }]);
      adaptiveCard = updateMainCard(companyData);
      const card = CardFactory.adaptiveCard(updateMainCard(companyData));

      const message = MessageFactory.attachment(card);
      message.id = context.activity.replyToId;
      await context.updateActivity(message);
    } else if (uVerb === "save_new_inc" || uVerb === "save_new_recurr_inc") {
      const { inc_title: incTitle } = context.activity?.value?.action?.data;
      const user = context.activity.from;
      const isDuplicateInc = await verifyDuplicateInc(
        companyData.teamId,
        incTitle
      );
      if (isDuplicateInc) {
        await showDuplicateIncError(context, user, companyData);
        return {
          status: StatusCodes.OK,
        };
      }

      await context.sendActivities([{ type: "typing" }]);
      let members = context.activity?.value?.action?.data?.selected_members;
      if (members === undefined) {
        members = "All Members";
      }
      let recurrInc = uVerb === "save_new_recurr_inc" ? "recurring " : "";
      let text = `✔️ New ${recurrInc}incident '${incTitle}' created successfully.`;
      const cards = CardFactory.adaptiveCard(
        updateCard(incTitle, members, text)
      );

      const message = MessageFactory.attachment(cards);
      message.id = context.activity.replyToId;
      await context.updateActivity(message);
    } else if (uVerb === "Cancel_button") {
      const text = `Ok.. No Problem... We can do this later. Thank you for your time.`;
      adaptiveCard = updateCard(null, null, text);
      const cards = CardFactory.adaptiveCard(adaptiveCard);
      const message = MessageFactory.attachment(cards);
      message.id = context.activity.replyToId;
      await context.updateActivity(message);
    } else if (uVerb === "view_inc_close") {
      const { inc_title: incTitle } = context.activity?.value?.action?.data;
      let members = context.activity?.value?.action?.data?.selected_members;
      if (members === undefined) {
        members = "All Members";
      }
      let text = `Hello! You do not have any incident running at the moment!!!`;
      const cards = CardFactory.adaptiveCard(
        updateCard(incTitle, members, text)
      );

      const message = MessageFactory.attachment(cards);
      message.id = context.activity.replyToId;
      await context.updateActivity(message);
    } else if (uVerb === "submit_settings") {
      const cards = CardFactory.adaptiveCard(updateSesttingsCard());

      const message = MessageFactory.attachment(cards);
      message.id = context.activity.replyToId;
      await context.updateActivity(message);
    } else if (uVerb === "submit_comment") {
      const action = context.activity.value.action;
      const {
        userId,
        incId,
        incTitle,
        incCreatedBy,
        eventResponse,
        commentVal,
      } = action.data;
      let incGuidance = await incidentService.getIncGuidance(incId);
      incGuidance = incGuidance; //? incGuidance : "";
      let responseText = commentVal
        ? `✔️ Your message has been sent to <at>${incCreatedBy.name}</at>. Someone will be in touch with you as soon as possible`
        : `✔️ Your safety status has been sent to <at>${incCreatedBy.name}</at>. Someone will be in touch with you as soon as possible.`;

      const cards = CardFactory.adaptiveCard(
        updateSubmitCommentCard(responseText, incCreatedBy, incGuidance)
      );

      const message = MessageFactory.attachment(cards);
      message.id = context.activity.replyToId;
      await context.updateActivity(message);
    } else if (uVerb === "submit_contact_us") {
      let responseText = `✔️ Your feedback has been submitted successfully.`;
      const cards = CardFactory.adaptiveCard(
        updateContactSubmitCard(responseText)
      );

      const message = MessageFactory.attachment(cards);
      message.id = context.activity.replyToId;
      await context.updateActivity(message);
    } else if (uVerb === "safetyVisitorQuestion1") {
      const action = context.activity.value.action;
      const { info: response, inc, companyData } = action.data;
      const { incId, incTitle, incCreatedBy } = inc;
      let respnse1 = "";

      if (response == "question1_yes") {
        const Qestion2 = CardFactory.adaptiveCard(
          updateSafeMessageqestion2(
            incTitle,
            "",
            incCreatedBy,
            response,
            context.activity.from.id,
            incId,
            companyData,
            inc,
            incGuidance
          )
        );

        await context.sendActivity({
          attachments: [Qestion2],
        });
        //click yess button on all visitor safe
      }
    } else if (uVerb === "safetyVisitorQuestion2") {
      const action = context.activity.value.action;
      const { info: response, inc, companyData } = action.data;
      const { incId, incTitle, incCreatedBy } = inc;
      let respnse1 = "";
      if (response == "question2_no") {
        const Qestion3 = CardFactory.adaptiveCard(
          updateSafeMessageqestion3(
            incTitle,
            "",
            incCreatedBy,
            response,
            context.activity.from.id,
            incId,
            companyData,
            inc,
            incGuidance
          )
        );

        await context.sendActivity({
          attachments: [Qestion3],
        });
      }
    }
    ////////////////////Question3
    else if (uVerb === "safetyVisitorQuestion3") {
      const action = context.activity.value.action;
      const {
        userId,
        incId,
        incTitle,
        incCreatedBy,
        eventResponse,
        commentVal,
      } = action.data;
      let incGuidance = await incidentService.getIncGuidance(incId);
      incGuidance = incGuidance; //? incGuidance : "";
      let responseText = commentVal
        ? `✔️ Your message has been sent to <at>${incCreatedBy.name}</at>. Someone will be in touch with you as soon as possible`
        : `✔️ Your safety status has been sent to <at>${incCreatedBy.name}</at>. Someone will be in touch with you as soon as possible`;

      const cards = CardFactory.adaptiveCard(
        updateSubmitCommentCard(responseText, incCreatedBy, incGuidance)
      );

      const message = MessageFactory.attachment(cards);
      message.id = context.activity.replyToId;
      await context.updateActivity(message);
    } else if (uVerb === "send_response") {
      // await context.sendActivities([{ type: "typing" }]);
      log.addLog("After Click On Im_Safte or need assistance start. ");
      const action = context.activity.value.action;
      const { info: response, inc, companyData } = action.data;
      const { incId, incTitle, incCreatedBy } = inc;
      log.addLog(`After Click On Im_Safte or need assistance start.:${incId} `);
      const incStatusId = await incidentService.getIncStatus(incId);
      if (incStatusId == -1 || incStatusId == 2) {
        await sendIncStatusValidation(context, incStatusId);
        return {
          status: StatusCodes.OK,
        };
      }

      let responseText = "";
      if (response === "i_am_safe") {
        responseText = `Glad you're safe! Your safety status has been sent to <at>${incCreatedBy.name}</at>`;
      } else {
        responseText = `Sorry to hear that! We have informed <at>${incCreatedBy.name}</at> of your situation and someone will be reaching out to you as soon as possible.`;
      }

      const entities = {
        type: "mention",
        text: `<at>${incCreatedBy.name}</at>`,
        mentioned: {
          id: incCreatedBy.id,
          name: incCreatedBy.name,
        },
      };

      await sendDirectMessage(
        context,
        context.activity.from,
        responseText,
        entities
      );
      log.addLog(
        "After Click On Im_Safte or need assistance  Text message Send successfully. "
      );
      var incGuidance = await incidentService.getIncGuidance(incId);
      incGuidance = incGuidance; //? incGuidance : "";

      const cards = CardFactory.adaptiveCard(
        updateSafeMessage(
          incTitle,
          "",
          incCreatedBy,
          response,
          context.activity.from.id,
          incId,
          companyData,
          inc,
          incGuidance
        )
      );

      await context.sendActivity({
        attachments: [cards],
      });
      log.addLog(
        "After Click On Im_Safte or need assistance comment section card Send successfully. "
      );
      if (companyData.EnableSafetycheckForVisitors == true) {
        log.addLog(
          "In setting EnableSafetycheckForVisitors is true card sending"
        );
        const Qestion1 = CardFactory.adaptiveCard(
          updateSafeMessageqestion1(
            incTitle,
            "",
            incCreatedBy,
            response,
            context.activity.from.id,
            incId,
            companyData,
            inc,
            incGuidance
          )
        );
        await context.sendActivity({
          attachments: [Qestion1],
        });
        log.addLog(
          "In setting EnableSafetycheckForVisitors is true card sending successsfully"
        );
      }

      // const message = MessageFactory.attachment(cards);
      // message.id = context.activity.replyToId;
      // await context.updateActivity(message);
    } else if (uVerb === "send_approval" || uVerb === "cancel_send_approval") {
      // if (uVerb === "send_approval") {
      //   await context.sendActivities([{ type: "typing" }]);
      // }
      const action = context.activity.value.action;
      const { incTitle: incTitle } = action.data.incident;
      const { inc_created_by: incCreatedBy } =
        context.activity?.value?.action?.data;
      let preTextMsg = "";
      let isAllMember = false;
      if (context.activity?.value?.action.data.selected_members) {
        preTextMsg = `Should I send this message to the selected user(s)?`;
      } else {
        isAllMember = true;
        preTextMsg = `Should I send this message to everyone?`;
      }
      const isRecurringInc = action.data.incType === "recurringIncident";
      const cards = CardFactory.adaptiveCard(
        updateSendApprovalMessage(
          incTitle,
          incCreatedBy,
          preTextMsg,
          uVerb === "send_approval" ? true : false,
          isAllMember,
          isRecurringInc,
          action.data.safetyCheckMessageText,
          action.data.mentionUserEntities,
          action.data.guidance
        )
      );
      const message = MessageFactory.attachment(cards);
      message.id = context.activity.replyToId;
      await context.updateActivity(message);
    }
    ////////////
    else if (uVerb == "do_it_later") {
      let msg =
        "Ok! I will remind you to send the safety check message to your team members later.";

      await sendDirectMessage(context, context.activity.from, msg);
    } else if (uVerb == "triggerTestSafetyCheckMessage") {
      const action = context.activity.value.action;
      const { companyData, teamMemberCount } = action.data;
      const cards = CardFactory.adaptiveCard(
        getTestIncPreviewCard(teamMemberCount, companyData)
      );

      const message = MessageFactory.attachment(cards);
      message.id = context.activity.replyToId;
      context.updateActivity(message);
    }

    const user = context.activity.from;

    if (context.activity.name === "adaptiveCard/action") {
      const card = await selectResponseCard(context, user);
      if (adaptiveCard != null) {
        return invokeResponse(adaptiveCard);
      } else if (card) {
        return invokeResponse(card);
      } else {
        return {
          status: StatusCodes.OK,
        };
      }
    }
  } catch (err) {
    console.log(err);
    processSafetyBotError(
      err,
      "",
      "",
      "",
      "error in onInvokeActivity context=" + JSON.stringify(context)
    );
  }
};

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
  sendIncStatusValidation,
  addUserInfoByTeamId,
  sendSafetyCheckMessage,
  sendNewContactEmail,
  sendUninstallationEmail,
  sendtestmessage,
  addteamsusers,
  updateServiceUrl,
  sendProactiveMessaageToUserTest,
  sendProactiveMessaageToChannel,
  sendSafetyCheckMessageAsync,
  sendNSRespToTeamChannel,
  createTestIncident,
  onInvokeActivity,
  sendSafetyCheckMsgViaSMS,
  sendAcknowledmentinSMS,
  proccessSMSLinkClick,
  SaveSmsLog,
  acknowledgeSMSReplyInTeams
};
