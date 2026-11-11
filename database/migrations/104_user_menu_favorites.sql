-- Migration 104: a person's starred menu entries.
--
-- The left menu holds more than forty entries and a person uses a handful of them every day (owner
-- request 2026-11-10). A star on a menu entry puts it under "Favourites" at the top of the sidebar.
-- The list belongs to the person and follows them to every device, so it is kept here and not in the
-- browser. view_key is the menu entry's view name as the frontend knows it (ProductionApp NAV); the
-- API accepts known names only. position is the order the entries were starred in, 0 first. The API
-- replaces a person's whole list at once and keeps it to eight entries.

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 103)
    THROW 51104, 'Migration 103 must be applied before migration 104.', 1;
GO

BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.user_menu_favorites', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.user_menu_favorites (
        user_id bigint NOT NULL,
        view_key nvarchar(64) NOT NULL,
        position int NOT NULL,
        created_at datetime2(0) NOT NULL CONSTRAINT DF_user_menu_favorites_created_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_user_menu_favorites PRIMARY KEY (user_id, view_key),
        CONSTRAINT FK_user_menu_favorites_user FOREIGN KEY (user_id) REFERENCES dbo.users(id),
        CONSTRAINT CK_user_menu_favorites_position CHECK (position >= 0)
    );
END;

IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
    GRANT SELECT, INSERT, DELETE ON OBJECT::dbo.user_menu_favorites TO [iot_team_app_role];

COMMIT TRANSACTION;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 104)
    INSERT dbo.schema_versions(version, name)
    VALUES (104, N'Menu favourites per person');
GO
