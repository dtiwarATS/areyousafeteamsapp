const { parentPort } = require("worker_threads");
const sql = require("mssql");
const bot = require("../bot/bot");
const db = require("../db");
const incidentService = require("../services/incidentService");
const { AYSLog } = require("../utils/log");
const { processSafetyBotError } = require("../models/processError");
const { getFilesByIncId } = require("../db/dbOperations");
const { runGuardedJob } = require("../utils/jobGuard");

// Safety net for one-time safety checks: members whose delivery status was
// never written (app restart / crash mid-send, lost DB write) are sent again.
// Only rows with message_delivery_status IS NULL are picked, and every attempt
// writes a status, so each member is retried here at most once.
const MAX_INCIDENTS_PER_RUN = 5;

// Incidents created 10 min - 6 h ago (created_date is a UTC ISO string) that
// still have never-attempted members and show no delivery in the last 10 min
// (i.e. no send is currently running for them).
const CANDIDATES_SQL = `
  SELECT TOP (${MAX_INCIDENTS_PER_RUN})
    inc.id AS incId, inc.team_id AS teamId, inc.inc_name AS incTitle, inc.inc_type AS incType,
    inc.inc_type_id AS incTypeId, inc.selected_members AS selectedMembers, inc.created_by AS createdBy,
    inc.CREATED_BY_NAME AS createdByName, inc.GUIDANCE AS incGuidance, inc.additionalInfo,
    inc.travelUpdate, inc.contactInfo, inc.situation, inc.RESPONSE_TYPE AS responseType,
    inc.RESPONSE_OPTIONS AS responseOptions, inc.IS_DRILL, inc.TRANSLATED_TEXT_JSON,
    (SELECT TOP 1 tu.user_id FROM MSTeamsTeamsUsers tu
      WHERE tu.user_aadobject_id = inc.created_by) AS createdByUserId
  FROM MSTeamsIncidents inc
  WHERE inc.inc_type = 'onetime'
    AND (inc.IS_DELETED = 0 OR inc.IS_DELETED IS NULL)
    AND ISNULL(inc.isSavedAsDraft, 0) <> 1
    AND ISNULL(inc.INC_STATUS_ID, 0) <> 2
    AND TRY_CAST(inc.created_date AS datetime)
        BETWEEN DATEADD(hour, -6, GETUTCDATE()) AND DATEADD(minute, -10, GETUTCDATE())
    AND EXISTS (SELECT 1 FROM MSTeamsMemberResponses r
                WHERE r.inc_id = inc.id AND r.message_delivery_status IS NULL)
    AND NOT EXISTS (SELECT 1 FROM MSTeamsMemberResponses r
                    WHERE r.inc_id = inc.id
                      AND r.LastReminderSentAT > DATEADD(minute, -10, GETDATE()))
  ORDER BY inc.id DESC;`;

const PENDING_MEMBERS_SQL = `
  SELECT r.user_id AS id, r.user_name AS name, u.conversationId,
         u.user_aadobject_id AS userAadObjId, u.LANGUAGE_ID
  FROM MSTeamsMemberResponses r
  OUTER APPLY (SELECT TOP 1 tu.conversationId, tu.user_aadobject_id, tu.LANGUAGE_ID
               FROM MSTeamsTeamsUsers tu
               WHERE tu.user_id = r.user_id AND tu.team_id = @teamId) u
  WHERE r.inc_id = @incId AND r.message_delivery_status IS NULL;`;

const reconcileIncident = async (inc, log) => {
  const pending = await db.executeWithRetry(
    PENDING_MEMBERS_SQL,
    {
      incId: { type: sql.Int, value: Number(inc.incId) },
      teamId: { type: sql.VarChar(100), value: inc.teamId },
    },
    { label: `reconcile pending inc=${inc.incId}` },
  );
  const members = pending?.recordset || [];
  if (members.length === 0) return;

  const companyData = await incidentService.getCompanyData(inc.teamId);
  if (!companyData?.serviceUrl) {
    log.addLog(`reconcile incId=${inc.incId}: no company data, skipped`);
    return;
  }
  const incFilesData = await getFilesByIncId(inc.incId);

  let responseOptionData = {
    responseOptions: [
      { id: 1, option: "I am safe", color: "#4CAF50" },
      { id: 2, option: "I need assistance", color: "#F44336" },
    ],
    responseType: "buttons",
  };
  if (inc.responseOptions && inc.responseType) {
    try {
      responseOptionData = {
        responseOptions: JSON.parse(inc.responseOptions),
        responseType: inc.responseType,
      };
    } catch (err) {
      console.log(err);
    }
  }

  const incData = {
    incTitle: inc.incTitle,
    incTypeId: inc.incTypeId,
    additionalInfo: inc.additionalInfo,
    travelUpdate: inc.travelUpdate,
    contactInfo: inc.contactInfo,
    situation: inc.situation,
    teamId: inc.teamId,
    selectedMembers: inc.selectedMembers,
    IS_DRILL: inc.IS_DRILL,
    TRANSLATED_TEXT_JSON: inc.TRANSLATED_TEXT_JSON,
  };
  const incObj = {
    incId: inc.incId,
    incTitle: inc.incTitle,
    incType: inc.incType,
    runAt: null,
    incCreatedBy: {
      id: inc.createdByUserId || companyData.userId,
      name: inc.createdByName || "",
    },
    incGuidance: inc.incGuidance || "",
    incResponseSelectedUsersList: null,
    responseOptionData,
    isDrill: inc.IS_DRILL,
    translatedtext: inc.TRANSLATED_TEXT_JSON,
  };

  console.log(
    `[reconcile-delivery] incId=${inc.incId}: re-sending to ${members.length} member(s) with no delivery status`,
  );
  log.addLog(
    `reconcile incId=${inc.incId}: re-sending to ${members.length} member(s)`,
  );
  await new Promise((resolve, reject) => {
    bot.sendProactiveMessageAsync(
      members,
      incData,
      incObj,
      companyData,
      companyData.serviceUrl,
      inc.createdBy,
      companyData.userTenantId,
      log,
      resolve,
      reject,
      null,
      incFilesData,
      "",
      "false",
    );
  });
};

(async () => {
  try {
    await runGuardedJob(
      "reconcile-delivery",
      async () => {
        const log = new AYSLog();
        const candidates = await db.executeWithRetry(
          CANDIDATES_SQL,
          {},
          { label: "reconcile-delivery candidates" },
        );
        const incidents = candidates?.recordset || [];
        if (incidents.length === 0) return;
        for (const inc of incidents) {
          try {
            await reconcileIncident(inc, log);
          } catch (err) {
            console.log(err);
            processSafetyBotError(
              err,
              inc.teamId,
              "",
              inc.createdBy,
              "error in reconcile-delivery-job incId=" + inc.incId,
            );
          }
        }
        await log.saveLog();
      },
      { exitWhenSkipped: false },
    );
  } catch (err) {
    console.error("[reconcile-delivery] failed:", err?.message || err);
  }
  // signal to parent that the job is done
  if (parentPort) parentPort.postMessage("done");
  else process.exit(0);
})();
