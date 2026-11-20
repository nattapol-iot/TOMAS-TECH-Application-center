-- Migration 116: a request's first approver follows its discipline.
--
-- Migration 097 sent a request to the head of its requester's department, then to the final approver.
-- The owner decided (2026-11-20) that it follows the request's work instead: a request for a Unit of
-- the Mechanical discipline goes to Warit, Electrical to Taweesak, Software to Tachapon, whoever raised
-- it; then to Nattapol. A request for a Unit of any other discipline (Installation) goes to Nattapol
-- alone. A request with no Unit keeps the department route of 097.
--
--   dbo.pr_discipline_approvers  the head for each discipline of dbo.project_purchase_units, seeded by
--                                email (only people with an account). final_may_decide: the final
--                                approver may decide that step in the head's place, as for the IoT
--                                department in 097.
--
-- Requests already in approval keep the steps they have. Running this again changes nothing.
--
-- To undo: database/rollback/116_pr_discipline_approvers.rollback.sql

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 115)
    THROW 51116, 'Migration 115 must be applied before migration 116.', 1;
GO

BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.pr_discipline_approvers', N'U') IS NULL
    CREATE TABLE dbo.pr_discipline_approvers (
        discipline       nvarchar(10)      NOT NULL CONSTRAINT PK_pr_discipline_approvers PRIMARY KEY,
        approver_id      bigint            NOT NULL CONSTRAINT FK_pr_discipline_approvers_user FOREIGN KEY REFERENCES dbo.users(id),
        final_may_decide bit               NOT NULL CONSTRAINT DF_pr_discipline_approvers_final_may_decide DEFAULT 0,
        updated_at       datetimeoffset(0) NOT NULL CONSTRAINT DF_pr_discipline_approvers_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_pr_discipline_approvers_discipline CHECK (LEN(discipline) > 0)
    );

INSERT dbo.pr_discipline_approvers(discipline, approver_id, final_may_decide)
SELECT route.discipline, u.id, route.final_may_decide
FROM (VALUES
    (N'ME', N'warit.c@tomastc.com',    CAST(0 AS bit)),
    (N'EE', N'taweesak.s@tomastc.com', CAST(0 AS bit)),
    (N'SW', N'tachapon.m@tomastc.com', CAST(1 AS bit))
) route(discipline, email, final_may_decide)
INNER JOIN dbo.users u ON u.email = route.email AND u.is_active = 1 AND u.deleted_at IS NULL
WHERE NOT EXISTS (SELECT 1 FROM dbo.pr_discipline_approvers d WHERE d.discipline = route.discipline);

IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
    GRANT SELECT ON OBJECT::dbo.pr_discipline_approvers TO [iot_team_app_role];

COMMIT TRANSACTION;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 116)
    INSERT dbo.schema_versions(version, name)
    VALUES (116, N'PR approvers by discipline');
GO
