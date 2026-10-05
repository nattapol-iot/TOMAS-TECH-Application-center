:on error exit
-- Read-only. Active accounts that no active Employee Master record points at.
-- Required SQLCMD variable: DatabaseName
--
-- Until 2026-10-05, TMT_ID_DEFAULT_ROLE_CODE=Admin created an account, as Admin and with no
-- department, for anyone TMT ID let in. Since then only people registered in Employee Master get
-- an account, but the old ones still sign in. Before another team starts using the system, go
-- through every row:
--   * a colleague: add or fix them in Employee Master with the SAME email as below; saving links
--     the account and gives it their department. Then set the right role in Admin → user roles.
--   * anyone else: disable the account with 040_deprovision_user.sql.
-- A person whose employee email differs from their TMT ID email shows up twice (an unlinked
-- employee and this account); correct the employee email rather than keeping both.

USE [$(DatabaseName)];
GO

SET NOCOUNT ON;

SELECT
    u.id AS user_id,
    u.email,
    u.name,
    r.code AS primary_role,
    COALESCE(NULLIF(u.department, N''), N'(none)') AS department,
    u.created_at,
    CASE
        WHEN employee.id IS NULL THEN N'No Employee Master record with this email'
        ELSE N'Employee ' + CONVERT(nvarchar(20), employee.employee_no) + N' has this email but is not linked'
    END AS finding
FROM dbo.users u
INNER JOIN dbo.roles r ON r.id = u.role_id
LEFT JOIN dbo.employees employee
    ON employee.email = u.email AND employee.is_active = 1 AND employee.deleted_at IS NULL
WHERE u.is_active = 1
  AND u.deleted_at IS NULL
  AND NOT EXISTS (
      SELECT 1 FROM dbo.employees linked
      WHERE linked.user_id = u.id AND linked.is_active = 1 AND linked.deleted_at IS NULL)
ORDER BY CASE WHEN r.code = N'Admin' THEN 0 ELSE 1 END, u.email;
