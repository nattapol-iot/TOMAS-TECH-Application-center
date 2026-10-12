-- Migration 076: Release deployments to monitored programs.
--
-- A program that TMT Control Panel watches on a customer machine can be updated from a TMTHub
-- release. One person requests it (the release asset is copied and its SHA-256 recorded at that
-- moment), a different person approves it, and only then is an Update command queued for the agent.
-- The agent downloads exactly those bytes, verifies the hash, backs up the program folder, applies
-- the update, checks the program runs, and rolls back by itself when it does not.
--
-- Programs also report their file version, and can name the TMTHub repository they are built from.

SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 75)
    THROW 51760, 'Migration 075 must be applied before migration 076.', 1;
GO

BEGIN TRANSACTION;

IF COL_LENGTH(N'dbo.monitor_programs', N'version') IS NULL
    ALTER TABLE dbo.monitor_programs ADD version nvarchar(100) NULL;
IF COL_LENGTH(N'dbo.monitor_programs', N'repository') IS NULL
    ALTER TABLE dbo.monitor_programs ADD repository nvarchar(100) NOT NULL
        CONSTRAINT DF_monitor_programs_repository DEFAULT N'';

IF OBJECT_ID(N'dbo.monitor_deployments', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.monitor_deployments (
        id               bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_monitor_deployments PRIMARY KEY,
        program_id       bigint            NOT NULL CONSTRAINT FK_monitor_deployments_program REFERENCES dbo.monitor_programs(id),
        agent_id         bigint            NOT NULL CONSTRAINT FK_monitor_deployments_agent REFERENCES dbo.monitor_agents(id),
        repository       nvarchar(100)     NOT NULL,
        release_tag      nvarchar(100)     NOT NULL,
        release_name     nvarchar(200)     NOT NULL CONSTRAINT DF_monitor_deployments_release_name DEFAULT N'',
        asset_name       nvarchar(255)     NOT NULL,
        asset_size       bigint            NOT NULL,
        sha256           char(64)          NOT NULL,
        -- The copy the agent downloads, under the document storage root.
        storage_key      nvarchar(500)     NOT NULL,
        status           nvarchar(20)      NOT NULL CONSTRAINT DF_monitor_deployments_status DEFAULT N'PendingApproval',
        note             nvarchar(1000)    NOT NULL CONSTRAINT DF_monitor_deployments_note DEFAULT N'',
        requested_by     bigint            NOT NULL CONSTRAINT FK_monitor_deployments_requested_by REFERENCES dbo.users(id),
        requested_at     datetimeoffset(0) NOT NULL CONSTRAINT DF_monitor_deployments_requested DEFAULT SYSUTCDATETIME(),
        decided_by       bigint            NULL CONSTRAINT FK_monitor_deployments_decided_by REFERENCES dbo.users(id),
        decided_at       datetimeoffset(0) NULL,
        decision_note    nvarchar(1000)    NOT NULL CONSTRAINT DF_monitor_deployments_decision_note DEFAULT N'',
        command_id       bigint            NULL CONSTRAINT FK_monitor_deployments_command REFERENCES dbo.monitor_commands(id),
        previous_version nvarchar(100)     NULL,
        new_version      nvarchar(100)     NULL,
        result_message   nvarchar(1000)    NULL,
        completed_at     datetimeoffset(0) NULL,
        row_version      rowversion        NOT NULL,
        CONSTRAINT CK_monitor_deployments_status CHECK (status IN (
            N'PendingApproval', N'Approved', N'Delivered', N'Succeeded', N'Failed', N'RolledBack', N'Rejected', N'Cancelled', N'Expired')),
        -- Four eyes: the person who asked cannot be the person who approves or rejects.
        CONSTRAINT CK_monitor_deployments_four_eyes CHECK (decided_by IS NULL OR decided_by <> requested_by),
        CONSTRAINT CK_monitor_deployments_decided CHECK (
            (status IN (N'PendingApproval', N'Cancelled') AND decided_by IS NULL)
            OR (status NOT IN (N'PendingApproval', N'Cancelled') AND decided_by IS NOT NULL AND decided_at IS NOT NULL)),
        CONSTRAINT CK_monitor_deployments_hash CHECK (LEN(sha256) = 64 AND sha256 NOT LIKE N'%[^0-9a-f]%'),
        CONSTRAINT CK_monitor_deployments_size CHECK (asset_size > 0)
    );
    -- One open deployment per program at a time.
    CREATE UNIQUE INDEX UX_monitor_deployments_open ON dbo.monitor_deployments(program_id)
        WHERE status IN (N'PendingApproval', N'Approved', N'Delivered');
    CREATE INDEX IX_monitor_deployments_status ON dbo.monitor_deployments(status, requested_at DESC);
    CREATE INDEX IX_monitor_deployments_program ON dbo.monitor_deployments(program_id, requested_at DESC);
END;

IF COL_LENGTH(N'dbo.monitor_commands', N'deployment_id') IS NULL
    ALTER TABLE dbo.monitor_commands ADD deployment_id bigint NULL
        CONSTRAINT FK_monitor_commands_deployment REFERENCES dbo.monitor_deployments(id);

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_monitor_commands_verb' AND parent_object_id = OBJECT_ID(N'dbo.monitor_commands'))
    ALTER TABLE dbo.monitor_commands DROP CONSTRAINT CK_monitor_commands_verb;
ALTER TABLE dbo.monitor_commands ADD CONSTRAINT CK_monitor_commands_verb CHECK (verb IN (N'Start', N'Stop', N'Restart', N'Update'));
COMMIT TRANSACTION;
GO

-- In its own batch: the column added above must exist when this constraint is compiled.
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_monitor_commands_update' AND parent_object_id = OBJECT_ID(N'dbo.monitor_commands'))
    ALTER TABLE dbo.monitor_commands ADD CONSTRAINT CK_monitor_commands_update CHECK ((verb = N'Update' AND deployment_id IS NOT NULL) OR (verb <> N'Update' AND deployment_id IS NULL));
GO

BEGIN TRANSACTION;
INSERT dbo.permissions(code, description)
SELECT v.code, v.description
FROM (VALUES
    (N'monitor.deploy', N'Request a TMTHub release to be installed on a monitored program'),
    (N'monitor.approve', N'Approve or reject a requested release deployment, never their own request')
) v(code, description)
WHERE NOT EXISTS (SELECT 1 FROM dbo.permissions p WHERE p.code = v.code);

INSERT dbo.role_permissions(role_id, permission_id)
SELECT r.id, p.id
FROM dbo.roles r
CROSS JOIN dbo.permissions p
WHERE p.code IN (N'monitor.deploy', N'monitor.approve')
  AND (
       r.code IN (N'Admin', N'Engineering Manager', N'Leader')
    OR (r.code IN (N'Engineer', N'Project Manager') AND p.code = N'monitor.deploy'))
  AND NOT EXISTS (SELECT 1 FROM dbo.role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);
COMMIT TRANSACTION;
GO

IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
BEGIN
    GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.monitor_deployments TO [iot_team_app_role];
END;
GO

-- Record the version last.
IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 76)
    INSERT dbo.schema_versions(version, name)
    VALUES (76, N'Release deployments to monitored programs');
GO
