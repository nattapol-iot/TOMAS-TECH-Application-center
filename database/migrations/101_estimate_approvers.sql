-- Migration 101: who approves an estimate.
--
-- The owner set it on 2026-11-06: an estimate sent for review is approved by one of Nattapol, Warit, Tachapon or
-- Taweesak, never by its own owner (an Admin may still decide their own, as before). Each of them is told by the
-- bell and by email when an estimate is submitted, and the estimate's owner hears of every decision.
--
-- dbo.estimate_approvers lists them, seeded by company email and only when the person has an account. While the table
-- is empty (a new database) the earlier rule applies: anyone holding estimate.approve.

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 100)
    THROW 52010, 'Migration 100 must be applied before migration 101.', 1;
GO

BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.estimate_approvers', N'U') IS NULL
    CREATE TABLE dbo.estimate_approvers (
        user_id bigint NOT NULL CONSTRAINT PK_estimate_approvers PRIMARY KEY
            CONSTRAINT FK_estimate_approvers_user FOREIGN KEY REFERENCES dbo.users(id),
        sort_order int NOT NULL CONSTRAINT DF_estimate_approvers_sort_order DEFAULT 0,
        created_at datetimeoffset(0) NOT NULL CONSTRAINT DF_estimate_approvers_created_at DEFAULT SYSUTCDATETIME()
    );

INSERT dbo.estimate_approvers(user_id, sort_order)
SELECT u.id, seed.sort_order
FROM (VALUES
    (N'nattapol.p@tomastc.com', 1),
    (N'warit.c@tomastc.com',    2),
    (N'tachapon.m@tomastc.com', 3),
    (N'taweesak.s@tomastc.com', 4)
) seed(email, sort_order)
INNER JOIN dbo.users u ON LOWER(u.email) = seed.email AND u.is_active = 1 AND u.deleted_at IS NULL
WHERE NOT EXISTS (SELECT 1 FROM dbo.estimate_approvers existing WHERE existing.user_id = u.id);

COMMIT TRANSACTION;
GO

IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
    GRANT SELECT ON OBJECT::dbo.estimate_approvers TO [iot_team_app_role];
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 101)
    INSERT dbo.schema_versions(version, name)
    VALUES (101, N'Estimate approvers');
GO
