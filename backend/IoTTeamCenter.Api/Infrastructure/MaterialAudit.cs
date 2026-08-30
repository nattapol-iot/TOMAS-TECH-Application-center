using System.Data;
using System.Text.Json;
using IoTTeamCenter.Api.Models;
using Microsoft.Data.SqlClient;

namespace IoTTeamCenter.Api.Infrastructure;

/// <summary>
/// Append-only trail for the material module. dbo.mat_audit carries the
/// quantity, project, reason and approver that dbo.audit_log has no columns
/// for, and a database trigger blocks every UPDATE and DELETE, so this is the
/// only way a material fact is ever recorded.
/// </summary>
public static class MaterialAudit
{
    private static readonly JsonSerializerOptions SerializerOptions = new(JsonSerializerDefaults.Web);

    public static async Task WriteAsync(
        SqlConnection connection,
        SqlTransaction transaction,
        CurrentUser actor,
        string action,
        string entityType,
        long entityId,
        string entityNumber,
        object? before,
        object? after,
        CancellationToken cancellationToken,
        decimal? quantity = null,
        long? projectId = null,
        string? reason = null,
        string? attachmentStorageKey = null,
        long? approverId = null)
    {
        await using var command = new SqlCommand("""
            INSERT INTO dbo.mat_audit (
                actor_id, actor_role, action, entity_type, entity_id, entity_no,
                before_json, after_json, qty, project_id, reason, attachment_storage_key, approver_id)
            VALUES (
                @actor, @actor_role, @action, @entity_type, @entity_id, @entity_no,
                @before, @after, @qty, @project_id, @reason, @attachment, @approver);
            """, connection, transaction);
        command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
        command.Parameters.AddParameter("@actor_role", SqlDbType.NVarChar, actor.Role, 50);
        command.Parameters.AddParameter("@action", SqlDbType.NVarChar, action, 100);
        command.Parameters.AddParameter("@entity_type", SqlDbType.NVarChar, entityType, 50);
        command.Parameters.AddParameter("@entity_id", SqlDbType.BigInt, entityId);
        command.Parameters.AddParameter("@entity_no", SqlDbType.NVarChar, entityNumber, 50);
        command.Parameters.AddParameter("@before", SqlDbType.NVarChar, Serialize(before), -1);
        command.Parameters.AddParameter("@after", SqlDbType.NVarChar, Serialize(after), -1);
        command.Parameters.AddParameter("@qty", SqlDbType.Decimal, quantity, precision: 19, scale: 4);
        command.Parameters.AddParameter("@project_id", SqlDbType.BigInt, projectId);
        command.Parameters.AddParameter("@reason", SqlDbType.NVarChar, reason, -1);
        command.Parameters.AddParameter("@attachment", SqlDbType.NVarChar, attachmentStorageKey, 1000);
        command.Parameters.AddParameter("@approver", SqlDbType.BigInt, approverId);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static string? Serialize(object? value) =>
        value is null ? null : JsonSerializer.Serialize(value, SerializerOptions);
}
