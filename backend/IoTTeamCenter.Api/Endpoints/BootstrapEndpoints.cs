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
                    ELSE CONVERT(bigint, 0) END AS approval_count;

                SELECT id, code, name FROM dbo.customers WHERE is_active = 1 AND deleted_at IS NULL ORDER BY name;
                SELECT id, code, name, category FROM dbo.suppliers WHERE is_active = 1 AND deleted_at IS NULL ORDER BY name;
                SELECT u.id, u.name, u.email, r.code AS role, u.department, u.level
                FROM dbo.users u INNER JOIN dbo.roles r ON r.id = u.role_id
                WHERE u.is_active = 1 AND u.deleted_at IS NULL ORDER BY u.name;

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

            var customers = new List<object>();
            await reader.NextResultAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
                customers.Add(new { id = reader.GetInt64(0), code = reader.GetString(1), name = reader.GetString(2) });

            var suppliers = new List<object>();
            await reader.NextResultAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
                suppliers.Add(new { id = reader.GetInt64(0), code = reader.GetString(1), name = reader.GetString(2), category = reader.GetString(3) });

            var team = new List<object>();
            await reader.NextResultAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
                team.Add(new { id = reader.GetInt64(0), name = reader.GetString(1), email = reader.GetString(2), role = reader.GetString(3), department = reader.GetString(4), level = reader.GetString(5) });

            var permissions = new List<string>();
            await reader.NextResultAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
                permissions.Add(reader.GetString(0));

            return Results.Ok(new { user, counts, customers, suppliers, team, permissions });
        }).RequireAuthorization();
    }
}
