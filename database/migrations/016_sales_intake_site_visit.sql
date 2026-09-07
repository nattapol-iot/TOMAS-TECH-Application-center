:on error exit
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NUMERIC_ROUNDABORT OFF;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 16)
    THROW 51190, 'Migration 016 has already been applied.', 1;
IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 15)
    THROW 51191, 'Migration 015 must be applied before migration 016.', 1;

-- =====================================================================
-- Sales Intake & Engineer Site Visit Management
--
--   Sales Intake -> Technical Review -> Site Visit Request -> Assign
--   Engineer -> Engineer/Customer Confirmation -> Site Visit ->
--   Site Visit Report -> Inquiry / Estimate -> Project follow-up
--
-- Three deliberate design decisions, because they shape the whole module:
--
--  1. SALES DATA, TECHNICAL ASSESSMENT AND SITE FINDINGS ARE THREE TABLES.
--     dbo.sales_intakes holds what the customer said. dbo.sales_intake_reviews
--     holds what engineering concluded. dbo.site_visit_findings holds what was
--     actually observed on site. No engineering write path can reach the sales
--     columns, so the original request survives review and the visit intact.
--
--  2. STATUS HISTORY IS APPEND-ONLY, ENFORCED BY A TRIGGER, not by convention,
--     the same guarantee dbo.stock_txns and dbo.knowledge_audit_events carry.
--
--  3. A CONFIRMED APPOINTMENT CANNOT DOUBLE-BOOK AN ENGINEER.  The referee is
--     a filtered unique index plus dbo.assert_engineer_available, called inside
--     the assigning transaction under UPDLOCK/HOLDLOCK.  An Engineering Manager
--     override is a recorded column on the assignment, never a bypass of the
--     check.
--
-- Where the requested field list assumed an entity this system does not have:
--
--   * There is no dbo.departments and no dbo.teams table.  Department stays an
--     nvarchar matching dbo.users.department, as migration 014 already does.
--   * Engineers are dbo.users rows; dbo.employees is the HR master and is not
--     a login identity, so assignments reference dbo.users.
--   * Document numbers reuse dbo.issue_document_number (TYPE-YYMM-NNNN) with
--     the new types SIN, SV and SVR rather than a second allocator.
-- =====================================================================


-- =====================================================================
-- SECTION 1 — Master data (admin maintained)
-- =====================================================================

-- Customer sites.  dbo.customers carries a single free-text 'site'; a customer
-- with three factories needs three addressable places to send an engineer.
CREATE TABLE dbo.customer_sites (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_customer_sites PRIMARY KEY,
    customer_id bigint NOT NULL,
    code nvarchar(40) NOT NULL,
    name nvarchar(300) NOT NULL,
    branch nvarchar(200) NOT NULL CONSTRAINT DF_customer_sites_branch DEFAULT N'',
    address nvarchar(1000) NOT NULL CONSTRAINT DF_customer_sites_address DEFAULT N'',
    province nvarchar(120) NOT NULL CONSTRAINT DF_customer_sites_province DEFAULT N'',
    country nvarchar(120) NOT NULL CONSTRAINT DF_customer_sites_country DEFAULT N'Thailand',
    latitude decimal(9,6) NULL,
    longitude decimal(9,6) NULL,
    travel_minutes int NOT NULL CONSTRAINT DF_customer_sites_travel DEFAULT 60,
    access_note nvarchar(max) NULL,
    is_active bit NOT NULL CONSTRAINT DF_customer_sites_active DEFAULT 1,
    created_by bigint NOT NULL,
    created_at datetimeoffset(0) NOT NULL CONSTRAINT DF_customer_sites_created DEFAULT SYSUTCDATETIME(),
    updated_by bigint NOT NULL,
    updated_at datetimeoffset(0) NOT NULL CONSTRAINT DF_customer_sites_updated DEFAULT SYSUTCDATETIME(),
    deleted_at datetimeoffset(0) NULL,
    row_version rowversion NOT NULL,
    CONSTRAINT UQ_customer_sites_code UNIQUE (customer_id, code),
    CONSTRAINT CK_customer_sites_name CHECK (LEN(LTRIM(RTRIM(name))) > 0),
    CONSTRAINT CK_customer_sites_travel CHECK (travel_minutes BETWEEN 0 AND 2880),
    CONSTRAINT CK_customer_sites_latitude CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
    CONSTRAINT CK_customer_sites_longitude CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
    CONSTRAINT FK_customer_sites_customer FOREIGN KEY (customer_id) REFERENCES dbo.customers(id),
    CONSTRAINT FK_customer_sites_created_by FOREIGN KEY (created_by) REFERENCES dbo.users(id),
    CONSTRAINT FK_customer_sites_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users(id)
);
CREATE INDEX IX_customer_sites_customer ON dbo.customer_sites(customer_id, name) WHERE deleted_at IS NULL;

CREATE TABLE dbo.customer_site_contacts (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_customer_site_contacts PRIMARY KEY,
    site_id bigint NOT NULL,
    name nvarchar(200) NOT NULL,
    department nvarchar(200) NOT NULL CONSTRAINT DF_customer_site_contacts_dept DEFAULT N'',
    position nvarchar(200) NOT NULL CONSTRAINT DF_customer_site_contacts_position DEFAULT N'',
    phone nvarchar(100) NOT NULL CONSTRAINT DF_customer_site_contacts_phone DEFAULT N'',
    email nvarchar(256) NOT NULL CONSTRAINT DF_customer_site_contacts_email DEFAULT N'',
    preferred_channel nvarchar(30) NOT NULL CONSTRAINT DF_customer_site_contacts_channel DEFAULT N'Email',
    is_primary bit NOT NULL CONSTRAINT DF_customer_site_contacts_primary DEFAULT 0,
    is_active bit NOT NULL CONSTRAINT DF_customer_site_contacts_active DEFAULT 1,
    created_by bigint NOT NULL,
    created_at datetimeoffset(0) NOT NULL CONSTRAINT DF_customer_site_contacts_created DEFAULT SYSUTCDATETIME(),
    updated_by bigint NOT NULL,
    updated_at datetimeoffset(0) NOT NULL CONSTRAINT DF_customer_site_contacts_updated DEFAULT SYSUTCDATETIME(),
    deleted_at datetimeoffset(0) NULL,
    row_version rowversion NOT NULL,
    CONSTRAINT CK_customer_site_contacts_name CHECK (LEN(LTRIM(RTRIM(name))) > 0),
    CONSTRAINT CK_customer_site_contacts_channel CHECK (preferred_channel IN (
        N'Email', N'Phone', N'LINE', N'Meeting', N'Customer Portal', N'Other')),
    CONSTRAINT FK_customer_site_contacts_site FOREIGN KEY (site_id) REFERENCES dbo.customer_sites(id),
    CONSTRAINT FK_customer_site_contacts_created_by FOREIGN KEY (created_by) REFERENCES dbo.users(id),
    CONSTRAINT FK_customer_site_contacts_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users(id)
);
CREATE INDEX IX_customer_site_contacts_site ON dbo.customer_site_contacts(site_id, is_primary DESC, name) WHERE deleted_at IS NULL;

-- Visit purposes ("visit types").  Each carries the default duration and crew
-- size the coordinator starts from, and the checklist the engineer will get.
CREATE TABLE dbo.visit_types (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_visit_types PRIMARY KEY,
    code nvarchar(40) NOT NULL CONSTRAINT UQ_visit_types_code UNIQUE,
    name_en nvarchar(200) NOT NULL,
    name_th nvarchar(200) NOT NULL CONSTRAINT DF_visit_types_name_th DEFAULT N'',
    name_ja nvarchar(200) NOT NULL CONSTRAINT DF_visit_types_name_ja DEFAULT N'',
    description nvarchar(1000) NOT NULL CONSTRAINT DF_visit_types_description DEFAULT N'',
    default_duration_minutes int NOT NULL CONSTRAINT DF_visit_types_duration DEFAULT 240,
    default_engineer_count tinyint NOT NULL CONSTRAINT DF_visit_types_engineers DEFAULT 1,
    requires_manager_approval bit NOT NULL CONSTRAINT DF_visit_types_manager DEFAULT 0,
    sort_order int NOT NULL CONSTRAINT DF_visit_types_sort DEFAULT 0,
    is_active bit NOT NULL CONSTRAINT DF_visit_types_active DEFAULT 1,
    created_by bigint NOT NULL,
    created_at datetimeoffset(0) NOT NULL CONSTRAINT DF_visit_types_created DEFAULT SYSUTCDATETIME(),
    updated_by bigint NOT NULL,
    updated_at datetimeoffset(0) NOT NULL CONSTRAINT DF_visit_types_updated DEFAULT SYSUTCDATETIME(),
    row_version rowversion NOT NULL,
    CONSTRAINT CK_visit_types_code CHECK (LEN(LTRIM(RTRIM(code))) > 0),
    CONSTRAINT CK_visit_types_name CHECK (LEN(LTRIM(RTRIM(name_en))) > 0),
    CONSTRAINT CK_visit_types_duration CHECK (default_duration_minutes BETWEEN 15 AND 10080),
    CONSTRAINT CK_visit_types_engineers CHECK (default_engineer_count BETWEEN 1 AND 20),
    CONSTRAINT FK_visit_types_created_by FOREIGN KEY (created_by) REFERENCES dbo.users(id),
    CONSTRAINT FK_visit_types_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users(id)
);

CREATE TABLE dbo.visit_skills (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_visit_skills PRIMARY KEY,
    code nvarchar(40) NOT NULL CONSTRAINT UQ_visit_skills_code UNIQUE,
    name_en nvarchar(200) NOT NULL,
    name_th nvarchar(200) NOT NULL CONSTRAINT DF_visit_skills_name_th DEFAULT N'',
    name_ja nvarchar(200) NOT NULL CONSTRAINT DF_visit_skills_name_ja DEFAULT N'',
    discipline nvarchar(100) NOT NULL CONSTRAINT DF_visit_skills_discipline DEFAULT N'General',
    sort_order int NOT NULL CONSTRAINT DF_visit_skills_sort DEFAULT 0,
    is_active bit NOT NULL CONSTRAINT DF_visit_skills_active DEFAULT 1,
    created_by bigint NOT NULL,
    created_at datetimeoffset(0) NOT NULL CONSTRAINT DF_visit_skills_created DEFAULT SYSUTCDATETIME(),
    updated_by bigint NOT NULL,
    updated_at datetimeoffset(0) NOT NULL CONSTRAINT DF_visit_skills_updated DEFAULT SYSUTCDATETIME(),
    row_version rowversion NOT NULL,
    CONSTRAINT CK_visit_skills_code CHECK (LEN(LTRIM(RTRIM(code))) > 0),
    CONSTRAINT CK_visit_skills_name CHECK (LEN(LTRIM(RTRIM(name_en))) > 0),
    CONSTRAINT FK_visit_skills_created_by FOREIGN KEY (created_by) REFERENCES dbo.users(id),
    CONSTRAINT FK_visit_skills_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users(id)
);

