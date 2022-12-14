class Incident {
  constructor({
    id,
    inc_name,
    inc_desc,
    inc_type,
    channel_id,
    team_id,
    selected_members,
    created_by,
    created_date,
    CREATED_BY_NAME,
    GUIDANCE,
    m,
    OCCURS_EVERY,
    EVENT_START_DATE,
    EVENT_START_TIME,
    EVENT_END_DATE,
    EVENT_END_TIME,
    INC_STATUS_ID,
    STATUS,
    membersCount,
    messageDeliveredCount,
    inc_type_id,
    incident_type,
    additionalInfo,
    travelUpdate,
    contactInfo,
    situation
  }) {
    this.incId = id;
    this.incTitle = inc_name;
    this.incDesc = inc_desc;
    this.incType = inc_type;
    this.channelId = channel_id;
    this.teamId = team_id;
    this.selectedMembers = selected_members || [];
    this.incCreatedBy = created_by;
    this.incCreatedDate = created_date || new Date(Date.now()).toISOString();
    this.members = m;
    this.occursEvery = OCCURS_EVERY;
    this.startDate = EVENT_START_DATE;
    this.startTime = EVENT_START_TIME;
    this.endDate = EVENT_END_DATE;
    this.endTime = EVENT_END_TIME;
    this.incGuidance = GUIDANCE;
    this.incStatusId = INC_STATUS_ID;
    this.incStatus = STATUS;
    this.incCreatedByName = CREATED_BY_NAME;
    this.membersCount = membersCount;
    this.messageDeliveredCount = messageDeliveredCount;
    this.incTypeId = inc_type_id;
    this.incMsgType = incident_type;
    this.additionalInfo = additionalInfo;
    this.travelUpdate = travelUpdate;
    this.contactInfo = contactInfo;
    this.situation = situation;
  }
}

module.exports = Incident;
