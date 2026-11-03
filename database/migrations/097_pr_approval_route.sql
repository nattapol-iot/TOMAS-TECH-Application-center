-- Migration 097: who approves a purchase requisition.
--
-- The owner set the route on 2026-11-03: the head of the requester's department approves, then one final approver on the
-- Engineer side, then the PR goes to the Pegasus ERP. Mechanical goes to Warit, Electrical to Taweesak and IoT to Tachapon,
-- and Nattapol is the final approver. Nattapol may decide Tachapon's step himself (both steps at once), and may approve his
-- own PR at the final step. Only the final approver is emailed; a department head is told in the app.
--
-- dbo.pr_approval_settings holds the final approver, dbo.pr_department_approvers the head of each department (matched on
-- dbo.users.department, as the employee directory spells it). A department with no row goes straight to the final approver.
-- Without a final approver (a new database) the earlier route applies: the project's PM, and the Engineering Manager for a
-- module more than 10% over its budget. The people are seeded by their company email and only when they have an account.
--
-- A step's final_may_decide marks a department step the final approver may decide in its place. PRs already waiting on the
-- Engineering Manager role are given to the final approver as their final step.

-- ── Batch 1: version guard ──────────────────────────────────────────────────
SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 96)
    THROW 51970, 'Migration 096 must be applied before migration 097.', 1;
GO

-- ── Batch 2: tables, step column and grants ─────────────────────────────────
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.pr_approval_settings', N'U') IS NULL
    CREATE TABLE dbo.pr_approval_settings (
        id                int               NOT NULL CONSTRAINT PK_pr_approval_settings PRIMARY KEY CONSTRAINT CK_pr_approval_settings_single CHECK (id = 1),
        final_approver_id bigint            NOT NULL CONSTRAINT FK_pr_approval_settings_final FOREIGN KEY REFERENCES dbo.users(id),
        updated_at        datetimeoffset(0) NOT NULL CONSTRAINT DF_pr_approval_settings_updated_at DEFAULT SYSUTCDATETIME()
    );

IF OBJECT_ID(N'dbo.pr_department_approvers', N'U') IS NULL
    CREATE TABLE dbo.pr_department_approvers (
        department       nvarchar(100)     NOT NULL CONSTRAINT PK_pr_department_approvers PRIMARY KEY,
        approver_id      bigint            NOT NULL CONSTRAINT FK_pr_department_approvers_user FOREIGN KEY REFERENCES dbo.users(id),
        final_may_decide bit               NOT NULL CONSTRAINT DF_pr_department_approvers_final_may_decide DEFAULT 0,
        updated_at       datetimeoffset(0) NOT NULL CONSTRAINT DF_pr_department_approvers_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_pr_department_approvers_department CHECK (LEN(department) > 0)
    );

IF COL_LENGTH(N'dbo.mat_pr_approval_steps', N'final_may_decide') IS NULL
    ALTER TABLE dbo.mat_pr_approval_steps ADD final_may_decide bit NOT NULL CONSTRAINT DF_mat_pr_steps_final_may_decide DEFAULT 0;

IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
BEGIN
    GRANT SELECT ON OBJECT::dbo.pr_approval_settings TO [iot_team_app_role];
    GRANT SELECT ON OBJECT::dbo.pr_department_approvers TO [iot_team_app_role];
END;

COMMIT TRANSACTION;
GO

-- ── Batch 3: the owner's route, and PRs waiting on the Engineering Manager role ─
SET XACT_ABORT ON;
BEGIN TRANSACTION;

DECLARE @final bigint = (SELECT id FROM dbo.users WHERE email = N'nattapol.p@tomastc.com' AND is_active = 1 AND deleted_at IS NULL);

IF @final IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.pr_approval_settings)
    INSERT dbo.pr_approval_settings(id, final_approver_id) VALUES (1, @final);

INSERT dbo.pr_department_approvers(department, approver_id, final_may_decide)
SELECT route.department, u.id, route.final_may_decide
FROM (VALUES
    (N'Mechanical Engineer Dept.', N'warit.c@tomastc.com',    CAST(0 AS bit)),
    (N'Electrical Engineer Dept.', N'taweesak.s@tomastc.com', CAST(0 AS bit)),
    (N'IoT Engineer Dept.',        N'tachapon.m@tomastc.com', CAST(1 AS bit))
) route(department, email, final_may_decide)
INNER JOIN dbo.users u ON u.email = route.email AND u.is_active = 1 AND u.deleted_at IS NULL
WHERE NOT EXISTS (SELECT 1 FROM dbo.pr_department_approvers d WHERE d.department = route.department);

DECLARE @configured bigint = (SELECT final_approver_id FROM dbo.pr_approval_settings WHERE id = 1);
IF @configured IS NOT NULL
    UPDATE s SET s.name = N'Final Approval', s.approver_role = NULL, s.approver_id = @configured
    FROM dbo.mat_pr_approval_steps s
    INNER JOIN dbo.mat_prs pr ON pr.id = s.pr_id
    WHERE pr.status = N'In Approval' AND pr.deleted_at IS NULL
      AND s.status IN (N'Current', N'Pending') AND s.approver_id IS NULL AND s.approver_role = N'Engineering Manager';

COMMIT TRANSACTION;
GO

-- ── Batch 4: record the version last ────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 97)
    INSERT dbo.schema_versions(version, name)
    VALUES (97, N'PR approval route');
GO
