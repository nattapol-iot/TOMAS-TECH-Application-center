-- Migration 066: grants the least-privilege application role was missing, and an
-- owner-executed procedure for linking a registered person on first TMT ID sign-in.
--
-- Production still connects as sa, so these gaps never showed. Each grant below matches a
-- statement the Node API already runs; tests/app-role-grants.test.mjs compares every table,
-- view and procedure the API touches (and the columns it updates where the grant is
-- column-level) with what iot_team_app_role is granted, so the next gap fails a test.
--
--   estimate_erp_groups        ERP summary merge/split groups          (estimate-erp.ts)
--   nas_storage_settings       Admin → NAS settings                    (admin.ts)
--   supplier_quotation_lines   parsed quotation lines                  (supplier-quotations.ts)
--   supplier_quotations        edit a quotation's header (never its stored file or hash),
--                              and delete one, both audited            (supplier-quotations.ts)
--   suppliers                  edit a supplier                         (master.ts)
--   engineering_rates          supersede or retire a rate              (labor-rates.ts)
--   visit_checklist_items      replace a visit checklist's items       (visit-master.ts)
--   projects (columns)         edit a project and its lifecycle        (routes/projects.ts)
--
-- dbo.users stays updateable only in role_id and updated_at (080's baseline). Linking a sign-in
-- writes entra_object_id through link_registered_sign_in instead, which only ever fills an
-- account that has no TMT ID yet, as database/scripts/030_provision_user.sql does.

-- ── Batch 1: link a registered person on first sign-in ──────────────────────
-- A procedure must open its batch; 020's runner includes the previous migration right before this.
GO
CREATE OR ALTER PROCEDURE dbo.link_registered_sign_in
    @object_id nvarchar(64),
    @email nvarchar(256)
WITH EXECUTE AS OWNER
AS
BEGIN
    SET NOCOUNT ON;
    IF @object_id IS NULL OR LEN(@object_id) = 0 OR @email IS NULL OR LEN(@email) = 0
        THROW 51900, 'A sign-in can be linked only with both its subject and email.', 1;

    -- Already linked: nothing to do. This also covers a deprovisioned account that still holds
    -- the subject; bringing that person back is an operator task (030_provision_user.sql).
    IF EXISTS (SELECT 1 FROM dbo.users WHERE entra_object_id = @object_id) RETURN;

    -- The registered account for this email, when it has no TMT ID yet. An account already
    -- linked to another subject is never moved to this one; identities left from the team-test
    -- period may be replaced. Nothing is ever inserted: unknown people stay unregistered.
    UPDATE dbo.users
       SET entra_object_id = @object_id, updated_at = SYSUTCDATETIME()
     WHERE email = @email AND deleted_at IS NULL
       AND (entra_object_id IS NULL OR entra_object_id LIKE N'team-test:%');
END;
GO

-- ── Batch 2: grants ─────────────────────────────────────────────────────────
REVOKE EXECUTE ON OBJECT::dbo.link_registered_sign_in FROM [public];

IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
BEGIN
    GRANT EXECUTE ON OBJECT::dbo.link_registered_sign_in TO [iot_team_app_role];
    GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.estimate_erp_groups TO [iot_team_app_role];
    GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.nas_storage_settings TO [iot_team_app_role];
    GRANT SELECT, INSERT, DELETE ON OBJECT::dbo.supplier_quotation_lines TO [iot_team_app_role];
    GRANT UPDATE (supplier_id, supplier_reference, received_date, valid_until, currency, amount, inquiry_id, source_url) ON OBJECT::dbo.supplier_quotations TO [iot_team_app_role];
    GRANT DELETE ON OBJECT::dbo.supplier_quotations TO [iot_team_app_role];
    GRANT UPDATE ON OBJECT::dbo.suppliers TO [iot_team_app_role];
    GRANT UPDATE ON OBJECT::dbo.engineering_rates TO [iot_team_app_role];
    GRANT DELETE ON OBJECT::dbo.visit_checklist_items TO [iot_team_app_role];
    GRANT UPDATE (name, project_type, site, po_no, po_date, manager_id, lead_engineer_id, start_date, target_delivery, actual_delivery, status, progress, remark) ON OBJECT::dbo.projects TO [iot_team_app_role];
END;
GO

-- ── Batch 3: record the version last ────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 66)
    INSERT dbo.schema_versions(version, name)
    VALUES (66, N'Application role grants for existing API statements');
