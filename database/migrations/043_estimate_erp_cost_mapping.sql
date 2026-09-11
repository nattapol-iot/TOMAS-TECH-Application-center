SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF EXISTS (
    SELECT 1 FROM dbo.schema_versions
    WHERE version = 43
      AND name <> N'Revision-scoped Estimate ERP cost classifications'
)
    THROW 51430, 'Schema version 043 is already used by another migration.', 1;

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 43)
    THROW 51431, 'Migration 043 has already been applied.', 1;

IF NOT EXISTS (
    SELECT 1 FROM dbo.schema_versions
    WHERE version = 42
      AND name = N'Guard estimate aggregates within supported decimal precision'
)
    THROW 51432, 'Apply migration 042 before migration 043.', 1;
GO

BEGIN TRANSACTION;
GO

CREATE TABLE dbo.estimate_erp_mappings (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_estimate_erp_mappings PRIMARY KEY,
    estimate_id bigint NOT NULL,
    revision int NOT NULL,
    source_type nvarchar(30) NOT NULL,
    source_id bigint NULL,
    erp_category nvarchar(30) NOT NULL,
    copied_from_mapping_id bigint NULL,
    copied_from_revision int NULL,
    created_by bigint NOT NULL,
    updated_by bigint NOT NULL,
    created_at datetimeoffset(0) NOT NULL CONSTRAINT DF_estimate_erp_mappings_created_at DEFAULT SYSUTCDATETIME(),
    updated_at datetimeoffset(0) NOT NULL CONSTRAINT DF_estimate_erp_mappings_updated_at DEFAULT SYSUTCDATETIME(),
    row_version rowversion NOT NULL,
    CONSTRAINT FK_estimate_erp_mappings_estimate FOREIGN KEY (estimate_id) REFERENCES dbo.estimates(id),
    CONSTRAINT FK_estimate_erp_mappings_created_by FOREIGN KEY (created_by) REFERENCES dbo.users(id),
    CONSTRAINT FK_estimate_erp_mappings_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users(id),
    CONSTRAINT FK_estimate_erp_mappings_copied_from FOREIGN KEY (copied_from_mapping_id) REFERENCES dbo.estimate_erp_mappings(id),
    CONSTRAINT CK_estimate_erp_mappings_source_type CHECK (source_type IN (
        N'CostItem', N'ManhourLine', N'ExpenseLine', N'OtherCostLine', N'Contingency'
    )),
    CONSTRAINT CK_estimate_erp_mappings_source_id CHECK (
        (source_type=N'Contingency' AND source_id IS NULL)
        OR (source_type IN (N'CostItem', N'ManhourLine', N'ExpenseLine', N'OtherCostLine') AND source_id IS NOT NULL)
    ),
    CONSTRAINT CK_estimate_erp_mappings_category CHECK (erp_category IN (
        N'Hardware', N'Software', N'Service', N'Installation', N'License', N'Maintenance', N'Training', N'Unmapped'
    )),
    CONSTRAINT CK_estimate_erp_mappings_copy_provenance CHECK (
        (copied_from_mapping_id IS NULL AND copied_from_revision IS NULL)
        OR (copied_from_mapping_id IS NOT NULL AND copied_from_revision IS NOT NULL AND copied_from_revision < revision)
    )
);

CREATE UNIQUE INDEX UX_estimate_erp_mappings_line
    ON dbo.estimate_erp_mappings(estimate_id, revision, source_type, source_id)
    WHERE source_id IS NOT NULL;

CREATE UNIQUE INDEX UX_estimate_erp_mappings_allocation
    ON dbo.estimate_erp_mappings(estimate_id, revision, source_type)
    WHERE source_id IS NULL;

CREATE INDEX IX_estimate_erp_mappings_revision
    ON dbo.estimate_erp_mappings(estimate_id, revision)
    INCLUDE (source_type, source_id, erp_category, copied_from_revision, row_version);
GO

CREATE OR ALTER TRIGGER dbo.trg_estimate_erp_mappings_current_revision_only
ON dbo.estimate_erp_mappings
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (
        SELECT 1
        FROM inserted i
        INNER JOIN dbo.estimates e ON e.id=i.estimate_id
        WHERE i.revision<>e.revision OR e.status NOT IN(N'Draft',N'Engineering Input',N'Engineering Review',N'Revision Required')
    ) OR EXISTS (
        SELECT 1
        FROM deleted d
        INNER JOIN dbo.estimates e ON e.id=d.estimate_id
        WHERE d.revision<>e.revision OR e.status NOT IN(N'Draft',N'Engineering Input',N'Engineering Review',N'Revision Required')
    )
        THROW 51433, 'ERP mappings can be changed only on the current Estimate revision before approval.', 1;

    IF EXISTS (
        SELECT 1 FROM inserted i
        WHERE (i.source_type=N'CostItem' AND NOT EXISTS(
            SELECT 1 FROM dbo.cost_items l WHERE l.id=i.source_id AND l.estimate_id=i.estimate_id AND l.revision=i.revision AND l.deleted_at IS NULL
        )) OR (i.source_type=N'ManhourLine' AND NOT EXISTS(
            SELECT 1 FROM dbo.manhour_lines l WHERE l.id=i.source_id AND l.estimate_id=i.estimate_id AND l.revision=i.revision AND l.deleted_at IS NULL
        )) OR (i.source_type=N'ExpenseLine' AND NOT EXISTS(
            SELECT 1 FROM dbo.expense_lines l WHERE l.id=i.source_id AND l.estimate_id=i.estimate_id AND l.revision=i.revision AND l.deleted_at IS NULL
        )) OR (i.source_type=N'OtherCostLine' AND NOT EXISTS(
            SELECT 1 FROM dbo.other_cost_lines l WHERE l.id=i.source_id AND l.estimate_id=i.estimate_id AND l.revision=i.revision AND l.deleted_at IS NULL
        ))
    )
        THROW 51434, 'ERP mapping source does not belong to this Estimate revision.', 1;
END;
GO

IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
BEGIN
    GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.estimate_erp_mappings TO [iot_team_app_role];
    DENY DELETE ON OBJECT::dbo.estimate_erp_mappings TO [iot_team_app_role];
END;

INSERT INTO dbo.schema_versions(version, name)
VALUES(43, N'Revision-scoped Estimate ERP cost classifications');

COMMIT TRANSACTION;
GO
