const { parentPort } = require("worker_threads");
const db = require("../db");
const incidentService = require("../services/incidentService");
const moment = require("moment-timezone");
const { AYSLog } = require("../utils/log");
const { sendProactiveMessaageToUser } = require("../api/apiMethods");
const { getCompanyDataByTeamId } = require("../db/dbOperations");
const { processSafetyBotError } = require("../models/processError");
const dashboard = require("../models/dashboard");

(async () => {
  const log = new AYSLog();
  let saveLog = false;
  try {
    const currentDateTime = moment(new Date())
      .utc()
      .format("YYYY-MM-DD HH:mm:ss");
    log.addLog(
      `SosBeforeAcknowledgementReminder job : currentDateTime - ${currentDateTime}`,
    );
    console.log(
      "SosBeforeAcknowledgementReminder job : currentDateTime - " +
        currentDateTime,
    );

    // Query SOS requests that need reminders
    // Conditions:
    // - IsReminderEnabledBeforeAcknowledgement = true (checked via team settings)
    // - FIRST_RESPONDER IS NULL
    // - FIRST_RESPONDER_RESPONDED_AT IS NULL
    // - status is not 'Closed'
    // - BeforeAcknowledgementReminderCount < MaxReminderCountBeforeAcknowledgement
    // - Time since last reminder (or SOS creation) >= ReminderIntervalMinutesBeforeAcknowledgement
    const sosQuery = `
      SELECT 
    a.id,
    a.user_id,
    u.user_name,
    a.sent_to_ids,
    a.sent_to_names,
    a.status,
    a.team_ids,
    a.requested_date,
    a.BeforeAcknowledgementReminderCount,
    a.BeforeAcknowledgementLastReminderSentAt,
    a.LastUpdatedDateTime,
	a.FIRST_RESPONDER,
    a.FIRST_RESPONDER_RESPONDED_AT,
    a.BeforeAcknowledgementNoResponseCount,
    t.IsReminderEnabledBeforeAcknowledgement,
    t.MaxReminderCountBeforeAcknowledgement,
    t.ReminderIntervalMinutesBeforeAcknowledgement,
    t.NotifyInitiatorIfNoResponseBeforeAcknowledgement,
    t.serviceUrl,
    t.user_tenant_id

FROM MSTeamsAssistance a

-- ✅ Get initiator name (single row)
OUTER APPLY (
    SELECT TOP 1 user_name
    FROM MSTeamsTeamsUsers
    WHERE user_id = a.user_id
) u

-- ✅ Get ONE eligible team config (single row)
OUTER APPLY (
    SELECT TOP 1 t.*
    FROM MSTeamsTeamsUsers tu
    INNER JOIN MSTeamsInstallationDetails t
        ON t.team_id = tu.team_id
        AND t.uninstallation_date IS NULL
    WHERE tu.user_id = a.user_id
      AND t.IsReminderEnabledBeforeAcknowledgement = 1
      
    ORDER BY t.team_id   -- optional: priority / created date
) t

WHERE 
    a.LastUpdatedDateTime >= '2026-02-26 00:00:00'
    AND a.FIRST_RESPONDER IS NULL
    AND a.FIRST_RESPONDER_RESPONDED_AT IS NULL
    AND (a.status IS NULL OR a.status <> 'Closed')
    AND t.team_id IS NOT NULL;   -- ensures eligible config exists

    `;

    const sosList = await db.getDataFromDB(sosQuery);
    log.addLog(`Found ${sosList?.length || 0} SOS requests to process`);

    if (sosList && sosList.length > 0) {
      await Promise.all(
        sosList.map(async (sos) => {
          try {
            const {
              id: assistanceId,
              user_id: initiatorUserId,
              sent_to_ids: sentToIds,
              sent_to_names: sentToNames,
              status,
              team_ids: teamIds,
              requested_date: requestedDate,
              BeforeAcknowledgementReminderCount: currentReminderCount,
              BeforeAcknowledgementLastReminderSentAt: lastReminderSentAt,
              IsReminderEnabledBeforeAcknowledgement: isReminderEnabled,
              MaxReminderCountBeforeAcknowledgement: maxReminderCount,
              ReminderIntervalMinutesBeforeAcknowledgement:
                reminderIntervalMinutes,
              NotifyInitiatorIfNoResponseBeforeAcknowledgement: notifyInitiator,
              BeforeAcknowledgementNoResponseCount: noResponseCount,
              serviceUrl,
              user_tenant_id: tenantId,
              FIRST_RESPONDER,
              FIRST_RESPONDER_RESPONDED_AT,
            } = sos;
            const initiatorMessage = "";
            // Double-check reminder is enabled

            // Check if already responded (double-check)
            // const checkResponseQuery = `
            //   SELECT FIRST_RESPONDER, FIRST_RESPONDER_RESPONDED_AT, status
            //   FROM MSTeamsAssistance
            //   WHERE id = ${assistanceId}
            // `;
            //const currentState = await db.getDataFromDB(checkResponseQuery);
            if (
              FIRST_RESPONDER ||
              FIRST_RESPONDER_RESPONDED_AT ||
              status === "Closed"
            ) {
              log.addLog(
                `SOS ${assistanceId} already responded or closed, skipping`,
              );
              return;
            }

            // Check if max reminders reached
            const reminderCount = currentReminderCount || 0;
            if (reminderCount >= maxReminderCount) {
              // All reminders sent, check if we need to notify initiator
              if (notifyInitiator && !noResponseCount) {
                await sendInitiatorNotification(
                  assistanceId,
                  initiatorUserId,
                  initiatorMessage,
                  serviceUrl,
                  tenantId,
                  log,
                );
              }
              return;
            }

            // Check time interval
            const now = new Date();
            let timeToCheck = lastReminderSentAt
              ? new Date(lastReminderSentAt)
              : requestedDate
                ? new Date(requestedDate)
                : null;

            if (timeToCheck) {
              const diffMs = now - timeToCheck;
              const diffMins = Math.round(diffMs / 60000);

              if (diffMins < reminderIntervalMinutes) {
                log.addLog(
                  `SOS ${assistanceId}: Time interval not met (${diffMins} < ${reminderIntervalMinutes} mins), skipping`,
                );
                return;
              }
            }

            // Get initiator user info
            const initiatorQuery = `
              SELECT top 1 user_id, user_name, user_aadobject_id, DYNAMIC_LOCATION
              FROM MSTeamsTeamsUsers
              WHERE user_id = '${initiatorUserId}'
            `;
            const initiatorResult = await db.getDataFromDB(initiatorQuery);
            if (!initiatorResult || initiatorResult.length === 0) {
              log.addLog(`SOS ${assistanceId}: Initiator not found, skipping`);
              return;
            }
            const initiatorUser = initiatorResult[0];

            // Parse sent_to_ids to get responder user_ids
            const responderIds = sentToIds
              ? sentToIds
                  .split(",")
                  .map((id) => id.trim())
                  .filter((id) => id)
              : [];

            if (responderIds.length === 0) {
              log.addLog(`SOS ${assistanceId}: No responders found, skipping`);
              return;
            }

            // Get responder user info
            const responderIdsStr = responderIds
              .map((id) => `'${id}'`)
              .join(",");
            const responderQuery = `
              

                WITH DistinctUsers AS (
    SELECT DISTINCT
        user_id,
        user_name,
        user_aadobject_id
    FROM MSTeamsTeamsUsers
    WHERE user_id IN (${responderIdsStr})
)

SELECT
    u.user_id,
    u.user_name,
    u.user_aadobject_id,
    t.serviceUrl,
    t.user_tenant_id
FROM DistinctUsers u

OUTER APPLY (
    SELECT TOP 1
        t.serviceUrl,
        t.user_tenant_id
    FROM MSTeamsTeamsUsers tu
    INNER JOIN MSTeamsInstallationDetails t
        ON t.team_id = tu.team_id
        AND t.uninstallation_date IS NULL
    WHERE tu.user_id = u.user_id
      AND t.serviceUrl IS NOT NULL
      AND t.user_tenant_id IS NOT NULL
    ORDER BY t.team_id   -- or priority / created date
) t

WHERE t.serviceUrl IS NOT NULL
  AND t.user_tenant_id IS NOT NULL;
            `;
            const responders = await db.getDataFromDB(responderQuery);

            if (!responders || responders.length === 0) {
              log.addLog(
                `SOS ${assistanceId}: No valid responders found, skipping`,
              );
              return;
            }

            // Send reminder to all responders
            log.addLog(
              `SOS ${assistanceId}: Sending reminder ${reminderCount + 1}/${maxReminderCount}`,
            );

            const Ulocation = initiatorUser.DYNAMIC_LOCATION
              ? `📍${initiatorUser.DYNAMIC_LOCATION}`
              : "";

            const mentionUserEntities = [];
            dashboard.mentionUser(
              mentionUserEntities,
              initiatorUser.user_id,
              initiatorUser.user_name,
            );

            const reminderCard = {
              $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
              appId: process.env.MicrosoftAppId,
              body: [
                {
                  type: "TextBlock",
                  text: `**<at>${initiatorUser.user_name}</at>** needs assistance.\n
                  ${Ulocation}`,
                  wrap: true,
                },
                {
                  type: "ActionSet",
                  actions: [
                    {
                      type: "Action.Execute",
                      title: "Accept and respond",
                      verb: "respond_to_assistance",
                      data: {
                        userAadObjId: initiatorUser.user_aadobject_id,
                        requestAssistanceid: assistanceId,
                        tenantId: tenantId,
                        serviceUrl: serviceUrl,
                      },
                    },
                  ],
                },
              ],
              msteams: {
                entities: mentionUserEntities,
              },
              type: "AdaptiveCard",
              version: "1.4",
            };

            // Send to each responder
            for (const responder of responders) {
              try {
                const memberArr = [
                  {
                    id: responder.user_id,
                    name: responder.user_name,
                  },
                ];

                incidentService.saveAllTypeQuerylogs(
                  responder.user_aadobject_id,
                  "",
                  "SOS_TEAMS",
                  "",
                  assistanceId,
                  "SENDING",
                  "BeforeAcknowledgementReminder",
                  "",
                  "",
                  "",
                  "",
                  "",
                );

                await sendProactiveMessaageToUser(
                  memberArr,
                  reminderCard,
                  null,
                  responder.serviceUrl || serviceUrl,
                  responder.user_tenant_id || tenantId,
                  log,
                  initiatorUser.user_aadobject_id,
                );

                incidentService.saveAllTypeQuerylogs(
                  responder.user_aadobject_id,
                  "",
                  "SOS_TEAMS",
                  "",
                  assistanceId,
                  "SEND_SUCCESS",
                  "BeforeAcknowledgementReminder",
                  "",
                  "",
                  "",
                  "",
                  "",
                );
              } catch (err) {
                log.addLog(
                  `Error sending reminder to responder ${responder.user_id}: ${err.message}`,
                );
                incidentService.saveAllTypeQuerylogs(
                  responder.user_aadobject_id,
                  "",
                  "SOS_TEAMS",
                  "",
                  assistanceId,
                  "SEND_FAILED",
                  "BeforeAcknowledgementReminder",
                  "",
                  "",
                  "",
                  "",
                  String((err && err.message) || ""),
                );
              }
            }

            // Update reminder tracking
            const newReminderCount = reminderCount + 1;
            const updateQuery = `
              UPDATE MSTeamsAssistance 
              SET BeforeAcknowledgementReminderCount = ${newReminderCount},
                  BeforeAcknowledgementLastReminderSentAt = GETDATE(),
                  LastUpdatedDateTime = GETDATE()
              WHERE id = ${assistanceId}
            `;
            await db.updateDataIntoDB(updateQuery);

            log.addLog(
              `SOS ${assistanceId}: Reminder sent successfully (${newReminderCount}/${maxReminderCount})`,
            );

            // If this was the last reminder, check if we need to notify initiator
            // if (newReminderCount >= maxReminderCount && notifyInitiator) {
            //   await sendInitiatorNotification(
            //     assistanceId,
            //     initiatorUserId,
            //     initiatorMessage,
            //     serviceUrl,
            //     tenantId,
            //     log,
            //   );
            // }
          } catch (err) {
            log.addLog(`Error processing SOS ${sos.id}: ${err.message}`);
            processSafetyBotError(
              err,
              "",
              "",
              "",
              `error in SosBeforeAcknowledgementReminder job for SOS ${sos.id}`,
            );
          }
        }),
      );
    }
  } catch (err) {
    log.addLog(`Error in SosBeforeAcknowledgementReminder job: ${err.message}`);
    processSafetyBotError(
      err,
      "",
      "",
      "",
      "error in SosBeforeAcknowledgementReminder job",
    );
  } finally {
    if (saveLog) {
      await log.saveLog();
    }
  }

  // Helper function to send notification to initiator
  async function sendInitiatorNotification(
    assistanceId,
    initiatorUserId,
    customMessage,
    serviceUrl,
    tenantId,
    log,
  ) {
    try {
      // Check if already notified (to avoid duplicate notifications)
      const checkQuery = `
        SELECT BeforeAcknowledgementReminderCount, MaxReminderCountBeforeAcknowledgement
        FROM MSTeamsAssistance a
        INNER JOIN MSTeamsInstallationDetails t ON (
          t.team_id IN (SELECT value FROM STRING_SPLIT(a.team_ids, ',', 1))
        )
        WHERE a.id = ${assistanceId}
      `;
      const checkResult = await db.getDataFromDB(checkQuery);
      if (!checkResult || checkResult.length === 0) {
        return;
      }

      // Get initiator user info
      const initiatorQuery = `
        SELECT user_id, user_name, user_aadobject_id
        FROM MSTeamsTeamsUsers
        WHERE user_id = '${initiatorUserId}'
      `;
      const initiatorResult = await db.getDataFromDB(initiatorQuery);
      if (!initiatorResult || initiatorResult.length === 0) {
        return;
      }
      const initiatorUser = initiatorResult[0];

      // Use custom message if provided, otherwise use default
      const messageText =
        customMessage && customMessage.trim() !== ""
          ? customMessage
          : "We tried contacting SOS responders, but did not receive a response.\nIf you need immediate help, please contact local emergency services or your safety team.";

      const initiatorCard = {
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
        appId: process.env.MicrosoftAppId,
        body: [
          {
            type: "TextBlock",
            text: messageText,
            wrap: true,
          },
        ],
        type: "AdaptiveCard",
        version: "1.4",
      };

      const memberArr = [
        {
          id: initiatorUser.user_id,
          name: initiatorUser.user_name,
        },
      ];

      incidentService.saveAllTypeQuerylogs(
        initiatorUser.user_aadobject_id,
        "",
        "SOS_TEAMS",
        "",
        assistanceId,
        "SENDING",
        "InitiatorNoResponseNotification",
        "",
        "",
        "",
        "",
        "",
      );

      await sendProactiveMessaageToUser(
        memberArr,
        initiatorCard,
        null,
        serviceUrl,
        tenantId,
        log,
        initiatorUser.user_aadobject_id,
      );

      incidentService.saveAllTypeQuerylogs(
        initiatorUser.user_aadobject_id,
        "",
        "SOS_TEAMS",
        "",
        assistanceId,
        "SEND_SUCCESS",
        "InitiatorNoResponseNotification",
        "",
        "",
        "",
        "",
        "",
      );

      log.addLog(
        `SOS ${assistanceId}: Initiator notification sent successfully`,
      );
      const updateQuery = `
              UPDATE MSTeamsAssistance 
              SET BeforeAcknowledgementNoResponseCount =1,
                  LastUpdatedDateTime = GETDATE()
              WHERE id = ${assistanceId}
            `;
      await db.updateDataIntoDB(updateQuery);
    } catch (err) {
      log.addLog(
        `Error sending initiator notification for SOS ${assistanceId}: ${err.message}`,
      );
      processSafetyBotError(
        err,
        "",
        "",
        "",
        `error sending initiator notification for SOS ${assistanceId}`,
      );
    }
  }

  // signal to parent that the job is done
  if (parentPort) parentPort.postMessage("done");
  else process.exit(0);
})();
