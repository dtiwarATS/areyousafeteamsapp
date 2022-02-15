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
const {
  getCompaniesData,
  insertCompanyData,
  deleteCompanyData,
  updateCompanyData,
} = require("../db/dbOperations");
const {
  sendDirectMessage,
  sendDirectMessageCard,
} = require("../api/apiMethods");

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
      console.log("acvtivityData - onMessage", acvtivityData);
      await context.sendActivities([{ type: "typing" }]);
      if (acvtivityData.conversation.conversationType === "channel") {
        await this.hanldeChannelUserMsg(context);
        /* const channelId = acvtivityData.channelData.teamsChannelId;
        const genChannelId = acvtivityData.channelData.teamsTeamId;
        console.log("Recieved message from channel ", channelId);

        // fetch companyData and check if channelId matches team_id stored in DB then proceed
        const companyData = await getCompaniesData(
          acvtivityData.from.aadObjectId,
          genChannelId
        );

        // console.log("companyData >> ", companyData);

        isSuperUser =
          companyData.superUsers &&
          companyData.superUsers.some(
            (su) => su === acvtivityData.from.aadObjectId
          )
            ? true
            : false;

        if (
          (acvtivityData.from.aadObjectId === companyData.userObjId &&
            genChannelId === companyData.teamId) ||
          isSuperUser
        ) {
          isAdminOrSuperuser = true;
          console.log("isAdminOrSuperuser >> ", isAdminOrSuperuser);

          await this.hanldeAdminOrSuperUserMsg(context, companyData);
        } else {
          await this.hanldeNonAdminUserMsg(context);
        } */
      } else if (acvtivityData.conversation.conversationType === "personal") {
        console.log("Recieved message from personal ");
        // fetch  general channel id from db (ie same as team Id)
        const companyData = await getCompaniesData(
          acvtivityData.from.aadObjectId
        );

        console.log("companyData >> ", companyData);
        if (companyData.userId != undefined && companyData.teamId?.length > 0) {
          isSuperUser =
            companyData.superUsers &&
            companyData.superUsers.some(
              (su) => su === acvtivityData.from.aadObjectId
            )
              ? true
              : false;

          // check if from.id matches user id stored in DB then proceed
          if (acvtivityData.from.id === companyData.userId || isSuperUser) {
            isAdminOrSuperuser = true;
            console.log("isAdminOrSuperuser >> ", isAdminOrSuperuser);
            await this.hanldeAdminOrSuperUserMsg(context, companyData);
          } else {
            await this.hanldeNonAdminUserMsg(context);
          }
        } else {
          // fetch  general channel id from db (ie same as team Id)
          const companyData = await getCompaniesData(
            acvtivityData.from.aadObjectId,
            acvtivityData?.channelData?.tenant.id,
            true
          );
          console.log("companyData not admin>> ", companyData);
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
                  url: "https://announcebot.in/img/InstallDetails.png",
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
      console.log("acvtivityData - onConversationUpdate>> ", acvtivityData);
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
                console.log("Company data inserted into DB >> ", companyData);
              } else {
                await updateCompanyData(
                  acvtivityData.from.id,
                  teamId,
                  acvtivityData.channelData.team.name
                );
                console.log({ companyData });
                if (!companyData.welcomeMessageSent) {
                  await sendDirectMessageCard(
                    context,
                    acvtivityData.from,
                    bot.invokeMainActivityBoard(companyDataObj)
                  );
                  console.log(
                    "Company data updated into DB >> ",
                    companyDataObj
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
        console.log("inside teamDeleted", process.env.MicrosoftAppId);
        const { membersRemoved } = acvtivityData;
        console.log("membersRemoved", {
          membersRemoved,
          isBotRemvoed: membersRemoved[0].id.includes(
            process.env.MicrosoftAppId
          ),
        });
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
                    \r\nIdeal for Safety admins and HR personnel to setup and use during emergency situations. Enter 'Hi' to start a conversation with the bot.`,
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
                    text: "If you need any help or want to share feedback, feel free to reach out to my makers at **help@safetybot.in**",
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
        console.log("firing last else");
        const welcomeMsg = `👋 Hello! Are you safe? allows you to trigger a safety check during a crisis. All users will get a direct message asking them to mark themselves safe.
             \r\nIdeal for Safety admins and HR personnel to setup and use during emergency situations.\r\nYou do not need any other software or service to use this app.\r\nEnter 'Hi' to start a conversation with the bot.
             
             \n\r\r\n\n Are You Safe? Bot works best when added to a Team. Please click on the arrow button next to the blue Add button and select 'Add to a team' to continue.`;

        await sendDirectMessage(context, acvtivityData.from, welcomeMsg);
      }
    });
  }

  async onInvokeActivity(context) {
    try {
      await context.sendActivities([{ type: "typing" }]);
      console.log("Activity: ", context.activity.name);
      const user = context.activity.from;
      if (context.activity.name === "adaptiveCard/action") {
        const action = context.activity.value.action;
        console.log("Verb: ", action.verb);
        const card = await bot.selectResponseCard(context, user);
        if (card && card["$schema"]) {
          return bot.invokeResponse(card);
          // await context.sendActivity({
          //   attachments: [CardFactory.adaptiveCard(card)],
          // });
          // return {
          //   status: StatusCodes.OK,
          //   body: {},
          // };
        } else {
          return {
            status: StatusCodes.OK,
            body: {},
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

      // Trigger command by IM text
      /* switch (txt) {
        case "hi":
          console.log("Running on Message Activity.");
          await context.sendActivity({
            attachments: [
              CardFactory.adaptiveCard(
                bot.invokeMainActivityBoard(companyData)
              ),
            ],
          });
          break;
        case "hello":
          console.log("{acvtivityData.from >> ", acvtivityData.from);
          const mention = {
            type: "mention",
            mentioned: acvtivityData.from,
            text: `<at>${acvtivityData.from.name}</at>`,
          };
          const topLevelMessage = MessageFactory.text(`Hello! ${mention.text}`);
          topLevelMessage.entities = [mention];
          await context.sendActivity(topLevelMessage);
          break;
      } */
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
