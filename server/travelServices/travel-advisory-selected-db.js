/**
 * DB helpers for travel advisory selected countries (3-table schema):
 * - Table 1: TravelAdvisorySelection (UI selected countries)
 * - Table 2: TravelAdvisoryDetail (saved advisory per selection)
 * - Table 3: TravelAdvisoryChangeLog (change tracking)
 *
 * This module keeps the JS API shape stable (e.g. TravelAdvisorySelectedCountriesId)
 * while targeting the new table/column names in SQL.
 */

const sql = require("mssql");
const poolPromise = require("../db/dbConn");

/**
 * Get all countries from Countries table (for dropdowns).
 * @returns {Promise<Array<{ id, name, code }>>}
 */
async function getCountriesFromDb() {
  const pool = await poolPromise;
  const result = await pool
    .request()
    .query("SELECT id, name, code FROM Countries ORDER BY name");
  return result.recordset || [];
}

/**
 * Get all countries from Countries table with full row (id, name, code, level, created_at).
 * @returns {Promise<Array<{ id, name, code, level, created_at }>>}
 */
async function getAllCountriesFromDb() {
  const pool = await poolPromise;
  const result = await pool
    .request()
    .query("SELECT * FROM Countries ORDER BY name");
  return result.recordset || [];
}

/**
 * Get CountryId from Countries by code (for resolving countryCode to countryId).
 * @param {string} code - Country code (e.g. 'US')
 * @returns {Promise<number|null>}
 */
async function getCountryIdByCode(code) {
  if (!code || !String(code).trim()) return null;
  const pool = await poolPromise;
  const result = await pool
    .request()
    .input("code", sql.VarChar(10), String(code).toUpperCase().trim())
    .query(
      "SELECT id FROM Countries WHERE UPPER(LTRIM(RTRIM(code))) = UPPER(LTRIM(RTRIM(@code)))",
    );
  const rows = result.recordset || [];
  return rows.length ? rows[0].id : null;
}

const ENSURE_TRAVEL_ADVISORY_SELECTION_TABLE_SQL = `
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'TravelAdvisorySelection')
BEGIN
    CREATE TABLE [dbo].[TravelAdvisorySelection] (
        [Id] INT IDENTITY(1,1) NOT NULL,
        [TenantId] NVARCHAR(256) NOT NULL,
        [TeamId] NVARCHAR(256) NOT NULL,
        [CountryId] INT NOT NULL,
        [AdvisoryType] NVARCHAR(50) NOT NULL,
        [IsActive] BIT NOT NULL DEFAULT 1,
        [CreatedByUserId] NVARCHAR(256) NOT NULL,
        [CreatedAtUtc] DATETIME NOT NULL DEFAULT GETUTCDATE(),
        [UpdatedByUserId] NVARCHAR(256) NULL,
        [UpdatedAtUtc] DATETIME NULL,
        CONSTRAINT [PK_TravelAdvisorySelection] PRIMARY KEY CLUSTERED ([Id]),
        CONSTRAINT [FK_TravelAdvisorySelection_Country] FOREIGN KEY ([CountryId]) REFERENCES [dbo].[Countries] ([Id])
    );
    CREATE UNIQUE NONCLUSTERED INDEX [UX_TravelAdvisorySelection_Tenant_Team_Country_Type]
        ON [dbo].[TravelAdvisorySelection] ([TenantId], [TeamId], [CountryId], [AdvisoryType]);
    CREATE NONCLUSTERED INDEX [IX_TravelAdvisorySelection_Tenant_Team_IsActive]
        ON [dbo].[TravelAdvisorySelection] ([TenantId], [TeamId], [IsActive]);
END
`;

