-- Device integrations (Cisco IP Phones, IP Speakers, Digital Signage, IoT Devices,
-- Audio Broadcast, Alarms & Sensors). Design: SC_Teams/docs/DEVICE_INTEGRATIONS_DESIGN.md
--
-- Replaces the cisco / ipSpeakers / digitalSignage blocks that used to live inside
-- MSTeamsInstallationDetails.INTEGRATION_CONFIGURE (single config, plaintext secrets).
-- Additive and idempotent: safe to re-run. The final section discards the old JSON keys
-- (agreed: admins reconfigure in the new UI).

------------------------------------------------------------------------------
-- 1. Per-tenant on/off switch per integration type
------------------------------------------------------------------------------
IF OBJECT_ID('dbo.DEVICE_INTEGRATION', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.DEVICE_INTEGRATION (
    id          INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    tenant_id   VARCHAR(255)   NOT NULL,
    type        VARCHAR(20)    NOT NULL,   -- cisco | speakers | signage | iot | audio | alarms
    enabled     BIT            NOT NULL CONSTRAINT DF_DEVICE_INTEGRATION_enabled DEFAULT (0),
    updated_at  DATETIME2      NOT NULL CONSTRAINT DF_DEVICE_INTEGRATION_updated_at DEFAULT (SYSUTCDATETIME()),
    updated_by  NVARCHAR(255)  NULL,
    CONSTRAINT UQ_DEVICE_INTEGRATION_tenant_type UNIQUE (tenant_id, type),
    CONSTRAINT CK_DEVICE_INTEGRATION_type CHECK (type IN ('cisco','speakers','signage','iot','audio','alarms'))
  )
END
GO

------------------------------------------------------------------------------
-- 2. Named device groups (many per tenant + type)
------------------------------------------------------------------------------
IF OBJECT_ID('dbo.DEVICE_GROUP', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.DEVICE_GROUP (
    id                  UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_DEVICE_GROUP_id DEFAULT (NEWID()) PRIMARY KEY,
    public_id           VARCHAR(40)    NOT NULL,          -- grp_xxxxxxxx (used in the alarm alert URL)
    tenant_id           VARCHAR(255)   NOT NULL,
    type                VARCHAR(20)    NOT NULL,
    name                NVARCHAR(100)  NOT NULL,
    vendor              VARCHAR(20)    NULL,              -- algo | axis | brightsign | samsung | phone | sip
    config_json         NVARCHAR(MAX)  NOT NULL CONSTRAINT DF_DEVICE_GROUP_config DEFAULT (N'{}'),  -- non-secret fields
    secrets_enc         NVARCHAR(MAX)  NULL,              -- AES-256-GCM, see server/utils/deviceSecrets.js
    notify_incident     BIT            NOT NULL CONSTRAINT DF_DEVICE_GROUP_ninc DEFAULT (1),
    notify_followup     BIT            NOT NULL CONSTRAINT DF_DEVICE_GROUP_nfol DEFAULT (1),
    devices_json        NVARCHAR(MAX)  NULL,              -- snapshot [{ref,label,meta}] taken at verify/save
    verified_at         DATETIME2      NULL,
    last_verify_result  NVARCHAR(500)  NULL,
    -- Alarms & Sensors only
    api_key_enc         NVARCHAR(500)  NULL,
    country             NVARCHAR(255)  NULL,              -- 'All' or a country
    city                NVARCHAR(255)  NULL,              -- 'All' or a city
    last_test_alert_at  DATETIME2      NULL,
    -- audit
    created_at          DATETIME2      NOT NULL CONSTRAINT DF_DEVICE_GROUP_created DEFAULT (SYSUTCDATETIME()),
    created_by          NVARCHAR(255)  NULL,
    updated_at          DATETIME2      NOT NULL CONSTRAINT DF_DEVICE_GROUP_updated DEFAULT (SYSUTCDATETIME()),
    updated_by          NVARCHAR(255)  NULL,
    is_deleted          BIT            NOT NULL CONSTRAINT DF_DEVICE_GROUP_deleted DEFAULT (0),
    CONSTRAINT UQ_DEVICE_GROUP_public_id UNIQUE (public_id),
    CONSTRAINT CK_DEVICE_GROUP_type CHECK (type IN ('cisco','speakers','signage','iot','audio','alarms'))
  )
END
GO

-- "A device group with this name already exists." (case-insensitive by default collation)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_DEVICE_GROUP_tenant_type_name')
  CREATE UNIQUE INDEX UX_DEVICE_GROUP_tenant_type_name
    ON dbo.DEVICE_GROUP (tenant_id, type, name) WHERE is_deleted = 0
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_DEVICE_GROUP_tenant_type')
  CREATE INDEX IX_DEVICE_GROUP_tenant_type ON dbo.DEVICE_GROUP (tenant_id, type) INCLUDE (is_deleted)
GO

------------------------------------------------------------------------------
-- 3. Devices the sender picked on New Incident (reused by recurring + follow-up)
------------------------------------------------------------------------------
IF OBJECT_ID('dbo.INCIDENT_DEVICE_RECIPIENT', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.INCIDENT_DEVICE_RECIPIENT (
    id              BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    incident_id     INT              NOT NULL,     -- MSTeamsIncidents.id
    group_id        UNIQUEIDENTIFIER NOT NULL,     -- DEVICE_GROUP.id
    device_ref      NVARCHAR(500)    NOT NULL,     -- phone name / address / serial / device id
    device_label    NVARCHAR(500)    NULL,
    device_message  NVARCHAR(1000)   NULL,
    created_at      DATETIME2        NOT NULL CONSTRAINT DF_IDR_created DEFAULT (SYSUTCDATETIME())
  )
  CREATE INDEX IX_IDR_incident ON dbo.INCIDENT_DEVICE_RECIPIENT (incident_id)
END
GO

------------------------------------------------------------------------------
-- 4. Inbound alerts from panic buttons / fire panels / sensors
------------------------------------------------------------------------------
IF OBJECT_ID('dbo.DEVICE_ALERT_LOG', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.DEVICE_ALERT_LOG (
    id              BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    group_id        UNIQUEIDENTIFIER NOT NULL,
    received_at     DATETIME2        NOT NULL CONSTRAINT DF_DAL_received DEFAULT (SYSUTCDATETIME()),
    is_test         BIT              NOT NULL CONSTRAINT DF_DAL_test DEFAULT (0),
    payload_format  VARCHAR(10)      NULL,          -- cap | json
    alert_ref       NVARCHAR(255)    NULL,          -- CAP identifier / JSON id / payload hash (dedupe)
    raw_payload     NVARCHAR(MAX)    NULL,
    result          VARCHAR(20)      NOT NULL,      -- sos_started | test | auth_failed | duplicate | rejected | error
    sos_id          INT              NULL           -- MSTeamsAssistance.id
  )
  CREATE INDEX IX_DAL_group_received ON dbo.DEVICE_ALERT_LOG (group_id, received_at DESC)
END
GO

------------------------------------------------------------------------------
-- 5. Discard the old single-config device blocks (agreed: admins reconfigure).
--    Also removes the plaintext passwords stored there.
------------------------------------------------------------------------------
UPDATE dbo.MSTeamsInstallationDetails
SET INTEGRATION_CONFIGURE =
      JSON_MODIFY(JSON_MODIFY(JSON_MODIFY(INTEGRATION_CONFIGURE,
        '$.channels.cisco', NULL),
        '$.channels.ipSpeakers', NULL),
        '$.channels.digitalSignage', NULL)
WHERE ISJSON(INTEGRATION_CONFIGURE) = 1
  AND (JSON_QUERY(INTEGRATION_CONFIGURE, '$.channels.cisco') IS NOT NULL
    OR JSON_QUERY(INTEGRATION_CONFIGURE, '$.channels.ipSpeakers') IS NOT NULL
    OR JSON_QUERY(INTEGRATION_CONFIGURE, '$.channels.digitalSignage') IS NOT NULL)
GO

-- Note: alarm-triggered SOS rows in MSTeamsAssistance use
-- user_id = 'system:alarm:<public_id>' (column is NOT NULL) and trigger_source = 'AlarmSensor'.
