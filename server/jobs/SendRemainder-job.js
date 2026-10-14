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
const sql = require("mssql");
const { runGuardedJob, processConcurrently } = require("../utils/jobGuard");
const { activeTeamSql } = require("../utils/activeTenantFilter");

// Reminders sent in parallel (each one also calls Teams and other channels).
const REMINDER_CONCURRENCY = 5;

// Bumps SendRemindersCounter / LastReminderSentAT for all reminded members in
// one statement per table instead of one UPDATE per member.
const flushReminderCounters = async (oneTimeRows, recurringIds) => {
  if (oneTimeRows.length > 0) {
    await db.executeWithRetry(
      `UPDATE r SET SendRemindersCounter = ISNULL(r.SendRemindersCounter, 0) + 1,
                    LastReminderSentAT = GETDATE()
       FROM MSTeamsMemberResponses r
       INNER JOIN OPENJSON(@json) WITH (incId int '$.i', userId varchar(255) '$.u') j
         ON r.inc_id = j.incId AND r.user_id = j.userId;`,
      { json: { type: sql.NVarChar(sql.MAX), value: JSON.stringify(oneTimeRows) } },
      { label: "SendRemainder one-time counters" },
    );
  }
  if (recurringIds.length > 0) {
    await db.executeWithRetry(
      `UPDATE rr SET SendRemindersCounter = ISNULL(rr.SendRemindersCounter, 0) + 1,
                     LastReminderSentAT = GETDATE()
       FROM MSTeamsMemberResponsesRecurr rr
       INNER JOIN OPENJSON(@json) WITH (id int '$') j ON rr.id = j.id;`,
      { json: { type: sql.NVarChar(sql.MAX), value: JSON.stringify(recurringIds) } },
      { label: "SendRemainder recurring counters" },
    );
  }
};

