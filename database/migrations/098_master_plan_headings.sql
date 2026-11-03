-- Migration 098: a project's plan is its Master Plan headings, with the team's work under them.
--
-- The owner decided (2026-11-03) that the Master Plan lists only the plan's main headings, with the dates promised to
-- the customer, and that the Team Plan breaks each heading into tasks with a member and the tasks into functions. One
-- schedule tree holds both: a heading is a top-level phase whose own plan dates are the customer's. Projects were
-- created with two phases instead, "Master Plan" (the customer's rows) and "Team plan" (who does what), and rows made
-- in Project Schedule sat beside them. dbo.usp_schedule_convert_to_headings converts one project, keeping every row's
-- progress, people and links:
--   * each row of the old Master Plan phase becomes a heading, its dates the customer's. A row that cannot be a
--     heading -- progress, a person in charge, a predecessor, linked work, a member's own task under it -- stays as a
--     task under a new heading of the same name and dates;
--   * every other top-level task becomes a heading the same way or, when it cannot, waits under the unsorted heading;
--   * the old Team plan phase becomes the unsorted heading (UNSORTED_HEADING in backend-node/src/schedule-phases.ts,
--     Thai for "not filed under a heading yet"): its tasks keep their members and progress until the project
--     manager drags them under the right heading in Project Schedule. An empty one goes;
--   * the emptied Master Plan phase goes.
-- Every project is converted once below. The procedure stays so the conversion can be checked against rows built the
-- old way (backend-node/tests/project-document-carryover-integration.ts).

SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 97)
    THROW 51980, 'Migration 097 must be applied before migration 098.', 1;
GO

