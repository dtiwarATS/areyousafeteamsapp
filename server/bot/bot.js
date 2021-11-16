const {
  StatusCodes,
  MessageFactory,
  CardFactory,
  TurnContext,
  TeamsInfo,
} = require("botbuilder");
const {
  MicrosoftAppCredentials,
  ConnectorClient,
} = require("botframework-connector");
const incidentService = require("../services/incidentService");
const path = require("path");
const { getAllTeamMembers, sendDirectMessage } = require("../api/apiMethods");
const { sendEmail } = require("../utils");
const { addFeedbackData, updateSuperUserData } = require("../db/dbOperations");
const ENV_FILE = path.join(__dirname, "../../.env");
require("dotenv").config({ path: ENV_FILE });

const sendInstallationEmail = async (userEmailId, userName, teamName) => {
  const emailBody =
    "Hi,<br/> <br />" +
    "Below user has successfully installed AreYouSafe app in Microsoft Teams: <br />" +
    "<b>User Name: </b>" +
    userName +
    "<br />" +
    "<b>Team Name: </b>" +
    teamName +
    "<br /><br />" +
    "Thank you, <br />" +
    "AreYouSafe Support";

  const subject = "AreYouSafe | New Installation Details";

  await sendEmail(userEmailId, subject, emailBody);
};

const incidentManagementCard = (profileName) => ({
  version: "1.0.0",
  type: "AdaptiveCard",
  body: [
    {
      type: "TextBlock",
      text: `Hello ${profileName}`,
    },
    {
      type: "TextBlock",
      text: "Starting Incident Management Workflow",
    },
  ],
});

const invokeResponse = (card) => {
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
};

// Adaptive Card to show in task module
const adaptiveCardTaskModule = {
  $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
  body: [
    {
      type: "TextBlock",
      size: "Medium",
      weight: "Bolder",
      text: "Sample task module flow for tab",
    },
    {
      type: "Image",
      height: "50px",
      width: "50px",
      url: "https://cdn.vox-cdn.com/thumbor/Ndb49Uk3hjiquS041NDD0tPDPAs=/0x169:1423x914/fit-in/1200x630/cdn.vox-cdn.com/uploads/chorus_asset/file/7342855/microsoftteams.0.jpg",
    },
    {
      type: "ActionSet",
      actions: [
        {
          type: "Action.Submit",
          title: "Close",
          data: {
            msteams: {
              type: "task/submit",
            },
          },
        },
      ],
    },
  ],
  type: "AdaptiveCard",
  version: "1.4",
};

const selectResponseCard = async (context, user) => {
  try {
    let isSuperUser = false;
    let isAdminOrSuperuser = false;
    const action = context.activity.value.action;
    const verb = action.verb;

    // console.log("context.activity > ", context.activity);
    let companyData = action.data.companyData ? action.data.companyData : {};

    isSuperUser =
      companyData.superUsers &&
      companyData.superUsers.some(
        (su) => su === context.activity.from.aadObjectId
      )
        ? true
        : false;

    if (context.activity.from?.id == companyData.userId || isSuperUser) {
      isAdminOrSuperuser = true;
      console.log("isAdminOrSuperuser >> ", isAdminOrSuperuser);
    } else if (verb && verb !== "send_response" && verb !== "submit_comment") {
      // TODO: Need to change this approach
      // work-around to prevent non-admin user from performing activity on adaptive cards
      console.log("isAdminOrSuperuser >> ", isAdminOrSuperuser);
      return;
    }

    if (verb === "create_onetimeincident" && isAdminOrSuperuser) {
      return await createInc(context, user, companyData);
    } else if (verb === "save_new_inc" && isAdminOrSuperuser) {
      return await saveInc(context, action, companyData);
    } else if (verb === "list_delete_inc" && isAdminOrSuperuser) {
      return await sendDeleteIncCard(user, companyData);
    } else if (verb === "delete_inc" && isAdminOrSuperuser) {
      return await deleteInc(action, companyData);
    } else if (verb === "list_inc" && isAdminOrSuperuser) {
      return await viewAllInc(companyData);
    } else if (verb && verb === "send_approval" && isAdminOrSuperuser) {
      return await sendApproval(context);
    } else if (verb && verb === "cancel_send_approval" && isAdminOrSuperuser) {
      return await cancelSendApproval(action, companyData);
    } else if (verb && verb === "send_response") {
      return await sendApprovalResponse(user, context);
    } else if (verb && verb === "submit_comment") {
      return await submitComment(context, user, companyData);
    } else if (verb && verb === "view_inc_result" && isAdminOrSuperuser) {
      return await viewIncResult(action, context, companyData);
    } else if (verb && verb === "contact_us" && isAdminOrSuperuser) {
      return await sendContactUsForm(companyData);
    } else if (verb && verb === "submit_contact_us" && isAdminOrSuperuser) {
      return await submitContactUsForm(context, companyData);
    } else if (verb && verb === "view_settings" && isAdminOrSuperuser) {
      return viewSettings(context, companyData);
    } else if (verb && verb === "submit_settings" && isAdminOrSuperuser) {
      return await submitSettings(context, companyData);
    } else if (isAdminOrSuperuser) {
      return invokeMainActivityBoard(companyData);
    }
  } catch (error) {
    console.log(error);
  }
};

