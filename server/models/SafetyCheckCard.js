const incidentService = require("../services/incidentService");
const dashboard = require("../models/dashboard");
const {
  getBotStaticTextWithIncident,
  getIncidentTranslatedText,
  getTranslatedField,
  applyBotStaticPlaceholders,
  DEFAULT_LANGUAGE_ID,
} = require("../utils/botStaticTranslations");

const resolveLanguageId = (languageId) =>
  languageId != null && languageId !== ""
    ? languageId
    : DEFAULT_LANGUAGE_ID;

const getCardText = (key, languageId, translatedText, fallback) =>
  getBotStaticTextWithIncident(
    key,
    resolveLanguageId(languageId),
    translatedText,
    fallback,
  );

const getCardIntroText = (
  key,
  languageId,
  translatedText,
  incCreatedByName,
  fallback,
) =>
  applyBotStaticPlaceholders(
    getCardText(key, languageId, translatedText, fallback),
    {
      incidentCreator: { name: incCreatedByName },
    },
  );

const getCardTitleText = (key, languageId, translatedText, incTitle, fallback) =>
  applyBotStaticPlaceholders(
    getCardText(key, languageId, translatedText, fallback),
    {
      IncidentTitle: incTitle,
    },
  );

const getCardMessageWithCreatorAndTitle = (
  key,
  languageId,
  translatedText,
  createdByName,
  incTitle,
  fallback,
) =>
  applyBotStaticPlaceholders(
    getCardText(key, languageId, translatedText, fallback),
    {
      incidentCreator: { name: createdByName },
      IncidentTitle: incTitle,
    },
  );

const getLabeledSectionText = (
  labelKey,
  languageId,
  translatedText,
  content,
  fallbackLabel,
) => {
  const label = getCardText(
    labelKey,
    languageId,
    translatedText,
    fallbackLabel,
  );
  return `**${label}:**\n\n` + content;
};

const getResponseDropdownStrings = (languageId, translatedText) => ({
  placeholder: getCardText(
    "selectResponsePlaceholder",
    languageId,
    translatedText,
    "Select response",
  ),
  errorMessage: getCardText(
    "selectResponseError",
    languageId,
    translatedText,
    "Please select a response.",
  ),
  confirmTitle: getCardText(
    "confirmButton",
    languageId,
    translatedText,
    "Confirm",
  ),
});