const ENSURE_TRAVEL_ADVISORY_DETAIL_TABLE_SQL = `
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'TravelAdvisoryDetail')
BEGIN
    CREATE TABLE [dbo].[TravelAdvisoryDetail] (
        [Id] INT IDENTITY(1,1) NOT NULL,
        [TravelAdvisorySelectionId] INT NOT NULL,
        [FeedId] NVARCHAR(50) NULL,
        [CountryId] INT NULL,
        [Title] NVARCHAR(500) NULL,
        [Level] NVARCHAR(100) NULL,
        [LevelNumber] INT NULL,
        [Link] NVARCHAR(500) NULL,
        [PublishedDate] NVARCHAR(100) NULL,
        [Description] NVARCHAR(MAX) NULL,
        [Summary] NVARCHAR(MAX) NULL,
        [Restrictions] NVARCHAR(MAX) NULL,
        [Recommendations] NVARCHAR(MAX) NULL,
        [LastUpdatedAtUtc] DATETIME NULL,
        [SyncedAtUtc] DATETIME NOT NULL DEFAULT GETUTCDATE(),
        CONSTRAINT [PK_TravelAdvisoryDetail] PRIMARY KEY CLUSTERED ([Id]),
        CONSTRAINT [FK_TravelAdvisoryDetail_TravelAdvisorySelection] FOREIGN KEY ([TravelAdvisorySelectionId])
            REFERENCES [dbo].[TravelAdvisorySelection] ([Id]) ON DELETE CASCADE,
        CONSTRAINT [FK_TravelAdvisoryDetail_Country] FOREIGN KEY ([CountryId]) REFERENCES [dbo].[Countries] ([Id])
    );
    CREATE UNIQUE NONCLUSTERED INDEX [UX_TravelAdvisoryDetail_Selection]
        ON [dbo].[TravelAdvisoryDetail] ([TravelAdvisorySelectionId]);
END
`;

const ENSURE_TRAVEL_ADVISORY_CHANGELOG_TABLE_SQL = `
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'TravelAdvisoryChangeLog')
BEGIN
    CREATE TABLE [dbo].[TravelAdvisoryChangeLog] (
        [Id] INT IDENTITY(1,1) NOT NULL,
        [TravelAdvisorySelectionId] INT NOT NULL,
        [TravelAdvisoryDetailId] INT NULL,
        [CountryId] INT NULL,
        [FieldName] NVARCHAR(100) NULL,
        [OldValue] NVARCHAR(MAX) NULL,
        [NewValue] NVARCHAR(MAX) NULL,
        [JobRunAtUtc] DATETIME NOT NULL,
        CONSTRAINT [PK_TravelAdvisoryChangeLog] PRIMARY KEY CLUSTERED ([Id]),
        CONSTRAINT [FK_TravelAdvisoryChangeLog_TravelAdvisorySelection] FOREIGN KEY ([TravelAdvisorySelectionId])
            REFERENCES [dbo].[TravelAdvisorySelection] ([Id]) ON DELETE CASCADE,
        CONSTRAINT [FK_TravelAdvisoryChangeLog_TravelAdvisoryDetail] FOREIGN KEY ([TravelAdvisoryDetailId])
            REFERENCES [dbo].[TravelAdvisoryDetail] ([Id]),
        CONSTRAINT [FK_TravelAdvisoryChangeLog_Country] FOREIGN KEY ([CountryId]) REFERENCES [dbo].[Countries] ([Id])
    );
    CREATE NONCLUSTERED INDEX [IX_TravelAdvisoryChangeLog_Selection_JobRunAtUtc]
        ON [dbo].[TravelAdvisoryChangeLog] ([TravelAdvisorySelectionId], [JobRunAtUtc]);
END
`;

/**
 * Ensure TravelAdvisorySelection table exists (create if not).
 * @returns {Promise<void>}
 */
async function ensureTravelAdvisorySelectionTable() {
  const pool = await poolPromise;
  await pool.request().query(ENSURE_TRAVEL_ADVISORY_SELECTION_TABLE_SQL);
}

/**
 * Ensure TravelAdvisoryDetail table exists (create if not).
 * @returns {Promise<void>}
 */
async function ensureTravelAdvisoryDetailTable() {
  const pool = await poolPromise;
  await pool.request().query(ENSURE_TRAVEL_ADVISORY_DETAIL_TABLE_SQL);
}

/**
 * Ensure TravelAdvisoryChangeLog table exists (create if not).
 * @returns {Promise<void>}
 */
async function ensureTravelAdvisoryChangeLogTable() {
  const pool = await poolPromise;
  await pool.request().query(ENSURE_TRAVEL_ADVISORY_CHANGELOG_TABLE_SQL);
}

