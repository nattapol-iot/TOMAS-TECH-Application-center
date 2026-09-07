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

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 14)
    THROW 51170, 'Migration 014 has already been applied.', 1;
IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 13)
    THROW 51171, 'Migration 013 must be applied before migration 014.', 1;

-- =====================================================================
-- Knowledge & Document Hub
--
-- Design notes where this schema departs from the requested field list,
-- because the existing system does not carry the entity that was assumed:
--
--   * There is no dbo.departments table. Department is an nvarchar column
--     on dbo.users. Department is therefore stored here as a short code
--     (matching users.department, nvarchar(200)) rather than a foreign key,
--     and the short segment used in document numbers is administered in
--     dbo.knowledge_number_sequences.scope_code.
--   * There is no dbo.teams table. subject_type keeps 'Team' out of the
--     allowed set for now; the column is wide enough to admit it later
--     without a schema change.
--   * A user holds exactly one role (users.role_id), so role grants are a
--     single foreign key rather than a many-to-many resolution.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Category tree (Standards & SOP, Templates & Forms, Presentations, ...)
-- ---------------------------------------------------------------------
CREATE TABLE dbo.knowledge_categories (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_knowledge_categories PRIMARY KEY,
    parent_id bigint NULL,
    code nvarchar(40) NOT NULL CONSTRAINT UQ_knowledge_categories_code UNIQUE,
    name_en nvarchar(200) NOT NULL,
    name_th nvarchar(200) NOT NULL CONSTRAINT DF_knowledge_categories_name_th DEFAULT N'',
    name_ja nvarchar(200) NOT NULL CONSTRAINT DF_knowledge_categories_name_ja DEFAULT N'',
    default_document_type nvarchar(30) NULL,
    default_confidentiality nvarchar(30) NOT NULL CONSTRAINT DF_knowledge_categories_conf DEFAULT N'Company',
    sort_order int NOT NULL CONSTRAINT DF_knowledge_categories_sort DEFAULT 0,
    is_active bit NOT NULL CONSTRAINT DF_knowledge_categories_active DEFAULT 1,
    created_by bigint NOT NULL,
    created_at datetimeoffset(0) NOT NULL CONSTRAINT DF_knowledge_categories_created DEFAULT SYSUTCDATETIME(),
    updated_by bigint NOT NULL,
    updated_at datetimeoffset(0) NOT NULL CONSTRAINT DF_knowledge_categories_updated DEFAULT SYSUTCDATETIME(),
    row_version rowversion NOT NULL,
    CONSTRAINT CK_knowledge_categories_code CHECK (LEN(LTRIM(RTRIM(code))) > 0),
    CONSTRAINT CK_knowledge_categories_name CHECK (LEN(LTRIM(RTRIM(name_en))) > 0),
    CONSTRAINT CK_knowledge_categories_conf CHECK (default_confidentiality IN (
        N'Company', N'Department Only', N'Project Team Only', N'Management Only', N'Confidential', N'Restricted')),
    CONSTRAINT CK_knowledge_categories_doc_type CHECK (default_document_type IS NULL OR default_document_type IN (
        N'Controlled Document', N'Working Document', N'Knowledge Article', N'Presentation',
        N'Template', N'Project Document', N'Supplier Document', N'External Reference')),
    CONSTRAINT CK_knowledge_categories_not_self CHECK (parent_id IS NULL OR parent_id <> id),
    CONSTRAINT FK_knowledge_categories_parent FOREIGN KEY (parent_id) REFERENCES dbo.knowledge_categories(id),
    CONSTRAINT FK_knowledge_categories_created_by FOREIGN KEY (created_by) REFERENCES dbo.users(id),
    CONSTRAINT FK_knowledge_categories_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users(id)
);

CREATE INDEX IX_knowledge_categories_parent ON dbo.knowledge_categories(parent_id, sort_order, id)
    INCLUDE (code, name_en, is_active);


-- ---------------------------------------------------------------------
-- Document number sequences.  PREFIX-SCOPE-NNNN, never reset.
-- The existing dbo.issue_document_number is monthly (TYPE-YYMM-NNNN) and
-- cannot express the STD-EE-0001 shape, so the Knowledge Hub gets its own
-- allocator built on the same UPDLOCK/HOLDLOCK pattern.
-- ---------------------------------------------------------------------
CREATE TABLE dbo.knowledge_number_sequences (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_knowledge_number_sequences PRIMARY KEY,
    prefix nvarchar(10) NOT NULL,
    scope_code nvarchar(20) NOT NULL,
    scope_name nvarchar(200) NOT NULL CONSTRAINT DF_knowledge_number_sequences_scope_name DEFAULT N'',
    last_number int NOT NULL CONSTRAINT DF_knowledge_number_sequences_last DEFAULT 0,
    padding tinyint NOT NULL CONSTRAINT DF_knowledge_number_sequences_padding DEFAULT 4,
    is_active bit NOT NULL CONSTRAINT DF_knowledge_number_sequences_active DEFAULT 1,
    updated_at datetimeoffset(0) NOT NULL CONSTRAINT DF_knowledge_number_sequences_updated DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_knowledge_number_sequences UNIQUE (prefix, scope_code),
    CONSTRAINT CK_knowledge_number_sequences_prefix CHECK (LEN(LTRIM(RTRIM(prefix))) > 0),
    CONSTRAINT CK_knowledge_number_sequences_scope CHECK (LEN(LTRIM(RTRIM(scope_code))) > 0),
    CONSTRAINT CK_knowledge_number_sequences_last CHECK (last_number >= 0),
    CONSTRAINT CK_knowledge_number_sequences_padding CHECK (padding BETWEEN 3 AND 6)
);


