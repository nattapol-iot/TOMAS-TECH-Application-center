:on error exit

USE [$(DatabaseName)];
GO

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'iot_team_app_role')
    CREATE ROLE [iot_team_app_role];
GO

DECLARE @app_authentication_type nvarchar(60) = (
    SELECT authentication_type_desc
    FROM sys.database_principals
    WHERE name = N'$(AppLogin)'
);
DECLARE @app_principal_type nvarchar(60) = (
    SELECT type_desc
    FROM sys.database_principals
    WHERE name = N'$(AppLogin)'
);

IF @app_principal_type IS NULL AND SUSER_SID(N'$(AppLogin)') IS NULL
    THROW 51040, 'The application principal does not exist. Create a server login, contained database user, or application role first.', 1;

IF @app_authentication_type = N'INSTANCE' AND EXISTS (
    SELECT 1 FROM sys.database_principals
    WHERE name = N'$(AppLogin)' AND sid <> SUSER_SID(N'$(AppLogin)')
)
    THROW 51041, 'The existing database user is mapped to a different login SID.', 1;

IF @app_principal_type <> N'APPLICATION_ROLE'
   AND @app_authentication_type IS NOT NULL
   AND @app_authentication_type NOT IN (N'INSTANCE', N'DATABASE')
    THROW 51042, 'The application principal must use an instance login, contained database authentication, or an application role.', 1;

IF @app_authentication_type IS NULL
BEGIN
    DECLARE @create_user nvarchar(max) = N'CREATE USER ' + QUOTENAME(N'$(AppLogin)') + N' FOR LOGIN ' + QUOTENAME(N'$(AppLogin)') + N';';
    EXEC sys.sp_executesql @create_user;
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.database_role_members drm
    INNER JOIN sys.database_principals role_principal ON role_principal.principal_id = drm.role_principal_id
    INNER JOIN sys.database_principals member_principal ON member_principal.principal_id = drm.member_principal_id
    WHERE role_principal.name = N'iot_team_app_role' AND member_principal.name = N'$(AppLogin)'
)
    ALTER ROLE [iot_team_app_role] ADD MEMBER [$(AppLogin)];
GO

-- Normalize every database- and schema-level permission left by an older
-- deployment. The production role is object-grant-only: a schema/database
-- CONTROL, SELECT, EXECUTE, INSERT, UPDATE, DELETE, ALTER or TAKE OWNERSHIP
-- grant would otherwise dominate the narrower matrix below.
DECLARE @permission_cleanup nvarchar(max) = N'';

SELECT @permission_cleanup += CASE permission.class
    WHEN 0 THEN N'REVOKE ' + permission.permission_name
        + N' FROM ' + QUOTENAME(grantee.name) + N';' + NCHAR(10)
    WHEN 3 THEN N'REVOKE ' + permission.permission_name + N' ON SCHEMA::'
        + QUOTENAME(schema_item.name) + N' FROM ' + QUOTENAME(grantee.name) + N';' + NCHAR(10)
END
FROM sys.database_permissions permission
INNER JOIN sys.database_principals grantee
  ON grantee.principal_id = permission.grantee_principal_id
LEFT JOIN sys.schemas schema_item
  ON permission.class = 3 AND schema_item.schema_id = permission.major_id
WHERE permission.class IN (0, 3)
  AND (
       permission.grantee_principal_id = DATABASE_PRINCIPAL_ID(N'iot_team_app_role')
    OR (permission.grantee_principal_id = DATABASE_PRINCIPAL_ID(N'$(AppLogin)')
        AND NOT (permission.class = 0 AND permission.permission_name = N'CONNECT'))
  );

IF @permission_cleanup <> N''
    EXEC sys.sp_executesql @permission_cleanup;

IF EXISTS (
    SELECT 1
    FROM sys.database_permissions
    WHERE class IN (0, 3)
      AND (
           grantee_principal_id = DATABASE_PRINCIPAL_ID(N'iot_team_app_role')
        OR (grantee_principal_id = DATABASE_PRINCIPAL_ID(N'$(AppLogin)')
            AND NOT (class = 0 AND permission_name = N'CONNECT'))
      ))
    THROW 51043, 'Application-role database/schema permission normalization did not complete.', 1;

