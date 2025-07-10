const incidentService = require("../services/incidentService");
const dashboard = require("../models/dashboard");

const getSafetyCheckMessageText = async (
  incId,
  createdByName,
  incTitle,
  mentionUserEntities,
  incRespSelectedUsers = null,
  incTypeId = 1,
  incGuidance
) => {
  let onBehalfOf = "",
    responseUsers = "";
  if (incTypeId == 1) {
    if (incRespSelectedUsers == null) {
      incRespSelectedUsers =
        await incidentService.getIncResponseSelectedUsersList(incId);
    }
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
      let escaped = escapeRegex('<IncidentCreator>');
      let regex = new RegExp(escaped, 'g');

      msg = incGuidance.replace(regex, `<at>${createdByName}</at>`);

      escaped = escapeRegex('<IncidentTitle>');
      regex = new RegExp(escaped, 'g');
      msg = msg.replace(regex, `**${incTitle}**`);
    } else {
      //Safety Check
      msg = `This is a safety check from <at>${createdByName}</at>${onBehalfOf}. We think you may be affected by **${incTitle}**. Mark yourself as safe, or ask for assistance.`;
    }
  } else if (incTypeId == 2) {
    msg = `This is a safety alert from <at>${createdByName}</at>. We think you may be affected by **${incTitle}**.`;
  }
  return msg;
};
const escapeRegex = (text) => {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
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
) => {
  const mentionUserEntities = [];
  if (!safetyCheckMessageText) {
    safetyCheckMessageText = await getSafetyCheckMessageText(
      incObj.incId,
      incObj.incCreatedBy.name,
      incTitle,
      mentionUserEntities,
      incResponseSelectedUsersList,
      incTypeId,
      incGuidance
    );
  }
  if (!incCreatedById) {
    incCreatedById = incObj.incCreatedBy.id;
  }
  if (!incCreatedByName) {
    incCreatedByName = incObj.incCreatedBy.name;
  }
  if (!(incTypeId == 1 && safetyCheckMessageText.indexOf(incObj.incCreatedBy.name) == -1)) {
    dashboard.mentionUser(mentionUserEntities, incCreatedById, incCreatedByName);
  }

  const cardBody = [
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
      text: safetyCheckMessageText,
    },
  ];
  if (incTypeId == 1) {
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
          if (option.option != '') {
            let btn = {
              ...btnSafe,
              title: option.option,
              verb: "send_response",
              data: {
                info: option.id,
                inc: incObj,
                companyData: companyData,
              },
            };
            actions.push(btn);
          }
        })
      } else {
        let dropdown = {
          type: "Input.ChoiceSet",
          id: "dropdownSelection",
          style: "compact", // Use "expanded" for always visible options
          isRequired: true,
          errorMessage: "Please select the response.",
          choices: [],
        };
        responseOptionData.responseOptions.map((option, index) => {
          if (option.option != '') {
            dropdown.choices.push({ title: option.option, value: option.id.toString() });
          }
        });
        cardBody.push(dropdown);
        let btnSafe = {
          type: "Action.Execute",
          title: "Confirm",
          verb: "send_response",
          associatedInputs: "auto",
          data: {
            info: "dropdown_selection",
            inc: incObj,
            companyData: companyData,
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
      text: `**Guidance:**\n\n` + incGuidance,
    });
  }
  return {
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    appId: process.env.MicrosoftAppId,
    body: cardBody,
    msteams: {
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
  incCreatedByName
) => {
  const cardBody = [
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
      text: `This is an important bulletin from <at>${incCreatedByName}</at>.`,
    },
    {
      type: "TextBlock",
      size: "Medium",
      weight: "Bolder",
      wrap: true,
      text: `**Important Bulletin: ${incTitle}**`,
    },
    {
      type: "TextBlock",
      wrap: true,
      isVisible: incGuidance ? true : false,
      text: `**Guidance:**\n\n` + incGuidance,
    },
    {
      type: "TextBlock",
      wrap: true,
      isVisible: additionalInfo ? true : false,
      text: `**Additional Information:**\n\n` + additionalInfo,
    },
  ];
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
  incCreatedByName
) => {
  const cardBody = [
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
      text: `This is a travel advisory from <at>${incCreatedByName}</at>.`,
    },
    {
      type: "TextBlock",
      size: "Medium",
      weight: "Bolder",
      wrap: true,
      text: `**Travel Advisory: ${incTitle}**`,
    },
    {
      type: "TextBlock",
      wrap: true,
      isVisible: travelUpdate ? true : false,
      text: `**Travel Update:**\n\n` + travelUpdate,
    },
    {
      type: "TextBlock",
      wrap: true,
      isVisible: incGuidance ? true : false,
      text: `**Guidance:**\n\n` + incGuidance,
    },
    {
      type: "TextBlock",
      wrap: true,
      isVisible: contactInfo ? true : false,
      text: `**Contact Information:**\n\n` + contactInfo,
    },
  ];

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
  incCreatedByName
) => {
  const cardBody = [
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
      text: `This is a stakeholder notice from <at>${incCreatedByName}</at>.`,
    },
    {
      type: "TextBlock",
      size: "Medium",
      weight: "Bolder",
      wrap: true,
      text: `**Stakeholder Notice: ${incTitle}**`,
    },
    {
      type: "TextBlock",
      wrap: true,
      isVisible: situation ? true : false,
      text: `**Situation:**\n\n` + situation,
    },
    {
      type: "TextBlock",
      wrap: true,
      isVisible: additionalInfo ? true : false,
      text: `**Additional Information:**\n\n` + additionalInfo,
    },
  ];

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
  situation
) => {
  let card = null;
  switch (incTypeId) {
    case 1: //Safety Check
      card = await getSafetyCheckTypeCard(
        incTitle,
        incObj,
        companyData,
        incGuidance,
        incResponseSelectedUsersList,
        incTypeId, null, null, null, false
      );
      break;
    case 2: //Safety Alert
      card = await getSafetyCheckTypeCard(
        incTitle,
        incObj,
        companyData,
        incGuidance,
        null,
        incTypeId
      );
      break;
    case 3: //Important Bulletin
      card = await getImpBulletineTypeCard(
        incTitle,
        incGuidance,
        additionalInfo,
        incObj.incCreatedBy.id,
        incObj.incCreatedBy.name
      );
      break;
    case 4: //Travel Advisory
      card = await getTravelAdvisoryTypeCard(
        incTitle,
        incGuidance,
        travelUpdate,
        contactInfo,
        incObj.incCreatedBy.id,
        incObj.incCreatedBy.name
      );
      break;
    case 5: //Stakeholder Notice
      card = await getStakeholderNoticeTypeCard(
        incTitle,
        situation,
        additionalInfo,
        incObj.incCreatedBy.id,
        incObj.incCreatedBy.name
      );
      break;
  }
  return card;
};

module.exports = {
  getSafetyCheckMessageText,
  SafetyCheckCard,
  getSafetyCheckTypeCard,
};
