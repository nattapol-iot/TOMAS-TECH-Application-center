:on error exit
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET XACT_ABORT ON;
SET NOCOUNT ON;

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 17)
    THROW 51209, 'Migration 017 must be applied before migration 018.', 1;

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 18)
BEGIN
    PRINT 'Migration 018 is already applied.';
    RETURN;
END;
GO

BEGIN TRANSACTION;
GO


-- ---------------------------------------------------------------------------
-- Document signing and company stamp (DSN-TC-005)
--
-- Signing is not approving. dbo.audit_log and the module approval tables record
-- a decision about a RECORD. The tables below record a mark placed on a FILE,
-- identified by its SHA-256. The two are produced by one user action wherever
-- both apply, but they are stored separately and neither replaces the other.
--
-- Load-bearing invariants, enforced here rather than in application code:
--   * dbo.document_files is immutable. A replacement upload is a new revision.
--   * A new revision voids every unsigned step and never carries a mark forward.
--   * dbo.signature_marks, dbo.signed_documents and dbo.sign_events are
--     append-only and hash-chained.
--   * The Admin role can never hold stamp authority and is never granted
--     signing.sign. Admin configures the system; the business signs.
-- ---------------------------------------------------------------------------

-- Existing project attachments gain a real content hash. Migration 003 wrote the
-- upload SHA-256 into provider_etag because no dedicated column existed; the API
-- keeps reading that column for already-stored rows and writes both from now on.
ALTER TABLE dbo.project_docs
    ADD sha256 char(64) NULL;
GO

ALTER TABLE dbo.project_docs
    ADD CONSTRAINT CK_project_docs_sha256
        CHECK (sha256 IS NULL OR (LEN(sha256) = 64 AND sha256 NOT LIKE '%[^0-9A-Fa-f]%'));
GO

-- ===========================================================================
-- Master data: company stamps and the authority to apply them
-- ===========================================================================

CREATE TABLE dbo.company_stamps (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_company_stamps PRIMARY KEY,
    code nvarchar(20) NOT NULL CONSTRAINT UQ_company_stamps_code UNIQUE,
    name_th nvarchar(200) NOT NULL,
    name_en nvarchar(200) NOT NULL,
    name_ja nvarchar(200) NOT NULL,
    legal_entity nvarchar(200) NOT NULL,
    -- Storage key on the document share. This asset is never served to a
    -- browser and never given a download route; only the server-side render
    -- pipeline reads it. A downloadable seal image is a forgery kit (C-9).
    image_key nvarchar(1000) NULL,
    scope_json nvarchar(max) NOT NULL CONSTRAINT DF_company_stamps_scope DEFAULT N'[]',
    custodian_role_id bigint NOT NULL,
    valid_from date NOT NULL,
    valid_to date NULL,
    status nvarchar(20) NOT NULL CONSTRAINT DF_company_stamps_status DEFAULT N'ACTIVE',
    created_by bigint NOT NULL,
    created_at datetimeoffset(0) NOT NULL CONSTRAINT DF_company_stamps_created_at DEFAULT SYSUTCDATETIME(),
    updated_at datetimeoffset(0) NOT NULL CONSTRAINT DF_company_stamps_updated_at DEFAULT SYSUTCDATETIME(),
    row_version rowversion NOT NULL,
    CONSTRAINT CK_company_stamps_status CHECK (status IN (N'ACTIVE', N'RETIRED')),
    CONSTRAINT CK_company_stamps_scope CHECK (ISJSON(scope_json) = 1),
    CONSTRAINT CK_company_stamps_validity CHECK (valid_to IS NULL OR valid_to >= valid_from),
    CONSTRAINT FK_company_stamps_custodian FOREIGN KEY (custodian_role_id) REFERENCES dbo.roles(id),
    CONSTRAINT FK_company_stamps_created_by FOREIGN KEY (created_by) REFERENCES dbo.users(id)
);

CREATE TABLE dbo.stamp_authorities (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_stamp_authorities PRIMARY KEY,
    company_stamp_id bigint NOT NULL,
    role_id bigint NULL,
    user_id bigint NULL,
    doc_class nvarchar(30) NULL,
    granted_by bigint NOT NULL,
    granted_at datetimeoffset(0) NOT NULL CONSTRAINT DF_stamp_authorities_granted_at DEFAULT SYSUTCDATETIME(),
    valid_from date NOT NULL,
    valid_to date NULL,
    revoked_at datetimeoffset(0) NULL,
    revoke_reason nvarchar(max) NULL,
    row_version rowversion NOT NULL,
    -- A grant is held by exactly one of a role or a named person.
    CONSTRAINT CK_stamp_authorities_holder CHECK ((role_id IS NULL AND user_id IS NOT NULL) OR (role_id IS NOT NULL AND user_id IS NULL)),
    CONSTRAINT CK_stamp_authorities_validity CHECK (valid_to IS NULL OR valid_to >= valid_from),
    CONSTRAINT CK_stamp_authorities_revoke CHECK (revoked_at IS NULL OR revoke_reason IS NOT NULL),
    CONSTRAINT FK_stamp_authorities_stamp FOREIGN KEY (company_stamp_id) REFERENCES dbo.company_stamps(id),
    CONSTRAINT FK_stamp_authorities_role FOREIGN KEY (role_id) REFERENCES dbo.roles(id),
    CONSTRAINT FK_stamp_authorities_user FOREIGN KEY (user_id) REFERENCES dbo.users(id),
    CONSTRAINT FK_stamp_authorities_granted_by FOREIGN KEY (granted_by) REFERENCES dbo.users(id)
);
CREATE INDEX IX_stamp_authorities_lookup ON dbo.stamp_authorities(company_stamp_id, valid_from, valid_to)
    INCLUDE (role_id, user_id, doc_class) WHERE revoked_at IS NULL;

-- ===========================================================================
-- Personal signature specimens
-- ===========================================================================

