const updateMainCard = (companyData) => {
  const cardActions = [
    {
      "type": "Action.OpenUrl",
      "title": "Frequently Asked Questions",
      "url": "https://safetybot.in/frequently_asked_questions.html",
      "iconUrl": "https://safetybot.in/img/help.png"
    },
    {
      "type": "Action.OpenUrl",
      "title": "Contact us",
      "url": "mailto:help@areyousafe.in",
    }
  ];
  const card = {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.4",
    body: [
      {
        type: "TextBlock",
        wrap: true,
        "text": "Hello! Click on the **Dashboard tab** above to access all features.",
      },
      {
        type: "ActionSet",
        actions: cardActions,
      }
    ]
  };
  if (companyData != null && companyData.membersCount != null && Number(companyData.membersCount) > 0 && companyData.userEmail != null) {
    const manageSubscriptionBtnJSON = {
      "type": "Action.OpenUrl",
      "title": "Manage Licenses",
      "url": `https://areyousafesubscriptionpage.azurewebsites.net/?isFromSafetyBot=true&emailid=${companyData.userEmail}`,
      "iconUrl": "https://safetybot.in/img/help.png"
    }
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
              info: "i_am_safe"
            },
          },
          {
            type: "Action.Execute",
            title: "I need assistance",
            data: {
              info: "need_assistance"
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
  var msg = responseText + `\n\n If you have any additional comments, please type them in the message box below and click on the Submit Comment button (optional)`;
  var card = {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.4",
    body: [
      {
        type: "TextBlock",
        text: `${responseText}\n\n If you have any additional comments, please type them in the message box below and click on the Submit Comment button (optional)`,
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
              inc
            }
          }
        ]
      },
      {
        type: "TextBlock",
        separator: true,
        wrap: true,
        text: `**Guidance:**\n\n` + incGuidance,
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
};
