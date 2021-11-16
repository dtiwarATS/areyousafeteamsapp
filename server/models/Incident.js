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
    m,
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
  }
}

module.exports = Incident;
