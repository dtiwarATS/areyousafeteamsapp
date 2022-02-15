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
const {
  getAllTeamMembers,
  sendDirectMessage,
  sendDirectMessageCard,
} = require("../api/apiMethods");
const { sendEmail } = require("../utils");
const {
  addFeedbackData,
  updateSuperUserData,
  isAdminUser,
} = require("../db/dbOperations");
const ENV_FILE = path.join(__dirname, "../../.env");
require("dotenv").config({ path: ENV_FILE });
const ALL_USERS = "allusers";
const SELECTED_USERS = "selectedusers";

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
    +"<br /><br />" +
    "Thank you, <br />" +
    "AreYouSafe Support";

  const subject = "AreYouSafe? Teams Bot | New Installation Details";

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

    const isAdmin = await isAdminUser(context.activity.from.aadObjectId);
    console.log("isAdmin >> ", isAdmin);
    if (
      (context.activity.from?.id == companyData.userId || isSuperUser) &&
      isAdmin
    ) {
      isAdminOrSuperuser = true;
      console.log("isAdminOrSuperuser >> ", isAdminOrSuperuser);
    } else if (verb && verb !== "send_response" && verb !== "submit_comment") {
      // TODO: Need to change this approach
      // work-around to prevent non-admin user from performing activity on adaptive cards
      console.log("isAdminOrSuperuser >> ", isAdminOrSuperuser);
      try {
        await context.sendActivity(
          MessageFactory.text(
            `👋 Hello! Unfortunately, you **do not have permissions** to initiate a safety check. Please contact your Teams Admin to initiate.`
          )
        );
      } catch (error) {
        console.log(error);
      }
      return Promise.resolve(true);
    }
    console.log("going inside if now", isAdmin, typeof isAdmin);
    if (!isAdmin) {
      console.log("isAdminOrSuperuser false>> ", isAdminOrSuperuser);
      try {
        await context.sendActivity(
          MessageFactory.text(
            `👋 Hello! Unfortunately, you **do not have permissions** to initiate a safety check. Please contact your Teams Admin to initiate.`
          )
        );
      } catch (error) {
        console.log(error);
      }
      return Promise.resolve(true);
    }
    if (verb === "create_onetimeincident" && isAdminOrSuperuser) {
      await createInc(context, user, companyData);
    } else if (verb === "save_new_inc" && isAdminOrSuperuser) {
      await saveInc(context, action, companyData);
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
      await viewIncResult(incidentId, context, companyData);
    } else if (verb && verb === "contact_us" && isAdminOrSuperuser) {
      await sendContactUsForm(context, companyData);
    } else if (verb && verb === "submit_contact_us" && isAdminOrSuperuser) {
      await submitContactUsForm(context, companyData);
    } else if (verb && verb === "view_settings" && isAdminOrSuperuser) {
      await viewSettings(context, companyData);
    } else if (verb && verb === "submit_settings" && isAdminOrSuperuser) {
      await submitSettings(context, companyData);
    }
    return Promise.resolve(true);
  } catch (error) {
    console.log("ERROR: ", error);
  }
};

