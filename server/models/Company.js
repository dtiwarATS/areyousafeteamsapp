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
    isUpdate
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
  }
}

module.exports = Company;
