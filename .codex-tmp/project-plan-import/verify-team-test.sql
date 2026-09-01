SET NOCOUNT ON;
IF DB_NAME() <> N'IoTTeamCenter_CodexTest_20260830_04'
    THROW 51322, 'Unexpected database for project-plan import verification.', 1;

DECLARE @hash nvarchar(64) = N'679c7202f6e27c6a305c47b919e3b6818d633a5420ca9bd61de30458a8a9a0df';

SELECT COUNT(*) AS imported_projects,
       SUM(CASE WHEN p.status=N'Closed' THEN 1 ELSE 0 END) AS closed_projects,
       SUM(CASE WHEN p.status=N'Development' THEN 1 ELSE 0 END) AS development_projects,
       SUM(CASE WHEN p.status=N'Planning' THEN 1 ELSE 0 END) AS planning_projects,
       SUM(CASE WHEN p.status=N'On Hold' THEN 1 ELSE 0 END) AS on_hold_projects
FROM dbo.projects p
WHERE p.deleted_at IS NULL AND p.remark LIKE N'%' + @hash + N'%';

SELECT COUNT(*) AS imported_schedule_rows,
       SUM(CASE WHEN t.kind=N'phase' THEN 1 ELSE 0 END) AS phases,
       SUM(CASE WHEN t.kind=N'task' THEN 1 ELSE 0 END) AS tasks,
       SUM(CASE WHEN t.kind=N'detail' THEN 1 ELSE 0 END) AS details,
       SUM(CASE WHEN t.parent_id IS NOT NULL THEN 1 ELSE 0 END) AS child_rows
FROM dbo.schedule_tasks t
INNER JOIN dbo.projects p ON p.id=t.project_id
WHERE t.deleted_at IS NULL AND p.deleted_at IS NULL AND p.remark LIKE N'%' + @hash + N'%';

SELECT COUNT(*) AS imported_inquiries
FROM dbo.inquiries i
WHERE i.deleted_at IS NULL AND i.remark LIKE N'%' + @hash + N'%';

SELECT COUNT(*) AS imported_estimates
FROM dbo.estimates e
INNER JOIN dbo.projects p ON p.estimate_id=e.id
WHERE e.deleted_at IS NULL AND p.deleted_at IS NULL AND p.remark LIKE N'%' + @hash + N'%';

SELECT COUNT(*) AS imported_project_audits
FROM dbo.audit_log a
WHERE a.action=N'Imported project schedule' AND a.after_json LIKE N'%' + @hash + N'%';

SELECT COUNT(*) AS orphaned_task_parents
FROM dbo.schedule_tasks t
INNER JOIN dbo.projects p ON p.id=t.project_id
LEFT JOIN dbo.schedule_tasks parent ON parent.id=t.parent_id
WHERE t.deleted_at IS NULL AND p.remark LIKE N'%' + @hash + N'%'
  AND t.parent_id IS NOT NULL AND (parent.id IS NULL OR parent.project_id<>t.project_id);

SELECT p.project_no,p.name,p.status,p.progress,COUNT(t.id) AS schedule_rows
FROM dbo.projects p
LEFT JOIN dbo.schedule_tasks t ON t.project_id=p.id AND t.deleted_at IS NULL
WHERE p.deleted_at IS NULL AND p.remark LIKE N'%' + @hash + N'%'
GROUP BY p.project_no,p.name,p.status,p.progress
ORDER BY p.project_no;
