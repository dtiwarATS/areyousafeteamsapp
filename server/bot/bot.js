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

const { updateMainCard, updateCard } = require("../models/UpdateCards");
const dashboard = require("../models/dashboard");

const ENV_FILE = path.join(__dirname, "../../.env");
require("dotenv").config({ path: ENV_FILE });
const ALL_USERS = "allusers";
const SELECTED_USERS = "selectedusers";
const db = require("../db");
const { AYSLog } = require("../utils/log");

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
    processSafetyBotError(err, "", userName);
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
    processSafetyBotError(err, "", userName);
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
      await sendApprovalResponse(user, context);
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
    processSafetyBotError(err, "", "");
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
    processSafetyBotError(err, "", "");
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
  var guidance = action.data.guidance
    ? action.data.guidance
    : "No details available";
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
  var guidance = action.data.guidance
    ? action.data.guidance
    : "No details available";

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
    processSafetyBotError(err, "", "", userObjId);
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
    incData.conversationId != null
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
  context,
  approvalCardResponse,
  userAadObjId
) => {
  //If user click on Need assistance, then send message to selected users
  try {
    const incRespSelectedChannels =
      await incidentService.getIncResponseSelectedChannelList(incId);
    const serviceUrl = context?.activity?.serviceUrl;
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
  runAt = null
) => {
  try {
    const isRecurringInc = runAt != null;
    const {
      incTitle,
      incTypeId,
      additionalInfo,
      travelUpdate,
      contactInfo,
      situation,
    } = incData;
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
            processSafetyBotError(err, "", "", userAadObjId, sql);
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
        processSafetyBotError(err, "", "", userAadObjId);
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
        processSafetyBotError(err, "", "", userAadObjId);
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
        if (msgResp?.conversationId != null && msgResp?.activityId != null) {
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
          if (isRecurringInc) {
            sqlUpdateMsgDeliveryStatus += ` insert into MSTeamsMemberResponsesRecurr(memberResponsesId, runAt, is_message_delivered, response, response_value, comment, conversationId, activityId, message_delivery_status, message_delivery_error) 
              values(${respMemberObj.memberResponsesId}, '${runAt}', ${isMessageDelivered}, 0, NULL, NULL, '${msgResp?.conversationId}', '${msgResp?.activityId}', ${status}, '${error}'); `;
          } else {
            sqlUpdateMsgDeliveryStatus += ` update MSTeamsMemberResponses set is_message_delivered = ${isMessageDelivered}, message_delivery_status = ${status}, message_delivery_error = '${error}' where inc_id = ${incObj.incId} and user_id = '${msgResp.userId}'; `;
          }
        }

        if (
          respMemberObj.conversationId == null &&
          msgResp.newConversationId != null
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
          updateMsgDeliveryStatus(sqlUpdateMsgDeliveryStatus);
        }

        if (messageCount == allMembersArr.length) {
          if (msgNotSentArr.length > 0 && retryCounter < retryCountTill) {
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
            if (sqlUpdateMsgDeliveryStatus != "") {
              updateMsgDeliveryStatus(sqlUpdateMsgDeliveryStatus);
            }
            console.log({ retryLog });
            //processSafetyBotError("Retry Log", "", "", userAadObjId, retryLog);
            resolveFn(true);
          }
        }
      } catch (err) {
        processSafetyBotError(err, "", "", userAadObjId);
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
        callbackFn(msgResp, index);
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
            console.log({ i });
          }
        } catch (err) {
          console.log(err);
          processSafetyBotError(err, "", "", userAadObjId);
        }
      };
      console.log("fnRecursiveCall start");
      fnRecursiveCall(0, endIndex);
    };
    sendProactiveMessage(allMembersArr);
  } catch (err) {
    console.log(err);
    processSafetyBotError(err, "", "", userAadObjId);
    rejectFn(err);
  }
};

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
      if (selectedMembers != null && selectedMembers.split(",").length > 0) {
        selectedMembersArr = selectedMembers.split(",");
      }

      let allMembersArr = [];
      if (selectedMembersArr != null && selectedMembersArr.length > 0) {
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
        incGuidance = incGuidance ? incGuidance : "No details available";
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
          reject
        );

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
        incGuidance = incGuidance ? incGuidance : "No details available";
 
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
      processSafetyBotError(err, "", "", userAadObjId);
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

    if (selectedMembers != null && selectedMembers.split(",").length > 0) {
      allMembersArr = allMembersArr.filter((m) =>
        selectedMembers.split(",").includes(m.id)
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
      incGuidance = incGuidance ? incGuidance : "No details available";

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
        if (msgResp?.conversationId != null && msgResp?.activityId != null) {
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
    processSafetyBotError(err, "", "", userAadObjId);
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
      var guidance = incGuidance ? incGuidance : "No details available";
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
      await incidentService.updateIncResponseData(
        incId,
        user.id,
        1,
        inc,
        respTimestamp
      );
    } else {
      await incidentService.updateIncResponseData(
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
      await sendApprovalResponseToSelectedMembers(
        incId,
        context,
        approvalCardResponse
      );
      await sendApprovalResponseToSelectedTeams(
        incId,
        context,
        approvalCardResponse,
        user.aadObjectId
      );
    }

    //const dashboardCard = await getOneTimeDashboardCard(incId, runAt);
    //const serviceUrl = context.activity.serviceUrl;
    //const activityId = await viewIncResult(incId, context, companyData, inc, runAt, dashboardCard, serviceUrl);
    //await updateIncResponseOfSelectedMembers(incId, runAt, dashboardCard, serviceUrl);
  } catch (error) {
    console.log(error);
    processSafetyBotError(
      err,
      "",
      "",
      user.aadObjectId,
      "sendApprovalResponse"
    );
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
      await sendCommentToSelectedMembers(incId, context, approvalCardResponse);
      await incidentService.updateIncResponseComment(
        incId,
        userId,
        commentVal,
        inc
      );

      await sendApprovalResponseToSelectedTeams(
        incId,
        context,
        approvalCardResponse,
        user.aadObjectId
      );
    }
  } catch (error) {
    console.log(error);
    processSafetyBotError(err, "", "", user.aadObjectId, "submitComment");
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
        await sendCommentToSelectedMembers(
          incId,
          context,
          approvalCardResponse
        );
        await sendApprovalResponseToSelectedTeams(
          incId,
          context,
          approvalCardResponse,
          user.aadObjectId
        );
      }
    } else {
      dataToBeUpdated = commentVal;
      loggerName = "Visittor Safety Question 3";

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
        await sendCommentToSelectedMembers(
          incId,
          context,
          approvalCardResponse
        );
        await incidentService.updateIncResponseComment(
          incId,
          userId,
          commentVal,
          inc
        );

        await sendApprovalResponseToSelectedTeams(
          incId,
          context,
          approvalCardResponse,
          user.aadObjectId
        );
      }
    }
  } catch (error) {
    console.log(error);
    processSafetyBotError(err, "", "", user.aadObjectId, loggerName);
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
    processSafetyBotError(err, "", "");
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
    incGuidance = incGuidance ? incGuidance : "No details available";
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
  incGuidance = incGuidance ? incGuidance : "No details available";
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
      subEventObj.runAt
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
      incGuidance = incGuidance ? incGuidance : "No details available";
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
    processSafetyBotError(err, "", "");
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
        url: "https://announcebot.in/img/InstallDetails.png?id=0",
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
    processSafetyBotError(err, "", "");
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
            processSafetyBotError(err, "", "");
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
    processSafetyBotError(err, "", "");
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
    processSafetyBotError(err, "", "", userAadObjId, "sendNSRespToTeamChannel");
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
      incTitle: "Test - Safety Check - Test",
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
    processSafetyBotError(err, "", "", userAadObjId, "createTestIncident");
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

      const msg = `Thanks! Your safety check message has been sent to all the users. \n\nClick on the **Dashboard tab** above to view the real-time safety status and access all features.`;
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
};
