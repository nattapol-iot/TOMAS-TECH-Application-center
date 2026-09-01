using System.Data;
using System.Globalization;
using System.Text.Json;
using IoTTeamCenter.Api.Infrastructure;
using IoTTeamCenter.Api.Models;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.Data.SqlClient;

namespace IoTTeamCenter.Api.Endpoints;

/// <summary>
/// Shared rules for the Sales Intake and Site Visit module: the two status
/// machines, the readiness score, notification delivery and status history.
///
/// This is the referee. lib/site-visit-rules.ts carries the same tables so a
/// screen can grey out a button it knows will be refused, but every write path
/// re-decides here against the caller's real permissions. A UI that lies about
/// what it is allowed to do changes nothing.
/// </summary>
public static class SiteVisitCore
{
    public const string PermIntakeRead = "intake.read";
    public const string PermIntakeWrite = "intake.write";
    public const string PermIntakeReview = "intake.review";
    public const string PermVisitRead = "visit.read";
    public const string PermVisitSchedule = "visit.schedule";
    public const string PermVisitOverride = "visit.override";
    public const string PermVisitExecute = "visit.execute";
    public const string PermVisitReport = "visit.report";
    public const string PermVisitReportApprove = "visit.report_approve";
    public const string PermVisitLink = "visit.link";
    public const string PermVisitAdmin = "visit.admin";

    public const string EntityIntake = "SalesIntake";
    public const string EntityVisit = "SiteVisit";
    public const string EntityReport = "SiteVisitReport";

    public const int DefaultReportSlaDays = 3;
    public const int ReportSlaWarningHours = 24;

    public sealed record Transition(string To, string Permission, bool RequiresReason, string Action);

    /// <summary>Sales intake workflow. Mirrors INTAKE_TRANSITIONS in lib/site-visit-rules.ts.</summary>
    public static readonly IReadOnlyDictionary<string, Transition[]> IntakeTransitions =
        new Dictionary<string, Transition[]>(StringComparer.Ordinal)
        {
            ["Draft"] =
            [
                new("Pending Technical Review", PermIntakeWrite, false, "Submit for technical review"),
                new("Cancelled", PermIntakeWrite, true, "Cancel intake"),
            ],
            ["Pending Technical Review"] =
            [
                new("More Information Required", PermIntakeReview, true, "Return to sales"),
                new("Ready to Schedule", PermIntakeReview, false, "Approve for scheduling"),
                new("On Hold", PermIntakeReview, true, "Put on hold"),
                new("Cancelled", PermIntakeReview, true, "Cancel intake"),
            ],
            ["More Information Required"] =
            [
                new("Pending Technical Review", PermIntakeWrite, false, "Resubmit for technical review"),
                new("Cancelled", PermIntakeWrite, true, "Cancel intake"),
            ],
            ["Ready to Schedule"] =
            [
                new("Scheduled", PermVisitSchedule, false, "Site visit scheduled"),
                new("More Information Required", PermIntakeReview, true, "Return to sales"),
                new("On Hold", PermIntakeReview, true, "Put on hold"),
                new("Cancelled", PermIntakeReview, true, "Cancel intake"),
            ],
            ["Scheduled"] =
            [
                new("Completed", PermVisitSchedule, false, "Mark intake complete"),
                new("Ready to Schedule", PermVisitSchedule, true, "Return to scheduling"),
                new("On Hold", PermIntakeReview, true, "Put on hold"),
                new("Cancelled", PermIntakeReview, true, "Cancel intake"),
            ],
            ["Completed"] = [new("Closed", PermIntakeReview, false, "Close intake")],
            ["On Hold"] =
            [
                new("Pending Technical Review", PermIntakeReview, true, "Resume review"),
                new("Ready to Schedule", PermIntakeReview, true, "Resume scheduling"),
                new("Cancelled", PermIntakeReview, true, "Cancel intake"),
            ],
            ["Cancelled"] = [],
            ["Closed"] = [],
        };