CREATE TABLE dbo.signature_specimens (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_signature_specimens PRIMARY KEY,
    user_id bigint NOT NULL,
    version int NOT NULL,
    source nvarchar(20) NOT NULL,
    -- Private to the owner. No route serves these keys; the owner sees a
    -- server-rendered preview and nobody else sees anything.
    image_key nvarchar(1000) NOT NULL,
    initials_image_key nvarchar(1000) NULL,
    initials_text nvarchar(10) NULL,
    active_from datetimeoffset(0) NOT NULL CONSTRAINT DF_signature_specimens_active_from DEFAULT SYSUTCDATETIME(),
    active_to datetimeoffset(0) NULL,
    created_at datetimeoffset(0) NOT NULL CONSTRAINT DF_signature_specimens_created_at DEFAULT SYSUTCDATETIME(),
    row_version rowversion NOT NULL,
    CONSTRAINT UQ_signature_specimens_version UNIQUE (user_id, version),
    CONSTRAINT CK_signature_specimens_source CHECK (source IN (N'DRAWN', N'UPLOADED', N'TYPED')),
    CONSTRAINT CK_signature_specimens_version CHECK (version > 0),
    CONSTRAINT FK_signature_specimens_user FOREIGN KEY (user_id) REFERENCES dbo.users(id)
);
-- One active specimen per user. Older versions are retained because signed
-- documents reference the version that was actually used.
CREATE UNIQUE INDEX UX_signature_specimens_active ON dbo.signature_specimens(user_id) WHERE active_to IS NULL;

-- ===========================================================================
-- Flow templates: the only place the eight document classes differ
-- ===========================================================================

CREATE TABLE dbo.sign_flow_templates (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_sign_flow_templates PRIMARY KEY,
    doc_class nvarchar(30) NOT NULL,
    version int NOT NULL,
    ordered bit NOT NULL CONSTRAINT DF_sign_flow_templates_ordered DEFAULT 1,
    no_same_person bit NOT NULL CONSTRAINT DF_sign_flow_templates_same_person DEFAULT 1,
    return_target nvarchar(20) NOT NULL CONSTRAINT DF_sign_flow_templates_return DEFAULT N'OWNER',
    allow_manager_skip bit NOT NULL CONSTRAINT DF_sign_flow_templates_skip DEFAULT 0,
    status nvarchar(20) NOT NULL CONSTRAINT DF_sign_flow_templates_status DEFAULT N'DRAFT',
    -- NULL means the version was seeded by a schema migration. A fresh database
    -- has no users yet when this migration runs, and every runtime version
    -- records the Admin who created it.
    created_by bigint NULL,
    created_at datetimeoffset(0) NOT NULL CONSTRAINT DF_sign_flow_templates_created_at DEFAULT SYSUTCDATETIME(),
    row_version rowversion NOT NULL,
    CONSTRAINT UQ_sign_flow_templates_version UNIQUE (doc_class, version),
    CONSTRAINT CK_sign_flow_templates_class CHECK (doc_class IN (
        N'DRAWING', N'SPEC', N'MANUAL', N'MAT_APPROVE', N'QUOTATION', N'PR_PO', N'UAT_ACCEPT', N'SERVICE_RPT')),
    CONSTRAINT CK_sign_flow_templates_status CHECK (status IN (N'DRAFT', N'ACTIVE', N'RETIRED')),
    CONSTRAINT CK_sign_flow_templates_return CHECK (return_target IN (N'OWNER', N'PREVIOUS_STEP')),
    CONSTRAINT CK_sign_flow_templates_version CHECK (version > 0),
    CONSTRAINT FK_sign_flow_templates_created_by FOREIGN KEY (created_by) REFERENCES dbo.users(id)
);
-- At most one active template per class; a running request pins its own version.
CREATE UNIQUE INDEX UX_sign_flow_templates_active ON dbo.sign_flow_templates(doc_class) WHERE status = N'ACTIVE';

CREATE TABLE dbo.sign_flow_steps (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_sign_flow_steps PRIMARY KEY,
    template_id bigint NOT NULL,
    step_no int NOT NULL,
    block_code nvarchar(30) NOT NULL,
    assignee_kind nvarchar(20) NOT NULL,
    assignee_role_id bigint NULL,
    assignee_user_id bigint NULL,
    required_mark nvarchar(20) NOT NULL,
    company_stamp_id bigint NULL,
    is_optional bit NOT NULL CONSTRAINT DF_sign_flow_steps_optional DEFAULT 0,
    parallel_group int NULL,
    anchor_code nvarchar(50) NOT NULL,
    due_days int NULL,
    -- Value bands (PR/PO). NULL bounds mean the step always applies.
    min_amount decimal(18,2) NULL,
    max_amount decimal(18,2) NULL,
    CONSTRAINT UQ_sign_flow_steps_step UNIQUE (template_id, step_no),
    CONSTRAINT CK_sign_flow_steps_block CHECK (block_code IN (
        N'DRAWN_BY', N'CHECKED_BY', N'APPROVED_BY', N'PREPARED_BY',
        N'REQUESTED_BY', N'TESTED_BY', N'ENGINEER', N'CUSTOMER_APPROVED')),
    CONSTRAINT CK_sign_flow_steps_assignee_kind CHECK (assignee_kind IN (
        N'OWNER', N'ROLE', N'NAMED', N'PROJECT_MANAGER', N'EXTERNAL')),
    CONSTRAINT CK_sign_flow_steps_mark CHECK (required_mark IN (
        N'SIGNATURE', N'SIGNATURE_STAMP', N'INITIAL', N'PAPER')),
    -- An EXTERNAL step is a paper step and has no assignee; every other kind
    -- resolves to a person at request time.
    CONSTRAINT CK_sign_flow_steps_external CHECK (
        (assignee_kind = N'EXTERNAL' AND required_mark = N'PAPER' AND assignee_role_id IS NULL AND assignee_user_id IS NULL)
        OR (assignee_kind <> N'EXTERNAL' AND required_mark <> N'PAPER')),
    CONSTRAINT CK_sign_flow_steps_role CHECK (
        (assignee_kind = N'ROLE' AND assignee_role_id IS NOT NULL)
        OR (assignee_kind <> N'ROLE' AND assignee_role_id IS NULL)),
    CONSTRAINT CK_sign_flow_steps_user CHECK (
        (assignee_kind = N'NAMED' AND assignee_user_id IS NOT NULL)
        OR (assignee_kind <> N'NAMED' AND assignee_user_id IS NULL)),
    -- A stamp-requiring block must name the stamp it requires.
    CONSTRAINT CK_sign_flow_steps_stamp CHECK (
        (required_mark = N'SIGNATURE_STAMP' AND company_stamp_id IS NOT NULL)
        OR (required_mark <> N'SIGNATURE_STAMP' AND company_stamp_id IS NULL)),
    CONSTRAINT CK_sign_flow_steps_step_no CHECK (step_no > 0),
    CONSTRAINT CK_sign_flow_steps_band CHECK (min_amount IS NULL OR max_amount IS NULL OR max_amount >= min_amount),
    CONSTRAINT FK_sign_flow_steps_template FOREIGN KEY (template_id) REFERENCES dbo.sign_flow_templates(id),
    CONSTRAINT FK_sign_flow_steps_role FOREIGN KEY (assignee_role_id) REFERENCES dbo.roles(id),
    CONSTRAINT FK_sign_flow_steps_user FOREIGN KEY (assignee_user_id) REFERENCES dbo.users(id),
    CONSTRAINT FK_sign_flow_steps_stamp FOREIGN KEY (company_stamp_id) REFERENCES dbo.company_stamps(id)
);