const getSafetyCheckMessageText = async (
  incId,
  createdByName,
  incTitle,
  mentionUserEntities,
  incRespSelectedUsers = null,
  incTypeId = 1,
  incGuidance,
  languageId = null,
  translatedText = null,
) => {
  let onBehalfOf = "",
    responseUsers = "";
  if (incTypeId == 1) {
    // if (incRespSelectedUsers == null) {
    //   incRespSelectedUsers =
    //     await incidentService.getIncResponseSelectedUsersList(incId);
    // }
    // if (incRespSelectedUsers != null && incRespSelectedUsers.length > 0) {
    //   for (let i = 0; i < incRespSelectedUsers.length; i++) {
    //     const { user_id: userId, user_name: userName } =
    //       incRespSelectedUsers[i];
    //     responseUsers +=
    //       (responseUsers != "" ? ", " : "") + `<at>${userName}</at>`;
    //     dashboard.mentionUser(mentionUserEntities, userId, userName);
    //   }
    // }
    // if (responseUsers != "") {
    //   onBehalfOf = ` on behalf of ${responseUsers}`;
    // }
  }
  let msg = "";
  if (incTypeId == 1) {
    if (incGuidance) {
      let escaped = escapeRegex("<IncidentCreator>");
      let regex = new RegExp(escaped, "g");

      msg = incGuidance.replace(regex, `<at>${createdByName}</at>`);

      escaped = escapeRegex("<IncidentTitle>");
      regex = new RegExp(escaped, "g");
      msg = msg.replace(regex, `**${incTitle}**`);
    } else {
      //Safety Check
      msg = `This is a safety check from <at>${createdByName}</at>${onBehalfOf}. We think you may be affected by **${incTitle}**. Mark yourself as safe, or ask for assistance.`;
    }
  } else if (incTypeId == 2) {
    msg = getCardMessageWithCreatorAndTitle(
      "safetyAlertMessage",
      languageId,
      translatedText,
      createdByName,
      incTitle,
      "This is a safety alert from <IncidentCreator>. We think you may be affected by **{IncidentTitle}**.",
    );
  }
  return msg;
};
const escapeRegex = (text) => {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

const getHelloText = (languageId, translatedText) =>
  getBotStaticTextWithIncident(
    "hello",
    resolveLanguageId(languageId),
    translatedText,
    "Hello!",
  );

const resolveTranslatedIncidentFields = (
  translatedText,
  languageId,
  fields,
) => {
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

const getTranslatedOptionText = (
  translatedText,
  optionText,
  languageId,
  fallback,
) => {
  return getTranslatedField(translatedText, optionText, languageId, fallback);
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
      option: getTranslatedOptionText(
        translatedText,
        opt.option,
        languageId,
        opt.option,
      ),
    })),
  };
};
const getSafetyCheckTypeCard = async (
  incTitle,
  incObj,
  companyData,
  incGuidance,
  incResponseSelectedUsersList,
  incTypeId,
  safetyCheckMessageText = null,
  incCreatedById = null,
  incCreatedByName = null,
  isPreview = false,
  languageId = null,
) => {
  const mentionUserEntities = [];
  const translatedText = getIncidentTranslatedText(incObj);
  if (!safetyCheckMessageText) {
    safetyCheckMessageText = await getSafetyCheckMessageText(
      incObj.incId,
      incObj.incCreatedBy.name,
      incTitle,
      mentionUserEntities,
      incResponseSelectedUsersList,
      incTypeId,
      incGuidance,
      languageId,
      translatedText,
    );
  }
  if (!incCreatedById) {
    incCreatedById = incObj.incCreatedBy.id;
  }
  if (!incCreatedByName) {
    incCreatedByName = incObj.incCreatedBy.name;
  }
  if (
    !(
      incTypeId == 1 &&
      safetyCheckMessageText.indexOf(incObj.incCreatedBy.name) == -1
    )
  ) {
    dashboard.mentionUser(
      mentionUserEntities,
      incCreatedById,
      incCreatedByName,
    );
  }

  const cardBody = [
    {
      type: "TextBlock",
      size: "Large",
      weight: "Bolder",
      text: getHelloText(languageId, translatedText),
    },
    {
      type: "TextBlock",
      separator: true,
      wrap: true,
      text: safetyCheckMessageText,
    },
  ];
  if (incObj?.isDrill === true) {
    const drillIconSvgDataUri =
      "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23D26A00' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z'/><line x1='12' y1='9' x2='12' y2='13'/><line x1='12' y1='17' x2='12.01' y2='17'/></svg>";
    cardBody.unshift({
      type: "Container",
      style: "warning",
      bleed: true,
      items: [
        {
          type: "ColumnSet",
          columns: [
            {
              type: "Column",
              width: "auto",
              items: [
                {
                  type: "Image",
                  url: drillIconSvgDataUri,
                  size: "Small",
                },
              ],
              verticalContentAlignment: "Center",
            },
            {
              type: "Column",
              width: "stretch",
              items: [
                {
                  type: "TextBlock",
                  wrap: true,
                  //maxLines: 1,
                  text: "**THIS IS A DRILL.** Please respond as you would in a real event.",
                },
              ],
              verticalContentAlignment: "Center",
            },
          ],
        },
      ],
    });
  }
  if (incTypeId == 2) {
    cardBody.push({
      type: "TextBlock",
      separator: true,
      wrap: true,
      isVisible: incGuidance ? true : false,
      text: getLabeledSectionText(
        "guidanceLabel",
        languageId,
        translatedText,
        incGuidance,
        "Guidance",
      ),
    });
  }
  if (incTypeId == 1 || incTypeId == 2) {
    let btnSafe = {
      type: "Action.Execute",
      title: "I am safe",
    };
    let btnAssistance = {
      type: "Action.Execute",
      title: "I need assistance",
    };
    let actions = [];
    if (!isPreview) {
      const responseOptionData = incObj.responseOptionData;
      if (responseOptionData.responseType.toLowerCase() == "buttons") {
        responseOptionData.responseOptions.map((option, index) => {
          if (option.option != "") {
            let btn = {
              ...btnSafe,
              title: option.option,
              verb: "send_response",
              data: {
                info: option.id,
                inc: incObj,
                companyData: companyData,
                languageId: languageId,
              },
            };
            actions.push(btn);
          }
        });
      } else {
        const dropdownStrings = getResponseDropdownStrings(
          languageId,
          translatedText,
        );
        let dropdown = {
          type: "Input.ChoiceSet",
          id: "dropdownSelection",
          style: "compact", // Use "expanded" for always visible options
          isRequired: true,
          placeholder: dropdownStrings.placeholder,
          errorMessage: dropdownStrings.errorMessage,
          choices: [],
        };
        responseOptionData.responseOptions.map((option, index) => {
          if (option.option != "") {
            dropdown.choices.push({
              title: option.option,
              value: option.id.toString(),
            });
          }
        });
        cardBody.push(dropdown);
        let btnSafe = {
          type: "Action.Execute",
          title: dropdownStrings.confirmTitle,
          verb: "send_response",
          associatedInputs: "auto",
          data: {
            info: "dropdown_selection",
            inc: incObj,
            companyData: companyData,
            languageId: languageId,
          },
        };
        actions.push(btnSafe);
      }
      // btnSafe = {
      //   ...btnSafe,
      //   verb: "send_response",
      //   data: {
      //     info: "i_am_safe",
      //     inc: incObj,
      //     companyData: companyData,
      //   },
      // };
      // btnAssistance = {
      //   ...btnAssistance,
      //   verb: "send_response",
      //   data: {
      //     info: "need_assistance",
      //     inc: incObj,
      //     companyData: companyData,
      //   },
      // };
    } else {
      actions.push(btnSafe);
      actions.push(btnAssistance);
    }
    cardBody.push({
      type: "ActionSet",
      actions: actions,
    });
  } else {
    cardBody.push({
      type: "TextBlock",
      separator: true,
      wrap: true,
      isVisible: incGuidance ? true : false,
      text: getLabeledSectionText(
        "guidanceLabel",
        languageId,
        translatedText,
        incGuidance,
        "Guidance",
      ),
    });
  }
  // if (incTypeId == 2) {
  //   cardBody.push({
  //     type: "TextBlock",
  //     separator: true,
  //     wrap: true,
  //     isVisible: incGuidance ? true : false,
  //     text: `**Guidance:**\n\n` + incGuidance,
  //   });
  // }
  return {
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    appId: process.env.MicrosoftAppId,
    body: cardBody,
    msteams: {
      width: "full",
      entities: mentionUserEntities,
    },
    type: "AdaptiveCard",
    version: "1.5",
  };
};

