-- Indexes for the cron jobs' hot queries (reminders, SOS reminders, active-tenant
-- filter) and the dashboard's last-run lookup. Indexes only: no new tables or
-- columns. Safe to re-run; an index is skipped if it already exists or if one
-- of its columns is missing.
--
-- Run delivery-status-indexes.sql first (it adds the MSTeamsTeamsUsers(user_id)
-- and MSTeamsMemberResponses(inc_id, user_id) indexes the reminder query uses).
--
-- Run off-peak: on Basic/Standard tiers indexes are built offline (table locked
-- while each one builds).

-- 1) SOS reminder jobs (every 2 min): recent, open SOS rows
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MSTeamsAssistance_LastUpdatedDateTime'
               AND object_id = OBJECT_ID('dbo.MSTeamsAssistance'))
   AND COL_LENGTH('dbo.MSTeamsAssistance', 'LastUpdatedDateTime') IS NOT NULL
   AND COL_LENGTH('dbo.MSTeamsAssistance', 'AfterAcknowledgementNoResponseCount') IS NOT NULL
BEGIN
  CREATE NONCLUSTERED INDEX IX_MSTeamsAssistance_LastUpdatedDateTime
    ON dbo.MSTeamsAssistance (LastUpdatedDateTime)
    INCLUDE (user_id, FIRST_RESPONDER, FIRST_RESPONDER_RESPONDED_AT, status,
             AfterAcknowledgementResponseStatus, AfterAcknowledgementNoResponseCount);
END
GO

-- 2) Installation by team: active-tenant filter, company-data lookups, SOS team config
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MSTeamsInstallationDetails_TeamId'
               AND object_id = OBJECT_ID('dbo.MSTeamsInstallationDetails'))
BEGIN
  CREATE NONCLUSTERED INDEX IX_MSTeamsInstallationDetails_TeamId
    ON dbo.MSTeamsInstallationDetails (team_id)
    INCLUDE (uninstallation_date, SubscriptionDetailsId);
END
GO

-- 3) Installation by tenant: tenant-level active filter (advisory/consent jobs)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MSTeamsInstallationDetails_UserTenantId'
               AND object_id = OBJECT_ID('dbo.MSTeamsInstallationDetails'))
BEGIN
  CREATE NONCLUSTERED INDEX IX_MSTeamsInstallationDetails_UserTenantId
    ON dbo.MSTeamsInstallationDetails (user_tenant_id)
    INCLUDE (uninstallation_date, SubscriptionDetailsId);
END
GO

-- 4) Open incidents with reminders enabled: drives the reminder query
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MSTeamsIncidents_Reminders'
               AND object_id = OBJECT_ID('dbo.MSTeamsIncidents'))
   AND COL_LENGTH('dbo.MSTeamsIncidents', 'EnableSendReminders') IS NOT NULL
BEGIN
  CREATE NONCLUSTERED INDEX IX_MSTeamsIncidents_Reminders
    ON dbo.MSTeamsIncidents (EnableSendReminders, INC_STATUS_ID)
    INCLUDE (team_id, inc_type, SendRemindersCount, SendRemindersTime);
END
GO

-- 5) Sub-events by incident: recurring reminders, dashboard lastRunAt lookup
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MSTEAMS_SUB_EVENT_IncId'
               AND object_id = OBJECT_ID('dbo.MSTEAMS_SUB_EVENT'))
BEGIN
  CREATE NONCLUSTERED INDEX IX_MSTEAMS_SUB_EVENT_IncId
    ON dbo.MSTEAMS_SUB_EVENT (INC_ID)
    INCLUDE (LAST_RUN_AT);
END
GO

-- 6) Users by AAD object id: SOS lookups, SOS list endpoint, user-details sync
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MSTeamsTeamsUsers_UserAadObjectId'
               AND object_id = OBJECT_ID('dbo.MSTeamsTeamsUsers'))
BEGIN
  CREATE NONCLUSTERED INDEX IX_MSTeamsTeamsUsers_UserAadObjectId
    ON dbo.MSTeamsTeamsUsers (user_aadobject_id)
    INCLUDE (user_id, user_name, team_id, tenantid, LANGUAGE_ID);
END
GO

-- 7) Files by incident (looked up for every safety check / reminder)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_filesdata_IncId'
               AND object_id = OBJECT_ID('dbo.filesdata'))
BEGIN
  CREATE NONCLUSTERED INDEX IX_filesdata_IncId ON dbo.filesdata (inc_id);
END
GO
