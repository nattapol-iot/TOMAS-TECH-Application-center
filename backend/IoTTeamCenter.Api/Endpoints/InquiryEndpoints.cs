using System.Data;
using System.Text.Json;
using IoTTeamCenter.Api.Infrastructure;
using IoTTeamCenter.Api.Models;
using Microsoft.Data.SqlClient;

namespace IoTTeamCenter.Api.Endpoints;

public static class InquiryEndpoints
{
    private sealed record InquiryDetailSeed(
        long Id, string Number, DateOnly InquiryDate, long CustomerId, string CustomerCode, string CustomerName,
        string Contact, string ProjectName, string ProjectType, string? RfqNo, string? SalesOwner,
        long EstimateOwnerId, string EstimateOwnerName, DateOnly DueDate, string Priority, string Status,
        decimal Progress, int Revision, string Requirement, string Background, string ScopeSummary, string Technical,
        DateOnly? TargetDelivery, string SiteLocation, string Standard, string Special, string Remark,
        DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt, string RowVersion);

    public static void MapInquiryEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/inquiries").RequireAuthorization();
        group.MapGet("/", ListAsync);
        group.MapGet("/{id:long}", GetAsync);
        group.MapPost("/", CreateAsync);
        // Inquiry assignment, meeting creation, and attachment upload/download are not
        // yet implemented server-side (GetAsync's detail response already reads existing
        // meetings/attachments); routes are omitted here rather than wired to missing
        // handlers. See README.md "Production release scope".
    }

    private static async Task<IResult> ListAsync(
        int page,
        int pageSize,
        string? search,
        string? status,
        long? customerId,
        string? projectType,
        long? ownerId,
        string? priority,
        DateOnly? inquiryFrom,
        DateOnly? inquiryTo,
        DateOnly? dueFrom,
        DateOnly? dueTo,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("inquiry.read", cancellationToken);
        InputValidation.OptionalText(search, 200, "Search");
        InputValidation.OptionalText(status, 50, "Status");
        InputValidation.OptionalText(projectType, 100, "Project type");
        InputValidation.OptionalText(priority, 30, "Priority");
        if (customerId is <= 0 || ownerId is <= 0)
            throw new ApiException(StatusCodes.Status400BadRequest, "validation_failed", "Customer and owner filters must contain valid positive identifiers.");
        if (inquiryFrom > inquiryTo || dueFrom > dueTo)
            throw new ApiException(StatusCodes.Status400BadRequest, "validation_failed", "Date filter ranges are invalid.");
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
              AND (@customer_id IS NULL OR i.customer_id = @customer_id)
              AND (@project_type IS NULL OR i.project_type = @project_type)
              AND (@owner_id IS NULL OR i.estimate_owner_id = @owner_id)
              AND (@priority IS NULL OR i.priority = @priority)
              AND (@inquiry_from IS NULL OR i.inquiry_date >= @inquiry_from)
              AND (@inquiry_to IS NULL OR i.inquiry_date <= @inquiry_to)
              AND (@due_from IS NULL OR i.due_date >= @due_from)
              AND (@due_to IS NULL OR i.due_date <= @due_to)
              AND (@search IS NULL OR i.inquiry_no LIKE N'%' + @search + N'%'
                   OR i.project_name LIKE N'%' + @search + N'%'
                   OR c.name LIKE N'%' + @search + N'%'
                   OR i.rfq_no LIKE N'%' + @search + N'%')
            ORDER BY i.updated_at DESC, i.id DESC
            OFFSET @offset ROWS FETCH NEXT @page_size ROWS ONLY;
            """, connection);
        command.Parameters.AddParameter("@status", SqlDbType.NVarChar, string.IsNullOrWhiteSpace(status) ? null : status.Trim(), 50);
        command.Parameters.AddParameter("@search", SqlDbType.NVarChar, string.IsNullOrWhiteSpace(search) ? null : search.Trim(), 200);
        command.Parameters.AddParameter("@customer_id", SqlDbType.BigInt, customerId);
        command.Parameters.AddParameter("@project_type", SqlDbType.NVarChar, string.IsNullOrWhiteSpace(projectType) ? null : projectType.Trim(), 100);
        command.Parameters.AddParameter("@owner_id", SqlDbType.BigInt, ownerId);
        command.Parameters.AddParameter("@priority", SqlDbType.NVarChar, string.IsNullOrWhiteSpace(priority) ? null : priority.Trim(), 30);
        command.Parameters.AddParameter("@inquiry_from", SqlDbType.Date, inquiryFrom);
        command.Parameters.AddParameter("@inquiry_to", SqlDbType.Date, inquiryTo);
        command.Parameters.AddParameter("@due_from", SqlDbType.Date, dueFrom);
        command.Parameters.AddParameter("@due_to", SqlDbType.Date, dueTo);
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

    private static async Task<IResult> GetAsync(
        long id,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("inquiry.read", cancellationToken);
        if (id <= 0) return Results.NotFound();

        await using var connection = await connections.OpenAsync(cancellationToken);
        InquiryDetailSeed seed;
        await using (var command = new SqlCommand("""
            SELECT i.id, i.inquiry_no, i.inquiry_date, i.customer_id, c.code, c.name,
                   i.contact, i.project_name, i.project_type, i.rfq_no, i.sales_owner,
                   i.estimate_owner_id, u.name, i.due_date, i.priority, i.status, i.progress, i.revision,
                   i.requirement, i.background, i.scope_summary, i.technical, i.target_delivery,
                   i.site_location, i.standard, i.special, i.remark, i.created_at, i.updated_at, i.row_version
            FROM dbo.inquiries i
            INNER JOIN dbo.customers c ON c.id = i.customer_id
            INNER JOIN dbo.users u ON u.id = i.estimate_owner_id
            WHERE i.id = @id AND i.deleted_at IS NULL;
            """, connection))
        {
            command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
            await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
            if (!await reader.ReadAsync(cancellationToken)) return Results.NotFound();
            seed = new InquiryDetailSeed(
                reader.GetInt64(0), reader.GetString(1), reader.GetFieldValue<DateOnly>(2), reader.GetInt64(3), reader.GetString(4), reader.GetString(5),
                reader.GetString(6), reader.GetString(7), reader.GetString(8), reader.IsDBNull(9) ? null : reader.GetString(9), reader.IsDBNull(10) ? null : reader.GetString(10),
                reader.GetInt64(11), reader.GetString(12), reader.GetFieldValue<DateOnly>(13), reader.GetString(14), reader.GetString(15), reader.GetDecimal(16), reader.GetInt32(17),
                reader.IsDBNull(18) ? "" : reader.GetString(18), reader.IsDBNull(19) ? "" : reader.GetString(19), reader.IsDBNull(20) ? "" : reader.GetString(20), reader.IsDBNull(21) ? "" : reader.GetString(21),
                reader.IsDBNull(22) ? null : reader.GetFieldValue<DateOnly>(22), reader.IsDBNull(23) ? "" : reader.GetString(23), reader.IsDBNull(24) ? "" : reader.GetString(24),
                reader.IsDBNull(25) ? "" : reader.GetString(25), reader.IsDBNull(26) ? "" : reader.GetString(26), reader.GetFieldValue<DateTimeOffset>(27),
                reader.GetFieldValue<DateTimeOffset>(28), reader.RowVersionString(29));
        }

        InquiryEstimateSummary? estimate = null;
        await using (var command = new SqlCommand("""
            SELECT e.id, e.estimate_no, e.revision, e.owner_id, u.name, e.created_date, e.due_date,
                   e.status, e.progress, t.material_total, t.engineering_total, t.outsource_total,
                   t.transportation_total + t.accommodation_total + t.other_total + t.contingency_total,
                   t.total, e.row_version
            FROM dbo.estimates e
            INNER JOIN dbo.users u ON u.id = e.owner_id
            INNER JOIN dbo.v_estimate_totals t ON t.estimate_id = e.id
            WHERE e.inquiry_id = @id AND e.deleted_at IS NULL;
            """, connection))
        {
            command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
            await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
            if (await reader.ReadAsync(cancellationToken))
                estimate = new InquiryEstimateSummary(
                    reader.GetInt64(0), reader.GetString(1), reader.GetInt32(2), reader.GetInt64(3), reader.GetString(4),
                    reader.GetFieldValue<DateOnly>(5), reader.GetFieldValue<DateOnly>(6), reader.GetString(7), reader.GetDecimal(8),
                    reader.GetDecimal(9), reader.GetDecimal(10), reader.GetDecimal(11), reader.GetDecimal(12), reader.GetDecimal(13), reader.RowVersionString(14));
        }

        var meetings = new List<InquiryMeetingSummary>();
        await using (var command = new SqlCommand("""
            SELECT m.id, m.meeting_date, m.meeting_type, m.participants_json,
                   m.requirement, m.technical, m.decision, m.open_point, m.action_item,
                   m.owner_id, owner.name, m.due_date, m.attachment_id, attachment.name,
                   creator.name, m.created_at, m.row_version
            FROM dbo.inquiry_meetings m
            INNER JOIN dbo.users creator ON creator.id = m.created_by
            LEFT JOIN dbo.users owner ON owner.id = m.owner_id
            LEFT JOIN dbo.inquiry_attachments attachment ON attachment.id = m.attachment_id AND attachment.deleted_at IS NULL
            WHERE m.inquiry_id = @id
            ORDER BY m.meeting_date DESC, m.id DESC;
            """, connection))
        {
            command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                var participants = JsonSerializer.Deserialize<string[]>(reader.GetString(3)) ?? [];
                meetings.Add(new InquiryMeetingSummary(
                    reader.GetInt64(0), reader.GetFieldValue<DateOnly>(1), reader.GetString(2), participants,
                    reader.IsDBNull(4) ? "" : reader.GetString(4), reader.IsDBNull(5) ? "" : reader.GetString(5),
                    reader.IsDBNull(6) ? "" : reader.GetString(6), reader.IsDBNull(7) ? "" : reader.GetString(7), reader.IsDBNull(8) ? "" : reader.GetString(8),
                    reader.IsDBNull(9) ? null : reader.GetInt64(9), reader.IsDBNull(10) ? null : reader.GetString(10),
                    reader.IsDBNull(11) ? null : reader.GetFieldValue<DateOnly>(11), reader.IsDBNull(12) ? null : reader.GetInt64(12),
                    reader.IsDBNull(13) ? null : reader.GetString(13), reader.GetString(14), reader.GetFieldValue<DateTimeOffset>(15), reader.RowVersionString(16)));
            }
        }

        var attachments = new List<InquiryAttachmentSummary>();
        await using (var command = new SqlCommand("""
            SELECT a.id, a.name, a.category, a.content_type, a.size_bytes, u.name, a.uploaded_at, a.row_version
            FROM dbo.inquiry_attachments a
            INNER JOIN dbo.users u ON u.id = a.uploaded_by
            WHERE a.inquiry_id = @id AND a.deleted_at IS NULL
            ORDER BY a.uploaded_at DESC, a.id DESC;
            """, connection))
        {
            command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
                attachments.Add(new InquiryAttachmentSummary(
                    reader.GetInt64(0), reader.GetString(1), reader.GetString(2), reader.GetString(3), reader.GetInt64(4),
                    reader.GetString(5), reader.GetFieldValue<DateTimeOffset>(6), reader.RowVersionString(7)));
        }

        var activity = new List<InquiryActivitySummary>();
        await using (var command = new SqlCommand("""
            SELECT TOP (200) a.id, a.entity_type, a.entity_no, a.action, u.name,
                   a.before_json, a.after_json, a.reason, a.occurred_at
            FROM dbo.audit_log a
            INNER JOIN dbo.users u ON u.id = a.actor_id
            WHERE (a.entity_type = N'Inquiry' AND a.entity_id = @id)
               OR a.entity_no = @inquiry_no
               OR (@estimate_no IS NOT NULL AND a.entity_no = @estimate_no)
            ORDER BY a.occurred_at DESC, a.id DESC;
            """, connection))
        {
            command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
            command.Parameters.AddParameter("@inquiry_no", SqlDbType.NVarChar, seed.Number, 50);
            command.Parameters.AddParameter("@estimate_no", SqlDbType.NVarChar, estimate?.Number, 50);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
                activity.Add(new InquiryActivitySummary(
                    reader.GetInt64(0), reader.GetString(1), reader.GetString(2), reader.GetString(3), reader.GetString(4),
                    reader.IsDBNull(5) ? null : reader.GetString(5), reader.IsDBNull(6) ? null : reader.GetString(6),
                    reader.IsDBNull(7) ? null : reader.GetString(7), reader.GetFieldValue<DateTimeOffset>(8)));
        }

        return Results.Ok(new InquiryDetail(
            seed.Id, seed.Number, seed.InquiryDate, seed.CustomerId, seed.CustomerCode, seed.CustomerName,
            seed.Contact, seed.ProjectName, seed.ProjectType, seed.RfqNo, seed.SalesOwner, seed.EstimateOwnerId,
            seed.EstimateOwnerName, seed.DueDate, seed.Priority, seed.Status, seed.Progress, seed.Revision,
            seed.Requirement, seed.Background, seed.ScopeSummary, seed.Technical, seed.TargetDelivery,
            seed.SiteLocation, seed.Standard, seed.Special, seed.Remark, seed.CreatedAt, seed.UpdatedAt,
            seed.RowVersion, estimate, meetings, attachments, activity));
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