const invokeMainActivityBoard = (companyData) => ({
  $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
  appId: process.env.MicrosoftAppId,
  body: [
    {
      type: "TextBlock",
      size: "Medium",
      weight: "Bolder",
      text: "Hello!",
    },
    {
      type: "RichTextBlock",
      inlines: [
        {
          type: "TextRun",
          text: `I'm here to help you create new incident or view previous incident results.\nWould you like to?`,
        },
      ],
      separator: true,
    },
    {
      type: "ActionSet",
      actions: [
        {
          type: "Action.Execute",
          verb: "create_onetimeincident",
          title: "Create Incident",
          data: {
            option: "Create Incident",
            companyData: companyData,
          },
        },
        {
          type: "Action.Execute",
          verb: "list_inc",
          title: "View Incidents",
          data: {
            option: "View Incidents",
            companyData: companyData,
          },
        },
        {
          type: "Action.Execute",
          verb: "list_delete_inc",
          title: "Delete Incident",
          data: {
            option: "Delete Incident",
            companyData: companyData,
          },
        },
        {
          type: "Action.Execute",
          verb: "view_settings",
          title: "Settings",
          data: {
            option: "settings",
            companyData: companyData,
          },
        },
      ],
    },
    {
      type: "TextBlock",
      wrap: true,
      text: "If you have any questions or feedback for us, please click on the Contact Us button to get in touch.",
    },
  ],
  actions: [
    {
      type: "Action.Execute",
      verb: "contact_us",
      title: "Contact Us",
      data: {
        option: "Contact Us",
        companyData: companyData,
      },
    },
  ],
  type: "AdaptiveCard",
  version: "1.4",
});

const createInc = async (context, user, companyData) => {
  let allMembers = await getAllTeamMembers(context, companyData.teamId);

  // remove incident creator
  allMembers = allMembers.filter((m) => m.id != user.id);
  // console.log("allMembers in createInc >> ", allMembers);

  const memberChoises = allMembers.map((m) => ({
    title: m.name,
    value: m.aadObjectId,
  }));
  // console.log("memberChoises >> ", memberChoises);

  const card = {
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    appId: process.env.MicrosoftAppId,
    body: [
      {
        type: "TextBlock",
        size: "Medium",
        weight: "Bolder",
        text: "Create New Incident",
      },
      {
        type: "Input.Text",
        label: "Incident Title:",
        isRequired: true,
        errorMessage: "Incident Title is a required input",
        placeholder: "Enter Incident Title",
        id: "inc_title",
        separator: true,
      },
      {
        type: "Input.ChoiceSet",
        label: "Select Users: (Optional)",
        id: "selected_members",
        style: "filtered",
        isMultiSelect: true,
        placeholder: "Please select users",
        choices: memberChoises,
      },
    ],
    actions: [
      {
        type: "Action.Execute",
        verb: "save_new_inc",
        title: "Save",
        data: {
          info: "save",
          inc_created_by: user,
          companyData: companyData,
        },
      },
      {
        type: "Action.Execute",
        verb: "main_activity_board",
        title: "Back",
        data: {
          info: "Back",
          companyData: companyData,
        },
        associatedInputs: "none",
      },
    ],
    type: "AdaptiveCard",
    version: "1.4",
  };
  return card;
};

