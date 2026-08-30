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

        var builder = new SqlConnectionStringBuilder(value)
        {
            Encrypt = SqlConnectionEncryptOption.Mandatory,
            TrustServerCertificate = environment.IsDevelopment()
                && configuration.GetValue<bool>("Database:TrustServerCertificateForDevelopment"),
            PersistSecurityInfo = false,
            Pooling = true,
            ApplicationName = "IoTTeamCenter.Api"
        };
        return builder.ConnectionString;
    }
}
