/**
 * IPAWS CAP alert cache — stores recent feed alerts for fallback when live API is empty.
 */

const sql = require("mssql");
const poolPromise = require("../db/dbConn");

const ENSURE_IPAWS_ALERT_CACHE_TABLE_SQL = `
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'IpawsAlertCache')
BEGIN
    CREATE TABLE [dbo].[IpawsAlertCache] (
        [Id] INT IDENTITY(1,1) NOT NULL,
        [AlertId] NVARCHAR(256) NOT NULL,
        [SentAt] DATETIMEOFFSET NULL,
        [EffectiveAt] DATETIMEOFFSET NULL,
        [ExpiresAt] DATETIMEOFFSET NULL,
        [Headline] NVARCHAR(500) NULL,
        [Event] NVARCHAR(256) NULL,
        [Severity] NVARCHAR(100) NULL,
        [Description] NVARCHAR(MAX) NULL,
        [Instruction] NVARCHAR(MAX) NULL,
        [SenderName] NVARCHAR(512) NULL,
        [AreasJson] NVARCHAR(MAX) NULL,
        [ApiResponseJson] NVARCHAR(MAX) NULL,
        [FetchedAtUtc] DATETIME2 NOT NULL CONSTRAINT [DF_IpawsAlertCache_FetchedAtUtc] DEFAULT SYSUTCDATETIME(),
        [UpdatedAtUtc] DATETIME2 NOT NULL CONSTRAINT [DF_IpawsAlertCache_UpdatedAtUtc] DEFAULT SYSUTCDATETIME(),
        CONSTRAINT [PK_IpawsAlertCache] PRIMARY KEY CLUSTERED ([Id])
    );
    CREATE UNIQUE NONCLUSTERED INDEX [UX_IpawsAlertCache_AlertId]
        ON [dbo].[IpawsAlertCache] ([AlertId]);
    CREATE NONCLUSTERED INDEX [IX_IpawsAlertCache_ExpiresAt]
        ON [dbo].[IpawsAlertCache] ([ExpiresAt]);
END
`;

/**
 * Ensure IpawsAlertCache exists.
 * @returns {Promise<void>}
 */
async function ensureIpawsAlertCacheTable() {
  const pool = await poolPromise;
  await pool.request().query(ENSURE_IPAWS_ALERT_CACHE_TABLE_SQL);
}

/**
 * Parse CAP date string to Date or null.
 * @param {string|null|undefined} value
 * @returns {Date|null}
 */
