SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET ARITHABORT ON;
SET NUMERIC_ROUNDABORT OFF;
GO

IF OBJECT_ID(N'dbo.schema_versions', N'U') IS NULL
    THROW 51003, 'Migration 001 must be applied before migration 002.', 1;

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 2)
    THROW 51000, 'Migration 002 has already been applied.', 1;

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 1)
    THROW 51003, 'Migration 001 must be applied before migration 002.', 1;

BEGIN TRY
BEGIN TRANSACTION;

DECLARE @migration_lock_result int;
EXEC @migration_lock_result = sys.sp_getapplock
    @Resource = N'IoTTeamCenter.SchemaMigration',
    @LockMode = N'Exclusive',
    @LockOwner = N'Transaction',
    @LockTimeout = 60000;

IF @migration_lock_result < 0
    THROW 51010, 'Could not acquire the schema migration lock.', 1;

-- Re-check while holding the transaction-owned lock to close the concurrent runner race.
IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 2)
    THROW 51000, 'Migration 002 has already been applied.', 1;

CREATE TABLE dbo.mat_items (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_mat_items PRIMARY KEY,
    item_code nvarchar(100) NOT NULL CONSTRAINT UQ_mat_items_code UNIQUE,
    part_no nvarchar(200) NOT NULL CONSTRAINT DF_mat_items_part_no DEFAULT N'',
    description nvarchar(500) NOT NULL,
    brand nvarchar(100) NOT NULL CONSTRAINT DF_mat_items_brand DEFAULT N'',
    unit nvarchar(50) NOT NULL,
    location nvarchar(100) NOT NULL CONSTRAINT DF_mat_items_location DEFAULT N'',
    reorder_level decimal(19,4) NOT NULL CONSTRAINT DF_mat_items_reorder DEFAULT 0,
    avg_unit_cost decimal(19,4) NOT NULL CONSTRAINT DF_mat_items_avg_cost DEFAULT 0,
    lead_time_days int NOT NULL CONSTRAINT DF_mat_items_lead DEFAULT 0,
    preferred_supplier_id bigint NULL,
    is_active bit NOT NULL CONSTRAINT DF_mat_items_is_active DEFAULT 1,
    created_by bigint NOT NULL,
    updated_by bigint NOT NULL,
    created_at datetimeoffset(0) NOT NULL CONSTRAINT DF_mat_items_created_at DEFAULT SYSUTCDATETIME(),
    updated_at datetimeoffset(0) NOT NULL CONSTRAINT DF_mat_items_updated_at DEFAULT SYSUTCDATETIME(),
    deleted_at datetimeoffset(0) NULL,
    row_version rowversion NOT NULL,
    CONSTRAINT CK_mat_items_values CHECK (reorder_level >= 0 AND avg_unit_cost >= 0 AND lead_time_days >= 0),
    CONSTRAINT FK_mat_items_supplier FOREIGN KEY (preferred_supplier_id) REFERENCES dbo.suppliers(id),
    CONSTRAINT FK_mat_items_created_by FOREIGN KEY (created_by) REFERENCES dbo.users(id),
    CONSTRAINT FK_mat_items_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users(id)
);
CREATE INDEX IX_mat_items_supplier_active ON dbo.mat_items(preferred_supplier_id, is_active) INCLUDE (item_code, description, unit) WHERE deleted_at IS NULL;

CREATE TABLE dbo.boms (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_boms PRIMARY KEY,
    bom_no nvarchar(30) NOT NULL,
    revision int NOT NULL CONSTRAINT DF_boms_revision DEFAULT 0,
    project_id bigint NOT NULL,
    estimate_id bigint NOT NULL,
    status nvarchar(30) NOT NULL CONSTRAINT DF_boms_status DEFAULT N'Draft',
    released_at datetimeoffset(0) NULL,
    released_by bigint NULL,
    created_by bigint NOT NULL,
    updated_by bigint NOT NULL,
    created_at datetimeoffset(0) NOT NULL CONSTRAINT DF_boms_created_at DEFAULT SYSUTCDATETIME(),
    updated_at datetimeoffset(0) NOT NULL CONSTRAINT DF_boms_updated_at DEFAULT SYSUTCDATETIME(),
    deleted_at datetimeoffset(0) NULL,
    row_version rowversion NOT NULL,
    CONSTRAINT UQ_boms UNIQUE (bom_no, revision),
    CONSTRAINT UQ_boms_id_project UNIQUE (id, project_id),
    CONSTRAINT CK_boms_status CHECK (status IN (N'Draft', N'Released', N'Superseded')),
    CONSTRAINT FK_boms_project FOREIGN KEY (project_id) REFERENCES dbo.projects(id),
    CONSTRAINT FK_boms_estimate FOREIGN KEY (estimate_id) REFERENCES dbo.estimates(id),
    CONSTRAINT FK_boms_released_by FOREIGN KEY (released_by) REFERENCES dbo.users(id),
    CONSTRAINT FK_boms_created_by FOREIGN KEY (created_by) REFERENCES dbo.users(id),
    CONSTRAINT FK_boms_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users(id)
);

