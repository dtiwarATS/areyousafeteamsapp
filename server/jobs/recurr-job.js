const { parentPort } = require("worker_threads");
const parser = require("cron-parser");
const bot = require("../bot/bot");
const db = require("../db");
const {formatedDate} = require("../utils");
const incidentService = require("../services/incidentService");
const moment = require("moment-timezone");

(async () => {
  //get filter job from database
  //console.log("recurr job : start");
  let currentDateTime = moment(new Date()).utc().format('YYYY-MM-DD HH:mm');
  console.log("recurr job : currentDateTime - " + currentDateTime);
  let sqlJob = `SELECT A.ID AS INC_ID, B.ID AS SUB_EVENT_ID, B.CRON, B.TIMEZONE, A.INC_TYPE AS incType, A.INC_NAME, A.CREATED_BY AS createdById, ` +
                `A.CREATED_BY_NAME AS createdByName, A.TEAM_ID, A.CHANNEL_ID, A.EVENT_END_DATE eventEndDate, A.EVENT_END_TIME eventEndTime  FROM MSTEAMSINCIDENTS A `+
                `LEFT JOIN MSTEAMS_SUB_EVENT B ON A.ID = B.INC_ID `+
                `WHERE A.INC_TYPE = 'recurringIncident' AND CONVERT(DATETIME,'${currentDateTime}') >= CONVERT(DATETIME, B.RUN_AT) `;                

  let jobsToBeExecutedArr = await db.getDataFromDB(sqlJob);
  if(jobsToBeExecutedArr != null && jobsToBeExecutedArr.length > 0){
    // send msgs
    //console.log("recurr job : no of record -" + jobsToBeExecutedArr.length);
    await Promise.all(
      jobsToBeExecutedArr.map(async (job) => {
        // send teams msg and change the runAt time of the job to next interval
        try {
          
          const { CRON : cron, TIMEZONE: timeZone, INC_ID: incId, SUB_EVENT_ID: subEventId, TEAM_ID: teamId, INC_NAME: incTitle, eventEndDate, eventEndTime } = job;
          const options = { tz: timeZone };

          const endDateTime = new Date(eventEndDate + " " + eventEndTime);
          
          const usrTZCurrentTime = new Date(moment.tz(new Date().toUTCString(), 'Asia/Kolkata').format());

          if(usrTZCurrentTime > endDateTime){
            return true;
          }

          //console.log("recurr job : " + incTitle);
          let eventMembersSql = `select [user_id] , [user_name]  from MSTeamsMemberResponses where inc_id = ${incId}`;
          let eventMembers = await db.getDataFromDB(eventMembersSql);

          if(eventMembers?.length > 0){           

            let companyData = await incidentService.getCompanyData(teamId);
            job = {
              ...job,
              eventMembers,
              companyData
            }          

            let allEventMsgDelivered = await bot.sendRecurrEventMsg(job, incId, incTitle);

            if (allEventMsgDelivered) {
              let interval = parser.parseExpression(cron, options);
              let nextRunAtUTC = interval.next().toISOString();
              let sqlUpdate = `UPDATE MSTEAMS_SUB_EVENT SET RUN_AT = '${nextRunAtUTC}', COMPLETED = 1 WHERE ID = ${subEventId}`;
              await db.updateDataIntoDB(sqlUpdate);
            }
          }          
        } catch (err) {
          //console.log(`ERROR occured while executing the job \nError: ${err}`);
        }
        //console.log("recurr job : " + incTitle + " end");
      })
    );
  }  

  //console.log("recurr job : end");
  // signal to parent that the job is done
  if (parentPort) parentPort.postMessage("done");
  else process.exit(0);
})();