-- ===========================================================================
-- The document, its immutable file revisions, and the signature flow instance
-- ===========================================================================

CREATE TABLE dbo.signable_documents (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_signable_documents PRIMARY KEY,
    doc_no nvarchar(40) NOT NULL CONSTRAINT UQ_signable_documents_no UNIQUE,
    doc_class nvarchar(30) NOT NULL,
    title nvarchar(500) NOT NULL,
    project_id bigint NULL,
    estimate_id bigint NULL,
    -- The document's own locale, frozen with the file. Not the signer's UI
    -- language: a quotation to a Japanese customer stays Japanese whoever signs.
    document_locale char(2) NOT NULL CONSTRAINT DF_signable_documents_locale DEFAULT 'en',
    -- Used only to select a value-banded flow step (PR/PO).
    amount decimal(18,2) NULL,
    owner_id bigint NOT NULL,
    current_file_id bigint NULL,
    signing_state nvarchar(30) NOT NULL CONSTRAINT DF_signable_documents_state DEFAULT N'DRAFT',
    superseded_by_id bigint NULL,
    created_by bigint NOT NULL,
    created_at datetimeoffset(0) NOT NULL CONSTRAINT DF_signable_documents_created_at DEFAULT SYSUTCDATETIME(),
    updated_at datetimeoffset(0) NOT NULL CONSTRAINT DF_signable_documents_updated_at DEFAULT SYSUTCDATETIME(),
    row_version rowversion NOT NULL,
    CONSTRAINT CK_signable_documents_class CHECK (doc_class IN (
        N'DRAWING', N'SPEC', N'MANUAL', N'MAT_APPROVE', N'QUOTATION', N'PR_PO', N'UAT_ACCEPT', N'SERVICE_RPT')),
    CONSTRAINT CK_signable_documents_state CHECK (signing_state IN (
        N'NOT_REQUIRED', N'DRAFT', N'PENDING_SIGN', N'PARTIALLY_SIGNED', N'SIGNED',
        N'REJECTED', N'VOIDED', N'SUPERSEDED')),
    CONSTRAINT CK_signable_documents_locale CHECK (document_locale IN ('th', 'en', 'ja')),
    CONSTRAINT CK_signable_documents_amount CHECK (amount IS NULL OR amount >= 0),
    CONSTRAINT FK_signable_documents_project FOREIGN KEY (project_id) REFERENCES dbo.projects(id),
    CONSTRAINT FK_signable_documents_estimate FOREIGN KEY (estimate_id) REFERENCES dbo.estimates(id),
    CONSTRAINT FK_signable_documents_owner FOREIGN KEY (owner_id) REFERENCES dbo.users(id),
    CONSTRAINT FK_signable_documents_created_by FOREIGN KEY (created_by) REFERENCES dbo.users(id),
    CONSTRAINT FK_signable_documents_superseded FOREIGN KEY (superseded_by_id) REFERENCES dbo.signable_documents(id)
);
CREATE INDEX IX_signable_documents_state ON dbo.signable_documents(signing_state, updated_at DESC)
    INCLUDE (doc_class, project_id, owner_id);
CREATE INDEX IX_signable_documents_owner ON dbo.signable_documents(owner_id, signing_state);

CREATE TABLE dbo.document_files (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_document_files PRIMARY KEY,
    document_id bigint NOT NULL,
    revision_label nvarchar(10) NOT NULL,
    source nvarchar(20) NOT NULL,
    project_doc_id bigint NULL,
    storage_key nvarchar(1000) NOT NULL,
    storage_key_hash AS (CONVERT(binary(32), HASHBYTES('SHA2_256', storage_key))) PERSISTED,
    file_name nvarchar(500) NOT NULL,
    content_type nvarchar(200) NOT NULL,
    size_bytes bigint NOT NULL,
    sha256 char(64) NOT NULL,
    page_count int NULL,
    rendered_from_entity nvarchar(50) NULL,
    rendered_from_id bigint NULL,
    frozen_at datetimeoffset(0) NOT NULL CONSTRAINT DF_document_files_frozen_at DEFAULT SYSUTCDATETIME(),
    frozen_by bigint NOT NULL,
    CONSTRAINT UQ_document_files_revision UNIQUE (document_id, revision_label),
    CONSTRAINT CK_document_files_source CHECK (source IN (N'UPLOADED', N'RENDERED')),
    CONSTRAINT CK_document_files_size CHECK (size_bytes > 0),
    CONSTRAINT CK_document_files_sha256 CHECK (LEN(sha256) = 64 AND sha256 NOT LIKE '%[^0-9A-Fa-f]%'),
    CONSTRAINT CK_document_files_rendered CHECK (
        (source = N'RENDERED' AND rendered_from_entity IS NOT NULL AND rendered_from_id IS NOT NULL)
        OR (source = N'UPLOADED' AND rendered_from_entity IS NULL AND rendered_from_id IS NULL)),
    CONSTRAINT FK_document_files_document FOREIGN KEY (document_id) REFERENCES dbo.signable_documents(id),
    CONSTRAINT FK_document_files_project_doc FOREIGN KEY (project_doc_id) REFERENCES dbo.project_docs(id),
    CONSTRAINT FK_document_files_frozen_by FOREIGN KEY (frozen_by) REFERENCES dbo.users(id)
);
-- Deliberately NOT unique. A frozen revision points at the stored bytes rather
-- than copying them, so two revisions of a document — or two documents in
-- different classes over the same uploaded PDF — legitimately share one storage
-- key. The identity of a file record is (document_id, revision_label), which is
-- unique above; the hash is here to look a file up by its content, not to
-- forbid reuse of it.
CREATE INDEX IX_document_files_storage_hash ON dbo.document_files(storage_key_hash);
CREATE INDEX IX_document_files_document ON dbo.document_files(document_id, id DESC);

ALTER TABLE dbo.signable_documents
    ADD CONSTRAINT FK_signable_documents_current_file FOREIGN KEY (current_file_id) REFERENCES dbo.document_files(id);