const saveInc = async (context, action, companyData) => {
  const allMembers = await (
    await TeamsInfo.getTeamMembers(context, companyData.teamId)
  )
    .filter((tm) => tm.aadObjectId)
    .map(
      (tm) =>
        (tm = {
          ...tm,
          messageDelivered: "na",
          response: "na",
          responseValue: "na",
        })
    );

  console.log("allMembers >> ", allMembers);

  console.log("action before save >> ", action);
  const { inc_title: incTitle, inc_created_by } = action.data;
  const newInc = await incidentService.saveInc(action.data, companyData);

  if (action.data.selected_members) {
    preTextMsg = `Should I send this message to the selected user(s)?`;
  } else {
    preTextMsg = `Should I send this message to everyone?`;
  }

  const card = {
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    appId: process.env.MicrosoftAppId,
    body: [
      {
        type: "TextBlock",
        size: "Medium",
        weight: "Bolder",
        text: `Incident "${incTitle}" created successfully!`,
        wrap: true,
      },
      {
        type: "RichTextBlock",
        separator: true,
        inlines: [
          {
            type: "TextRun",
            text: `Incident Message:\nThis is a safety check from `,
          },
          {
            type: "TextRun",
            text: `${inc_created_by.name}.`,
            weight: "bolder",
          },
          {
            type: "TextRun",
            text: `We think you may be affected by `,
          },
          {
            type: "TextRun",
            text: `${incTitle}. `,
            weight: "bolder",
          },
          {
            type: "TextRun",
            text: `Mark yourself as safe, or ask for assistance for this incident.`,
          },
        ],
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
            },
          },
        ],
      },
    ],
    type: "AdaptiveCard",
    version: "1.4",
  };
  return card;
};

const sendDeleteIncCard = async (user, companyData) => {
  // console.log("delete incident called", companyData, user);
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
          size: "Medium",
          weight: "Bolder",
        },
        {
          type: "TextBlock",
          text: "Select the incident to delete",
          wrap: true,
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
          verb: "delete_inc",
          title: "Delete",
          data: {
            info: "Delete",
            companyData: companyData,
          },
        },
        {
          type: "Action.Execute",
          verb: "main_activity_board",
          title: "Back",
          data: {
            info: "Back",
            companyData: companyData,
          },
        },
      ],
    };
    return card;
  } catch (error) {
    console.log(error);
  }
};

const deleteInc = async (action, companyData) => {
  console.log({ action, companyData });
  const incidentSelectedVal = action.data.incidentSelectedVal;
  await incidentService.deleteInc(incidentSelectedVal);

  const card = {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.4",
    body: [
      {
        type: "TextBlock",
        size: "Medium",
        weight: "Bolder",
        text: "Delete Incident",
      },
      {
        type: "TextBlock",
        size: "Medium",
        text: "Incident deleted successfully",
        separator: true,
        color: "good",
      },
    ],
    actions: [
      {
        type: "Action.Execute",
        verb: "main_activity_board",
        title: "Back",
        data: {
          info: "Back",
          companyData: companyData,
        },
      },
    ],
  };

  return card;
};

const viewAllInc = async (companyData) => {
  try {
    const allIncidentData = await incidentService.getAllInc(companyData.teamId);

    let incList = [];
    if (!allIncidentData.length) {
      incList = [
        {
          type: "RichTextBlock",
          inlines: [
            {
              type: "TextRun",
              text: "No Incidents Available",
              size: "medium",
              color: "Attention",
              separator: true,
            },
          ],
        },
      ];
    } else {
      incList = allIncidentData.map((inc, index) => ({
        type: "ColumnSet",
        spacing: "medium",
        separator: true,
        columns: [
          {
            type: "Column",
            width: 4,
            items: [
              {
                type: "TextBlock",
                text: `${index + 1}. ${inc.incTitle}`,
                size: "medium",
                color: "Good",
              },
            ],
          },
        ],
        selectAction: {
          type: "Action.Execute",
          verb: "view_inc_result",
          data: {
            incidentId: inc.incId,
            companyData: companyData,
          },
        },
      }));

      incList = [
        {
          type: "TextBlock",
          text: "Incident List",
          size: "Medium",
          weight: "Bolder",
        },
        ...incList,
      ];
    }

    const card = {
      type: "AdaptiveCard",
      $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
      version: "1.4",
      body: incList,
      actions: [
        {
          type: "Action.Execute",
          verb: "main_activity_board",
          title: "Back",
          data: {
            info: "Back",
            companyData: companyData,
          },
        },
      ],
    };
    return card;
  } catch (error) {
    console.log(error);
  }
};

