const { parentPort } = require("worker_threads");
const db = require("../db");
const { AYSLog } = require("../utils/log");
const { sendEmail } = require("../utils");
const { sendProactiveMessaageToUser } = require("../api/apiMethods");
const { getFreeTeamAccessConfirmCard } = require("../bot/subscriptionCard");
const { processSafetyBotError } = require("../models/processError");

const freeTeamInstallerQuery = `
  SELECT
    MID.id,
    MID.team_id,
    MID.team_name,
    MID.user_id,
    MID.user_name,
    MID.user_obj_id,
    MID.email,
    MID.serviceUrl,
    MID.user_tenant_id
  FROM MSTeamsInstallationDetails MID
  INNER JOIN MSTeamsSubscriptionDetails SD
    ON MID.SubscriptionDetailsId = SD.ID
  WHERE SD.SubscriptionType = 1
    AND MID.uninstallation_date IS NULL
    AND MID.team_id IS NOT NULL
    AND MID.team_id <> ''
    AND MID.serviceUrl IS NOT NULL
    AND MID.user_id IS NOT NULL
    AND ISNULL(MID.freeAccessConfirmMessageSent, 0) <> 1
`;

function isSuccessfulSend(sendResp) {
  const status = Number(sendResp?.status);
  return status >= 200 && status < 300;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function sendFreeTeamMessageSummaryEmail(sentTeams) {
  const rows = sentTeams
    .map(
      (team) =>
        `<tr>
          <td>${escapeHtml(team.teamName)}</td>
          <td>${escapeHtml(team.userName)}</td>
          <td>${escapeHtml(team.email)}</td>
          <td>${escapeHtml(team.teamId)}</td>
        </tr>`,
    )
    .join("");
  const emailBody =
    "Hi,<br/><br/>" +
    `The free-team access confirmation message was sent to <b>${sentTeams.length}</b> team(s).<br/><br/>` +
    "<table border='1' cellpadding='6' cellspacing='0'>" +
    "<tr><th>Team name</th><th>Installer</th><th>Email</th><th>Team id</th></tr>" +
    rows +
    "</table><br/><br/>Thank you,<br/>Safety Check Support";
  const subject = `Safety Check | Free team access message sent to ${sentTeams.length} team(s)`;
  if (process.env.IS_EMAIL_SEND == "true") {
    await sendEmail("", subject, emailBody);
  }
}

(async () => {
  const log = new AYSLog();
  let saveLog = false;
  try {
    log.addLog("Start freeTeamAccessConfirm job");
    const installers = await db.getDataFromDB(freeTeamInstallerQuery);
    const rows = installers || [];
    const sentTeams = [];
    log.addLog(`free team installers to message - ${rows.length}`);

    for (const installer of rows) {
      try {
        const member = [
          {
            id: installer.user_id,
            name: installer.user_name,
          },
        ];
        const installationId = Number(installer.id);
        const sendResp = await sendProactiveMessaageToUser(
          member,
          getFreeTeamAccessConfirmCard(
            Number.isInteger(installationId) ? installationId : null,
          ),
          null,
          installer.serviceUrl,
          installer.user_tenant_id,
          log,
          installer.user_obj_id,
        );

        if (!isSuccessfulSend(sendResp)) {
          const err = new Error(
            `Send failed (status=${sendResp?.status ?? "unknown"}) ${
              sendResp?.error || ""
            }`,
          );
          log.addLog(
            `freeTeamAccessConfirm send failed team_id=${installer.team_id} status=${sendResp?.status}`,
          );
          processSafetyBotError(
            err,
            installer.team_name || "",
            installer.user_name || "",
            installer.user_obj_id || "",
            "error in freeTeamAccessConfirm job send team_id=" +
              installer.team_id,
          );
          continue;
        }

        sentTeams.push({
          teamName: installer.team_name,
          userName: installer.user_name,
          email: installer.email,
          teamId: installer.team_id,
        });
        saveLog = true;
        log.addLog(
          `freeTeamAccessConfirm sent to ${installer.user_id} team_id=${installer.team_id}`,
        );
      } catch (err) {
        console.log(err);
        log.addLog(`Error occured: ${err}`);
        processSafetyBotError(
          err,
          installer.team_name || "",
          installer.user_name || "",
          installer.user_obj_id || "",
          "error in freeTeamAccessConfirm job team_id=" + installer.team_id,
        );
      }
    }

    await sendFreeTeamMessageSummaryEmail(sentTeams);
    log.addLog(
      `freeTeamAccessConfirm summary email for ${sentTeams.length} team(s)`,
    );
  } catch (err) {
    console.log(err);
    log.addLog(`Error occured: ${err}`);
    processSafetyBotError(err, "", "", "", "error in freeTeamAccessConfirm job");
  } finally {
    log.addLog("End freeTeamAccessConfirm job");
    if (saveLog) {
      await log.saveLog();
    }
    if (parentPort) parentPort.postMessage("done");
    else process.exit(0);
  }
})();
