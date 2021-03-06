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
  getInstallationData,
  addTeamMember,
  removeTeamMember,
  removeAllTeamMember,
  deleteCompanyDataByTeamId,
  deleteCompanyDataByuserAadObjId
} = require("../db/dbOperations");
const {
  sendDirectMessage,
  sendDirectMessageCard,
  getAllTeamMembers
} = require("../api/apiMethods");

const {
  updateMainCard,
  updateCard,
  updateSendApprovalMessage,
  updateSubmitCommentCard,
  updateSafeMessage,
  updateDeleteCard,
  updateSesttingsCard,
  updateContactSubmitCard,
} = require("../models/UpdateCards");
const db = require("../db");

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
      if (acvtivityData.text == "sendversionupdate") {
        await bot.sendMsg(context);
      }
      // else if (acvtivityData.text == "dashboard") {
      //   const card = {
      //     "type": "AdaptiveCard",
      //     "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
      //     "version": "1.5",
      //     "actions": [
      //       {
      //         "type": "Action.Execute",
      //         "title": "Go to dashboard tab",
      //         "verb": "add_user_info"
      //       }
      //     ]
      //   };
      //   await context.sendActivity({
      //     attachments: [CardFactory.adaptiveCard(card)],
      //   });
      // }
      else {
        await context.sendActivities([{ type: "typing" }]);
        if (acvtivityData.conversation.conversationType === "channel") {
          await this.hanldeChannelUserMsg(context);
        } else if (acvtivityData.conversation.conversationType === "personal") {
          let isInstalledInTeam = true;
          let companyData = await getCompaniesData(
            acvtivityData.from.aadObjectId
          );

          if (!companyData.teamId?.length) {
            isInstalledInTeam = false;
          }

          const isAdmin = await isAdminUser(
            acvtivityData.from.aadObjectId,
            companyData?.teamId
          );

          if (isAdmin && isInstalledInTeam) {
            await this.hanldeAdminOrSuperUserMsg(context, companyData);
            await next();
            return {
              status: StatusCodes.OK,
            };
          }

          if (!isInstalledInTeam) {
            companyData = await getCompaniesDataBySuperUserId(
              acvtivityData.from.aadObjectId, true
            );
            if (companyData != null && companyData !== undefined && companyData.teamId?.length > 0) {
              isSuperUser = true;
              isInstalledInTeam = true;
            }
          }

          if ((isAdmin || isSuperUser) && isInstalledInTeam) {
            await this.hanldeAdminOrSuperUserMsg(context, companyData);
            await next();
            return;
          }

          if ((isAdmin || isSuperUser) && !isInstalledInTeam) {
            bot.sendIntroductionMessage(context, acvtivityData.from);
            await next();
            return;
          } else {
            await this.hanldeNonAdminUserMsg(context);
          }
          /*
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
              companyData.teamId?.length > 0 && companyData.superUsers.includes(acvtivityData.from.aadObjectId)
            ) {
              await this.hanldeNonAdminUserMsg(context);
            } else {
              bot.sendIntroductionMessage(context, acvtivityData.from);
            }
          }
          */
        }

        await next();
      }
    });

    this.onConversationUpdate(async (context, next) => {
      let addedBot = false;
      const acvtivityData = context.activity;
      const teamId = acvtivityData?.channelData?.team?.id;
      const conversationType = context.activity.conversation.conversationType;
      if (
        acvtivityData &&
        acvtivityData?.channelData?.eventType === "teamMemberAdded"
      ) {
        const { membersAdded } = acvtivityData;
        const teamId = acvtivityData.channelData.team.id;
        // retrive user info who installed the app from TeamsInfo.getTeamMembers(context, teamId);
        const allMembersInfo = await TeamsInfo.getTeamMembers(
          context,
          teamId
        );
        for (let i = 0; i < membersAdded.length; i++) {
          // See if the member added was our bot
          if (membersAdded[i].id.includes(process.env.MicrosoftAppId)) {
            addedBot = true;

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
                serviceUrl: context.activity.serviceUrl
              };

              const companyData = await insertCompanyData(companyDataObj, allMembersInfo, conversationType);
              this.sendWelcomeMessage(context, acvtivityData, adminUserInfo, companyData);

              // const companyData = await getCompaniesData(
              //   acvtivityData?.from?.aadObjectId
              // );
              // if (
              //   companyData.userId === undefined &&
              //   (companyData.teamId === undefined || companyData.teamId?.length <= 0)
              // ) {
              //   const companyData = await insertCompanyData(companyDataObj);
              //   this.sendWelcomeMessage(context, acvtivityData, adminUserInfo, companyData);                          
              // } else {
              //   await updateCompanyData(
              //     acvtivityData.from.id,
              //     teamId,
              //     acvtivityData.channelData.team.name
              //   );
              //   if (!companyData.welcomeMessageSent) {
              //     await sendDirectMessageCard(
              //       context,
              //       acvtivityData.from,
              //       bot.invokeMainActivityBoard(companyDataObj)
              //     );
              //   }
              // }
            }
          } else {
            const teamMember = allMembersInfo.find(
              (m) => m.id === membersAdded[i].id
            );
            const teamMembers = [teamMember];
            await addTeamMember(teamId, teamMembers);
          }
          //console.log("bot added >> ", addedBot);
        }
      } // if bot/member is installed/added
      else if (
        (acvtivityData &&
          acvtivityData?.channelData?.eventType === "teamDeleted") ||
        acvtivityData?.channelData?.eventType === "teamMemberRemoved"
      ) {
        if (acvtivityData?.channelData?.eventType === "teamDeleted") {
          await deleteCompanyDataByTeamId(teamId);
          await removeAllTeamMember(teamId);
        } else {
          const { membersRemoved } = acvtivityData;

          if (membersRemoved[0].id.includes(process.env.MicrosoftAppId)) {
            await deleteCompanyData(
              acvtivityData?.from?.aadObjectId,
              acvtivityData?.channelData?.team.id
            );
          } else {
            for (let i = 0; i < membersRemoved.length; i++) {
              await removeTeamMember(teamId, membersRemoved[i].id);
            }
          }
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
                serviceUrl: context.activity.serviceUrl
              };
              const companyData = await insertCompanyData(companyDataObj, null, conversationType);
              this.sendWelcomeMessage(context, acvtivityData, adminUserInfo, companyData);
              //console.log("Company data inserted into DB >> ", companyData);
            }
          }

          // console.log("bot added >> ", addedBot);
        }
      }
      else if (acvtivityData?.channelData?.eventType === "channelCreated" || acvtivityData?.channelData?.eventType === "channelDeleted") {
      }
      else {
        const welcomeMsg = `???? Hello! Are you safe? allows you to trigger a safety check during a crisis. All users will get a direct message asking them to mark themselves safe.
             \r\nIdeal for Safety admins and HR personnel to setup and use during emergency situations.\r\nYou do not need any other software or service to use this app.\r\nEnter 'Hi' to start a conversation with the bot.
             
             \n\r\r\n\n Are You Safe? Bot works best when added to a Team. Please click on the arrow button next to the blue Add button and select 'Add to a team' to continue.`;

        await sendDirectMessage(context, acvtivityData.from, welcomeMsg);
      }
    });
  }

  async onInstallationUpdateActivity(context) {
    try {
      var action = context.activity.action;
      const conversationType = context.activity.conversation.conversationType;
      if (action == "remove" && conversationType == "personal") {
        await deleteCompanyDataByuserAadObjId(context?.activity?.from?.aadObjectId);
      }
      // if (action == "add-upgrade") {
      //   const teamId = context.activity.channelData.team.id;
      //   const serviceUrl = context.activity.serviceUrl;
      //   const allMembersInfo = await getAllTeamMembers(context, teamId);
      //   await addTeamMember(teamId, allMembersInfo);
      //   await incidentService.saveServiceUrl(teamId, serviceUrl);
      // }
    } catch (err) {
      console.log(err);
    }
  }

  async onInvokeActivity(context) {
    try {
      const companyData = context.activity?.value?.action?.data?.companyData;
      const uVerb = context.activity?.value?.action?.verb;
      let adaptiveCard = null;
      console.log({ uVerb });
      if (uVerb == "add_user_info") {
        bot.addUserInfoByTeamId(context);
      } else if (
        uVerb === "create_onetimeincident" ||
        uVerb === "contact_us" ||
        uVerb === "view_settings" ||
        uVerb === "list_inc" ||
        uVerb === "list_delete_inc"
      ) {
        await context.sendActivities([{ type: "typing" }]);
        adaptiveCard = updateMainCard(companyData);
        const card = CardFactory.adaptiveCard(updateMainCard(companyData));

        const message = MessageFactory.attachment(card);
        message.id = context.activity.replyToId;
        await context.updateActivity(message);
      } else if (uVerb === "save_new_inc" || uVerb === "save_new_recurr_inc") {

        const { inc_title: incTitle } = context.activity?.value?.action?.data;
        const user = context.activity.from;
        const isDuplicateInc = await bot.verifyDuplicateInc(companyData.teamId, incTitle);
        if (isDuplicateInc) {
          await bot.showDuplicateIncError(context, user, companyData);
          return {
            status: StatusCodes.OK,
          };
        }

        await context.sendActivities([{ type: "typing" }]);
        let members = context.activity?.value?.action?.data?.selected_members;
        if (members === undefined) {
          members = "All Members";
        }
        let recurrInc = (uVerb === "save_new_recurr_inc") ? "recurring " : "";
        let text = `?????? New ${recurrInc}incident '${incTitle}' created successfully.`;
        const cards = CardFactory.adaptiveCard(
          updateCard(incTitle, members, text)
        );

        const message = MessageFactory.attachment(cards);
        message.id = context.activity.replyToId;
        await context.updateActivity(message);
      } else if (uVerb === "Cancel_button") {
        const text = `Ok.. No Problem... We can do this later. Thank you for your time.`;
        adaptiveCard = updateCard(null, null, text);
        const cards = CardFactory.adaptiveCard(adaptiveCard);
        const message = MessageFactory.attachment(cards);
        message.id = context.activity.replyToId;
        await context.updateActivity(message);
      }
      else if (uVerb === "view_inc_close") {
        const { inc_title: incTitle } = context.activity?.value?.action?.data;
        let members = context.activity?.value?.action?.data?.selected_members;
        if (members === undefined) {
          members = "All Members";
        }
        let text = `Hello! You do not have any incident running at the moment!!!`;
        const cards = CardFactory.adaptiveCard(
          updateCard(incTitle, members, text)
        );

        const message = MessageFactory.attachment(cards);
        message.id = context.activity.replyToId;
        await context.updateActivity(message);
      } else if (uVerb === "submit_settings") {
        const cards = CardFactory.adaptiveCard(updateSesttingsCard());

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
        let incGuidance = await incidentService.getIncGuidance(incId);
        incGuidance = incGuidance ? incGuidance : "No details available"
        let responseText = commentVal
          ? `?????? Your message has been sent to <at>${incCreatedBy.name}</at>. Someone will be in touch with you as soon as possible.\n\n**Guidance:**\n\n` + incGuidance
          : `?????? Your safety status has been sent to <at>${incCreatedBy.name}</at>. Someone will be in touch with you as soon as possible.\n\n**Guidance:**\n\n` + incGuidance;
        const cards = CardFactory.adaptiveCard(
          updateSubmitCommentCard(responseText, incCreatedBy)
        );

        const message = MessageFactory.attachment(cards);
        message.id = context.activity.replyToId;
        await context.updateActivity(message);
      } else if (uVerb === "submit_contact_us") {
        let responseText = `?????? Your feedback has been submitted successfully.`;
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

        const incStatusId = await incidentService.getIncStatus(incId);
        if (incStatusId == -1 || incStatusId == 2) {
          await bot.sendIncStatusValidation(context, incStatusId);
          return {
            status: StatusCodes.OK,
          };
        }

        let responseText = "";
        if (response === "i_am_safe") {
          responseText = `Glad you're safe! Your safety status has been sent to <at>${incCreatedBy.name}</at>`;
        } else {
          responseText = `Sorry to hear that! We have informed <at>${incCreatedBy.name}</at> of your situation and someone will be reaching out to you as soon as possible.`;
        }
        var incGuidance = await incidentService.getIncGuidance(incId);
        incGuidance = incGuidance ? incGuidance : "No details available";
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
        // if (uVerb === "send_approval") {
        //   await context.sendActivities([{ type: "typing" }]);
        // }
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
            isRecurringInc,
            action.data.safetyCheckMessageText,
            action.data.mentionUserEntities,
            action.data.guidance
          )
        );
        const message = MessageFactory.attachment(cards);
        message.id = context.activity.replyToId;
        await context.updateActivity(message);
      }
      const user = context.activity.from;
      if (context.activity.name === "adaptiveCard/action") {
        const card = await bot.selectResponseCard(context, user);
        if (adaptiveCard != null) {
          return bot.invokeResponse(adaptiveCard);
        } else if (card) {
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
      const mainCard = await bot.invokeMainActivityBoard(context, companyData);
      await context.sendActivity({
        attachments: [
          CardFactory.adaptiveCard(mainCard)
        ]
      });
    } catch (error) {
      console.log(error);
    }
  }

  async hanldeNonAdminUserMsg(context) {
    try {
      await context.sendActivity(
        MessageFactory.text(
          `???? Hello! Unfortunately, you **do not have permissions** to initiate a safety check. Please contact your Teams Admin to initiate.`
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
          `???? Hello!! I can surely help with this via direct message. Please send me a "Hi" in a direct message.`
        )
      );
    } catch (error) {
      console.log(error);
    }
  }
  async sendWelcomeMessage(context, acvtivityData, adminUserInfo, companyData) {
    console.log({ "sendWelcomeMessage": companyData });
    if (companyData == null) {
      return;
    }
    // let isUpdate = false;
    let isUpdate = (companyData.isUpdate == "true");
    // if (context.activity.conversation.conversationType != "personal") {
    //   return;
    // }

    if (!isUpdate) {
      const cards = {
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
        type: "AdaptiveCard",
        version: "1.0",
        body: [
          {
            type: "TextBlock",
            text: `???? Hello! Are you safe? allows you to trigger a safety check during a crisis. All users will get a direct message asking them to mark themselves safe.
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

      let teamName = "";
      if (acvtivityData.channelData != null && acvtivityData.channelData.team != null && acvtivityData.channelData.team.name != null) {
        teamName = acvtivityData.channelData.team.name;
      }

      await bot.sendInstallationEmail(
        adminUserInfo.email,
        adminUserInfo.name,
        teamName
      );
    }
  }
}

module.exports.BotActivityHandler = BotActivityHandler;
