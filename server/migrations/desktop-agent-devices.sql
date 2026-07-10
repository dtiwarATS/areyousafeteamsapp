IF NOT EXISTS (
  SELECT 1
  FROM sys.tables
  WHERE name = 'desktop_agent_devices'
)
BEGIN
  CREATE TABLE desktop_agent_devices (
    device_id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    user_aadobject_id NVARCHAR(256) NOT NULL,
    tenant_id NVARCHAR(64) NOT NULL,
    team_id NVARCHAR(256) NOT NULL,
    machine_name NVARCHAR(128) NOT NULL,
    os_version NVARCHAR(64) NOT NULL,
    agent_version NVARCHAR(32) NOT NULL,
    [current_user] NVARCHAR(128) NOT NULL,
    device_fingerprint NVARCHAR(256) NOT NULL,
    paired_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    last_seen_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    revoked_at DATETIME2 NULL,
    socket_id NVARCHAR(128) NULL,
    status NVARCHAR(16) NOT NULL DEFAULT 'offline'
  );

  CREATE INDEX IX_desktop_agent_devices_user
    ON desktop_agent_devices(user_aadobject_id);

  CREATE UNIQUE INDEX UX_desktop_agent_devices_fingerprint
    ON desktop_agent_devices(device_fingerprint)
    WHERE revoked_at IS NULL;
END