-- ---------------------------------------------------------------------
-- Files.  Storage adapter writes bytes; SQL keeps metadata + checksum,
-- exactly as dbo.supplier_quotations and dbo.project_documents already do.
-- ---------------------------------------------------------------------
CREATE TABLE dbo.knowledge_document_files (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_knowledge_document_files PRIMARY KEY,
    storage_provider nvarchar(30) NOT NULL CONSTRAINT DF_knowledge_document_files_provider DEFAULT N'Nas',
    storage_key nvarchar(400) NOT NULL CONSTRAINT UQ_knowledge_document_files_storage UNIQUE,
    original_file_name nvarchar(500) NOT NULL,
    safe_file_name nvarchar(500) NOT NULL,
    mime_type nvarchar(200) NOT NULL,
    size_bytes bigint NOT NULL,
    sha256 char(64) NOT NULL,
    malware_scan_status nvarchar(20) NOT NULL CONSTRAINT DF_knowledge_document_files_scan DEFAULT N'Skipped',
    malware_scanned_at datetimeoffset(0) NULL,
    uploaded_by bigint NOT NULL,
    uploaded_at datetimeoffset(0) NOT NULL CONSTRAINT DF_knowledge_document_files_uploaded DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_knowledge_document_files_size CHECK (size_bytes > 0),
    CONSTRAINT CK_knowledge_document_files_sha CHECK (LEN(sha256) = 64),
    CONSTRAINT CK_knowledge_document_files_names CHECK (LEN(LTRIM(RTRIM(original_file_name))) > 0 AND LEN(LTRIM(RTRIM(safe_file_name))) > 0),
    CONSTRAINT CK_knowledge_document_files_provider CHECK (storage_provider IN (N'Nas', N'Local')),
    CONSTRAINT CK_knowledge_document_files_scan CHECK (malware_scan_status IN (N'Skipped', N'Pending', N'Clean', N'Infected', N'Failed')),
    CONSTRAINT FK_knowledge_document_files_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES dbo.users(id)
);

-- Duplicate detection without forbidding an intentional re-upload.
CREATE INDEX IX_knowledge_document_files_sha ON dbo.knowledge_document_files(sha256)
    INCLUDE (size_bytes, original_file_name, uploaded_by, uploaded_at);


-- ---------------------------------------------------------------------
-- Documents
-- ---------------------------------------------------------------------
CREATE TABLE dbo.knowledge_documents (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_knowledge_documents PRIMARY KEY,
    document_no nvarchar(40) NOT NULL CONSTRAINT UQ_knowledge_documents_no UNIQUE,
    title nvarchar(300) NOT NULL,
    description nvarchar(2000) NOT NULL CONSTRAINT DF_knowledge_documents_description DEFAULT N'',
    document_type nvarchar(30) NOT NULL,
    category_id bigint NOT NULL,
    department_code nvarchar(200) NOT NULL CONSTRAINT DF_knowledge_documents_department DEFAULT N'',
    owner_id bigint NOT NULL,
    confidentiality nvarchar(30) NOT NULL CONSTRAINT DF_knowledge_documents_conf DEFAULT N'Company',
    current_version_id bigint NULL,
    current_status nvarchar(30) NOT NULL CONSTRAINT DF_knowledge_documents_status DEFAULT N'Draft',
    language char(2) NOT NULL CONSTRAINT DF_knowledge_documents_language DEFAULT 'EN',
    tags nvarchar(500) NOT NULL CONSTRAINT DF_knowledge_documents_tags DEFAULT N'',
    next_review_date date NULL,
    created_by bigint NOT NULL,
    created_at datetimeoffset(0) NOT NULL CONSTRAINT DF_knowledge_documents_created DEFAULT SYSUTCDATETIME(),
    updated_by bigint NOT NULL,
    updated_at datetimeoffset(0) NOT NULL CONSTRAINT DF_knowledge_documents_updated DEFAULT SYSUTCDATETIME(),
    archived_at datetimeoffset(0) NULL,
    archived_by bigint NULL,
    row_version rowversion NOT NULL,
    CONSTRAINT CK_knowledge_documents_title CHECK (LEN(LTRIM(RTRIM(title))) > 0),
    CONSTRAINT CK_knowledge_documents_type CHECK (document_type IN (
        N'Controlled Document', N'Working Document', N'Knowledge Article', N'Presentation',
        N'Template', N'Project Document', N'Supplier Document', N'External Reference')),
    CONSTRAINT CK_knowledge_documents_conf CHECK (confidentiality IN (
        N'Company', N'Department Only', N'Project Team Only', N'Management Only', N'Confidential', N'Restricted')),
    CONSTRAINT CK_knowledge_documents_language CHECK (language IN ('EN', 'TH', 'JA')),
    CONSTRAINT CK_knowledge_documents_status CHECK (current_status IN (
        N'Draft', N'In Review', N'Request Changes', N'Pending Approval', N'Approved',
        N'Published', N'Shared', N'Editing', N'Final', N'Superseded', N'Archived')),
    -- Business rule 12: every controlled standard carries a review date.
    CONSTRAINT CK_knowledge_documents_review_date CHECK (
        document_type <> N'Controlled Document' OR current_status NOT IN (N'Published', N'Approved') OR next_review_date IS NOT NULL),
    CONSTRAINT CK_knowledge_documents_archived CHECK (
        (archived_at IS NULL AND archived_by IS NULL) OR (archived_at IS NOT NULL AND archived_by IS NOT NULL)),
    CONSTRAINT FK_knowledge_documents_category FOREIGN KEY (category_id) REFERENCES dbo.knowledge_categories(id),
    CONSTRAINT FK_knowledge_documents_owner FOREIGN KEY (owner_id) REFERENCES dbo.users(id),
    CONSTRAINT FK_knowledge_documents_created_by FOREIGN KEY (created_by) REFERENCES dbo.users(id),
    CONSTRAINT FK_knowledge_documents_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users(id),
    CONSTRAINT FK_knowledge_documents_archived_by FOREIGN KEY (archived_by) REFERENCES dbo.users(id)
);

CREATE INDEX IX_knowledge_documents_category ON dbo.knowledge_documents(category_id, current_status, id)
    INCLUDE (document_no, title, owner_id, department_code, confidentiality, next_review_date, updated_at);
