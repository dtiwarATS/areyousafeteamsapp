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
 * Get CountryId from Countries by code (for validation only; no longer used for storage).
 * @param {string} code - Country code (e.g. 'US')
 * @returns {Promise<number|null>}
 */

const ENSURE_ADVISORY_TABLE_SQL = `
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Advisory')
BEGIN
    CREATE TABLE [dbo].[Advisory] (
        [Id] INT IDENTITY(1,1) NOT NULL,
        [TenantId] NVARCHAR(256) NOT NULL,
        [CountryCode] NVARCHAR(MAX) NOT NULL,
        [AdvisoryType] NVARCHAR(50) NOT NULL,
        [IsActive] BIT NOT NULL DEFAULT 1,
        [CreatedByUserId] NVARCHAR(256) NOT NULL,
        [CreatedAtUtc] DATETIME NOT NULL DEFAULT GETUTCDATE(),
        [UpdatedByUserId] NVARCHAR(256) NULL,
        [UpdatedAtUtc] DATETIME NULL,
        CONSTRAINT [PK_Advisory] PRIMARY KEY CLUSTERED ([Id])
    );
    CREATE UNIQUE NONCLUSTERED INDEX [UX_Advisory_Tenant_CountryCode_Type]
        ON [dbo].[Advisory] ([TenantId], [CountryCode], [AdvisoryType]);
    CREATE NONCLUSTERED INDEX [IX_Advisory_Tenant_Type] ON [dbo].[Advisory] ([TenantId], [AdvisoryType]);
    CREATE NONCLUSTERED INDEX [IX_Advisory_Tenant_IsActive] ON [dbo].[Advisory] ([TenantId], [IsActive]);
END
`;

const ENSURE_ADVISORY_DETAIL_TABLE_SQL = `
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'AdvisoryDetail')
BEGIN
    CREATE TABLE [dbo].[AdvisoryDetail] (
        [Id] INT IDENTITY(1,1) NOT NULL,
        [AdvisoryId] INT NOT NULL,
        [FeedId] NVARCHAR(50) NULL,
        [CountryCode] NVARCHAR(MAX) NULL,
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
        CONSTRAINT [PK_AdvisoryDetail] PRIMARY KEY CLUSTERED ([Id]),
        CONSTRAINT [FK_AdvisoryDetail_Advisory] FOREIGN KEY ([AdvisoryId])
            REFERENCES [dbo].[Advisory] ([Id]) ON DELETE CASCADE
    );
    CREATE UNIQUE NONCLUSTERED INDEX [UX_AdvisoryDetail_Advisory]
        ON [dbo].[AdvisoryDetail] ([AdvisoryId]);
END
`;

const ENSURE_ADVISORY_CHANGELOG_TABLE_SQL = `
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'AdvisoryChangeLog')
BEGIN
    CREATE TABLE [dbo].[AdvisoryChangeLog] (
        [Id] INT IDENTITY(1,1) NOT NULL,
        [AdvisoryId] INT NOT NULL,
        [AdvisoryDetailId] INT NULL,
        [CountryCode] NVARCHAR(MAX) NULL,
        [FieldName] NVARCHAR(100) NULL,
        [OldValue] NVARCHAR(MAX) NULL,
        [NewValue] NVARCHAR(MAX) NULL,
        [JobRunAtUtc] DATETIME NOT NULL,
        CONSTRAINT [PK_AdvisoryChangeLog] PRIMARY KEY CLUSTERED ([Id]),
        CONSTRAINT [FK_AdvisoryChangeLog_Advisory] FOREIGN KEY ([AdvisoryId])
            REFERENCES [dbo].[Advisory] ([Id]) ON DELETE CASCADE,
        CONSTRAINT [FK_AdvisoryChangeLog_AdvisoryDetail] FOREIGN KEY ([AdvisoryDetailId])
            REFERENCES [dbo].[AdvisoryDetail] ([Id])
    );
    CREATE NONCLUSTERED INDEX [IX_AdvisoryChangeLog_Advisory_JobRunAtUtc]
        ON [dbo].[AdvisoryChangeLog] ([AdvisoryId], [JobRunAtUtc]);
END
`;

