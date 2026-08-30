using System.Net.Mail;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;

namespace IoTTeamCenter.Api.Infrastructure;

public sealed class TeamTestAuthenticationHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options,
    ILoggerFactory logger,
    UrlEncoder encoder,
    IConfiguration configuration)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    public const string SchemeName = "TeamTest";
    public const string AccessCodeHeader = "X-Team-Test-Code";
    public const string EmailHeader = "X-Team-Test-Email";

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var suppliedCode = Request.Headers[AccessCodeHeader].FirstOrDefault();
        var suppliedEmail = Request.Headers[EmailHeader].FirstOrDefault()?.Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(suppliedCode) || string.IsNullOrWhiteSpace(suppliedEmail))
            return Task.FromResult(AuthenticateResult.NoResult());

        if (suppliedEmail.Length > 256
            || !MailAddress.TryCreate(suppliedEmail, out var parsedEmail)
            || !string.Equals(parsedEmail.Address, suppliedEmail, StringComparison.OrdinalIgnoreCase))
            return Task.FromResult(AuthenticateResult.Fail("The team-test email is invalid."));

        var signingKey = configuration["Authentication:TeamTestSigningKey"];
        if (string.IsNullOrWhiteSpace(signingKey) || !AccessCodeMatches(signingKey, suppliedEmail, suppliedCode))
            return Task.FromResult(AuthenticateResult.Fail("The team-test credentials are invalid."));

        var identityHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(suppliedEmail)))[..24];
        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, suppliedEmail),
            new Claim(ClaimTypes.Email, suppliedEmail),
            new Claim("oid", $"team-test:{identityHash}"),
            new Claim("auth_mode", "team-test"),
        };
        var identity = new ClaimsIdentity(claims, Scheme.Name);
        var ticket = new AuthenticationTicket(new ClaimsPrincipal(identity), Scheme.Name);
        return Task.FromResult(AuthenticateResult.Success(ticket));
    }

    private static bool AccessCodeMatches(string signingKey, string email, string supplied)
    {
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(signingKey));
        var digest = hmac.ComputeHash(Encoding.UTF8.GetBytes(email));
        var expected = Convert.ToBase64String(digest).TrimEnd('=').Replace('+', '-').Replace('/', '_');
        return CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(expected), Encoding.ASCII.GetBytes(supplied));
    }
}