-- Owner-executed procedures must never be callable through public. Their
-- elevated implementation is exposed only through the reviewed app role.
REVOKE EXECUTE ON OBJECT::dbo.issue_document_number FROM [public];
REVOKE EXECUTE ON OBJECT::dbo.answer_schedule_day_request FROM [public];
REVOKE EXECUTE ON OBJECT::dbo.issue_knowledge_document_number FROM [public];
REVOKE EXECUTE ON OBJECT::dbo.sync_employee_directory_user FROM [public];
GRANT EXECUTE ON OBJECT::dbo.issue_document_number TO [iot_team_app_role];
GRANT EXECUTE ON OBJECT::dbo.answer_schedule_day_request TO [iot_team_app_role];
GRANT EXECUTE ON OBJECT::dbo.issue_knowledge_document_number TO [iot_team_app_role];
GRANT EXECUTE ON OBJECT::dbo.sync_employee_directory_user TO [iot_team_app_role];

-- Reads are limited to objects used by the currently mapped production API.
GRANT SELECT ON OBJECT::dbo.schema_versions TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.users TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.roles TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.role_permissions TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.permissions TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.customers TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.suppliers TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.engineering_rates TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.employees TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.supplier_price_history TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.supplier_quotations TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.audit_log TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.inquiries TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.inquiry_attachments TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.inquiry_meetings TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.estimates TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.estimate_revisions TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.estimate_assignments TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.cost_items TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.manhour_lines TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.expense_lines TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.other_cost_lines TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.projects TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.project_members TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.project_folders TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.project_docs TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.holidays TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.schedule_tasks TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.schedule_task_pics TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.schedule_updates TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.schedule_baselines TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.mat_items TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.boms TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.bom_lines TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.reservations TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.mat_prs TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.mat_pr_lines TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.mat_pr_approval_steps TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.mat_pos TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.mat_po_lines TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.grns TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.grn_lines TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.mirs TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.mir_lines TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.stock_adjustments TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.stock_txns TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.mat_audit TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.v_estimate_totals TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.v_item_balances TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.fn_estimate_validation TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.knowledge_categories TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.knowledge_number_sequences TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.knowledge_document_files TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.knowledge_documents TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.knowledge_document_versions TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.knowledge_articles TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.knowledge_document_relations TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.knowledge_document_permissions TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.knowledge_document_approvals TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.knowledge_document_comments TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.knowledge_document_acknowledgements TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.knowledge_audit_events TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.company_stamps TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.stamp_authorities TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.signature_specimens TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.sign_flow_templates TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.sign_flow_steps TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.signable_documents TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.document_files TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.sign_requests TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.sign_steps TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.signature_marks TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.signed_documents TO [iot_team_app_role];
GRANT SELECT ON OBJECT::dbo.sign_events TO [iot_team_app_role];
GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.resource_capacity TO [iot_team_app_role];
GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.resource_effort TO [iot_team_app_role];
GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.resource_tasks TO [iot_team_app_role];
GRANT SELECT, INSERT ON OBJECT::dbo.resource_task_sources TO [iot_team_app_role];
GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.module_templates TO [iot_team_app_role];
-- Role assignments are read-only to the API; no self-service escalation.
IF OBJECT_ID(N'dbo.user_business_roles',N'U') IS NOT NULL
 GRANT SELECT ON dbo.user_business_roles TO iot_team_app_role;
IF OBJECT_ID(N'dbo.user_signing_permissions',N'V') IS NOT NULL
 GRANT SELECT ON dbo.user_signing_permissions TO iot_team_app_role;
GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.module_template_lines TO [iot_team_app_role];

-- Normalize prior runs before applying the minimal write set below.
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.customers FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.suppliers FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.engineering_rates FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.employees FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.supplier_price_history FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.supplier_quotations FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.inquiries FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.estimates FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.estimate_revisions FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.estimate_assignments FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.cost_items FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.manhour_lines FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.expense_lines FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.other_cost_lines FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.projects FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.project_members FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.project_folders FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.mat_items FROM [iot_team_app_role];
REVOKE UPDATE, DELETE ON OBJECT::dbo.project_docs FROM [iot_team_app_role];
REVOKE UPDATE, DELETE ON OBJECT::dbo.audit_log FROM [iot_team_app_role];
REVOKE DELETE ON SCHEMA::dbo FROM [iot_team_app_role];

REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.boms FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.bom_lines FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.reservations FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.mat_prs FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.mat_pr_lines FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.mat_pr_approval_steps FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.mat_pos FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.mat_po_lines FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.grns FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.grn_lines FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.mirs FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.mir_lines FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.stock_adjustments FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.stock_txns FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.mat_audit FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.knowledge_categories FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.knowledge_number_sequences FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.knowledge_document_files FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.knowledge_documents FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.knowledge_document_versions FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.knowledge_articles FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.knowledge_document_relations FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.knowledge_document_permissions FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.knowledge_document_approvals FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.knowledge_document_comments FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.knowledge_document_acknowledgements FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.knowledge_audit_events FROM [iot_team_app_role];

-- Business writes are explicit so a compromised application credential cannot
-- modify RBAC, user identity, document numbering, migration metadata, or features
-- that do not yet have a reviewed production API.
GRANT INSERT, UPDATE ON OBJECT::dbo.customers TO [iot_team_app_role];
GRANT INSERT ON OBJECT::dbo.suppliers TO [iot_team_app_role];
GRANT INSERT ON OBJECT::dbo.engineering_rates TO [iot_team_app_role];
GRANT INSERT, UPDATE ON OBJECT::dbo.employees TO [iot_team_app_role];
GRANT INSERT, UPDATE ON OBJECT::dbo.inquiries TO [iot_team_app_role];
GRANT INSERT, UPDATE ON OBJECT::dbo.estimates TO [iot_team_app_role];
GRANT INSERT ON OBJECT::dbo.estimate_revisions TO [iot_team_app_role];
GRANT INSERT, UPDATE ON OBJECT::dbo.estimate_assignments TO [iot_team_app_role];
GRANT INSERT, UPDATE ON OBJECT::dbo.cost_items TO [iot_team_app_role];
GRANT INSERT, UPDATE ON OBJECT::dbo.manhour_lines TO [iot_team_app_role];
GRANT INSERT, UPDATE ON OBJECT::dbo.expense_lines TO [iot_team_app_role];
GRANT INSERT, UPDATE ON OBJECT::dbo.other_cost_lines TO [iot_team_app_role];
GRANT INSERT ON OBJECT::dbo.projects TO [iot_team_app_role];
-- End user editing does not grant changes to commercial/project control fields.
GRANT UPDATE (end_user_customer_id,updated_by,updated_at) ON OBJECT::dbo.projects TO [iot_team_app_role];
GRANT INSERT ON OBJECT::dbo.project_members TO [iot_team_app_role];
GRANT INSERT ON OBJECT::dbo.project_folders TO [iot_team_app_role];
GRANT INSERT ON OBJECT::dbo.project_docs TO [iot_team_app_role];
GRANT INSERT ON OBJECT::dbo.audit_log TO [iot_team_app_role];
GRANT INSERT ON OBJECT::dbo.supplier_quotations TO [iot_team_app_role];
GRANT INSERT ON OBJECT::dbo.mat_items TO [iot_team_app_role];

