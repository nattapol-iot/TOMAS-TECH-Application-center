:on error exit
-- Required SQLCMD variables:
--   EntraObjectId, Email, DisplayName, Initials, RoleCode, Department, Level
-- PowerShell example (backtick is the line-continuation character):
-- sqlcmd -S "sql.example.internal" -E -b -r1 -i ".\database\scripts\030_provision_user.sql" `
--   -v "DatabaseName=IoTTeamCenter" "EntraObjectId=<object-id>" "Email=name@company.com" `
--      "DisplayName=Name Surname" "Initials=NS" "RoleCode=Admin" "Department=IoT" "Level=Manager"

USE [$(DatabaseName)];
GO

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
BEGIN TRANSACTION;

DECLARE @object_id nvarchar(max) = NULLIF(LTRIM(RTRIM(N'$(EntraObjectId)')), N'');
DECLARE @email nvarchar(max) = LOWER(NULLIF(LTRIM(RTRIM(N'$(Email)')), N''));
DECLARE @name nvarchar(max) = NULLIF(LTRIM(RTRIM(N'$(DisplayName)')), N'');
DECLARE @initials nvarchar(max) = NULLIF(LTRIM(RTRIM(N'$(Initials)')), N'');
DECLARE @role_code nvarchar(max) = NULLIF(LTRIM(RTRIM(N'$(RoleCode)')), N'');
DECLARE @department nvarchar(max) = COALESCE(NULLIF(LTRIM(RTRIM(N'$(Department)')), N''), N'');
DECLARE @level nvarchar(max) = COALESCE(NULLIF(LTRIM(RTRIM(N'$(Level)')), N''), N'');
DECLARE @object_guid uniqueidentifier = TRY_CONVERT(uniqueidentifier, @object_id);

IF @object_id IS NULL OR @email IS NULL OR @name IS NULL OR @initials IS NULL OR @role_code IS NULL
    THROW 51050, 'EntraObjectId, Email, DisplayName, Initials, and RoleCode are required.', 1;

IF @object_guid IS NULL OR @object_guid = '00000000-0000-0000-0000-000000000000'
   OR LEN(@object_id) <> 36 OR LOWER(CONVERT(nvarchar(36), @object_guid)) <> LOWER(@object_id)
    THROW 51053, 'EntraObjectId must be a real canonical non-zero GUID.', 1;

IF LEN(@email) > 256 OR @email LIKE N'% %' OR CHARINDEX(N'@', @email) <= 1 OR @email LIKE N'<%>'
   OR LEN(@name) > 200 OR @name LIKE N'<%>' OR LEN(@initials) > 10
   OR LEN(@role_code) > 50 OR LEN(@department) > 100 OR LEN(@level) > 100
    THROW 51054, 'Provisioning values contain a placeholder or exceed the allowed format/length.', 1;

DECLARE @role_id bigint = (SELECT id FROM dbo.roles WITH (UPDLOCK, HOLDLOCK) WHERE code = @role_code);
IF @role_id IS NULL
    THROW 51051, 'RoleCode does not exist.', 1;

IF EXISTS (SELECT 1 FROM dbo.users WITH (UPDLOCK, HOLDLOCK) WHERE email = @email AND entra_object_id <> @object_id)
    THROW 51052, 'Email is already assigned to a different Entra object id.', 1;

IF EXISTS (SELECT 1 FROM dbo.users WITH (UPDLOCK, HOLDLOCK) WHERE entra_object_id = @object_id)
BEGIN
    UPDATE dbo.users
    SET email = @email,
        name = @name,
        initials = @initials,
        role_id = @role_id,
        department = @department,
        level = @level,
        is_active = 1,
        deleted_at = NULL,
        updated_at = SYSUTCDATETIME()
    WHERE entra_object_id = @object_id;
END
ELSE
BEGIN
    INSERT INTO dbo.users(entra_object_id, email, name, initials, role_id, department, level)
    VALUES (@object_id, @email, @name, @initials, @role_id, @department, @level);
END;

COMMIT TRANSACTION;

SELECT u.id, u.entra_object_id, u.email, u.name, r.code AS role, u.department, u.level, u.is_active
FROM dbo.users u
INNER JOIN dbo.roles r ON r.id = u.role_id
WHERE u.entra_object_id = @object_id;
GO
