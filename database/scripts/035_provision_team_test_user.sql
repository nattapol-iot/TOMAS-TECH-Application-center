:on error exit
-- Staging/UAT only. Required SQLCMD variables:
--   DatabaseName, Email, DisplayName, Initials, RoleCode, Department, Level, ConfirmTeamTest

USE [$(DatabaseName)];
GO

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
BEGIN TRANSACTION;

DECLARE @email nvarchar(max) = LOWER(NULLIF(LTRIM(RTRIM(N'$(Email)')), N''));
DECLARE @name nvarchar(max) = NULLIF(LTRIM(RTRIM(N'$(DisplayName)')), N'');
DECLARE @initials nvarchar(max) = NULLIF(LTRIM(RTRIM(N'$(Initials)')), N'');
DECLARE @role_code nvarchar(max) = NULLIF(LTRIM(RTRIM(N'$(RoleCode)')), N'');
DECLARE @department nvarchar(max) = COALESCE(NULLIF(LTRIM(RTRIM(N'$(Department)')), N''), N'');
DECLARE @level nvarchar(max) = COALESCE(NULLIF(LTRIM(RTRIM(N'$(Level)')), N''), N'');
DECLARE @confirmation nvarchar(max) = UPPER(LTRIM(RTRIM(N'$(ConfirmTeamTest)')));

IF @confirmation <> N'YES'
    THROW 51060, 'ConfirmTeamTest must be YES. This script is for temporary staging/UAT identities only.', 1;
IF @email IS NULL OR @name IS NULL OR @initials IS NULL OR @role_code IS NULL
    THROW 51061, 'Email, DisplayName, Initials, and RoleCode are required.', 1;
IF LEN(@email) > 256 OR @email LIKE N'% %' OR CHARINDEX(N'@', @email) <= 1 OR @email LIKE N'<%>'
   OR LEN(@name) > 200 OR @name LIKE N'<%>' OR LEN(@initials) > 10
   OR LEN(@role_code) > 50 OR LEN(@department) > 100 OR LEN(@level) > 100
    THROW 51062, 'Team-test provisioning values contain a placeholder or exceed the allowed format/length.', 1;

DECLARE @role_id bigint = (SELECT id FROM dbo.roles WITH (UPDLOCK, HOLDLOCK) WHERE code = @role_code);
IF @role_id IS NULL
    THROW 51063, 'RoleCode does not exist.', 1;

DECLARE @test_object_id nvarchar(64) = N'team-test:'
    + LEFT(CONVERT(nvarchar(64), HASHBYTES('SHA2_256', CONVERT(varbinary(512), @email)), 2), 54);
DECLARE @existing_object_id nvarchar(64) = (
    SELECT entra_object_id FROM dbo.users WITH (UPDLOCK, HOLDLOCK) WHERE email = @email
);

IF @existing_object_id IS NOT NULL AND @existing_object_id NOT LIKE N'team-test:%'
    THROW 51064, 'Email is already assigned to a real Entra identity; do not downgrade it to TeamTest.', 1;

IF @existing_object_id IS NULL
BEGIN
    INSERT INTO dbo.users(entra_object_id, email, name, initials, role_id, department, level)
    VALUES (@test_object_id, @email, @name, @initials, @role_id, @department, @level);
END
ELSE
BEGIN
    UPDATE dbo.users
    SET name = @name,
        initials = @initials,
        role_id = @role_id,
        department = @department,
        level = @level,
        is_active = 1,
        deleted_at = NULL,
        updated_at = SYSUTCDATETIME()
    WHERE email = @email AND entra_object_id = @existing_object_id;
END;

COMMIT TRANSACTION;

SELECT u.id, u.email, u.name, r.code AS role, u.department, u.level, u.is_active, N'TEAM TEST ONLY' AS identity_mode
FROM dbo.users u
INNER JOIN dbo.roles r ON r.id = u.role_id
WHERE u.email = @email;
GO
