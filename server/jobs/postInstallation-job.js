const { parentPort } = require("worker_threads");
const parser = require("cron-parser");
const bot = require("../bot/bot");
const db = require("../db");
const incidentService = require("../services/incidentService");
const moment = require("moment-timezone");
const { AYSLog } = require("../utils/log");
const { sendProactiveMessaageToUser } = require("../api/apiMethods");
const {
  getTypeThreeFiveDayBeforeOneTimePaymentCard,
  getTypeTwoSubscriptionEndCard,
  getTypeThreeSubscriptionEndCard,
  getTypeTwoSevenDayBeforeCard,
  getTypeTwoThreeDayBeforeCard,
  getTestIncPreviewCard,
  getTestIncPreviewCard1,
} = require("../bot/subscriptionCard");
const { processSafetyBotError } = require("../models/processError");
(async () => {
  const sendProactiveMessage = async (sqlQuery, subcriptionMessage) => {
    const log = new AYSLog();
    let saveLog = false;
    try {
      let currentDateTime = moment(new Date()).utc().format("YYYY-MM-DD HH:mm");
      log.addLog(
        `Start sendProactiveMessage - ${subcriptionMessage} : currentDateTime - ${currentDateTime}`
      );
      let jobsToBeExecutedArr = await db.getDataFromDB(sqlQuery);
      log.addLog(`jobsToBeExecutedArr length - ${jobsToBeExecutedArr.length}`);
      if (jobsToBeExecutedArr != null && jobsToBeExecutedArr.length > 0) {
        await Promise.all(
          jobsToBeExecutedArr.map(async (job) => {
            try {
              log.addLog(`start subscription ID - ${job.ID}`);
              log.addLog(`job obj - ${JSON.stringify(job)}`);
              let companyData = {
                userEmailId: job.email,
                userName: job.user_name,
                userId: job.user_id,
                teamId: job.team_id,
              };
              let card = await getTestIncPreviewCard1(0, companyData); //get the card here;

              const member = [
                {
                  id: job.user_id,
                  name: job.user_name,
                },
              ];
              await sendProactiveMessaageToUser(
                member,
                card,
                null,
                job.serviceUrl,
                job.user_tenant_id,
                log,
                job.user_obj_id
              );
              log.addLog(
                `sendig  proactive messaage to ${job.user_id} successfully`
              );
              await incidentService.updatepostSentPostInstallationFlag(
                job.id,
                job.user_obj_id,
                subcriptionMessage
              );

              saveLog = true;
              log.addLog(`End subscription ID - ${job.Id}`);
            } catch (err) {
              console.log(err);
              log.addLog(`Error occured: ${err}`);
              processSafetyBotError(
                err,
                "",
                "",
                job.user_aadobject_id,
                "Error in postInstallation job senProactiveMessage job.Id=" +
                  job.Id
              );
            }
          })
        );
      }
    } catch (err) {
      log.addLog(`Error occured: ${err}`);
      processSafetyBotError(
        err,
        "",
        "",
        "",
        "Error in postInstallation job senProactiveMessage sqlQuery=" + sqlQuery
      );
    } finally {
      log.addLog(`End sendProactiveMessage -  ${subcriptionMessage}`);
      if (saveLog) {
        await log.saveLog();
      }
    }
  };

  const postInstallationQuery = (daysBefore) => {
    let sqlWhere = "";
    sqlWhere = ` DATEDIFF(day, created_date ,GETDATE() ) = 15 and (fifteenDaysPostInstallation is null or fifteenDaysPostInstallation<>1)`;

    if (daysBefore == 2) {
      sqlWhere = `  DATEDIFF(day, created_date ,GETDATE() ) = 2 and (twoDaysPostInstallation is null or twoDaysPostInstallation<>1)`;
    }

    if (daysBefore == 7) {
      sqlWhere = `  DATEDIFF(day, created_date ,GETDATE() ) = 7 and (sevenDaysPostInstallation is null or sevenDaysPostInstallation<>1)`;
    }

    return ` select * from (
        select *,(select COUNT(*) from MSTeamsIncidents where team_id=MSTeamsInstallationDetails.team_id) incidentcount
        from MSTeamsInstallationDetails 
        where ${sqlWhere}  and uninstallation_date is null
        )temp where incidentcount<=0 and team_id is not null and team_id != ''`;
  };

  let sqlTwoDayPostInstallation = postInstallationQuery(2);
  await sendProactiveMessage(
    sqlTwoDayPostInstallation,
    "twoDaysPostInstallation"
  );

  let sqlSevenDayPostInstallation = postInstallationQuery(7);
  await sendProactiveMessage(
    sqlSevenDayPostInstallation,
    "sevenDaysPostInstallation"
  );

  let sqlFifteenDayPostInstallation = postInstallationQuery(15);
  await sendProactiveMessage(
    sqlFifteenDayPostInstallation,
    "fifteenDaysPostInstallation"
  );

  // signal to parent that the job is done
  if (parentPort) parentPort.postMessage("done");
  else process.exit(0);
})();
