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
  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'Advisory' AND COLUMN_NAME = 'SelectedLocationsJson'
    )
    BEGIN
      ALTER TABLE [dbo].[Advisory] ADD [SelectedLocationsJson] NVARCHAR(MAX) NULL;
    END
  `);
}

/**
 * Resolve FK column on AdvisoryDetail: production uses TravelAdvisorySelectionId;
 * fresh schema (ENSURE_ADVISORY_DETAIL_TABLE_SQL) uses AdvisoryId.
 * @returns {Promise<'TravelAdvisorySelectionId'|'AdvisoryId'>}
 */
let _advisoryDetailFkColPromise = null;
async function getAdvisoryDetailFkColumn() {
  if (_advisoryDetailFkColPromise) return _advisoryDetailFkColPromise;
  _advisoryDetailFkColPromise = (async () => {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT CASE
        WHEN COL_LENGTH('dbo.AdvisoryDetail', 'TravelAdvisorySelectionId') IS NOT NULL
          THEN N'TravelAdvisorySelectionId'
        ELSE N'AdvisoryId'
      END AS ColName
    `);
    const name =
      result.recordset && result.recordset[0]
        ? String(result.recordset[0].ColName)
        : "AdvisoryId";
    return name === "TravelAdvisorySelectionId"
      ? "TravelAdvisorySelectionId"
      : "AdvisoryId";
  })();
  try {
    return await _advisoryDetailFkColPromise;
  } catch (err) {
    _advisoryDetailFkColPromise = null;
    throw err;
  }
}

/**
 * Ensure AdvisoryDetail table exists (create if not).
 * Adds LocationKey for Weather (one detail row per city) without breaking Travel
 * (Travel rows keep LocationKey NULL and stay keyed by country).
 * @returns {Promise<void>}
 */