/**
 * Ensure all three travel advisory tables exist (Selection, Detail, ChangeLog).
 * Call before sync so app works even if only Selection was created manually.
 * @returns {Promise<void>}
 */
async function ensureAllTravelAdvisoryTables() {
  await ensureTravelAdvisorySelectionTable();
  await ensureTravelAdvisoryDetailTable();
  await ensureTravelAdvisoryChangeLogTable();
}

/**
 * Delete TravelAdvisorySelection rows for a tenant/team where CountryId is not in the given list.
 * Detail and ChangeLog rows are removed by CASCADE. When countryIds is empty, all selections for that tenant/team are deleted.
 * @param {string} tenantId
 * @param {string} teamId
 * @param {number[]} countryIds - resolved country IDs to keep
 * @returns {Promise<{ deletedCount: number }>}
 */
async function deleteSelectionsForTenantTeamNotInCountryIds(
  tenantId,
  teamId,
  countryIds,
) {
  const pool = await poolPromise;
  const countryIdsJson = JSON.stringify(
    Array.isArray(countryIds) ? countryIds : [],
  );
  const result = await pool
    .request()
    .input("TenantId", sql.NVarChar(256), tenantId || "")
    .input("TeamId", sql.NVarChar(256), teamId || "")
    .input("countryIdsJson", sql.NVarChar(sql.MAX), countryIdsJson).query(`
      DELETE FROM [dbo].[TravelAdvisorySelection]
      WHERE TenantId = @TenantId AND TeamId = @TeamId
      AND CountryId NOT IN (SELECT CONVERT(INT, value) FROM OPENJSON(@countryIdsJson))
    `);
  const deletedCount =
    result.rowsAffected && result.rowsAffected[0] != null
      ? result.rowsAffected[0]
      : 0;
  return { deletedCount };
}

/**
 * Save travel advisory selections for a tenant/team: delete selections not in list, then resolve countryCodes to CountryId and insert into TravelAdvisorySelection.
 * Skips duplicate (TenantId, TeamId, CountryId, AdvisoryType) and invalid codes.
 * @param {string} tenantId
 * @param {string} teamId
 * @param {string} userId - CreatedByUserId
 * @param {string[]} countryCodes
 * @param {string} [advisoryType='Travel']
 * @returns {Promise<{ savedCount: number, skipped: number, invalidCodes: string[], deletedCount: number }>}
 */
async function saveTravelAdvisorySelections(
  tenantId,
  teamId,
  userId,
  countryCodes,
  advisoryType = "Travel",
) {
  await ensureTravelAdvisorySelectionTable();
  const pool = await poolPromise;
  const codes = Array.isArray(countryCodes)
    ? countryCodes.filter((c) => c != null && String(c).trim() !== "")
    : [];
  const uniqueCodes = [
    ...new Set(codes.map((c) => String(c).trim().toUpperCase())),
  ];

  const validCountryIds = [];
  const invalidCodes = [];
  for (const code of uniqueCodes) {
    const countryId = await getCountryIdByCode(code);
    if (countryId == null) {
      invalidCodes.push(code);
    } else {
      validCountryIds.push(countryId);
    }
  }

  const { deletedCount } =
    await deleteSelectionsForTenantTeamNotInCountryIds(
      tenantId,
      teamId,
      validCountryIds,
    );

  let savedCount = 0;
  let skipped = 0;
  for (const countryId of validCountryIds) {
    const req = pool
      .request()
      .input("TenantId", sql.NVarChar(256), tenantId || "")
      .input("TeamId", sql.NVarChar(256), teamId || "")
      .input("CountryId", sql.Int, countryId)
      .input("AdvisoryType", sql.NVarChar(50), advisoryType)
      .input("CreatedByUserId", sql.NVarChar(256), userId || "");
    const result = await req.query(`
      INSERT INTO [dbo].[TravelAdvisorySelection] (TenantId, TeamId, CountryId, AdvisoryType, IsActive, CreatedByUserId)
      SELECT @TenantId, @TeamId, @CountryId, @AdvisoryType, 1, @CreatedByUserId
      WHERE NOT EXISTS (
        SELECT 1 FROM [dbo].[TravelAdvisorySelection]
        WHERE TenantId = @TenantId AND TeamId = @TeamId AND CountryId = @CountryId AND AdvisoryType = @AdvisoryType
      )
    `);
    if (result.rowsAffected && result.rowsAffected[0] > 0) savedCount++;
    else skipped++;
  }

  return { savedCount, skipped, invalidCodes, deletedCount };
}

