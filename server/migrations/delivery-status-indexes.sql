-- Indexes for safety check delivery status writes / lookups.
-- Indexes only: no new tables or columns. Safe to re-run.
--
-- Without these, every delivery-status update (WHERE inc_id = .. AND user_id = ..)
-- scans the whole table, which on a 10-20 DTU database causes timeouts and blocking.
--
-- Run off-peak: on Basic/Standard tiers the index is built offline and the table
-- is locked while it builds.
--
-- Optional check before running - lists the indexes that already exist:
--   SELECT OBJECT_NAME(i.object_id) tbl, i.name, c.name col, ic.key_ordinal, ic.is_included_column
--   FROM sys.indexes i
--   JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
--   JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
--   WHERE i.object_id IN (OBJECT_ID('dbo.MSTeamsMemberResponses'),
--                         OBJECT_ID('dbo.MSTeamsMemberResponsesRecurr'),
--                         OBJECT_ID('dbo.MSTeamsTeamsUsers'))
--   ORDER BY tbl, i.name, ic.is_included_column, ic.key_ordinal;

-- 1) MSTeamsMemberResponses (inc_id, user_id): status updates, member inserts, progress
IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes i
  JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.key_ordinal = 1
  JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
  WHERE i.object_id = OBJECT_ID('dbo.MSTeamsMemberResponses') AND c.name = 'inc_id'
)
BEGIN
  CREATE NONCLUSTERED INDEX IX_MSTeamsMemberResponses_IncId_UserId
    ON dbo.MSTeamsMemberResponses (inc_id, user_id)
    INCLUDE (is_message_delivered, message_delivery_status, LastReminderSentAT, response);
END
GO

-- 2) MSTeamsMemberResponsesRecurr (memberResponsesId, runAt): recurring status upserts
IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes i
  JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.key_ordinal = 1
  JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
  WHERE i.object_id = OBJECT_ID('dbo.MSTeamsMemberResponsesRecurr') AND c.name = 'memberResponsesId'
)
BEGIN
  CREATE NONCLUSTERED INDEX IX_MSTeamsMemberResponsesRecurr_MemberResponsesId_RunAt
    ON dbo.MSTeamsMemberResponsesRecurr (memberResponsesId, runAt);
END
GO

-- 3) MSTeamsTeamsUsers (user_id, team_id): conversationId cache / blocked flag updates
IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes i
  JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.key_ordinal = 1
  JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
  WHERE i.object_id = OBJECT_ID('dbo.MSTeamsTeamsUsers') AND c.name = 'user_id'
)
BEGIN
  CREATE NONCLUSTERED INDEX IX_MSTeamsTeamsUsers_UserId_TeamId
    ON dbo.MSTeamsTeamsUsers (user_id, team_id);
END
GO
