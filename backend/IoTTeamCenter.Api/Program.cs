using IoTTeamCenter.Api.Endpoints;
using IoTTeamCenter.Api.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Http.Features;
using System.Threading.RateLimiting;
using Microsoft.IdentityModel.Tokens;
using System.Net;
using System.Net.Sockets;

static bool IsPrivateLanIpv4(string host)
{
    if (!IPAddress.TryParse(host, out var address) || address.AddressFamily != AddressFamily.InterNetwork)
        return false;

    var octets = address.GetAddressBytes();
    return octets[0] == 10
        || (octets[0] == 172 && octets[1] is >= 16 and <= 31)
        || (octets[0] == 192 && octets[1] == 168);
}

static bool IsTrustedCorsOrigin(string origin, bool allowPrivateLanHttp)
{
    if (!Uri.TryCreate(origin, UriKind.Absolute, out var uri)
        || !string.IsNullOrEmpty(uri.UserInfo)
        || origin.Contains('*')
        || uri.GetLeftPart(UriPartial.Authority) != origin)
        return false;

    return uri.Scheme == Uri.UriSchemeHttps
        || (allowPrivateLanHttp && uri.Scheme == Uri.UriSchemeHttp && IsPrivateLanIpv4(uri.Host));
}

var builder = WebApplication.CreateBuilder(args);

// The default Windows EventLog provider can fail the request pipeline when an
// unprivileged IIS identity cannot create/open an event source. Emit to stdout
// instead so the hosting platform can collect logs without elevated rights.
builder.Logging.ClearProviders();
builder.Logging.AddConfiguration(builder.Configuration.GetSection("Logging"));
if (builder.Environment.IsDevelopment())
{
    builder.Logging.AddSimpleConsole();
    builder.Logging.AddDebug();
}
else
{
    builder.Logging.AddJsonConsole();
}

var corsOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
var businessTimeZoneId = builder.Configuration["Business:TimeZoneId"];
var authenticationMode = builder.Configuration["Authentication:Mode"] ?? "Entra";
var useDevelopmentAuthentication = builder.Environment.IsDevelopment() && authenticationMode == "Development";
var useTeamTestAuthentication = builder.Environment.IsStaging() && authenticationMode == TeamTestAuthenticationHandler.SchemeName;
var privateLanHttpConfigured = builder.Configuration.GetValue<bool>("TeamTest:AllowPrivateLanHttp");
var allowPrivateLanHttp = useTeamTestAuthentication && privateLanHttpConfigured;
if (privateLanHttpConfigured && !allowPrivateLanHttp)
    throw new InvalidOperationException("TeamTest:AllowPrivateLanHttp is allowed only in Staging TeamTest mode.");
var documentStorageOptions = DocumentStorageOptions.FromConfiguration(builder.Configuration, builder.Environment);
if (!builder.Environment.IsDevelopment())
{
    var allowedHosts = builder.Configuration["AllowedHosts"];
    var hostEntries = allowedHosts?.Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries) ?? [];
    if (hostEntries.Length == 0 || hostEntries.Any(host => host == "*" || host.Contains('*') || Uri.CheckHostName(host) == UriHostNameType.Unknown))
        throw new InvalidOperationException("AllowedHosts must contain the deployed API host in Production; wildcard hosts are not allowed.");
    if (corsOrigins.Length == 0 || corsOrigins.Any(origin => !IsTrustedCorsOrigin(origin, allowPrivateLanHttp)))
        throw new InvalidOperationException("Cors:AllowedOrigins must contain trusted HTTPS origins; private LAN HTTP is allowed only by explicit Staging TeamTest configuration.");
    if (string.IsNullOrWhiteSpace(businessTimeZoneId))
        throw new InvalidOperationException("Business:TimeZoneId is required in Production.");
}

