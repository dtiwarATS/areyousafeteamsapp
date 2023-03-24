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
    channelName
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
    this.isUpdate = (isUpdate == null) ? "false" : isUpdate;
    this.isUserInfoSaved = isUserInfoSaved;
    this.serviceUrl = serviceUrl;
    this.membersCount = membersCount;
    this.channelId = channelId;
    this.channelName = channelName;
  }
}

module.exports = Company;
