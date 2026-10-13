const sql = require("mssql");
const { executeWithRetry } = require("./index");
const { processSafetyBotError } = require("../models/processError");

// Buffers per-member send results and writes them to the DB in bulk.
// One flush = one parameterised batch (JSON payload) that:
//   - updates/inserts the member delivery status (MSTeamsMemberResponses, or
//     MSTeamsMemberResponsesRecurr for a recurring run)
//   - caches newly created conversation ids
//   - flags users that blocked the bot
//   - writes one MessageActivityLog row per member with the final outcome
// Flushes run one at a time per writer so a single send never floods the DB.

const DEFAULT_MAX_BATCH = 100;
const DEFAULT_FLUSH_DELAY_MS = 3000;

const ROWS_TABLE = `
  DECLARE @rows TABLE (
    userId varchar(255), userName nvarchar(255), aad varchar(255), mrId int,
    delivered bit, status int, err nvarchar(max), convId varchar(512),
    activityId varchar(512), newConv bit, blocked bit, logStatus varchar(50),
    eventTime varchar(50)
  );
  INSERT INTO @rows
  SELECT userId, userName, aad, mrId, delivered, status, err, convId,
         activityId, newConv, blocked, logStatus, eventTime
  FROM OPENJSON(@json) WITH (
    userId varchar(255) '$.u', userName nvarchar(255) '$.n', aad varchar(255) '$.a',
    mrId int '$.m', delivered bit '$.d', status int '$.s', err nvarchar(max) '$.e',
    convId varchar(512) '$.c', activityId varchar(512) '$.ac', newConv bit '$.nc',
    blocked bit '$.b', logStatus varchar(50) '$.ls', eventTime varchar(50) '$.t'
  );`;

// LEFT(err, n) where n fits the target column, so a long error message can
// never fail the whole batch with a truncation error.
const errLenSql = (table, column, variable) => `
  DECLARE ${variable} int = COL_LENGTH('${table}', '${column}');
  SET ${variable} = CASE WHEN ${variable} IS NULL OR ${variable} = -1 THEN 4000 ELSE ${variable} / 2 END;`;

const oneTimeStatusSql = `
  ${errLenSql("dbo.MSTeamsMemberResponses", "message_delivery_error", "@errLen")}
  UPDATE r SET
    is_message_delivered = j.delivered,
    message_delivery_status = j.status,
    message_delivery_error = LEFT(j.err, @errLen),
    LastReminderSentAT = CASE WHEN j.delivered = 1 THEN GETDATE() ELSE NULL END
  FROM MSTeamsMemberResponses r
  INNER JOIN @rows j ON r.user_id = j.userId
  WHERE r.inc_id = @incId;

  INSERT INTO MSTeamsMemberResponses (inc_id, user_id, user_name, is_message_delivered,
    response, response_value, comment, [timestamp], message_delivery_status,
    message_delivery_error, LastReminderSentAT)
  SELECT @incId, j.userId, ISNULL(j.userName, ''), j.delivered, 0, NULL, NULL, NULL,
    j.status, LEFT(j.err, @errLen), CASE WHEN j.delivered = 1 THEN GETDATE() ELSE NULL END
  FROM @rows j
  WHERE NOT EXISTS (SELECT 1 FROM MSTeamsMemberResponses r
                    WHERE r.inc_id = @incId AND r.user_id = j.userId);`;

const recurringStatusSql = `
  ${errLenSql("dbo.MSTeamsMemberResponsesRecurr", "message_delivery_error", "@errLen")}
  UPDATE rr SET
    is_message_delivered = j.delivered,
    conversationId = COALESCE(j.convId, rr.conversationId),
    activityId = COALESCE(j.activityId, rr.activityId),
    message_delivery_status = j.status,
    message_delivery_error = LEFT(j.err, @errLen),
    LastReminderSentAT = CASE WHEN j.delivered = 1 THEN GETDATE() ELSE NULL END
  FROM MSTeamsMemberResponsesRecurr rr
  INNER JOIN @rows j ON rr.memberResponsesId = j.mrId
  WHERE rr.runAt = @runAt;

  INSERT INTO MSTeamsMemberResponsesRecurr (memberResponsesId, runAt, is_message_delivered,
    response, response_value, comment, conversationId, activityId, message_delivery_status,
    message_delivery_error, LastReminderSentAT, response_via)
  SELECT j.mrId, @runAt, j.delivered, 0, NULL, NULL, j.convId, j.activityId, j.status,
    LEFT(j.err, @errLen), CASE WHEN j.delivered = 1 THEN GETDATE() ELSE NULL END, 'TEAMS'
  FROM @rows j
  WHERE j.mrId IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM MSTeamsMemberResponsesRecurr rr
                    WHERE rr.memberResponsesId = j.mrId AND rr.runAt = @runAt);`;

const usersSql = `
  UPDATE u SET conversationId = j.convId
  FROM MSTeamsTeamsUsers u
  INNER JOIN @rows j ON u.user_id = j.userId
  WHERE j.newConv = 1 AND j.convId IS NOT NULL;

  UPDATE u SET BotBlockedByUser = 1
  FROM MSTeamsTeamsUsers u
  INNER JOIN @rows j ON u.user_id = j.userId
  WHERE j.blocked = 1;`;

