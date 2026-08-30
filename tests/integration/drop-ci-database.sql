:on error exit

USE [master];
GO

DECLARE @database_name sysname = N'$(DatabaseName)';

IF @database_name NOT LIKE N'IoTTeamCenter_CI[_]%'
   OR @database_name COLLATE Latin1_General_100_BIN2 LIKE N'%[^ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_]%'
   OR LOWER(@database_name) IN (N'master', N'model', N'msdb', N'tempdb')
    THROW 51061, 'Refusing to drop a database outside the CI naming boundary.', 1;

IF DB_ID(@database_name) IS NOT NULL
BEGIN
    DECLARE @sql nvarchar(max) =
        N'ALTER DATABASE ' + QUOTENAME(@database_name) + N' SET SINGLE_USER WITH ROLLBACK IMMEDIATE;' +
        N'DROP DATABASE ' + QUOTENAME(@database_name) + N';';
    EXEC sys.sp_executesql @sql;
END;
GO