CREATE TABLE dbo.sign_requests (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_sign_requests PRIMARY KEY,
    document_id bigint NOT NULL,
    document_file_id bigint NOT NULL,
    template_id bigint NOT NULL,
    template_version int NOT NULL,
    initiator_id bigint NOT NULL,
    due_date date NULL,
    state nvarchar(30) NOT NULL CONSTRAINT DF_sign_requests_state DEFAULT N'PENDING_SIGN',
    closed_at datetimeoffset(0) NULL,
    close_reason nvarchar(max) NULL,
    created_at datetimeoffset(0) NOT NULL CONSTRAINT DF_sign_requests_created_at DEFAULT SYSUTCDATETIME(),
    row_version rowversion NOT NULL,
    CONSTRAINT CK_sign_requests_state CHECK (state IN (
        N'PENDING_SIGN', N'PARTIALLY_SIGNED', N'SIGNED', N'REJECTED', N'VOIDED', N'SUPERSEDED')),
    CONSTRAINT FK_sign_requests_document FOREIGN KEY (document_id) REFERENCES dbo.signable_documents(id),
    CONSTRAINT FK_sign_requests_file FOREIGN KEY (document_file_id) REFERENCES dbo.document_files(id),
    CONSTRAINT FK_sign_requests_template FOREIGN KEY (template_id) REFERENCES dbo.sign_flow_templates(id),
    CONSTRAINT FK_sign_requests_initiator FOREIGN KEY (initiator_id) REFERENCES dbo.users(id)
);
-- Exactly one live request per frozen file.
CREATE UNIQUE INDEX UX_sign_requests_live ON dbo.sign_requests(document_file_id)
    WHERE state IN (N'PENDING_SIGN', N'PARTIALLY_SIGNED');
CREATE INDEX IX_sign_requests_document ON dbo.sign_requests(document_id, id DESC);

CREATE TABLE dbo.sign_steps (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_sign_steps PRIMARY KEY,
    request_id bigint NOT NULL,
    step_no int NOT NULL,
    block_code nvarchar(30) NOT NULL,
    required_mark nvarchar(20) NOT NULL,
    company_stamp_id bigint NULL,
    assignee_user_id bigint NULL,
    assignee_role_id bigint NULL,
    delegated_from_id bigint NULL,
    is_optional bit NOT NULL CONSTRAINT DF_sign_steps_optional DEFAULT 0,
    parallel_group int NULL,
    anchor_code nvarchar(50) NOT NULL,
    due_date date NULL,
    state nvarchar(20) NOT NULL CONSTRAINT DF_sign_steps_state DEFAULT N'WAITING',
    decision nvarchar(20) NULL,
    reason nvarchar(max) NULL,
    decided_by bigint NULL,
    decided_at datetimeoffset(0) NULL,
    row_version rowversion NOT NULL,
    CONSTRAINT UQ_sign_steps_step UNIQUE (request_id, step_no),
    CONSTRAINT CK_sign_steps_state CHECK (state IN (
        N'WAITING', N'PENDING', N'SIGNED', N'REJECTED', N'SKIPPED', N'VOIDED')),
    CONSTRAINT CK_sign_steps_decision CHECK (decision IS NULL OR decision IN (
        N'SIGNED', N'RETURNED', N'REJECTED', N'SKIPPED')),
    CONSTRAINT CK_sign_steps_mark CHECK (required_mark IN (
        N'SIGNATURE', N'SIGNATURE_STAMP', N'INITIAL', N'PAPER')),
    CONSTRAINT CK_sign_steps_stamp CHECK (
        (required_mark = N'SIGNATURE_STAMP' AND company_stamp_id IS NOT NULL)
        OR (required_mark <> N'SIGNATURE_STAMP' AND company_stamp_id IS NULL)),
    -- decided_at is server time and there is no route that edits it.
    CONSTRAINT CK_sign_steps_decided CHECK ((decision IS NULL AND decided_at IS NULL AND decided_by IS NULL)
        OR (decision IS NOT NULL AND decided_at IS NOT NULL AND decided_by IS NOT NULL)),
    CONSTRAINT FK_sign_steps_request FOREIGN KEY (request_id) REFERENCES dbo.sign_requests(id),
    CONSTRAINT FK_sign_steps_stamp FOREIGN KEY (company_stamp_id) REFERENCES dbo.company_stamps(id),
    CONSTRAINT FK_sign_steps_assignee FOREIGN KEY (assignee_user_id) REFERENCES dbo.users(id),
    CONSTRAINT FK_sign_steps_role FOREIGN KEY (assignee_role_id) REFERENCES dbo.roles(id),
    CONSTRAINT FK_sign_steps_delegated_from FOREIGN KEY (delegated_from_id) REFERENCES dbo.users(id),
    CONSTRAINT FK_sign_steps_decided_by FOREIGN KEY (decided_by) REFERENCES dbo.users(id)
);
CREATE INDEX IX_sign_steps_assignee ON dbo.sign_steps(assignee_user_id, state) INCLUDE (request_id, due_date)
    WHERE state = N'PENDING';
CREATE INDEX IX_sign_steps_role ON dbo.sign_steps(assignee_role_id, state) INCLUDE (request_id, due_date)
    WHERE state = N'PENDING';

