-- Migration 072: Site Monitor.
--
-- TMT Control Panel runs on the customer machines and reports to this application as an "agent":
-- the programs it watches (running or not, CPU, memory, uptime), the machine's own resources and its
-- log lines. People with monitor.control can start, stop or restart a program from the web; the
-- command is queued here and the agent picks it up. When a program stops unexpectedly, or an agent
-- stops reporting, an incident is opened and the site's responsible people are emailed in order
-- 1 → 2 → 3 until someone acknowledges it or it recovers.
--
-- An agent authenticates with a key that is shown once; only its SHA-256 hash is stored.

SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 71)
    THROW 51720, 'Migration 071 must be applied before migration 072.', 1;
GO

BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.monitor_sites', N'U') IS NULL
    CREATE TABLE dbo.monitor_sites (
        id                 bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_monitor_sites PRIMARY KEY,
        name               nvarchar(150)     NOT NULL,
        location           nvarchar(300)     NOT NULL CONSTRAINT DF_monitor_sites_location DEFAULT N'',
        description        nvarchar(1000)    NOT NULL CONSTRAINT DF_monitor_sites_description DEFAULT N'',
        -- Minutes between escalation steps (1 → 2 → 3). 0 emails all three at once.
        escalation_minutes int               NOT NULL CONSTRAINT DF_monitor_sites_escalation DEFAULT 15,
        -- An agent silent for longer than this is offline.
        offline_minutes    int               NOT NULL CONSTRAINT DF_monitor_sites_offline DEFAULT 3,
        is_active          bit               NOT NULL CONSTRAINT DF_monitor_sites_active DEFAULT 1,
        created_by         bigint            NOT NULL CONSTRAINT FK_monitor_sites_created_by REFERENCES dbo.users(id),
        created_at         datetimeoffset(0) NOT NULL CONSTRAINT DF_monitor_sites_created_at DEFAULT SYSUTCDATETIME(),
        updated_at         datetimeoffset(0) NOT NULL CONSTRAINT DF_monitor_sites_updated_at DEFAULT SYSUTCDATETIME(),
        row_version        rowversion        NOT NULL,
        CONSTRAINT UQ_monitor_sites_name UNIQUE (name),
        CONSTRAINT CK_monitor_sites_name CHECK (LEN(name) > 0),
        CONSTRAINT CK_monitor_sites_escalation CHECK (escalation_minutes BETWEEN 0 AND 1440),
        CONSTRAINT CK_monitor_sites_offline CHECK (offline_minutes BETWEEN 1 AND 120)
    );

IF OBJECT_ID(N'dbo.monitor_site_contacts', N'U') IS NULL
    CREATE TABLE dbo.monitor_site_contacts (
        site_id  bigint  NOT NULL CONSTRAINT FK_monitor_site_contacts_site REFERENCES dbo.monitor_sites(id),
        priority tinyint NOT NULL,
        user_id  bigint  NOT NULL CONSTRAINT FK_monitor_site_contacts_user REFERENCES dbo.users(id),
        CONSTRAINT PK_monitor_site_contacts PRIMARY KEY (site_id, priority),
        CONSTRAINT UQ_monitor_site_contacts_user UNIQUE (site_id, user_id),
        CONSTRAINT CK_monitor_site_contacts_priority CHECK (priority BETWEEN 1 AND 3)
    );

IF OBJECT_ID(N'dbo.monitor_agents', N'U') IS NULL
    CREATE TABLE dbo.monitor_agents (
        id                      bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_monitor_agents PRIMARY KEY,
        site_id                 bigint            NOT NULL CONSTRAINT FK_monitor_agents_site REFERENCES dbo.monitor_sites(id),
        name                    nvarchar(150)     NOT NULL,
        key_hash                char(64)          NOT NULL,
        key_hint                nvarchar(8)       NOT NULL,
        machine_name            nvarchar(128)     NULL,
        agent_version           nvarchar(40)      NULL,
        allows_control          bit               NOT NULL CONSTRAINT DF_monitor_agents_allows_control DEFAULT 0,
        host_cpu_percent        decimal(5,1)      NULL,
        host_memory_used_bytes  bigint            NULL,
        host_memory_total_bytes bigint            NULL,
        host_disk_free_bytes    bigint            NULL,
        host_disk_total_bytes   bigint            NULL,
        host_uptime_seconds     bigint            NULL,
        last_batch_id           uniqueidentifier  NULL,
        last_seen_at            datetimeoffset(0) NULL,
        is_online               bit               NOT NULL CONSTRAINT DF_monitor_agents_online DEFAULT 0,
        status_changed_at       datetimeoffset(0) NULL,
        created_by              bigint            NOT NULL CONSTRAINT FK_monitor_agents_created_by REFERENCES dbo.users(id),
        created_at              datetimeoffset(0) NOT NULL CONSTRAINT DF_monitor_agents_created_at DEFAULT SYSUTCDATETIME(),
        revoked_at              datetimeoffset(0) NULL,
        CONSTRAINT UQ_monitor_agents_key UNIQUE (key_hash),
        CONSTRAINT CK_monitor_agents_name CHECK (LEN(name) > 0),
        CONSTRAINT CK_monitor_agents_key CHECK (LEN(key_hash) = 64)
    );