CREATE INDEX IX_knowledge_documents_owner ON dbo.knowledge_documents(owner_id, current_status)
    INCLUDE (document_no, title, next_review_date);
CREATE INDEX IX_knowledge_documents_review_due ON dbo.knowledge_documents(next_review_date)
    INCLUDE (document_no, title, owner_id, department_code, current_status)
    WHERE next_review_date IS NOT NULL AND archived_at IS NULL;
CREATE INDEX IX_knowledge_documents_type_status ON dbo.knowledge_documents(document_type, current_status, updated_at DESC)
    INCLUDE (document_no, title, category_id, owner_id);


-- ---------------------------------------------------------------------
-- Versions.  The revision chain and the workflow live here.
-- ---------------------------------------------------------------------
CREATE TABLE dbo.knowledge_document_versions (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_knowledge_document_versions PRIMARY KEY,
    document_id bigint NOT NULL,
    revision nvarchar(10) NOT NULL,
    version_number int NOT NULL,
    file_id bigint NULL,
    change_type nvarchar(10) NOT NULL CONSTRAINT DF_knowledge_document_versions_change_type DEFAULT N'Major',
    change_summary nvarchar(2000) NOT NULL CONSTRAINT DF_knowledge_document_versions_change_summary DEFAULT N'',
    extracted_text nvarchar(max) NULL,
    effective_date date NULL,
    expiry_date date NULL,
    status nvarchar(30) NOT NULL CONSTRAINT DF_knowledge_document_versions_status DEFAULT N'Draft',
    superseded_by_version_id bigint NULL,
    created_by bigint NOT NULL,
    created_at datetimeoffset(0) NOT NULL CONSTRAINT DF_knowledge_document_versions_created DEFAULT SYSUTCDATETIME(),
    reviewed_by bigint NULL,
    reviewed_at datetimeoffset(0) NULL,
    approved_by bigint NULL,
    approved_at datetimeoffset(0) NULL,
    published_by bigint NULL,
    published_at datetimeoffset(0) NULL,
    row_version rowversion NOT NULL,
    CONSTRAINT UQ_knowledge_document_versions_revision UNIQUE (document_id, revision),
    CONSTRAINT UQ_knowledge_document_versions_number UNIQUE (document_id, version_number),
    CONSTRAINT CK_knowledge_document_versions_version_number CHECK (version_number > 0),
    CONSTRAINT CK_knowledge_document_versions_revision CHECK (LEN(LTRIM(RTRIM(revision))) > 0),
    CONSTRAINT CK_knowledge_document_versions_change_type CHECK (change_type IN (N'Major', N'Minor')),
    CONSTRAINT CK_knowledge_document_versions_status CHECK (status IN (
        N'Draft', N'In Review', N'Request Changes', N'Pending Approval', N'Approved',
        N'Published', N'Shared', N'Editing', N'Final', N'Superseded', N'Archived')),
    CONSTRAINT CK_knowledge_document_versions_dates CHECK (expiry_date IS NULL OR effective_date IS NULL OR expiry_date >= effective_date),
    -- Business rule 15: a change always states what kind of change it was.
    CONSTRAINT CK_knowledge_document_versions_summary CHECK (
        version_number = 1 OR LEN(LTRIM(RTRIM(change_summary))) > 0),
    -- A published version must record who published it and when.
    CONSTRAINT CK_knowledge_document_versions_published CHECK (
        status <> N'Published' OR (published_by IS NOT NULL AND published_at IS NOT NULL AND effective_date IS NOT NULL)),
    -- Business rule 7: a superseded version points at its replacement.
    CONSTRAINT CK_knowledge_document_versions_superseded CHECK (
        status <> N'Superseded' OR superseded_by_version_id IS NOT NULL),
    CONSTRAINT CK_knowledge_document_versions_not_self CHECK (superseded_by_version_id IS NULL OR superseded_by_version_id <> id),
    CONSTRAINT FK_knowledge_document_versions_document FOREIGN KEY (document_id) REFERENCES dbo.knowledge_documents(id),
    CONSTRAINT FK_knowledge_document_versions_file FOREIGN KEY (file_id) REFERENCES dbo.knowledge_document_files(id),
    CONSTRAINT FK_knowledge_document_versions_superseded FOREIGN KEY (superseded_by_version_id) REFERENCES dbo.knowledge_document_versions(id),
    CONSTRAINT FK_knowledge_document_versions_created_by FOREIGN KEY (created_by) REFERENCES dbo.users(id),
    CONSTRAINT FK_knowledge_document_versions_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES dbo.users(id),
    CONSTRAINT FK_knowledge_document_versions_approved_by FOREIGN KEY (approved_by) REFERENCES dbo.users(id),
    CONSTRAINT FK_knowledge_document_versions_published_by FOREIGN KEY (published_by) REFERENCES dbo.users(id)
);

-- Business rule 5, enforced structurally: one document number may hold at
-- most ONE published revision.  A second concurrent publish cannot slip
-- through a race because the index, not the application, is the referee.
CREATE UNIQUE INDEX UX_knowledge_document_versions_one_published
    ON dbo.knowledge_document_versions(document_id)
    WHERE status = N'Published';

CREATE INDEX IX_knowledge_document_versions_document ON dbo.knowledge_document_versions(document_id, version_number DESC)
    INCLUDE (revision, status, effective_date, expiry_date, file_id);
CREATE INDEX IX_knowledge_document_versions_status ON dbo.knowledge_document_versions(status, created_at DESC)
    INCLUDE (document_id, revision, created_by);

ALTER TABLE dbo.knowledge_documents
    ADD CONSTRAINT FK_knowledge_documents_current_version
    FOREIGN KEY (current_version_id) REFERENCES dbo.knowledge_document_versions(id);


