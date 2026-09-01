using System.Data;
using System.Globalization;
using IoTTeamCenter.Api.Infrastructure;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.Data.SqlClient;

namespace IoTTeamCenter.Api.Endpoints;

public static class SupplierQuotationEndpoints
{
    private static readonly HashSet<string> QuotationExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".pdf", ".xls", ".xlsx", ".csv", ".jpg", ".jpeg", ".png"
    };

    public static void MapSupplierQuotationEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/supplier-quotations");
        group.MapGet("/", ListAsync);
        group.MapPost("/", CreateAsync).DisableAntiforgery();
        group.MapGet("/{id:long}/content", DownloadAsync);
    }

    private static async Task<IResult> ListAsync(
        HttpRequest request,
        SqlConnectionFactory connections,
        CurrentUserService users,
        BusinessClock clock,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("estimate.read", cancellationToken);
        var search = (request.Query["search"].FirstOrDefault() ?? string.Empty).Trim();
        if (search.Length > 200)
            throw new ApiException(StatusCodes.Status400BadRequest, "validation_failed", "Search cannot exceed 200 characters.");
        var page = int.TryParse(request.Query["page"], out var parsedPage) ? Math.Max(1, parsedPage) : 1;
        var pageSize = int.TryParse(request.Query["pageSize"], out var parsedPageSize) ? Math.Clamp(parsedPageSize, 1, 100) : 50;
        var supplierId = long.TryParse(request.Query["supplierId"], out var parsedSupplierId) && parsedSupplierId > 0 ? parsedSupplierId : (long?)null;
        var status = (request.Query["status"].FirstOrDefault() ?? string.Empty).Trim();
        if (status.Length > 30 || (status.Length > 0 && status is not ("Valid" or "Expiring" or "Expired" or "Superseded")))
            throw new ApiException(StatusCodes.Status400BadRequest, "validation_failed", "Quotation status is invalid.");

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var command = new SqlCommand("""
            WITH quotation_rows AS (
                SELECT q.id, q.quotation_no, q.supplier_reference, q.supplier_id, s.name AS supplier_name,
                       q.received_date, q.valid_until, q.inquiry_id, i.inquiry_no, i.project_name,
                       q.currency, q.amount,
                       CASE WHEN q.status = N'Superseded' THEN N'Superseded'
                            WHEN q.valid_until < @today THEN N'Expired'
                            WHEN q.valid_until <= DATEADD(day, 30, @today) THEN N'Expiring'
                            ELSE N'Valid' END AS display_status,
                       q.file_name, q.content_type, q.size_bytes, u.name AS uploaded_by_name,
                       q.uploaded_at, q.row_version
                FROM dbo.supplier_quotations q
                INNER JOIN dbo.suppliers s ON s.id = q.supplier_id
                INNER JOIN dbo.users u ON u.id = q.uploaded_by
                LEFT JOIN dbo.inquiries i ON i.id = q.inquiry_id
            )
            SELECT *, COUNT_BIG(*) OVER() AS total_count
            FROM quotation_rows
            WHERE (@supplier_id IS NULL OR supplier_id = @supplier_id)
              AND (@status = N'' OR display_status = @status)
              AND (@search = N'' OR quotation_no LIKE N'%' + @search + N'%'
                   OR supplier_reference LIKE N'%' + @search + N'%'
                   OR supplier_name LIKE N'%' + @search + N'%'
                   OR COALESCE(inquiry_no, N'') LIKE N'%' + @search + N'%'
                   OR COALESCE(project_name, N'') LIKE N'%' + @search + N'%'
                   OR file_name LIKE N'%' + @search + N'%')
            ORDER BY received_date DESC, id DESC
            OFFSET @offset ROWS FETCH NEXT @page_size ROWS ONLY;
            """, connection);
        command.Parameters.AddParameter("@today", SqlDbType.Date, clock.Today);
        command.Parameters.AddParameter("@supplier_id", SqlDbType.BigInt, supplierId);
        command.Parameters.AddParameter("@status", SqlDbType.NVarChar, status, 30);
        command.Parameters.AddParameter("@search", SqlDbType.NVarChar, search, 200);
        command.Parameters.AddParameter("@offset", SqlDbType.Int, (page - 1) * pageSize);
        command.Parameters.AddParameter("@page_size", SqlDbType.Int, pageSize);

        var items = new List<object>();
        long total = 0;
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            total = reader.GetInt64(19);
            items.Add(new
            {
                id = reader.GetInt64(0), quotationNumber = reader.GetString(1), supplierReference = reader.GetString(2),
                supplierId = reader.GetInt64(3), supplierName = reader.GetString(4),
                receivedDate = reader.GetDateTime(5).ToString("yyyy-MM-dd"), validUntil = reader.GetDateTime(6).ToString("yyyy-MM-dd"),
                inquiryId = reader.IsDBNull(7) ? null : (long?)reader.GetInt64(7), inquiryNumber = reader.IsDBNull(8) ? null : reader.GetString(8),
                projectName = reader.IsDBNull(9) ? null : reader.GetString(9), currency = reader.GetString(10), amount = reader.GetDecimal(11),
                status = reader.GetString(12), fileName = reader.GetString(13), contentType = reader.GetString(14), sizeBytes = reader.GetInt64(15),
                uploadedByName = reader.GetString(16), uploadedAt = reader.GetDateTimeOffset(17), rowVersion = Convert.ToBase64String((byte[])reader.GetValue(18))
            });
        }
        return Results.Ok(new { items, page, pageSize, total });
    }

    private static async Task<IResult> CreateAsync(
        HttpRequest request,
        SqlConnectionFactory connections,
        CurrentUserService users,
        ProjectDocumentStorage storage,
        DocumentStorageOptions storageOptions,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("estimate.write", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        if (!request.HasFormContentType)
            throw new ApiException(StatusCodes.Status415UnsupportedMediaType, "multipart_required", "Upload requests must use multipart/form-data.");
        if (request.ContentLength > storageOptions.MaxFileSizeBytes + 1_048_576)
            throw new ApiException(StatusCodes.Status413PayloadTooLarge, "file_too_large", $"The file limit is {storageOptions.MaxFileSizeBytes} bytes.");

        var form = await request.ReadFormAsync(cancellationToken);
        if (form.Files.Count != 1 || form.Files.GetFile("file") is not { } file)
            throw new ApiException(StatusCodes.Status400BadRequest, "file_required", "Exactly one multipart file field named 'file' is required.");
        if (!long.TryParse(Required(form["supplierId"], "supplierId"), out var supplierId) || supplierId <= 0)
            throw new ApiException(StatusCodes.Status400BadRequest, "validation_failed", "Supplier is required.");
        var supplierReference = Optional(form["supplierReference"], "supplierReference")?.Trim() ?? string.Empty;
        InputValidation.OptionalText(supplierReference, 200, "Supplier reference");
        var receivedDate = ParseDate(Required(form["receivedDate"], "receivedDate"), "Received date");
        var validUntil = ParseDate(Required(form["validUntil"], "validUntil"), "Valid until");
        if (validUntil < receivedDate)
            throw new ApiException(StatusCodes.Status400BadRequest, "validation_failed", "Valid until cannot be before received date.");
        var currency = Required(form["currency"], "currency").Trim().ToUpperInvariant();
        if (currency is not ("THB" or "JPY" or "USD" or "EUR"))
            throw new ApiException(StatusCodes.Status400BadRequest, "validation_failed", "Currency is invalid.");
        if (!decimal.TryParse(Required(form["amount"], "amount"), NumberStyles.Number, CultureInfo.InvariantCulture, out var amount) || amount <= 0 || amount > 999_999_999_999_999m)
            throw new ApiException(StatusCodes.Status400BadRequest, "validation_failed", "Amount must be greater than zero.");
        long? inquiryId = null;
        var inquiryValue = Optional(form["inquiryId"], "inquiryId");
        if (!string.IsNullOrWhiteSpace(inquiryValue))
        {
            if (!long.TryParse(inquiryValue, out var parsedInquiryId) || parsedInquiryId <= 0)
                throw new ApiException(StatusCodes.Status400BadRequest, "validation_failed", "Inquiry is invalid.");
            inquiryId = parsedInquiryId;
        }

        var fileName = Path.GetFileName(file.FileName.Replace('\\', '/'));
        InputValidation.RequiredText(fileName, 500, "File name");
        if (fileName.Any(char.IsControl) || file.Length <= 0)
            throw new ApiException(StatusCodes.Status400BadRequest, "invalid_file", "The uploaded file is invalid or empty.");
        if (file.Length > storageOptions.MaxFileSizeBytes)
            throw new ApiException(StatusCodes.Status413PayloadTooLarge, "file_too_large", $"The file limit is {storageOptions.MaxFileSizeBytes} bytes.");
        var extension = Path.GetExtension(fileName).ToLowerInvariant();
        if (!QuotationExtensions.Contains(extension) || !storageOptions.IsAllowedExtension(extension))
            throw new ApiException(StatusCodes.Status415UnsupportedMediaType, "file_type_not_allowed", "Supplier quotations accept PDF, Excel, CSV, JPG, and PNG files.");
        var contentType = new FileExtensionContentTypeProvider().TryGetContentType(fileName, out var mapped) ? mapped : "application/octet-stream";
        var storageKey = storage.CreateSupplierQuotationStorageKey(extension);
        var stored = false;
        var metadataCommitted = false;
        var commitOutcomeUnknown = false;
        try
        {
            DocumentWriteResult write;
            await using (var source = file.OpenReadStream()) write = await storage.WriteAsync(storageKey, source, cancellationToken);
            stored = true;
            await using var connection = await connections.OpenAsync(cancellationToken);
            await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken);
            try
            {
                string supplierName;
                await using (var validate = new SqlCommand("""
                    SELECT s.name
                    FROM dbo.suppliers s
                    WHERE s.id=@supplier_id AND s.is_active=1 AND s.deleted_at IS NULL
                      AND (@inquiry_id IS NULL OR EXISTS (SELECT 1 FROM dbo.inquiries i WHERE i.id=@inquiry_id AND i.deleted_at IS NULL));
                    """, connection, transaction))
                {
                    validate.Parameters.AddParameter("@supplier_id", SqlDbType.BigInt, supplierId);
                    validate.Parameters.AddParameter("@inquiry_id", SqlDbType.BigInt, inquiryId);
                    supplierName = await validate.ExecuteScalarAsync(cancellationToken) as string ?? string.Empty;
                }
                if (supplierName.Length == 0)
                    throw new ApiException(StatusCodes.Status422UnprocessableEntity, "invalid_reference", "Supplier or inquiry was not found.");

                var quotationNumber = await InquiryEndpoints.IssueNumberAsync(connection, transaction, "SQ", receivedDate, cancellationToken);
                long id;
                byte[] rowVersion;
                await using (var insert = new SqlCommand("""
                    DECLARE @created TABLE (id bigint NOT NULL, row_version binary(8) NOT NULL);
                    INSERT INTO dbo.supplier_quotations(
                        quotation_no, supplier_reference, supplier_id, received_date, valid_until, inquiry_id,
                        currency, amount, file_name, content_type, size_bytes, storage_key, sha256, uploaded_by)
                    OUTPUT inserted.id, inserted.row_version INTO @created(id, row_version)
                    VALUES (@quotation_no, @supplier_reference, @supplier_id, @received_date, @valid_until, @inquiry_id,
                            @currency, @amount, @file_name, @content_type, @size_bytes, @storage_key, @sha256, @actor);
                    SELECT id, row_version FROM @created;
                    """, connection, transaction))
                {
                    insert.Parameters.AddParameter("@quotation_no", SqlDbType.NVarChar, quotationNumber, 30);
                    insert.Parameters.AddParameter("@supplier_reference", SqlDbType.NVarChar, supplierReference, 200);
                    insert.Parameters.AddParameter("@supplier_id", SqlDbType.BigInt, supplierId);
                    insert.Parameters.AddParameter("@received_date", SqlDbType.Date, receivedDate);
                    insert.Parameters.AddParameter("@valid_until", SqlDbType.Date, validUntil);
                    insert.Parameters.AddParameter("@inquiry_id", SqlDbType.BigInt, inquiryId);
                    insert.Parameters.AddParameter("@currency", SqlDbType.Char, currency, 3);
                    insert.Parameters.AddParameter("@amount", SqlDbType.Decimal, amount, precision: 19, scale: 4);
                    insert.Parameters.AddParameter("@file_name", SqlDbType.NVarChar, fileName, 500);
                    insert.Parameters.AddParameter("@content_type", SqlDbType.NVarChar, contentType, 200);
                    insert.Parameters.AddParameter("@size_bytes", SqlDbType.BigInt, write.SizeBytes);
                    insert.Parameters.AddParameter("@storage_key", SqlDbType.NVarChar, storageKey, 1000);
                    insert.Parameters.AddParameter("@sha256", SqlDbType.Char, write.Sha256, 64);
                    insert.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                    await using var reader = await insert.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
                    await reader.ReadAsync(cancellationToken);
                    id = reader.GetInt64(0);
                    rowVersion = (byte[])reader.GetValue(1);
                }
                await using (var audit = new SqlCommand("""
                    INSERT INTO dbo.audit_log(actor_id, entity_type, entity_id, entity_no, action, after_json, reason)
                    VALUES (@actor, N'SupplierQuotation', @id, @number, N'Uploaded',
                            (SELECT @supplier_id AS supplierId, @supplier_name AS supplierName, @amount AS amount,
                                    @currency AS currency, @file_name AS fileName FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
                            N'Supplier quotation document uploaded');
                    """, connection, transaction))
                {
                    audit.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                    audit.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
                    audit.Parameters.AddParameter("@number", SqlDbType.NVarChar, quotationNumber, 50);
                    audit.Parameters.AddParameter("@supplier_id", SqlDbType.BigInt, supplierId);
                    audit.Parameters.AddParameter("@supplier_name", SqlDbType.NVarChar, supplierName, 300);
                    audit.Parameters.AddParameter("@amount", SqlDbType.Decimal, amount, precision: 19, scale: 4);
                    audit.Parameters.AddParameter("@currency", SqlDbType.Char, currency, 3);
                    audit.Parameters.AddParameter("@file_name", SqlDbType.NVarChar, fileName, 500);
                    await audit.ExecuteNonQueryAsync(cancellationToken);
                }
                commitOutcomeUnknown = true;
                await transaction.CommitAsync(cancellationToken);
                metadataCommitted = true;
                commitOutcomeUnknown = false;
                return Results.Created($"/api/v1/supplier-quotations/{id}/content", new { id, quotationNumber, rowVersion = Convert.ToBase64String(rowVersion) });
            }
            catch (Exception exception)
            {
                if (!commitOutcomeUnknown && !metadataCommitted && transaction.Connection is not null)
                    await transaction.RollbackAsync(CancellationToken.None);
                if (commitOutcomeUnknown)
                    loggerFactory.CreateLogger("SupplierQuotationStorage").LogCritical(exception, "Supplier quotation SQL commit outcome is unknown; preserving storage key {StorageKey}", storageKey);
                throw;
            }
        }
        catch
        {
            if (stored && !metadataCommitted && !commitOutcomeUnknown) await storage.DeleteIfExistsAsync(storageKey);
            throw;
        }
    }

    private static async Task<IResult> DownloadAsync(
        long id,
        HttpRequest request,
        SqlConnectionFactory connections,
        CurrentUserService users,
        ProjectDocumentStorage storage,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("estimate.read", cancellationToken);
        if (HttpMethods.IsHead(request.Method)) return Results.StatusCode(StatusCodes.Status405MethodNotAllowed);
        if (id <= 0) return Results.NotFound();
        string fileName;
        string contentType;
        string storageKey;
        string sha256;
        long sizeBytes;
        await using (var connection = await connections.OpenAsync(cancellationToken))
        await using (var command = new SqlCommand("SELECT file_name, content_type, storage_key, size_bytes, sha256 FROM dbo.supplier_quotations WHERE id=@id;", connection))
        {
            command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
            await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
            if (!await reader.ReadAsync(cancellationToken)) return Results.NotFound();
            fileName = reader.GetString(0); contentType = reader.GetString(1); storageKey = reader.GetString(2);
            sizeBytes = reader.GetInt64(3); sha256 = reader.GetString(4);
        }
        var stream = storage.OpenRead(storageKey);
        try
        {
            await storage.VerifyIntegrityAndRewindAsync(stream, sizeBytes, sha256, cancellationToken);
            return Results.File(stream, contentType, fileName, enableRangeProcessing: false);
        }
        catch { await stream.DisposeAsync(); throw; }
    }

    private static string Required(Microsoft.Extensions.Primitives.StringValues values, string fieldName)
    {
        if (values.Count != 1 || string.IsNullOrWhiteSpace(values[0]))
            throw new ApiException(StatusCodes.Status400BadRequest, "validation_failed", $"Multipart field '{fieldName}' is required exactly once.");
        return values[0]!;
    }

    private static string? Optional(Microsoft.Extensions.Primitives.StringValues values, string fieldName)
    {
        if (values.Count > 1)
            throw new ApiException(StatusCodes.Status400BadRequest, "validation_failed", $"Multipart field '{fieldName}' may be supplied at most once.");
        return values.Count == 0 ? null : values[0];
    }

    private static DateOnly ParseDate(string value, string fieldName)
    {
        if (!DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var result))
            throw new ApiException(StatusCodes.Status400BadRequest, "validation_failed", $"{fieldName} must use yyyy-MM-dd format.");
        return result;
    }
}
