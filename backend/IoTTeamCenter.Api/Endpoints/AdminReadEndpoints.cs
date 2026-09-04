using System.Data;
using IoTTeamCenter.Api.Infrastructure;
using IoTTeamCenter.Api.Models;
using Microsoft.Data.SqlClient;

namespace IoTTeamCenter.Api.Endpoints;

/// <summary>
/// Read models for administrative screens. These endpoints intentionally expose
/// only reviewed, permission-gated data and never grant mutation access to the
/// immutable audit ledgers.
/// </summary>
public static class AdminReadEndpoints
{
    public static void MapAdminReadEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/admin").RequireAuthorization();
        group.MapGet("/engineering-rates", ListEngineeringRatesAsync);
        group.MapGet("/audit", ListAuditAsync);
    }

    private static async Task<IResult> ListEngineeringRatesAsync(
        int? page,
        int? pageSize,
        string? search,
        bool? activeOnly,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("master.read", cancellationToken);
        InputValidation.OptionalText(search, 200, "Search");
        var requestedPage = Math.Clamp(page ?? 1, 1, 1_000_000);
        var requestedPageSize = Math.Clamp(pageSize ?? 25, 1, 100);

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var command = new SqlCommand("""
            SELECT
                rate.id, rate.level, rate.department,
                rate.engineering_hourly, rate.engineering_daily,
                rate.installation_hourly, rate.installation_daily,
                rate.effective_from, rate.effective_to, rate.is_active,
                creator.name, rate.created_at, rate.row_version,
                COUNT_BIG(*) OVER()
            FROM dbo.engineering_rates rate
            INNER JOIN dbo.users creator ON creator.id = rate.created_by
            WHERE (@active_only = 0 OR rate.is_active = 1)
              AND (@search IS NULL
                   OR rate.level LIKE N'%' + @search + N'%'
                   OR rate.department LIKE N'%' + @search + N'%'
                   OR creator.name LIKE N'%' + @search + N'%')
            ORDER BY rate.effective_from DESC, rate.id DESC
            OFFSET @offset ROWS FETCH NEXT @page_size ROWS ONLY;
            """, connection);
        command.Parameters.AddParameter("@active_only", SqlDbType.Bit, activeOnly ?? false);
        command.Parameters.AddParameter("@search", SqlDbType.NVarChar, string.IsNullOrWhiteSpace(search) ? null : search.Trim(), 200);
        command.Parameters.AddParameter("@offset", SqlDbType.BigInt, (long)(requestedPage - 1) * requestedPageSize);
        command.Parameters.AddParameter("@page_size", SqlDbType.Int, requestedPageSize);

        var items = new List<EngineeringRateSummary>();
        long total = 0;
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            total = reader.GetInt64(13);
            items.Add(new EngineeringRateSummary(
                reader.GetInt64(0), reader.GetString(1), reader.GetString(2),
                reader.GetDecimal(3), reader.GetDecimal(4), reader.GetDecimal(5), reader.GetDecimal(6),
                reader.GetFieldValue<DateOnly>(7), reader.IsDBNull(8) ? null : reader.GetFieldValue<DateOnly>(8),
                reader.GetBoolean(9), reader.GetString(10), reader.GetFieldValue<DateTimeOffset>(11),
                reader.RowVersionString(12)));
        }

        return Results.Ok(new PagedResult<EngineeringRateSummary>(items, requestedPage, requestedPageSize, total));
    }

    private static async Task<IResult> ListAuditAsync(
        int? page,
        int? pageSize,
        string? search,
        string? source,
        string? entityType,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("audit.read", cancellationToken);
        InputValidation.OptionalText(search, 200, "Search");
        InputValidation.OptionalText(entityType, 50, "Entity type");
        var normalizedSource = string.IsNullOrWhiteSpace(source) ? null : source.Trim();
        if (normalizedSource is not null && normalizedSource is not ("Core" or "Material"))
            throw new ApiException(StatusCodes.Status400BadRequest, "validation_failed", "Audit source must be Core or Material.");

        var requestedPage = Math.Clamp(page ?? 1, 1, 1_000_000);
        var requestedPageSize = Math.Clamp(pageSize ?? 50, 1, 100);

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var command = new SqlCommand("""
            WITH combined_audit AS (
                SELECT
                    CAST(N'Core' AS nvarchar(20)) AS source,
                    audit.id, audit.actor_id, actor.name AS actor_name,
                    CAST(N'Current role: ' + role.code AS nvarchar(100)) AS actor_role,
                    audit.action, audit.entity_type, audit.entity_id, audit.entity_no,
                    CAST(NULL AS decimal(19,4)) AS quantity,
                    CAST(NULL AS bigint) AS project_id,
                    audit.reason, audit.before_json, audit.after_json, audit.occurred_at
                FROM dbo.audit_log audit
                INNER JOIN dbo.users actor ON actor.id = audit.actor_id
                INNER JOIN dbo.roles role ON role.id = actor.role_id

                UNION ALL

                SELECT
                    CAST(N'Material' AS nvarchar(20)) AS source,
                    audit.id, audit.actor_id, actor.name AS actor_name, audit.actor_role,
                    audit.action, audit.entity_type, audit.entity_id, audit.entity_no,
                    audit.qty, audit.project_id,
                    audit.reason, audit.before_json, audit.after_json, audit.occurred_at
                FROM dbo.mat_audit audit
                INNER JOIN dbo.users actor ON actor.id = audit.actor_id
            )
            SELECT
                source, id, actor_id, actor_name, actor_role,
                action, entity_type, entity_id, entity_no,
                quantity, project_id, reason, before_json, after_json, occurred_at,
                COUNT_BIG(*) OVER()
            FROM combined_audit
            WHERE (@source IS NULL OR source = @source)
              AND (@entity_type IS NULL OR entity_type = @entity_type)
              AND (@search IS NULL
                   OR entity_no LIKE N'%' + @search + N'%'
                   OR entity_type LIKE N'%' + @search + N'%'
                   OR action LIKE N'%' + @search + N'%'
                   OR actor_name LIKE N'%' + @search + N'%'
                   OR reason LIKE N'%' + @search + N'%')
            ORDER BY occurred_at DESC, source, id DESC
            OFFSET @offset ROWS FETCH NEXT @page_size ROWS ONLY;
            """, connection);
        command.Parameters.AddParameter("@source", SqlDbType.NVarChar, normalizedSource, 20);
        command.Parameters.AddParameter("@entity_type", SqlDbType.NVarChar, string.IsNullOrWhiteSpace(entityType) ? null : entityType.Trim(), 50);
        command.Parameters.AddParameter("@search", SqlDbType.NVarChar, string.IsNullOrWhiteSpace(search) ? null : search.Trim(), 200);
        command.Parameters.AddParameter("@offset", SqlDbType.BigInt, (long)(requestedPage - 1) * requestedPageSize);
        command.Parameters.AddParameter("@page_size", SqlDbType.Int, requestedPageSize);

        var items = new List<AuditSummary>();
        long total = 0;
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            total = reader.GetInt64(15);
            items.Add(new AuditSummary(
                reader.GetString(0), reader.GetInt64(1), reader.GetInt64(2), reader.GetString(3), reader.GetString(4),
                reader.GetString(5), reader.GetString(6), reader.GetInt64(7), reader.GetString(8),
                reader.IsDBNull(9) ? null : reader.GetDecimal(9), reader.IsDBNull(10) ? null : reader.GetInt64(10),
                reader.IsDBNull(11) ? null : reader.GetString(11), reader.IsDBNull(12) ? null : reader.GetString(12),
                reader.IsDBNull(13) ? null : reader.GetString(13), reader.GetFieldValue<DateTimeOffset>(14)));
        }

        return Results.Ok(new PagedResult<AuditSummary>(items, requestedPage, requestedPageSize, total));
    }

    private sealed record EngineeringRateSummary(
        long Id,
        string Level,
        string Department,
        decimal EngineeringHourly,
        decimal EngineeringDaily,
        decimal InstallationHourly,
        decimal InstallationDaily,
        DateOnly EffectiveFrom,
        DateOnly? EffectiveTo,
        bool IsActive,
        string CreatedByName,
        DateTimeOffset CreatedAt,
        string RowVersion);

    private sealed record AuditSummary(
        string Source,
        long Id,
        long ActorId,
        string ActorName,
        string ActorRole,
        string Action,
        string EntityType,
        long EntityId,
        string EntityNumber,
        decimal? Quantity,
        long? ProjectId,
        string? Reason,
        string? BeforeJson,
        string? AfterJson,
        DateTimeOffset OccurredAt);
}