/**
 * Get all active selected countries (IsActive = 1) with CountryCode from Countries.
 * Returns rows in the stable API shape: TravelAdvisorySelectedCountriesId, TenantId, TeamId, CountryId, CountryCode.
 * @returns {Promise<Array<{ TravelAdvisorySelectedCountriesId: number, TenantId: string, TeamId: string, CountryId: number, CountryCode: string }>>}
 */
async function getActiveSelectedCountries() {
  const pool = await poolPromise;
  const result = await pool.request().query(`
    SELECT s.Id AS TravelAdvisorySelectedCountriesId, s.TenantId, s.TeamId, s.CountryId, c.code AS CountryCode
    FROM [dbo].[TravelAdvisorySelection] s
    INNER JOIN [dbo].[Countries] c ON c.id = s.CountryId
    WHERE s.IsActive = 1
    ORDER BY s.Id
  `);
  return result.recordset || [];
}

/**
 * Get active selected countries for a specific tenant/team (IsActive = 1).
 * Same shape as getActiveSelectedCountries: TravelAdvisorySelectedCountriesId, TenantId, TeamId, CountryId, CountryCode.
 * @param {string} tenantId
 * @param {string} teamId
 * @returns {Promise<Array<{ TravelAdvisorySelectedCountriesId: number, TenantId: string, TeamId: string, CountryId: number, CountryCode: string }>>}
 */
async function getActiveSelectedCountriesForTenantTeam(tenantId, teamId) {
  const pool = await poolPromise;
  const result = await pool
    .request()
    .input("TenantId", sql.NVarChar(256), tenantId || "")
    .input("TeamId", sql.NVarChar(256), teamId || "").query(`
    SELECT s.Id AS TravelAdvisorySelectedCountriesId, s.TenantId, s.TeamId, s.CountryId, c.code AS CountryCode
    FROM [dbo].[TravelAdvisorySelection] s
    INNER JOIN [dbo].[Countries] c ON c.id = s.CountryId
    WHERE s.TenantId = @TenantId AND s.TeamId = @TeamId AND s.IsActive = 1
    ORDER BY s.Id
  `);
  return result.recordset || [];
}

/**
 * Get saved advisory for a selection id from TravelAdvisoryDetail.
 * @param {number} selectedId - TravelAdvisorySelection.Id (API: TravelAdvisorySelectedCountriesId)
 * @returns {Promise<{ Level, LevelNumber, Summary, Link, LastUpdated }|null>}
 */
async function getSavedAdvisoryForSelectedId(selectedId) {
  if (selectedId == null) return null;
  const pool = await poolPromise;
  const result = await pool.request().input("selectedId", sql.Int, selectedId)
    .query(`
      SELECT Level, LevelNumber, Summary, Link, LastUpdatedAtUtc
      FROM [dbo].[TravelAdvisoryDetail]
      WHERE TravelAdvisorySelectionId = @selectedId
    `);
  const rows = result.recordset || [];
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    Level: row.Level,
    LevelNumber: row.LevelNumber,
    Summary: row.Summary,
    Link: row.Link,
    LastUpdated: row.LastUpdatedAtUtc,
  };
}

/**
 * Normalize an advisory (feed or DB shape) to a snapshot for comparison.
 * @param {Object} advisory - Feed: { level, levelNumber, summary, link, lastUpdated } or DB: { Level, LevelNumber, Summary, Link, LastUpdated }
 * @returns {{ level: string, levelNumber: number, summary: string, link: string, lastUpdated: Date|null }}
 */
function advisoryToSnapshot(advisory) {
  if (!advisory || typeof advisory !== "object") {
    return {
      level: "",
      levelNumber: 0,
      summary: "",
      link: "",
      lastUpdated: null,
    };
  }
  const level =
    advisory.Level != null ? advisory.Level : (advisory.level ?? "");
  const levelNumber =
    advisory.LevelNumber != null
      ? advisory.LevelNumber
      : (advisory.levelNumber ?? 0);
  const summary =
    advisory.Summary != null ? advisory.Summary : (advisory.summary ?? "");
  const link = advisory.Link != null ? advisory.Link : (advisory.link ?? "");
  const lastUpdated =
    advisory.LastUpdated != null
      ? advisory.LastUpdated
      : (advisory.lastUpdated ?? null);
  return { level, levelNumber, summary, link, lastUpdated };
}