CREATE TABLE dbo.engineer_skills (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_engineer_skills PRIMARY KEY,
    user_id bigint NOT NULL,
    skill_id bigint NOT NULL,
    proficiency nvarchar(20) NOT NULL CONSTRAINT DF_engineer_skills_proficiency DEFAULT N'Working',
    note nvarchar(500) NOT NULL CONSTRAINT DF_engineer_skills_note DEFAULT N'',
    created_by bigint NOT NULL,
    created_at datetimeoffset(0) NOT NULL CONSTRAINT DF_engineer_skills_created DEFAULT SYSUTCDATETIME(),
    updated_by bigint NOT NULL,
    updated_at datetimeoffset(0) NOT NULL CONSTRAINT DF_engineer_skills_updated DEFAULT SYSUTCDATETIME(),
    row_version rowversion NOT NULL,
    CONSTRAINT UQ_engineer_skills_user_skill UNIQUE (user_id, skill_id),
    CONSTRAINT CK_engineer_skills_proficiency CHECK (proficiency IN (N'Learning', N'Working', N'Advanced', N'Expert')),
    CONSTRAINT FK_engineer_skills_user FOREIGN KEY (user_id) REFERENCES dbo.users(id),
    CONSTRAINT FK_engineer_skills_skill FOREIGN KEY (skill_id) REFERENCES dbo.visit_skills(id),
    CONSTRAINT FK_engineer_skills_created_by FOREIGN KEY (created_by) REFERENCES dbo.users(id),
    CONSTRAINT FK_engineer_skills_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users(id)
);
CREATE INDEX IX_engineer_skills_skill ON dbo.engineer_skills(skill_id, user_id);

-- Leave, training, or any other block of time the engineer cannot be on site.
CREATE TABLE dbo.engineer_availability (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_engineer_availability PRIMARY KEY,
    user_id bigint NOT NULL,
    kind nvarchar(40) NOT NULL,
    reason nvarchar(300) NOT NULL CONSTRAINT DF_engineer_availability_reason DEFAULT N'',
    starts_at datetimeoffset(0) NOT NULL,
    ends_at datetimeoffset(0) NOT NULL,
    created_by bigint NOT NULL,
    created_at datetimeoffset(0) NOT NULL CONSTRAINT DF_engineer_availability_created DEFAULT SYSUTCDATETIME(),
    deleted_at datetimeoffset(0) NULL,
    row_version rowversion NOT NULL,
    CONSTRAINT CK_engineer_availability_kind CHECK (kind IN (
        N'Leave', N'Training', N'Public Holiday', N'Company Holiday', N'Other Assignment', N'Unavailable')),
    CONSTRAINT CK_engineer_availability_range CHECK (ends_at > starts_at),
    CONSTRAINT FK_engineer_availability_user FOREIGN KEY (user_id) REFERENCES dbo.users(id),
    CONSTRAINT FK_engineer_availability_created_by FOREIGN KEY (created_by) REFERENCES dbo.users(id)
);
CREATE INDEX IX_engineer_availability_user_range ON dbo.engineer_availability(user_id, starts_at, ends_at) WHERE deleted_at IS NULL;

CREATE TABLE dbo.visit_checklist_templates (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_visit_checklist_templates PRIMARY KEY,
    code nvarchar(40) NOT NULL CONSTRAINT UQ_visit_checklist_templates_code UNIQUE,
    name nvarchar(300) NOT NULL,
    visit_type_id bigint NULL,
    description nvarchar(1000) NOT NULL CONSTRAINT DF_visit_checklist_templates_desc DEFAULT N'',
    version int NOT NULL CONSTRAINT DF_visit_checklist_templates_version DEFAULT 1,
    is_active bit NOT NULL CONSTRAINT DF_visit_checklist_templates_active DEFAULT 1,
    created_by bigint NOT NULL,
    created_at datetimeoffset(0) NOT NULL CONSTRAINT DF_visit_checklist_templates_created DEFAULT SYSUTCDATETIME(),
    updated_by bigint NOT NULL,
    updated_at datetimeoffset(0) NOT NULL CONSTRAINT DF_visit_checklist_templates_updated DEFAULT SYSUTCDATETIME(),
    row_version rowversion NOT NULL,
    CONSTRAINT CK_visit_checklist_templates_name CHECK (LEN(LTRIM(RTRIM(name))) > 0),
    CONSTRAINT CK_visit_checklist_templates_version CHECK (version > 0),
    CONSTRAINT FK_visit_checklist_templates_type FOREIGN KEY (visit_type_id) REFERENCES dbo.visit_types(id),
    CONSTRAINT FK_visit_checklist_templates_created_by FOREIGN KEY (created_by) REFERENCES dbo.users(id),
    CONSTRAINT FK_visit_checklist_templates_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users(id)
);
-- One active default template per visit type, decided by the database rather
-- than by whichever endpoint happens to save last.
CREATE UNIQUE INDEX UX_visit_checklist_templates_default
    ON dbo.visit_checklist_templates(visit_type_id)
    WHERE is_active = 1 AND visit_type_id IS NOT NULL;

CREATE TABLE dbo.visit_checklist_items (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_visit_checklist_items PRIMARY KEY,
    template_id bigint NOT NULL,
    sort_order int NOT NULL,
    section nvarchar(200) NOT NULL CONSTRAINT DF_visit_checklist_items_section DEFAULT N'General',
    prompt nvarchar(500) NOT NULL,
    response_type nvarchar(20) NOT NULL CONSTRAINT DF_visit_checklist_items_type DEFAULT N'YesNo',
    unit nvarchar(40) NOT NULL CONSTRAINT DF_visit_checklist_items_unit DEFAULT N'',
    is_required bit NOT NULL CONSTRAINT DF_visit_checklist_items_required DEFAULT 0,
    guidance nvarchar(1000) NOT NULL CONSTRAINT DF_visit_checklist_items_guidance DEFAULT N'',
    is_active bit NOT NULL CONSTRAINT DF_visit_checklist_items_active DEFAULT 1,
    row_version rowversion NOT NULL,
    CONSTRAINT UQ_visit_checklist_items_order UNIQUE (template_id, sort_order),
    CONSTRAINT CK_visit_checklist_items_prompt CHECK (LEN(LTRIM(RTRIM(prompt))) > 0),
    CONSTRAINT CK_visit_checklist_items_type CHECK (response_type IN (
        N'YesNo', N'Text', N'Number', N'Measurement', N'Photo', N'Choice')),
    CONSTRAINT FK_visit_checklist_items_template FOREIGN KEY (template_id) REFERENCES dbo.visit_checklist_templates(id)
);

-- Service-level policy.  One row is the effective default; a visit type may
-- carry its own.
CREATE TABLE dbo.visit_sla_policies (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_visit_sla_policies PRIMARY KEY,
    code nvarchar(40) NOT NULL CONSTRAINT UQ_visit_sla_policies_code UNIQUE,
    name nvarchar(200) NOT NULL,
    visit_type_id bigint NULL,
    review_response_days int NOT NULL CONSTRAINT DF_visit_sla_review_days DEFAULT 2,
    schedule_lead_days int NOT NULL CONSTRAINT DF_visit_sla_schedule_days DEFAULT 5,
    report_due_days int NOT NULL CONSTRAINT DF_visit_sla_report_days DEFAULT 3,
    report_warning_hours int NOT NULL CONSTRAINT DF_visit_sla_warning_hours DEFAULT 24,
    is_default bit NOT NULL CONSTRAINT DF_visit_sla_policies_default DEFAULT 0,
    is_active bit NOT NULL CONSTRAINT DF_visit_sla_policies_active DEFAULT 1,
    created_by bigint NOT NULL,
    created_at datetimeoffset(0) NOT NULL CONSTRAINT DF_visit_sla_policies_created DEFAULT SYSUTCDATETIME(),
    updated_by bigint NOT NULL,
    updated_at datetimeoffset(0) NOT NULL CONSTRAINT DF_visit_sla_policies_updated DEFAULT SYSUTCDATETIME(),
    row_version rowversion NOT NULL,
    CONSTRAINT CK_visit_sla_policies_name CHECK (LEN(LTRIM(RTRIM(name))) > 0),
    CONSTRAINT CK_visit_sla_policies_days CHECK (
        review_response_days BETWEEN 0 AND 90
        AND schedule_lead_days BETWEEN 0 AND 365
        AND report_due_days BETWEEN 1 AND 90
        AND report_warning_hours BETWEEN 1 AND 720),
    CONSTRAINT FK_visit_sla_policies_type FOREIGN KEY (visit_type_id) REFERENCES dbo.visit_types(id),
    CONSTRAINT FK_visit_sla_policies_created_by FOREIGN KEY (created_by) REFERENCES dbo.users(id),
    CONSTRAINT FK_visit_sla_policies_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users(id)
);
-- Exactly one active default, and at most one active policy per visit type.
CREATE UNIQUE INDEX UX_visit_sla_policies_one_default
    ON dbo.visit_sla_policies(is_default) WHERE is_default = 1 AND is_active = 1;
CREATE UNIQUE INDEX UX_visit_sla_policies_type
    ON dbo.visit_sla_policies(visit_type_id) WHERE is_active = 1 AND visit_type_id IS NOT NULL;


-- =====================================================================
-- SECTION 2 — Sales Intake (what the customer said)
-- =====================================================================

