const { parentPort } = require("worker_threads");
const db = require("../db");
const incidentService = require("../services/incidentService");
const moment = require("moment-timezone");
const { AYSLog } = require("../utils/log");
const { sendProactiveMessaageToUser } = require("../api/apiMethods");
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
      `SosAfterAcknowledgementReminder job : currentDateTime - ${currentDateTime}`,
    );
    console.log(
      "SosAfterAcknowledgementReminder job : currentDateTime - " +
        currentDateTime,
    );

    // Query SOS requests that need after-acknowledgement follow-ups
    // Conditions:
    // - FIRST_RESPONDER IS NOT NULL
    // - FIRST_RESPONDER_RESPONDED_AT IS NOT NULL
    // - AfterAcknowledgementResponseStatus IS NULL
    // - status is not 'Closed'
    // - AfterAcknowledgementReminderCount < MaxReminderCountAfterAcknowledgement
    // - Time interval met since last reminder
    const sosQuery = `
     SELECT 
    a.id,
    a.user_id,
    u.user_name,
    a.sent_to_ids,
    a.sent_to_names,
    a.status,
    a.team_ids,
    a.FIRST_RESPONDER,
    a.FIRST_RESPONDER_RESPONDED_AT,
    a.AfterAcknowledgementReminderCount,
    a.AfterAcknowledgementLastReminderSentAt,
    a.AfterAcknowledgementResponseStatus,
    a.AfterAcknowledgementNoResponseCount,
    a.LastUpdatedDateTime,

    t.MaxReminderCountAfterAcknowledgement,
    t.ReminderIntervalMinutesAfterAcknowledgement,
    t.NotifyInitiatorAndResponderIfNoResponseAfterAcknowledgement,
    t.NotifyNoResponseAfterAcknowledgementMessage,
    t.serviceUrl,
    t.user_tenant_id

FROM MSTeamsAssistance a

-- ✅ SOS initiator name (single row)
OUTER APPLY (
    SELECT TOP 1 user_name
    FROM MSTeamsTeamsUsers
    WHERE user_id = a.user_id
) u

-- ✅ ONE eligible team config (single row)
OUTER APPLY (
    SELECT TOP 1 t.*
    FROM MSTeamsTeamsUsers tu
    INNER JOIN MSTeamsInstallationDetails t
        ON t.team_id = tu.team_id
        AND t.uninstallation_date IS NULL
    WHERE tu.user_id = a.user_id
      AND t.IsReminderEnabledBeforeAcknowledgement = 1   -- REQUIRED by you
      AND t.MaxReminderCountAfterAcknowledgement > 0     -- after-ack config exists
    ORDER BY t.team_id
) t

WHERE 
    a.LastUpdatedDateTime >= '2026-02-26 00:00:00'   -- ✅ after 25 Feb
    AND a.FIRST_RESPONDER IS NOT NULL
    AND a.FIRST_RESPONDER_RESPONDED_AT IS NOT NULL
    AND a.AfterAcknowledgementResponseStatus IS NULL
    and a.AfterAcknowledgementNoResponseCount IS NULL
    AND (a.status IS NULL OR a.status <> 'Closed')
    AND t.team_id IS NOT NULL
    
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
              user_name: initiatorUserName,
              sent_to_ids: sentToIds,
              status,
              FIRST_RESPONDER: firstResponderAadObjId,
              FIRST_RESPONDER_RESPONDED_AT: firstResponderRespondedAt,
              AfterAcknowledgementReminderCount: currentReminderCount,
              AfterAcknowledgementLastReminderSentAt: lastReminderSentAt,
              AfterAcknowledgementResponseStatus: responseStatus,
              MaxReminderCountAfterAcknowledgement: maxReminderCount,
              ReminderIntervalMinutesAfterAcknowledgement:
                reminderIntervalMinutes,
              NotifyInitiatorAndResponderIfNoResponseAfterAcknowledgement:
                notifyAllResponders,
              serviceUrl,
              user_tenant_id: tenantId,
              AfterAcknowledgementNoResponseCount: noResponseCount,
              NotifyNoResponseAfterAcknowledgementMessage: initiatorMessage,
            } = sos;

            // Double-check response status hasn't been set
            if (responseStatus) {
              log.addLog(
                `SOS ${assistanceId} already has response status ${responseStatus}, skipping`,
              );
              return;
            }

            // Check if already responded or closed (double-check)
            if (
              !firstResponderAadObjId ||
              !firstResponderRespondedAt ||
              status === "Closed"
            ) {
              log.addLog(
                `SOS ${assistanceId} not eligible for after-acknowledgement follow-ups, skipping`,
              );
              return;
            }

            // Check if max reminders reached
            const reminderCount = currentReminderCount || 0;
            if (reminderCount >= maxReminderCount) {
              // All reminders sent, check if we need to escalate
              if (notifyAllResponders && !noResponseCount) {
                await sendEscalationToAllResponders(
                  assistanceId,
                  initiatorUserId,
                  initiatorUserName,
                  sentToIds,
                  serviceUrl,
                  tenantId,
                  log,
                  initiatorMessage,
                );
              }
              return;
            }

            // Check time interval
            const now = new Date();
            let timeToCheck = lastReminderSentAt
              ? new Date(lastReminderSentAt)
              : firstResponderRespondedAt
                ? new Date(firstResponderRespondedAt)
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
              SELECT TOP 1 user_id, user_name, user_aadobject_id
              FROM MSTeamsTeamsUsers
              WHERE user_id = '${initiatorUserId}'
            `;
            const initiatorResult = await db.getDataFromDB(initiatorQuery);
            if (!initiatorResult || initiatorResult.length === 0) {
              log.addLog(`SOS ${assistanceId}: Initiator not found, skipping`);
              return;
            }
            const initiatorUser = initiatorResult[0];

            // Get FIRST_RESPONDER user info
            const firstResponderQuery = `
              SELECT TOP 1 user_id, user_name, user_aadobject_id
              FROM MSTeamsTeamsUsers
              WHERE user_aadobject_id = '${firstResponderAadObjId}'
            `;
            const firstResponderResult =
              await db.getDataFromDB(firstResponderQuery);
            if (!firstResponderResult || firstResponderResult.length === 0) {
              log.addLog(
                `SOS ${assistanceId}: First responder not found, skipping`,
              );
              return;
            }
            const firstResponderUser = firstResponderResult[0];

            // Send follow-up to both initiator and FIRST_RESPONDER
            log.addLog(
              `SOS ${assistanceId}: Sending after-acknowledgement reminder ${reminderCount + 1}/${maxReminderCount}`,
            );

            const mentionUserEntities = [];
            dashboard.mentionUser(
              mentionUserEntities,
              initiatorUser.user_id,
              initiatorUser.user_name,
            );

            const followUpCard = {
              $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
              appId: process.env.MicrosoftAppId,
              body: [
                {
                  type: "TextBlock",
                  text: `Has the SOS initiated by **<at>${initiatorUser.user_name}</at>** been resolved? Please confirm the current status.`,
                  wrap: true,
                },
                {
                  type: "ActionSet",
                  actions: [
                    {
                      type: "Action.Execute",
                      title: "User is safe",
                      verb: "after_acknowledgement_response",
                      data: {
                        assistanceId: assistanceId,
                        responseType: "SAFE",
                        userAadObjId: initiatorUser.user_aadobject_id,
                      },
                    },
                    {
                      type: "Action.Execute",
                      title: "Additional Help Needed",
                      verb: "after_acknowledgement_response",
                      data: {
                        assistanceId: assistanceId,
                        responseType: "Additional_Help",
                        userAadObjId: initiatorUser.user_aadobject_id,
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

            // Send to FIRST_RESPONDER
            try {
              const firstResponderMemberArr = [
                {
                  id: firstResponderUser.user_id,
                  name: firstResponderUser.user_name,
                },
              ];

              incidentService.saveAllTypeQuerylogs(
                firstResponderUser.user_aadobject_id,
                "",
                "SOS_TEAMS",
                "",
                assistanceId,
                "SENDING",
                "AfterAcknowledgementReminder",
                "",
                "",
                "",
                "",
                "",
              );

              await sendProactiveMessaageToUser(
                firstResponderMemberArr,
                followUpCard,
                null,
                serviceUrl,
                tenantId,
                log,
                firstResponderUser.user_aadobject_id,
              );

              incidentService.saveAllTypeQuerylogs(
                firstResponderUser.user_aadobject_id,
                "",
                "SOS_TEAMS",
                "",
                assistanceId,
                "SEND_SUCCESS",
                "AfterAcknowledgementReminder",
                "",
                "",
                "",
                "",
                "",
              );
            } catch (err) {
              log.addLog(
                `Error sending reminder to first responder ${firstResponderUser.user_id}: ${err.message}`,
              );
              incidentService.saveAllTypeQuerylogs(
                firstResponderUser.user_aadobject_id,
                "",
                "SOS_TEAMS",
                "",
                assistanceId,
                "SEND_FAILED",
                "AfterAcknowledgementReminder",
                "",
                "",
                "",
                "",
                String((err && err.message) || ""),
              );
            }

            // Update reminder tracking
            const newReminderCount = reminderCount + 1;
            const updateQuery = `
              UPDATE MSTeamsAssistance 
              SET AfterAcknowledgementReminderCount = ${newReminderCount},
                  AfterAcknowledgementLastReminderSentAt = GETDATE(),
                  LastUpdatedDateTime = GETDATE()
              WHERE id = ${assistanceId}
            `;
            await db.updateDataIntoDB(updateQuery);

            log.addLog(
              `SOS ${assistanceId}: After-acknowledgement reminder sent successfully (${newReminderCount}/${maxReminderCount})`,
            );

            // If this was the last reminder, check if we need to escalate
            if (newReminderCount >= maxReminderCount && notifyAllResponders) {
              await sendEscalationToAllResponders(
                assistanceId,
                initiatorUserId,
                initiatorUser.user_name,
                sentToIds,
                serviceUrl,
                tenantId,
                log,
              );
            }
          } catch (err) {
            log.addLog(`Error processing SOS ${sos.id}: ${err.message}`);
            processSafetyBotError(
              err,
              "",
              "",
              "",
              `error in SosAfterAcknowledgementReminder job for SOS ${sos.id}`,
            );
          }
        }),
      );
    }
  } catch (err) {
    log.addLog(`Error in SosAfterAcknowledgementReminder job: ${err.message}`);
    processSafetyBotError(
      err,
      "",
      "",
      "",
      "error in SosAfterAcknowledgementReminder job",
    );
  } finally {
    if (saveLog) {
      await log.saveLog();
    }
  }

  // Helper function to send escalation message to all responders
  async function sendEscalationToAllResponders(
    assistanceId,
    initiatorUserId,
    initiatorUserName,
    sentToIds,
    serviceUrl,
    tenantId,
    log,
    initiatorMessage,
  ) {
    try {
      // Check if already escalated (to avoid duplicate notifications)
      const checkQuery = `
        SELECT AfterAcknowledgementResponseStatus
        FROM MSTeamsAssistance
        WHERE id = ${assistanceId}
      `;
      const checkResult = await db.getDataFromDB(checkQuery);
      if (
        !checkResult ||
        checkResult.length === 0 ||
        checkResult[0].AfterAcknowledgementResponseStatus
      ) {
        return;
      }

      // Parse sent_to_ids to get responder user_ids
      const responderIds = sentToIds
        ? sentToIds
            .split(",")
            .map((id) => id.trim())
            .filter((id) => id)
        : [];

      if (responderIds.length === 0) {
        log.addLog(`SOS ${assistanceId}: No responders found for escalation`);
        return;
      }

      // Get responder user info
      const responderIdsStr = responderIds.map((id) => `'${id}'`).join(",");
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
          ORDER BY t.team_id
        ) t
        WHERE t.serviceUrl IS NOT NULL
          AND t.user_tenant_id IS NOT NULL
      `;
      const responders = await db.getDataFromDB(responderQuery);

      if (!responders || responders.length === 0) {
        log.addLog(
          `SOS ${assistanceId}: No valid responders found for escalation`,
        );
        return;
      }
      const escalationMessage =
        initiatorMessage && initiatorMessage.trim() !== ""
          ? initiatorMessage
          : "No confirmation has been received that the user is safe.\nAdditional assistance may be required.";

      const escalationCard = {
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
        appId: process.env.MicrosoftAppId,
        body: [
          {
            type: "TextBlock",
            text: escalationMessage,
            wrap: true,
          },
        ],
        type: "AdaptiveCard",
        version: "1.4",
      };

      // Send to all responders
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
            "AfterAcknowledgementEscalation",
            "",
            "",
            "",
            "",
            "",
          );

          await sendProactiveMessaageToUser(
            memberArr,
            escalationCard,
            null,
            responder.serviceUrl || serviceUrl,
            responder.user_tenant_id || tenantId,
            log,
            responder.user_aadobject_id,
          );

          incidentService.saveAllTypeQuerylogs(
            responder.user_aadobject_id,
            "",
            "SOS_TEAMS",
            "",
            assistanceId,
            "SEND_SUCCESS",
            "AfterAcknowledgementEscalation",
            "",
            "",
            "",
            "",
            "",
          );
        } catch (err) {
          log.addLog(
            `Error sending escalation to responder ${responder.user_id}: ${err.message}`,
          );
          incidentService.saveAllTypeQuerylogs(
            responder.user_aadobject_id,
            "",
            "SOS_TEAMS",
            "",
            assistanceId,
            "SEND_FAILED",
            "AfterAcknowledgementEscalation",
            "",
            "",
            "",
            "",
            String((err && err.message) || ""),
          );
        }
      }

      log.addLog(
        `SOS ${assistanceId}: Escalation message sent to all responders`,
      );
      const updateQuery = `
              UPDATE MSTeamsAssistance 
              SET AfterAcknowledgementNoResponseCount =1,
                  LastUpdatedDateTime = GETDATE()
              WHERE id = ${assistanceId}
            `;
      await db.updateDataIntoDB(updateQuery);
    } catch (err) {
      log.addLog(
        `Error sending escalation for SOS ${assistanceId}: ${err.message}`,
      );
      processSafetyBotError(
        err,
        "",
        "",
        "",
        `error sending escalation for SOS ${assistanceId}`,
      );
    }
  }

  // signal to parent that the job is done
  if (parentPort) parentPort.postMessage("done");
  else process.exit(0);
})();