/**
 * Ensure Advisory table exists (create if not).
 * @returns {Promise<void>}
 */
async function ensureAdvisoryTable() {
  const pool = await poolPromise;
  await pool.request().query(ENSURE_ADVISORY_TABLE_SQL);
}

/**
 * Ensure AdvisoryDetail table exists (create if not).
 * @returns {Promise<void>}
 */
async function ensureAdvisoryDetailTable() {
  const pool = await poolPromise;
  await pool.request().query(ENSURE_ADVISORY_DETAIL_TABLE_SQL);
}

/**
 * Ensure AdvisoryChangeLog table exists (create if not).
 * @returns {Promise<void>}
 */
async function ensureAdvisoryChangeLogTable() {
  const pool = await poolPromise;
  await pool.request().query(ENSURE_ADVISORY_CHANGELOG_TABLE_SQL);
}

/**
 * Ensure all three travel advisory tables exist (Advisory, AdvisoryDetail, AdvisoryChangeLog).
 * Call before sync so app works even if only Advisory was created manually.
 * @returns {Promise<void>}
 */
async function ensureAllTravelAdvisoryTables() {
  await ensureAdvisoryTable();
  await ensureAdvisoryDetailTable();
  await ensureAdvisoryChangeLogTable();
}

/**
 * Delete Advisory rows for a tenant where CountryCode is not in the given list.
 * Detail and ChangeLog rows are removed by CASCADE. When countryCodes is empty, all selections for that tenant are deleted.
 * @param {string} tenantId
 * @param {string[]} countryCodes - country codes to keep (uppercase)
 * @returns {Promise<{ deletedCount: number }>}
 */
async function deleteAdvisoryForTenantNotInCountryCodes(
  tenantId,
  countryCodes,
  advisoryType,
) {
  const pool = await poolPromise;
  const codes = Array.isArray(countryCodes)
    ? countryCodes.map((c) => String(c).trim().toUpperCase()).filter(Boolean)
    : [];
  const countryCodesJson = JSON.stringify(codes);
  const result = await pool
    .request()
    .input("TenantId", sql.NVarChar(256), tenantId || "")
    .input("AdvisoryType", sql.NVarChar(50), advisoryType)
    .input("countryCodesJson", sql.NVarChar(sql.MAX), countryCodesJson).query(`
      DELETE FROM [dbo].[Advisory]
      WHERE TenantId = @TenantId  AND AdvisoryType = @AdvisoryType
      AND UPPER(LTRIM(RTRIM(CountryCode))) NOT IN (
        SELECT UPPER(LTRIM(RTRIM(value))) FROM OPENJSON(@countryCodesJson)
      )
    `);
  const deletedCount =
    result.rowsAffected && result.rowsAffected[0] != null
      ? result.rowsAffected[0]
      : 0;
  return { deletedCount };
}

/**
 * Save travel advisory selections for a tenant: delete selections not in list, then MERGE (update/insert) into Advisory.
 * One record per (TenantId, CountryCode, AdvisoryType). Uses CountryCode directly (no resolution to CountryId).
 * @param {string} tenantId
 * @param {string} teamId - kept for API backward compatibility, ignored
 * @param {string} userId - CreatedByUserId
 * @param {string[]} countryCodes
 * @param {string} [advisoryType]
 * @returns {Promise<{ savedCount: number, skipped: number, invalidCodes: string[], deletedCount: number }>}
 */
