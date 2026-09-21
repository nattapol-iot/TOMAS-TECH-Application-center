SET XACT_ABORT ON;
SET NOCOUNT ON;
BEGIN TRANSACTION;
GO
-- Only the owner-executed purge procedure may remove immutable history for one
-- estimate. Normal writes retain the original immutable/revision checks.

CREATE OR ALTER TRIGGER dbo.trg_estimate_revisions_append_only
ON dbo.estimate_revisions
INSTEAD OF UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    -- Scoped deletion exception; never enables updates or inserts.
    IF USER_NAME()=N'dbo' AND SESSION_CONTEXT(N'trial_purge_estimate') IS NOT NULL
       AND NOT EXISTS(SELECT 1 FROM inserted)
       AND NOT EXISTS(SELECT 1 FROM deleted WHERE estimate_id<>TRY_CONVERT(bigint,SESSION_CONTEXT(N'trial_purge_estimate')))
    BEGIN
        DELETE FROM dbo.estimate_revisions WHERE estimate_id=TRY_CONVERT(bigint,SESSION_CONTEXT(N'trial_purge_estimate'));
        RETURN;
    END;

    THROW 51032, 'Estimate revision snapshots are append-only.', 1;
END;
GO

CREATE OR ALTER TRIGGER dbo.trg_cost_items_current_revision_only
ON dbo.cost_items
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    -- Scoped deletion exception; never enables updates or inserts.
    IF USER_NAME()=N'dbo' AND SESSION_CONTEXT(N'trial_purge_estimate') IS NOT NULL
       AND NOT EXISTS(SELECT 1 FROM inserted)
       AND NOT EXISTS(SELECT 1 FROM deleted WHERE estimate_id<>TRY_CONVERT(bigint,SESSION_CONTEXT(N'trial_purge_estimate')))
    BEGIN

        RETURN;
    END;


    IF EXISTS (
        SELECT 1
        FROM inserted i
        INNER JOIN dbo.estimates e ON e.id = i.estimate_id
        WHERE i.revision <> e.revision
    ) OR EXISTS (
        SELECT 1
        FROM deleted d
        INNER JOIN dbo.estimates e ON e.id = d.estimate_id
        WHERE d.revision <> e.revision
    )
        THROW 51112, 'Cost items can be inserted or changed only in the current estimate revision.', 1;
END;
GO

CREATE OR ALTER TRIGGER dbo.trg_manhour_lines_current_revision_only
ON dbo.manhour_lines
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    -- Scoped deletion exception; never enables updates or inserts.
    IF USER_NAME()=N'dbo' AND SESSION_CONTEXT(N'trial_purge_estimate') IS NOT NULL
       AND NOT EXISTS(SELECT 1 FROM inserted)
       AND NOT EXISTS(SELECT 1 FROM deleted WHERE estimate_id<>TRY_CONVERT(bigint,SESSION_CONTEXT(N'trial_purge_estimate')))
    BEGIN

        RETURN;
    END;


    IF EXISTS (
        SELECT 1
        FROM inserted i
        INNER JOIN dbo.estimates e ON e.id = i.estimate_id
        WHERE i.revision <> e.revision
    ) OR EXISTS (
        SELECT 1
        FROM deleted d
        INNER JOIN dbo.estimates e ON e.id = d.estimate_id
        WHERE d.revision <> e.revision
    )
        THROW 51113, 'Man-hour lines can be inserted or changed only in the current estimate revision.', 1;
END;
GO

CREATE OR ALTER TRIGGER dbo.trg_expense_lines_current_revision_only
ON dbo.expense_lines
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    -- Scoped deletion exception; never enables updates or inserts.
    IF USER_NAME()=N'dbo' AND SESSION_CONTEXT(N'trial_purge_estimate') IS NOT NULL
       AND NOT EXISTS(SELECT 1 FROM inserted)
       AND NOT EXISTS(SELECT 1 FROM deleted WHERE estimate_id<>TRY_CONVERT(bigint,SESSION_CONTEXT(N'trial_purge_estimate')))
    BEGIN

        RETURN;
    END;


    IF EXISTS (
        SELECT 1
        FROM inserted i
        INNER JOIN dbo.estimates e ON e.id = i.estimate_id
        WHERE i.revision <> e.revision
    ) OR EXISTS (
        SELECT 1
        FROM deleted d
        INNER JOIN dbo.estimates e ON e.id = d.estimate_id
        WHERE d.revision <> e.revision
    )
        THROW 51114, 'Expense lines can be inserted or changed only in the current estimate revision.', 1;
END;
GO

CREATE OR ALTER TRIGGER dbo.trg_other_cost_lines_current_revision_only
ON dbo.other_cost_lines
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    -- Scoped deletion exception; never enables updates or inserts.
    IF USER_NAME()=N'dbo' AND SESSION_CONTEXT(N'trial_purge_estimate') IS NOT NULL
       AND NOT EXISTS(SELECT 1 FROM inserted)
       AND NOT EXISTS(SELECT 1 FROM deleted WHERE estimate_id<>TRY_CONVERT(bigint,SESSION_CONTEXT(N'trial_purge_estimate')))
    BEGIN

        RETURN;
    END;


    IF EXISTS (
        SELECT 1
        FROM inserted i
        INNER JOIN dbo.estimates e ON e.id = i.estimate_id
        WHERE i.revision <> e.revision
    ) OR EXISTS (
        SELECT 1
        FROM deleted d
        INNER JOIN dbo.estimates e ON e.id = d.estimate_id
        WHERE d.revision <> e.revision
    )
        THROW 51115, 'Other-cost lines can be inserted or changed only in the current estimate revision.', 1;