const invokeMainActivityBoard = (companyData) => ({
  $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
  appId: process.env.MicrosoftAppId,
  body: [
    {
      type: "RichTextBlock",
      inlines: [
        {
          type: "TextRun",
          text: `👋 Hello! I'm here to help you create new incident or view previous incident results.\nWould you like to?`,
        },
      ],
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
          isEnabled: false,
          verb: "list_inc",
          title: "View Incident Dashboard",
          data: {
            option: "View Incident Dashboard",
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
      separator: true,
      text: "If you have any questions or feedback for us, please click on the **Contact Us** button to get in touch.",
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
  try {
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
          // label: "Name of Incident",
          isRequired: true,
          errorMessage: "Please complete this required field.",
          placeholder: "Enter the Incident Name",
          id: "inc_title",
        },
        {
          type: "TextBlock",
          text: "Send the incident notification to these members (optional)",
          weight: "bolder",
          separator: true,
        },
        {
          type: "Input.ChoiceSet",
          // label: "Send the incident notification to these members (optional)",
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
          text: `⚠️ Ignore this field to send incident notification to **all teams members**`,
        },
      ],
      actions: [
        {
          type: "Action.Execute",
          verb: "save_new_inc",
          title: "Submit",
          data: {
            info: "save",
            inc_created_by: user,
            companyData: companyData,
          },
        },
        // {
        //   type: "Action.Execute",
        //   verb: "main_activity_board",
        //   title: "Back",
        //   data: {
        //     info: "Back",
        //     companyData: companyData,
        //   },
        //   associatedInputs: "none",
        // },
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

  let sentApprovalTo = "";
  if (action.data.selected_members) {
    preTextMsg = `Should I send this message to the selected user(s)?`;
    sentApprovalTo = SELECTED_USERS;
  } else {
    preTextMsg = `Should I send this message to everyone?`;
    sentApprovalTo = ALL_USERS;
  }

  const card = {
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    appId: process.env.MicrosoftAppId,
    body: [
      {
        type: "TextBlock",
        size: "Large",
        weight: "Bolder",
        text: `Incident "${incTitle}" created successfully!`,
        wrap: true,
      },
      {
        type: "TextBlock",
        separator: true,
        wrap: true,
        text: `Incident Message:\nThis is a safety check from <at>${inc_created_by.name}</at>. We think you may be affected by **${incTitle}**. Mark yourself as safe, or ask for assistance for this incident.`,
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
    msteams: {
      entities: [
        {
          type: "mention",
          text: `<at>${inc_created_by.name}</at>`,
          mentioned: {
            id: inc_created_by.id,
            name: inc_created_by.name,
          },
        },
      ],
    },
    type: "AdaptiveCard",
    version: "1.4",
  };

  await context.sendActivity({
    attachments: [CardFactory.adaptiveCard(card)],
  });
};

const sendDeleteIncCard = async (context, user, companyData) => {
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
          verb: "delete_inc",
          title: "Delete",
          data: {
            info: "Delete",
            companyData: companyData,
          },
        },
        // {
        //   type: "Action.Execute",
        //   verb: "main_activity_board",
        //   title: "Back",
        //   data: {
        //     info: "Back",
        //     companyData: companyData,
        //   },
        // },
      ],
    };

    await context.sendActivity({
      attachments: [CardFactory.adaptiveCard(card)],
    });
  } catch (error) {
    console.log(error);
  }
};

const deleteInc = async (context, action) => {
  // console.log({ action, companyData });
  const incidentSelectedVal = action.data.incidentSelectedVal;
  const IncidentName = await incidentService.deleteInc(incidentSelectedVal);

  let msgText;
  if (IncidentName) {
    msgText = `✔️ The Incident **'${IncidentName}'** has been deleted successfully.`;
    await context.sendActivity(MessageFactory.text(msgText));
  }
};

const viewAllInc = async (context, companyData) => {
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
          isRequired: true,
        },
      ],
      actions: [
        {
          type: "Action.Execute",
          verb: "view_inc_result",
          title: "Submit",
          data: {
            companyData: companyData,
          },
        },
        // {
        //   type: "Action.Execute",
        //   verb: "main_activity_board",
        //   title: "Back",
        //   data: {
        //     info: "Back",
        //     companyData: companyData,
        //   },
        // },
      ],
    };

    await context.sendActivity({
      attachments: [CardFactory.adaptiveCard(card)],
    });
  } catch (error) {
    console.log(error);
  }
};

const viewIncResult = async (incidentId, context, companyData) => {
  // console.log("viewIncResult called", action);
  const inc = await incidentService.getInc(incidentId);
  //console.log("inc in viewIncResult =>", inc);

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

  // console.log("membersNotRespondedStr", membersNotRespondedStr);

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
    msteams: {
      entities: mentionUserEntities,
    },
    // actions: [
    //   {
    //     type: "Action.Execute",
    //     verb: "list_inc",
    //     title: "Back",
    //     data: {
    //       info: "Back",
    //       companyData: companyData,
    //     },
    //   },
    // ],
  };

  // const card = {
  //   $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
  //   appId: process.env.MicrosoftAppId,
  //   type: "AdaptiveCard",
  //   version: "1.0",
  //   body: [
  //     {
  //       type: "TextBlock",
  //       text: `Hi <at>David James</at>`,
  //     },
  //   ],
  //   msteams: {
  //     entities: [
  //       {
  //         type: "mention",
  //         text: `<at>David James</at>`,
  //         mentioned: {
  //           id: "29:1rW2p2zC_SrnCSDXpjZ4mO45eaBpsQ-dUcUsGUl3Yh2a6Y7L3BcLE5JDkNr4Tlg2w9hxxbCnjX8b7yGlDddLnUQ",
  //           name: "David James",
  //         },
  //       },
  //     ],
  //   },
  // };

  await context.sendActivity({
    attachments: [CardFactory.adaptiveCard(card)],
  });
};

const sendApproval = async (context) => {
  const action = context.activity.value.action;
  const { incident, companyData, sentApprovalTo } = action.data;
  const { incId, incTitle, selectedMembers, incCreatedBy } = incident;

  let allMembers = await getAllTeamMembers(context, companyData.teamId);

  const incCreatedByUserObj = allMembers.find((m) => m.id === incCreatedBy);
  // console.log("incCreatedByUserObj >> ", incCreatedByUserObj);

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
          size: "Large",
          weight: "Bolder",
          text: "Hello!",
        },
        {
          type: "TextBlock",
          separator: true,
          wrap: true,
          text: `This is a safety check from <at>${incCreatedByUserObj.name}</at>. We think you may be affected by **${incTitle}**.`,
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
      msteams: {
        entities: [
          {
            type: "mention",
            text: `<at>${incCreatedByUserObj.name}</at>`,
            mentioned: {
              id: incCreatedByUserObj.id,
              name: incCreatedByUserObj.name,
            },
          },
        ],
      },
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

  const msgText =
    sentApprovalTo === ALL_USERS
      ? "✔️ Thanks! Your safety check message has been sent to all the users"
      : "✔️ Thanks! Your safety check message has been sent to all the selected user(s)";
  const approvalCardResponse = {
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    appId: process.env.MicrosoftAppId,
    body: [
      {
        type: "TextBlock",
        text: msgText,
        wrap: true,
      },
    ],
    type: "AdaptiveCard",
    version: "1.4",
  };
  await sendDirectMessageCard(
    context,
    incCreatedByUserObj,
    approvalCardResponse
  );
  const resultCard = await viewIncResult(incId, context, companyData);

  await context.sendActivity({
    attachments: [CardFactory.adaptiveCard(resultCard)],
  });
};

