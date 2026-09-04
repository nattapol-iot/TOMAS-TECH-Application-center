/*
  Run this once as a SQL Server administrator after replacing the placeholders.
  Do not commit a real password and do not use sa from the application.
*/
USE [master];
GO

DECLARE @password nvarchar(max) = N'<GENERATE_A_LONG_RANDOM_PASSWORD_IN_THE_SECRET_MANAGER>';

IF @password = N'<GENERATE_A_LONG_RANDOM_PASSWORD_IN_THE_SECRET_MANAGER>' OR LEN(@password) NOT BETWEEN 24 AND 128
    THROW 51042, 'Replace the password placeholder with a secret-manager-generated value between 24 and 128 characters.', 1;

IF SUSER_ID(N'iot_team_app') IS NOT NULL
    THROW 51043, 'Login iot_team_app already exists; use the approved credential-rotation procedure instead.', 1;

-- CREATE LOGIN does not accept a password parameter. QUOTENAME safely escapes the
-- reviewed secret after the unchanged-placeholder and length guards above.
DECLARE @create_login nvarchar(max) =
    N'CREATE LOGIN [iot_team_app] WITH PASSWORD = ' + QUOTENAME(@password, NCHAR(39))
    + N', CHECK_POLICY = ON, CHECK_EXPIRATION = OFF, DEFAULT_DATABASE = [IoTTeamCenter];';
EXEC sys.sp_executesql @create_login;
GO