END;
GO

CREATE OR ALTER TRIGGER dbo.trg_estimate_overhead_snapshots_immutable
ON dbo.estimate_overhead_snapshots
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    -- Scoped deletion exception; never enables updates or inserts.
    IF USER_NAME()=N'dbo' AND SESSION_CONTEXT(N'trial_purge_estimate') IS NOT NULL
       AND NOT EXISTS(SELECT 1 FROM inserted)
       AND NOT EXISTS(SELECT 1 FROM deleted WHERE estimate_id<>TRY_CONVERT(bigint,SESSION_CONTEXT(N'trial_purge_estimate')))
    BEGIN

        RETURN;
    END;

    IF EXISTS (SELECT 1 FROM deleted)
        THROW 51403, 'Estimate overhead snapshots are immutable.', 1;
    IF EXISTS (
        SELECT 1 FROM inserted snapshot
        INNER JOIN dbo.estimates estimate ON estimate.id = snapshot.estimate_id
        WHERE snapshot.revision <> estimate.revision
    )
        THROW 51404, 'Overhead can be snapshotted only for the current estimate revision.', 1;
END;
GO

CREATE OR ALTER TRIGGER dbo.trg_estimate_submission_snapshots_immutable
ON dbo.estimate_submission_snapshots
AFTER UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    -- Scoped deletion exception; never enables updates or inserts.
    IF USER_NAME()=N'dbo' AND SESSION_CONTEXT(N'trial_purge_estimate') IS NOT NULL
       AND NOT EXISTS(SELECT 1 FROM inserted)
       AND NOT EXISTS(SELECT 1 FROM deleted WHERE estimate_id<>TRY_CONVERT(bigint,SESSION_CONTEXT(N'trial_purge_estimate')))
    BEGIN

        RETURN;
    END;

    IF EXISTS(SELECT 1 FROM inserted) OR EXISTS(SELECT 1 FROM deleted)
        THROW 51405, 'Estimate submission snapshots are immutable.', 1;
END;
GO

CREATE OR ALTER TRIGGER dbo.trg_estimate_erp_mappings_current_revision_only
ON dbo.estimate_erp_mappings
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    -- Scoped deletion exception; never enables updates or inserts.
    IF USER_NAME()=N'dbo' AND SESSION_CONTEXT(N'trial_purge_estimate') IS NOT NULL
       AND NOT EXISTS(SELECT 1 FROM inserted)
       AND NOT EXISTS(SELECT 1 FROM deleted WHERE estimate_id<>TRY_CONVERT(bigint,SESSION_CONTEXT(N'trial_purge_estimate')))
    BEGIN

        RETURN;
    END;


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

CREATE OR ALTER PROCEDURE dbo.purge_trial_document
 @kind nvarchar(20), @id bigint, @actor bigint, @execute bit=0
