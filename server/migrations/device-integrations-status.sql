-- Device integrations: per-device send status for New Incident device recipients.
-- Run once after device-integrations.sql. Safe to run again.
-- send_status: NULL = not sent yet, 'sent', 'failed'

IF COL_LENGTH('dbo.INCIDENT_DEVICE_RECIPIENT', 'send_status') IS NULL
  ALTER TABLE dbo.INCIDENT_DEVICE_RECIPIENT ADD send_status VARCHAR(10) NULL
GO
IF COL_LENGTH('dbo.INCIDENT_DEVICE_RECIPIENT', 'send_error') IS NULL
  ALTER TABLE dbo.INCIDENT_DEVICE_RECIPIENT ADD send_error NVARCHAR(500) NULL
GO
IF COL_LENGTH('dbo.INCIDENT_DEVICE_RECIPIENT', 'sent_at') IS NULL
  ALTER TABLE dbo.INCIDENT_DEVICE_RECIPIENT ADD sent_at DATETIME2 NULL
GO
