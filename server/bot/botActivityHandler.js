// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

const path = require("path");
const ENV_FILE = path.join(__dirname, "../../.env");
require("dotenv").config({ path: ENV_FILE });
const {
  TeamsActivityHandler,
  CardFactory,
  TeamsInfo,
  MessageFactory,
  StatusCodes,
  TurnContext,
} = require("botbuilder");
const bot = require("../bot/bot");
const incidentService = require("../services/incidentService");
const {
  getCompaniesData,
  insertCompanyData,
  deleteCompanyData,
  isAdminUser,
  getCompaniesDataBySuperUserId,
  updateCompanyData,
} = require("../db/dbOperations");
const {
  sendDirectMessage,
  sendDirectMessageCard,
} = require("../api/apiMethods");

const {
  updateMainCard,
  updateCreateIncidentCard,
  updateSendApprovalMessage,
  updateSubmitCommentCard,
  updateSafeMessage,
  updateDeleteCard,
  updateSesttingsCard,
  updateIncidentListCard,
  updateContactSubmitCard,
} = require("../models/UpdateCards");

class BotActivityHandler extends TeamsActivityHandler {
  constructor() {
    super();
    // this.onTurn(async (context, next) => {
    //   console.log("onTurn context ==> ", JSON.stringify(context));
    // });
    /*  Teams bots are Microsoft Bot Framework bots.
            If a bot receives a message activity, the turn handler sees that incoming activity
            and sends it to the onMessage activity handler.
            Learn more: https://aka.ms/teams-bot-basics.

            NOTE:   Ensure the bot endpoint that services incoming conversational bot queries is
                    registered with Bot Framework.
                    Learn more: https://aka.ms/teams-register-bot.
        */
    // Registers an activity event handler for the message event, emitted for every incoming message activity.
    this.onMessage(async (context, next) => {
      let isSuperUser = false;
      let isAdminOrSuperuser = false;
      const acvtivityData = context.activity;
      await context.sendActivities([{ type: "typing" }]);
      if (acvtivityData.conversation.conversationType === "channel") {
        await this.hanldeChannelUserMsg(context);
      } else if (acvtivityData.conversation.conversationType === "personal") {
        let a = false;
        let b = false;
        let c = false;
        let isInstalledInTeam = true;
        // fetch  general channel id from db (ie same as team Id)
        let companyData = await getCompaniesData(
          acvtivityData.from.aadObjectId
        );
        if (!companyData.teamId?.length) {
          isInstalledInTeam = false;
        }
        if (companyData.userId == undefined) {
          a = true;
          companyData = await getCompaniesDataBySuperUserId(
            acvtivityData.from.aadObjectId
          );
          if (companyData.userId == undefined) {
            b = true;
          }
        }
        if (!companyData.teamId?.length) {
          isInstalledInTeam = false;
        }
        const isAdmin = await isAdminUser(
          acvtivityData.from.aadObjectId,
          companyData?.teamId
        );
        if (
          (companyData.userId != undefined && companyData.teamId?.length > 0) ||
          (isAdmin && isInstalledInTeam)
        ) {
          isSuperUser =
            (companyData.superUsers &&
              companyData.superUsers.some(
                (su) => su === acvtivityData.from.aadObjectId
              )) ||
              isAdmin
              ? true
              : false;

          // check if from.id matches user id stored in DB then proceed
          if (acvtivityData.from.id === companyData.userId || isSuperUser) {
            isAdminOrSuperuser = true;
            await this.hanldeAdminOrSuperUserMsg(context, companyData);
          } else {
            await this.hanldeNonAdminUserMsg(context);
          }
        } else if (a && b && !isAdmin) {
          await this.hanldeNonAdminUserMsg(context);
        } else {
          // fetch  general channel id from db (ie same as team Id)
          const companyData = await getCompaniesData(
            acvtivityData.from.aadObjectId,
            acvtivityData?.channelData?.tenant.id,
            true
          );
          if (
            companyData.userId != undefined &&
            companyData.teamId?.length > 0
          ) {
            await this.hanldeNonAdminUserMsg(context);
          } else {
            const cards = {
              $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
              type: "AdaptiveCard",
              version: "1.0",
              body: [
                {
                  type: "TextBlock",
                  text: "**I work best when added to a Team.**",
                  wrap: true,
                },
                {
                  type: "TextBlock",
                  text: "Please follow these steps: ",
                  wrap: true,
                },
                {
                  type: "TextBlock",
                  text: "1. Navigate to MS Teams App store\r2. Search AreYouSafe? and click on the AreYouSafe? Bot card\r3. Click on the top arrow button and select the **“Add to a team“** option",
                  wrap: true,
                },
                {
                  type: "TextBlock",
                  text: "If you need any help or want to share feedback, feel free to reach out to my makers at [help@safetybot.in](mailto:help@safetybot.in)",
                  wrap: true,
                },
                {
                  type: "Image",
                  url: "https://announcebot.in/img/InstallDetails.png?id=0",
                },
              ],
            };
            await sendDirectMessageCard(context, acvtivityData.from, cards);
          }
        }
      }

      await next();
    });

    this.onConversationUpdate(async (context, next) => {
      let addedBot = false;
      const acvtivityData = context.activity;
      const teamId = acvtivityData?.channelData?.team?.id;
      //console.log({ teamId: acvtivityData?.channelData?.team?.id });
      // fetch companyData and check if channelId matches team_id stored in DB then proceed
      const companyData = await getCompaniesData(
        acvtivityData?.from?.aadObjectId
      );
      if (
        acvtivityData &&
        acvtivityData?.channelData?.eventType === "teamMemberAdded"
      ) {
        const { membersAdded } = acvtivityData;
        for (let i = 0; i < membersAdded.length; i++) {
          // See if the member added was our bot
          if (membersAdded[i].id.includes(process.env.MicrosoftAppId)) {
            addedBot = true;
            const teamId = acvtivityData.channelData.team.id;
            // retrive user info who installed the app from TeamsInfo.getTeamMembers(context, teamId);
            const allMembersInfo = await TeamsInfo.getTeamMembers(
              context,
              teamId
            );

            const adminUserInfo = allMembersInfo.find(
              (m) => m.id === acvtivityData.from.id
            );

            if (adminUserInfo) {
              //console.log("adminUserInfo >> ", adminUserInfo);
              // then save from.id as userid and from.aadObjectId as userObjectId
              // and channelData.team.id as teamsId and save the data to database
              const companyDataObj = {
                userId: acvtivityData.from.id,
                userTenantId: adminUserInfo.tenantId,
                userObjId: adminUserInfo.aadObjectId,
                userName: adminUserInfo.name,
                email: adminUserInfo.email,
                teamId: teamId,
                teamName: acvtivityData.channelData.team.name,
                superUser: [],
                createdDate: new Date(Date.now()).toISOString(),
                welcomeMessageSent: 1,
              };
              if (
                companyData.userId === undefined &&
                companyData.teamId?.length <= 0
              ) {
                const companyData = await insertCompanyData(companyDataObj);
                // await context.sendActivity(
                //   MessageFactory.text(`Hello!
                // \r\nAre you safe allows you to trigger a safety check during a crisis. All users will get a direct message asking them to mark themselves safe.
                // \r\nIdeal for Safety admins and HR personnel to setup and use during emergency situations.\r\nYou do not need any other software or service to use this app.\r\nEnter 'Hi' to start a conversation with the bot.`)
                // );
                const cards = {
                  $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
                  type: "AdaptiveCard",
                  version: "1.0",
                  body: [
                    {
                      type: "TextBlock",
                      text: `👋 Hello! Are you safe? allows you to trigger a safety check during a crisis. All users will get a direct message asking them to mark themselves safe.
                      \r\nIdeal for Safety admins and HR personnel to setup and use during emergency situations.`,
                      wrap: true,
                    },
                    {
                      type: "TextBlock",
                      text: "You do not need any other software or service to use this app.",
                    },
                    {
                      type: "TextBlock",
                      text: "Enter 'Hi' to start a conversation with the bot.",
                    },
                    {
                      type: "TextBlock",
                      text: "If you need any help or want to share feedback, feel free to reach out to my makers at [help@safetybot.in](mailto:help@safetybot.in)",
                      wrap: true,
                    },
                  ],
                };
                await sendDirectMessageCard(context, acvtivityData.from, cards);

                await bot.sendInstallationEmail(
                  adminUserInfo.email,
                  adminUserInfo.name,
                  acvtivityData.channelData.team.name
                );
              } else {
                await updateCompanyData(
                  acvtivityData.from.id,
                  teamId,
                  acvtivityData.channelData.team.name
                );
                if (!companyData.welcomeMessageSent) {
                  await sendDirectMessageCard(
                    context,
                    acvtivityData.from,
                    bot.invokeMainActivityBoard(companyDataObj)
                  );
                }
              }
            }
          }

          //console.log("bot added >> ", addedBot);
        }
      }
      // if bot/member is installed/added
      else if (
        (acvtivityData &&
          acvtivityData?.channelData?.eventType === "teamDeleted") ||
        acvtivityData?.channelData?.eventType === "teamMemberRemoved"
      ) {
        const { membersRemoved } = acvtivityData;

        if (membersRemoved[0].id.includes(process.env.MicrosoftAppId)) {
          await deleteCompanyData(
            acvtivityData?.from?.aadObjectId,
            acvtivityData?.channelData?.team.id
          );
        }
      } else if (teamId == null && acvtivityData) {
        const { membersAdded } = acvtivityData;
        for (let i = 0; i < membersAdded.length; i++) {
          // See if the member added was our bot
          if (membersAdded[i].id.includes(process.env.MicrosoftAppId)) {
            addedBot = true;
            const teamId = null;
            // retrive user info who installed the app from TeamsInfo.getTeamMembers(context, teamId);
            const adminUserInfo = await TeamsInfo.getMember(
              context,
              acvtivityData.from.id
            );
            if (adminUserInfo) {
              //console.log("adminUserInfo >> ", adminUserInfo);
              // then save from.id as userid and from.aadObjectId as userObjectId
              // and channelData.team.id as teamsId and save the data to database
              const companyDataObj = {
                userId: adminUserInfo.id,
                userTenantId: adminUserInfo.tenantId,
                userObjId: adminUserInfo.aadObjectId,
                userName: adminUserInfo.name,
                email: adminUserInfo.email,
                teamId: "",
                teamName: "",
                superUser: [],
                createdDate: new Date(Date.now()).toISOString(),
                welcomeMessageSent: 1,
              };
              const companyData = await insertCompanyData(companyDataObj);
              const cards = {
                $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
                type: "AdaptiveCard",
                version: "1.0",
                body: [
                  {
                    type: "TextBlock",
                    text: `👋 Hello! Are you safe? allows you to trigger a safety check during a crisis. All users will get a direct message asking them to mark themselves safe.
                    \r\nIdeal for Safety admins and HR personnel to setup and use during emergency situations.`,
                    wrap: true,
                  },
                  {
                    type: "TextBlock",
                    text: "You do not need any other software or service to use this app.",
                  },
                  {
                    type: "TextBlock",
                    text: "Enter 'Hi' to start a conversation with the bot.",
                  },
                  {
                    type: "TextBlock",
                    text: "If you need any help or want to share feedback, feel free to reach out to my makers at [help@safetybot.in](mailto:help@safetybot.in)",
                    wrap: true,
                  },
                ],
              };
              await sendDirectMessageCard(context, acvtivityData.from, cards);

              await bot.sendInstallationEmail(
                adminUserInfo.email,
                adminUserInfo.name,
                ""
              );
              //console.log("Company data inserted into DB >> ", companyData);
            }
          }

          // console.log("bot added >> ", addedBot);
        }
      } else {
        const welcomeMsg = `👋 Hello! Are you safe? allows you to trigger a safety check during a crisis. All users will get a direct message asking them to mark themselves safe.
             \r\nIdeal for Safety admins and HR personnel to setup and use during emergency situations.\r\nYou do not need any other software or service to use this app.\r\nEnter 'Hi' to start a conversation with the bot.
             
             \n\r\r\n\n Are You Safe? Bot works best when added to a Team. Please click on the arrow button next to the blue Add button and select 'Add to a team' to continue.`;

        await sendDirectMessage(context, acvtivityData.from, welcomeMsg);
      }
    });
  }

