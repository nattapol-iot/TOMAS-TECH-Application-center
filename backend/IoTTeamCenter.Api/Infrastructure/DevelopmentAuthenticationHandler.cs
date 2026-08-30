using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;

namespace IoTTeamCenter.Api.Infrastructure;

public sealed class DevelopmentAuthenticationHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options,
    ILoggerFactory logger,
    UrlEncoder encoder)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, Request.Headers["X-Dev-User-Id"].FirstOrDefault() ?? "dev-user"),
            new Claim(ClaimTypes.Email, Request.Headers["X-Dev-User-Email"].FirstOrDefault() ?? "developer@tomastc.local"),
            new Claim("oid", Request.Headers["X-Dev-User-Id"].FirstOrDefault() ?? "dev-user"),
        };
        var identity = new ClaimsIdentity(claims, Scheme.Name);
        return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), Scheme.Name)));
    }
}
