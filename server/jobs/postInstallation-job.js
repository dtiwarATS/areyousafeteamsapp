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
              const memberCount = job.memberCount != null ? job.memberCount : 0;
              const {
                ExpiryDate: expiryDate,
                team_id: teamId,
                email: userEmailId,
                SubscriptionType: subscriptionType,
                user_aadobject_id: userAadObjId,
                user_id: userId,
                user_name: userName,
                team_name: teamName,
              } = job;

              let card = ""; //get the card here;

              const member = [
                {
                  id: job.user_id,
                  name: job.user_name,
                },
              ];
              log.addLog(
                `send  ${subcriptionMessage} type-${subscriptionType} to ${job.user_id} start`
              );
              await sendProactiveMessaageToUser(
                member,
                card,
                null,
                job.serviceUrl,
                job.tenantid,
                log,
                userAadObjId
              );
              log.addLog(
                `send  ${subcriptionMessage} type-${subscriptionType} proactive messaage to ${job.user_id} successfully`
              );

              if (
                subcriptionMessage == "threeDayBeforeExpiry" ||
                subcriptionMessage == "fiveDayBeforeExpiry" ||
                subcriptionMessage == "sevenDayBeforeExpiry"
              ) {
                await incidentService.updateBeforeMessageSentFlag(
                  job.ID,
                  userAadObjId,
                  subcriptionMessage
                );
              } else if (subcriptionMessage == "afterSubcriptionEnd") {
                if (job.tenantid != null) {
                  await incidentService.updateSubscriptionTypeToTypeOne(
                    job.tenantid,
                    job.ID,
                    teamId,
                    userAadObjId,
                    subscriptionType
                  );
                  await incidentService.updateAfterExpiryMessageSentFlag(
                    job.ID,
                    userAadObjId
                  );
                }
              }

              saveLog = true;
              log.addLog(`End subscription ID - ${job.ID}`);
            } catch (err) {
              console.log(err);
              log.addLog(`Error occured: ${err}`);
              processSafetyBotError(err, "", "", job.user_aadobject_id);
            }
          })
        );
      }
    } catch (err) {
      log.addLog(`Error occured: ${err}`);
      processSafetyBotError(err, "", "");
    } finally {
      log.addLog(`End sendProactiveMessage -  ${subcriptionMessage}`);
      if (saveLog) {
        await log.saveLog();
      }
    }
  };

  const postInstallationQuery = (daysBefore) => {
    let sqlWhere = "";
    sqlWhere = ` DATEDIFF(day, created_date ,GETDATE() ) = 15`;

    if (daysBefore == 2) {
      sqlWhere = ` where DATEDIFF(day, created_date ,GETDATE() ) = 2`;
    }

    if (daysBefore == 7) {
      sqlWhere = ` where DATEDIFF(day, created_date ,GETDATE() ) = 7`;
    }

    return ` select * from (
        select *,(select COUNT(*) from MSTeamsIncidents where team_id=MSTeamsInstallationDetails.team_id) incidentcount
        from MSTeamsInstallationDetails 
        where ${sqlWhere}  and uninstallation_date is null
        )temp where incidentcount<=0   `;
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
