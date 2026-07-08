-- Add PHONE_NUMBER column for spreadsheet-imported user phone numbers.
-- Run on existing databases. Fresh installs also get this via schema.sql.

IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE COLUMN_NAME = 'PHONE_NUMBER' AND TABLE_NAME = 'MSTeamsTeamsUsers'
)
BEGIN
  ALTER TABLE MSTeamsTeamsUsers ADD PHONE_NUMBER NVARCHAR(50) NULL
END
GO
