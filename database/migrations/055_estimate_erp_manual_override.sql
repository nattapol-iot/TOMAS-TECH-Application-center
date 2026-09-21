SET XACT_ABORT ON;
BEGIN TRANSACTION;

-- The ERP category of a labour line is derived from its cost type, provider and
-- discipline, and the summary recomputes it on every read while the estimate is
-- editable. This flag records that a person chose a different category on
-- purpose, so the derived value stops overwriting their decision.
IF COL_LENGTH('dbo.estimate_erp_mappings','manual_override') IS NULL
  ALTER TABLE dbo.estimate_erp_mappings ADD manual_override bit NOT NULL
    CONSTRAINT DF_estimate_erp_mappings_manual_override DEFAULT 0;

IF NOT EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=55)
  INSERT dbo.schema_versions(version,name) VALUES(55,N'Manual ERP category override for labour lines');

COMMIT TRANSACTION;
