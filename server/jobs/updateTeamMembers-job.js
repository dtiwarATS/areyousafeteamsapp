const { parentPort } = require("worker_threads");
const { AYSLog } = require("../utils/log");
const db = require("../db");
const { processSafetyBotError } = require("../models/processError");
const { Client } = require("@microsoft/microsoft-graph-client");

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
      WHERE uninstallation_date IS NULL and team_id = '19:_0bBsp6zsraWb8oInI1UfADb1ODpYAoShjFp6yWt-TM1@thread.tacv2'
    `;

        const teams = await db.getDataFromDB(teamsQuery);
        console.log(`Found ${teams.length} active teams to process`);
        for (const team of teams) {
            try {
                console.log(`Processing team: ${team.team_id}`);

                const appId = process.env.MicrosoftAppId;
                const appPass = process.env.MicrosoftAppPassword;

                var credentials = new MicrosoftAppCredentials(appId, appPass);
                connectorClient = new ConnectorClient(credentials, { baseUri: team.serviceUrl });

                try {
                    const teamMembers = await connectorClient.conversations.getConversationMembers(
                        team.team_id
                    );
                    // await createGroupChatAndSendMessage(teams[0], teamMembers, "This is a test message from the updateTeamMembers job");
                    // // Update team members in database
                    // return;
                    for (const member of teamMembers) {
                        const memberName = member.name || '';
                        const memberEmail = member.email || '';
                        const memberPrincipalName = member.userPrincipalName || '';
                        const memberObjectId = member.objectId || '';
                        const memberRole = member.userRole || '';

                        const updateQuery = `
                        IF EXISTS (SELECT 1 FROM MSTeamsTeamsUsers WHERE user_id = '${member.id}')
                            UPDATE MSTeamsTeamsUsers 
                            SET 
                                user_name = '${memberName.replace(/'/g, "''")}',
                                email = '${memberEmail.replace(/'/g, "''")}'
                            WHERE user_id = '${member.id}'
                        ELSE
                            INSERT INTO MSTeamsTeamsUsers (
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
                                '${memberObjectId}',
                                '${member.id}',
                                '${memberName.replace(/'/g, "''")}',
                                '${memberEmail.replace(/'/g, "''")}',
                                '${memberPrincipalName.replace(/'/g, "''")}',
                                '${team.team_id}',
                                '${memberRole}',
                                1,
                                '${team.user_tenant_id}'
                            )
                        `;

                        await db.updateDataIntoDB(updateQuery);
                    }

                    console.log(`Successfully updated members for team: ${team.team_id}`);
                    saveLog = true;
                } catch (apiError) {
                    // Handle specific Teams API errors
                    if (apiError.code === 'ConversationNotFound' || apiError.code === 'BotNotInConversationRoster') {
                        console.log(`Team ${team.team_id} is no longer accessible. Marking as uninstalled.`);

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

async function createGroupChatAndSendMessage(team, members, messageText) {
    const appId = process.env.MicrosoftAppId;
    const appPass = process.env.MicrosoftAppPassword;
    const credentials = new MicrosoftAppCredentials(appId, appPass);
    const connectorClient = new ConnectorClient(credentials, { baseUri: team.serviceUrl });
    const YOUR_GRAPH_ACCESS_TOKEN = "eyJ0eXAiOiJKV1QiLCJub25jZSI6ImExNFdXUmJlR3VnUDVyY1hzNmw2TkNQSE1GNU9mVXhtUnVLaFA0bl81Mm8iLCJhbGciOiJSUzI1NiIsIng1dCI6IkpZaEFjVFBNWl9MWDZEQmxPV1E3SG4wTmVYRSIsImtpZCI6IkpZaEFjVFBNWl9MWDZEQmxPV1E3SG4wTmVYRSJ9.eyJhdWQiOiIwMDAwMDAwMy0wMDAwLTAwMDAtYzAwMC0wMDAwMDAwMDAwMDAiLCJpc3MiOiJodHRwczovL3N0cy53aW5kb3dzLm5ldC9iOTMyODQzMi1mNTAxLTQ5M2UtYjdmNC0zMTA1NTIwYTFjZDQvIiwiaWF0IjoxNzUzMzM1NTM4LCJuYmYiOjE3NTMzMzU1MzgsImV4cCI6MTc1MzM0MTA4NCwiYWNjdCI6MCwiYWNyIjoiMSIsImFjcnMiOlsicDEiXSwiYWlvIjoiQVpRQWEvOFpBQUFBZzdPVmpSNHJ0enRNNFhCTGlpcytOM1hjRU5FR3cvWlZCM3F2WFFBc2RlV1NEYlZGcWlPMlppUnp0dnhGaUpmcThydENPS2gyRzRXN3VZL2x2Y2NneXgycE5yOXQvaGFvYTdHZ0tHL1dEdGkxdUxzdkFVOHJMQjdEMDRKYzY0NVN5WTZUYVY3ZHF1MlA5LzlhWHJRQkZCTWlVdTl3ZWNlUmRoaVNkb0pNRzRWaEFVS1EwbHlLMmRUYUFsM0VrT3ptIiwiYW1yIjpbInB3ZCIsIm1mYSJdLCJhcHBfZGlzcGxheW5hbWUiOiJUZXN0IC0gVGVhbSBCb2FyZCBJbi9PdXQgU3RhdHVzIExpc3QiLCJhcHBpZCI6IjQxNzcxYzJjLTNkMzItNDlkZC1hYWIyLTFhYjhmNWZjOTRjOSIsImFwcGlkYWNyIjoiMSIsImRldmljZWlkIjoiYzZjZDQ2ZTEtNTdkZS00YTM3LThiNjQtNzU1MDgxYjVlZGQ5IiwiaWR0eXAiOiJ1c2VyIiwiaXBhZGRyIjoiMjQwMTo0OTAwOjg4MTQ6NDIxNDo4MDFjOmI1ZDM6ZmI4MjoxMjYzIiwibmFtZSI6Ik5laGEgUGluZ2FsZSIsIm9pZCI6IjAxZjViMzc0LTk3ZDYtNDAwYi04YjQ3LWUyM2Y3ZmNhZjc5NCIsInBsYXRmIjoiMyIsInB1aWQiOiIxMDAzMjAwMEM2QjI4QjEzIiwicmgiOiIxLkFWTUFNb1F5dVFIMVBrbTM5REVGVWdvYzFBTUFBQUFBQUFBQXdBQUFBQUFBQUFBckFSTlRBQS4iLCJzY3AiOiJDYWxlbmRhcnMuUmVhZCBDaGF0LlJlYWRXcml0ZSBDdXN0b21TZWNBdHRyaWJ1dGVBc3NpZ25tZW50LlJlYWQuQWxsIEN1c3RvbVNlY0F0dHJpYnV0ZURlZmluaXRpb24uUmVhZC5BbGwgZW1haWwgR3JvdXBNZW1iZXIuUmVhZC5BbGwgTWFpbGJveFNldHRpbmdzLlJlYWQgb2ZmbGluZV9hY2Nlc3Mgb3BlbmlkIFByZXNlbmNlLlJlYWQuQWxsIFByZXNlbmNlLlJlYWRXcml0ZSBwcm9maWxlIFRlYW13b3JrVGFnLlJlYWQgVXNlci5SZWFkIFVzZXIuUmVhZC5BbGwgVXNlci5SZWFkQmFzaWMuQWxsIiwic2lkIjoiNThkZjRjNWUtY2U5YS00N2U2LTk0NjctOGVlNjEzMjFlNmQ5Iiwic3ViIjoiOWdZZkxPVUstZWJKZGsyQU9XVTFNTHRuNFM0MXV4S05MRjl1M3IzTGxDVSIsInRlbmFudF9yZWdpb25fc2NvcGUiOiJBUyIsInRpZCI6ImI5MzI4NDMyLWY1MDEtNDkzZS1iN2Y0LTMxMDU1MjBhMWNkNCIsInVuaXF1ZV9uYW1lIjoibnBpbmdhbGVAYXRzMzYwLmNvbSIsInVwbiI6Im5waW5nYWxlQGF0czM2MC5jb20iLCJ1dGkiOiJ3cG55clNtTXBFLTN0cXVjQUQ4eEFBIiwidmVyIjoiMS4wIiwid2lkcyI6WyJkMjRhZWY1Ny0xNTAwLTQwNzAtODRkYi0yNjY2ZjI5Y2Y5NjYiLCI2MmU5MDM5NC02OWY1LTQyMzctOTE5MC0wMTIxNzcxNDVlMTAiLCJiNzlmYmY0ZC0zZWY5LTQ2ODktODE0My03NmIxOTRlODU1MDkiXSwieG1zX2Z0ZCI6IjlrVnV3NmlvQ0RrZ0NQUk1mMjFJcm0wMlNxR1dZR2dPWnNpSTA5SkJmRndCWVhOcFlYTnZkWFJvWldGemRDMWtjMjF6IiwieG1zX2lkcmVsIjoiMSAyMiIsInhtc190Y2R0IjoxNDI2NTk4MDcwfQ.jwUcMRxMXHwfCy36Edcamd0BQkYzwPGK-Sb0nhgDZsRgvNvWYLeXP4U-jGPU2LawuDNApot88Yb_VJOZBwoSBKn_HOy_qGeecI2CvZ5NPUVcXE2hzdAG-sEvK_nhyPFCqec62eL-bkW-I_nD3YR3ep42cNYKJjENne3TBknXg2iIgpiZX6nAj0KL2aiKufpknqNRucxyL0hd9p7c5QXkFiePOWkGh7sbjxhiJLpjjmNg3gSO84hyMuRVsQfeTLzST57LxPWDYrYVgRgRq7YgJ0Gq6mD6bJFv7C-CooJ18_jcuAP0gA-tihlyMpln8T0H3vxsb3WnnmW3Ecw_ZI-Xhw"; // Ensure you have a valid access token
    const client = Client.init({
        authProvider: (done) => {
            done(null, YOUR_GRAPH_ACCESS_TOKEN); // Get a token with Chat.Create, Chat.ReadWrite
        }
    });

    // Prepare chat members
    const chatMembers = members.map(id => ({
        '@odata.type': '#microsoft.graph.aadUserConversationMember',
        roles: ['owner'],
        'user@odata.bind': `https://graph.microsoft.com/v1.0/users('${id.objectId}')`
    }));

    // Create the chat
    const chat = await client.api('/chats').post({
        chatType: 'group',
        members: chatMembers
    });

    // Send the first message
    await client.api(`/chats/${chat.id}/messages`).post({
        body: {
            content: messageText
        }
    });

    console.log(`Group chat created and message sent. Conversation ID: ${conversationId}`);
}