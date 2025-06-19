class Company {
  constructor({
    id,
    user_id,
    user_tenant_id,
    user_obj_id,
    user_name,
    email,
    team_id,
    team_name,
    created_date,
    super_users,
    welcomeMessageSent,
    isUpdate,
    isUserInfoSaved,
    serviceUrl,
    membersCount,
    channelId,
    channelName,
    EnableSafetycheckForVisitors,
    SafetycheckForVisitorsQuestion1,
    SafetycheckForVisitorsQuestion2,
    SafetycheckForVisitorsQuestion3,
    refresh_token,
    send_sms,
    send_whatsapp,
    sent_sms_count,
    SubscriptionType,
    PHONE_FIELD
  }) {
    this.companyId = id;
    this.userId = user_id;
    this.userTenantId = user_tenant_id;
    this.userObjId = user_obj_id;
    this.userName = user_name;
    this.userEmail = email;
    this.teamId = team_id;
    this.teamName = team_name;
    this.superUsers = super_users || [];
    this.createdDate = created_date || new Date(Date.now()).toISOString();
    this.welcomeMessageSent = welcomeMessageSent || false;
    this.isUpdate = isUpdate == null ? "false" : isUpdate;
    this.isUserInfoSaved = isUserInfoSaved;
    this.serviceUrl = serviceUrl;
    this.membersCount = membersCount;
    this.channelId = channelId;
    this.channelName = channelName;
    this.SafetycheckForVisitorsQuestion1 = SafetycheckForVisitorsQuestion1;
    this.SafetycheckForVisitorsQuestion2 = SafetycheckForVisitorsQuestion2;
    this.SafetycheckForVisitorsQuestion3 = SafetycheckForVisitorsQuestion3;
    this.EnableSafetycheckForVisitors = EnableSafetycheckForVisitors;
    this.refresh_token = refresh_token;
    this.send_sms = send_sms;
    this.send_whatsapp = send_whatsapp;
    this.sent_sms_count = sent_sms_count;
    this.SubscriptionType = SubscriptionType;
    this.PHONE_FIELD = PHONE_FIELD;
  }
}

module.exports = Company;
