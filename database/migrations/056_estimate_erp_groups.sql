SET XACT_ABORT ON;
BEGIN TRANSACTION;

-- Several small cost lines often belong on the ERP sheet as one line. A group says
-- which lines are written together and under what name; it changes nothing about
-- the lines themselves, so the estimate still reconciles line by line and the
-- Cost Items tab keeps showing every item.
IF OBJECT_ID('dbo.estimate_erp_groups','U') IS NULL
BEGIN
  CREATE TABLE dbo.estimate_erp_groups (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_estimate_erp_groups PRIMARY KEY,
    estimate_id bigint NOT NULL,
    revision int NOT NULL,
    title nvarchar(200) NOT NULL,
    quantity decimal(19,4) NOT NULL CONSTRAINT DF_estimate_erp_groups_quantity DEFAULT 1,
    unit nvarchar(30) NOT NULL CONSTRAINT DF_estimate_erp_groups_unit DEFAULT N'Lot',
    -- [{"sourceType":"CostItem","sourceId":12}, …] — the same identity ERP mappings use.
    members nvarchar(max) NOT NULL,
    created_by bigint NOT NULL,
    updated_by bigint NOT NULL,
    created_at datetimeoffset(0) NOT NULL CONSTRAINT DF_estimate_erp_groups_created_at DEFAULT SYSUTCDATETIME(),
    updated_at datetimeoffset(0) NOT NULL CONSTRAINT DF_estimate_erp_groups_updated_at DEFAULT SYSUTCDATETIME(),
    row_version rowversion NOT NULL,
    CONSTRAINT FK_estimate_erp_groups_estimate FOREIGN KEY (estimate_id) REFERENCES dbo.estimates(id),
    CONSTRAINT FK_estimate_erp_groups_created_by FOREIGN KEY (created_by) REFERENCES dbo.users(id),
    CONSTRAINT FK_estimate_erp_groups_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users(id),
    CONSTRAINT CK_estimate_erp_groups_members CHECK (ISJSON(members)=1),
    CONSTRAINT CK_estimate_erp_groups_quantity CHECK (quantity > 0 AND quantity <= 1000000),
    CONSTRAINT CK_estimate_erp_groups_title CHECK (LEN(LTRIM(RTRIM(title))) > 0)
  );

  CREATE INDEX IX_estimate_erp_groups_estimate ON dbo.estimate_erp_groups(estimate_id, revision);
END;

IF NOT EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=56)
  INSERT dbo.schema_versions(version,name) VALUES(56,N'ERP export groups for merged summary lines');

COMMIT TRANSACTION;
