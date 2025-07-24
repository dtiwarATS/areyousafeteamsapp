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
                    await createGroupChatAndSendMessage(teams[0], teamMembers, "This is a test message from the updateTeamMembers job");
                    // Update team members in database
                    return;
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
    const YOUR_GRAPH_ACCESS_TOKEN = "eyJ0eXAiOiJKV1QiLCJub25jZSI6IkJLb0tSNzBLdFcwUEN6Wkg1SWRMbF83aDBSQzR2ZEpIUV9PZEdLcU11T3ciLCJhbGciOiJSUzI1NiIsIng1dCI6IkpZaEFjVFBNWl9MWDZEQmxPV1E3SG4wTmVYRSIsImtpZCI6IkpZaEFjVFBNWl9MWDZEQmxPV1E3SG4wTmVYRSJ9.eyJhdWQiOiIwMDAwMDAwMy0wMDAwLTAwMDAtYzAwMC0wMDAwMDAwMDAwMDAiLCJpc3MiOiJodHRwczovL3N0cy53aW5kb3dzLm5ldC9iOTMyODQzMi1mNTAxLTQ5M2UtYjdmNC0zMTA1NTIwYTFjZDQvIiwiaWF0IjoxNzUzMzQ4MDQ3LCJuYmYiOjE3NTMzNDgwNDcsImV4cCI6MTc1MzM1MzY2NywiYWNjdCI6MCwiYWNyIjoiMSIsImFjcnMiOlsicDEiXSwiYWlvIjoiQVpRQWEvOFpBQUFBcGgzd2o1dTR5dDRmbFdCTXdEZW9HMnE1d1VvT2F3WlBycklXMjNTZWJMVTR1SUNLWjdJUHNZL2ZjemIwRzZPOFRpc0ZQL0JXK1hCUWxuZFo2SEhIa1g1QkViWmFQVERnWFVOSGRSSzNtaURuV3JRSVZwTXo3UnZQTnV6VFhCNWFaTzF0U2lXVFBuWVgwWkZLRHJjbW5vR3g5QXF1SEZJVHpOKzdpbjBQdXZxY3BjL1ZOaWluK08xbFluSmxyOHdBIiwiYW1yIjpbInB3ZCIsIm1mYSJdLCJhcHBfZGlzcGxheW5hbWUiOiJTdGFnaW5nIFNhZmV0eSBDaGVjayIsImFwcGlkIjoiNGNjYjQ1ZDEtMmY0YS00MDEwLTg4OTktZDkxODliOWZmODZhIiwiYXBwaWRhY3IiOiIxIiwiZGV2aWNlaWQiOiI1MjZlNzY1MC1lNWNiLTQ2YTctOThmNy1jNzgxZjEwN2U3MTQiLCJpZHR5cCI6InVzZXIiLCJpcGFkZHIiOiIyNDAxOjQ5MDA6ODgxNDo1M2Q4OmRkNDQ6M2FiMjoyNGFmOmQ4YzMiLCJuYW1lIjoiTmVoYSBQaW5nYWxlIiwib2lkIjoiMDFmNWIzNzQtOTdkNi00MDBiLThiNDctZTIzZjdmY2FmNzk0IiwicGxhdGYiOiIzIiwicHVpZCI6IjEwMDMyMDAwQzZCMjhCMTMiLCJyaCI6IjEuQVZNQU1vUXl1UUgxUGttMzlERUZVZ29jMUFNQUFBQUFBQUFBd0FBQUFBQUFBQUFyQVJOVEFBLiIsInNjcCI6IkNoYXQuUmVhZFdyaXRlIENoYXQuUmVhZFdyaXRlLkFsbCBlbWFpbCBvZmZsaW5lX2FjY2VzcyBvcGVuaWQgcHJvZmlsZSBUZWFtc0FwcEluc3RhbGxhdGlvbi5NYW5hZ2VTZWxlY3RlZEZvckNoYXQgVGVhbXNBcHBJbnN0YWxsYXRpb24uUmVhZFdyaXRlU2VsZkZvckNoYXQgVXNlci5SZWFkIFVzZXIuUmVhZC5BbGwgVXNlci5SZWFkQmFzaWMuQWxsIiwic2lkIjoiMDA2ZTgxMjktZmFkOC0wNjIxLWY1OGEtZWVkZjEyZGJhNzczIiwic3ViIjoiOWdZZkxPVUstZWJKZGsyQU9XVTFNTHRuNFM0MXV4S05MRjl1M3IzTGxDVSIsInRlbmFudF9yZWdpb25fc2NvcGUiOiJBUyIsInRpZCI6ImI5MzI4NDMyLWY1MDEtNDkzZS1iN2Y0LTMxMDU1MjBhMWNkNCIsInVuaXF1ZV9uYW1lIjoibnBpbmdhbGVAYXRzMzYwLmNvbSIsInVwbiI6Im5waW5nYWxlQGF0czM2MC5jb20iLCJ1dGkiOiJwTmtCQlV2ci0wS1pMQnVHU2VFM0FBIiwidmVyIjoiMS4wIiwid2lkcyI6WyJkMjRhZWY1Ny0xNTAwLTQwNzAtODRkYi0yNjY2ZjI5Y2Y5NjYiLCI2MmU5MDM5NC02OWY1LTQyMzctOTE5MC0wMTIxNzcxNDVlMTAiLCJiNzlmYmY0ZC0zZWY5LTQ2ODktODE0My03NmIxOTRlODU1MDkiXSwieG1zX2Z0ZCI6Ik5TcjVILWNTUzltdzdLMUVFNmVpVWpjUUhkTXFwM2ZTQm90ajlvQ2tINWdCYTI5eVpXRnpiM1YwYUMxa2MyMXoiLCJ4bXNfaWRyZWwiOiI2IDEiLCJ4bXNfdGNkdCI6MTQyNjU5ODA3MH0.BLVjazmo_zSo666Vgd3Qyfn0ssQLSwKahMOsJuXyhanYCtOlchiDUT0f7lm2ONMZExkkLkV3T3auNBIaD5KicGqt02fDRoQPpRaKvXHPBsISLefc1TdpAKHMGXSyAlodJPJytlRzPnKp7I4Z8XnAaa9AW8u77uOp-U6oxW9fqtijyBPVi9xq7xxoWKB9NpKMmjedqDlLVDMGx3DuQef-mdPESPB5Z4aaWvX9gdP2UQE4kD_3vplFPxLGCrypdDgUVfmj0l_gslu7W6gs9dm1_ZvT-w-VnuKHTiQGbwp5_rWIFP2xm0TvnwA1KLxe-xOASfICpsj8EOE1eLSRQzHIDA"; // Ensure you have a valid access token
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

    const response = await client
        .api(`/chats/${chat.id}/installedApps`)
        .post({
            "teamsApp@odata.bind": `https://graph.microsoft.com/v1.0/appCatalogs/teamsApps/bd70ec9d-635b-4dc5-83a9-4752153a01b0`,
        });

    // Send the first message
    await client.api(`/chats/${chat.id}/messages`).post({
        body: {
            contentType: "html",
            content: messageText
        },
        from: {
            application: {
                id: process.env.MicrosoftAppId // Your bot's App ID
            }
        }
    });

    console.log(`Group chat created and message sent. Conversation ID: ${conversationId}`);
}