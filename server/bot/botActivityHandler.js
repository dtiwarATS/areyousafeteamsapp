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
  deleteCompanyDataByuserAadObjId,
  getUserLicenseDetails,
  updateIsUserInfoSaved,
  getCompanyDataByTenantId
} = require("../db/dbOperations");
const {
  sendDirectMessage,
  sendDirectMessageCard,
  getAllTeamMembers,
  getAllTeamMembersByConnectorClient
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
const { processSafetyBotError } = require("../models/processError");
const { getWelcomeMessageCard, getSubcriptionSelectionCard } = require("./subscriptionCard");
const PersonalEmail = require("../Email/personalEmail");

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
      try {
        let isSuperUser = false;
        const acvtivityData = context.activity;
        const tenantId = acvtivityData?.conversation?.tenantId;

        const isValidTenant = () => { (tenantId != null && tenantId === "b9328432-f501-493e-b7f4-3105520a1cd4") };

        if (acvtivityData.text == "sendversionupdate") {
          await bot.sendMsg(context);
        } else if (acvtivityData.text == "addteamsusers") {
          if (isValidTenant) {
            await bot.addteamsusers();
          }
        } else if (acvtivityData.text == "sendProactiveMessaageToUserTest") {
          if (isValidTenant) {
            await bot.sendProactiveMessaageToUserTest();
          }
        } else if (acvtivityData.text == "updateConversationId") {
          if (isValidTenant) {
            await incidentService.updateConversationId();
          }
        }
        else {
          await context.sendActivities([{ type: "typing" }]);
          if (acvtivityData.conversation.conversationType === "channel") {
            await this.hanldeChannelUserMsg(context);
          } else if (acvtivityData.conversation.conversationType === "personal") {

            let companyData = null, isInstalledInTeam = true;

            ({ companyData, isInstalledInTeam, isSuperUser } = await incidentService.isBotInstalledInTeam(acvtivityData.from.aadObjectId));

            const isAdmin = await isAdminUser(
              acvtivityData.from.aadObjectId
            );

            if (!(isAdmin || isSuperUser)) {
              await this.hanldeNonAdminUserMsg(context);
              await next();
              return;
            }

            if (!isInstalledInTeam) {
              bot.sendIntroductionMessage(context, acvtivityData.from);
              await next();
              return;
            }

            const userLicenseDetails = await getUserLicenseDetails(acvtivityData.from.aadObjectId, companyData.teamId);
            if (userLicenseDetails?.hasLicense === false) {
              await this.notifyUserForInvalidLicense(context, userLicenseDetails, companyData);
              await next();
              return;
            }

            try {
              if (companyData != null && acvtivityData != null && companyData.teamId != null) {
                if (companyData.serviceUrl == null || companyData.serviceUrl == "") {
                  await bot.updateServiceUrl(context, companyData.userTenantId);
                }

                if (!companyData.isUserInfoSaved) {
                  const companyDataofSameTenantId = await getCompanyDataByTenantId(companyData.userTenantId, "and (isUserInfoSaved is null or isUserInfoSaved = 0)");
                  if (companyDataofSameTenantId != null && companyDataofSameTenantId.length > 0) {
                    await Promise.all(
                      companyDataofSameTenantId.map(async (cmpData) => {
                        const allTeamMembers = await getAllTeamMembersByConnectorClient(cmpData.team_id, acvtivityData.serviceUrl);
                        if (allTeamMembers != null && allTeamMembers.length > 0) {
                          const isUserInfoSaved = await addTeamMember(cmpData.team_id, allTeamMembers, false);
                          if (isUserInfoSaved) {
                            await updateIsUserInfoSaved(cmpData.id, cmpData.team_id, cmpData.user_tenant_id, true);
                          }
                        }
                      })
                    );
                  }
                }
              }
            } catch (err) {
              processSafetyBotError(err, "", "");
            }

            if (isAdmin || isSuperUser) {
              await this.hanldeAdminOrSuperUserMsg(context, companyData);
              await next();
              return {
                status: StatusCodes.OK,
              };
            }
          }
          await next();
        }
      } catch (err) {
        processSafetyBotError(err, "", "");
      }
    });

    const getCompaniesDataJSON = (context, adminUserInfo, teamId, teamName) => {
      let userEmail = adminUserInfo.email;
      if (userEmail == null) {
        userEmail = adminUserInfo?.userPrincipalName;
      }
      return {
        userId: adminUserInfo.id,
        userTenantId: adminUserInfo.tenantId,
        userObjId: adminUserInfo.aadObjectId,
        userName: adminUserInfo.name,
        email: userEmail == null ? "" : userEmail,
        teamId: teamId,
        teamName: teamName,
        superUser: [],
        createdDate: new Date(Date.now()).toISOString(),
        welcomeMessageSent: 0,
        serviceUrl: context.activity.serviceUrl
      };
    }

    this.onConversationUpdate(async (context, next) => {
      let addedBot = false;
      const acvtivityData = context.activity;
      const teamId = acvtivityData?.channelData?.team?.id;
      const userAadObjectId = acvtivityData?.from?.aadObjectId;
      try {
        const conversationType = acvtivityData.conversation.conversationType;
        if (acvtivityData &&
          acvtivityData?.channelData?.eventType === "teamMemberAdded"
        ) {
          const { membersAdded } = acvtivityData;
          // const teamId = acvtivityData.channelData.team.id;
          // retrive user info who installed the app from TeamsInfo.getTeamMembers(context, teamId);
          const allMembersInfo = await TeamsInfo.getTeamMembers(
            context,
            teamId
          );
          let teamMemberCount = 0;
          if (allMembersInfo != null && Array.isArray(allMembersInfo) && allMembersInfo.length > 0) {
            teamMemberCount = allMembersInfo.length;
          }
          for (let i = 0; i < membersAdded.length; i++) {
            // See if the member added was our bot
            if (membersAdded[i].id.includes(process.env.MicrosoftAppId)) {
              addedBot = true;

              const adminUserInfo = allMembersInfo.find(
                (m) => m.id === acvtivityData.from.id
              );

              if (adminUserInfo) {
                const companyDataObj = getCompaniesDataJSON(context, adminUserInfo, teamId, acvtivityData.channelData.team.name);
                const companyData = await insertCompanyData(companyDataObj, allMembersInfo, conversationType);
                await this.sendWelcomeMessage(context, acvtivityData, adminUserInfo, companyData, teamMemberCount);
                if (teamId != null) {
                  await incidentService.updateConversationId(teamId);
                }
              }
            } else {
              const teamMember = allMembersInfo.find(
                (m) => m.id === membersAdded[i].id
              );
              if (teamMember != null) {
                const teamMembers = [teamMember];
                await addTeamMember(teamId, teamMembers, true);
                if (teamMember.aadObjectId != null) {
                  await incidentService.updateConversationId(null, teamMember.aadObjectId);
                }
              }
            }
          }
        } // if bot/member is installed/added
        else if (
          (acvtivityData &&
            acvtivityData?.channelData?.eventType === "teamDeleted") ||
          acvtivityData?.channelData?.eventType === "teamMemberRemoved"
        ) {
          if (acvtivityData?.channelData?.eventType === "teamDeleted") {
            const isDeleted = await deleteCompanyData(teamId, acvtivityData.from.aadObjectId);
            if (isDeleted) {
              await this.sendUninstallationEmail(acvtivityData.from.aadObjectId);
            }
          } else {
            const { membersRemoved } = acvtivityData;

            if (membersRemoved[0].id.includes(process.env.MicrosoftAppId)) {
              const isDeleted = await deleteCompanyData(
                acvtivityData?.channelData?.team.id, acvtivityData.from.aadObjectId
              );
              if (isDeleted) {
                await this.sendUninstallationEmail(acvtivityData.from.aadObjectId);
              }
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
              // retrive user info who installed the app
              const adminUserInfo = await TeamsInfo.getMember(
                context,
                acvtivityData.from.id
              );
              if (adminUserInfo) {
                const companyDataObj = getCompaniesDataJSON(context, adminUserInfo, "", "");
                const companyData = await insertCompanyData(companyDataObj, null, conversationType);
                await this.sendWelcomeMessage(context, acvtivityData, adminUserInfo, companyData, 0);
              }
            }
          }
        }
        else if (acvtivityData?.channelData?.eventType === "channelCreated" || acvtivityData?.channelData?.eventType === "channelDeleted") {
        }
        else {
          const welcomeMsg = `👋 Hello! Are you safe? allows you to trigger a safety check during a crisis. All users will get a direct message asking them to mark themselves safe.
             \r\nIdeal for Safety admins and HR personnel to setup and use during emergency situations.\r\nYou do not need any other software or service to use this app.\r\nEnter 'Hi' to start a conversation with the bot.
             
             \n\r\r\n\n Are You Safe? Bot works best when added to a Team. Please click on the arrow button next to the blue Add button and select 'Add to a team' to continue.`;

          await sendDirectMessage(context, acvtivityData.from, welcomeMsg);
        }
      } catch (err) {
        processSafetyBotError(err, teamId, "", userAadObjectId, JSON.stringify(acvtivityData));
      }
    });
  }

  async notifyUserForInvalidLicense(context, userLicenseDetails, companyData) {
    try {
      if (userLicenseDetails && userLicenseDetails.isTrialExpired == true && userLicenseDetails.previousSubscriptionType == "2") {
        const { userName, userId } = userLicenseDetails;
        const { teamName, userId: adminUserId, userName: adminUserName } = companyData;
        const cardJSON = {
          "type": "AdaptiveCard",
          "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
          "version": "1.4",
          "body": [
            {
              "type": "TextBlock",
              "text": `Hello <at>${userName}</at>,`,
              "wrap": true
            },
            {
              "type": "TextBlock",
              "text": `Your license has been deactivated since the AreYouSafe bot free trial period for your ${teamName} team has ended. Please contact your admin <at>${adminUserName}</at> to upgrade to a premium subscription plan.`,
              "wrap": true
            },
            {
              "type": "TextBlock",
              "text": "With Gratitude,\n\nTeam AreYouSafe",
              "wrap": true
            }
          ],
          "msteams": {
            "entities": [
              {
                "type": "mention",
                "text": `<at>${userName}</at>`,
                "mentioned": {
                  "id": userId,
                  "name": userName,
                }
              },
              {
                "type": "mention",
                "text": `<at>${adminUserName}</at>`,
                "mentioned": {
                  "id": adminUserId,
                  "name": adminUserName,
                }
              }
            ]
          }
        }
        await context.sendActivity({
          attachments: [CardFactory.adaptiveCard(cardJSON)],
        });
      } else {
        await context.sendActivity(
          MessageFactory.text(
            `It looks like you are on the FREE version of the AreYouSafe? bot. Please contact your safety initiator to get access.`
          )
        );
      }
    } catch (err) {
      console.log(err);
      processSafetyBotError(err, "", "");
    }
  }

  async onInstallationUpdateActivity(context) {
    try {
      var action = context.activity.action;
      const conversationType = context.activity.conversation.conversationType;
      if (action == "remove" && conversationType == "personal") {
        await deleteCompanyDataByuserAadObjId(context?.activity?.from?.aadObjectId);
      }
    } catch (err) {
      console.log(err);
      processSafetyBotError(err, "", "");
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
        let text = `✔️ New ${recurrInc}incident '${incTitle}' created successfully.`;
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
          ? `✔️ Your message has been sent to <at>${incCreatedBy.name}</at>. Someone will be in touch with you as soon as possible.\n\n**Guidance:**\n\n` + incGuidance
          : `✔️ Your safety status has been sent to <at>${incCreatedBy.name}</at>. Someone will be in touch with you as soon as possible.\n\n**Guidance:**\n\n` + incGuidance;
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
    } catch (err) {
      console.log(err);
      processSafetyBotError(err, "", "");
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
    } catch (err) {
      console.log(err);
      processSafetyBotError(err, "", "");
    }
  }

  async hanldeNonAdminUserMsg(context) {
    try {
      await context.sendActivity(
        MessageFactory.text(
          `👋 Hello! Unfortunately, you **do not have permissions** to initiate a safety check. Please contact your Teams Admin to initiate.`
        )
      );
    } catch (err) {
      console.log(err);
      processSafetyBotError(err, "", "");
    }
  }
  async hanldeChannelUserMsg(context) {
    try {
      await context.sendActivity(
        MessageFactory.text(
          `👋 Hello!! I can surely help with this via direct message. Please send me a "Hi" in a direct message.`
        )
      );
    } catch (err) {
      console.log(err);
      processSafetyBotError(err, "", "");
    }
  }

  async sendWelcomeMessage(context, acvtivityData, adminUserInfo, companyData, teamMemberCount = 0) {
    const userAadObjId = acvtivityData.from.aadObjectId;
    try {
      console.log({ "sendWelcomeMessage": companyData });
      if (companyData == null) {
        return;
      }

      const isWelcomeMessageSent = await incidentService.isWelcomeMessageSend(userAadObjId);

      if (!isWelcomeMessageSent) {

        (new PersonalEmail.PersonalEmail()).sendWelcomEmail(companyData.userEmail, userAadObjId)
          .then(() => { })
          .catch((err) => {
            console.log(err);
          });

        const welcomeMessageCard = getWelcomeMessageCard(teamMemberCount, companyData.userEmail);
        await sendDirectMessageCard(context, acvtivityData.from, welcomeMessageCard);

        if (teamMemberCount > 10) {
          const subcriptionSelectionCard = getSubcriptionSelectionCard(teamMemberCount, companyData);
          await sendDirectMessageCard(context, acvtivityData.from, subcriptionSelectionCard);
        }

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
    } catch (err) {
      processSafetyBotError(err, "", "", userAadObjId);
    }
  }

  async sendUninstallationEmail(userAadObjId) {
    const userInfo = await incidentService.getUserInfoByUserAadObjId(
      userAadObjId
    );
    if (userInfo && userInfo.length > 0) {
      (new PersonalEmail.PersonalEmail()).sendUninstallationEmail(userInfo[0].email, userAadObjId)
        .then(() => { })
        .catch((err) => {
          console.log(err);
        });

      await bot.sendUninstallationEmail(
        userInfo[0].email, userInfo[0].user_name
      );
    }
  }

}

module.exports.BotActivityHandler = BotActivityHandler;
