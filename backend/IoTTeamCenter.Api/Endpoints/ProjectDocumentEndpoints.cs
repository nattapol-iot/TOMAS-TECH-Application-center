using System.Data;
using IoTTeamCenter.Api.Infrastructure;
using IoTTeamCenter.Api.Models;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Primitives;

namespace IoTTeamCenter.Api.Endpoints;

public static class ProjectDocumentEndpoints
{
    private static readonly FileExtensionContentTypeProvider ContentTypes = new();

    public static void MapProjectDocumentEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/projects/{projectId:long}/documents").RequireAuthorization();
        group.MapGet("/", ListAsync);
        group.MapPost("/", UploadAsync)
            .DisableAntiforgery()
            .RequireRateLimiting("document-upload");
        group.MapGet("/{documentId:long}/content", DownloadAsync)
            .RequireRateLimiting("document-download");
    }

    private static async Task<IResult> ListAsync(
        long projectId,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("project.read", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        if (projectId <= 0) return Results.NotFound();

        await using var connection = await connections.OpenAsync(cancellationToken);
        await DemandProjectAccessScopeAsync(connection, projectId, actor, cancellationToken);
        await using var command = new SqlCommand("""
            SELECT d.id, d.name, d.content_type, d.size_bytes, d.folder_code, f.name,
                   d.document_type, d.remark, u.name, d.uploaded_at, d.provider_etag, d.row_version
            FROM dbo.project_docs d
            INNER JOIN dbo.projects p ON p.id = d.project_id AND p.deleted_at IS NULL
            INNER JOIN dbo.project_folders f ON f.project_id = d.project_id AND f.folder_code = d.folder_code
            INNER JOIN dbo.users u ON u.id = d.uploaded_by
            WHERE d.project_id = @project_id AND d.deleted_at IS NULL
            ORDER BY d.uploaded_at DESC, d.id DESC;
            """, connection);
        command.Parameters.AddParameter("@project_id", SqlDbType.BigInt, projectId);

        var documents = new List<ProjectDocumentSummary>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
            documents.Add(ReadSummary(reader));

        return Results.Ok(documents);
    }

    private static async Task<IResult> UploadAsync(
        long projectId,
        HttpRequest request,
        SqlConnectionFactory connections,
        CurrentUserService users,
        DocumentStorageOptions storageOptions,
        ProjectDocumentStorage storage,
        ILogger<ProjectDocumentStorage> logger,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("project.write", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        if (projectId <= 0) return Results.NotFound();

        // Authorize the project id before inspecting or buffering a potentially
        // large multipart body. Folder existence is validated after form parsing,
        // and the complete scope is checked again in the metadata transaction.
        await using (var scopeConnection = await connections.OpenAsync(cancellationToken))
            await DemandProjectAccessScopeAsync(scopeConnection, projectId, actor, cancellationToken);

        if (!request.HasFormContentType)
            throw new ApiException(StatusCodes.Status415UnsupportedMediaType, "multipart_required", "Upload requests must use multipart/form-data.");
        if (request.ContentLength > storageOptions.MaxFileSizeBytes + 1_048_576)
            throw new ApiException(StatusCodes.Status413PayloadTooLarge, "file_too_large", $"The file limit is {storageOptions.MaxFileSizeBytes} bytes.");

        IFormCollection form;
        try
        {
            form = await request.ReadFormAsync(cancellationToken);
        }
        catch (InvalidDataException exception)
        {
            if (exception.Message.Contains("length limit", StringComparison.OrdinalIgnoreCase))
                throw new ApiException(StatusCodes.Status413PayloadTooLarge, "file_too_large", $"The file limit is {storageOptions.MaxFileSizeBytes} bytes.");
            throw new ApiException(StatusCodes.Status400BadRequest, "invalid_multipart", "The multipart upload is invalid.");
        }

        if (form.Files.Count != 1 || form.Files.GetFile("file") is not { } file)
            throw new ApiException(StatusCodes.Status400BadRequest, "file_required", "Exactly one multipart file field named 'file' is required.");

        var folderCode = RequiredSingleValue(form["folderCode"], "folderCode");
        var documentType = RequiredSingleValue(form["documentType"], "documentType");
        var remark = OptionalSingleValue(form["remark"], "remark");
        if (folderCode.Length != 2 || folderCode.Any(character => !char.IsAsciiDigit(character)))
            throw new ApiException(StatusCodes.Status400BadRequest, "invalid_folder", "Folder code must be two digits.");
        InputValidation.RequiredText(documentType, 100, "Document type");
        InputValidation.OptionalText(remark, 20_000, "Remark");

        var fileName = ExtractFileName(file.FileName);
        InputValidation.RequiredText(fileName, 500, "File name");
        if (fileName.Any(char.IsControl))
            throw new ApiException(StatusCodes.Status400BadRequest, "invalid_file_name", "The file name contains unsupported control characters.");
        if (file.Length <= 0)
            throw new ApiException(StatusCodes.Status400BadRequest, "empty_file", "The uploaded file is empty.");
        if (file.Length > storageOptions.MaxFileSizeBytes)
            throw new ApiException(StatusCodes.Status413PayloadTooLarge, "file_too_large", $"The file limit is {storageOptions.MaxFileSizeBytes} bytes.");

        var extension = Path.GetExtension(fileName).ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(extension) || !storageOptions.IsAllowedExtension(extension))
            throw new ApiException(
                StatusCodes.Status415UnsupportedMediaType,
                "file_type_not_allowed",
                $"Files with extension '{extension}' are not allowed.",
                new { allowedExtensions = storageOptions.AllowedExtensions.Order(StringComparer.OrdinalIgnoreCase) });
        var contentType = ContentTypes.TryGetContentType(fileName, out var mappedContentType)
            ? mappedContentType
            : "application/octet-stream";

        await using (var preflightConnection = await connections.OpenAsync(cancellationToken))
        {
            var preflight = await GetUploadContextAsync(preflightConnection, null, projectId, folderCode, actor.Id, IsElevated(actor), cancellationToken);
            DemandUploadContext(preflight);
        }

        var storageKey = storage.CreateStorageKey(projectId, folderCode, extension);
        var fileStored = false;
        var metadataCommitted = false;
        var commitOutcomeUnknown = false;
        try
        {
            DocumentWriteResult writeResult;
            await using (var source = file.OpenReadStream())
                writeResult = await storage.WriteAsync(storageKey, source, cancellationToken);
            fileStored = true;

            await using var connection = await connections.OpenAsync(cancellationToken);
            await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken);
            try
            {
                var uploadContext = await GetUploadContextAsync(connection, transaction, projectId, folderCode, actor.Id, IsElevated(actor), cancellationToken);
                DemandUploadContext(uploadContext);

                ProjectDocumentSummary result;
                await using (var insert = new SqlCommand("""
                    INSERT INTO dbo.project_docs (
                        project_id, folder_code, name, document_type, content_type,
                        size_bytes, storage_key, provider_etag, uploaded_by, remark)
                    OUTPUT inserted.id, inserted.name, inserted.content_type, inserted.size_bytes,
                           inserted.folder_code, @folder_name, inserted.document_type, inserted.remark,
                           @uploader_name, inserted.uploaded_at, inserted.provider_etag, inserted.row_version
                    VALUES (
                        @project_id, @folder_code, @name, @document_type, @content_type,
                        @size_bytes, @storage_key, @sha256, @actor, @remark);
                    """, connection, transaction))
                {
                    insert.Parameters.AddParameter("@project_id", SqlDbType.BigInt, projectId);
                    insert.Parameters.AddParameter("@folder_code", SqlDbType.Char, folderCode, 2);
                    insert.Parameters.AddParameter("@name", SqlDbType.NVarChar, fileName, 500);
                    insert.Parameters.AddParameter("@document_type", SqlDbType.NVarChar, documentType.Trim(), 100);
                    insert.Parameters.AddParameter("@content_type", SqlDbType.NVarChar, contentType, 200);
                    insert.Parameters.AddParameter("@size_bytes", SqlDbType.BigInt, writeResult.SizeBytes);
                    insert.Parameters.AddParameter("@storage_key", SqlDbType.NVarChar, storageKey, 1000);
                    insert.Parameters.AddParameter("@sha256", SqlDbType.NVarChar, writeResult.Sha256, 500);
                    insert.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                    insert.Parameters.AddParameter("@remark", SqlDbType.NVarChar, string.IsNullOrWhiteSpace(remark) ? null : remark.Trim(), -1);
                    insert.Parameters.AddParameter("@folder_name", SqlDbType.NVarChar, uploadContext!.FolderName, 200);
                    insert.Parameters.AddParameter("@uploader_name", SqlDbType.NVarChar, actor.Name, 200);
                    await using var reader = await insert.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
                    await reader.ReadAsync(cancellationToken);
                    result = ReadSummary(reader);
                }

                await InquiryEndpoints.InsertAuditAsync(
                    connection,
                    transaction,
                    actor.Id,
                    "ProjectDocument",
                    result.Id,
                    uploadContext!.ProjectNumber,
                    "Uploaded",
                    null,
                    new
                    {
                        result.Id,
                        result.FileName,
                        result.FolderCode,
                        result.DocumentType,
                        result.ContentType,
                        result.SizeBytes,
                        result.Sha256,
                        result.Remark
                    },
                    cancellationToken);

                commitOutcomeUnknown = true;
                await transaction.CommitAsync(cancellationToken);
                metadataCommitted = true;
                commitOutcomeUnknown = false;
                return Results.Created($"/api/v1/projects/{projectId}/documents/{result.Id}/content", result);
            }
            catch (Exception exception)
            {
                if (!commitOutcomeUnknown && !metadataCommitted && transaction.Connection is not null)
                    await transaction.RollbackAsync(CancellationToken.None);
                if (commitOutcomeUnknown)
                {
                    // A transport/cancellation failure from CommitAsync does not prove
                    // that SQL Server rolled the transaction back. Preserve the NAS file
                    // to avoid committed metadata pointing at deleted content; the
                    // storage key and SHA-256 are available for operator reconciliation.
                    logger.LogCritical(
                        exception,
                        "Project document SQL commit outcome is unknown; preserving storage key {StorageKey} for project {ProjectId}",
                        storageKey,
                        projectId);
                }
                throw;
            }
        }
        catch
        {
            if (fileStored && !metadataCommitted && !commitOutcomeUnknown)
            {
                try
                {
                    await storage.DeleteIfExistsAsync(storageKey);
                }
                catch (DocumentStorageUnavailableException cleanupException)
                {
                    logger.LogCritical(cleanupException, "Orphan document cleanup failed for project {ProjectId}", projectId);
                    throw;
                }
            }
            throw;
        }
    }

    private static async Task<IResult> DownloadAsync(
        long projectId,
        long documentId,
        HttpRequest request,
        SqlConnectionFactory connections,
        CurrentUserService users,
        ProjectDocumentStorage storage,
        CancellationToken cancellationToken)
    {
        // GET performs a full integrity pass before serving. Reject implicit HEAD
        // routing so cheap body-less requests cannot amplify NAS reads.
        if (HttpMethods.IsHead(request.Method))
            return Results.StatusCode(StatusCodes.Status405MethodNotAllowed);
        await users.DemandPermissionAsync("project.read", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        if (projectId <= 0 || documentId <= 0) return Results.NotFound();

        string fileName;
        string contentType;
        string storageKey;
        long sizeBytes;
        string? sha256;
        await using (var connection = await connections.OpenAsync(cancellationToken))
        {
            await DemandProjectAccessScopeAsync(connection, projectId, actor, cancellationToken);
            await using var command = new SqlCommand("""
                SELECT d.name, d.content_type, d.storage_key, d.size_bytes, d.provider_etag
                FROM dbo.project_docs d
                WHERE d.id = @document_id AND d.project_id = @project_id AND d.deleted_at IS NULL;
                """, connection);
            command.Parameters.AddParameter("@document_id", SqlDbType.BigInt, documentId);
            command.Parameters.AddParameter("@project_id", SqlDbType.BigInt, projectId);
            await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
            if (!await reader.ReadAsync(cancellationToken)) return Results.NotFound();
            fileName = reader.GetString(0);
            contentType = reader.GetString(1);
            storageKey = reader.GetString(2);
            sizeBytes = reader.GetInt64(3);
            sha256 = reader.IsDBNull(4) ? null : reader.GetString(4);
        }

        var stream = storage.OpenRead(storageKey);
        try
        {
            await storage.VerifyIntegrityAndRewindAsync(stream, sizeBytes, sha256, cancellationToken);
            // Range requests are intentionally disabled in v1: every response is
            // verified end-to-end, and tiny ranges must not force full-file hashes.
            return Results.File(stream, contentType, fileName, enableRangeProcessing: false);
        }
        catch
        {
            await stream.DisposeAsync();
            throw;
        }
    }

    private static async Task DemandProjectAccessScopeAsync(
        SqlConnection connection,
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
            """, connection);
        command.Parameters.AddParameter("@project_id", SqlDbType.BigInt, projectId);
        command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
        command.Parameters.AddParameter("@elevated", SqlDbType.Bit, IsElevated(actor));
        var allowed = await command.ExecuteScalarAsync(cancellationToken);
        if (allowed is null)
            throw new ApiException(StatusCodes.Status404NotFound, "project_not_found", "The project was not found.");
        if (!(bool)allowed)
            throw new ApiException(StatusCodes.Status403Forbidden, "record_access_denied", "You are not assigned to this project.");
    }

    private static async Task<UploadContext?> GetUploadContextAsync(
        SqlConnection connection,
        SqlTransaction? transaction,
        long projectId,
        string folderCode,
        long actorId,
        bool elevated,
        CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            SELECT p.project_no, f.name,
                   CASE WHEN @elevated = 1 OR p.manager_id = @actor OR p.lead_engineer_id = @actor
                              OR EXISTS (SELECT 1 FROM dbo.project_members m WHERE m.project_id = p.id AND m.user_id = @actor)
                        THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END
            FROM dbo.projects p WITH (UPDLOCK, HOLDLOCK)
            LEFT JOIN dbo.project_folders f ON f.project_id = p.id AND f.folder_code = @folder_code
            WHERE p.id = @project_id AND p.deleted_at IS NULL;
            """, connection);
        if (transaction is not null) command.Transaction = transaction;
        command.Parameters.AddParameter("@project_id", SqlDbType.BigInt, projectId);
        command.Parameters.AddParameter("@folder_code", SqlDbType.Char, folderCode, 2);
        command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actorId);
        command.Parameters.AddParameter("@elevated", SqlDbType.Bit, elevated);
        await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
        if (!await reader.ReadAsync(cancellationToken)) return null;
        return new UploadContext(
            reader.GetString(0),
            reader.IsDBNull(1) ? null : reader.GetString(1),
            reader.GetBoolean(2));
    }

    private static void DemandUploadContext(UploadContext? context)
    {
        if (context is null)
            throw new ApiException(StatusCodes.Status404NotFound, "project_not_found", "The project was not found.");
        if (context.FolderName is null)
            throw new ApiException(StatusCodes.Status422UnprocessableEntity, "invalid_folder", "The selected project folder does not exist.");
        if (!context.CanWrite)
            throw new ApiException(StatusCodes.Status403Forbidden, "record_access_denied", "You are not assigned to this project.");
    }

    private static ProjectDocumentSummary ReadSummary(SqlDataReader reader) => new(
        reader.GetInt64(0),
        reader.GetString(1),
        reader.GetString(2),
        reader.GetInt64(3),
        reader.GetString(4),
        reader.GetString(5),
        reader.GetString(6),
        reader.IsDBNull(7) ? null : reader.GetString(7),
        reader.GetString(8),
        reader.GetFieldValue<DateTimeOffset>(9),
        reader.IsDBNull(10) ? null : reader.GetString(10),
        reader.RowVersionString(11));

    private static string RequiredSingleValue(StringValues values, string fieldName)
    {
        if (values.Count != 1 || string.IsNullOrWhiteSpace(values[0]))
            throw new ApiException(StatusCodes.Status400BadRequest, "validation_failed", $"Multipart field '{fieldName}' is required exactly once.");
        return values[0]!;
    }

    private static string? OptionalSingleValue(StringValues values, string fieldName)
    {
        if (values.Count > 1)
            throw new ApiException(StatusCodes.Status400BadRequest, "validation_failed", $"Multipart field '{fieldName}' may be supplied at most once.");
        return values.Count == 0 ? null : values[0];
    }

    private static string ExtractFileName(string untrustedName)
    {
        var normalized = untrustedName.Replace('\\', '/');
        return normalized[(normalized.LastIndexOf('/') + 1)..].Trim();
    }

    private static bool IsElevated(CurrentUser actor) => actor.Role is "Engineering Manager" or "Admin";

    private sealed record UploadContext(string ProjectNumber, string? FolderName, bool CanWrite);
}
