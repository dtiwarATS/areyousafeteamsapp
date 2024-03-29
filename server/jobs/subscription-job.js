const { parentPort } = require("worker_threads");
const parser = require("cron-parser");
const bot = require("../bot/bot");
const db = require("../db");
const { formatedDate } = require("../utils");
const incidentService = require("../services/incidentService");
const moment = require("moment-timezone");
const { AYSLog } = require("../utils/log");
const { sendProactiveMessaageToUser } = require("../api/apiMethods");
const {
  getTypeTwoFiveDayBeforeCard,
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

              let card = null;
              if (subscriptionType == 2) {
                if (subcriptionMessage == "sevenDayBeforeExpiry") {
                  card = getTypeTwoSevenDayBeforeCard(userId, userName);
                } else if (subcriptionMessage == "threeDayBeforeExpiry") {
                  card = getTypeTwoThreeDayBeforeCard(userId, userName);
                } else if (subcriptionMessage == "afterSubcriptionEnd") {
                  card = getTypeTwoSubscriptionEndCard(
                    userId,
                    userName,
                    teamName
                  );
                }
              } else if (subscriptionType == 3) {
                if (subcriptionMessage == "fiveDayBeforeExpiry") {
                  card = getTypeThreeFiveDayBeforeOneTimePaymentCard(
                    memberCount,
                    expiryDate
                  );
                } else if (subcriptionMessage == "afterSubcriptionEnd") {
                  card = getTypeThreeSubscriptionEndCard(
                    expiryDate,
                    userEmailId
                  );
                }
              }
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
              processSafetyBotError(
                err,
                "",
                "",
                job.user_aadobject_id,
                "error in subscriptionjob sendProactiveMessage job.id" +
                  job.ID +
                  " jobsToBeExecutedArr=" +
                  JSON.stringify(jobsToBeExecutedArr)
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
        "error in subscriptionjob sendProactiveMessage jobsToBeExecutedArr=" +
          JSON.stringify(jobsToBeExecutedArr)
      );
    } finally {
      log.addLog(`End sendProactiveMessage -  ${subcriptionMessage}`);
      if (saveLog) {
        await log.saveLog();
      }
    }
  };

  const beforeExpiryQuery = (isBeforeExpiry, daysBefore) => {
    let sqlWhere = "";
    if (isBeforeExpiry) {
      sqlWhere = ` where sd.SubscriptionType in (3)
              and DATEDIFF(day, GETDATE(), sd.ExpiryDate) = 5 and ISNULL(sd.isFiveDayBeforeMessageSent, 0) <> 1`;

      if (daysBefore == 3) {
        sqlWhere = ` where sd.SubscriptionType in (2) and DATEDIFF(day, GETDATE(), sd.ExpiryDate) = 3 and ISNULL(sd.isThreeDayBeforeMessageSent, 0) <> 1 `;
      }

      if (daysBefore == 7) {
        sqlWhere = ` where sd.SubscriptionType in (2) and DATEDIFF(day, GETDATE(), sd.ExpiryDate) = 7 and ISNULL(sd.isSevenDayBeforeMessageSent, 0) <> 1 `;
      }
    } else {
      sqlWhere =
        " where sd.SubscriptionType in (2,3) and GETDATE() > sd.ExpiryDate and ISNULL(sd.isAfterExpiryMessageSent, 0) <> 1 ";
    }

    return (sqlBeforeExpiry = `select distinct sd.ID, usr.user_aadobject_id, usr.user_id, usr.user_name,sd.TenantId tenantid, inst.serviceUrl, sd.SubscriptionType, 
          sd.TermUnit, convert(varchar, sd.ExpiryDate, 101) ExpiryDate,
          (select count (user_aadobject_id) from (
          select distinct user_aadobject_id from MSTeamsTeamsUsers where tenantid = sd.TenantId and hasLicense = 1
          ) t) memberCount, inst.team_id, inst.email, inst.team_name
          from MSTeamsSubscriptionDetails sd
          left join MSTeamsInstallationDetails inst on inst.SubscriptionDetailsId = sd.ID
          left join MSTeamsTeamsUsers usr on usr.user_aadobject_id = sd.UserAadObjId
          ${sqlWhere} and serviceUrl is not null and INST.team_id IS NOT NULL AND INST.team_id!='' AND USR.user_id IS NOT NULL AND INST.id IS NOT NULL  and inst.uninstallation_date is null AND sd.TenantId IS NOT NULL`);
  };

  let sqlFiveDayBeforeExpiry = beforeExpiryQuery(true, 5);
  await sendProactiveMessage(sqlFiveDayBeforeExpiry, "fiveDayBeforeExpiry");

  let sqlSevenDayBeforeExpiry = beforeExpiryQuery(true, 7);
  await sendProactiveMessage(sqlSevenDayBeforeExpiry, "sevenDayBeforeExpiry");

  let sqlThreeDayBeforeExpiry = beforeExpiryQuery(true, 3);
  await sendProactiveMessage(sqlThreeDayBeforeExpiry, "threeDayBeforeExpiry");

  let sqlAfterSubcriptionEnd = beforeExpiryQuery(false, -1);
  await sendProactiveMessage(sqlAfterSubcriptionEnd, "afterSubcriptionEnd");

  // signal to parent that the job is done
  if (parentPort) parentPort.postMessage("done");
  else process.exit(0);
})();
