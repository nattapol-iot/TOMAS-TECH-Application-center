-- Migration 081: company email addresses sign in without waiting for an administrator.
--
-- Since 2026-10-05 only people registered in Employee Master could sign in; everyone else waited
-- in dbo.sign_in_requests (migration 079) until an administrator added them. A TMT ID sign-in
-- whose email is on an allowed company domain (the API passes it; @tomastc.com by default) now
-- gets its account on the spot, with the Engineer role that Employee Master gives a new employee.
--
-- It only ever creates. An email that already has an account, live, deactivated or deleted, is
-- never touched here: a registered person is linked by dbo.link_registered_sign_in as before, and
-- someone an administrator removed or deactivated stays out. Adding the person to Employee Master
-- later links that employee to this account by email (dbo.sync_employee_directory_user) and sets
-- the department and level.

-- ── Batch 1: the procedure ───────────────────────────────────────────────────
-- A procedure must open its batch; 020's runner includes the previous migration right before this.
GO
IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 81 AND name <> N'Company email domain sign-in')
    THROW 51811, 'Schema version 081 is already used by another migration.', 1;
IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 80)
    THROW 51812, 'Apply migration 080 before migration 081.', 1;
GO
CREATE OR ALTER PROCEDURE dbo.register_domain_sign_in
    @object_id nvarchar(64),
    @email nvarchar(256),
    @name nvarchar(200),
    @initials nvarchar(10),
    @domain nvarchar(253)
WITH EXECUTE AS OWNER
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    IF @object_id IS NULL OR LEN(@object_id) = 0 OR @email IS NULL OR LEN(@email) = 0 OR @domain IS NULL OR LEN(@domain) = 0
        THROW 51910, 'A domain sign-in needs its subject, email and domain.', 1;

    SET @email = LOWER(LTRIM(RTRIM(@email)));
    -- The address must be exactly someone@domain: one @, nothing after the domain.
    IF @email NOT LIKE N'_%@%' OR CHARINDEX(N'@', @email, CHARINDEX(N'@', @email) + 1) > 0
       OR RIGHT(@email, LEN(@domain) + 1) <> N'@' + LOWER(@domain)
        RETURN;

    BEGIN TRANSACTION;
    -- Already linked, or an account with this email exists in any state: nothing to create.
    IF EXISTS (SELECT 1 FROM dbo.users WITH (UPDLOCK, HOLDLOCK) WHERE entra_object_id = @object_id OR email = @email)
    BEGIN
        COMMIT TRANSACTION;
        RETURN;
    END;

    DECLARE @role_id bigint = (SELECT id FROM dbo.roles WHERE code = N'Engineer' AND is_active = 1);
    IF @role_id IS NULL
        THROW 51911, 'The Engineer role is required for company email sign-in.', 1;

    INSERT dbo.users (entra_object_id, email, name, initials, role_id, department, level, is_active)
    VALUES (@object_id, @email, LEFT(COALESCE(NULLIF(LTRIM(RTRIM(@name)), N''), @email), 200), LEFT(ISNULL(@initials, N''), 10),
            @role_id, N'', N'', 1);
    COMMIT TRANSACTION;
END;
GO

-- ── Batch 2: grants ─────────────────────────────────────────────────────────
REVOKE EXECUTE ON OBJECT::dbo.register_domain_sign_in FROM [public];
IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
    GRANT EXECUTE ON OBJECT::dbo.register_domain_sign_in TO [iot_team_app_role];
GO

-- ── Batch 3: record the version last ────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 81)
    INSERT dbo.schema_versions(version, name)
    VALUES (81, N'Company email domain sign-in');
GO
