const { parentPort } = require("worker_threads");
const parser = require("cron-parser");
const bot = require("../bot/bot");
const db = require("../db");
const { formatedDate } = require("../utils");
const incidentService = require("../services/incidentService");
const moment = require("moment-timezone");
const { AYSLog } = require("../utils/log");
const { sendProactiveMessaageToUser } = require("../api/apiMethods");
const { getTypeThreeSubscriptionStartedCard } = require("../bot/subscriptionCard");
const { processSafetyBotError } = require("../models/processError");
(async () => {

    const sendProactiveMessage = async (sqlQuery, subcriptionMessage) => {
        const log = new AYSLog();
        let saveLog = false;
        try {
            let currentDateTime = moment(new Date()).utc().format('YYYY-MM-DD HH:mm');
            log.addLog(`Start sendProactiveMessage - ${subcriptionMessage} : currentDateTime - ${currentDateTime}`);
            let jobsToBeExecutedArr = await db.getDataFromDB(sqlQuery);
            log.addLog(`jobsToBeExecutedArr length - ${jobsToBeExecutedArr.length}`);
            if (jobsToBeExecutedArr != null && jobsToBeExecutedArr.length > 0) {
                await Promise.all(
                    jobsToBeExecutedArr.map(async (job) => {
                        try {
                            log.addLog(`start subscription ID - ${job.ID}`);
                            log.addLog(`job obj - ${JSON.stringify(job)}`);
                            const subscriptionType = job.SubscriptionType;
                            const memberCount = job.memberCount != null ? job.memberCount : 0;
                            const subscriptionDate = job.SubscriptionDate;
                            const expiryDate = job.ExpiryDate;

                            const userObj = {
                                id: job.user_id,
                                name: job.user_name
                            };
                            let card = getTypeThreeSubscriptionStartedCard(memberCount, subscriptionDate, expiryDate, userObj);

                            const member = [userObj];
                            log.addLog(`send  ${subcriptionMessage} type-${subscriptionType} to ${job.user_id} start`);
                            await sendProactiveMessaageToUser(member, card, null, job.serviceUrl, job.tenantid, log);
                            log.addLog(`send  ${subcriptionMessage} type-${subscriptionType} proactive messaage to ${job.user_id} successfully`);
                            await incidentService.updateSubcriptionProcessFlag(job.ID);
                            saveLog = true;
                            log.addLog(`End subscription ID - ${job.ID}`);
                        } catch (err) {
                            console.log(err);
                            log.addLog(`Error occured: ${err}`);
                            processSafetyBotError(err, "", "");
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
    }

    let sqlNewSubcription = `select distinct sd.ID, usr.user_aadobject_id, usr.user_id, usr.user_name, usr.tenantid, inst.serviceUrl, sd.SubscriptionType, 
    sd.TermUnit, convert(varchar, sd.SubscriptionDate, 101) SubscriptionDate, convert(varchar, sd.ExpiryDate, 101) ExpiryDate,
    sd.UserLimit memberCount
    from MSTeamsSubscriptionDetails sd
    left join MSTeamsInstallationDetails inst on inst.SubscriptionDetailsId = sd.ID
    left join MSTeamsTeamsUsers usr on usr.user_aadobject_id = sd.UserAadObjId
    where sd.SubscriptionType in (3) and isProcessed = 0`;
    await sendProactiveMessage(sqlNewSubcription, "newSubscription");

    // signal to parent that the job is done
    if (parentPort) parentPort.postMessage("done");
    else process.exit(0);
})();