/**
 * Compare two snapshots (level, levelNumber, summary, link, lastUpdated).
 * @param {Object} a - Snapshot from advisoryToSnapshot
 * @param {Object} b - Snapshot from advisoryToSnapshot
 * @returns {boolean}
 */
function snapshotsEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  const da =
    a.lastUpdated instanceof Date
      ? a.lastUpdated.getTime()
      : a.lastUpdated
        ? new Date(a.lastUpdated).getTime()
        : null;
  const db =
    b.lastUpdated instanceof Date
      ? b.lastUpdated.getTime()
      : b.lastUpdated
        ? new Date(b.lastUpdated).getTime()
        : null;
  return (
    String(a.level || "") === String(b.level || "") &&
    Number(a.levelNumber) === Number(b.levelNumber) &&
    String(a.summary || "") === String(b.summary || "") &&
    String(a.link || "") === String(b.link || "") &&
    da === db
  );
}

/**
 * Upsert a row in TravelAdvisoryDetail for the given selection and advisory.
 * Ensures Detail and ChangeLog tables exist. Returns the Detail row Id.
 * @param {number} selectedId - TravelAdvisorySelection.Id
 * @param {number} countryId - Country.Id
 * @param {Object} advisory - Feed shape: id, title, level, levelNumber, link, pubDate, summary, description, restrictions, recommendations, lastUpdated
 * @param {Date} jobRunAt
 * @returns {Promise<number>} TravelAdvisoryDetail.Id
 */
async function upsertSavedAdvisory(selectedId, countryId, advisory, jobRunAt) {
  await ensureAllTravelAdvisoryTables();
  const pool = await poolPromise;
  const feedId =
    advisory && advisory.id != null ? String(advisory.id).slice(0, 50) : null;
  const title =
    advisory && advisory.title != null
      ? String(advisory.title).slice(0, 500)
      : null;
  const level =
    advisory && advisory.level != null
      ? String(advisory.level).slice(0, 100)
      : null;
  const levelNumber =
    advisory && advisory.levelNumber != null
      ? Number(advisory.levelNumber)
      : null;
  const link =
    advisory && advisory.link != null
      ? String(advisory.link).slice(0, 500)
      : null;
  const publishedDate =
    advisory && advisory.pubDate != null
      ? String(advisory.pubDate).slice(0, 100)
      : null;
  const description =
    advisory && advisory.description != null
      ? String(advisory.description)
      : null;
  const summary =
    advisory && advisory.summary != null ? String(advisory.summary) : null;
  const restrictions =
    advisory && advisory.restrictions != null
      ? Array.isArray(advisory.restrictions)
        ? advisory.restrictions.join("\n")
        : String(advisory.restrictions)
      : null;
  const recommendations =
    advisory && advisory.recommendations != null
      ? Array.isArray(advisory.recommendations)
        ? advisory.recommendations.join("\n")
        : String(advisory.recommendations)
      : null;
  const lastUpdatedAtUtc =
    advisory && advisory.lastUpdated != null
      ? advisory.lastUpdated instanceof Date
        ? advisory.lastUpdated
        : new Date(advisory.lastUpdated)
      : null;
  const syncedAtUtc = jobRunAt instanceof Date ? jobRunAt : new Date(jobRunAt);

  const req = pool
    .request()
    .input("TravelAdvisorySelectionId", sql.Int, selectedId)
    .input("FeedId", sql.NVarChar(50), feedId)
    .input("CountryId", sql.Int, countryId)
    .input("Title", sql.NVarChar(500), title)
    .input("Level", sql.NVarChar(100), level)
    .input("LevelNumber", sql.Int, levelNumber)
    .input("Link", sql.NVarChar(500), link)
    .input("PublishedDate", sql.NVarChar(100), publishedDate)
    .input("Description", sql.NVarChar(sql.MAX), description)
    .input("Summary", sql.NVarChar(sql.MAX), summary)
    .input("Restrictions", sql.NVarChar(sql.MAX), restrictions)
    .input("Recommendations", sql.NVarChar(sql.MAX), recommendations)
    .input("LastUpdatedAtUtc", sql.DateTime, lastUpdatedAtUtc)
    .input("SyncedAtUtc", sql.DateTime, syncedAtUtc);

  const result = await req.query(`
    MERGE [dbo].[TravelAdvisoryDetail] AS t
    USING (SELECT @TravelAdvisorySelectionId AS TravelAdvisorySelectionId) AS s
    ON t.TravelAdvisorySelectionId = s.TravelAdvisorySelectionId
    WHEN MATCHED THEN
      UPDATE SET FeedId = @FeedId, CountryId = @CountryId, Title = @Title, Level = @Level, LevelNumber = @LevelNumber,
        Link = @Link, PublishedDate = @PublishedDate, Description = @Description, Summary = @Summary,
        Restrictions = @Restrictions, Recommendations = @Recommendations, LastUpdatedAtUtc = @LastUpdatedAtUtc, SyncedAtUtc = @SyncedAtUtc
    WHEN NOT MATCHED THEN
      INSERT (TravelAdvisorySelectionId, FeedId, CountryId, Title, Level, LevelNumber, Link, PublishedDate, Description, Summary, Restrictions, Recommendations, LastUpdatedAtUtc, SyncedAtUtc)
      VALUES (@TravelAdvisorySelectionId, @FeedId, @CountryId, @Title, @Level, @LevelNumber, @Link, @PublishedDate, @Description, @Summary, @Restrictions, @Recommendations, @LastUpdatedAtUtc, @SyncedAtUtc)
    OUTPUT INSERTED.Id;
  `);
  const rows = result.recordset || [];
  return rows.length > 0 ? rows[0].Id : null;
}

