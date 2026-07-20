/**
 * Mobile card snapshot mirroring Teams SafetyCheckCard layout + language.
 * Kept separate from SafetyCheckCard.js to avoid circular deps (bot → fcm → card → db).
 */
const {
  getBotStaticText,
  getBotStaticTextWithIncident,
  getTranslatedField,
  applyBotStaticPlaceholders,
  buildSafeResponseThankYouText,
  DEFAULT_LANGUAGE_ID,
} = require("../utils/botStaticTranslations");

const toMobilePlainText = (text, creatorName) =>
  String(text || "")
    .replace(/<\/?at>/gi, "")
    .replace(/<IncidentCreator>/g, creatorName)
    .replace(/\*\*/g, "")
    .replace(/^✔️\s*/u, "")
    .trim();

const buildMobileUiStrings = (creatorName, languageId, translatedText) => {
  const incidentCreator = { name: creatorName };
  const thankYouRaw = buildSafeResponseThankYouText(
    incidentCreator,
    languageId,
    translatedText,
  );
  const additionalCommentsLabel = getBotStaticTextWithIncident(
    "additionalComments",
    languageId,
    translatedText,
    "Additional Comments",
  );
  const sendLabel = getBotStaticTextWithIncident(
    "sendButton",
    languageId,
    translatedText,
    "Send",
  );
  let commentTemplate = getBotStaticTextWithIncident(
    "submitCommentWithMessage",
    languageId,
    translatedText,
    "✔️ Your message has been sent to <IncidentCreator>. Someone will be in touch with you as soon as possible \n\n **{AdditionalCommentsLabel}**: {CommentVal}",
  );
  commentTemplate = applyBotStaticPlaceholders(commentTemplate, {
    incidentCreator,
    AdditionalCommentsLabel: additionalCommentsLabel,
    CommentVal: "",
  });
  const commentSentIntro = toMobilePlainText(
    String(commentTemplate).split("\n\n")[0],
    creatorName,
  );

  return {
    thankYouText: toMobilePlainText(thankYouRaw, creatorName),
    additionalCommentsLabel,
    sendLabel,
    commentSentIntro,
  };
};

const resolveLanguageId = (languageId) =>
  languageId != null && languageId !== ""
    ? languageId
    : DEFAULT_LANGUAGE_ID;

const resolveTranslatedIncidentFields = (translatedText, languageId, fields) => {
  return {
    incGuidance: getTranslatedField(
      translatedText,
      "guidance",
      languageId,
      fields.incGuidance,
    ),
    additionalInfo: getTranslatedField(
      translatedText,
      "additionalInfo",
      languageId,
      fields.additionalInfo,
    ),
    travelUpdate: getTranslatedField(
      translatedText,
      "travelUpdate",
      languageId,
      fields.travelUpdate,
    ),
    contactInfo: getTranslatedField(
      translatedText,
      "contactInfo",
      languageId,
      fields.contactInfo,
    ),
    situation: getTranslatedField(
      translatedText,
      "situation",
      languageId,
      fields.situation,
    ),
  };
};

const resolveTranslatedResponseOptionData = (
  translatedText,
  languageId,
  responseOptionData,
) => {
  if (
    !translatedText ||
    !languageId ||
    !responseOptionData?.responseOptions?.length
  ) {
    return responseOptionData;
  }
  return {
    ...responseOptionData,
    responseOptions: responseOptionData.responseOptions.map((opt) => ({
      ...opt,
      option: getTranslatedField(
        translatedText,
        opt.option,
        languageId,
        opt.option,
      ),
    })),
  };
};

/**
 * Plain JSON snapshot of what Teams Adaptive Cards show — for mobile FCM / in-app UI.
 */