-- Material workflows use an explicit, object-level write matrix. Stock and
-- material audit ledgers stay append-only; migration 002 also enforces this
-- invariant with INSTEAD OF UPDATE/DELETE triggers.
GRANT INSERT, UPDATE ON OBJECT::dbo.boms TO [iot_team_app_role];
GRANT INSERT ON OBJECT::dbo.bom_lines TO [iot_team_app_role];
GRANT INSERT, UPDATE ON OBJECT::dbo.reservations TO [iot_team_app_role];
GRANT INSERT, UPDATE ON OBJECT::dbo.mat_prs TO [iot_team_app_role];
GRANT INSERT ON OBJECT::dbo.mat_pr_lines TO [iot_team_app_role];
GRANT INSERT, UPDATE, DELETE ON OBJECT::dbo.mat_pr_approval_steps TO [iot_team_app_role];
GRANT INSERT, UPDATE ON OBJECT::dbo.mat_pos TO [iot_team_app_role];
GRANT INSERT ON OBJECT::dbo.mat_po_lines TO [iot_team_app_role];
GRANT INSERT, UPDATE ON OBJECT::dbo.grns TO [iot_team_app_role];
GRANT INSERT ON OBJECT::dbo.grn_lines TO [iot_team_app_role];
GRANT INSERT, UPDATE ON OBJECT::dbo.mirs TO [iot_team_app_role];
GRANT INSERT, UPDATE ON OBJECT::dbo.mir_lines TO [iot_team_app_role];
GRANT INSERT, UPDATE ON OBJECT::dbo.stock_adjustments TO [iot_team_app_role];
GRANT INSERT ON OBJECT::dbo.stock_txns TO [iot_team_app_role];
GRANT INSERT ON OBJECT::dbo.mat_audit TO [iot_team_app_role];
GRANT INSERT, UPDATE ON OBJECT::dbo.knowledge_categories TO [iot_team_app_role];
GRANT INSERT, UPDATE ON OBJECT::dbo.knowledge_number_sequences TO [iot_team_app_role];
GRANT INSERT ON OBJECT::dbo.knowledge_document_files TO [iot_team_app_role];
GRANT INSERT, UPDATE ON OBJECT::dbo.knowledge_documents TO [iot_team_app_role];
GRANT INSERT, UPDATE ON OBJECT::dbo.knowledge_document_versions TO [iot_team_app_role];
GRANT INSERT, UPDATE ON OBJECT::dbo.knowledge_articles TO [iot_team_app_role];
GRANT INSERT, DELETE ON OBJECT::dbo.knowledge_document_relations TO [iot_team_app_role];
GRANT INSERT, DELETE ON OBJECT::dbo.knowledge_document_permissions TO [iot_team_app_role];
-- The API deletes only still-pending routing rows when a revised workflow is resubmitted.
GRANT INSERT, UPDATE, DELETE ON OBJECT::dbo.knowledge_document_approvals TO [iot_team_app_role];
GRANT INSERT, UPDATE ON OBJECT::dbo.knowledge_document_comments TO [iot_team_app_role];
GRANT INSERT, UPDATE ON OBJECT::dbo.knowledge_document_acknowledgements TO [iot_team_app_role];
GRANT INSERT ON OBJECT::dbo.knowledge_audit_events TO [iot_team_app_role];

-- Schedule planning is an explicitly reviewed module. Plan rows use
-- rowversion, progress writes are append-audited, and the update feed and
-- baseline history cannot be changed or deleted through this role.
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.schedule_tasks FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.schedule_task_pics FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.schedule_updates FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.schedule_baselines FROM [iot_team_app_role];
GRANT INSERT, UPDATE ON OBJECT::dbo.schedule_tasks TO [iot_team_app_role];
GRANT INSERT, DELETE ON OBJECT::dbo.schedule_task_pics TO [iot_team_app_role];
-- Answers must go through dbo.answer_schedule_day_request. Do not grant UPDATE
-- on the append-only request feed to the application role.
GRANT INSERT ON OBJECT::dbo.schedule_updates TO [iot_team_app_role];
GRANT INSERT ON OBJECT::dbo.schedule_baselines TO [iot_team_app_role];

