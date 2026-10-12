-- Migration 075: Installed Base.
--
-- The equipment and software the department has installed for customers: what is where (customer,
-- customer site, project, the Site Monitor site), what it is (category, maker, model, serial, IP,
-- firmware), and its life (installed, warranty, status, replaced by). Software can name the TMTHub
-- repository it is built from and the monitored program that runs it, which is what links an asset
-- to a remote deployment.
--
-- Every change is also an event, so an asset's history reads as a timeline rather than an audit dump.

SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 74)
    THROW 51750, 'Migration 074 must be applied before migration 075.', 1;
GO

BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.installed_assets', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.installed_assets (
        id                 bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_installed_assets PRIMARY KEY,
        -- AST-000001: derived from the identity, so numbering needs no sequence table and never repeats.
        asset_no           AS CONVERT(nvarchar(20), CONCAT(N'AST-', RIGHT(CONCAT(N'000000', CONVERT(nvarchar(20), id)), 6))) PERSISTED,
        customer_id        bigint            NOT NULL CONSTRAINT FK_installed_assets_customer REFERENCES dbo.customers(id),
        customer_site_id   bigint            NULL CONSTRAINT FK_installed_assets_customer_site REFERENCES dbo.customer_sites(id),
        project_id         bigint            NULL CONSTRAINT FK_installed_assets_project REFERENCES dbo.projects(id),
        monitor_site_id    bigint            NULL CONSTRAINT FK_installed_assets_monitor_site REFERENCES dbo.monitor_sites(id),
        monitor_program_id bigint            NULL CONSTRAINT FK_installed_assets_monitor_program REFERENCES dbo.monitor_programs(id),
        category           nvarchar(20)      NOT NULL,
        name               nvarchar(200)     NOT NULL,
        manufacturer       nvarchar(150)     NOT NULL CONSTRAINT DF_installed_assets_manufacturer DEFAULT N'',
        model              nvarchar(150)     NOT NULL CONSTRAINT DF_installed_assets_model DEFAULT N'',
        serial_no          nvarchar(150)     NOT NULL CONSTRAINT DF_installed_assets_serial DEFAULT N'',
        location_detail    nvarchar(300)     NOT NULL CONSTRAINT DF_installed_assets_location DEFAULT N'',
        ip_address         nvarchar(100)     NOT NULL CONSTRAINT DF_installed_assets_ip DEFAULT N'',
        firmware_version   nvarchar(100)     NOT NULL CONSTRAINT DF_installed_assets_firmware DEFAULT N'',
        -- TMTHub repository the software is built from (organisation repository name).
        repository         nvarchar(100)     NOT NULL CONSTRAINT DF_installed_assets_repository DEFAULT N'',
        installed_on       date              NULL,
        warranty_until     date              NULL,
        status             nvarchar(20)      NOT NULL CONSTRAINT DF_installed_assets_status DEFAULT N'Active',
        replaced_by_id     bigint            NULL CONSTRAINT FK_installed_assets_replaced_by REFERENCES dbo.installed_assets(id),
        notes              nvarchar(2000)    NOT NULL CONSTRAINT DF_installed_assets_notes DEFAULT N'',
        created_by         bigint            NOT NULL CONSTRAINT FK_installed_assets_created_by REFERENCES dbo.users(id),
        created_at         datetimeoffset(0) NOT NULL CONSTRAINT DF_installed_assets_created_at DEFAULT SYSUTCDATETIME(),
        updated_by         bigint            NOT NULL CONSTRAINT FK_installed_assets_updated_by REFERENCES dbo.users(id),
        updated_at         datetimeoffset(0) NOT NULL CONSTRAINT DF_installed_assets_updated_at DEFAULT SYSUTCDATETIME(),
        deleted_at         datetimeoffset(0) NULL,
        row_version        rowversion        NOT NULL,
        CONSTRAINT CK_installed_assets_category CHECK (category IN (
            N'Gateway', N'PLC', N'HMI', N'IPC', N'Server', N'Network', N'Sensor', N'Meter', N'Camera', N'Software', N'Other')),
        CONSTRAINT CK_installed_assets_status CHECK (status IN (N'Active', N'Spare', N'Faulty', N'Replaced', N'Retired')),
        CONSTRAINT CK_installed_assets_name CHECK (LEN(LTRIM(RTRIM(name))) > 0),
        CONSTRAINT CK_installed_assets_replaced CHECK (replaced_by_id IS NULL OR replaced_by_id <> id),
        CONSTRAINT CK_installed_assets_warranty CHECK (warranty_until IS NULL OR installed_on IS NULL OR warranty_until >= installed_on)
    );
    CREATE UNIQUE INDEX UQ_installed_assets_no ON dbo.installed_assets(asset_no);
    -- One live record per physical unit: the same maker's serial cannot be registered twice.
    CREATE UNIQUE INDEX UQ_installed_assets_serial ON dbo.installed_assets(manufacturer, serial_no)
        WHERE serial_no <> N'' AND deleted_at IS NULL;
    CREATE INDEX IX_installed_assets_customer ON dbo.installed_assets(customer_id, customer_site_id) INCLUDE (status, category) WHERE deleted_at IS NULL;
    CREATE INDEX IX_installed_assets_project ON dbo.installed_assets(project_id) WHERE project_id IS NOT NULL AND deleted_at IS NULL;
    CREATE INDEX IX_installed_assets_monitor ON dbo.installed_assets(monitor_site_id, monitor_program_id) WHERE monitor_site_id IS NOT NULL AND deleted_at IS NULL;
    CREATE INDEX IX_installed_assets_warranty ON dbo.installed_assets(warranty_until) WHERE warranty_until IS NOT NULL AND deleted_at IS NULL;
