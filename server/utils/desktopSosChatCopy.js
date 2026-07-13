const sql = require("mssql");
const poolPromise = require("../db/dbConn");
const incidentService = require("../services/incidentService");

const DEFAULT_LANGUAGE_ID = 10000;

const SOS_UI_FALLBACKS = {
  iNeedAssistance: "I need assistance",
  yourRequestForAssistanceHasBeenSentTo:
    "Your request for assistance has been sent to",
  ifThisIsAnEmergencyCallYourLocalEmergencyNumberPleaseDoNotWaitForSomeoneToReachOutToYou:
    "If this is an emergency, call your local emergency number. Please do not wait for someone to reach out to you.",
  isHandlingYourSOSRequest: "is handling your SOS request.",
  chatFirstName: "Chat with {name}",
  callFirstName: "Call {name}",
  gotItIveSharedYourDetailsWithTheTeam:
    "Got it! I've shared your details with the team.",
  typeAdditionalDetailsHere: "Type additional details here",
  isYourFirstResponderAndIsHandlingYourSOS:
    "{name} is your first responder and is handling your SOS.",
};

const SOS_ATTRIBUTE_KEYS = Object.keys(SOS_UI_FALLBACKS);

async function loadAttributeTranslations(languageId) {
  const resolvedLanguageId = Number(languageId) || DEFAULT_LANGUAGE_ID;
  const fallbacks = { ...SOS_UI_FALLBACKS };

  try {
    const pool = await poolPromise;
    const result = await pool
      .request()
      .input("languageId", sql.Int, resolvedLanguageId)
      .query(`
        SELECT
          SA.ATTRIBUTE AS AttributeName,
          SADT.ATTRIBUTE AS TranslatedAttribute
        FROM SYS_ATTRIBUTE_DEF SA
        INNER JOIN SYS_ATTRIBUTE_DEF_TRANS SADT
          ON SA.ATTRIBUTE_ID = SADT.ATTRIBUTE_ID
        WHERE SADT.LANGUAGE_ID = @languageId
          AND SA.ATTRIBUTE IN (
            'iNeedAssistance',
            'yourRequestForAssistanceHasBeenSentTo',
            'ifThisIsAnEmergencyCallYourLocalEmergencyNumberPleaseDoNotWaitForSomeoneToReachOutToYou',
            'isHandlingYourSOSRequest',
            'chatFirstName',
            'callFirstName',
            'gotItIveSharedYourDetailsWithTheTeam',
            'typeAdditionalDetailsHere',
            'isYourFirstResponderAndIsHandlingYourSOS'
          )
      `);

    for (const row of result.recordset || []) {
      const key = row.AttributeName;
      const value =
        typeof row.TranslatedAttribute === "string"
          ? row.TranslatedAttribute.trim()
          : "";
      if (key && value) {
        fallbacks[key] = value;
      }
    }
  } catch (err) {
    console.error(
      "[desktopSosChatCopy] loadAttributeTranslations failed:",
      err?.message,
    );
  }

  return fallbacks;
}

async function loadUserContactByAadObjectId(aadObjectId) {
  if (!aadObjectId) {
    return null;
  }

  try {
    const pool = await poolPromise;
    const result = await pool
      .request()
      .input("aadObjectId", sql.NVarChar, String(aadObjectId))
      .query(`
        SELECT TOP 1
          user_aadobject_id,
          user_name,
          email,
          user_id
        FROM MSTeamsTeamsUsers
        WHERE LOWER(user_aadobject_id) = LOWER(@aadObjectId)
        ORDER BY CASE
          WHEN email IS NOT NULL AND LTRIM(RTRIM(email)) <> '' THEN 0
          ELSE 1
        END
      `);

    const row = result.recordset?.[0];
    if (!row) {
      return null;
    }

    return {
      id: row.user_aadobject_id || String(aadObjectId),
      name: row.user_name || "",
      email: typeof row.email === "string" ? row.email.trim() : "",
      userId: row.user_id || "",
    };
  } catch (err) {
    console.error(
      "[desktopSosChatCopy] loadUserContactByAadObjectId failed:",
      err?.message,
    );
    return null;
  }
}

function teamsChatUrl(emailOrId) {
  const usersParam =
    typeof emailOrId === "string" ? emailOrId.trim() : "";
  if (!usersParam) {
    return null;
  }
  return `https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(usersParam)}`;
}

function teamsCallUrl(emailOrId) {
  const usersParam =
    typeof emailOrId === "string" ? emailOrId.trim() : "";
  if (!usersParam) {
    return null;
  }
  return `https://teams.microsoft.com/l/call/0/0?users=${encodeURIComponent(usersParam)}`;
}

function applyNamePlaceholder(template, name) {
  if (!template) {
    return "";
  }
  return String(template).replace(/\{name\}/g, name || "");
}