const viewIncResult = async (action, context, companyData) => {
  // console.log("viewIncResult called", action);
  const inc = await incidentService.getInc(action.data.incidentId);
  console.log("inc in viewIncResult =>", inc);

  var result = {
    eventName: inc.incTitle,
    membersSafe: [],
    membersUnsafe: [],
    membersNotResponded: [],
  };

  // process result for event dashboard
  inc.members.forEach((m) => {
    const { userName, response, responseValue } = m;

    if (response == "na" || response == false) {
      result.membersNotResponded.push(userName);
    }
    if (response == true) {
      if (responseValue == true) {
        result.membersSafe.push(userName);
      } else if (responseValue == false || responseValue == null) {
        result.membersUnsafe.push(userName);
      }
    }
  });

  let membersUnsafeStr = result.membersUnsafe.join(", ");
  let membersNotRespondedStr = result.membersNotResponded.join(", ");
  let membersSafeStr = result.membersSafe.join(", ");

  // console.log("membersNotRespondedStr", membersNotRespondedStr);

  const card = {
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.4",
    type: "AdaptiveCard",
    version: "1.0",
    body: [
      {
        type: "TextBlock",
        text: `Incident: ${inc.incTitle}`,
        size: "Medium",
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
                text: `**Need Assistance: ${result.membersUnsafe.length}**`,
                color: "attention",
              },
              {
                type: "TextBlock",
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
                text: `**Not Responded: ${result.membersNotResponded.length}**`,
                color: "default",
              },
              {
                type: "TextBlock",
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
                text: membersSafeStr,
                isSubtle: true,
                spacing: "none",
              },
            ],
          },
        ],
      },
    ],
    actions: [
      {
        type: "Action.Execute",
        verb: "list_inc",
        title: "Back",
        data: {
          info: "Back",
          companyData: companyData,
        },
      },
    ],
  };

  return card;
};

