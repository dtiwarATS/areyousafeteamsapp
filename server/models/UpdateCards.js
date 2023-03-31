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

  const webUrl = `https://71b4-2405-201-36-4a04-9c5b-7081-306-bacc.ngrok.io/areYouSafeTab/index.html`;
  var encodedWebUrl = encodeURIComponent(`${webUrl}`);
  let taskContext = encodeURIComponent(
    `{"channelId":"19:PGGt1Q5U4sC5_vwpm-Fq2SQMcBVaWHYL4X0HTCt-SGo1@thread.tacv2"}`
  );

  // const webUrl = `https://areyousafeteamsprod.azurewebsites.net/areYouSafeTab/index.html`;
  // var encodedWebUrl = encodeURIComponent(`${webUrl}?&label=AreYouSafeDashboard`);
  // let taskContext = encodeURIComponent(`{"channelId":"19:3684c109f05f44efb4fb54a988d70286@thread.tacv2"}`);

  const mobileDashboardMsgBlockJSON =
    getMobileDashboardMsgBlockJSON(companyData);
  const cardActions = [
    {
      type: "Action.OpenUrl",
      title: "Dashboard",
      url: `https://teams.microsoft.com/l/entity/${process.env.MicrosoftAppId}/${process.env.tabEntityId}?webUrl=${encodedWebUrl}&context=${taskContext}`,
      id: "dashboardAction",
    },
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
  var card = {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.4",
    body: [
      {
        type: "TextBlock",
        text: `If you have any additional comments, please type them in the message box below and click on the Submit Comment button (optional)`,
        wrap: true,
      },
      {
        type: "Input.Text",
        placeholder: "Add additional comment",
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
            title: "Submit Comment",
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
        text: `**Guidance:**\n\n` + incGuidance,
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
};
