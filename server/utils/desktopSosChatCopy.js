const sql = require("mssql");
const poolPromise = require("../db/dbConn");
const incidentService = require("../services/incidentService");
const attributeTranslationService = require("./attributeTranslationService");

const DEFAULT_LANGUAGE_ID =
  attributeTranslationService.DEFAULT_LANGUAGE_ID;

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
  userNeedsAssistance: "{name} needs assistance.",
  someoneNeedsAssistance: "Someone needs assistance.",
  acceptAndRespond: "Accept and respond",
  sosAlert: "SOS Alert",
  youAreAlreadyTheFirstResponderForThisSOS:
    "You are already the first responder for this SOS.",
  isAlreadyTheResponderForSosFrom:
    "{responder} is already the responder for the SOS request from {requester}",
  isTheFirstResponderForSosFrom:
    "{responder} is the first responder for the SOS request from {requester}.",
  youAreNowTheFirstResponder: "You are now the first responder.",
  andTheFollowingEmergencyContactsHaveBeenNotified:
    "and the following emergency contacts have been notified:",
  hasBeenNotified: "has been notified.",
  youAreNowTheFirstResponderForSosRequest:
    "You are now the first responder for {requester}'s SOS request.",
  isTheFirstResponderForSosRequest:
    "{responder} is the first responder for {requester}'s SOS request.",
  userHasCommented: "User {name} has commented : {comment}",
  addedAComment: "{name} added a comment - {comment}",
  someoneElseHasAlreadyRespondedToThisSOS:
    "Someone else has already responded to this SOS.",
  anotherResponderIsHandlingThisRequest:
    "Another responder is handling this request.",
  thankYouForYourResponse: "Thank you for your response.",
  requesterAndFollowingEmergencyContactsNotified:
    "{name} and the following emergency contacts have been notified: {contacts}.",
  nameHasBeenNotified: "{name} has been notified.",
};

const SOS_ATTRIBUTE_KEYS = Object.keys(SOS_UI_FALLBACKS);

