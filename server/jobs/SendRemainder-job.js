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
const {
  getSafetyCheckMessageText,
  SafetyCheckCard,
  getSafetyCheckTypeCard,
} = require("../models/SafetyCheckCard");

const { getCompanyDataByTeamId, getFilesByIncId } = require("../db/dbOperations");

const { processSafetyBotError } = require("../models/processError");
(async () => {
  const sendProactiveMessage = async (sqlQuery) => {
    const log = new AYSLog();
    let saveLog = false;
    try {
      let membersNotRespondedList = await db.getDataFromDB(sqlQuery);
      if (
        membersNotRespondedList != null &&
        membersNotRespondedList.length > 0
      ) {
        await Promise.all(
          membersNotRespondedList.map(async (memberObj) => {
            let member = memberObj;
            const {
              inc_id,
              inc_name,
              inc_type_id,
              created_by,
              CREATED_BY_NAME,
              GUIDANCE,
              additionalInfo,
              travelUpdate,
              contactInfo,
              situation,
              user_id,
            } = member;

            let ctime = new Date();
            let diff =
              member.LastReminderSentAT == undefined
                ? 0
                : ctime - member.LastReminderSentAT;
            var diffMins = Math.round(((diff % 86400000) % 3600000) / 60000);

            if (
              member.is_message_delivered &&
              member.SendRemindersCounter < member.SendRemindersCount &&
              diffMins >= member.SendRemindersTime
            ) {
              const companyData = await getCompanyDataByTeamId(member.team_id);
            let incObj = {
              incId: inc_id,
              incTitle: inc_name,
              inc_type_id,
              runAt: null,
              incCreatedBy: {
                id: created_by,
                name: CREATED_BY_NAME,
              },
            };
            const approvalCard = await SafetyCheckCard(
              inc_name,
              incObj,
              companyData,
              GUIDANCE,
              [],
              inc_type_id,
              additionalInfo,
              travelUpdate,
              contactInfo,
              situation
            );
              const filesData = await getFilesByIncId(inc_id);
              await sendProactiveMessaageToUser(
                [{ id: member.user_id, name: member.user_name }],
                approvalCard,
                null,
                companyData.serviceUrl,
                companyData.userTenantId,
                log,
                "",
                null,
                null,
                filesData
              );
              log.addLog(
                `send proactive messaage to ${member.user_id} successfully`
              );
              await incidentService.updateremaindercounter(
                member.inc_id,
                member.user_id
              );
            }
          })
        );
      }
    } catch (err) {
      log.addLog(`Error occured: ${err}`);
      processSafetyBotError(err, "", "");
    } finally {
      if (saveLog) {
        await log.saveLog();
      }
    }
  };
  let querry = `select mstm.* ,mst.* from MSTeamsMemberResponses mstm left join MSTeamsIncidents MST on mst.id = mstm.inc_id where response=0 and inc_id IN (select ID from [dbo].[MSTeamsIncidents] where EnableSendReminders=1  and INC_STATUS_ID=1 )`;
  await sendProactiveMessage(querry);

  // signal to parent that the job is done
  if (parentPort) parentPort.postMessage("done");
  else process.exit(0);
})();