    /// <summary>Site visit workflow. Mirrors VISIT_TRANSITIONS in lib/site-visit-rules.ts.</summary>
    public static readonly IReadOnlyDictionary<string, Transition[]> VisitTransitions =
        new Dictionary<string, Transition[]>(StringComparer.Ordinal)
        {
            ["Tentative"] =
            [
                new("Pending Engineer Confirmation", PermVisitSchedule, false, "Request engineer confirmation"),
                new("Reschedule Requested", PermVisitSchedule, true, "Request reschedule"),
                new("Cancelled", PermVisitSchedule, true, "Cancel visit"),
                new("On Hold", PermVisitSchedule, true, "Put on hold"),
            ],
            ["Pending Engineer Confirmation"] =
            [
                new("Pending Customer Confirmation", PermVisitSchedule, false, "Engineers accepted"),
                new("Tentative", PermVisitSchedule, true, "Return to tentative"),
                new("Reschedule Requested", PermVisitSchedule, true, "Request reschedule"),
                new("Cancelled", PermVisitSchedule, true, "Cancel visit"),
                new("On Hold", PermVisitSchedule, true, "Put on hold"),
            ],
            ["Pending Customer Confirmation"] =
            [
                new("Confirmed", PermVisitSchedule, false, "Customer confirmed"),
                new("Reschedule Requested", PermVisitSchedule, true, "Request reschedule"),
                new("Cancelled", PermVisitSchedule, true, "Cancel visit"),
                new("On Hold", PermVisitSchedule, true, "Put on hold"),
            ],
            ["Confirmed"] =
            [
                new("In Progress", PermVisitExecute, false, "Check in"),
                new("Reschedule Requested", PermVisitSchedule, true, "Request reschedule"),
                new("Customer No-show", PermVisitExecute, true, "Record customer no-show"),
                new("Cancelled", PermVisitSchedule, true, "Cancel visit"),
            ],
            ["In Progress"] =
            [
                new("Report Pending", PermVisitExecute, false, "Check out"),
                new("Customer No-show", PermVisitExecute, true, "Record customer no-show"),
            ],
            ["Report Pending"] = [new("Report Under Review", PermVisitReport, false, "Submit report for review")],
            ["Report Under Review"] =
            [
                new("Completed", PermVisitReportApprove, false, "Approve report"),
                new("Report Pending", PermVisitReportApprove, true, "Request revision"),
            ],
            ["Completed"] = [new("Closed", PermVisitSchedule, false, "Close visit")],
            ["Reschedule Requested"] =
            [
                new("Tentative", PermVisitSchedule, false, "Reschedule"),
                new("Cancelled", PermVisitSchedule, true, "Cancel visit"),
            ],
            ["On Hold"] =
            [
                new("Tentative", PermVisitSchedule, true, "Resume scheduling"),
                new("Cancelled", PermVisitSchedule, true, "Cancel visit"),
            ],
            ["Customer No-show"] =
            [
                new("Reschedule Requested", PermVisitSchedule, true, "Request reschedule"),
                new("Closed", PermVisitSchedule, true, "Close without report"),
            ],
            ["Cancelled"] = [],
            ["Closed"] = [],
        };

    /// <summary>
    /// Resolves a requested status change, or throws the reason it cannot happen.
    /// A status that is not reachable from the current one is a 409, not a 400:
    /// the request was well formed, the record simply is not where the caller
    /// thought it was.
    /// </summary>
    public static Transition RequireTransition(
        IReadOnlyDictionary<string, Transition[]> map,
        string from,
        string to,
        IReadOnlySet<string> permissions,
        string? reason)
    {
        if (!map.TryGetValue(from, out var edges))
            throw new ApiException(StatusCodes.Status409Conflict, "unknown_status", $"'{from}' is not a known status.");
        var transition = Array.Find(edges, edge => string.Equals(edge.To, to, StringComparison.Ordinal))
            ?? throw new ApiException(StatusCodes.Status409Conflict, "transition_not_allowed",
                $"'{from}' cannot move directly to '{to}'.");
        if (!permissions.Contains(transition.Permission))
            throw new ApiException(StatusCodes.Status403Forbidden, "permission_denied",
                $"Permission '{transition.Permission}' is required to {transition.Action.ToLowerInvariant()}.");
        if (transition.RequiresReason && string.IsNullOrWhiteSpace(reason))
            throw new ApiException(StatusCodes.Status400BadRequest, "reason_required",
                "A reason is required for this status change.");
        return transition;
    }

