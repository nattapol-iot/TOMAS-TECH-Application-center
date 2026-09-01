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
:r database/migrations/006_inventory_concurrency.sql

USE [$(DatabaseName)];
GO
:r database/migrations/007_schedule_day_request_answers.sql

USE [$(DatabaseName)];
GO
:r database/migrations/008_estimate_workspace_integrity.sql

USE [$(DatabaseName)];
GO
:r database/migrations/009_inquiry_workspace.sql

USE [$(DatabaseName)];
GO
:r database/migrations/010_inquiry_qualification.sql

USE [$(DatabaseName)];
GO
:r database/migrations/011_employee_master.sql

USE [$(DatabaseName)];
GO
:r database/migrations/012_supplier_price_history.sql

USE [$(DatabaseName)];
GO
:r database/migrations/013_supplier_quotations.sql

USE [$(DatabaseName)];
GO
:r database/migrations/014_knowledge_hub.sql

USE [$(DatabaseName)];
GO
:r database/migrations/015_knowledge_hub_workflow_hardening.sql

USE [$(DatabaseName)];
GO
:r database/migrations/016_sales_intake_site_visit.sql

USE [$(DatabaseName)];
GO

:r database/migrations/017_node_backend_permissions.sql

USE [$(DatabaseName)];
GO

:r database/migrations/018_document_signing.sql

USE [$(DatabaseName)];
GO

:r database/migrations/019_resource_planning.sql
:r database/migrations/020_module_templates.sql
:r database/migrations/021_drawing_task_workflow.sql
:r database/migrations/022_employee_directory_assignments.sql
:r database/migrations/023_management_signing_role.sql
:r database/migrations/024_resource_task_lifecycle.sql
:r database/migrations/025_reports.sql
:r database/migrations/026_performance_reviews.sql
:r database/migrations/027_report_templates.sql
:r database/migrations/028_end_user_companies.sql

USE [$(DatabaseName)];
GO

IF (SELECT COUNT_BIG(*) FROM dbo.schema_versions WHERE version IN (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28)) <> 28
    THROW 51020, 'Fresh database deployment did not apply every required migration.', 1;
GO

