using System.Data;
using System.Security.Claims;
using IoTTeamCenter.Api.Models;
using Microsoft.Data.SqlClient;

namespace IoTTeamCenter.Api.Infrastructure;

public sealed class CurrentUserService(
    IHttpContextAccessor httpContextAccessor,
    SqlConnectionFactory connections,
    IWebHostEnvironment environment,
    IConfiguration configuration)
{
    private CurrentUser? _cached;

    public async Task<CurrentUser> GetRequiredAsync(CancellationToken cancellationToken)
    {
        if (_cached is not null) return _cached;

        var principal = httpContextAccessor.HttpContext?.User
            ?? throw new ApiException(StatusCodes.Status401Unauthorized, "unauthenticated", "Authentication is required.");

        string objectId;
        if (environment.IsDevelopment() && configuration["Authentication:Mode"] == "Development")
        {
            objectId = httpContextAccessor.HttpContext?.Request.Headers["X-Dev-User-Id"].FirstOrDefault() ?? "dev-user";
        }
        else
        {
            objectId = principal.FindFirstValue("http://schemas.microsoft.com/identity/claims/objectidentifier")
                ?? principal.FindFirstValue("oid")
                ?? throw new ApiException(StatusCodes.Status401Unauthorized, "missing_oid", "The Entra token does not contain an object id.");
        }

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var command = new SqlCommand("""
            SELECT TOP (1)
                u.id, u.entra_object_id, u.email, u.name, r.code, u.department, u.is_active
            FROM dbo.users u
            INNER JOIN dbo.roles r ON r.id = u.role_id
            WHERE u.entra_object_id = @oid;
            """, connection);
        command.Parameters.AddParameter("@oid", SqlDbType.NVarChar, objectId, 64);

        await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            throw new ApiException(StatusCodes.Status403Forbidden, "user_not_registered", "Your account is not registered for IoT Team Center.");
        }

        _cached = new CurrentUser(
            reader.GetInt64(0), reader.GetString(1), reader.GetString(2), reader.GetString(3),
            reader.GetString(4), reader.GetString(5), reader.GetBoolean(6));
        if (!_cached.IsActive)
        {
            throw new ApiException(StatusCodes.Status403Forbidden, "user_disabled", "Your IoT Team Center account is disabled.");
        }

        return _cached;
    }

    public async Task DemandPermissionAsync(string permission, CancellationToken cancellationToken)
    {
        var user = await GetRequiredAsync(cancellationToken);
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var command = new SqlCommand("""
            SELECT CASE WHEN EXISTS (
                SELECT 1
                FROM dbo.role_permissions rp
                INNER JOIN dbo.permissions p ON p.id = rp.permission_id
                INNER JOIN dbo.roles r ON r.id = rp.role_id
                WHERE r.code = @role AND p.code = @permission
            ) THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END;
            """, connection);
        command.Parameters.AddParameter("@role", SqlDbType.NVarChar, user.Role, 50);
        command.Parameters.AddParameter("@permission", SqlDbType.NVarChar, permission, 100);
        var allowed = (bool)(await command.ExecuteScalarAsync(cancellationToken) ?? false);
        if (!allowed)
        {
            throw new ApiException(StatusCodes.Status403Forbidden, "permission_denied", $"Permission '{permission}' is required.");
        }
    }
}