IF OBJECT_ID(N'dbo.monitor_programs', N'U') IS NULL
    CREATE TABLE dbo.monitor_programs (
        id                bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_monitor_programs PRIMARY KEY,
        agent_id          bigint            NOT NULL CONSTRAINT FK_monitor_programs_agent REFERENCES dbo.monitor_agents(id),
        program_key       nvarchar(64)      NOT NULL,
        name              nvarchar(200)     NOT NULL,
        group_label       nvarchar(150)     NOT NULL CONSTRAINT DF_monitor_programs_group DEFAULT N'',
        run_as_admin      bit               NOT NULL CONSTRAINT DF_monitor_programs_admin DEFAULT 0,
        is_running        bit               NOT NULL CONSTRAINT DF_monitor_programs_running DEFAULT 0,
        cpu_percent       decimal(5,1)      NULL,
        memory_bytes      bigint            NULL,
        uptime_seconds    bigint            NULL,
        process_count     int               NOT NULL CONSTRAINT DF_monitor_programs_processes DEFAULT 0,
        status_changed_at datetimeoffset(0) NULL,
        reported_at       datetimeoffset(0) NOT NULL,
        removed_at        datetimeoffset(0) NULL,
        CONSTRAINT UQ_monitor_programs_key UNIQUE (agent_id, program_key),
        CONSTRAINT CK_monitor_programs_name CHECK (LEN(name) > 0)
    );

IF OBJECT_ID(N'dbo.monitor_logs', N'U') IS NULL
    CREATE TABLE dbo.monitor_logs (
        id          bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_monitor_logs PRIMARY KEY,
        agent_id    bigint            NOT NULL CONSTRAINT FK_monitor_logs_agent REFERENCES dbo.monitor_agents(id),
        level       nvarchar(10)      NOT NULL,
        message     nvarchar(2000)    NOT NULL,
        logged_at   datetimeoffset(3) NOT NULL,
        received_at datetimeoffset(0) NOT NULL CONSTRAINT DF_monitor_logs_received DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_monitor_logs_level CHECK (level IN (N'Info', N'Warning', N'Error'))
    );

IF OBJECT_ID(N'dbo.monitor_incidents', N'U') IS NULL
    CREATE TABLE dbo.monitor_incidents (
        id                     bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_monitor_incidents PRIMARY KEY,
        site_id                bigint            NOT NULL CONSTRAINT FK_monitor_incidents_site REFERENCES dbo.monitor_sites(id),
        agent_id               bigint            NOT NULL CONSTRAINT FK_monitor_incidents_agent REFERENCES dbo.monitor_agents(id),
        program_id             bigint            NULL CONSTRAINT FK_monitor_incidents_program REFERENCES dbo.monitor_programs(id),
        kind                   nvarchar(20)      NOT NULL,
        title                  nvarchar(300)     NOT NULL,
        opened_at              datetimeoffset(0) NOT NULL CONSTRAINT DF_monitor_incidents_opened DEFAULT SYSUTCDATETIME(),
        resolved_at            datetimeoffset(0) NULL,
        acknowledged_at        datetimeoffset(0) NULL,
        acknowledged_by        bigint            NULL CONSTRAINT FK_monitor_incidents_ack_by REFERENCES dbo.users(id),
        -- Highest contact priority emailed so far (0 = nobody yet).
        notified_level         tinyint           NOT NULL CONSTRAINT DF_monitor_incidents_level DEFAULT 0,
        last_notified_at       datetimeoffset(0) NULL,
        resolution_notified_at datetimeoffset(0) NULL,
        row_version            rowversion        NOT NULL,
        CONSTRAINT CK_monitor_incidents_kind CHECK (kind IN (N'ProgramStopped', N'AgentOffline')),
        CONSTRAINT CK_monitor_incidents_level CHECK (notified_level BETWEEN 0 AND 3),
        CONSTRAINT CK_monitor_incidents_program CHECK ((kind = N'ProgramStopped' AND program_id IS NOT NULL) OR (kind = N'AgentOffline' AND program_id IS NULL))
    );