businessTimeZoneId = string.IsNullOrWhiteSpace(businessTimeZoneId) ? "SE Asia Standard Time" : businessTimeZoneId;
TimeZoneInfo businessTimeZone;
try
{
    businessTimeZone = TimeZoneInfo.FindSystemTimeZoneById(businessTimeZoneId);
}
catch (TimeZoneNotFoundException exception)
{
    throw new InvalidOperationException($"Business:TimeZoneId '{businessTimeZoneId}' is not installed on this host.", exception);
}
catch (InvalidTimeZoneException exception)
{
    throw new InvalidOperationException($"Business:TimeZoneId '{businessTimeZoneId}' is invalid on this host.", exception);
}

builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<SqlConnectionFactory>();
builder.Services.AddScoped<CurrentUserService>();
builder.Services.AddSingleton(new BusinessClock(TimeProvider.System, businessTimeZone));
builder.Services.AddSingleton(documentStorageOptions);
builder.Services.AddSingleton<ProjectDocumentStorage>();
builder.Services.Configure<FormOptions>(options =>
{
    options.MultipartBodyLengthLimit = checked(documentStorageOptions.MaxFileSizeBytes + 1_048_576);
    options.ValueLengthLimit = 20_000;
    options.ValueCountLimit = 16;
    options.KeyLengthLimit = 64;
});
builder.Services.AddProblemDetails();

var requiredScope = builder.Configuration["Authentication:RequiredScope"];
if (authenticationMode == "Development" && !builder.Environment.IsDevelopment())
    throw new InvalidOperationException("Development authentication is allowed only in the Development environment.");
if (authenticationMode == TeamTestAuthenticationHandler.SchemeName && !builder.Environment.IsStaging())
    throw new InvalidOperationException("TeamTest authentication is allowed only in the Staging environment.");
if (authenticationMode is not ("Development" or TeamTestAuthenticationHandler.SchemeName or "Entra"))
    throw new InvalidOperationException("Authentication:Mode must be Development, TeamTest, or Entra.");

if (useDevelopmentAuthentication)
{
    builder.Services
        .AddAuthentication("Development")
        .AddScheme<AuthenticationSchemeOptions, DevelopmentAuthenticationHandler>("Development", _ => { });
}
else if (useTeamTestAuthentication)
{
    var teamTestSigningKey = builder.Configuration["Authentication:TeamTestSigningKey"];
    if (string.IsNullOrWhiteSpace(teamTestSigningKey) || teamTestSigningKey.Length < 32 || teamTestSigningKey.Length > 256)
        throw new InvalidOperationException("Authentication:TeamTestSigningKey must contain 32-256 characters in TeamTest mode.");

    builder.Services
        .AddAuthentication(TeamTestAuthenticationHandler.SchemeName)
        .AddScheme<AuthenticationSchemeOptions, TeamTestAuthenticationHandler>(TeamTestAuthenticationHandler.SchemeName, _ => { });
}
else
{
    var tenantId = builder.Configuration["Authentication:TenantId"];
    var clientId = builder.Configuration["Authentication:ClientId"];
    var audience = builder.Configuration["Authentication:Audience"];
    if (string.IsNullOrWhiteSpace(tenantId) || string.IsNullOrWhiteSpace(clientId)
        || string.IsNullOrWhiteSpace(audience) || string.IsNullOrWhiteSpace(requiredScope))
        throw new InvalidOperationException("Authentication:TenantId, Authentication:ClientId, Authentication:Audience, and Authentication:RequiredScope are required in Production.");
    if (!Guid.TryParse(tenantId, out var tenantGuid)
        || !Guid.TryParse(clientId, out var clientGuid)
        || !Guid.TryParse(audience, out var audienceGuid)
        || tenantGuid == Guid.Empty || clientGuid == Guid.Empty || audienceGuid == Guid.Empty
        || clientGuid != audienceGuid)
        throw new InvalidOperationException("Production Entra tenant, client, and audience values must be GUIDs, and Audience must equal the API ClientId for v2 access tokens.");
    if (requiredScope.Any(char.IsWhiteSpace))
        throw new InvalidOperationException("Authentication:RequiredScope must be one scope name without whitespace.");

    builder.Services
        .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
        .AddJwtBearer(options =>
        {
            options.Authority = $"https://login.microsoftonline.com/{tenantGuid:D}/v2.0";
            options.Audience = audienceGuid.ToString("D");
            options.MapInboundClaims = false;
            options.TokenValidationParameters = new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidateAudience = true,
                ValidateLifetime = true,
                ValidateIssuerSigningKey = true,
                ClockSkew = TimeSpan.FromMinutes(2),
                NameClaimType = "name",
                RoleClaimType = "roles"
            };
        });
}