async function saveTravelAdvisorySelections(
  tenantId,
  teamId,
  userId,
  countryCodes,
  advisoryType,
) {
  await ensureAdvisoryTable();
  const pool = await poolPromise;
  const codes = Array.isArray(countryCodes)
    ? countryCodes.filter((c) => c != null && String(c).trim() !== "")
    : [];
  const uniqueCodes = [
    ...new Set(codes.map((c) => String(c).trim().toUpperCase())),
  ];

  const validCodes = [];
  const invalidCodes = [];
  for (const code of uniqueCodes) {
    validCodes.push(String(code).trim().toUpperCase());
  }

  const { deletedCount } = await deleteAdvisoryForTenantNotInCountryCodes(
    tenantId,
    validCodes,
    advisoryType,
  );

  let savedCount = 0;
  let skipped = 0;
  const allCountryCodes = validCodes.join(",");
  const req = pool
    .request()
    .input("TenantId", sql.NVarChar(256), tenantId || "")
    .input("CountryCode", sql.NVarChar(sql.MAX), allCountryCodes)
    .input("AdvisoryType", sql.NVarChar(50), advisoryType)
    .input("CreatedByUserId", sql.NVarChar(256), userId || "");

  const result = await req.query(`
IF EXISTS (
    SELECT 1 
    FROM dbo.Advisory
    WHERE TenantId = @TenantId
      AND AdvisoryType = @AdvisoryType
)

BEGIN
    UPDATE dbo.Advisory
    SET 
        CountryCode = @CountryCode,
        IsActive = 1,
        UpdatedByUserId = @CreatedByUserId,
        UpdatedAtUtc = GETUTCDATE()
    WHERE TenantId = @TenantId
      AND AdvisoryType = @AdvisoryType;
END
ELSE
BEGIN
    INSERT INTO dbo.Advisory
    (TenantId, CountryCode, AdvisoryType, IsActive, CreatedByUserId)
    VALUES
    (@TenantId, @CountryCode, @AdvisoryType, 1, @CreatedByUserId);
END
`);
  console.log(result);
  return { savedCount, skipped, invalidCodes, deletedCount };
}

/**
 * Get all active selected countries (IsActive = 1).
 * Returns rows in the stable API shape: TravelAdvisorySelectedCountriesId, TenantId, CountryCode.
 * @returns {Promise<Array<{ TravelAdvisorySelectedCountriesId: number, TenantId: string, CountryCode: string }>>}
 */
async function getActiveSelectedCountries() {
  const pool = await poolPromise;
  const result = await pool.request().query(`
    SELECT s.Id AS TravelAdvisorySelectedCountriesId, s.TenantId, s.CountryCode
    FROM [dbo].[Advisory] s
    WHERE s.IsActive = 1
    ORDER BY s.Id
  `);
  return result.recordset || [];
}

/**
 * Get active selected countries for a specific tenant (IsActive = 1).
 * Same shape as getActiveSelectedCountries: TravelAdvisorySelectedCountriesId, TenantId, CountryCode.
 * @param {string} tenantId
 * @param {string} teamId - kept for API backward compatibility, ignored
 * @returns {Promise<Array<{ TravelAdvisorySelectedCountriesId: number, TenantId: string, CountryCode: string }>>}
 */
async function getActiveSelectedCountriesForTenantTeam(tenantId, teamId) {
  const pool = await poolPromise;
  const result = await pool
    .request()
    .input("TenantId", sql.NVarChar(256), tenantId || "").query(`
    SELECT s.Id AS TravelAdvisorySelectedCountriesId, s.TenantId, s.CountryCode
    FROM [dbo].[Advisory] s
    WHERE s.TenantId = @TenantId AND s.IsActive = 1
    ORDER BY s.Id
  `);
  return result.recordset || [];
}

/**
 * Get saved advisory for a selection id from AdvisoryDetail.
 * @param {number} selectedId - Advisory.Id (API: TravelAdvisorySelectedCountriesId)
 * @returns {Promise<{ Level, LevelNumber, Summary, Link, LastUpdated }|null>}
 */
