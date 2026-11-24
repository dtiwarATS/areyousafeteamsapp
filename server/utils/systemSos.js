/**
 * SOS raised by a system (Alarms & Sensors device group) instead of a person.
 * MSTeamsAssistance.user_id is NOT NULL, so such SOS rows store
 *   user_id = "system:alarm:<DEVICE_GROUP.public_id>"
 * and the same value travels as the "requester" AAD id in SOS cards / sockets.
 * Requester-only steps (notifying / @mentioning the requester) are skipped for these.
 */
const SYSTEM_PREFIX = "system:alarm:";

const isSystemRequester = (id) => String(id || "").startsWith(SYSTEM_PREFIX);

const systemRequesterId = (publicId) => `${SYSTEM_PREFIX}${publicId}`;

const systemDisplayName = (groupName) => `${String(groupName || "Alarm").trim()} (Alarm)`;

/** Synthetic requester row, shaped like a MSTeamsTeamsUsers row. */
const systemRequester = (publicId, groupName, locationText) => ({
  user_id: systemRequesterId(publicId),
  user_aadobject_id: systemRequesterId(publicId),
  user_name: systemDisplayName(groupName),
  DYNAMIC_LOCATION: locationText || null,
  conversationId: null,
  isSystem: true,
});

/** Requester info for accept/close/reminder flows (replaces getUserInfoByUserAadObjId). */
const getSystemRequesterInfo = async (id) => {
  const publicId = String(id || "").slice(SYSTEM_PREFIX.length);
  let name = "Alarm";
  try {
    const repo = require("../services/devices/deviceGroupRepo");
    const g = await repo.getGroupByPublicId(publicId);
    if (g?.name) name = g.name;
  } catch (e) {
    /* deleted group: keep the generic name */
  }
  // user_id null: dashboard.mentionUser() skips null ids, so no invalid @mention reaches Teams.
  return { ...systemRequester(publicId, name, null), user_id: null };
};

module.exports = { SYSTEM_PREFIX, isSystemRequester, systemRequesterId, systemDisplayName, systemRequester, getSystemRequesterInfo };