function parseCapDate(value) {
  if (value == null || String(value).trim() === "") return null;
  const d = new Date(String(value).trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Upsert normalized IPAWS alerts into IpawsAlertCache by AlertId.
 * @param {object[]} alerts
 * @param {Date} [fetchedAt]
 * @returns {Promise<number>} upserted count
 */
async function upsertIpawsAlerts(alerts, fetchedAt = new Date()) {
  await ensureIpawsAlertCacheTable();
  const list = Array.isArray(alerts) ? alerts : [];
  if (list.length === 0) return 0;

  const pool = await poolPromise;
  let count = 0;

  for (const alert of list) {
    const alertId = String(alert?.id || "").trim();
    if (!alertId) continue;

    const areasJson = JSON.stringify(
      Array.isArray(alert.areas) ? alert.areas : [],
    );
    const apiJson = JSON.stringify(alert);

    await pool
      .request()
      .input("AlertId", sql.NVarChar(256), alertId)
      .input("SentAt", sql.DateTimeOffset, parseCapDate(alert.sent || alert.pubDate))
      .input(
        "EffectiveAt",
        sql.DateTimeOffset,
        parseCapDate(alert.effective || alert.onset || alert.sent),
      )
      .input("ExpiresAt", sql.DateTimeOffset, parseCapDate(alert.expires))
      .input(
        "Headline",
        sql.NVarChar(500),
        alert.title ? String(alert.title).slice(0, 500) : null,
      )
      .input(
        "Event",
        sql.NVarChar(256),
        alert.event ? String(alert.event).slice(0, 256) : null,
      )
      .input(
        "Severity",
        sql.NVarChar(100),
        alert.severity ? String(alert.severity).slice(0, 100) : null,
      )
      .input(
        "Description",
        sql.NVarChar(sql.MAX),
        alert.description != null ? String(alert.description) : null,
      )
      .input(
        "Instruction",
        sql.NVarChar(sql.MAX),
        alert.instruction != null ? String(alert.instruction) : null,
      )
      .input(
        "SenderName",
        sql.NVarChar(512),
        alert.senderName || alert.source
          ? String(alert.senderName || alert.source).slice(0, 512)
          : null,
      )
      .input("AreasJson", sql.NVarChar(sql.MAX), areasJson)
      .input("ApiResponseJson", sql.NVarChar(sql.MAX), apiJson)
      .input("FetchedAtUtc", sql.DateTime2, fetchedAt)
      .query(`
        MERGE [dbo].[IpawsAlertCache] AS t
        USING (SELECT @AlertId AS AlertId) AS s
          ON t.AlertId = s.AlertId
        WHEN MATCHED THEN UPDATE SET
          SentAt = @SentAt,
          EffectiveAt = @EffectiveAt,
          ExpiresAt = @ExpiresAt,
          Headline = @Headline,
          [Event] = @Event,
          Severity = @Severity,
          Description = @Description,
          Instruction = @Instruction,
          SenderName = @SenderName,
          AreasJson = @AreasJson,
          ApiResponseJson = @ApiResponseJson,
          FetchedAtUtc = @FetchedAtUtc,
          UpdatedAtUtc = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN INSERT (
          AlertId, SentAt, EffectiveAt, ExpiresAt,
          Headline, [Event], Severity, Description, Instruction, SenderName,
          AreasJson, ApiResponseJson, FetchedAtUtc, UpdatedAtUtc
        ) VALUES (
          @AlertId, @SentAt, @EffectiveAt, @ExpiresAt,
          @Headline, @Event, @Severity, @Description, @Instruction, @SenderName,
          @AreasJson, @ApiResponseJson, @FetchedAtUtc, SYSUTCDATETIME()
        );
      `);
    count++;
  }

  return count;
}

/**
 * Load non-expired cached alerts as normalized objects.
 * @param {Date} [now]
 * @returns {Promise<object[]>}
 */
async function getActiveIpawsAlerts(now = new Date()) {
  await ensureIpawsAlertCacheTable();
  const pool = await poolPromise;
  const result = await pool
    .request()
    .input("Now", sql.DateTimeOffset, now)
    .query(`
      SELECT AlertId, AreasJson, ApiResponseJson, ExpiresAt
      FROM [dbo].[IpawsAlertCache]
      WHERE ExpiresAt IS NULL OR ExpiresAt > @Now
      ORDER BY SentAt DESC, Id DESC
    `);

  const out = [];
  for (const row of result.recordset || []) {
    let alert = null;
    if (row.ApiResponseJson) {
      try {
        alert = JSON.parse(row.ApiResponseJson);
      } catch {
        alert = null;
      }
    }
    if (!alert || typeof alert !== "object") {
      alert = {
        id: row.AlertId,
        areas: [],
      };
      if (row.AreasJson) {
        try {
          alert.areas = JSON.parse(row.AreasJson);
        } catch {
          alert.areas = [];
        }
      }
    }
    if (!Array.isArray(alert.areas) && row.AreasJson) {
      try {
        alert.areas = JSON.parse(row.AreasJson);
      } catch {
        /* keep existing */
      }
    }
    out.push(alert);
  }
  return out;
}

module.exports = {
  ensureIpawsAlertCacheTable,
  upsertIpawsAlerts,
  getActiveIpawsAlerts,
};
