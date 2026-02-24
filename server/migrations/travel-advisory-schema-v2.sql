-- Migration: Travel Advisory schema v2
-- Migrates TravelAdvisorySelection -> Advisory, TravelAdvisoryDetail -> AdvisoryDetail, TravelAdvisoryChangeLog -> AdvisoryChangeLog
-- Removes TeamId, renames CountryId -> CountryCode (NVARCHAR(max)), updates indexes
-- Run this only on existing databases that have the old schema. Fresh installs use the new schema via ensure* functions.

-- Step 1: Create new Advisory table
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
GO

-- Step 2: Migrate data from TravelAdvisorySelection to Advisory (if old table exists)
IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'TravelAdvisorySelection')
AND EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Countries')
BEGIN
    SET IDENTITY_INSERT [dbo].[Advisory] ON;
    INSERT INTO [dbo].[Advisory] (Id, TenantId, CountryCode, AdvisoryType, IsActive, CreatedByUserId, CreatedAtUtc, UpdatedByUserId, UpdatedAtUtc)
    SELECT s.Id, s.TenantId, c.code, s.AdvisoryType, s.IsActive, s.CreatedByUserId, s.CreatedAtUtc, s.UpdatedByUserId, s.UpdatedAtUtc
    FROM [dbo].[TravelAdvisorySelection] s
    INNER JOIN [dbo].[Countries] c ON c.id = s.CountryId
    WHERE NOT EXISTS (SELECT 1 FROM [dbo].[Advisory] a WHERE a.Id = s.Id);
    SET IDENTITY_INSERT [dbo].[Advisory] OFF;
END
GO

-- Step 3: Create AdvisoryDetail table
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
GO

-- Step 4: Migrate TravelAdvisoryDetail to AdvisoryDetail (if old table exists)
IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'TravelAdvisoryDetail')
AND EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Countries')
BEGIN
    INSERT INTO [dbo].[AdvisoryDetail] (AdvisoryId, FeedId, CountryCode, Title, Level, LevelNumber, Link, PublishedDate, Description, Summary, Restrictions, Recommendations, LastUpdatedAtUtc, SyncedAtUtc)
    SELECT d.TravelAdvisorySelectionId, d.FeedId, c.code, d.Title, d.Level, d.LevelNumber, d.Link, d.PublishedDate, d.Description, d.Summary, d.Restrictions, d.Recommendations, d.LastUpdatedAtUtc, d.SyncedAtUtc
    FROM [dbo].[TravelAdvisoryDetail] d
    LEFT JOIN [dbo].[Countries] c ON c.id = d.CountryId
    WHERE EXISTS (SELECT 1 FROM [dbo].[Advisory] a WHERE a.Id = d.TravelAdvisorySelectionId)
    AND NOT EXISTS (SELECT 1 FROM [dbo].[AdvisoryDetail] ad WHERE ad.AdvisoryId = d.TravelAdvisorySelectionId);
END
GO

-- Step 5: Create AdvisoryChangeLog table
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
GO

-- Step 6: Migrate TravelAdvisoryChangeLog to AdvisoryChangeLog (if old table exists)
-- Note: AdvisoryDetailId set to NULL because Detail table gets new Ids on migration
IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'TravelAdvisoryChangeLog')
AND EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Countries')
BEGIN
    INSERT INTO [dbo].[AdvisoryChangeLog] (AdvisoryId, AdvisoryDetailId, CountryCode, FieldName, OldValue, NewValue, JobRunAtUtc)
    SELECT l.TravelAdvisorySelectionId, NULL, c.code, l.FieldName, l.OldValue, l.NewValue, l.JobRunAtUtc
    FROM [dbo].[TravelAdvisoryChangeLog] l
    LEFT JOIN [dbo].[Countries] c ON c.id = l.CountryId
    WHERE EXISTS (SELECT 1 FROM [dbo].[Advisory] a WHERE a.Id = l.TravelAdvisorySelectionId);
END
GO

-- Step 7: Drop old tables (run only after verifying new tables have correct data)
-- Uncomment the following when ready to complete migration:
/*
IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'TravelAdvisoryChangeLog')
    DROP TABLE [dbo].[TravelAdvisoryChangeLog];
IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'TravelAdvisoryDetail')
    DROP TABLE [dbo].[TravelAdvisoryDetail];
IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'TravelAdvisorySelection')
    DROP TABLE [dbo].[TravelAdvisorySelection];
*/
