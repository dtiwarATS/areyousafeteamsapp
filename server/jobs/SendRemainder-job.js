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

const {
  getCompanyDataByTeamId,
  getFilesByIncId,
} = require("../db/dbOperations");

const { processSafetyBotError } = require("../models/processError");
(async () => {
  const sendProactiveMessage = async (sqlQuery, sqlQueryquerryReccuring) => {
    const log = new AYSLog();
    let saveLog = false;
    try {
      let membersNotRespondedList = [];
      let membersNotRespondedOneTimeList = await db.getDataFromDB(sqlQuery);
      let membersNotRespondedRecurringList = await db.getDataFromDB(
        sqlQueryquerryReccuring
      );
      membersNotRespondedList = membersNotRespondedOneTimeList;
      if (membersNotRespondedRecurringList && membersNotRespondedRecurringList.length > 0) {
        membersNotRespondedList.push(...membersNotRespondedRecurringList);
      }
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
              inc_type,
              MemberResponsesRecurrId,
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
              log.addLog(
                `send proactive reminder messaage to ${member.user_id} Start`
              );
              const companyData = await getCompanyDataByTeamId(member.team_id);
              let responseOptionData = {
                responseOptions: [
                  { id: 1, option: "I am safe", color: "#4CAF50" },
                  { id: 2, option: "I need assistance", color: "#F44336" },
                ],
                responseType: "buttons"
              }
              if (member.RESPONSE_TYPE && member.RESPONSE_OPTIONS) {
                responseOptionData = {
                  responseOptions: JSON.parse(member.RESPONSE_OPTIONS),
                responseType: member.RESPONSE_TYPE
        };
      }
              let incObj = {
                incId: inc_id,
                incTitle: inc_name,
                inc_type_id,
                runAt: member.runAt,
                incCreatedBy: {
                  id: created_by,
                  name: CREATED_BY_NAME,
                },
                responseOptionData
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
                `send proactive reminder messaage to ${member.user_id} successfully`
              );
              let userAadObjIds = [member.user_aadobj_id];
              if (member.inc_type == "onetime") {
                await incidentService.updateremaindercounter(
                  member.inc_id,
                  member.user_id
                );
                log.addLog(
                  `Update oneTime reminder message count in DB  ${member.user_id} successfully`
                );

                if (companyData.send_sms && (companyData.SubscriptionType == 3 || (companyData.SubscriptionType == 2 && companyData.sent_sms_count < 50))) {
                  await bot.sendSafetyCheckMsgViaSMS(companyData, userAadObjIds, inc_id, inc_name, null);
                }
              } else {
                await incidentService.updateRecurrremaindercounter(
                  member.MemberResponsesRecurrId
                );
                log.addLog(
                  `Update Reccuring reminder message count in DB  ${member.user_id} successfully`
                );
              }
              if (inc_type_id == 1 && companyData.send_whatsapp) {
                await bot.sendSafetyCheckMsgViaWhatsapp(companyData, userAadObjIds, inc_id, inc_name, CREATED_BY_NAME, responseOptionData.responseOptions);
              }
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
        "error in SendRemainder job sendProactiveMessage sqlQuery=" +
          sqlQuery +
          " sqlQueryquerryReccuring=" +
          sqlQueryquerryReccuring
      );
    } finally {
      if (saveLog) {
        await log.saveLog();
      }
    }
  };
  //let querry = `select mstm.* ,mst.* from MSTeamsMemberResponses mstm left join MSTeamsIncidents MST on mst.id = mstm.inc_id where response=0 and inc_id IN (select ID from [dbo].[MSTeamsIncidents] where EnableSendReminders=1  and INC_STATUS_ID=1 )`;
  let querry = `select mstm.* ,mst.* , (select top 1 user_aadobject_id from MSTeamsTeamsUsers where user_id = mstm.user_id) 'user_aadobj_id'
  from MSTeamsMemberResponses mstm left join MSTeamsIncidents MST on mst.id = mstm.inc_id where response=0 and inc_id 
  IN (select ID from [dbo].[MSTeamsIncidents] where EnableSendReminders=1  and INC_STATUS_ID=1 ) and MST.inc_type='onetime'`;

  let querryReccuring = `select distinct  Mmrr.* ,mst.* , (select top 1 user_aadobject_id from MSTeamsTeamsUsers where user_id = mstm.user_id) 'user_aadobj_id'
  ,mstm.user_id,mstm.inc_id,Mmrr.id as 'MemberResponsesRecurrId'
  from  MSTeamsMemberResponsesRecurr Mmrr left join MSTeamsMemberResponses mstm on mstm.id=Mmrr.memberResponsesId  left join MSTeamsIncidents MST on mst.id = mstm.inc_id where Mmrr.response=0 and mstm.inc_id 
  IN (select ID from [dbo].[MSTeamsIncidents] where EnableSendReminders=1  and INC_STATUS_ID=1 ) and MST.inc_type='recurringIncident'`;
  await sendProactiveMessage(querry, querryReccuring);

  // signal to parent that the job is done
  if (parentPort) parentPort.postMessage("done");
  else process.exit(0);
})();