CREATE TABLE dbo.bom_lines (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_bom_lines PRIMARY KEY,
    bom_id bigint NOT NULL,
    parent_id bigint NULL,
    section_code nvarchar(30) NOT NULL,
    sort_order int NOT NULL,
    item_id bigint NULL,
    estimate_line_id bigint NULL,
    description nvarchar(500) NOT NULL,
    qty_required decimal(19,4) NOT NULL,
    unit nvarchar(50) NOT NULL,
    est_unit_cost decimal(19,4) NOT NULL CONSTRAINT DF_bom_lines_est_cost DEFAULT 0,
    customer_supplied_qty decimal(19,4) NOT NULL CONSTRAINT DF_bom_lines_customer_qty DEFAULT 0,
    owner_id bigint NOT NULL,
    non_stock bit NOT NULL CONSTRAINT DF_bom_lines_non_stock DEFAULT 0,
    created_by bigint NOT NULL,
    updated_by bigint NOT NULL,
    deleted_at datetimeoffset(0) NULL,
    row_version rowversion NOT NULL,
    CONSTRAINT UQ_bom_lines_id_bom UNIQUE (id, bom_id),
    CONSTRAINT CK_bom_lines_qty CHECK (qty_required > 0 AND customer_supplied_qty >= 0 AND customer_supplied_qty <= qty_required),
    CONSTRAINT CK_bom_lines_cost CHECK (est_unit_cost >= 0),
    CONSTRAINT FK_bom_lines_bom FOREIGN KEY (bom_id) REFERENCES dbo.boms(id),
    CONSTRAINT FK_bom_lines_parent FOREIGN KEY (parent_id, bom_id) REFERENCES dbo.bom_lines(id, bom_id),
    CONSTRAINT FK_bom_lines_item FOREIGN KEY (item_id) REFERENCES dbo.mat_items(id),
    CONSTRAINT FK_bom_lines_estimate_line FOREIGN KEY (estimate_line_id) REFERENCES dbo.cost_items(id),
    CONSTRAINT FK_bom_lines_owner FOREIGN KEY (owner_id) REFERENCES dbo.users(id),
    CONSTRAINT FK_bom_lines_created_by FOREIGN KEY (created_by) REFERENCES dbo.users(id),
    CONSTRAINT FK_bom_lines_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users(id)
);
CREATE INDEX IX_bom_lines_bom ON dbo.bom_lines(bom_id, sort_order) WHERE deleted_at IS NULL;
CREATE INDEX IX_bom_lines_parent ON dbo.bom_lines(bom_id, parent_id, sort_order) WHERE deleted_at IS NULL;
CREATE INDEX IX_boms_project_status ON dbo.boms(project_id, status) INCLUDE (estimate_id, revision) WHERE deleted_at IS NULL;
CREATE INDEX IX_boms_estimate ON dbo.boms(estimate_id) INCLUDE (project_id, status) WHERE deleted_at IS NULL;

CREATE TABLE dbo.reservations (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_reservations PRIMARY KEY,
    item_id bigint NOT NULL,
    project_id bigint NOT NULL,
    bom_line_id bigint NOT NULL,
    qty decimal(19,4) NOT NULL,
    required_date date NULL,
    owner_id bigint NOT NULL,
    status nvarchar(30) NOT NULL CONSTRAINT DF_reservations_status DEFAULT N'Active',
    created_at datetimeoffset(0) NOT NULL CONSTRAINT DF_reservations_created_at DEFAULT SYSUTCDATETIME(),
    updated_at datetimeoffset(0) NOT NULL CONSTRAINT DF_reservations_updated_at DEFAULT SYSUTCDATETIME(),
    row_version rowversion NOT NULL,
    CONSTRAINT CK_reservations_qty CHECK (qty > 0),
    CONSTRAINT CK_reservations_status CHECK (status IN (N'Active', N'Consumed', N'Released')),
    CONSTRAINT FK_reservations_item FOREIGN KEY (item_id) REFERENCES dbo.mat_items(id),
    CONSTRAINT FK_reservations_project FOREIGN KEY (project_id) REFERENCES dbo.projects(id),
    CONSTRAINT FK_reservations_bom_line FOREIGN KEY (bom_line_id) REFERENCES dbo.bom_lines(id),
    CONSTRAINT FK_reservations_owner FOREIGN KEY (owner_id) REFERENCES dbo.users(id)
);
CREATE INDEX IX_reservations_item_status ON dbo.reservations(item_id, status) INCLUDE (qty, project_id, bom_line_id);
CREATE INDEX IX_reservations_project_status ON dbo.reservations(project_id, status) INCLUDE (item_id, qty, required_date);