CREATE TABLE dbo.signature_marks (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_signature_marks PRIMARY KEY,
    sign_step_id bigint NOT NULL,
    kind nvarchar(20) NOT NULL,
    specimen_id bigint NULL,
    company_stamp_id bigint NULL,
    stamp_authority_id bigint NULL,
    anchor_code nvarchar(50) NULL,
    page_no int NULL,
    -- Normalised 0..1 so a placement survives A1 -> A3 -> PDF re-export.
    pos_x decimal(9,6) NULL,
    pos_y decimal(9,6) NULL,
    width decimal(9,6) NULL,
    height decimal(9,6) NULL,
    text_value nvarchar(200) NULL,
    scan_project_doc_id bigint NULL,
    rendered_at datetimeoffset(0) NOT NULL CONSTRAINT DF_signature_marks_rendered_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_signature_marks_kind CHECK (kind IN (
        N'SIGNATURE', N'STAMP', N'INITIAL', N'DATE', N'TEXT', N'PAPER')),
    -- A stamp mark always names the stamp and the authority that permitted it.
    CONSTRAINT CK_signature_marks_stamp CHECK (
        (kind = N'STAMP' AND company_stamp_id IS NOT NULL AND stamp_authority_id IS NOT NULL)
        OR (kind <> N'STAMP' AND company_stamp_id IS NULL AND stamp_authority_id IS NULL)),
    CONSTRAINT CK_signature_marks_specimen CHECK (kind NOT IN (N'SIGNATURE', N'INITIAL') OR specimen_id IS NOT NULL),
    CONSTRAINT CK_signature_marks_paper CHECK (kind <> N'PAPER' OR scan_project_doc_id IS NOT NULL),
    CONSTRAINT CK_signature_marks_position CHECK (anchor_code IS NOT NULL OR (page_no IS NOT NULL AND pos_x IS NOT NULL AND pos_y IS NOT NULL)),
    CONSTRAINT CK_signature_marks_bounds CHECK (
        (pos_x IS NULL OR (pos_x BETWEEN 0 AND 1)) AND (pos_y IS NULL OR (pos_y BETWEEN 0 AND 1))
        AND (width IS NULL OR (width BETWEEN 0 AND 1)) AND (height IS NULL OR (height BETWEEN 0 AND 1))),
    CONSTRAINT FK_signature_marks_step FOREIGN KEY (sign_step_id) REFERENCES dbo.sign_steps(id),
    CONSTRAINT FK_signature_marks_specimen FOREIGN KEY (specimen_id) REFERENCES dbo.signature_specimens(id),
    CONSTRAINT FK_signature_marks_stamp FOREIGN KEY (company_stamp_id) REFERENCES dbo.company_stamps(id),
    CONSTRAINT FK_signature_marks_authority FOREIGN KEY (stamp_authority_id) REFERENCES dbo.stamp_authorities(id),
    CONSTRAINT FK_signature_marks_scan FOREIGN KEY (scan_project_doc_id) REFERENCES dbo.project_docs(id)
);
CREATE INDEX IX_signature_marks_step ON dbo.signature_marks(sign_step_id, id);

CREATE TABLE dbo.signed_documents (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_signed_documents PRIMARY KEY,
    request_id bigint NOT NULL CONSTRAINT UQ_signed_documents_request UNIQUE,
    storage_key nvarchar(1000) NOT NULL,
    storage_key_hash AS (CONVERT(binary(32), HASHBYTES('SHA2_256', storage_key))) PERSISTED,
    file_name nvarchar(500) NOT NULL,
    content_type nvarchar(200) NOT NULL CONSTRAINT DF_signed_documents_content_type DEFAULT N'application/pdf',
    size_bytes bigint NOT NULL,
    sha256 char(64) NOT NULL,
    verify_code nvarchar(24) NOT NULL CONSTRAINT UQ_signed_documents_verify_code UNIQUE,
    page_count int NULL,
    produced_at datetimeoffset(0) NOT NULL CONSTRAINT DF_signed_documents_produced_at DEFAULT SYSUTCDATETIME(),
    produced_by bigint NOT NULL,
    CONSTRAINT UQ_signed_documents_storage_hash UNIQUE (storage_key_hash),
    CONSTRAINT CK_signed_documents_size CHECK (size_bytes > 0),
    CONSTRAINT CK_signed_documents_sha256 CHECK (LEN(sha256) = 64 AND sha256 NOT LIKE '%[^0-9A-Fa-f]%'),
    CONSTRAINT FK_signed_documents_request FOREIGN KEY (request_id) REFERENCES dbo.sign_requests(id),
    CONSTRAINT FK_signed_documents_produced_by FOREIGN KEY (produced_by) REFERENCES dbo.users(id)
);

CREATE TABLE dbo.sign_events (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_sign_events PRIMARY KEY,
    request_id bigint NOT NULL,
    seq int NOT NULL,
    sign_step_id bigint NULL,
    actor_id bigint NULL,
    action nvarchar(40) NOT NULL,
    detail nvarchar(max) NULL,
    ip nvarchar(64) NULL,
    user_agent nvarchar(400) NULL,
    -- How the actor's presence was evidenced at the moment of signing. The
    -- application holds no password (see the security invariants in README):
    -- assurance is a fresh interactive sign-in, recorded here as the identity
    -- provider's auth_time. Team-test sessions are labelled as such and are
    -- never available in Production.
    auth_evidence nvarchar(40) NULL,
    auth_at datetimeoffset(0) NULL,
    payload_hash char(64) NOT NULL,
    prev_hash char(64) NULL,
    hash char(64) NOT NULL,
    occurred_at datetimeoffset(0) NOT NULL CONSTRAINT DF_sign_events_occurred_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_sign_events_seq UNIQUE (request_id, seq),
    CONSTRAINT CK_sign_events_seq CHECK (seq > 0),
    CONSTRAINT CK_sign_events_detail CHECK (detail IS NULL OR ISJSON(detail) = 1),
    CONSTRAINT CK_sign_events_payload_hash CHECK (LEN(payload_hash) = 64 AND payload_hash NOT LIKE '%[^0-9A-Fa-f]%'),
    CONSTRAINT CK_sign_events_hash CHECK (LEN(hash) = 64 AND hash NOT LIKE '%[^0-9A-Fa-f]%'),
    CONSTRAINT CK_sign_events_prev_hash CHECK (prev_hash IS NULL OR (LEN(prev_hash) = 64 AND prev_hash NOT LIKE '%[^0-9A-Fa-f]%')),
    CONSTRAINT CK_sign_events_first CHECK ((seq = 1 AND prev_hash IS NULL) OR (seq > 1 AND prev_hash IS NOT NULL)),
    CONSTRAINT FK_sign_events_request FOREIGN KEY (request_id) REFERENCES dbo.sign_requests(id),
    CONSTRAINT FK_sign_events_step FOREIGN KEY (sign_step_id) REFERENCES dbo.sign_steps(id),
    CONSTRAINT FK_sign_events_actor FOREIGN KEY (actor_id) REFERENCES dbo.users(id)
);
CREATE INDEX IX_sign_events_request ON dbo.sign_events(request_id, seq);
GO

-- ===========================================================================
-- Immutability and integrity triggers
-- ===========================================================================

-- A signature points at one exact byte sequence. If the row could change, the
-- signature would point at nothing. A replacement upload is a new revision.
CREATE OR ALTER TRIGGER dbo.trg_document_files_immutable
ON dbo.document_files
INSTEAD OF UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    THROW 51210, 'A frozen document file cannot be changed or deleted. Upload a new revision instead.', 1;
END;
GO

CREATE OR ALTER TRIGGER dbo.trg_signature_marks_append_only
ON dbo.signature_marks
INSTEAD OF UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    THROW 51211, 'Signature marks are append-only. Void the request instead.', 1;
END;
GO

