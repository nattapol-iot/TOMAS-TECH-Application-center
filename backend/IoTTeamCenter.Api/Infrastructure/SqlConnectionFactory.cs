using System.Text.RegularExpressions;
using Microsoft.Data.SqlClient;

namespace IoTTeamCenter.Api.Infrastructure;

public sealed partial class SqlConnectionFactory
{
    private readonly string _connectionString;
    private readonly string? _applicationRoleName;
    private readonly string? _applicationRolePassword;

    public SqlConnectionFactory(IConfiguration configuration, IWebHostEnvironment environment)
    {
        _applicationRoleName = configuration["Database:ApplicationRoleName"];
        _applicationRolePassword = configuration["Database:ApplicationRolePassword"];

        var hasApplicationRole = !string.IsNullOrWhiteSpace(_applicationRoleName)
            || !string.IsNullOrWhiteSpace(_applicationRolePassword);
        var isTeamTestStaging = environment.IsStaging()
            && configuration["Authentication:Mode"] == TeamTestAuthenticationHandler.SchemeName;

        if (hasApplicationRole && !isTeamTestStaging)
            throw new InvalidOperationException("Database application roles are allowed only in Staging TeamTest mode.");
        if (hasApplicationRole && (string.IsNullOrWhiteSpace(_applicationRoleName) || string.IsNullOrWhiteSpace(_applicationRolePassword)))
            throw new InvalidOperationException("Both Database:ApplicationRoleName and Database:ApplicationRolePassword are required.");
        if (hasApplicationRole && !ApplicationRoleNamePattern().IsMatch(_applicationRoleName!))
            throw new InvalidOperationException("Database:ApplicationRoleName contains unsupported characters.");
        if (hasApplicationRole && !ApplicationRolePasswordPattern().IsMatch(_applicationRolePassword!))
            throw new InvalidOperationException("Database:ApplicationRolePassword must be a 32-256 character base64url secret.");

        _connectionString = ResolveConnectionString(configuration, environment, hasApplicationRole);
    }

    public async Task<SqlConnection> OpenAsync(CancellationToken cancellationToken)
    {
        var connection = new SqlConnection(_connectionString);
        try
        {
            await connection.OpenAsync(cancellationToken);
            if (_applicationRoleName is not null && _applicationRolePassword is not null)
            {
                // sp_setapprole must be sent as an ad-hoc batch; parameterized execution
                // routes through sp_executesql and SQL Server rejects that activation path.
                var escapedName = _applicationRoleName.Replace("'", "''", StringComparison.Ordinal);
                var escapedPassword = _applicationRolePassword.Replace("'", "''", StringComparison.Ordinal);
                await using var command = connection.CreateCommand();
                command.CommandText = $"EXEC sys.sp_setapprole N'{escapedName}', N'{escapedPassword}';";
                await command.ExecuteNonQueryAsync(cancellationToken);
            }
            return connection;
        }
        catch
        {
            await connection.DisposeAsync();
            throw;
        }
    }

    private static string ResolveConnectionString(
        IConfiguration configuration,
        IWebHostEnvironment environment,
        bool useApplicationRole)
    {
        var value = configuration.GetConnectionString("IoTTeamCenter");
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new InvalidOperationException(
                "ConnectionStrings:IoTTeamCenter is required. Configure it with an environment variable or secret store; never commit credentials.");
        }

        var trustDevelopmentCertificate = environment.IsDevelopment()
            && configuration.GetValue<bool>("Database:TrustServerCertificateForDevelopment");
        var trustTeamTestCertificate = environment.IsStaging()
            && configuration["Authentication:Mode"] == TeamTestAuthenticationHandler.SchemeName
            && configuration.GetValue<bool>("Database:TrustServerCertificateForTeamTest");
        if (configuration.GetValue<bool>("Database:TrustServerCertificateForTeamTest") && !trustTeamTestCertificate)
            throw new InvalidOperationException("Database:TrustServerCertificateForTeamTest is allowed only in Staging TeamTest mode.");

        var builder = new SqlConnectionStringBuilder(value)
        {
            Encrypt = SqlConnectionEncryptOption.Mandatory,
            TrustServerCertificate = trustDevelopmentCertificate || trustTeamTestCertificate,
            PersistSecurityInfo = false,
            Pooling = !useApplicationRole,
            ApplicationName = "IoTTeamCenter.Api"
        };
        return builder.ConnectionString;
    }

    [GeneratedRegex("^[A-Za-z][A-Za-z0-9_]{2,63}$", RegexOptions.CultureInvariant)]
    private static partial Regex ApplicationRoleNamePattern();

    [GeneratedRegex("^[A-Za-z0-9_-]{32,256}$", RegexOptions.CultureInvariant)]
    private static partial Regex ApplicationRolePasswordPattern();
}