const getImpBulletineTypeCard = async (
  incTitle,
  incGuidance,
  additionalInfo,
  incCreatedById,
  incCreatedByName,
  incObj,
  companyData,
  languageId = null,
) => {
  const translatedText = getIncidentTranslatedText(incObj);
  const cardBody = [
    {
      type: "TextBlock",
      size: "Large",
      weight: "Bolder",
      text: getHelloText(languageId, translatedText),
    },
    {
      type: "TextBlock",
      separator: true,
      wrap: true,
      text: getCardIntroText(
        "importantBulletinIntro",
        languageId,
        translatedText,
        incCreatedByName,
        `This is an important bulletin from <IncidentCreator>.`,
      ),
    },
    {
      type: "TextBlock",
      size: "Medium",
      weight: "Bolder",
      wrap: true,
      text: getCardTitleText(
        "importantBulletinTitle",
        languageId,
        translatedText,
        incTitle,
        `**Important Bulletin: {IncidentTitle}**`,
      ),
    },
    {
      type: "TextBlock",
      wrap: true,
      isVisible: incGuidance ? true : false,
      text: getLabeledSectionText(
        "guidanceLabel",
        languageId,
        translatedText,
        incGuidance,
        "Guidance",
      ),
    },
    {
      type: "TextBlock",
      wrap: true,
      isVisible: additionalInfo ? true : false,
      text: getLabeledSectionText(
        "additionalInformationLabel",
        languageId,
        translatedText,
        additionalInfo,
        "Additional Information",
      ),
    },
  ];
  let actions = [];
  const responseOptionData = incObj.responseOptionData;
  if (responseOptionData?.responseType.toLowerCase() == "buttons") {
    responseOptionData?.responseOptions.map((option, index) => {
      if (option.option != "") {
        let btn = {
          type: "Action.Execute",
          title: option.option,
          verb: "send_response",
          data: {
            info: option.id,
            inc: incObj,
            companyData: companyData,
            languageId: languageId,
          },
        };
        actions.push(btn);
      }
    });
  } else {
    const dropdownStrings = getResponseDropdownStrings(languageId, translatedText);
    let dropdown = {
      type: "Input.ChoiceSet",
      id: "dropdownSelection",
      style: "compact", // Use "expanded" for always visible options
      isRequired: true,
      placeholder: dropdownStrings.placeholder,
      errorMessage: dropdownStrings.errorMessage,
      choices: [],
    };
    responseOptionData.responseOptions.map((option, index) => {
      if (option.option != "") {
        dropdown.choices.push({
          title: option.option,
          value: option.id.toString(),
        });
      }
    });
    cardBody.push(dropdown);
    let btnSafe = {
      type: "Action.Execute",
      title: dropdownStrings.confirmTitle,
      verb: "send_response",
      associatedInputs: "auto",
      data: {
        info: "dropdown_selection",
        inc: incObj,
        companyData: companyData,
        languageId: languageId,
      },
    };
    actions.push(btnSafe);
  }
  cardBody.push({
    type: "ActionSet",
    actions: actions,
  });

  const mentionUserEntities = [];
  dashboard.mentionUser(mentionUserEntities, incCreatedById, incCreatedByName);
  return {
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    appId: process.env.MicrosoftAppId,
    body: cardBody,
    type: "AdaptiveCard",
    version: "1.4",
    msteams: {
      entities: mentionUserEntities,
    },
  };
};

