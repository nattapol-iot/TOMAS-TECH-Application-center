using Microsoft.Data.SqlClient;

namespace IoTTeamCenter.Api.Infrastructure;

public sealed class SqlConnectionFactory(IConfiguration configuration, IWebHostEnvironment environment)
{
    private readonly string _connectionString = ResolveConnectionString(configuration, environment);

    public async Task<SqlConnection> OpenAsync(CancellationToken cancellationToken)
    {
        var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);
        return connection;
    }

    private static string ResolveConnectionString(IConfiguration configuration, IWebHostEnvironment environment)
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
            Pooling = true,
            ApplicationName = "IoTTeamCenter.Api"
        };
        return builder.ConnectionString;
    }
}
