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
  getCompanyDataByTenantId,
  renameTeam,
} = require("../db/dbOperations");
const {
  sendDirectMessage,
  sendDirectMessageCard,
  getAllTeamMembers,
  getAllTeamMembersByConnectorClient,
  sendMultipleDirectMessageCard,
  getConversationMembers,
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
  updateSafeMessageqestion1,
  updateSafeMessageqestion2,
  updateSafeMessageqestion3,
} = require("../models/UpdateCards");
const db = require("../db");
const { processSafetyBotError } = require("../models/processError");
const {
  getWelcomeMessageCard,
  getSubcriptionSelectionCard,
  getTestIncPreviewCard,
  getWelcomeMessageCardForChannel,
} = require("./subscriptionCard");
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

        const isValidTenant = () => {
          tenantId != null &&
            tenantId === "b9328432-f501-493e-b7f4-3105520a1cd4";
        };

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
        } else if (acvtivityData.text == "sendProactiveMessaageToChannel") {
          if (isValidTenant) {
            await bot.sendProactiveMessaageToChannel();
          }
        } else if (acvtivityData.text == "updateConversationId") {
          if (isValidTenant) {
            await incidentService.updateConversationId();
          }
        } else {
          await context.sendActivities([{ type: "typing" }]);
          if (acvtivityData.conversation.conversationType === "channel") {
            await this.hanldeChannelUserMsg(context);
          } else if (
            acvtivityData.conversation.conversationType === "personal"
          ) {
            let companyData = null,
              isInstalledInTeam = true;
            const aadObjectId = acvtivityData.from.aadObjectId;
            ({ companyData, isInstalledInTeam, isSuperUser } =
              await incidentService.isBotInstalledInTeam(aadObjectId));

            const userLicenseDetails = await getUserLicenseDetails(
              aadObjectId,
              companyData.teamId
            );
            if (
              userLicenseDetails.userId != null &&
              userLicenseDetails?.hasLicense === false
            ) {
              await this.notifyUserForInvalidLicense(
                context,
                userLicenseDetails,
                companyData,
                aadObjectId
              );
              await next();
              return;
            }

            const isAdmin = await isAdminUser(aadObjectId);

            if (!isInstalledInTeam) {
              bot.sendIntroductionMessage(context, acvtivityData.from);
              await next();
              return;
            }

            if (!(isAdmin || isSuperUser)) {
              await this.hanldeNonAdminUserMsg(context, userLicenseDetails);
              await next();
              return;
            }

            try {
              if (
                companyData != null &&
                acvtivityData != null &&
                companyData.teamId != null
              ) {
                if (
                  companyData.serviceUrl == null ||
                  companyData.serviceUrl == ""
                ) {
                  await bot.updateServiceUrl(context, companyData.userTenantId);
                }

                if (!companyData.isUserInfoSaved) {
                  const companyDataofSameTenantId =
                    await getCompanyDataByTenantId(
                      companyData.userTenantId,
                      "and (isUserInfoSaved is null or isUserInfoSaved = 0)"
                    );
                  if (
                    companyDataofSameTenantId != null &&
                    companyDataofSameTenantId.length > 0
                  ) {
                    await Promise.all(
                      companyDataofSameTenantId.map(async (cmpData) => {
                        const allTeamMembers =
                          await getAllTeamMembersByConnectorClient(
                            cmpData.team_id,
                            acvtivityData.serviceUrl
                          );
                        if (
                          allTeamMembers != null &&
                          allTeamMembers.length > 0
                        ) {
                          const isUserInfoSaved = await addTeamMember(
                            cmpData.team_id,
                            allTeamMembers,
                            false
                          );
                          if (isUserInfoSaved) {
                            await updateIsUserInfoSaved(
                              cmpData.id,
                              cmpData.team_id,
                              cmpData.user_tenant_id,
                              true
                            );
                          }
                        }
                      })
                    );
                  }
                }
              }
            } catch (err) {
              processSafetyBotError(err, "", "", "", "onMessage - personal");
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
        processSafetyBotError(err, "", "", "", "onMessage");
      }
    });

    const getCompaniesDataJSON = (context, adminUserInfo, teamId, teamName) => {
      let userEmail = adminUserInfo.email;
      if (userEmail == null) {
        userEmail = adminUserInfo?.userPrincipalName;
      }
      let channelId = "",
        channelName = "";
      if (context?.activity?.conversation?.conversationType == "channel") {
        channelId =
          context.activity.conversation?.id != null
            ? context.activity.conversation?.id
            : teamId;
        channelName =
          context.activity.conversation?.name != null
            ? context.activity.conversation?.name
            : "General";
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
        serviceUrl: context.activity.serviceUrl,
        channelId,
        channelName,
      };
    };

    this.onConversationUpdate(async (context, next) => {
      let addedBot = false;
      const acvtivityData = context.activity;
      const teamId = acvtivityData?.channelData?.team?.id;
      const userAadObjectId = acvtivityData?.from?.aadObjectId;
      try {
        const conversationType = acvtivityData.conversation.conversationType;
        if (
          acvtivityData &&
          acvtivityData?.channelData?.eventType === "teamMemberAdded"
        ) {
          const { membersAdded } = acvtivityData;
          const allMembersInfo = await TeamsInfo.getTeamMembers(
            context,
            teamId
          );

          let teamMemberCount = 0;
          if (
            allMembersInfo != null &&
            Array.isArray(allMembersInfo) &&
            allMembersInfo.length > 0
          ) {
            teamMemberCount = allMembersInfo.length;
          }
          const adminUserInfo = allMembersInfo.find(
            (m) => m.id === acvtivityData.from.id
          );
          for (let i = 0; i < membersAdded.length; i++) {
            // See if the member added was our bot
            if (membersAdded[i].id.includes(process.env.MicrosoftAppId)) {
              addedBot = true;

              if (adminUserInfo) {
                const companyDataObj = getCompaniesDataJSON(
                  context,
                  adminUserInfo,
                  teamId,
                  acvtivityData.channelData.team.name
                );
                const companyData = await insertCompanyData(
                  companyDataObj,
                  allMembersInfo,
                  conversationType
                );
                //const newInc = await bot.createTestIncident(context, adminUserInfo.id, adminUserInfo.name, allMembersInfo, teamId, userAadObjectId, acvtivityData.from, companyData);
                await this.sendWelcomeMessage(
                  context,
                  acvtivityData,
                  adminUserInfo,
                  companyData,
                  teamMemberCount
                );
                if (teamId != null) {
                  incidentService.updateConversationId(teamId);
                }
              }
            } else {
              const teamMember = allMembersInfo.find(
                (m) => m.id === membersAdded[i].id
              );
              if (teamMember != null) {
                const teamMembers = [teamMember];
                await addTeamMember(teamId, teamMembers, true);
                if (adminUserInfo && i == membersAdded.length - 1) {
                  let userEmail = adminUserInfo.email
                    ? adminUserInfo.email
                    : adminUserInfo.userPrincipalName;
                  if (userEmail) {
                    const companyDataObj = getCompaniesDataJSON(
                      context,
                      adminUserInfo,
                      teamId,
                      acvtivityData.channelData.team.name
                    );
                    await this.onMemberAddedSendSubscriptionSelectionCard(
                      context,
                      acvtivityData.from,
                      userEmail,
                      teamId,
                      companyDataObj
                    );
                  }
                }
                if (teamMember.aadObjectId != null) {
                  incidentService.updateConversationId(
                    null,
                    teamMember.aadObjectId
                  );
                }
              }
            }
          }
        } else if (
          (acvtivityData &&
            acvtivityData?.channelData?.eventType === "teamDeleted") ||
          acvtivityData?.channelData?.eventType === "teamMemberRemoved"
        ) {
          if (acvtivityData?.channelData?.eventType === "teamDeleted") {
            const isDeleted = await deleteCompanyData(
              teamId,
              acvtivityData.from.aadObjectId
            );
            if (isDeleted) {
              await this.sendUninstallationEmail(
                acvtivityData.from.aadObjectId
              );
            }
          } else {
            const { membersRemoved } = acvtivityData;

            if (membersRemoved[0].id.includes(process.env.MicrosoftAppId)) {
              const isDeleted = await deleteCompanyData(
                acvtivityData?.channelData?.team.id,
                acvtivityData.from.aadObjectId
              );
              if (isDeleted) {
                await this.sendUninstallationEmail(
                  acvtivityData.from.aadObjectId
                );
              }
            } else {
              for (let i = 0; i < membersRemoved.length; i++) {
                await removeTeamMember(teamId, membersRemoved[i].id);
              }
            }
          }
        } else if (teamId == null && acvtivityData) {
          const { membersAdded } = acvtivityData;
          if (membersAdded) {
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
                  const companyDataObj = getCompaniesDataJSON(
                    context,
                    adminUserInfo,
                    "",
                    ""
                  );
                  const companyData = await insertCompanyData(
                    companyDataObj,
                    null,
                    conversationType
                  );
                  await this.sendWelcomeMessage(
                    context,
                    acvtivityData,
                    adminUserInfo,
                    companyData,
                    0
                  );
                }
              }
            }
          }
        } else if (
          acvtivityData?.channelData?.eventType === "channelCreated" ||
          acvtivityData?.channelData?.eventType === "channelDeleted"
        ) {
        } else if (acvtivityData?.channelData?.eventType === "teamRenamed") {
          const teamName = acvtivityData?.channelData?.team?.name;
          const tenantId = acvtivityData?.conversation?.tenantId;
          if (teamName != null && tenantId != null) {
            await renameTeam(teamId, teamName, tenantId);
          }
        } else {
          // const welcomeMsg = `👋 Hello! Are you safe? allows you to trigger a safety check during a crisis. All users will get a direct message asking them to mark themselves safe.
          //    \r\nIdeal for Safety admins and HR personnel to setup and use during emergency situations.\r\nYou do not need any other software or service to use this app.\r\nEnter 'Hi' to start a conversation with the bot.
          //    \n\r\r\n\n Are You Safe? Bot works best when added to a Team. Please click on the arrow button next to the blue Add button and select 'Add to a team' to continue.`;
          // await sendDirectMessage(context, acvtivityData.from, welcomeMsg);
        }
      } catch (err) {
        processSafetyBotError(
          err,
          teamId,
          "",
          userAadObjectId,
          JSON.stringify(acvtivityData)
        );
      }
    });
  }

  async notifyUserForInvalidLicense(
    context,
    userLicenseDetails,
    companyData,
    userAadObjId
  ) {
    try {
      const { userName, userId, adminUsrId, adminUsrName, teamName } =
        userLicenseDetails;
      //const { teamName, userId: adminUserId, userName: adminUserName } = companyData;
      let blockMessage = `You do not have the **AreYouSafe** bot license assigned for your **${teamName}** team. Please contact your admin <at>${adminUsrName}</at> to assign you the license.`;
      if (
        userLicenseDetails &&
        userLicenseDetails.isTrialExpired == true &&
        userLicenseDetails.previousSubscriptionType == "2"
      ) {
        blockMessage = `Your license has been deactivated since the **AreYouSafe** bot free trial period for your **${teamName}** team has ended. Please contact your admin <at>${adminUsrName}</at> to upgrade to a premium subscription plan.`;
      }

      const cardJSON = {
        type: "AdaptiveCard",
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
        version: "1.4",
        body: [
          {
            type: "TextBlock",
            text: `Hello <at>${userName}</at>,`,
            wrap: true,
          },
          {
            type: "TextBlock",
            text: blockMessage,
            wrap: true,
          },
          {
            type: "TextBlock",
            text: "With Gratitude,\n\nTeam AreYouSafe",
            wrap: true,
          },
        ],
        msteams: {
          entities: [
            {
              type: "mention",
              text: `<at>${userName}</at>`,
              mentioned: {
                id: userId,
                name: userName,
              },
            },
            {
              type: "mention",
              text: `<at>${adminUsrName}</at>`,
              mentioned: {
                id: adminUsrId,
                name: adminUsrName,
              },
            },
          ],
        },
      };
      await context.sendActivity({
        attachments: [CardFactory.adaptiveCard(cardJSON)],
      });
    } catch (err) {
      console.log(err);
      processSafetyBotError(
        err,
        "",
        "",
        userAadObjId,
        "notifyUserForInvalidLicense"
      );
    }
  }

  async onInstallationUpdateActivity(context) {
    try {
      var action = context.activity.action;
      const conversationType = context.activity.conversation.conversationType;
      if (action == "remove" && conversationType == "personal") {
        await deleteCompanyDataByuserAadObjId(
          context?.activity?.from?.aadObjectId
        );
      }
    } catch (err) {
      console.log(err);
      processSafetyBotError(err, "", "", "", "onInstallationUpdateActivity");
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
        const isDuplicateInc = await bot.verifyDuplicateInc(
          companyData.teamId,
          incTitle
        );
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
        let recurrInc = uVerb === "save_new_recurr_inc" ? "recurring " : "";
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
      } else if (uVerb === "view_inc_close") {
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
        incGuidance = incGuidance ? incGuidance : "No details available";
        let responseText = commentVal
          ? `✔️ Your message has been sent to <at>${incCreatedBy.name}</at>. Someone will be in touch with you as soon as possible.\n\n**Guidance:**\n\n` +
            incGuidance
          : `✔️ Your safety status has been sent to <at>${incCreatedBy.name}</at>. Someone will be in touch with you as soon as possible.\n\n**Guidance:**\n\n` +
            incGuidance;
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
      } else if (uVerb === "safetyVisitorQuestion1") {
        const action = context.activity.value.action;
        const { info: response, inc, companyData } = action.data;
        const { incId, incTitle, incCreatedBy } = inc;
        let respnse1 = "";

        if (response == "question1_yes") {
          const Qestion2 = CardFactory.adaptiveCard(
            updateSafeMessageqestion2(
              incTitle,
              "",
              incCreatedBy,
              response,
              context.activity.from.id,
              incId,
              companyData,
              inc,
              incGuidance
            )
          );

          await context.sendActivity({
            attachments: [Qestion2],
          });
          //click yess button on all visitor safe
        }
      } else if (uVerb === "safetyVisitorQuestion2") {
        const action = context.activity.value.action;
        const { info: response, inc, companyData } = action.data;
        const { incId, incTitle, incCreatedBy } = inc;
        let respnse1 = "";
        if (response == "question2_no") {
          const Qestion3 = CardFactory.adaptiveCard(
            updateSafeMessageqestion3(
              incTitle,
              "",
              incCreatedBy,
              response,
              context.activity.from.id,
              incId,
              companyData,
              inc,
              incGuidance
            )
          );

          await context.sendActivity({
            attachments: [Qestion3],
          });
        }
      }
      ////////////////////Question3
      else if (uVerb === "safetyVisitorQuestion3") {
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
        incGuidance = incGuidance ? incGuidance : "No details available";
        let responseText = commentVal
          ? `✔️ Your message has been sent to <at>${incCreatedBy.name}</at>. Someone will be in touch with you as soon as possible.\n\n**Guidance:**\n\n` +
            incGuidance
          : `✔️ Your safety status has been sent to <at>${incCreatedBy.name}</at>. Someone will be in touch with you as soon as possible.\n\n**Guidance:**\n\n` +
            incGuidance;
        const cards = CardFactory.adaptiveCard(
          updateSubmitCommentCard(responseText, incCreatedBy)
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

        const entities = {
          type: "mention",
          text: `<at>${incCreatedBy.name}</at>`,
          mentioned: {
            id: incCreatedBy.id,
            name: incCreatedBy.name,
          },
        };

        await sendDirectMessage(
          context,
          context.activity.from,
          responseText,
          entities
        );

        var incGuidance = await incidentService.getIncGuidance(incId);
        incGuidance = incGuidance ? incGuidance : "No details available";

        const cards = CardFactory.adaptiveCard(
          updateSafeMessage(
            incTitle,
            "",
            incCreatedBy,
            response,
            context.activity.from.id,
            incId,
            companyData,
            inc,
            incGuidance
          )
        );

        await context.sendActivity({
          attachments: [cards],
        });
        if (companyData.EnableSafetycheckForVisitors == true) {
          const Qestion1 = CardFactory.adaptiveCard(
            updateSafeMessageqestion1(
              incTitle,
              "",
              incCreatedBy,
              response,
              context.activity.from.id,
              incId,
              companyData,
              inc,
              incGuidance
            )
          );
          await context.sendActivity({
            attachments: [Qestion1],
          });
        }

        // const message = MessageFactory.attachment(cards);
        // message.id = context.activity.replyToId;
        // await context.updateActivity(message);
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
        const isRecurringInc = action.data.incType === "recurringIncident";
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
      } else if (uVerb == "triggerTestSafetyCheckMessage") {
        const action = context.activity.value.action;
        const { companyData, teamMemberCount } = action.data;
        const cards = CardFactory.adaptiveCard(
          getTestIncPreviewCard(teamMemberCount, companyData)
        );

        const message = MessageFactory.attachment(cards);
        message.id = context.activity.replyToId;
        context.updateActivity(message);
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
      processSafetyBotError(err, "", "", "", "onInvokeActivity");
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
        attachments: [CardFactory.adaptiveCard(mainCard)],
      });
    } catch (err) {
      console.log(err);
      processSafetyBotError(err, "", "", "", "hanldeAdminOrSuperUserMsg");
    }
  }

  async hanldeNonAdminUserMsg(context, userLicenseDetails) {
    const { userName, userId, adminUsrId, adminUsrName } = userLicenseDetails;
    try {
      const cardJSON = {
        type: "AdaptiveCard",
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
        version: "1.4",
        body: [
          {
            type: "TextBlock",
            text: `Hello <at>${userName}</at>,`,
            wrap: true,
          },
          {
            type: "TextBlock",
            text: `Unfortunately, you do not have permission to initiate a safety check. Please contact your admin <at>${adminUsrName}</at> to give you admin access.`,
            wrap: true,
          },
        ],
        msteams: {
          entities: [
            {
              type: "mention",
              text: `<at>${userName}</at>`,
              mentioned: {
                id: userId,
                name: userName,
              },
            },
            {
              type: "mention",
              text: `<at>${adminUsrName}</at>`,
              mentioned: {
                id: adminUsrId,
                name: adminUsrName,
              },
            },
          ],
        },
      };
      await context.sendActivity({
        attachments: [CardFactory.adaptiveCard(cardJSON)],
      });
    } catch (err) {
      console.log(err);
      processSafetyBotError(
        err,
        "",
        "",
        userId,
        JSON.stringify({
          fnName: "hanldeNonAdminUserMsg",
          userLicenseDetails: userLicenseDetails,
        })
      );
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
      processSafetyBotError(err, "", "", "", "hanldeChannelUserMsg");
    }
  }

  async sendSubscriptionSelectionCard(
    context,
    from,
    teamMemberCount,
    userEmail,
    companyDataObj
  ) {
    try {
      const subcriptionSelectionCard = getSubcriptionSelectionCard(
        teamMemberCount,
        userEmail,
        companyDataObj
      );
      await sendDirectMessageCard(context, from, subcriptionSelectionCard);
    } catch (err) {
      processSafetyBotError(
        err,
        "",
        "",
        from.aadObjectId,
        "sendSubscriptionSelectionCard"
      );
    }
  }

  async onMemberAddedSendSubscriptionSelectionCard(
    context,
    from,
    userEmail,
    teamId,
    companyDataObj
  ) {
    try {
      const teamMemberCount =
        await incidentService.getMembersCountForSubscriptionType1(
          teamId,
          from.aadObjectId
        );
      console.log({ teamMemberCount });
      if (teamMemberCount > 10) {
        await this.sendSubscriptionSelectionCard(
          context,
          from,
          teamMemberCount,
          userEmail,
          companyDataObj
        );
      }
    } catch (err) {
      processSafetyBotError(
        err,
        "",
        "",
        from.aadObjectId,
        "onMemberAddedSendSubscriptionSelectionCard"
      );
    }
  }

  async sendWelcomeMessageToChannel(context, userName, userId) {
    const wecomeMessageCardForChannelCard = getWelcomeMessageCardForChannel(
      userName,
      userId
    );
    const adaptiveCard = CardFactory.adaptiveCard(
      wecomeMessageCardForChannelCard
    );
    await context.sendActivity({
      attachments: [adaptiveCard],
    });
  }

  async sendWelcomeMessage(
    context,
    acvtivityData,
    adminUserInfo,
    companyData,
    teamMemberCount = 0
  ) {
    const userAadObjId = acvtivityData.from.aadObjectId;
    try {
      console.log({ sendWelcomeMessage: companyData });
      if (companyData == null) {
        return;
      }
      let teamName = companyData.teamName;
      //const isWelcomeMessageSent = await incidentService.isWelcomeMessageSend(userAadObjId);

      //if (!isWelcomeMessageSent) {
      try {
        if (teamName != null) {
          await this.sendWelcomeMessageToChannel(
            context,
            companyData.userName,
            companyData.userId
          );
        }
        const welcomeMessageCard = getWelcomeMessageCard(
          teamMemberCount,
          teamName
        );
        if (teamMemberCount > 0) {
          const testIncPreviewCard = getTestIncPreviewCard(
            teamMemberCount,
            companyData
          );
          await sendMultipleDirectMessageCard(
            context,
            acvtivityData.from,
            welcomeMessageCard,
            testIncPreviewCard
          );
        } else {
          await sendDirectMessageCard(
            context,
            acvtivityData.from,
            welcomeMessageCard
          );
        }
      } catch (err) {
        processSafetyBotError(err, "", "", userAadObjId, "welcomeMessageCard");
      }

      new PersonalEmail.PersonalEmail()
        .sendWelcomEmail(companyData.userEmail, userAadObjId)
        .then(() => {})
        .catch((err) => {
          console.log(err);
        });

      if (teamMemberCount > 10) {
        this.sendSubscriptionSelectionCard(
          context,
          acvtivityData.from,
          teamMemberCount,
          companyData.userEmail,
          companyData
        );
      }

      // let teamName = "";
      // if (acvtivityData.channelData != null && acvtivityData.channelData.team != null && acvtivityData.channelData.team.name != null) {
      //   teamName = acvtivityData.channelData.team.name;
      // }

      await bot.sendInstallationEmail(
        adminUserInfo.email,
        adminUserInfo.name,
        teamName
      );
      //}
    } catch (err) {
      processSafetyBotError(err, "", "", userAadObjId, "sendWelcomeMessage");
    }
  }

  async sendUninstallationEmail(userAadObjId) {
    const userInfo = await incidentService.getUserInfoByUserAadObjId(
      userAadObjId
    );
    if (userInfo && userInfo.length > 0) {
      new PersonalEmail.PersonalEmail()
        .sendUninstallationEmail(userInfo[0].email, userAadObjId)
        .then(() => {})
        .catch((err) => {
          console.log(err);
        });

      await bot.sendUninstallationEmail(
        userInfo[0].email,
        userInfo[0].user_name
      );
    }
  }
}

module.exports.BotActivityHandler = BotActivityHandler;