const getTravelAdvisoryTypeCard = async (
  incTitle,
  incGuidance,
  travelUpdate,
  contactInfo,
  incCreatedById,
  incCreatedByName,
  incObj,
  companyData,
  languageId = null,
) => {
  const translatedText = getIncidentTranslatedText(incObj);
  const cardBody = [
    {
      type: "TextBlock",
      size: "Large",
      weight: "Bolder",
      text: getHelloText(languageId, translatedText),
    },
    {
      type: "TextBlock",
      separator: true,
      wrap: true,
      text: getCardIntroText(
        "travelAdvisoryIntro",
        languageId,
        translatedText,
        incCreatedByName,
        `This is a travel advisory from <IncidentCreator>.`,
      ),
    },
    {
      type: "TextBlock",
      size: "Medium",
      weight: "Bolder",
      wrap: true,
      text: getCardTitleText(
        "travelAdvisoryTitle",
        languageId,
        translatedText,
        incTitle,
        `**Travel Advisory: {IncidentTitle}**`,
      ),
    },
    {
      type: "TextBlock",
      wrap: true,
      isVisible: travelUpdate ? true : false,
      text: getLabeledSectionText(
        "travelUpdateLabel",
        languageId,
        translatedText,
        travelUpdate,
        "Travel Update",
      ),
    },
    {
      type: "TextBlock",
      wrap: true,
      isVisible: incGuidance ? true : false,
      text: getLabeledSectionText(
        "guidanceLabel",
        languageId,
        translatedText,
        incGuidance,
        "Guidance",
      ),
    },
    {
      type: "TextBlock",
      wrap: true,
      isVisible: contactInfo ? true : false,
      text: getLabeledSectionText(
        "contactInformationLabel",
        languageId,
        translatedText,
        contactInfo,
        "Contact Information",
      ),
    },
  ];
  let actions = [];
  const responseOptionData = incObj.responseOptionData;
  if (responseOptionData.responseType.toLowerCase() == "buttons") {
    responseOptionData.responseOptions.map((option, index) => {
      if (option.option != "") {
        let btn = {
          type: "Action.Execute",
          title: option.option,
          verb: "send_response",
          data: {
            info: option.id,
            inc: incObj,
            companyData: companyData,
            languageId: languageId,
          },
        };
        actions.push(btn);
      }
    });
  } else {
    const dropdownStrings = getResponseDropdownStrings(languageId, translatedText);
    let dropdown = {
      type: "Input.ChoiceSet",
      id: "dropdownSelection",
      style: "compact", // Use "expanded" for always visible options
      isRequired: true,
      placeholder: dropdownStrings.placeholder,
      errorMessage: dropdownStrings.errorMessage,
      choices: [],
    };
    responseOptionData.responseOptions.map((option, index) => {
      if (option.option != "") {
        dropdown.choices.push({
          title: option.option,
          value: option.id.toString(),
        });
      }
    });
    cardBody.push(dropdown);
    let btnSafe = {
      type: "Action.Execute",
      title: dropdownStrings.confirmTitle,
      verb: "send_response",
      associatedInputs: "auto",
      data: {
        info: "dropdown_selection",
        inc: incObj,
        companyData: companyData,
        languageId: languageId,
      },
    };
    actions.push(btnSafe);
  }
  cardBody.push({
    type: "ActionSet",
    actions: actions,
  });

  const mentionUserEntities = [];
  dashboard.mentionUser(mentionUserEntities, incCreatedById, incCreatedByName);
  return {
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    appId: process.env.MicrosoftAppId,
    body: cardBody,
    type: "AdaptiveCard",
    version: "1.4",
    msteams: {
      entities: mentionUserEntities,
    },
  };
};

