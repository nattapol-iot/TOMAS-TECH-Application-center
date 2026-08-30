using IoTTeamCenter.Api.Infrastructure;
using Microsoft.Data.SqlClient;

namespace IoTTeamCenter.Api.Endpoints;

public static class HealthEndpoints
{
    private const int RequiredSchemaVersion = 5;

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
            await using var command = new SqlCommand("SELECT COALESCE(MAX(version), 0) FROM dbo.schema_versions;", connection);
            var schemaVersion = Convert.ToInt32(await command.ExecuteScalarAsync(cancellationToken));
            if (schemaVersion < RequiredSchemaVersion)
                return Results.Json(new { status = "migrations_required", schemaVersion, requiredSchemaVersion = RequiredSchemaVersion, timestamp = DateTimeOffset.UtcNow }, statusCode: StatusCodes.Status503ServiceUnavailable);
            return Results.Ok(new { status = "ready", schemaVersion, documentStorage = "available", timestamp = DateTimeOffset.UtcNow });
        }).AllowAnonymous();
    }
}