CREATE TABLE dbo.mat_prs (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_mat_prs PRIMARY KEY,
    pr_no nvarchar(30) NOT NULL CONSTRAINT UQ_mat_prs_no UNIQUE,
    project_id bigint NOT NULL,
    bom_id bigint NOT NULL,
    requested_by bigint NOT NULL,
    priority nvarchar(30) NOT NULL,
    required_date date NOT NULL,
    purpose nvarchar(max) NULL,
    status nvarchar(30) NOT NULL CONSTRAINT DF_mat_prs_status DEFAULT N'Draft',
    submitted_at datetimeoffset(0) NULL,
    created_by bigint NOT NULL,
    updated_by bigint NOT NULL,
    created_at datetimeoffset(0) NOT NULL CONSTRAINT DF_mat_prs_created_at DEFAULT SYSUTCDATETIME(),
    updated_at datetimeoffset(0) NOT NULL CONSTRAINT DF_mat_prs_updated_at DEFAULT SYSUTCDATETIME(),
    deleted_at datetimeoffset(0) NULL,
    row_version rowversion NOT NULL,
    CONSTRAINT UQ_mat_prs_id_bom UNIQUE (id, bom_id),
    CONSTRAINT CK_mat_prs_status CHECK (status IN (N'Draft', N'In Approval', N'Approved', N'Rejected', N'Converted to PO')),
    CONSTRAINT CK_mat_prs_priority CHECK (priority IN (N'Normal', N'High', N'Emergency')),
    CONSTRAINT FK_mat_prs_project FOREIGN KEY (project_id) REFERENCES dbo.projects(id),
    CONSTRAINT FK_mat_prs_bom_project FOREIGN KEY (bom_id, project_id) REFERENCES dbo.boms(id, project_id),
    CONSTRAINT FK_mat_prs_requested_by FOREIGN KEY (requested_by) REFERENCES dbo.users(id),
    CONSTRAINT FK_mat_prs_created_by FOREIGN KEY (created_by) REFERENCES dbo.users(id),
    CONSTRAINT FK_mat_prs_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users(id)
);

CREATE TABLE dbo.mat_pr_lines (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_mat_pr_lines PRIMARY KEY,
    pr_id bigint NOT NULL,
    bom_id bigint NOT NULL,
    bom_line_id bigint NOT NULL,
    item_id bigint NULL,
    item_code nvarchar(100) NOT NULL,
    part_no nvarchar(200) NOT NULL CONSTRAINT DF_mat_pr_lines_part_no DEFAULT N'',
    description nvarchar(500) NOT NULL,
    supplier_id bigint NOT NULL,
    qty decimal(19,4) NOT NULL,
    unit nvarchar(50) NOT NULL,
    unit_price decimal(19,4) NOT NULL,
    est_qty decimal(19,4) NOT NULL,
    est_unit_cost decimal(19,4) NOT NULL,
    price_source nvarchar(100) NOT NULL,
    stock_snapshot decimal(19,4) NOT NULL CONSTRAINT DF_mat_pr_lines_stock DEFAULT 0,
    is_unplanned bit NOT NULL CONSTRAINT DF_mat_pr_lines_unplanned DEFAULT 0,
    buy_despite_stock bit NOT NULL CONSTRAINT DF_mat_pr_lines_buy_stock DEFAULT 0,
    remark nvarchar(max) NULL,
    row_version rowversion NOT NULL,
    line_total AS (CONVERT(decimal(19,4), qty * unit_price)) PERSISTED,
    estimate_total AS (CONVERT(decimal(19,4), est_qty * est_unit_cost)) PERSISTED,
    CONSTRAINT UQ_mat_pr_lines_link UNIQUE (id, pr_id, bom_line_id, supplier_id),
    CONSTRAINT CK_mat_pr_lines_values CHECK (qty > 0 AND unit_price >= 0 AND est_qty >= 0 AND est_unit_cost >= 0 AND stock_snapshot >= 0),
    CONSTRAINT FK_mat_pr_lines_pr FOREIGN KEY (pr_id, bom_id) REFERENCES dbo.mat_prs(id, bom_id),
    CONSTRAINT FK_mat_pr_lines_bom_line FOREIGN KEY (bom_line_id, bom_id) REFERENCES dbo.bom_lines(id, bom_id),
    CONSTRAINT FK_mat_pr_lines_item FOREIGN KEY (item_id) REFERENCES dbo.mat_items(id),
    CONSTRAINT FK_mat_pr_lines_supplier FOREIGN KEY (supplier_id) REFERENCES dbo.suppliers(id)
);
CREATE INDEX IX_mat_prs_project_status ON dbo.mat_prs(project_id, status, required_date) INCLUDE (pr_no, requested_by) WHERE deleted_at IS NULL;
CREATE INDEX IX_mat_prs_bom_status ON dbo.mat_prs(bom_id, status) INCLUDE (project_id, pr_no) WHERE deleted_at IS NULL;
CREATE INDEX IX_mat_pr_lines_pr ON dbo.mat_pr_lines(pr_id) INCLUDE (bom_line_id, item_id, supplier_id, qty, unit_price);
CREATE INDEX IX_mat_pr_lines_bom ON dbo.mat_pr_lines(bom_id, bom_line_id) INCLUDE (pr_id, item_id, qty);
CREATE INDEX IX_mat_pr_lines_supplier ON dbo.mat_pr_lines(supplier_id, item_id) INCLUDE (pr_id, qty, unit_price);

CREATE TABLE dbo.mat_pr_approval_steps (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_mat_pr_steps PRIMARY KEY,
    pr_id bigint NOT NULL,
    sequence int NOT NULL,
    name nvarchar(100) NOT NULL,
    approver_role nvarchar(50) NULL,
    approver_id bigint NULL,
    rule_code nvarchar(100) NULL,
    status nvarchar(30) NOT NULL,
    decision nvarchar(30) NULL,
    comment nvarchar(max) NULL,
    acted_at datetimeoffset(0) NULL,
    row_version rowversion NOT NULL,
    CONSTRAINT UQ_mat_pr_steps UNIQUE (pr_id, sequence),
    CONSTRAINT FK_mat_pr_steps_pr FOREIGN KEY (pr_id) REFERENCES dbo.mat_prs(id),
    CONSTRAINT FK_mat_pr_steps_approver FOREIGN KEY (approver_id) REFERENCES dbo.users(id)
);
CREATE INDEX IX_mat_pr_steps_approver_status ON dbo.mat_pr_approval_steps(approver_id, status) INCLUDE (pr_id, sequence, acted_at);