-- ---------------------------------------------------------------------
-- Knowledge articles (content, not files)
-- ---------------------------------------------------------------------
CREATE TABLE dbo.knowledge_articles (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_knowledge_articles PRIMARY KEY,
    slug nvarchar(200) NOT NULL CONSTRAINT UQ_knowledge_articles_slug UNIQUE,
    title nvarchar(300) NOT NULL,
    summary nvarchar(1000) NOT NULL CONSTRAINT DF_knowledge_articles_summary DEFAULT N'',
    content nvarchar(max) NOT NULL,
    article_type nvarchar(40) NOT NULL CONSTRAINT DF_knowledge_articles_type DEFAULT N'Technical Note',
    category_id bigint NOT NULL,
    owner_id bigint NOT NULL,
    status nvarchar(30) NOT NULL CONSTRAINT DF_knowledge_articles_status DEFAULT N'Draft',
    confidentiality nvarchar(30) NOT NULL CONSTRAINT DF_knowledge_articles_conf DEFAULT N'Company',
    language char(2) NOT NULL CONSTRAINT DF_knowledge_articles_language DEFAULT 'EN',
    tags nvarchar(500) NOT NULL CONSTRAINT DF_knowledge_articles_tags DEFAULT N'',
    review_date date NULL,
    helpful_count int NOT NULL CONSTRAINT DF_knowledge_articles_helpful DEFAULT 0,
    not_helpful_count int NOT NULL CONSTRAINT DF_knowledge_articles_not_helpful DEFAULT 0,
    view_count int NOT NULL CONSTRAINT DF_knowledge_articles_views DEFAULT 0,
    created_by bigint NOT NULL,
    created_at datetimeoffset(0) NOT NULL CONSTRAINT DF_knowledge_articles_created DEFAULT SYSUTCDATETIME(),
    updated_by bigint NOT NULL,
    updated_at datetimeoffset(0) NOT NULL CONSTRAINT DF_knowledge_articles_updated DEFAULT SYSUTCDATETIME(),
    archived_at datetimeoffset(0) NULL,
    row_version rowversion NOT NULL,
    CONSTRAINT CK_knowledge_articles_title CHECK (LEN(LTRIM(RTRIM(title))) > 0),
    CONSTRAINT CK_knowledge_articles_slug CHECK (LEN(LTRIM(RTRIM(slug))) > 0),
    CONSTRAINT CK_knowledge_articles_status CHECK (status IN (N'Draft', N'In Review', N'Published', N'Archived')),
    CONSTRAINT CK_knowledge_articles_type CHECK (article_type IN (
        N'How-to', N'Troubleshooting', N'FAQ', N'Technical Note', N'Best Practice',
        N'Design Guideline', N'Lessons Learned', N'Root Cause Analysis', N'Training Note')),
    CONSTRAINT CK_knowledge_articles_conf CHECK (confidentiality IN (
        N'Company', N'Department Only', N'Project Team Only', N'Management Only', N'Confidential', N'Restricted')),
    CONSTRAINT CK_knowledge_articles_language CHECK (language IN ('EN', 'TH', 'JA')),
    CONSTRAINT CK_knowledge_articles_counts CHECK (helpful_count >= 0 AND not_helpful_count >= 0 AND view_count >= 0),
    CONSTRAINT FK_knowledge_articles_category FOREIGN KEY (category_id) REFERENCES dbo.knowledge_categories(id),
    CONSTRAINT FK_knowledge_articles_owner FOREIGN KEY (owner_id) REFERENCES dbo.users(id),
    CONSTRAINT FK_knowledge_articles_created_by FOREIGN KEY (created_by) REFERENCES dbo.users(id),
    CONSTRAINT FK_knowledge_articles_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users(id)
);

CREATE INDEX IX_knowledge_articles_category ON dbo.knowledge_articles(category_id, status, updated_at DESC)
    INCLUDE (slug, title, owner_id, article_type);


-- ---------------------------------------------------------------------
-- Relations to the rest of the platform.  One file, many records.
-- ---------------------------------------------------------------------
CREATE TABLE dbo.knowledge_document_relations (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_knowledge_document_relations PRIMARY KEY,
    document_id bigint NULL,
    article_id bigint NULL,
    entity_type nvarchar(30) NOT NULL,
    entity_id bigint NOT NULL,
    relation_type nvarchar(30) NOT NULL CONSTRAINT DF_knowledge_document_relations_type DEFAULT N'Reference',
    created_by bigint NOT NULL,
    created_at datetimeoffset(0) NOT NULL CONSTRAINT DF_knowledge_document_relations_created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_knowledge_document_relations_subject CHECK (
        (document_id IS NOT NULL AND article_id IS NULL) OR (document_id IS NULL AND article_id IS NOT NULL)),
    CONSTRAINT CK_knowledge_document_relations_entity CHECK (entity_type IN (
        N'Inquiry', N'Project', N'Estimate', N'BOM', N'PR', N'PO', N'GoodsReceipt',
        N'MaterialIssue', N'ItemMaster', N'Supplier', N'KnowledgeArticle', N'Customer')),
    CONSTRAINT CK_knowledge_document_relations_relation CHECK (relation_type IN (
        N'Reference', N'Attachment', N'Deliverable', N'Standard Applied', N'Supersedes', N'Related')),
    CONSTRAINT CK_knowledge_document_relations_entity_id CHECK (entity_id > 0),
    CONSTRAINT FK_knowledge_document_relations_document FOREIGN KEY (document_id) REFERENCES dbo.knowledge_documents(id),
    CONSTRAINT FK_knowledge_document_relations_article FOREIGN KEY (article_id) REFERENCES dbo.knowledge_articles(id),
    CONSTRAINT FK_knowledge_document_relations_created_by FOREIGN KEY (created_by) REFERENCES dbo.users(id)
);

CREATE UNIQUE INDEX UX_knowledge_document_relations_doc
    ON dbo.knowledge_document_relations(document_id, entity_type, entity_id, relation_type)
    WHERE document_id IS NOT NULL;
CREATE UNIQUE INDEX UX_knowledge_document_relations_article
    ON dbo.knowledge_document_relations(article_id, entity_type, entity_id, relation_type)
    WHERE article_id IS NOT NULL;
CREATE INDEX IX_knowledge_document_relations_entity
    ON dbo.knowledge_document_relations(entity_type, entity_id)
    INCLUDE (document_id, article_id, relation_type, created_at);


