-- Migration 065: the team a project belongs to, the customer payments received, and the
-- customer contacts the project talks to.
--
-- projects.team is a department name as the employee directory spells it; it is a label
-- for grouping, not a permission. Payment milestones record only THAT a payment stage was
-- received, never an amount: commercial figures stay out of this application. Contacts
-- point at the customer's existing site contacts, so a phone number is changed once, on
-- the customer.
--
-- Both child tables cascade from dbo.projects, so dbo.delete_unstarted_project removes
-- them with the project without a change of its own.

-- ── Batch 1: columns, tables and grants ─────────────────────────────────────
SET XACT_ABORT ON;
SET NOCOUNT ON;
BEGIN TRANSACTION;

IF COL_LENGTH(N'dbo.projects', N'team') IS NULL
    ALTER TABLE dbo.projects ADD team nvarchar(100) NULL;

IF OBJECT_ID(N'dbo.project_payment_milestones', N'U') IS NULL
    CREATE TABLE dbo.project_payment_milestones (
        project_id  bigint            NOT NULL,
        milestone   nvarchar(20)      NOT NULL,
        received_by bigint            NOT NULL CONSTRAINT FK_project_payment_milestones_user REFERENCES dbo.users(id),
        received_at datetimeoffset(0) NOT NULL CONSTRAINT DF_project_payment_milestones_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_project_payment_milestones PRIMARY KEY (project_id, milestone),
        CONSTRAINT FK_project_payment_milestones_project FOREIGN KEY (project_id) REFERENCES dbo.projects(id) ON DELETE CASCADE,
        CONSTRAINT CK_project_payment_milestones_milestone CHECK (milestone IN (N'AFTER_PO', N'AFTER_DESIGN', N'AFTER_INSTALL', N'GO_LIVE'))
    );

IF OBJECT_ID(N'dbo.project_contacts', N'U') IS NULL
    CREATE TABLE dbo.project_contacts (
        project_id bigint            NOT NULL,
        contact_id bigint            NOT NULL CONSTRAINT FK_project_contacts_contact REFERENCES dbo.customer_site_contacts(id),
        added_by   bigint            NOT NULL CONSTRAINT FK_project_contacts_user REFERENCES dbo.users(id),
        added_at   datetimeoffset(0) NOT NULL CONSTRAINT DF_project_contacts_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_project_contacts PRIMARY KEY (project_id, contact_id),
        CONSTRAINT FK_project_contacts_project FOREIGN KEY (project_id) REFERENCES dbo.projects(id) ON DELETE CASCADE
    );

IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
BEGIN
    GRANT SELECT, INSERT, DELETE ON OBJECT::dbo.project_payment_milestones TO [iot_team_app_role];
    GRANT SELECT, INSERT, DELETE ON OBJECT::dbo.project_contacts TO [iot_team_app_role];
END;

COMMIT TRANSACTION;
GO

-- The column exists only after the batch above, so its grant is a batch of its own.
IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
    GRANT UPDATE (team) ON OBJECT::dbo.projects TO [iot_team_app_role];
GO

-- ── Batch 3: record the version last ────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 65)
    INSERT dbo.schema_versions(version, name)
    VALUES (65, N'Project team, customer payment milestones and project contacts');
