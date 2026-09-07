using System.Data;
using IoTTeamCenter.Api.Infrastructure;
using Microsoft.Data.SqlClient;

namespace IoTTeamCenter.Api.Endpoints;

public static class BootstrapEndpoints
{
    public static void MapBootstrapEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/v1/bootstrap", async (
            CurrentUserService users,
            SqlConnectionFactory connections,
            CancellationToken cancellationToken) =>
        {
            var user = await users.GetRequiredAsync(cancellationToken);
            await using var connection = await connections.OpenAsync(cancellationToken);
            await using var command = new SqlCommand("""
                ;WITH granted AS (
                    SELECT permission.code
                    FROM dbo.users permission_user
                    INNER JOIN dbo.role_permissions rp ON rp.role_id = permission_user.role_id
                    INNER JOIN dbo.permissions permission ON permission.id = rp.permission_id
                    WHERE permission_user.id = @user_id
                )
                SELECT
                    CASE WHEN EXISTS (SELECT 1 FROM granted WHERE code = N'inquiry.read')
                         THEN (SELECT COUNT_BIG(*) FROM dbo.inquiries WHERE deleted_at IS NULL)
                         ELSE CONVERT(bigint, 0) END AS inquiry_count,
                    CASE WHEN EXISTS (SELECT 1 FROM granted WHERE code = N'estimate.read')
                         THEN (SELECT COUNT_BIG(*) FROM dbo.estimates WHERE deleted_at IS NULL)
                         ELSE CONVERT(bigint, 0) END AS estimate_count,
                    CASE WHEN EXISTS (SELECT 1 FROM granted WHERE code = N'project.read')
                         THEN (SELECT COUNT_BIG(*) FROM dbo.projects WHERE deleted_at IS NULL AND status <> N'Closed')
                         ELSE CONVERT(bigint, 0) END AS active_project_count,
                    CASE WHEN EXISTS (SELECT 1 FROM granted WHERE code = N'estimate.approve')
                         THEN (SELECT COUNT_BIG(*) FROM dbo.estimates WHERE deleted_at IS NULL AND status = N'Engineering Review')
                    ELSE CONVERT(bigint, 0) END AS approval_count,
                    employee.id AS employee_id,
                    employee.employee_no,
                    employee.nickname AS employee_nickname,
                    employee.position AS employee_level,
                    employee.start_work_date AS employee_start_work_date
                FROM (VALUES (1)) singleton(value)
                OUTER APPLY (
                    SELECT TOP (1) id, employee_no, nickname, position, start_work_date
                    FROM dbo.employees
                    WHERE user_id = @user_id AND deleted_at IS NULL
                    ORDER BY is_active DESC, id DESC
                ) employee;

                SELECT
                    c.id,
                    c.code,
                    c.name,
                    c.industry,
                    c.contact,
                    c.email,
                    c.phone,
                    c.site,
                    (SELECT COUNT_BIG(*)
                     FROM dbo.inquiries i
                     WHERE i.customer_id = c.id AND i.deleted_at IS NULL) AS inquiry_count,
                    (SELECT COUNT_BIG(*)
                     FROM dbo.estimates e
                     WHERE e.customer_id = c.id
                       AND e.deleted_at IS NULL
                       AND e.status NOT IN (N'Approved', N'Locked')) AS open_estimate_count,
                    c.row_version
                FROM dbo.customers c
                WHERE c.is_active = 1 AND c.deleted_at IS NULL
                ORDER BY c.name;
                SELECT id, code, name, category FROM dbo.suppliers WHERE is_active = 1 AND deleted_at IS NULL ORDER BY name;
                SELECT
                    app_user.id,
                    employee.name_en,
                    employee.email,
                    role.code AS role,
                    employee.department,
                    employee.position,
                    employee.id AS employee_id,
                    employee.employee_no,
                    employee.nickname,
                    employee.start_work_date,
                    CONVERT(bit, CASE WHEN app_user.entra_object_id IS NULL THEN 0 ELSE 1 END) AS can_sign_in
                FROM dbo.employees employee
                INNER JOIN dbo.users app_user ON app_user.id = employee.user_id
                INNER JOIN dbo.roles role ON role.id = app_user.role_id
                WHERE employee.is_active = 1
                  AND employee.deleted_at IS NULL
                  AND app_user.is_active = 1
                  AND app_user.deleted_at IS NULL
                ORDER BY employee.employee_no;

                SELECT p.code
                FROM dbo.role_permissions rp
                INNER JOIN dbo.permissions p ON p.id = rp.permission_id
                INNER JOIN dbo.users u ON u.role_id = rp.role_id
                WHERE u.id = @user_id
                ORDER BY p.code;
                """, connection);
            command.Parameters.AddParameter("@user_id", SqlDbType.BigInt, user.Id);

            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            await reader.ReadAsync(cancellationToken);
            var counts = new
            {
                inquiries = reader.GetInt64(0),
                estimates = reader.GetInt64(1),
                activeProjects = reader.GetInt64(2),
                approvals = reader.GetInt64(3)
            };
            object? employment = reader.IsDBNull(4) || reader.IsDBNull(8)
                ? null
                : new
                {
                    employeeId = reader.GetInt64(4),
                    employeeNo = reader.GetInt32(5),
                    nickname = reader.IsDBNull(6) ? "" : reader.GetString(6),
                    level = reader.IsDBNull(7) ? "" : reader.GetString(7),
                    startWorkDate = DateOnly.FromDateTime(reader.GetDateTime(8))
                };

            var customers = new List<object>();
            await reader.NextResultAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
                customers.Add(new
                {
                    id = reader.GetInt64(0),
                    code = reader.GetString(1),
                    name = reader.GetString(2),
                    industry = reader.GetString(3),
                    contact = reader.GetString(4),
                    email = reader.GetString(5),
                    phone = reader.GetString(6),
                    site = reader.GetString(7),
                    inquiries = reader.GetInt64(8),
                    openEstimates = reader.GetInt64(9),
                    rowVersion = Convert.ToBase64String((byte[])reader.GetValue(10))
                });

            var suppliers = new List<object>();
            await reader.NextResultAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
                suppliers.Add(new { id = reader.GetInt64(0), code = reader.GetString(1), name = reader.GetString(2), category = reader.GetString(3) });

            var team = new List<object>();
            await reader.NextResultAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
                team.Add(new
                {
                    id = reader.GetInt64(0),
                    name = reader.GetString(1),
                    email = reader.GetString(2),
                    role = reader.GetString(3),
                    department = reader.GetString(4),
                    level = reader.GetString(5),
                    employeeId = reader.GetInt64(6),
                    employeeNo = reader.GetInt32(7),
                    nickname = reader.GetString(8),
                    startWorkDate = DateOnly.FromDateTime(reader.GetDateTime(9)),
                    canSignIn = reader.GetBoolean(10)
                });

            var permissions = new List<string>();
            await reader.NextResultAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
                permissions.Add(reader.GetString(0));

            return Results.Ok(new { user, employment, counts, customers, suppliers, team, permissions });
        }).RequireAuthorization();
    }
}
