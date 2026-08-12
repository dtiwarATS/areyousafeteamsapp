const { parentPort } = require("worker_threads");
const { AYSLog } = require("../utils/log");
const db = require("../db");
const { processSafetyBotError } = require("../models/processError");
const {
  ConnectorClient,
  MicrosoftAppCredentials,
} = require("botframework-connector");

(async () => {
  try {
    console.log("Starting updateTeamMembers job");

    // Get all active teams from database
    const teamsQuery = `
      SELECT team_id, serviceUrl, user_tenant_id 
      FROM MSTeamsInstallationDetails 
      WHERE uninstallation_date IS NULL and team_id != ''
    `;

    const teams = await db.getDataFromDB(teamsQuery);
    console.log(`Found ${teams.length} active teams to process`);

    for (const team of teams) {
      try {
        console.log(`Processing team: ${team.team_id}`);

        const appId = process.env.MicrosoftAppId;
        const appPass = process.env.MicrosoftAppPassword;

        var credentials = new MicrosoftAppCredentials(appId, appPass);
        connectorClient = new ConnectorClient(credentials, {
          baseUri: team.serviceUrl,
        });

        try {
          const teamMembers =
            await connectorClient.conversations.getConversationMembers(
              team.team_id,
            );

          // Update team members in database
          for (const member of teamMembers) {
            const memberName = member.name || "";
            const memberEmail = member.email || "";
            const memberPrincipalName = member.userPrincipalName || "";
            const memberObjectId =
              member.aadObjectId || member.objectId || "";
            const memberRole = member.userRole || "";

            // Skip members without an AAD object id — cannot key the row safely
            if (!memberObjectId) {
              console.log(
                `Skipping member without objectId in team ${team.team_id}: ${member.id}`,
              );
              continue;
            }

            const updateQuery = `
                        MERGE INTO MSTeamsTeamsUsers WITH (HOLDLOCK) AS target
                        USING (VALUES (
                            '${team.team_id}',
                            '${memberObjectId}',
                            '${member.id}',
                            N'${memberName.replace(/'/g, "''")}',
                            '${memberEmail.replace(/'/g, "''")}',
                            '${memberPrincipalName.replace(/'/g, "''")}',
                            '${memberRole}',
                            '${team.user_tenant_id}'
                        )) AS source (
                            team_id, user_aadobject_id, user_id, user_name, email, userPrincipalName, userRole, tenantid
                        )
                        ON target.team_id = source.team_id
                           AND target.user_aadobject_id = source.user_aadobject_id
                        WHEN MATCHED THEN
                            UPDATE SET
                                user_id = source.user_id,
                                user_name = source.user_name,
                                email = source.email,
                                userPrincipalName = source.userPrincipalName,
                                userRole = source.userRole,
                                tenantid = source.tenantid,
                                LAST_UPDATED_BY = 'SYSTEM'
                        WHEN NOT MATCHED THEN
                            INSERT (
                                user_aadobject_id,
                                user_id,
                                user_name,
                                email,
                                userPrincipalName,
                                team_id,
                                userRole,
                                hasLicense,
                                tenantid
                            )
                            VALUES (
                                source.user_aadobject_id,
                                source.user_id,
                                source.user_name,
                                source.email,
                                source.userPrincipalName,
                                source.team_id,
                                source.userRole,
                                1,
                                source.tenantid
                            );
                        `;

            await db.updateDataIntoDB(updateQuery);
          }

          console.log(`Successfully updated members for team: ${team.team_id}`);
          saveLog = true;
        } catch (apiError) {
          // Handle specific Teams API errors
          if (
            apiError.code === "ConversationNotFound" ||
            apiError.code === "BotNotInConversationRoster"
          ) {
            console.log(
              `Team ${team.team_id} is no longer accessible. Marking as uninstalled.`,
            );

            // Update team status in database
            const updateTeamStatusQuery = `
                            UPDATE MSTeamsInstallationDetails 
                            SET BotBlockedByTenant = 1 
                            WHERE team_id = '${team.team_id}'
                        `;
            await db.updateDataIntoDB(updateTeamStatusQuery);
          } else {
            // Handle other API errors
            throw apiError;
          }
        }
      } catch (err) {
        console.error(err);
        console.log(`Error processing team ${team.team_id}: ${err.message}`);
        // processSafetyBotError(
        //     err,
        //     "",
        //     "",
        //     "",
        //     `Error in updateTeamMembers job for team ${team.team_id}`
        // );
      }
    }
  } catch (err) {
    console.error(err);
    console.log(`Error in updateTeamMembers job: ${err.message}`);
    // processSafetyBotError(
    //     err,
    //     "",
    //     "",
    //     "",
    //     "Error in updateTeamMembers job"
    // );
  } finally {
    console.log("Completed updateTeamMembers job");
  }

  // Signal to parent that the job is done
  if (parentPort) parentPort.postMessage("done");
  else process.exit(0);
})();
