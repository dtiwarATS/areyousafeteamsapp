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
const FormData = require("form-data");
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
const { sendEmail, formatedDate, convertToAMPM, sendCustomEmail } = require("../utils");
const {
  addFeedbackData,
  updateSuperUserData,
  getInstallationData,
  isAdminUser,
  saveLog,
  addTeamMember,
  getCompanyDataByTeamId,
} = require("../db/dbOperations");
const { sendMessageToServiceBus } = require("./sendToServiceBus");
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
const { Leave } = require("twilio/lib/twiml/VoiceResponse");

const sendInstallationEmail = async (userEmailId, userName, teamName) => {
  try {
    const emailBody =
      "Hi,<br/> <br />" +
      "Below user has successfully installed Safety Check app in Microsoft Teams: <br />" +
      "<b>User Name: </b>" +
      userName +
      "<br />" +
      "<b>User Email: </b>" +
      userEmailId +
      "<br />" +
      "<br /><br />" +
      "Thank you, <br />" +
      "Safety Check Support";

    const subject = "Safety Check Teams Bot | New Installation Details";
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
      "Below user has uninstalled Safety Check app in Microsoft Teams: <br />" +
      "<b>User Name: </b>" +
      userName +
      "<br />" +
      "<b>User Email: </b>" +
      userEmailId +
      "<br />" +
      "<br /><br />" +
      "Thank you, <br />" +
      "Safety Check Support";

    const subject = "Safety Check Teams Bot | New Uninstallation Details";
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
        text: "**Chat:** Go to the Chat section -> Safety Check Bot -> Click the **Create Incident** button",
        wrap: true,
      },
      {
        type: "TextBlock",
        text: "**Team:** Go to the Teams section -> Go to the General channel under the team for which Safety Check Bot is installed -> Safety Check tab -> Click the **Create Incident** button",
        wrap: true,
      },
      {
        type: "TextBlock",
        text: "Have questions? [Email](mailto:help@safetycheck.in) | [Chat](https://teams.microsoft.com/l/chat/0/0?users=safetycheck@ats360.com) | [Schedule call](https://calendly.com/nehapingale/short-call) \n\nWith Gratitude,\n\nAreYouSafeBot team",
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
      width: "Full",
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
  incFilesData = null,
  incCreaterConversationId = ""
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
          .then((resp) => { })
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
        allMembersArr = Array.from(
          new Map(allMembersArr.map(item => [item.id, item])).values()
        );
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
          msgResp.errorCode == "BotDisabledByAdmin" ||
          error == "Invalid user identity in provided tenant" ||
          retryCounter == retryCountTill
        ) {
          if (
            (msgResp.errorCode == "ConversationBlockedByUser" ||
              msgResp.errorCode == "BotDisabledByAdmin" ||
              status == "User blocked the conversation with the bot.") && userAadObjId
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
              values(${respMemberObj.memberResponsesId
                }, '${runAt}', ${isMessageDelivered}, 0, NULL, NULL, '${msgResp?.conversationId
                }', '${msgResp?.activityId}', ${status}, '${error}', ${isMessageDelivered == 1 ? "GETDATE()" : "NULL"
                }); `;
            }
          } else {
            log.addLog(`For OneTime Incident`);
            sqlUpdateMsgDeliveryStatus += ` update MSTeamsMemberResponses set is_message_delivered = ${isMessageDelivered}, message_delivery_status = ${status}, message_delivery_error = '${error}', LastReminderSentAT = ${isMessageDelivered == 1 ? "GETDATE()" : "NULL"
              } where inc_id = ${incObj.incId} and user_id = '${msgResp.userId
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
    if (incCreaterConversationId) {
      sendAcknowledgeMsgToCreator(connectorClient, incData, serviceUrl, incCreaterConversationId, allMembersArr.length, companyData.teamName, companyData.channelName);
    }
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

const getAcknowledgeMsgToCreatorAdaptiveCard = (
  numberOfUsers,
  teamName,
  channelName
) => {
  let msgText = `Thanks! Your <b>safety check message</b> has been sent to ${numberOfUsers} users.<br />
Click on the <b>Dashboard tab</b> above to view the real-time safety status and access all features.<br />
For mobile, navigate to the <b>${teamName}</b> team -> <b>${channelName}</b> channel -> <b>Safety Check</b> tab`;
  return MessageFactory.text(msgText);
};

const sendAcknowledgeMsgToCreator = (
  connectorClient,
  incData,
  serviceUrl,
  conversationId,
  numberOfUsers,
  teamName,
  channelName
) => {
  if (connectorClient == null) {
    const appId = process.env.MicrosoftAppId;
    const appPass = process.env.MicrosoftAppPassword;

    var credentials = new MicrosoftAppCredentials(appId, appPass);
    connectorClient = new ConnectorClient(credentials, {
      baseUri: serviceUrl,
    });
  }
  let msgText = `Thanks! Your <b>safety check message</b> has been sent to ${numberOfUsers} users.<br />
Click on the <b>Dashboard tab</b> above to view the real-time safety status and access all features.<br />
For mobile, navigate to the <b>${teamName}</b> team -> <b>${channelName}</b> channel -> <b>Safety Check</b> tab`;
  let activity = MessageFactory.text(msgText);
  connectorClient.conversations.sendToConversation(conversationId, activity);
};

const sendSafetyCheckMsgViaSMS = async (
  companyData,
  users,
  incId,
  incTitle,
  incData
) => {
  let tenantId = companyData.userTenantId;
  let refresh_token = companyData.refresh_token;
  let usrPhones = await getUserPhone(refresh_token, tenantId, users);
  let counter = Number(
    companyData.sent_sms_count && companyData.sent_sms_count != ""
      ? companyData.sent_sms_count
      : "0"
  );
  let body = "";
  let incTypeId = 1;
  if (incData && Number(incData.incTypeId) != 1) {
    incTypeId = Number(incData.incTypeId);
    let incTypeName = "",
      data = "";
    switch (incTypeId) {
      case 2:
        incTypeName = "Safety alert";
        data = incData.incGuidance;
        break;
      case 3:
        incTypeName = "Important bulletin";
        data = incData.incGuidance;
        break;
      case 4:
        incTypeName = "Travel advisory";
        data = incData.travelUpdate;
        break;
      case 5:
        incTypeName = "Stakeholder notice";
        data = incData.situation;
        break;
    }
    body = `${incTypeName} from ${companyData.teamName} - ${incTitle} \n${data}`;
    body = body.substring(0, 142);
  }

  for (let user of usrPhones) {
    if (counter == 50 && companyData.SubscriptionType == 2) break;
    try {
      if (
        (companyData.PHONE_FIELD == "mobilePhone" && user.mobilePhone != "") ||
        (user.businessPhones.length > 0 && user.businessPhones[0] != "")
      ) {
        let phone =
          user.businessPhones.length > 0 && user.businessPhones[0] != ""
            ? user.businessPhones[0]
            : "";
        if (companyData.PHONE_FIELD == "mobilePhone") {
          phone = user.mobilePhone;
        }
        if (phone == null || phone == "" || phone == "null") {
          continue;
        }
        if (incTypeId == 1) {
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

          body =
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
        }
        await tClient.messages.create({
          body: body,
          from: "+18023277232",
          shortenUrls: true,
          messagingServiceSid: "MGdf47b6f3eb771ed026921c6e71017771",
          to: phone,
        });
        counter++;
        SaveSmsLog(
          user.id,
          "OUTGOING",
          body,
          JSON.stringify({ eventId: incId, userId: user.id })
        );
        if (companyData.SubscriptionType == 2) {
          incidentService.updateSentSMSCount(companyData.teamId, counter);
        }
      }
    } catch (err) {
      processSafetyBotError(
        err,
        companyData.teamId,
        user.id,
        null,
        "error in sending safety check via SMS"
      );
    }
  }
}

const sendSafetyCheckMsgViaWhatsapp = async (companyData, users, incId, incTitle, incCreatorName) => {
  let tenantId = companyData.userTenantId;
  let refresh_token = companyData.refresh_token;
  let usrPhones = await getUserPhone(refresh_token, tenantId, users);
  for (let user of usrPhones) {
    try {
      let phone =
        user.businessPhones.length > 0 && user.businessPhones[0] != ""
          ? user.businessPhones[0]
          : "";
      if (companyData.PHONE_FIELD == "mobilePhone") {
        phone = user.mobilePhone;
      }
      if (phone == null || phone == "" || phone == "null") {
        continue;
      }
      if (phone != null && phone != "" && phone != "null") {
        const token = process.env.WHATSAPP_TOKEN; // Your WhatsApp Business API token
        const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID; // Your WhatsApp Business API phone number ID
        const to = phone; // e.g. +919999999999

        const payload = {
          messaging_product: 'whatsapp',
          recipient_type: "individual",
          to: to,
          type: 'template',
          template: {
            name: 'safety_check',
            language: {
              code: 'en'
            },
            components: [
              {
                type: "body",
                parameters: [
                  {
                    parameter_name: 'incidentcreator',
                    type: "text",
                    text: incCreatorName         // {{1}} - Company Name
                  },
                  {
                    parameter_name: 'incidenttitle',
                    type: "text",
                    text: incTitle   // {{2}} - Incident Title
                  }
                ]
              },
              {
                type: "button",
                sub_type: "quick_reply",
                index: "0",
                parameters: [
                  {
                    type: "payload",
                    payload: `YES_${user.id}_${incId}`
                  }
                ]
              },
              {
                type: "button",
                sub_type: "quick_reply",
                index: "1",
                parameters: [
                  {
                    type: "payload",
                    payload: `NO_${user.id}_${incId}`
                  }
                ]
              }
            ]
          }
        };
        let response = await axios.post(
          `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
          payload,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          }
        );
        // .then(response => {
        //   console.log('Template message sent:', response.data);
        // }).catch(error => {
        //   console.error('Error sending template message:', error.response?.data || error.message);
        // });
        console.log('whatsapp msg request sent', response.data || response.message || response);
      }
    } catch (err) {
      processSafetyBotError(err, companyData.teamId, user.id, null, "error in sending safety check via SMS");
    }
  }
}

const sendAcknowledgeViaWhatsapp = async (to, replyText, companyName) => {
  try {
    let payload = {
      "messaging_product": "whatsapp",
      "to": to,
      "type": "text",
      "text": {
        "body": `Your safety status has been recorded as ${replyText}, and the ${companyName} team has been notified.`,
      }
    };
    axios.post(
      `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    ).then(response => {
      console.log('Template message sent:', response.data);
    }).catch(error => {
      console.error('Error sending template message:', error.response?.data || error.message);
    });
  } catch (err) {
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
          tenantId: compData.userTenantId,
        },
      },
    };
    incidentService.updateSafetyCheckStatusViaSMSLink(
      eventId,
      text == "YES" ? 1 : 0,
      userId,
      compData.teamId
    );
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
    acknowledgeSMSReplyInTeams(
      text,
      compData,
      incData.incCreatedBy,
      incData.incCreatedByName,
      user
    );
  }
};

