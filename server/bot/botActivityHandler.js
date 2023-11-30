// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

const path = require("path");
const ENV_FILE = path.join(__dirname, "../../.env");
require("dotenv").config({ path: ENV_FILE });
const { AYSLog } = require("../utils/log");
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
  getWelcomeMessageCard2,
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
    bot.onInvokeActivity(context);
    return {
      status: StatusCodes.OK,
    };
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
        const welcomeMessageCard2 = getWelcomeMessageCard2(
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
            welcomeMessageCard2,
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
    let userEmailId = userInfo[0].email;
    let user_name = userInfo[0].user_name;
    if (!userEmailId) {
      const companyData = await getCompaniesData(userAadObjId);
      userEmailId = companyData?.userEmail;
      user_name = companyData?.userName;
    }
    if (userInfo && userInfo.length > 0) {
      new PersonalEmail.PersonalEmail()
        .sendUninstallationEmail(userEmailId, userAadObjId)
        .then(() => {})
        .catch((err) => {
          console.log(err);
        });

      await bot.sendUninstallationEmail(userEmailId, user_name);
    }
  }
}

module.exports.BotActivityHandler = BotActivityHandler;
