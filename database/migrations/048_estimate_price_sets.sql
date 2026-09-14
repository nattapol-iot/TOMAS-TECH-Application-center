SET XACT_ABORT ON;
SET NOCOUNT ON;
GO
IF NOT EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=47) THROW 51480,'Migration 047 required.',1;
BEGIN TRANSACTION;
ALTER TABLE dbo.cost_items ADD price_set_key uniqueidentifier NULL, is_price_set bit NOT NULL CONSTRAINT DF_cost_price_set DEFAULT 0, qty_per_set decimal(19,4) NULL;
ALTER TABLE dbo.cost_items ADD CONSTRAINT CK_cost_price_set CHECK (
 (price_set_key IS NULL AND is_price_set=0 AND qty_per_set IS NULL) OR
 (price_set_key IS NOT NULL AND ((is_price_set=1 AND qty_per_set IS NULL) OR (is_price_set=0 AND qty_per_set IS NOT NULL AND qty_per_set>0 AND unit_cost=0))));
CREATE UNIQUE INDEX UX_cost_price_set_header ON dbo.cost_items(estimate_id,revision,price_set_key) WHERE is_price_set=1 AND deleted_at IS NULL;
DECLARE @definition nvarchar(max)=OBJECT_DEFINITION(OBJECT_ID(N'dbo.fn_estimate_validation'));
IF @definition IS NULL OR CHARINDEX(N'WHERE l.unit_cost <= 0',@definition)=0 THROW 51481,'Validation price rule not found.',1;
SET @definition=REPLACE(@definition,N'WHERE l.unit_cost <= 0',N'WHERE l.unit_cost <= 0 AND (l.price_set_key IS NULL OR l.is_price_set=1)');
DECLARE @create int=CHARINDEX(N'CREATE',@definition),@fn int=CHARINDEX(N'FUNCTION dbo.fn_estimate_validation',@definition);
IF @create>0 AND @fn>@create SET @definition=STUFF(@definition,@create,@fn-@create,N'ALTER ');
EXEC sp_executesql @definition;
INSERT dbo.schema_versions(version,name) VALUES(48,N'Estimate supplier price sets');
COMMIT;
GO