builder.Services.AddAuthorization(options =>
{
    var policy = new AuthorizationPolicyBuilder().RequireAuthenticatedUser();
    if (!useDevelopmentAuthentication && !useTeamTestAuthentication)
    {
        policy.RequireAssertion(context => context.User.FindAll("scp")
            .SelectMany(claim => claim.Value.Split(' ', StringSplitOptions.RemoveEmptyEntries))
            .Contains(requiredScope!, StringComparer.Ordinal));
    }
    options.DefaultPolicy = policy.Build();
});
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context =>
    {
        var partition = context.User.FindFirst("oid")?.Value
            ?? context.Connection.RemoteIpAddress?.ToString()
            ?? "unknown";
        return RateLimitPartition.GetFixedWindowLimiter(partition, _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 300,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0,
            AutoReplenishment = true
        });
    });
    options.AddPolicy("document-upload", context =>
    {
        var partition = context.User.FindFirst("oid")?.Value
            ?? context.Connection.RemoteIpAddress?.ToString()
            ?? "unknown";
        return RateLimitPartition.GetFixedWindowLimiter($"document-upload:{partition}", _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 6,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0,
            AutoReplenishment = true
        });
    });
    options.AddPolicy("document-download", context =>
    {
        var partition = context.User.FindFirst("oid")?.Value
            ?? context.Connection.RemoteIpAddress?.ToString()
            ?? "unknown";
        return RateLimitPartition.GetFixedWindowLimiter($"document-download:{partition}", _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 12,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0,
            AutoReplenishment = true
        });
    });
});
builder.Services.AddCors(options =>
{
    options.AddPolicy("SitesFrontend", policy =>
    {
        policy.WithOrigins(corsOrigins)
            .AllowAnyHeader()
            .AllowAnyMethod()
            .SetPreflightMaxAge(TimeSpan.FromHours(1));
    });
});

var app = builder.Build();

app.UseMiddleware<ExceptionMiddleware>();
if (!app.Environment.IsDevelopment() && !allowPrivateLanHttp) app.UseHsts();
if (!allowPrivateLanHttp) app.UseHttpsRedirection();
app.Use(async (context, next) =>
{
    context.Response.Headers.XContentTypeOptions = "nosniff";
    context.Response.Headers.XFrameOptions = "DENY";
    context.Response.Headers["Referrer-Policy"] = "no-referrer";
    context.Response.Headers.CacheControl = "no-store";
    context.Response.Headers["X-Correlation-Id"] = context.TraceIdentifier;
    await next();
});
app.UseCors("SitesFrontend");
app.UseAuthentication();
app.UseRateLimiter();
app.UseAuthorization();

app.MapHealthEndpoints();
app.MapUserEndpoints();
app.MapBootstrapEndpoints();
app.MapInquiryEndpoints();
app.MapEstimateEndpoints();
app.MapEstimateCostEndpoints();
app.MapProjectEndpoints();
app.MapProjectDocumentEndpoints();
app.MapScheduleEndpoints();
app.MapInventoryEndpoints();
app.MapBomEndpoints();
app.MapPurchaseRequisitionEndpoints();
app.MapGoodsReceiptEndpoints();
app.MapMaterialIssueEndpoints();
app.MapStockControlEndpoints();
app.MapMasterDataEndpoints();

app.Run();

public partial class Program;