    public static IReadOnlyList<string> AllowedTransitions(
        IReadOnlyDictionary<string, Transition[]> map,
        string from,
        IReadOnlySet<string> permissions) =>
        map.TryGetValue(from, out var edges)
            ? edges.Where(edge => permissions.Contains(edge.Permission)).Select(edge => edge.To).ToArray()
            : [];

    /* ---------------------------------------------------------------------
       Readiness
       --------------------------------------------------------------------- */

    public sealed record ReadinessInput(
        long CustomerId, string SiteName, string SiteAddress, string ContactName, string ContactPhone,
        string ContactEmail, string ProblemStatement, string ExpectedResult, int PurposeCount,
        string MachineName, string MachineModel, string ExistingSystem, int AttachmentCount,
        int WindowCount, string SafetyRequirement, string SiteAccessRequirement, int SkillCount);

    private sealed record ReadinessRule(string Key, string Label, int Weight, string Severity, string Hint,
        Func<ReadinessInput, bool> Test);

    private static bool Filled(string? value, int minimum = 1) => (value ?? "").Trim().Length >= minimum;

    private static readonly ReadinessRule[] ReadinessRules =
    [
        new("customer_site", "Customer and site are identified", 12, "blocker",
            "Choose the customer and name the site or factory the engineer must reach.",
            i => i.CustomerId > 0 && Filled(i.SiteName) && Filled(i.SiteAddress, 5)),
        new("contact", "Site contact person is reachable", 12, "blocker",
            "A name plus at least one of phone or email.",
            i => Filled(i.ContactName) && (Filled(i.ContactPhone, 6) || Filled(i.ContactEmail, 5))),
        new("problem", "Current problem is described", 14, "blocker",
            "What is happening today that made the customer call.",
            i => Filled(i.ProblemStatement, 20)),
        new("expected_result", "Expected result is stated", 14, "blocker",
            "What the customer wants to be true after the work is done.",
            i => Filled(i.ExpectedResult, 20)),
        new("purpose", "Visit purpose is selected", 10, "blocker",
            "At least one purpose, so the right checklist and skills are chosen.",
            i => i.PurposeCount > 0),
        new("machine", "Machine or system information is sufficient", 10, "warning",
            "Machine name plus a model, or a description of the existing system.",
            i => Filled(i.MachineName) && (Filled(i.MachineModel) || Filled(i.ExistingSystem, 10))),
        new("attachment", "A photo, drawing or document is attached", 8, "warning",
            "One picture of the real machine saves an hour of guessing.",
            i => i.AttachmentCount > 0),
        new("window", "Customer availability window is proposed", 8, "warning",
            "At least one date range the customer said would suit them.",
            i => i.WindowCount > 0),
        new("safety", "Safety and site access are recorded", 6, "warning",
            "PPE, permits, escorts, photography rules — anything that stops an engineer at the gate.",
            i => Filled(i.SafetyRequirement, 3) || Filled(i.SiteAccessRequirement, 3)),
        new("skill", "Expected engineering skills are indicated", 6, "warning",
            "Sales' best guess is enough; the coordinator can correct it.",
            i => i.SkillCount > 0),
    ];

    public static ReadinessResult EvaluateReadiness(ReadinessInput input)
    {
        var checks = new List<ReadinessCheckResult>(ReadinessRules.Length);
        var earned = 0;
        var total = 0;
        var blockers = 0;
        var warnings = 0;
        foreach (var rule in ReadinessRules)
        {
            total += rule.Weight;
            var passed = rule.Test(input);
            if (passed) earned += rule.Weight;
            else if (rule.Severity == "blocker") blockers++;
            else warnings++;
            checks.Add(new ReadinessCheckResult(rule.Key, rule.Label, rule.Weight, rule.Severity, rule.Hint, passed));
        }
        var score = total == 0 ? 0 : (int)Math.Round(earned * 100.0 / total, MidpointRounding.AwayFromZero);
        return new ReadinessResult(score, blockers, warnings, blockers == 0, checks);
    }