(async () => {
  await runGuardedJob(
    "SendRemainder",
    async () => {
  const sendProactiveMessage = async (sqlQuery, sqlQueryquerryReccuring) => {
    const log = new AYSLog();
    let saveLog = false;
    // per-run caches: same team / incident is looked up once, not per member
    const companyDataByTeam = new Map();
    const filesByIncident = new Map();
    const cached = (map, key, load) => {
      if (!map.has(key)) map.set(key, load());
      return map.get(key);
    };
    const oneTimeCounterRows = [];
    const recurringCounterIds = [];
    try {
      // Both queries already return only members who are due a reminder now.
      const membersNotRespondedOneTimeList =
        (await db.getDataFromDB(sqlQuery)) || [];
      const membersNotRespondedRecurringList =
        (await db.getDataFromDB(sqlQueryquerryReccuring)) || [];
      const membersNotRespondedList = [
        ...membersNotRespondedOneTimeList,
        ...membersNotRespondedRecurringList,
      ];
      if (membersNotRespondedList.length > 0) {
        await processConcurrently(
          membersNotRespondedList,
          REMINDER_CONCURRENCY,
          async (memberObj) => {
           try {
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
              user_aadobj_id,
              IS_DRILL,
              TRANSLATED_TEXT_JSON,
              LANGUAGE_ID,
            } = member;

            let ctime = new Date();
            let diff =
              member.LastReminderSentAT == undefined
                ? 0
                : ctime - member.LastReminderSentAT;
            // total minutes since the last reminder (the old modulo wrapped every hour)
            var diffMins = Math.floor(diff / 60000);

            if (
              member.is_message_delivered &&
              member.SendRemindersCounter < member.SendRemindersCount &&
              diffMins >= member.SendRemindersTime
            ) {
              log.addLog(
                `send proactive reminder messaage to ${member.user_id} Start`,
              );
              const companyData = await cached(
                companyDataByTeam,
                member.team_id,
                () => getCompanyDataByTeamId(member.team_id),
              );
              let responseOptionData = {
                responseOptions: [
                  { id: 1, option: "I am safe", color: "#4CAF50" },
                  { id: 2, option: "I need assistance", color: "#F44336" },
                ],
                responseType: "buttons",
              };
              if (member.RESPONSE_TYPE && member.RESPONSE_OPTIONS) {
                responseOptionData = {
                  responseOptions: JSON.parse(member.RESPONSE_OPTIONS),
                  responseType: member.RESPONSE_TYPE,
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
                responseOptionData,
                isDrill: IS_DRILL,
                translatedtext: TRANSLATED_TEXT_JSON,
                TRANSLATED_TEXT_JSON,
              };
              incidentService.saveAllTypeQuerylogs(
                user_aadobj_id,
                "",
                "TEAMS",
                "",
                incObj.incId,
                "SENDING",
                "Follow-up",
                "",
                inc_name,
                "",
                "",
                "",
              );
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
                situation,
                LANGUAGE_ID,
              );
              const filesData = await cached(filesByIncident, inc_id, () =>
                getFilesByIncId(inc_id),
              );
              // duplicate column names come back from mssql as arrays
              const firstValue = (v) =>
                (Array.isArray(v) ? v.find((x) => x) : v) ?? null;
              const conversationId = firstValue(
                member.reminderConversationId ?? member.conversationId,
              );
              await sendProactiveMessaageToUser(
                [{ id: member.user_id, name: member.user_name }],
                approvalCard,
                null,
                companyData.serviceUrl,
                companyData.userTenantId,
                log,
                member.user_aadobj_id,
                conversationId,
                null,
                filesData,
              );
              incidentService.saveAllTypeQuerylogs(
                user_aadobj_id,
                "",
                "TEAMS",
                "",
                incObj.incId,
                "SEND_SUCCESS",
                "Follow-up",
                "",
                inc_name,
                "",
                "",
                "",
              );
              log.addLog(
                `send proactive reminder messaage to ${member.user_id} successfully`,
              );
              let IntegrationConfigure = companyData?.INTEGRATION_CONFIGURE
                ? JSON.parse(companyData.INTEGRATION_CONFIGURE)
                : null;
              let userAadObjIds = [member.user_aadobj_id];
              // counters are written in one batch at the end of the run
              if (member.inc_type == "onetime") {
                oneTimeCounterRows.push({
                  i: Number(member.inc_id),
                  u: String(member.user_id),
                });
              } else {
                recurringCounterIds.push(Number(member.MemberResponsesRecurrId));
              }
              // voice / SMS follow-ups for one-time and recurring reminders
              if (
                (companyData.SubscriptionType == 3 ||
                  (companyData.SubscriptionType == 1 &&
                    companyData.SubscriptionType == 2) ||
                  companyData.SENT_VOICE_CALL_COUNT < 50) &&
                inc_type_id == 1 &&
                IntegrationConfigure?.channels?.voice?.enabled &&
                IntegrationConfigure?.channels?.voice?.events?.incidentFollowUp
              ) {
                await bot.sendSafetyCheckMsgViaVoice(
                  companyData,
                  userAadObjIds,
                  incObj,
                  incObj.incCreatedBy,
                  "Follow-up",
                );
              }
              if (
                (companyData.SubscriptionType == 3 ||
                  (companyData.SubscriptionType == 1 &&
                    companyData.SubscriptionType == 2) ||
                  companyData.SENT_VOICE_CALL_COUNT < 50) &&
                IntegrationConfigure?.channels?.sms?.enabled &&
                IntegrationConfigure?.channels?.sms?.events?.incidentFollowUp
              ) {
                await bot.sendSafetyCheckMsgViaSMS(
                  companyData,
                  userAadObjIds,
                  inc_id,
                  inc_name,
                  null,
                  "Follow-up",
                );
              }
              if (
                inc_type_id == 1 &&
                IntegrationConfigure?.channels?.whatsapp?.enabled &&
                IntegrationConfigure?.channels?.whatsapp?.events?.incidentFollowUp
              ) {
                await bot.sendSafetyCheckMsgViaWhatsapp(
                  companyData,
                  userAadObjIds,
                  inc_id,
                  inc_name,
                  CREATED_BY_NAME,
                  responseOptionData.responseOptions,
                  incObj,
                  "Follow-up",
                );
              }
              if (
                IntegrationConfigure?.channels?.email?.enabled &&
                IntegrationConfigure?.channels?.email?.events?.incidentFollowUp
              ) {
                await bot.sendSafetyCheckMsgViaEmail(
                  companyData,
                  [member],
                  inc_id,
                  inc_name,
                  CREATED_BY_NAME,
                  responseOptionData.responseOptions,
                  member,
                  "Follow-up",
                );
              }
              await bot.sendSafetyCheckMsgViaDesktop(
                companyData,
                [member.user_aadobj_id],
                inc_id,
                inc_name,
                {
                  incTypeId: inc_type_id,
                  incGuidance: GUIDANCE,
                  CREATED_BY_NAME,
                },
                responseOptionData.responseOptions,
                CREATED_BY_NAME,
              );
            }
           } catch (err) {
            // one member failing must not stop the other reminders
            log.addLog(`Reminder error for ${memberObj?.user_id}: ${err}`);
            processSafetyBotError(
              err,
              "",
              "",
              memberObj?.user_aadobj_id || "",
              "error in SendRemainder job member inc_id=" + memberObj?.inc_id,
            );
           }
          },
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
          sqlQueryquerryReccuring,
      );
    } finally {
      try {
        await flushReminderCounters(oneTimeCounterRows, recurringCounterIds);
      } catch (err) {
        processSafetyBotError(
          err,
          "",
          "",
          "",
          "error in SendRemainder job flushReminderCounters " +
            JSON.stringify({ oneTimeCounterRows, recurringCounterIds }),
        );
      }
      if (saveLog) {
        await log.saveLog();
      }
    }
  };
  //let querry = `select mstm.* ,mst.* from MSTeamsMemberResponses mstm left join MSTeamsIncidents MST on mst.id = mstm.inc_id where response=0 and inc_id IN (select ID from [dbo].[MSTeamsIncidents] where EnableSendReminders=1  and INC_STATUS_ID=1 )`;
  // Only members who are due a reminder right now: not responded, original
  // message delivered, reminder count not reached and interval elapsed.
  // (These checks used to run in JS after loading every non-responder of every
  // open incident on every run.) Explicit columns: no wide mst.* / mstm.* rows.
  const incidentColumns = `
    mst.team_id, mst.inc_name, mst.inc_type, mst.inc_type_id, mst.created_by,
    mst.CREATED_BY_NAME, mst.created_date, mst.GUIDANCE, mst.additionalInfo,
    mst.travelUpdate, mst.contactInfo, mst.situation, mst.IS_DRILL,
    mst.TRANSLATED_TEXT_JSON, mst.RESPONSE_TYPE, mst.RESPONSE_OPTIONS,
    mst.SendRemindersCount, mst.SendRemindersTime`;
  const reminderIncidentFilter = `
    mst.EnableSendReminders = 1
    AND mst.INC_STATUS_ID = 1
    AND mst.SendRemindersCount > 0
    AND mst.SendRemindersTime > 0
    AND ${activeTeamSql("mst.team_id")}`;
  // user row for the member, preferring the incident's own team
  const memberUserApply = `
OUTER APPLY (
    SELECT TOP 1 user_aadobject_id, email, LANGUAGE_ID, conversationId
    FROM MSTeamsTeamsUsers
    WHERE user_id = mstm.user_id
    ORDER BY CASE WHEN team_id = mst.team_id THEN 0 ELSE 1 END
) mtu`;

  let querry = `SELECT
    mstm.inc_id, mstm.user_id, mstm.user_name, mstm.user_name AS name,
    mstm.is_message_delivered, mstm.SendRemindersCounter, mstm.LastReminderSentAT,
    ${incidentColumns},
    mtu.user_aadobject_id AS user_aadobj_id,
    mtu.email,
    mtu.LANGUAGE_ID,
    mtu.conversationId
FROM MSTeamsIncidents mst
INNER JOIN MSTeamsMemberResponses mstm
    ON mstm.inc_id = mst.id
${memberUserApply}
WHERE ${reminderIncidentFilter}
    AND mst.inc_type = 'onetime'
    AND mstm.response = 0
    AND mstm.is_message_delivered = 1
    AND ISNULL(mstm.SendRemindersCounter, 0) < mst.SendRemindersCount
    AND mstm.LastReminderSentAT <= DATEADD(MINUTE, -mst.SendRemindersTime, GETDATE());`;

  let querryReccuring = `SELECT
    mstm.inc_id, mstm.user_id, mstm.user_name, mstm.user_name AS name,
    Mmrr.id AS MemberResponsesRecurrId, Mmrr.runAt,
    Mmrr.is_message_delivered, Mmrr.SendRemindersCounter, Mmrr.LastReminderSentAT,
    ${incidentColumns},
    mtu.user_aadobject_id AS user_aadobj_id,
    mtu.email,
    mtu.LANGUAGE_ID,
    COALESCE(Mmrr.conversationId, mtu.conversationId) AS reminderConversationId
FROM MSTeamsIncidents mst
INNER JOIN MSTEAMS_SUB_EVENT mse
    ON mse.INC_ID = mst.id
INNER JOIN MSTeamsMemberResponses mstm
    ON mstm.inc_id = mst.id
INNER JOIN MSTeamsMemberResponsesRecurr Mmrr
    ON Mmrr.memberResponsesId = mstm.id
    AND Mmrr.runAt = mse.LAST_RUN_AT
${memberUserApply}
WHERE ${reminderIncidentFilter}
    AND mst.inc_type = 'recurringIncident'
    AND Mmrr.response = 0
    AND Mmrr.is_message_delivered = 1
    AND ISNULL(Mmrr.SendRemindersCounter, 0) < mst.SendRemindersCount
    AND Mmrr.LastReminderSentAT <= DATEADD(MINUTE, -mst.SendRemindersTime, GETDATE());`;

  const pendingIncidents = await db.getDataFromDB(`
    SELECT TOP 1 1 AS hasWork
    FROM MSTeamsIncidents
    WHERE EnableSendReminders = 1
      AND INC_STATUS_ID = 1
      AND SendRemindersCount > 0
      AND SendRemindersTime > 0
  `);

  if (!pendingIncidents?.length) {
    console.log(
      "[Job:SendRemainder] No active incidents needing reminders — skipping heavy queries",
    );
    return;
  }

  await sendProactiveMessage(querry, querryReccuring);
    },
    { exitWhenSkipped: false },
  );

  // signal to parent that the job is done
  if (parentPort) parentPort.postMessage("done");
  else process.exit(0);
})();
