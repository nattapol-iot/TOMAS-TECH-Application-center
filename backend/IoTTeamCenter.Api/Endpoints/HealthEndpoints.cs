using IoTTeamCenter.Api.Infrastructure;
using Microsoft.Data.SqlClient;

namespace IoTTeamCenter.Api.Endpoints;

public static class HealthEndpoints
{
    private const int RequiredSchemaVersion = 28;

    public static void MapHealthEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/health/live", () => Results.Ok(new
        {
            status = "ok",
            service = "IoTTeamCenter.Api",
            timestamp = DateTimeOffset.UtcNow
        })).AllowAnonymous();

        app.MapGet("/health/ready", async (
            SqlConnectionFactory connections,
            ProjectDocumentStorage documentStorage,
            CancellationToken cancellationToken) =>
        {
            if (!await documentStorage.IsAvailableAsync(cancellationToken))
            {
                return Results.Json(
                    new { status = "document_storage_unavailable", timestamp = DateTimeOffset.UtcNow },
                    statusCode: StatusCodes.Status503ServiceUnavailable);
            }

            await using var connection = await connections.OpenAsync(cancellationToken);
            await using var command = new SqlCommand("SELECT COALESCE(MAX(version), 0), CASE WHEN EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=25) AND EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=26) AND EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=27) AND EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=28) THEN 1 ELSE 0 END FROM dbo.schema_versions;", connection);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            await reader.ReadAsync(cancellationToken);
            var schemaVersion = reader.GetInt32(0);
            var requiredSchemasReady = reader.GetInt32(1) == 1;
            if (schemaVersion < RequiredSchemaVersion || !requiredSchemasReady)
                return Results.Json(new { status = "migrations_required", schemaVersion, requiredSchemaVersion = RequiredSchemaVersion, requiredSchemaVersions = new[] { 25, 26, 27, 28 }, timestamp = DateTimeOffset.UtcNow }, statusCode: StatusCodes.Status503ServiceUnavailable);
            return Results.Ok(new { status = "ready", schemaVersion, documentStorage = "available", timestamp = DateTimeOffset.UtcNow });
        }).AllowAnonymous();
    }
}
