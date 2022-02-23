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
  };
};
const updateCreateIncidentCard = (incidentTitle, members) => {
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
        size: "large",
        text: `✔️ New incident '${incidentTitle}' created successfully.`,
      },
    ],
  };
};
const updateSendApprovalMessage = (
  incTitle,
  inc_created_by,
  preTextMsg,
  approved
) => {
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
          ? `✔️ Thanks! Your safety check message has been sent to all the selected user(s)`
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
  companyData
) => {
  return {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.4",
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
          userId: userId,
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
module.exports = {
  updateMainCard,
  updateCreateIncidentCard,
  updateSendApprovalMessage,
  updateSafeMessage,
  updateSesttingsCard,
  updateSubmitCommentCard,
  updateDeleteCard,
};
