function pickField(row, ...keys) {
  for (const key of keys) {
    if (row[key] != null && row[key] !== "") {
      return row[key];
    }
  }
  return "";
}

function toIsoDate(value) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

function buildTeamMap(teamInfo) {
  const teamObj = {};
  if (teamInfo != null && teamInfo.length > 0) {
    teamInfo.forEach((team) => {
      teamObj[team.teamId] = team.teamName;
    });
  }
  return teamObj;
}

function formatFollowUp(inc) {
  if (!inc.EnableSendReminders) {
    return "Disabled";
  }
  const count = inc.SendRemindersCount != null ? inc.SendRemindersCount : 0;
  const time = inc.SendRemindersTime != null ? inc.SendRemindersTime : 0;
  return `Enabled: ${count} reminders every ${time} min`;
}

function computeIncidentStats(inc, tabObj) {
  let safeCount = 0;
  let needAssistanceCount = 0;
  let notRespondedCount = 0;
  let responseRatePercent = 0;
  let deliveryRatePercent = 0;

  const membersCount = inc.membersCount || 0;
  const messageDeliveredCount = inc.messageDeliveredCount || 0;

  if (
    inc.members != null &&
    inc.members.length > 0 &&
    !inc.isSavedAsDraft &&
    !inc.isSaveAsTemplate
  ) {
    const memberObj = tabObj.sortMembers(inc.members, inc.incTypeId);
    if (memberObj != null) {
      if (!inc.incTypeId || inc.incTypeId == 1) {
        safeCount = memberObj.membersSafe?.length || 0;
        needAssistanceCount = memberObj.membersUnsafe?.length || 0;
        notRespondedCount = memberObj.membersNotResponded?.length || 0;

        if (needAssistanceCount > 0 || safeCount > 0) {
          responseRatePercent = Math.round(
            ((needAssistanceCount + safeCount) * 100) / inc.members.length,
          );
        }
      } else {
        const deliveredCount = memberObj.delivered?.length || 0;
        if (membersCount > 0) {
          responseRatePercent = Math.round((deliveredCount * 100) / membersCount);
        }
      }
    }
  }

  if (membersCount > 0) {
    deliveryRatePercent = Math.round(
      (messageDeliveredCount * 100) / membersCount,
    );
  }

  return {
    safeCount,
    needAssistanceCount,
    notRespondedCount,
    responseRatePercent,
    deliveryRatePercent,
  };
}

function formatDeliveryStatus(row) {
  const status = pickField(row, "DeliveryStatus", "deliveryStatus");
  if (status === "SEND_SUCCESS" || status === "SEND_FAILED") {
    return status;
  }
  return "";
}

function formatActivityLogResponse(row) {
  return {
    user: pickField(row, "user_name", "UserName", "userName"),
    channel: pickField(row, "MessageSentVia", "messageSentVia"),
    contact: pickField(row, "RecipientContact", "recipientContact"),
    delivery_status: formatDeliveryStatus(row),
    message_type: pickField(row, "MessageType", "messageType"),
    user_response: pickField(row, "UserResponse", "userResponse"),
    failure_reason: pickField(row, "FailureReason", "failureReason"),
    message_sent_at: toIsoDate(
      pickField(row, "MessageSendDateTime", "EventDateTime", "messageSendDateTime"),
    ),
    user_responded_at: toIsoDate(
      pickField(
        row,
        "UserRespondedAt",
        "userRespondedAt",
        "ResponseDateTime",
        "responseDateTime",
      ),
    ),
    marked_safe_by: pickField(
      row,
      "marked_by_user_name",
      "MarkedByUserName",
      "admin_name",
      "marked_by_user_id",
      "MarkedByUserId",
    ),
    country: pickField(row, "COUNTRY", "Country", "country", "userCountry"),
    city: pickField(row, "CITY", "City", "city", "userCity"),
    department: pickField(
      row,
      "DEPARTMENT",
      "Department",
      "department",
      "userDepartment",
    ),
  };
}

function formatIncidentForApi(inc, teamName, tabObj) {
  const duration = tabObj.getDurationInWeek(inc.incCreatedDate);
  const stats = computeIncidentStats(inc, tabObj);

  return {
    IncidentId: inc.incId,
    title: inc.incTitle || "",
    status: inc.incStatusId === 2 ? "Closed" : "In progress",
    team: teamName || "",
    created_by: inc.incCreatedByName || "",
    created_on: toIsoDate(inc.incCreatedDate),
    duration: duration != null ? duration.toString() : "",
    response_rate_percent: stats.responseRatePercent,
    delivery_rate_percent: stats.deliveryRatePercent,
    not_responded: stats.notRespondedCount,
    i_am_safe: stats.safeCount,
    i_need_assistance: stats.needAssistanceCount,
    message: inc.incDesc || inc.situation || "",
    recipient:
      inc.selectedMembersCount != null
        ? String(inc.selectedMembersCount)
        : String(inc.membersCount || 0),
    make_recurring: inc.incType === "recurringIncident",
    follow_up: formatFollowUp(inc),
  };
}

function formatIncidentApiPayload(inc, activityLog, teamName, tabObj) {
  return {
    incident: formatIncidentForApi(inc, teamName, tabObj),
    responses: (activityLog || []).map(formatActivityLogResponse),
  };
}

function shouldIncludeIncident(inc) {
  return !(inc.messageDeliveredCount == 0 && inc.isTestRecord);
}

module.exports = {
  buildTeamMap,
  formatIncidentApiPayload,
  shouldIncludeIncident,
};