const buildMobileCardSnapshot = (
  incTitle,
  incObj,
  incGuidance,
  incTypeId,
  additionalInfo,
  travelUpdate,
  contactInfo,
  situation,
  languageId = null,
) => {
  const lang = resolveLanguageId(languageId);
  const translatedText =
    incObj?.translatedtext ||
    incObj?.TRANSLATED_TEXT_JSON ||
    null;
  let fields = {
    incGuidance,
    additionalInfo,
    travelUpdate,
    contactInfo,
    situation,
  };
  let responseOptionData = incObj?.responseOptionData || null;
  if (translatedText && lang) {
    fields = resolveTranslatedIncidentFields(translatedText, lang, fields);
    if (responseOptionData) {
      responseOptionData = resolveTranslatedResponseOptionData(
        translatedText,
        lang,
        responseOptionData,
      );
    }
  }

  const creatorName =
    incObj?.incCreatedBy?.name ||
    incObj?.createdByName ||
    "your admin";

  const t = (key, fallback) => getBotStaticText(key, lang, fallback);

  const hello = t("hello", "Hello!");
  const guidanceLabel = t("guidanceLabel", "Guidance");
  const additionalInfoLabel = t(
    "additionalInformationLabel",
    "Additional Information",
  );
  const travelUpdateLabel = t("travelUpdateLabel", "Travel Update");
  const contactInfoLabel = t("contactInformationLabel", "Contact Information");
  const situationLabel = t("situationLabel", "Situation");

  const typeId = Number(incTypeId) || 1;
  let intro = "";
  let sectionTitle = "";
  const sections = [];

  if (typeId === 1) {
    if (fields.incGuidance) {
      intro = String(fields.incGuidance)
        .replace(/<IncidentCreator>/g, creatorName)
        .replace(/<IncidentTitle>/g, incTitle || "")
        .replace(/<\/?at>/gi, "")
        .replace(/\*\*/g, "");
    } else {
      intro = `This is a safety check from ${creatorName}. We think you may be affected by ${
        incTitle || "this event"
      }. Mark yourself as safe, or ask for assistance.`;
    }
  } else if (typeId === 2) {
    intro = applyBotStaticPlaceholders(
      t(
        "safetyAlertMessage",
        "This is a safety alert from <IncidentCreator>. We think you may be affected by **{IncidentTitle}**.",
      ),
      {
        incidentCreator: { name: creatorName },
        IncidentTitle: incTitle || "",
      },
    )
      .replace(/<\/?at>/gi, "")
      .replace(/\*\*/g, "");
    if (fields.incGuidance) {
      sections.push({ label: guidanceLabel, text: String(fields.incGuidance) });
    }
  } else if (typeId === 3) {
    intro = applyBotStaticPlaceholders(
      t(
        "importantBulletinIntro",
        "This is an important bulletin from <IncidentCreator>.",
      ),
      { incidentCreator: { name: creatorName } },
    ).replace(/<\/?at>/gi, "");
    sectionTitle = applyBotStaticPlaceholders(
      t("importantBulletinTitle", "Important Bulletin: {IncidentTitle}"),
      { IncidentTitle: incTitle || "" },
    ).replace(/\*\*/g, "");
    if (fields.incGuidance) {
      sections.push({ label: guidanceLabel, text: String(fields.incGuidance) });
    }
    if (fields.additionalInfo) {
      sections.push({
        label: additionalInfoLabel,
        text: String(fields.additionalInfo),
      });
    }
  } else if (typeId === 4) {
    intro = applyBotStaticPlaceholders(
      t(
        "travelAdvisoryIntro",
        "This is a travel advisory from <IncidentCreator>.",
      ),
      { incidentCreator: { name: creatorName } },
    ).replace(/<\/?at>/gi, "");
    sectionTitle = applyBotStaticPlaceholders(
      t("travelAdvisoryTitle", "Travel Advisory: {IncidentTitle}"),
      { IncidentTitle: incTitle || "" },
    ).replace(/\*\*/g, "");
    if (fields.travelUpdate) {
      sections.push({
        label: travelUpdateLabel,
        text: String(fields.travelUpdate),
      });
    }
    if (fields.incGuidance) {
      sections.push({ label: guidanceLabel, text: String(fields.incGuidance) });
    }
    if (fields.contactInfo) {
      sections.push({
        label: contactInfoLabel,
        text: String(fields.contactInfo),
      });
    }
  } else if (typeId === 5) {
    intro = applyBotStaticPlaceholders(
      t(
        "stakeholderNoticeIntro",
        "This is a stakeholder notice from <IncidentCreator>.",
      ),
      { incidentCreator: { name: creatorName } },
    ).replace(/<\/?at>/gi, "");
    sectionTitle = applyBotStaticPlaceholders(
      t("stakeholderNoticeTitle", "Stakeholder Notice: {IncidentTitle}"),
      { IncidentTitle: incTitle || "" },
    ).replace(/\*\*/g, "");
    if (fields.situation) {
      sections.push({ label: situationLabel, text: String(fields.situation) });
    }
    if (fields.additionalInfo) {
      sections.push({
        label: additionalInfoLabel,
        text: String(fields.additionalInfo),
      });
    }
  } else {
    intro = `This is a safety check from ${creatorName}. We think you may be affected by ${
      incTitle || "this event"
    }. Mark yourself as safe, or ask for assistance.`;
  }

  const options = (responseOptionData?.responseOptions || [])
    .filter((o) => o && String(o.option || "").trim())
    .map((o, index) => {
      const parsedId = Number.parseInt(String(o.id), 10);
      return {
        id: Number.isFinite(parsedId) && parsedId >= 1 ? parsedId : index + 1,
        option: String(o.option),
        color: o.color || "",
      };
    });

  const responseType = responseOptionData?.responseType || "buttons";
  const showResponseActions =
    typeId === 1 || typeId === 2 || options.length > 0;

  return {
    languageId: String(lang),
    hello,
    intro: intro.replace(/\s+/g, " ").trim(),
    sectionTitle: sectionTitle.replace(/\s+/g, " ").trim(),
    sections,
    responseType,
    responseOptions: options,
    showResponseActions,
    isDrill: !!(incObj?.isDrill === true || incObj?.IS_DRILL),
    incGuidance: fields.incGuidance || "",
    additionalInfo: fields.additionalInfo || "",
    travelUpdate: fields.travelUpdate || "",
    contactInfo: fields.contactInfo || "",
    situation: fields.situation || "",
    uiStrings: buildMobileUiStrings(creatorName, lang, translatedText),
  };
};

module.exports = {
  buildMobileCardSnapshot,
  resolveTranslatedIncidentFields,
  resolveTranslatedResponseOptionData,
};
