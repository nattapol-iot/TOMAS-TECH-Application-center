SET XACT_ABORT ON;
SET NOCOUNT ON;
BEGIN TRANSACTION;
-- The exception exists only inside the owner-executed cascade procedure and is
-- restricted to the exact primary keys in its local temporary deletion scope.
DECLARE @trigger sysname,@schema sysname,@table sysname,@object int,@instead bit,@definition nvarchar(max),@body int,@keys nvarchar(max),@guard nvarchar(max);
DECLARE triggers_to_wrap CURSOR LOCAL FAST_FORWARD FOR
 SELECT tr.name,SCHEMA_NAME(t.schema_id),t.name,t.object_id,tr.is_instead_of_trigger,sm.definition
 FROM sys.triggers tr JOIN sys.tables t ON t.object_id=tr.parent_id
 JOIN sys.sql_modules sm ON sm.object_id=tr.object_id
 WHERE EXISTS(SELECT 1 FROM sys.trigger_events ev WHERE ev.object_id=tr.object_id AND ev.type_desc=N'DELETE')
 AND t.name NOT IN(N'audit_log',N'mat_audit',N'document_lifecycle_events')
 AND sm.definition NOT LIKE N'%trial_delete_scope%';
OPEN triggers_to_wrap;
FETCH NEXT FROM triggers_to_wrap INTO @trigger,@schema,@table,@object,@instead,@definition;
WHILE @@FETCH_STATUS=0
BEGIN
 SELECT @keys=STRING_AGG(CONVERT(nvarchar(max),N'd.'+QUOTENAME(c.name)+N' AS '+QUOTENAME(c.name)),N',') WITHIN GROUP(ORDER BY ic.key_ordinal)
 FROM sys.indexes ix JOIN sys.index_columns ic ON ic.object_id=ix.object_id AND ic.index_id=ix.index_id
 JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id
 WHERE ix.object_id=@object AND ix.is_primary_key=1;
 IF @keys IS NULL THROW 51590,'Cascade trigger table requires a primary key.',1;
 SET @definition=REPLACE(@definition,CHAR(13),N'');
 DECLARE @start int=CHARINDEX(N'TRIGGER '+@schema+N'.'+@trigger,@definition);
 IF @start=0 SET @start=CHARINDEX(N'TRIGGER '+QUOTENAME(@schema)+N'.'+QUOTENAME(@trigger),@definition);
 IF @start=0 THROW 51591,'Cannot locate cascade trigger header.',1;
 SET @definition=N'CREATE OR ALTER '+SUBSTRING(@definition,@start,LEN(@definition));
 SET @body=PATINDEX(N'%[ '+CHAR(10)+CHAR(9)+N']AS[ '+CHAR(10)+CHAR(9)+N']%',@definition COLLATE Latin1_General_100_CI_AS);
 IF @body=0 THROW 51591,'Cannot locate cascade trigger body.',1;
 SET @guard=N'
 BEGIN
 IF USER_NAME()=N''dbo'' AND OBJECT_ID(N''tempdb..#trial_delete_scope'') IS NOT NULL
 BEGIN
   IF NOT EXISTS(SELECT 1 FROM inserted) AND NOT EXISTS(SELECT 1 FROM deleted d WHERE NOT EXISTS(
     SELECT 1 FROM #trial_delete_scope s WHERE s.object_id='+CONVERT(nvarchar(20),@object)+N' AND s.key_hash=HASHBYTES(''SHA2_256'',(SELECT '+@keys+N' FOR JSON PATH,INCLUDE_NULL_VALUES,WITHOUT_ARRAY_WRAPPER))))
   BEGIN '+CASE WHEN @instead=1 THEN N'DELETE x FROM '+QUOTENAME(@schema)+N'.'+QUOTENAME(@table)+N' x WHERE EXISTS(SELECT 1 FROM deleted d WHERE (SELECT '+REPLACE(@keys,N'd.',N'x.')+N' FOR JSON PATH,INCLUDE_NULL_VALUES,WITHOUT_ARRAY_WRAPPER)=(SELECT '+@keys+N' FOR JSON PATH,INCLUDE_NULL_VALUES,WITHOUT_ARRAY_WRAPPER));' ELSE N'' END+N'
     RETURN;
   END;
 END;
 ';
 SET @definition=STUFF(@definition,@body+3,0,@guard)+N'
 END;';
 -- OBJECT_DEFINITION can start CREATE, ALTER or CREATE OR ALTER.
 SET @definition=STUFF(@definition,1,CHARINDEX(N'TRIGGER',@definition)-1,N'CREATE OR ALTER ');
 EXEC sp_executesql @definition;
 FETCH NEXT FROM triggers_to_wrap INTO @trigger,@schema,@table,@object,@instead,@definition;
END;
CLOSE triggers_to_wrap; DEALLOCATE triggers_to_wrap;

EXEC(N'CREATE OR ALTER PROCEDURE dbo.purge_trial_inquiry
 @kind nvarchar(20),@id bigint,@actor bigint,@execute bit=0
WITH EXECUTE AS OWNER
AS
BEGIN
 SET NOCOUNT ON;
 SET XACT_ABORT ON;
 IF @@TRANCOUNT=0 THROW 51580,''Cascade requires a caller transaction.'',1;
 IF @kind<>N''Inquiry'' THROW 51581,''This cascade is only for Inquiry.'',1;
 IF NOT EXISTS(SELECT 1 FROM dbo.user_effective_roles WHERE user_id=@actor AND code=N''Admin'') THROW 51582,''Only Admin can delete an inquiry tree.'',1;
 CREATE TABLE #trial_delete_scope(object_id int NOT NULL,key_hash varbinary(32) NOT NULL,row_version varbinary(8) NULL,PRIMARY KEY(object_id,key_hash));
 CREATE TABLE #keys(object_id int PRIMARY KEY,name nvarchar(260),expression nvarchar(max),version_expression nvarchar(200));
 INSERT #keys
 SELECT t.object_id,QUOTENAME(SCHEMA_NAME(t.schema_id))+N''.''+QUOTENAME(t.name),
   N''(SELECT ''+STRING_AGG(CONVERT(nvarchar(max),N''x.''+QUOTENAME(c.name)+N'' AS ''+QUOTENAME(c.name)),N'','') WITHIN GROUP(ORDER BY ic.key_ordinal)+N'' FOR JSON PATH,INCLUDE_NULL_VALUES,WITHOUT_ARRAY_WRAPPER)'',
   CASE WHEN EXISTS(SELECT 1 FROM sys.columns rv WHERE rv.object_id=t.object_id AND rv.system_type_id=189) THEN N''CONVERT(varbinary(8),x.''+QUOTENAME((SELECT TOP(1) name FROM sys.columns rv WHERE rv.object_id=t.object_id AND rv.system_type_id=189))+N'')'' ELSE N''NULL'' END
 FROM sys.tables t JOIN sys.indexes ix ON ix.object_id=t.object_id AND ix.is_primary_key=1
 JOIN sys.index_columns ic ON ic.object_id=ix.object_id AND ic.index_id=ix.index_id
 JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id
 WHERE t.schema_id=SCHEMA_ID(N''dbo'') GROUP BY t.object_id,t.schema_id,t.name;
 DECLARE @q nvarchar(max),@child int,@parent int,@join nvarchar(max),@childName nvarchar(260),@parentName nvarchar(260),@childKey nvarchar(max),@parentKey nvarchar(max),@version nvarchar(200),@added int=1,@changed int;
 SELECT @q=N''INSERT #trial_delete_scope SELECT ''+CONVERT(nvarchar(20),object_id)+N'',HASHBYTES(''''SHA2_256'''',''+expression+N''),''+version_expression+N'' FROM dbo.inquiries x WITH(UPDLOCK,HOLDLOCK) WHERE id=@id;'' FROM #keys WHERE object_id=OBJECT_ID(N''dbo.inquiries'');
 EXEC sp_executesql @q,N''@id bigint'',@id;
 IF NOT EXISTS(SELECT 1 FROM #trial_delete_scope) THROW 51592,''Inquiry not found.'',1;
 CREATE TABLE #edges(child int,parent int,join_expression nvarchar(max));
 INSERT #edges
 SELECT fk.parent_object_id,fk.referenced_object_id,
 STRING_AGG(CONVERT(nvarchar(max),N''x.''+QUOTENAME(cc.name)+N''=p.''+QUOTENAME(pc.name)),N'' AND '') WITHIN GROUP(ORDER BY fc.constraint_column_id)
 FROM sys.foreign_keys fk JOIN sys.foreign_key_columns fc ON fc.constraint_object_id=fk.object_id
 JOIN sys.columns cc ON cc.object_id=fc.parent_object_id AND cc.column_id=fc.parent_column_id
 JOIN sys.columns pc ON pc.object_id=fc.referenced_object_id AND pc.column_id=fc.referenced_column_id
 -- CRM and supplier price sources are upstream/reusable records, not work created by the inquiry.
 WHERE fk.parent_object_id NOT IN(OBJECT_ID(N''dbo.crm_activities''),OBJECT_ID(N''dbo.supplier_quotations''),OBJECT_ID(N''dbo.inquiries''),OBJECT_ID(N''dbo.audit_log''),OBJECT_ID(N''dbo.mat_audit''),OBJECT_ID(N''dbo.document_lifecycle_events''))
 -- current_file is a back-pointer; file ownership flows document -> files.
 AND fk.name<>N''FK_signable_documents_current_file''
 GROUP BY fk.object_id,fk.parent_object_id,fk.referenced_object_id;
 -- Legacy ledger/notification references use document numbers or polymorphic IDs rather than FKs.
 INSERT #edges VALUES
 (OBJECT_ID(N''dbo.stock_txns''),OBJECT_ID(N''dbo.grns''),N''x.ref_no=p.grn_no AND x.txn_type IN(N''''GRN_RECEIPT'''',N''''GRN_QUARANTINE'''')''),
 (OBJECT_ID(N''dbo.notifications''),OBJECT_ID(N''dbo.inquiries''),N''x.entity_type=N''''Inquiry'''' AND x.entity_id=p.id''),
 (OBJECT_ID(N''dbo.notifications''),OBJECT_ID(N''dbo.estimates''),N''x.entity_type=N''''Estimate'''' AND x.entity_id=p.id''),
 (OBJECT_ID(N''dbo.notifications''),OBJECT_ID(N''dbo.projects''),N''x.entity_type=N''''Project'''' AND x.entity_id=p.id'');
 WHILE @added>0
 BEGIN
   SET @added=0;
   DECLARE expand_scope CURSOR LOCAL FAST_FORWARD FOR
   SELECT e.child,e.parent,e.join_expression,c.name,p.name,c.expression,REPLACE(p.expression,N''x.'',N''p.''),c.version_expression
   FROM #edges e JOIN #keys c ON c.object_id=e.child JOIN #keys p ON p.object_id=e.parent
   WHERE EXISTS(SELECT 1 FROM #trial_delete_scope s WHERE s.object_id=e.parent);
   OPEN expand_scope;
   FETCH NEXT FROM expand_scope INTO @child,@parent,@join,@childName,@parentName,@childKey,@parentKey,@version;
   WHILE @@FETCH_STATUS=0
   BEGIN
     SET @q=N''INSERT #trial_delete_scope SELECT DISTINCT @child,HASHBYTES(''''SHA2_256'''',''+@childKey+N''),''+@version+N'' FROM ''+@childName+N'' x WITH(UPDLOCK,HOLDLOCK) JOIN ''+@parentName+N'' p WITH(UPDLOCK,HOLDLOCK) ON ''+@join+N''
       JOIN #trial_delete_scope target ON target.object_id=@parent AND target.key_hash=HASHBYTES(''''SHA2_256'''',''+@parentKey+N'')
       WHERE NOT EXISTS(SELECT 1 FROM #trial_delete_scope present WHERE present.object_id=@child AND present.key_hash=HASHBYTES(''''SHA2_256'''',''+@childKey+N'')); SET @changed=@@ROWCOUNT;'';
     EXEC sp_executesql @q,N''@child int,@parent int,@changed int OUTPUT'',@child,@parent,@changed OUTPUT;
     SET @added+=@changed;
     FETCH NEXT FROM expand_scope INTO @child,@parent,@join,@childName,@parentName,@childKey,@parentKey,@version;
   END;
   CLOSE expand_scope; DEALLOCATE expand_scope;
 END;
 DECLARE @token varchar(64)=CONVERT(varchar(64),HASHBYTES(''SHA2_256'',(SELECT object_id,key_hash,row_version FROM #trial_delete_scope ORDER BY object_id,key_hash FOR JSON PATH)),2);
 -- Return the same manifest on preview/execution; callers include it in the confirmation token and audit.
 SELECT REPLACE(REPLACE(k.name,N''['',N''''),N'']'',N'''') source,COUNT(*) count,@token scopeToken FROM #trial_delete_scope s JOIN #keys k ON k.object_id=s.object_id GROUP BY k.name ORDER BY k.name;
 IF @execute=0 RETURN;
 -- Preserve upstream CRM/supplier records, unlink them and break nullable cycles.
 UPDATE dbo.crm_activities SET inquiry_id=NULL WHERE inquiry_id=@id;
 UPDATE o SET estimate_id=NULL FROM dbo.crm_activities o JOIN dbo.estimates e ON e.id=o.estimate_id WHERE e.inquiry_id=@id;
 UPDATE o SET project_id=NULL FROM dbo.crm_activities o JOIN dbo.projects x ON x.id=o.project_id
 WHERE EXISTS(SELECT 1 FROM #trial_delete_scope s WHERE s.object_id=OBJECT_ID(N''dbo.projects'') AND s.key_hash=HASHBYTES(''SHA2_256'',(SELECT x.id AS id FOR JSON PATH,INCLUDE_NULL_VALUES,WITHOUT_ARRAY_WRAPPER)));
 UPDATE dbo.supplier_quotations SET inquiry_id=NULL WHERE inquiry_id=@id;
 UPDATE i SET estimate_id=NULL FROM dbo.inquiries i JOIN dbo.estimates e ON e.id=i.estimate_id WHERE e.inquiry_id=@id;
 UPDATE x SET current_file_id=NULL FROM dbo.signable_documents x WHERE EXISTS(SELECT 1 FROM #trial_delete_scope s WHERE s.object_id=OBJECT_ID(N''dbo.signable_documents'') AND s.key_hash=HASHBYTES(''SHA2_256'',(SELECT x.id AS id FOR JSON PATH,INCLUDE_NULL_VALUES,WITHOUT_ARRAY_WRAPPER)));
 CREATE TABLE #remaining(object_id int PRIMARY KEY);
 INSERT #remaining SELECT DISTINCT object_id FROM #trial_delete_scope;
 -- Removing entire table subsets handles self-referencing trees in one DELETE.
 WHILE EXISTS(SELECT 1 FROM #remaining)
 BEGIN
   SET @child=NULL;
   SELECT TOP(1) @child=r.object_id FROM #remaining r
   WHERE NOT EXISTS(SELECT 1 FROM #edges e JOIN #remaining child ON child.object_id=e.child WHERE e.parent=r.object_id AND e.child<>e.parent)
   ORDER BY r.object_id;
   IF @child IS NULL THROW 51593,''Unexpected cyclic dependency in inquiry tree.'',1;
   SELECT @q=N''DELETE x FROM ''+name+N'' x WHERE EXISTS(SELECT 1 FROM #trial_delete_scope s WHERE s.object_id=@child AND s.key_hash=HASHBYTES(''''SHA2_256'''',''+expression+N''));'' FROM #keys WHERE object_id=@child;
   EXEC sp_executesql @q,N''@child int'',@child;
   DELETE FROM #remaining WHERE object_id=@child;
 END;
END;');
IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL GRANT EXECUTE ON dbo.purge_trial_inquiry TO iot_team_app_role;
IF NOT EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=59)
 INSERT dbo.schema_versions(version,name) VALUES(59,N'Admin inquiry cascade deletion and row confirmation');
COMMIT TRANSACTION;
