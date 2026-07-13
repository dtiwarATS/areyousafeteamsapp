const path = require("path");
const botStaticTranslations = require(path.join(
  __dirname,
  "../locales/botStaticTranslations.json",
));
const cardStaticTranslations = require(path.join(
  __dirname,
  "../locales/cardStaticTranslations.json",
));

const mergedStaticTranslations = {
  ...botStaticTranslations,
  ...cardStaticTranslations,
};

const DEFAULT_LANGUAGE_ID = 10000;

const getBotStaticText = (key, languageId, fallback) => {
  const field = mergedStaticTranslations[key];
  if (!field) return fallback;
  const langKey =
    languageId != null && languageId !== ""
      ? String(languageId)
      : String(DEFAULT_LANGUAGE_ID);
  const value = field[langKey];
  if (value != null && value !== "") return value;
  const defaultValue = field[String(DEFAULT_LANGUAGE_ID)];
  if (defaultValue != null && defaultValue !== "") return defaultValue;
  return fallback;
};

const getIncidentTranslatedText = (incObj) =>
  incObj?.translatedtext || incObj?.TRANSLATED_TEXT_JSON;

const hasIncidentTranslations = (translatedText) =>
  translatedText != null &&
  (typeof translatedText !== "string" || translatedText.trim() !== "");

const getTranslatedField = (
  translatedText,
  fieldName,
  languageId,
  fallback,
) => {
  if (!translatedText || languageId == null || languageId === "")
    return fallback;
  try {
    const parsed =
      typeof translatedText === "string"
        ? JSON.parse(translatedText)
        : translatedText;
    const value = parsed?.[fieldName]?.[String(languageId)];
    return value != null && value !== "" ? value : fallback;
  } catch {
    return fallback;
  }
};

const getBotStaticTextWithIncident = (
  key,
  languageId,
  translatedText,
  fallback,
) => {
  if (!hasIncidentTranslations(translatedText)) {
    return fallback;
  }
  const staticText = getBotStaticText(key, languageId, fallback);
  return getTranslatedField(translatedText, key, languageId, staticText);
};

const applyBotStaticPlaceholders = (text, placeholders = {}) => {
  let result = text;
  const { incidentCreator, ResponderName, ResponseOption, IncidentTitle } =
    placeholders;

  if (incidentCreator) {
    const creatorMention = `<at>${incidentCreator.name}</at>`;
    result = result
      .replace(/<IncidentCreator>/g, creatorMention)
      .replace(/<at>\$\{incCreatedBy\.name\}<\/at>/g, creatorMention)
      .replace(/\$\{incCreatedBy\.name\}/g, incidentCreator.name);
  }
  if (ResponderName != null) {
    result = result.replace(/\{ResponderName\}/g, ResponderName);
  }
  if (ResponseOption != null) {
    result = result.replace(/\{ResponseOption\}/g, ResponseOption);
  }
  if (IncidentTitle != null) {
    result = result.replace(/\{IncidentTitle\}/g, IncidentTitle);
  }
  if (placeholders.AdditionalCommentsLabel != null) {
    result = result.replace(
      /\{AdditionalCommentsLabel\}/g,
      placeholders.AdditionalCommentsLabel,
    );
  }
  if (placeholders.CommentVal != null) {
    result = result.replace(/\{CommentVal\}/g, placeholders.CommentVal);
  }
  if (placeholders.IncidentTypeTitle != null) {
    result = result.replace(
      /\{IncidentTypeTitle\}/g,
      placeholders.IncidentTypeTitle,
    );
  }
  if (placeholders.NumberOfUsers != null) {
    result = result.replace(/\{NumberOfUsers\}/g, placeholders.NumberOfUsers);
  }
  if (placeholders.TeamName != null) {
    result = result.replace(/\{TeamName\}/g, placeholders.TeamName);
  }
  if (placeholders.ChannelName != null) {
    result = result.replace(/\{ChannelName\}/g, placeholders.ChannelName);
  }
  return result;
};

const getIncidentTypeTitle = (incTypeId, languageId, translatedText) => {
  const keyMap = {
    1: "incidentTypeSafetyCheck",
    2: "incidentTypeSafetyAlert",
    3: "incidentTypeImportantBulletin",
    4: "incidentTypeTravelAdvisory",
    5: "incidentTypeStakeholderNotice",
  };
  const defaults = {
    incidentTypeSafetyCheck: "Safety Check",
    incidentTypeSafetyAlert: "Safety Alert",
    incidentTypeImportantBulletin: "Important Bulletin",
    incidentTypeTravelAdvisory: "Travel Advisory",
    incidentTypeStakeholderNotice: "Stakeholder Notice",
  };
  const key = keyMap[incTypeId] || "incidentTypeSafetyCheck";
  return getBotStaticTextWithIncident(
    key,
    languageId,
    translatedText,
    defaults[key],
  );
};

const buildAcknowledgeMsgToCreator = (
  incTypeId,
  numberOfUsers,
  teamName,
  channelName,
  languageId,
  translatedText,
) => {
  const resolvedLanguageId = languageId || DEFAULT_LANGUAGE_ID;
  const incidentTypeTitle = getIncidentTypeTitle(
    incTypeId,
    resolvedLanguageId,
    translatedText,
  );
  const defaultTemplate = `Thanks! Your <b>{IncidentTypeTitle}</b> has been sent to {NumberOfUsers} users.<br />
Click on the <b>Dashboard tab</b> above to view the real-time safety status and access all features.<br />
For mobile, navigate to the <b>{TeamName}</b> team -> <b>{ChannelName}</b> channel -> <b>Safety Check</b> tab`;
  let text = getBotStaticTextWithIncident(
    "acknowledgeMsgToCreator",
    resolvedLanguageId,
    translatedText,
    defaultTemplate,
  );
  return applyBotStaticPlaceholders(text, {
    IncidentTypeTitle: incidentTypeTitle,
    NumberOfUsers: String(numberOfUsers),
    TeamName: teamName,
    ChannelName: channelName,
  });
};