async function ensureAdvisoryDetailTable() {
  const pool = await poolPromise;
  await pool.request().query(ENSURE_ADVISORY_DETAIL_TABLE_SQL);
  // Production schemas use TravelAdvisorySelectionId; fresh create uses AdvisoryId.
  await pool.request().query(`
    IF COL_LENGTH('dbo.AdvisoryDetail', 'LocationKey') IS NULL
    BEGIN
      ALTER TABLE [dbo].[AdvisoryDetail] ADD [LocationKey] NVARCHAR(256) NULL;
    END
    IF COL_LENGTH('dbo.AdvisoryDetail', 'ApiResponseJson') IS NULL
    BEGIN
      ALTER TABLE [dbo].[AdvisoryDetail] ADD [ApiResponseJson] NVARCHAR(MAX) NULL;
    END
    IF COL_LENGTH('dbo.AdvisoryDetail', 'AdvisoryType') IS NULL
    BEGIN
      ALTER TABLE [dbo].[AdvisoryDetail] ADD [AdvisoryType] NVARCHAR(50) NULL;
    END
  `);
  // Allow multiple detail rows per Advisory (one per country / city).
  // Note: NVARCHAR(MAX) CountryCode cannot be an index key — skip Travel unique in that case.
  await pool.request().query(`
    IF EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE name = N'UX_AdvisoryDetail_Advisory'
        AND object_id = OBJECT_ID(N'[dbo].[AdvisoryDetail]')
    )
      DROP INDEX [UX_AdvisoryDetail_Advisory] ON [dbo].[AdvisoryDetail];

    IF COL_LENGTH('dbo.AdvisoryDetail', 'TravelAdvisorySelectionId') IS NOT NULL
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'UX_AdvisoryDetail_Weather_LocationKey'
          AND object_id = OBJECT_ID(N'[dbo].[AdvisoryDetail]')
      )
        CREATE UNIQUE NONCLUSTERED INDEX [UX_AdvisoryDetail_Weather_LocationKey]
          ON [dbo].[AdvisoryDetail] ([TravelAdvisorySelectionId], [LocationKey])
          WHERE [LocationKey] IS NOT NULL;

      IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'UX_AdvisoryDetail_Travel_Country'
          AND object_id = OBJECT_ID(N'[dbo].[AdvisoryDetail]')
      )
      AND EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'AdvisoryDetail'
          AND COLUMN_NAME = 'CountryCode'
          AND CHARACTER_MAXIMUM_LENGTH > 0
          AND CHARACTER_MAXIMUM_LENGTH <= 450
      )
        CREATE UNIQUE NONCLUSTERED INDEX [UX_AdvisoryDetail_Travel_Country]
          ON [dbo].[AdvisoryDetail] ([TravelAdvisorySelectionId], [CountryCode])
          WHERE [LocationKey] IS NULL;
    END
    ELSE IF COL_LENGTH('dbo.AdvisoryDetail', 'AdvisoryId') IS NOT NULL
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'UX_AdvisoryDetail_Weather_LocationKey'
          AND object_id = OBJECT_ID(N'[dbo].[AdvisoryDetail]')
      )
        CREATE UNIQUE NONCLUSTERED INDEX [UX_AdvisoryDetail_Weather_LocationKey]
          ON [dbo].[AdvisoryDetail] ([AdvisoryId], [LocationKey])
          WHERE [LocationKey] IS NOT NULL;

      IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'UX_AdvisoryDetail_Travel_Country'
          AND object_id = OBJECT_ID(N'[dbo].[AdvisoryDetail]')
      )
      AND EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'AdvisoryDetail'
          AND COLUMN_NAME = 'CountryCode'
          AND CHARACTER_MAXIMUM_LENGTH > 0
          AND CHARACTER_MAXIMUM_LENGTH <= 450
      )
        CREATE UNIQUE NONCLUSTERED INDEX [UX_AdvisoryDetail_Travel_Country]
          ON [dbo].[AdvisoryDetail] ([AdvisoryId], [CountryCode])
          WHERE [LocationKey] IS NULL;
    END
  `);
  // Column may have been added; refresh cache for FK helpers
  _advisoryDetailFkColPromise = null;
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
 * Weather: one row per tenant — merge new countries/cities onto the existing row; remove only when explicitly listed.
 * Travel: one record per (TenantId, CountryCode, AdvisoryType) via comma-joined CountryCode update.
 * @param {string} tenantId
 * @param {string} teamId - kept for API backward compatibility, ignored
 * @param {string} userId - CreatedByUserId
 * @param {string[]} countryCodes
 * @param {string} [advisoryType]
 * @param {Array} [locationSelections] - Weather: country+city selections stored as SelectedLocationsJson
 * @param {{ removedLocationKeys?: string[], removedCountryCodes?: string[], replaceSelections?: boolean }} [opts]
 * @returns {Promise<{ savedCount: number, skipped: number, invalidCodes: string[], deletedCount: number }>}
 */
function weatherLocationKey(loc) {
  return `${String(loc.countryCode || "")
    .trim()
    .toUpperCase()}|${String(loc.cityName || "").trim()}|${loc.state != null ? String(loc.state).trim() : ""}`;
}

/** Travel location key: country-only → CODE|| ; city → CODE|city|state */
function travelLocationKey(loc) {
  const code = String(loc.countryCode || "")
    .trim()
    .toUpperCase();
  const city = String(loc.cityName || "").trim();
  const state = loc.state != null ? String(loc.state).trim() : "";
  if (!city) return `${code}||`;
  return `${code}|${city}|${state}`;
}

function normalizeLocationSelectionRow(l) {
  return {
    countryCode: String(l.countryCode || "")
      .trim()
      .toUpperCase(),
    countryName: String(l.countryName || "").trim(),
    cityName: String(l.cityName || "").trim(),
    state: l.state != null ? String(l.state).trim() : null,
    latitude:
      l.latitude != null && !Number.isNaN(Number(l.latitude))
        ? Number(l.latitude)
        : null,
    longitude:
      l.longitude != null && !Number.isNaN(Number(l.longitude))
        ? Number(l.longitude)
        : null,
  };
}

function isUsCountryCode(code) {
  const c = String(code || "")
    .trim()
    .toUpperCase();
  return c === "US" || c === "USA" || c === "UNITED STATES";
}

/**
 * Travel: non-U.S. cities promote to country-only (State Dept is country-level).
 * U.S. cities stay city-level for IPAWS. Dedupes by travelLocationKey.
 * @param {Array} locations
 * @returns {Array}
 */
function normalizeTravelLocationSelections(locations) {
  const list = Array.isArray(locations) ? locations : [];
  const map = new Map();
  for (const raw of list) {
    if (!raw) continue;
    let loc = normalizeLocationSelectionRow(raw);
    if (!loc.countryCode) continue;
    if (loc.cityName && !isUsCountryCode(loc.countryCode)) {
      loc = {
        countryCode: loc.countryCode,
        countryName: loc.countryName || loc.countryCode,
        cityName: "",
        state: null,
        latitude: null,
        longitude: null,
      };
    }
    const key = travelLocationKey(loc);
    if (!key || key === "||") continue;
    if (!map.has(key)) map.set(key, loc);
  }
  return Array.from(map.values());
}

async function saveTravelAdvisorySelections(
  tenantId,
  teamId,
  userId,
  countryCodes,
  advisoryType,
  locationSelections,
  opts = {},
) {
  await ensureAdvisoryTable();
  const pool = await poolPromise;

  const isWeatherType = advisoryType === "Weather";
  // Weather requires cityName; Travel allows country-only (empty cityName) or U.S. city rows.
  let locations = Array.isArray(locationSelections)
    ? locationSelections
        .filter((l) => {
          if (!l) return false;
          const code = String(l.countryCode || "").trim();
          if (!code) return false;
          if (isWeatherType) return Boolean(String(l.cityName || "").trim());
          return true;
        })
        .map(normalizeLocationSelectionRow)
    : [];

  if (!isWeatherType) {
    locations = normalizeTravelLocationSelections(locations);
  }

  let codes = Array.isArray(countryCodes)
    ? countryCodes.filter((c) => c != null && String(c).trim() !== "")
    : [];
  if (locations.length > 0) {
    codes = [
      ...new Set([
        ...codes.map((c) => String(c).trim().toUpperCase()),
        ...locations.map((l) => l.countryCode).filter(Boolean),
      ]),
    ];
  }
  const uniqueCodes = [
    ...new Set(codes.map((c) => String(c).trim().toUpperCase())),
  ];

  // Flatten comma-joined codes (legacy "US,IN" in a single cell)
  let validCodes = [
    ...new Set(
      uniqueCodes.flatMap((code) =>
        String(code)
          .split(",")
          .map((c) => c.trim().toUpperCase())
          .filter(Boolean),
      ),
    ),
  ];
  const invalidCodes = [];
  const removedLocationKeys = new Set(
    Array.isArray(opts.removedLocationKeys)
      ? opts.removedLocationKeys.map((k) => String(k))
      : [],
  );
  const removedCountryCodes = new Set(
    Array.isArray(opts.removedCountryCodes)
      ? opts.removedCountryCodes.map((c) => String(c).trim().toUpperCase())
      : [],
  );

  // Weather: exactly one Advisory row per tenant.
  // Always MERGE new countries/cities onto existing; remove only when explicitly listed.
  if (advisoryType === "Weather") {
    let deletedCount = 0;

    const existingResult = await pool
      .request()
      .input("TenantId", sql.NVarChar(256), tenantId || "")
      .input("AdvisoryType", sql.NVarChar(50), advisoryType).query(`
        SELECT TOP 1 Id, CountryCode, SelectedLocationsJson
        FROM dbo.Advisory
        WHERE TenantId = @TenantId AND AdvisoryType = @AdvisoryType
        ORDER BY Id ASC
      `);
    const existingRow =
      existingResult.recordset && existingResult.recordset[0]
        ? existingResult.recordset[0]
        : null;

    let existingLocs = [];
    if (existingRow && existingRow.SelectedLocationsJson) {
      try {
        const parsed = JSON.parse(existingRow.SelectedLocationsJson);
        if (Array.isArray(parsed)) existingLocs = parsed;
      } catch {
        existingLocs = [];
      }
    }
    const existingCodes = existingRow
      ? String(existingRow.CountryCode || "")
          .split(",")
          .map((c) => c.trim().toUpperCase())
          .filter(Boolean)
      : [];

    // Merge: keep old + add new; drop only explicit removals
    // replaceSelections=true: authority is the incoming list (full monitor list from client)
    const locMap = new Map();
    if (!opts.replaceSelections) {
      for (const loc of existingLocs) {
        const key = weatherLocationKey(loc);
        if (!key.startsWith("|")) locMap.set(key, loc);
      }
    }
    for (const loc of locations) {
      locMap.set(weatherLocationKey(loc), loc);
    }
    for (const key of removedLocationKeys) {
      locMap.delete(key);
    }
    for (const [key, loc] of [...locMap.entries()]) {
      const code = String(loc.countryCode || "")
        .trim()
        .toUpperCase();
      if (removedCountryCodes.has(code)) locMap.delete(key);
    }
    const mergedLocations = Array.from(locMap.values()).map((l) => ({
      countryCode: String(l.countryCode || "")
        .trim()
        .toUpperCase(),
      countryName: String(l.countryName || "").trim(),
      cityName: String(l.cityName || "").trim(),
      state: l.state != null ? String(l.state).trim() : null,
      latitude:
        l.latitude != null && !Number.isNaN(Number(l.latitude))
          ? Number(l.latitude)
          : null,
      longitude:
        l.longitude != null && !Number.isNaN(Number(l.longitude))
          ? Number(l.longitude)
          : null,
    }));

    const mergedLocationKeys = mergedLocations.map((l) => weatherLocationKey(l));
    const codeSet = new Set([
      ...(opts.replaceSelections ? [] : existingCodes),
      ...validCodes,
      ...mergedLocations.map((l) => l.countryCode).filter(Boolean),
    ]);
    for (const c of removedCountryCodes) {
      codeSet.delete(c);
    }
    validCodes = [...codeSet];

    if (validCodes.length === 0 && mergedLocations.length === 0) {
      const del = await pool
        .request()
        .input("TenantId", sql.NVarChar(256), tenantId || "")
        .input("AdvisoryType", sql.NVarChar(50), advisoryType).query(`
          DELETE FROM dbo.Advisory
          WHERE TenantId = @TenantId AND AdvisoryType = @AdvisoryType
        `);
      deletedCount =
        del.rowsAffected && del.rowsAffected[0] != null
          ? del.rowsAffected[0]
          : 0;
      return { savedCount: 0, skipped: 0, invalidCodes, deletedCount };
    }

    const allCountryCodes = validCodes.join(",");
    const locationsJson = JSON.stringify(mergedLocations);
    const keepId = existingRow ? existingRow.Id : null;

    if (keepId != null) {
      const extras = await pool
        .request()
        .input("TenantId", sql.NVarChar(256), tenantId || "")
        .input("AdvisoryType", sql.NVarChar(50), advisoryType)
        .input("KeepId", sql.Int, keepId).query(`
          DELETE FROM dbo.Advisory
          WHERE TenantId = @TenantId
            AND AdvisoryType = @AdvisoryType
            AND Id <> @KeepId
        `);
      deletedCount =
        extras.rowsAffected && extras.rowsAffected[0] != null
          ? extras.rowsAffected[0]
          : 0;

      await pool
        .request()
        .input("KeepId", sql.Int, keepId)
        .input("CountryCode", sql.NVarChar(sql.MAX), allCountryCodes)
        .input("CreatedByUserId", sql.NVarChar(256), userId || "")
        .input(
          "SelectedLocationsJson",
          sql.NVarChar(sql.MAX),
          locationsJson,
        ).query(`
          UPDATE dbo.Advisory
          SET
            CountryCode = @CountryCode,
            SelectedLocationsJson = @SelectedLocationsJson,
            IsActive = 1,
            UpdatedByUserId = @CreatedByUserId,
            UpdatedAtUtc = GETUTCDATE()
          WHERE Id = @KeepId
        `);

      // Drop stale Weather AdvisoryDetail rows (by LocationKey, not country alone)
      try {
        await deleteWeatherAdvisoryDetailsNotInLocationKeys(
          keepId,
          mergedLocationKeys,
        );
      } catch (detailCleanupErr) {
        console.error(
          "saveTravelAdvisorySelections detail cleanup failed:",
          detailCleanupErr && detailCleanupErr.message,
        );
      }
    } else {
      await pool
        .request()
        .input("TenantId", sql.NVarChar(256), tenantId || "")
        .input("CountryCode", sql.NVarChar(sql.MAX), allCountryCodes)
        .input("AdvisoryType", sql.NVarChar(50), advisoryType)
        .input("CreatedByUserId", sql.NVarChar(256), userId || "")
        .input(
          "SelectedLocationsJson",
          sql.NVarChar(sql.MAX),
          locationsJson,
        ).query(`
          INSERT INTO dbo.Advisory
          (TenantId, CountryCode, AdvisoryType, IsActive, CreatedByUserId, SelectedLocationsJson)
          VALUES
          (@TenantId, @CountryCode, @AdvisoryType, 1, @CreatedByUserId, @SelectedLocationsJson)
        `);
    }

    return {
      savedCount: 1,
      skipped: 0,
      invalidCodes,
      deletedCount,
      mergedLocationCount: mergedLocations.length,
      countryCodes: validCodes,
      locationSelections: mergedLocations,
      locationKeys: mergedLocationKeys,
    };
  }

  // Travel (non-Weather): persist locationSelections so chips survive reload.
  // replaceSelections=true → incoming list is authoritative; otherwise merge.
  let travelLocations = locations;
  if (!opts.replaceSelections) {
    const existingTravel = await pool
      .request()
      .input("TenantId", sql.NVarChar(256), tenantId || "")
      .input("AdvisoryType", sql.NVarChar(50), advisoryType || "Travel")
      .query(`
        SELECT TOP 1 SelectedLocationsJson
        FROM dbo.Advisory
        WHERE TenantId = @TenantId AND AdvisoryType = @AdvisoryType
        ORDER BY Id ASC
      `);
    let existingLocs = [];
    const existingRow =
      existingTravel.recordset && existingTravel.recordset[0]
        ? existingTravel.recordset[0]
        : null;
    if (existingRow && existingRow.SelectedLocationsJson) {
      try {
        const parsed = JSON.parse(existingRow.SelectedLocationsJson);
        if (Array.isArray(parsed)) existingLocs = parsed;
      } catch {
        existingLocs = [];
      }
    }
    const locMap = new Map();
    for (const loc of existingLocs) {
      const key = travelLocationKey(loc);
      if (key && key !== "||") {
        locMap.set(key, normalizeLocationSelectionRow(loc));
      }
    }
    for (const loc of locations) {
      locMap.set(travelLocationKey(loc), loc);
    }
    for (const key of removedLocationKeys) {
      locMap.delete(key);
    }
    for (const [key, loc] of [...locMap.entries()]) {
      const code = String(loc.countryCode || "")
        .trim()
        .toUpperCase();
      if (removedCountryCodes.has(code)) locMap.delete(key);
    }
    travelLocations = normalizeTravelLocationSelections(
      Array.from(locMap.values()),
    );
    if (travelLocations.length > 0) {
      validCodes = [
        ...new Set([
          ...validCodes,
          ...travelLocations.map((l) => l.countryCode).filter(Boolean),
        ]),
      ];
      for (const c of removedCountryCodes) {
        validCodes = validCodes.filter((code) => code !== c);
      }
    }
  }

  // Travel uses one Advisory row with comma-joined CountryCode.
  // Only wipe the row when the selection is fully cleared — never match
  // "US,FR" against individual codes (that would delete on every save).
  let deletedCount = 0;
  if (validCodes.length === 0 && travelLocations.length === 0) {
    const del = await deleteAdvisoryForTenantNotInCountryCodes(
      tenantId,
      [],
      advisoryType,
    );
    deletedCount = del.deletedCount || 0;
  }

  let savedCount = 0;
  let skipped = 0;
  const allCountryCodes = validCodes.join(",");
  const travelLocationsJson =
    travelLocations.length > 0 ? JSON.stringify(travelLocations) : null;

  if (validCodes.length === 0 && travelLocations.length === 0) {
    return {
      savedCount: 0,
      skipped,
      invalidCodes,
      deletedCount,
      locationSelections: [],
      countryCodes: [],
    };
  }

  const req = pool
    .request()
    .input("TenantId", sql.NVarChar(256), tenantId || "")
    .input("CountryCode", sql.NVarChar(sql.MAX), allCountryCodes)
    .input("AdvisoryType", sql.NVarChar(50), advisoryType)
    .input("CreatedByUserId", sql.NVarChar(256), userId || "")
    .input(
      "SelectedLocationsJson",
      sql.NVarChar(sql.MAX),
      travelLocationsJson,
    );

  await req.query(`
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
        SelectedLocationsJson = @SelectedLocationsJson,
        IsActive = 1,
        UpdatedByUserId = @CreatedByUserId,
        UpdatedAtUtc = GETUTCDATE()
    WHERE TenantId = @TenantId
      AND AdvisoryType = @AdvisoryType;
END
ELSE
BEGIN
    INSERT INTO dbo.Advisory
    (TenantId, CountryCode, AdvisoryType, IsActive, CreatedByUserId, SelectedLocationsJson)
    VALUES
    (@TenantId, @CountryCode, @AdvisoryType, 1, @CreatedByUserId, @SelectedLocationsJson);
END
`);
  savedCount = 1;
  return {
    savedCount,
    skipped,
    invalidCodes,
    deletedCount,
    locationSelections: travelLocations,
    countryCodes: validCodes,
  };
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
async function getActiveSelectedCountriesForTenantTeam(
  tenantId,
  teamId,
  advisorytype,
) {
  const pool = await poolPromise;
  const result = await pool
    .request()
    .input("TenantId", sql.NVarChar(256), tenantId || "")
    .input("AdvisoryType", sql.NVarChar(50), advisorytype || "").query(`
    SELECT s.Id AS TravelAdvisorySelectedCountriesId, s.TenantId, s.CountryCode
    FROM [dbo].[Advisory] s
    WHERE s.TenantId = @TenantId AND s.IsActive = 1 and AdvisoryType=@AdvisoryType
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
  const fkCol = await getAdvisoryDetailFkColumn();
  const result = await pool.request().input("selectedId", sql.Int, selectedId)
    .query(`
      SELECT Level, LevelNumber, Summary, Description, Link, LastUpdatedAtUtc
      FROM [dbo].[AdvisoryDetail]
      WHERE [${fkCol}] = @selectedId
    `);
  const rows = result.recordset || [];
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    Level: row.Level,
    LevelNumber: row.LevelNumber,
    Summary: row.Summary,
    Description: row.Description,
    Link: row.Link,
    LastUpdated: row.LastUpdatedAtUtc,
  };
}

/**
 * Get saved Travel country-level AdvisoryDetail for selection + country code.
 * @param {number} selectedId
 * @param {string} countryCode
 * @returns {Promise<{ Level, LevelNumber, Summary, Description, Link, LastUpdated }|null>}
 */
async function getSavedAdvisoryForSelectedIdAndCountry(selectedId, countryCode) {
  if (selectedId == null) return null;
  const code = String(countryCode || "")
    .trim()
    .toUpperCase();
  if (!code) return null;
  const pool = await poolPromise;
  const fkCol = await getAdvisoryDetailFkColumn();
  const result = await pool
    .request()
    .input("selectedId", sql.Int, selectedId)
    .input("CountryCode", sql.NVarChar(50), code).query(`
      SELECT TOP 1 Level, LevelNumber, Summary, Description, Link, LastUpdatedAtUtc
      FROM [dbo].[AdvisoryDetail]
      WHERE [${fkCol}] = @selectedId
        AND UPPER(LTRIM(RTRIM(CountryCode))) = @CountryCode
        AND LocationKey IS NULL
    `);
  const rows = result.recordset || [];
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    Level: row.Level,
    LevelNumber: row.LevelNumber,
    Summary: row.Summary,
    Description: row.Description,
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
 * @param {string} AdvisoryType
 * @param {string} [locationKey] - Weather: COUNTRY|cityName|state — one detail row per city
 * @returns {Promise<number>} AdvisoryDetail.Id
 */
async function upsertSavedAdvisory(
  selectedId,
  countryCode,
  advisory,
  jobRunAt,
  AdvisoryType,
  locationKey,
) {
  await ensureAllTravelAdvisoryTables();
  const pool = await poolPromise;
  const code = countryCode != null ? String(countryCode).trim() : "";
  const locKey =
    locationKey != null && String(locationKey).trim() !== ""
      ? String(locationKey).trim()
      : null;

  // Common
  const syncedAtUtc = jobRunAt instanceof Date ? jobRunAt : new Date(jobRunAt);

  // ----------------------
  // WEATHER
  // ----------------------
  const isWeather = AdvisoryType === "Weather";

  const feedId = isWeather
    ? (advisory[0]?.alertId?.toString().slice(0, 50) ?? null)
    : (advisory?.id?.toString().slice(0, 50) ?? null);

  const title = isWeather
    ? (advisory[0]?.description?.localized?.toString().slice(0, 500) ?? null)
    : (advisory?.title?.toString().slice(0, 500) ?? null);

  const level = isWeather
    ? (advisory[0]?.level?.toString().slice(0, 100) ?? null)
    : (advisory?.level?.toString().slice(0, 100) ?? null);

  const levelNumber = isWeather
    ? null
    : advisory?.levelNumber != null && !Array.isArray(advisory)
      ? Number(advisory.levelNumber)
      : null;

  const link = isWeather
    ? (advisory[0]?.source ?? 0)
    : (advisory?.link?.toString().slice(0, 500) ?? null);

  const publishedDate = isWeather
    ? null
    : (advisory?.pubDate?.toString().slice(0, 100) ?? null);

  const description = isWeather
    ? (advisory?.alertAreas?.[0]?.alertDetails?.toString() ?? null)
    : (advisory?.description?.toString() ?? null);

  const summary = isWeather ? null : (advisory?.summary?.toString() ?? null);

  const restrictions = isWeather
    ? null
    : Array.isArray(advisory?.restrictions)
      ? advisory.restrictions.join("\n")
      : (advisory?.restrictions?.toString() ?? null);

  const recommendations = isWeather
    ? null
    : Array.isArray(advisory?.recommendations)
      ? advisory.recommendations.join("\n")
      : (advisory?.recommendations?.toString() ?? null);

  const lastUpdatedAtUtc = isWeather
    ? null
    : advisory?.lastUpdated
      ? advisory.lastUpdated instanceof Date
        ? advisory.lastUpdated
        : new Date(advisory.lastUpdated)
      : null;
  const ApiResponseJson = isWeather
    ? JSON.stringify(advisory)
    : advisory?.apiResponseJson != null
      ? String(advisory.apiResponseJson)
      : advisory?.ApiResponseJson != null
        ? String(advisory.ApiResponseJson)
        : "";

  const req = pool
    .request()
    .input("TravelAdvisorySelectionId", sql.Int, selectedId)
    .input("FeedId", sql.NVarChar(50), feedId)
    .input("CountryCode", sql.NVarChar(sql.MAX), code)
    .input("LocationKey", sql.NVarChar(256), locKey)
    .input("Title", sql.NVarChar(500), title)
    .input("Level", sql.NVarChar(100), level)
    .input("LevelNumber", sql.Int, levelNumber)
    .input("Link", sql.NVarChar(500), link)
    .input("PublishedDate", sql.NVarChar(100), publishedDate)
    .input("Description", sql.NVarChar(sql.MAX), description)
    .input("Summary", sql.NVarChar(sql.MAX), summary)
    .input("AdvisoryType", sql.NVarChar(sql.MAX), AdvisoryType)
    .input("Restrictions", sql.NVarChar(sql.MAX), restrictions)
    .input("Recommendations", sql.NVarChar(sql.MAX), recommendations)
    .input("LastUpdatedAtUtc", sql.DateTime, lastUpdatedAtUtc)
    .input("SyncedAtUtc", sql.DateTime, syncedAtUtc)
    .input("ApiResponseJson", sql.NVarChar(sql.MAX), ApiResponseJson);

  const fkCol = await getAdvisoryDetailFkColumn();

  // Weather / Travel-US-city: match by LocationKey so same-country cities get separate rows.
  // Travel country-level: match by CountryCode; LocationKey stays NULL.
  const useLocationKey = Boolean(locKey);
  const mergeSql = useLocationKey
    ? `
    MERGE [dbo].[AdvisoryDetail] AS t
    USING (
      SELECT @TravelAdvisorySelectionId AS SelectionId,
             @LocationKey AS LocationKey
    ) AS s
    ON t.[${fkCol}] = s.SelectionId
      AND t.LocationKey = s.LocationKey
    WHEN MATCHED THEN
      UPDATE SET FeedId = @FeedId, CountryCode = @CountryCode, LocationKey = @LocationKey,
        Title = @Title, Level = @Level, LevelNumber = @LevelNumber,
        Link = @Link, PublishedDate = @PublishedDate, Description = @Description,
        Summary = @Summary, ApiResponseJson = @ApiResponseJson,
        Restrictions = @Restrictions, Recommendations = @Recommendations,
        LastUpdatedAtUtc = @LastUpdatedAtUtc, SyncedAtUtc = @SyncedAtUtc,
        AdvisoryType = @AdvisoryType
    WHEN NOT MATCHED THEN
      INSERT ([${fkCol}], FeedId, CountryCode, LocationKey, Title, Level, LevelNumber,
        Link, PublishedDate, ApiResponseJson, Description, Summary, AdvisoryType,
        Restrictions, Recommendations, LastUpdatedAtUtc, SyncedAtUtc)
      VALUES (@TravelAdvisorySelectionId, @FeedId, @CountryCode, @LocationKey, @Title, @Level, @LevelNumber,
        @Link, @PublishedDate, @ApiResponseJson, @Description, @Summary, @AdvisoryType,
        @Restrictions, @Recommendations, @LastUpdatedAtUtc, @SyncedAtUtc)
    OUTPUT INSERTED.Id;
  `
    : `
    MERGE [dbo].[AdvisoryDetail] AS t
    USING (
      SELECT @TravelAdvisorySelectionId AS SelectionId,
             @CountryCode AS CountryCode
    ) AS s
    ON t.[${fkCol}] = s.SelectionId
      AND t.CountryCode = s.CountryCode
      AND t.LocationKey IS NULL
    WHEN MATCHED THEN
      UPDATE SET FeedId = @FeedId, CountryCode = @CountryCode, Title = @Title, Level = @Level,
        LevelNumber = @LevelNumber, Link = @Link, PublishedDate = @PublishedDate,
        Description = @Description, Summary = @Summary, ApiResponseJson = @ApiResponseJson,
        Restrictions = @Restrictions, Recommendations = @Recommendations,
        LastUpdatedAtUtc = @LastUpdatedAtUtc, SyncedAtUtc = @SyncedAtUtc,
        AdvisoryType = @AdvisoryType
    WHEN NOT MATCHED THEN
      INSERT ([${fkCol}], FeedId, CountryCode, LocationKey, Title, Level, LevelNumber,
        Link, PublishedDate, ApiResponseJson, Description, Summary, AdvisoryType,
        Restrictions, Recommendations, LastUpdatedAtUtc, SyncedAtUtc)
      VALUES (@TravelAdvisorySelectionId, @FeedId, @CountryCode, NULL, @Title, @Level, @LevelNumber,
        @Link, @PublishedDate, @ApiResponseJson, @Description, @Summary, @AdvisoryType,
        @Restrictions, @Recommendations, @LastUpdatedAtUtc, @SyncedAtUtc)
    OUTPUT INSERTED.Id;
  `;

  const result = await req.query(mergeSql);
  const rows = result.recordset || [];
  return rows.length > 0 ? rows[0].Id : null;
}

/**
 * Delete Weather AdvisoryDetail rows for an Advisory whose LocationKey is not in the keep set.
 * Also removes legacy Weather rows that have no LocationKey (pre-migration country-only rows).
 * @param {number} advisoryId
 * @param {string[]} locationKeys
 * @returns {Promise<number>} deleted count
 */
async function deleteWeatherAdvisoryDetailsNotInLocationKeys(
  advisoryId,
  locationKeys,
) {
  if (advisoryId == null) return 0;
  await ensureAdvisoryDetailTable();
  const pool = await poolPromise;
  const fkCol = await getAdvisoryDetailFkColumn();
  const keys = Array.isArray(locationKeys)
    ? locationKeys.map((k) => String(k)).filter(Boolean)
    : [];
  const keysJson = JSON.stringify(keys);
  const result = await pool
    .request()
    .input("AdvisoryId", sql.Int, advisoryId)
    .input("keysJson", sql.NVarChar(sql.MAX), keysJson).query(`
      DELETE FROM [dbo].[AdvisoryDetail]
      WHERE [${fkCol}] = @AdvisoryId
        AND (
          LocationKey IS NULL
          OR LocationKey NOT IN (
            SELECT value FROM OPENJSON(@keysJson)
          )
        )
    `);
  return result.rowsAffected && result.rowsAffected[0] != null
    ? result.rowsAffected[0]
    : 0;
}

/**
 * Delete Travel city-level AdvisoryDetail rows (LocationKey set) not in the keep set.
 * Does not remove country-level Travel rows (LocationKey IS NULL).
 * @param {number} advisoryId
 * @param {string[]} locationKeys
 * @returns {Promise<number>}
 */
async function deleteTravelCityAdvisoryDetailsNotInLocationKeys(
  advisoryId,
  locationKeys,
) {
  if (advisoryId == null) return 0;
  await ensureAdvisoryDetailTable();
  const pool = await poolPromise;
  const fkCol = await getAdvisoryDetailFkColumn();
  const keys = Array.isArray(locationKeys)
    ? locationKeys.map((k) => String(k)).filter(Boolean)
    : [];
  const keysJson = JSON.stringify(keys);
  const result = await pool
    .request()
    .input("AdvisoryId", sql.Int, advisoryId)
    .input("keysJson", sql.NVarChar(sql.MAX), keysJson).query(`
      DELETE FROM [dbo].[AdvisoryDetail]
      WHERE [${fkCol}] = @AdvisoryId
        AND LocationKey IS NOT NULL
        AND (
          @keysJson = N'[]'
          OR LocationKey NOT IN (
            SELECT value FROM OPENJSON(@keysJson)
          )
        )
    `);
  return result.rowsAffected && result.rowsAffected[0] != null
    ? result.rowsAffected[0]
    : 0;
}

/**
 * Delete Travel country-level AdvisoryDetail rows (LocationKey NULL) not in keep set.
 * @param {number} advisoryId
 * @param {string[]} countryCodes
 * @returns {Promise<number>}
 */
async function deleteTravelCountryAdvisoryDetailsNotInCountryCodes(
  advisoryId,
  countryCodes,
) {
  if (advisoryId == null) return 0;
  await ensureAdvisoryDetailTable();
  const pool = await poolPromise;
  const fkCol = await getAdvisoryDetailFkColumn();
  const codes = Array.isArray(countryCodes)
    ? countryCodes.map((c) => String(c).trim().toUpperCase()).filter(Boolean)
    : [];
  const codesJson = JSON.stringify(codes);
  const result = await pool
    .request()
    .input("AdvisoryId", sql.Int, advisoryId)
    .input("codesJson", sql.NVarChar(sql.MAX), codesJson).query(`
      DELETE FROM [dbo].[AdvisoryDetail]
      WHERE [${fkCol}] = @AdvisoryId
        AND LocationKey IS NULL
        AND (
          @codesJson = N'[]'
          OR UPPER(LTRIM(RTRIM(CountryCode))) NOT IN (
            SELECT UPPER(LTRIM(RTRIM(value))) FROM OPENJSON(@codesJson)
          )
        )
    `);
  return result.rowsAffected && result.rowsAffected[0] != null
    ? result.rowsAffected[0]
    : 0;
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
 * @returns {Promise<{ advisories: Array<Object>, countryCodes: string[] }>}
 */
async function getTravelAdvisoryByTeamData(teamId, tenantId, AdvisoryType) {
  await ensureAdvisoryTable();
  const pool = await poolPromise;

  const tenantIdTrimmed =
    tenantId != null && String(tenantId).trim() !== ""
      ? String(tenantId).trim()
      : "";

  if (!tenantIdTrimmed) {
    return { advisories: [], countryCodes: [], locationSelections: [] };
  }

  const fkCol = await getAdvisoryDetailFkColumn();
  const advPromise = pool
    .request()
    .input("TenantId", sql.NVarChar(256), tenantIdTrimmed)
    .input("AdvisoryType", sql.NVarChar(256), AdvisoryType)
    .query(`
    SELECT d.Id, d.Title, d.Level, d.LevelNumber, d.Link, d.PublishedDate, d.Description, d.Summary,d.AdvisoryType,d.ApiResponseJson,
           d.Restrictions, d.Recommendations, d.LastUpdatedAtUtc, d.LocationKey,
           ISNULL(c.name, d.CountryCode) AS CountryName, d.CountryCode
    FROM [dbo].[AdvisoryDetail] d
    INNER JOIN [dbo].[Advisory] s ON s.Id = d.[${fkCol}]
    LEFT JOIN [dbo].[Countries] c ON UPPER(LTRIM(RTRIM(c.code))) = UPPER(LTRIM(RTRIM(d.CountryCode)))
    WHERE s.TenantId = @TenantId AND s.IsActive = 1 and d.AdvisoryType=@AdvisoryType
    ORDER BY ISNULL(c.name, d.CountryCode)
  `);

  const countryCodesPromise = pool
    .request()
    .input("TenantId", sql.NVarChar(256), tenantIdTrimmed)
    .input("AdvisoryType", sql.NVarChar(256), AdvisoryType)
    .query(`
    SELECT CountryCode, SelectedLocationsJson
    FROM [dbo].[Advisory]
    WHERE TenantId = @TenantId AND AdvisoryType = @AdvisoryType AND IsActive = 1
    ORDER BY CountryCode
  `);

  const [advResult, countryCodesResult] = await Promise.all([
    advPromise,
    countryCodesPromise,
  ]);

  const rows = advResult.recordset || [];
  const selectionRows = countryCodesResult.recordset || [];
  const countryCodes = selectionRows
    .flatMap((r) =>
      String(r.CountryCode || "")
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean),
    )
    .filter(Boolean);

  let locationSelections = [];
  for (const r of selectionRows) {
    if (!r.SelectedLocationsJson) continue;
    try {
      const parsed = JSON.parse(r.SelectedLocationsJson);
      if (Array.isArray(parsed)) {
        locationSelections = locationSelections.concat(parsed);
      }
    } catch {
      // ignore invalid JSON
    }
  }
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
      AdvisoryType: r.AdvisoryType ?? null,
      ApiResponseJson: r.ApiResponseJson ?? "",
      LocationKey: r.LocationKey != null ? String(r.LocationKey) : null,
    };
  });

  // Backfill State Dept rows that were saved before RSS content/description fix
  if (
    String(AdvisoryType || "").trim().toLowerCase() === "travel" &&
    advisories.length > 0
  ) {
    await backfillEmptyTravelDescriptionsFromFeed(advisories);
  }

  return { advisories, countryCodes, locationSelections };
}

/**
 * When Summary/Description were stored empty ("No summary available"/null) because
 * rss-parser puts HTML in item.content, refresh those fields from the live feed
 * and persist onto AdvisoryDetail so the Travel UI stops showing "-".
 * @param {Array<object>} advisories - mutable list from getTravelAdvisoryByTeamData
 */
async function backfillEmptyTravelDescriptionsFromFeed(advisories) {
  const list = Array.isArray(advisories) ? advisories : [];
  const needs = list.filter((a) => {
    if (a == null) return false;
    // Skip IPAWS city-level rows
    if (a.LocationKey) return false;
    const desc = String(a.description || "").trim();
    const sum = String(a.summary || "").trim();
    return (
      !desc ||
      !sum ||
      sum === "No summary available" ||
      sum === "-" ||
      desc === "-"
    );
  });
  if (needs.length === 0) return;

  let feedList = [];
  try {
    const travelAdvisory = require("./travel-advisory-feed");
    feedList = await travelAdvisory.getProcessedAdvisories();
  } catch (err) {
    console.error(
      "backfillEmptyTravelDescriptionsFromFeed feed fetch failed:",
      err && err.message ? err.message : err,
    );
    return;
  }

  const byCode = {};
  for (const adv of feedList) {
    const code = String(adv.countryCode || "")
      .trim()
      .toUpperCase();
    if (code) byCode[code] = adv;
  }

  const pool = await poolPromise;
  for (const a of needs) {
    const code = String(a.countryCode || "")
      .trim()
      .toUpperCase();
    const feedAdv = byCode[code];
    if (!feedAdv) continue;
    const detailId = a.id != null ? Number(a.id) : NaN;
    if (!Number.isFinite(detailId)) continue;

    const description =
      feedAdv.description != null ? String(feedAdv.description) : null;
    const summary =
      feedAdv.summary != null ? String(feedAdv.summary) : null;
    if (!description && (!summary || summary === "No summary available")) {
      continue;
    }

    try {
      await pool
        .request()
        .input("Id", sql.Int, detailId)
        .input("Description", sql.NVarChar(sql.MAX), description)
        .input("Summary", sql.NVarChar(sql.MAX), summary)
        .input(
          "Title",
          sql.NVarChar(500),
          feedAdv.title != null ? String(feedAdv.title).slice(0, 500) : null,
        )
        .input(
          "Level",
          sql.NVarChar(100),
          feedAdv.level != null ? String(feedAdv.level).slice(0, 100) : null,
        )
        .input(
          "LevelNumber",
          sql.Int,
          feedAdv.levelNumber != null ? Number(feedAdv.levelNumber) : null,
        )
        .input(
          "Link",
          sql.NVarChar(500),
          feedAdv.link != null ? String(feedAdv.link).slice(0, 500) : null,
        ).query(`
          UPDATE [dbo].[AdvisoryDetail]
          SET Description = @Description,
              Summary = @Summary,
              Title = COALESCE(@Title, Title),
              Level = COALESCE(@Level, Level),
              LevelNumber = COALESCE(@LevelNumber, LevelNumber),
              Link = COALESCE(@Link, Link),
              SyncedAtUtc = SYSUTCDATETIME()
          WHERE Id = @Id
        `);

      a.description = description || a.description;
      a.summary = summary || a.summary;
      if (feedAdv.title) a.title = String(feedAdv.title);
      if (feedAdv.level) a.level = String(feedAdv.level);
      if (feedAdv.levelNumber != null) a.levelNumber = Number(feedAdv.levelNumber);
      if (feedAdv.link) a.link = String(feedAdv.link);
    } catch (updErr) {
      console.error(
        `backfillEmptyTravelDescriptionsFromFeed update failed for ${code}:`,
        updErr && updErr.message ? updErr.message : updErr,
      );
    }
  }
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
      SELECT TOP (@limit) Id, TravelAdvisorySelectionId, TravelAdvisoryDetailId, CountryCode, FieldName, OldValue, NewValue, JobRunAtUtc
      FROM [dbo].[AdvisoryChangeLog]
      WHERE TravelAdvisorySelectionId = @id
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

/**
 * Get all active Weather selections expanded to one row per city from SelectedLocationsJson.
 * Falls back to country-level coords from Countries when a city has no lat/lon.
 * @returns {Promise<Array<{ TravelAdvisorySelectedCountriesId: number, TenantId: string, CountryCode: string, LocationKey: string|null, cityName: string|null, state: string|null, latitude: number|null, longitude: number|null }>>}
 */
async function getActiveWeatherSelectedLocations() {
  await ensureAdvisoryTable();
  const pool = await poolPromise;
  const result = await pool.request().query(`
    SELECT
      s.Id AS TravelAdvisorySelectedCountriesId,
      s.TenantId,
      s.CountryCode,
      s.SelectedLocationsJson,
      c.latitude AS CountryLatitude,
      c.longitude AS CountryLongitude
    FROM [dbo].[Advisory] s
    LEFT JOIN [dbo].[Countries] c
      ON UPPER(LTRIM(RTRIM(s.CountryCode))) = UPPER(LTRIM(RTRIM(c.code)))
    WHERE s.AdvisoryType = 'Weather' AND s.IsActive = 1
    ORDER BY s.Id
  `);
  const rows = result.recordset || [];
  const expanded = [];

  for (const row of rows) {
    let locs = [];
    if (row.SelectedLocationsJson) {
      try {
        const parsed = JSON.parse(row.SelectedLocationsJson);
        if (Array.isArray(parsed)) locs = parsed;
      } catch {
        locs = [];
      }
    }

    if (locs.length === 0) {
      const code = String(row.CountryCode || "")
        .split(",")
        .map((c) => c.trim().toUpperCase())
        .filter(Boolean)[0];
      if (!code) continue;
      expanded.push({
        TravelAdvisorySelectedCountriesId: row.TravelAdvisorySelectedCountriesId,
        TenantId: row.TenantId,
        CountryCode: code,
        LocationKey: null,
        cityName: null,
        state: null,
        latitude: row.CountryLatitude ?? null,
        longitude: row.CountryLongitude ?? null,
      });
      continue;
    }

    for (const loc of locs) {
      const countryCode = String(loc.countryCode || "")
        .trim()
        .toUpperCase();
      if (!countryCode) continue;
      const lat =
        loc.latitude != null && !Number.isNaN(Number(loc.latitude))
          ? Number(loc.latitude)
          : null;
      const lon =
        loc.longitude != null && !Number.isNaN(Number(loc.longitude))
          ? Number(loc.longitude)
          : null;
      expanded.push({
        TravelAdvisorySelectedCountriesId: row.TravelAdvisorySelectedCountriesId,
        TenantId: row.TenantId,
        CountryCode: countryCode,
        LocationKey: weatherLocationKey(loc),
        cityName: loc.cityName != null ? String(loc.cityName) : null,
        state: loc.state != null ? String(loc.state) : null,
        latitude: lat,
        longitude: lon,
      });
    }
  }

  return expanded;
}

/**
 * Get all active Weather-type selections with coordinates from Countries table.
 * @deprecated Prefer getActiveWeatherSelectedLocations for per-city coords.
 * @returns {Promise<Array<{ TravelAdvisorySelectedCountriesId: number, TenantId: string, CountryCode: string, latitude: number|null, longitude: number|null }>>}
 */
async function getActiveWeatherSelectedCountries() {
  return getActiveWeatherSelectedLocations();
}

/**
 * Active Travel selections expanded to U.S. city rows only (for IPAWS sync).
 * @returns {Promise<Array<{ TravelAdvisorySelectedCountriesId: number, TenantId: string, CountryCode: string, LocationKey: string, cityName: string, state: string|null, latitude: number|null, longitude: number|null, countryName: string|null }>>}
 */
async function getActiveTravelUsCityLocations() {
  await ensureAdvisoryTable();
  const pool = await poolPromise;
  const result = await pool.request().query(`
    SELECT
      s.Id AS TravelAdvisorySelectedCountriesId,
      s.TenantId,
      s.CountryCode,
      s.SelectedLocationsJson
    FROM [dbo].[Advisory] s
    WHERE s.AdvisoryType = 'Travel' AND s.IsActive = 1
    ORDER BY s.Id
  `);

  const expanded = [];
  for (const row of result.recordset || []) {
    let locs = [];
    if (row.SelectedLocationsJson) {
      try {
        const parsed = JSON.parse(row.SelectedLocationsJson);
        if (Array.isArray(parsed)) locs = parsed;
      } catch {
        locs = [];
      }
    }

    for (const loc of locs) {
      const countryCode = String(loc.countryCode || "")
        .trim()
        .toUpperCase();
      if (!isUsCountryCode(countryCode)) continue;
      const cityName =
        loc.cityName != null ? String(loc.cityName).trim() : "";
      if (!cityName) continue;

      const lat =
        loc.latitude != null && !Number.isNaN(Number(loc.latitude))
          ? Number(loc.latitude)
          : null;
      const lon =
        loc.longitude != null && !Number.isNaN(Number(loc.longitude))
          ? Number(loc.longitude)
          : null;

      expanded.push({
        TravelAdvisorySelectedCountriesId: row.TravelAdvisorySelectedCountriesId,
        TenantId: row.TenantId,
        CountryCode: countryCode,
        LocationKey: travelLocationKey({
          countryCode,
          cityName,
          state: loc.state,
        }),
        cityName,
        state: loc.state != null ? String(loc.state).trim() : null,
        latitude: lat,
        longitude: lon,
        countryName:
          loc.countryName != null ? String(loc.countryName).trim() : "United States",
      });
    }
  }

  return expanded;
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
  weatherLocationKey,
  travelLocationKey,
  normalizeTravelLocationSelections,
  deleteTravelCityAdvisoryDetailsNotInLocationKeys,
  deleteTravelCountryAdvisoryDetailsNotInCountryCodes,
  getActiveSelectedCountries,
  getActiveSelectedCountriesForTenantTeam,
  getSelectedCountriesForTenantTeam,
  addSelectedCountry,
  getLogsForSelectedCountry,
  deactivateSelectedCountry,
  deleteSelectedCountry,
  getSavedAdvisoryForSelectedId,
  getSavedAdvisoryForSelectedIdAndCountry,
  advisoryToSnapshot,
  snapshotsEqual,
  upsertSavedAdvisory,
  deleteWeatherAdvisoryDetailsNotInLocationKeys,
  insertSelectedCountryLog,
  getTravelAdvisoryByTeamData,
  getActiveWeatherSelectedCountries,
  getActiveWeatherSelectedLocations,
  getActiveTravelUsCityLocations,
};