CREATE OR ALTER TRIGGER dbo.trg_signed_documents_append_only
ON dbo.signed_documents
INSTEAD OF UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    THROW 51212, 'A signed document output is immutable.', 1;
END;
GO

CREATE OR ALTER TRIGGER dbo.trg_sign_events_append_only
ON dbo.sign_events
INSTEAD OF UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    THROW 51213, 'The signature event chain is append-only.', 1;
END;
GO

CREATE OR ALTER TRIGGER dbo.trg_signature_specimens_no_reuse
ON dbo.signature_specimens
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    -- Replacing a specimen must not rewrite the image a past signature used.
    IF EXISTS (
        SELECT 1
        FROM inserted i
        INNER JOIN deleted d ON d.id = i.id
        WHERE i.image_key <> d.image_key
           OR i.user_id <> d.user_id
           OR i.version <> d.version
           OR i.source <> d.source
           OR ISNULL(i.initials_image_key, N'') <> ISNULL(d.initials_image_key, N'')
    )
        THROW 51214, 'A signature specimen version is immutable; create a new version instead.', 1;

    -- Closing a version is the only permitted update, and it never reopens.
    IF EXISTS (
        SELECT 1
        FROM inserted i
        INNER JOIN deleted d ON d.id = i.id
        WHERE d.active_to IS NOT NULL AND (i.active_to IS NULL OR i.active_to <> d.active_to)
    )
        THROW 51215, 'A retired signature specimen cannot be reactivated.', 1;
END;
GO

-- Admin configures the system; the business signs. Without this separation the
-- principal who can grant stamp authority is also the principal who can use it.
CREATE OR ALTER TRIGGER dbo.trg_stamp_authorities_exclude_admin
ON dbo.stamp_authorities
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (
        SELECT 1
        FROM inserted i
        INNER JOIN dbo.roles r ON r.id = i.role_id
        WHERE r.code = N'Admin'
    ) OR EXISTS (
        SELECT 1
        FROM inserted i
        INNER JOIN dbo.users u ON u.id = i.user_id
        INNER JOIN dbo.roles r ON r.id = u.role_id
        WHERE r.code = N'Admin'
    )
        THROW 51216, 'The Admin role cannot hold company stamp authority.', 1;

    -- A grant must be inside the stamp's own validity window and scope.
    IF EXISTS (
        SELECT 1
        FROM inserted i
        INNER JOIN dbo.company_stamps s ON s.id = i.company_stamp_id
        WHERE i.valid_from < s.valid_from
           OR (s.valid_to IS NOT NULL AND (i.valid_to IS NULL OR i.valid_to > s.valid_to))
    )
        THROW 51217, 'A stamp authority cannot extend beyond the validity of its stamp.', 1;

    IF EXISTS (
        SELECT 1
        FROM inserted i
        INNER JOIN dbo.company_stamps s ON s.id = i.company_stamp_id
        WHERE i.doc_class IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM OPENJSON(s.scope_json) scope WHERE scope.value = i.doc_class)
    )
        THROW 51218, 'A stamp authority cannot name a document class outside the stamp scope.', 1;
END;
GO

-- The check that makes a second signature mean something.
CREATE OR ALTER TRIGGER dbo.trg_sign_steps_integrity
ON dbo.sign_steps
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    -- A closed step never reopens, and its decision never changes.
    IF EXISTS (
        SELECT 1
        FROM inserted i
        INNER JOIN deleted d ON d.id = i.id
        WHERE d.state IN (N'SIGNED', N'REJECTED', N'SKIPPED')
          AND (i.state <> d.state OR ISNULL(i.decision, N'') <> ISNULL(d.decision, N'')
               OR ISNULL(i.decided_by, 0) <> ISNULL(d.decided_by, 0))
          AND i.state <> N'VOIDED'
    )
        THROW 51219, 'A closed signature step cannot be reopened or re-decided.', 1;

    -- no_same_person: the signer of a step must not already have signed
    -- another step on the same request.
    IF EXISTS (
        SELECT 1
        FROM inserted i
        INNER JOIN dbo.sign_requests rq ON rq.id = i.request_id
        INNER JOIN dbo.sign_flow_templates t ON t.id = rq.template_id
        INNER JOIN dbo.sign_steps other
                ON other.request_id = i.request_id
               AND other.id <> i.id
               AND other.state = N'SIGNED'
               AND other.decided_by = i.decided_by
        WHERE t.no_same_person = 1
          AND i.state = N'SIGNED'
          AND i.decided_by IS NOT NULL
    )
        THROW 51220, 'This signature flow does not allow one person to fill two steps.', 1;

    -- Ordered flows: a step cannot close while a lower step is still open,
    -- unless both steps share a parallel group.
    IF EXISTS (
        SELECT 1
        FROM inserted i
        INNER JOIN dbo.sign_requests rq ON rq.id = i.request_id
        INNER JOIN dbo.sign_flow_templates t ON t.id = rq.template_id
        INNER JOIN dbo.sign_steps earlier
                ON earlier.request_id = i.request_id
               AND earlier.step_no < i.step_no
               AND earlier.state IN (N'WAITING', N'PENDING')
        WHERE t.ordered = 1
          AND i.state = N'SIGNED'
          AND (i.parallel_group IS NULL OR earlier.parallel_group IS NULL
               OR i.parallel_group <> earlier.parallel_group)
    )
        THROW 51221, 'An ordered signature flow requires earlier steps to close first.', 1;

    -- A step requiring a stamp is not closed by a signature alone.
    IF EXISTS (
        SELECT 1
        FROM inserted i
        WHERE i.state = N'SIGNED'
          AND i.required_mark = N'SIGNATURE_STAMP'
          AND NOT EXISTS (SELECT 1 FROM dbo.signature_marks m WHERE m.sign_step_id = i.id AND m.kind = N'STAMP')
    )
        THROW 51222, 'This block requires the company stamp; a signature alone does not close it.', 1;

    -- A signed step must carry the mark its block requires.
    IF EXISTS (
        SELECT 1
        FROM inserted i
        WHERE i.state = N'SIGNED'
          AND i.required_mark IN (N'SIGNATURE', N'SIGNATURE_STAMP')
          AND NOT EXISTS (SELECT 1 FROM dbo.signature_marks m WHERE m.sign_step_id = i.id AND m.kind = N'SIGNATURE')
    )
        THROW 51223, 'A signed step must carry a signature mark.', 1;

    IF EXISTS (
        SELECT 1
        FROM inserted i
        WHERE i.state = N'SIGNED'
          AND i.required_mark = N'INITIAL'
          AND NOT EXISTS (SELECT 1 FROM dbo.signature_marks m WHERE m.sign_step_id = i.id AND m.kind = N'INITIAL')
    )
        THROW 51224, 'A signed initial block must carry an initial mark.', 1;

    IF EXISTS (
        SELECT 1
        FROM inserted i
        WHERE i.state = N'SIGNED'
          AND i.required_mark = N'PAPER'
          AND NOT EXISTS (SELECT 1 FROM dbo.signature_marks m WHERE m.sign_step_id = i.id AND m.kind = N'PAPER')
    )
        THROW 51225, 'A paper step closes only when the signed scan is attached.', 1;
