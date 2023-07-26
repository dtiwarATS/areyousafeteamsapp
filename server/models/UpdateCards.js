require("dotenv");

const getMobileDashboardMsgBlockJSON = (companyData) => {
  let { teamName, channelName } = companyData;
  if (teamName == null) {
    teamName = "";
  }
  if (channelName == null) {
    channelName = "General";
  }
  return {
    type: "TextBlock",
    wrap: true,
    text: `For mobile, navigate to the  **${teamName}** team -> **${channelName}** channel -> **AreYouSafe?** tab`,
  };
};

const updateMainCard = (companyData) => {
  //var taskItemUrl = 'https://teams.microsoft.com/l/entity/fe4a8eba-2a31-4737-8e33-e5fae6fee194/tasklist123?webUrl=' + encodedWebUrl + '&context=' + encodedContext;

  const webUrl = `https://0f5a-110-172-16-5.ngrok.io/areYouSafeTab/index.html`;
  var encodedWebUrl = encodeURIComponent(`${webUrl}`);
  let taskContext = encodeURIComponent(
    `{"channelId":"19:-hsC9OMcGeta4Ke-bYtIVS4HFxNJZ8D8fYK50KZi7q01@thread.tacv2"}`
  );

  // const webUrl = `https://areyousafeteamsprod.azurewebsites.net/areYouSafeTab/index.html`;
  // var encodedWebUrl = encodeURIComponent(`${webUrl}?&label=AreYouSafeDashboard`);
  // let taskContext = encodeURIComponent(`{"channelId":"19:3684c109f05f44efb4fb54a988d70286@thread.tacv2"}`);

  const mobileDashboardMsgBlockJSON =
    getMobileDashboardMsgBlockJSON(companyData);
  const cardActions = [
    // {
    //   "type": "Action.OpenUrl",
    //   "title": "Dashboard",
    //   // "url": `https://teams.microsoft.com/l/entity/f1739c01-2e62-404b-80d4-72f79582ba0f/AreYouSafeDashboard?webUrl=${encodedWebUrl}&context=${taskContext}`,
    //   "url": `https://teams.microsoft.com/l/entity/${process.env.MicrosoftAppId}/${process.env.tabEntityId}?context=${taskContext}`,
    //   "id": "dashboardAction"
    // },
    {
      type: "Action.OpenUrl",
      title: "Frequently Asked Questions",
      url: "https://areyousafe.in/frequently_asked_questions.html",
      iconUrl: "https://areyousafe.in/img/help.png",
    },
    {
      type: "Action.OpenUrl",
      title: "Contact us",
      url: "mailto:help@areyousafe.in",
    },
  ];
  const card = {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.4",
    body: [
      {
        type: "TextBlock",
        wrap: true,
        text: "Hello! Click on the **Dashboard tab** above to access all features.",
      },
      mobileDashboardMsgBlockJSON,
      {
        type: "ActionSet",
        actions: cardActions,
      },
    ],
  };
  if (
    companyData != null &&
    companyData.membersCount != null &&
    Number(companyData.membersCount) > 0 &&
    companyData.userEmail != null
  ) {
    const manageSubscriptionBtnJSON = {
      type: "Action.OpenUrl",
      title: "Manage Licenses",
      url: `https://areyousafesubscriptionpage.azurewebsites.net/?isFromSafetyBot=true&emailid=${companyData.userEmail}`,
      iconUrl: "https://areyousafe.in/img/help.png",
    };
    cardActions.push(manageSubscriptionBtnJSON);
  }
  return card;
};
const updateCard = (incidentTitle, members, text) => {
  return {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.4",
    body: [
      {
        type: "TextBlock",
        isSubtle: true,
        color: "good",
        wrap: true,
        size: "default",
        text: text,
      },
    ],
  };
};
const updateSendApprovalMessage = (
  incTitle,
  inc_created_by,
  preTextMsg,
  approved,
  isAllMember,
  isRecurringInc,
  safetyCheckMessageText,
  mentionUserEntities,
  guidance
) => {
  let msg = isRecurringInc ? "will be" : "has been";
  return {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.4",
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
        text: `${safetyCheckMessageText}`,
      },
      {
        type: "ActionSet",
        actions: [
          {
            type: "Action.Execute",
            title: "I am safe",
            data: {
              info: "i_am_safe",
            },
          },
          {
            type: "Action.Execute",
            title: "I need assistance",
            data: {
              info: "need_assistance",
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
        type: "TextBlock",
        wrap: true,
        text: "Yes / No",
      },
      {
        type: "TextBlock",
        isSubtle: true,
        wrap: true,
        color: approved ? "default" : "attention",
        text: approved
          ? isAllMember
            ? `✔️ Thanks! Your safety check message ${msg} sent to all the users`
            : `✔️ Thanks! Your safety check message ${msg} sent to all the selected user(s)`
          : "❗ Your incident has been cancelled.",
      },
    ],
    msteams: {
      entities: mentionUserEntities,
    },
  };
};
const updateSafeMessage = (
  incTitle,
  responseText,
  incCreatedBy,
  response,
  userId,
  incId,
  companyData,
  inc,
  incGuidance
) => {
  var isVisi = false;
  if (incGuidance != "") isVisi = true;
  var card = {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.4",
    body: [
      {
        type: "TextBlock",
        text: `Additional Comments`,
        wrap: true,
      },
      {
        type: "Input.Text",
        placeholder:
          "For example - Daniel Foster is stuck in the elevator on the 7th floor.",
        style: "text",
        id: "commentVal",
        isMultiline: true,
      },
      {
        type: "ActionSet",
        actions: [
          {
            type: "Action.Execute",
            verb: "submit_comment",
            title: "Send",
            data: {
              eventResponse: response,
              userId: userId,
              incId: incId,
              incTitle: incTitle,
              incCreatedBy: incCreatedBy,
              companyData: companyData,
              inc,
            },
          },
        ],
      },
      {
        type: "TextBlock",
        separator: true,
        wrap: true,
        isVisible: isVisi,
        text: "**Guidance:**\n\n" + incGuidance,
      },
    ],
    // msteams: {
    //   entities: [
    //     {
    //       type: "mention",
    //       text: `<at>${incCreatedBy.name}</at>`,
    //       mentioned: {
    //         id: incCreatedBy.id,
    //         name: incCreatedBy.name,
    //       },
    //     },
    //   ],
    // },
    type: "AdaptiveCard",
    version: "1.4",
  };
  return card;
};

//////////////////////////////////////////////////////////
const updateSafeMessageqestion1 = (
  incTitle,
  responseText,
  incCreatedBy,
  response,
  userId,
  incId,
  companyData,
  inc,
  incGuidance
) => {
  var card = {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.4",
    body: [
      {
        type: "TextBlock",
        text: companyData.SafetycheckForVisitorsQuestion1,
        wrap: true,
      },

      {
        type: "ActionSet",
        actions: [
          {
            type: "Action.Execute",
            title: "Yes",
            verb: "safetyVisitorQuestion1",
            data: {
              info: "question1_yes",
              eventResponse: response,
              userId: userId,
              incId: incId,
              incTitle: incTitle,
              incCreatedBy: incCreatedBy,
              companyData: companyData,
              inc,
            },
          },
          {
            type: "Action.Execute",
            title: "No",
            verb: "safetyVisitorQuestion1",
            data: {
              info: "question1_no",
              eventResponse: response,
              userId: userId,
              incId: incId,
              incTitle: incTitle,
              incCreatedBy: incCreatedBy,
              companyData: companyData,
              inc,
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

const updateSafeMessageqestion2 = (
  incTitle,
  responseText,
  incCreatedBy,
  response,
  userId,
  incId,
  companyData,
  inc,
  incGuidance
) => {
  var card = {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.4",
    body: [
      {
        type: "TextBlock",
        text: companyData.SafetycheckForVisitorsQuestion2,
        wrap: true,
      },

      {
        type: "ActionSet",
        actions: [
          {
            type: "Action.Execute",
            title: "Yes",
            verb: "safetyVisitorQuestion2",
            data: {
              info: "question2_yes",
              eventResponse: response,
              userId: userId,
              incId: incId,
              incTitle: incTitle,
              incCreatedBy: incCreatedBy,
              companyData: companyData,
              inc,
            },
          },
          {
            type: "Action.Execute",
            title: "No",
            verb: "safetyVisitorQuestion2",
            data: {
              info: "question2_no",
              eventResponse: response,
              userId: userId,
              incId: incId,
              incTitle: incTitle,
              incCreatedBy: incCreatedBy,
              companyData: companyData,
              inc,
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

const updateSafeMessageqestion3 = (
  incTitle,
  responseText,
  incCreatedBy,
  response,
  userId,
  incId,
  companyData,
  inc,
  incGuidance
) => {
  var card = {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.4",
    body: [
      {
        type: "TextBlock",
        text: companyData.SafetycheckForVisitorsQuestion3,
        wrap: true,
      },
      {
        type: "Input.Text",
        placeholder:
          "For example - I have a client stuck in the elevator on the 18th floor. Alex Jones - 760-319-4378",
        style: "text",
        id: "commentVal",
        isMultiline: true,
      },
      {
        type: "ActionSet",
        actions: [
          {
            type: "Action.Execute",
            verb: "safetyVisitorQuestion3",
            title: "Submit",
            data: {
              info: "question3_Submit",
              eventResponse: response,
              userId: userId,
              incId: incId,
              incTitle: incTitle,
              incCreatedBy: incCreatedBy,
              companyData: companyData,
              inc,
            },
          },
        ],
      },
    ],

    // msteams: {
    //   entities: [
    //     {
    //       type: "mention",
    //       text: `<at>${incCreatedBy.name}</at>`,
    //       mentioned: {
    //         id: incCreatedBy.id,
    //         name: incCreatedBy.name,
    //       },
    //     },
    //   ],
    // },
    type: "AdaptiveCard",
    version: "1.4",
  };
  return card;
};

const updateSubmitCommentCard = (responseText, incCreatedBy) => {
  return {
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
};
const updateDeleteCard = () => {
  return {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.4",
    body: [
      {
        type: "TextBlock",
        text: `✔️ The Incident has been deleted successfully.`,
        wrap: true,
      },
    ],
  };
};

const updateSesttingsCard = () => {
  return {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.4",
    body: [
      {
        type: "TextBlock",
        text: `✔️ Your App Settings have been saved successfully.`,
        wrap: true,
      },
    ],
  };
};

const updateContactSubmitCard = (responseText, incCreatedBy) => {
  return {
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
  };
};
module.exports = {
  updateMainCard,
  updateCard,
  updateSendApprovalMessage,
  updateSafeMessage,
  updateSesttingsCard,
  updateSubmitCommentCard,
  updateDeleteCard,
  updateContactSubmitCard,
  getMobileDashboardMsgBlockJSON,
  updateSafeMessageqestion1,
  updateSafeMessageqestion2,
  updateSafeMessageqestion3,
};