-- ---------------------------------------------------------------------
-- Permissions.  Evaluated in the API on top of the RBAC role grants.
-- ---------------------------------------------------------------------
CREATE TABLE dbo.knowledge_document_permissions (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_knowledge_document_permissions PRIMARY KEY,
    document_id bigint NULL,
    article_id bigint NULL,
    category_id bigint NULL,
    subject_type nvarchar(20) NOT NULL,
    subject_user_id bigint NULL,
    subject_role_id bigint NULL,
    subject_project_id bigint NULL,
    subject_department_code nvarchar(200) NULL,
    permission_level nvarchar(20) NOT NULL,
    granted_by bigint NOT NULL,
    created_at datetimeoffset(0) NOT NULL CONSTRAINT DF_knowledge_document_permissions_created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_knowledge_document_permissions_target CHECK (
        (CASE WHEN document_id IS NOT NULL THEN 1 ELSE 0 END
       + CASE WHEN article_id  IS NOT NULL THEN 1 ELSE 0 END
       + CASE WHEN category_id IS NOT NULL THEN 1 ELSE 0 END) = 1),
    CONSTRAINT CK_knowledge_document_permissions_subject_type CHECK (subject_type IN (N'User', N'Role', N'Department', N'Project')),
    CONSTRAINT CK_knowledge_document_permissions_subject CHECK (
        (subject_type = N'User'       AND subject_user_id IS NOT NULL AND subject_role_id IS NULL AND subject_project_id IS NULL AND subject_department_code IS NULL)
     OR (subject_type = N'Role'       AND subject_role_id IS NOT NULL AND subject_user_id IS NULL AND subject_project_id IS NULL AND subject_department_code IS NULL)
     OR (subject_type = N'Project'    AND subject_project_id IS NOT NULL AND subject_user_id IS NULL AND subject_role_id IS NULL AND subject_department_code IS NULL)
     OR (subject_type = N'Department' AND subject_department_code IS NOT NULL AND subject_user_id IS NULL AND subject_role_id IS NULL AND subject_project_id IS NULL)),
    CONSTRAINT CK_knowledge_document_permissions_level CHECK (permission_level IN (
        N'View', N'Download', N'Comment', N'Edit', N'Review', N'Approve', N'Manage')),
    CONSTRAINT FK_knowledge_document_permissions_document FOREIGN KEY (document_id) REFERENCES dbo.knowledge_documents(id),
    CONSTRAINT FK_knowledge_document_permissions_article FOREIGN KEY (article_id) REFERENCES dbo.knowledge_articles(id),
    CONSTRAINT FK_knowledge_document_permissions_category FOREIGN KEY (category_id) REFERENCES dbo.knowledge_categories(id),
    CONSTRAINT FK_knowledge_document_permissions_user FOREIGN KEY (subject_user_id) REFERENCES dbo.users(id),
    CONSTRAINT FK_knowledge_document_permissions_role FOREIGN KEY (subject_role_id) REFERENCES dbo.roles(id),
    CONSTRAINT FK_knowledge_document_permissions_project FOREIGN KEY (subject_project_id) REFERENCES dbo.projects(id),
    CONSTRAINT FK_knowledge_document_permissions_granted_by FOREIGN KEY (granted_by) REFERENCES dbo.users(id)
);

CREATE INDEX IX_knowledge_document_permissions_document ON dbo.knowledge_document_permissions(document_id)
    INCLUDE (subject_type, subject_user_id, subject_role_id, subject_project_id, subject_department_code, permission_level)
    WHERE document_id IS NOT NULL;
CREATE INDEX IX_knowledge_document_permissions_category ON dbo.knowledge_document_permissions(category_id)
    INCLUDE (subject_type, permission_level)
    WHERE category_id IS NOT NULL;


-- ---------------------------------------------------------------------
-- Multi-step approval
-- ---------------------------------------------------------------------
CREATE TABLE dbo.knowledge_document_approvals (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_knowledge_document_approvals PRIMARY KEY,
    document_version_id bigint NOT NULL,
    sequence int NOT NULL,
    step_type nvarchar(20) NOT NULL,
    approver_id bigint NOT NULL,
    status nvarchar(20) NOT NULL CONSTRAINT DF_knowledge_document_approvals_status DEFAULT N'Pending',
    comment nvarchar(2000) NOT NULL CONSTRAINT DF_knowledge_document_approvals_comment DEFAULT N'',
    acted_by bigint NULL,
    acted_at datetimeoffset(0) NULL,
    created_at datetimeoffset(0) NOT NULL CONSTRAINT DF_knowledge_document_approvals_created DEFAULT SYSUTCDATETIME(),
    row_version rowversion NOT NULL,
    CONSTRAINT UQ_knowledge_document_approvals_sequence UNIQUE (document_version_id, sequence),
    CONSTRAINT CK_knowledge_document_approvals_sequence CHECK (sequence > 0),
    CONSTRAINT CK_knowledge_document_approvals_step CHECK (step_type IN (N'Review', N'Approve', N'Publish')),
    CONSTRAINT CK_knowledge_document_approvals_status CHECK (status IN (N'Pending', N'Approved', N'Request Changes', N'Rejected', N'Skipped')),
    -- A decision records who made it and when; a comment is mandatory on anything but a plain approval.
    CONSTRAINT CK_knowledge_document_approvals_acted CHECK (
        (status = N'Pending' AND acted_by IS NULL AND acted_at IS NULL)
     OR (status <> N'Pending' AND acted_by IS NOT NULL AND acted_at IS NOT NULL)),
    CONSTRAINT CK_knowledge_document_approvals_comment CHECK (
        status NOT IN (N'Request Changes', N'Rejected') OR LEN(LTRIM(RTRIM(comment))) > 0),
    CONSTRAINT FK_knowledge_document_approvals_version FOREIGN KEY (document_version_id) REFERENCES dbo.knowledge_document_versions(id),
    CONSTRAINT FK_knowledge_document_approvals_approver FOREIGN KEY (approver_id) REFERENCES dbo.users(id),
    CONSTRAINT FK_knowledge_document_approvals_acted_by FOREIGN KEY (acted_by) REFERENCES dbo.users(id)
);

