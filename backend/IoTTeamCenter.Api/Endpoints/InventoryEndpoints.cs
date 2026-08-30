using System.Data;
using IoTTeamCenter.Api.Infrastructure;
using IoTTeamCenter.Api.Models;
using Microsoft.Data.SqlClient;

namespace IoTTeamCenter.Api.Endpoints;

public static class InventoryEndpoints
{
    public static void MapInventoryEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/inventory").RequireAuthorization();
        group.MapGet("/items", ListItemsAsync);
        group.MapGet("/items/{itemId:long}/ledger", LedgerAsync);
    }

    private static async Task<IResult> ListItemsAsync(
        string? search,
        bool reorderOnly,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("inventory.read", cancellationToken);
        InputValidation.OptionalText(search, 200, "Search");
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var command = new SqlCommand("""
            SELECT item_id, item_code, part_no, description, brand, unit, location,
                   usable, quarantine, reserved, available, on_order, avg_unit_cost, reorder_level
            FROM dbo.v_item_balances
            WHERE (@search IS NULL OR item_code LIKE N'%' + @search + N'%'
                   OR part_no LIKE N'%' + @search + N'%'
                   OR description LIKE N'%' + @search + N'%'
                   OR brand LIKE N'%' + @search + N'%')
              AND (@reorder_only = 0 OR available <= reorder_level)
            ORDER BY CASE WHEN available <= reorder_level THEN 0 ELSE 1 END, item_code;
            """, connection);
        command.Parameters.AddParameter("@search", SqlDbType.NVarChar, string.IsNullOrWhiteSpace(search) ? null : search.Trim(), 200);
        command.Parameters.AddParameter("@reorder_only", SqlDbType.Bit, reorderOnly);
        var items = new List<ItemBalance>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
            items.Add(new ItemBalance(
                reader.GetInt64(0), reader.GetString(1), reader.GetString(2), reader.GetString(3), reader.GetString(4),
                reader.GetString(5), reader.GetString(6), reader.GetDecimal(7), reader.GetDecimal(8), reader.GetDecimal(9),
                reader.GetDecimal(10), reader.GetDecimal(11), reader.GetDecimal(12), reader.GetDecimal(13)));
        return Results.Ok(items);
    }

    private static async Task<IResult> LedgerAsync(
        long itemId,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("inventory.read", cancellationToken);
        if (itemId <= 0)
            throw new ApiException(StatusCodes.Status400BadRequest, "validation_failed", "Item id must be a positive number.");
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var command = new SqlCommand("""
            SELECT t.id, t.txn_type, t.qty, t.bucket, t.location, t.ref_no, t.project_id,
                   t.note, t.occurred_at, u.name
            FROM dbo.stock_txns t
            INNER JOIN dbo.users u ON u.id = t.created_by
            WHERE t.item_id = @item_id
            ORDER BY t.occurred_at DESC, t.id DESC;
            """, connection);
        command.Parameters.AddParameter("@item_id", SqlDbType.BigInt, itemId);
        var rows = new List<object>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
            rows.Add(new
            {
                id = reader.GetInt64(0),
                type = reader.GetString(1),
                qty = reader.GetDecimal(2),
                bucket = reader.GetString(3),
                location = reader.GetString(4),
                reference = reader.GetString(5),
                projectId = reader.IsDBNull(6) ? (long?)null : reader.GetInt64(6),
                note = reader.GetString(7),
                occurredAt = reader.GetFieldValue<DateTimeOffset>(8),
                by = reader.GetString(9)
            });
        return Results.Ok(rows);
    }
}
