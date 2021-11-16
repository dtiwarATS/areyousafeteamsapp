class Member {
  constructor({
    user_id,
    user_name,
    is_message_delivered,
    response,
    response_value,
    comment,
    timestamp,
  }) {
    this.userId = user_id;
    this.userName = user_name;
    this.isMessageDelivered = is_message_delivered || null;
    this.response = response;
    this.responseValue = response_value;
    this.comment = comment;
    this.timestamp = timestamp;
  }
}

module.exports = Member;