CREATE INDEX IX_knowledge_document_approvals_approver ON dbo.knowledge_document_approvals(approver_id, status)
    INCLUDE (document_version_id, sequence, step_type, created_at);


-- ---------------------------------------------------------------------
-- Comments
-- ---------------------------------------------------------------------
CREATE TABLE dbo.knowledge_document_comments (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_knowledge_document_comments PRIMARY KEY,
    document_id bigint NULL,
    article_id bigint NULL,
    document_version_id bigint NULL,
    parent_comment_id bigint NULL,
    author_id bigint NOT NULL,
    content nvarchar(4000) NOT NULL,
    mentioned_user_ids nvarchar(500) NOT NULL CONSTRAINT DF_knowledge_document_comments_mentions DEFAULT N'',
    resolved_at datetimeoffset(0) NULL,
    resolved_by bigint NULL,
    created_at datetimeoffset(0) NOT NULL CONSTRAINT DF_knowledge_document_comments_created DEFAULT SYSUTCDATETIME(),
    updated_at datetimeoffset(0) NOT NULL CONSTRAINT DF_knowledge_document_comments_updated DEFAULT SYSUTCDATETIME(),
    row_version rowversion NOT NULL,
    CONSTRAINT CK_knowledge_document_comments_subject CHECK (
        (document_id IS NOT NULL AND article_id IS NULL) OR (document_id IS NULL AND article_id IS NOT NULL)),
    CONSTRAINT CK_knowledge_document_comments_content CHECK (LEN(LTRIM(RTRIM(content))) > 0),
    CONSTRAINT CK_knowledge_document_comments_resolved CHECK (
        (resolved_at IS NULL AND resolved_by IS NULL) OR (resolved_at IS NOT NULL AND resolved_by IS NOT NULL)),
    CONSTRAINT CK_knowledge_document_comments_not_self CHECK (parent_comment_id IS NULL OR parent_comment_id <> id),
    CONSTRAINT FK_knowledge_document_comments_document FOREIGN KEY (document_id) REFERENCES dbo.knowledge_documents(id),
    CONSTRAINT FK_knowledge_document_comments_article FOREIGN KEY (article_id) REFERENCES dbo.knowledge_articles(id),
    CONSTRAINT FK_knowledge_document_comments_version FOREIGN KEY (document_version_id) REFERENCES dbo.knowledge_document_versions(id),
    CONSTRAINT FK_knowledge_document_comments_parent FOREIGN KEY (parent_comment_id) REFERENCES dbo.knowledge_document_comments(id),
    CONSTRAINT FK_knowledge_document_comments_author FOREIGN KEY (author_id) REFERENCES dbo.users(id),
    CONSTRAINT FK_knowledge_document_comments_resolved_by FOREIGN KEY (resolved_by) REFERENCES dbo.users(id)
);

CREATE INDEX IX_knowledge_document_comments_document ON dbo.knowledge_document_comments(document_id, created_at)
    INCLUDE (author_id, parent_comment_id, resolved_at)
    WHERE document_id IS NOT NULL;
CREATE INDEX IX_knowledge_document_comments_article ON dbo.knowledge_document_comments(article_id, created_at)
    INCLUDE (author_id, parent_comment_id, resolved_at)
    WHERE article_id IS NOT NULL;


-- ---------------------------------------------------------------------
-- Read acknowledgement, bound to a version so a new revision can re-ask.
-- ---------------------------------------------------------------------
CREATE TABLE dbo.knowledge_document_acknowledgements (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_knowledge_document_acknowledgements PRIMARY KEY,
    document_version_id bigint NOT NULL,
    user_id bigint NOT NULL,
    assigned_by bigint NOT NULL,
    assigned_at datetimeoffset(0) NOT NULL CONSTRAINT DF_knowledge_document_ack_assigned DEFAULT SYSUTCDATETIME(),
    due_at date NULL,
    acknowledged_at datetimeoffset(0) NULL,
    status nvarchar(20) NOT NULL CONSTRAINT DF_knowledge_document_ack_status DEFAULT N'Pending',
    CONSTRAINT UQ_knowledge_document_ack UNIQUE (document_version_id, user_id),
    CONSTRAINT CK_knowledge_document_ack_status CHECK (status IN (N'Pending', N'Acknowledged', N'Cancelled')),
    CONSTRAINT CK_knowledge_document_ack_acknowledged CHECK (
        (status = N'Acknowledged' AND acknowledged_at IS NOT NULL) OR (status <> N'Acknowledged' AND acknowledged_at IS NULL)),
    CONSTRAINT FK_knowledge_document_ack_version FOREIGN KEY (document_version_id) REFERENCES dbo.knowledge_document_versions(id),
    CONSTRAINT FK_knowledge_document_ack_user FOREIGN KEY (user_id) REFERENCES dbo.users(id),
    CONSTRAINT FK_knowledge_document_ack_assigned_by FOREIGN KEY (assigned_by) REFERENCES dbo.users(id)
);

CREATE INDEX IX_knowledge_document_ack_user ON dbo.knowledge_document_acknowledgements(user_id, status)
    INCLUDE (document_version_id, due_at, assigned_at);
CREATE INDEX IX_knowledge_document_ack_version ON dbo.knowledge_document_acknowledgements(document_version_id, status)
    INCLUDE (user_id, acknowledged_at, due_at);


