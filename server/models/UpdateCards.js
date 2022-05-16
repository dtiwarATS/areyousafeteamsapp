const updateMainCard = (companyData) => {
  return {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.4",
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
            verb: "create_recurringincident",
            title: "Create Recurring Incident",
            data: {
              option: "Create Recurring Incident",
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
        text: "Helpful Links",
        separator: true
      },
    ],
    actions: [
      {
        "type": "Action.OpenUrl",
        "url": "https://safetybot.in/Safetybot-Teams_User_Guide.pdf",
        "title": "User Guide"
      },
      {
        type: "Action.Execute",
        verb: "contact_us",
        title: "Contact Us",
        data: {
          option: "Contact Us",
          companyData: companyData,
        },
      }
    ],
  };
};
const updateCreateIncidentCard = (incidentTitle, members, text) => {
  console.log({ incidentTitle, members });
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
  isRecurringInc
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
    // actions: [
    //   {
    //     type: "Action.Execute",
    //     verb: "submit_comment",
    //     title: "Submit Comment",
    //     data: {
    //       eventResponse: response,
    //       userId: userId,
    //       incId: incId,
    //       incTitle: incTitle,
    //       incCreatedBy: incCreatedBy,
    //       companyData: companyData,
    //       inc
    //     },
    //   },
    // ],
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

const updateIncidentListCard = (companyData, incList, incidentID) => {
  return {
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
        value: incidentID ? incidentID : incList.length > 0 && incList[0].value,
        choices: incList,
        isRequired: true,
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
        verb: "view_inc_result",
        title: "Submit",
        data: {
          companyData: companyData,
        },
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
  updateCreateIncidentCard,
  updateSendApprovalMessage,
  updateSafeMessage,
  updateSesttingsCard,
  updateSubmitCommentCard,
  updateDeleteCard,
  updateIncidentListCard,
  updateContactSubmitCard,
};
