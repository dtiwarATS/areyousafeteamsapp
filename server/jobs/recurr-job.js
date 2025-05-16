const { parentPort } = require("worker_threads");
const parser = require("cron-parser");
const bot = require("../bot/bot");
const db = require("../db");
const { formatedDate } = require("../utils");
const incidentService = require("../services/incidentService");
const moment = require("moment-timezone");
const { AYSLog } = require("../utils/log");
const { processSafetyBotError } = require("../models/processError");
const { getFilesByIncId } = require("../db/dbOperations");

(async () => {
  //get filter job from database
  //console.log("recurr job : start");
  const log = new AYSLog();
  let currentDateTime = moment(new Date()).utc().format("YYYY-MM-DD HH:mm");
  await bot.getUserPhone('1.AVMAMoQyuQH1Pkm39DEFUgoc1AGcc_FiLktAgNRy95WCug9TABNTAA.AgABAwEAAABVrSpeuWamRam2jAF1XRQEAwDs_wUA9P_CtLjQZG7vcjZ0Ax5i5YOCgCaoENWSGApJEZ3U_fc6zO8A6lTmnbdbW0dHjg1T3p2hE7b5mXLqT5dEHak2IAmLk6CsJO39BqZW_G9OUbYI8CAAbp7KzH-qmDveAMmK6GikERd2KHsDiJeSiF5Ku_MyFYMIYMb2I7GIF60Omwd6QB-E6JPLCKoDturNkpHLB0EZ6PCMB3PGQYeZXLp5Jg2KH4IMQ6Pg_i-IOqUhiHbHhmQofuIoMeKpjx0qyt3oQ9Ar4qdDbrV19WWKz3PuKb9N6DlLAhXvDH0Pu3NnLqxBF31puCtTqiReJ1W54J75e9rtR2b9MHjXWSzFCbkmcDIaf_63ZEwI604VJx2eFVpgxscHF-hbikWAs2Nl0BlcDWUQhBVdNZuollbLYr4bRkGCGgIzsmjLIorIxbGtfdJ_kGh4EJ8xI_rd6I5ltRxPOuxcCwMPTq4xjALZARs-Kjkc7Jp957mSjEqDSEGI11tEdOdF0LKjATllsGLOFjDosJhMi5F135zFZs2CRETpxgcLtfGVCnAoG3WGNVFcktugezPD5UCpckvjTLetFNMUhoofpBkSuNS3auCZH3CztZVlMxbDZ80orqqmAMRIh29Nh2s71ChqOWRO1MM4q9PnFWji12gv61vKsWqukZXRpOE47q_Otcgd3Ki50c3XxfAjpI77_fobdX_JeD6raFoyS6xuUlAwiK17LogA8faUslQyhJmbczbf6PRbq95yV9gLMb5WxMPu3w3qHxQM13sVsN7wkroc6aHQO8Zcce4V2SjQ8TTt3uAsKhYJW5GFRLjSLE710yxzNvkqEUckpnr_3DvGpsJa020VejG_7FeXVdxtXI2Da_Q1p2pDSvmlfZrkTUwqAbJm1mX2pZb-OeeLn73KMc7dYRRemgile2M9-WvPrfZFj555KvdQOK876IIa-fIVdOvQAmH6C2z-WgIA0F8dtQP5zpN4R9SoP5OUhcue',
    'b9328432-f501-493e-b7f4-3105520a1cd4', ['c3f51391-a38f-4af8-a1e9-64b942283046']
  );
  log.addLog(`recurr job : currentDateTime - ${currentDateTime}`);
  console.log("recurr job : currentDateTime - " + currentDateTime);
  let sqlJob = `SELECT A.ID AS INC_ID, B.ID AS SUB_EVENT_ID, B.CRON, B.TIMEZONE, A.INC_TYPE AS incType, A.INC_NAME, A.INC_NAME incTitle, A.CREATED_BY AS createdById, 
    A.CREATED_BY_NAME AS createdByName, A.TEAM_ID, A.CHANNEL_ID, A.EVENT_END_DATE eventEndDate, A.EVENT_END_TIME eventEndTime, B.RUN_AT runAt 
    ,A.inc_type_id incTypeId, A.additionalInfo, A.travelUpdate, A.contactInfo, A.situation
    FROM MSTEAMSINCIDENTS A 
    LEFT JOIN MSTEAMS_SUB_EVENT B ON A.ID = B.INC_ID 
    WHERE A.INC_TYPE = 'recurringIncident' AND CONVERT(DATETIME,'${currentDateTime}') >= CONVERT(DATETIME, B.RUN_AT) AND CONVERT(DATETIME,'${currentDateTime}') >= CONVERT(DATETIME, A.EVENT_START_DATE)
    AND (A.IS_DELETED = 0 OR A.IS_DELETED IS NULL) AND A.INC_STATUS_ID != 2 AND isSavedAsDraft <> 1`;

  let jobsToBeExecutedArr = await db.getDataFromDB(sqlJob);
  log.addLog(`jobsToBeExecutedArr length - ${jobsToBeExecutedArr?.length}`);
  if (jobsToBeExecutedArr != null && jobsToBeExecutedArr.length > 0) {
    let saveLog = false;
    // send msgs
    await Promise.all(
      jobsToBeExecutedArr.map(async (job) => {
        // send teams msg and change the runAt time of the job to next interval
        try {
          const {
            CRON: cron,
            TIMEZONE: timeZone,
            INC_ID: incId,
            SUB_EVENT_ID: subEventId,
            TEAM_ID: teamId,
            INC_NAME: incTitle,
            eventEndDate,
            eventEndTime,
          } = job;
          const options = { tz: timeZone };

          log.addLog(`incId: ${incId} subEventId: ${subEventId}`);
          log.addLog(`incTitle: ${incTitle} start`);
          const endDateTime = new Date(eventEndDate + " " + eventEndTime);

          const usrTZCurrentTime = new Date(
            moment
              .tz(new Date().toUTCString(), timeZone)
              .format("MM-DD-YYYY HH:mm")
          );

          if (usrTZCurrentTime > endDateTime) {
            return true;
          }
          log.addLog(`usrTZCurrentTime: ${usrTZCurrentTime}`);
          let eventMembersSql = `select distinct A.[id] memberResponsesId, A.[user_id] id, A.[user_name] name, U.conversationId 
          from MSTeamsMemberResponses A
          LEFT JOIN MSTeamsTeamsUsers U on a.user_id = u.user_id 
          where inc_id = ${incId} and U.team_id='${teamId}'`;
          let eventMembers = await db.getDataFromDB(eventMembersSql);

          if (eventMembers?.length > 0) {
            let companyData = await incidentService.getCompanyData(teamId);
            const filesData = await getFilesByIncId(incId);
            job = {
              ...job,
              eventMembers,
              companyData,
              filesData,
            };

            let interval = parser.parseExpression(cron, options);
            let nextRunAtUTC = interval.next().toISOString();
            let sqlUpdate = `UPDATE MSTEAMS_SUB_EVENT SET LAST_RUN_AT = '${job.runAt}', RUN_AT = '${nextRunAtUTC}', COMPLETED = 1 WHERE ID = ${subEventId}`;
            db.updateDataIntoDB(sqlUpdate, job?.createdById);

            log.addLog("send recurring safety message start");
            let allEventMsgDelivered = await bot.sendRecurrEventMsg(
              job,
              incId,
              incTitle,
              log
            );
            log.addLog("send recurring safety message end");

            // if (allEventMsgDelivered) {
            //   let interval = parser.parseExpression(cron, options);
            //   let nextRunAtUTC = interval.next().toISOString();
            //   let sqlUpdate = `UPDATE MSTEAMS_SUB_EVENT SET LAST_RUN_AT = '${job.runAt}', RUN_AT = '${nextRunAtUTC}', COMPLETED = 1 WHERE ID = ${subEventId}`;
            //   await db.updateDataIntoDB(sqlUpdate, job?.createdById);
            // }
          }
          log.addLog(`incTitle: ${incTitle} end`);
          saveLog = true;
        } catch (err) {
          console.log(err);
          log.addLog(`Recurring inc error: ${err}`);
          processSafetyBotError(
            err,
            "",
            "",
            job.createdById,
            "error in recurr-job job.id=" +
              job.ID +
              " jobsToBeExecutedArr=" +
              JSON.stringify(jobsToBeExecutedArr)
          );
        }
      })
    );
    if (saveLog) {
      await log.saveLog();
    }
  }

  //console.log("recurr job : end");
  // signal to parent that the job is done
  if (parentPort) parentPort.postMessage("done");
  else process.exit(0);
})();
