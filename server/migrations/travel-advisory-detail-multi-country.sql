-- Revert: AdvisoryDetail multi-country support
-- Restores 1:1 Advisory->AdvisoryDetail (one row per Advisory).
-- Run this to undo travel-advisory-detail-multi-country migration.

-- Step 1: Drop the composite unique index (AdvisoryId, CountryCode)
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_AdvisoryDetail_Advisory_Country' AND object_id = OBJECT_ID(N'[dbo].[AdvisoryDetail]'))
    DROP INDEX [UX_AdvisoryDetail_Advisory_Country] ON [dbo].[AdvisoryDetail];
GO

-- Step 2: Remove duplicate AdvisoryDetail rows (keep one per AdvisoryId; highest Id wins)
-- Skip if no duplicates; required before adding unique index
;WITH CTE AS (
    SELECT Id, AdvisoryId, ROW_NUMBER() OVER (PARTITION BY AdvisoryId ORDER BY Id DESC) AS rn
    FROM [dbo].[AdvisoryDetail]
)
DELETE FROM CTE WHERE rn > 1;
GO

-- Step 3: Re-add the 1:1 unique index
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_AdvisoryDetail_Advisory' AND object_id = OBJECT_ID(N'[dbo].[AdvisoryDetail]'))
    CREATE UNIQUE NONCLUSTERED INDEX [UX_AdvisoryDetail_Advisory]
        ON [dbo].[AdvisoryDetail] ([AdvisoryId]);
GO
