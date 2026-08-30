:on error exit
-- Disable one application user by exact Entra object ID and expected email.
-- Required SQLCMD variables: DatabaseName, EntraObjectId, ExpectedEmail, ConfirmDisable
-- ConfirmDisable must be exactly YES. This script does not alter the Entra account itself.

USE [$(DatabaseName)];
GO

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
BEGIN TRANSACTION;

DECLARE @object_id nvarchar(max) = NULLIF(LTRIM(RTRIM(N'$(EntraObjectId)')), N'');
DECLARE @expected_email nvarchar(max) = LOWER(NULLIF(LTRIM(RTRIM(N'$(ExpectedEmail)')), N''));
DECLARE @confirmation nvarchar(10) = NULLIF(LTRIM(RTRIM(N'$(ConfirmDisable)')), N'');
DECLARE @object_guid uniqueidentifier = TRY_CONVERT(uniqueidentifier, @object_id);

IF @object_id IS NULL OR @expected_email IS NULL
    THROW 51060, 'EntraObjectId and ExpectedEmail are required.', 1;

IF @object_guid IS NULL OR @object_guid = '00000000-0000-0000-0000-000000000000'
   OR LEN(@object_id) <> 36 OR LOWER(CONVERT(nvarchar(36), @object_guid)) <> LOWER(@object_id)
   OR LEN(@expected_email) > 256 OR @expected_email LIKE N'% %'
   OR CHARINDEX(N'@', @expected_email) <= 1 OR @expected_email LIKE N'<%>'
    THROW 51063, 'EntraObjectId and ExpectedEmail must be real canonical values, not placeholders.', 1;

IF @confirmation <> N'YES'
    THROW 51061, 'ConfirmDisable must be exactly YES.', 1;

IF (SELECT COUNT_BIG(*)
    FROM dbo.users WITH (UPDLOCK, HOLDLOCK)
    WHERE entra_object_id = @object_id
      AND email = @expected_email) <> 1
    THROW 51062, 'Expected exactly one user matching the supplied Entra object ID and email.', 1;

UPDATE dbo.users
SET is_active = 0,
    deleted_at = COALESCE(deleted_at, SYSUTCDATETIME()),
    updated_at = SYSUTCDATETIME()
WHERE entra_object_id = @object_id
  AND email = @expected_email;

COMMIT TRANSACTION;

SELECT u.entra_object_id, u.email, u.name, r.code AS role, u.is_active, u.deleted_at
FROM dbo.users AS u
INNER JOIN dbo.roles AS r ON r.id = u.role_id
WHERE u.entra_object_id = @object_id;
GO