async function loadAttributeTranslations(languageId) {
  const resolvedLanguageId = Number(languageId) || DEFAULT_LANGUAGE_ID;
  const fallbacks = { ...SOS_UI_FALLBACKS };

  try {
    const dict = await attributeTranslationService.getDictionary(
      resolvedLanguageId,
    );
    for (const key of SOS_ATTRIBUTE_KEYS) {
      const value =
        typeof dict[key] === "string" ? dict[key].trim() : "";
      if (value) {
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

function resolveLanguageId(languageId) {
  const n = Number(languageId);
  if (Number.isFinite(n) && n > 0) {
    return n;
  }
  return DEFAULT_LANGUAGE_ID;
}

function applyPlaceholders(template, placeholders = {}) {
  let result = String(template || "");
  for (const [key, value] of Object.entries(placeholders)) {
    result = result.replace(
      new RegExp(`\\{${key}\\}`, "g"),
      value != null ? String(value) : "",
    );
  }
  return result;
}

function replaceNameWithMention(text, name) {
  if (!name || !text || !text.includes(name)) {
    return text;
  }
  return text.replace(name, `**<at>${name}</at>**`);
}

function replaceNamesWithMentions(text, names = []) {
  let result = text;
  for (const name of names) {
    if (name) {
      result = replaceNameWithMention(result, name);
    }
  }
  return result;
}

/** Incoming SOS copy for officers (Teams card + SMS). */
async function buildIncomingSosOfficerCopy(languageId, userName) {
  const translations = await loadAttributeTranslations(
    resolveLanguageId(languageId),
  );
  const name = typeof userName === "string" ? userName.trim() : "";
  const needsPlain = name
    ? applyNamePlaceholder(translations.userNeedsAssistance, name)
    : translations.someoneNeedsAssistance;
  const cardText = name
    ? replaceNameWithMention(needsPlain, name)
    : needsPlain;

  return {
    cardText,
    needsAssistancePlain: needsPlain,
    acceptButtonTitle: translations.acceptAndRespond,
    sosAlert: translations.sosAlert,
    acceptAndRespond: translations.acceptAndRespond,
  };
}

function buildIncomingSosSmsBody(officerCopy, acceptLink) {
  const copy = officerCopy || {};
  return `${copy.sosAlert || SOS_UI_FALLBACKS.sosAlert}: ${
    copy.needsAssistancePlain || SOS_UI_FALLBACKS.userNeedsAssistance
  } ${copy.acceptAndRespond || SOS_UI_FALLBACKS.acceptAndRespond}: ${acceptLink}`;
}

/** Post-Accept Teams/SMS copy for officers, requester, and other admins. */
async function buildPostAcceptOfficerCopy(languageId, options = {}) {
  const translations = await loadAttributeTranslations(
    resolveLanguageId(languageId),
  );
  const responderName = options.responderName || "";
  const requesterName = options.requesterName || "";
  const otherAdminNames = Array.isArray(options.otherAdminNames)
    ? options.otherAdminNames.filter(Boolean)
    : [];

  switch (options.type) {
    case "alreadySelf":
      return {
        cardText: `**${translations.youAreAlreadyTheFirstResponderForThisSOS}**`,
      };
    case "alreadyHandled": {
      const plain = applyPlaceholders(
        translations.isAlreadyTheResponderForSosFrom,
        { responder: responderName, requester: requesterName },
      );
      return {
        cardText: replaceNamesWithMentions(plain, [
          responderName,
          requesterName,
        ]),
      };
    }
    case "adminNotify": {
      const plain = applyPlaceholders(
        translations.isTheFirstResponderForSosFrom,
        { responder: responderName, requester: requesterName },
      );
      return {
        cardText: replaceNamesWithMentions(plain, [
          responderName,
          requesterName,
        ]),
      };
    }
    case "responderAck": {
      let acknowledgmentText = `${translations.youAreNowTheFirstResponder}\n\n**<at>${requesterName}</at>** ${translations.andTheFollowingEmergencyContactsHaveBeenNotified}`;
      if (otherAdminNames.length === 0) {
        acknowledgmentText = `${translations.youAreNowTheFirstResponder}\n\n**<at>${requesterName}</at>** ${translations.hasBeenNotified}`;
      } else if (otherAdminNames.length === 1) {
        acknowledgmentText += `\n**<at>${otherAdminNames[0]}</at>**`;
      } else {
        const adminMentions = otherAdminNames
          .map((adminName) => `**<at>${adminName}</at>**`)
          .join("\n");
        acknowledgmentText += `\n${adminMentions}`;
      }
      return {
        cardText: acknowledgmentText,
        chatButtonTitle: applyNamePlaceholder(
          translations.chatFirstName,
          requesterName,
        ),
        callButtonTitle: applyNamePlaceholder(
          translations.callFirstName,
          requesterName,
        ),
      };
    }
    case "smsRequester":
      return {
        smsText: applyNamePlaceholder(
          translations.isYourFirstResponderAndIsHandlingYourSOS,
          responderName,
        ),
      };
    case "smsResponder":
      return {
        smsText: applyPlaceholders(
          translations.youAreNowTheFirstResponderForSosRequest,
          { requester: requesterName },
        ),
      };
    case "smsOtherAdmin":
      return {
        smsText: applyPlaceholders(translations.isTheFirstResponderForSosRequest, {
          responder: responderName,
          requester: requesterName,
        }),
      };
    default:
      return {};
  }
}

/** SOS comment copy for officers (Teams card + SMS). */
async function buildSosCommentOfficerCopy(languageId, userName, comment) {
  const translations = await loadAttributeTranslations(
    resolveLanguageId(languageId),
  );
  const name = typeof userName === "string" ? userName.trim() : "";
  const commentText = typeof comment === "string" ? comment : "";
  const cardPlain = applyPlaceholders(translations.userHasCommented, {
    name: name || "Someone",
    comment: commentText,
  });
  const cardText = name
    ? cardPlain.replace(name, `**<at>${name}</at>**`)
    : cardPlain;
  const smsText = applyPlaceholders(translations.addedAComment, {
    name: name || "Someone",
    comment: commentText,
  });
  return { cardText, smsText };
}

/**
 * Localized /acceptSOS web + JSON copy for the clicking admin.
 */
async function buildAcceptSosWebCopy(languageId, options = {}) {
  const translations = await loadAttributeTranslations(
    resolveLanguageId(languageId),
  );
  const requesterName =
    (options.requesterName && String(options.requesterName).trim()) || "";
  const otherAdminNames = Array.isArray(options.otherAdminNames)
    ? options.otherAdminNames.filter(Boolean)
    : [];

  if (options.type === "alreadySelf") {
    return {
      title: translations.youAreAlreadyTheFirstResponderForThisSOS,
      detail: translations.thankYouForYourResponse,
      message: translations.youAreAlreadyTheFirstResponderForThisSOS,
    };
  }
  if (options.type === "alreadyOther") {
    return {
      title: translations.someoneElseHasAlreadyRespondedToThisSOS,
      detail: translations.anotherResponderIsHandlingThisRequest,
      message: translations.someoneElseHasAlreadyRespondedToThisSOS,
    };
  }

  let notificationMessage = translations.youAreNowTheFirstResponder;
  if (requesterName) {
    if (otherAdminNames.length > 0) {
      let contactsList = "";
      if (otherAdminNames.length === 1) {
        contactsList = otherAdminNames[0];
      } else if (otherAdminNames.length === 2) {
        contactsList = `${otherAdminNames[0]} and ${otherAdminNames[1]}`;
      } else {
        const lastAdmin = otherAdminNames[otherAdminNames.length - 1];
        const otherAdmins = otherAdminNames.slice(0, -1).join(", ");
        contactsList = `${otherAdmins}, and ${lastAdmin}`;
      }
      notificationMessage += ` ${applyPlaceholders(
        translations.requesterAndFollowingEmergencyContactsNotified,
        { name: requesterName, contacts: contactsList },
      )}`;
    } else {
      notificationMessage += ` ${applyPlaceholders(
        translations.nameHasBeenNotified,
        { name: requesterName },
      )}`;
    }
  } else if (otherAdminNames.length > 0) {
    if (otherAdminNames.length === 1) {
      notificationMessage += ` ${applyPlaceholders(
        translations.nameHasBeenNotified,
        { name: otherAdminNames[0] },
      )}`;
    } else if (otherAdminNames.length === 2) {
      notificationMessage += ` ${otherAdminNames[0]} and ${otherAdminNames[1]} have been notified.`;
    } else {
      const lastAdmin = otherAdminNames[otherAdminNames.length - 1];
      const otherAdmins = otherAdminNames.slice(0, -1).join(", ");
      notificationMessage += ` ${otherAdmins}, and ${lastAdmin} have been notified.`;
    }
  }

  return {
    title: notificationMessage,
    message: notificationMessage,
  };
}

/**
 * Teams deep links for officer ↔ requester (same pattern as bot acknowledgment card).
 */
function buildOfficerRequesterDeepLinks(admin, requester) {
  const adminEmail =
    typeof admin?.email === "string" ? admin.email.trim() : "";
  const requesterEmail =
    typeof requester?.email === "string" ? requester.email.trim() : "";
  const adminAad = admin?.user_aadobject_id || admin?.aadObjectId || "";
  const requesterAad =
    requester?.user_aadobject_id || requester?.aadObjectId || "";

  let chatUrl = null;
  let callUrl = null;

  if (adminEmail && requesterEmail) {
    const users = `${encodeURIComponent(adminEmail)},${encodeURIComponent(
      requesterEmail,
    )}`;
    chatUrl = `https://teams.microsoft.com/l/chat/0/0?users=${users}`;
    callUrl = `https://teams.microsoft.com/l/call/0/0?users=${users}`;
  } else if (adminAad && requesterAad) {
    chatUrl = `https://teams.microsoft.com/l/chat/0/0?users=${adminAad},${requesterAad}`;
    callUrl = `https://teams.microsoft.com/l/call/0/0?users=${adminAad},${requesterAad}`;
  } else {
    const solo = requesterEmail || requesterAad;
    chatUrl = teamsChatUrl(solo);
    callUrl = teamsCallUrl(solo);
  }

  return { chatUrl, callUrl };
}

/**
 * JSON acknowledgment for desktop after Accept — mirrors Teams Adaptive Card.
 */
function buildOfficerAcceptAcknowledgment({
  admin,
  requester,
  notificationMessage,
  alreadyAcceptedBySelf,
  otherNotifiedNames = [],
}) {
  const requesterName =
    (requester?.user_name && String(requester.user_name).trim()) || "";
  const { chatUrl, callUrl } = buildOfficerRequesterDeepLinks(admin, requester);

  const title = alreadyAcceptedBySelf
    ? "You are already the first responder for this SOS."
    : "You are now the first responder.";

  let detailText = "";
  if (notificationMessage && !alreadyAcceptedBySelf) {
    const stripped = String(notificationMessage)
      .replace(/^You are now the first responder\.\s*/i, "")
      .trim();
    detailText = stripped;
  } else if (requesterName) {
    detailText = `${requesterName} has been notified.`;
  }

  const notifiedNames = [
    ...new Set(
      (Array.isArray(otherNotifiedNames) ? otherNotifiedNames : [])
        .map((n) => (n != null ? String(n).trim() : ""))
        .filter(Boolean),
    ),
  ];

  return {
    title,
    detailText: detailText || null,
    requesterName: requesterName || null,
    otherNotifiedNames: notifiedNames,
    chatUrl,
    callUrl,
    chatButtonLabel: requesterName
      ? `Chat with ${requesterName}`
      : "Chat",
    callButtonLabel: requesterName
      ? `Call ${requesterName}`
      : "Call",
  };
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

/** Translated SOS UI strings for a user (no assistance record required). */
async function buildDesktopSosUiCopy(userAadObjId) {
  const languageId =
    (await incidentService.getUserLanguageIdByAadObjId(userAadObjId)) ||
    DEFAULT_LANGUAGE_ID;
  const translations = await loadAttributeTranslations(languageId);
  return buildUiCopy(translations);
}

/**
 * Payload for officers' desktop incoming SOS (Chat tab / Teams-parity copy).
 * messageBody matches Adaptive Card / FCM: "{name} needs assistance."
 */
async function buildIncomingSosDesktopPayload(input) {
  const userAadObjId = input?.userAadObjId || "";
  const userName =
    typeof input?.userName === "string" ? input.userName.trim() : "";
  const languageId =
    (await incidentService.getUserLanguageIdByAadObjId(userAadObjId)) ||
    DEFAULT_LANGUAGE_ID;
  const translations = await loadAttributeTranslations(languageId);

  const messageBody = userName
    ? `${userName} needs assistance.`
    : "Someone needs assistance.";

  return {
    requestAssistanceid: input?.requestAssistanceid ?? null,
    userAadObjId: userAadObjId || null,
    userName: userName || null,
    teamId: input?.teamId ?? null,
    messageBody,
    acceptButtonLabel: "Accept and respond",
    ui: buildUiCopy(translations),
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

/**
 * Desktop payload when an SOS request is marked Closed (mirrors Teams Adaptive Card copy).
 */
function buildDesktopSosClosedPayload({
  requestAssistanceid,
  userAadObjId,
  closedByName,
  comment,
  closedAt,
}) {
  const closedAtDate = closedAt ? new Date(closedAt) : new Date();
  const dateLabel = closedAtDate.toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  const closer = (closedByName || "a safety officer").trim();
  const commentText =
    typeof comment === "string" && comment.trim() ? comment.trim() : "";

  const message = `Your SOS request raised on ${dateLabel} has been marked as closed by ${closer}.`;
  const footerMessage =
    "If this was closed by mistake, please go to the Dashboard tab and click I Need Assistance again.";

  return {
    requestAssistanceid: requestAssistanceid ?? null,
    userAadObjId: userAadObjId || null,
    status: "Closed",
    closedByName: closer,
    closedAt: closedAtDate.toISOString(),
    comment: commentText || null,
    title: "SOS Request Closed",
    message,
    footerMessage,
  };
}

/**
 * Payload for officers' desktop when the SOS victim adds a comment.
 * Mirrors Teams Adaptive Card: "User {name} has commented : {comment}"
 */
function buildSosCommentDesktopPayload(input) {
  const userName =
    typeof input?.userName === "string" ? input.userName.trim() : "";
  const comment =
    typeof input?.comment === "string" ? input.comment.trim() : "";
  const commentDate =
    typeof input?.commentDate === "string" && input.commentDate.trim()
      ? input.commentDate.trim()
      : new Date().toISOString();

  const messageBody = userName
    ? `${userName} has commented: ${comment}`
    : `Someone has commented: ${comment}`;

  return {
    requestAssistanceid: input?.requestAssistanceid ?? null,
    userAadObjId: input?.userAadObjId || null,
    userName: userName || null,
    teamId: input?.teamId ?? null,
    comment,
    commentDate,
    messageBody,
  };
}

module.exports = {
  SOS_UI_FALLBACKS,
  SOS_ATTRIBUTE_KEYS,
  loadAttributeTranslations,
  buildDesktopSosUiCopy,
  buildDesktopSosAcceptPayload,
  buildIncomingSosDesktopPayload,
  buildIncomingSosOfficerCopy,
  buildIncomingSosSmsBody,
  buildPostAcceptOfficerCopy,
  buildSosCommentOfficerCopy,
  buildAcceptSosWebCopy,
  buildSosCommentDesktopPayload,
  buildDesktopSosChatSnapshot,
  buildDesktopSosClosedPayload,
  buildOfficerAcceptAcknowledgment,
  teamsChatUrl,
  teamsCallUrl,
};