    /* ---------------------------------------------------------------------
       Report SLA
       --------------------------------------------------------------------- */

    public static string ReportSlaState(
        DateTimeOffset? dueAt,
        DateTimeOffset now,
        string? reportStatus,
        DateTimeOffset? submittedAt,
        int warningHours = ReportSlaWarningHours)
    {
        if (dueAt is not { } due) return "not_applicable";
        var settled = reportStatus is "Submitted" or "Under Review" or "Approved" or "Acknowledged";
        if (settled) return (submittedAt ?? now) <= due ? "met" : "missed";
        if (now > due) return "overdue";
        return due - now <= TimeSpan.FromHours(Math.Max(1, warningHours)) ? "due_soon" : "on_track";
    }

    /* ---------------------------------------------------------------------
       Skill match
       --------------------------------------------------------------------- */

    public static (int Percent, string[] Missing) SkillMatch(IEnumerable<string> required, IEnumerable<string> held)
    {
        var wanted = required.Select(code => code.Trim().ToUpperInvariant())
            .Where(code => code.Length > 0).Distinct(StringComparer.Ordinal).ToArray();
        if (wanted.Length == 0) return (100, []);
        var have = held.Select(code => code.Trim().ToUpperInvariant()).ToHashSet(StringComparer.Ordinal);
        var missing = wanted.Where(code => !have.Contains(code)).ToArray();
        return ((int)Math.Round((wanted.Length - missing.Length) * 100.0 / wanted.Length, MidpointRounding.AwayFromZero), missing);
    }

    /* ---------------------------------------------------------------------
       Persistence helpers
       --------------------------------------------------------------------- */