  async onInvokeActivity(context) {
    try {
      const companyData = context.activity?.value?.action?.data?.companyData;
      const uVerb = context.activity?.value?.action?.verb;
      console.log({ uVerb });
      if (
        uVerb === "create_onetimeincident" ||
        uVerb === "contact_us" ||
        uVerb === "view_settings" ||
        uVerb === "list_inc" ||
        uVerb === "list_delete_inc"
      ) {
        await context.sendActivities([{ type: "typing" }]);
        const cards = CardFactory.adaptiveCard(updateMainCard(companyData));

        const message = MessageFactory.attachment(cards);
        message.id = context.activity.replyToId;
        await context.updateActivity(message);
      } else if (uVerb === "save_new_inc" || uVerb === "save_new_recurr_inc") {
        await context.sendActivities([{ type: "typing" }]);
        const user = context.activity.from;
        const { inc_title: incTitle } = context.activity?.value?.action?.data;
        let members = context.activity?.value?.action?.data?.selected_members;
        if (members === undefined) {
          members = "All Members";
        }
        let recurrInc = (uVerb === "save_new_recurr_inc") ? "recurring " : "";
        let text = `✔️ New ${recurrInc}incident '${incTitle}' created successfully.`;
        const cards = CardFactory.adaptiveCard(
          updateCreateIncidentCard(incTitle, members, text)
        );

        const message = MessageFactory.attachment(cards);
        message.id = context.activity.replyToId;
        await context.updateActivity(message);
      } else if (uVerb === "Cancel_button") {
        const { inc_title: incTitle } = context.activity?.value?.action?.data;
        let members = context.activity?.value?.action?.data?.selected_members;
        if (members === undefined) {
          members = "All Members";
        }
        let recurrInc = (uVerb === "save_new_recurr_inc") ? "recurring " : "";
        let text = `Ok.. No Problem... We can do this later. Thank you for your time.`;
        const cards = CardFactory.adaptiveCard(
          updateCreateIncidentCard(incTitle, members, text)
        );

        const message = MessageFactory.attachment(cards);
        message.id = context.activity.replyToId;
        await context.updateActivity(message);
      } else if (uVerb === "submit_settings") {
        const cards = CardFactory.adaptiveCard(updateSesttingsCard());

        const message = MessageFactory.attachment(cards);
        message.id = context.activity.replyToId;
        await context.updateActivity(message);
      } else if (uVerb === "view_inc_result") {
        const incidentId =
          context.activity?.value?.action.data.incidentSelectedVal;
        const allIncidentData = await incidentService.getAllInc(
          companyData.teamId
        );

        let incList = [];
        if (allIncidentData.length > 0) {
          incList = allIncidentData.map((inc, index) => ({
            title: inc.incTitle,
            value: inc.incId,
          }));
        }
        const cards = CardFactory.adaptiveCard(
          updateIncidentListCard(companyData, incList, incidentId)
        );

        const message = MessageFactory.attachment(cards);
        message.id = context.activity.replyToId;
        await context.updateActivity(message);
      } else if (uVerb === "delete_inc") {
        const cards = CardFactory.adaptiveCard({
          type: "AdaptiveCard",
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          version: "1.4",
          body: [
            {
              type: "TextBlock",
              text: `✔️ The Incident has been deleted successfully.`,
              wrap: true,
            },
          ],
        });
        const message = MessageFactory.attachment(cards);
        message.id = context.activity.replyToId;
        await context.updateActivity(message);
      } else if (uVerb === "submit_comment") {
        const action = context.activity.value.action;
        const {
          userId,
          incId,
          incTitle,
          incCreatedBy,
          eventResponse,
          commentVal,
        } = action.data;
        const incGuidance = await incidentService.getIncGuidance(incId);
        let responseText = commentVal
          ? `✔️ Your safety status has been sent to the <at>${incCreatedBy.name}</at>. Someone will be in touch with you as soon as possible.\n\n**Guidance:**\n\n` + incGuidance
          : `✔️ Your message has been sent to <at>${incCreatedBy.name}</at>. Someone will be in touch with you as soon as possible.\n\n**Guidance:**\n\n` + incGuidance;
        const cards = CardFactory.adaptiveCard(
          updateSubmitCommentCard(responseText, incCreatedBy)
        );

        const message = MessageFactory.attachment(cards);
        message.id = context.activity.replyToId;
        await context.updateActivity(message);
      } else if (uVerb === "submit_contact_us") {
        let responseText = `✔️ Your feedback has been submitted successfully.`;
        const cards = CardFactory.adaptiveCard(
          updateContactSubmitCard(responseText)
        );

        const message = MessageFactory.attachment(cards);
        message.id = context.activity.replyToId;
        await context.updateActivity(message);
      } else if (uVerb === "send_response") {
        const action = context.activity.value.action;
        const { info: response, inc, companyData } = action.data;
        const { incId, incTitle, incCreatedBy } = inc;
        let responseText = "";
        if (response === "i_am_safe") {
          responseText = `Glad you're safe! We have informed <at>${incCreatedBy.name}</at> of your situation.`;
        } else {
          responseText = `Sorry for your situation! We have informed <at>${incCreatedBy.name}</at> of your situation.`;
        }
        const incGuidance = await incidentService.getIncGuidance(incId);
        const cards = CardFactory.adaptiveCard(
          updateSafeMessage(
            incTitle,
            responseText,
            incCreatedBy,
            response,
            context.activity.from.id,
            incId,
            companyData,
            inc,
            incGuidance
          )
        );

        const message = MessageFactory.attachment(cards);
        message.id = context.activity.replyToId;
        await context.updateActivity(message);
      } else if (
        uVerb === "send_approval" ||
        uVerb === "cancel_send_approval"
      ) {
        if (uVerb === "send_approval") {
          await context.sendActivities([{ type: "typing" }]);
        }
        const action = context.activity.value.action;
        const { incTitle: incTitle } = action.data.incident;
        const { inc_created_by: incCreatedBy } =
          context.activity?.value?.action?.data;
        let preTextMsg = "";
        let isAllMember = false;
        if (context.activity?.value?.action.data.selected_members) {
          preTextMsg = `Should I send this message to the selected user(s)?`;
        } else {
          isAllMember = true;
          preTextMsg = `Should I send this message to everyone?`;
        }
        const isRecurringInc = (action.data.incType === "recurringIncident");
        const cards = CardFactory.adaptiveCard(
          updateSendApprovalMessage(
            incTitle,
            incCreatedBy,
            preTextMsg,
            uVerb === "send_approval" ? true : false,
            isAllMember,
            isRecurringInc
          )
        );
        const message = MessageFactory.attachment(cards);
        message.id = context.activity.replyToId;
        await context.updateActivity(message);
      }
      const user = context.activity.from;
      if (context.activity.name === "adaptiveCard/action") {
        const card = await bot.selectResponseCard(context, user);
        if (card && card["$schema"]) {
          console.log("insidess");
          return bot.invokeResponse(card);
        } else {
          return {
            status: StatusCodes.OK,
          };
        }
      }
    } catch (error) {
      console.log(error);
    }
  }

