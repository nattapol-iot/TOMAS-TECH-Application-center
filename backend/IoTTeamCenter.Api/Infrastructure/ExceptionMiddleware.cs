using IoTTeamCenter.Api.Models;
using Microsoft.Data.SqlClient;

namespace IoTTeamCenter.Api.Infrastructure;

public sealed class ExceptionMiddleware(RequestDelegate next, ILogger<ExceptionMiddleware> logger)
{
    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await next(context);
        }
        catch (ApiException exception)
        {
            context.Response.StatusCode = exception.StatusCode;
            await context.Response.WriteAsJsonAsync(new ApiError(exception.Code, exception.Message, exception.Details));
        }
        catch (BadHttpRequestException exception)
        {
            logger.LogInformation(exception, "Invalid HTTP request");
            context.Response.StatusCode = exception.StatusCode;
            await context.Response.WriteAsJsonAsync(exception.StatusCode == StatusCodes.Status413PayloadTooLarge
                ? new ApiError("payload_too_large", "The request exceeds the configured upload limit.")
                : new ApiError("invalid_request", "The request body or parameters are invalid."));
        }
        catch (DocumentStorageLimitException exception)
        {
            logger.LogInformation(exception, "Document upload exceeded the configured limit");
            context.Response.StatusCode = StatusCodes.Status413PayloadTooLarge;
            await context.Response.WriteAsJsonAsync(new ApiError(
                "file_too_large",
                "The uploaded file exceeds the configured limit.",
                new { maximumBytes = exception.MaximumBytes }));
        }
        catch (DocumentStorageFileMissingException exception)
        {
            logger.LogError(exception, "Document metadata points to missing storage content");
            context.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
            await context.Response.WriteAsJsonAsync(new ApiError("document_content_unavailable", "The document content is temporarily unavailable."));
        }
        catch (DocumentStorageIntegrityException exception)
        {
            logger.LogError(exception, "Document integrity verification failed");
            context.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
            await context.Response.WriteAsJsonAsync(new ApiError("document_integrity_failed", "The document failed its integrity check and was not served."));
        }
        catch (DocumentStorageUnavailableException exception)
        {
            logger.LogError(exception, "Document storage operation failed");
            context.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
            await context.Response.WriteAsJsonAsync(new ApiError("document_storage_unavailable", "The document storage operation could not be completed."));
        }
        catch (SqlException exception) when (exception.Number is 2601 or 2627)
        {
            context.Response.StatusCode = StatusCodes.Status409Conflict;
            await context.Response.WriteAsJsonAsync(new ApiError("duplicate", "The operation would create a duplicate record."));
        }
        catch (SqlException exception) when (exception.Number is 8152 or 2628)
        {
            logger.LogInformation(exception, "Input exceeded a database field length");
            context.Response.StatusCode = StatusCodes.Status400BadRequest;
            await context.Response.WriteAsJsonAsync(new ApiError("value_too_long", "One or more values exceed the allowed length."));
        }
        catch (SqlException exception) when (exception.Number is 547 or 8115)
        {
            logger.LogInformation(exception, "Input violated a database constraint");
            context.Response.StatusCode = StatusCodes.Status422UnprocessableEntity;
            await context.Response.WriteAsJsonAsync(new ApiError("constraint_violation", "The submitted values are outside the allowed range or reference an unavailable record."));
        }
        catch (SqlException exception)
        {
            logger.LogError(exception, "Database operation failed. SQL error {SqlError}", exception.Number);
            context.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
            await context.Response.WriteAsJsonAsync(new ApiError("database_unavailable", "The database operation could not be completed."));
        }
        catch (Exception exception)
        {
            logger.LogError(exception, "Unhandled API failure");
            context.Response.StatusCode = StatusCodes.Status500InternalServerError;
            await context.Response.WriteAsJsonAsync(new ApiError("internal_error", "An unexpected error occurred."));
        }
    }
}