    public static async Task<IReadOnlySet<string>> LoadPermissionsAsync(
        SqlConnection connection, string roleCode, CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            SELECT p.code
            FROM dbo.role_permissions rp
            INNER JOIN dbo.permissions p ON p.id = rp.permission_id
            INNER JOIN dbo.roles r ON r.id = rp.role_id
            WHERE r.code = @role;
            """, connection);
        command.Parameters.AddParameter("@role", SqlDbType.NVarChar, roleCode, 50);
        var codes = new HashSet<string>(StringComparer.Ordinal);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken)) codes.Add(reader.GetString(0));
        return codes;
    }

    public static async Task RecordStatusAsync(
        SqlConnection connection,
        SqlTransaction transaction,
        string entityType,
        long entityId,
        string entityNumber,
        string? previousStatus,
        string newStatus,
        string? reason,
        long actorId,
        CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            INSERT INTO dbo.site_visit_status_history
                (entity_type, entity_id, entity_no, previous_status, new_status, reason, changed_by)
            VALUES (@entity_type, @entity_id, @entity_no, @previous, @new, @reason, @actor);
            """, connection, transaction);
        command.Parameters.AddParameter("@entity_type", SqlDbType.NVarChar, entityType, 30);
        command.Parameters.AddParameter("@entity_id", SqlDbType.BigInt, entityId);
        command.Parameters.AddParameter("@entity_no", SqlDbType.NVarChar, entityNumber, 30);
        command.Parameters.AddParameter("@previous", SqlDbType.NVarChar, previousStatus, 50);
        command.Parameters.AddParameter("@new", SqlDbType.NVarChar, newStatus, 50);
        command.Parameters.AddParameter("@reason", SqlDbType.NVarChar, string.IsNullOrWhiteSpace(reason) ? null : reason.Trim(), -1);
        command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actorId);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    /// <summary>
    /// Delivers one in-app notification per recipient, keyed so the same event
    /// cannot notify the same person twice. The duplicate is swallowed at the
    /// unique index rather than pre-checked, which is what makes it safe when
    /// two requests race.
    /// </summary>
    public static async Task NotifyAsync(
        SqlConnection connection,
        SqlTransaction transaction,
        IEnumerable<long> recipientIds,
        string kind,
        string title,
        string detail,
        string entityType,
        long entityId,
        string dedupeKey,
        CancellationToken cancellationToken)
    {
        var recipients = recipientIds.Where(id => id > 0).Distinct().ToArray();
        if (recipients.Length == 0) return;

        foreach (var recipient in recipients)
        {
            await using var command = new SqlCommand("""
                IF NOT EXISTS (
                    SELECT 1 FROM dbo.notifications WITH (UPDLOCK, HOLDLOCK)
                    WHERE user_id = @user_id AND dedupe_key = @dedupe_key)
                INSERT INTO dbo.notifications (user_id, kind, title, detail, entity_type, entity_id, dedupe_key)
                VALUES (@user_id, @kind, @title, @detail, @entity_type, @entity_id, @dedupe_key);
                """, connection, transaction);
            command.Parameters.AddParameter("@user_id", SqlDbType.BigInt, recipient);
            command.Parameters.AddParameter("@kind", SqlDbType.NVarChar, kind, 100);
            command.Parameters.AddParameter("@title", SqlDbType.NVarChar, Truncate(title, 300), 300);
            command.Parameters.AddParameter("@detail", SqlDbType.NVarChar, detail, -1);
            command.Parameters.AddParameter("@entity_type", SqlDbType.NVarChar, entityType, 50);
            command.Parameters.AddParameter("@entity_id", SqlDbType.BigInt, entityId);
            command.Parameters.AddParameter("@dedupe_key", SqlDbType.NVarChar, NotificationKey(dedupeKey), 200);
            await command.ExecuteNonQueryAsync(cancellationToken);
        }
    }

    public static string NotificationKey(string value) =>
        Truncate(string.Join(':', value.Split(':', StringSplitOptions.RemoveEmptyEntries)
            .Select(part => part.Trim().ToLowerInvariant().Replace(' ', '-'))), 200);

    private static string Truncate(string value, int length) => value.Length <= length ? value : value[..length];

    /// <summary>Everyone holding a permission — used to notify "the coordinators".</summary>
    public static async Task<IReadOnlyList<long>> UsersWithPermissionAsync(
        SqlConnection connection, SqlTransaction? transaction, string permission, CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            SELECT u.id
            FROM dbo.users u
            INNER JOIN dbo.roles r ON r.id = u.role_id
            INNER JOIN dbo.role_permissions rp ON rp.role_id = r.id
            INNER JOIN dbo.permissions p ON p.id = rp.permission_id
            WHERE p.code = @permission AND u.is_active = 1 AND u.deleted_at IS NULL;
            """, connection, transaction);
        command.Parameters.AddParameter("@permission", SqlDbType.NVarChar, permission, 100);
        var ids = new List<long>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken)) ids.Add(reader.GetInt64(0));
        return ids;
    }

    public static async Task AuditAsync(
        SqlConnection connection,
        SqlTransaction transaction,
        long actorId,
        string entityType,
        long entityId,
        string entityNumber,
        string action,
        object? before,
        object? after,
        string? reason,
        CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            INSERT INTO dbo.audit_log (actor_id, entity_type, entity_id, entity_no, action, before_json, after_json, reason)
            VALUES (@actor, @entity_type, @entity_id, @entity_no, @action, @before, @after, @reason);
            """, connection, transaction);
        command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actorId);
        command.Parameters.AddParameter("@entity_type", SqlDbType.NVarChar, entityType, 50);
        command.Parameters.AddParameter("@entity_id", SqlDbType.BigInt, entityId);
        command.Parameters.AddParameter("@entity_no", SqlDbType.NVarChar, Truncate(entityNumber, 50), 50);
        command.Parameters.AddParameter("@action", SqlDbType.NVarChar, Truncate(action, 100), 100);
        command.Parameters.AddParameter("@before", SqlDbType.NVarChar, SerializeAudit(before), -1);
        command.Parameters.AddParameter("@after", SqlDbType.NVarChar, SerializeAudit(after), -1);
        command.Parameters.AddParameter("@reason", SqlDbType.NVarChar, string.IsNullOrWhiteSpace(reason) ? null : reason.Trim(), -1);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static string? SerializeAudit(object? value)
    {
        if (value is null) return null;
        var json = JsonSerializer.Serialize(value);
        using var document = JsonDocument.Parse(json);
        return document.RootElement.ValueKind is JsonValueKind.Object or JsonValueKind.Array
            ? json
            : JsonSerializer.Serialize(new { value });
    }

    public static async Task<IReadOnlyList<StatusHistoryRecord>> LoadStatusHistoryAsync(
        SqlConnection connection, string entityType, long entityId, CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            SELECT TOP (200) h.id, h.entity_type, h.entity_id, h.entity_no, h.previous_status, h.new_status,
                   h.reason, u.name, h.changed_at
            FROM dbo.site_visit_status_history h
            INNER JOIN dbo.users u ON u.id = h.changed_by
            WHERE h.entity_type = @entity_type AND h.entity_id = @entity_id
            ORDER BY h.changed_at DESC, h.id DESC;
            """, connection);
        command.Parameters.AddParameter("@entity_type", SqlDbType.NVarChar, entityType, 30);
        command.Parameters.AddParameter("@entity_id", SqlDbType.BigInt, entityId);
        var rows = new List<StatusHistoryRecord>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
            rows.Add(new StatusHistoryRecord(
                reader.GetInt64(0), reader.GetString(1), reader.GetInt64(2), reader.GetString(3),
                reader.IsDBNull(4) ? null : reader.GetString(4), reader.GetString(5),
                reader.IsDBNull(6) ? null : reader.GetString(6), reader.GetString(7),
                reader.GetFieldValue<DateTimeOffset>(8)));
        return rows;
    }

    public static async Task<IReadOnlyList<TraceabilityLinkRecord>> LoadLinksAsync(
        SqlConnection connection, string sourceType, long sourceId, CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            SELECT l.id, l.source_type, l.source_id, l.target_type, l.target_id, l.target_no,
                   l.relation, l.note, u.name, l.created_at
            FROM dbo.site_visit_links l
            INNER JOIN dbo.users u ON u.id = l.created_by
            WHERE l.source_type = @source_type AND l.source_id = @source_id
            ORDER BY l.created_at DESC, l.id DESC;
            """, connection);
        command.Parameters.AddParameter("@source_type", SqlDbType.NVarChar, sourceType, 30);
        command.Parameters.AddParameter("@source_id", SqlDbType.BigInt, sourceId);
        var rows = new List<TraceabilityLinkRecord>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
            rows.Add(new TraceabilityLinkRecord(
                reader.GetInt64(0), reader.GetString(1), reader.GetInt64(2), reader.GetString(3),
                reader.GetInt64(4), reader.GetString(5), reader.GetString(6), reader.GetString(7),
                reader.GetString(8), reader.GetFieldValue<DateTimeOffset>(9)));
        return rows;
    }

    /// <summary>
    /// Optimistic concurrency, expressed once. Every write in this module reads
    /// its row under UPDLOCK/HOLDLOCK and compares the caller's token, so a
    /// second editor is told to reload rather than silently overwriting.
    /// </summary>
    public static void RequireSameVersion(byte[] expected, byte[] actual)
    {
        if (!expected.AsSpan().SequenceEqual(actual))
            throw new ApiException(StatusCodes.Status409Conflict, "concurrency_conflict",
                "This record changed while you were editing it. Reload and apply your change again.");
    }

    public static string Trim(string? value, int maxLength, string field)
    {
        var text = (value ?? "").Trim();
        if (text.Length > maxLength)
            throw new ApiException(StatusCodes.Status400BadRequest, "validation_failed",
                $"{field} must not exceed {maxLength} characters.");
        return text;
    }

    public static string? TrimOrNull(string? value, int maxLength, string field)
    {
        var text = Trim(value, maxLength, field);
        return text.Length == 0 ? null : text;
    }

    public static int Clamp(int value, int minimum, int maximum) => Math.Clamp(value, minimum, maximum);

    public static string FormatRange(DateTimeOffset? start, DateTimeOffset? end) =>
        start is null || end is null
            ? "not scheduled"
            : $"{start.Value.ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture)}–{end.Value.ToString("HH:mm", CultureInfo.InvariantCulture)}";
}

