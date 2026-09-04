using IoTTeamCenter.Api.Infrastructure;

namespace IoTTeamCenter.Api.Endpoints;

public static class UserEndpoints
{
    public static void MapUserEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/v1/me", async (CurrentUserService users, CancellationToken cancellationToken) =>
            Results.Ok(await users.GetRequiredAsync(cancellationToken)))
            .RequireAuthorization();
    }
}