const cancelSendApproval = async (context, user) => {
  const action = context.activity.value.action;
  const { incTitle, incId } = action.data.incident;
  await incidentService.deleteInc(incId);

  const msgText = "Your incident has been cancelled.";
  await sendDirectMessage(context, user, msgText);
};

const sendApprovalResponse = async (user, context) => {
  try {
    let responseText = "";
    const action = context.activity.value.action;
    const { info: response, inc, companyData } = action.data;
    const { incId, incTitle, incCreatedBy } = inc;

    if (response === "i_am_safe") {
      await incidentService.updateIncResponseData(incId, user.id, 1);
      responseText = `Glad you're safe! We have informed <at>${incCreatedBy.name}</at> of your situation.`;
    } else {
      await incidentService.updateIncResponseData(incId, user.id, 0);
      const approvalCardResponse = {
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
        appId: process.env.MicrosoftAppId,
        body: [
          {
            type: "TextBlock",
            text: `The user <at>${user.name}</at> needs assistance for Incident: **${incTitle}**`,
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
      responseText = `Sorry for your situation! We have informed <at>${incCreatedBy.name}</at> of your situation.`;
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
      msteams: {
        entities: [
          {
            type: "mention",
            text: `<at>${incCreatedBy.name}</at>`,
            mentioned: {
              id: incCreatedBy.id,
              name: incCreatedBy.name,
            },
          },
        ],
      },
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

    //TODO: new to change this approach (i.e deleting current msg and sending new msg)
    //delete the current msg
    await context.deleteActivity(context.activity.replyToId);

    //send new msg just to emulate msg is being updated
    await context.sendActivity({
      attachments: [CardFactory.adaptiveCard(approvalCard)],
    });

    // return approvalCard;
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
            text: `The user <at>${user.name}</at> has commented for incident **${incTitle}**:\n${commentVal}`,
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
      await incidentService.updateIncResponseComment(incId, userId, commentVal);
    }

    let responseText = commentVal
      ? `✔️ Your safety status has been sent to the <at>${incCreatedBy.name}</at>. Someone will be in touch with you as soon as possible.`
      : `✔️ Your message has been sent to <at>${incCreatedBy.name}</at>. Someone will be in touch with you as soon as possible.`;

    const card = {
      type: "AdaptiveCard",
      $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
      version: "1.4",
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
            text: `<at>${incCreatedBy.name}</at>`,
            mentioned: {
              id: incCreatedBy.id,
              name: incCreatedBy.name,
            },
          },
        ],
      },
    };

    //TODO: new to change this approach (i.e deleting current msg and sending new msg)
    //delete the current msg
    await context.deleteActivity(context.activity.replyToId);

    //send new msg just to emulate msg is being updated
    await context.sendActivity({
      attachments: [CardFactory.adaptiveCard(card)],
    });

    // return card;
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
          // label: "Email Address",
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
          // label: "Comment/Question",
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
          verb: "submit_contact_us",
          title: "Submit",
          data: {
            companyData: companyData,
          },
        },
        // {
        //   type: "Action.Execute",
        //   verb: "main_activity_board",
        //   title: "Back",
        //   data: {
        //     info: "Back",
        //     companyData: companyData,
        //   },
        //   associatedInputs: "none",
        // },
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

      const msgText = `✔️ Your feedback has been submitted successfully.`;
      await context.sendActivity(MessageFactory.text(msgText));
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
        // label:
        //   "Select the users who should have the ability to create an incident (optional)",
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
        verb: "submit_settings",
        title: "Submit",
        data: {
          info: "submit",
          companyData: companyData,
        },
      },
      // {
      //   type: "Action.Execute",
      //   verb: "main_activity_board",
      //   title: "Back",
      //   data: {
      //     info: "Back",
      //     companyData: companyData,
      //   },
      //   associatedInputs: "none",
      // },
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

  const msgText = `✔️ Your App Settings have been saved successfully.`;
  await context.sendActivity(MessageFactory.text(msgText));
};

module.exports = {
  invokeResponse,
  sendInstallationEmail,
  selectResponseCard,
  invokeMainActivityBoard,
  createInc,
  saveInc,
};
