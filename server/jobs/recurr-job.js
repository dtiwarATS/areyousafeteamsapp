const { parentPort } = require("worker_threads");
const parser = require("cron-parser");
const bot = require("../bot/bot");
const db = require("../db");
const { formatedDate } = require("../utils");
const incidentService = require("../services/incidentService");
const moment = require("moment-timezone");
const { AYSLog } = require("../utils/log");

(async () => {
  //get filter job from database
  //console.log("recurr job : start");
  const log = new AYSLog();
  let currentDateTime = moment(new Date()).utc().format('YYYY-MM-DD HH:mm');
  log.addLog(`recurr job : currentDateTime - ${currentDateTime}`);
  console.log("recurr job : currentDateTime - " + currentDateTime);
  let sqlJob = `SELECT A.ID AS INC_ID, B.ID AS SUB_EVENT_ID, B.CRON, B.TIMEZONE, A.INC_TYPE AS incType, A.INC_NAME, A.CREATED_BY AS createdById, ` +
    `A.CREATED_BY_NAME AS createdByName, A.TEAM_ID, A.CHANNEL_ID, A.EVENT_END_DATE eventEndDate, A.EVENT_END_TIME eventEndTime, B.RUN_AT runAt ` +
    ` FROM MSTEAMSINCIDENTS A ` +
    `LEFT JOIN MSTEAMS_SUB_EVENT B ON A.ID = B.INC_ID ` +
    `WHERE A.INC_TYPE = 'recurringIncident' AND CONVERT(DATETIME,'${currentDateTime}') >= CONVERT(DATETIME, B.RUN_AT) AND CONVERT(DATETIME,'${currentDateTime}') >= CONVERT(DATETIME, A.EVENT_START_DATE)` +
    `AND (A.IS_DELETED = 0 OR A.IS_DELETED IS NULL) AND A.INC_STATUS_ID != 2`;

  let jobsToBeExecutedArr = await db.getDataFromDB(sqlJob);
  if (jobsToBeExecutedArr != null && jobsToBeExecutedArr.length > 0) {
    // send msgs
    await Promise.all(
      jobsToBeExecutedArr.map(async (job) => {
        // send teams msg and change the runAt time of the job to next interval
        let saveLog = false;
        try {

          const { CRON: cron, TIMEZONE: timeZone, INC_ID: incId, SUB_EVENT_ID: subEventId, TEAM_ID: teamId, INC_NAME: incTitle, eventEndDate, eventEndTime } = job;
          const options = { tz: timeZone };

          log.addLog(`incId: ${incId} subEventId: ${subEventId}`);
          log.addLog(`incTitle: ${incTitle} start`);
          const endDateTime = new Date(eventEndDate + " " + eventEndTime);

          const usrTZCurrentTime = new Date(moment.tz(new Date().toUTCString(), timeZone).format('MM-DD-YYYY HH:mm'));

          if (usrTZCurrentTime > endDateTime) {
            return true;
          }
          log.addLog(`usrTZCurrentTime: ${usrTZCurrentTime}`);
          let eventMembersSql = `select [id], [user_id] , [user_name]  from MSTeamsMemberResponses where inc_id = ${incId}`;
          let eventMembers = await db.getDataFromDB(eventMembersSql);

          if (eventMembers?.length > 0) {

            let companyData = await incidentService.getCompanyData(teamId);
            job = {
              ...job,
              eventMembers,
              companyData
            }
            log.addLog("send recurring safety message start");
            let allEventMsgDelivered = await bot.sendRecurrEventMsg(job, incId, incTitle, log);
            log.addLog("send recurring safety message end");
            if (allEventMsgDelivered) {
              let interval = parser.parseExpression(cron, options);
              let nextRunAtUTC = interval.next().toISOString();
              let sqlUpdate = `UPDATE MSTEAMS_SUB_EVENT SET LAST_RUN_AT = '${job.runAt}', RUN_AT = '${nextRunAtUTC}', COMPLETED = 1 WHERE ID = ${subEventId}`;
              await db.updateDataIntoDB(sqlUpdate);
            }
          }
          log.addLog(`incTitle: ${incTitle} end`);
          saveLog = true;
        } catch (err) {
          console.log(err);
          log.addLog(`Recurring inc error: ${err}`);
        } finally {
          if (saveLog) {
            //log.saveLog();
          }
        }
      })
    );
  }

  //console.log("recurr job : end");
  // signal to parent that the job is done
  if (parentPort) parentPort.postMessage("done");
  else process.exit(0);
})();