CREATE OR ALTER PROCEDURE dbo.usp_schedule_convert_to_headings
    @project_id bigint
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    -- UNSORTED_HEADING, spelled by code point so the script reads the same in any client code page.
    DECLARE @unsorted nvarchar(500) = NCHAR(0x0E22) + NCHAR(0x0E31) + NCHAR(0x0E07) + NCHAR(0x0E44) + NCHAR(0x0E21) + NCHAR(0x0E48) + NCHAR(0x0E08)
        + NCHAR(0x0E31) + NCHAR(0x0E14) + NCHAR(0x0E2B) + NCHAR(0x0E31) + NCHAR(0x0E27) + NCHAR(0x0E02) + NCHAR(0x0E49) + NCHAR(0x0E2D);
    DECLARE @now datetime2 = SYSUTCDATETIME();
    DECLARE @master bigint = (SELECT TOP (1) id FROM dbo.schedule_tasks
        WHERE project_id = @project_id AND parent_id IS NULL AND kind = N'phase' AND name = N'Master Plan' AND deleted_at IS NULL ORDER BY id);
    DECLARE @team bigint = (SELECT TOP (1) id FROM dbo.schedule_tasks
        WHERE project_id = @project_id AND parent_id IS NULL AND kind = N'phase' AND name = N'Team plan' AND deleted_at IS NULL ORDER BY id);
    IF @master IS NULL AND @team IS NULL AND NOT EXISTS (SELECT 1 FROM dbo.schedule_tasks
        WHERE project_id = @project_id AND parent_id IS NULL AND kind = N'task' AND deleted_at IS NULL)
        RETURN;

    -- The new top of the plan, in the plan's order: the Master Plan's rows where the phase stood, then the rest.
    DECLARE @top TABLE (
        seq int IDENTITY(1, 1) PRIMARY KEY, id bigint NOT NULL, from_master bit NOT NULL, is_task bit NOT NULL,
        in_place bit NOT NULL DEFAULT 0, too_deep bit NOT NULL DEFAULT 0, heading_id bigint NULL);
    INSERT @top (id, from_master, is_task)
    SELECT x.id, x.from_master, x.is_task
    FROM (
        SELECT t.id, CAST(0 AS bit) AS from_master, CAST(CASE WHEN t.kind = N'task' THEN 1 ELSE 0 END AS bit) AS is_task,
            t.sort_order AS k1, 0 AS k2, t.id AS k3
        FROM dbo.schedule_tasks t
        WHERE t.project_id = @project_id AND t.parent_id IS NULL AND t.deleted_at IS NULL AND t.kind IN (N'phase', N'task')
          AND t.id <> ISNULL(@master, 0) AND t.id <> ISNULL(@team, 0)
        UNION ALL
        SELECT c.id, CAST(1 AS bit), CAST(1 AS bit), m.sort_order, c.sort_order, c.id
        FROM dbo.schedule_tasks c
        INNER JOIN dbo.schedule_tasks m ON m.id = c.parent_id
        WHERE m.id = @master AND c.deleted_at IS NULL AND c.kind = N'task'
    ) x
    ORDER BY x.k1, x.k2, x.k3;

    -- A task becomes a heading in place only while nothing hangs on it that a heading cannot hold.
    UPDATE top_rows SET in_place = 1
    FROM @top top_rows
    INNER JOIN dbo.schedule_tasks t ON t.id = top_rows.id
    WHERE top_rows.is_task = 1
      AND t.status = N'Not Started' AND t.percent_done = 0 AND t.actual_start IS NULL AND t.actual_end IS NULL AND t.actual_man_days = 0
      AND t.start_mode = N'manual' AND t.predecessor_id IS NULL AND t.plan_man_days = 0
      AND NOT EXISTS (SELECT 1 FROM dbo.schedule_task_pics p WHERE p.task_id = t.id)
      AND NOT EXISTS (SELECT 1 FROM dbo.schedule_tasks c WHERE c.parent_id = t.id AND c.kind = N'detail' AND c.deleted_at IS NULL)
      AND NOT EXISTS (SELECT 1 FROM dbo.resource_tasks r WHERE r.schedule_task_id = t.id)
      AND NOT EXISTS (SELECT 1 FROM dbo.signable_documents d WHERE d.schedule_task_id = t.id)
      AND NOT EXISTS (SELECT 1 FROM dbo.unified_reports u WHERE u.schedule_task_id = t.id)
      AND NOT EXISTS (SELECT 1 FROM dbo.schedule_updates u WHERE u.task_id = t.id AND u.field = N'request' AND u.request_days > 0 AND u.answer IS NULL);

    -- A top-level task with five levels of tasks under it stays where it is: one level deeper would pass the six-level limit.
    WITH below AS (
        SELECT top_rows.id AS root_id, c.id, 1 AS level
        FROM @top top_rows
        INNER JOIN dbo.schedule_tasks c ON c.parent_id = top_rows.id AND c.deleted_at IS NULL AND c.kind <> N'detail'
        WHERE top_rows.is_task = 1 AND top_rows.from_master = 0
        UNION ALL
        SELECT b.root_id, c.id, b.level + 1
        FROM below b
        INNER JOIN dbo.schedule_tasks c ON c.parent_id = b.id AND c.deleted_at IS NULL AND c.kind <> N'detail'
    )
    UPDATE top_rows SET too_deep = 1
    FROM @top top_rows
    WHERE top_rows.in_place = 0 AND EXISTS (SELECT 1 FROM below b WHERE b.root_id = top_rows.id AND b.level >= 5)
    OPTION (MAXRECURSION 100);

    -- A Master Plan row that cannot be a heading keeps its place under a new heading of its name and dates.
    DECLARE @wrapped TABLE (task_id bigint PRIMARY KEY, heading_id bigint NOT NULL);
    MERGE dbo.schedule_tasks AS target
    USING (
        SELECT t.id, t.name, t.created_by, t.updated_by,
            CASE WHEN t.start_mode = N'manual' THEN t.plan_start END AS plan_start,
            CASE WHEN t.start_mode = N'manual' AND t.plan_start IS NOT NULL THEN t.plan_days ELSE 1 END AS plan_days
        FROM @top top_rows
        INNER JOIN dbo.schedule_tasks t ON t.id = top_rows.id
        WHERE top_rows.from_master = 1 AND top_rows.in_place = 0
    ) AS source
    ON 1 = 0
    WHEN NOT MATCHED THEN
        INSERT (project_id, parent_id, sort_order, kind, name, is_milestone, origin, created_by, visibility, plan_start, plan_days,
            start_mode, predecessor_id, lag_days, pic_external, plan_man_days, updated_by)
        VALUES (@project_id, NULL, 0, N'phase', source.name, 0, N'PM', source.created_by, N'Customer', source.plan_start, source.plan_days,
            N'manual', NULL, 0, N'', 0, source.updated_by)
    OUTPUT source.id, inserted.id INTO @wrapped (task_id, heading_id);
    UPDATE t SET parent_id = w.heading_id, sort_order = 1, updated_at = @now
    FROM dbo.schedule_tasks t
    INNER JOIN @wrapped w ON w.task_id = t.id;

    UPDATE t SET kind = N'phase', parent_id = NULL, is_milestone = 0, start_mode = N'manual', predecessor_id = NULL, lag_days = 0,
        pic_external = N'', plan_man_days = 0, visibility = CASE WHEN top_rows.from_master = 1 THEN N'Customer' ELSE t.visibility END,
        updated_at = @now
    FROM dbo.schedule_tasks t
    INNER JOIN @top top_rows ON top_rows.id = t.id
    WHERE top_rows.in_place = 1;

    -- The heading rows wait under: the old Team plan phase, or a new one when only other rows need it.
    DECLARE @unsorted_id bigint = @team;
    IF @unsorted_id IS NULL AND EXISTS (SELECT 1 FROM @top WHERE from_master = 0 AND is_task = 1 AND in_place = 0 AND too_deep = 0)
    BEGIN
        INSERT dbo.schedule_tasks (project_id, parent_id, sort_order, kind, name, is_milestone, origin, created_by, visibility, plan_start,
            plan_days, start_mode, predecessor_id, lag_days, pic_external, plan_man_days, updated_by)
        SELECT @project_id, NULL, 0, N'phase', @unsorted, 0, N'PM', p.manager_id, N'Internal', NULL, 1, N'manual', NULL, 0, N'', 0, p.manager_id
        FROM dbo.projects p
        WHERE p.id = @project_id;
        SET @unsorted_id = SCOPE_IDENTITY();
    END;
    UPDATE t SET parent_id = @unsorted_id, sort_order = 100000 + top_rows.seq, updated_at = @now
    FROM dbo.schedule_tasks t
    INNER JOIN @top top_rows ON top_rows.id = t.id
    WHERE top_rows.from_master = 0 AND top_rows.is_task = 1 AND top_rows.in_place = 0 AND top_rows.too_deep = 0;

    UPDATE top_rows SET heading_id = COALESCE(w.heading_id, top_rows.id)
    FROM @top top_rows
    LEFT JOIN @wrapped w ON w.task_id = top_rows.id
    WHERE top_rows.is_task = 0 OR top_rows.in_place = 1 OR top_rows.from_master = 1 OR top_rows.too_deep = 1;
    UPDATE t SET sort_order = top_rows.seq
    FROM dbo.schedule_tasks t
    INNER JOIN @top top_rows ON top_rows.heading_id = t.id;

    IF @unsorted_id IS NOT NULL
    BEGIN
        IF EXISTS (SELECT 1 FROM dbo.schedule_tasks WHERE parent_id = @unsorted_id AND deleted_at IS NULL)
            UPDATE dbo.schedule_tasks SET name = @unsorted, visibility = N'Internal', updated_at = @now,
                sort_order = 1 + ISNULL((SELECT MAX(seq) FROM @top), 0)
            WHERE id = @unsorted_id;
        ELSE
            UPDATE dbo.schedule_tasks SET deleted_at = @now, updated_at = @now WHERE id = @unsorted_id;
    END;
    IF @master IS NOT NULL
        UPDATE dbo.schedule_tasks SET deleted_at = @now, updated_at = @now WHERE id = @master;
END;
GO

BEGIN TRANSACTION;
DECLARE @project bigint;
DECLARE plans CURSOR LOCAL FAST_FORWARD FOR
    SELECT DISTINCT project_id FROM dbo.schedule_tasks WHERE deleted_at IS NULL ORDER BY project_id;
OPEN plans;
FETCH NEXT FROM plans INTO @project;
WHILE @@FETCH_STATUS = 0
BEGIN
    EXEC dbo.usp_schedule_convert_to_headings @project_id = @project;
    FETCH NEXT FROM plans INTO @project;
END;
CLOSE plans;
DEALLOCATE plans;
IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 98)
    INSERT dbo.schema_versions(version, name)
    VALUES (98, N'Master Plan headings');
COMMIT TRANSACTION;
GO
