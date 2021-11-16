const {
  TeamsInfo,
  TurnContext,
  MessageFactory,
  CardFactory,
} = require("botbuilder");

const getAllTeamMembers = async (context, teamId) => {
  let allMembers = await (
    await TeamsInfo.getTeamMembers(context, teamId)
  ).filter((tm) => tm.aadObjectId);

  return Promise.resolve(allMembers);
};

const sendDirectMessage = async (context, teamMember, msg) => {
  var ref = TurnContext.getConversationReference(context.activity);

  ref.user = teamMember;

  await context.adapter.createConversation(ref, async (t1) => {
    const ref2 = TurnContext.getConversationReference(t1.activity);
    await t1.adapter.continueConversation(ref2, async (t2) => {
      await t2.sendActivity(MessageFactory.text(msg));
    });
  });
};

module.exports = { getAllTeamMembers, sendDirectMessage };