-- Remove legacy grants for modules that are intentionally outside this release.
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.holidays FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.inquiry_attachments FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.inquiry_meetings FROM [iot_team_app_role];
GRANT INSERT ON OBJECT::dbo.inquiry_attachments TO [iot_team_app_role];
GRANT INSERT ON OBJECT::dbo.inquiry_meetings TO [iot_team_app_role];
-- Sales intake and site visit (migration 016). Reviews, status history,
-- reschedule history and links are insert-only by design; the triggers refuse
-- the rest and these grants say the same thing a second time.
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.sales_intake_reviews FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.site_visit_status_history FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.site_visit_schedule_history FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.site_visit_confirmations FROM [iot_team_app_role];
GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.customer_sites TO [iot_team_app_role];
GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.customer_site_contacts TO [iot_team_app_role];
GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.visit_types TO [iot_team_app_role];
GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.visit_skills TO [iot_team_app_role];
GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.engineer_skills TO [iot_team_app_role];
GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.engineer_availability TO [iot_team_app_role];
GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.visit_checklist_templates TO [iot_team_app_role];
GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.visit_checklist_items TO [iot_team_app_role];
GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.visit_sla_policies TO [iot_team_app_role];
GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.sales_intakes TO [iot_team_app_role];
GRANT SELECT, INSERT, DELETE ON OBJECT::dbo.sales_intake_purposes TO [iot_team_app_role];
GRANT SELECT, INSERT, DELETE ON OBJECT::dbo.sales_intake_skills TO [iot_team_app_role];
GRANT SELECT, INSERT, DELETE ON OBJECT::dbo.sales_intake_windows TO [iot_team_app_role];
GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.sales_intake_attachments TO [iot_team_app_role];
GRANT INSERT ON OBJECT::dbo.sales_intake_reviews TO [iot_team_app_role];
GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.site_visits TO [iot_team_app_role];
GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.site_visit_assignments TO [iot_team_app_role];
GRANT INSERT ON OBJECT::dbo.site_visit_confirmations TO [iot_team_app_role];
GRANT INSERT ON OBJECT::dbo.site_visit_schedule_history TO [iot_team_app_role];
GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.site_visit_checklist_responses TO [iot_team_app_role];
GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.site_visit_findings TO [iot_team_app_role];
GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.site_visit_attachments TO [iot_team_app_role];
GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.site_visit_reports TO [iot_team_app_role];
GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.site_visit_report_revisions TO [iot_team_app_role];
GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.site_visit_action_items TO [iot_team_app_role];
GRANT INSERT ON OBJECT::dbo.site_visit_status_history TO [iot_team_app_role];
GRANT SELECT, INSERT, DELETE ON OBJECT::dbo.site_visit_links TO [iot_team_app_role];
GRANT EXECUTE ON OBJECT::dbo.assert_engineer_available TO [iot_team_app_role];

-- In-app notification delivery entered the release with migration 016.
-- INSERT creates one, UPDATE marks it read. Deleting one is never allowed.
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.notifications FROM [iot_team_app_role];
GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.notifications TO [iot_team_app_role];

-- Document signing (migration 018). A signature points at one exact file, so the
-- file record, the marks, the output and the event chain are INSERT-only here;
-- migration 018 enforces the same with INSTEAD OF UPDATE/DELETE triggers.
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.document_files FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.signature_marks FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.signed_documents FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.sign_events FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.company_stamps FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.stamp_authorities FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.signature_specimens FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.sign_flow_templates FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.signable_documents FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.sign_requests FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.sign_steps FROM [iot_team_app_role];
REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo.sign_flow_steps FROM [iot_team_app_role];
GRANT INSERT, UPDATE ON OBJECT::dbo.company_stamps TO [iot_team_app_role];
GRANT INSERT, UPDATE ON OBJECT::dbo.stamp_authorities TO [iot_team_app_role];
GRANT INSERT, UPDATE ON OBJECT::dbo.signature_specimens TO [iot_team_app_role];
GRANT INSERT, UPDATE ON OBJECT::dbo.sign_flow_templates TO [iot_team_app_role];
GRANT INSERT, UPDATE ON OBJECT::dbo.signable_documents TO [iot_team_app_role];
GRANT INSERT, UPDATE ON OBJECT::dbo.sign_requests TO [iot_team_app_role];
GRANT INSERT, UPDATE ON OBJECT::dbo.sign_steps TO [iot_team_app_role];
GRANT INSERT ON OBJECT::dbo.document_files TO [iot_team_app_role];
GRANT INSERT ON OBJECT::dbo.signature_marks TO [iot_team_app_role];
GRANT INSERT ON OBJECT::dbo.signed_documents TO [iot_team_app_role];
GRANT INSERT ON OBJECT::dbo.sign_events TO [iot_team_app_role];
GRANT INSERT ON OBJECT::dbo.sign_flow_steps TO [iot_team_app_role];

DENY ALTER, TAKE OWNERSHIP ON SCHEMA::dbo TO [iot_team_app_role];
IF OBJECT_ID(N'dbo.historical_pr_imports') IS NOT NULL
BEGIN
    GRANT SELECT,INSERT ON dbo.historical_pr_imports TO [iot_team_app_role];
    GRANT UPDATE(project_id,is_current,links,updated_by,updated_at) ON dbo.historical_pr_imports TO [iot_team_app_role];
