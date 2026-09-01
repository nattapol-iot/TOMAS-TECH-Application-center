SET NOCOUNT ON;
SET XACT_ABORT ON;
IF DB_NAME() <> N'IoTTeamCenter_CodexTest_20260830_04'
    THROW 51320, 'Unexpected database for project-plan import backup.', 1;

DECLARE @directory nvarchar(4000) = CAST(SERVERPROPERTY('InstanceDefaultBackupPath') AS nvarchar(4000));
IF @directory IS NULL THROW 51321, 'SQL Server backup directory is unavailable.', 1;
IF RIGHT(@directory, 1) <> N'\' SET @directory = @directory + N'\';
DECLARE @path nvarchar(4000) = @directory + N'IoTTeamCenter_before_project_plan_import_'
    + CONVERT(nvarchar(8), GETUTCDATE(), 112) + N'_'
    + REPLACE(CONVERT(nvarchar(8), GETUTCDATE(), 108), N':', N'') + N'.bak';

BACKUP DATABASE [IoTTeamCenter_CodexTest_20260830_04]
    TO DISK = @path WITH COPY_ONLY, CHECKSUM;
RESTORE VERIFYONLY FROM DISK = @path WITH CHECKSUM;
SELECT @path AS verified_backup;
