:on error exit
-- Read-only. Every department written on an active employee, the team it belongs to, and who
-- manages that team. Required SQLCMD variable: DatabaseName
--
-- Managers review and approve the people of their own team, and the team comes from the
-- department text exactly as Employee Master spells it (migration 067, dbo.department_teams).
-- Before relying on it, check that:
--   * every department is spelled the same way as the organisation chart (one row per department);
--   * every engineering team has a manager (managers > 0);
--   * a department that a manager of another department oversees has its dbo.department_teams row
--     (from the July 2026 chart: Electrical Engineer Dept. → IoT Engineer Dept.).

USE [$(DatabaseName)];
GO

SET NOCOUNT ON;

WITH people AS (
    SELECT
        employee.department,
        COALESCE(team_map.team, employee.department) AS team,
        role.code AS role
    FROM dbo.employees employee
    LEFT JOIN dbo.users app_user ON app_user.id = employee.user_id AND app_user.is_active = 1 AND app_user.deleted_at IS NULL
    LEFT JOIN dbo.roles role ON role.id = app_user.role_id
    LEFT JOIN dbo.department_teams team_map ON team_map.department = employee.department
    WHERE employee.is_active = 1 AND employee.deleted_at IS NULL
)
SELECT
    people.department,
    people.team,
    COUNT_BIG(*) AS employees,
    SUM(CASE WHEN people.role IS NULL THEN 1 ELSE 0 END) AS without_account,
    (SELECT COUNT_BIG(*) FROM people managers
     WHERE managers.team = people.team AND managers.role IN (N'Engineering Manager', N'Project Manager')) AS team_managers
FROM people
GROUP BY people.department, people.team
ORDER BY people.team, people.department;