async function getSavedAdvisoryForSelectedId(selectedId) {
  if (selectedId == null) return null;
  const pool = await poolPromise;
  const result = await pool.request().input("selectedId", sql.Int, selectedId)
    .query(`
      SELECT Level, LevelNumber, Summary, Link, LastUpdatedAtUtc
      FROM [dbo].[AdvisoryDetail]
      WHERE AdvisoryId = @selectedId
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
 * Upsert a row in AdvisoryDetail for the given selection and advisory.
 * Ensures Detail and ChangeLog tables exist. Returns the Detail row Id.
 * @param {number} selectedId - Advisory.Id
 * @param {string} countryCode - Country code (e.g. 'US')
 * @param {Object} advisory - Feed shape: id, title, level, levelNumber, link, pubDate, summary, description, restrictions, recommendations, lastUpdated
 * @param {Date} jobRunAt
 * @returns {Promise<number>} AdvisoryDetail.Id
 */
async function upsertSavedAdvisory(
  selectedId,
  countryCode,
  advisory,
  jobRunAt,
) {
  await ensureAllTravelAdvisoryTables();
  const pool = await poolPromise;
  const code = countryCode != null ? String(countryCode).trim() : "";
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
    .input("CountryCode", sql.NVarChar(sql.MAX), code)
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
    MERGE [dbo].[AdvisoryDetail] AS t
    USING (SELECT @TravelAdvisorySelectionId AS TravelAdvisorySelectionId ,  @CountryCode AS CountryCode) AS s
    ON t.TravelAdvisorySelectionId = s.TravelAdvisorySelectionId AND t.CountryCode = s.CountryCode 
    WHEN MATCHED THEN
      UPDATE SET FeedId = @FeedId, CountryCode = @CountryCode, Title = @Title, Level = @Level, LevelNumber = @LevelNumber,
        Link = @Link, PublishedDate = @PublishedDate, Description = @Description, Summary = @Summary,
        Restrictions = @Restrictions, Recommendations = @Recommendations, LastUpdatedAtUtc = @LastUpdatedAtUtc, SyncedAtUtc = @SyncedAtUtc
    WHEN NOT MATCHED THEN
      INSERT (TravelAdvisorySelectionId, FeedId, CountryCode, Title, Level, LevelNumber, Link, PublishedDate, Description, Summary, Restrictions, Recommendations, LastUpdatedAtUtc, SyncedAtUtc)
      VALUES (@TravelAdvisorySelectionId, @FeedId, @CountryCode, @Title, @Level, @LevelNumber, @Link, @PublishedDate, @Description, @Summary, @Restrictions, @Recommendations, @LastUpdatedAtUtc, @SyncedAtUtc)
    OUTPUT INSERTED.Id;
  `);
  const rows = result.recordset || [];
  return rows.length > 0 ? rows[0].Id : null;
}

/**
 * Insert a change log row when an advisory field changes.
 * @param {number} selectedId - Advisory.Id
 * @param {string} fieldName - e.g. "LevelNumber"
 * @param {string} countryCode - Country code
 * @param {number} advisoryDetailId - AdvisoryDetail.Id
 * @param {Object} oldSnapshot - Snapshot from advisoryToSnapshot
 * @param {Object} newSnapshot - Snapshot from advisoryToSnapshot
 * @param {Date} jobRunAt
 * @returns {Promise<void>}
 */
async function insertSelectedCountryLog(
  selectedId,
  fieldName,
  countryCode,
  advisoryDetailId,
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
    .input("AdvisoryId", sql.Int, selectedId)
    .input("AdvisoryDetailId", sql.Int, advisoryDetailId)
    .input(
      "CountryCode",
      sql.NVarChar(sql.MAX),
      countryCode != null ? String(countryCode) : "",
    )
    .input("FieldName", sql.NVarChar(100), fieldName)
    .input("OldValue", sql.NVarChar(sql.MAX), oldVal)
    .input("NewValue", sql.NVarChar(sql.MAX), newVal)
    .input(
      "JobRunAtUtc",
      sql.DateTime,
      jobRunAt instanceof Date ? jobRunAt : new Date(jobRunAt),
    ).query(`
      INSERT INTO [dbo].[AdvisoryChangeLog] (AdvisoryId, AdvisoryDetailId, CountryCode, FieldName, OldValue, NewValue, JobRunAtUtc)
      VALUES (@AdvisoryId, @AdvisoryDetailId, @CountryCode, @FieldName, @OldValue, @NewValue, @JobRunAtUtc)
    `);
}