-- ---------------------------------------------------------------------
-- Append-only audit, following the dbo.stock_txns precedent.
-- ---------------------------------------------------------------------
CREATE TABLE dbo.knowledge_audit_events (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_knowledge_audit_events PRIMARY KEY,
    document_id bigint NULL,
    document_version_id bigint NULL,
    article_id bigint NULL,
    actor_id bigint NOT NULL,
    actor_role nvarchar(100) NOT NULL CONSTRAINT DF_knowledge_audit_events_role DEFAULT N'',
    action nvarchar(40) NOT NULL,
    before_json nvarchar(max) NULL,
    after_json nvarchar(max) NULL,
    reason nvarchar(1000) NOT NULL CONSTRAINT DF_knowledge_audit_events_reason DEFAULT N'',
    related_entity_type nvarchar(30) NULL,
    related_entity_id bigint NULL,
    occurred_at datetimeoffset(0) NOT NULL CONSTRAINT DF_knowledge_audit_events_occurred DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_knowledge_audit_events_action CHECK (action IN (
        N'Create', N'Upload', N'Preview', N'Download', N'EditMetadata', N'CreateVersion',
        N'SubmitForReview', N'Approve', N'Reject', N'RequestChanges', N'Publish', N'Supersede',
        N'Archive', N'Restore', N'ChangePermission', N'LinkRecord', N'UnlinkRecord',
        N'Acknowledge', N'AssignAcknowledgement', N'Comment')),
    CONSTRAINT CK_knowledge_audit_events_subject CHECK (
        document_id IS NOT NULL OR article_id IS NOT NULL),
    CONSTRAINT FK_knowledge_audit_events_document FOREIGN KEY (document_id) REFERENCES dbo.knowledge_documents(id),
    CONSTRAINT FK_knowledge_audit_events_version FOREIGN KEY (document_version_id) REFERENCES dbo.knowledge_document_versions(id),
    CONSTRAINT FK_knowledge_audit_events_article FOREIGN KEY (article_id) REFERENCES dbo.knowledge_articles(id),
    CONSTRAINT FK_knowledge_audit_events_actor FOREIGN KEY (actor_id) REFERENCES dbo.users(id)
);

CREATE INDEX IX_knowledge_audit_events_document ON dbo.knowledge_audit_events(document_id, occurred_at DESC)
    INCLUDE (actor_id, action, document_version_id)
    WHERE document_id IS NOT NULL;
CREATE INDEX IX_knowledge_audit_events_actor ON dbo.knowledge_audit_events(actor_id, occurred_at DESC)
    INCLUDE (action, document_id, article_id);

-- Triggers and the procedure are created through EXEC so that the whole
-- migration stays inside one batch and therefore one transaction.  A bare
-- CREATE TRIGGER would need its own batch, and a GO here would leave the
-- outer transaction open across the batch boundary.