const activityLogSql = `
  ${errLenSql("dbo.MessageActivityLog", "FailureReason", "@logErrLen")}
  INSERT INTO MessageActivityLog (UserId, MessageSentVia, RecipientContact, IncidentId,
    DeliveryStatus, MessageType, MessageContent, UserResponse, FailureReason,
    EventDateTime, LogEntryCreatedAt, NOTIFICATION_CHARGES)
  SELECT ISNULL(j.aad, ''), 'TEAMS', '', @incIdText, j.logStatus, @messageType,
    @messageContent, '', LEFT(ISNULL(j.err, ''), @logErrLen), j.eventTime, GETDATE(), ''
  FROM @rows j
  WHERE j.logStatus IS NOT NULL;`;

const buildBatchSql = (isRecurring, includeExtras) => `
  SET XACT_ABORT ON;
  ${ROWS_TABLE}
  BEGIN TRAN;
  ${isRecurring ? recurringStatusSql : oneTimeStatusSql}
  ${includeExtras ? usersSql : ""}
  ${includeExtras ? activityLogSql : ""}
  COMMIT TRAN;`;

const toRow = (r) => ({
  u: r.userId != null ? String(r.userId) : null,
  n: r.userName ?? null,
  a: r.userAadObjId ?? null,
  m: r.memberResponsesId != null ? Number(r.memberResponsesId) : null,
  d: r.delivered ? 1 : 0,
  s: r.status != null && !isNaN(Number(r.status)) ? Number(r.status) : null,
  e: r.error ? String(r.error) : null,
  c: r.conversationId && r.conversationId !== "null" ? String(r.conversationId) : null,
  ac: r.activityId && r.activityId !== "null" ? String(r.activityId) : null,
  nc: r.newConversation ? 1 : 0,
  b: r.blocked ? 1 : 0,
  ls: r.logStatus || null,
  t: new Date().toISOString().slice(0, -1),
});

class DeliveryStatusWriter {
  constructor({
    incId,
    runAt = null,
    messageType = "",
    messageContent = "",
    userAadObjId = "",
    maxBatch = DEFAULT_MAX_BATCH,
    flushDelayMs = DEFAULT_FLUSH_DELAY_MS,
  }) {
    this.incId = Number(incId);
    this.runAt = runAt;
    this.isRecurring = runAt != null;
    this.messageType = messageType || "";
    this.messageContent = messageContent || "";
    this.userAadObjId = userAadObjId;
    this.maxBatch = maxBatch;
    this.flushDelayMs = flushDelayMs;
    this.buffer = new Map(); // key -> row; the latest result per member wins
    this.timer = null;
    this.chain = Promise.resolve();
    this.stats = { rowsWritten: 0, batches: 0, failedRows: 0 };
  }

  add(result) {
    const key = this.isRecurring
      ? `m:${result.memberResponsesId}`
      : `u:${result.userId}`;
    const row = toRow(result);
    const previous = this.buffer.get(key);
    if (previous?.nc === 1 && row.nc !== 1) {
      // keep the "cache this new conversation id" flag from an earlier attempt
      row.nc = 1;
      row.c = row.c || previous.c;
    }
    this.buffer.set(key, row);
    if (this.buffer.size >= this.maxBatch) {
      this.flush();
    } else if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), this.flushDelayMs);
    }
  }

  // Queues the current buffer for writing; resolves once it is written.
  flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.buffer.size === 0) return this.chain;
    const rows = [...this.buffer.values()];
    this.buffer.clear();
    this.chain = this.chain.then(() => this.write(rows));
    return this.chain;
  }

  // Writes everything still buffered and waits for all pending writes.
  async close() {
    await this.flush();
    await this.chain;
    return this.stats;
  }

  async write(rows) {
    const inputs = {
      json: { type: sql.NVarChar(sql.MAX), value: JSON.stringify(rows) },
      incId: { type: sql.Int, value: this.incId },
      incIdText: { type: sql.NVarChar(50), value: String(this.incId) },
      runAt: { type: sql.VarChar(100), value: this.runAt },
      messageType: { type: sql.NVarChar(100), value: this.messageType },
      messageContent: { type: sql.NVarChar(sql.MAX), value: this.messageContent },
    };
    const label = `DeliveryStatusWriter inc=${this.incId}${this.isRecurring ? ` runAt=${this.runAt}` : ""}`;
    try {
      await executeWithRetry(buildBatchSql(this.isRecurring, true), inputs, { label });
      this.stats.rowsWritten += rows.length;
      this.stats.batches += 1;
      return;
    } catch (err) {
      console.error(`[${label}] full batch failed, retrying status-only:`, err?.message || err);
      processSafetyBotError(
        err,
        "",
        "",
        this.userAadObjId,
        `error in ${label} full batch (rows=${rows.length})`,
      );
    }
    // Delivery status is the critical part: retry it without the extras
    // (activity log / user updates) so a problem there can't block it.
    try {
      await executeWithRetry(buildBatchSql(this.isRecurring, false), inputs, {
        label: `${label} status-only`,
      });
      this.stats.rowsWritten += rows.length;
      this.stats.batches += 1;
    } catch (err) {
      this.stats.failedRows += rows.length;
      console.error(`[${label}] status-only batch failed:`, err?.message || err);
      processSafetyBotError(
        err,
        "",
        "",
        this.userAadObjId,
        `error in ${label} status-only batch, rows=${JSON.stringify(rows.map((r) => r.u))}`,
      );
    }
  }
}

module.exports = { DeliveryStatusWriter };