IF OBJECT_ID(N'dbo.monitor_commands', N'U') IS NULL
    CREATE TABLE dbo.monitor_commands (
        id             bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_monitor_commands PRIMARY KEY,
        agent_id       bigint            NOT NULL CONSTRAINT FK_monitor_commands_agent REFERENCES dbo.monitor_agents(id),
        program_id     bigint            NOT NULL CONSTRAINT FK_monitor_commands_program REFERENCES dbo.monitor_programs(id),
        verb           nvarchar(10)      NOT NULL,
        status         nvarchar(12)      NOT NULL CONSTRAINT DF_monitor_commands_status DEFAULT N'Pending',
        requested_by   bigint            NOT NULL CONSTRAINT FK_monitor_commands_requested_by REFERENCES dbo.users(id),
        requested_at   datetimeoffset(0) NOT NULL CONSTRAINT DF_monitor_commands_requested DEFAULT SYSUTCDATETIME(),
        delivered_at   datetimeoffset(0) NULL,
        completed_at   datetimeoffset(0) NULL,
        result_message nvarchar(1000)    NULL,
        CONSTRAINT CK_monitor_commands_verb CHECK (verb IN (N'Start', N'Stop', N'Restart')),
        CONSTRAINT CK_monitor_commands_status CHECK (status IN (N'Pending', N'Delivered', N'Succeeded', N'Failed', N'Expired'))
    );

COMMIT TRANSACTION;
GO

-- Indexes: the agent reads its own rows, the screens read one site, the sweeper reads open incidents.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.monitor_agents') AND name = N'IX_monitor_agents_site')
    CREATE INDEX IX_monitor_agents_site ON dbo.monitor_agents(site_id) INCLUDE (is_online, revoked_at, last_seen_at);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.monitor_logs') AND name = N'IX_monitor_logs_agent_time')
    CREATE INDEX IX_monitor_logs_agent_time ON dbo.monitor_logs(agent_id, logged_at DESC) INCLUDE (level);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.monitor_logs') AND name = N'IX_monitor_logs_received')
    CREATE INDEX IX_monitor_logs_received ON dbo.monitor_logs(received_at);
-- One open incident per program (or per agent for AgentOffline: NULL program ids compare equal here).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.monitor_incidents') AND name = N'UX_monitor_incidents_open')
    CREATE UNIQUE INDEX UX_monitor_incidents_open ON dbo.monitor_incidents(agent_id, kind, program_id) WHERE resolved_at IS NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.monitor_incidents') AND name = N'IX_monitor_incidents_site')
    CREATE INDEX IX_monitor_incidents_site ON dbo.monitor_incidents(site_id, opened_at DESC);
-- One command in flight per program: a double click cannot queue two restarts.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.monitor_commands') AND name = N'UX_monitor_commands_in_flight')
    CREATE UNIQUE INDEX UX_monitor_commands_in_flight ON dbo.monitor_commands(program_id) WHERE status IN (N'Pending', N'Delivered');
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.monitor_commands') AND name = N'IX_monitor_commands_agent_status')
    CREATE INDEX IX_monitor_commands_agent_status ON dbo.monitor_commands(agent_id, status) INCLUDE (requested_at, delivered_at);
GO

-- Permissions: everyone who looks after customer systems can see the monitor; engineers and managers
-- can control programs; managers and admins configure sites, responsible people and agent keys.
BEGIN TRANSACTION;

INSERT dbo.permissions(code, description)
SELECT v.code, v.description
FROM (VALUES
    (N'monitor.read', N'View Site Monitor: program status, resources, logs and incidents'),
    (N'monitor.control', N'Start, stop and restart monitored programs and acknowledge incidents'),
    (N'monitor.manage', N'Manage monitored sites, responsible people and agent keys')
) v(code, description)
WHERE NOT EXISTS (SELECT 1 FROM dbo.permissions p WHERE p.code = v.code);

INSERT dbo.role_permissions(role_id, permission_id)
SELECT r.id, p.id
FROM dbo.roles r
CROSS JOIN dbo.permissions p
WHERE p.code IN (N'monitor.read', N'monitor.control', N'monitor.manage')
  AND (
       r.code IN (N'Admin', N'Engineering Manager', N'Leader')
    OR (r.code IN (N'Engineer', N'Project Manager') AND p.code IN (N'monitor.read', N'monitor.control'))
    OR (r.code IN (N'Engineering Coordinator', N'Management') AND p.code = N'monitor.read'))
  AND NOT EXISTS (SELECT 1 FROM dbo.role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);

COMMIT TRANSACTION;
GO

IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
BEGIN
    GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.monitor_sites TO [iot_team_app_role];
    GRANT SELECT, INSERT, DELETE ON OBJECT::dbo.monitor_site_contacts TO [iot_team_app_role];
    GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.monitor_agents TO [iot_team_app_role];
    GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.monitor_programs TO [iot_team_app_role];
    GRANT SELECT, INSERT, DELETE ON OBJECT::dbo.monitor_logs TO [iot_team_app_role];
    GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.monitor_incidents TO [iot_team_app_role];
    GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.monitor_commands TO [iot_team_app_role];
END;
GO

-- Record the version last.
IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 72)
    INSERT dbo.schema_versions(version, name)
    VALUES (72, N'Site Monitor agents, incidents and remote program control');
GO