END;
GRANT SELECT, INSERT, UPDATE ON dbo.unified_reports TO [iot_team_app_role];
GRANT SELECT, INSERT, UPDATE ON dbo.kpi_review_cycles TO [iot_team_app_role];
GRANT SELECT, INSERT, UPDATE ON dbo.kpi_assessments TO [iot_team_app_role];
GRANT SELECT, INSERT, UPDATE ON dbo.kpi_assessment_scores TO [iot_team_app_role];
REVOKE DELETE ON dbo.kpi_review_cycles FROM [iot_team_app_role];
REVOKE DELETE ON dbo.kpi_assessments FROM [iot_team_app_role];
REVOKE DELETE ON dbo.kpi_assessment_scores FROM [iot_team_app_role];
GRANT SELECT, INSERT, UPDATE ON dbo.report_templates TO [iot_team_app_role];
GRANT SELECT ON dbo.support_categories TO [iot_team_app_role];
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.support_members TO [iot_team_app_role];
GRANT SELECT, INSERT, UPDATE ON dbo.support_tickets TO [iot_team_app_role];
GRANT SELECT, INSERT ON dbo.support_events TO [iot_team_app_role];
GRANT SELECT, INSERT ON dbo.support_attachments TO [iot_team_app_role];
GRANT SELECT, INSERT, UPDATE ON dbo.support_recognition TO [iot_team_app_role];
REVOKE DELETE ON dbo.report_templates FROM [iot_team_app_role];
GRANT SELECT, INSERT, UPDATE ON dbo.unified_report_revisions TO [iot_team_app_role];
GRANT SELECT, INSERT, UPDATE ON dbo.unified_report_customer_links TO [iot_team_app_role];
GRANT SELECT, INSERT ON dbo.unified_report_acknowledgments TO [iot_team_app_role];
GRANT SELECT, INSERT ON dbo.unified_report_signatures TO [iot_team_app_role];
GRANT SELECT, INSERT ON dbo.unified_report_evidence_files TO [iot_team_app_role];
REVOKE UPDATE, DELETE ON dbo.unified_report_acknowledgments FROM [iot_team_app_role];
REVOKE UPDATE, DELETE ON dbo.unified_report_signatures FROM [iot_team_app_role];
REVOKE UPDATE, DELETE ON dbo.unified_report_evidence_files FROM [iot_team_app_role];

IF EXISTS (
    SELECT 1
    FROM sys.database_permissions
    WHERE class IN (0, 3) AND state IN ('G', 'W')
      AND (
           grantee_principal_id = DATABASE_PRINCIPAL_ID(N'iot_team_app_role')
        OR (grantee_principal_id = DATABASE_PRINCIPAL_ID(N'$(AppLogin)')
            AND NOT (class = 0 AND permission_name = N'CONNECT'))
      ))
    THROW 51044, 'The application role retained a database- or schema-wide grant.', 1;

IF (SELECT COUNT_BIG(*)
    FROM sys.database_permissions
    WHERE grantee_principal_id = DATABASE_PRINCIPAL_ID(N'iot_team_app_role')
      AND class = 3 AND major_id = SCHEMA_ID(N'dbo') AND state = 'D'
      AND permission_name IN (N'ALTER', N'TAKE OWNERSHIP')) <> 2
    THROW 51045, 'The dbo schema ownership guardrails were not applied.', 1;
GO


-- Team Activity object-scoped grants.
GRANT SELECT ON dbo.activity_settings TO [iot_team_app_role];
GRANT SELECT, INSERT, UPDATE ON dbo.activity_sessions TO [iot_team_app_role];
GRANT SELECT, INSERT, UPDATE ON dbo.activity_rules TO [iot_team_app_role];
GRANT SELECT, INSERT ON dbo.activity_events TO [iot_team_app_role];
GRANT SELECT, INSERT ON dbo.activity_exceptions TO [iot_team_app_role];
GRANT SELECT, INSERT ON dbo.activity_cycle_policies TO [iot_team_app_role];
GRANT SELECT, INSERT, UPDATE ON dbo.activity_quality TO [iot_team_app_role];
GRANT SELECT, INSERT ON dbo.activity_snapshots TO [iot_team_app_role];
GRANT SELECT, INSERT ON dbo.activity_clarifications TO [iot_team_app_role];
GO