CREATE TABLE dbo.mat_pos (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_mat_pos PRIMARY KEY,
    po_no nvarchar(30) NOT NULL CONSTRAINT UQ_mat_pos_no UNIQUE,
    pr_id bigint NOT NULL,
    project_id bigint NOT NULL,
    supplier_id bigint NOT NULL,
    order_date date NOT NULL,
    confirmed_date date NULL,
    expected_date date NULL,
    status nvarchar(30) NOT NULL,
    created_by bigint NOT NULL,
    updated_by bigint NOT NULL,
    created_at datetimeoffset(0) NOT NULL CONSTRAINT DF_mat_pos_created_at DEFAULT SYSUTCDATETIME(),
    updated_at datetimeoffset(0) NOT NULL CONSTRAINT DF_mat_pos_updated_at DEFAULT SYSUTCDATETIME(),
    deleted_at datetimeoffset(0) NULL,
    row_version rowversion NOT NULL,
    CONSTRAINT UQ_mat_pos_id_pr_supplier UNIQUE (id, pr_id, supplier_id),
    CONSTRAINT UQ_mat_pos_id_supplier UNIQUE (id, supplier_id),
    CONSTRAINT CK_mat_pos_status CHECK (status IN (N'Draft', N'Ordered', N'Partially Received', N'Received', N'Cancelled')),
    CONSTRAINT FK_mat_pos_pr FOREIGN KEY (pr_id) REFERENCES dbo.mat_prs(id),
    CONSTRAINT FK_mat_pos_project FOREIGN KEY (project_id) REFERENCES dbo.projects(id),
    CONSTRAINT FK_mat_pos_supplier FOREIGN KEY (supplier_id) REFERENCES dbo.suppliers(id),
    CONSTRAINT FK_mat_pos_created_by FOREIGN KEY (created_by) REFERENCES dbo.users(id),
    CONSTRAINT FK_mat_pos_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users(id)
);

