namespace IoTTeamCenter.Api.Infrastructure;

public sealed class DocumentStorageOptions
{
    private const long MinimumFileSizeBytes = 1 * 1024 * 1024;
    private const long MaximumFileSizeBytes = 500 * 1024 * 1024;

    private DocumentStorageOptions(
        string mode,
        string rootPath,
        long maxFileSizeBytes,
        TimeSpan availabilityProbeTimeout,
        TimeSpan availabilityCacheDuration,
        HashSet<string> allowedExtensions)
    {
        Mode = mode;
        RootPath = rootPath;
        MaxFileSizeBytes = maxFileSizeBytes;
        AvailabilityProbeTimeout = availabilityProbeTimeout;
        AvailabilityCacheDuration = availabilityCacheDuration;
        AllowedExtensions = allowedExtensions;
    }

    public string Mode { get; }
    public string RootPath { get; }
    public long MaxFileSizeBytes { get; }
    public TimeSpan AvailabilityProbeTimeout { get; }
    public TimeSpan AvailabilityCacheDuration { get; }
    public IReadOnlySet<string> AllowedExtensions { get; }

    public bool IsAllowedExtension(string extension) => AllowedExtensions.Contains(extension);

    public static DocumentStorageOptions FromConfiguration(
        IConfiguration configuration,
        IWebHostEnvironment environment)
    {
        var section = configuration.GetSection("DocumentStorage");
        var mode = section["Mode"]?.Trim();
        var configuredRoot = section["RootPath"]?.Trim();
        var maxFileSizeBytes = section.GetValue<long?>("MaxFileSizeBytes") ?? 0;
        var availabilityProbeTimeoutSeconds = section.GetValue<int?>("AvailabilityProbeTimeoutSeconds") ?? 0;
        var availabilityCacheSeconds = section.GetValue<int?>("AvailabilityCacheSeconds") ?? 0;
        var configuredExtensions = section.GetSection("AllowedExtensions").Get<string[]>() ?? [];

        if (string.IsNullOrWhiteSpace(mode) || (mode is not ("Nas" or "Local")))
            throw new InvalidOperationException("DocumentStorage:Mode must be either 'Nas' or 'Local' (case-sensitive).");
        if (!environment.IsDevelopment() && mode != "Nas")
            throw new InvalidOperationException("DocumentStorage:Mode must be 'Nas' in Production.");
        if (string.IsNullOrWhiteSpace(configuredRoot))
            throw new InvalidOperationException("DocumentStorage:RootPath is required.");
        if (maxFileSizeBytes is < MinimumFileSizeBytes or > MaximumFileSizeBytes)
            throw new InvalidOperationException($"DocumentStorage:MaxFileSizeBytes must be between {MinimumFileSizeBytes} and {MaximumFileSizeBytes} bytes.");
        if (availabilityProbeTimeoutSeconds is < 1 or > 10)
            throw new InvalidOperationException("DocumentStorage:AvailabilityProbeTimeoutSeconds must be between 1 and 10.");
        if (availabilityCacheSeconds is < 1 or > 60)
            throw new InvalidOperationException("DocumentStorage:AvailabilityCacheSeconds must be between 1 and 60.");

        var rootPath = mode == "Nas"
            ? ValidateAndNormalizeUncRoot(configuredRoot)
            : Path.GetFullPath(configuredRoot, environment.ContentRootPath);

        var allowedExtensions = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var configuredExtension in configuredExtensions)
        {
            var extension = configuredExtension.Trim().ToLowerInvariant();
            if (extension.Length is < 2 or > 16
                || extension[0] != '.'
                || extension.Skip(1).Any(character => !char.IsAsciiLetterOrDigit(character)))
                throw new InvalidOperationException($"DocumentStorage:AllowedExtensions contains invalid value '{configuredExtension}'.");
            allowedExtensions.Add(extension);
        }

        if (allowedExtensions.Count == 0)
            throw new InvalidOperationException("DocumentStorage:AllowedExtensions must contain at least one file extension.");

        return new DocumentStorageOptions(
            mode,
            rootPath,
            maxFileSizeBytes,
            TimeSpan.FromSeconds(availabilityProbeTimeoutSeconds),
            TimeSpan.FromSeconds(availabilityCacheSeconds),
            allowedExtensions);
    }

    private static string ValidateAndNormalizeUncRoot(string configuredRoot)
    {
        if (!OperatingSystem.IsWindows())
            throw new InvalidOperationException("NAS document storage requires a Windows host with UNC path support.");
        if (!configuredRoot.StartsWith(@"\\", StringComparison.Ordinal))
            throw new InvalidOperationException("DocumentStorage:RootPath must be a UNC path containing a server and share, for example \\\\server\\share.");

        var segments = configuredRoot[2..].Split(
            ['\\', '/'],
            StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        var invalidUncCharacters = new HashSet<char>(['<', '>', ':', '"', '|', '?', '*']);
        if (segments.Length < 2
            || segments.Any(segment => segment is "." or ".." || segment.Any(invalidUncCharacters.Contains))
            || string.IsNullOrWhiteSpace(segments[0])
            || string.IsNullOrWhiteSpace(segments[1]))
            throw new InvalidOperationException("DocumentStorage:RootPath must contain a valid UNC server and share.");

        return Path.GetFullPath(configuredRoot);
    }
}
