const { parentPort } = require("worker_threads");
const db = require("../db");
const { processSafetyBotError } = require("../models/processError");
const tab = require("../tab/AreYouSafeTab");

(async () => {
    try {
        // Get all active teams from database
        const teamsQuery = `
      SELECT team_id
      FROM MSTeamsInstallationDetails 
      WHERE refresh_token is not null and refresh_token != '' and team_id != ''
    `;

        const teams = await db.getDataFromDB(teamsQuery);
        console.log(`Found ${teams.length} active teams to process`);
        const tabObj = new tab.AreYouSafeTab();
        for (const team of teams) {
            try {
                console.log(`Updating users details of team: ${team.team_id}`);
                await tabObj.fetchDataAndUpdateDB(teamId);
            } catch (err) {
                console.error(err);
                console.log(
                    `Error in Updating users of team ${team.team_id}: ${err.message}`
                );
                processSafetyBotError(
                    err,
                    "",
                    "",
                    "",
                    `Error in updateTeamMembers job for team ${team.team_id}`
                );
            }
        }
    } catch (err) {
        console.error(err);
        console.log(`Error in updateUserDetails job: ${err.message}`);
        processSafetyBotError(
            err,
            "",
            "",
            "",
            "Error in updateTeamMembers job"
        );
    } finally {
        console.log("Completed updateUserDetails job");
    }

    if (parentPort) parentPort.postMessage("done");
    else process.exit(0);
})();