const getStakeholderNoticeTypeCard = async (
  incTitle,
  situation,
  additionalInfo,
  incCreatedById,
  incCreatedByName,
  incObj,
  companyData,
  languageId = null,
) => {
  const translatedText = getIncidentTranslatedText(incObj);
  const cardBody = [
    {
      type: "TextBlock",
      size: "Large",
      weight: "Bolder",
      text: getHelloText(languageId, translatedText),
    },
    {
      type: "TextBlock",
      separator: true,
      wrap: true,
      text: getCardIntroText(
        "stakeholderNoticeIntro",
        languageId,
        translatedText,
        incCreatedByName,
        `This is a stakeholder notice from <IncidentCreator>.`,
      ),
    },
    {
      type: "TextBlock",
      size: "Medium",
      weight: "Bolder",
      wrap: true,
      text: getCardTitleText(
        "stakeholderNoticeTitle",
        languageId,
        translatedText,
        incTitle,
        `**Stakeholder Notice: {IncidentTitle}**`,
      ),
    },
    {
      type: "TextBlock",
      wrap: true,
      isVisible: situation ? true : false,
      text: getLabeledSectionText(
        "situationLabel",
        languageId,
        translatedText,
        situation,
        "Situation",
      ),
    },
    {
      type: "TextBlock",
      wrap: true,
      isVisible: additionalInfo ? true : false,
      text: getLabeledSectionText(
        "additionalInformationLabel",
        languageId,
        translatedText,
        additionalInfo,
        "Additional Information",
      ),
    },
  ];
  let actions = [];
  const responseOptionData = incObj.responseOptionData;
  if (responseOptionData.responseType.toLowerCase() == "buttons") {
    responseOptionData.responseOptions.map((option, index) => {
      if (option.option != "") {
        let btn = {
          type: "Action.Execute",
          title: option.option,
          verb: "send_response",
          data: {
            info: option.id,
            inc: incObj,
            companyData: companyData,
            languageId: languageId,
          },
        };
        actions.push(btn);
      }
    });
  } else {
    const dropdownStrings = getResponseDropdownStrings(languageId, translatedText);
    let dropdown = {
      type: "Input.ChoiceSet",
      id: "dropdownSelection",
      style: "compact", // Use "expanded" for always visible options
      isRequired: true,
      placeholder: dropdownStrings.placeholder,
      errorMessage: dropdownStrings.errorMessage,
      choices: [],
    };
    responseOptionData.responseOptions.map((option, index) => {
      if (option.option != "") {
        dropdown.choices.push({
          title: option.option,
          value: option.id.toString(),
        });
      }
    });
    cardBody.push(dropdown);
    let btnSafe = {
      type: "Action.Execute",
      title: dropdownStrings.confirmTitle,
      verb: "send_response",
      associatedInputs: "auto",
      data: {
        info: "dropdown_selection",
        inc: incObj,
        companyData: companyData,
        languageId: languageId,
      },
    };
    actions.push(btnSafe);
  }
  cardBody.push({
    type: "ActionSet",
    actions: actions,
  });

  const mentionUserEntities = [];
  dashboard.mentionUser(mentionUserEntities, incCreatedById, incCreatedByName);
  return {
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    appId: process.env.MicrosoftAppId,
    body: cardBody,
    type: "AdaptiveCard",
    version: "1.4",
    msteams: {
      entities: mentionUserEntities,
    },
  };
};

