/**
 * Build Tab-shaped incident payloads for AI Caller.
 * Does NOT modify Tab/bot code — only prepares the same params Tab already sends.
 */

const DEFAULT_RESPONSE_OPTIONS = [
  { id: 1, option: "I am safe", color: "#4CAF50" },
  { id: 2, option: "I need assistance", color: "#F44336" },
];

/**
 * Key order must match MSTeamsIncidents columns (Object.keys → insert values).
 * Mirrors CreateIncidentUI setIncObj for a one-time Safety Check.
 */
function buildOnetimeIncDataLikeTab({
  title,
  message,
  teamId,
  userAadObjId,
  createdByName,
  selectedMemberIds,
}) {
  const now = new Date().toISOString();
  const selectedMembers = Array.isArray(selectedMemberIds)
    ? selectedMemberIds.filter(Boolean).join(",")
    : String(selectedMemberIds || "");

  return {
    incTitle: String(title || "Safety check").trim() || "Safety check",
    incType: "onetime",
    channelId: teamId,
    teamId,
    selectedMembers,
    incCreatedBy: userAadObjId,
    createdDate: now,
    occursEvery: "",
    startDate: "",
    startTime: "",
    endDate: "",
    endTime: "",
    incCreatedByName: createdByName || "Safety Assistant",
    guidance: message != null ? String(message) : "",
    incStatusId: 1,
    incTypeId: 1,
    additionalInfo: "",
    travelUpdate: "",
    contactInfo: "",
    situation: "",
    isTestRecord: false,
    isSavedAsDraft: false,
    isSaveAsTemplate: false,
    updatedOn: "",
    incTemplate: "",
    EnableSendReminders: false,
    SendRemindersCount: 0,
    SendRemindersTime: 0,
    responseType: "buttons",
    responseOptions: JSON.stringify(DEFAULT_RESPONSE_OPTIONS),
    isDrill: false,
    translatedMessages: "",
  };
}

function buildIncMembers(users) {
  return (users || []).map((u) => ({
    value: u.id,
    label: u.name || u.id,
  }));
}

module.exports = {
  DEFAULT_RESPONSE_OPTIONS,
  buildOnetimeIncDataLikeTab,
  buildIncMembers,
};
