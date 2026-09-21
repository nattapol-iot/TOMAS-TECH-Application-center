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
:r database/migrations/029_sales_performance_reviews.sql
:r database/migrations/030_customer_multilingual_names.sql
:r database/migrations/031_customer_contact_titles.sql
:r database/migrations/032_estimate_excel_import.sql
:r database/migrations/033_historical_pr_import.sql
:r database/migrations/034_support_center.sql
:r database/migrations/035_team_activity.sql
:r database/migrations/036_report_evidence_images.sql
:r database/migrations/037_unified_report_exports.sql
:r database/migrations/038_supplier_quotation_lines.sql
:r database/migrations/039_nas_storage_settings.sql
:r database/migrations/040_estimate_overhead_policy.sql
:r database/migrations/041_user_role_management.sql
:r database/migrations/042_estimate_total_guard.sql
:r database/migrations/043_estimate_erp_cost_mapping.sql
:r database/migrations/044_estimate_labor_masters.sql
:r database/migrations/045_estimate_line_order.sql
:r database/migrations/046_estimate_module_details.sql
:r database/migrations/047_estimate_module_description_rows.sql
:r database/migrations/048_estimate_price_sets.sql
:r database/migrations/049_estimate_module_quantity.sql
:r database/migrations/050_estimate_product_codes.sql
:r database/migrations/051_additional_application_roles.sql
:r database/migrations/052_support_email_notification.sql
:r database/migrations/053_crm.sql
:r database/migrations/054_crm_end_user.sql
:r database/migrations/055_estimate_erp_manual_override.sql

USE [$(DatabaseName)];
GO

IF (SELECT COUNT_BIG(*) FROM dbo.schema_versions WHERE version BETWEEN 1 AND 55) <> 55
    THROW 51020, 'Fresh database deployment did not apply every required migration.', 1;

IF EXISTS (
    SELECT expected.version, expected.name
    FROM (VALUES
        (25, N'Unified revisioned reports and customer acknowledgment'),
        (26, N'Durable role-scoped KPI performance reviews'),
        (27, N'Reusable sanitized report templates and frozen provenance'),
        (28, N'Optional end user companies for inquiries and projects'),
        (29, N'Role-specific Sales KPI performance reviews'),
        (30, N'Customer and contact names in Thai, English and Japanese'),
        (31, N'Customer contact titles in Thai, English and Japanese'),
        (32, N'Estimate Excel import audited historical rate provenance'),
        (33, N'Historical PR workbook imports with source versions and reconciliation links'),
        (34, N'Support Center and reporter contribution points'),
        (35, N'Team activity, reporting discipline and versioned KPI contribution'),
        (36, N'Report evidence images with immutable file hashes'),
        (37, N'Archive generated report PDF/PPTX exports on NAS storage'),
        (38, N'supplier_quotation_lines'),
        (39, N'NAS storage connection draft settings'),
        (40, N'Immutable overhead policies and estimate revision snapshots'),
        (41, N'Admin-managed primary user roles with audited least-privilege writes'),
        (42, N'Guard estimate aggregates within supported decimal precision'),
        (43, N'Revision-scoped Estimate ERP cost classifications'),
        (44, N'Reusable labor rate masters and estimate labor packages'),
        (45, N'Shared estimate module and cost line ordering'),
        (46, N'Revision-scoped estimate module names and remarks'),
        (47, N'Estimate module description rows and summary notes'),
        (48, N'Estimate supplier price sets'),
        (49, N'Estimate module quantity and unit'),
        (50, N'Preserve product codes across estimate modules'),
        (51, N'Additional application roles carry their full permission set'),
        (52, N'Support member email notification preference'),
        (53, N'CRM opportunities and customer follow-up'),
        (54, N'CRM opportunity end user company'),
        (55, N'Manual ERP category override for labour lines')
    ) expected(version, name)
    LEFT JOIN dbo.schema_versions installed
      ON installed.version = expected.version AND installed.name = expected.name
    WHERE installed.version IS NULL
)
    THROW 51021, 'Fresh database deployment found an unexpected required migration identity.', 1;
GO