END;
GO

-- The single most damaging thing to get wrong: a mark that survives the file it
-- was placed on. A frozen file can only gain a signed step while its request is
-- live, and a superseded request can never gain another one.
CREATE OR ALTER TRIGGER dbo.trg_sign_requests_state
ON dbo.sign_requests
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (
        SELECT 1
        FROM inserted i
        INNER JOIN deleted d ON d.id = i.id
        WHERE d.state IN (N'SIGNED', N'REJECTED', N'VOIDED', N'SUPERSEDED')
          AND i.state <> d.state
    )
        THROW 51226, 'A closed signature request cannot change state.', 1;

    IF EXISTS (
        SELECT 1
        FROM inserted i
        INNER JOIN deleted d ON d.id = i.id
        WHERE i.document_file_id <> d.document_file_id OR i.template_id <> d.template_id
    )
        THROW 51227, 'A signature request cannot be repointed at another file or template.', 1;

    -- SIGNED means every mandatory step closed as SIGNED.
    IF EXISTS (
        SELECT 1
        FROM inserted i
        WHERE i.state = N'SIGNED'
          AND EXISTS (
              SELECT 1 FROM dbo.sign_steps s
              WHERE s.request_id = i.id AND s.is_optional = 0 AND s.state <> N'SIGNED')
    )
        THROW 51228, 'A signature request is complete only when every mandatory step is signed.', 1;
END;
GO

-- ===========================================================================
-- Permissions
-- ===========================================================================

INSERT INTO dbo.permissions(code, description)
VALUES
    (N'signing.read', N'Read signable documents, signature status and the event chain'),
    (N'signing.request', N'Freeze a document revision and start a signature request'),
    (N'signing.sign', N'Sign, return or delegate a signature step assigned to me'),
    (N'signing.reject', N'Reject a signature request outright, skip a step, or void a signed document'),
    (N'signing.stamp.grant', N'Grant or revoke company stamp authority'),
    (N'signing.master', N'Maintain company stamps and signature flow templates');

-- Deliberately not the migration-004 pattern of "Admin receives every
-- permission". Admin holds signing.read and signing.master only: it configures
-- stamps and flows but can neither sign nor grant itself authority (DSN-TC-005
-- A-3). dbo.trg_stamp_authorities_exclude_admin enforces the same rule in data.
;WITH grants(role_code, permission_code) AS (
    SELECT N'Viewer', code FROM dbo.permissions WHERE code IN (N'signing.read')
    UNION ALL SELECT N'Sales Engineer', code FROM dbo.permissions WHERE code IN (N'signing.read')
    UNION ALL SELECT N'Warehouse', code FROM dbo.permissions WHERE code IN (N'signing.read')
    UNION ALL SELECT N'Engineer', code FROM dbo.permissions WHERE code IN (
        N'signing.read', N'signing.request', N'signing.sign')
    UNION ALL SELECT N'Purchasing', code FROM dbo.permissions WHERE code IN (
        N'signing.read', N'signing.request', N'signing.sign')
    UNION ALL SELECT N'Inventory Controller', code FROM dbo.permissions WHERE code IN (
        N'signing.read', N'signing.sign')
    UNION ALL SELECT N'Project Manager', code FROM dbo.permissions WHERE code IN (
        N'signing.read', N'signing.request', N'signing.sign')
    UNION ALL SELECT N'Engineering Manager', code FROM dbo.permissions WHERE code IN (
        N'signing.read', N'signing.request', N'signing.sign', N'signing.reject', N'signing.stamp.grant')
    UNION ALL SELECT N'Admin', code FROM dbo.permissions WHERE code IN (
        N'signing.read', N'signing.master')
)
INSERT INTO dbo.role_permissions(role_id, permission_id)
SELECT DISTINCT r.id, p.id
FROM grants g
INNER JOIN dbo.roles r ON r.code = g.role_code
INNER JOIN dbo.permissions p ON p.code = g.permission_code;

-- ===========================================================================
-- Seed flow templates
--
-- QUOTATION and PR/PO are ACTIVE: both are generated from records the system
-- already owns, so they carry no upload-pipeline risk while the core is proved.
-- The remaining six are DRAFT until the uploaded pipeline (anchors, placement)
-- and the paper-step scan flow are built. Steps that would require a company
-- stamp are seeded as signature-only because no stamp image exists yet; the
-- stamp is attached to the block when dbo.company_stamps is populated, which is
-- a new template version rather than an edit.
-- ===========================================================================

DECLARE @engineering_manager bigint = (SELECT id FROM dbo.roles WHERE code = N'Engineering Manager');
DECLARE @project_manager bigint = (SELECT id FROM dbo.roles WHERE code = N'Project Manager');

IF @engineering_manager IS NULL OR @project_manager IS NULL
    THROW 51229, 'Migration 004 role seed is missing; signature flow templates cannot be seeded.', 1;

INSERT INTO dbo.sign_flow_templates(doc_class, version, ordered, no_same_person, return_target, allow_manager_skip, status, created_by)
VALUES
    (N'QUOTATION',   1, 1, 1, N'OWNER', 0, N'ACTIVE', NULL),
    (N'PR_PO',       1, 1, 1, N'OWNER', 0, N'ACTIVE', NULL),
    (N'DRAWING',     1, 1, 1, N'OWNER', 0, N'DRAFT',  NULL),
    (N'SPEC',        1, 1, 1, N'OWNER', 0, N'DRAFT',  NULL),
    (N'MANUAL',      1, 1, 0, N'OWNER', 0, N'DRAFT',  NULL),
    (N'MAT_APPROVE', 1, 1, 0, N'OWNER', 0, N'DRAFT',  NULL),
    (N'UAT_ACCEPT',  1, 1, 0, N'OWNER', 0, N'DRAFT',  NULL),
    (N'SERVICE_RPT', 1, 1, 0, N'OWNER', 0, N'DRAFT',  NULL);