const buildSafeResponseThankYouText = (
  incCreatedBy,
  languageId,
  translatedText,
) => {
  const defaultThankYouText =
    "Thank you for your response. Your status has been recorded and shared with <IncidentCreator>";
  let responseText = getBotStaticTextWithIncident(
    "saferesponsebtntext1",
    languageId,
    translatedText,
    defaultThankYouText,
  );
  return applyBotStaticPlaceholders(responseText, {
    incidentCreator: incCreatedBy,
  });
};

/** Strip Teams Adaptive Card / mention markup for desktop plain text. */
const stripTeamsMarkupForPlainText = (text) => {
  if (!text || typeof text !== "string") {
    return "";
  }

  return text
    .replace(/<at>(.*?)<\/at>/gi, "$1")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .trim();
};

/**
 * Same follow-up copy the bot sends after Safe / Need assistance:
 * thank-you DM + Additional Comments card labels.
 */
const buildDesktopSafeResponseFollowUp = (
  incCreatedBy,
  languageId,
  translatedText,
) => {
  const confirmationMessage = stripTeamsMarkupForPlainText(
    buildSafeResponseThankYouText(incCreatedBy, languageId, translatedText),
  );
  const additionalCommentsLabel = getBotStaticTextWithIncident(
    "additionalComments",
    languageId,
    translatedText,
    "Additional Comments",
  );
  const sendButtonLabel = getBotStaticTextWithIncident(
    "sendButton",
    languageId,
    translatedText,
    "Send",
  );

  return {
    confirmationMessage,
    ui: {
      additionalCommentsLabel,
      sendButtonLabel,
    },
  };
};

const buildSubmitCommentResponseText = (
  commentVal,
  incCreatedBy,
  languageId,
  translatedText,
) => {
  const resolvedLanguageId = languageId || DEFAULT_LANGUAGE_ID;
  if (commentVal) {
    const additionalCommentsLabel = getBotStaticTextWithIncident(
      "additionalComments",
      resolvedLanguageId,
      translatedText,
      "Additional Comments",
    );
    let text = getBotStaticTextWithIncident(
      "submitCommentWithMessage",
      resolvedLanguageId,
      translatedText,
      "✔️ Your message has been sent to <IncidentCreator>. Someone will be in touch with you as soon as possible \n\n **{AdditionalCommentsLabel}**: {CommentVal}",
    );
    return applyBotStaticPlaceholders(text, {
      incidentCreator: incCreatedBy,
      AdditionalCommentsLabel: additionalCommentsLabel,
      CommentVal: commentVal,
    });
  }
  let text = getBotStaticTextWithIncident(
    "submitCommentSafetyStatus",
    resolvedLanguageId,
    translatedText,
    "✔️ Your safety status has been sent to <IncidentCreator>. Someone will be in touch with you as soon as possible.",
  );
  return applyBotStaticPlaceholders(text, { incidentCreator: incCreatedBy });
};

/**
 * Same confirmation text the bot shows after submit_comment.
 */
const buildDesktopSubmitCommentFollowUp = (
  commentVal,
  incCreatedBy,
  languageId,
  translatedText,
) => ({
  confirmationMessage: stripTeamsMarkupForPlainText(
    buildSubmitCommentResponseText(
      commentVal,
      incCreatedBy,
      languageId,
      translatedText,
    ),
  ),
});

const buildUserCommentedCard = (
  user,
  commentVal,
  incTitle,
  languageId,
  translatedText,
) => {
  const defaultTemplate =
    "User **<at>{ResponderName}</at>** has commented for incident **{IncidentTitle}**: \n{CommentVal} ";
  let text = getBotStaticTextWithIncident(
    "userCommentedNotification",
    languageId,
    translatedText,
    defaultTemplate,
  );
  text = applyBotStaticPlaceholders(text, {
    ResponderName: user.name,
    IncidentTitle: incTitle,
    CommentVal: commentVal,
  });
  return {
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    appId: process.env.MicrosoftAppId,
    body: [
      {
        type: "TextBlock",
        text,
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
};

const buildUserRespondedCard = (
  user,
  responseOption,
  incTitle,
  languageId,
  translatedText,
) => {
  const defaultTemplate =
    "User **<at>{ResponderName}</at>** responded **{ResponseOption}** for Incident: **{IncidentTitle}** ";
  let text = getBotStaticTextWithIncident(
    "userRespondedNotification",
    languageId,
    translatedText,
    defaultTemplate,
  );
  text = applyBotStaticPlaceholders(text, {
    ResponderName: user.name,
    ResponseOption: responseOption,
    IncidentTitle: incTitle,
  });
  return {
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    appId: process.env.MicrosoftAppId,
    body: [
      {
        type: "TextBlock",
        text,
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
};

module.exports = {
  DEFAULT_LANGUAGE_ID,
  getBotStaticText,
  getBotStaticTextWithIncident,
  getIncidentTranslatedText,
  hasIncidentTranslations,
  getTranslatedField,
  applyBotStaticPlaceholders,
  getIncidentTypeTitle,
  buildAcknowledgeMsgToCreator,
  buildSafeResponseThankYouText,
  buildDesktopSafeResponseFollowUp,
  buildDesktopSubmitCommentFollowUp,
  stripTeamsMarkupForPlainText,
  buildUserRespondedCard,
  buildUserCommentedCard,
  buildSubmitCommentResponseText,
};