function buildUiCopy(translations) {
  return {
    iNeedAssistance: translations.iNeedAssistance,
    yourRequestForAssistanceHasBeenSentTo:
      translations.yourRequestForAssistanceHasBeenSentTo,
    emergencyDisclaimer:
      translations.ifThisIsAnEmergencyCallYourLocalEmergencyNumberPleaseDoNotWaitForSomeoneToReachOutToYou,
    isHandlingYourSOSRequest: translations.isHandlingYourSOSRequest,
    gotItIveSharedYourDetailsWithTheTeam:
      translations.gotItIveSharedYourDetailsWithTheTeam,
    typeAdditionalDetailsHere: translations.typeAdditionalDetailsHere,
    chatFirstNameTemplate: translations.chatFirstName,
    callFirstNameTemplate: translations.callFirstName,
  };
}

/**
 * Build first-responder accept payload shared by bot Adaptive Card,
 * SMS/WhatsApp/Email requester text, and desktop websocket.
 *
 * @param {object} input
 * @param {string} input.userAadObjId - SOS requester AAD object id
 * @param {number|string} input.requestAssistanceid
 * @param {{ name?: string, aadObjectId?: string, id?: string, email?: string }} input.responder
 */
async function buildDesktopSosAcceptPayload(input) {
  const userAadObjId = input?.userAadObjId || "";
  const requestAssistanceid = input?.requestAssistanceid;
  const responder = input?.responder || {};

  const languageId =
    (await incidentService.getUserLanguageIdByAadObjId(userAadObjId)) ||
    DEFAULT_LANGUAGE_ID;
  const translations = await loadAttributeTranslations(languageId);

  const contact =
    (await loadUserContactByAadObjectId(responder.aadObjectId)) || {};
  const name =
    (responder.name && String(responder.name).trim()) ||
    (contact.name && String(contact.name).trim()) ||
    "";
  const email =
    (responder.email && String(responder.email).trim()) ||
    contact.email ||
    "";
  const id =
    responder.aadObjectId ||
    contact.id ||
    "";
  const usersParam = email || id;
  const chatUrl = teamsChatUrl(usersParam);
  const callUrl = teamsCallUrl(usersParam);

  const confirmationTemplate =
    translations.isYourFirstResponderAndIsHandlingYourSOS ||
    SOS_UI_FALLBACKS.isYourFirstResponderAndIsHandlingYourSOS;
  const confirmationMessage = applyNamePlaceholder(confirmationTemplate, name);
  const confirmationMessageCard = name
    ? confirmationMessage.replace(name, `**<at>${name}</at>**`)
    : confirmationMessage;

  const chatButtonLabel = applyNamePlaceholder(
    translations.chatFirstName,
    name,
  );
  const callButtonLabel = applyNamePlaceholder(
    translations.callFirstName,
    name,
  );

  const firstResponder = name
    ? {
        name,
        id: id || "",
        email: email || "",
        chatUrl,
        callUrl,
      }
    : null;

  return {
    requestAssistanceid,
    userAadObjId,
    FIRST_RESPONDER: id || null,
    FIRST_RESPONDER_RESPONDED_AT: new Date().toISOString(),
    firstResponder,
    confirmationMessage,
    confirmationMessageCard,
    chatButtonLabel: firstResponder ? chatButtonLabel : null,
    callButtonLabel: firstResponder ? callButtonLabel : null,
    ui: buildUiCopy(translations),
  };
}

/**
 * Baseline SOS chat copy for desktop (initial chat open).
 * Includes firstResponder when assistance already accepted.
 */
async function buildDesktopSosChatSnapshot(userAadObjId, assistRecord) {
  const languageId =
    (await incidentService.getUserLanguageIdByAadObjId(userAadObjId)) ||
    DEFAULT_LANGUAGE_ID;
  const translations = await loadAttributeTranslations(languageId);
  const ui = buildUiCopy(translations);

  const firstResponderId =
    typeof assistRecord?.FIRST_RESPONDER === "string"
      ? assistRecord.FIRST_RESPONDER.trim()
      : "";

  if (!firstResponderId) {
    return {
      requestAssistanceid: assistRecord?.id ?? null,
      userAadObjId,
      FIRST_RESPONDER: null,
      FIRST_RESPONDER_RESPONDED_AT:
        assistRecord?.FIRST_RESPONDER_RESPONDED_AT || null,
      firstResponder: null,
      confirmationMessage: null,
      confirmationMessageCard: null,
      chatButtonLabel: null,
      callButtonLabel: null,
      ui,
      assist: assistRecord || null,
    };
  }

  const acceptPayload = await buildDesktopSosAcceptPayload({
    userAadObjId,
    requestAssistanceid: assistRecord?.id,
    responder: {
      aadObjectId: firstResponderId,
      name: assistRecord?.first_responder || "",
    },
  });

  return {
    ...acceptPayload,
    FIRST_RESPONDER_RESPONDED_AT:
      assistRecord?.FIRST_RESPONDER_RESPONDED_AT ||
      acceptPayload.FIRST_RESPONDER_RESPONDED_AT,
    ui,
    assist: assistRecord || null,
  };
}

module.exports = {
  SOS_UI_FALLBACKS,
  SOS_ATTRIBUTE_KEYS,
  loadAttributeTranslations,
  buildDesktopSosAcceptPayload,
  buildDesktopSosChatSnapshot,
  teamsChatUrl,
  teamsCallUrl,
};
