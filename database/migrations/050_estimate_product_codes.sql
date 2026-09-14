SET XACT_ABORT ON;
SET NOCOUNT ON;
GO
IF NOT EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=49) THROW 51500,'Migration 049 required.',1;
BEGIN TRANSACTION;
DROP INDEX UX_cost_items_code ON dbo.cost_items;
CREATE INDEX IX_cost_items_code ON dbo.cost_items(estimate_id,revision,item_code) WHERE deleted_at IS NULL;

-- Restore only codes explicitly recorded as automatically renamed at creation.
-- Never strip numeric suffixes by pattern; legitimate product model suffixes remain intact.
SELECT c.id, c.estimate_id, e.estimate_no, c.item_code old_code,
 MIN(j.original) original, MIN(a.id) source_audit_id, MIN(a.actor_id) actor_id
INTO #repairs
FROM dbo.cost_items c
JOIN dbo.estimates e ON e.id=c.estimate_id AND e.revision=c.revision
JOIN dbo.audit_log a ON a.entity_type=N'Estimate' AND a.entity_id=e.id
 AND a.action IN(N'Module template applied',N'Copied from estimate')
 AND a.actor_id=c.created_by AND a.occurred_at>=c.created_at
 AND a.occurred_at<=DATEADD(minute,5,c.created_at)
CROSS APPLY OPENJSON(CASE WHEN ISJSON(a.after_json)=1 THEN a.after_json ELSE N'{}' END,N'$.renamedItemCodes')
 WITH(original nvarchar(100),applied nvarchar(100)) j
WHERE c.deleted_at IS NULL AND e.deleted_at IS NULL AND c.is_price_set=0
 AND e.status IN(N'Draft',N'Engineering Input',N'Revision Required')
 AND c.item_code COLLATE Latin1_General_100_BIN2=j.applied COLLATE Latin1_General_100_BIN2
 AND NULLIF(j.original,N'') IS NOT NULL AND j.original<>j.applied
 AND (a.action=N'Copied from estimate' OR
   (c.price_source=N'Master Template' AND c.reference_no=JSON_VALUE(a.after_json,N'$.template')
    AND c.module=JSON_VALUE(a.after_json,N'$.module')))
 AND NOT EXISTS(SELECT 1 FROM dbo.audit_log changed
   WHERE changed.entity_type=N'CostItem' AND changed.entity_id=c.id AND changed.occurred_at>=a.occurred_at
   AND changed.action=N'Updated' AND
   ISNULL(JSON_VALUE(changed.before_json,N'$.item_code'),N'')<>ISNULL(JSON_VALUE(changed.after_json,N'$.item_code'),N''))
GROUP BY c.id,c.estimate_id,e.estimate_no,c.item_code
HAVING COUNT(DISTINCT j.original COLLATE Latin1_General_100_BIN2)=1;

INSERT dbo.audit_log(actor_id,entity_type,entity_id,entity_no,action,before_json,after_json,reason)
SELECT r.actor_id,N'CostItem',r.id,r.estimate_no,N'Automatic product code restored',
 (SELECT r.old_code item_code FOR JSON PATH,WITHOUT_ARRAY_WRAPPER),
 (SELECT r.original item_code,r.source_audit_id sourceAuditId FOR JSON PATH,WITHOUT_ARRAY_WRAPPER),
 N'Migration 050: restore exact product code from recorded automatic rename; quantities and prices unchanged.'
FROM #repairs r;
UPDATE c SET item_code=r.original,updated_at=SYSUTCDATETIME()
FROM dbo.cost_items c JOIN #repairs r ON r.id=c.id;
UPDATE e SET updated_at=SYSUTCDATETIME()
FROM dbo.estimates e WHERE EXISTS(SELECT 1 FROM #repairs r WHERE r.estimate_id=e.id);
INSERT dbo.schema_versions(version,name) VALUES(50,N'Preserve product codes across estimate modules');
COMMIT;
GO