/// <summary>
/// Multipart upload handling shared by the intake and site-visit attachment
/// endpoints: one validation path, so a photo taken on a phone is checked
/// exactly the way an office upload is.
///
/// Storage keys are built here rather than on ProjectDocumentStorage. That
/// class belongs to the backend owner and is under active edit; WriteAsync
/// already resolves and validates any key against the configured root, so a
/// caller-supplied prefix is safe and costs nobody a merge conflict.
/// </summary>
public static class SiteVisitFiles
{
    private static readonly FileExtensionContentTypeProvider ContentTypes = new();

    public sealed record UploadPayload(
        IFormFile File, string FileName, string Extension, string ContentType,
        string Category, string Description, long? FindingId);

    public static async Task<UploadPayload> ReadUploadAsync(
        HttpRequest request, DocumentStorageOptions options, CancellationToken cancellationToken)
    {
        if (!request.HasFormContentType)
            throw new ApiException(StatusCodes.Status415UnsupportedMediaType, "multipart_required",
                "Upload requests must use multipart/form-data.");
        if (request.ContentLength > options.MaxFileSizeBytes + 1_048_576)
            throw new ApiException(StatusCodes.Status413PayloadTooLarge, "file_too_large",
                $"The file limit is {options.MaxFileSizeBytes} bytes.");

        var form = await request.ReadFormAsync(cancellationToken);
        if (form.Files.Count != 1 || form.Files.GetFile("file") is not { } file)
            throw new ApiException(StatusCodes.Status400BadRequest, "file_required",
                "Exactly one multipart file field named 'file' is required.");

        var category = form["category"].ToString().Trim();
        InputValidation.RequiredText(category, 100, "Document category");
        var description = form["description"].ToString().Trim();
        InputValidation.OptionalText(description, 1_000, "Description");
        long? findingId = long.TryParse(form["findingId"].ToString(), out var parsed) && parsed > 0 ? parsed : null;

        var fileName = Path.GetFileName(file.FileName.Replace('\\', '/'));
        InputValidation.RequiredText(fileName, 500, "File name");
        if (fileName.Any(char.IsControl) || file.Length <= 0)
            throw new ApiException(StatusCodes.Status400BadRequest, "invalid_file", "The uploaded file is invalid or empty.");
        if (file.Length > options.MaxFileSizeBytes)
            throw new ApiException(StatusCodes.Status413PayloadTooLarge, "file_too_large",
                $"The file limit is {options.MaxFileSizeBytes} bytes.");

        var extension = Path.GetExtension(fileName).ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(extension) || !options.IsAllowedExtension(extension))
            throw new ApiException(StatusCodes.Status415UnsupportedMediaType, "file_type_not_allowed",
                $"Files with extension '{extension}' are not allowed.");
        var contentType = ContentTypes.TryGetContentType(fileName, out var mapped) ? mapped : "application/octet-stream";

        return new UploadPayload(file, fileName, extension, contentType, category, description, findingId);
    }

    public static string StorageKey(string area, long ownerId, string extension)
    {
        var now = DateTimeOffset.UtcNow;
        return string.Join('/', area,
            ownerId.ToString(CultureInfo.InvariantCulture),
            now.ToString("yyyy", CultureInfo.InvariantCulture),
            now.ToString("MM", CultureInfo.InvariantCulture),
            $"{Guid.NewGuid():N}{extension.ToLowerInvariant()}");
    }
}
