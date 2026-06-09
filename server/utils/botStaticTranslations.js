const path = require("path");
const botStaticTranslations = require(path.join(
  __dirname,
  "../locales/botStaticTranslations.json",
));

const DEFAULT_LANGUAGE_ID = 10000;

const getBotStaticText = (key, languageId, fallback) => {
  const field = botStaticTranslations[key];
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
  return result;
};

const buildSubmitCommentResponseText = (
  commentVal,
  incCreatedBy,
  languageId,
) => {
  const resolvedLanguageId = languageId || DEFAULT_LANGUAGE_ID;
  if (commentVal) {
    const additionalCommentsLabel = getBotStaticText(
      "additionalComments",
      resolvedLanguageId,
      "Additional Comments",
    );
    let text = getBotStaticText(
      "submitCommentWithMessage",
      resolvedLanguageId,
      "✔️ Your message has been sent to <IncidentCreator>. Someone will be in touch with you as soon as possible \n\n **{AdditionalCommentsLabel}**: {CommentVal}",
    );
    return applyBotStaticPlaceholders(text, {
      incidentCreator: incCreatedBy,
      AdditionalCommentsLabel: additionalCommentsLabel,
      CommentVal: commentVal,
    });
  }
  let text = getBotStaticText(
    "submitCommentSafetyStatus",
    resolvedLanguageId,
    "✔️ Your safety status has been sent to <IncidentCreator>. Someone will be in touch with you as soon as possible.",
  );
  return applyBotStaticPlaceholders(text, { incidentCreator: incCreatedBy });
};

const buildUserCommentedCard = (user, commentVal, incTitle, languageId) => {
  const defaultTemplate =
    "User **<at>{ResponderName}</at>** has commented for incident **{IncidentTitle}**: \n{CommentVal} ";
  let text = getBotStaticText(
    "userCommentedNotification",
    languageId,
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

const buildUserRespondedCard = (user, responseOption, incTitle, languageId) => {
  const defaultTemplate =
    "User **<at>{ResponderName}</at>** responded **{ResponseOption}** for Incident: **{IncidentTitle}** ";
  let text = getBotStaticText(
    "userRespondedNotification",
    languageId,
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
  applyBotStaticPlaceholders,
  buildUserRespondedCard,
  buildUserCommentedCard,
  buildSubmitCommentResponseText,
};
