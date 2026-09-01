SET XACT_ABORT ON;
SET NOCOUNT ON;
BEGIN TRANSACTION;
IF EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=32)
BEGIN COMMIT; RETURN; END;
IF NOT EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=8)
  THROW 51320, 'Estimate integrity migration 008 is required.', 1;

-- Historical rates are accepted only when tied to an immutable, audited Excel import.
-- Normal internal rates still require Rate Master. Submission and approval are unchanged.
DECLARE @definition nvarchar(max)=OBJECT_DEFINITION(OBJECT_ID(N'dbo.fn_estimate_validation'));
DECLARE @old nvarchar(max)=N'WHERE l.provider = N''Internal''';
IF @definition IS NULL OR CHARINDEX(@old,@definition)=0
  THROW 51321, 'Expected internal-rate validation was not found.', 1;
IF CHARINDEX(@old,@definition,CHARINDEX(@old,@definition)+1)>0
  THROW 51322, 'Ambiguous validation definition; migration stopped.', 1;
DECLARE @new nvarchar(max)=N'WHERE l.provider = N''Internal''
      AND NOT EXISTS (
          SELECT 1 FROM dbo.audit_log imported
          WHERE imported.entity_type=N''ManhourLine'' AND imported.entity_id=l.id
            AND imported.action=N''Created''
            AND JSON_VALUE(imported.after_json,''$.kind'')=N''manhour''
            AND LEN(JSON_VALUE(imported.after_json,''$.sourceHash''))=64
            AND l.level=N''Imported Excel rate''
            AND l.department=JSON_VALUE(imported.after_json,''$.department'')
            AND l.cost_type=JSON_VALUE(imported.after_json,''$.costType'')
            AND l.price_date=TRY_CONVERT(date,JSON_VALUE(imported.after_json,''$.sourceDate''))
            AND l.daily_rate=TRY_CONVERT(decimal(19,4),JSON_VALUE(imported.after_json,''$.unitCost''))
      )';
SET @definition=REPLACE(@definition,@old,@new);
-- SQL Server can persist CREATE OR ALTER as CREATE + multiple spaces.
DECLARE @create int=CHARINDEX(N'CREATE',@definition), @function int=CHARINDEX(N'FUNCTION dbo.fn_estimate_validation',@definition);
IF @create>0 AND @function>@create
  SET @definition=STUFF(@definition,@create,@function-@create,N'ALTER ');
EXEC sp_executesql @definition;
INSERT dbo.schema_versions(version,name) VALUES(32,N'Estimate Excel import audited historical rate provenance');
COMMIT;