const SafetyCheckCard = async (
  incTitle,
  incObj,
  companyData,
  incGuidance,
  incResponseSelectedUsersList,
  incTypeId,
  additionalInfo,
  travelUpdate,
  contactInfo,
  situation,
  languageId = null,
) => {
  const translatedText = incObj?.translatedtext || incObj?.TRANSLATED_TEXT_JSON;
  let cardIncObj = incObj;
  if (translatedText && languageId) {
    ({ incGuidance, additionalInfo, travelUpdate, contactInfo, situation } =
      resolveTranslatedIncidentFields(translatedText, languageId, {
        incGuidance,
        additionalInfo,
        travelUpdate,
        contactInfo,
        situation,
      }));
    if (incObj.responseOptionData) {
      cardIncObj = {
        ...incObj,
        responseOptionData: resolveTranslatedResponseOptionData(
          translatedText,
          languageId,
          incObj.responseOptionData,
        ),
      };
    }
  }
  let card = null;
  switch (incTypeId) {
    case 1: //Safety Check
      card = await getSafetyCheckTypeCard(
        incTitle,
        cardIncObj,
        companyData,
        incGuidance,
        incResponseSelectedUsersList,
        incTypeId,
        null,
        null,
        null,
        false,
        languageId,
      );
      break;
    case 2: //Safety Alert
      card = await getSafetyCheckTypeCard(
        incTitle,
        cardIncObj,
        companyData,
        incGuidance,
        null,
        incTypeId,
        null,
        null,
        null,
        false,
        languageId,
      );
      break;
    case 3: //Important Bulletin
      card = await getImpBulletineTypeCard(
        incTitle,
        incGuidance,
        additionalInfo,
        incObj.incCreatedBy.id,
        incObj.incCreatedBy.name,
        cardIncObj,
        companyData,
        languageId,
      );
      break;
    case 4: //Travel Advisory
      card = await getTravelAdvisoryTypeCard(
        incTitle,
        incGuidance,
        travelUpdate,
        contactInfo,
        incObj.incCreatedBy.id,
        incObj.incCreatedBy.name,
        cardIncObj,
        companyData,
        languageId,
      );
      break;
    case 5: //Stakeholder Notice
      card = await getStakeholderNoticeTypeCard(
        incTitle,
        situation,
        additionalInfo,
        incObj.incCreatedBy.id,
        incObj.incCreatedBy.name,
        cardIncObj,
        companyData,
        languageId,
      );
      break;
  }
  return card;
};

module.exports = {
  getSafetyCheckMessageText,
  SafetyCheckCard,
  getSafetyCheckTypeCard,
  getTranslatedField,
  resolveTranslatedIncidentFields,
  getTranslatedOptionText,
  resolveTranslatedResponseOptionData,
};
