const { parentPort } = require("worker_threads");
const db = require("../db");
const { processSafetyBotError } = require("../models/processError");
const tab = require("../tab/AreYouSafeTab");
const { runGuardedJob, processConcurrently } = require("../utils/jobGuard");

const TEAM_CONCURRENCY = Number(process.env.UPDATE_USER_DETAILS_CONCURRENCY) || 3;

(async () => {
  const outcome = await runGuardedJob("updateUserDetails", async () => {
    const teamsQuery = `
      SELECT team_id
      FROM MSTeamsInstallationDetails 
      WHERE IS_APP_PERMISSION_GRANTED =1 and IS_APP_PERMISSION_GRANTED != '' and team_id != ''
    `;

    const teams = await db.getDataFromDB(teamsQuery);
    console.log(
      `[Job:updateUserDetails] Found ${teams.length} active teams to process (concurrency=${TEAM_CONCURRENCY})`,
    );

    const tabObj = new tab.AreYouSafeTab();
    await processConcurrently(teams, TEAM_CONCURRENCY, async (team) => {
      try {
        console.log(
          `[Job:updateUserDetails] Updating users details of team: ${team.team_id}`,
        );
        await tabObj.fetchDataAndUpdateDB(team.team_id);
      } catch (err) {
        console.error(err);
        console.log(
          `[Job:updateUserDetails] Error updating team ${team.team_id}: ${err.message}`,
        );
        processSafetyBotError(
          err,
          "",
          "",
          "",
          `Error in updateUserDetails job for team ${team.team_id}`,
        );
      }
    });

    console.log("[Job:updateUserDetails] Completed updateUserDetails job");
  });

  if (outcome.skipped) {
    return;
  }

  if (parentPort) parentPort.postMessage("done");
  else process.exit(0);
})();
