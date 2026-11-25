-- Migration 133: Fleet, Command Center, script jobs and LINE / Teams alerts for Site Monitor.
--
-- * TMT Control Panel 2.3 adds an optional "tmtdesk" block to its heartbeat: whether TMTDesk is installed and
--   running, its version, mode, rendezvous server, helper, active sessions, capture method, health and the time of
--   its last frame. The latest report is kept on the machine's row. A valid 9-digit ID the machine reports fills
--   tmtdesk_id unless a person set the ID by hand (tmtdesk_id_manual); clearing it by hand hands it back to the agent.
-- * A TMTDesk that stays unhealthy (health other than "ok", or installed but not running) for five minutes opens a
--   TMTDeskUnhealthy incident, escalated like the others.
-- * A site can have a position (latitude / longitude) for the Command Center map.
-- * One sample per machine per minute (CPU, memory and disk use) feeds the Command Center sparklines; two days kept.
-- * Script jobs: someone with monitor.script writes a PowerShell or cmd script for chosen machines, a different person
--   with monitor.approve approves it, and only then is a RunScript command queued for each machine. Each machine's
--   exit code, output and duration are kept on its target row. The machine runs it only when its owner opted in.
-- * Alert channels: a site's incidents can also go to LINE (Messaging API push: channel access token + user/group ID)
--   and to Microsoft Teams (incoming webhook / Workflows URL). The token and the webhook URL are secrets: stored as
--   AES-256-GCM ciphertext with the CREDENTIAL_VAULT_KEYS keys, like site credentials, never in clear.
--
-- To undo: database/rollback/133_monitor_fleet_command_center.rollback.sql

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 132)
    THROW 51133, 'Migration 132 must be applied before migration 133.', 1;
GO

BEGIN TRANSACTION;

-- ── TMTDesk status on the machine row ────────────────────────────────────────
IF COL_LENGTH(N'dbo.monitor_agents', N'tmtdesk_installed') IS NULL
    ALTER TABLE dbo.monitor_agents ADD
        tmtdesk_installed       bit               NOT NULL CONSTRAINT DF_monitor_agents_tmtdesk_installed DEFAULT 0,
        tmtdesk_running         bit               NOT NULL CONSTRAINT DF_monitor_agents_tmtdesk_running DEFAULT 0,
        tmtdesk_version         nvarchar(40)      NULL,
        tmtdesk_mode            nvarchar(40)      NULL,
        tmtdesk_rendezvous      nvarchar(200)     NULL,
        tmtdesk_helper_running  bit               NOT NULL CONSTRAINT DF_monitor_agents_tmtdesk_helper DEFAULT 0,
        tmtdesk_active_sessions int               NOT NULL CONSTRAINT DF_monitor_agents_tmtdesk_sessions DEFAULT 0,
        tmtdesk_capture_method  nvarchar(40)      NULL,
        tmtdesk_health          nvarchar(40)      NULL,
        tmtdesk_last_frame_at   datetimeoffset(0) NULL,
        -- updatedUtc of TMTDesk's own status file, and when this server last received the block.
        tmtdesk_updated_at      datetimeoffset(0) NULL,
        tmtdesk_reported_at     datetimeoffset(0) NULL,
        -- First heartbeat of the current unhealthy stretch; NULL while healthy. The sweeper opens an incident after 5 min.
        tmtdesk_unhealthy_since datetimeoffset(0) NULL,
        tmtdesk_id_manual       bit               NOT NULL CONSTRAINT DF_monitor_agents_tmtdesk_manual DEFAULT 0,
        last_sample_at          datetimeoffset(0) NULL;

-- ── Site position for the map ────────────────────────────────────────────────
IF COL_LENGTH(N'dbo.monitor_sites', N'latitude') IS NULL
    ALTER TABLE dbo.monitor_sites ADD
        latitude  decimal(9,6) NULL,
        longitude decimal(9,6) NULL;

