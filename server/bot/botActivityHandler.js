// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

const path = require("path");
const ENV_FILE = path.join(__dirname, "../../.env");
require("dotenv").config({ path: ENV_FILE });
const { AYSLog } = require("../utils/log");
const poolPromise = require("../db/dbConn");
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
// const socketService = require("../socket/socketService");
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
  getUserById,
  sendSetupMessageToAllMembers,
} = require("../db/dbOperations");
const {
  sendDirectMessage,
  sendDirectMessageCard,
  getAllTeamMembers,
  getAllTeamMembersByConnectorClient,
  sendMultipleDirectMessageCard,
  getConversationMembers,
  sendProactiveMessaageToUser,
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
const dashboard = require("../models/dashboard");
const {
  getWelcomeMessageCard,
  getWelcomeMessageCardformpersonal,
  getWelcomeMessageCard2,
  getSubcriptionSelectionCard,
  getTestIncPreviewCard,
  getWelcomeMessageCardForChannel,
} = require("./subscriptionCard");
const PersonalEmail = require("../Email/personalEmail");
const { json } = require("body-parser");

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
              companyData.teamId,
            );
            if (
              userLicenseDetails.userId != null &&
              userLicenseDetails?.hasLicense === false
            ) {
              await this.notifyUserForInvalidLicense(
                context,
                userLicenseDetails,
                companyData,
                aadObjectId,
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
                      "and (isUserInfoSaved is null or isUserInfoSaved = 0)",
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
                            acvtivityData.serviceUrl,
                          );
                        if (
                          allTeamMembers != null &&
                          allTeamMembers.length > 0
                        ) {
                          const isUserInfoSaved = await addTeamMember(
                            cmpData.team_id,
                            allTeamMembers,
                            false,
                          ).isUserInfoSaved;
                          if (isUserInfoSaved) {
                            await updateIsUserInfoSaved(
                              cmpData.id,
                              cmpData.team_id,
                              cmpData.user_tenant_id,
                              true,
                            );
                          }
                        }
                      }),
                    );
                  }
                }
              }
            } catch (err) {
              processSafetyBotError(
                err,
                "",
                "",
                "",
                "error in onMessage - personal context=" +
                JSON.stringify(context),
              );
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
        processSafetyBotError(
          err,
          "",
          "",
          "",
          "error in onMessageactivity context=" + context,
        );
      }
    });
    const insertData = async (
      sqlInsertQuery,
      userAadObjectId = "",
      teamId = "",
      contextInfo = "",
    ) => {
      let result = null;
      if (sqlInsertQuery != null) {
        try {
          const pool = await poolPromise;
          console.log("insert query => ", sqlInsertQuery);
          result = await pool.request().query(sqlInsertQuery);
        } catch (err) {
          console.log(err);
          processSafetyBotError(
            err,
            teamId,
            "",
            userAadObjectId,
            "error in insertData - " +
            contextInfo +
            " sqlQuery=" +
            (sqlInsertQuery ? sqlInsertQuery.substring(0, 200) : "null"),
          );
          throw err;
        }
      }
      return result;
    };
    const getCompaniesDataJSON = (context, adminUserInfo, teamId, teamName) => {
      let userEmail = adminUserInfo?.email ?? null;
      if (userEmail == null) {
        userEmail = adminUserInfo?.userPrincipalName ?? null;
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
        userId: adminUserInfo?.id,
        userTenantId: adminUserInfo?.tenantId,
        userObjId: adminUserInfo?.aadObjectId,
        userName: adminUserInfo?.name,
        email: userEmail == null ? "" : userEmail,
        teamId: teamId,
        teamName: teamName,
        superUser: [],
        createdDate: new Date(Date.now()).toISOString(),
        welcomeMessageSent: 0,
        serviceUrl: context.activity.serviceUrl,
        channelId,
        channelName,
        emergencyContacts: adminUserInfo?.aadObjectId,
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
          let allMembersInfo = [];
          let continuationToken;
          let serviceUrl = "";
          let userTenantId = "";
          do {
            const pagedMembers = await TeamsInfo.getPagedTeamMembers(
              context,
              teamId,
              500,
              continuationToken,
            );
            allMembersInfo = allMembersInfo.concat(pagedMembers.members);
            continuationToken = pagedMembers.continuationToken;
          } while (continuationToken);

          //return allMembers;
          let teamMemberCount = 0;
          if (
            allMembersInfo != null &&
            Array.isArray(allMembersInfo) &&
            allMembersInfo.length > 0
          ) {
            teamMemberCount = allMembersInfo.length;
          }
          const adminUserInfo = allMembersInfo.find(
            (m) => m.id === acvtivityData.from.id,
          );
          try {
            let selectQuery = `select UserLimit from MSTeamsSubscriptionDetails where ID in (select SubscriptionDetailsId from MSTeamsInstallationDetails where team_id='${teamId}')`;
            let res = await db.getDataFromDB(selectQuery, "");
            var LicenseLimitCard = await this.getLicenseLimitCard(
              allMembersInfo.length,
              res[0].UserLimit,
            );
            var licensecount = res[0].UserLimit;
          } catch (err) {
            console.log({ err: err });
          }

          for (let i = 0; i < membersAdded.length; i++) {
            // See if the member added was our bot
            if (membersAdded[i].id.includes(process.env.MicrosoftAppId)) {
              addedBot = true;
              try {
                if (adminUserInfo) {
                  const companyDataObj = getCompaniesDataJSON(
                    context,
                    adminUserInfo,
                    teamId,
                    acvtivityData.channelData.team.name,
                  );
                  const companyData = await insertCompanyData(
                    companyDataObj,
                    allMembersInfo,
                    conversationType,
                  );

                  // Verify company data was inserted successfully
                  if (!companyData) {
                    const insertError = new Error(
                      `Company data was not inserted for team ${teamId} in team scope`,
                    );
                    processSafetyBotError(
                      insertError,
                      teamId,
                      adminUserInfo.name,
                      userAadObjectId,
                      `insertCompanyData returned null in team scope - teamId: ${teamId}, teamName: ${acvtivityData.channelData.team.name}`,
                    );
                    throw insertError;
                  }

                  //const newInc = await bot.createTestIncident(context, adminUserInfo.id, adminUserInfo.name, allMembersInfo, teamId, userAadObjectId, acvtivityData.from, companyData);
                  try {
                    await this.sendWelcomeMessage(
                      context,
                      acvtivityData,
                      adminUserInfo,
                      companyData,
                      teamMemberCount,
                    );
                  } catch (welcomeErr) {
                    processSafetyBotError(
                      welcomeErr,
                      teamId,
                      adminUserInfo.name,
                      userAadObjectId,
                      `error sending welcome message in team scope - teamId: ${teamId}`,
                    );
                    // Don't throw - continue with other operations
                  }

                  if (teamId != null) {
                    try {
                      incidentService.updateConversationId(teamId);
                    } catch (convErr) {
                      processSafetyBotError(
                        convErr,
                        teamId,
                        adminUserInfo.name,
                        userAadObjectId,
                        `error updating conversation ID in team scope - teamId: ${teamId}`,
                      );
                      // Don't throw - non-critical operation
                    }
                  }
                }
              } catch (err) {
                console.log(err);
                processSafetyBotError(
                  err,
                  teamId,
                  adminUserInfo?.name || "",
                  userAadObjectId,
                  `error in onConversationUpdate - team scope - teamId: ${teamId}, eventType: teamMemberAdded`,
                );
                // Re-throw to ensure error is propagated
                throw err;
              }
            } else {
              const teamMember = allMembersInfo.find(
                (m) => m.id === membersAdded[i].id,
              );
              if (teamMember != null) {
                let teamMembers = [teamMember];
                let data = await addTeamMember(teamId, teamMembers, true);
                const companyDataObj = getCompaniesDataJSON(
                  context,
                  adminUserInfo,
                  teamId,
                  acvtivityData.channelData.team.name,
                );
                serviceUrl = companyDataObj.serviceUrl;
                userTenantId = companyDataObj.userTenantId;

                if (adminUserInfo && i == membersAdded.length - 1) {
                  let userEmail = adminUserInfo.email
                    ? adminUserInfo.email
                    : adminUserInfo.userPrincipalName;
                  if (userEmail) {
                    await this.onMemberAddedSendSubscriptionSelectionCard(
                      context,
                      acvtivityData.from,
                      userEmail,
                      teamId,
                      companyDataObj,
                    );
                  }
                }
                if (teamMember.aadObjectId != null) {
                  incidentService.updateConversationId(
                    null,
                    teamMember.aadObjectId,
                  );
                }
                if (data.users && data.users.length > 0) {
                  teamMembers = teamMembers.filter((info) => {
                    let usr = data.users.find(
                      (user) => user.user_id === info.id,
                    );
                    return (
                      usr && (!usr.SETUPCOMPLETED || usr.SETUPCOMPLETED == null)
                    );
                  });
                }
                await sendSetupMessageToAllMembers(teamMembers, companyDataObj);
              }
            }
          }
          if (allMembersInfo.length > licensecount && membersAdded.length) {
            try {
              const userObj = {
                id: adminUserInfo.id,
                name: adminUserInfo.name,
              };
              await sendProactiveMessaageToUser(
                [userObj],
                LicenseLimitCard,
                null,
                serviceUrl,
                userTenantId,
                null,
                null,
              );
            } catch (err) { }
          }
        } else if (
          (acvtivityData &&
            acvtivityData?.channelData?.eventType === "teamDeleted") ||
          acvtivityData?.channelData?.eventType === "teamMemberRemoved"
        ) {
          if (acvtivityData?.channelData?.eventType === "teamDeleted") {
            const isDeleted = await deleteCompanyData(
              teamId,
              acvtivityData.from.aadObjectId,
            );
            if (isDeleted) {
              await this.sendUninstallationEmail(
                acvtivityData.from.aadObjectId,
              );
            }
          } else {
            const { membersRemoved } = acvtivityData;
            if (membersRemoved[0].id.includes(process.env.MicrosoftAppId)) {
              const isDeleted = await deleteCompanyData(
                acvtivityData?.channelData?.team.id,
                acvtivityData.from.aadObjectId,
              );
              if (isDeleted) {
                await this.sendUninstallationEmail(
                  acvtivityData.from.aadObjectId,
                );
              }
            } else {
              for (let i = 0; i < membersRemoved.length; i++) {
                await removeTeamMember(teamId, membersRemoved[i].id);
              }
            }
          }
        } else if (teamId == null && acvtivityData) {
          if (acvtivityData.conversation.conversationType === "personal") {
            const userAadObjectId = acvtivityData.from.aadObjectId;

            // Diagnostic email: Entry into personal scope
            try {
              // processSafetyBotError(
              //   new Error("DIAGNOSTIC: Entered personal scope"),
              //   "",
              //   acvtivityData.from?.name || "",
              //   userAadObjectId,
              //   JSON.stringify({
              //     step: "personal_scope_entry",
              //     userAadObjectId: userAadObjectId,
              //     conversationType: acvtivityData.conversation.conversationType,
              //     tenantId: acvtivityData.channelData?.tenant?.id,
              //     conversationId: acvtivityData.conversation?.id,
              //     fromId: acvtivityData.from?.id,
              //     fromName: acvtivityData.from?.name,
              //     serviceUrl: acvtivityData.serviceUrl,
              //     activityTimestamp: acvtivityData.timestamp,
              //   }),
              // );
            } catch (err) {
              console.log({ err: err });
            }
            let userData = await getUserById(userAadObjectId);

            // Diagnostic email: After getUserById check
            try {
              // processSafetyBotError(
              //   new Error(
              //     `DIAGNOSTIC: getUserById check completed - user exists: ${userData != null && userData.length > 0}`,
              //   ),
              //   "",
              //   acvtivityData.from?.name || "",
              //   userAadObjectId,
              //   JSON.stringify({
              //     step: "user_existence_check",
              //     userAadObjectId: userAadObjectId,
              //     userExists: userData != null && userData.length > 0,
              //     userDataLength: userData?.length || 0,
              //     userData: userData
              //       ? userData.map((u) => ({
              //         userId: u.user_id,
              //         userName: u.user_name,
              //         teamId: u.team_id,
              //       }))
              //       : null,
              //   }),
              // );
            } catch (err) {
              console.log({ err: err });
            }
            if (userData != null && userData.length > 0) {
              return;
            }
          }
          const { membersAdded } = acvtivityData;

          // Diagnostic email: Checking membersAdded
          try {
            // processSafetyBotError(
            //   new Error(
            //     `DIAGNOSTIC: Checking membersAdded - exists: ${!!membersAdded}, length: ${membersAdded?.length || 0}`,
            //   ),
            //   "",
            //   acvtivityData.from?.name || "",
            //   acvtivityData.from?.aadObjectId || "",
            //   JSON.stringify({
            //     step: "membersadded_check",
            //     membersAddedExists: !!membersAdded,
            //     membersAddedLength: membersAdded?.length || 0,
            //     membersAdded: membersAdded
            //       ? membersAdded.map((m) => ({ id: m.id, name: m.name }))
            //       : null,
            //     conversationType: acvtivityData.conversation?.conversationType,
            //   }),
            // );
          } catch (err) {
            console.log({ err: err });
          }

          if (membersAdded) {
            for (let i = 0; i < membersAdded.length; i++) {
              // See if the member added was our bot
              if (membersAdded[i].id.includes(process.env.MicrosoftAppId)) {
                addedBot = true;

                // Diagnostic email: Bot was added check
                try {
                  // processSafetyBotError(
                  //   new Error("DIAGNOSTIC: Bot was added to personal scope"),
                  //   "",
                  //   acvtivityData.from?.name || "",
                  //   acvtivityData.from?.aadObjectId || "",
                  //   JSON.stringify({
                  //     step: "bot_added_check",
                  //     memberId: membersAdded[i].id,
                  //     microsoftAppId: process.env.MicrosoftAppId,
                  //     memberIndex: i,
                  //     totalMembers: membersAdded.length,
                  //   }),
                  // );
                } catch (err) {
                  console.log({ err: err });
                }
                // Diagnostic email: Before TeamsInfo.getMember call
                try {
                  // processSafetyBotError(
                  //   new Error(
                  //     "DIAGNOSTIC: About to retrieve adminUserInfo via TeamsInfo.getMember",
                  //   ),
                  //   "",
                  //   acvtivityData.from?.name || "",
                  //   acvtivityData.from?.aadObjectId || "",
                  //   JSON.stringify({
                  //     step: "before_getMember",
                  //     fromId: acvtivityData.from.id,
                  //     fromAadObjectId: acvtivityData.from.aadObjectId,
                  //     conversationId: acvtivityData.conversation?.id,
                  //     serviceUrl: acvtivityData.serviceUrl,
                  //   }),
                  // );
                } catch (err) {
                  console.log({ err: err });
                }
                // retrive user info who installed the app
                const adminUserInfo = await TeamsInfo.getMember(
                  context,
                  acvtivityData.from.id,
                );

                // Diagnostic email: After TeamsInfo.getMember call
                try {
                  // processSafetyBotError(
                  //   new Error(
                  //     `DIAGNOSTIC: TeamsInfo.getMember completed - adminUserInfo exists: ${!!adminUserInfo}`,
                  //   ),
                  //   "",
                  //   acvtivityData.from?.name || "",
                  //   acvtivityData.from?.aadObjectId || "",
                  //   JSON.stringify({
                  //     step: "after_getMember",
                  //     adminUserInfoExists: !!adminUserInfo,
                  //     adminUserInfo: adminUserInfo
                  //       ? {
                  //         id: adminUserInfo.id,
                  //         name: adminUserInfo.name,
                  //         aadObjectId: adminUserInfo.aadObjectId,
                  //         email: adminUserInfo.email,
                  //         tenantId: adminUserInfo.tenantId,
                  //         userRole: adminUserInfo.userRole,
                  //       }
                  //       : null,
                  //   }),
                  // );
                } catch (err) {
                  console.log({ err: err });
                }
                if (adminUserInfo) {
                  var teamname = "none";
                  var isInstalledInTeam = true;

                  try {
                    // Parallelize independent operations to minimize delay
                    const [isInstalledResult, companyDataofSameTenantId] =
                      await Promise.all([
                        incidentService.isBotInstalledInTeam(userAadObjectId),
                        getCompanyDataByTenantId(
                          acvtivityData.channelData.tenant.id,
                          `and AVAILABLE_FOR='Tenant'`,
                        ),
                      ]);

                    ({ isInstalledInTeam } = isInstalledResult);
                    console.log({ isInstalledInTeam: isInstalledInTeam });

                    try {
                      // processSafetyBotError(
                      //   new Error(
                      //     `DIAGNOSTIC: companyDataofSameTenantId exists: ${!!companyDataofSameTenantId?.length}`,
                      //   ),
                      //   "",
                      //   acvtivityData.from?.name || "",
                      //   acvtivityData.from?.aadObjectId || "",
                      //   JSON.stringify({
                      //     step: "after_getMember",
                      //     companyDataofSameTenantId,
                      //   }),
                      // );
                    } catch (err) {
                      console.log({ err: err });
                    }
                    if (companyDataofSameTenantId.length > 0) {
                      // Insert user data for all teams in parallel
                      await Promise.all(
                        companyDataofSameTenantId.map(async (cmpData) => {
                          try {
                            console.log({ cmpData });
                            teamname = cmpData.team_name;

                            var sql = `
DECLARE @userLimit INT, @licensedUsed INT;

-- Get license info
SELECT TOP 1 
    @userLimit = B.UserLimit,
    @licensedUsed = (
        SELECT COUNT(DISTINCT user_aadobject_id) 
        FROM MSTeamsTeamsUsers 
        WHERE tenantid = '${cmpData.user_tenant_id}' 
          AND hasLicense = 1 
          AND team_id = '${cmpData.team_id}'
    )
FROM MSTeamsInstallationDetails A
LEFT JOIN MSTeamsSubscriptionDetails B 
    ON A.SubscriptionDetailsId = B.id
WHERE team_id = '${cmpData.team_id}';

-- Merge: Insert if not exists, update if exists
MERGE INTO MSTeamsTeamsUsers AS target
USING (VALUES
    (
        '${cmpData.team_id}',
        '${adminUserInfo.aadObjectId ?? adminUserInfo.objectId}',
        '${adminUserInfo.id}',
        N'${adminUserInfo.name.replace(/'/g, "''")}',
        '${adminUserInfo.tenantId}',
        '${adminUserInfo.userRole}',
        '${acvtivityData.conversation.id}',
        '${adminUserInfo.email}',
        CASE 
            WHEN @userLimit > 0 
                 AND @licensedUsed > 0 
                 AND @licensedUsed < @userLimit 
            THEN 1 
            ELSE 0 
        END
    )
) AS source
(
    team_id, user_aadobject_id, user_id, user_name, tenantid, userRole, conversationId, email, hasLicense
)
ON target.user_aadobject_id = source.user_aadobject_id
   AND target.team_id = source.team_id
WHEN MATCHED THEN
    UPDATE SET 
        user_id = source.user_id,
        conversationId = source.conversationId,
        hasLicense = CASE 
            WHEN @userLimit > 0 
                 AND @licensedUsed > 0 
                 AND @licensedUsed < @userLimit 
            THEN 1 
            ELSE 0 
        END
WHEN NOT MATCHED THEN
    INSERT (team_id, user_aadobject_id, user_id, user_name, tenantid, userRole, conversationId, email, hasLicense)
    VALUES (source.team_id, source.user_aadobject_id, source.user_id, source.user_name, source.tenantid, source.userRole, source.conversationId, source.email, source.hasLicense);
`;

                            await insertData(
                              sql,
                              userAadObjectId,
                              cmpData.team_id,
                              `personal scope - team_id: ${cmpData.team_id}`,
                            );
                          } catch (err) {
                            processSafetyBotError(
                              err,
                              cmpData.team_id,
                              adminUserInfo.name,
                              userAadObjectId,
                              `error inserting user data in personal scope - team_id: ${cmpData.team_id}, team_name: ${cmpData.team_name}`,
                            );
                            throw err;
                          }
                        }),
                      );

                      // Send welcome message asynchronously (fire-and-forget to minimize delay)
                      if (teamname != "" && teamname !== "none") {
                        (async () => {
                          try {
                            // const welcomeMessageCard =
                            //   await getWelcomeMessageCardformpersonal(teamname);
                            // await sendDirectMessageCard(
                            //   context,
                            //   acvtivityData.from,
                            //   welcomeMessageCard,
                            // );
                          } catch (welcomeErr) {
                            processSafetyBotError(
                              welcomeErr,
                              "",
                              adminUserInfo.name,
                              userAadObjectId,
                              `error sending welcome message in personal scope - teamname: ${teamname}`,
                            );
                          }
                        })();
                      }
                    } else {
                      // Send introduction message asynchronously to minimize delay
                      (async () => {
                        try {
                          await bot.sendIntroductionMessage(
                            context,
                            acvtivityData.from,
                          );
                        } catch (introErr) {
                          processSafetyBotError(
                            introErr,
                            "",
                            adminUserInfo.name,
                            userAadObjectId,
                            "error sending introduction message in personal scope",
                          );
                        }
                      })();
                    }
                  } catch (err) {
                    processSafetyBotError(
                      err,
                      "",
                      adminUserInfo?.name || "",
                      userAadObjectId,
                      "error in onConversationUpdate - personal scope context=" +
                      JSON.stringify({
                        conversationType: conversationType,
                        userAadObjectId: userAadObjectId,
                        tenantId: acvtivityData.channelData?.tenant?.id,
                      }),
                    );
                    throw err;
                  }

                  // await this.sendWelcomeMessage(
                  //   context,
                  //   acvtivityData,
                  //   adminUserInfo,
                  //   companyData,
                  //   0
                  // );
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
        if (err.message == "The tenant admin disabled this bot") {
          let sqlUpdateBlockedByUser = `UPDATE MSTeamsInstallationDetails set BotBlockedByTenant=1 where team_id='${teamId}'`;
          db.getDataFromDB(sqlUpdateBlockedByUser, userId);
        } else
          processSafetyBotError(
            err,
            teamId,
            "",
            userAadObjectId,
            "error in onConversationUpdate +" + JSON.stringify(acvtivityData),
          );
      }
    });
  }

  async getLicenseLimitCard(xxUsers, yyLicenses) {
    return {
      $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
      type: "AdaptiveCard",
      version: "1.3",
      body: [
        {
          type: "ColumnSet",
          columns: [
            {
              type: "Column",
              width: "stretch",
              items: [
                {
                  type: "TextBlock",
                  text: "⚠️License Limit Reached",
                  weight: "Bolder",
                  wrap: true,
                },
                {
                  type: "TextBlock",
                  text: `Your team now has **${xxUsers}** users, but your subscription includes **${yyLicenses}** licenses. Some users may not have access.`,
                  wrap: true,
                },
              ],
            },
          ],
        },
        {
          type: "TextBlock",
          text: "**To add more licenses:**",
          weight: "Bolder",
          spacing: "Medium",
          wrap: true,
        },
        {
          type: "TextBlock",
          text: "• Open the [Microsoft 365 Admin Center](https://admin.microsoft.com/).",
          wrap: true,
        },
        {
          type: "TextBlock",
          text: "• Navigate to **Billing → Your products**.",
          wrap: true,
        },
        {
          type: "TextBlock",
          text: "• Under **Apps**, select **Safety Check**.",
          wrap: true,
        },
        {
          type: "TextBlock",
          text: "• Click **Buy licenses**.",
          wrap: true,
        },
        {
          type: "TextBlock",
          text: "• Update the **Total licenses** field with the new number. Example: If you currently have 100 licenses and want to add 50 more, enter 150 in the Total licenses field.",
          wrap: true,
        },
        {
          type: "TextBlock",
          text: "• Click **Save**.",
          wrap: true,
        },
      ],
    };
  }

  async notifyUserForInvalidLicense(
    context,
    userLicenseDetails,
    companyData,
    userAadObjId,
  ) {
    try {
      const { userName, userId, adminUsrId, adminUsrName, teamName } =
        userLicenseDetails;
      //const { teamName, userId: adminUserId, userName: adminUserName } = companyData;
      let blockMessage = `You do not have the **Safety Check** bot license assigned for your **${teamName}** team. Please contact your admin <at>${adminUsrName}</at> to assign you the license.`;
      if (
        userLicenseDetails &&
        userLicenseDetails.isTrialExpired == true &&
        userLicenseDetails.previousSubscriptionType == "2"
      ) {
        blockMessage = `Your license has been deactivated since the **Safety Check** bot free trial period for your **${teamName}** team has ended. Please contact your admin <at>${adminUsrName}</at> to upgrade to a premium subscription plan.`;
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
            text: "With Gratitude,\n\nTeam Safety Check",
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
        "notifyUserForInvalidLicense",
      );
    }
  }

  async onInstallationUpdateActivity(context) {
    try {
      var action = context.activity.action;
      const conversationType = context.activity.conversation.conversationType;
      if (action == "remove" && conversationType == "personal") {
        // await deleteCompanyDataByuserAadObjId(
        //   context?.activity?.from?.aadObjectId
        // );
      }
    } catch (err) {
      console.log(err);
      processSafetyBotError(
        err,
        "",
        "",
        "",
        "onInstallationUpdateActivity context=" + context,
      );
    }
  }

  async onInvokeActivity(context) {
    try {
      let log = new AYSLog();
      const companyData = context.activity?.value?.action?.data?.companyData;
      const uVerb = context.activity?.value?.action?.verb;
      let adaptiveCard = null;
      console.log({ uVerb });
      if (uVerb === "send_response") {
        await context.sendActivities([{ type: "typing" }]);
      }
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
          incTitle,
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
          updateCard(incTitle, members, text),
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
          updateCard(incTitle, members, text),
        );
        const message = MessageFactory.attachment(cards);
        message.id = context.activity.replyToId;
        await context.updateActivity(message);
      } else if (uVerb === "submit_settings") {
        const cards = CardFactory.adaptiveCard(updateSesttingsCard());
        const message = MessageFactory.attachment(cards);
        message.id = context.activity.replyToId;
        await context.updateActivity(message);
      } else if (uVerb === "respond_to_assistance") {
        await context.sendActivities([{ type: "typing" }]);
        const action = context.activity.value.action;
        const { userAadObjId, requestAssistanceid, tenantId, serviceUrl } =
          action.data;
        const user = context.activity.from;

        // Handle the respond button click
        console.log("Respond to assistance clicked:", {
          userAadObjId,
          requestAssistanceid,
          clickedBy: user.id,
          activityName: context.activity.name,
        });

        // Return OK immediately to Teams, then process asynchronously
        // This prevents Teams from showing "Something went wrong" error
        this.handleRespondToAssistanceAsync(
          context,
          userAadObjId,
          requestAssistanceid,
          tenantId,
          serviceUrl,
          user,
        ).catch((error) => {
          console.log("Error in async respond_to_assistance handler:", error);
          processSafetyBotError(
            error,
            "",
            "",
            userAadObjId,
            "error in async respond_to_assistance - requestAssistanceid: " +
            requestAssistanceid,
          );
        });

        // Return OK immediately
        return {
          status: StatusCodes.OK,
          body: {
            statusCode: StatusCodes.OK,
          },
        };
      } else if (uVerb === "after_acknowledgement_response") {
        await context.sendActivities([{ type: "typing" }]);
        const action = context.activity.value.action;
        const { assistanceId, responseType, userAadObjId } = action.data;
        const user = context.activity.from;

        // Handle the after-acknowledgement response button click
        console.log("After acknowledgement response clicked:", {
          assistanceId,
          responseType,
          clickedBy: user.id,
          userAadObjId,
        });

        // Return OK immediately to Teams, then process asynchronously
        this.handleAfterAcknowledgementResponseAsync(
          context,
          assistanceId,
          responseType,
          userAadObjId,
          user,
        ).catch((error) => {
          console.log(
            "Error in async after_acknowledgement_response handler:",
            error,
          );
          processSafetyBotError(
            error,
            "",
            "",
            userAadObjId,
            "error in async after_acknowledgement_response - assistanceId: " +
            assistanceId,
          );
        });

        // Return OK immediately
        return {
          status: StatusCodes.OK,
          body: {
            statusCode: StatusCodes.OK,
          },
        };
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
        incGuidance = incGuidance; //? incGuidance : "No details available";
        let responseText = commentVal
          ? `✔️ Your message has been sent to <at>${incCreatedBy.name}</at>. Someone will be in touch with you as soon as possible`
          : `✔️ Your safety status has been sent to <at>${incCreatedBy.name}</at>. Someone will be in touch with you as soon as possible.`;
        const cards = CardFactory.adaptiveCard(
          updateSubmitCommentCard(responseText, incCreatedBy, incGuidance),
        );
        const message = MessageFactory.attachment(cards);
        message.id = context.activity.replyToId;
        await context.updateActivity(message);
      } else if (uVerb === "submit_contact_us") {
        let responseText = `✔️ Your feedback has been submitted successfully.`;
        const cards = CardFactory.adaptiveCard(
          updateContactSubmitCard(responseText),
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
              incGuidance,
            ),
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
              incGuidance,
            ),
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
        incGuidance = incGuidance; //? incGuidance : "No details available";
        let responseText = commentVal
          ? `✔️ Your message has been sent to <at>${incCreatedBy.name}</at>. Someone will be in touch with you as soon as possible`
          : `✔️ Your safety status has been sent to <at>${incCreatedBy.name}</at>. Someone will be in touch with you as soon as possible`;
        const cards = CardFactory.adaptiveCard(
          updateSubmitCommentCard(responseText, incCreatedBy, incGuidance),
        );
        const message = MessageFactory.attachment(cards);
        message.id = context.activity.replyToId;
        await context.updateActivity(message);
      } else if (uVerb === "send_response") {
        log.addLog("After Click On Im_Safte or need assistance start. ");
        const action = context.activity.value.action;
        const { info: response, inc, companyData } = action.data;
        const { incId, incTitle, incCreatedBy } = inc;
        log.addLog(
          `After Click On Im_Safte or need assistance start.:${incId} `,
        );
        const incStatusId = await incidentService.getIncStatus(incId);
        if (incStatusId == -1 || incStatusId == 2) {
          await bot.sendIncStatusValidation(context, incStatusId);
          return {
            status: StatusCodes.OK,
          };
        }
        let responseText = "";
        if (response === "i_am_safe") {
          responseText = `Thank you for your response. Your status has been recorded and shared with <at>${incCreatedBy.name}</at>`;
        } else {
          responseText = `Sorry to hear that! We have informed <at>${incCreatedBy.name}</at> of your situation and someone will be reaching out to you as soon as possible.`;
        }
        responseText = `Thank you for your response. Your status has been recorded and shared with <at>${incCreatedBy.name}</at>`;
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
          entities,
        );
        log.addLog(
          "After Click On Im_Safte or need assistance  Text message Send successfully. ",
        );
        var incGuidance = await incidentService.getIncGuidance(incId);
        incGuidance = incGuidance; //? incGuidance : "No details available";
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
            incGuidance,
          ),
        );
        await context.sendActivity({
          attachments: [cards],
        });
        log.addLog(
          "After Click On Im_Safte or need assistance comment section card Send successfully. ",
        );
        if (companyData.EnableSafetycheckForVisitors == true) {
          log.addLog(
            "In setting EnableSafetycheckForVisitors is true card sending",
          );
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
              incGuidance,
            ),
          );
          await context.sendActivity({
            attachments: [Qestion1],
          });
          log.addLog(
            "In setting EnableSafetycheckForVisitors is true card sending successsfully",
          );
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
            action.data.guidance,
          ),
        );
        const message = MessageFactory.attachment(cards);
        message.id = context.activity.replyToId;
        await context.updateActivity(message);
      }
      ////////////
      else if (uVerb == "do_it_later") {
        let msg =
          "Ok! I will remind you to send the safety check message to your team members later.";
        await sendDirectMessage(context, context.activity.from, msg);
      } else if (uVerb == "triggerTestSafetyCheckMessage") {
        const action = context.activity.value.action;
        const { companyData, teamMemberCount } = action.data;
        const cards = CardFactory.adaptiveCard(
          getTestIncPreviewCard(teamMemberCount, companyData),
        );
        const message = MessageFactory.attachment(cards);
        message.id = context.activity.replyToId;
        context.updateActivity(message);
      }
      const user = context.activity.from;
      if (context.activity.name === "adaptiveCard/action") {
        // Skip selectResponseCard if we've already handled respond_to_assistance
        if (uVerb !== "respond_to_assistance") {
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
        } else {
          // respond_to_assistance was already handled, return OK
          return {
            status: StatusCodes.OK,
            body: {
              statusCode: StatusCodes.OK,
            },
          };
        }
      }
    } catch (err) {
      console.log(err);
      processSafetyBotError(err, "", "", "", "onInvokeActivity");
    }
  }

  async handleRespondToAssistanceAsync(
    context,
    userAadObjId,
    requestAssistanceid,
    tenantId,
    serviceUrl,
    user,
  ) {
    try {
      // Check if anyone has already responded to this request
      const checkQuery = `SELECT FIRST_RESPONDER, FIRST_RESPONDER_RESPONDED_AT FROM MSTeamsAssistance WHERE id = ${requestAssistanceid}`;
      const existingResponse = await db.getDataFromDB(checkQuery, userAadObjId);

      // Get user info for the requester
      const userInfo =
        await incidentService.getUserInfoByUserAadObjId(userAadObjId);
      if (!userInfo || userInfo.length === 0) {
        // Send error message to admin using proactive messaging
        const adminMemberArr = [
          {
            id: user.id,
            name: user.name,
          },
        ];
        const errorCard = {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          appId: process.env.MicrosoftAppId,
          body: [
            {
              type: "TextBlock",
              text: "Error: Could not find user information.",
              wrap: true,
            },
          ],
          type: "AdaptiveCard",
          version: "1.4",
        };
        await sendProactiveMessaageToUser(
          adminMemberArr,
          errorCard,
          null,
          serviceUrl,
          tenantId,
          null,
          user.aadObjectId,
        );
        return;
      }

      const requesterUser = userInfo[0];

      if (!serviceUrl || !tenantId) {
        // Send error message to admin using proactive messaging
        const adminMemberArr = [
          {
            id: user.id,
            name: user.name,
          },
        ];
        const errorCard = {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          appId: process.env.MicrosoftAppId,
          body: [
            {
              type: "TextBlock",
              text: "Error: Missing service URL or tenant ID.",
              wrap: true,
            },
          ],
          type: "AdaptiveCard",
          version: "1.4",
        };
        await sendProactiveMessaageToUser(
          adminMemberArr,
          errorCard,
          null,
          serviceUrl || "https://smba.trafficmanager.net/amer/",
          tenantId || user.aadObjectId,
          null,
          user.aadObjectId,
        );
        return;
      }

      const memberArr = [
        {
          id: requesterUser.user_id,
          name: requesterUser.user_name,
        },
      ];

      // Create mention entities
      let mentionUserEntities = [];
      dashboard.mentionUser(mentionUserEntities, user.id, user.name);

      if (
        existingResponse &&
        existingResponse.length > 0 &&
        existingResponse[0].FIRST_RESPONDER
      ) {
        // Someone has already responded - get the first responder's info
        const firstResponderUserId = existingResponse[0].FIRST_RESPONDER;
        const firstResponderQuery = `SELECT user_id, user_name FROM MSTeamsTeamsUsers WHERE user_aadobject_id = '${firstResponderUserId}'`;
        const firstResponderResult = await db.getDataFromDB(
          firstResponderQuery,
          userAadObjId,
        );

        let firstResponderName = "Someone";
        let firstResponderUserId_db = null;
        if (firstResponderResult && firstResponderResult.length > 0) {
          firstResponderName = firstResponderResult[0].user_name || "Someone";
          firstResponderUserId_db = firstResponderResult[0].user_id;
        }

        // Send acknowledgment to the admin who clicked
        const adminMemberArr = [
          {
            id: user.id,
            name: user.name,
          },
        ];

        if (user.aadObjectId === firstResponderUserId) {
          const alreadyFirstResponderCard = {
            $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
            appId: process.env.MicrosoftAppId,
            body: [
              {
                type: "TextBlock",
                text: "**You are already the first responder for this SOS.**",
                wrap: true,
              },
            ],
            type: "AdaptiveCard",
            version: "1.4",
          };

          await sendProactiveMessaageToUser(
            adminMemberArr,
            alreadyFirstResponderCard,
            null,
            serviceUrl,
            tenantId,
            null,
            user.aadObjectId,
          );
        } else {
          // Create mention entities for the first responder
          let firstResponderMentionEntities = [];
          dashboard.mentionUser(
            firstResponderMentionEntities,
            firstResponderUserId_db,
            firstResponderName,
          );

          // Add mention entities for the requester
          dashboard.mentionUser(
            firstResponderMentionEntities,
            requesterUser.user_id,
            requesterUser.user_name,
          );

          const alreadyHandledCard = {
            $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
            appId: process.env.MicrosoftAppId,
            body: [
              {
                type: "TextBlock",
                text: `**<at>${firstResponderName}</at>** is already the responder for the SOS request from **<at>${requesterUser.user_name}</at>**`,
                wrap: true,
              },
            ],
            msteams: {
              entities: firstResponderMentionEntities,
            },
            type: "AdaptiveCard",
            version: "1.4",
          };

          await sendProactiveMessaageToUser(
            adminMemberArr,
            alreadyHandledCard,
            null,
            serviceUrl,
            tenantId,
            null,
            user.aadObjectId,
          );
        }
      } else {
        // No one has responded yet - update FIRST_RESPONDER and RESPONDED_AT
        // Also initialize after-acknowledgement tracking fields
        const updateQuery = `UPDATE MSTeamsAssistance 
          SET FIRST_RESPONDER = '${user.aadObjectId}', 
              FIRST_RESPONDER_RESPONDED_AT = GETDATE(),
              AfterAcknowledgementReminderCount = 0,
              AfterAcknowledgementLastReminderSentAt = NULL,
              AfterAcknowledgementResponseStatus = NULL
          WHERE id = ${requestAssistanceid}`;
        await db.updateDataIntoDB(updateQuery, userAadObjId);

        // Create message card
        const messageCard = {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          appId: process.env.MicrosoftAppId,
          body: [
            {
              type: "TextBlock",
              text: `**<at>${user.name}</at>** is your first responder and is handling your SOS.`,
              wrap: true,
            },
          ],
          msteams: {
            entities: mentionUserEntities,
          },
          type: "AdaptiveCard",
          version: "1.4",
        };

        // Send message to the user
        await sendProactiveMessaageToUser(
          memberArr,
          messageCard,
          null,
          serviceUrl,
          tenantId,
          null,
          user.id,
        );

        // // Emit via WebSocket so connected clients (e.g. requester's mobile app) get real-time "Accept and respond" notification
        // socketService.emitRespondToAssistance(tenantId, {
        //   requestAssistanceid,
        //   userAadObjId,
        //   clickedBy: {
        //     id: user.id,
        //     aadObjectId: user.aadObjectId,
        //     name: user.name,
        //   },
        // });

        // Get all admins from MSTeamsAssistance and send them notification
        let otherAdminNames = []; // Store other admin names for acknowledgment message
        let adminInfo = null; // Declare outside try-catch so it's accessible later
        try {
          const assistanceQuery = `SELECT sent_to_ids FROM MSTeamsAssistance WHERE id = ${requestAssistanceid}`;
          const assistanceData = await db.getDataFromDB(
            assistanceQuery,
            userAadObjId,
          );

          if (
            assistanceData &&
            assistanceData.length > 0 &&
            assistanceData[0].sent_to_ids
          ) {
            const sendToIds = assistanceData[0].sent_to_ids;

            // Split sent_to_ids (comma-separated) and get admin info
            const adminUserIds = sendToIds
              .split(",")
              .map((id) => id.trim())
              .filter((id) => id && id !== "");

            if (adminUserIds.length > 0) {
              // Get admin user info from MSTeamsTeamsUsers
              const adminIdsStr = adminUserIds.map((id) => `'${id}'`).join(",");

              const adminInfoQuery = `
;WITH UserCTE AS (
    SELECT
        u.user_id,
        u.user_name,
        u.user_aadobject_id,
        u.team_id,
        d.serviceUrl,
        d.user_tenant_id,
        ROW_NUMBER() OVER (
            PARTITION BY u.user_id
            ORDER BY d.team_id
        ) AS rn
    FROM MSTeamsTeamsUsers u
    INNER JOIN MSTeamsInstallationDetails d
        ON u.team_id = d.team_id
    WHERE u.user_id in (${adminIdsStr})
    AND d.serviceUrl IS NOT NULL
    AND d.user_tenant_id IS NOT NULL
)
SELECT
    user_id,
    user_name,
    user_aadobject_id,
    team_id,
    serviceUrl,
    user_tenant_id
FROM UserCTE
WHERE rn = 1;
              `;

              adminInfo = await db.getDataFromDB(adminInfoQuery, userAadObjId);

              if (adminInfo && adminInfo.length > 0) {
                // Create mention entities for both the first responder and requester
                let adminMentionEntities = [];
                dashboard.mentionUser(adminMentionEntities, user.id, user.name);
                dashboard.mentionUser(
                  adminMentionEntities,
                  requesterUser.user_id,
                  requesterUser.user_name,
                );

                // Create message card for admins
                const adminMessageCard = {
                  $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
                  appId: process.env.MicrosoftAppId,
                  body: [
                    {
                      type: "TextBlock",
                      text: `**<at>${user.name}</at>** is the first responder for the SOS request from **<at>${requesterUser.user_name}</at>**.`,
                      wrap: true,
                    },
                  ],
                  msteams: {
                    entities: adminMentionEntities,
                  },
                  type: "AdaptiveCard",
                  version: "1.4",
                };

                // Send message to each admin and collect other admin names
                for (const admin of adminInfo) {
                  // Skip sending to the admin who clicked (they'll get the acknowledgment)
                  if (admin.user_id === user.id) {
                    continue;
                  }

                  // Collect other admin names for acknowledgment message
                  otherAdminNames.push({
                    id: admin.user_id,
                    name: admin.user_name,
                  });

                  const adminMemberArr = [
                    {
                      id: admin.user_id,
                      name: admin.user_name,
                    },
                  ];

                  await sendProactiveMessaageToUser(
                    adminMemberArr,
                    adminMessageCard,
                    null,
                    admin.serviceUrl,
                    admin.user_tenant_id,
                    null,
                    user.id,
                  );
                }
              }
            }
          }
        } catch (adminError) {
          console.log("Error sending messages to admins:", adminError);
          // Don't fail the whole operation if admin notification fails
        }

        // Send acknowledgment to the admin who clicked
        // Create mention entities for the requester and other admins
        let acknowledgmentMentionEntities = [];
        dashboard.mentionUser(
          acknowledgmentMentionEntities,
          requesterUser.user_id,
          requesterUser.user_name,
        );

        // Add mention entities for other admins
        for (const otherAdmin of otherAdminNames) {
          dashboard.mentionUser(
            acknowledgmentMentionEntities,
            otherAdmin.id,
            otherAdmin.name,
          );
        }

        // Get email addresses for both users
        let responderEmail = null;
        let requesterEmail = requesterUser.email || null;

        // Get responder's email from database
        try {
          const responderEmailQuery = `SELECT email FROM MSTeamsTeamsUsers WHERE user_aadobject_id = '${user.aadObjectId}'`;
          const responderEmailResult = await db.getDataFromDB(
            responderEmailQuery,
            userAadObjId,
          );
          if (responderEmailResult && responderEmailResult.length > 0) {
            responderEmail = responderEmailResult[0].email;
          }
        } catch (emailError) {
          console.log("Error fetching responder email:", emailError);
        }

        // Get requester's email if not already available
        if (!requesterEmail) {
          try {
            const requesterEmailQuery = `SELECT email FROM MSTeamsTeamsUsers WHERE user_aadobject_id = '${requesterUser.user_aadobject_id}'`;
            const requesterEmailResult = await db.getDataFromDB(
              requesterEmailQuery,
              userAadObjId,
            );
            if (requesterEmailResult && requesterEmailResult.length > 0) {
              requesterEmail = requesterEmailResult[0].email;
            }
          } catch (emailError) {
            console.log("Error fetching requester email:", emailError);
          }
        }

        // Create Teams deep link for group chat using emails
        let chatUrl = "";
        if (responderEmail && requesterEmail) {
          chatUrl = `https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(
            responderEmail,
          )},${encodeURIComponent(requesterEmail)}`;
        } else {
          // Fallback to aadObjectId if emails are not available
          chatUrl = `https://teams.microsoft.com/l/chat/0/0?users=${user.aadObjectId},${requesterUser.user_aadobject_id}`;
        }

        // Create Teams deep link for call using emails
        let callUrl = "";
        if (responderEmail && requesterEmail) {
          callUrl = `https://teams.microsoft.com/l/call/0/0?users=${encodeURIComponent(
            responderEmail,
          )},${encodeURIComponent(requesterEmail)}`;
        } else {
          // Fallback to aadObjectId if emails are not available
          callUrl = `https://teams.microsoft.com/l/call/0/0?users=${user.aadObjectId},${requesterUser.user_aadobject_id}`;
        }

        // Build the acknowledgment text with other admin names
        let acknowledgmentText = `You are now the first responder.\n\n**<at>${requesterUser.user_name}</at>** and the following emergency contacts have been notified:`;
        if (otherAdminNames.length > 0) {
          if (otherAdminNames.length === 1) {
            acknowledgmentText += `\n**<at>${otherAdminNames[0].name}</at>**`;
          } else {
            // For multiple admins, list them all
            const adminMentions = otherAdminNames
              .map((admin) => `**<at>${admin.name}</at>**`)
              .join("\n");
            acknowledgmentText += `\n${adminMentions}`;
          }
        } else {
          acknowledgmentText = `You are now the first responder.\n\n**<at>${requesterUser.user_name}</at>** has been notified.`;
        }

        const acknowledgmentCard = {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          appId: process.env.MicrosoftAppId,
          body: [
            {
              type: "TextBlock",
              text: acknowledgmentText,
              wrap: true,
            },
          ],
          actions: [
            {
              type: "Action.OpenUrl",
              title: `Chat with ${requesterUser.user_name}`,
              url: chatUrl,
            },
            {
              type: "Action.OpenUrl",
              title: `Call ${requesterUser.user_name}`,
              url: callUrl,
            },
          ],
          msteams: {
            entities: acknowledgmentMentionEntities,
          },
          type: "AdaptiveCard",
          version: "1.4",
        };

        // Send acknowledgment to the admin who clicked using proactive messaging
        const adminAcknowledgmentMemberArr = [
          {
            id: user.id,
            name: user.name,
          },
        ];

        await sendProactiveMessaageToUser(
          adminAcknowledgmentMemberArr,
          acknowledgmentCard,
          null,
          serviceUrl,
          tenantId,
          null,
          user.aadObjectId,
        );

        // Send SMS/WhatsApp/Email notifications to all parties
        try {
          // Get all teams the requester is part of with their notification settings
          const requesterTeamsQuery = `
            SELECT DISTINCT
              t.team_id,
              t.team_name,
              t.SOS_NOTIFICATION,
              t.SEND_EMAIL,
              t.SEND_WHATSAPP,
              t.PHONE_FIELD,
              t.IS_APP_PERMISSION_GRANTED,
              t.user_tenant_id,
              s.SubscriptionType,
              t.sent_sms_count,
              s.UserLimit
            FROM MSTeamsTeamsUsers u
            INNER JOIN MSTeamsInstallationDetails t ON u.team_id = t.team_id
            LEFT JOIN MSTeamsSubscriptionDetails s ON t.SubscriptionDetailsId = s.ID
            WHERE u.user_aadobject_id = '${requesterUser.user_aadobject_id}'
            AND t.uninstallation_date IS NULL
            AND t.serviceUrl IS NOT NULL
            AND t.user_tenant_id IS NOT NULL
          `;
          const requesterTeamsResult = await db.getDataFromDB(
            requesterTeamsQuery,
            userAadObjId,
          );
          const requesterTeams =
            requesterTeamsResult && requesterTeamsResult.length > 0
              ? requesterTeamsResult
              : [];

          // // If no teams found, try to get company data from tenantId as fallback
          // let fallbackCompanyData = null;
          // if (requesterTeams.length === 0) {
          //   const companyDataQuery = `SELECT
          //     team_id,
          //     team_name,
          //     SOS_NOTIFICATION,
          //     SEND_EMAIL,
          //     SEND_WHATSAPP,
          //     PHONE_FIELD,
          //     IS_APP_PERMISSION_GRANTED,
          //     user_tenant_id,
          //     SubscriptionType,
          //     sent_sms_count,
          //     UserLimit
          //     FROM MSTeamsInstallationDetails t
          //     LEFT JOIN MSTeamsSubscriptionDetails s ON t.SubscriptionDetailsId = s.ID
          //     WHERE t.user_tenant_id = '${tenantId}' AND t.uninstallation_date IS NULL`;
          //   const companyDataResult = await db.getDataFromDB(companyDataQuery, userAadObjId);
          //   fallbackCompanyData = companyDataResult && companyDataResult.length > 0 ? companyDataResult[0] : null;
          // }

          // Get all users who need notifications: requester, responder, and other admins
          const usersToNotify = [
            {
              user_aadobject_id: requesterUser.user_aadobject_id,
              user_name: requesterUser.user_name,
              isRequester: true,
            },
            {
              user_aadobject_id: user.aadObjectId,
              user_name: user.name,
              isResponder: true,
            },
          ];

          // Add other admins - reuse adminInfo that was already queried
          if (adminInfo && adminInfo.length > 0) {
            adminInfo.forEach((admin) => {
              if (admin.user_id !== user.id) {
                usersToNotify.push({
                  user_aadobject_id: admin.user_aadobject_id,
                  user_name: admin.user_name,
                  isOtherAdmin: true,
                });
              }
            });
          }

          // Get phone numbers for users (use first team's tenant and permission settings, or fallback)
          const firstTeam =
            requesterTeams.length > 0
              ? requesterTeams[0]
              : fallbackCompanyData
                ? fallbackCompanyData
                : null;
          if (firstTeam || fallbackCompanyData) {
            const companyDataToUse = firstTeam || fallbackCompanyData;
            const userAadObjIds = usersToNotify.map((u) => u.user_aadobject_id);
            const usrPhones = await bot.getUserPhone(
              companyDataToUse.IS_APP_PERMISSION_GRANTED,
              companyDataToUse.user_tenant_id,
              userAadObjIds,
            );

            // Check ALL requester teams to see if ANY team has features enabled
            // If any team has a feature enabled, send to ALL admins
            let smsEnabled = false;
            let whatsappEnabled = false;
            let emailEnabled = false;
            let smsTeamData = null;
            let whatsappTeamData = null;
            let emailTeamData = null;

            // Check all requester teams for enabled features
            for (const teamData of requesterTeams) {
              // Check SMS
              if (
                !smsEnabled &&
                teamData.SOS_NOTIFICATION &&
                teamData.SOS_NOTIFICATION.includes("SMS")
              ) {
                const canSendSMS =
                  teamData.SubscriptionType == 3 ||
                  (teamData.SubscriptionType == 2 &&
                    teamData.sent_sms_count < 50);
                if (canSendSMS) {
                  smsEnabled = true;
                  smsTeamData = teamData;
                }
              }

              // Check WhatsApp
              if (
                !whatsappEnabled &&
                teamData.SOS_NOTIFICATION &&
                teamData.SOS_NOTIFICATION.includes("WhatsApp")
              ) {
                whatsappEnabled = true;
                whatsappTeamData = teamData;
              }

              // Check Email
              if (!emailEnabled && teamData.SEND_EMAIL) {
                emailEnabled = true;
                emailTeamData = teamData;
              }

              // If all features are found, break early
              if (smsEnabled && whatsappEnabled && emailEnabled) {
                break;
              }
            }

            // Send notifications to each user based on enabled features
            for (const userToNotify of usersToNotify) {
              const userPhone = usrPhones.find(
                (ph) => ph.id === userToNotify.user_aadobject_id,
              );

              // Determine message based on user role
              let notificationMessage = "";
              if (userToNotify.isRequester) {
                notificationMessage = `${user.name} is your first responder and is handling your SOS.`;
              } else if (userToNotify.isResponder) {
                notificationMessage = `You are now the first responder for ${requesterUser.user_name}'s SOS request.`;
              } else {
                notificationMessage = `${user.name} is the first responder for ${requesterUser.user_name}'s SOS request.`;
              }

              // Send SMS if enabled in any team
              if (smsEnabled && smsTeamData && userPhone) {
                const num =
                  smsTeamData.PHONE_FIELD == "businessPhones"
                    ? userPhone.businessPhones && userPhone.businessPhones[0]
                    : userPhone.mobilePhone;

                if (num) {
                  try {
                    const accountSid = process.env.TWILIO_ACCOUNT_ID;
                    const authToken = process.env.TWILIO_ACCOUNT_AUTH_TOKEN;
                    const tClient = require("twilio")(accountSid, authToken);

                    await tClient.messages.create({
                      body: notificationMessage,
                      from: "+18023277232",
                      shortenUrls: true,
                      messagingServiceSid: "MGdf47b6f3eb771ed026921c6e71017771",
                      to: num,
                    });

                    incidentService.saveAllTypeQuerylogs(
                      userToNotify.user_aadobject_id,
                      "",
                      "SOS_RESPONSE_SMS",
                      num.slice(-4).padStart(num.length, "x"),
                      requestAssistanceid,
                      "SEND_SUCCESS",
                      "",
                      "",
                      "",
                      notificationMessage,
                      "",
                    );
                  } catch (smsErr) {
                    console.log("Error sending SMS notification:", smsErr);
                    incidentService.saveAllTypeQuerylogs(
                      userToNotify.user_aadobject_id,
                      "",
                      "SOS_RESPONSE_SMS",
                      "",
                      requestAssistanceid,
                      "SEND_FAILED",
                      "",
                      "",
                      "",
                      notificationMessage,
                      JSON.stringify(smsErr.message),
                    );
                  }
                }
              }

              // Send WhatsApp if enabled in any team
              if (whatsappEnabled && whatsappTeamData && userPhone) {
                const num =
                  whatsappTeamData.PHONE_FIELD == "businessPhones"
                    ? userPhone.businessPhones && userPhone.businessPhones[0]
                    : userPhone.mobilePhone;

                if (num) {
                  try {
                    let payload = {
                      messaging_product: "whatsapp",
                      recipient_type: "individual",
                      to: num,
                      type: "text",
                      text: {
                        body: notificationMessage,
                      },
                    };

                    await bot.sendWhatsappMessage(
                      payload,
                      userToNotify.user_aadobject_id,
                      whatsappTeamData,
                    );

                    incidentService.saveAllTypeQuerylogs(
                      userToNotify.user_aadobject_id,
                      "",
                      "SOS_RESPONSE_WHATSAPP",
                      num.slice(-4).padStart(num.length, "x"),
                      requestAssistanceid,
                      "SEND_SUCCESS",
                      "",
                      "",
                      "",
                      notificationMessage,
                      "",
                    );
                  } catch (waErr) {
                    console.log("Error sending WhatsApp notification:", waErr);
                    incidentService.saveAllTypeQuerylogs(
                      userToNotify.user_aadobject_id,
                      "",
                      "SOS_RESPONSE_WHATSAPP",
                      "",
                      requestAssistanceid,
                      "SEND_FAILED",
                      "",
                      "",
                      "",
                      notificationMessage,
                      JSON.stringify(waErr.message),
                    );
                  }
                }
              }

              // Send Email if enabled in any team
              if (emailEnabled && emailTeamData) {
                try {
                  const userEmailQuery = `SELECT email FROM MSTeamsTeamsUsers WHERE user_aadobject_id = '${userToNotify.user_aadobject_id}'`;
                  const userEmailResult = await db.getDataFromDB(
                    userEmailQuery,
                    userAadObjId,
                  );
                  const userEmail =
                    userEmailResult && userEmailResult.length > 0
                      ? userEmailResult[0].email
                      : null;

                  if (userEmail) {
                    const emailBody = `
                      <div style="font-family: Arial, sans-serif; padding: 20px;">
                        
                        <p>${notificationMessage}</p>
                        
                      </div>
                    `;

                    const emailData = {
                      projectName: "AYS",
                      emailSubject: `Safety check - SOS Response`,
                      emailBody: emailBody,
                      emailTo: userEmail,
                      emailFrom: "donotreply@safetycheck.in",
                      authkey: "A9fG4dX2pL7qW8mZ",
                    };

                    const axios = require("axios");
                    const myHeaders = { "Content-Type": "application/json" };

                    await axios.post(
                      "https://emailservices.azurewebsites.net/api/sendCustomEmailWithBodyParams",
                      emailData,
                      { headers: myHeaders },
                    );

                    incidentService.saveAllTypeQuerylogs(
                      userToNotify.user_aadobject_id,
                      "",
                      "SOS_RESPONSE_EMAIL",
                      userEmail,
                      requestAssistanceid,
                      "SEND_SUCCESS",
                      "",
                      "",
                      "",
                      notificationMessage,
                      "",
                    );
                  }
                } catch (emailErr) {
                  console.log("Error sending Email notification:", emailErr);
                  incidentService.saveAllTypeQuerylogs(
                    userToNotify.user_aadobject_id,
                    "",
                    "SOS_RESPONSE_EMAIL",
                    "",
                    requestAssistanceid,
                    "SEND_FAILED",
                    "",
                    "",
                    "",
                    notificationMessage,
                    JSON.stringify(emailErr.message),
                  );
                }
              }
            }
          }
        } catch (notificationError) {
          console.log(
            "Error sending SMS/WhatsApp/Email notifications:",
            notificationError,
          );
          // Don't fail the whole operation if notification fails
        }
      }
    } catch (error) {
      console.log("Error in handleRespondToAssistanceAsync:", error);
      // Try to send error message to admin using proactive messaging
      try {
        const adminMemberArr = [
          {
            id: user.id,
            name: user.name,
          },
        ];
        const errorCard = {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          appId: process.env.MicrosoftAppId,
          body: [
            {
              type: "TextBlock",
              text: "An error occurred while processing your response.",
              wrap: true,
            },
          ],
          type: "AdaptiveCard",
          version: "1.4",
        };
        await sendProactiveMessaageToUser(
          adminMemberArr,
          errorCard,
          null,
          serviceUrl || "https://smba.trafficmanager.net/amer/",
          tenantId || user.aadObjectId,
          null,
          user.aadObjectId,
        );
      } catch (sendError) {
        console.log("Error sending error message:", sendError);
      }
      processSafetyBotError(
        error,
        "",
        "",
        userAadObjId,
        "error in handleRespondToAssistanceAsync - requestAssistanceid: " +
        requestAssistanceid,
      );
    }
  }

  async handleAfterAcknowledgementResponseAsync(
    context,
    assistanceId,
    responseType,
    userAadObjId,
    user,
  ) {
    try {
      // Get SOS assistance data
      const assistanceQuery = `
        SELECT 
          a.id,
          a.user_id,
          a.sent_to_ids,
          a.FIRST_RESPONDER,
          a.AfterAcknowledgementResponseStatus,
          t.serviceUrl,
          t.user_tenant_id
        FROM MSTeamsAssistance a
        OUTER APPLY (
          SELECT TOP 1 t.serviceUrl, t.user_tenant_id
          FROM MSTeamsTeamsUsers tu
          INNER JOIN MSTeamsInstallationDetails t
            ON t.team_id = tu.team_id
            AND t.uninstallation_date IS NULL
          WHERE tu.user_id = a.user_id
          ORDER BY t.team_id
        ) t
        WHERE a.id = ${assistanceId}
      `;
      const assistanceData = await db.getDataFromDB(
        assistanceQuery,
        userAadObjId,
      );

      if (!assistanceData || assistanceData.length === 0) {
        console.log(`SOS ${assistanceId} not found`);
        return;
      }

      const assistance = assistanceData[0];

      // Check if already responded
      if (assistance.AfterAcknowledgementResponseStatus) {
        console.log(
          `SOS ${assistanceId} already has response status ${assistance.AfterAcknowledgementResponseStatus}`,
        );
        return;
      }

      // Get user info for the person who clicked
      const userInfoQuery = `
        SELECT TOP 1 user_id, user_name, user_aadobject_id
        FROM MSTeamsTeamsUsers
        WHERE user_aadobject_id = '${user.aadObjectId}'
      `;
      const userInfoResult = await db.getDataFromDB(
        userInfoQuery,
        userAadObjId,
      );
      if (!userInfoResult || userInfoResult.length === 0) {
        console.log(`User ${user.aadObjectId} not found`);
        return;
      }
      const responderUser = userInfoResult[0];

      // Get initiator user info
      const initiatorQuery = `
        SELECT TOP 1 user_id, user_name, user_aadobject_id
        FROM MSTeamsTeamsUsers
        WHERE user_id = '${assistance.user_id}'
      `;
      const initiatorResult = await db.getDataFromDB(
        initiatorQuery,
        userAadObjId,
      );
      if (!initiatorResult || initiatorResult.length === 0) {
        console.log(`Initiator ${assistance.user_id} not found`);
        return;
      }
      const initiatorUser = initiatorResult[0];

      const serviceUrl = assistance.serviceUrl;
      const tenantId = assistance.user_tenant_id;

      // Update response status
      const updateQuery = `
        UPDATE MSTeamsAssistance 
        SET AfterAcknowledgementResponseStatus = '${responseType}',
            AfterAcknowledgementRespondedByUserId = '${responderUser.user_aadobject_id}',
            AfterAcknowledgementRespondedAt = GETDATE(),
            LastUpdatedDateTime = GETDATE()
        WHERE id = ${assistanceId}
      `;
      await db.updateDataIntoDB(updateQuery, userAadObjId);

      // Get all responders for notification
      const sentToIds = assistance.sent_to_ids;
      const responderIds = sentToIds
        ? sentToIds
          .split(",")
          .map((id) => id.trim())
          .filter((id) => id)
        : [];

      if (responderIds.length > 0) {
        const responderIdsStr = responderIds.map((id) => `'${id}'`).join(",");
        const responderQuery = `
          WITH DistinctUsers AS (
            SELECT DISTINCT
              user_id,
              user_name,
              user_aadobject_id
            FROM MSTeamsTeamsUsers
            WHERE user_id IN (${responderIdsStr})
          )
          SELECT
            u.user_id,
            u.user_name,
            u.user_aadobject_id,
            t.serviceUrl,
            t.user_tenant_id
          FROM DistinctUsers u
          OUTER APPLY (
            SELECT TOP 1
              t.serviceUrl,
              t.user_tenant_id
            FROM MSTeamsTeamsUsers tu
            INNER JOIN MSTeamsInstallationDetails t
              ON t.team_id = tu.team_id
              AND t.uninstallation_date IS NULL
            WHERE tu.user_id = u.user_id
              AND t.serviceUrl IS NOT NULL
              AND t.user_tenant_id IS NOT NULL
            ORDER BY t.team_id
          ) t
          WHERE t.serviceUrl IS NOT NULL
            AND t.user_tenant_id IS NOT NULL
        `;
        const responders = await db.getDataFromDB(responderQuery, userAadObjId);

        if (responders && responders.length > 0) {
          const mentionUserEntities = [];
          dashboard.mentionUser(
            mentionUserEntities,
            initiatorUser.user_id,
            initiatorUser.user_name,
          );
          const notificationCard = {
            $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
            appId: process.env.MicrosoftAppId,
            body: [
              {
                type: "TextBlock",
                text:
                  responseType === "SAFE"
                    ? `**<at>${initiatorUser.user_name}</at>** has been confirmed safe.`
                    : `Additional assistance has been requested for the SOS initiated by **<at>${initiatorUser.user_name}</at>**.\nThis SOS has been escalated to all responders.`,
                wrap: true,
              },
            ],
            msteams: {
              entities: mentionUserEntities,
            },
            type: "AdaptiveCard",
            version: "1.4",
          };

          // Send notification to all responders
          for (const responder of responders) {
            try {
              const memberArr = [
                {
                  id: responder.user_id,
                  name: responder.user_name,
                },
              ];

              await sendProactiveMessaageToUser(
                memberArr,
                notificationCard,
                null,
                responder.serviceUrl || serviceUrl,
                responder.user_tenant_id || tenantId,
                null,
                responder.user_aadobject_id,
              );
            } catch (err) {
              console.log(
                `Error sending notification to responder ${responder.user_id}: ${err.message}`,
              );
            }
          }
        }
      }

      // Update the card to show response received
      const responseCard = {
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
        appId: process.env.MicrosoftAppId,
        body: [
          {
            type: "TextBlock",
            text:
              responseType === "SAFE"
                ? "✓ You have confirmed the user is safe."
                : "✓ You have requested additional help. All responders have been notified.",
            wrap: true,
          },
        ],
        type: "AdaptiveCard",
        version: "1.4",
      };
      const message = MessageFactory.attachment(
        CardFactory.adaptiveCard(responseCard),
      );
      message.id = context.activity.replyToId;
      await context.updateActivity(message);
    } catch (error) {
      console.log("Error in handleAfterAcknowledgementResponseAsync:", error);
      processSafetyBotError(
        error,
        "",
        "",
        userAadObjId,
        "error in handleAfterAcknowledgementResponseAsync - assistanceId: " +
        assistanceId,
      );
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
      processSafetyBotError(
        err,
        "",
        "",
        "",
        "error in hanldeAdminOrSuperUserMsg context=" +
        JSON.stringify(context) +
        " companyData=" +
        JSON.stringify(companyData),
      );
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
        }),
      );
    }
  }
  async hanldeChannelUserMsg(context) {
    try {
      await context.sendActivity(
        MessageFactory.text(
          `👋 Hello!! I can surely help with this via direct message. Please send me a "Hi" in a direct message.`,
        ),
      );
    } catch (err) {
      console.log(err);
      processSafetyBotError(
        err,
        "",
        "",
        "",
        "error in hanldeChannelUserMsg context=" + JSON.stringify(context),
      );
    }
  }

  async sendSubscriptionSelectionCard(
    context,
    from,
    teamMemberCount,
    userEmail,
    companyDataObj,
  ) {
    try {
      const subcriptionSelectionCard = getSubcriptionSelectionCard(
        teamMemberCount,
        userEmail,
        companyDataObj,
      );
      await sendDirectMessageCard(context, from, subcriptionSelectionCard);
    } catch (err) {
      processSafetyBotError(
        err,
        "",
        "",
        from.aadObjectId,
        "error in sendSubscriptionSelectionCard context=" +
        JSON.stringify(context) +
        " userEmail=" +
        userEmail +
        " companyDataObj=" +
        JSON.stringify(companyDataObj),
      );
    }
  }

  async onMemberAddedSendSubscriptionSelectionCard(
    context,
    from,
    userEmail,
    teamId,
    companyDataObj,
  ) {
    try {
      const teamMemberCount =
        await incidentService.getMembersCountForSubscriptionType1(
          teamId,
          from.aadObjectId,
        );
      console.log({ teamMemberCount });
      if (teamMemberCount > 10) {
        await this.sendSubscriptionSelectionCard(
          context,
          from,
          teamMemberCount,
          userEmail,
          companyDataObj,
        );
      }
    } catch (err) {
      processSafetyBotError(
        err,
        "",
        "",
        from.aadObjectId,
        "onMemberAddedSendSubscriptionSelectionCard",
      );
    }
  }

  async sendWelcomeMessageToChannel(context, userName, userId) {
    const wecomeMessageCardForChannelCard = getWelcomeMessageCardForChannel(
      userName,
      userId,
    );
    const adaptiveCard = CardFactory.adaptiveCard(
      wecomeMessageCardForChannelCard,
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
    teamMemberCount = 0,
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
            companyData.userId,
          );
        }
        const welcomeMessageCard = getWelcomeMessageCard(
          teamMemberCount,
          teamName,
        );
        const welcomeMessageCard2 = getWelcomeMessageCard2(
          teamMemberCount,
          teamName,
        );
        if (teamMemberCount > 0) {
          const testIncPreviewCard = getTestIncPreviewCard(
            teamMemberCount,
            companyData,
          );
          await sendMultipleDirectMessageCard(
            context,
            acvtivityData.from,
            welcomeMessageCard,
            welcomeMessageCard2,
            testIncPreviewCard,
          );
        } else {
          await sendDirectMessageCard(
            context,
            acvtivityData.from,
            welcomeMessageCard,
          );
        }
      } catch (err) {
        processSafetyBotError(
          err,
          "",
          acvtivityData.from.name,
          userAadObjId,
          "error in welcomeMessageCard",
        );
      }

      new PersonalEmail.PersonalEmail()
        .sendWelcomEmail(companyData.userEmail, userAadObjId)
        .then(() => { })
        .catch((err) => {
          console.log(err);
        });

      if (teamMemberCount > 10) {
        this.sendSubscriptionSelectionCard(
          context,
          acvtivityData.from,
          teamMemberCount,
          companyData.userEmail,
          companyData,
        );
      }

      // let teamName = "";
      // if (acvtivityData.channelData != null && acvtivityData.channelData.team != null && acvtivityData.channelData.team.name != null) {
      //   teamName = acvtivityData.channelData.team.name;
      // }

      await bot.sendInstallationEmail(
        adminUserInfo.email,
        adminUserInfo.name,
        teamName,
      );
      //}
    } catch (err) {
      processSafetyBotError(
        err,
        "",
        acvtivityData.from.name,
        userAadObjId,
        "error in sendWelcomeMessage context=" + JSON.stringify(context),
      );
    }
  }

  async sendUninstallationEmail(userAadObjId) {
    // const userInfo = await incidentService.getUserInfoByUserAadObjId(
    //   userAadObjId
    // );
    // let userEmailId = userInfo[0].email;
    // let user_name = userInfo[0].user_name;
    // if (!userEmailId) {
    //   const companyData = await getCompaniesData(userAadObjId);
    //   userEmailId = companyData?.userEmail;
    //   user_name = companyData?.userName;
    // }
    // if (userInfo && userInfo.length > 0) {
    //   new PersonalEmail.PersonalEmail()
    //     .sendUninstallationEmail(userEmailId, userAadObjId,process.env.build)
    //     .then(() => {})
    //     .catch((err) => {
    //       console.log(err);
    //     });
    //   await bot.sendUninstallationEmail(userEmailId, user_name);
    // }
  }
}

module.exports.BotActivityHandler = BotActivityHandler;
