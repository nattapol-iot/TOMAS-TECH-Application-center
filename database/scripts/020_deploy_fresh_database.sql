:on error exit
-- SQLCMD-mode fresh deployment runner. Run from the repository root so :r paths
-- resolve consistently. Each migration is preceded by an explicit target USE.
:r database/scripts/000_create_database.sql

USE [$(DatabaseName)];
GO
:r database/migrations/001_core.sql

USE [$(DatabaseName)];
GO
:r database/migrations/002_material.sql

USE [$(DatabaseName)];
GO
:r database/migrations/003_schedule_documents.sql

USE [$(DatabaseName)];
GO
:r database/migrations/004_security_seed.sql

USE [$(DatabaseName)];
GO
:r database/migrations/005_revision_immutability.sql

USE [$(DatabaseName)];
GO

IF (SELECT COUNT_BIG(*) FROM dbo.schema_versions WHERE version IN (1, 2, 3, 4, 5)) <> 5
    THROW 51020, 'Fresh database deployment did not apply every required migration.', 1;
GO