const sendApproval = async (context) => {
  const action = context.activity.value.action;
  const inc = action.data.incident;
  const companyData = action.data.companyData;
  const { incId, incTitle, selectedMembers, incCreatedBy } = inc;

  let allMembers = await getAllTeamMembers(context, companyData.teamId);

  const incCreatedByUserObj = allMembers.find((m) => m.id === incCreatedBy);

  allMembers = allMembers.map(
    (tm) =>
      (tm = {
        ...tm,
        messageDelivered: "na",
        response: "na",
        responseValue: "na",
      })
  );

  // remove inc created by user from allmembers
  allMembers = allMembers.filter((m) => m.id !== incCreatedBy);

  if (selectedMembers.length > 0) {
    allMembers = allMembers.filter((m) =>
      selectedMembers.includes(m.aadObjectId)
    );
  }

  console.log("allMembers >> ", allMembers);

  const incWithAddedMembers = await incidentService.addMembersIntoIncData(
    incId,
    allMembers,
    incCreatedBy
  );

  // send approval msg to all users
  allMembers.forEach(async (teamMember) => {
    const approvalCard = {
      $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
      appId: process.env.MicrosoftAppId,
      body: [
        {
          type: "TextBlock",
          size: "Medium",
          weight: "Bolder",
          text: "Hello!",
        },
        {
          type: "RichTextBlock",
          separator: true,
          inlines: [
            {
              type: "TextRun",
              text: `This is a safety check from `,
            },
            {
              type: "TextRun",
              text: `${incCreatedByUserObj.name}. `,
              weight: "bolder",
            },
            {
              type: "TextRun",
              text: `We think you may be affected by `,
            },
            {
              type: "TextRun",
              text: `${incTitle}.`,
              weight: "bolder",
            },
          ],
        },
        {
          type: "RichTextBlock",
          separator: true,
          inlines: [
            {
              type: "TextRun",
              text: `Mark yourself as safe, or ask for assistance`,
            },
          ],
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
                inc: {
                  incId,
                  incTitle,
                  incCreatedBy: incCreatedByUserObj,
                },
                companyData: companyData,
              },
            },
            {
              type: "Action.Execute",
              verb: "send_response",
              title: "I need assistance",
              data: {
                info: "need_assistance",
                inc: {
                  incId,
                  incTitle,
                  incCreatedBy: incCreatedByUserObj,
                },
                companyData: companyData,
              },
            },
          ],
        },
      ],
      type: "AdaptiveCard",
      version: "1.4",
    };

    var ref = TurnContext.getConversationReference(context.activity);

    ref.user = teamMember;

    await context.adapter.createConversation(ref, async (t1) => {
      const ref2 = TurnContext.getConversationReference(t1.activity);
      await t1.adapter.continueConversation(ref2, async (t2) => {
        await t2.sendActivity({
          attachments: [CardFactory.adaptiveCard(approvalCard)],
        });
      });
    });
  });

  var result = {
    eventName: incWithAddedMembers.incTitle,
    membersSafe: [],
    membersUnsafe: [],
    membersNotResponded: [],
  };

  // process result for event dashboard
  incWithAddedMembers.members.forEach((m) => {
    const { userName, response, responseValue } = m;

    if (response == "na" || response == false) {
      result.membersNotResponded.push(userName);
    }
    if (response == true) {
      if (responseValue == true) {
        result.membersSafe.push(userName);
      } else if (responseValue == false || responseValue == null) {
        result.membersUnsafe.push(userName);
      }
    }
  });

  let membersUnsafeStr = result.membersUnsafe.join(", ");
  let membersNotRespondedStr = result.membersNotResponded.join(", ");
  let membersSafeStr = result.membersSafe.join(", ");

  const card = {
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    appId: process.env.MicrosoftAppId,
    body: [
      {
        type: "TextBlock",
        size: "Medium",
        weight: "Bolder",
        text: `Incident "${incTitle}" created successfully!`,
        wrap: true,
      },
      {
        type: "RichTextBlock",
        separator: true,
        inlines: [
          {
            type: "TextRun",
            text: `This is a safety check from `,
          },
          {
            type: "TextRun",
            text: `${incCreatedByUserObj.name}. `,
            weight: "bolder",
          },
          {
            type: "TextRun",
            text: `We think you may be affected by `,
          },
          {
            type: "TextRun",
            text: `${incTitle}.`,
            weight: "bolder",
          },
        ],
      },
      {
        type: "RichTextBlock",
        separator: true,
        inlines: [
          {
            type: "TextRun",
            text: `Thanks! Your safety check message has been sent to all the users`,
          },
        ],
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
                text: `**Need Assistance: ${result.membersUnsafe.length}**`,
                color: "attention",
              },
              {
                type: "TextBlock",
                text: membersUnsafeStr,
                isSubtle: true,
                spacing: "none",
              },
            ],
          },
        ],
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
                text: `**Not Responded: ${result.membersNotResponded.length}**`,
                color: "default",
              },
              {
                type: "TextBlock",
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
                text: membersSafeStr,
                isSubtle: true,
                spacing: "none",
              },
            ],
          },
        ],
      },
    ],
    actions: [
      {
        type: "Action.Execute",
        verb: "list_inc",
        title: "Back",
        data: {
          info: "Back",
          companyData: companyData,
        },
      },
    ],
    type: "AdaptiveCard",
    version: "1.4",
  };
  return card;
};