-- ── Per-minute resource samples ──────────────────────────────────────────────
IF OBJECT_ID(N'dbo.monitor_agent_samples', N'U') IS NULL
    CREATE TABLE dbo.monitor_agent_samples (
        agent_id       bigint            NOT NULL CONSTRAINT FK_monitor_agent_samples_agent REFERENCES dbo.monitor_agents(id),
        sampled_at     datetimeoffset(0) NOT NULL,
        cpu_percent    decimal(5,1)      NULL,
        memory_percent decimal(5,1)      NULL,
        disk_percent   decimal(5,1)      NULL,
        CONSTRAINT PK_monitor_agent_samples PRIMARY KEY (agent_id, sampled_at)
    );

-- ── Script jobs ──────────────────────────────────────────────────────────────
IF OBJECT_ID(N'dbo.monitor_script_jobs', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.monitor_script_jobs (
        id              bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_monitor_script_jobs PRIMARY KEY,
        -- Sent to the machine as jobId and written in its own log.
        job_key         uniqueidentifier  NOT NULL CONSTRAINT DF_monitor_script_jobs_key DEFAULT NEWID(),
        title           nvarchar(200)     NOT NULL,
        shell           nvarchar(12)      NOT NULL,
        script          nvarchar(max)     NOT NULL,
        timeout_seconds int               NOT NULL CONSTRAINT DF_monitor_script_jobs_timeout DEFAULT 300,
        note            nvarchar(1000)    NOT NULL CONSTRAINT DF_monitor_script_jobs_note DEFAULT N'',
        status          nvarchar(20)      NOT NULL CONSTRAINT DF_monitor_script_jobs_status DEFAULT N'PendingApproval',
        requested_by    bigint            NOT NULL CONSTRAINT FK_monitor_script_jobs_requested_by REFERENCES dbo.users(id),
        requested_at    datetimeoffset(0) NOT NULL CONSTRAINT DF_monitor_script_jobs_requested DEFAULT SYSUTCDATETIME(),
        decided_by      bigint            NULL CONSTRAINT FK_monitor_script_jobs_decided_by REFERENCES dbo.users(id),
        decided_at      datetimeoffset(0) NULL,
        decision_note   nvarchar(1000)    NOT NULL CONSTRAINT DF_monitor_script_jobs_decision_note DEFAULT N'',
        completed_at    datetimeoffset(0) NULL,
        row_version     rowversion        NOT NULL,
        CONSTRAINT UQ_monitor_script_jobs_key UNIQUE (job_key),
        CONSTRAINT CK_monitor_script_jobs_title CHECK (LEN(LTRIM(RTRIM(title))) > 0),
        CONSTRAINT CK_monitor_script_jobs_shell CHECK (shell IN (N'powershell', N'cmd')),
        -- 64 KB of UTF-8 is at most 65,536 characters; the API checks the exact UTF-8 size.
        CONSTRAINT CK_monitor_script_jobs_script CHECK (LEN(script) > 0 AND LEN(script) <= 65536),
        CONSTRAINT CK_monitor_script_jobs_timeout CHECK (timeout_seconds BETWEEN 1 AND 3600),
        CONSTRAINT CK_monitor_script_jobs_status CHECK (status IN (N'PendingApproval', N'Running', N'Completed', N'Rejected', N'Cancelled')),
        -- Four eyes: the person who asked cannot be the person who approves or rejects.
        CONSTRAINT CK_monitor_script_jobs_four_eyes CHECK (decided_by IS NULL OR decided_by <> requested_by),
        CONSTRAINT CK_monitor_script_jobs_decided CHECK (
            (status IN (N'PendingApproval', N'Cancelled') AND decided_by IS NULL)
            OR (status NOT IN (N'PendingApproval', N'Cancelled') AND decided_by IS NOT NULL AND decided_at IS NOT NULL))
    );
    CREATE INDEX IX_monitor_script_jobs_status ON dbo.monitor_script_jobs(status, requested_at DESC);
END;

IF OBJECT_ID(N'dbo.monitor_script_targets', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.monitor_script_targets (
        id               bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_monitor_script_targets PRIMARY KEY,
        job_id           bigint            NOT NULL CONSTRAINT FK_monitor_script_targets_job REFERENCES dbo.monitor_script_jobs(id),
        agent_id         bigint            NOT NULL CONSTRAINT FK_monitor_script_targets_agent REFERENCES dbo.monitor_agents(id),
        -- Old commands are purged after 180 days; the result stays here.
        command_id       bigint            NULL CONSTRAINT FK_monitor_script_targets_command REFERENCES dbo.monitor_commands(id) ON DELETE SET NULL,
        status           nvarchar(12)      NOT NULL CONSTRAINT DF_monitor_script_targets_status DEFAULT N'Waiting',
        exit_code        int               NULL,
        stdout           nvarchar(max)     NULL,
        stderr           nvarchar(max)     NULL,
        stdout_truncated bit               NOT NULL CONSTRAINT DF_monitor_script_targets_out_cut DEFAULT 0,
        stderr_truncated bit               NOT NULL CONSTRAINT DF_monitor_script_targets_err_cut DEFAULT 0,
        duration_ms      bigint            NULL,
        result_message   nvarchar(1000)    NULL,
        completed_at     datetimeoffset(0) NULL,
        CONSTRAINT UQ_monitor_script_targets_agent UNIQUE (job_id, agent_id),
        CONSTRAINT CK_monitor_script_targets_status CHECK (status IN (
            N'Waiting', N'Pending', N'Delivered', N'Succeeded', N'Failed', N'Rejected', N'Skipped', N'Expired', N'Cancelled'))
    );
    CREATE INDEX IX_monitor_script_targets_command ON dbo.monitor_script_targets(command_id) WHERE command_id IS NOT NULL;
    CREATE INDEX IX_monitor_script_targets_agent ON dbo.monitor_script_targets(agent_id, job_id DESC);
END;

-- ── Alert channels ───────────────────────────────────────────────────────────
IF OBJECT_ID(N'dbo.monitor_site_alert_channels', N'U') IS NULL
    CREATE TABLE dbo.monitor_site_alert_channels (
        site_id       bigint            NOT NULL CONSTRAINT FK_monitor_site_alert_channels_site REFERENCES dbo.monitor_sites(id),
        channel       nvarchar(10)      NOT NULL,
        is_enabled    bit               NOT NULL CONSTRAINT DF_monitor_site_alert_channels_enabled DEFAULT 1,
        -- LINE: the user, group or room ID messages are pushed to. Not secret. Empty for Teams.
        target        nvarchar(100)     NOT NULL CONSTRAINT DF_monitor_site_alert_channels_target DEFAULT N'',
        -- LINE channel access token or Teams webhook URL, sealed with the vault key key_id.
        secret_cipher varbinary(max)    NOT NULL,
        secret_iv     binary(12)        NOT NULL,
        secret_tag    binary(16)        NOT NULL,
        key_id        tinyint           NOT NULL,
        secret_hint   nvarchar(8)       NOT NULL CONSTRAINT DF_monitor_site_alert_channels_hint DEFAULT N'',
        last_sent_at  datetimeoffset(0) NULL,
        last_error    nvarchar(300)     NULL,
        updated_by    bigint            NOT NULL CONSTRAINT FK_monitor_site_alert_channels_user REFERENCES dbo.users(id),
        updated_at    datetimeoffset(0) NOT NULL CONSTRAINT DF_monitor_site_alert_channels_updated DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_monitor_site_alert_channels PRIMARY KEY (site_id, channel),
        CONSTRAINT CK_monitor_site_alert_channels_channel CHECK (channel IN (N'Line', N'Teams')),
        CONSTRAINT CK_monitor_site_alert_channels_cipher CHECK (DATALENGTH(secret_cipher) > 0)
    );

COMMIT TRANSACTION;
GO

-- In their own batches: the columns added above must exist when these constraints are compiled.
IF OBJECT_ID(N'dbo.CK_monitor_sites_position', N'C') IS NULL
    EXEC(N'ALTER TABLE dbo.monitor_sites ADD CONSTRAINT CK_monitor_sites_position CHECK (
        (latitude IS NULL AND longitude IS NULL)
        OR (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180));');
GO

IF OBJECT_ID(N'dbo.CK_monitor_agents_tmtdesk_sessions', N'C') IS NULL
    EXEC(N'ALTER TABLE dbo.monitor_agents ADD CONSTRAINT CK_monitor_agents_tmtdesk_sessions CHECK (tmtdesk_active_sessions >= 0);');
GO

-- ── Incidents: TMTDeskUnhealthy ──────────────────────────────────────────────
BEGIN TRANSACTION;
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_monitor_incidents_kind' AND parent_object_id = OBJECT_ID(N'dbo.monitor_incidents'))
    ALTER TABLE dbo.monitor_incidents DROP CONSTRAINT CK_monitor_incidents_kind;
ALTER TABLE dbo.monitor_incidents ADD CONSTRAINT CK_monitor_incidents_kind
    CHECK (kind IN (N'ProgramStopped', N'AgentOffline', N'TMTDeskUnhealthy'));
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_monitor_incidents_program' AND parent_object_id = OBJECT_ID(N'dbo.monitor_incidents'))
    ALTER TABLE dbo.monitor_incidents DROP CONSTRAINT CK_monitor_incidents_program;
ALTER TABLE dbo.monitor_incidents ADD CONSTRAINT CK_monitor_incidents_program
    CHECK ((kind = N'ProgramStopped' AND program_id IS NOT NULL) OR (kind IN (N'AgentOffline', N'TMTDeskUnhealthy') AND program_id IS NULL));
COMMIT TRANSACTION;
GO

-- ── Commands: RunScript has no program ───────────────────────────────────────
BEGIN TRANSACTION;
IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.monitor_commands') AND name = N'UX_monitor_commands_in_flight')
    DROP INDEX UX_monitor_commands_in_flight ON dbo.monitor_commands;
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_monitor_commands_program' AND parent_object_id = OBJECT_ID(N'dbo.monitor_commands'))
    ALTER TABLE dbo.monitor_commands DROP CONSTRAINT FK_monitor_commands_program;
ALTER TABLE dbo.monitor_commands ALTER COLUMN program_id bigint NULL;
ALTER TABLE dbo.monitor_commands ADD CONSTRAINT FK_monitor_commands_program FOREIGN KEY (program_id) REFERENCES dbo.monitor_programs(id);
-- Still one command in flight per program; script commands carry no program and do not compete.
CREATE UNIQUE INDEX UX_monitor_commands_in_flight ON dbo.monitor_commands(program_id)
    WHERE status IN (N'Pending', N'Delivered') AND program_id IS NOT NULL;

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_monitor_commands_verb' AND parent_object_id = OBJECT_ID(N'dbo.monitor_commands'))
    ALTER TABLE dbo.monitor_commands DROP CONSTRAINT CK_monitor_commands_verb;
ALTER TABLE dbo.monitor_commands ADD CONSTRAINT CK_monitor_commands_verb CHECK (verb IN (N'Start', N'Stop', N'Restart', N'Update', N'RunScript'));
ALTER TABLE dbo.monitor_commands ADD CONSTRAINT CK_monitor_commands_program
    CHECK ((verb = N'RunScript' AND program_id IS NULL) OR (verb <> N'RunScript' AND program_id IS NOT NULL));
COMMIT TRANSACTION;
GO

-- ── Permission: requesting a script ──────────────────────────────────────────
BEGIN TRANSACTION;
INSERT dbo.permissions(code, description)
SELECT v.code, v.description
FROM (VALUES
    (N'monitor.script', N'Request a script to run on monitored machines; someone with monitor.approve must approve it')
) v(code, description)
WHERE NOT EXISTS (SELECT 1 FROM dbo.permissions p WHERE p.code = v.code);

INSERT dbo.role_permissions(role_id, permission_id)
SELECT r.id, p.id
FROM dbo.roles r
CROSS JOIN dbo.permissions p
WHERE p.code = N'monitor.script'
  AND r.code IN (N'Admin', N'Engineering Manager', N'Leader', N'Engineer')
  AND NOT EXISTS (SELECT 1 FROM dbo.role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);
COMMIT TRANSACTION;
GO

IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
BEGIN
    GRANT SELECT, INSERT, DELETE ON OBJECT::dbo.monitor_agent_samples TO [iot_team_app_role];
    GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.monitor_script_jobs TO [iot_team_app_role];
    GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.monitor_script_targets TO [iot_team_app_role];
    GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.monitor_site_alert_channels TO [iot_team_app_role];
END;
GO

-- Record the version last.
IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 133)
    INSERT dbo.schema_versions(version, name)
    VALUES (133, N'Fleet, Command Center, script jobs and alert channels');
GO