-- Audit events cannot be edited or removed through any code path, the same
-- guarantee dbo.stock_txns already carries.
EXEC(N'
CREATE TRIGGER dbo.trg_knowledge_audit_events_append_only
ON dbo.knowledge_audit_events
INSTEAD OF UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    THROW 51172, ''Knowledge audit events are append-only.'', 1;
END;');

-- Business rule 9: a document that has ever been approved or published is
-- archived, never deleted.
EXEC(N'
CREATE TRIGGER dbo.trg_knowledge_documents_no_hard_delete
ON dbo.knowledge_documents
INSTEAD OF DELETE
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (
        SELECT 1
        FROM deleted d
        WHERE EXISTS (
            SELECT 1 FROM dbo.knowledge_document_versions v
            WHERE v.document_id = d.id
              AND v.status IN (N''Approved'', N''Published'', N''Superseded'')))
        THROW 51173, ''Documents with an approved or published revision cannot be deleted. Archive them instead.'', 1;

    DELETE FROM dbo.knowledge_documents WHERE id IN (SELECT id FROM deleted);
END;');

-- Business rule 3: an approved or published revision is immutable.  Only the
-- supersede pointer and the archival status may still move.
-- Null-safe comparisons are written out longhand rather than with
-- IS DISTINCT FROM, so the migration does not depend on the database
-- compatibility level being 160 or higher.
EXEC(N'
CREATE TRIGGER dbo.trg_knowledge_document_versions_immutable
ON dbo.knowledge_document_versions
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (
        SELECT 1
        FROM deleted d
        INNER JOIN inserted i ON i.id = d.id
        WHERE d.status IN (N''Approved'', N''Published'')
          AND (d.revision <> i.revision
            OR d.version_number <> i.version_number
            OR d.change_type <> i.change_type
            OR d.change_summary <> i.change_summary
            OR d.document_id <> i.document_id
            OR (d.file_id IS NULL AND i.file_id IS NOT NULL)
            OR (d.file_id IS NOT NULL AND i.file_id IS NULL)
            OR (d.file_id IS NOT NULL AND i.file_id IS NOT NULL AND d.file_id <> i.file_id)
            OR (d.effective_date IS NULL AND i.effective_date IS NOT NULL)
            OR (d.effective_date IS NOT NULL AND i.effective_date IS NULL)
            OR (d.effective_date IS NOT NULL AND i.effective_date IS NOT NULL AND d.effective_date <> i.effective_date)))
        THROW 51174, ''Approved and published revisions are immutable. Create a new revision instead.'', 1;
END;');

-- ---------------------------------------------------------------------
-- Knowledge document number allocator: PREFIX-SCOPE-NNNN, never resets.
-- Concurrency-safe by the same UPDLOCK/HOLDLOCK pattern as
-- dbo.issue_document_number, including the savepoint behaviour so it can
-- be called from inside an ambient transaction.
-- ---------------------------------------------------------------------
EXEC(N'
CREATE PROCEDURE dbo.issue_knowledge_document_number
    @prefix nvarchar(10),
    @scope_code nvarchar(20),
    @document_number nvarchar(40) OUTPUT
AS
BEGIN
    SET XACT_ABORT ON;
    SET NOCOUNT ON;

    SET @prefix = UPPER(LTRIM(RTRIM(@prefix)));
    SET @scope_code = UPPER(LTRIM(RTRIM(@scope_code)));
    IF @prefix IS NULL OR @prefix = N''''
        THROW 51175, ''Document prefix is required.'', 1;
    IF @scope_code IS NULL OR @scope_code = N''''
        THROW 51176, ''Document scope code is required.'', 1;

    DECLARE @initial_trancount int = @@TRANCOUNT;
    DECLARE @started_transaction bit = 0;
    DECLARE @savepoint_created bit = 0;
    DECLARE @next int;
    DECLARE @padding tinyint;

    BEGIN TRY
        IF @initial_trancount = 0
        BEGIN
            SET @started_transaction = 1;
            BEGIN TRANSACTION;
        END
        ELSE
        BEGIN
            SAVE TRANSACTION issue_knowledge_number_savepoint;
            SET @savepoint_created = 1;
        END;

        UPDATE dbo.knowledge_number_sequences WITH (UPDLOCK, HOLDLOCK)
           SET @next = last_number = last_number + 1,
               @padding = padding,
               updated_at = SYSUTCDATETIME()
         WHERE prefix = @prefix AND scope_code = @scope_code AND is_active = 1;

        IF @@ROWCOUNT = 0
            THROW 51177, ''No active knowledge document sequence is configured for this prefix and scope.'', 1;

        IF @next > 999999
            THROW 51178, ''Knowledge document sequence has been exhausted.'', 1;

        SET @document_number = @prefix + N''-'' + @scope_code + N''-'' +
            RIGHT(REPLICATE(N''0'', @padding) + CONVERT(nvarchar(10), @next), @padding);

        IF @started_transaction = 1
            COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @started_transaction = 1 AND XACT_STATE() <> 0
            ROLLBACK TRANSACTION;
        ELSE IF @savepoint_created = 1 AND XACT_STATE() = 1
            ROLLBACK TRANSACTION issue_knowledge_number_savepoint;
        THROW;
    END CATCH;
END;');


-- ---------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------
INSERT INTO dbo.permissions (code, description) VALUES
    (N'knowledge.view',                N'View knowledge documents and articles the user is entitled to'),
    (N'knowledge.upload',              N'Create documents and upload new versions'),
    (N'knowledge.comment',             N'Comment on documents and articles'),
    (N'knowledge.edit',                N'Edit document metadata and working documents'),
    (N'knowledge.review',              N'Act on review steps'),
    (N'knowledge.approve',             N'Act on approval steps'),
    (N'knowledge.publish',             N'Publish an approved revision and supersede the previous one'),
    (N'knowledge.archive',             N'Archive and restore documents'),
    (N'knowledge.manage_permissions',  N'Grant and revoke document permissions'),
    (N'knowledge.manage_categories',   N'Maintain the category tree and numbering sequences'),
    (N'knowledge.view_audit',          N'Read the knowledge audit trail');

-- Everyone who can already read the platform can read the library and comment.
INSERT INTO dbo.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM dbo.roles r
CROSS JOIN dbo.permissions p
WHERE p.code IN (N'knowledge.view', N'knowledge.comment')
  AND r.code <> N'Viewer'
  AND NOT EXISTS (SELECT 1 FROM dbo.role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);

-- Viewer reads only.
INSERT INTO dbo.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM dbo.roles r
CROSS JOIN dbo.permissions p
WHERE r.code = N'Viewer' AND p.code = N'knowledge.view'
  AND NOT EXISTS (SELECT 1 FROM dbo.role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);

-- Contributors can create and edit.
INSERT INTO dbo.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM dbo.roles r
CROSS JOIN dbo.permissions p
WHERE r.code IN (N'Engineer', N'Project Manager', N'Engineering Manager', N'Purchasing',
                 N'Warehouse', N'Inventory Controller', N'Sales Engineer', N'Admin')
  AND p.code IN (N'knowledge.upload', N'knowledge.edit')
  AND NOT EXISTS (SELECT 1 FROM dbo.role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);

-- Review and approval sit with the managers and the administrator.
INSERT INTO dbo.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM dbo.roles r
CROSS JOIN dbo.permissions p
WHERE r.code IN (N'Project Manager', N'Engineering Manager', N'Admin')
  AND p.code IN (N'knowledge.review', N'knowledge.approve')
  AND NOT EXISTS (SELECT 1 FROM dbo.role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);

-- Document control: publishing, archiving, permissions, categories, audit.
INSERT INTO dbo.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM dbo.roles r
CROSS JOIN dbo.permissions p
WHERE r.code IN (N'Engineering Manager', N'Admin')
  AND p.code IN (N'knowledge.publish', N'knowledge.archive', N'knowledge.manage_permissions',
                 N'knowledge.manage_categories', N'knowledge.view_audit')
  AND NOT EXISTS (SELECT 1 FROM dbo.role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);


-- ---------------------------------------------------------------------
-- Application role grants
-- ---------------------------------------------------------------------
IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
BEGIN
    GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.knowledge_categories TO [iot_team_app_role];
    GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.knowledge_number_sequences TO [iot_team_app_role];
    GRANT SELECT, INSERT ON OBJECT::dbo.knowledge_document_files TO [iot_team_app_role];
    GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.knowledge_documents TO [iot_team_app_role];
    GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.knowledge_document_versions TO [iot_team_app_role];
    GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.knowledge_articles TO [iot_team_app_role];
    GRANT SELECT, INSERT, DELETE ON OBJECT::dbo.knowledge_document_relations TO [iot_team_app_role];
    GRANT SELECT, INSERT, DELETE ON OBJECT::dbo.knowledge_document_permissions TO [iot_team_app_role];
    -- Resubmitting a changed draft replaces only pending routing rows.
    GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.knowledge_document_approvals TO [iot_team_app_role];
    GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.knowledge_document_comments TO [iot_team_app_role];
    GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.knowledge_document_acknowledgements TO [iot_team_app_role];
    -- Insert only: the trigger blocks the rest, and the grant says so too.
    GRANT SELECT, INSERT ON OBJECT::dbo.knowledge_audit_events TO [iot_team_app_role];
    GRANT EXECUTE ON OBJECT::dbo.issue_knowledge_document_number TO [iot_team_app_role];
END;

INSERT INTO dbo.schema_versions(version, name)
VALUES (14, N'Knowledge and document hub: library, revisions, approvals, permissions and audit');

COMMIT TRANSACTION;
GO