const cancelSendApproval = async (action, companyData) => {
  const { incTitle, incId } = action.data.incident;
  await incidentService.deleteInc(incId);

  const card = {
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    appId: process.env.MicrosoftAppId,
    body: [
      {
        type: "TextBlock",
        size: "Medium",
        weight: "Bolder",
        text: `Incident "${incTitle}" created successfully!`,
        wrap: true,
      },
      {
        type: "RichTextBlock",
        separator: true,
        inlines: [
          {
            type: "TextRun",
            text: `Incident Message:\nThis is a safety check from `,
          },
          {
            type: "TextRun",
            text: `${companyData.userName}. `,
            weight: "bolder",
          },
          {
            type: "TextRun",
            text: `We think you may be affected by `,
          },
          {
            type: "TextRun",
            text: `${incTitle}. `,
            weight: "bolder",
          },
          {
            type: "TextRun",
            text: `Mark yourself as safe, or ask for assistance for this incident.`,
          },
        ],
      },
      {
        type: "RichTextBlock",
        separator: true,
        inlines: [
          {
            type: "TextRun",
            text: `Your incident has been cancelled.`,
          },
        ],
      },
    ],
    type: "AdaptiveCard",
    version: "1.4",
  };
  return card;
};

const sendApprovalResponse = async (user, context) => {
  try {
    let responseText = "";
    const action = context.activity.value.action;
    const { info: response, inc, companyData } = action.data;
    const { incId, incTitle, incCreatedBy } = inc;

    if (response === "i_am_safe") {
      await incidentService.updateIncResponseData(incId, user.id, 1);
      responseText = `Glad you're safe! We have informed **${incCreatedBy.name}** of your situation.`;
    } else {
      await incidentService.updateIncResponseData(incId, user.id, 0);
      msgText = `The user **${user.name}** needs assistance for Incident: **${incTitle}**`;
      await sendDirectMessage(context, incCreatedBy, msgText);
      responseText = `Sorry for your situation! We have informed **${incCreatedBy.name}** of your situation.`;
    }
    // await context.sendActivity(MessageFactory.text(responseText));

    const approvalCard = {
      $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
      appId: process.env.MicrosoftAppId,
      body: [
        {
          type: "TextBlock",
          text: `${responseText} If you have any additional comments, please type them in the message box below and click on the Submit Comment button (optional)`,
          wrap: true,
        },
        {
          type: "Input.Text",
          placeholder: "Add additional comment",
          style: "text",
          id: "commentVal",
          isMultiline: true,
        },
      ],
      actions: [
        {
          type: "Action.Execute",
          verb: "submit_comment",
          title: "Submit Comment",
          data: {
            eventResponse: response,
            userId: user.id,
            incId: incId,
            incTitle: incTitle,
            incCreatedBy: incCreatedBy,
            companyData: companyData,
          },
        },
      ],
      type: "AdaptiveCard",
      version: "1.4",
    };
    return approvalCard;
  } catch (error) {
    console.log(error);
  }
};

const submitComment = async (context, user, companyData) => {
  try {
    const action = context.activity.value.action;
    const { userId, incId, incTitle, incCreatedBy, eventResponse, commentVal } =
      action.data;
    // console.log({ userId, incId, incCreatedBy, eventResponse, commentVal });

    await incidentService.updateIncResponseComment(incId, userId, commentVal);

    if (commentVal != "") {
      msgText = `The user **${user.name}** has commented for incident **${incTitle}**:\n${commentVal}`;
      await sendDirectMessage(context, incCreatedBy, msgText);
    }

    let responseText =
      commentVal === ""
        ? `Your safety status has been sent to the ${incCreatedBy.name}. Someone will be in touch with you as soon as possible.`
        : `Your message has been sent to ${incCreatedBy.name}. Someone will be in touch with you as soon as possible.`;

    const card = {
      type: "AdaptiveCard",
      $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
      version: "1.4",
      body: [
        {
          type: "TextBlock",
          size: "Medium",
          text: responseText,
          wrap: true,
        },
      ],
    };

    return card;
  } catch (error) {
    console.log(error);
  }
};

