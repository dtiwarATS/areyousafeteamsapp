const { parentPort } = require("worker_threads");
const db = require("../db");
const { deleteCompanyData } = require("../db/dbOperations");
const { AYSLog } = require("../utils/log");
const { sendEmaildeletedata } = require("../utils");
const { processSafetyBotError } = require("../models/processError");

const dueUninstallQuery = `
  SELECT
    MID.id,
    MID.team_id,
    MID.team_name,
    MID.user_id,
    MID.user_name,
    MID.user_obj_id
  FROM MSTeamsInstallationDetails MID
  WHERE MID.uninstallation_date IS NOT NULL
    AND CAST(MID.uninstallation_date AS DATE) <= CAST(GETUTCDATE() AS DATE)
    AND MID.team_id IS NOT NULL
    AND MID.team_id <> ''
`;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function sendDeletedTeamsSummaryEmail(deletedTeams) {
  if (!deletedTeams.length) {
    return;
  }
  const rows = deletedTeams
    .map(
      (team) =>
        `<tr>
          <td>${escapeHtml(team.teamName)}</td>
          <td>${escapeHtml(team.teamId)}</td>
          <td>${escapeHtml(team.userName)}</td>
          <td>${escapeHtml(team.userObjId)}</td>
        </tr>`,
    )
    .join("");
  const emailBody =
    "Hi,<br/><br/>" +
    `Uninstall data cleanup deleted data for <b>${deletedTeams.length}</b> team(s).<br/><br/>` +
    "<table border='1' cellpadding='6' cellspacing='0'>" +
    "<tr><th>Team name</th><th>Team id</th><th>User name</th><th>User obj id</th></tr>" +
    rows +
    "</table><br/><br/>Thank you,<br/>Safety Check Support";
  const subject = `Safety Check | Uninstall data deleted for ${deletedTeams.length} team(s)`;
  if (process.env.IS_EMAIL_SEND == "true") {
    await sendEmaildeletedata(
      "",
      subject,
      emailBody,
      "npingale@ats360.com,apachumbre@ats360.com,dtiwari@ats360.com",
    );
  }
}

(async () => {
  const log = new AYSLog();
  let saveLog = false;
  try {
    log.addLog("Start deleteUninstallData job");
    const rows = (await db.getDataFromDB(dueUninstallQuery)) || [];
    log.addLog(`uninstall records due for delete - ${rows.length}`);
    const deletedTeams = [];

    for (const row of rows) {
      try {
        const isDeleted = await deleteCompanyData(row.team_id, row.user_obj_id);
        if (isDeleted) {
          saveLog = true;
          deletedTeams.push({
            teamName: row.team_name,
            teamId: row.team_id,
            userName: row.user_name,
            userObjId: row.user_obj_id,
          });
          log.addLog(
            `deleteUninstallData deleted team_id=${row.team_id} user_obj_id=${row.user_obj_id}`,
          );
        } else {
          log.addLog(
            `deleteUninstallData failed team_id=${row.team_id} user_obj_id=${row.user_obj_id}`,
          );
        }
      } catch (err) {
        console.log(err);
        log.addLog(`Error occured: ${err}`);
        processSafetyBotError(
          err,
          row.team_name || "",
          row.user_name || "",
          row.user_obj_id || "",
          "error in deleteUninstallData job team_id=" + row.team_id,
        );
      }
    }

    await sendDeletedTeamsSummaryEmail(deletedTeams);
    log.addLog(
      `deleteUninstallData summary email for ${deletedTeams.length} team(s)`,
    );
  } catch (err) {
    console.log(err);
    log.addLog(`Error occured: ${err}`);
    processSafetyBotError(err, "", "", "", "error in deleteUninstallData job");
  } finally {
    log.addLog("End deleteUninstallData job");
    if (saveLog) {
      await log.saveLog();
    }
    if (parentPort) parentPort.postMessage("done");
    else process.exit(0);
  }
})();