/**
 * Get travel advisory data for a tenant in one call: advisories from DB.
 * Uses Advisory and AdvisoryDetail. Filters by TenantId only (TeamId removed).
 * @param {string} teamId - when tenantId is provided, use '' (sentinel); when tenantId not provided, cannot filter (returns empty)
 * @param {string} [tenantId] - if provided, selections are filtered by tenantId
 * @returns {Promise<{ advisories: Array<Object> }>}
 */
async function getTravelAdvisoryByTeamData(teamId, tenantId) {
  const pool = await poolPromise;

  const tenantIdTrimmed =
    tenantId != null && String(tenantId).trim() !== ""
      ? String(tenantId).trim()
      : "";

  if (!tenantIdTrimmed) {
    return { advisories: [] };
  }

  const advResult = await pool
    .request()
    .input("TenantId", sql.NVarChar(256), tenantIdTrimmed).query(`
    SELECT d.Id, d.Title, d.Level, d.LevelNumber, d.Link, d.PublishedDate, d.Description, d.Summary,
           d.Restrictions, d.Recommendations, d.LastUpdatedAtUtc,
           ISNULL(c.name, d.CountryCode) AS CountryName, d.CountryCode
    FROM [dbo].[AdvisoryDetail] d
    INNER JOIN [dbo].[Advisory] s ON s.Id = d.TravelAdvisorySelectionId
    LEFT JOIN [dbo].[Countries] c ON UPPER(LTRIM(RTRIM(c.code))) = UPPER(LTRIM(RTRIM(d.CountryCode)))
    WHERE s.TenantId = @TenantId AND s.IsActive = 1
    ORDER BY ISNULL(c.name, d.CountryCode)
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
 * Get country code from Countries by id.
 * @param {number} id - Country id
 * @returns {Promise<string|null>}
 */
async function getCountryCodeById(id) {
  if (id == null) return null;
  const pool = await poolPromise;
  const result = await pool
    .request()
    .input("id", sql.Int, id)
    .query("SELECT code FROM Countries WHERE id = @id");
  const rows = result.recordset || [];
  return rows.length ? (rows[0].code || "").trim() : null;
}

/**
 * Get selected countries for tenant/team with optional advisory data.
 * @param {string} tenantId
 * @param {string} teamId - kept for API compatibility, ignored
 * @param {boolean} [includeAdvisory=true]
 * @returns {Promise<Array<{ id: number, tenantId: string, countryCode: string, advisory?: Object }>>}
 */
async function getSelectedCountriesForTenantTeam(
  tenantId,
  teamId,
  includeAdvisory = true,
) {
  const rows = await getActiveSelectedCountriesForTenantTeam(tenantId, teamId);
  if (!includeAdvisory) {
    return rows.map((r) => ({
      id: r.TravelAdvisorySelectedCountriesId,
      tenantId: r.TenantId,
      countryCode: r.CountryCode || "",
    }));
  }
  const list = [];
  for (const r of rows) {
    const item = {
      id: r.TravelAdvisorySelectedCountriesId,
      tenantId: r.TenantId,
      countryCode: r.CountryCode || "",
    };
    const saved = await getSavedAdvisoryForSelectedId(
      r.TravelAdvisorySelectedCountriesId,
    );
    if (saved) {
      item.advisory = {
        level: saved.Level,
        levelNumber: saved.LevelNumber,
        summary: saved.Summary,
        link: saved.Link,
        lastUpdated: saved.LastUpdated,
      };
    }
    list.push(item);
  }
  return list;
}

/**
 * Add a single selected country. Resolves countryId to countryCode if needed.
 * @param {Object} opts
 * @param {string} opts.tenantId
 * @param {string} opts.teamId - kept for API compatibility, ignored
 * @param {number} [opts.countryId]
 * @param {string} [opts.countryCode]
 * @param {string} [opts.advisoryType]
 * @param {string} opts.createdByUserId
 * @returns {Promise<Object>}
 */
async function addSelectedCountry(opts) {
  const {
    tenantId,
    teamId,
    countryId,
    countryCode,
    advisoryType,
    createdByUserId,
  } = opts || {};
  let code = countryCode ? String(countryCode).trim() : null;
  if (!code && countryId != null) {
    code = await getCountryCodeById(countryId);
  }
  if (!code) {
    const err = new Error("Country not found");
    err.code = "MISSING_COUNTRY";
    throw err;
  }
  const result = await saveTravelAdvisorySelections(
    tenantId,
    teamId || "",
    createdByUserId || "",
    [code],
    advisoryType || "Travel",
  );
  return result;
}

/**
 * Get change logs for a selected country (Advisory.Id).
 * @param {number} id - Advisory.Id
 * @param {number} [limit=50]
 * @returns {Promise<Array<Object>>}
 */
async function getLogsForSelectedCountry(id, limit = 50) {
  if (id == null) return [];
  const pool = await poolPromise;
  const lim = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
  const result = await pool
    .request()
    .input("id", sql.Int, id)
    .input("limit", sql.Int, lim).query(`
      SELECT TOP (@limit) Id, AdvisoryId, AdvisoryDetailId, CountryCode, FieldName, OldValue, NewValue, JobRunAtUtc
      FROM [dbo].[AdvisoryChangeLog]
      WHERE AdvisoryId = @id
      ORDER BY JobRunAtUtc DESC
    `);
  return result.recordset || [];
}

/**
 * Deactivate a selected country (set IsActive = 0).
 * @param {number} id - Advisory.Id
 * @param {string} lastUpdatedByUserId
 * @returns {Promise<void>}
 */
async function deactivateSelectedCountry(id, lastUpdatedByUserId) {
  if (id == null) return;
  const pool = await poolPromise;
  await pool
    .request()
    .input("id", sql.Int, id)
    .input("lastUpdatedByUserId", sql.NVarChar(256), lastUpdatedByUserId || "")
    .query(`
      UPDATE [dbo].[Advisory]
      SET IsActive = 0, UpdatedByUserId = @lastUpdatedByUserId, UpdatedAtUtc = GETUTCDATE()
      WHERE Id = @id
    `);
}

/**
 * Delete a selected country (Advisory row; CASCADE removes Detail and ChangeLog).
 * @param {number} id - Advisory.Id
 * @returns {Promise<void>}
 */
async function deleteSelectedCountry(id) {
  if (id == null) return;
  const pool = await poolPromise;
  await pool.request().input("id", sql.Int, id).query(`
    DELETE FROM [dbo].[Advisory] WHERE Id = @id
  `);
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
  getCountryCodeById,
  ensureAdvisoryTable,
  ensureAdvisoryDetailTable,
  ensureAdvisoryChangeLogTable,
  ensureTravelAdvisorySelectionTable: ensureAdvisoryTable,
  ensureTravelAdvisoryDetailTable: ensureAdvisoryDetailTable,
  ensureTravelAdvisoryChangeLogTable: ensureAdvisoryChangeLogTable,
  ensureAllTravelAdvisoryTables,
  saveTravelAdvisorySelections,
  getActiveSelectedCountries,
  getActiveSelectedCountriesForTenantTeam,
  getSelectedCountriesForTenantTeam,
  addSelectedCountry,
  getLogsForSelectedCountry,
  deactivateSelectedCountry,
  deleteSelectedCountry,
  getSavedAdvisoryForSelectedId,
  advisoryToSnapshot,
  snapshotsEqual,
  upsertSavedAdvisory,
  insertSelectedCountryLog,
  getTravelAdvisoryByTeamData,
};
