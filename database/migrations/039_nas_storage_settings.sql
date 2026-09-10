SET XACT_ABORT ON;

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 39)
    RETURN;

BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.nas_storage_settings', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.nas_storage_settings (
        id tinyint NOT NULL CONSTRAINT PK_nas_storage_settings PRIMARY KEY
            CONSTRAINT CK_nas_storage_settings_singleton CHECK (id = 1),
        server_name nvarchar(255) NOT NULL,
        share_name nvarchar(255) NOT NULL,
        destination_path nvarchar(1000) NOT NULL,
        username nvarchar(255) NOT NULL,
        updated_by bigint NOT NULL CONSTRAINT FK_nas_storage_settings_user REFERENCES dbo.users(id),
        updated_at datetime2(0) NOT NULL CONSTRAINT DF_nas_storage_settings_updated_at DEFAULT SYSUTCDATETIME(),
        row_version rowversion NOT NULL
    );
END;

INSERT dbo.schema_versions(version, name)
VALUES (39, N'NAS storage connection draft settings');

COMMIT TRANSACTION;