END;

IF OBJECT_ID(N'dbo.installed_asset_events', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.installed_asset_events (
        id          bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_installed_asset_events PRIMARY KEY,
        asset_id    bigint            NOT NULL CONSTRAINT FK_installed_asset_events_asset REFERENCES dbo.installed_assets(id),
        kind        nvarchar(20)      NOT NULL,
        summary     nvarchar(500)     NOT NULL,
        details     nvarchar(max)     NULL,
        -- NULL actor = recorded by the system (an agent report or a deployment result).
        actor_id    bigint            NULL CONSTRAINT FK_installed_asset_events_actor REFERENCES dbo.users(id),
        occurred_at datetimeoffset(0) NOT NULL CONSTRAINT DF_installed_asset_events_occurred DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_installed_asset_events_kind CHECK (kind IN (
            N'Installed', N'Updated', N'StatusChanged', N'FirmwareChanged', N'Moved', N'Serviced', N'Replaced', N'Deployed', N'Note', N'Deleted')),
        CONSTRAINT CK_installed_asset_events_details CHECK (details IS NULL OR ISJSON(details) = 1)
    );
    CREATE INDEX IX_installed_asset_events_asset ON dbo.installed_asset_events(asset_id, occurred_at DESC);
END;

INSERT dbo.permissions(code, description)
SELECT v.code, v.description
FROM (VALUES
    (N'asset.read', N'View the installed base: customer equipment, software and its history'),
    (N'asset.manage', N'Register, edit and retire installed equipment and software')
) v(code, description)
WHERE NOT EXISTS (SELECT 1 FROM dbo.permissions p WHERE p.code = v.code);

INSERT dbo.role_permissions(role_id, permission_id)
SELECT r.id, p.id
FROM dbo.roles r
CROSS JOIN dbo.permissions p
WHERE p.code IN (N'asset.read', N'asset.manage')
  AND (
       r.code IN (N'Admin', N'Engineering Manager', N'Leader', N'Engineer', N'Project Manager')
    OR (r.code IN (N'Engineering Coordinator', N'Management') AND p.code = N'asset.read'))
  AND NOT EXISTS (SELECT 1 FROM dbo.role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);

COMMIT TRANSACTION;
GO

IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
BEGIN
    GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.installed_assets TO [iot_team_app_role];
    GRANT SELECT, INSERT ON OBJECT::dbo.installed_asset_events TO [iot_team_app_role];
END;
GO

-- Record the version last.
IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 75)
    INSERT dbo.schema_versions(version, name)
    VALUES (75, N'Installed base: customer equipment and software');
GO
