class Member {
  constructor({
    user_id,
    user_name,
    is_message_delivered,
    response,
    response_value,
    comment,
    timestamp,
    tu,
    msgStatus,
    error
  }) {
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
  }
}

module.exports = Member;
