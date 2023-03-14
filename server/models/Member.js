class Member {
  constructor({
    respId,
    user_id,
    user_name,
    is_message_delivered,
    response,
    response_value,
    comment,
    timestamp,
    tu,
    msgStatus,
    error,
    admin_name,
    is_marked_by_admin
  }) {
    this.respId = respId;
    this.userId = user_id;
    this.userName = user_name;
    this.isMessageDelivered = is_message_delivered != null ? is_message_delivered : null;
    this.response = response;
    this.responseValue = response_value;
    this.comment = comment;
    this.timestamp = timestamp;
    this.userPrincipalName = (tu && tu.length > 0) ? tu[0].userPrincipalName : null;
    this.msgStatus = msgStatus;
    this.error = error;
    this.adminName = admin_name;
    this.isMarkedByAdmin = is_marked_by_admin;
  }
}

module.exports = Member;