const sendContactUsForm = async (companyData) => {
  try {
    const card = {
      $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
      type: "AdaptiveCard",
      version: "1.4",
      body: [
        {
          type: "TextBlock",
          size: "Medium",
          weight: "Bolder",
          text: "Contact Us",
        },
        {
          type: "Input.Text",
          label: "Email",
          style: "email",
          id: "emailVal",
          isRequired: true,
          errorMessage: "Email field is required with valid email-id",
          regex: "^[\\w-\\.]+@([\\w-]+\\.)+[\\w-]{2,4}$",
          separator: true,
        },
        {
          type: "Input.Text",
          label: "Comments/Feeback",
          style: "text",
          id: "feedbackVal",
          isMultiline: true,
          isRequired: true,
          errorMessage: "Comment/Feedback is required",
        },
      ],
      actions: [
        {
          type: "Action.Execute",
          verb: "submit_contact_us",
          title: "Submit",
          data: {
            companyData: companyData,
          },
        },
        {
          type: "Action.Execute",
          verb: "main_activity_board",
          title: "Back",
          data: {
            info: "Back",
            companyData: companyData,
          },
          associatedInputs: "none",
        },
      ],
    };

    return card;
  } catch (error) {
    console.log(error);
  }
};

const submitContactUsForm = async (context, companyData) => {
  try {
    const { emailVal, feedbackVal } = context.activity.value.action.data;

    let responseObj = {};

    if (emailVal && feedbackVal) {
      // save feedback data into DB
      // then send the response
      responseObj = {
        type: "TextBlock",
        size: "Medium",
        text: "Feedback submitted successfully",
        separator: true,
        color: "good",
      };

      feedbackDataObj = {
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
        "<b>Teams Name: </b>" +
        companyData.teamName +
        "<br />" +
        "<b>Feedback: </b>" +
        feedbackVal +
        "<br />" +
        "<br /><br />" +
        "Thank you, <br />" +
        "AreYouSafe Support";

      const subject = "AreYouSafe | Feedback";

      await sendEmail(emailVal, subject, emailBody);
    } else {
      responseObj = {
        type: "TextBlock",
        size: "Medium",
        text: "Feedback submission failed",
        separator: true,
        color: "attention",
      };
    }

    // console.log("responseObj >> ", emailVal, feedbackVal);

    const card = {
      type: "AdaptiveCard",
      $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
      version: "1.4",
      body: [
        {
          type: "TextBlock",
          size: "Medium",
          weight: "Bolder",
          text: "Contact Us",
        },
        responseObj,
      ],
      actions: [
        {
          type: "Action.Execute",
          verb: "main_activity_board",
          title: "Back",
          data: {
            info: "Back",
            companyData: companyData,
          },
        },
      ],
    };

    return card;
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
    .filter((m) => companyData.superUsers.includes(m.aadObjectId))
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
        size: "Medium",
        weight: "Bolder",
        text: "Settings",
      },
      {
        type: "Input.ChoiceSet",
        label:
          "Select the users who should have the ability to create an incident (optional):",
        placeholder: "Select users",
        id: "selected_superusers",
        separator: true,
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
        verb: "submit_settings",
        title: "Save",
        data: {
          info: "submit",
          companyData: companyData,
        },
      },
      {
        type: "Action.Execute",
        verb: "main_activity_board",
        title: "Back",
        data: {
          info: "Back",
          companyData: companyData,
        },
        associatedInputs: "none",
      },
    ],
    type: "AdaptiveCard",
    version: "1.4",
  };
  return card;
};

const submitSettings = async (context, companyData) => {
  const selected_superusers =
    context.activity.value.action?.data?.selected_superusers;
  console.log("selected_superusers >> ", selected_superusers);
  await updateSuperUserData(
    companyData.userId,
    companyData.teamId,
    selected_superusers
  );

  const card = {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.4",
    body: [
      {
        type: "TextBlock",
        size: "Medium",
        weight: "Bolder",
        text: "Settings",
      },
      {
        type: "TextBlock",
        size: "Medium",
        text: "Settings saved successfully",
        separator: true,
        color: "good",
      },
    ],
    actions: [
      {
        type: "Action.Execute",
        verb: "main_activity_board",
        title: "Back",
        data: {
          info: "Back",
          companyData: companyData,
        },
      },
    ],
  };

  return card;
};

module.exports = {
  incidentManagementCard,
  invokeResponse,
  sendInstallationEmail,
  selectResponseCard,
  invokeMainActivityBoard,
  createInc,
  saveInc,
};