/**
 * Insert a change log row when an advisory field changes.
 * @param {number} selectedId - TravelAdvisorySelection.Id
 * @param {string} fieldName - e.g. "LevelNumber"
 * @param {number} countryId - Country.Id
 * @param {number} advisoryId - TravelAdvisoryDetail.Id
 * @param {Object} oldSnapshot - Snapshot from advisoryToSnapshot
 * @param {Object} newSnapshot - Snapshot from advisoryToSnapshot
 * @param {Date} jobRunAt
 * @returns {Promise<void>}
 */
async function insertSelectedCountryLog(
  selectedId,
  fieldName,
  countryId,
  advisoryId,
  oldSnapshot,
  newSnapshot,
  jobRunAt,
) {
  await ensureAllTravelAdvisoryTables();
  const pool = await poolPromise;
  const oldVal =
    oldSnapshot && fieldName === "LevelNumber"
      ? String(oldSnapshot.levelNumber ?? "")
      : oldSnapshot
        ? JSON.stringify(oldSnapshot)
        : "";
  const newVal =
    newSnapshot && fieldName === "LevelNumber"
      ? String(newSnapshot.levelNumber ?? "")
      : newSnapshot
        ? JSON.stringify(newSnapshot)
        : "";
  await pool
    .request()
    .input("TravelAdvisorySelectionId", sql.Int, selectedId)
    .input("TravelAdvisoryDetailId", sql.Int, advisoryId)
    .input("CountryId", sql.Int, countryId)
    .input("FieldName", sql.NVarChar(100), fieldName)
    .input("OldValue", sql.NVarChar(sql.MAX), oldVal)
    .input("NewValue", sql.NVarChar(sql.MAX), newVal)
    .input(
      "JobRunAtUtc",
      sql.DateTime,
      jobRunAt instanceof Date ? jobRunAt : new Date(jobRunAt),
    ).query(`
      INSERT INTO [dbo].[TravelAdvisoryChangeLog] (TravelAdvisorySelectionId, TravelAdvisoryDetailId, CountryId, FieldName, OldValue, NewValue, JobRunAtUtc)
      VALUES (@TravelAdvisorySelectionId, @TravelAdvisoryDetailId, @CountryId, @FieldName, @OldValue, @NewValue, @JobRunAtUtc)
    `);
}