CREATE TABLE dbo.mat_po_lines (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_mat_po_lines PRIMARY KEY,
    po_id bigint NOT NULL,
    pr_id bigint NOT NULL,
    supplier_id bigint NOT NULL,
    pr_line_id bigint NOT NULL,
    bom_line_id bigint NOT NULL,
    item_id bigint NULL,
    qty decimal(19,4) NOT NULL,
    unit_price decimal(19,4) NOT NULL,
    row_version rowversion NOT NULL,
    CONSTRAINT UQ_mat_po_lines_id_po UNIQUE (id, po_id),
    CONSTRAINT CK_mat_po_lines_values CHECK (qty > 0 AND unit_price >= 0),
    CONSTRAINT FK_mat_po_lines_po FOREIGN KEY (po_id, pr_id, supplier_id) REFERENCES dbo.mat_pos(id, pr_id, supplier_id),
    CONSTRAINT FK_mat_po_lines_pr_line FOREIGN KEY (pr_line_id, pr_id, bom_line_id, supplier_id)
        REFERENCES dbo.mat_pr_lines(id, pr_id, bom_line_id, supplier_id),
    CONSTRAINT FK_mat_po_lines_bom_line FOREIGN KEY (bom_line_id) REFERENCES dbo.bom_lines(id),
    CONSTRAINT FK_mat_po_lines_item FOREIGN KEY (item_id) REFERENCES dbo.mat_items(id)
);
CREATE INDEX IX_mat_pos_pr ON dbo.mat_pos(pr_id) INCLUDE (po_no, project_id, supplier_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IX_mat_pos_project_status ON dbo.mat_pos(project_id, status, expected_date) INCLUDE (po_no, supplier_id) WHERE deleted_at IS NULL;
CREATE INDEX IX_mat_pos_supplier_status ON dbo.mat_pos(supplier_id, status) INCLUDE (po_no, order_date, expected_date) WHERE deleted_at IS NULL;
CREATE INDEX IX_mat_po_lines_po ON dbo.mat_po_lines(po_id) INCLUDE (pr_line_id, bom_line_id, item_id, qty, unit_price);
CREATE INDEX IX_mat_po_lines_pr_line ON dbo.mat_po_lines(pr_line_id) INCLUDE (po_id, item_id, qty);

CREATE TABLE dbo.grns (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_grns PRIMARY KEY,
    grn_no nvarchar(30) NOT NULL CONSTRAINT UQ_grns_no UNIQUE,
    po_id bigint NOT NULL,
    supplier_id bigint NOT NULL,
    delivery_note nvarchar(200) NOT NULL CONSTRAINT DF_grns_delivery_note DEFAULT N'',
    received_date date NOT NULL,
    status nvarchar(30) NOT NULL CONSTRAINT DF_grns_status DEFAULT N'Draft',
    confirmed_by bigint NULL,
    confirmed_at datetimeoffset(0) NULL,
    created_by bigint NOT NULL,
    created_at datetimeoffset(0) NOT NULL CONSTRAINT DF_grns_created_at DEFAULT SYSUTCDATETIME(),
    row_version rowversion NOT NULL,
    CONSTRAINT UQ_grns_id_po UNIQUE (id, po_id),
    CONSTRAINT CK_grns_status CHECK (status IN (N'Draft', N'Confirmed', N'Cancelled')),
    CONSTRAINT FK_grns_po_supplier FOREIGN KEY (po_id, supplier_id) REFERENCES dbo.mat_pos(id, supplier_id),
    CONSTRAINT FK_grns_confirmed_by FOREIGN KEY (confirmed_by) REFERENCES dbo.users(id),
    CONSTRAINT FK_grns_created_by FOREIGN KEY (created_by) REFERENCES dbo.users(id)
);

CREATE TABLE dbo.grn_lines (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_grn_lines PRIMARY KEY,
    grn_id bigint NOT NULL,
    po_id bigint NOT NULL,
    po_line_id bigint NOT NULL,
    item_id bigint NULL,
    received_qty decimal(19,4) NOT NULL,
    accepted_qty decimal(19,4) NOT NULL,
    damaged_qty decimal(19,4) NOT NULL,
    rejected_qty decimal(19,4) NOT NULL,
    lot_no nvarchar(100) NULL,
    serial_no nvarchar(200) NULL,
    location nvarchar(100) NOT NULL,
    qc_status nvarchar(30) NOT NULL,
    project_allocation_id bigint NULL,
    remark nvarchar(max) NULL,
    CONSTRAINT UQ_grn_lines_grn_po_line UNIQUE (grn_id, po_line_id),
    CONSTRAINT CK_grn_lines_qty CHECK (received_qty > 0 AND accepted_qty >= 0 AND damaged_qty >= 0 AND rejected_qty >= 0
        AND accepted_qty + damaged_qty + rejected_qty = received_qty),
    CONSTRAINT CK_grn_lines_qc_status CHECK (qc_status IN (N'Pending', N'Passed', N'Failed')),
    CONSTRAINT FK_grn_lines_grn FOREIGN KEY (grn_id, po_id) REFERENCES dbo.grns(id, po_id),
    CONSTRAINT FK_grn_lines_po_line FOREIGN KEY (po_line_id, po_id) REFERENCES dbo.mat_po_lines(id, po_id),
    CONSTRAINT FK_grn_lines_item FOREIGN KEY (item_id) REFERENCES dbo.mat_items(id),
    CONSTRAINT FK_grn_lines_project FOREIGN KEY (project_allocation_id) REFERENCES dbo.projects(id)
);
CREATE INDEX IX_grns_po_status ON dbo.grns(po_id, status, received_date) INCLUDE (grn_no, supplier_id);
CREATE INDEX IX_grns_supplier_date ON dbo.grns(supplier_id, received_date DESC) INCLUDE (grn_no, po_id, status);
CREATE INDEX IX_grn_lines_po_line ON dbo.grn_lines(po_line_id) INCLUDE (grn_id, received_qty, accepted_qty, damaged_qty, rejected_qty);

CREATE TABLE dbo.mirs (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_mirs PRIMARY KEY,
    mir_no nvarchar(30) NOT NULL CONSTRAINT UQ_mirs_no UNIQUE,
    project_id bigint NOT NULL,
    requested_by bigint NOT NULL,
    requested_at datetimeoffset(0) NOT NULL CONSTRAINT DF_mirs_requested_at DEFAULT SYSUTCDATETIME(),
    required_date date NOT NULL,
    status nvarchar(30) NOT NULL CONSTRAINT DF_mirs_status DEFAULT N'Draft',
    approved_by bigint NULL,
    approved_at datetimeoffset(0) NULL,
    picked_by bigint NULL,
    issued_by bigint NULL,
    issued_at datetimeoffset(0) NULL,
    received_by bigint NULL,
    received_at datetimeoffset(0) NULL,
    row_version rowversion NOT NULL,
    CONSTRAINT CK_mirs_status CHECK (status IN (N'Draft', N'Pending Approval', N'Approved', N'Picking', N'Issued', N'Received', N'Rejected')),
    CONSTRAINT FK_mirs_project FOREIGN KEY (project_id) REFERENCES dbo.projects(id),
    CONSTRAINT FK_mirs_requested_by FOREIGN KEY (requested_by) REFERENCES dbo.users(id),
    CONSTRAINT FK_mirs_approved_by FOREIGN KEY (approved_by) REFERENCES dbo.users(id),
    CONSTRAINT FK_mirs_picked_by FOREIGN KEY (picked_by) REFERENCES dbo.users(id),
    CONSTRAINT FK_mirs_issued_by FOREIGN KEY (issued_by) REFERENCES dbo.users(id),
    CONSTRAINT FK_mirs_received_by FOREIGN KEY (received_by) REFERENCES dbo.users(id)
);

CREATE TABLE dbo.mir_lines (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_mir_lines PRIMARY KEY,
    mir_id bigint NOT NULL,
    bom_line_id bigint NOT NULL,
    item_id bigint NOT NULL,
    bom_qty decimal(19,4) NOT NULL,
    previously_issued_qty decimal(19,4) NOT NULL,
    requested_qty decimal(19,4) NOT NULL,
    issued_qty decimal(19,4) NOT NULL CONSTRAINT DF_mir_lines_issued DEFAULT 0,
    returned_qty decimal(19,4) NOT NULL CONSTRAINT DF_mir_lines_returned DEFAULT 0,
    location nvarchar(100) NOT NULL,
    purpose nvarchar(max) NULL,
    row_version rowversion NOT NULL,
    CONSTRAINT CK_mir_lines_qty CHECK (bom_qty > 0 AND previously_issued_qty >= 0 AND requested_qty > 0 AND issued_qty >= 0 AND returned_qty >= 0
        AND requested_qty <= bom_qty - previously_issued_qty AND issued_qty <= requested_qty AND returned_qty <= issued_qty),
    CONSTRAINT FK_mir_lines_mir FOREIGN KEY (mir_id) REFERENCES dbo.mirs(id),
    CONSTRAINT FK_mir_lines_bom_line FOREIGN KEY (bom_line_id) REFERENCES dbo.bom_lines(id),
    CONSTRAINT FK_mir_lines_item FOREIGN KEY (item_id) REFERENCES dbo.mat_items(id)
);
CREATE INDEX IX_mirs_project_status ON dbo.mirs(project_id, status, required_date) INCLUDE (mir_no, requested_by, issued_at);
CREATE INDEX IX_mirs_requester_status ON dbo.mirs(requested_by, status) INCLUDE (mir_no, project_id, required_date);
CREATE INDEX IX_mir_lines_mir ON dbo.mir_lines(mir_id) INCLUDE (bom_line_id, item_id, requested_qty, issued_qty, returned_qty);
CREATE INDEX IX_mir_lines_bom_item ON dbo.mir_lines(bom_line_id, item_id) INCLUDE (mir_id, requested_qty, issued_qty);

CREATE TABLE dbo.stock_adjustments (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_stock_adjustments PRIMARY KEY,
    adjustment_no nvarchar(30) NOT NULL CONSTRAINT UQ_stock_adjustments_no UNIQUE,
    item_id bigint NOT NULL,
    qty_change decimal(19,4) NOT NULL,
    reason nvarchar(max) NOT NULL,
    requested_by bigint NOT NULL,
    status nvarchar(30) NOT NULL CONSTRAINT DF_stock_adjustments_status DEFAULT N'Pending Approval',
    approved_by bigint NULL,
    approved_at datetimeoffset(0) NULL,
    row_version rowversion NOT NULL,
    CONSTRAINT CK_stock_adjustments_qty CHECK (qty_change <> 0),
    CONSTRAINT CK_stock_adjustments_status CHECK (status IN (N'Pending Approval', N'Approved', N'Rejected')),
    CONSTRAINT FK_stock_adjustments_item FOREIGN KEY (item_id) REFERENCES dbo.mat_items(id),
    CONSTRAINT FK_stock_adjustments_requested_by FOREIGN KEY (requested_by) REFERENCES dbo.users(id),
    CONSTRAINT FK_stock_adjustments_approved_by FOREIGN KEY (approved_by) REFERENCES dbo.users(id)
);
CREATE INDEX IX_stock_adjustments_item_status ON dbo.stock_adjustments(item_id, status) INCLUDE (adjustment_no, qty_change, requested_by);

CREATE TABLE dbo.stock_txns (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_stock_txns PRIMARY KEY,
    source_event_key nvarchar(200) NOT NULL,
    txn_type nvarchar(50) NOT NULL,
    item_id bigint NOT NULL,
    qty decimal(19,4) NOT NULL,
    bucket nvarchar(30) NOT NULL,
    location nvarchar(100) NOT NULL,
    ref_no nvarchar(100) NOT NULL,
    project_id bigint NULL,
    unit_cost decimal(19,4) NOT NULL CONSTRAINT DF_stock_txns_unit_cost DEFAULT 0,
    note nvarchar(max) NULL,
    created_by bigint NOT NULL,
    occurred_at datetimeoffset(0) NOT NULL CONSTRAINT DF_stock_txns_occurred_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_stock_txns_qty CHECK (qty <> 0),
    CONSTRAINT CK_stock_txns_bucket CHECK (bucket IN (N'stock', N'quarantine')),
    CONSTRAINT CK_stock_txns_type CHECK (txn_type IN (
        N'OPENING_BALANCE', N'GRN_RECEIPT', N'GRN_QUARANTINE', N'MIR_ISSUE', N'MIR_RETURN',
        N'STOCK_ADJUSTMENT', N'QC_RELEASE_OUT', N'QC_RELEASE_IN', N'SUPPLIER_RETURN',
        N'TRANSFER_OUT', N'TRANSFER_IN'
    )),
    CONSTRAINT CK_stock_txns_sign_bucket CHECK (
        (txn_type = N'OPENING_BALANCE' AND qty > 0 AND bucket = N'stock') OR
        (txn_type = N'GRN_RECEIPT' AND qty > 0 AND bucket = N'stock') OR
        (txn_type = N'GRN_QUARANTINE' AND qty > 0 AND bucket = N'quarantine') OR
        (txn_type = N'MIR_ISSUE' AND qty < 0 AND bucket = N'stock') OR
        (txn_type = N'MIR_RETURN' AND qty > 0 AND bucket = N'stock') OR
        (txn_type = N'STOCK_ADJUSTMENT') OR
        (txn_type = N'QC_RELEASE_OUT' AND qty < 0 AND bucket = N'quarantine') OR
        (txn_type = N'QC_RELEASE_IN' AND qty > 0 AND bucket = N'stock') OR
        (txn_type = N'SUPPLIER_RETURN' AND qty < 0) OR
        (txn_type = N'TRANSFER_OUT' AND qty < 0) OR
        (txn_type = N'TRANSFER_IN' AND qty > 0)
    ),
    CONSTRAINT CK_stock_txns_unit_cost CHECK (unit_cost >= 0),
    CONSTRAINT CK_stock_txns_source_key CHECK (LEN(source_event_key) > 0 AND source_event_key = LTRIM(RTRIM(source_event_key))),
    CONSTRAINT CK_stock_txns_required_text CHECK (LEN(LTRIM(RTRIM(location))) > 0 AND LEN(LTRIM(RTRIM(ref_no))) > 0),
    CONSTRAINT CK_stock_txns_project CHECK (txn_type NOT IN (N'MIR_ISSUE', N'MIR_RETURN') OR project_id IS NOT NULL),
    CONSTRAINT FK_stock_txns_item FOREIGN KEY (item_id) REFERENCES dbo.mat_items(id),
    CONSTRAINT FK_stock_txns_project FOREIGN KEY (project_id) REFERENCES dbo.projects(id),
    CONSTRAINT FK_stock_txns_created_by FOREIGN KEY (created_by) REFERENCES dbo.users(id)
);
CREATE UNIQUE INDEX UX_stock_txns_source_event_key ON dbo.stock_txns(source_event_key);
CREATE INDEX IX_stock_txns_item ON dbo.stock_txns(item_id, occurred_at DESC) INCLUDE (qty, bucket, location, project_id, unit_cost);
CREATE INDEX IX_stock_txns_reference ON dbo.stock_txns(ref_no, occurred_at DESC) INCLUDE (txn_type, item_id, qty, bucket, source_event_key);

CREATE TABLE dbo.mat_audit (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_mat_audit PRIMARY KEY,
    actor_id bigint NOT NULL,
    actor_role nvarchar(50) NOT NULL,
    action nvarchar(100) NOT NULL,
    entity_type nvarchar(50) NOT NULL,
    entity_id bigint NOT NULL,
    entity_no nvarchar(50) NOT NULL,
    before_json nvarchar(max) NULL,
    after_json nvarchar(max) NULL,
    qty decimal(19,4) NULL,
    project_id bigint NULL,
    reason nvarchar(max) NULL,
    attachment_storage_key nvarchar(1000) NULL,
    approver_id bigint NULL,
    occurred_at datetimeoffset(0) NOT NULL CONSTRAINT DF_mat_audit_occurred_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_mat_audit_before CHECK (before_json IS NULL OR ISJSON(before_json) = 1),
    CONSTRAINT CK_mat_audit_after CHECK (after_json IS NULL OR ISJSON(after_json) = 1),
    CONSTRAINT FK_mat_audit_actor FOREIGN KEY (actor_id) REFERENCES dbo.users(id),
    CONSTRAINT FK_mat_audit_project FOREIGN KEY (project_id) REFERENCES dbo.projects(id),
    CONSTRAINT FK_mat_audit_approver FOREIGN KEY (approver_id) REFERENCES dbo.users(id)
);
CREATE INDEX IX_mat_audit_entity ON dbo.mat_audit(entity_type, entity_id, occurred_at DESC) INCLUDE (action, actor_id, entity_no);
CREATE INDEX IX_mat_audit_project ON dbo.mat_audit(project_id, occurred_at DESC) INCLUDE (action, entity_type, entity_id, actor_id);

EXEC sys.sp_executesql N'
CREATE OR ALTER VIEW dbo.v_item_balances
AS
WITH ledger AS (
    SELECT item_id,
           SUM(CASE WHEN bucket = N''stock'' THEN qty ELSE 0 END) AS usable,
           SUM(CASE WHEN bucket = N''quarantine'' THEN qty ELSE 0 END) AS quarantine
    FROM dbo.stock_txns
    GROUP BY item_id
), reserved AS (
    SELECT item_id, SUM(qty) AS reserved
    FROM dbo.reservations
    WHERE status = N''Active''
    GROUP BY item_id
), received AS (
    SELECT gl.po_line_id, SUM(gl.received_qty) AS received_qty
    FROM dbo.grn_lines gl
    INNER JOIN dbo.grns g ON g.id = gl.grn_id AND g.status = N''Confirmed''
    GROUP BY gl.po_line_id
), ordered AS (
    SELECT pol.item_id,
           SUM(CASE
               WHEN pol.qty > COALESCE(r.received_qty, 0) THEN pol.qty - COALESCE(r.received_qty, 0)
               ELSE 0
           END) AS on_order
    FROM dbo.mat_po_lines pol
    INNER JOIN dbo.mat_pos po
        ON po.id = pol.po_id
       AND po.status IN (N''Ordered'', N''Partially Received'')
       AND po.deleted_at IS NULL
    LEFT JOIN received r ON r.po_line_id = pol.id
    WHERE pol.item_id IS NOT NULL
    GROUP BY pol.item_id
)
SELECT i.id AS item_id, i.item_code, i.part_no, i.description, i.brand, i.unit, i.location,
       CONVERT(decimal(19,4), COALESCE(l.usable, 0)) AS usable,
       CONVERT(decimal(19,4), COALESCE(l.quarantine, 0)) AS quarantine,
       CONVERT(decimal(19,4), COALESCE(r.reserved, 0)) AS reserved,
       CONVERT(decimal(19,4), COALESCE(l.usable, 0) - COALESCE(r.reserved, 0)) AS available,
       CONVERT(decimal(19,4), COALESCE(o.on_order, 0)) AS on_order,
       i.avg_unit_cost, i.reorder_level
FROM dbo.mat_items i
LEFT JOIN ledger l ON l.item_id = i.id
LEFT JOIN reserved r ON r.item_id = i.id
LEFT JOIN ordered o ON o.item_id = i.id
WHERE i.deleted_at IS NULL AND i.is_active = 1;';

EXEC sys.sp_executesql N'
CREATE OR ALTER TRIGGER dbo.trg_mat_pr_lines_consistency
ON dbo.mat_pr_lines
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (
        SELECT 1
        FROM inserted i
        INNER JOIN dbo.bom_lines bl ON bl.id = i.bom_line_id
        WHERE (i.item_id <> bl.item_id)
           OR (i.item_id IS NULL AND bl.item_id IS NOT NULL)
           OR (i.item_id IS NOT NULL AND bl.item_id IS NULL)
    )
        THROW 51004, ''A PR line must use the item from its BOM line.'', 1;
END;';

EXEC sys.sp_executesql N'
CREATE OR ALTER TRIGGER dbo.trg_bom_lines_item_consistency
ON dbo.bom_lines
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF UPDATE(item_id) AND EXISTS (
        SELECT 1
        FROM inserted i
        INNER JOIN dbo.mat_pr_lines prl ON prl.bom_line_id = i.id
        WHERE (i.item_id <> prl.item_id)
           OR (i.item_id IS NULL AND prl.item_id IS NOT NULL)
           OR (i.item_id IS NOT NULL AND prl.item_id IS NULL)
    )
        THROW 51005, ''A BOM line item cannot change while linked PR lines use a different item.'', 1;
END;';

EXEC sys.sp_executesql N'
CREATE OR ALTER TRIGGER dbo.trg_mat_po_lines_consistency
ON dbo.mat_po_lines
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (
        SELECT 1
        FROM inserted i
        INNER JOIN dbo.mat_pr_lines prl ON prl.id = i.pr_line_id
        INNER JOIN dbo.mat_pos po ON po.id = i.po_id
        WHERE i.pr_id <> prl.pr_id
           OR i.bom_line_id <> prl.bom_line_id
           OR i.supplier_id <> prl.supplier_id
           OR i.pr_id <> po.pr_id
           OR i.supplier_id <> po.supplier_id
           OR (i.item_id <> prl.item_id)
           OR (i.item_id IS NULL AND prl.item_id IS NOT NULL)
           OR (i.item_id IS NOT NULL AND prl.item_id IS NULL)
    )
        THROW 51006, ''A PO line must match its PO and PR line PR, supplier, BOM line and item.'', 1;

    IF EXISTS (
        SELECT 1
        FROM inserted i
        INNER JOIN dbo.grn_lines gl ON gl.po_line_id = i.id
        WHERE (i.item_id <> gl.item_id)
           OR (i.item_id IS NULL AND gl.item_id IS NOT NULL)
           OR (i.item_id IS NOT NULL AND gl.item_id IS NULL)
    )
        THROW 51007, ''A PO line item cannot change while linked GRN lines use a different item.'', 1;
END;';

EXEC sys.sp_executesql N'
CREATE OR ALTER TRIGGER dbo.trg_mat_pr_lines_item_children
ON dbo.mat_pr_lines
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF UPDATE(item_id) AND EXISTS (
        SELECT 1
        FROM inserted i
        INNER JOIN dbo.mat_po_lines pol ON pol.pr_line_id = i.id
        WHERE (i.item_id <> pol.item_id)
           OR (i.item_id IS NULL AND pol.item_id IS NOT NULL)
           OR (i.item_id IS NOT NULL AND pol.item_id IS NULL)
    )
        THROW 51008, ''A PR line item cannot change while linked PO lines use a different item.'', 1;
END;';

EXEC sys.sp_executesql N'
CREATE OR ALTER TRIGGER dbo.trg_grn_lines_consistency
ON dbo.grn_lines
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (
        SELECT 1
        FROM inserted i
        INNER JOIN dbo.grns g ON g.id = i.grn_id
        INNER JOIN dbo.mat_po_lines pol ON pol.id = i.po_line_id
        WHERE i.po_id <> g.po_id
           OR i.po_id <> pol.po_id
           OR (i.item_id <> pol.item_id)
           OR (i.item_id IS NULL AND pol.item_id IS NOT NULL)
           OR (i.item_id IS NOT NULL AND pol.item_id IS NULL)
    )
        THROW 51009, ''A GRN line must belong to the GRN PO and use the PO line item.'', 1;
END;';

EXEC sys.sp_executesql N'
CREATE OR ALTER TRIGGER dbo.trg_stock_txns_append_only
ON dbo.stock_txns
INSTEAD OF UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    THROW 51001, ''Stock transactions are append-only.'', 1;
END;';

EXEC sys.sp_executesql N'
CREATE OR ALTER TRIGGER dbo.trg_mat_audit_append_only
ON dbo.mat_audit
INSTEAD OF UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    THROW 51002, ''Material audit records are append-only.'', 1;
END;';

INSERT INTO dbo.schema_versions(version, name)
VALUES (2, N'BOM, procurement, receiving, stock and issue schema');

COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0
        ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
