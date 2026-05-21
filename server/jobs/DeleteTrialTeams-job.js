const { parentPort } = require("worker_threads");
const db = require("../db");
const { processSafetyBotError } = require("../models/processError");
const tab = require("../tab/AreYouSafeTab");

(async () => {
  try {
    // Get all active teams from database
    const teamsQuery = `
      
	BEGIN TRY

    BEGIN TRANSACTION;

    ---------------------------------------------------
    -- Store Team IDs
    ---------------------------------------------------
    DECLARE @TeamIds TABLE (TEAM_ID NVARCHAR(255));

    INSERT INTO @TeamIds (TEAM_ID)
    SELECT MID.team_id
    FROM MSTeamsInstallationDetails MID
    INNER JOIN MSTeamsSubscriptionDetails MSD
        ON MID.SubscriptionDetailsId = MSD.ID
    WHERE 
        MSD.SubscriptionType IN (2)
        AND MID.created_date < DATEADD(DAY, -75, GETDATE());

    ---------------------------------------------------
    -- Store Incident IDs
    ---------------------------------------------------
    DECLARE @IncidentIds TABLE (INC_ID BIGINT);

    INSERT INTO @IncidentIds (INC_ID)
    SELECT id
    FROM MSTeamsIncidents
    WHERE team_id IN (
        SELECT TEAM_ID FROM @TeamIds
    );

    ---------------------------------------------------
    -- CHILD TABLES FIRST
    ---------------------------------------------------

    -- MSTeamsMemberResponsesRecurr
    DELETE MMRR
    FROM MSTeamsMemberResponsesRecurr MMRR
    INNER JOIN MSTeamsMemberResponses MMR
        ON MMRR.memberResponsesId = MMR.id
    WHERE MMR.inc_id IN (
        SELECT INC_ID FROM @IncidentIds
    );

    -- MSTeamsMemberResponses
    DELETE FROM MSTeamsMemberResponses
    WHERE inc_id IN (
        SELECT INC_ID FROM @IncidentIds
    );

    -- FilesData
    DELETE FROM FilesData
    WHERE inc_id IN (
        SELECT INC_ID FROM @IncidentIds
    );

    -- MessageActivityLog
    DELETE FROM MessageActivityLog
    WHERE IncidentId IN (
        SELECT INC_ID FROM @IncidentIds
    );

    -- SETTINGS
    DELETE FROM [SETTINGS]
    WHERE TEAM_ID IN (
        SELECT TEAM_ID FROM @TeamIds
    );

    -- MSTeamsSOSResponder
    DELETE FROM MSTeamsSOSResponder
    WHERE TEAM_ID IN (
        SELECT TEAM_ID FROM @TeamIds
    );

    -- MSTeamsTeamsUsers
    DELETE FROM MSTeamsTeamsUsers
    WHERE team_id IN (
        SELECT TEAM_ID FROM @TeamIds
    );

    ---------------------------------------------------
    -- PARENT TABLES
    ---------------------------------------------------

    -- MSTeamsIncidents
    DELETE FROM MSTeamsIncidents
    WHERE id IN (
        SELECT INC_ID FROM @IncidentIds
    );

    -- MSTeamsInstallationDetails
    DELETE FROM MSTeamsInstallationDetails
    WHERE team_id IN (
        SELECT TEAM_ID FROM @TeamIds
    );

    -- MSTeamsSubscriptionDetails
    DELETE MSD
    FROM MSTeamsSubscriptionDetails MSD
    WHERE MSD.SubscriptionType IN (2)
    AND NOT EXISTS (
        SELECT 1
        FROM MSTeamsInstallationDetails MID
        WHERE MID.SubscriptionDetailsId = MSD.ID
    );

    COMMIT TRANSACTION;

    PRINT 'All old trial team data deleted successfully';

END TRY
BEGIN CATCH

    ROLLBACK TRANSACTION;

    SELECT 
        ERROR_MESSAGE() AS ErrorMessage,
        ERROR_LINE() AS ErrorLine;

END CATCH;
    `;
    pool = await poolPromise;
    const data = await pool.request().query(teamsQuery);
    console.log(data);
  } catch (err) {
    console.error(err);
    console.log(`Error in DeleteTrialTeams-job job: ${err.message}`);
    processSafetyBotError(err, "", "", "", "Error in DeleteTrialTeams-job job");
  } finally {
    console.log("Completed DeleteTrialTeams-job job");
  }

  if (parentPort) parentPort.postMessage("done");
  else process.exit(0);
})();
