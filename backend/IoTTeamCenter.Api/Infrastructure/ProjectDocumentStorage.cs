using System.Buffers;
using System.Globalization;
using System.Security.Cryptography;

namespace IoTTeamCenter.Api.Infrastructure;

public sealed class ProjectDocumentStorage(
    DocumentStorageOptions options,
    ILogger<ProjectDocumentStorage> logger)
{
    private readonly object _availabilitySync = new();
    private Task<bool>? _availabilityProbe;
    private DateTimeOffset _availabilityCacheExpiresAt;
    private bool _availabilityCachedResult;
    private readonly string _rootWithSeparator =
        options.RootPath.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)
        + Path.DirectorySeparatorChar;

    public string CreateStorageKey(long projectId, string folderCode, string extension)
    {
        var now = DateTimeOffset.UtcNow;
        return string.Join('/',
            "projects",
            projectId.ToString(CultureInfo.InvariantCulture),
            folderCode,
            now.ToString("yyyy", CultureInfo.InvariantCulture),
            now.ToString("MM", CultureInfo.InvariantCulture),
            $"{Guid.NewGuid():N}{extension.ToLowerInvariant()}");
    }

    public async Task<DocumentWriteResult> WriteAsync(string storageKey, Stream source, CancellationToken cancellationToken)
    {
        var destinationPath = ResolvePath(storageKey);
        var destinationDirectory = Path.GetDirectoryName(destinationPath)
            ?? throw new DocumentStorageUnavailableException("The document destination is invalid.");
        var temporaryPath = Path.Combine(destinationDirectory, $".uploading-{Guid.NewGuid():N}.tmp");

        try
        {
            Directory.CreateDirectory(destinationDirectory);
            var buffer = ArrayPool<byte>.Shared.Rent(81_920);
            long totalBytes = 0;
            string sha256;
            try
            {
                using var contentHash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
                await using (var destination = new FileStream(
                    temporaryPath,
                    FileMode.CreateNew,
                    FileAccess.Write,
                    FileShare.None,
                    buffer.Length,
                    FileOptions.Asynchronous | FileOptions.SequentialScan))
                {
                    while (true)
                    {
                        var bytesRead = await source.ReadAsync(buffer.AsMemory(0, buffer.Length), cancellationToken);
                        if (bytesRead == 0) break;
                        totalBytes = checked(totalBytes + bytesRead);
                        if (totalBytes > options.MaxFileSizeBytes)
                            throw new DocumentStorageLimitException(options.MaxFileSizeBytes);
                        contentHash.AppendData(buffer, 0, bytesRead);
                        await destination.WriteAsync(buffer.AsMemory(0, bytesRead), cancellationToken);
                    }

                    await destination.FlushAsync(cancellationToken);
                }

                if (totalBytes == 0)
                    throw new ApiException(StatusCodes.Status400BadRequest, "empty_file", "The uploaded file is empty.");
                sha256 = Convert.ToHexString(contentHash.GetHashAndReset()).ToLowerInvariant();
            }
            finally
            {
                ArrayPool<byte>.Shared.Return(buffer);
            }

            // The FileShare.None temp handle must be fully disposed before the
            // same-volume atomic move, especially on Windows/SMB.
            File.Move(temporaryPath, destinationPath, overwrite: false);
            return new DocumentWriteResult(totalBytes, sha256);
        }
        catch (DocumentStorageLimitException)
        {
            TryDeletePartialFile(temporaryPath);
            throw;
        }
        catch (ApiException)
        {
            TryDeletePartialFile(temporaryPath);
            throw;
        }
        catch (OperationCanceledException)
        {
            TryDeletePartialFile(temporaryPath);
            throw;
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            TryDeletePartialFile(temporaryPath);
            throw new DocumentStorageUnavailableException("The document could not be written to the configured storage.", exception);
        }
    }

    public FileStream OpenRead(string storageKey)
    {
        var path = ResolvePath(storageKey);
        try
        {
            return new FileStream(
                path,
                FileMode.Open,
                FileAccess.Read,
                FileShare.Read,
                81_920,
                FileOptions.Asynchronous | FileOptions.SequentialScan);
        }
        catch (FileNotFoundException exception)
        {
            throw new DocumentStorageFileMissingException(exception);
        }
        catch (DirectoryNotFoundException exception)
        {
            throw new DocumentStorageFileMissingException(exception);
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            throw new DocumentStorageUnavailableException("The configured document storage is unavailable.", exception);
        }
    }

    public async Task VerifyIntegrityAndRewindAsync(
        FileStream stream,
        long expectedSizeBytes,
        string? expectedSha256,
        CancellationToken cancellationToken)
    {
        if (expectedSizeBytes < 0
            || string.IsNullOrWhiteSpace(expectedSha256)
            || expectedSha256.Length != 64
            || expectedSha256.Any(character => !Uri.IsHexDigit(character))
            || !stream.CanSeek)
            throw new DocumentStorageIntegrityException("The stored integrity metadata is invalid.");

        byte[] expectedHash;
        try
        {
            expectedHash = Convert.FromHexString(expectedSha256);
        }
        catch (FormatException exception)
        {
            throw new DocumentStorageIntegrityException("The stored integrity metadata is invalid.", exception);
        }

        var buffer = ArrayPool<byte>.Shared.Rent(81_920);
        try
        {
            stream.Position = 0;
            using var contentHash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
            long actualSizeBytes = 0;
            while (true)
            {
                var bytesRead = await stream.ReadAsync(buffer.AsMemory(0, buffer.Length), cancellationToken);
                if (bytesRead == 0) break;
                actualSizeBytes = checked(actualSizeBytes + bytesRead);
                if (actualSizeBytes > expectedSizeBytes)
                    throw new DocumentStorageIntegrityException("The stored document size does not match its metadata.");
                contentHash.AppendData(buffer, 0, bytesRead);
            }

            var actualHash = contentHash.GetHashAndReset();
            if (actualSizeBytes != expectedSizeBytes || !CryptographicOperations.FixedTimeEquals(actualHash, expectedHash))
                throw new DocumentStorageIntegrityException("The stored document does not match its recorded SHA-256.");
            stream.Position = 0;
        }
        catch (DocumentStorageIntegrityException)
        {
            throw;
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            throw new DocumentStorageUnavailableException("The document could not be verified in the configured storage.", exception);
        }
        finally
        {
            ArrayPool<byte>.Shared.Return(buffer);
        }
    }

    public Task DeleteIfExistsAsync(string storageKey)
    {
        var path = ResolvePath(storageKey);
        try
        {
            File.Delete(path);
            return Task.CompletedTask;
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            throw new DocumentStorageUnavailableException("A document could not be removed after its metadata operation failed.", exception);
        }
    }

    public async Task<bool> IsAvailableAsync(CancellationToken cancellationToken)
    {
        Task<bool> probe;
        lock (_availabilitySync)
        {
            if (DateTimeOffset.UtcNow < _availabilityCacheExpiresAt)
                return _availabilityCachedResult;
            _availabilityProbe ??= Task.Run(ProbeAvailability);
            probe = _availabilityProbe;
        }

        bool result;
        try
        {
            result = await probe.WaitAsync(options.AvailabilityProbeTimeout, cancellationToken);
        }
        catch (TimeoutException)
        {
            logger.LogWarning("Document storage availability probe timed out");
            return false;
        }

        lock (_availabilitySync)
        {
            if (ReferenceEquals(_availabilityProbe, probe))
            {
                _availabilityProbe = null;
                _availabilityCachedResult = result;
                _availabilityCacheExpiresAt = DateTimeOffset.UtcNow + options.AvailabilityCacheDuration;
            }
        }
        return result;
    }

    private string ResolvePath(string storageKey)
    {
        var segments = storageKey.Split('/', StringSplitOptions.RemoveEmptyEntries);
        if (segments.Length == 0
            || storageKey.StartsWith('/')
            || storageKey.Contains('\\')
            || segments.Any(segment => segment is "." or ".." || segment.Length == 0))
            throw new DocumentStorageUnavailableException("The stored document key is invalid.");

        var combinedPath = Path.Combine([options.RootPath, .. segments]);
        var fullPath = Path.GetFullPath(combinedPath);
        if (!fullPath.StartsWith(_rootWithSeparator, StringComparison.OrdinalIgnoreCase))
            throw new DocumentStorageUnavailableException("The stored document key is outside the configured storage root.");
        return fullPath;
    }

    private bool ProbeAvailability()
    {
        try
        {
            if (options.Mode == "Local")
                Directory.CreateDirectory(options.RootPath);
            if (!Directory.Exists(options.RootPath))
                return false;

            // This is deliberately read-only for NAS mode. Deployment separately
            // proves write/read/delete access; an anonymous health GET never writes.
            using var enumerator = Directory.EnumerateFileSystemEntries(options.RootPath).GetEnumerator();
            _ = enumerator.MoveNext();
            return true;
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            logger.LogWarning(exception, "Document storage availability probe failed");
            return false;
        }
    }

    private void TryDeletePartialFile(string path)
    {
        try
        {
            File.Delete(path);
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            logger.LogError(exception, "Could not remove partial document upload");
        }
    }
}

public sealed class DocumentStorageUnavailableException : Exception
{
    public DocumentStorageUnavailableException(string message, Exception? innerException = null)
        : base(message, innerException) { }
}

public sealed class DocumentStorageFileMissingException(Exception innerException)
    : Exception("Document metadata exists but its file is missing from storage.", innerException);

public sealed class DocumentStorageLimitException(long maximumBytes)
    : Exception($"The uploaded file exceeds the configured limit of {maximumBytes} bytes.")
{
    public long MaximumBytes { get; } = maximumBytes;
}

public sealed class DocumentStorageIntegrityException : Exception
{
    public DocumentStorageIntegrityException(string message, Exception? innerException = null)
        : base(message, innerException) { }
}

public sealed record DocumentWriteResult(long SizeBytes, string Sha256);
