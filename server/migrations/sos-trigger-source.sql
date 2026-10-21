-- Records where an SOS was raised from (MSTeamsAssistance.trigger_source).
-- Run on existing databases. Fresh installs also get this via schema.sql.
-- Additive + nullable: safe to re-run, existing rows stay NULL.
--
-- Values written by the API (whitelisted in AreYouSafeTabHandler.js requestAssistance):
--   DesktopButton  - Safety Check desktop agent, on-screen SOS button
--   DesktopHotkey  - Safety Check desktop agent, global SOS keyboard shortcut
--   Teams, Mobile, AICaller - reserved for the other channels (currently NULL)
--
-- The API tolerates this column being absent (SOS is still saved, a warning is
-- logged), so it can be applied before or after deploying the code.

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'MSTeamsAssistance' AND COLUMN_NAME = 'trigger_source')
BEGIN
  ALTER TABLE MSTeamsAssistance ADD trigger_source NVARCHAR(32) NULL
END
GO
