using System.Data;
using System.Text.Json;
using IoTTeamCenter.Api.Infrastructure;
using IoTTeamCenter.Api.Models;
using Microsoft.Data.SqlClient;

namespace IoTTeamCenter.Api.Endpoints;

public static class InquiryEndpoints
{
    public static void MapInquiryEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/inquiries").RequireAuthorization();
        group.MapGet("/", ListAsync);
        group.MapPost("/", CreateAsync);
    }

    private static async Task<IResult> ListAsync(
        int page,
        int pageSize,
        string? search,
        string? status,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("inquiry.read", cancellationToken);
        InputValidation.OptionalText(search, 200, "Search");
        InputValidation.OptionalText(status, 50, "Status");
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize == 0 ? 25 : pageSize, 1, 100);
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var command = new SqlCommand("""
            SELECT
                i.id, i.inquiry_no, i.inquiry_date, i.customer_id, c.name,
                i.project_name, i.project_type, i.estimate_owner_id, u.name,
                i.due_date, i.priority, i.status, i.progress, i.revision,
                i.updated_at, i.row_version, i.estimate_id,
                COUNT_BIG(*) OVER()
            FROM dbo.inquiries i
            INNER JOIN dbo.customers c ON c.id = i.customer_id
            INNER JOIN dbo.users u ON u.id = i.estimate_owner_id
            WHERE i.deleted_at IS NULL
              AND (@status IS NULL OR i.status = @status)
              AND (@search IS NULL OR i.inquiry_no LIKE N'%' + @search + N'%'
                   OR i.project_name LIKE N'%' + @search + N'%'
                   OR c.name LIKE N'%' + @search + N'%')
            ORDER BY i.updated_at DESC, i.id DESC
            OFFSET @offset ROWS FETCH NEXT @page_size ROWS ONLY;
            """, connection);
        command.Parameters.AddParameter("@status", SqlDbType.NVarChar, string.IsNullOrWhiteSpace(status) ? null : status.Trim(), 50);
        command.Parameters.AddParameter("@search", SqlDbType.NVarChar, string.IsNullOrWhiteSpace(search) ? null : search.Trim(), 200);
        command.Parameters.AddParameter("@offset", SqlDbType.Int, (page - 1) * pageSize);
        command.Parameters.AddParameter("@page_size", SqlDbType.Int, pageSize);

        var items = new List<InquirySummary>();
        long total = 0;
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            total = reader.GetInt64(17);
            items.Add(new InquirySummary(
                reader.GetInt64(0), reader.GetString(1), reader.GetFieldValue<DateOnly>(2), reader.GetInt64(3), reader.GetString(4),
                reader.GetString(5), reader.GetString(6), reader.GetInt64(7), reader.GetString(8), reader.GetFieldValue<DateOnly>(9),
                reader.GetString(10), reader.GetString(11), reader.GetDecimal(12), reader.GetInt32(13), reader.GetFieldValue<DateTimeOffset>(14),
                reader.RowVersionString(15), reader.IsDBNull(16) ? null : reader.GetInt64(16)));
        }

        return Results.Ok(new PagedResult<InquirySummary>(items, page, pageSize, total));
    }

    private static async Task<IResult> CreateAsync(
        CreateInquiryRequest request,
        SqlConnectionFactory connections,
        CurrentUserService users,
        BusinessClock clock,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("inquiry.write", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        if (request.CustomerId <= 0 || request.EstimateOwnerId <= 0)
            throw new ApiException(StatusCodes.Status400BadRequest, "validation_failed", "Customer, project name, project type and estimate owner are required.");
        InputValidation.OptionalText(request.Contact, 200, "Contact");
        InputValidation.RequiredText(request.ProjectName, 300, "Project name");
        InputValidation.RequiredText(request.ProjectType, 100, "Project type");
        InputValidation.OptionalText(request.RfqNo, 100, "RFQ number");
        InputValidation.OptionalText(request.SalesOwner, 200, "Sales owner");
        InputValidation.OneOf(request.Priority, "Priority", "Low", "Normal", "High", "Urgent");
        InputValidation.OptionalText(request.Requirement, 20_000, "Requirement");
        InputValidation.OptionalText(request.Background, 20_000, "Background");
        InputValidation.OptionalText(request.ScopeSummary, 20_000, "Scope summary");
        InputValidation.OptionalText(request.Technical, 20_000, "Technical detail");
        InputValidation.OptionalText(request.SiteLocation, 300, "Site location");
        InputValidation.OptionalText(request.Standard, 20_000, "Standard");
        InputValidation.OptionalText(request.Special, 20_000, "Special requirement");
        InputValidation.OptionalText(request.Remark, 20_000, "Remark");
        var today = clock.Today;
        if (request.DueDate < today || request.DueDate > today.AddYears(5))
            throw new ApiException(StatusCodes.Status400BadRequest, "validation_failed", "Due date must be between today and five years from today.");
        if (request.TargetDelivery is { } targetDelivery && (targetDelivery < today || targetDelivery > today.AddYears(10)))
            throw new ApiException(StatusCodes.Status400BadRequest, "validation_failed", "Target delivery must be between today and ten years from today.");

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            await using (var validateReferences = new SqlCommand("""
                SELECT
                    CASE WHEN EXISTS (SELECT 1 FROM dbo.customers WHERE id=@customer_id AND is_active=1 AND deleted_at IS NULL) THEN 1 ELSE 0 END,
                    CASE WHEN EXISTS (
                        SELECT 1
                        FROM dbo.users u
                        INNER JOIN dbo.roles r ON r.id = u.role_id
                        WHERE u.id=@owner_id
                          AND u.is_active=1
                          AND u.deleted_at IS NULL
                          AND r.code IN (N'Engineer', N'Engineering Manager', N'Admin')
                    ) THEN 1 ELSE 0 END;
                """, connection, (SqlTransaction)transaction))
            {
                validateReferences.Parameters.AddParameter("@customer_id", SqlDbType.BigInt, request.CustomerId);
                validateReferences.Parameters.AddParameter("@owner_id", SqlDbType.BigInt, request.EstimateOwnerId);
                await using var referenceReader = await validateReferences.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
                await referenceReader.ReadAsync(cancellationToken);
                if (referenceReader.GetInt32(0) != 1)
                    throw new ApiException(StatusCodes.Status422UnprocessableEntity, "invalid_reference", "The selected customer must be active.");
                if (referenceReader.GetInt32(1) != 1)
                    throw new ApiException(StatusCodes.Status422UnprocessableEntity, "invalid_reference", "The estimate owner must be an active engineer, engineering manager or administrator.");
            }

            var number = await IssueNumberAsync(connection, (SqlTransaction)transaction, "INQ", today, cancellationToken);
            await using var command = new SqlCommand("""
                INSERT INTO dbo.inquiries (
                    inquiry_no, inquiry_date, customer_id, contact, project_name, project_type, rfq_no,
                    sales_owner, estimate_owner_id, due_date, priority, status, progress, revision,
                    requirement, background, scope_summary, technical, target_delivery, site_location,
                    standard, special, remark, created_by, updated_by)
                OUTPUT inserted.id, inserted.row_version
                VALUES (
                    @number, @today, @customer_id, @contact, @project_name, @project_type, @rfq_no,
                    @sales_owner, @estimate_owner_id, @due_date, @priority, N'New', 0, 0,
                    @requirement, @background, @scope_summary, @technical, @target_delivery, @site_location,
                    @standard, @special, @remark, @actor, @actor);
                """, connection, (SqlTransaction)transaction);
            command.Parameters.AddParameter("@number", SqlDbType.NVarChar, number, 30);
            command.Parameters.AddParameter("@today", SqlDbType.Date, today);
            command.Parameters.AddParameter("@customer_id", SqlDbType.BigInt, request.CustomerId);
            command.Parameters.AddParameter("@contact", SqlDbType.NVarChar, request.Contact?.Trim() ?? "", 200);
            command.Parameters.AddParameter("@project_name", SqlDbType.NVarChar, request.ProjectName.Trim(), 300);
            command.Parameters.AddParameter("@project_type", SqlDbType.NVarChar, request.ProjectType.Trim(), 100);
            command.Parameters.AddParameter("@rfq_no", SqlDbType.NVarChar, request.RfqNo?.Trim(), 100);
            command.Parameters.AddParameter("@sales_owner", SqlDbType.NVarChar, request.SalesOwner?.Trim(), 200);
            command.Parameters.AddParameter("@estimate_owner_id", SqlDbType.BigInt, request.EstimateOwnerId);
            command.Parameters.AddParameter("@due_date", SqlDbType.Date, request.DueDate);
            command.Parameters.AddParameter("@priority", SqlDbType.NVarChar, request.Priority.Trim(), 30);
            command.Parameters.AddParameter("@requirement", SqlDbType.NVarChar, request.Requirement?.Trim(), -1);
            command.Parameters.AddParameter("@background", SqlDbType.NVarChar, request.Background?.Trim(), -1);
            command.Parameters.AddParameter("@scope_summary", SqlDbType.NVarChar, request.ScopeSummary?.Trim(), -1);
            command.Parameters.AddParameter("@technical", SqlDbType.NVarChar, request.Technical?.Trim(), -1);
            command.Parameters.AddParameter("@target_delivery", SqlDbType.Date, request.TargetDelivery);
            command.Parameters.AddParameter("@site_location", SqlDbType.NVarChar, request.SiteLocation?.Trim(), 300);
            command.Parameters.AddParameter("@standard", SqlDbType.NVarChar, request.Standard?.Trim(), -1);
            command.Parameters.AddParameter("@special", SqlDbType.NVarChar, request.Special?.Trim(), -1);
            command.Parameters.AddParameter("@remark", SqlDbType.NVarChar, request.Remark?.Trim(), -1);
            command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);

            long id;
            byte[] rowVersion;
            await using (var reader = await command.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken))
            {
                await reader.ReadAsync(cancellationToken);
                id = reader.GetInt64(0);
                rowVersion = (byte[])reader.GetValue(1);
            }

            await InsertAuditAsync(connection, (SqlTransaction)transaction, actor.Id, "Inquiry", id, number, "Created", null, request, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Created($"/api/v1/inquiries/{id}", new { id, number, rowVersion = Convert.ToBase64String(rowVersion) });
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    internal static async Task<string> IssueNumberAsync(
        SqlConnection connection,
        SqlTransaction transaction,
        string documentType,
        DateOnly issueDate,
        CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("dbo.issue_document_number", connection, transaction)
        {
            CommandType = CommandType.StoredProcedure
        };
        command.Parameters.AddParameter("@document_type", SqlDbType.VarChar, documentType, 20);
        command.Parameters.AddParameter("@issue_date", SqlDbType.Date, issueDate);
        var output = command.Parameters.Add("@document_number", SqlDbType.NVarChar, 30);
        output.Direction = ParameterDirection.Output;
        await command.ExecuteNonQueryAsync(cancellationToken);
        return (string)output.Value;
    }

    internal static async Task InsertAuditAsync(
        SqlConnection connection,
        SqlTransaction transaction,
        long actorId,
        string entityType,
        long entityId,
        string entityNumber,
        string action,
        object? before,
        object? after,
        CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            INSERT INTO dbo.audit_log (actor_id, entity_type, entity_id, entity_no, action, before_json, after_json)
            VALUES (@actor, @entity_type, @entity_id, @entity_no, @action, @before, @after);
            """, connection, transaction);
        command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actorId);
        command.Parameters.AddParameter("@entity_type", SqlDbType.NVarChar, entityType, 50);
        command.Parameters.AddParameter("@entity_id", SqlDbType.BigInt, entityId);
        command.Parameters.AddParameter("@entity_no", SqlDbType.NVarChar, entityNumber, 50);
        command.Parameters.AddParameter("@action", SqlDbType.NVarChar, action, 100);
        command.Parameters.AddParameter("@before", SqlDbType.NVarChar, SerializeAuditValue(before), -1);
        command.Parameters.AddParameter("@after", SqlDbType.NVarChar, SerializeAuditValue(after), -1);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static string? SerializeAuditValue(object? value)
    {
        if (value is null) return null;
        var json = JsonSerializer.Serialize(value);
        using var document = JsonDocument.Parse(json);
        return document.RootElement.ValueKind is JsonValueKind.Object or JsonValueKind.Array
            ? json
            : JsonSerializer.Serialize(new { value });
    }
}
