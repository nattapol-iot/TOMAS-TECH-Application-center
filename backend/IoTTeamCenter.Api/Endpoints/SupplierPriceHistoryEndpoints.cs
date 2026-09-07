using System.Data;
using IoTTeamCenter.Api.Infrastructure;
using Microsoft.Data.SqlClient;

namespace IoTTeamCenter.Api.Endpoints;

public static class SupplierPriceHistoryEndpoints
{
    public static void MapSupplierPriceHistoryEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/v1/pricing/history", ListAsync);
    }

    private static async Task<IResult> ListAsync(
        HttpRequest request,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("estimate.read", cancellationToken);
        var search = (request.Query["search"].FirstOrDefault() ?? string.Empty).Trim();
        if (search.Length > 200)
            throw new ApiException(StatusCodes.Status400BadRequest, "validation_failed", "Search cannot exceed 200 characters.");
        var page = int.TryParse(request.Query["page"], out var parsedPage) ? Math.Max(parsedPage, 1) : 1;
        var pageSize = int.TryParse(request.Query["pageSize"], out var parsedPageSize) ? Math.Clamp(parsedPageSize, 1, 200) : 50;
        var supplierId = long.TryParse(request.Query["supplierId"], out var parsedSupplierId) && parsedSupplierId > 0 ? parsedSupplierId : (long?)null;

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var command = new SqlCommand("""
            SELECT
                h.id, h.source_key, h.project_number, h.project_name, h.customer_name, h.line_number,
                h.category_code, h.category, h.module, h.item_code, h.description, h.brand,
                h.supplier_id, h.supplier_name, h.quantity, h.unit, h.quote_unit_price,
                h.actual_unit_cost, h.actual_line_cost, h.lead_time_days, h.quotation_number,
                h.quotation_date, h.purchase_order_number, h.purchase_order_status, h.remark,
                h.source_workbook, h.source_quotation_file, h.import_batch, h.imported_at,
                COUNT_BIG(*) OVER() AS total_count
            FROM dbo.supplier_price_history h
            WHERE (@supplier_id IS NULL OR h.supplier_id = @supplier_id)
              AND (@search = N'' OR h.item_code LIKE N'%' + @search + N'%'
                   OR h.description LIKE N'%' + @search + N'%'
                   OR h.brand LIKE N'%' + @search + N'%'
                   OR h.supplier_name LIKE N'%' + @search + N'%'
                   OR h.quotation_number LIKE N'%' + @search + N'%'
                   OR h.purchase_order_number LIKE N'%' + @search + N'%'
                   OR h.project_number LIKE N'%' + @search + N'%')
            ORDER BY COALESCE(h.quotation_date, CONVERT(date, h.imported_at)) DESC, h.id DESC
            OFFSET @offset ROWS FETCH NEXT @page_size ROWS ONLY;
            """, connection);
        command.Parameters.AddParameter("@supplier_id", SqlDbType.BigInt, supplierId);
        command.Parameters.AddParameter("@search", SqlDbType.NVarChar, search, 200);
        command.Parameters.AddParameter("@offset", SqlDbType.Int, (page - 1) * pageSize);
        command.Parameters.AddParameter("@page_size", SqlDbType.Int, pageSize);

        var items = new List<object>();
        long total = 0;
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            total = reader.GetInt64(29);
            items.Add(new
            {
                id = reader.GetInt64(0), sourceKey = reader.GetString(1), projectNumber = reader.GetString(2), projectName = reader.GetString(3), customerName = reader.GetString(4), lineNumber = reader.GetInt32(5),
                categoryCode = reader.GetString(6), category = reader.GetString(7), module = reader.GetString(8), itemCode = reader.GetString(9), description = reader.GetString(10), brand = reader.GetString(11),
                supplierId = reader.IsDBNull(12) ? null : (long?)reader.GetInt64(12), supplierName = reader.GetString(13), quantity = reader.GetDecimal(14), unit = reader.GetString(15), quoteUnitPrice = reader.GetDecimal(16),
                actualUnitCost = reader.GetDecimal(17), actualLineCost = reader.GetDecimal(18), leadTimeDays = reader.GetInt32(19), quotationNumber = reader.GetString(20), quotationDate = reader.IsDBNull(21) ? null : reader.GetDateTime(21).ToString("yyyy-MM-dd"),
                purchaseOrderNumber = reader.GetString(22), purchaseOrderStatus = reader.GetString(23), remark = reader.GetString(24), sourceWorkbook = reader.GetString(25), sourceQuotationFile = reader.IsDBNull(26) ? null : reader.GetString(26), importBatch = reader.GetString(27), importedAt = reader.GetDateTimeOffset(28)
            });
        }
        return Results.Ok(new { items, page, pageSize, total });
    }
}
