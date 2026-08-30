:on error exit

USE [master];
GO

DECLARE @database_name sysname = N'$(DatabaseName)';

IF NULLIF(LTRIM(RTRIM(@database_name)), N'') IS NULL
   OR REPLACE(@database_name, N'-', N'') COLLATE Latin1_General_100_BIN2
      LIKE N'%[^ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_]%'
   OR LOWER(@database_name) IN (N'master', N'model', N'msdb', N'tempdb')
    THROW 51019, 'DatabaseName must be a non-system name containing only letters, numbers, underscores, or hyphens.', 1;

IF DB_ID(@database_name) IS NULL
BEGIN
    DECLARE @sql nvarchar(max) = N'CREATE DATABASE ' + QUOTENAME(@database_name) + N';';
    EXEC sys.sp_executesql @sql;
END;

-- Do not force existing sessions off a live database. If RCSI needs to be enabled on
-- an existing busy database, this statement waits for the required metadata lock.
DECLARE @options_sql nvarchar(max) = N'';

IF EXISTS (SELECT 1 FROM sys.databases WHERE name = @database_name AND is_read_committed_snapshot_on = 0)
    SET @options_sql += N'ALTER DATABASE ' + QUOTENAME(@database_name) + N' SET READ_COMMITTED_SNAPSHOT ON;';

IF EXISTS (SELECT 1 FROM sys.databases WHERE name = @database_name AND snapshot_isolation_state <> 1)
    SET @options_sql += N'ALTER DATABASE ' + QUOTENAME(@database_name) + N' SET ALLOW_SNAPSHOT_ISOLATION ON;';

IF EXISTS (SELECT 1 FROM sys.databases WHERE name = @database_name AND is_auto_close_on = 1)
    SET @options_sql += N'ALTER DATABASE ' + QUOTENAME(@database_name) + N' SET AUTO_CLOSE OFF;';

IF EXISTS (SELECT 1 FROM sys.databases WHERE name = @database_name AND is_auto_shrink_on = 1)
    SET @options_sql += N'ALTER DATABASE ' + QUOTENAME(@database_name) + N' SET AUTO_SHRINK OFF;';

IF @options_sql <> N''
    EXEC sys.sp_executesql @options_sql;
GO
