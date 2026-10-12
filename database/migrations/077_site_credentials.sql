-- Migration 077: Site credentials vault.
--
-- Passwords and keys for customer sites — PLC, HMI, router, Wi-Fi, VPN, database, licences — kept
-- encrypted, linked to the customer, a customer site, an installed asset or a project. The database
-- holds only AES-256-GCM ciphertext; the key lives in the API's environment (CREDENTIAL_VAULT_KEYS),
-- never in the database or its backups. Every reveal, change and removal is logged with who and when.

SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 76)
    THROW 51770, 'Migration 076 must be applied before migration 077.', 1;
GO

BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.site_credentials', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.site_credentials (
        id                bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_site_credentials PRIMARY KEY,
        customer_id       bigint            NOT NULL CONSTRAINT FK_site_credentials_customer REFERENCES dbo.customers(id),
        customer_site_id  bigint            NULL CONSTRAINT FK_site_credentials_customer_site REFERENCES dbo.customer_sites(id),
        asset_id          bigint            NULL CONSTRAINT FK_site_credentials_asset REFERENCES dbo.installed_assets(id),
        project_id        bigint            NULL CONSTRAINT FK_site_credentials_project REFERENCES dbo.projects(id),
        kind              nvarchar(20)      NOT NULL,
        label             nvarchar(200)     NOT NULL,
        username          nvarchar(300)     NOT NULL CONSTRAINT DF_site_credentials_username DEFAULT N'',
        -- Where it is used: an address, URL, SSID or host name. Not secret.
        host              nvarchar(300)     NOT NULL CONSTRAINT DF_site_credentials_host DEFAULT N'',
        secret_cipher     varbinary(max)    NOT NULL,
        secret_iv         binary(12)        NOT NULL,
        secret_tag        binary(16)        NOT NULL,
        key_id            tinyint           NOT NULL,
        notes             nvarchar(2000)    NOT NULL CONSTRAINT DF_site_credentials_notes DEFAULT N'',
        created_by        bigint            NOT NULL CONSTRAINT FK_site_credentials_created_by REFERENCES dbo.users(id),
        created_at        datetimeoffset(0) NOT NULL CONSTRAINT DF_site_credentials_created_at DEFAULT SYSUTCDATETIME(),
        updated_by        bigint            NOT NULL CONSTRAINT FK_site_credentials_updated_by REFERENCES dbo.users(id),
        updated_at        datetimeoffset(0) NOT NULL CONSTRAINT DF_site_credentials_updated_at DEFAULT SYSUTCDATETIME(),
        secret_changed_at datetimeoffset(0) NOT NULL CONSTRAINT DF_site_credentials_secret_changed DEFAULT SYSUTCDATETIME(),
        deleted_at        datetimeoffset(0) NULL,
        row_version       rowversion        NOT NULL,
        CONSTRAINT CK_site_credentials_kind CHECK (kind IN (N'Login', N'WiFi', N'VPN', N'Database', N'API', N'License', N'Other')),
        CONSTRAINT CK_site_credentials_label CHECK (LEN(LTRIM(RTRIM(label))) > 0),
        CONSTRAINT CK_site_credentials_cipher CHECK (DATALENGTH(secret_cipher) > 0)
    );
    CREATE INDEX IX_site_credentials_customer ON dbo.site_credentials(customer_id, customer_site_id) WHERE deleted_at IS NULL;
    CREATE INDEX IX_site_credentials_asset ON dbo.site_credentials(asset_id) WHERE asset_id IS NOT NULL AND deleted_at IS NULL;
END;

IF OBJECT_ID(N'dbo.site_credential_access', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.site_credential_access (
        id            bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_site_credential_access PRIMARY KEY,
        credential_id bigint            NOT NULL CONSTRAINT FK_site_credential_access_credential REFERENCES dbo.site_credentials(id),
        user_id       bigint            NOT NULL CONSTRAINT FK_site_credential_access_user REFERENCES dbo.users(id),
        action        nvarchar(20)      NOT NULL,
        client_ip     nvarchar(64)      NULL,
        occurred_at   datetimeoffset(0) NOT NULL CONSTRAINT DF_site_credential_access_occurred DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_site_credential_access_action CHECK (action IN (N'Created', N'Updated', N'SecretChanged', N'Revealed', N'Deleted'))
    );
    CREATE INDEX IX_site_credential_access_credential ON dbo.site_credential_access(credential_id, occurred_at DESC);
END;

INSERT dbo.permissions(code, description)
SELECT v.code, v.description
FROM (VALUES
    (N'credential.read', N'See which site credentials exist (labels, users, hosts), never the secret'),
    (N'credential.reveal', N'Reveal a site credential''s secret; every reveal is logged'),
    (N'credential.manage', N'Add, change and remove site credentials')
) v(code, description)
WHERE NOT EXISTS (SELECT 1 FROM dbo.permissions p WHERE p.code = v.code);

INSERT dbo.role_permissions(role_id, permission_id)
SELECT r.id, p.id
FROM dbo.roles r
CROSS JOIN dbo.permissions p
WHERE p.code IN (N'credential.read', N'credential.reveal', N'credential.manage')
  AND (
       r.code IN (N'Admin', N'Engineering Manager', N'Leader', N'Engineer')
    OR (r.code = N'Project Manager' AND p.code = N'credential.read'))
  AND NOT EXISTS (SELECT 1 FROM dbo.role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);

COMMIT TRANSACTION;
GO

IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
BEGIN
    GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.site_credentials TO [iot_team_app_role];
    -- The access log is append-only for the application.
    GRANT SELECT, INSERT ON OBJECT::dbo.site_credential_access TO [iot_team_app_role];
END;
GO

-- Record the version last.
IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 77)
    INSERT dbo.schema_versions(version, name)
    VALUES (77, N'Site credentials vault');
GO