/**
 * Get travel advisory data for a team in one call: selected country codes, countries list, and advisories from DB.
 * Uses TravelAdvisorySelection and TravelAdvisoryDetail. When tenantId is provided, filters by both; otherwise by teamId only.
 * @param {string} teamId
 * @param {string} [tenantId] - optional; if provided, selections are filtered by tenantId and teamId
 * @returns {Promise<{  advisories: Array<Object> }>}
 */
async function getTravelAdvisoryByTeamData(teamId, tenantId) {
  const pool = await poolPromise;

  const tId =
    teamId != null && String(teamId).trim() !== "" ? String(teamId).trim() : "";
  if (!tId) {
    return { advisories: [] };
  }

  // Advisories from TravelAdvisoryDetail for this team's selections
  const advRequest = pool.request().input("TeamId", sql.NVarChar(256), tId);
  const advWhere = "s.TeamId = @TeamId AND s.IsActive = 1";
  const advResult = await advRequest.query(`
    SELECT d.Id, d.Title, d.Level, d.LevelNumber, d.Link, d.PublishedDate, d.Description, d.Summary,
           d.Restrictions, d.Recommendations, d.LastUpdatedAtUtc,
           c.name AS CountryName, c.code AS CountryCode
    FROM [dbo].[TravelAdvisoryDetail] d
    INNER JOIN [dbo].[TravelAdvisorySelection] s ON s.Id = d.TravelAdvisorySelectionId
    INNER JOIN [dbo].[Countries] c ON c.id = d.CountryId
    WHERE ${advWhere}
    ORDER BY c.name
  `);
  const rows = advResult.recordset || [];
  const advisories = rows.map((r) => {
    const restrictions =
      r.Restrictions != null
        ? String(r.Restrictions)
            .split(/\n/)
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
    const recommendations =
      r.Recommendations != null
        ? String(r.Recommendations)
            .split(/\n/)
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
    return {
      country: r.CountryName || "",
      countryCode: (r.CountryCode || "").trim(),
      level: r.Level || "",
      levelNumber: r.LevelNumber != null ? r.LevelNumber : undefined,
      title: r.Title != null ? r.Title : undefined,
      summary: r.Summary != null ? r.Summary : undefined,
      pubDate: r.PublishedDate != null ? r.PublishedDate : undefined,
      link: r.Link != null ? r.Link : undefined,
      description: r.Description != null ? r.Description : undefined,
      lastUpdated: r.LastUpdatedAtUtc != null ? r.LastUpdatedAtUtc : undefined,
      restrictions: restrictions.length ? restrictions : undefined,
      recommendations: recommendations.length ? recommendations : undefined,
      id: r.Id != null ? String(r.Id) : undefined,
    };
  });

  return { advisories };
}

/**
 * Get countries list in shape { name, code, level } for getTravelAdvisoryByTeam response.
 * Uses Countries table; level column may not exist in all schemas.
 */
async function getCountriesForByTeamResponse() {
  const pool = await poolPromise;
  try {
    const result = await pool.request().query(`
      SELECT name, code, level FROM Countries ORDER BY name
    `);
    const rows = result.recordset || [];
    return rows.map((r) => ({
      name: r.name || "",
      code: (r.code || "").trim(),
      level: (r.level != null ? r.level : "") || "",
    }));
  } catch (e) {
    const fallback = await pool
      .request()
      .query("SELECT name, code FROM Countries ORDER BY name");
    const rows = fallback.recordset || [];
    return rows.map((r) => ({
      name: r.name || "",
      code: (r.code || "").trim(),
      level: "",
    }));
  }
}

module.exports = {
  getCountriesFromDb,
  getAllCountriesFromDb,
  getCountryIdByCode,
  ensureTravelAdvisorySelectionTable,
  ensureTravelAdvisoryDetailTable,
  ensureTravelAdvisoryChangeLogTable,
  ensureAllTravelAdvisoryTables,
  saveTravelAdvisorySelections,
  getActiveSelectedCountries,
  getActiveSelectedCountriesForTenantTeam,
  getSavedAdvisoryForSelectedId,
  advisoryToSnapshot,
  snapshotsEqual,
  upsertSavedAdvisory,
  insertSelectedCountryLog,
  getTravelAdvisoryByTeamData,
};