WITH EXECUTE AS OWNER
AS
BEGIN
 SET NOCOUNT ON;
 SET XACT_ABORT ON;
 IF @@TRANCOUNT=0 THROW 51580,'Document purge requires a caller transaction.',1;
 IF @kind NOT IN(N'Inquiry',N'Estimate') THROW 51581,'Invalid document kind.',1;
 IF NOT EXISTS(SELECT 1 FROM dbo.user_effective_roles WHERE user_id=@actor AND code=N'Admin')
   THROW 51582,'Only Admin can permanently delete documents.',1;
 DECLARE @targets TABLE(name sysname PRIMARY KEY, key_column sysname);
 IF @kind=N'Estimate'
   INSERT @targets VALUES(N'estimates',N'id'),(N'cost_items',N'estimate_id'),(N'manhour_lines',N'estimate_id'),
     (N'expense_lines',N'estimate_id'),(N'other_cost_lines',N'estimate_id'),(N'estimate_revisions',N'estimate_id'),
     (N'estimate_assignments',N'estimate_id'),(N'estimate_module_details',N'estimate_id'),
     (N'estimate_erp_groups',N'estimate_id'),(N'estimate_erp_mappings',N'estimate_id'),
     (N'estimate_overhead_snapshots',N'estimate_id'),(N'estimate_submission_snapshots',N'estimate_id');
 ELSE INSERT @targets VALUES(N'inquiries',N'id'),(N'resource_task_sources',N'inquiry_id');
 CREATE TABLE #blockers(source nvarchar(260),count bigint);
 -- Fail closed on every external FK, including references to individual cost lines.
 -- Metadata supplies identifiers; the document value is always parameterized.
 DECLARE @schema sysname,@child sysname,@column sysname,@parent sysname,@parentColumn sysname,@key sysname,@childKey sysname,@statement nvarchar(max);
 DECLARE refs CURSOR LOCAL FAST_FORWARD FOR
 SELECT SCHEMA_NAME(c.schema_id),c.name,cc.name,p.name,pc.name,t.key_column,own.key_column
 FROM sys.foreign_key_columns fk
 JOIN sys.tables c ON c.object_id=fk.parent_object_id
 JOIN sys.columns cc ON cc.object_id=c.object_id AND cc.column_id=fk.parent_column_id
 JOIN sys.tables p ON p.object_id=fk.referenced_object_id AND p.schema_id=SCHEMA_ID(N'dbo')
 JOIN sys.columns pc ON pc.object_id=p.object_id AND pc.column_id=fk.referenced_column_id
 JOIN @targets t ON t.name=p.name
 LEFT JOIN @targets own ON own.name=c.name AND c.schema_id=SCHEMA_ID(N'dbo')
 WHERE NOT(@kind=N'Estimate' AND c.name=N'inquiries' AND cc.name=N'estimate_id' AND c.schema_id=SCHEMA_ID(N'dbo'));
 OPEN refs;
 FETCH NEXT FROM refs INTO @schema,@child,@column,@parent,@parentColumn,@key,@childKey;
 WHILE @@FETCH_STATUS=0
 BEGIN
   SET @statement=N'INSERT #blockers SELECT @source,COUNT_BIG(*) FROM '+QUOTENAME(@schema)+N'.'+QUOTENAME(@child)+
     N' c WITH(UPDLOCK,HOLDLOCK) JOIN dbo.'+QUOTENAME(@parent)+N' p WITH(UPDLOCK,HOLDLOCK) ON c.'+QUOTENAME(@column)+N'=p.'+QUOTENAME(@parentColumn)+
     N' WHERE p.'+QUOTENAME(@key)+N'=@id'+
     CASE WHEN @childKey IS NULL THEN N'' ELSE N' AND (c.'+QUOTENAME(@childKey)+N'<>@id OR c.'+QUOTENAME(@childKey)+N' IS NULL)' END+N' HAVING COUNT_BIG(*)>0;';
   DECLARE @source nvarchar(260)=@schema+N'.'+@child;
   EXEC sp_executesql @statement,N'@id bigint,@source nvarchar(260)',@id,@source;
   FETCH NEXT FROM refs INTO @schema,@child,@column,@parent,@parentColumn,@key,@childKey;
 END;
 CLOSE refs; DEALLOCATE refs;
 IF @execute=0 BEGIN SELECT source,SUM(count) count FROM #blockers GROUP BY source ORDER BY source; RETURN; END;
 IF EXISTS(SELECT 1 FROM #blockers) THROW 51583,'Linked records prevent permanent deletion.',1;
 BEGIN TRY
   IF @kind=N'Estimate'
   BEGIN
     EXEC sys.sp_set_session_context @key=N'trial_purge_estimate',@value=@id;
     UPDATE dbo.inquiries SET estimate_id=NULL,status=CASE WHEN status IN(N'Cancelled') OR deleted_at IS NOT NULL OR archived_at IS NOT NULL THEN status ELSE N'New' END,
       progress=CASE WHEN status=N'Cancelled' OR deleted_at IS NOT NULL OR archived_at IS NOT NULL THEN progress ELSE 0 END,updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE estimate_id=@id;
     DELETE FROM dbo.estimate_erp_groups WHERE estimate_id=@id;
     DELETE FROM dbo.estimate_erp_mappings WHERE estimate_id=@id;
     DELETE FROM dbo.estimate_module_details WHERE estimate_id=@id;
     DELETE FROM dbo.estimate_assignments WHERE estimate_id=@id;
     DELETE FROM dbo.cost_items WHERE estimate_id=@id;
     DELETE FROM dbo.manhour_lines WHERE estimate_id=@id;
     DELETE FROM dbo.expense_lines WHERE estimate_id=@id;
     DELETE FROM dbo.other_cost_lines WHERE estimate_id=@id;
     DELETE FROM dbo.estimate_submission_snapshots WHERE estimate_id=@id;
     DELETE FROM dbo.estimate_overhead_snapshots WHERE estimate_id=@id;
     DELETE FROM dbo.estimate_revisions WHERE estimate_id=@id;
     DELETE FROM dbo.estimates WHERE id=@id;
     EXEC sys.sp_set_session_context @key=N'trial_purge_estimate',@value=NULL;
   END
   ELSE
   BEGIN
     DELETE FROM dbo.resource_task_sources WHERE inquiry_id=@id;
     DELETE FROM dbo.inquiries WHERE id=@id;
   END;
 END TRY
 BEGIN CATCH
   EXEC sys.sp_set_session_context @key=N'trial_purge_estimate',@value=NULL;
   THROW;
 END CATCH;
 SELECT source,count FROM #blockers;
END;
GO
IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
 GRANT EXECUTE ON dbo.purge_trial_document TO iot_team_app_role;
IF NOT EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=58)
 INSERT dbo.schema_versions(version,name) VALUES(58,N'Admin permanent deletion of trial documents');
COMMIT TRANSACTION;