const proccessWhatsappClick = async (userId, eventId, text, fromPhnNumber) => {
  if (userId && eventId) {
    const incData = await incidentService.getInc(eventId, null, userId);
    const compData = await incidentService.getCompanyData(incData.teamId);
    const users = await incidentService.getUserInfo(incData.teamId, userId);
    let user = users[0];
    let context = {
      activity: {
        serviceUrl: compData.serviceUrl,
        conversation: {
          tenantId: compData.userTenantId,
        },
      },
    };
    incidentService.updateSafetyCheckStatusViaSMSLink(
      eventId,
      text == "YES" ? 1 : 0,
      userId,
      compData.teamId,
      false
    );
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
    acknowledgeSMSReplyInTeams(
      text,
      compData,
      incData.incCreatedBy,
      incData.incCreatedByName,
      user
    );
    sendAcknowledgeViaWhatsapp(
      fromPhnNumber,
      text,
      compData.teamName
    );
  }
};

const acknowledgeSMSReplyInTeams = async (
  msgText,
  companyData,
  incCreatedById,
  incCreatedByName,
  user
) => {
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
};

const SaveSmsLog = async (userid, status, SMS_TEXT, RAW_DATA) => {
  let superUsers = null;
  try {
    superUsers = await incidentService.saveSMSlogs(
      userid,
      status,
      SMS_TEXT,
      RAW_DATA
    );
  } catch (err) {
    processSafetyBotError(err, "", "", null, "error in saveSMSLog");
  }
  return Promise.resolve(superUsers);
};

