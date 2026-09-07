SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NUMERIC_ROUNDABORT OFF;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 22) RETURN;
IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 21)
    THROW 51250, 'Apply migration 021 first.', 1;
GO

BEGIN TRANSACTION;

ALTER TABLE dbo.users DROP CONSTRAINT UQ_users_entra_object_id;
ALTER TABLE dbo.users ALTER COLUMN entra_object_id nvarchar(64) NULL;
CREATE UNIQUE INDEX UX_users_entra_object_id
    ON dbo.users(entra_object_id)
    WHERE entra_object_id IS NOT NULL;

COMMIT TRANSACTION;
GO

CREATE OR ALTER PROCEDURE dbo.sync_employee_directory_user
    @employee_id bigint
WITH EXECUTE AS OWNER
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE
        @user_id bigint,
        @email nvarchar(256),
        @name nvarchar(200),
        @department nvarchar(100),
        @level nvarchar(100),
        @is_active bit,
        @role_id bigint,
        @initials nvarchar(10),
        @first_space int,
        @remaining_name nvarchar(200);

    SELECT
        @user_id = employee.user_id,
        @email = LOWER(employee.email),
        @name = employee.name_en,
        @department = employee.department,
        @level = employee.position,
        @is_active = employee.is_active
    FROM dbo.employees employee WITH (UPDLOCK, HOLDLOCK)
    WHERE employee.id = @employee_id
      AND employee.deleted_at IS NULL;

    IF @email IS NULL
        THROW 51251, 'Employee was not found.', 1;

    SET @first_space = CHARINDEX(N' ', LTRIM(@name) + N' ');
    SET @remaining_name = LTRIM(SUBSTRING(LTRIM(@name), @first_space + 1, 200));
    SET @initials = UPPER(LEFT(LTRIM(@name), 1)
        + CASE WHEN @remaining_name = N'' THEN N'' ELSE LEFT(@remaining_name, 1) END);

    IF @user_id IS NULL
    BEGIN
        SELECT @user_id = app_user.id
        FROM dbo.users app_user WITH (UPDLOCK, HOLDLOCK)
        WHERE app_user.email = @email;
    END;

    IF @user_id IS NULL
    BEGIN
        SELECT @role_id = id
        FROM dbo.roles
        WHERE code = N'Engineer' AND is_active = 1;

        IF @role_id IS NULL
            THROW 51252, 'The Engineer role is required for employee assignment identities.', 1;

        INSERT INTO dbo.users (
            entra_object_id, email, name, initials, role_id, department, level,
            is_active, deleted_at)
        VALUES (
            NULL, @email, @name, @initials, @role_id, @department, @level,
            @is_active, NULL);

        SET @user_id = SCOPE_IDENTITY();
    END
    ELSE
    BEGIN
        UPDATE dbo.users
        SET email = @email,
            name = @name,
            initials = @initials,
            department = @department,
            level = @level,
            is_active = @is_active,
            deleted_at = NULL,
            updated_at = SYSUTCDATETIME()
        WHERE id = @user_id;

        IF @@ROWCOUNT = 0
            THROW 51253, 'The employee links to a missing application user.', 1;
    END;

    UPDATE dbo.employees
    SET user_id = @user_id,
        updated_at = SYSUTCDATETIME()
    WHERE id = @employee_id
      AND (user_id IS NULL OR user_id <> @user_id);
END;
GO

BEGIN TRANSACTION;

DECLARE @employee_id bigint;
DECLARE employee_cursor CURSOR LOCAL FAST_FORWARD FOR
    SELECT id
    FROM dbo.employees
    WHERE deleted_at IS NULL
    ORDER BY id;

OPEN employee_cursor;
FETCH NEXT FROM employee_cursor INTO @employee_id;
WHILE @@FETCH_STATUS = 0
BEGIN
    EXEC dbo.sync_employee_directory_user @employee_id = @employee_id;
    FETCH NEXT FROM employee_cursor INTO @employee_id;
END;
CLOSE employee_cursor;
DEALLOCATE employee_cursor;

REVOKE EXECUTE ON OBJECT::dbo.sync_employee_directory_user FROM [public];
IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
    GRANT EXECUTE ON OBJECT::dbo.sync_employee_directory_user TO [iot_team_app_role];

INSERT dbo.schema_versions(version, name)
VALUES (22, N'Employee Master-backed assignment directory');

COMMIT TRANSACTION;
GO
