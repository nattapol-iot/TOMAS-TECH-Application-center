-- Migration 083: Download Center download counts.
--
-- Record downloads by category, file and user so the catalog can show total downloads
-- and distinct downloaders. Resumed transfers are counted only when they start at byte zero.

SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 82)
    THROW 51830, 'Migration 082 must be applied before migration 083.', 1;
GO

BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.download_center_downloads', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.download_center_downloads (
        id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_download_center_downloads PRIMARY KEY,
        category_folder nvarchar(200) NOT NULL,
        file_name nvarchar(260) NOT NULL,
        user_id bigint NOT NULL CONSTRAINT FK_download_center_downloads_users REFERENCES dbo.users(id),
        downloaded_at datetime2(0) NOT NULL CONSTRAINT DF_download_center_downloads_downloaded_at DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_download_center_downloads_file ON dbo.download_center_downloads(category_folder, file_name);
END;

COMMIT TRANSACTION;
GO

IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
    GRANT SELECT, INSERT ON OBJECT::dbo.download_center_downloads TO [iot_team_app_role];
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 83)
    INSERT dbo.schema_versions(version, name)
    VALUES (83, N'Download Center download counts');
GO
