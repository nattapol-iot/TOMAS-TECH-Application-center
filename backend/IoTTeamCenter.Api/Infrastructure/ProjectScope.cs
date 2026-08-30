using System.Data;
using IoTTeamCenter.Api.Models;
using Microsoft.Data.SqlClient;

namespace IoTTeamCenter.Api.Infrastructure;

/// <summary>
/// A project record is visible to the people working on it: its manager, its
/// lead engineer, an assigned member, or an elevated role. Procurement and
/// warehouse roles work across every project by function, so they are elevated
/// too — the permission check still decides what they may do once inside.
/// </summary>
public static class ProjectScope
{
    private static readonly string[] ElevatedRoles =
        ["Admin", "Engineering Manager", "Project Manager", "Purchasing", "Warehouse", "Inventory Controller"];

    public static bool IsElevated(CurrentUser actor) =>
        ElevatedRoles.Contains(actor.Role, StringComparer.Ordinal);

    public static async Task DemandAsync(
        SqlConnection connection,
        SqlTransaction? transaction,
        long projectId,
        CurrentUser actor,
        CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            SELECT CASE WHEN @elevated = 1 OR p.manager_id = @actor OR p.lead_engineer_id = @actor
                              OR EXISTS (SELECT 1 FROM dbo.project_members m WHERE m.project_id = p.id AND m.user_id = @actor)
                        THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END
            FROM dbo.projects p
            WHERE p.id = @project_id AND p.deleted_at IS NULL;
            """, connection, transaction);
        command.Parameters.AddParameter("@project_id", SqlDbType.BigInt, projectId);
        command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
        command.Parameters.AddParameter("@elevated", SqlDbType.Bit, IsElevated(actor));
        var allowed = await command.ExecuteScalarAsync(cancellationToken);
        if (allowed is null)
            throw new ApiException(StatusCodes.Status404NotFound, "project_not_found", "Project not found.");
        if (!(bool)allowed)
            throw new ApiException(StatusCodes.Status403Forbidden, "project_scope_forbidden", "You are not assigned to this project.");
    }
}
