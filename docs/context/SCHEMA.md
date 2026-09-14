# Schema navigation

[Context index](../../AGENTS.md)

Evidence: repository migrations at `9ed694e3`. Highest file number is not proof of the live DB version. No credentials or connection strings are stored here.

| Migration | Objects mentioned (literal CREATE TABLE / VIEW only) |
|---|---|
| [001_core.sql](<../../database/migrations/001_core.sql>) | `dbo.schema_versions`, `dbo.document_sequences`, `dbo.roles`, `dbo.permissions`, `dbo.role_permissions`, `dbo.users`, `dbo.customers`, `dbo.suppliers`, `dbo.engineering_rates`, `dbo.inquiries`, `dbo.estimates`, `dbo.estimate_revisions`, `dbo.estimate_assignments`, `dbo.cost_items`, `dbo.manhour_lines`, `dbo.expense_lines`, `dbo.other_cost_lines`, `dbo.projects`, `dbo.project_members`, `dbo.project_folders`, `dbo.audit_log`, `dbo.v_estimate_totals` |
| [002_material.sql](<../../database/migrations/002_material.sql>) | `dbo.mat_items`, `dbo.boms`, `dbo.bom_lines`, `dbo.reservations`, `dbo.mat_prs`, `dbo.mat_pr_lines`, `dbo.mat_pr_approval_steps`, `dbo.mat_pos`, `dbo.mat_po_lines`, `dbo.grns`, `dbo.grn_lines`, `dbo.mirs`, `dbo.mir_lines`, `dbo.stock_adjustments`, `dbo.stock_txns`, `dbo.mat_audit`, `dbo.v_item_balances` |
| [003_schedule_documents.sql](<../../database/migrations/003_schedule_documents.sql>) | `dbo.holidays`, `dbo.schedule_tasks`, `dbo.schedule_task_pics`, `dbo.schedule_updates`, `dbo.schedule_baselines`, `dbo.inquiry_attachments`, `dbo.inquiry_meetings`, `dbo.project_docs`, `dbo.notifications` |
| [004_security_seed.sql](<../../database/migrations/004_security_seed.sql>) | Inspect migration SQL |
| [005_revision_immutability.sql](<../../database/migrations/005_revision_immutability.sql>) | Inspect migration SQL |
| [006_inventory_concurrency.sql](<../../database/migrations/006_inventory_concurrency.sql>) | Inspect migration SQL |
| [007_schedule_day_request_answers.sql](<../../database/migrations/007_schedule_day_request_answers.sql>) | Inspect migration SQL |
| [008_estimate_workspace_integrity.sql](<../../database/migrations/008_estimate_workspace_integrity.sql>) | Inspect migration SQL |
| [009_inquiry_workspace.sql](<../../database/migrations/009_inquiry_workspace.sql>) | Inspect migration SQL |
| [010_inquiry_qualification.sql](<../../database/migrations/010_inquiry_qualification.sql>) | Inspect migration SQL |
| [011_employee_master.sql](<../../database/migrations/011_employee_master.sql>) | `dbo.employees` |
| [012_supplier_price_history.sql](<../../database/migrations/012_supplier_price_history.sql>) | `dbo.supplier_price_history` |
| [013_supplier_quotations.sql](<../../database/migrations/013_supplier_quotations.sql>) | `dbo.supplier_quotations` |
| [014_knowledge_hub.sql](<../../database/migrations/014_knowledge_hub.sql>) | `dbo.knowledge_categories`, `dbo.knowledge_number_sequences`, `dbo.knowledge_document_files`, `dbo.knowledge_documents`, `dbo.knowledge_document_versions`, `dbo.knowledge_articles`, `dbo.knowledge_document_relations`, `dbo.knowledge_document_permissions`, `dbo.knowledge_document_approvals`, `dbo.knowledge_document_comments`, `dbo.knowledge_document_acknowledgements`, `dbo.knowledge_audit_events` |
| [015_knowledge_hub_workflow_hardening.sql](<../../database/migrations/015_knowledge_hub_workflow_hardening.sql>) | Inspect migration SQL |
| [016_sales_intake_site_visit.sql](<../../database/migrations/016_sales_intake_site_visit.sql>) | `dbo.customer_sites`, `dbo.customer_site_contacts`, `dbo.visit_types`, `dbo.visit_skills`, `dbo.engineer_skills`, `dbo.engineer_availability`, `dbo.visit_checklist_templates`, `dbo.visit_checklist_items`, `dbo.visit_sla_policies`, `dbo.sales_intakes`, `dbo.sales_intake_purposes`, `dbo.sales_intake_skills`, `dbo.sales_intake_windows`, `dbo.sales_intake_attachments`, `dbo.sales_intake_reviews`, `dbo.site_visits`, `dbo.site_visit_assignments`, `dbo.site_visit_confirmations`, `dbo.site_visit_schedule_history`, `dbo.site_visit_checklist_responses`, `dbo.site_visit_findings`, `dbo.site_visit_attachments`, `dbo.site_visit_reports`, `dbo.site_visit_report_revisions`, `dbo.site_visit_action_items`, `dbo.site_visit_status_history`, `dbo.site_visit_links` |
| [017_node_backend_permissions.sql](<../../database/migrations/017_node_backend_permissions.sql>) | Inspect migration SQL |
| [018_document_signing.sql](<../../database/migrations/018_document_signing.sql>) | `dbo.company_stamps`, `dbo.stamp_authorities`, `dbo.signature_specimens`, `dbo.sign_flow_templates`, `dbo.sign_flow_steps`, `dbo.signable_documents`, `dbo.document_files`, `dbo.sign_requests`, `dbo.sign_steps`, `dbo.signature_marks`, `dbo.signed_documents`, `dbo.sign_events` |
| [019_resource_planning.sql](<../../database/migrations/019_resource_planning.sql>) | `dbo.resource_capacity`, `dbo.resource_effort` |
| [020_module_templates.sql](<../../database/migrations/020_module_templates.sql>) | `dbo.module_templates`, `dbo.module_template_lines` |
| [021_drawing_task_workflow.sql](<../../database/migrations/021_drawing_task_workflow.sql>) | Inspect migration SQL |
| [022_employee_directory_assignments.sql](<../../database/migrations/022_employee_directory_assignments.sql>) | Inspect migration SQL |
| [023_management_signing_role.sql](<../../database/migrations/023_management_signing_role.sql>) | `dbo.user_business_roles`, `dbo.user_signing_permissions` |
| [024_resource_task_lifecycle.sql](<../../database/migrations/024_resource_task_lifecycle.sql>) | `dbo.resource_tasks`, `dbo.resource_task_sources` |
| [025_reports.sql](<../../database/migrations/025_reports.sql>) | `dbo.unified_reports`, `dbo.unified_report_revisions`, `dbo.unified_report_customer_links`, `dbo.unified_report_acknowledgments`, `dbo.unified_report_signatures` |
| [026_performance_reviews.sql](<../../database/migrations/026_performance_reviews.sql>) | `dbo.kpi_review_cycles`, `dbo.kpi_assessments`, `dbo.kpi_assessment_scores` |
| [027_report_templates.sql](<../../database/migrations/027_report_templates.sql>) | `dbo.report_templates` |
| [028_end_user_companies.sql](<../../database/migrations/028_end_user_companies.sql>) | Inspect migration SQL |
| [029_sales_performance_reviews.sql](<../../database/migrations/029_sales_performance_reviews.sql>) | Inspect migration SQL |
| [030_customer_multilingual_names.sql](<../../database/migrations/030_customer_multilingual_names.sql>) | Inspect migration SQL |
| [031_customer_contact_titles.sql](<../../database/migrations/031_customer_contact_titles.sql>) | Inspect migration SQL |
| [032_estimate_excel_import.sql](<../../database/migrations/032_estimate_excel_import.sql>) | Inspect migration SQL |
| [033_historical_pr_import.sql](<../../database/migrations/033_historical_pr_import.sql>) | `dbo.historical_pr_imports` |
| [034_support_center.sql](<../../database/migrations/034_support_center.sql>) | `dbo.support_categories`, `dbo.support_members`, `dbo.support_tickets`, `dbo.support_events`, `dbo.support_attachments`, `dbo.support_recognition` |
| [035_team_activity.sql](<../../database/migrations/035_team_activity.sql>) | `dbo.activity_settings`, `dbo.activity_sessions`, `dbo.activity_rules`, `dbo.activity_events`, `dbo.activity_exceptions`, `dbo.activity_cycle_policies`, `dbo.activity_quality`, `dbo.activity_snapshots`, `dbo.activity_clarifications` |
| [036_report_evidence_images.sql](<../../database/migrations/036_report_evidence_images.sql>) | `dbo.unified_report_evidence_files` |
| [037_unified_report_exports.sql](<../../database/migrations/037_unified_report_exports.sql>) | `dbo.unified_report_exports` |
| [038_supplier_quotation_lines.sql](<../../database/migrations/038_supplier_quotation_lines.sql>) | `dbo.supplier_quotation_lines` |
| [039_nas_storage_settings.sql](<../../database/migrations/039_nas_storage_settings.sql>) | `dbo.nas_storage_settings` |
| [040_estimate_overhead_policy.sql](<../../database/migrations/040_estimate_overhead_policy.sql>) | `dbo.overhead_policies`, `dbo.estimate_overhead_snapshots`, `dbo.estimate_submission_snapshots`, `dbo.v_estimate_totals` |
| [041_user_role_management.sql](<../../database/migrations/041_user_role_management.sql>) | Inspect migration SQL |
| [042_estimate_total_guard.sql](<../../database/migrations/042_estimate_total_guard.sql>) | Inspect migration SQL |
| [043_estimate_erp_cost_mapping.sql](<../../database/migrations/043_estimate_erp_cost_mapping.sql>) | `dbo.estimate_erp_mappings` |
| [044_estimate_labor_masters.sql](<../../database/migrations/044_estimate_labor_masters.sql>) | `dbo.labor_packages`, `dbo.labor_package_lines` |
| [045_estimate_line_order.sql](<../../database/migrations/045_estimate_line_order.sql>) | Inspect migration SQL |
| [046_estimate_module_details.sql](<../../database/migrations/046_estimate_module_details.sql>) | `dbo.estimate_module_details` |
| [047_estimate_module_description_rows.sql](<../../database/migrations/047_estimate_module_description_rows.sql>) | Inspect migration SQL |
| [048_estimate_price_sets.sql](<../../database/migrations/048_estimate_price_sets.sql>) | Inspect migration SQL |
| [049_estimate_module_quantity.sql](<../../database/migrations/049_estimate_module_quantity.sql>) | Inspect migration SQL |
| [050_estimate_product_codes.sql](<../../database/migrations/050_estimate_product_codes.sql>) | Inspect migration SQL |

Read [backend-node/src/migration-validation.ts](<../../backend-node/src/migration-validation.ts>), [backend-node/src/startup-migrations.ts](<../../backend-node/src/startup-migrations.ts>) and [backend-node/src/migrate.ts](<../../backend-node/src/migrate.ts>) before planning a migration. Applied migration identities and environment flags matter; never rewrite an already applied migration.