const processCommentViaLink = async (userId, incId, comment) => {
  let superUsers = null;
  try {
    if (comment == "") {
      return;
    }
    if (userId && incId) {
      const incData = await incidentService.getInc(incId, null, userId);
      const compData = await incidentService.getCompanyData(incData.teamId);
      const users = await incidentService.getUserInfo(incData.teamId, userId);
      let user = users[0];
      let context = {
        activity: {
          serviceUrl: compData.serviceUrl,
          conversation: {
            tenantId: compData.userTenantId,
          },
        },
      };
      await incidentService.updateCommentViaSMSLink(userId, incId, comment);

      const approvalCardResponse = {
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
        appId: process.env.MicrosoftAppId,
        body: [
          {
            type: "TextBlock",
            text: `User <at>${user.user_name}</at> has commented for incident **${incData.incTitle}**: \n${comment} `,
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
      const serviceUrl = context?.activity?.serviceUrl;
      await sendCommentToSelectedMembers(incId, context, approvalCardResponse);
      await sendApprovalResponseToSelectedTeams(
        incId,
        serviceUrl,
        approvalCardResponse,
        user.aadObjectId
      );
    }
  } catch (err) {
    processSafetyBotError(err, "", "", null, "error in saveSMSLog");
  }
  return Promise.resolve(superUsers);
};

const getUserPhone = async (refreshToken, tenantId, arrIds) => {
  var phone = [""];
  phone.pop();
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
        console.log("error at get access token in get users phone number", error);
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
  return phone;
};

const getUserDetails = async (tenantId, refreshToken, arrIds) => {
  var phone = [""];
  phone.pop();
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
                  "https://graph.microsoft.com/v1.0/users?$select=displayName,id,department,country,city,state" +
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
                  let data = response.data.value;
                  if (data && data.length > 0) {
                    let qry = "";
                    data.forEach(user => {
                      let city = user.city ? user.city : "";
                      let country = user.country ? user.country : "";
                      let state = user.state ? user.state : "";
                      let department = user.department ? user.department : "";
                      qry += `update MSTeamsTeamsUsers set city = '${city}', country = '${country}', state = '${state}', department = '${department}' where user_aadobject_id = '${user.id}'; `;
                    });
                    if (qry != "") {
                      incidentService.updateDataIntoDB(qry);
                    }
                  }
                })
                .catch((error) => {
                  console.log({
                    "error in get users phone number requestDate": error,
                  });
                  processSafetyBotError(
                    error,
                    tenantId,
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
        console.log("error at get access token in get users phone number", error);
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
  return phone;
};


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
      const responseOptionData = {
        responseOptions: JSON.parse(incData.responseOptions),
        responseType: incData.responseType
      };
      const { serviceUrl, userTenantId, userId } = companyData;
      if (resendSafetyCheck === "true") {
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
          responseOptionData
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
          incFilesData,
          createdByUserInfo.conversationId
        );
        let userAadObjIds = allMembersArr.map((x) => x.userAadObjId);
        if (
          companyData.send_sms &&
          (companyData.SubscriptionType == 3 ||
            (companyData.SubscriptionType == 2 &&
              companyData.sent_sms_count < 50))
        ) {
          sendSafetyCheckMsgViaSMS(
            companyData,
            userAadObjIds,
            incId,
            incTitle,
            incData
          );
        }
        if (companyData.userTenantId == "b9328432-f501-493e-b7f4-3105520a1cd4"
        ) {
          sendSafetyCheckMsgViaWhatsapp(companyData, userAadObjIds, incId, incTitle, createdByUserInfo.user_name);
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
    const { info: response, inc, companyData, dropdownSelection } = action.data;
    const { incId, incTitle, incCreatedBy, responseOptionData } = inc;
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
    let respToBeUpdated = 0;
    if (response == "dropdown_selection") {
      respToBeUpdated = dropdownSelection;
    } else {
      respToBeUpdated = response;
    }
    incidentService.updateIncResponseData(
      incId,
      user.id,
      Number(respToBeUpdated) ?? 0,
      inc,
      respTimestamp
    );
    // if (response === "i_am_safe") {
    //   incidentService.updateIncResponseData(
    //     incId,
    //     user.id,
    //     1,
    //     inc,
    //     respTimestamp
    //   );
    // } else if (response === "need_assistance") {
    //   incidentService.updateIncResponseData(
    //     incId,
    //     user.id,
    //     0,
    //     inc,
    //     respTimestamp
    //   );
    // }
    let responseText = responseOptionData.responseOptions.filter(
      (option) => option.id == respToBeUpdated)[0].option;
    //if (response == "need_assistance" || response == "i_am_safe") {
      const approvalCardResponse = {
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
        appId: process.env.MicrosoftAppId,
        body: [
          {
            type: "TextBlock",
            text: `User <at>${user.name}</at> responded **${responseText.trim()}** for Incident: **${incTitle}** `,
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
      if (
        companyData.send_sms &&
        (companyData.SubscriptionType == 3 ||
          (companyData.SubscriptionType == 2 &&
            companyData.sent_sms_count < 50))
      ) {
      }
      //sendAcknowledmentinSMS(
      // companyData,
      //   [user.aadObjectId],
      //   response === "i_am_safe" ? "I am safe" : "I need assistance"
      // );
    //}

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
      if (
        (user.businessPhones.length > 0 && user.businessPhones[0] != "") ||
        user.mobilePhone != ""
      ) {
        let phone =
          user.businessPhones.length > 0 && user.businessPhones[0] != ""
            ? user.businessPhones[0]
            : user.mobilePhone;

        let body = `Your safety status has been recorded as ${text} and ${companyData.teamName} team has been notified`;
        await tClient.messages.create({
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
      processSafetyBotError(
        err,
        companyData.teamId,
        user.id,
        null,
        "error in sending acknowledgement via SMS"
      );
    }
  }
};

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
      "Below user has provided feedback for Safety Check app installed in Microsoft Teams : " +
      "<br />" +
      `${userName !== "" ? "<b>User Name</b>: " + userName + " <br />" : " "
      } ` +
      "<b>Email: </b>" +
      emailVal +
      "<br />" +
      "<b>Feedback: </b>" +
      feedbackVal +
      "<br />" +
      "<br /><br />" +
      "Thank you, <br />" +
      "Safety Check Support";

    const subject = "Safety Check Teams Bot | Feedback";

    // await sendEmail(emailVal, subject, emailBody);
    await sendCustomEmail("help@safetycheck.in", process.env.ADMIN_EMAIL, emailBody, subject);
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

  const responseOptionData = {
    responseOptions: JSON.parse(subEventObj.RESPONSE_OPTIONS),
    responseType: subEventObj.RESPONSE_TYPE
  };
  let incObj = {
    incId,
    incTitle,
    incType: subEventObj.incType,
    runAt: subEventObj.runAt,
    incCreatedBy: incCreatedByUserObj,
    incGuidance,
    incResponseSelectedUsersList: null,
    responseOptionData
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
        text: "1. Navigate to MS Teams App store\r2. Search Safety Check and click on the Safety Check bot card\r3. Click on the top arrow button and select the **“Add“** option",
        wrap: true,
      },
      {
        type: "TextBlock",
        text: "If you need any help or want to share feedback, feel free to reach out to my makers at [help@safetycheck.in](mailto:help@safetycheck.in)",
        wrap: true,
      },
      {
        type: "Image",
        //convert image to base 64 using url: https://www.base64encoder.io/image-to-base64-converter/
        url: "data:image/png;base64,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",
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
      responseText = `Your response has been sent to <at>${incCreatedBy.name}</at>`;

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
  acknowledgeSMSReplyInTeams,
  processCommentViaLink,
  proccessWhatsappClick,
  getUserPhone,
  sendSafetyCheckMsgViaWhatsapp,
  getUserDetails
};