CREATE TABLE dbo.sales_intakes (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_sales_intakes PRIMARY KEY,
    intake_no nvarchar(30) NOT NULL CONSTRAINT UQ_sales_intakes_no UNIQUE,
    status nvarchar(50) NOT NULL CONSTRAINT DF_sales_intakes_status DEFAULT N'Draft',

    -- 3.1 Customer and site
    customer_id bigint NOT NULL,
    site_id bigint NULL,
    site_contact_id bigint NULL,
    customer_branch nvarchar(200) NOT NULL CONSTRAINT DF_sales_intakes_branch DEFAULT N'',
    site_name nvarchar(300) NOT NULL CONSTRAINT DF_sales_intakes_site_name DEFAULT N'',
    site_address nvarchar(1000) NOT NULL CONSTRAINT DF_sales_intakes_site_address DEFAULT N'',
    contact_name nvarchar(200) NOT NULL CONSTRAINT DF_sales_intakes_contact_name DEFAULT N'',
    contact_department nvarchar(200) NOT NULL CONSTRAINT DF_sales_intakes_contact_dept DEFAULT N'',
    contact_position nvarchar(200) NOT NULL CONSTRAINT DF_sales_intakes_contact_position DEFAULT N'',
    contact_phone nvarchar(100) NOT NULL CONSTRAINT DF_sales_intakes_contact_phone DEFAULT N'',
    contact_email nvarchar(256) NOT NULL CONSTRAINT DF_sales_intakes_contact_email DEFAULT N'',
    contact_channel nvarchar(30) NOT NULL CONSTRAINT DF_sales_intakes_contact_channel DEFAULT N'Email',

    -- 3.2 Request
    customer_reference_no nvarchar(100) NOT NULL CONSTRAINT DF_sales_intakes_customer_ref DEFAULT N'',
    subject nvarchar(300) NOT NULL,
    request_date date NOT NULL,
    sales_owner_id bigint NOT NULL,
    priority nvarchar(30) NOT NULL CONSTRAINT DF_sales_intakes_priority DEFAULT N'Normal',
    required_response_date date NULL,
    customer_expected_completion date NULL,
    source nvarchar(40) NOT NULL CONSTRAINT DF_sales_intakes_source DEFAULT N'Email',
    related_inquiry_id bigint NULL,
    related_project_id bigint NULL,

    -- 3.3 Customer requirement (sales-owned; engineering never writes here)
    problem_statement nvarchar(max) NULL,
    desired_capability nvarchar(max) NULL,
    expected_result nvarchar(max) NULL,
    expected_scope nvarchar(max) NULL,
    out_of_scope nvarchar(max) NULL,
    existing_process nvarchar(max) NULL,
    current_pain_point nvarchar(max) NULL,
    target_cycle_time nvarchar(300) NOT NULL CONSTRAINT DF_sales_intakes_cycle DEFAULT N'',
    product_information nvarchar(max) NULL,
    quality_requirement nvarchar(max) NULL,
    special_requirement nvarchar(max) NULL,
    budget_range nvarchar(200) NOT NULL CONSTRAINT DF_sales_intakes_budget DEFAULT N'',
    expected_timeline nvarchar(300) NOT NULL CONSTRAINT DF_sales_intakes_timeline DEFAULT N'',
    competitor_information nvarchar(max) NULL,
    additional_notes nvarchar(max) NULL,

    -- 3.4 Machine and site conditions
    machine_name nvarchar(300) NOT NULL CONSTRAINT DF_sales_intakes_machine_name DEFAULT N'',
    machine_model nvarchar(200) NOT NULL CONSTRAINT DF_sales_intakes_machine_model DEFAULT N'',
    machine_serial_no nvarchar(200) NOT NULL CONSTRAINT DF_sales_intakes_machine_serial DEFAULT N'',
    manufacturer nvarchar(200) NOT NULL CONSTRAINT DF_sales_intakes_manufacturer DEFAULT N'',
    existing_system nvarchar(max) NULL,
    controller_brand nvarchar(300) NOT NULL CONSTRAINT DF_sales_intakes_controller DEFAULT N'',
    available_drawing nvarchar(500) NOT NULL CONSTRAINT DF_sales_intakes_drawing DEFAULT N'',
    utility_information nvarchar(max) NULL,
    installation_area nvarchar(300) NOT NULL CONSTRAINT DF_sales_intakes_area DEFAULT N'',
    space_limitation nvarchar(max) NULL,
    working_environment nvarchar(max) NULL,
    safety_requirement nvarchar(max) NULL,
    production_schedule nvarchar(500) NOT NULL CONSTRAINT DF_sales_intakes_prod_schedule DEFAULT N'',
    shutdown_window nvarchar(500) NOT NULL CONSTRAINT DF_sales_intakes_shutdown DEFAULT N'',
    ppe_requirement nvarchar(500) NOT NULL CONSTRAINT DF_sales_intakes_ppe DEFAULT N'',
    site_access_requirement nvarchar(max) NULL,
    photography_restricted bit NOT NULL CONSTRAINT DF_sales_intakes_photo DEFAULT 0,
    nda_required bit NOT NULL CONSTRAINT DF_sales_intakes_nda DEFAULT 0,

    -- Derived, recomputed by the API on every write so a list page can sort
    -- and filter on readiness without loading each intake.
    readiness_score tinyint NOT NULL CONSTRAINT DF_sales_intakes_readiness DEFAULT 0,
    blocker_count tinyint NOT NULL CONSTRAINT DF_sales_intakes_blockers DEFAULT 0,
    warning_count tinyint NOT NULL CONSTRAINT DF_sales_intakes_warnings DEFAULT 0,

    submitted_at datetimeoffset(0) NULL,
    submitted_by bigint NULL,
    department nvarchar(100) NOT NULL CONSTRAINT DF_sales_intakes_department DEFAULT N'',
    created_by bigint NOT NULL,
    created_at datetimeoffset(0) NOT NULL CONSTRAINT DF_sales_intakes_created DEFAULT SYSUTCDATETIME(),
    updated_by bigint NOT NULL,
    updated_at datetimeoffset(0) NOT NULL CONSTRAINT DF_sales_intakes_updated DEFAULT SYSUTCDATETIME(),
    archived_at datetimeoffset(0) NULL,
    deleted_at datetimeoffset(0) NULL,
    row_version rowversion NOT NULL,

    CONSTRAINT CK_sales_intakes_subject CHECK (LEN(LTRIM(RTRIM(subject))) > 0),
    CONSTRAINT CK_sales_intakes_status CHECK (status IN (
        N'Draft', N'Pending Technical Review', N'More Information Required', N'Ready to Schedule',
        N'Scheduled', N'Completed', N'On Hold', N'Cancelled', N'Closed')),
    CONSTRAINT CK_sales_intakes_priority CHECK (priority IN (N'Low', N'Normal', N'High', N'Urgent')),
    CONSTRAINT CK_sales_intakes_source CHECK (source IN (
        N'Email', N'Phone', N'Meeting', N'Existing Customer', N'Referral', N'Website', N'Other')),
    CONSTRAINT CK_sales_intakes_channel CHECK (contact_channel IN (
        N'Email', N'Phone', N'LINE', N'Meeting', N'Customer Portal', N'Other')),
    CONSTRAINT CK_sales_intakes_readiness CHECK (readiness_score BETWEEN 0 AND 100),
    -- Anything past Draft was submitted by somebody, and says so. A draft may
    -- still be cancelled outright, which is why Cancelled is exempt.
    CONSTRAINT CK_sales_intakes_submitted CHECK (
        status IN (N'Draft', N'Cancelled') OR (submitted_at IS NOT NULL AND submitted_by IS NOT NULL)),
    CONSTRAINT FK_sales_intakes_customer FOREIGN KEY (customer_id) REFERENCES dbo.customers(id),
    CONSTRAINT FK_sales_intakes_site FOREIGN KEY (site_id) REFERENCES dbo.customer_sites(id),
    CONSTRAINT FK_sales_intakes_site_contact FOREIGN KEY (site_contact_id) REFERENCES dbo.customer_site_contacts(id),
    CONSTRAINT FK_sales_intakes_sales_owner FOREIGN KEY (sales_owner_id) REFERENCES dbo.users(id),
    CONSTRAINT FK_sales_intakes_inquiry FOREIGN KEY (related_inquiry_id) REFERENCES dbo.inquiries(id),
    CONSTRAINT FK_sales_intakes_project FOREIGN KEY (related_project_id) REFERENCES dbo.projects(id),
    CONSTRAINT FK_sales_intakes_submitted_by FOREIGN KEY (submitted_by) REFERENCES dbo.users(id),
    CONSTRAINT FK_sales_intakes_created_by FOREIGN KEY (created_by) REFERENCES dbo.users(id),
    CONSTRAINT FK_sales_intakes_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users(id)
);
CREATE INDEX IX_sales_intakes_status ON dbo.sales_intakes(status, updated_at DESC)
    INCLUDE (customer_id, sales_owner_id, priority, readiness_score) WHERE deleted_at IS NULL;