  async hanldeAdminOrSuperUserMsg(context, companyData) {
    try {
      const acvtivityData = context.activity;
      let txt = acvtivityData.text;
      // console.log("txt >> ", txt);
      const removedMentionText =
        TurnContext.removeRecipientMention(acvtivityData);
      if (removedMentionText) {
        // Remove the line break
        txt = removedMentionText.toLowerCase().replace(/\n|\r/g, "").trim();
      }
      await context.sendActivity({
        attachments: [
          CardFactory.adaptiveCard(bot.invokeMainActivityBoard(companyData)),
        ],
      });
    } catch (error) {
      console.log(error);
    }
  }

  async hanldeNonAdminUserMsg(context) {
    try {
      await context.sendActivity(
        MessageFactory.text(
          `👋 Hello! Unfortunately, you **do not have permissions** to initiate a safety check. Please contact your Teams Admin to initiate.`
        )
      );
    } catch (error) {
      console.log(error);
    }
  }
  async hanldeChannelUserMsg(context) {
    try {
      await context.sendActivity(
        MessageFactory.text(
          `👋 Hello!! I can surely help with this via direct message. Please send me a "Hi" in a direct message.`
        )
      );
    } catch (error) {
      console.log(error);
    }
  }
}

module.exports.BotActivityHandler = BotActivityHandler;