;WITH template_ids AS (
    SELECT doc_class, id FROM dbo.sign_flow_templates WHERE version = 1
)
INSERT INTO dbo.sign_flow_steps(
    template_id, step_no, block_code, assignee_kind, assignee_role_id, assignee_user_id,
    required_mark, company_stamp_id, is_optional, parallel_group, anchor_code, due_days, min_amount, max_amount)
SELECT t.id, s.step_no, s.block_code, s.assignee_kind,
       CASE s.assignee_role WHEN N'Engineering Manager' THEN @engineering_manager
                            WHEN N'Project Manager' THEN @project_manager END,
       NULL, s.required_mark, NULL, s.is_optional, NULL, s.anchor_code, s.due_days, s.min_amount, s.max_amount
FROM template_ids t
INNER JOIN (VALUES
    -- QUOTATION: step 2 is merged with the estimate approval action.
    (N'QUOTATION',   1, N'PREPARED_BY',      N'OWNER',    CONVERT(nvarchar(50), NULL),   N'SIGNATURE', 0, N'sig:PREPARED_BY',  CONVERT(int, NULL), CONVERT(decimal(18,2), NULL), CONVERT(decimal(18,2), NULL)),
    (N'QUOTATION',   2, N'APPROVED_BY',      N'ROLE',     N'Engineering Manager',        N'SIGNATURE', 0, N'sig:APPROVED_BY',  2,    NULL,        NULL),
    -- PR/PO: value-banded. Thresholds are configuration, not code (RDL-038).
    (N'PR_PO',       1, N'REQUESTED_BY',     N'OWNER',    NULL,                          N'SIGNATURE', 0, N'sig:PREPARED_BY',  NULL, NULL,        NULL),
    (N'PR_PO',       2, N'APPROVED_BY',      N'ROLE',     N'Project Manager',            N'SIGNATURE', 0, N'sig:APPROVED_BY',  2,    NULL,        100000.00),
    (N'PR_PO',       3, N'APPROVED_BY',      N'ROLE',     N'Engineering Manager',        N'SIGNATURE', 0, N'sig:APPROVED_BY',  2,    100000.01,   NULL),
    -- DRAWING: the four-block title block of DSN-TC-005 SG-08.
    (N'DRAWING',     1, N'DRAWN_BY',         N'OWNER',    NULL,                          N'INITIAL',   0, N'sig:DRAWN_BY',     NULL, NULL,        NULL),
    (N'DRAWING',     2, N'CHECKED_BY',       N'ROLE',     N'Project Manager',            N'SIGNATURE', 0, N'sig:CHECKED_BY',   2,    NULL,        NULL),
    (N'DRAWING',     3, N'APPROVED_BY',      N'ROLE',     N'Engineering Manager',        N'SIGNATURE', 0, N'sig:APPROVED_BY',  2,    NULL,        NULL),
    (N'DRAWING',     4, N'CUSTOMER_APPROVED', N'EXTERNAL', NULL,                         N'PAPER',     1, N'sig:CUST_APPR',    NULL, NULL,        NULL),
    (N'SPEC',        1, N'PREPARED_BY',      N'OWNER',    NULL,                          N'SIGNATURE', 0, N'sig:PREPARED_BY',  NULL, NULL,        NULL),
    (N'SPEC',        2, N'CHECKED_BY',       N'ROLE',     N'Project Manager',            N'SIGNATURE', 0, N'sig:CHECKED_BY',   3,    NULL,        NULL),
    (N'SPEC',        3, N'APPROVED_BY',      N'ROLE',     N'Engineering Manager',        N'SIGNATURE', 0, N'sig:APPROVED_BY',  3,    NULL,        NULL),
    (N'MANUAL',      1, N'PREPARED_BY',      N'OWNER',    NULL,                          N'SIGNATURE', 0, N'sig:PREPARED_BY',  NULL, NULL,        NULL),
    (N'MANUAL',      2, N'APPROVED_BY',      N'PROJECT_MANAGER', NULL,                   N'SIGNATURE', 0, N'sig:APPROVED_BY',  5,    NULL,        NULL),
    (N'MAT_APPROVE', 1, N'PREPARED_BY',      N'OWNER',    NULL,                          N'SIGNATURE', 0, N'sig:PREPARED_BY',  NULL, NULL,        NULL),
    (N'MAT_APPROVE', 2, N'APPROVED_BY',      N'ROLE',     N'Engineering Manager',        N'SIGNATURE', 0, N'sig:APPROVED_BY',  2,    NULL,        NULL),
    (N'MAT_APPROVE', 3, N'CUSTOMER_APPROVED', N'EXTERNAL', NULL,                         N'PAPER',     1, N'sig:CUST_APPR',    NULL, NULL,        NULL),
    (N'UAT_ACCEPT',  1, N'TESTED_BY',        N'OWNER',    NULL,                          N'SIGNATURE', 0, N'sig:PREPARED_BY',  NULL, NULL,        NULL),
    (N'UAT_ACCEPT',  2, N'APPROVED_BY',      N'PROJECT_MANAGER', NULL,                   N'SIGNATURE', 0, N'sig:APPROVED_BY',  3,    NULL,        NULL),
    -- Mandatory: an acceptance without the customer block is not an acceptance.
    (N'UAT_ACCEPT',  3, N'CUSTOMER_APPROVED', N'EXTERNAL', NULL,                         N'PAPER',     0, N'sig:CUST_APPR',    NULL, NULL,        NULL),
    (N'SERVICE_RPT', 1, N'ENGINEER',         N'OWNER',    NULL,                          N'SIGNATURE', 0, N'sig:PREPARED_BY',  NULL, NULL,        NULL),
    (N'SERVICE_RPT', 2, N'APPROVED_BY',      N'ROLE',     N'Project Manager',            N'SIGNATURE', 0, N'sig:APPROVED_BY',  1,    NULL,        NULL),
    (N'SERVICE_RPT', 3, N'CUSTOMER_APPROVED', N'EXTERNAL', NULL,                         N'PAPER',     1, N'sig:CUST_APPR',    NULL, NULL,        NULL)
) AS s(doc_class, step_no, block_code, assignee_kind, assignee_role, required_mark, is_optional, anchor_code, due_days, min_amount, max_amount)
    ON s.doc_class = t.doc_class;

INSERT INTO dbo.schema_versions(version, name)
VALUES (18, N'Document signing, signature specimens and company stamp authority');

COMMIT TRANSACTION;
GO
