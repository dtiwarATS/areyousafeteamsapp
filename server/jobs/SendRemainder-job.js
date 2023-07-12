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

const { getCompanyDataByTeamId } = require("../db/dbOperations");

const { processSafetyBotError } = require("../models/processError");
(async () => {
  const sendProactiveMessage = async (sqlQuery) => {
    //const log = new AYSLog();
    let saveLog = false;
    try {
      let incidentList = await db.getDataFromDB(sqlQuery);
      //log.addLog(`jobsToBeExecutedArr length - ${incidentList.length}`);
      if (incidentList != null && incidentList.length > 0) {
        let memberQuery = "";
        incidentList.map(async (incident) => {
          console.log({ incident });
          memberQuery += `select mstm.* ,mst.*
          from MSTeamsMemberResponses mstm
          left join MSTeamsIncidents MST on mst.id = mstm.inc_id
          where response=0 and inc_id=${incident.id};`;
        });
        let membersNotRespondedListset = await db.getDataFromDB(
          memberQuery,
          "",
          false
        );

        console.log({ membersNotRespondedListset });
        membersNotRespondedListset.map(async (membersNotRespondedList) => {
          membersNotRespondedList.map(async (memberlist) => {
            console.log({ memberlist });
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
            } = memberlist;
            const companyData = {};
            // const companyData = await getCompanyDataByTeamId(
            //   memberlist.team_id
            // );
            let incObj = {
              inc_id,
              inc_name,
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
              incObj.incResponseSelectedUsersList,
              inc_type_id,
              additionalInfo,
              travelUpdate,
              contactInfo,
              situation
            );

            log.addLog(
              `send   proactive messaage to ${memberlist.user_id} start`
            );
            await sendProactiveMessaageToUser(
              memberlist,
              approvalCard,
              null,
              "",
              "",
              log,
              ""
            );
            log.addLog(
              `send proactive messaage to ${memberlist.user_id} successfully`
            );
          });
        });
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
  let querry = `select * from [dbo].[MSTeamsIncidents] where EnableSendReminders=1 `;
  await sendProactiveMessage(querry);

  // signal to parent that the job is done
  if (parentPort) parentPort.postMessage("done");
  else process.exit(0);
})();