CREATE INDEX IX_sales_intakes_owner ON dbo.sales_intakes(sales_owner_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IX_sales_intakes_customer ON dbo.sales_intakes(customer_id, request_date DESC) WHERE deleted_at IS NULL;
-- The customer's own reference number may legitimately repeat.  It is indexed,
-- not unique, so the API can warn about probable duplicates without merging
-- anything by itself.
CREATE INDEX IX_sales_intakes_customer_reference
    ON dbo.sales_intakes(customer_id, customer_reference_no)
    WHERE deleted_at IS NULL AND customer_reference_no <> N'';

CREATE TABLE dbo.sales_intake_purposes (
    intake_id bigint NOT NULL,
    visit_type_id bigint NOT NULL,
    note nvarchar(500) NOT NULL CONSTRAINT DF_sales_intake_purposes_note DEFAULT N'',
    CONSTRAINT PK_sales_intake_purposes PRIMARY KEY (intake_id, visit_type_id),
    CONSTRAINT FK_sales_intake_purposes_intake FOREIGN KEY (intake_id) REFERENCES dbo.sales_intakes(id),
    CONSTRAINT FK_sales_intake_purposes_type FOREIGN KEY (visit_type_id) REFERENCES dbo.visit_types(id)
);

-- Sales' guess and the coordinator's correction are distinguished by `source`,
-- so amending a skill requirement never erases what sales originally asked for.
CREATE TABLE dbo.sales_intake_skills (
    intake_id bigint NOT NULL,
    skill_id bigint NOT NULL,
    source nvarchar(20) NOT NULL,
    is_mandatory bit NOT NULL CONSTRAINT DF_sales_intake_skills_mandatory DEFAULT 1,
    note nvarchar(500) NOT NULL CONSTRAINT DF_sales_intake_skills_note DEFAULT N'',
    created_by bigint NOT NULL,
    created_at datetimeoffset(0) NOT NULL CONSTRAINT DF_sales_intake_skills_created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_sales_intake_skills PRIMARY KEY (intake_id, skill_id, source),
    CONSTRAINT CK_sales_intake_skills_source CHECK (source IN (N'Sales', N'Coordinator')),
    CONSTRAINT FK_sales_intake_skills_intake FOREIGN KEY (intake_id) REFERENCES dbo.sales_intakes(id),
    CONSTRAINT FK_sales_intake_skills_skill FOREIGN KEY (skill_id) REFERENCES dbo.visit_skills(id),
    CONSTRAINT FK_sales_intake_skills_created_by FOREIGN KEY (created_by) REFERENCES dbo.users(id)
);

CREATE TABLE dbo.sales_intake_windows (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_sales_intake_windows PRIMARY KEY,
    intake_id bigint NOT NULL,
    starts_at datetimeoffset(0) NOT NULL,
    ends_at datetimeoffset(0) NOT NULL,
    preference tinyint NOT NULL CONSTRAINT DF_sales_intake_windows_preference DEFAULT 1,
    note nvarchar(500) NOT NULL CONSTRAINT DF_sales_intake_windows_note DEFAULT N'',
    created_by bigint NOT NULL,
    created_at datetimeoffset(0) NOT NULL CONSTRAINT DF_sales_intake_windows_created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_sales_intake_windows_range CHECK (ends_at > starts_at),
    CONSTRAINT CK_sales_intake_windows_preference CHECK (preference BETWEEN 1 AND 9),
    CONSTRAINT FK_sales_intake_windows_intake FOREIGN KEY (intake_id) REFERENCES dbo.sales_intakes(id),
    CONSTRAINT FK_sales_intake_windows_created_by FOREIGN KEY (created_by) REFERENCES dbo.users(id)
);
CREATE INDEX IX_sales_intake_windows_intake ON dbo.sales_intake_windows(intake_id, preference, starts_at);

CREATE TABLE dbo.sales_intake_attachments (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_sales_intake_attachments PRIMARY KEY,
    intake_id bigint NOT NULL,
    name nvarchar(500) NOT NULL,
    category nvarchar(100) NOT NULL,
    description nvarchar(1000) NOT NULL CONSTRAINT DF_sales_intake_attachments_desc DEFAULT N'',
    version int NOT NULL CONSTRAINT DF_sales_intake_attachments_version DEFAULT 1,
    content_type nvarchar(200) NOT NULL,
    size_bytes bigint NOT NULL,
    storage_key nvarchar(1000) NOT NULL,
    sha256 char(64) NOT NULL,
    scan_status nvarchar(20) NOT NULL CONSTRAINT DF_sales_intake_attachments_scan DEFAULT N'Skipped',
    uploaded_by bigint NOT NULL,
    uploaded_at datetimeoffset(0) NOT NULL CONSTRAINT DF_sales_intake_attachments_uploaded DEFAULT SYSUTCDATETIME(),
    deleted_at datetimeoffset(0) NULL,
    deleted_by bigint NULL,
    row_version rowversion NOT NULL,
    CONSTRAINT CK_sales_intake_attachments_size CHECK (size_bytes > 0),
    CONSTRAINT CK_sales_intake_attachments_version CHECK (version > 0),
    CONSTRAINT CK_sales_intake_attachments_scan CHECK (scan_status IN (N'Skipped', N'Clean', N'Infected', N'Failed')),
    CONSTRAINT FK_sales_intake_attachments_intake FOREIGN KEY (intake_id) REFERENCES dbo.sales_intakes(id),
    CONSTRAINT FK_sales_intake_attachments_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES dbo.users(id),
    CONSTRAINT FK_sales_intake_attachments_deleted_by FOREIGN KEY (deleted_by) REFERENCES dbo.users(id)
);
CREATE INDEX IX_sales_intake_attachments_intake ON dbo.sales_intake_attachments(intake_id, uploaded_at DESC)
    INCLUDE (name, category, size_bytes) WHERE deleted_at IS NULL;

-- The technical assessment.  A separate table so review conclusions can never
-- land on top of the sales columns above.
CREATE TABLE dbo.sales_intake_reviews (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_sales_intake_reviews PRIMARY KEY,
    intake_id bigint NOT NULL,
    reviewer_id bigint NOT NULL,
    decision nvarchar(40) NOT NULL,
    comment nvarchar(max) NULL,
    visit_scope nvarchar(max) NULL,
    engineer_count tinyint NOT NULL CONSTRAINT DF_sales_intake_reviews_engineers DEFAULT 1,
    estimated_duration_minutes int NOT NULL CONSTRAINT DF_sales_intake_reviews_duration DEFAULT 240,
    required_equipment nvarchar(max) NULL,
    risk_assessment nvarchar(max) NULL,
    safety_concern nvarchar(max) NULL,
    requires_manager_approval bit NOT NULL CONSTRAINT DF_sales_intake_reviews_manager DEFAULT 0,
    manager_approved_by bigint NULL,
    manager_approved_at datetimeoffset(0) NULL,
    missing_information nvarchar(max) NULL,
    readiness_score_at_review tinyint NOT NULL CONSTRAINT DF_sales_intake_reviews_readiness DEFAULT 0,
    created_at datetimeoffset(0) NOT NULL CONSTRAINT DF_sales_intake_reviews_created DEFAULT SYSUTCDATETIME(),
    row_version rowversion NOT NULL,
    CONSTRAINT CK_sales_intake_reviews_decision CHECK (decision IN (
        N'Ready to Schedule', N'More Information Required', N'On Hold', N'Cancelled', N'Comment')),
    CONSTRAINT CK_sales_intake_reviews_engineers CHECK (engineer_count BETWEEN 1 AND 20),
    CONSTRAINT CK_sales_intake_reviews_duration CHECK (estimated_duration_minutes BETWEEN 15 AND 10080),
    CONSTRAINT CK_sales_intake_reviews_readiness CHECK (readiness_score_at_review BETWEEN 0 AND 100),
    CONSTRAINT CK_sales_intake_reviews_manager CHECK (
        (manager_approved_by IS NULL AND manager_approved_at IS NULL)
        OR (manager_approved_by IS NOT NULL AND manager_approved_at IS NOT NULL)),
    CONSTRAINT FK_sales_intake_reviews_intake FOREIGN KEY (intake_id) REFERENCES dbo.sales_intakes(id),
    CONSTRAINT FK_sales_intake_reviews_reviewer FOREIGN KEY (reviewer_id) REFERENCES dbo.users(id),
    CONSTRAINT FK_sales_intake_reviews_manager FOREIGN KEY (manager_approved_by) REFERENCES dbo.users(id)
);
CREATE INDEX IX_sales_intake_reviews_intake ON dbo.sales_intake_reviews(intake_id, created_at DESC);


-- =====================================================================
-- SECTION 3 — Site visit
-- =====================================================================

CREATE TABLE dbo.site_visits (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_site_visits PRIMARY KEY,
    visit_no nvarchar(30) NOT NULL CONSTRAINT UQ_site_visits_no UNIQUE,
    intake_id bigint NOT NULL,
    status nvarchar(50) NOT NULL CONSTRAINT DF_site_visits_status DEFAULT N'Tentative',
    visit_type_id bigint NOT NULL,
    checklist_template_id bigint NULL,
    sla_policy_id bigint NULL,

    -- Scheduling
    proposed_window_id bigint NULL,
    scheduled_start datetimeoffset(0) NULL,
    scheduled_end datetimeoffset(0) NULL,
    time_zone_id nvarchar(100) NOT NULL CONSTRAINT DF_site_visits_timezone DEFAULT N'SE Asia Standard Time',
    travel_minutes_before int NOT NULL CONSTRAINT DF_site_visits_travel_before DEFAULT 60,
    travel_minutes_after int NOT NULL CONSTRAINT DF_site_visits_travel_after DEFAULT 60,
    meeting_point nvarchar(500) NOT NULL CONSTRAINT DF_site_visits_meeting_point DEFAULT N'',
    required_equipment nvarchar(max) NULL,
    internal_note nvarchar(max) NULL,
    customer_note nvarchar(max) NULL,
    required_engineer_count tinyint NOT NULL CONSTRAINT DF_site_visits_required_engineers DEFAULT 1,

    -- Confirmation state, derived from dbo.site_visit_confirmations but stored
    -- so the calendar can colour a month without a join per cell.
    engineer_confirmed_at datetimeoffset(0) NULL,
    customer_confirmed_at datetimeoffset(0) NULL,

    -- Execution
    checked_in_at datetimeoffset(0) NULL,
    checked_in_by bigint NULL,
    check_in_latitude decimal(9,6) NULL,
    check_in_longitude decimal(9,6) NULL,
    location_consent_given bit NOT NULL CONSTRAINT DF_site_visits_location_consent DEFAULT 0,
    checked_out_at datetimeoffset(0) NULL,
    checked_out_by bigint NULL,
    actual_attendees nvarchar(max) NULL,
    customer_attendees nvarchar(max) NULL,
    execution_note nvarchar(max) NULL,

    -- Report SLA
    report_due_at datetimeoffset(0) NULL,
    closed_at datetimeoffset(0) NULL,
    closed_by bigint NULL,
    close_reason nvarchar(1000) NULL,

    department nvarchar(100) NOT NULL CONSTRAINT DF_site_visits_department DEFAULT N'',
    created_by bigint NOT NULL,
    created_at datetimeoffset(0) NOT NULL CONSTRAINT DF_site_visits_created DEFAULT SYSUTCDATETIME(),
    updated_by bigint NOT NULL,
    updated_at datetimeoffset(0) NOT NULL CONSTRAINT DF_site_visits_updated DEFAULT SYSUTCDATETIME(),
    archived_at datetimeoffset(0) NULL,
    deleted_at datetimeoffset(0) NULL,
    row_version rowversion NOT NULL,

    CONSTRAINT CK_site_visits_status CHECK (status IN (
        N'Tentative', N'Pending Engineer Confirmation', N'Pending Customer Confirmation', N'Confirmed',
        N'In Progress', N'Report Pending', N'Report Under Review', N'Completed', N'On Hold',
        N'Reschedule Requested', N'Cancelled', N'Customer No-show', N'Closed')),
    CONSTRAINT CK_site_visits_schedule_range CHECK (
        (scheduled_start IS NULL AND scheduled_end IS NULL) OR
        (scheduled_start IS NOT NULL AND scheduled_end IS NOT NULL AND scheduled_end > scheduled_start)),
    CONSTRAINT CK_site_visits_travel CHECK (travel_minutes_before BETWEEN 0 AND 1440 AND travel_minutes_after BETWEEN 0 AND 1440),
    CONSTRAINT CK_site_visits_engineers CHECK (required_engineer_count BETWEEN 1 AND 20),
    CONSTRAINT CK_site_visits_checkout_after_checkin CHECK (
        checked_out_at IS NULL OR (checked_in_at IS NOT NULL AND checked_out_at >= checked_in_at)),
    -- Business rule: a completed visit has been checked out of.
    CONSTRAINT CK_site_visits_completed_requires_checkout CHECK (
        status NOT IN (N'Completed') OR checked_out_at IS NOT NULL),
    -- Business rule: closing without a report demands a written reason.
    CONSTRAINT CK_site_visits_closed_reason CHECK (
        status <> N'Closed' OR closed_at IS NOT NULL),
    CONSTRAINT CK_site_visits_geo CHECK (
        (check_in_latitude IS NULL AND check_in_longitude IS NULL)
        OR (location_consent_given = 1
            AND check_in_latitude BETWEEN -90 AND 90
            AND check_in_longitude BETWEEN -180 AND 180)),
    CONSTRAINT FK_site_visits_intake FOREIGN KEY (intake_id) REFERENCES dbo.sales_intakes(id),
    CONSTRAINT FK_site_visits_type FOREIGN KEY (visit_type_id) REFERENCES dbo.visit_types(id),
    CONSTRAINT FK_site_visits_template FOREIGN KEY (checklist_template_id) REFERENCES dbo.visit_checklist_templates(id),
    CONSTRAINT FK_site_visits_sla FOREIGN KEY (sla_policy_id) REFERENCES dbo.visit_sla_policies(id),
    CONSTRAINT FK_site_visits_window FOREIGN KEY (proposed_window_id) REFERENCES dbo.sales_intake_windows(id),
    CONSTRAINT FK_site_visits_checked_in_by FOREIGN KEY (checked_in_by) REFERENCES dbo.users(id),
    CONSTRAINT FK_site_visits_checked_out_by FOREIGN KEY (checked_out_by) REFERENCES dbo.users(id),
    CONSTRAINT FK_site_visits_closed_by FOREIGN KEY (closed_by) REFERENCES dbo.users(id),
    CONSTRAINT FK_site_visits_created_by FOREIGN KEY (created_by) REFERENCES dbo.users(id),
    CONSTRAINT FK_site_visits_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users(id)
);
CREATE INDEX IX_site_visits_status ON dbo.site_visits(status, scheduled_start)
    INCLUDE (intake_id, visit_type_id) WHERE deleted_at IS NULL;
CREATE INDEX IX_site_visits_intake ON dbo.site_visits(intake_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IX_site_visits_calendar ON dbo.site_visits(scheduled_start, scheduled_end)
    INCLUDE (status, visit_no) WHERE deleted_at IS NULL AND scheduled_start IS NOT NULL;
CREATE INDEX IX_site_visits_report_due ON dbo.site_visits(report_due_at)
    WHERE deleted_at IS NULL AND report_due_at IS NOT NULL;

CREATE TABLE dbo.site_visit_assignments (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_site_visit_assignments PRIMARY KEY,
    visit_id bigint NOT NULL,
    engineer_id bigint NOT NULL,
    assignment_role nvarchar(30) NOT NULL,
    status nvarchar(30) NOT NULL CONSTRAINT DF_site_visit_assignments_status DEFAULT N'Proposed',
    skill_match_percent tinyint NOT NULL CONSTRAINT DF_site_visit_assignments_match DEFAULT 0,
    -- Conflict override.  The check is never skipped; a manager decision is
    -- recorded here so the audit can answer "who allowed this and why".
    conflict_override bit NOT NULL CONSTRAINT DF_site_visit_assignments_override DEFAULT 0,
    override_reason nvarchar(1000) NULL,
    override_by bigint NULL,
    override_at datetimeoffset(0) NULL,
    responded_at datetimeoffset(0) NULL,
    response_note nvarchar(2000) NULL,
    proposed_start datetimeoffset(0) NULL,
    proposed_end datetimeoffset(0) NULL,
    is_active bit NOT NULL CONSTRAINT DF_site_visit_assignments_active DEFAULT 1,
    replaced_by_id bigint NULL,
    assigned_by bigint NOT NULL,
    assigned_at datetimeoffset(0) NOT NULL CONSTRAINT DF_site_visit_assignments_assigned DEFAULT SYSUTCDATETIME(),
    row_version rowversion NOT NULL,
    CONSTRAINT CK_site_visit_assignments_role CHECK (assignment_role IN (N'Lead Engineer', N'Supporting Engineer')),
    CONSTRAINT CK_site_visit_assignments_status CHECK (status IN (
        N'Proposed', N'Accepted', N'Declined', N'Information Requested', N'New Time Proposed', N'Withdrawn')),
    CONSTRAINT CK_site_visit_assignments_match CHECK (skill_match_percent BETWEEN 0 AND 100),
    -- A conflict override is meaningless without a manager and a reason.
    CONSTRAINT CK_site_visit_assignments_override CHECK (
        conflict_override = 0
        OR (override_by IS NOT NULL AND override_at IS NOT NULL AND LEN(LTRIM(RTRIM(override_reason))) >= 10)),
    -- Declining, or asking for something, has to say what.
    CONSTRAINT CK_site_visit_assignments_response CHECK (
        status NOT IN (N'Declined', N'Information Requested')
        OR LEN(LTRIM(RTRIM(ISNULL(response_note, N'')))) > 0),
    CONSTRAINT CK_site_visit_assignments_proposed_range CHECK (
        (proposed_start IS NULL AND proposed_end IS NULL)
        OR (proposed_start IS NOT NULL AND proposed_end IS NOT NULL AND proposed_end > proposed_start)),
    CONSTRAINT FK_site_visit_assignments_visit FOREIGN KEY (visit_id) REFERENCES dbo.site_visits(id),
    CONSTRAINT FK_site_visit_assignments_engineer FOREIGN KEY (engineer_id) REFERENCES dbo.users(id),
    CONSTRAINT FK_site_visit_assignments_override_by FOREIGN KEY (override_by) REFERENCES dbo.users(id),
    CONSTRAINT FK_site_visit_assignments_assigned_by FOREIGN KEY (assigned_by) REFERENCES dbo.users(id),
    CONSTRAINT FK_site_visit_assignments_replaced_by FOREIGN KEY (replaced_by_id) REFERENCES dbo.site_visit_assignments(id)
);
-- One live assignment per engineer per visit; superseded rows keep is_active = 0
-- so the reassignment history survives.
CREATE UNIQUE INDEX UX_site_visit_assignments_active
    ON dbo.site_visit_assignments(visit_id, engineer_id) WHERE is_active = 1;
-- At most one live Lead Engineer.
CREATE UNIQUE INDEX UX_site_visit_assignments_lead
    ON dbo.site_visit_assignments(visit_id)
    WHERE is_active = 1 AND assignment_role = N'Lead Engineer';
CREATE INDEX IX_site_visit_assignments_engineer
    ON dbo.site_visit_assignments(engineer_id, status) INCLUDE (visit_id) WHERE is_active = 1;

CREATE TABLE dbo.site_visit_confirmations (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_site_visit_confirmations PRIMARY KEY,
    visit_id bigint NOT NULL,
    party nvarchar(20) NOT NULL,
    outcome nvarchar(30) NOT NULL,
    channel nvarchar(30) NOT NULL CONSTRAINT DF_site_visit_confirmations_channel DEFAULT N'Email',
    confirmed_by_name nvarchar(200) NOT NULL CONSTRAINT DF_site_visit_confirmations_name DEFAULT N'',
    confirmed_by_user_id bigint NULL,
    confirmed_at datetimeoffset(0) NOT NULL,
    comment nvarchar(max) NULL,
    evidence_attachment_id bigint NULL,
    recorded_by bigint NOT NULL,
    recorded_at datetimeoffset(0) NOT NULL CONSTRAINT DF_site_visit_confirmations_recorded DEFAULT SYSUTCDATETIME(),
    row_version rowversion NOT NULL,
    CONSTRAINT CK_site_visit_confirmations_party CHECK (party IN (N'Engineer', N'Customer')),
    CONSTRAINT CK_site_visit_confirmations_outcome CHECK (outcome IN (
        N'Confirmed', N'Declined', N'Rescheduled', N'Information Requested', N'No Response')),
    CONSTRAINT CK_site_visit_confirmations_channel CHECK (channel IN (
        N'Email', N'Phone', N'LINE', N'Meeting', N'Customer Portal', N'Other')),
    CONSTRAINT CK_site_visit_confirmations_customer_name CHECK (
        party <> N'Customer' OR LEN(LTRIM(RTRIM(confirmed_by_name))) > 0),
    CONSTRAINT FK_site_visit_confirmations_visit FOREIGN KEY (visit_id) REFERENCES dbo.site_visits(id),
    CONSTRAINT FK_site_visit_confirmations_user FOREIGN KEY (confirmed_by_user_id) REFERENCES dbo.users(id),
    CONSTRAINT FK_site_visit_confirmations_recorded_by FOREIGN KEY (recorded_by) REFERENCES dbo.users(id)
);
CREATE INDEX IX_site_visit_confirmations_visit ON dbo.site_visit_confirmations(visit_id, party, confirmed_at DESC);

CREATE TABLE dbo.site_visit_schedule_history (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_site_visit_schedule_history PRIMARY KEY,
    visit_id bigint NOT NULL,
    previous_start datetimeoffset(0) NULL,
    previous_end datetimeoffset(0) NULL,
    new_start datetimeoffset(0) NULL,
    new_end datetimeoffset(0) NULL,
    reason nvarchar(1000) NOT NULL,
    changed_by bigint NOT NULL,
    changed_at datetimeoffset(0) NOT NULL CONSTRAINT DF_site_visit_schedule_history_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_site_visit_schedule_history_reason CHECK (LEN(LTRIM(RTRIM(reason))) > 0),
    CONSTRAINT FK_site_visit_schedule_history_visit FOREIGN KEY (visit_id) REFERENCES dbo.site_visits(id),
    CONSTRAINT FK_site_visit_schedule_history_user FOREIGN KEY (changed_by) REFERENCES dbo.users(id)
);
CREATE INDEX IX_site_visit_schedule_history_visit ON dbo.site_visit_schedule_history(visit_id, changed_at DESC);

CREATE TABLE dbo.site_visit_checklist_responses (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_site_visit_checklist_responses PRIMARY KEY,
    visit_id bigint NOT NULL,
    checklist_item_id bigint NOT NULL,
    response_value nvarchar(max) NULL,
    numeric_value decimal(19,4) NULL,
    unit nvarchar(40) NOT NULL CONSTRAINT DF_site_visit_checklist_responses_unit DEFAULT N'',
    is_not_applicable bit NOT NULL CONSTRAINT DF_site_visit_checklist_responses_na DEFAULT 0,
    note nvarchar(max) NULL,
    answered_by bigint NOT NULL,
    answered_at datetimeoffset(0) NOT NULL CONSTRAINT DF_site_visit_checklist_responses_at DEFAULT SYSUTCDATETIME(),
    row_version rowversion NOT NULL,
    CONSTRAINT UQ_site_visit_checklist_responses UNIQUE (visit_id, checklist_item_id),
    CONSTRAINT FK_site_visit_checklist_responses_visit FOREIGN KEY (visit_id) REFERENCES dbo.site_visits(id),
    CONSTRAINT FK_site_visit_checklist_responses_item FOREIGN KEY (checklist_item_id) REFERENCES dbo.visit_checklist_items(id),
    CONSTRAINT FK_site_visit_checklist_responses_user FOREIGN KEY (answered_by) REFERENCES dbo.users(id)
);

-- Findings, measurements, risks and customer requests raised on site.  All one
-- table with a `kind`, because they share every column and the report needs
-- them ordered together.
CREATE TABLE dbo.site_visit_findings (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_site_visit_findings PRIMARY KEY,
    visit_id bigint NOT NULL,
    kind nvarchar(30) NOT NULL,
    title nvarchar(300) NOT NULL,
    detail nvarchar(max) NULL,
    measurement_value decimal(19,4) NULL,
    measurement_unit nvarchar(40) NOT NULL CONSTRAINT DF_site_visit_findings_unit DEFAULT N'',
    severity nvarchar(20) NOT NULL CONSTRAINT DF_site_visit_findings_severity DEFAULT N'Info',
    sort_order int NOT NULL CONSTRAINT DF_site_visit_findings_sort DEFAULT 0,
    created_by bigint NOT NULL,
    created_at datetimeoffset(0) NOT NULL CONSTRAINT DF_site_visit_findings_created DEFAULT SYSUTCDATETIME(),
    updated_by bigint NOT NULL,
    updated_at datetimeoffset(0) NOT NULL CONSTRAINT DF_site_visit_findings_updated DEFAULT SYSUTCDATETIME(),
    deleted_at datetimeoffset(0) NULL,
    row_version rowversion NOT NULL,
    CONSTRAINT CK_site_visit_findings_kind CHECK (kind IN (
        N'Finding', N'Measurement', N'Risk', N'Customer Request', N'Proposed Solution',
        N'Follow-up', N'Existing Condition', N'Safety Concern')),
    CONSTRAINT CK_site_visit_findings_severity CHECK (severity IN (N'Info', N'Low', N'Medium', N'High', N'Critical')),
    CONSTRAINT CK_site_visit_findings_title CHECK (LEN(LTRIM(RTRIM(title))) > 0),
    CONSTRAINT FK_site_visit_findings_visit FOREIGN KEY (visit_id) REFERENCES dbo.site_visits(id),
    CONSTRAINT FK_site_visit_findings_created_by FOREIGN KEY (created_by) REFERENCES dbo.users(id),
    CONSTRAINT FK_site_visit_findings_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users(id)
);
CREATE INDEX IX_site_visit_findings_visit ON dbo.site_visit_findings(visit_id, kind, sort_order) WHERE deleted_at IS NULL;

CREATE TABLE dbo.site_visit_attachments (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_site_visit_attachments PRIMARY KEY,
    visit_id bigint NOT NULL,
    finding_id bigint NULL,
    name nvarchar(500) NOT NULL,
    category nvarchar(100) NOT NULL,
    description nvarchar(1000) NOT NULL CONSTRAINT DF_site_visit_attachments_desc DEFAULT N'',
    version int NOT NULL CONSTRAINT DF_site_visit_attachments_version DEFAULT 1,
    content_type nvarchar(200) NOT NULL,
    size_bytes bigint NOT NULL,
    storage_key nvarchar(1000) NOT NULL,
    sha256 char(64) NOT NULL,
    scan_status nvarchar(20) NOT NULL CONSTRAINT DF_site_visit_attachments_scan DEFAULT N'Skipped',
    uploaded_by bigint NOT NULL,
    uploaded_at datetimeoffset(0) NOT NULL CONSTRAINT DF_site_visit_attachments_uploaded DEFAULT SYSUTCDATETIME(),
    deleted_at datetimeoffset(0) NULL,
    deleted_by bigint NULL,
    row_version rowversion NOT NULL,
    CONSTRAINT CK_site_visit_attachments_size CHECK (size_bytes > 0),
    CONSTRAINT CK_site_visit_attachments_version CHECK (version > 0),
    CONSTRAINT CK_site_visit_attachments_scan CHECK (scan_status IN (N'Skipped', N'Clean', N'Infected', N'Failed')),
    CONSTRAINT FK_site_visit_attachments_visit FOREIGN KEY (visit_id) REFERENCES dbo.site_visits(id),
    CONSTRAINT FK_site_visit_attachments_finding FOREIGN KEY (finding_id) REFERENCES dbo.site_visit_findings(id),
    CONSTRAINT FK_site_visit_attachments_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES dbo.users(id),
    CONSTRAINT FK_site_visit_attachments_deleted_by FOREIGN KEY (deleted_by) REFERENCES dbo.users(id)
);
CREATE INDEX IX_site_visit_attachments_visit ON dbo.site_visit_attachments(visit_id, uploaded_at DESC)
    INCLUDE (name, category, size_bytes) WHERE deleted_at IS NULL;

ALTER TABLE dbo.site_visit_confirmations
    ADD CONSTRAINT FK_site_visit_confirmations_evidence
    FOREIGN KEY (evidence_attachment_id) REFERENCES dbo.site_visit_attachments(id);


-- =====================================================================
-- SECTION 4 — Site visit report
-- =====================================================================

CREATE TABLE dbo.site_visit_reports (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_site_visit_reports PRIMARY KEY,
    report_no nvarchar(30) NOT NULL CONSTRAINT UQ_site_visit_reports_no UNIQUE,
    visit_id bigint NOT NULL CONSTRAINT UQ_site_visit_reports_visit UNIQUE,
    status nvarchar(30) NOT NULL CONSTRAINT DF_site_visit_reports_status DEFAULT N'Draft',
    current_revision int NOT NULL CONSTRAINT DF_site_visit_reports_revision DEFAULT 0,
    author_id bigint NOT NULL,
    submitted_at datetimeoffset(0) NULL,
    reviewed_by bigint NULL,
    reviewed_at datetimeoffset(0) NULL,
    review_comment nvarchar(max) NULL,
    customer_acknowledged_by nvarchar(200) NOT NULL CONSTRAINT DF_site_visit_reports_ack_by DEFAULT N'',
    customer_acknowledged_at datetimeoffset(0) NULL,
    customer_signature_storage_key nvarchar(1000) NULL,
    due_at datetimeoffset(0) NULL,
    created_at datetimeoffset(0) NOT NULL CONSTRAINT DF_site_visit_reports_created DEFAULT SYSUTCDATETIME(),
    updated_by bigint NOT NULL,
    updated_at datetimeoffset(0) NOT NULL CONSTRAINT DF_site_visit_reports_updated DEFAULT SYSUTCDATETIME(),
    row_version rowversion NOT NULL,
    CONSTRAINT CK_site_visit_reports_status CHECK (status IN (
        N'Draft', N'Submitted', N'Under Review', N'Revision Requested', N'Approved', N'Acknowledged')),
    CONSTRAINT CK_site_visit_reports_revision CHECK (current_revision >= 0),
    CONSTRAINT CK_site_visit_reports_review CHECK (
        (reviewed_by IS NULL AND reviewed_at IS NULL) OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)),
    CONSTRAINT FK_site_visit_reports_visit FOREIGN KEY (visit_id) REFERENCES dbo.site_visits(id),
    CONSTRAINT FK_site_visit_reports_author FOREIGN KEY (author_id) REFERENCES dbo.users(id),
    CONSTRAINT FK_site_visit_reports_reviewer FOREIGN KEY (reviewed_by) REFERENCES dbo.users(id),
    CONSTRAINT FK_site_visit_reports_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users(id)
);
CREATE INDEX IX_site_visit_reports_status ON dbo.site_visit_reports(status, due_at);

-- The report body lives on the revision, never on the header, so an approved
-- revision is a frozen document and a revision request creates the next one.
CREATE TABLE dbo.site_visit_report_revisions (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_site_visit_report_revisions PRIMARY KEY,
    report_id bigint NOT NULL,
    revision int NOT NULL,
    status nvarchar(30) NOT NULL CONSTRAINT DF_site_visit_report_revisions_status DEFAULT N'Draft',
    visit_summary nvarchar(max) NULL,
    customer_requirement nvarchar(max) NULL,
    existing_condition nvarchar(max) NULL,
    findings_summary nvarchar(max) NULL,
    measurement_summary nvarchar(max) NULL,
    root_cause nvarchar(max) NULL,
    recommended_solution nvarchar(max) NULL,
    proposed_scope nvarchar(max) NULL,
    assumption nvarchar(max) NULL,
    exclusion nvarchar(max) NULL,
    risk nvarchar(max) NULL,
    safety_concern nvarchar(max) NULL,
    customer_additional_request nvarchar(max) NULL,
    engineer_conclusion nvarchar(max) NULL,
    sales_follow_up nvarchar(max) NULL,
    next_step nvarchar(max) NULL,
    change_summary nvarchar(1000) NOT NULL CONSTRAINT DF_site_visit_report_revisions_change DEFAULT N'',
    created_by bigint NOT NULL,
    created_at datetimeoffset(0) NOT NULL CONSTRAINT DF_site_visit_report_revisions_created DEFAULT SYSUTCDATETIME(),
    approved_by bigint NULL,
    approved_at datetimeoffset(0) NULL,
    row_version rowversion NOT NULL,
    CONSTRAINT UQ_site_visit_report_revisions UNIQUE (report_id, revision),
    CONSTRAINT CK_site_visit_report_revisions_status CHECK (status IN (
        N'Draft', N'Submitted', N'Under Review', N'Revision Requested', N'Approved', N'Superseded')),
    CONSTRAINT CK_site_visit_report_revisions_revision CHECK (revision >= 0),
    CONSTRAINT CK_site_visit_report_revisions_approved CHECK (
        (approved_by IS NULL AND approved_at IS NULL) OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
    CONSTRAINT FK_site_visit_report_revisions_report FOREIGN KEY (report_id) REFERENCES dbo.site_visit_reports(id),
    CONSTRAINT FK_site_visit_report_revisions_created_by FOREIGN KEY (created_by) REFERENCES dbo.users(id),
    CONSTRAINT FK_site_visit_report_revisions_approved_by FOREIGN KEY (approved_by) REFERENCES dbo.users(id)
);
-- One approved revision per report, decided by the index rather than by
-- whichever approver committed last.
CREATE UNIQUE INDEX UX_site_visit_report_revisions_one_approved
    ON dbo.site_visit_report_revisions(report_id)
    WHERE status = N'Approved';

CREATE TABLE dbo.site_visit_action_items (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_site_visit_action_items PRIMARY KEY,
    visit_id bigint NOT NULL,
    report_id bigint NULL,
    title nvarchar(300) NOT NULL,
    detail nvarchar(max) NULL,
    owner_id bigint NULL,
    owner_name nvarchar(200) NOT NULL CONSTRAINT DF_site_visit_action_items_owner_name DEFAULT N'',
    due_date date NULL,
    status nvarchar(30) NOT NULL CONSTRAINT DF_site_visit_action_items_status DEFAULT N'Open',
    completed_at datetimeoffset(0) NULL,
    created_by bigint NOT NULL,
    created_at datetimeoffset(0) NOT NULL CONSTRAINT DF_site_visit_action_items_created DEFAULT SYSUTCDATETIME(),
    updated_by bigint NOT NULL,
    updated_at datetimeoffset(0) NOT NULL CONSTRAINT DF_site_visit_action_items_updated DEFAULT SYSUTCDATETIME(),
    deleted_at datetimeoffset(0) NULL,
    row_version rowversion NOT NULL,
    CONSTRAINT CK_site_visit_action_items_title CHECK (LEN(LTRIM(RTRIM(title))) > 0),
    CONSTRAINT CK_site_visit_action_items_status CHECK (status IN (N'Open', N'In Progress', N'Done', N'Cancelled')),
    CONSTRAINT CK_site_visit_action_items_completed CHECK (
        (status = N'Done' AND completed_at IS NOT NULL) OR (status <> N'Done' AND completed_at IS NULL)),
    CONSTRAINT FK_site_visit_action_items_visit FOREIGN KEY (visit_id) REFERENCES dbo.site_visits(id),
    CONSTRAINT FK_site_visit_action_items_report FOREIGN KEY (report_id) REFERENCES dbo.site_visit_reports(id),
    CONSTRAINT FK_site_visit_action_items_owner FOREIGN KEY (owner_id) REFERENCES dbo.users(id),
    CONSTRAINT FK_site_visit_action_items_created_by FOREIGN KEY (created_by) REFERENCES dbo.users(id),
    CONSTRAINT FK_site_visit_action_items_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users(id)
);
CREATE INDEX IX_site_visit_action_items_visit ON dbo.site_visit_action_items(visit_id, status, due_date) WHERE deleted_at IS NULL;
CREATE INDEX IX_site_visit_action_items_owner ON dbo.site_visit_action_items(owner_id, status, due_date)
    WHERE deleted_at IS NULL AND owner_id IS NOT NULL;


-- =====================================================================
-- SECTION 5 — Cross-cutting: status history and traceability links
-- =====================================================================

CREATE TABLE dbo.site_visit_status_history (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_site_visit_status_history PRIMARY KEY,
    entity_type nvarchar(30) NOT NULL,
    entity_id bigint NOT NULL,
    entity_no nvarchar(30) NOT NULL,
    previous_status nvarchar(50) NULL,
    new_status nvarchar(50) NOT NULL,
    reason nvarchar(max) NULL,
    changed_by bigint NOT NULL,
    changed_at datetimeoffset(0) NOT NULL CONSTRAINT DF_site_visit_status_history_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_site_visit_status_history_entity CHECK (entity_type IN (
        N'SalesIntake', N'SiteVisit', N'SiteVisitReport', N'Assignment')),
    CONSTRAINT FK_site_visit_status_history_user FOREIGN KEY (changed_by) REFERENCES dbo.users(id)
);
CREATE INDEX IX_site_visit_status_history_entity
    ON dbo.site_visit_status_history(entity_type, entity_id, changed_at DESC);

-- Traceability: Sales Intake -> Site Visit -> Report -> Inquiry -> Estimate ->
-- Project. Stored as generic edges so a new target type does not need a schema
-- change, with an application-side allow-list of the pairs that make sense.
CREATE TABLE dbo.site_visit_links (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_site_visit_links PRIMARY KEY,
    source_type nvarchar(30) NOT NULL,
    source_id bigint NOT NULL,
    target_type nvarchar(30) NOT NULL,
    target_id bigint NOT NULL,
    target_no nvarchar(50) NOT NULL CONSTRAINT DF_site_visit_links_target_no DEFAULT N'',
    relation nvarchar(30) NOT NULL CONSTRAINT DF_site_visit_links_relation DEFAULT N'Derived From',
    note nvarchar(1000) NOT NULL CONSTRAINT DF_site_visit_links_note DEFAULT N'',
    created_by bigint NOT NULL,
    created_at datetimeoffset(0) NOT NULL CONSTRAINT DF_site_visit_links_created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_site_visit_links UNIQUE (source_type, source_id, target_type, target_id),
    CONSTRAINT CK_site_visit_links_source CHECK (source_type IN (N'SalesIntake', N'SiteVisit', N'SiteVisitReport')),
    CONSTRAINT CK_site_visit_links_target CHECK (target_type IN (N'Inquiry', N'Estimate', N'Project', N'SiteVisit', N'SalesIntake')),
    CONSTRAINT CK_site_visit_links_relation CHECK (relation IN (N'Derived From', N'Related To', N'Follow-up')),
    CONSTRAINT FK_site_visit_links_created_by FOREIGN KEY (created_by) REFERENCES dbo.users(id)
);
CREATE INDEX IX_site_visit_links_target ON dbo.site_visit_links(target_type, target_id);


-- =====================================================================
-- SECTION 6 — Notifications: de-duplication
--
-- dbo.notifications already exists. Adding a nullable dedupe key plus a
-- filtered unique index makes "do not notify the same person about the same
-- thing twice" a database guarantee rather than a query the sender has to
-- remember to run.
-- =====================================================================

ALTER TABLE dbo.notifications ADD dedupe_key nvarchar(200) NULL;

-- The index has to be created through EXEC: dedupe_key does not exist when the
-- surrounding batch is parsed, and a GO here would end the batch and leave the
-- migration transaction open across the boundary.
EXEC(N'
CREATE UNIQUE INDEX UX_notifications_dedupe
    ON dbo.notifications(user_id, dedupe_key)
    WHERE dedupe_key IS NOT NULL;');

CREATE INDEX IX_notifications_unread_entity
    ON dbo.notifications(user_id, is_read, created_at DESC)
    INCLUDE (kind, title, entity_type, entity_id);


-- =====================================================================
-- SECTION 7 — Triggers and the availability assertion
--
-- Created through EXEC so the whole migration stays in one batch and
-- therefore one transaction; a bare CREATE TRIGGER would need its own batch.
-- =====================================================================

-- Status history is the record of who moved what and why.  Nothing may edit it.
EXEC(N'
CREATE TRIGGER dbo.trg_site_visit_status_history_append_only
ON dbo.site_visit_status_history
INSTEAD OF UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    THROW 51192, ''Site visit status history is append-only.'', 1;
END;');

-- The reschedule log is evidence, not working data.
EXEC(N'
CREATE TRIGGER dbo.trg_site_visit_schedule_history_append_only
ON dbo.site_visit_schedule_history
INSTEAD OF UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    THROW 51193, ''Site visit schedule history is append-only.'', 1;
END;');

-- An approved report revision is frozen.  Only the supersede transition may
-- still move it, so the next revision can be raised without rewriting history.
-- Null-safe comparisons are written longhand rather than with IS DISTINCT FROM
-- so the migration does not depend on compatibility level 160.
EXEC(N'
CREATE TRIGGER dbo.trg_site_visit_report_revisions_immutable
ON dbo.site_visit_report_revisions
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (
        SELECT 1
        FROM deleted d
        INNER JOIN inserted i ON i.id = d.id
        WHERE d.status = N''Approved''
          AND (d.report_id <> i.report_id
            OR d.revision <> i.revision
            OR ISNULL(d.visit_summary, N'''') <> ISNULL(i.visit_summary, N'''')
            OR ISNULL(d.customer_requirement, N'''') <> ISNULL(i.customer_requirement, N'''')
            OR ISNULL(d.existing_condition, N'''') <> ISNULL(i.existing_condition, N'''')
            OR ISNULL(d.findings_summary, N'''') <> ISNULL(i.findings_summary, N'''')
            OR ISNULL(d.measurement_summary, N'''') <> ISNULL(i.measurement_summary, N'''')
            OR ISNULL(d.root_cause, N'''') <> ISNULL(i.root_cause, N'''')
            OR ISNULL(d.recommended_solution, N'''') <> ISNULL(i.recommended_solution, N'''')
            OR ISNULL(d.proposed_scope, N'''') <> ISNULL(i.proposed_scope, N'''')
            OR ISNULL(d.assumption, N'''') <> ISNULL(i.assumption, N'''')
            OR ISNULL(d.exclusion, N'''') <> ISNULL(i.exclusion, N'''')
            OR ISNULL(d.risk, N'''') <> ISNULL(i.risk, N'''')
            OR ISNULL(d.safety_concern, N'''') <> ISNULL(i.safety_concern, N'''')
            OR ISNULL(d.customer_additional_request, N'''') <> ISNULL(i.customer_additional_request, N'''')
            OR ISNULL(d.engineer_conclusion, N'''') <> ISNULL(i.engineer_conclusion, N'''')
            OR ISNULL(d.sales_follow_up, N'''') <> ISNULL(i.sales_follow_up, N'''')
            OR ISNULL(d.next_step, N'''') <> ISNULL(i.next_step, N'''')
            OR (i.status NOT IN (N''Approved'', N''Superseded''))))
        THROW 51194, ''An approved site visit report revision is immutable. Raise a new revision instead.'', 1;
END;');

-- A visit that has been executed is archived, never deleted.
EXEC(N'
CREATE TRIGGER dbo.trg_site_visits_no_hard_delete
ON dbo.site_visits
INSTEAD OF DELETE
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM deleted WHERE checked_in_at IS NOT NULL)
        THROW 51195, ''A site visit that has been checked into cannot be deleted. Archive it instead.'', 1;
    DELETE FROM dbo.site_visits WHERE id IN (SELECT id FROM deleted);
END;');

-- Likewise for an intake that has left Draft.
EXEC(N'
CREATE TRIGGER dbo.trg_sales_intakes_no_hard_delete
ON dbo.sales_intakes
INSTEAD OF DELETE
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM deleted WHERE submitted_at IS NOT NULL)
        THROW 51196, ''A submitted sales intake cannot be deleted. Archive it instead.'', 1;
    DELETE FROM dbo.sales_intakes WHERE id IN (SELECT id FROM deleted);
END;');

-- ---------------------------------------------------------------------
-- dbo.assert_engineer_available
--
-- Called by the API inside the assignment transaction.  It takes the same
-- UPDLOCK/HOLDLOCK the material module uses, so two coordinators booking the
-- last free slot serialise instead of both succeeding.  Every per-row CHECK in
-- this schema is per row; a double-booking is a relationship between rows, and
-- only a lock can prevent it.
--
-- @override_reason is not an escape hatch: the procedure still reports the
-- conflict through @conflict_count, and the caller records the override.  It
-- only stops the procedure from raising.
-- ---------------------------------------------------------------------
EXEC(N'
CREATE PROCEDURE dbo.assert_engineer_available
    @engineer_id bigint,
    @starts_at datetimeoffset(0),
    @ends_at datetimeoffset(0),
    @travel_minutes_before int = 0,
    @travel_minutes_after int = 0,
    @exclude_visit_id bigint = NULL,
    @allow_conflict bit = 0,
    @conflict_count int OUTPUT,
    @conflict_detail nvarchar(1000) OUTPUT
AS
BEGIN
    SET XACT_ABORT ON;
    SET NOCOUNT ON;

    IF @starts_at IS NULL OR @ends_at IS NULL OR @ends_at <= @starts_at
        THROW 51197, ''An availability check needs a start before its end.'', 1;

    DECLARE @window_start datetimeoffset(0) = DATEADD(MINUTE, -ISNULL(@travel_minutes_before, 0), @starts_at);
    DECLARE @window_end datetimeoffset(0) = DATEADD(MINUTE, ISNULL(@travel_minutes_after, 0), @ends_at);

    DECLARE @conflicts TABLE (reference nvarchar(120) NOT NULL);

    -- Booked visits.  The lock is taken on dbo.site_visits deliberately: it is
    -- the table a competing writer will update, so holding it here is what
    -- serialises the two coordinators.
    INSERT INTO @conflicts(reference)
    SELECT v.visit_no
    FROM dbo.site_visits v WITH (UPDLOCK, HOLDLOCK)
    INNER JOIN dbo.site_visit_assignments a
        ON a.visit_id = v.id AND a.is_active = 1 AND a.status <> N''Declined'' AND a.status <> N''Withdrawn''
    WHERE a.engineer_id = @engineer_id
      AND v.deleted_at IS NULL
      AND v.scheduled_start IS NOT NULL
      AND v.status NOT IN (N''Cancelled'', N''Closed'', N''Customer No-show'')
      AND (@exclude_visit_id IS NULL OR v.id <> @exclude_visit_id)
      AND DATEADD(MINUTE, -v.travel_minutes_before, v.scheduled_start) < @window_end
      AND @window_start < DATEADD(MINUTE, v.travel_minutes_after, v.scheduled_end);

    -- Declared unavailability.  Travel padding is not applied here: leave is
    -- leave, and padding it would refuse a visit that ends the hour before.
    INSERT INTO @conflicts(reference)
    SELECT CONCAT(N''Unavailable: '', e.kind, CASE WHEN e.reason = N'''' THEN N'''' ELSE CONCAT(N'' — '', e.reason) END)
    FROM dbo.engineer_availability e
    WHERE e.user_id = @engineer_id
      AND e.deleted_at IS NULL
      AND e.starts_at < @ends_at
      AND @starts_at < e.ends_at;

    SELECT @conflict_count = COUNT(*) FROM @conflicts;
    SELECT @conflict_detail = STUFF((
        SELECT N''; '' + reference FROM @conflicts FOR XML PATH(N''''), TYPE).value(N''.'', N''nvarchar(1000)''), 1, 2, N'''');

    IF @conflict_count > 0 AND @allow_conflict = 0
        THROW 51198, ''The engineer is already committed during this period.'', 1;
END;');


-- =====================================================================
-- SECTION 8 — Roles and permissions
-- =====================================================================

-- Three roles the requested process needs and this system did not have.
-- Sales maps to the existing 'Sales Engineer'; Estimator maps to the existing
-- 'Engineer' / 'Project Manager'.  A user still holds exactly one role.
INSERT INTO dbo.roles(code, name, description)
SELECT v.code, v.name, v.description
FROM (VALUES
    (N'Sales Manager', N'Sales Manager', N'Oversee the sales team intake queue, urgent approvals and sales SLA'),
    (N'Engineering Coordinator', N'Engineering Coordinator', N'Technical review, engineer assignment and the site visit calendar'),
    (N'Management', N'Management', N'Read-only management dashboards and conversion reporting')
) AS v(code, name, description)
WHERE NOT EXISTS (SELECT 1 FROM dbo.roles r WHERE r.code = v.code);

INSERT INTO dbo.permissions (code, description) VALUES
    (N'intake.read',          N'Read sales intakes'),
    (N'intake.write',         N'Create and edit sales intakes and their attachments'),
    (N'intake.review',        N'Perform technical review and move an intake through review states'),
    (N'visit.read',           N'Read site visit requests, schedules and reports'),
    (N'visit.schedule',       N'Assign engineers, schedule, reschedule and cancel site visits'),
    (N'visit.override',       N'Override an engineer schedule conflict with a recorded reason'),
    (N'visit.execute',        N'Check in and out, complete the checklist and record findings'),
    (N'visit.report',         N'Write and submit a site visit report'),
    (N'visit.report_approve', N'Approve a site visit report or request a revision'),
    (N'visit.link',           N'Create or link an inquiry, estimate or project from a site visit'),
    (N'visit.admin',          N'Maintain visit types, skills, checklist templates, SLA and engineer skills');

-- Read access follows the existing platform read grants.
INSERT INTO dbo.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM dbo.roles r
CROSS JOIN dbo.permissions p
WHERE p.code IN (N'intake.read', N'visit.read')
  AND r.code IN (N'Viewer', N'Engineer', N'Project Manager', N'Engineering Manager', N'Sales Engineer',
                 N'Sales Manager', N'Engineering Coordinator', N'Management', N'Purchasing', N'Admin')
  AND NOT EXISTS (SELECT 1 FROM dbo.role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);

-- Sales writes intakes.  Note the deliberate absence of visit.schedule: sales
-- may ask for a visit and may ask to move one, but may not finally assign an
-- engineer.
INSERT INTO dbo.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM dbo.roles r
CROSS JOIN dbo.permissions p
WHERE p.code = N'intake.write'
  AND r.code IN (N'Sales Engineer', N'Sales Manager', N'Engineering Coordinator', N'Admin')
  AND NOT EXISTS (SELECT 1 FROM dbo.role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);

-- Technical review and scheduling sit with the coordinator and the managers.
INSERT INTO dbo.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM dbo.roles r
CROSS JOIN dbo.permissions p
WHERE p.code IN (N'intake.review', N'visit.schedule')
  AND r.code IN (N'Engineering Coordinator', N'Engineering Manager', N'Admin')
  AND NOT EXISTS (SELECT 1 FROM dbo.role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);

-- Overriding a schedule conflict is a manager decision only.
INSERT INTO dbo.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM dbo.roles r
CROSS JOIN dbo.permissions p
WHERE p.code = N'visit.override'
  AND r.code IN (N'Engineering Manager', N'Admin')
  AND NOT EXISTS (SELECT 1 FROM dbo.role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);

-- Engineers execute the visit and write the report.
INSERT INTO dbo.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM dbo.roles r
CROSS JOIN dbo.permissions p
WHERE p.code IN (N'visit.execute', N'visit.report')
  AND r.code IN (N'Engineer', N'Engineering Coordinator', N'Engineering Manager', N'Project Manager', N'Admin')
  AND NOT EXISTS (SELECT 1 FROM dbo.role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);

-- Report approval is a manager decision.
INSERT INTO dbo.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM dbo.roles r
CROSS JOIN dbo.permissions p
WHERE p.code = N'visit.report_approve'
  AND r.code IN (N'Engineering Manager', N'Admin')
  AND NOT EXISTS (SELECT 1 FROM dbo.role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);

-- Turning a visit into an inquiry or an estimate is the estimator's job, and
-- requires the existing inquiry/estimate write permissions as well.
INSERT INTO dbo.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM dbo.roles r
CROSS JOIN dbo.permissions p
WHERE p.code = N'visit.link'
  AND r.code IN (N'Engineer', N'Project Manager', N'Engineering Manager', N'Engineering Coordinator',
                 N'Sales Engineer', N'Admin')
  AND NOT EXISTS (SELECT 1 FROM dbo.role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);

-- Master data administration.
INSERT INTO dbo.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM dbo.roles r
CROSS JOIN dbo.permissions p
WHERE p.code = N'visit.admin'
  AND r.code IN (N'Admin', N'Engineering Manager')
  AND NOT EXISTS (SELECT 1 FROM dbo.role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);

-- The three new roles need the surrounding platform permissions too, or they
-- sign in to an empty application.
INSERT INTO dbo.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM dbo.roles r
CROSS JOIN dbo.permissions p
WHERE r.code = N'Sales Manager'
  AND p.code IN (N'inquiry.read', N'inquiry.write', N'estimate.read', N'project.read',
                 N'master.read', N'report.read', N'knowledge.view', N'knowledge.comment')
  AND NOT EXISTS (SELECT 1 FROM dbo.role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);

INSERT INTO dbo.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM dbo.roles r
CROSS JOIN dbo.permissions p
WHERE r.code = N'Engineering Coordinator'
  AND p.code IN (N'inquiry.read', N'inquiry.write', N'estimate.read', N'project.read',
                 N'schedule.read', N'schedule.progress', N'master.read', N'report.read',
                 N'knowledge.view', N'knowledge.comment', N'knowledge.upload', N'knowledge.edit')
  AND NOT EXISTS (SELECT 1 FROM dbo.role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);

-- Management reads. It deliberately receives no operational write permission;
-- a manager who also needs to operate is given a second account or a different
-- role, exactly as the requirement asks.
INSERT INTO dbo.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM dbo.roles r
CROSS JOIN dbo.permissions p
WHERE r.code = N'Management'
  AND p.code IN (N'inquiry.read', N'estimate.read', N'project.read', N'schedule.read',
                 N'procurement.read', N'inventory.read', N'master.read', N'report.read',
                 N'audit.read', N'knowledge.view')
  AND NOT EXISTS (SELECT 1 FROM dbo.role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);


-- =====================================================================
-- SECTION 9 — Application role grants
-- =====================================================================

IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
BEGIN
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
    -- Purposes and skills are re-stated wholesale when the section is saved.
    GRANT SELECT, INSERT, DELETE ON OBJECT::dbo.sales_intake_purposes TO [iot_team_app_role];
    GRANT SELECT, INSERT, DELETE ON OBJECT::dbo.sales_intake_skills TO [iot_team_app_role];
    GRANT SELECT, INSERT, DELETE ON OBJECT::dbo.sales_intake_windows TO [iot_team_app_role];
    GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.sales_intake_attachments TO [iot_team_app_role];
    -- A review is a record of a decision, so it is inserted and never edited.
    GRANT SELECT, INSERT ON OBJECT::dbo.sales_intake_reviews TO [iot_team_app_role];
    GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.site_visits TO [iot_team_app_role];
    GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.site_visit_assignments TO [iot_team_app_role];
    GRANT SELECT, INSERT ON OBJECT::dbo.site_visit_confirmations TO [iot_team_app_role];
    -- Insert only: the trigger blocks the rest, and the grant says so too.
    GRANT SELECT, INSERT ON OBJECT::dbo.site_visit_schedule_history TO [iot_team_app_role];
    GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.site_visit_checklist_responses TO [iot_team_app_role];
    GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.site_visit_findings TO [iot_team_app_role];
    GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.site_visit_attachments TO [iot_team_app_role];
    GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.site_visit_reports TO [iot_team_app_role];
    GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.site_visit_report_revisions TO [iot_team_app_role];
    GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.site_visit_action_items TO [iot_team_app_role];
    GRANT SELECT, INSERT ON OBJECT::dbo.site_visit_status_history TO [iot_team_app_role];
    GRANT SELECT, INSERT, DELETE ON OBJECT::dbo.site_visit_links TO [iot_team_app_role];
    -- In-app notification delivery enters the release with this module.
    -- INSERT creates one; UPDATE marks it read. There is no DELETE.
    GRANT INSERT, UPDATE ON OBJECT::dbo.notifications TO [iot_team_app_role];
    GRANT EXECUTE ON OBJECT::dbo.assert_engineer_available TO [iot_team_app_role];
END;

INSERT INTO dbo.schema_versions(version, name)
VALUES (16, N'Sales intake, engineer site visit scheduling, execution, report and traceability');

COMMIT TRANSACTION;
GO
