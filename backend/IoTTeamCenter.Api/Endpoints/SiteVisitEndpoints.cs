using System.Data;
using IoTTeamCenter.Api.Infrastructure;
using IoTTeamCenter.Api.Models;
using Microsoft.Data.SqlClient;

namespace IoTTeamCenter.Api.Endpoints;

/// <summary>
/// Site visit: request, assignment, scheduling, confirmation, execution,
/// report and the links out to Inquiry, Estimate and Project.
///
/// Two invariants are worth stating here because they are the reason several
/// methods look heavier than they need to:
///
///  * A double-booked engineer is a relationship between rows, and no CHECK
///    constraint can see it. Every assignment and every reschedule therefore
///    runs dbo.assert_engineer_available inside a serializable transaction
///    that holds UPDLOCK/HOLDLOCK on dbo.site_visits. A manager override does
///    not skip the check — it records the conflict and proceeds.
///
///  * The engineer's own findings are separate rows from the sales
///    requirement and from the technical assessment. Nothing in this file can
///    write to dbo.sales_intakes' requirement columns.
/// </summary>
public static class SiteVisitEndpoints
{
    public static void MapSiteVisitEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/site-visits").RequireAuthorization();
        group.MapGet("/", ListAsync);
        group.MapGet("/calendar", CalendarAsync);
        group.MapGet("/my-assignments", MyAssignmentsAsync);
        group.MapGet("/dashboard/engineering", EngineeringDashboardAsync);
        group.MapGet("/dashboard/management", ManagementDashboardAsync);
        group.MapGet("/{id:long}", GetAsync);
        group.MapGet("/{id:long}/brief", BriefAsync);
        group.MapGet("/{id:long}/candidates", CandidatesAsync);
        group.MapPost("/", CreateAsync);
        group.MapPost("/{id:long}/status", ChangeStatusAsync);
        group.MapPut("/{id:long}/schedule", RescheduleAsync);
        group.MapPost("/{id:long}/assignments", AssignAsync);
        group.MapPost("/{id:long}/assignments/{assignmentId:long}/response", RespondAsync);
        group.MapDelete("/{id:long}/assignments/{assignmentId:long}", WithdrawAssignmentAsync);
        group.MapPost("/{id:long}/confirmations", RecordConfirmationAsync);
        group.MapPost("/{id:long}/check-in", CheckInAsync);
        group.MapPost("/{id:long}/check-out", CheckOutAsync);
        group.MapPut("/{id:long}/checklist", SaveChecklistAsync);
        group.MapPost("/{id:long}/findings", SaveFindingAsync);
        group.MapDelete("/{id:long}/findings/{findingId:long}", DeleteFindingAsync);
        group.MapPost("/{id:long}/action-items", SaveActionItemAsync);
        group.MapPost("/{id:long}/attachments", UploadAttachmentAsync).DisableAntiforgery().RequireRateLimiting("document-upload");
        group.MapGet("/{id:long}/attachments/{attachmentId:long}/content", DownloadAttachmentAsync).RequireRateLimiting("document-download");
        group.MapPut("/{id:long}/report", SaveReportAsync);
        group.MapPost("/{id:long}/report/submit", SubmitReportAsync);
        group.MapPost("/{id:long}/report/review", ReviewReportAsync);
        group.MapPost("/{id:long}/report/acknowledge", AcknowledgeReportAsync);
        group.MapPost("/{id:long}/close", CloseAsync);
        group.MapPost("/{id:long}/links", LinkAsync);
        group.MapPost("/{id:long}/inquiry", CreateInquiryAsync);
        group.MapPost("/{id:long}/estimate", CreateEstimateAsync);
    }

    /* ===================================================================
       Summary projection, shared by the list, the intake detail and the
       dashboards so a visit reads identically wherever it appears.
       =================================================================== */

    private const string SummaryColumns = """
            v.id, v.visit_no, v.intake_id, i.intake_no, v.status,
            i.customer_id, c.name, i.site_name, i.subject,
            v.visit_type_id, t.name_en,
            v.scheduled_start, v.scheduled_end, v.time_zone_id, v.required_engineer_count,
            (SELECT COUNT_BIG(*) FROM dbo.site_visit_assignments a WHERE a.visit_id = v.id AND a.is_active = 1),
            (SELECT COUNT_BIG(*) FROM dbo.site_visit_assignments a WHERE a.visit_id = v.id AND a.is_active = 1 AND a.status = N'Accepted'),
            (SELECT TOP (1) u.name FROM dbo.site_visit_assignments a INNER JOIN dbo.users u ON u.id = a.engineer_id
                WHERE a.visit_id = v.id AND a.is_active = 1 AND a.assignment_role = N'Lead Engineer'),
            ISNULL(STUFF((SELECT N', ' + u.name FROM dbo.site_visit_assignments a INNER JOIN dbo.users u ON u.id = a.engineer_id
                WHERE a.visit_id = v.id AND a.is_active = 1 ORDER BY a.assignment_role, u.name
                FOR XML PATH(N''), TYPE).value(N'.', N'nvarchar(max)'), 1, 2, N''), N''),
            v.engineer_confirmed_at, v.customer_confirmed_at, v.checked_in_at, v.checked_out_at,
            v.report_due_at, r.status, r.submitted_at,
            (SELECT ISNULL(AVG(CAST(a.skill_match_percent AS int)), 0) FROM dbo.site_visit_assignments a
                WHERE a.visit_id = v.id AND a.is_active = 1),
            v.updated_at, v.row_version, v.archived_at
        """;

    private const string SummaryFrom = """
        FROM dbo.site_visits v
        INNER JOIN dbo.sales_intakes i ON i.id = v.intake_id
        INNER JOIN dbo.customers c ON c.id = i.customer_id
        INNER JOIN dbo.visit_types t ON t.id = v.visit_type_id
        LEFT JOIN dbo.site_visit_reports r ON r.visit_id = v.id
        """;

    private static SiteVisitSummary ReadSummary(SqlDataReader reader, DateTimeOffset now)
    {
        var reportDueAt = reader.IsDBNull(22) ? (DateTimeOffset?)null : reader.GetFieldValue<DateTimeOffset>(22);
        var reportStatus = reader.IsDBNull(23) ? null : reader.GetString(23);
        var submittedAt = reader.IsDBNull(24) ? (DateTimeOffset?)null : reader.GetFieldValue<DateTimeOffset>(24);
        return new SiteVisitSummary(
            reader.GetInt64(0), reader.GetString(1), reader.GetInt64(2), reader.GetString(3), reader.GetString(4),
            reader.GetInt64(5), reader.GetString(6), reader.GetString(7), reader.GetString(8),
            reader.GetInt64(9), reader.GetString(10),
            reader.IsDBNull(11) ? null : reader.GetFieldValue<DateTimeOffset>(11),
            reader.IsDBNull(12) ? null : reader.GetFieldValue<DateTimeOffset>(12),
            reader.GetString(13), reader.GetByte(14),
            (int)reader.GetInt64(15), (int)reader.GetInt64(16),
            reader.IsDBNull(17) ? null : reader.GetString(17), reader.GetString(18),
            !reader.IsDBNull(19), !reader.IsDBNull(20),
            reader.IsDBNull(21) ? null : reader.GetFieldValue<DateTimeOffset>(21),
            reader.IsDBNull(25) ? null : reader.GetFieldValue<DateTimeOffset>(25),
            reportDueAt, reportStatus,
            SiteVisitCore.ReportSlaState(reportDueAt, now, reportStatus, submittedAt),
            reader.GetInt32(26), reader.GetFieldValue<DateTimeOffset>(27), reader.RowVersionString(28), !reader.IsDBNull(29));
    }

    internal static async Task<IReadOnlyList<SiteVisitSummary>> LoadSummariesForIntakeAsync(
        SqlConnection connection, long intakeId, BusinessClock clock, CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand(
            $"SELECT {SummaryColumns} {SummaryFrom} WHERE v.intake_id = @intake_id AND v.deleted_at IS NULL ORDER BY v.created_at DESC, v.id DESC;", connection);
        command.Parameters.AddParameter("@intake_id", SqlDbType.BigInt, intakeId);
        var rows = new List<SiteVisitSummary>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken)) rows.Add(ReadSummary(reader, clock.UtcNow));
        return rows;
    }

    /* ===================================================================
       List
       =================================================================== */

    private static async Task<IResult> ListAsync(
        int page, int pageSize, string? search, string? status, long? customerId, long? engineerId,
        long? visitTypeId, DateOnly? from, DateOnly? to, bool? unassigned, bool? reportOverdue,
        bool? includeArchived, SqlConnectionFactory connections, CurrentUserService users, BusinessClock clock,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync(SiteVisitCore.PermVisitRead, cancellationToken);
        InputValidation.OptionalText(search, 200, "Search");
        InputValidation.OptionalText(status, 50, "Status");
        if (customerId is <= 0 || engineerId is <= 0 || visitTypeId is <= 0)
            throw new ApiException(StatusCodes.Status400BadRequest, "validation_failed", "Filter identifiers must be positive.");
        if (from > to) throw new ApiException(StatusCodes.Status400BadRequest, "validation_failed", "The date range is invalid.");
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize == 0 ? 25 : pageSize, 1, 100);

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var command = new SqlCommand($"""
            SELECT {SummaryColumns}, COUNT_BIG(*) OVER()
            {SummaryFrom}
            WHERE v.deleted_at IS NULL
              AND (@include_archived = 1 OR v.archived_at IS NULL)
              AND (@status IS NULL OR v.status = @status)
              AND (@customer_id IS NULL OR i.customer_id = @customer_id)
              AND (@visit_type_id IS NULL OR v.visit_type_id = @visit_type_id)
              AND (@engineer_id IS NULL OR EXISTS (
                    SELECT 1 FROM dbo.site_visit_assignments a
                    WHERE a.visit_id = v.id AND a.is_active = 1 AND a.engineer_id = @engineer_id))
              AND (@unassigned = 0 OR NOT EXISTS (
                    SELECT 1 FROM dbo.site_visit_assignments a WHERE a.visit_id = v.id AND a.is_active = 1))
              AND (@report_overdue = 0 OR (v.report_due_at IS NOT NULL AND v.report_due_at < SYSUTCDATETIME()
                    AND (r.status IS NULL OR r.status IN (N'Draft', N'Revision Requested'))))
              AND (@from IS NULL OR v.scheduled_start >= @from)
              AND (@to IS NULL OR v.scheduled_start < DATEADD(DAY, 1, CONVERT(datetime2(0), @to)))
              AND (@search IS NULL OR v.visit_no LIKE N'%' + @search + N'%'
                   OR i.intake_no LIKE N'%' + @search + N'%'
                   OR i.subject LIKE N'%' + @search + N'%'
                   OR c.name LIKE N'%' + @search + N'%'
                   OR i.site_name LIKE N'%' + @search + N'%')
            ORDER BY
                CASE WHEN v.scheduled_start IS NULL THEN 1 ELSE 0 END,
                v.scheduled_start DESC, v.id DESC
            OFFSET @offset ROWS FETCH NEXT @page_size ROWS ONLY;
            """, connection);
        command.Parameters.AddParameter("@status", SqlDbType.NVarChar, string.IsNullOrWhiteSpace(status) ? null : status.Trim(), 50);
        command.Parameters.AddParameter("@customer_id", SqlDbType.BigInt, customerId);
        command.Parameters.AddParameter("@engineer_id", SqlDbType.BigInt, engineerId);
        command.Parameters.AddParameter("@visit_type_id", SqlDbType.BigInt, visitTypeId);
        command.Parameters.AddParameter("@unassigned", SqlDbType.Bit, unassigned == true);
        command.Parameters.AddParameter("@report_overdue", SqlDbType.Bit, reportOverdue == true);
        command.Parameters.AddParameter("@include_archived", SqlDbType.Bit, includeArchived == true);
        command.Parameters.AddParameter("@from", SqlDbType.Date, from);
        command.Parameters.AddParameter("@to", SqlDbType.Date, to);
        command.Parameters.AddParameter("@search", SqlDbType.NVarChar, string.IsNullOrWhiteSpace(search) ? null : search.Trim(), 200);
        command.Parameters.AddParameter("@offset", SqlDbType.Int, (page - 1) * pageSize);
        command.Parameters.AddParameter("@page_size", SqlDbType.Int, pageSize);

        var items = new List<SiteVisitSummary>();
        long total = 0;
        var now = clock.UtcNow;
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            total = reader.GetInt64(30);
            items.Add(ReadSummary(reader, now));
        }
        return Results.Ok(new PagedResult<SiteVisitSummary>(items, page, pageSize, total));
    }

    /* ===================================================================
       Detail
       =================================================================== */

    private static async Task<IResult> GetAsync(
        long id, SqlConnectionFactory connections, CurrentUserService users, BusinessClock clock, CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync(SiteVisitCore.PermVisitRead, cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        if (id <= 0) return Results.NotFound();
        await using var connection = await connections.OpenAsync(cancellationToken);
        var permissions = await SiteVisitCore.LoadPermissionsAsync(connection, actor.Role, cancellationToken);
        var detail = await LoadDetailAsync(connection, id, actor.Id, permissions, clock, cancellationToken);
        return detail is null ? Results.NotFound() : Results.Ok(detail);
    }

    internal static async Task<SiteVisitDetail?> LoadDetailAsync(
        SqlConnection connection, long id, long actorId, IReadOnlySet<string> permissions,
        BusinessClock clock, CancellationToken cancellationToken)
    {
        SiteVisitDetail? shell;
        long intakeId;
        await using (var command = new SqlCommand("""
            SELECT v.id, v.visit_no, v.status, v.intake_id, i.intake_no, i.subject,
                   i.customer_id, c.code, c.name, i.site_name, i.site_address,
                   i.contact_name, i.contact_phone, i.contact_email,
                   v.visit_type_id, t.name_en, v.checklist_template_id, ct.name,
                   v.sla_policy_id, sla.name, ISNULL(sla.report_due_days, @default_sla),
                   v.scheduled_start, v.scheduled_end, v.time_zone_id,
                   v.travel_minutes_before, v.travel_minutes_after, v.meeting_point, v.required_equipment,
                   v.internal_note, v.customer_note, v.required_engineer_count,
                   v.engineer_confirmed_at, v.customer_confirmed_at,
                   v.checked_in_at, cin.name, v.check_in_latitude, v.check_in_longitude, v.location_consent_given,
                   v.checked_out_at, cout.name, v.actual_attendees, v.customer_attendees, v.execution_note,
                   v.report_due_at, v.closed_at, cby.name, v.close_reason,
                   v.department, cre.name, v.created_at, upd.name, v.updated_at, v.archived_at, v.row_version
            FROM dbo.site_visits v
            INNER JOIN dbo.sales_intakes i ON i.id = v.intake_id
            INNER JOIN dbo.customers c ON c.id = i.customer_id
            INNER JOIN dbo.visit_types t ON t.id = v.visit_type_id
            INNER JOIN dbo.users cre ON cre.id = v.created_by
            INNER JOIN dbo.users upd ON upd.id = v.updated_by
            LEFT JOIN dbo.visit_checklist_templates ct ON ct.id = v.checklist_template_id
            LEFT JOIN dbo.visit_sla_policies sla ON sla.id = v.sla_policy_id
            LEFT JOIN dbo.users cin ON cin.id = v.checked_in_by
            LEFT JOIN dbo.users cout ON cout.id = v.checked_out_by
            LEFT JOIN dbo.users cby ON cby.id = v.closed_by
            WHERE v.id = @id AND v.deleted_at IS NULL;
            """, connection))
        {
            command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
            command.Parameters.AddParameter("@default_sla", SqlDbType.Int, SiteVisitCore.DefaultReportSlaDays);
            await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
            if (!await reader.ReadAsync(cancellationToken)) return null;
            string S(int i) => reader.IsDBNull(i) ? "" : reader.GetString(i);
            DateTimeOffset? D(int i) => reader.IsDBNull(i) ? null : reader.GetFieldValue<DateTimeOffset>(i);
            intakeId = reader.GetInt64(3);
            shell = new SiteVisitDetail(
                reader.GetInt64(0), reader.GetString(1), reader.GetString(2), intakeId, reader.GetString(4), S(5),
                reader.GetInt64(6), S(7), S(8), S(9), S(10), S(11), S(12), S(13),
                reader.GetInt64(14), S(15), reader.IsDBNull(16) ? null : reader.GetInt64(16), reader.IsDBNull(17) ? null : reader.GetString(17),
                reader.IsDBNull(18) ? null : reader.GetInt64(18), reader.IsDBNull(19) ? null : reader.GetString(19), reader.GetInt32(20),
                D(21), D(22), reader.GetString(23), reader.GetInt32(24), reader.GetInt32(25), S(26), S(27), S(28), S(29),
                reader.GetByte(30), D(31), D(32),
                D(33), reader.IsDBNull(34) ? null : reader.GetString(34),
                reader.IsDBNull(35) ? null : reader.GetDecimal(35), reader.IsDBNull(36) ? null : reader.GetDecimal(36),
                reader.GetBoolean(37), D(38), reader.IsDBNull(39) ? null : reader.GetString(39),
                S(40), S(41), S(42), D(43), "", D(44), reader.IsDBNull(45) ? null : reader.GetString(45), S(46),
                S(47), S(48), reader.GetFieldValue<DateTimeOffset>(49), S(50), reader.GetFieldValue<DateTimeOffset>(51),
                !reader.IsDBNull(52), reader.RowVersionString(53),
                [], 0, [], [], [], [], [], [], [], [], [], [], null, [], false);
        }

        var requiredSkills = await LoadRequiredSkillCodesAsync(connection, null, intakeId, cancellationToken);
        var assignments = await LoadAssignmentsAsync(connection, id, requiredSkills, cancellationToken);
        var teamSkills = assignments.Where(a => a.IsActive).SelectMany(a => a.Skills).ToArray();
        var (teamPercent, teamMissing) = SiteVisitCore.SkillMatch(requiredSkills, teamSkills);

        var confirmations = new List<VisitConfirmationRecord>();
        await using (var command = new SqlCommand("""
            SELECT c.id, c.party, c.outcome, c.channel, c.confirmed_by_name, c.confirmed_at,
                   ISNULL(c.comment, N''), c.evidence_attachment_id, u.name, c.recorded_at
            FROM dbo.site_visit_confirmations c
            INNER JOIN dbo.users u ON u.id = c.recorded_by
            WHERE c.visit_id = @id ORDER BY c.confirmed_at DESC, c.id DESC;
            """, connection))
        {
            command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
                confirmations.Add(new VisitConfirmationRecord(reader.GetInt64(0), reader.GetString(1), reader.GetString(2),
                    reader.GetString(3), reader.GetString(4), reader.GetFieldValue<DateTimeOffset>(5), reader.GetString(6),
                    reader.IsDBNull(7) ? null : reader.GetInt64(7), reader.GetString(8), reader.GetFieldValue<DateTimeOffset>(9)));
        }

        var scheduleHistory = new List<VisitScheduleHistoryRecord>();
        await using (var command = new SqlCommand("""
            SELECT h.id, h.previous_start, h.previous_end, h.new_start, h.new_end, h.reason, u.name, h.changed_at
            FROM dbo.site_visit_schedule_history h
            INNER JOIN dbo.users u ON u.id = h.changed_by
            WHERE h.visit_id = @id ORDER BY h.changed_at DESC, h.id DESC;
            """, connection))
        {
            command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
                scheduleHistory.Add(new VisitScheduleHistoryRecord(reader.GetInt64(0),
                    reader.IsDBNull(1) ? null : reader.GetFieldValue<DateTimeOffset>(1),
                    reader.IsDBNull(2) ? null : reader.GetFieldValue<DateTimeOffset>(2),
                    reader.IsDBNull(3) ? null : reader.GetFieldValue<DateTimeOffset>(3),
                    reader.IsDBNull(4) ? null : reader.GetFieldValue<DateTimeOffset>(4),
                    reader.GetString(5), reader.GetString(6), reader.GetFieldValue<DateTimeOffset>(7)));
        }

        var checklist = await LoadChecklistAsync(connection, id, cancellationToken);
        var findings = await LoadFindingsAsync(connection, id, cancellationToken);
        var attachments = await LoadAttachmentsAsync(connection, id, cancellationToken);
        var actionItems = await LoadActionItemsAsync(connection, id, cancellationToken);
        var history = await SiteVisitCore.LoadStatusHistoryAsync(connection, SiteVisitCore.EntityVisit, id, cancellationToken);
        var links = await SiteVisitCore.LoadLinksAsync(connection, SiteVisitCore.EntityVisit, id, cancellationToken);
        var report = await LoadReportAsync(connection, id, clock.UtcNow, cancellationToken);

        var allowed = SiteVisitCore.AllowedTransitions(SiteVisitCore.VisitTransitions, shell!.Status, permissions);
        // Only an engineer actually on the job may run the visit. Holding
        // visit.execute is necessary, not sufficient.
        var canExecute = permissions.Contains(SiteVisitCore.PermVisitExecute)
            && assignments.Any(a => a.IsActive && a.EngineerId == actorId && a.Status == "Accepted");

        return shell with
        {
            ReportSlaState = SiteVisitCore.ReportSlaState(shell.ReportDueAt, clock.UtcNow, report?.Status, report?.SubmittedAt),
            RequiredSkills = requiredSkills,
            TeamSkillMatchPercent = teamPercent,
            MissingSkills = teamMissing,
            Assignments = assignments,
            Confirmations = confirmations,
            ScheduleHistory = scheduleHistory,
            Checklist = checklist,
            Findings = findings,
            Attachments = attachments,
            ActionItems = actionItems,
            StatusHistory = history,
            Links = links,
            Report = report,
            AllowedTransitions = allowed,
            CanExecute = canExecute,
        };
    }

    private static async Task<string[]> LoadRequiredSkillCodesAsync(
        SqlConnection connection, SqlTransaction? transaction, long intakeId, CancellationToken cancellationToken)
    {
        // The coordinator's list wins when they have stated one; otherwise the
        // sales guess stands. Both rows remain, so the change is visible.
        await using var command = new SqlCommand("""
            DECLARE @source nvarchar(20) = CASE
                WHEN EXISTS (SELECT 1 FROM dbo.sales_intake_skills WHERE intake_id = @intake_id AND source = N'Coordinator')
                THEN N'Coordinator' ELSE N'Sales' END;
            SELECT k.code
            FROM dbo.sales_intake_skills s
            INNER JOIN dbo.visit_skills k ON k.id = s.skill_id
            WHERE s.intake_id = @intake_id AND s.source = @source
            ORDER BY k.sort_order, k.code;
            """, connection, transaction);
        command.Parameters.AddParameter("@intake_id", SqlDbType.BigInt, intakeId);
        var codes = new List<string>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken)) codes.Add(reader.GetString(0));
        return [.. codes];
    }

    private static async Task<List<VisitAssignmentRecord>> LoadAssignmentsAsync(
        SqlConnection connection, long visitId, IReadOnlyList<string> requiredSkills, CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            SELECT a.id, a.engineer_id, u.name, u.department, a.assignment_role, a.status, a.skill_match_percent,
                   ISNULL(STUFF((SELECT N',' + k.code FROM dbo.engineer_skills es
                        INNER JOIN dbo.visit_skills k ON k.id = es.skill_id
                        WHERE es.user_id = a.engineer_id ORDER BY k.code
                        FOR XML PATH(N''), TYPE).value(N'.', N'nvarchar(max)'), 1, 1, N''), N''),
                   a.conflict_override, a.override_reason, ov.name, a.override_at,
                   a.responded_at, a.response_note, a.proposed_start, a.proposed_end,
                   a.is_active, asg.name, a.assigned_at, a.row_version
            FROM dbo.site_visit_assignments a
            INNER JOIN dbo.users u ON u.id = a.engineer_id
            INNER JOIN dbo.users asg ON asg.id = a.assigned_by
            LEFT JOIN dbo.users ov ON ov.id = a.override_by
            WHERE a.visit_id = @visit_id
            ORDER BY a.is_active DESC, a.assignment_role, a.assigned_at DESC, a.id DESC;
            """, connection);
        command.Parameters.AddParameter("@visit_id", SqlDbType.BigInt, visitId);
        var rows = new List<VisitAssignmentRecord>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var skills = reader.GetString(7).Split(',', StringSplitOptions.RemoveEmptyEntries);
            var (_, missing) = SiteVisitCore.SkillMatch(requiredSkills, skills);
            rows.Add(new VisitAssignmentRecord(
                reader.GetInt64(0), reader.GetInt64(1), reader.GetString(2), reader.GetString(3), reader.GetString(4),
                reader.GetString(5), reader.GetByte(6), skills, missing,
                reader.GetBoolean(8), reader.IsDBNull(9) ? null : reader.GetString(9),
                reader.IsDBNull(10) ? null : reader.GetString(10),
                reader.IsDBNull(11) ? null : reader.GetFieldValue<DateTimeOffset>(11),
                reader.IsDBNull(12) ? null : reader.GetFieldValue<DateTimeOffset>(12),
                reader.IsDBNull(13) ? null : reader.GetString(13),
                reader.IsDBNull(14) ? null : reader.GetFieldValue<DateTimeOffset>(14),
                reader.IsDBNull(15) ? null : reader.GetFieldValue<DateTimeOffset>(15),
                reader.GetBoolean(16), reader.GetString(17), reader.GetFieldValue<DateTimeOffset>(18),
                reader.RowVersionString(19)));
        }
        return rows;
    }

    private static async Task<List<VisitChecklistResponseRecord>> LoadChecklistAsync(
        SqlConnection connection, long visitId, CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            SELECT ci.id, ci.sort_order, ci.section, ci.prompt, ci.response_type, ci.unit, ci.is_required, ci.guidance,
                   r.id, r.response_value, r.numeric_value, ISNULL(r.unit, N''), ISNULL(r.is_not_applicable, 0),
                   r.note, u.name, r.answered_at, r.row_version
            FROM dbo.site_visits v
            INNER JOIN dbo.visit_checklist_items ci ON ci.template_id = v.checklist_template_id AND ci.is_active = 1
            LEFT JOIN dbo.site_visit_checklist_responses r ON r.visit_id = v.id AND r.checklist_item_id = ci.id
            LEFT JOIN dbo.users u ON u.id = r.answered_by
            WHERE v.id = @visit_id
            ORDER BY ci.sort_order;
            """, connection);
        command.Parameters.AddParameter("@visit_id", SqlDbType.BigInt, visitId);
        var rows = new List<VisitChecklistResponseRecord>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
            rows.Add(new VisitChecklistResponseRecord(
                reader.GetInt64(0), reader.GetInt32(1), reader.GetString(2), reader.GetString(3), reader.GetString(4),
                reader.GetString(5), reader.GetBoolean(6), reader.GetString(7),
                reader.IsDBNull(8) ? null : reader.GetInt64(8),
                reader.IsDBNull(9) ? null : reader.GetString(9),
                reader.IsDBNull(10) ? null : reader.GetDecimal(10),
                reader.GetString(11), reader.GetBoolean(12),
                reader.IsDBNull(13) ? null : reader.GetString(13),
                reader.IsDBNull(14) ? null : reader.GetString(14),
                reader.IsDBNull(15) ? null : reader.GetFieldValue<DateTimeOffset>(15),
                reader.IsDBNull(16) ? null : reader.RowVersionString(16)));
        return rows;
    }

    private static async Task<List<VisitFindingRecord>> LoadFindingsAsync(
        SqlConnection connection, long visitId, CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            SELECT f.id, f.kind, f.title, ISNULL(f.detail, N''), f.measurement_value, f.measurement_unit,
                   f.severity, f.sort_order, u.name, f.created_at, f.row_version
            FROM dbo.site_visit_findings f
            INNER JOIN dbo.users u ON u.id = f.created_by
            WHERE f.visit_id = @visit_id AND f.deleted_at IS NULL
            ORDER BY f.kind, f.sort_order, f.id;
            """, connection);
        command.Parameters.AddParameter("@visit_id", SqlDbType.BigInt, visitId);
        var rows = new List<VisitFindingRecord>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
            rows.Add(new VisitFindingRecord(reader.GetInt64(0), reader.GetString(1), reader.GetString(2), reader.GetString(3),
                reader.IsDBNull(4) ? null : reader.GetDecimal(4), reader.GetString(5), reader.GetString(6),
                reader.GetInt32(7), reader.GetString(8), reader.GetFieldValue<DateTimeOffset>(9), reader.RowVersionString(10)));
        return rows;
    }

    private static async Task<List<VisitAttachmentRecord>> LoadAttachmentsAsync(
        SqlConnection connection, long visitId, CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            SELECT a.id, a.finding_id, a.name, a.category, a.description, a.version, a.content_type,
                   a.size_bytes, a.scan_status, u.name, a.uploaded_at, a.row_version
            FROM dbo.site_visit_attachments a
            INNER JOIN dbo.users u ON u.id = a.uploaded_by
            WHERE a.visit_id = @visit_id AND a.deleted_at IS NULL
            ORDER BY a.uploaded_at DESC, a.id DESC;
            """, connection);
        command.Parameters.AddParameter("@visit_id", SqlDbType.BigInt, visitId);
        var rows = new List<VisitAttachmentRecord>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
            rows.Add(new VisitAttachmentRecord(reader.GetInt64(0), reader.IsDBNull(1) ? null : reader.GetInt64(1),
                reader.GetString(2), reader.GetString(3), reader.GetString(4), reader.GetInt32(5), reader.GetString(6),
                reader.GetInt64(7), reader.GetString(8), reader.GetString(9), reader.GetFieldValue<DateTimeOffset>(10),
                reader.RowVersionString(11)));
        return rows;
    }

    private static async Task<List<VisitActionItemRecord>> LoadActionItemsAsync(
        SqlConnection connection, long visitId, CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            SELECT a.id, a.title, ISNULL(a.detail, N''), a.owner_id, a.owner_name, a.due_date, a.status,
                   a.completed_at, u.name, a.created_at, a.row_version
            FROM dbo.site_visit_action_items a
            INNER JOIN dbo.users u ON u.id = a.created_by
            WHERE a.visit_id = @visit_id AND a.deleted_at IS NULL
            ORDER BY CASE a.status WHEN N'Open' THEN 0 WHEN N'In Progress' THEN 1 ELSE 2 END, a.due_date, a.id;
            """, connection);
        command.Parameters.AddParameter("@visit_id", SqlDbType.BigInt, visitId);
        var rows = new List<VisitActionItemRecord>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
            rows.Add(new VisitActionItemRecord(reader.GetInt64(0), reader.GetString(1), reader.GetString(2),
                reader.IsDBNull(3) ? null : reader.GetInt64(3), reader.GetString(4),
                reader.IsDBNull(5) ? null : reader.GetFieldValue<DateOnly>(5), reader.GetString(6),
                reader.IsDBNull(7) ? null : reader.GetFieldValue<DateTimeOffset>(7), reader.GetString(8),
                reader.GetFieldValue<DateTimeOffset>(9), reader.RowVersionString(10)));
        return rows;
    }

    private static async Task<VisitReportRecord?> LoadReportAsync(
        SqlConnection connection, long visitId, DateTimeOffset now, CancellationToken cancellationToken)
    {
        VisitReportRecord? report = null;
        long reportId = 0;
        int currentRevision = 0;
        await using (var command = new SqlCommand("""
            SELECT r.id, r.report_no, r.visit_id, v.visit_no, r.status, r.current_revision, r.author_id, au.name,
                   r.submitted_at, rev.name, r.reviewed_at, ISNULL(r.review_comment, N''),
                   r.customer_acknowledged_by, r.customer_acknowledged_at, r.customer_signature_storage_key,
                   r.due_at, r.created_at, r.updated_at, r.row_version
            FROM dbo.site_visit_reports r
            INNER JOIN dbo.site_visits v ON v.id = r.visit_id
            INNER JOIN dbo.users au ON au.id = r.author_id
            LEFT JOIN dbo.users rev ON rev.id = r.reviewed_by
            WHERE r.visit_id = @visit_id;
            """, connection))
        {
            command.Parameters.AddParameter("@visit_id", SqlDbType.BigInt, visitId);
            await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
            if (!await reader.ReadAsync(cancellationToken)) return null;
            reportId = reader.GetInt64(0);
            currentRevision = reader.GetInt32(5);
            var submittedAt = reader.IsDBNull(8) ? (DateTimeOffset?)null : reader.GetFieldValue<DateTimeOffset>(8);
            var dueAt = reader.IsDBNull(15) ? (DateTimeOffset?)null : reader.GetFieldValue<DateTimeOffset>(15);
            var status = reader.GetString(4);
            report = new VisitReportRecord(reportId, reader.GetString(1), reader.GetInt64(2), reader.GetString(3),
                status, currentRevision, reader.GetInt64(6), reader.GetString(7), submittedAt,
                reader.IsDBNull(9) ? null : reader.GetString(9),
                reader.IsDBNull(10) ? null : reader.GetFieldValue<DateTimeOffset>(10), reader.GetString(11),
                reader.GetString(12), reader.IsDBNull(13) ? null : reader.GetFieldValue<DateTimeOffset>(13),
                !reader.IsDBNull(14), dueAt, SiteVisitCore.ReportSlaState(dueAt, now, status, submittedAt),
                reader.GetFieldValue<DateTimeOffset>(16), reader.GetFieldValue<DateTimeOffset>(17),
                reader.RowVersionString(18), null, []);
        }

        var revisions = new List<VisitReportRevisionRecord>();
        await using (var command = new SqlCommand("""
            SELECT rv.id, rv.revision, rv.status,
                   ISNULL(rv.visit_summary, N''), ISNULL(rv.customer_requirement, N''), ISNULL(rv.existing_condition, N''),
                   ISNULL(rv.findings_summary, N''), ISNULL(rv.measurement_summary, N''), ISNULL(rv.root_cause, N''),
                   ISNULL(rv.recommended_solution, N''), ISNULL(rv.proposed_scope, N''), ISNULL(rv.assumption, N''),
                   ISNULL(rv.exclusion, N''), ISNULL(rv.risk, N''), ISNULL(rv.safety_concern, N''),
                   ISNULL(rv.customer_additional_request, N''), ISNULL(rv.engineer_conclusion, N''),
                   ISNULL(rv.sales_follow_up, N''), ISNULL(rv.next_step, N''), rv.change_summary,
                   cre.name, rv.created_at, apr.name, rv.approved_at, rv.row_version
            FROM dbo.site_visit_report_revisions rv
            INNER JOIN dbo.users cre ON cre.id = rv.created_by
            LEFT JOIN dbo.users apr ON apr.id = rv.approved_by
            WHERE rv.report_id = @report_id
            ORDER BY rv.revision DESC;
            """, connection))
        {
            command.Parameters.AddParameter("@report_id", SqlDbType.BigInt, reportId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
                revisions.Add(new VisitReportRevisionRecord(
                    reader.GetInt64(0), reader.GetInt32(1), reader.GetString(2), reader.GetString(3), reader.GetString(4),
                    reader.GetString(5), reader.GetString(6), reader.GetString(7), reader.GetString(8), reader.GetString(9),
                    reader.GetString(10), reader.GetString(11), reader.GetString(12), reader.GetString(13), reader.GetString(14),
                    reader.GetString(15), reader.GetString(16), reader.GetString(17), reader.GetString(18), reader.GetString(19),
                    reader.GetString(20), reader.GetFieldValue<DateTimeOffset>(21),
                    reader.IsDBNull(22) ? null : reader.GetString(22),
                    reader.IsDBNull(23) ? null : reader.GetFieldValue<DateTimeOffset>(23), reader.RowVersionString(24)));
        }

        return report! with
        {
            Current = revisions.FirstOrDefault(revision => revision.Revision == currentRevision),
            Revisions = revisions,
        };
    }

    /* ===================================================================
       Creating the visit request
       =================================================================== */

    private static async Task<IResult> CreateAsync(
        CreateSiteVisitRequest request, SqlConnectionFactory connections, CurrentUserService users,
        BusinessClock clock, CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync(SiteVisitCore.PermVisitSchedule, cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        if (request.IntakeId <= 0 || request.VisitTypeId <= 0)
            throw Invalid("An intake and a visit purpose are required.");
        if (request.ScheduledStart is not null != (request.ScheduledEnd is not null))
            throw Invalid("Give both a start and an end, or neither.");
        if (request.ScheduledStart is { } start && request.ScheduledEnd is { } end && end <= start)
            throw Invalid("The visit must end after it starts.");
        InputValidation.OptionalText(request.MeetingPoint, 500, "Meeting point");
        InputValidation.OptionalText(request.RequiredEquipment, 20_000, "Required equipment");
        InputValidation.OptionalText(request.InternalNote, 20_000, "Internal note");
        InputValidation.OptionalText(request.CustomerNote, 20_000, "Customer-facing note");
        var travelBefore = SiteVisitCore.Clamp(request.TravelMinutesBefore, 0, 1_440);
        var travelAfter = SiteVisitCore.Clamp(request.TravelMinutesAfter, 0, 1_440);
        var engineerCount = SiteVisitCore.Clamp(request.RequiredEngineerCount <= 0 ? 1 : request.RequiredEngineerCount, 1, 20);

        await using var connection = await connections.OpenAsync(cancellationToken);
        var permissions = await SiteVisitCore.LoadPermissionsAsync(connection, actor.Role, cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            string intakeNumber;
            string intakeStatus;
            long salesOwnerId;
            await using (var command = new SqlCommand("""
                SELECT intake_no, status, sales_owner_id
                FROM dbo.sales_intakes WITH (UPDLOCK, HOLDLOCK)
                WHERE id = @intake_id AND deleted_at IS NULL;
                """, connection, transaction))
            {
                command.Parameters.AddParameter("@intake_id", SqlDbType.BigInt, request.IntakeId);
                await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
                if (!await reader.ReadAsync(cancellationToken)) return Results.NotFound();
                intakeNumber = reader.GetString(0);
                intakeStatus = reader.GetString(1);
                salesOwnerId = reader.GetInt64(2);
            }

            // Technical review is the gate. A visit cannot be requested off the
            // back of an intake nobody has checked.
            if (intakeStatus is not ("Ready to Schedule" or "Scheduled"))
                throw new ApiException(StatusCodes.Status409Conflict, "intake_not_ready",
                    $"An intake in '{intakeStatus}' cannot be scheduled. It must pass technical review first.");

            // Fall back to the visit type's own checklist, then to the general one.
            long? templateId = request.ChecklistTemplateId is > 0 ? request.ChecklistTemplateId : null;
            long? slaPolicyId;
            await using (var command = new SqlCommand("""
                SELECT
                    COALESCE(@template_id,
                        (SELECT TOP (1) id FROM dbo.visit_checklist_templates WHERE visit_type_id = @visit_type_id AND is_active = 1),
                        (SELECT TOP (1) id FROM dbo.visit_checklist_templates WHERE code = N'CL_GENERAL' AND is_active = 1)),
                    COALESCE(
                        (SELECT TOP (1) id FROM dbo.visit_sla_policies WHERE visit_type_id = @visit_type_id AND is_active = 1),
                        (SELECT TOP (1) id FROM dbo.visit_sla_policies WHERE is_default = 1 AND is_active = 1)),
                    CASE WHEN EXISTS (SELECT 1 FROM dbo.visit_types WHERE id = @visit_type_id AND is_active = 1) THEN 1 ELSE 0 END;
                """, connection, transaction))
            {
                command.Parameters.AddParameter("@template_id", SqlDbType.BigInt, templateId);
                command.Parameters.AddParameter("@visit_type_id", SqlDbType.BigInt, request.VisitTypeId);
                await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
                await reader.ReadAsync(cancellationToken);
                templateId = reader.IsDBNull(0) ? null : reader.GetInt64(0);
                slaPolicyId = reader.IsDBNull(1) ? null : reader.GetInt64(1);
                if (reader.GetInt32(2) != 1)
                    throw new ApiException(StatusCodes.Status422UnprocessableEntity, "invalid_reference", "The visit purpose is not active.");
            }

            var number = await InquiryEndpoints.IssueNumberAsync(connection, transaction, "SV", clock.Today, cancellationToken);
            long id;
            await using (var command = new SqlCommand("""
                INSERT INTO dbo.site_visits (
                    visit_no, intake_id, status, visit_type_id, checklist_template_id, sla_policy_id,
                    proposed_window_id, scheduled_start, scheduled_end, time_zone_id,
                    travel_minutes_before, travel_minutes_after, meeting_point, required_equipment,
                    internal_note, customer_note, required_engineer_count, department, created_by, updated_by)
                OUTPUT inserted.id
                VALUES (@number, @intake_id, N'Tentative', @visit_type_id, @template_id, @sla_policy_id,
                    @window_id, @start, @end, @time_zone, @travel_before, @travel_after, @meeting_point,
                    @equipment, @internal_note, @customer_note, @engineer_count, @department, @actor, @actor);
                """, connection, transaction))
            {
                command.Parameters.AddParameter("@number", SqlDbType.NVarChar, number, 30);
                command.Parameters.AddParameter("@intake_id", SqlDbType.BigInt, request.IntakeId);
                command.Parameters.AddParameter("@visit_type_id", SqlDbType.BigInt, request.VisitTypeId);
                command.Parameters.AddParameter("@template_id", SqlDbType.BigInt, templateId);
                command.Parameters.AddParameter("@sla_policy_id", SqlDbType.BigInt, slaPolicyId);
                command.Parameters.AddParameter("@window_id", SqlDbType.BigInt, request.ProposedWindowId is > 0 ? request.ProposedWindowId : null);
                command.Parameters.AddParameter("@start", SqlDbType.DateTimeOffset, request.ScheduledStart);
                command.Parameters.AddParameter("@end", SqlDbType.DateTimeOffset, request.ScheduledEnd);
                command.Parameters.AddParameter("@time_zone", SqlDbType.NVarChar,
                    string.IsNullOrWhiteSpace(request.TimeZoneId) ? "SE Asia Standard Time" : request.TimeZoneId.Trim(), 100);
                command.Parameters.AddParameter("@travel_before", SqlDbType.Int, travelBefore);
                command.Parameters.AddParameter("@travel_after", SqlDbType.Int, travelAfter);
                command.Parameters.AddParameter("@meeting_point", SqlDbType.NVarChar, SiteVisitCore.Trim(request.MeetingPoint, 500, "Meeting point"), 500);
                command.Parameters.AddParameter("@equipment", SqlDbType.NVarChar, SiteVisitCore.TrimOrNull(request.RequiredEquipment, 20_000, "Required equipment"), -1);
                command.Parameters.AddParameter("@internal_note", SqlDbType.NVarChar, SiteVisitCore.TrimOrNull(request.InternalNote, 20_000, "Internal note"), -1);
                command.Parameters.AddParameter("@customer_note", SqlDbType.NVarChar, SiteVisitCore.TrimOrNull(request.CustomerNote, 20_000, "Customer note"), -1);
                command.Parameters.AddParameter("@engineer_count", SqlDbType.TinyInt, (byte)engineerCount);
                command.Parameters.AddParameter("@department", SqlDbType.NVarChar, actor.Department, 100);
                command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                id = (long)(await command.ExecuteScalarAsync(cancellationToken))!;
            }

            if (request.ScheduledStart is not null)
                await RecordScheduleHistoryAsync(connection, transaction, id, null, null,
                    request.ScheduledStart, request.ScheduledEnd, "Initial schedule", actor.Id, cancellationToken);

            await SiteVisitCore.RecordStatusAsync(connection, transaction, SiteVisitCore.EntityVisit, id, number,
                null, "Tentative", "Site visit requested", actor.Id, cancellationToken);
            await SiteVisitCore.AuditAsync(connection, transaction, actor.Id, SiteVisitCore.EntityVisit, id, number,
                "Site visit created", null,
                new { request.IntakeId, request.VisitTypeId, request.ScheduledStart, request.ScheduledEnd }, null, cancellationToken);

            // Moving the intake to Scheduled uses exactly the same transition
            // table the intake endpoint uses; scheduling is not a back door.
            if (intakeStatus == "Ready to Schedule")
            {
                SiteVisitCore.RequireTransition(SiteVisitCore.IntakeTransitions, intakeStatus, "Scheduled", permissions, null);
                await using var command = new SqlCommand(
                    "UPDATE dbo.sales_intakes SET status = N'Scheduled', updated_by = @actor, updated_at = SYSUTCDATETIME() WHERE id = @intake_id;",
                    connection, transaction);
                command.Parameters.AddParameter("@intake_id", SqlDbType.BigInt, request.IntakeId);
                command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                await command.ExecuteNonQueryAsync(cancellationToken);
                await SiteVisitCore.RecordStatusAsync(connection, transaction, SiteVisitCore.EntityIntake, request.IntakeId,
                    intakeNumber, intakeStatus, "Scheduled", $"Site visit {number} created", actor.Id, cancellationToken);
            }

            await SiteVisitCore.NotifyAsync(connection, transaction, [salesOwnerId],
                "visit.created", $"{number} was created for {intakeNumber}",
                "A site visit request has been raised for your intake.", SiteVisitCore.EntityVisit, id,
                $"visit.created:{SiteVisitCore.EntityVisit}:{id}", cancellationToken);

            await transaction.CommitAsync(cancellationToken);
            return Results.Created($"/api/v1/site-visits/{id}", new { id, number, intakeId = request.IntakeId });
        }
        catch
        {
            if (transaction.Connection is not null) await transaction.RollbackAsync(CancellationToken.None);
            throw;
        }
    }

    private static ApiException Invalid(string message) =>
        new(StatusCodes.Status400BadRequest, "validation_failed", message);

    private static async Task RecordScheduleHistoryAsync(
        SqlConnection connection, SqlTransaction transaction, long visitId,
        DateTimeOffset? previousStart, DateTimeOffset? previousEnd,
        DateTimeOffset? newStart, DateTimeOffset? newEnd, string reason, long actorId, CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            INSERT INTO dbo.site_visit_schedule_history
                (visit_id, previous_start, previous_end, new_start, new_end, reason, changed_by)
            VALUES (@visit_id, @previous_start, @previous_end, @new_start, @new_end, @reason, @actor);
            """, connection, transaction);
        command.Parameters.AddParameter("@visit_id", SqlDbType.BigInt, visitId);
        command.Parameters.AddParameter("@previous_start", SqlDbType.DateTimeOffset, previousStart);
        command.Parameters.AddParameter("@previous_end", SqlDbType.DateTimeOffset, previousEnd);
        command.Parameters.AddParameter("@new_start", SqlDbType.DateTimeOffset, newStart);
        command.Parameters.AddParameter("@new_end", SqlDbType.DateTimeOffset, newEnd);
        command.Parameters.AddParameter("@reason", SqlDbType.NVarChar, SiteVisitCore.Trim(reason, 1_000, "Reason"), 1_000);
        command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actorId);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    /// <summary>Reads the visit under lock and checks the caller's token in one place.</summary>
    private sealed record VisitLock(
        long Id, string Number, string Status, long IntakeId, string IntakeNumber, long SalesOwnerId,
        DateTimeOffset? ScheduledStart, DateTimeOffset? ScheduledEnd, int TravelBefore, int TravelAfter,
        int RequiredEngineerCount, long? SlaPolicyId, int ReportDueDays,
        DateTimeOffset? CheckedInAt, DateTimeOffset? CheckedOutAt);

    private static async Task<VisitLock?> LockVisitAsync(
        SqlConnection connection, SqlTransaction transaction, long id, byte[]? expectedVersion, CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            SELECT v.id, v.visit_no, v.status, v.intake_id, i.intake_no, i.sales_owner_id,
                   v.scheduled_start, v.scheduled_end, v.travel_minutes_before, v.travel_minutes_after,
                   v.required_engineer_count, v.sla_policy_id, ISNULL(sla.report_due_days, @default_sla),
                   v.checked_in_at, v.checked_out_at, v.row_version, v.archived_at
            FROM dbo.site_visits v WITH (UPDLOCK, HOLDLOCK)
            INNER JOIN dbo.sales_intakes i ON i.id = v.intake_id
            LEFT JOIN dbo.visit_sla_policies sla ON sla.id = v.sla_policy_id
            WHERE v.id = @id AND v.deleted_at IS NULL;
            """, connection, transaction);
        command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
        command.Parameters.AddParameter("@default_sla", SqlDbType.Int, SiteVisitCore.DefaultReportSlaDays);
        await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
        if (!await reader.ReadAsync(cancellationToken)) return null;
        if (expectedVersion is not null) SiteVisitCore.RequireSameVersion(expectedVersion, (byte[])reader.GetValue(15));
        if (!reader.IsDBNull(16))
            throw new ApiException(StatusCodes.Status409Conflict, "visit_archived", "An archived site visit cannot be changed.");
        return new VisitLock(
            reader.GetInt64(0), reader.GetString(1), reader.GetString(2), reader.GetInt64(3), reader.GetString(4),
            reader.GetInt64(5),
            reader.IsDBNull(6) ? null : reader.GetFieldValue<DateTimeOffset>(6),
            reader.IsDBNull(7) ? null : reader.GetFieldValue<DateTimeOffset>(7),
            reader.GetInt32(8), reader.GetInt32(9), reader.GetByte(10),
            reader.IsDBNull(11) ? null : reader.GetInt64(11), reader.GetInt32(12),
            reader.IsDBNull(13) ? null : reader.GetFieldValue<DateTimeOffset>(13),
            reader.IsDBNull(14) ? null : reader.GetFieldValue<DateTimeOffset>(14));
    }

    private static async Task<string> ReadVisitRowVersionAsync(
        SqlConnection connection, SqlTransaction? transaction, long id, CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("SELECT row_version FROM dbo.site_visits WHERE id = @id;", connection, transaction);
        command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
        return Convert.ToBase64String((byte[])(await command.ExecuteScalarAsync(cancellationToken))!);
    }

    private static async Task<IReadOnlyList<long>> ActiveEngineerIdsAsync(
        SqlConnection connection, SqlTransaction? transaction, long visitId, CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand(
            "SELECT engineer_id FROM dbo.site_visit_assignments WHERE visit_id = @visit_id AND is_active = 1;", connection, transaction);
        command.Parameters.AddParameter("@visit_id", SqlDbType.BigInt, visitId);
        var ids = new List<long>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken)) ids.Add(reader.GetInt64(0));
        return ids;
    }

    /* ===================================================================
       Status and scheduling
       =================================================================== */

    private static async Task<IResult> ChangeStatusAsync(
        long id, ChangeStatusRequest request, SqlConnectionFactory connections, CurrentUserService users,
        CancellationToken cancellationToken)
    {
        var actor = await users.GetRequiredAsync(cancellationToken);
        if (id <= 0) return Results.NotFound();
        InputValidation.RequiredText(request.Status, 50, "Status");
        InputValidation.OptionalText(request.Reason, 4_000, "Reason");
        var expected = SqlExtensions.ParseRowVersion(request.RowVersion);

        await using var connection = await connections.OpenAsync(cancellationToken);
        var permissions = await SiteVisitCore.LoadPermissionsAsync(connection, actor.Role, cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            var visit = await LockVisitAsync(connection, transaction, id, expected, cancellationToken);
            if (visit is null) return Results.NotFound();
            var target = request.Status.Trim();
            SiteVisitCore.RequireTransition(SiteVisitCore.VisitTransitions, visit.Status, target, permissions, request.Reason);

            // Guards a transition table cannot express, because they depend on
            // rows in other tables.
            if (target == "Pending Engineer Confirmation")
            {
                var assigned = await ActiveEngineerIdsAsync(connection, transaction, id, cancellationToken);
                if (assigned.Count == 0)
                    throw new ApiException(StatusCodes.Status409Conflict, "no_engineer_assigned",
                        "Assign at least one engineer before asking for confirmation.");
                if (visit.ScheduledStart is null)
                    throw new ApiException(StatusCodes.Status409Conflict, "not_scheduled",
                        "Set a date and time before asking for confirmation.");
            }
            if (target == "Pending Customer Confirmation" && await CountAcceptedAsync(connection, transaction, id, cancellationToken) == 0)
                throw new ApiException(StatusCodes.Status409Conflict, "engineer_not_accepted",
                    "No engineer has accepted this visit yet.");
            if (target == "Confirmed" && !await HasCustomerConfirmationAsync(connection, transaction, id, cancellationToken))
                throw new ApiException(StatusCodes.Status409Conflict, "customer_not_confirmed",
                    "Record the customer confirmation before marking the visit confirmed.");

            var confirmedClause = target == "Confirmed" ? ", customer_confirmed_at = ISNULL(customer_confirmed_at, SYSUTCDATETIME())" : "";
            var engineerClause = target == "Pending Customer Confirmation" ? ", engineer_confirmed_at = ISNULL(engineer_confirmed_at, SYSUTCDATETIME())" : "";
            await using (var command = new SqlCommand($"""
                UPDATE dbo.site_visits
                   SET status = @status, updated_by = @actor, updated_at = SYSUTCDATETIME(){confirmedClause}{engineerClause}
                 WHERE id = @id;
                """, connection, transaction))
            {
                command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
                command.Parameters.AddParameter("@status", SqlDbType.NVarChar, target, 50);
                command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                await command.ExecuteNonQueryAsync(cancellationToken);
            }

            await SiteVisitCore.RecordStatusAsync(connection, transaction, SiteVisitCore.EntityVisit, id, visit.Number,
                visit.Status, target, request.Reason, actor.Id, cancellationToken);
            await SiteVisitCore.AuditAsync(connection, transaction, actor.Id, SiteVisitCore.EntityVisit, id, visit.Number,
                $"Visit status {visit.Status} to {target}", new { status = visit.Status }, new { status = target },
                request.Reason, cancellationToken);

            var engineers = await ActiveEngineerIdsAsync(connection, transaction, id, cancellationToken);
            await SiteVisitCore.NotifyAsync(connection, transaction,
                engineers.Append(visit.SalesOwnerId).Where(userId => userId != actor.Id),
                $"visit.{target.ToLowerInvariant().Replace(' ', '_')}",
                $"{visit.Number} is now {target}",
                string.IsNullOrWhiteSpace(request.Reason) ? $"The site visit moved from {visit.Status} to {target}." : request.Reason!,
                SiteVisitCore.EntityVisit, id, $"visit.status:{SiteVisitCore.EntityVisit}:{id}:{visit.Status}:{target}", cancellationToken);

            var rowVersion = await ReadVisitRowVersionAsync(connection, transaction, id, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new { id, number = visit.Number, status = target, rowVersion });
        }
        catch
        {
            if (transaction.Connection is not null) await transaction.RollbackAsync(CancellationToken.None);
            throw;
        }
    }

    private static async Task<int> CountAcceptedAsync(
        SqlConnection connection, SqlTransaction transaction, long visitId, CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand(
            "SELECT COUNT(*) FROM dbo.site_visit_assignments WHERE visit_id = @visit_id AND is_active = 1 AND status = N'Accepted';",
            connection, transaction);
        command.Parameters.AddParameter("@visit_id", SqlDbType.BigInt, visitId);
        return (int)(await command.ExecuteScalarAsync(cancellationToken))!;
    }

    private static async Task<bool> HasCustomerConfirmationAsync(
        SqlConnection connection, SqlTransaction transaction, long visitId, CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            SELECT CASE WHEN EXISTS (
                SELECT 1 FROM dbo.site_visit_confirmations
                WHERE visit_id = @visit_id AND party = N'Customer' AND outcome = N'Confirmed')
            THEN 1 ELSE 0 END;
            """, connection, transaction);
        command.Parameters.AddParameter("@visit_id", SqlDbType.BigInt, visitId);
        return (int)(await command.ExecuteScalarAsync(cancellationToken))! == 1;
    }

    private static async Task<IResult> RescheduleAsync(
        long id, RescheduleVisitRequest request, SqlConnectionFactory connections, CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync(SiteVisitCore.PermVisitSchedule, cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        if (id <= 0) return Results.NotFound();
        if (request.ScheduledEnd <= request.ScheduledStart) throw Invalid("The visit must end after it starts.");
        InputValidation.RequiredText(request.Reason, 1_000, "Reason");
        InputValidation.OptionalText(request.MeetingPoint, 500, "Meeting point");
        var travelBefore = SiteVisitCore.Clamp(request.TravelMinutesBefore, 0, 1_440);
        var travelAfter = SiteVisitCore.Clamp(request.TravelMinutesAfter, 0, 1_440);
        var expected = SqlExtensions.ParseRowVersion(request.RowVersion);

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            var visit = await LockVisitAsync(connection, transaction, id, expected, cancellationToken);
            if (visit is null) return Results.NotFound();
            if (visit.Status is "Cancelled" or "Closed" or "Completed" or "In Progress")
                throw new ApiException(StatusCodes.Status409Conflict, "not_reschedulable",
                    $"A visit in '{visit.Status}' cannot be rescheduled.");

            // Every already-assigned engineer is re-checked against the new
            // slot. Moving a visit double-books just as easily as making one.
            var engineers = await ActiveEngineerIdsAsync(connection, transaction, id, cancellationToken);
            foreach (var engineerId in engineers)
            {
                var (conflicts, detail) = await CheckAvailabilityAsync(connection, transaction, engineerId,
                    request.ScheduledStart, request.ScheduledEnd, travelBefore, travelAfter, id, true, cancellationToken);
                if (conflicts > 0)
                    throw new ApiException(StatusCodes.Status409Conflict, "schedule_conflict",
                        "An assigned engineer is already committed at the new time.", new { engineerId, detail });
            }

            await using (var command = new SqlCommand("""
                UPDATE dbo.site_visits
                   SET scheduled_start = @start, scheduled_end = @end, time_zone_id = @time_zone,
                       travel_minutes_before = @travel_before, travel_minutes_after = @travel_after,
                       meeting_point = @meeting_point,
                       engineer_confirmed_at = NULL, customer_confirmed_at = NULL,
                       updated_by = @actor, updated_at = SYSUTCDATETIME()
                 WHERE id = @id;
                """, connection, transaction))
            {
                command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
                command.Parameters.AddParameter("@start", SqlDbType.DateTimeOffset, request.ScheduledStart);
                command.Parameters.AddParameter("@end", SqlDbType.DateTimeOffset, request.ScheduledEnd);
                command.Parameters.AddParameter("@time_zone", SqlDbType.NVarChar,
                    string.IsNullOrWhiteSpace(request.TimeZoneId) ? "SE Asia Standard Time" : request.TimeZoneId.Trim(), 100);
                command.Parameters.AddParameter("@travel_before", SqlDbType.Int, travelBefore);
                command.Parameters.AddParameter("@travel_after", SqlDbType.Int, travelAfter);
                command.Parameters.AddParameter("@meeting_point", SqlDbType.NVarChar, SiteVisitCore.Trim(request.MeetingPoint, 500, "Meeting point"), 500);
                command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                await command.ExecuteNonQueryAsync(cancellationToken);
            }

            // A moved visit has to be confirmed again. Both parties agreed to a
            // time, not to a visit.
            await using (var command = new SqlCommand("""
                UPDATE dbo.site_visit_assignments
                   SET status = N'Proposed', responded_at = NULL
                 WHERE visit_id = @visit_id AND is_active = 1 AND status = N'Accepted';
                """, connection, transaction))
            {
                command.Parameters.AddParameter("@visit_id", SqlDbType.BigInt, id);
                await command.ExecuteNonQueryAsync(cancellationToken);
            }

            await RecordScheduleHistoryAsync(connection, transaction, id, visit.ScheduledStart, visit.ScheduledEnd,
                request.ScheduledStart, request.ScheduledEnd, request.Reason, actor.Id, cancellationToken);
            await SiteVisitCore.AuditAsync(connection, transaction, actor.Id, SiteVisitCore.EntityVisit, id, visit.Number,
                "Visit rescheduled",
                new { start = visit.ScheduledStart, end = visit.ScheduledEnd },
                new { start = request.ScheduledStart, end = request.ScheduledEnd },
                request.Reason, cancellationToken);
            await SiteVisitCore.NotifyAsync(connection, transaction,
                engineers.Append(visit.SalesOwnerId).Where(userId => userId != actor.Id),
                "visit.rescheduled", $"{visit.Number} was rescheduled",
                $"New time: {SiteVisitCore.FormatRange(request.ScheduledStart, request.ScheduledEnd)}. Reason: {request.Reason}",
                SiteVisitCore.EntityVisit, id,
                $"visit.rescheduled:{SiteVisitCore.EntityVisit}:{id}:{request.ScheduledStart:yyyyMMddHHmm}", cancellationToken);

            var rowVersion = await ReadVisitRowVersionAsync(connection, transaction, id, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new { id, number = visit.Number, rowVersion });
        }
        catch
        {
            if (transaction.Connection is not null) await transaction.RollbackAsync(CancellationToken.None);
            throw;
        }
    }

    /// <summary>
    /// Runs dbo.assert_engineer_available. With allowConflict the procedure
    /// reports rather than raises, which is how the candidate list can show a
    /// conflict count without refusing to render.
    /// </summary>
    private static async Task<(int Conflicts, string Detail)> CheckAvailabilityAsync(
        SqlConnection connection, SqlTransaction? transaction, long engineerId,
        DateTimeOffset start, DateTimeOffset end, int travelBefore, int travelAfter,
        long? excludeVisitId, bool allowConflict, CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("dbo.assert_engineer_available", connection, transaction)
        {
            CommandType = CommandType.StoredProcedure
        };
        command.Parameters.AddParameter("@engineer_id", SqlDbType.BigInt, engineerId);
        command.Parameters.AddParameter("@starts_at", SqlDbType.DateTimeOffset, start);
        command.Parameters.AddParameter("@ends_at", SqlDbType.DateTimeOffset, end);
        command.Parameters.AddParameter("@travel_minutes_before", SqlDbType.Int, travelBefore);
        command.Parameters.AddParameter("@travel_minutes_after", SqlDbType.Int, travelAfter);
        command.Parameters.AddParameter("@exclude_visit_id", SqlDbType.BigInt, excludeVisitId);
        command.Parameters.AddParameter("@allow_conflict", SqlDbType.Bit, allowConflict);
        var count = command.Parameters.Add("@conflict_count", SqlDbType.Int);
        count.Direction = ParameterDirection.Output;
        var detail = command.Parameters.Add("@conflict_detail", SqlDbType.NVarChar, 1_000);
        detail.Direction = ParameterDirection.Output;
        await command.ExecuteNonQueryAsync(cancellationToken);
        return (count.Value as int? ?? 0, detail.Value as string ?? "");
    }

    /* ===================================================================
       Engineer assignment
       =================================================================== */

    private static async Task<IResult> CandidatesAsync(
        long id, SqlConnectionFactory connections, CurrentUserService users, CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync(SiteVisitCore.PermVisitRead, cancellationToken);
        if (id <= 0) return Results.NotFound();
        await using var connection = await connections.OpenAsync(cancellationToken);

        long intakeId;
        DateTimeOffset? start, end;
        int travelBefore, travelAfter, siteTravelMinutes;
        await using (var command = new SqlCommand("""
            SELECT v.intake_id, v.scheduled_start, v.scheduled_end, v.travel_minutes_before, v.travel_minutes_after,
                   ISNULL(s.travel_minutes, 60)
            FROM dbo.site_visits v
            INNER JOIN dbo.sales_intakes i ON i.id = v.intake_id
            LEFT JOIN dbo.customer_sites s ON s.id = i.site_id
            WHERE v.id = @id AND v.deleted_at IS NULL;
            """, connection))
        {
            command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
            await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
            if (!await reader.ReadAsync(cancellationToken)) return Results.NotFound();
            intakeId = reader.GetInt64(0);
            start = reader.IsDBNull(1) ? null : reader.GetFieldValue<DateTimeOffset>(1);
            end = reader.IsDBNull(2) ? null : reader.GetFieldValue<DateTimeOffset>(2);
            travelBefore = reader.GetInt32(3);
            travelAfter = reader.GetInt32(4);
            siteTravelMinutes = reader.GetInt32(5);
        }

        var required = await LoadRequiredSkillCodesAsync(connection, null, intakeId, cancellationToken);

        // Only real, active engineering accounts are offered. An inactive user
        // cannot be assigned, so there is no point showing one.
        var rows = new List<(long Id, string Name, string Email, string Department, string Role, string[] Skills, int Open, int Minutes, bool Assigned)>();
        await using (var command = new SqlCommand("""
            SELECT u.id, u.name, u.email, u.department, r.code,
                   ISNULL(STUFF((SELECT N',' + k.code FROM dbo.engineer_skills es
                        INNER JOIN dbo.visit_skills k ON k.id = es.skill_id
                        WHERE es.user_id = u.id ORDER BY k.code
                        FOR XML PATH(N''), TYPE).value(N'.', N'nvarchar(max)'), 1, 1, N''), N''),
                   (SELECT COUNT_BIG(*) FROM dbo.site_visit_assignments a
                        INNER JOIN dbo.site_visits av ON av.id = a.visit_id
                        WHERE a.engineer_id = u.id AND a.is_active = 1 AND av.deleted_at IS NULL
                          AND av.status NOT IN (N'Cancelled', N'Closed', N'Completed', N'Customer No-show')),
                   (SELECT ISNULL(SUM(DATEDIFF(MINUTE, av.scheduled_start, av.scheduled_end)), 0)
                        FROM dbo.site_visit_assignments a
                        INNER JOIN dbo.site_visits av ON av.id = a.visit_id
                        WHERE a.engineer_id = u.id AND a.is_active = 1 AND av.deleted_at IS NULL
                          AND av.scheduled_start IS NOT NULL
                          AND av.status NOT IN (N'Cancelled', N'Closed', N'Customer No-show')
                          AND av.scheduled_start >= DATEADD(DAY, -7, SYSUTCDATETIME())
                          AND av.scheduled_start < DATEADD(DAY, 21, SYSUTCDATETIME())),
                   CASE WHEN EXISTS (SELECT 1 FROM dbo.site_visit_assignments a
                        WHERE a.visit_id = @visit_id AND a.engineer_id = u.id AND a.is_active = 1) THEN 1 ELSE 0 END
            FROM dbo.users u
            INNER JOIN dbo.roles r ON r.id = u.role_id
            WHERE u.is_active = 1 AND u.deleted_at IS NULL
              AND r.code IN (N'Engineer', N'Engineering Manager', N'Engineering Coordinator', N'Project Manager', N'Admin')
            ORDER BY u.name;
            """, connection))
        {
            command.Parameters.AddParameter("@visit_id", SqlDbType.BigInt, id);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
                rows.Add((reader.GetInt64(0), reader.GetString(1), reader.GetString(2), reader.GetString(3), reader.GetString(4),
                    reader.GetString(5).Split(',', StringSplitOptions.RemoveEmptyEntries),
                    (int)reader.GetInt64(6), (int)reader.GetInt32(7), reader.GetInt32(8) == 1));
        }

        var candidates = new List<EngineerCandidateRecord>(rows.Count);
        foreach (var row in rows)
        {
            var (percent, missing) = SiteVisitCore.SkillMatch(required, row.Skills);
            var conflicts = 0;
            var detail = "";
            if (start is { } from && end is { } to)
                (conflicts, detail) = await CheckAvailabilityAsync(connection, null, row.Id, from, to,
                    travelBefore, travelAfter, id, true, cancellationToken);
            candidates.Add(new EngineerCandidateRecord(row.Id, row.Name, row.Email, row.Department, row.Role,
                row.Skills, percent, missing, row.Open, row.Minutes, conflicts, detail, siteTravelMinutes, true, row.Assigned));
        }

        return Results.Ok(candidates
            .OrderByDescending(candidate => candidate.SkillMatchPercent)
            .ThenBy(candidate => candidate.ConflictCount)
            .ThenBy(candidate => candidate.OpenAssignments)
            .ThenBy(candidate => candidate.Name, StringComparer.Ordinal)
            .ToArray());
    }

    private static async Task<IResult> AssignAsync(
        long id, AssignEngineerRequest request, SqlConnectionFactory connections, CurrentUserService users,
        CancellationToken cancellationToken)
    {
        // Sales can raise a request and can ask for a change, but final
        // assignment needs visit.schedule — which the Sales roles do not hold.
        await users.DemandPermissionAsync(SiteVisitCore.PermVisitSchedule, cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        if (id <= 0 || request.EngineerId <= 0) return Results.NotFound();
        InputValidation.OneOf(request.AssignmentRole, "Assignment role", "Lead Engineer", "Supporting Engineer");
        if (request.ConflictOverride)
        {
            InputValidation.RequiredText(request.OverrideReason, 1_000, "Override reason");
            if (request.OverrideReason!.Trim().Length < 10)
                throw Invalid("An override reason must explain the decision in at least ten characters.");
        }
        var expected = SqlExtensions.ParseRowVersion(request.RowVersion);

        await using var connection = await connections.OpenAsync(cancellationToken);
        var permissions = await SiteVisitCore.LoadPermissionsAsync(connection, actor.Role, cancellationToken);
        if (request.ConflictOverride && !permissions.Contains(SiteVisitCore.PermVisitOverride))
            throw new ApiException(StatusCodes.Status403Forbidden, "permission_denied",
                "Only an engineering manager may override a schedule conflict.");

        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            var visit = await LockVisitAsync(connection, transaction, id, expected, cancellationToken);
            if (visit is null) return Results.NotFound();
            if (visit.Status is "Cancelled" or "Closed" or "Completed")
                throw new ApiException(StatusCodes.Status409Conflict, "visit_closed",
                    $"A visit in '{visit.Status}' cannot be assigned.");

            string engineerName;
            await using (var command = new SqlCommand("""
                SELECT u.name
                FROM dbo.users u
                INNER JOIN dbo.roles r ON r.id = u.role_id
                WHERE u.id = @engineer_id AND u.is_active = 1 AND u.deleted_at IS NULL
                  AND r.code IN (N'Engineer', N'Engineering Manager', N'Engineering Coordinator', N'Project Manager', N'Admin');
                """, connection, transaction))
            {
                command.Parameters.AddParameter("@engineer_id", SqlDbType.BigInt, request.EngineerId);
                engineerName = await command.ExecuteScalarAsync(cancellationToken) as string ?? "";
            }
            if (engineerName.Length == 0)
                throw new ApiException(StatusCodes.Status422UnprocessableEntity, "invalid_reference",
                    "The engineer must be an active engineering user.");

            // The conflict check runs whether or not an override was requested.
            // Overriding records the conflict; it does not hide it.
            //
            // allowConflict is always true here so the procedure reports rather
            // than raises. Its THROW runs under SET XACT_ABORT ON, which dooms
            // the caller's transaction — the refusal would arrive as a 500 with
            // no detail instead of the 409 below, and the rollback would be
            // forced rather than chosen.
            var conflicts = 0;
            var conflictDetail = "";
            if (visit.ScheduledStart is { } start && visit.ScheduledEnd is { } end)
                (conflicts, conflictDetail) = await CheckAvailabilityAsync(connection, transaction, request.EngineerId,
                    start, end, visit.TravelBefore, visit.TravelAfter, id, allowConflict: true, cancellationToken);
            if (conflicts > 0 && !request.ConflictOverride)
                throw new ApiException(StatusCodes.Status409Conflict, "schedule_conflict",
                    "This engineer is already committed during the visit window.",
                    new { detail = conflictDetail, overridable = true });

            var required = await LoadRequiredSkillCodesAsync(connection, transaction, visit.IntakeId, cancellationToken);
            var held = await LoadEngineerSkillCodesAsync(connection, transaction, request.EngineerId, cancellationToken);
            var (matchPercent, missingSkills) = SiteVisitCore.SkillMatch(required, held);

            // Replacing the lead means the previous lead is superseded, not
            // deleted: the reassignment history has to survive.
            await using (var command = new SqlCommand("""
                UPDATE dbo.site_visit_assignments
                   SET is_active = 0, status = CASE WHEN status = N'Proposed' THEN N'Withdrawn' ELSE status END
                 WHERE visit_id = @visit_id AND is_active = 1
                   AND (engineer_id = @engineer_id OR (@role = N'Lead Engineer' AND assignment_role = N'Lead Engineer'));
                """, connection, transaction))
            {
                command.Parameters.AddParameter("@visit_id", SqlDbType.BigInt, id);
                command.Parameters.AddParameter("@engineer_id", SqlDbType.BigInt, request.EngineerId);
                command.Parameters.AddParameter("@role", SqlDbType.NVarChar, request.AssignmentRole.Trim(), 30);
                await command.ExecuteNonQueryAsync(cancellationToken);
            }

            long assignmentId;
            await using (var command = new SqlCommand("""
                INSERT INTO dbo.site_visit_assignments
                    (visit_id, engineer_id, assignment_role, status, skill_match_percent,
                     conflict_override, override_reason, override_by, override_at, assigned_by)
                OUTPUT inserted.id
                VALUES (@visit_id, @engineer_id, @role, N'Proposed', @match,
                     @override, @override_reason, @override_by, @override_at, @actor);
                """, connection, transaction))
            {
                command.Parameters.AddParameter("@visit_id", SqlDbType.BigInt, id);
                command.Parameters.AddParameter("@engineer_id", SqlDbType.BigInt, request.EngineerId);
                command.Parameters.AddParameter("@role", SqlDbType.NVarChar, request.AssignmentRole.Trim(), 30);
                command.Parameters.AddParameter("@match", SqlDbType.TinyInt, (byte)matchPercent);
                var overriding = request.ConflictOverride && conflicts > 0;
                command.Parameters.AddParameter("@override", SqlDbType.Bit, overriding);
                command.Parameters.AddParameter("@override_reason", SqlDbType.NVarChar,
                    overriding ? SiteVisitCore.Trim(request.OverrideReason, 1_000, "Override reason") : null, 1_000);
                command.Parameters.AddParameter("@override_by", SqlDbType.BigInt, overriding ? actor.Id : null);
                command.Parameters.AddParameter("@override_at", SqlDbType.DateTimeOffset, overriding ? DateTimeOffset.UtcNow : null);
                command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                assignmentId = (long)(await command.ExecuteScalarAsync(cancellationToken))!;
            }

            await SiteVisitCore.RecordStatusAsync(connection, transaction, "Assignment", assignmentId, visit.Number,
                null, "Proposed", $"{engineerName} assigned as {request.AssignmentRole}", actor.Id, cancellationToken);
            await SiteVisitCore.AuditAsync(connection, transaction, actor.Id, SiteVisitCore.EntityVisit, id, visit.Number,
                "Engineer assigned", null,
                new { assignmentId, request.EngineerId, engineerName, request.AssignmentRole, matchPercent, missingSkills, conflicts },
                conflicts > 0 ? request.OverrideReason : null, cancellationToken);
            await SiteVisitCore.NotifyAsync(connection, transaction, [request.EngineerId],
                "visit.assigned", $"You are assigned to {visit.Number}",
                $"{request.AssignmentRole} · {SiteVisitCore.FormatRange(visit.ScheduledStart, visit.ScheduledEnd)}",
                SiteVisitCore.EntityVisit, id, $"visit.assigned:{SiteVisitCore.EntityVisit}:{id}:{assignmentId}", cancellationToken);

            var rowVersion = await ReadVisitRowVersionAsync(connection, transaction, id, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new { id, assignmentId, matchPercent, missingSkills, conflicts, conflictDetail, rowVersion });
        }
        catch
        {
            if (transaction.Connection is not null) await transaction.RollbackAsync(CancellationToken.None);
            throw;
        }
    }

    private static async Task<string[]> LoadEngineerSkillCodesAsync(
        SqlConnection connection, SqlTransaction? transaction, long engineerId, CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            SELECT k.code FROM dbo.engineer_skills es
            INNER JOIN dbo.visit_skills k ON k.id = es.skill_id
            WHERE es.user_id = @engineer_id;
            """, connection, transaction);
        command.Parameters.AddParameter("@engineer_id", SqlDbType.BigInt, engineerId);
        var codes = new List<string>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken)) codes.Add(reader.GetString(0));
        return [.. codes];
    }

    private static async Task<IResult> RespondAsync(
        long id, long assignmentId, RespondToAssignmentRequest request, SqlConnectionFactory connections,
        CurrentUserService users, CancellationToken cancellationToken)
    {
        var actor = await users.GetRequiredAsync(cancellationToken);
        if (id <= 0 || assignmentId <= 0) return Results.NotFound();
        InputValidation.OneOf(request.Response, "Response", "Accepted", "Declined", "Information Requested", "New Time Proposed");
        InputValidation.OptionalText(request.Note, 2_000, "Note");
        if (request.Response is "Declined" or "Information Requested" && string.IsNullOrWhiteSpace(request.Note))
            throw Invalid("Say why, so the coordinator can act on it.");
        if (request.Response == "New Time Proposed" && (request.ProposedStart is null || request.ProposedEnd is null))
            throw Invalid("Proposing a new time needs both a start and an end.");
        if (request.ProposedStart is { } ps && request.ProposedEnd is { } pe && pe <= ps)
            throw Invalid("The proposed time must end after it starts.");
        var expected = SqlExtensions.ParseRowVersion(request.RowVersion);

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            long engineerId;
            string assignmentRole;
            string visitNumber;
            await using (var command = new SqlCommand("""
                SELECT a.engineer_id, a.assignment_role, v.visit_no, a.row_version
                FROM dbo.site_visit_assignments a WITH (UPDLOCK, HOLDLOCK)
                INNER JOIN dbo.site_visits v ON v.id = a.visit_id
                WHERE a.id = @assignment_id AND a.visit_id = @visit_id AND a.is_active = 1 AND v.deleted_at IS NULL;
                """, connection, transaction))
            {
                command.Parameters.AddParameter("@assignment_id", SqlDbType.BigInt, assignmentId);
                command.Parameters.AddParameter("@visit_id", SqlDbType.BigInt, id);
                await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
                if (!await reader.ReadAsync(cancellationToken)) return Results.NotFound();
                engineerId = reader.GetInt64(0);
                assignmentRole = reader.GetString(1);
                visitNumber = reader.GetString(2);
                SiteVisitCore.RequireSameVersion(expected, (byte[])reader.GetValue(3));
            }

            // An engineer answers for themselves. A coordinator recording an
            // answer on their behalf needs visit.schedule.
            if (engineerId != actor.Id)
            {
                var permissions = await SiteVisitCore.LoadPermissionsAsync(connection, actor.Role, cancellationToken);
                if (!permissions.Contains(SiteVisitCore.PermVisitSchedule))
                    throw new ApiException(StatusCodes.Status403Forbidden, "not_your_assignment",
                        "Only the assigned engineer, or a coordinator, may answer this assignment.");
            }

            await using (var command = new SqlCommand("""
                UPDATE dbo.site_visit_assignments
                   SET status = @status, response_note = @note, responded_at = SYSUTCDATETIME(),
                       proposed_start = @proposed_start, proposed_end = @proposed_end
                 WHERE id = @assignment_id;
                """, connection, transaction))
            {
                command.Parameters.AddParameter("@assignment_id", SqlDbType.BigInt, assignmentId);
                command.Parameters.AddParameter("@status", SqlDbType.NVarChar, request.Response.Trim(), 30);
                command.Parameters.AddParameter("@note", SqlDbType.NVarChar, SiteVisitCore.TrimOrNull(request.Note, 2_000, "Note"), 2_000);
                command.Parameters.AddParameter("@proposed_start", SqlDbType.DateTimeOffset, request.ProposedStart);
                command.Parameters.AddParameter("@proposed_end", SqlDbType.DateTimeOffset, request.ProposedEnd);
                await command.ExecuteNonQueryAsync(cancellationToken);
            }

            // A decline reopens the slot: the assignment stops being active so
            // the coordinator's candidate list offers the engineer again.
            if (request.Response == "Declined")
            {
                await using var command = new SqlCommand(
                    "UPDATE dbo.site_visit_assignments SET is_active = 0 WHERE id = @assignment_id;", connection, transaction);
                command.Parameters.AddParameter("@assignment_id", SqlDbType.BigInt, assignmentId);
                await command.ExecuteNonQueryAsync(cancellationToken);
            }

            await SiteVisitCore.RecordStatusAsync(connection, transaction, "Assignment", assignmentId, visitNumber,
                "Proposed", request.Response, request.Note, actor.Id, cancellationToken);
            await SiteVisitCore.AuditAsync(connection, transaction, actor.Id, SiteVisitCore.EntityVisit, id, visitNumber,
                $"Assignment {request.Response.ToLowerInvariant()}", null,
                new { assignmentId, engineerId, assignmentRole, request.Response, request.ProposedStart, request.ProposedEnd },
                request.Note, cancellationToken);

            var coordinators = await SiteVisitCore.UsersWithPermissionAsync(connection, transaction, SiteVisitCore.PermVisitSchedule, cancellationToken);
            await SiteVisitCore.NotifyAsync(connection, transaction, coordinators.Where(userId => userId != actor.Id),
                $"visit.assignment_{request.Response.ToLowerInvariant().Replace(' ', '_')}",
                $"{visitNumber}: assignment {request.Response.ToLowerInvariant()}",
                string.IsNullOrWhiteSpace(request.Note) ? $"{actor.Name} responded to the assignment." : request.Note!,
                SiteVisitCore.EntityVisit, id,
                $"visit.assignment_response:{SiteVisitCore.EntityVisit}:{id}:{assignmentId}:{request.Response}", cancellationToken);

            var rowVersion = await ReadVisitRowVersionAsync(connection, transaction, id, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new { id, assignmentId, status = request.Response, rowVersion });
        }
        catch
        {
            if (transaction.Connection is not null) await transaction.RollbackAsync(CancellationToken.None);
            throw;
        }
    }

    private static async Task<IResult> WithdrawAssignmentAsync(
        long id, long assignmentId, SqlConnectionFactory connections, CurrentUserService users, CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync(SiteVisitCore.PermVisitSchedule, cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        if (id <= 0 || assignmentId <= 0) return Results.NotFound();

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken);
        try
        {
            string visitNumber;
            long engineerId;
            await using (var command = new SqlCommand("""
                SELECT v.visit_no, a.engineer_id
                FROM dbo.site_visit_assignments a
                INNER JOIN dbo.site_visits v ON v.id = a.visit_id
                WHERE a.id = @assignment_id AND a.visit_id = @visit_id AND a.is_active = 1 AND v.deleted_at IS NULL;
                """, connection, transaction))
            {
                command.Parameters.AddParameter("@assignment_id", SqlDbType.BigInt, assignmentId);
                command.Parameters.AddParameter("@visit_id", SqlDbType.BigInt, id);
                await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
                if (!await reader.ReadAsync(cancellationToken)) return Results.NotFound();
                visitNumber = reader.GetString(0);
                engineerId = reader.GetInt64(1);
            }

            await using (var command = new SqlCommand("""
                UPDATE dbo.site_visit_assignments SET is_active = 0, status = N'Withdrawn' WHERE id = @assignment_id;
                """, connection, transaction))
            {
                command.Parameters.AddParameter("@assignment_id", SqlDbType.BigInt, assignmentId);
                await command.ExecuteNonQueryAsync(cancellationToken);
            }
            await SiteVisitCore.RecordStatusAsync(connection, transaction, "Assignment", assignmentId, visitNumber,
                null, "Withdrawn", "Assignment withdrawn by the coordinator", actor.Id, cancellationToken);
            await SiteVisitCore.AuditAsync(connection, transaction, actor.Id, SiteVisitCore.EntityVisit, id, visitNumber,
                "Assignment withdrawn", new { assignmentId, engineerId }, null, null, cancellationToken);
            await SiteVisitCore.NotifyAsync(connection, transaction, [engineerId],
                "visit.assignment_withdrawn", $"{visitNumber}: your assignment was withdrawn",
                "The coordinator removed you from this site visit.", SiteVisitCore.EntityVisit, id,
                $"visit.assignment_withdrawn:{SiteVisitCore.EntityVisit}:{id}:{assignmentId}", cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new { id, assignmentId });
        }
        catch
        {
            if (transaction.Connection is not null) await transaction.RollbackAsync(CancellationToken.None);
            throw;
        }
    }

    /* ===================================================================
       Confirmation
       =================================================================== */

    private static async Task<IResult> RecordConfirmationAsync(
        long id, RecordConfirmationRequest request, SqlConnectionFactory connections, CurrentUserService users,
        BusinessClock clock, CancellationToken cancellationToken)
    {
        var actor = await users.GetRequiredAsync(cancellationToken);
        if (id <= 0) return Results.NotFound();
        InputValidation.OneOf(request.Party, "Party", "Engineer", "Customer");
        InputValidation.OneOf(request.Outcome, "Outcome", "Confirmed", "Declined", "Rescheduled", "Information Requested", "No Response");
        InputValidation.OneOf(request.Channel, "Channel", "Email", "Phone", "LINE", "Meeting", "Customer Portal", "Other");
        InputValidation.OptionalText(request.Comment, 20_000, "Comment");
        if (request.Party == "Customer") InputValidation.RequiredText(request.ConfirmedByName, 200, "Confirmed by");
        var expected = SqlExtensions.ParseRowVersion(request.RowVersion);

        // Recording a customer's answer is a sales or coordinator action; both
        // hold one of these.
        await using var connection = await connections.OpenAsync(cancellationToken);
        var permissions = await SiteVisitCore.LoadPermissionsAsync(connection, actor.Role, cancellationToken);
        if (!permissions.Contains(SiteVisitCore.PermVisitSchedule) && !permissions.Contains(SiteVisitCore.PermIntakeWrite))
            throw new ApiException(StatusCodes.Status403Forbidden, "permission_denied",
                "Recording a confirmation requires 'visit.schedule' or 'intake.write'.");

        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            var visit = await LockVisitAsync(connection, transaction, id, expected, cancellationToken);
            if (visit is null) return Results.NotFound();

            var confirmedAt = request.ConfirmedAt ?? clock.UtcNow;
            long confirmationId;
            await using (var command = new SqlCommand("""
                INSERT INTO dbo.site_visit_confirmations
                    (visit_id, party, outcome, channel, confirmed_by_name, confirmed_by_user_id,
                     confirmed_at, comment, evidence_attachment_id, recorded_by)
                OUTPUT inserted.id
                VALUES (@visit_id, @party, @outcome, @channel, @name, @user_id, @confirmed_at, @comment, @evidence, @actor);
                """, connection, transaction))
            {
                command.Parameters.AddParameter("@visit_id", SqlDbType.BigInt, id);
                command.Parameters.AddParameter("@party", SqlDbType.NVarChar, request.Party.Trim(), 20);
                command.Parameters.AddParameter("@outcome", SqlDbType.NVarChar, request.Outcome.Trim(), 30);
                command.Parameters.AddParameter("@channel", SqlDbType.NVarChar, request.Channel.Trim(), 30);
                command.Parameters.AddParameter("@name", SqlDbType.NVarChar,
                    SiteVisitCore.Trim(request.ConfirmedByName ?? (request.Party == "Engineer" ? actor.Name : ""), 200, "Confirmed by"), 200);
                command.Parameters.AddParameter("@user_id", SqlDbType.BigInt, request.Party == "Engineer" ? actor.Id : null);
                command.Parameters.AddParameter("@confirmed_at", SqlDbType.DateTimeOffset, confirmedAt);
                command.Parameters.AddParameter("@comment", SqlDbType.NVarChar, SiteVisitCore.TrimOrNull(request.Comment, 20_000, "Comment"), -1);
                command.Parameters.AddParameter("@evidence", SqlDbType.BigInt, request.EvidenceAttachmentId is > 0 ? request.EvidenceAttachmentId : null);
                command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                confirmationId = (long)(await command.ExecuteScalarAsync(cancellationToken))!;
            }

            if (request.Outcome == "Confirmed")
            {
                var column = request.Party == "Customer" ? "customer_confirmed_at" : "engineer_confirmed_at";
                await using var command = new SqlCommand(
                    $"UPDATE dbo.site_visits SET {column} = @at, updated_by = @actor, updated_at = SYSUTCDATETIME() WHERE id = @id;",
                    connection, transaction);
                command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
                command.Parameters.AddParameter("@at", SqlDbType.DateTimeOffset, confirmedAt);
                command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                await command.ExecuteNonQueryAsync(cancellationToken);
            }

            await SiteVisitCore.AuditAsync(connection, transaction, actor.Id, SiteVisitCore.EntityVisit, id, visit.Number,
                $"{request.Party} confirmation recorded", null,
                new { confirmationId, request.Party, request.Outcome, request.Channel, request.ConfirmedByName, confirmedAt },
                request.Comment, cancellationToken);

            if (request.Party == "Customer" && request.Outcome == "Confirmed")
            {
                var engineers = await ActiveEngineerIdsAsync(connection, transaction, id, cancellationToken);
                await SiteVisitCore.NotifyAsync(connection, transaction, engineers.Append(visit.SalesOwnerId).Where(userId => userId != actor.Id),
                    "visit.customer_confirmed", $"{visit.Number}: the customer confirmed",
                    $"Confirmed by {request.ConfirmedByName} via {request.Channel}.", SiteVisitCore.EntityVisit, id,
                    $"visit.customer_confirmed:{SiteVisitCore.EntityVisit}:{id}:{confirmationId}", cancellationToken);
            }

            var rowVersion = await ReadVisitRowVersionAsync(connection, transaction, id, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new { id, confirmationId, rowVersion });
        }
        catch
        {
            if (transaction.Connection is not null) await transaction.RollbackAsync(CancellationToken.None);
            throw;
        }
    }

    /* ===================================================================
       Execution — check in, checklist, findings, check out
       =================================================================== */

    /// <summary>
    /// Holding visit.execute is not enough: the caller must be an engineer who
    /// accepted this specific visit. A coordinator with the permission still
    /// cannot check in on somebody else's job.
    /// </summary>
    private static async Task DemandAssignedEngineerAsync(
        SqlConnection connection, SqlTransaction transaction, long visitId, long actorId, CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            SELECT CASE WHEN EXISTS (
                SELECT 1 FROM dbo.site_visit_assignments
                WHERE visit_id = @visit_id AND engineer_id = @actor AND is_active = 1 AND status = N'Accepted')
            THEN 1 ELSE 0 END;
            """, connection, transaction);
        command.Parameters.AddParameter("@visit_id", SqlDbType.BigInt, visitId);
        command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actorId);
        if ((int)(await command.ExecuteScalarAsync(cancellationToken))! != 1)
            throw new ApiException(StatusCodes.Status403Forbidden, "not_assigned",
                "Only an engineer who accepted this visit can record work on it.");
    }

    private static async Task<IResult> CheckInAsync(
        long id, CheckInRequest request, SqlConnectionFactory connections, CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync(SiteVisitCore.PermVisitExecute, cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        if (id <= 0) return Results.NotFound();
        InputValidation.OptionalText(request.ActualAttendees, 4_000, "Actual attendees");
        InputValidation.OptionalText(request.CustomerAttendees, 4_000, "Customer attendees");
        // Location is optional and only stored with explicit consent, which is
        // why the coordinates are dropped rather than rejected without it.
        var latitude = request.LocationConsentGiven ? request.Latitude : null;
        var longitude = request.LocationConsentGiven ? request.Longitude : null;
        if (latitude is < -90 or > 90 || longitude is < -180 or > 180) throw Invalid("The location is out of range.");
        var expected = SqlExtensions.ParseRowVersion(request.RowVersion);

        await using var connection = await connections.OpenAsync(cancellationToken);
        var permissions = await SiteVisitCore.LoadPermissionsAsync(connection, actor.Role, cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            var visit = await LockVisitAsync(connection, transaction, id, expected, cancellationToken);
            if (visit is null) return Results.NotFound();
            await DemandAssignedEngineerAsync(connection, transaction, id, actor.Id, cancellationToken);
            SiteVisitCore.RequireTransition(SiteVisitCore.VisitTransitions, visit.Status, "In Progress", permissions, null);

            await using (var command = new SqlCommand("""
                UPDATE dbo.site_visits
                   SET status = N'In Progress', checked_in_at = SYSUTCDATETIME(), checked_in_by = @actor,
                       check_in_latitude = @latitude, check_in_longitude = @longitude,
                       location_consent_given = @consent,
                       actual_attendees = @attendees, customer_attendees = @customer_attendees,
                       updated_by = @actor, updated_at = SYSUTCDATETIME()
                 WHERE id = @id;
                """, connection, transaction))
            {
                command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
                command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                command.Parameters.AddParameter("@latitude", SqlDbType.Decimal, latitude, 0, 9, 6);
                command.Parameters.AddParameter("@longitude", SqlDbType.Decimal, longitude, 0, 9, 6);
                command.Parameters.AddParameter("@consent", SqlDbType.Bit, request.LocationConsentGiven);
                command.Parameters.AddParameter("@attendees", SqlDbType.NVarChar, SiteVisitCore.TrimOrNull(request.ActualAttendees, 4_000, "Actual attendees"), -1);
                command.Parameters.AddParameter("@customer_attendees", SqlDbType.NVarChar, SiteVisitCore.TrimOrNull(request.CustomerAttendees, 4_000, "Customer attendees"), -1);
                await command.ExecuteNonQueryAsync(cancellationToken);
            }

            await SiteVisitCore.RecordStatusAsync(connection, transaction, SiteVisitCore.EntityVisit, id, visit.Number,
                visit.Status, "In Progress", "Engineer checked in", actor.Id, cancellationToken);
            await SiteVisitCore.AuditAsync(connection, transaction, actor.Id, SiteVisitCore.EntityVisit, id, visit.Number,
                "Checked in", null, new { request.LocationConsentGiven, hasLocation = latitude is not null }, null, cancellationToken);
            await SiteVisitCore.NotifyAsync(connection, transaction, [visit.SalesOwnerId],
                "visit.checked_in", $"{visit.Number}: the engineer checked in",
                $"{actor.Name} has arrived on site.", SiteVisitCore.EntityVisit, id,
                $"visit.checked_in:{SiteVisitCore.EntityVisit}:{id}", cancellationToken);

            var rowVersion = await ReadVisitRowVersionAsync(connection, transaction, id, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new { id, status = "In Progress", rowVersion });
        }
        catch
        {
            if (transaction.Connection is not null) await transaction.RollbackAsync(CancellationToken.None);
            throw;
        }
    }

    private static async Task<IResult> CheckOutAsync(
        long id, CheckOutRequest request, SqlConnectionFactory connections, CurrentUserService users,
        BusinessClock clock, CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync(SiteVisitCore.PermVisitExecute, cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        if (id <= 0) return Results.NotFound();
        InputValidation.OptionalText(request.ExecutionNote, 20_000, "Execution note");
        var expected = SqlExtensions.ParseRowVersion(request.RowVersion);

        await using var connection = await connections.OpenAsync(cancellationToken);
        var permissions = await SiteVisitCore.LoadPermissionsAsync(connection, actor.Role, cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            var visit = await LockVisitAsync(connection, transaction, id, expected, cancellationToken);
            if (visit is null) return Results.NotFound();
            await DemandAssignedEngineerAsync(connection, transaction, id, actor.Id, cancellationToken);
            SiteVisitCore.RequireTransition(SiteVisitCore.VisitTransitions, visit.Status, "Report Pending", permissions, null);

            // Required checklist answers are the point of the checklist. Missing
            // ones are named so the engineer can finish them on the spot rather
            // than discovering the gap back at the office.
            var missing = new List<string>();
            await using (var command = new SqlCommand("""
                SELECT ci.prompt
                FROM dbo.site_visits v
                INNER JOIN dbo.visit_checklist_items ci ON ci.template_id = v.checklist_template_id
                LEFT JOIN dbo.site_visit_checklist_responses r ON r.visit_id = v.id AND r.checklist_item_id = ci.id
                WHERE v.id = @id AND ci.is_active = 1 AND ci.is_required = 1
                  AND (r.id IS NULL OR (r.is_not_applicable = 0
                       AND ISNULL(r.response_value, N'') = N'' AND r.numeric_value IS NULL))
                ORDER BY ci.sort_order;
                """, connection, transaction))
            {
                command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
                await using var reader = await command.ExecuteReaderAsync(cancellationToken);
                while (await reader.ReadAsync(cancellationToken)) missing.Add(reader.GetString(0));
            }
            if (missing.Count > 0)
                throw new ApiException(StatusCodes.Status422UnprocessableEntity, "checklist_incomplete",
                    "Some required checklist items are still unanswered.", missing);

            var reportDue = clock.UtcNow.AddDays(visit.ReportDueDays);
            await using (var command = new SqlCommand("""
                UPDATE dbo.site_visits
                   SET status = N'Report Pending', checked_out_at = SYSUTCDATETIME(), checked_out_by = @actor,
                       execution_note = @note, report_due_at = @report_due,
                       updated_by = @actor, updated_at = SYSUTCDATETIME()
                 WHERE id = @id;
                """, connection, transaction))
            {
                command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
                command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                command.Parameters.AddParameter("@note", SqlDbType.NVarChar, SiteVisitCore.TrimOrNull(request.ExecutionNote, 20_000, "Execution note"), -1);
                command.Parameters.AddParameter("@report_due", SqlDbType.DateTimeOffset, reportDue);
                await command.ExecuteNonQueryAsync(cancellationToken);
            }

            // The report is created empty at check-out, pre-filled from the
            // intake and the findings, so the engineer edits rather than types.
            var reportNumber = await EnsureReportAsync(connection, transaction, id, visit.Number, actor.Id, reportDue, clock, cancellationToken);

            await SiteVisitCore.RecordStatusAsync(connection, transaction, SiteVisitCore.EntityVisit, id, visit.Number,
                visit.Status, "Report Pending", "Engineer checked out", actor.Id, cancellationToken);
            await SiteVisitCore.AuditAsync(connection, transaction, actor.Id, SiteVisitCore.EntityVisit, id, visit.Number,
                "Checked out", null, new { reportDue, reportNumber }, null, cancellationToken);
            await SiteVisitCore.NotifyAsync(connection, transaction, [actor.Id],
                "visit.report_due", $"{visit.Number}: report due {reportDue:yyyy-MM-dd}",
                $"The site visit report is due within {visit.ReportDueDays} day(s) of check-out.",
                SiteVisitCore.EntityVisit, id, $"visit.report_due:{SiteVisitCore.EntityVisit}:{id}", cancellationToken);
            await SiteVisitCore.NotifyAsync(connection, transaction, [visit.SalesOwnerId],
                "visit.checked_out", $"{visit.Number}: the visit is finished",
                "The engineer has checked out. The report will follow.", SiteVisitCore.EntityVisit, id,
                $"visit.checked_out:{SiteVisitCore.EntityVisit}:{id}", cancellationToken);

            var rowVersion = await ReadVisitRowVersionAsync(connection, transaction, id, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new { id, status = "Report Pending", reportDueAt = reportDue, reportNumber, rowVersion });
        }
        catch
        {
            if (transaction.Connection is not null) await transaction.RollbackAsync(CancellationToken.None);
            throw;
        }
    }

    private static async Task<IResult> SaveChecklistAsync(
        long id, IReadOnlyList<SaveChecklistResponseRequest> request, SqlConnectionFactory connections,
        CurrentUserService users, CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync(SiteVisitCore.PermVisitExecute, cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        if (id <= 0) return Results.NotFound();
        if (request.Count == 0) return Results.Ok(new { id, saved = 0 });
        if (request.Count > 200) throw Invalid("At most two hundred checklist answers may be saved at once.");

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken);
        try
        {
            string visitNumber;
            string status;
            await using (var command = new SqlCommand(
                "SELECT visit_no, status FROM dbo.site_visits WHERE id = @id AND deleted_at IS NULL;", connection, transaction))
            {
                command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
                await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
                if (!await reader.ReadAsync(cancellationToken)) return Results.NotFound();
                visitNumber = reader.GetString(0);
                status = reader.GetString(1);
            }
            await DemandAssignedEngineerAsync(connection, transaction, id, actor.Id, cancellationToken);
            if (status is not ("Confirmed" or "In Progress" or "Report Pending"))
                throw new ApiException(StatusCodes.Status409Conflict, "not_executable",
                    $"Checklist answers cannot be saved while the visit is '{status}'.");

            var saved = 0;
            foreach (var answer in request)
            {
                if (answer.ChecklistItemId <= 0) continue;
                InputValidation.OptionalText(answer.ResponseValue, 20_000, "Response");
                InputValidation.OptionalText(answer.Note, 20_000, "Note");
                InputValidation.OptionalText(answer.Unit, 40, "Unit");
                // MERGE by the natural key so continuous autosave from a phone
                // updates rather than duplicating.
                await using var command = new SqlCommand("""
                    UPDATE dbo.site_visit_checklist_responses
                       SET response_value = @value, numeric_value = @numeric, unit = @unit,
                           is_not_applicable = @na, note = @note, answered_by = @actor, answered_at = SYSUTCDATETIME()
                     WHERE visit_id = @visit_id AND checklist_item_id = @item_id;
                    IF @@ROWCOUNT = 0
                    INSERT INTO dbo.site_visit_checklist_responses
                        (visit_id, checklist_item_id, response_value, numeric_value, unit, is_not_applicable, note, answered_by)
                    SELECT @visit_id, @item_id, @value, @numeric, @unit, @na, @note, @actor
                    WHERE EXISTS (
                        SELECT 1 FROM dbo.visit_checklist_items ci
                        INNER JOIN dbo.site_visits v ON v.checklist_template_id = ci.template_id
                        WHERE ci.id = @item_id AND v.id = @visit_id);
                    """, connection, transaction);
                command.Parameters.AddParameter("@visit_id", SqlDbType.BigInt, id);
                command.Parameters.AddParameter("@item_id", SqlDbType.BigInt, answer.ChecklistItemId);
                command.Parameters.AddParameter("@value", SqlDbType.NVarChar, SiteVisitCore.TrimOrNull(answer.ResponseValue, 20_000, "Response"), -1);
                command.Parameters.AddParameter("@numeric", SqlDbType.Decimal, answer.NumericValue, 0, 19, 4);
                command.Parameters.AddParameter("@unit", SqlDbType.NVarChar, SiteVisitCore.Trim(answer.Unit, 40, "Unit"), 40);
                command.Parameters.AddParameter("@na", SqlDbType.Bit, answer.IsNotApplicable);
                command.Parameters.AddParameter("@note", SqlDbType.NVarChar, SiteVisitCore.TrimOrNull(answer.Note, 20_000, "Note"), -1);
                command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                saved += await command.ExecuteNonQueryAsync(cancellationToken) > 0 ? 1 : 0;
            }

            await SiteVisitCore.AuditAsync(connection, transaction, actor.Id, SiteVisitCore.EntityVisit, id, visitNumber,
                "Checklist saved", null, new { saved, requested = request.Count }, null, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new { id, saved });
        }
        catch
        {
            if (transaction.Connection is not null) await transaction.RollbackAsync(CancellationToken.None);
            throw;
        }
    }

    private static async Task<IResult> SaveFindingAsync(
        long id, SaveVisitFindingRequest request, SqlConnectionFactory connections, CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync(SiteVisitCore.PermVisitExecute, cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        if (id <= 0) return Results.NotFound();
        InputValidation.OneOf(request.Kind, "Kind", "Finding", "Measurement", "Risk", "Customer Request",
            "Proposed Solution", "Follow-up", "Existing Condition", "Safety Concern");
        InputValidation.RequiredText(request.Title, 300, "Title");
        InputValidation.OptionalText(request.Detail, 20_000, "Detail");
        InputValidation.OptionalText(request.MeasurementUnit, 40, "Unit");
        InputValidation.OneOf(request.Severity, "Severity", "Info", "Low", "Medium", "High", "Critical");

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken);
        try
        {
            string visitNumber;
            await using (var command = new SqlCommand(
                "SELECT visit_no FROM dbo.site_visits WHERE id = @id AND deleted_at IS NULL;", connection, transaction))
            {
                command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
                visitNumber = await command.ExecuteScalarAsync(cancellationToken) as string ?? "";
            }
            if (visitNumber.Length == 0) return Results.NotFound();
            await DemandAssignedEngineerAsync(connection, transaction, id, actor.Id, cancellationToken);

            // A finding is append-then-archive rather than edit-in-place: the
            // report quotes it, and a silently edited observation is worse than
            // a superseded one.
            long findingId;
            await using (var command = new SqlCommand("""
                INSERT INTO dbo.site_visit_findings
                    (visit_id, kind, title, detail, measurement_value, measurement_unit, severity, sort_order, created_by, updated_by)
                OUTPUT inserted.id
                VALUES (@visit_id, @kind, @title, @detail, @value, @unit, @severity, @sort, @actor, @actor);
                """, connection, transaction))
            {
                command.Parameters.AddParameter("@visit_id", SqlDbType.BigInt, id);
                command.Parameters.AddParameter("@kind", SqlDbType.NVarChar, request.Kind.Trim(), 30);
                command.Parameters.AddParameter("@title", SqlDbType.NVarChar, request.Title.Trim(), 300);
                command.Parameters.AddParameter("@detail", SqlDbType.NVarChar, SiteVisitCore.TrimOrNull(request.Detail, 20_000, "Detail"), -1);
                command.Parameters.AddParameter("@value", SqlDbType.Decimal, request.MeasurementValue, 0, 19, 4);
                command.Parameters.AddParameter("@unit", SqlDbType.NVarChar, SiteVisitCore.Trim(request.MeasurementUnit, 40, "Unit"), 40);
                command.Parameters.AddParameter("@severity", SqlDbType.NVarChar, request.Severity.Trim(), 20);
                command.Parameters.AddParameter("@sort", SqlDbType.Int, SiteVisitCore.Clamp(request.SortOrder, 0, 100_000));
                command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                findingId = (long)(await command.ExecuteScalarAsync(cancellationToken))!;
            }

            await SiteVisitCore.AuditAsync(connection, transaction, actor.Id, SiteVisitCore.EntityVisit, id, visitNumber,
                $"{request.Kind} recorded", null, new { findingId, request.Kind, request.Title, request.Severity }, null, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Created($"/api/v1/site-visits/{id}", new { id, findingId });
        }
        catch
        {
            if (transaction.Connection is not null) await transaction.RollbackAsync(CancellationToken.None);
            throw;
        }
    }

    private static async Task<IResult> DeleteFindingAsync(
        long id, long findingId, SqlConnectionFactory connections, CurrentUserService users, CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync(SiteVisitCore.PermVisitExecute, cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        if (id <= 0 || findingId <= 0) return Results.NotFound();

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken);
        try
        {
            string visitNumber;
            await using (var command = new SqlCommand("""
                SELECT v.visit_no FROM dbo.site_visit_findings f
                INNER JOIN dbo.site_visits v ON v.id = f.visit_id
                WHERE f.id = @finding_id AND f.visit_id = @visit_id AND f.deleted_at IS NULL AND v.deleted_at IS NULL;
                """, connection, transaction))
            {
                command.Parameters.AddParameter("@finding_id", SqlDbType.BigInt, findingId);
                command.Parameters.AddParameter("@visit_id", SqlDbType.BigInt, id);
                visitNumber = await command.ExecuteScalarAsync(cancellationToken) as string ?? "";
            }
            if (visitNumber.Length == 0) return Results.NotFound();
            await DemandAssignedEngineerAsync(connection, transaction, id, actor.Id, cancellationToken);

            await using (var command = new SqlCommand("""
                UPDATE dbo.site_visit_findings
                   SET deleted_at = SYSUTCDATETIME(), updated_by = @actor, updated_at = SYSUTCDATETIME()
                 WHERE id = @finding_id AND visit_id = @visit_id AND deleted_at IS NULL;
                """, connection, transaction))
            {
                command.Parameters.AddParameter("@finding_id", SqlDbType.BigInt, findingId);
                command.Parameters.AddParameter("@visit_id", SqlDbType.BigInt, id);
                command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                await command.ExecuteNonQueryAsync(cancellationToken);
            }
            await SiteVisitCore.AuditAsync(connection, transaction, actor.Id, SiteVisitCore.EntityVisit, id, visitNumber,
                "Finding archived", new { findingId }, null, null, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new { id, findingId });
        }
        catch
        {
            if (transaction.Connection is not null) await transaction.RollbackAsync(CancellationToken.None);
            throw;
        }
    }

    private static async Task<IResult> SaveActionItemAsync(
        long id, SaveVisitActionItemRequest request, SqlConnectionFactory connections, CurrentUserService users,
        CancellationToken cancellationToken)
    {
        var actor = await users.GetRequiredAsync(cancellationToken);
        if (id <= 0) return Results.NotFound();
        InputValidation.RequiredText(request.Title, 300, "Title");
        InputValidation.OptionalText(request.Detail, 20_000, "Detail");
        InputValidation.OptionalText(request.OwnerName, 200, "Owner name");
        InputValidation.OneOf(request.Status, "Status", "Open", "In Progress", "Done", "Cancelled");

        await using var connection = await connections.OpenAsync(cancellationToken);
        var permissions = await SiteVisitCore.LoadPermissionsAsync(connection, actor.Role, cancellationToken);
        if (!permissions.Contains(SiteVisitCore.PermVisitReport) && !permissions.Contains(SiteVisitCore.PermVisitSchedule))
            throw new ApiException(StatusCodes.Status403Forbidden, "permission_denied",
                "Recording an action item requires 'visit.report' or 'visit.schedule'.");

        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken);
        try
        {
            string visitNumber;
            await using (var command = new SqlCommand(
                "SELECT visit_no FROM dbo.site_visits WHERE id = @id AND deleted_at IS NULL;", connection, transaction))
            {
                command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
                visitNumber = await command.ExecuteScalarAsync(cancellationToken) as string ?? "";
            }
            if (visitNumber.Length == 0) return Results.NotFound();

            long actionItemId;
            await using (var command = new SqlCommand("""
                INSERT INTO dbo.site_visit_action_items
                    (visit_id, report_id, title, detail, owner_id, owner_name, due_date, status, completed_at, created_by, updated_by)
                OUTPUT inserted.id
                SELECT @visit_id, (SELECT id FROM dbo.site_visit_reports WHERE visit_id = @visit_id),
                       @title, @detail, @owner_id, @owner_name, @due_date, @status,
                       CASE WHEN @status = N'Done' THEN SYSUTCDATETIME() ELSE NULL END, @actor, @actor;
                """, connection, transaction))
            {
                command.Parameters.AddParameter("@visit_id", SqlDbType.BigInt, id);
                command.Parameters.AddParameter("@title", SqlDbType.NVarChar, request.Title.Trim(), 300);
                command.Parameters.AddParameter("@detail", SqlDbType.NVarChar, SiteVisitCore.TrimOrNull(request.Detail, 20_000, "Detail"), -1);
                command.Parameters.AddParameter("@owner_id", SqlDbType.BigInt, request.OwnerId is > 0 ? request.OwnerId : null);
                command.Parameters.AddParameter("@owner_name", SqlDbType.NVarChar, SiteVisitCore.Trim(request.OwnerName, 200, "Owner name"), 200);
                command.Parameters.AddParameter("@due_date", SqlDbType.Date, request.DueDate);
                command.Parameters.AddParameter("@status", SqlDbType.NVarChar, request.Status.Trim(), 30);
                command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                actionItemId = (long)(await command.ExecuteScalarAsync(cancellationToken))!;
            }

            await SiteVisitCore.AuditAsync(connection, transaction, actor.Id, SiteVisitCore.EntityVisit, id, visitNumber,
                "Action item recorded", null, new { actionItemId, request.Title, request.OwnerId, request.DueDate, request.Status }, null, cancellationToken);
            if (request.OwnerId is > 0)
                await SiteVisitCore.NotifyAsync(connection, transaction, [request.OwnerId.Value],
                    "visit.action_item", $"{visitNumber}: an action item is assigned to you", request.Title.Trim(),
                    SiteVisitCore.EntityVisit, id, $"visit.action_item:{SiteVisitCore.EntityVisit}:{id}:{actionItemId}", cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Created($"/api/v1/site-visits/{id}", new { id, actionItemId });
        }
        catch
        {
            if (transaction.Connection is not null) await transaction.RollbackAsync(CancellationToken.None);
            throw;
        }
    }

    /* ===================================================================
       Site photographs, videos and documents
       =================================================================== */

    private static async Task<IResult> UploadAttachmentAsync(
        long id, HttpRequest httpRequest, SqlConnectionFactory connections, CurrentUserService users,
        ProjectDocumentStorage storage, DocumentStorageOptions storageOptions, IDocumentMalwareScanner scanner,
        ILoggerFactory loggerFactory, CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync(SiteVisitCore.PermVisitExecute, cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        if (id <= 0) return Results.NotFound();
        var upload = await SiteVisitFiles.ReadUploadAsync(httpRequest, storageOptions, cancellationToken);

        string visitNumber;
        await using (var connection = await connections.OpenAsync(cancellationToken))
        {
            await using (var command = new SqlCommand(
                "SELECT visit_no FROM dbo.site_visits WHERE id = @id AND deleted_at IS NULL AND archived_at IS NULL;", connection))
            {
                command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
                visitNumber = await command.ExecuteScalarAsync(cancellationToken) as string ?? "";
            }
            if (visitNumber.Length == 0) return Results.NotFound();
            await using var guard = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken);
            await DemandAssignedEngineerAsync(connection, guard, id, actor.Id, cancellationToken);
            await guard.RollbackAsync(cancellationToken);
        }

        var storageKey = SiteVisitFiles.StorageKey("site-visits", id, upload.Extension);
        var stored = false;
        var metadataCommitted = false;
        var commitOutcomeUnknown = false;
        try
        {
            DocumentWriteResult write;
            await using (var source = upload.File.OpenReadStream()) write = await storage.WriteAsync(storageKey, source, cancellationToken);
            stored = true;
            var scan = await scanner.ScanAsync(storageKey, cancellationToken);

            await using var connection = await connections.OpenAsync(cancellationToken);
            await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken);
            try
            {
                VisitAttachmentRecord result;
                await using (var insert = new SqlCommand("""
                    DECLARE @created TABLE (id bigint NOT NULL, version int NOT NULL, uploaded_at datetimeoffset(0) NOT NULL, row_version binary(8) NOT NULL);
                    DECLARE @next int = (
                        SELECT ISNULL(MAX(version), 0) + 1 FROM dbo.site_visit_attachments WITH (UPDLOCK, HOLDLOCK)
                        WHERE visit_id = @visit_id AND name = @name);
                    INSERT INTO dbo.site_visit_attachments
                        (visit_id, finding_id, name, category, description, version, content_type, size_bytes, storage_key, sha256, scan_status, uploaded_by)
                    OUTPUT inserted.id, inserted.version, inserted.uploaded_at, inserted.row_version
                    INTO @created(id, version, uploaded_at, row_version)
                    SELECT @visit_id, @finding_id, @name, @category, @description, @next, @content_type,
                           @size_bytes, @storage_key, @sha256, @scan_status, @actor
                    WHERE @finding_id IS NULL OR EXISTS (
                        SELECT 1 FROM dbo.site_visit_findings WHERE id = @finding_id AND visit_id = @visit_id AND deleted_at IS NULL);
                    SELECT id, version, uploaded_at, row_version FROM @created;
                    """, connection, transaction))
                {
                    insert.Parameters.AddParameter("@visit_id", SqlDbType.BigInt, id);
                    insert.Parameters.AddParameter("@finding_id", SqlDbType.BigInt, upload.FindingId);
                    insert.Parameters.AddParameter("@name", SqlDbType.NVarChar, upload.FileName, 500);
                    insert.Parameters.AddParameter("@category", SqlDbType.NVarChar, upload.Category, 100);
                    insert.Parameters.AddParameter("@description", SqlDbType.NVarChar, upload.Description, 1000);
                    insert.Parameters.AddParameter("@content_type", SqlDbType.NVarChar, upload.ContentType, 200);
                    insert.Parameters.AddParameter("@size_bytes", SqlDbType.BigInt, write.SizeBytes);
                    insert.Parameters.AddParameter("@storage_key", SqlDbType.NVarChar, storageKey, 1000);
                    insert.Parameters.AddParameter("@sha256", SqlDbType.Char, write.Sha256, 64);
                    insert.Parameters.AddParameter("@scan_status", SqlDbType.NVarChar, scan.Status, 20);
                    insert.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                    await using var reader = await insert.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
                    if (!await reader.ReadAsync(cancellationToken))
                        throw new ApiException(StatusCodes.Status422UnprocessableEntity, "invalid_reference",
                            "The finding this file belongs to does not exist on this visit.");
                    result = new VisitAttachmentRecord(reader.GetInt64(0), upload.FindingId, upload.FileName, upload.Category,
                        upload.Description, reader.GetInt32(1), upload.ContentType, write.SizeBytes, scan.Status, actor.Name,
                        reader.GetFieldValue<DateTimeOffset>(2), reader.RowVersionString(3));
                }
                await SiteVisitCore.AuditAsync(connection, transaction, actor.Id, SiteVisitCore.EntityVisit, id, visitNumber,
                    "Site attachment uploaded", null,
                    new { result.Id, result.Name, result.Category, result.SizeBytes, sha256 = write.Sha256, scan = scan.Status },
                    null, cancellationToken);
                commitOutcomeUnknown = true;
                await transaction.CommitAsync(cancellationToken);
                metadataCommitted = true;
                commitOutcomeUnknown = false;
                return Results.Created($"/api/v1/site-visits/{id}/attachments/{result.Id}/content", result);
            }
            catch (Exception exception)
            {
                if (!commitOutcomeUnknown && !metadataCommitted && transaction.Connection is not null)
                    await transaction.RollbackAsync(CancellationToken.None);
                // An unknown commit outcome keeps the bytes. Deleting a file we
                // cannot prove is unreferenced is the worse of the two mistakes.
                if (commitOutcomeUnknown)
                    loggerFactory.CreateLogger("SiteVisitAttachmentStorage").LogCritical(exception,
                        "Site visit attachment commit outcome is unknown; preserving storage key {StorageKey} for visit {VisitId}",
                        storageKey, id);
                throw;
            }
        }
        catch
        {
            if (stored && !metadataCommitted && !commitOutcomeUnknown) await storage.DeleteIfExistsAsync(storageKey);
            throw;
        }
    }

    private static async Task<IResult> DownloadAttachmentAsync(
        long id, long attachmentId, HttpRequest request, SqlConnectionFactory connections, CurrentUserService users,
        ProjectDocumentStorage storage, CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync(SiteVisitCore.PermVisitRead, cancellationToken);
        if (HttpMethods.IsHead(request.Method)) return Results.StatusCode(StatusCodes.Status405MethodNotAllowed);
        if (id <= 0 || attachmentId <= 0) return Results.NotFound();

        string fileName, contentType, storageKey, sha256;
        long sizeBytes;
        await using (var connection = await connections.OpenAsync(cancellationToken))
        await using (var command = new SqlCommand("""
            SELECT name, content_type, storage_key, size_bytes, sha256
            FROM dbo.site_visit_attachments
            WHERE id = @attachment_id AND visit_id = @visit_id AND deleted_at IS NULL;
            """, connection))
        {
            command.Parameters.AddParameter("@attachment_id", SqlDbType.BigInt, attachmentId);
            command.Parameters.AddParameter("@visit_id", SqlDbType.BigInt, id);
            await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
            if (!await reader.ReadAsync(cancellationToken)) return Results.NotFound();
            fileName = reader.GetString(0);
            contentType = reader.GetString(1);
            storageKey = reader.GetString(2);
            sizeBytes = reader.GetInt64(3);
            sha256 = reader.GetString(4);
        }

        var stream = storage.OpenRead(storageKey);
        try
        {
            await storage.VerifyIntegrityAndRewindAsync(stream, sizeBytes, sha256, cancellationToken);
            return Results.File(stream, contentType, fileName, enableRangeProcessing: false);
        }
        catch
        {
            await stream.DisposeAsync();
            throw;
        }
    }

    /* ===================================================================
       Site visit report
       =================================================================== */

    /// <summary>
    /// Creates the report at check-out, pre-filled from the intake and the
    /// findings so the engineer edits prose rather than retyping the visit.
    /// Returns the report number; safe to call twice.
    /// </summary>
    private static async Task<string> EnsureReportAsync(
        SqlConnection connection, SqlTransaction transaction, long visitId, string visitNumber,
        long actorId, DateTimeOffset dueAt, BusinessClock clock, CancellationToken cancellationToken)
    {
        await using (var existing = new SqlCommand(
            "SELECT report_no FROM dbo.site_visit_reports WHERE visit_id = @visit_id;", connection, transaction))
        {
            existing.Parameters.AddParameter("@visit_id", SqlDbType.BigInt, visitId);
            if (await existing.ExecuteScalarAsync(cancellationToken) is string current) return current;
        }

        var number = await InquiryEndpoints.IssueNumberAsync(connection, transaction, "SVR", clock.Today, cancellationToken);
        long reportId;
        await using (var command = new SqlCommand("""
            INSERT INTO dbo.site_visit_reports (report_no, visit_id, status, current_revision, author_id, due_at, updated_by)
            OUTPUT inserted.id
            VALUES (@number, @visit_id, N'Draft', 0, @actor, @due_at, @actor);
            """, connection, transaction))
        {
            command.Parameters.AddParameter("@number", SqlDbType.NVarChar, number, 30);
            command.Parameters.AddParameter("@visit_id", SqlDbType.BigInt, visitId);
            command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actorId);
            command.Parameters.AddParameter("@due_at", SqlDbType.DateTimeOffset, dueAt);
            reportId = (long)(await command.ExecuteScalarAsync(cancellationToken))!;
        }

        // Revision 0 is seeded from what the system already knows. The
        // customer's requirement is copied as reference text, not as a link
        // that could later drift from what the customer actually said.
        await using (var command = new SqlCommand("""
            INSERT INTO dbo.site_visit_report_revisions (
                report_id, revision, status, customer_requirement, existing_condition, findings_summary,
                measurement_summary, risk, safety_concern, customer_additional_request, proposed_scope,
                change_summary, created_by)
            SELECT @report_id, 0, N'Draft',
                CONCAT_WS(CHAR(10) + CHAR(10),
                    NULLIF(i.problem_statement, N''), NULLIF(i.desired_capability, N''), NULLIF(i.expected_result, N'')),
                NULLIF(i.existing_process, N''),
                (SELECT STUFF((SELECT CHAR(10) + N'- ' + f.title FROM dbo.site_visit_findings f
                    WHERE f.visit_id = v.id AND f.deleted_at IS NULL AND f.kind = N'Finding'
                    ORDER BY f.sort_order, f.id FOR XML PATH(N''), TYPE).value(N'.', N'nvarchar(max)'), 1, 1, N'')),
                (SELECT STUFF((SELECT CHAR(10) + N'- ' + f.title + N': '
                        + ISNULL(CONVERT(nvarchar(40), f.measurement_value), N'') + N' ' + f.measurement_unit
                    FROM dbo.site_visit_findings f
                    WHERE f.visit_id = v.id AND f.deleted_at IS NULL AND f.kind = N'Measurement'
                    ORDER BY f.sort_order, f.id FOR XML PATH(N''), TYPE).value(N'.', N'nvarchar(max)'), 1, 1, N'')),
                (SELECT STUFF((SELECT CHAR(10) + N'- ' + f.title FROM dbo.site_visit_findings f
                    WHERE f.visit_id = v.id AND f.deleted_at IS NULL AND f.kind = N'Risk'
                    ORDER BY f.sort_order, f.id FOR XML PATH(N''), TYPE).value(N'.', N'nvarchar(max)'), 1, 1, N'')),
                (SELECT STUFF((SELECT CHAR(10) + N'- ' + f.title FROM dbo.site_visit_findings f
                    WHERE f.visit_id = v.id AND f.deleted_at IS NULL AND f.kind = N'Safety Concern'
                    ORDER BY f.sort_order, f.id FOR XML PATH(N''), TYPE).value(N'.', N'nvarchar(max)'), 1, 1, N'')),
                (SELECT STUFF((SELECT CHAR(10) + N'- ' + f.title FROM dbo.site_visit_findings f
                    WHERE f.visit_id = v.id AND f.deleted_at IS NULL AND f.kind = N'Customer Request'
                    ORDER BY f.sort_order, f.id FOR XML PATH(N''), TYPE).value(N'.', N'nvarchar(max)'), 1, 1, N'')),
                (SELECT STUFF((SELECT CHAR(10) + N'- ' + f.title FROM dbo.site_visit_findings f
                    WHERE f.visit_id = v.id AND f.deleted_at IS NULL AND f.kind = N'Proposed Solution'
                    ORDER BY f.sort_order, f.id FOR XML PATH(N''), TYPE).value(N'.', N'nvarchar(max)'), 1, 1, N'')),
                N'Initial draft prefilled from the intake and the site findings', @actor
            FROM dbo.site_visits v
            INNER JOIN dbo.sales_intakes i ON i.id = v.intake_id
            WHERE v.id = @visit_id;
            """, connection, transaction))
        {
            command.Parameters.AddParameter("@report_id", SqlDbType.BigInt, reportId);
            command.Parameters.AddParameter("@visit_id", SqlDbType.BigInt, visitId);
            command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actorId);
            await command.ExecuteNonQueryAsync(cancellationToken);
        }

        await SiteVisitCore.RecordStatusAsync(connection, transaction, SiteVisitCore.EntityReport, reportId, number,
            null, "Draft", $"Report opened for {visitNumber}", actorId, cancellationToken);
        return number;
    }

    private sealed record ReportLock(long Id, string Number, string Status, int CurrentRevision, long AuthorId, long VisitId, string VisitNumber);

    private static async Task<ReportLock?> LockReportAsync(
        SqlConnection connection, SqlTransaction transaction, long visitId, byte[]? expected, CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            SELECT r.id, r.report_no, r.status, r.current_revision, r.author_id, r.visit_id, v.visit_no, r.row_version
            FROM dbo.site_visit_reports r WITH (UPDLOCK, HOLDLOCK)
            INNER JOIN dbo.site_visits v ON v.id = r.visit_id
            WHERE r.visit_id = @visit_id AND v.deleted_at IS NULL;
            """, connection, transaction);
        command.Parameters.AddParameter("@visit_id", SqlDbType.BigInt, visitId);
        await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
        if (!await reader.ReadAsync(cancellationToken)) return null;
        if (expected is not null) SiteVisitCore.RequireSameVersion(expected, (byte[])reader.GetValue(7));
        return new ReportLock(reader.GetInt64(0), reader.GetString(1), reader.GetString(2), reader.GetInt32(3),
            reader.GetInt64(4), reader.GetInt64(5), reader.GetString(6));
    }

    private static async Task<IResult> SaveReportAsync(
        long id, SaveVisitReportRequest request, SqlConnectionFactory connections, CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync(SiteVisitCore.PermVisitReport, cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        if (id <= 0) return Results.NotFound();
        var expected = SqlExtensions.ParseRowVersion(request.RowVersion);

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            var report = await LockReportAsync(connection, transaction, id, expected, cancellationToken);
            if (report is null) return Results.NotFound();
            if (report.Status is "Submitted" or "Under Review" or "Approved" or "Acknowledged")
                throw new ApiException(StatusCodes.Status409Conflict, "report_locked",
                    $"A report in '{report.Status}' cannot be edited. Ask the reviewer to request a revision.");

            await using (var command = new SqlCommand("""
                UPDATE dbo.site_visit_report_revisions SET
                    visit_summary = @visit_summary, customer_requirement = @customer_requirement,
                    existing_condition = @existing_condition, findings_summary = @findings_summary,
                    measurement_summary = @measurement_summary, root_cause = @root_cause,
                    recommended_solution = @recommended_solution, proposed_scope = @proposed_scope,
                    assumption = @assumption, exclusion = @exclusion, risk = @risk,
                    safety_concern = @safety_concern, customer_additional_request = @customer_additional_request,
                    engineer_conclusion = @engineer_conclusion, sales_follow_up = @sales_follow_up,
                    next_step = @next_step, change_summary = @change_summary
                WHERE report_id = @report_id AND revision = @revision;
                """, connection, transaction))
            {
                command.Parameters.AddParameter("@report_id", SqlDbType.BigInt, report.Id);
                command.Parameters.AddParameter("@revision", SqlDbType.Int, report.CurrentRevision);
                BindReportBody(command, request);
                await command.ExecuteNonQueryAsync(cancellationToken);
            }

            await using (var touch = new SqlCommand(
                "UPDATE dbo.site_visit_reports SET updated_by = @actor, updated_at = SYSUTCDATETIME() WHERE id = @report_id;",
                connection, transaction))
            {
                touch.Parameters.AddParameter("@report_id", SqlDbType.BigInt, report.Id);
                touch.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                await touch.ExecuteNonQueryAsync(cancellationToken);
            }

            await SiteVisitCore.AuditAsync(connection, transaction, actor.Id, SiteVisitCore.EntityReport, report.Id, report.Number,
                "Report draft saved", null, new { revision = report.CurrentRevision }, null, cancellationToken);

            var rowVersion = await ReadReportRowVersionAsync(connection, transaction, report.Id, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new { visitId = id, reportId = report.Id, number = report.Number, rowVersion });
        }
        catch
        {
            if (transaction.Connection is not null) await transaction.RollbackAsync(CancellationToken.None);
            throw;
        }
    }

    private static void BindReportBody(SqlCommand command, SaveVisitReportRequest request)
    {
        var p = command.Parameters;
        p.AddParameter("@visit_summary", SqlDbType.NVarChar, SiteVisitCore.TrimOrNull(request.VisitSummary, 20_000, "Visit summary"), -1);
        p.AddParameter("@customer_requirement", SqlDbType.NVarChar, SiteVisitCore.TrimOrNull(request.CustomerRequirement, 20_000, "Customer requirement"), -1);
        p.AddParameter("@existing_condition", SqlDbType.NVarChar, SiteVisitCore.TrimOrNull(request.ExistingCondition, 20_000, "Existing condition"), -1);
        p.AddParameter("@findings_summary", SqlDbType.NVarChar, SiteVisitCore.TrimOrNull(request.FindingsSummary, 20_000, "Findings"), -1);
        p.AddParameter("@measurement_summary", SqlDbType.NVarChar, SiteVisitCore.TrimOrNull(request.MeasurementSummary, 20_000, "Measurements"), -1);
        p.AddParameter("@root_cause", SqlDbType.NVarChar, SiteVisitCore.TrimOrNull(request.RootCause, 20_000, "Root cause"), -1);
        p.AddParameter("@recommended_solution", SqlDbType.NVarChar, SiteVisitCore.TrimOrNull(request.RecommendedSolution, 20_000, "Recommended solution"), -1);
        p.AddParameter("@proposed_scope", SqlDbType.NVarChar, SiteVisitCore.TrimOrNull(request.ProposedScope, 20_000, "Proposed scope"), -1);
        p.AddParameter("@assumption", SqlDbType.NVarChar, SiteVisitCore.TrimOrNull(request.Assumption, 20_000, "Assumption"), -1);
        p.AddParameter("@exclusion", SqlDbType.NVarChar, SiteVisitCore.TrimOrNull(request.Exclusion, 20_000, "Exclusion"), -1);
        p.AddParameter("@risk", SqlDbType.NVarChar, SiteVisitCore.TrimOrNull(request.Risk, 20_000, "Risk"), -1);
        p.AddParameter("@safety_concern", SqlDbType.NVarChar, SiteVisitCore.TrimOrNull(request.SafetyConcern, 20_000, "Safety concern"), -1);
        p.AddParameter("@customer_additional_request", SqlDbType.NVarChar, SiteVisitCore.TrimOrNull(request.CustomerAdditionalRequest, 20_000, "Customer additional request"), -1);
        p.AddParameter("@engineer_conclusion", SqlDbType.NVarChar, SiteVisitCore.TrimOrNull(request.EngineerConclusion, 20_000, "Engineer conclusion"), -1);
        p.AddParameter("@sales_follow_up", SqlDbType.NVarChar, SiteVisitCore.TrimOrNull(request.SalesFollowUp, 20_000, "Sales follow-up"), -1);
        p.AddParameter("@next_step", SqlDbType.NVarChar, SiteVisitCore.TrimOrNull(request.NextStep, 20_000, "Next step"), -1);
        p.AddParameter("@change_summary", SqlDbType.NVarChar, SiteVisitCore.Trim(request.ChangeSummary, 1_000, "Change summary"), 1_000);
    }

    private static async Task<string> ReadReportRowVersionAsync(
        SqlConnection connection, SqlTransaction? transaction, long reportId, CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("SELECT row_version FROM dbo.site_visit_reports WHERE id = @id;", connection, transaction);
        command.Parameters.AddParameter("@id", SqlDbType.BigInt, reportId);
        return Convert.ToBase64String((byte[])(await command.ExecuteScalarAsync(cancellationToken))!);
    }

    private static async Task<IResult> SubmitReportAsync(
        long id, ChangeStatusRequest request, SqlConnectionFactory connections, CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync(SiteVisitCore.PermVisitReport, cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        if (id <= 0) return Results.NotFound();
        var expected = SqlExtensions.ParseRowVersion(request.RowVersion);

        await using var connection = await connections.OpenAsync(cancellationToken);
        var permissions = await SiteVisitCore.LoadPermissionsAsync(connection, actor.Role, cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            var report = await LockReportAsync(connection, transaction, id, expected, cancellationToken);
            if (report is null) return Results.NotFound();
            if (report.Status is not ("Draft" or "Revision Requested"))
                throw new ApiException(StatusCodes.Status409Conflict, "report_not_draft",
                    $"A report in '{report.Status}' has already been submitted.");

            var visit = await LockVisitAsync(connection, transaction, id, null, cancellationToken);
            if (visit is null) return Results.NotFound();
            SiteVisitCore.RequireTransition(SiteVisitCore.VisitTransitions, visit.Status, "Report Under Review", permissions, null);

            // A report with nothing in the conclusion is not a report.
            await using (var command = new SqlCommand("""
                SELECT CASE WHEN LEN(LTRIM(RTRIM(ISNULL(visit_summary, N'')))) >= 20
                             AND LEN(LTRIM(RTRIM(ISNULL(engineer_conclusion, N'')))) >= 20
                        THEN 1 ELSE 0 END
                FROM dbo.site_visit_report_revisions WHERE report_id = @report_id AND revision = @revision;
                """, connection, transaction))
            {
                command.Parameters.AddParameter("@report_id", SqlDbType.BigInt, report.Id);
                command.Parameters.AddParameter("@revision", SqlDbType.Int, report.CurrentRevision);
                if ((int)(await command.ExecuteScalarAsync(cancellationToken))! != 1)
                    throw new ApiException(StatusCodes.Status422UnprocessableEntity, "report_incomplete",
                        "A visit summary and an engineer conclusion are required before submitting.");
            }

            await UpdateReportStatusAsync(connection, transaction, report, "Submitted", actor.Id, null, cancellationToken);
            await using (var command = new SqlCommand("""
                UPDATE dbo.site_visit_reports SET submitted_at = SYSUTCDATETIME() WHERE id = @report_id;
                UPDATE dbo.site_visit_report_revisions SET status = N'Submitted' WHERE report_id = @report_id AND revision = @revision;
                UPDATE dbo.site_visits SET status = N'Report Under Review', updated_by = @actor, updated_at = SYSUTCDATETIME() WHERE id = @visit_id;
                """, connection, transaction))
            {
                command.Parameters.AddParameter("@report_id", SqlDbType.BigInt, report.Id);
                command.Parameters.AddParameter("@revision", SqlDbType.Int, report.CurrentRevision);
                command.Parameters.AddParameter("@visit_id", SqlDbType.BigInt, id);
                command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                await command.ExecuteNonQueryAsync(cancellationToken);
            }

            await SiteVisitCore.RecordStatusAsync(connection, transaction, SiteVisitCore.EntityVisit, id, visit.Number,
                visit.Status, "Report Under Review", "Report submitted", actor.Id, cancellationToken);
            var approvers = await SiteVisitCore.UsersWithPermissionAsync(connection, transaction, SiteVisitCore.PermVisitReportApprove, cancellationToken);
            await SiteVisitCore.NotifyAsync(connection, transaction, approvers.Where(userId => userId != actor.Id),
                "report.submitted", $"{report.Number} is waiting for review",
                $"{actor.Name} submitted the site visit report for {visit.Number}.",
                SiteVisitCore.EntityReport, report.Id,
                $"report.submitted:{SiteVisitCore.EntityReport}:{report.Id}:{report.CurrentRevision}", cancellationToken);

            var rowVersion = await ReadReportRowVersionAsync(connection, transaction, report.Id, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new { visitId = id, reportId = report.Id, status = "Submitted", rowVersion });
        }
        catch
        {
            if (transaction.Connection is not null) await transaction.RollbackAsync(CancellationToken.None);
            throw;
        }
    }

    private static async Task UpdateReportStatusAsync(
        SqlConnection connection, SqlTransaction transaction, ReportLock report, string status,
        long actorId, string? reason, CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand(
            "UPDATE dbo.site_visit_reports SET status = @status, updated_by = @actor, updated_at = SYSUTCDATETIME() WHERE id = @report_id;",
            connection, transaction);
        command.Parameters.AddParameter("@report_id", SqlDbType.BigInt, report.Id);
        command.Parameters.AddParameter("@status", SqlDbType.NVarChar, status, 30);
        command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actorId);
        await command.ExecuteNonQueryAsync(cancellationToken);
        await SiteVisitCore.RecordStatusAsync(connection, transaction, SiteVisitCore.EntityReport, report.Id, report.Number,
            report.Status, status, reason, actorId, cancellationToken);
    }

    private static async Task<IResult> ReviewReportAsync(
        long id, ReviewVisitReportRequest request, SqlConnectionFactory connections, CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync(SiteVisitCore.PermVisitReportApprove, cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        if (id <= 0) return Results.NotFound();
        InputValidation.OneOf(request.Decision, "Decision", "Approved", "Revision Requested");
        InputValidation.OptionalText(request.Comment, 20_000, "Comment");
        if (request.Decision == "Revision Requested" && string.IsNullOrWhiteSpace(request.Comment))
            throw Invalid("Say what needs changing, so the engineer knows what to do.");
        var expected = SqlExtensions.ParseRowVersion(request.RowVersion);

        await using var connection = await connections.OpenAsync(cancellationToken);
        var permissions = await SiteVisitCore.LoadPermissionsAsync(connection, actor.Role, cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            var report = await LockReportAsync(connection, transaction, id, expected, cancellationToken);
            if (report is null) return Results.NotFound();
            if (report.Status is not ("Submitted" or "Under Review"))
                throw new ApiException(StatusCodes.Status409Conflict, "report_not_in_review",
                    $"A report in '{report.Status}' is not awaiting review.");
            // An engineer cannot approve their own report, the same rule the
            // Knowledge Hub applies to its final approval step.
            if (request.Decision == "Approved" && report.AuthorId == actor.Id)
                throw new ApiException(StatusCodes.Status403Forbidden, "self_approval_forbidden",
                    "The author of a report cannot approve it.");

            var visit = await LockVisitAsync(connection, transaction, id, null, cancellationToken);
            if (visit is null) return Results.NotFound();

            if (request.Decision == "Approved")
            {
                SiteVisitCore.RequireTransition(SiteVisitCore.VisitTransitions, visit.Status, "Completed", permissions, null);
                await using var command = new SqlCommand("""
                    UPDATE dbo.site_visit_report_revisions
                       SET status = N'Approved', approved_by = @actor, approved_at = SYSUTCDATETIME()
                     WHERE report_id = @report_id AND revision = @revision;
                    UPDATE dbo.site_visit_reports
                       SET reviewed_by = @actor, reviewed_at = SYSUTCDATETIME(), review_comment = @comment
                     WHERE id = @report_id;
                    UPDATE dbo.site_visits SET status = N'Completed', updated_by = @actor, updated_at = SYSUTCDATETIME()
                     WHERE id = @visit_id;
                    """, connection, transaction);
                command.Parameters.AddParameter("@report_id", SqlDbType.BigInt, report.Id);
                command.Parameters.AddParameter("@revision", SqlDbType.Int, report.CurrentRevision);
                command.Parameters.AddParameter("@visit_id", SqlDbType.BigInt, id);
                command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                command.Parameters.AddParameter("@comment", SqlDbType.NVarChar, SiteVisitCore.TrimOrNull(request.Comment, 20_000, "Comment"), -1);
                await command.ExecuteNonQueryAsync(cancellationToken);
                await UpdateReportStatusAsync(connection, transaction, report, "Approved", actor.Id, request.Comment, cancellationToken);
                await SiteVisitCore.RecordStatusAsync(connection, transaction, SiteVisitCore.EntityVisit, id, visit.Number,
                    visit.Status, "Completed", "Report approved", actor.Id, cancellationToken);
            }
            else
            {
                SiteVisitCore.RequireTransition(SiteVisitCore.VisitTransitions, visit.Status, "Report Pending", permissions, request.Comment);
                // A revision request opens the next revision rather than
                // reopening the submitted one, so the reviewed text is preserved.
                var nextRevision = report.CurrentRevision + 1;
                await using var command = new SqlCommand("""
                    UPDATE dbo.site_visit_report_revisions SET status = N'Superseded'
                     WHERE report_id = @report_id AND revision = @revision;
                    INSERT INTO dbo.site_visit_report_revisions (
                        report_id, revision, status, visit_summary, customer_requirement, existing_condition,
                        findings_summary, measurement_summary, root_cause, recommended_solution, proposed_scope,
                        assumption, exclusion, risk, safety_concern, customer_additional_request,
                        engineer_conclusion, sales_follow_up, next_step, change_summary, created_by)
                    SELECT @report_id, @next_revision, N'Draft', visit_summary, customer_requirement, existing_condition,
                        findings_summary, measurement_summary, root_cause, recommended_solution, proposed_scope,
                        assumption, exclusion, risk, safety_concern, customer_additional_request,
                        engineer_conclusion, sales_follow_up, next_step, @change_summary, @actor
                    FROM dbo.site_visit_report_revisions WHERE report_id = @report_id AND revision = @revision;
                    UPDATE dbo.site_visit_reports
                       SET current_revision = @next_revision, reviewed_by = @actor, reviewed_at = SYSUTCDATETIME(),
                           review_comment = @comment, submitted_at = NULL
                     WHERE id = @report_id;
                    UPDATE dbo.site_visits SET status = N'Report Pending', updated_by = @actor, updated_at = SYSUTCDATETIME()
                     WHERE id = @visit_id;
                    """, connection, transaction);
                command.Parameters.AddParameter("@report_id", SqlDbType.BigInt, report.Id);
                command.Parameters.AddParameter("@revision", SqlDbType.Int, report.CurrentRevision);
                command.Parameters.AddParameter("@next_revision", SqlDbType.Int, nextRevision);
                command.Parameters.AddParameter("@visit_id", SqlDbType.BigInt, id);
                command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                command.Parameters.AddParameter("@comment", SqlDbType.NVarChar, SiteVisitCore.TrimOrNull(request.Comment, 20_000, "Comment"), -1);
                command.Parameters.AddParameter("@change_summary", SqlDbType.NVarChar,
                    SiteVisitCore.Trim($"Revision requested: {request.Comment}", 1_000, "Change summary"), 1_000);
                await command.ExecuteNonQueryAsync(cancellationToken);
                await UpdateReportStatusAsync(connection, transaction, report, "Revision Requested", actor.Id, request.Comment, cancellationToken);
                await SiteVisitCore.RecordStatusAsync(connection, transaction, SiteVisitCore.EntityVisit, id, visit.Number,
                    visit.Status, "Report Pending", request.Comment, actor.Id, cancellationToken);
            }

            await SiteVisitCore.AuditAsync(connection, transaction, actor.Id, SiteVisitCore.EntityReport, report.Id, report.Number,
                $"Report {request.Decision.ToLowerInvariant()}", new { status = report.Status },
                new { status = request.Decision, revision = report.CurrentRevision }, request.Comment, cancellationToken);
            await SiteVisitCore.NotifyAsync(connection, transaction, [report.AuthorId, visit.SalesOwnerId],
                request.Decision == "Approved" ? "report.approved" : "report.revision_requested",
                $"{report.Number} was {request.Decision.ToLowerInvariant()}",
                string.IsNullOrWhiteSpace(request.Comment) ? "The site visit report has been reviewed." : request.Comment!,
                SiteVisitCore.EntityReport, report.Id,
                $"report.review:{SiteVisitCore.EntityReport}:{report.Id}:{report.CurrentRevision}:{request.Decision}", cancellationToken);

            var rowVersion = await ReadReportRowVersionAsync(connection, transaction, report.Id, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new { visitId = id, reportId = report.Id, status = request.Decision, rowVersion });
        }
        catch
        {
            if (transaction.Connection is not null) await transaction.RollbackAsync(CancellationToken.None);
            throw;
        }
    }

    private static async Task<IResult> AcknowledgeReportAsync(
        long id, AcknowledgeVisitReportRequest request, SqlConnectionFactory connections, CurrentUserService users,
        BusinessClock clock, CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync(SiteVisitCore.PermVisitReport, cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        if (id <= 0) return Results.NotFound();
        InputValidation.RequiredText(request.AcknowledgedBy, 200, "Acknowledged by");
        var expected = SqlExtensions.ParseRowVersion(request.RowVersion);

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            var report = await LockReportAsync(connection, transaction, id, expected, cancellationToken);
            if (report is null) return Results.NotFound();
            if (report.Status != "Approved")
                throw new ApiException(StatusCodes.Status409Conflict, "report_not_approved",
                    "Only an approved report can be acknowledged by the customer.");

            await using (var command = new SqlCommand("""
                UPDATE dbo.site_visit_reports
                   SET status = N'Acknowledged', customer_acknowledged_by = @name,
                       customer_acknowledged_at = @at, updated_by = @actor, updated_at = SYSUTCDATETIME()
                 WHERE id = @report_id;
                """, connection, transaction))
            {
                command.Parameters.AddParameter("@report_id", SqlDbType.BigInt, report.Id);
                command.Parameters.AddParameter("@name", SqlDbType.NVarChar, request.AcknowledgedBy.Trim(), 200);
                command.Parameters.AddParameter("@at", SqlDbType.DateTimeOffset, request.AcknowledgedAt ?? clock.UtcNow);
                command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                await command.ExecuteNonQueryAsync(cancellationToken);
            }
            await SiteVisitCore.RecordStatusAsync(connection, transaction, SiteVisitCore.EntityReport, report.Id, report.Number,
                report.Status, "Acknowledged", $"Acknowledged by {request.AcknowledgedBy.Trim()}", actor.Id, cancellationToken);
            await SiteVisitCore.AuditAsync(connection, transaction, actor.Id, SiteVisitCore.EntityReport, report.Id, report.Number,
                "Customer acknowledged the report", null, new { request.AcknowledgedBy }, null, cancellationToken);

            var rowVersion = await ReadReportRowVersionAsync(connection, transaction, report.Id, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new { visitId = id, reportId = report.Id, status = "Acknowledged", rowVersion });
        }
        catch
        {
            if (transaction.Connection is not null) await transaction.RollbackAsync(CancellationToken.None);
            throw;
        }
    }

    /* ===================================================================
       Closing
       =================================================================== */

    private static async Task<IResult> CloseAsync(
        long id, CloseVisitRequest request, SqlConnectionFactory connections, CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync(SiteVisitCore.PermVisitSchedule, cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        if (id <= 0) return Results.NotFound();
        InputValidation.RequiredText(request.Reason, 1_000, "Reason");
        var expected = SqlExtensions.ParseRowVersion(request.RowVersion);

        await using var connection = await connections.OpenAsync(cancellationToken);
        var permissions = await SiteVisitCore.LoadPermissionsAsync(connection, actor.Role, cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            var visit = await LockVisitAsync(connection, transaction, id, expected, cancellationToken);
            if (visit is null) return Results.NotFound();
            SiteVisitCore.RequireTransition(SiteVisitCore.VisitTransitions, visit.Status, "Closed", permissions, request.Reason);

            // Business rule: a closed visit either carries an approved report or
            // states in writing why there is none. The reason column is the
            // second half of that rule, and it is mandatory above.
            var hasApprovedReport = false;
            await using (var command = new SqlCommand("""
                SELECT CASE WHEN EXISTS (
                    SELECT 1 FROM dbo.site_visit_reports
                    WHERE visit_id = @visit_id AND status IN (N'Approved', N'Acknowledged')) THEN 1 ELSE 0 END;
                """, connection, transaction))
            {
                command.Parameters.AddParameter("@visit_id", SqlDbType.BigInt, id);
                hasApprovedReport = (int)(await command.ExecuteScalarAsync(cancellationToken))! == 1;
            }
            if (!hasApprovedReport && request.Reason.Trim().Length < 20)
                throw new ApiException(StatusCodes.Status422UnprocessableEntity, "close_reason_required",
                    "Closing a visit without an approved report needs a written explanation of at least twenty characters.");

            await using (var command = new SqlCommand("""
                UPDATE dbo.site_visits
                   SET status = N'Closed', closed_at = SYSUTCDATETIME(), closed_by = @actor, close_reason = @reason,
                       updated_by = @actor, updated_at = SYSUTCDATETIME()
                 WHERE id = @id;
                """, connection, transaction))
            {
                command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
                command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                command.Parameters.AddParameter("@reason", SqlDbType.NVarChar, request.Reason.Trim(), 1_000);
                await command.ExecuteNonQueryAsync(cancellationToken);
            }

            await SiteVisitCore.RecordStatusAsync(connection, transaction, SiteVisitCore.EntityVisit, id, visit.Number,
                visit.Status, "Closed", request.Reason, actor.Id, cancellationToken);
            await SiteVisitCore.AuditAsync(connection, transaction, actor.Id, SiteVisitCore.EntityVisit, id, visit.Number,
                "Visit closed", new { status = visit.Status }, new { status = "Closed", hasApprovedReport }, request.Reason, cancellationToken);

            var rowVersion = await ReadVisitRowVersionAsync(connection, transaction, id, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new { id, status = "Closed", hasApprovedReport, rowVersion });
        }
        catch
        {
            if (transaction.Connection is not null) await transaction.RollbackAsync(CancellationToken.None);
            throw;
        }
    }

    /* ===================================================================
       Traceability: Intake -> Visit -> Report -> Inquiry -> Estimate -> Project
       =================================================================== */

    private static async Task<IResult> LinkAsync(
        long id, LinkRecordRequest request, SqlConnectionFactory connections, CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync(SiteVisitCore.PermVisitLink, cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        if (id <= 0 || request.TargetId <= 0) return Results.NotFound();
        InputValidation.OneOf(request.TargetType, "Target type", "Inquiry", "Estimate", "Project");
        InputValidation.OptionalText(request.Note, 1_000, "Note");
        var relation = string.IsNullOrWhiteSpace(request.Relation) ? "Related To" : request.Relation.Trim();
        InputValidation.OneOf(relation, "Relation", "Derived From", "Related To", "Follow-up");

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken);
        try
        {
            string visitNumber;
            long intakeId;
            await using (var command = new SqlCommand(
                "SELECT visit_no, intake_id FROM dbo.site_visits WHERE id = @id AND deleted_at IS NULL;", connection, transaction))
            {
                command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
                await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
                if (!await reader.ReadAsync(cancellationToken)) return Results.NotFound();
                visitNumber = reader.GetString(0);
                intakeId = reader.GetInt64(1);
            }

            var targetNumber = await ResolveTargetNumberAsync(connection, transaction, request.TargetType, request.TargetId, cancellationToken);
            await InsertLinkAsync(connection, transaction, SiteVisitCore.EntityVisit, id, request.TargetType,
                request.TargetId, targetNumber, relation, request.Note, actor.Id, cancellationToken);
            // The intake is linked too, so a salesperson looking at their own
            // record sees the estimate without having to open the visit.
            await InsertLinkAsync(connection, transaction, SiteVisitCore.EntityIntake, intakeId, request.TargetType,
                request.TargetId, targetNumber, relation, request.Note, actor.Id, cancellationToken);

            await SiteVisitCore.AuditAsync(connection, transaction, actor.Id, SiteVisitCore.EntityVisit, id, visitNumber,
                $"{request.TargetType} linked", null, new { request.TargetType, request.TargetId, targetNumber, relation },
                request.Note, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new { id, request.TargetType, request.TargetId, targetNumber });
        }
        catch
        {
            if (transaction.Connection is not null) await transaction.RollbackAsync(CancellationToken.None);
            throw;
        }
    }

    private static async Task<string> ResolveTargetNumberAsync(
        SqlConnection connection, SqlTransaction transaction, string targetType, long targetId, CancellationToken cancellationToken)
    {
        var sql = targetType switch
        {
            "Inquiry" => "SELECT inquiry_no FROM dbo.inquiries WHERE id = @target_id AND deleted_at IS NULL;",
            "Estimate" => "SELECT estimate_no FROM dbo.estimates WHERE id = @target_id AND deleted_at IS NULL;",
            "Project" => "SELECT project_no FROM dbo.projects WHERE id = @target_id AND deleted_at IS NULL;",
            _ => throw new ApiException(StatusCodes.Status400BadRequest, "validation_failed", "Unsupported link target."),
        };
        await using var command = new SqlCommand(sql, connection, transaction);
        command.Parameters.AddParameter("@target_id", SqlDbType.BigInt, targetId);
        return await command.ExecuteScalarAsync(cancellationToken) as string
            ?? throw new ApiException(StatusCodes.Status422UnprocessableEntity, "invalid_reference",
                $"The {targetType.ToLowerInvariant()} does not exist.");
    }

    /// <summary>Idempotent: the unique key makes a repeated link a no-op.</summary>
    private static async Task InsertLinkAsync(
        SqlConnection connection, SqlTransaction transaction, string sourceType, long sourceId,
        string targetType, long targetId, string targetNumber, string relation, string? note,
        long actorId, CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            IF NOT EXISTS (
                SELECT 1 FROM dbo.site_visit_links WITH (UPDLOCK, HOLDLOCK)
                WHERE source_type = @source_type AND source_id = @source_id
                  AND target_type = @target_type AND target_id = @target_id)
            INSERT INTO dbo.site_visit_links
                (source_type, source_id, target_type, target_id, target_no, relation, note, created_by)
            VALUES (@source_type, @source_id, @target_type, @target_id, @target_no, @relation, @note, @actor);
            """, connection, transaction);
        command.Parameters.AddParameter("@source_type", SqlDbType.NVarChar, sourceType, 30);
        command.Parameters.AddParameter("@source_id", SqlDbType.BigInt, sourceId);
        command.Parameters.AddParameter("@target_type", SqlDbType.NVarChar, targetType, 30);
        command.Parameters.AddParameter("@target_id", SqlDbType.BigInt, targetId);
        command.Parameters.AddParameter("@target_no", SqlDbType.NVarChar, targetNumber, 50);
        command.Parameters.AddParameter("@relation", SqlDbType.NVarChar, relation, 30);
        command.Parameters.AddParameter("@note", SqlDbType.NVarChar, SiteVisitCore.Trim(note, 1_000, "Note"), 1_000);
        command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actorId);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    /// <summary>
    /// Creates an inquiry from the visit, carrying the customer, the site, the
    /// requirement, the findings, the proposed scope, the assumptions and the
    /// exclusions across so nobody retypes them. The visit stays the source of
    /// record; the inquiry holds a copy plus a link back.
    /// </summary>
    private static async Task<IResult> CreateInquiryAsync(
        long id, CreateInquiryFromVisitRequest request, SqlConnectionFactory connections, CurrentUserService users,
        BusinessClock clock, CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync(SiteVisitCore.PermVisitLink, cancellationToken);
        await users.DemandPermissionAsync("inquiry.write", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        if (id <= 0) return Results.NotFound();
        InputValidation.RequiredText(request.ProjectName, 300, "Project name");
        InputValidation.RequiredText(request.ProjectType, 100, "Project type");
        InputValidation.OneOf(request.Priority, "Priority", "Low", "Normal", "High", "Urgent");
        var grade = (request.CustomerInterestGrade ?? "C").Trim().ToUpperInvariant();
        InputValidation.OneOf(grade, "Customer interest grade", "A", "B", "C", "D");
        if (request.ProjectProbability is < 0 or > 100) throw Invalid("Project probability must be between 0 and 100.");
        InputValidation.OptionalText(request.Remark, 20_000, "Remark");
        var today = clock.Today;
        if (request.DueDate < today || request.DueDate > today.AddYears(5))
            throw Invalid("The estimate due date must be between today and five years from today.");
        if (request.EstimateOwnerId <= 0) throw Invalid("An estimate owner is required.");

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            var carry = await LoadCarryOverAsync(connection, transaction, id, cancellationToken);
            if (carry is null) return Results.NotFound();
            await using (var existing = new SqlCommand("""
                SELECT TOP(1) target_id FROM dbo.site_visit_links WITH (UPDLOCK, HOLDLOCK)
                WHERE target_type=N'Inquiry' AND ((source_type=N'SiteVisit' AND source_id=@visit)
                    OR (source_type=N'SalesIntake' AND source_id=@intake))
                UNION ALL SELECT related_inquiry_id FROM dbo.sales_intakes WITH (UPDLOCK, HOLDLOCK)
                    WHERE id=@intake AND related_inquiry_id IS NOT NULL;
                """, connection, transaction))
            {
                existing.Parameters.AddParameter("@visit", SqlDbType.BigInt, id);
                existing.Parameters.AddParameter("@intake", SqlDbType.BigInt, carry.IntakeId);
                if (await existing.ExecuteScalarAsync(cancellationToken) is not null)
                    throw new ApiException(StatusCodes.Status409Conflict, "inquiry_already_linked",
                        "This visit already belongs to an inquiry. Open the existing inquiry to continue.");
            }
            if (carry.ReportStatus is not ("Approved" or "Acknowledged"))
                throw new ApiException(StatusCodes.Status409Conflict, "report_not_approved",
                    "An inquiry is created from a confirmed site visit — approve the report first.");

            var number = await InquiryEndpoints.IssueNumberAsync(connection, transaction, "INQ", today, cancellationToken);
            long inquiryId;
            await using (var command = new SqlCommand("""
                INSERT INTO dbo.inquiries (
                    inquiry_no, inquiry_date, customer_id, contact, project_name, project_type, rfq_no,
                    sales_owner, estimate_owner_id, due_date, priority, status, progress, revision,
                    project_probability, customer_interest_grade, qualification_note,
                    requirement, background, scope_summary, technical, site_location, standard, special, remark,
                    created_by, updated_by)
                OUTPUT inserted.id
                VALUES (@number, @today, @customer_id, @contact, @project_name, @project_type, @rfq_no,
                    @sales_owner, @estimate_owner_id, @due_date, @priority, N'New', 0, 0,
                    @probability, @grade, @qualification_note,
                    @requirement, @background, @scope_summary, @technical, @site_location, @standard, @special, @remark,
                    @actor, @actor);
                """, connection, transaction))
            {
                command.Parameters.AddParameter("@number", SqlDbType.NVarChar, number, 30);
                command.Parameters.AddParameter("@today", SqlDbType.Date, today);
                command.Parameters.AddParameter("@customer_id", SqlDbType.BigInt, carry.CustomerId);
                command.Parameters.AddParameter("@contact", SqlDbType.NVarChar, carry.ContactName, 200);
                command.Parameters.AddParameter("@project_name", SqlDbType.NVarChar, request.ProjectName.Trim(), 300);
                command.Parameters.AddParameter("@project_type", SqlDbType.NVarChar, request.ProjectType.Trim(), 100);
                command.Parameters.AddParameter("@rfq_no", SqlDbType.NVarChar,
                    carry.CustomerReferenceNo.Length == 0 ? null : carry.CustomerReferenceNo, 100);
                command.Parameters.AddParameter("@sales_owner", SqlDbType.NVarChar, carry.SalesOwnerName, 200);
                command.Parameters.AddParameter("@estimate_owner_id", SqlDbType.BigInt, request.EstimateOwnerId);
                command.Parameters.AddParameter("@due_date", SqlDbType.Date, request.DueDate);
                command.Parameters.AddParameter("@priority", SqlDbType.NVarChar, request.Priority.Trim(), 30);
                command.Parameters.AddParameter("@probability", SqlDbType.TinyInt, (byte)request.ProjectProbability);
                command.Parameters.AddParameter("@grade", SqlDbType.Char, grade, 1);
                command.Parameters.AddParameter("@qualification_note", SqlDbType.NVarChar,
                    SiteVisitCore.Trim($"Created from site visit {carry.VisitNumber} ({carry.IntakeNumber}).", 2_000, "Qualification note"), 2_000);
                command.Parameters.AddParameter("@requirement", SqlDbType.NVarChar, carry.Requirement, -1);
                command.Parameters.AddParameter("@background", SqlDbType.NVarChar, carry.Background, -1);
                command.Parameters.AddParameter("@scope_summary", SqlDbType.NVarChar, carry.ProposedScope, -1);
                command.Parameters.AddParameter("@technical", SqlDbType.NVarChar, carry.Technical, -1);
                command.Parameters.AddParameter("@site_location", SqlDbType.NVarChar, carry.SiteName, 300);
                command.Parameters.AddParameter("@standard", SqlDbType.NVarChar, carry.Assumption, -1);
                command.Parameters.AddParameter("@special", SqlDbType.NVarChar, carry.Exclusion, -1);
                command.Parameters.AddParameter("@remark", SqlDbType.NVarChar,
                    SiteVisitCore.TrimOrNull(request.Remark, 20_000, "Remark") ?? carry.Risk, -1);
                command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                inquiryId = (long)(await command.ExecuteScalarAsync(cancellationToken))!;
            }

            await InsertLinkAsync(connection, transaction, SiteVisitCore.EntityVisit, id, "Inquiry", inquiryId, number,
                "Derived From", $"Created from {carry.VisitNumber}", actor.Id, cancellationToken);
            await InsertLinkAsync(connection, transaction, SiteVisitCore.EntityIntake, carry.IntakeId, "Inquiry", inquiryId, number,
                "Derived From", $"Created from {carry.VisitNumber}", actor.Id, cancellationToken);
            await using (var command = new SqlCommand(
                "UPDATE dbo.sales_intakes SET related_inquiry_id = ISNULL(related_inquiry_id, @inquiry_id) WHERE id = @intake_id;",
                connection, transaction))
            {
                command.Parameters.AddParameter("@inquiry_id", SqlDbType.BigInt, inquiryId);
                command.Parameters.AddParameter("@intake_id", SqlDbType.BigInt, carry.IntakeId);
                await command.ExecuteNonQueryAsync(cancellationToken);
            }

            await SiteVisitCore.AuditAsync(connection, transaction, actor.Id, SiteVisitCore.EntityVisit, id, carry.VisitNumber,
                "Inquiry created from site visit", null, new { inquiryId, number, request.ProjectName }, null, cancellationToken);
            await SiteVisitCore.NotifyAsync(connection, transaction, [carry.SalesOwnerId, request.EstimateOwnerId],
                "visit.inquiry_created", $"{number} was created from {carry.VisitNumber}",
                "A site visit has been converted into an inquiry.", SiteVisitCore.EntityVisit, id,
                $"visit.inquiry_created:{SiteVisitCore.EntityVisit}:{id}:{inquiryId}", cancellationToken);

            await transaction.CommitAsync(cancellationToken);
            return Results.Created($"/api/v1/inquiries/{inquiryId}", new { visitId = id, inquiryId, number });
        }
        catch
        {
            if (transaction.Connection is not null) await transaction.RollbackAsync(CancellationToken.None);
            throw;
        }
    }

    private sealed record CarryOver(
        long VisitId, string VisitNumber, long IntakeId, string IntakeNumber, long CustomerId, string SiteName,
        string ContactName, string CustomerReferenceNo, long SalesOwnerId, string SalesOwnerName,
        string Requirement, string Background, string Technical, string ProposedScope, string Assumption,
        string Exclusion, string Risk, string? ReportStatus, long? ExistingInquiryId);

    private static async Task<CarryOver?> LoadCarryOverAsync(
        SqlConnection connection, SqlTransaction transaction, long visitId, CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            SELECT v.id, v.visit_no, i.id, i.intake_no, i.customer_id, i.site_name, i.contact_name,
                   i.customer_reference_no, i.sales_owner_id, so.name,
                   CONCAT_WS(CHAR(10) + CHAR(10),
                       NULLIF(i.problem_statement, N''), NULLIF(i.desired_capability, N''),
                       NULLIF(i.expected_result, N''), NULLIF(rv.findings_summary, N'')),
                   CONCAT_WS(CHAR(10) + CHAR(10), NULLIF(i.existing_process, N''), NULLIF(i.current_pain_point, N''),
                       NULLIF(rv.existing_condition, N'')),
                   CONCAT_WS(CHAR(10) + CHAR(10), NULLIF(i.machine_name, N''), NULLIF(i.controller_brand, N''),
                       NULLIF(rv.measurement_summary, N''), NULLIF(rv.recommended_solution, N'')),
                   ISNULL(rv.proposed_scope, ISNULL(i.expected_scope, N'')),
                   ISNULL(rv.assumption, N''), ISNULL(rv.exclusion, ISNULL(i.out_of_scope, N'')), ISNULL(rv.risk, N''),
                   r.status, i.related_inquiry_id
            FROM dbo.site_visits v
            INNER JOIN dbo.sales_intakes i ON i.id = v.intake_id
            INNER JOIN dbo.users so ON so.id = i.sales_owner_id
            LEFT JOIN dbo.site_visit_reports r ON r.visit_id = v.id
            LEFT JOIN dbo.site_visit_report_revisions rv ON rv.report_id = r.id AND rv.status = N'Approved'
            WHERE v.id = @visit_id AND v.deleted_at IS NULL;
            """, connection, transaction);
        command.Parameters.AddParameter("@visit_id", SqlDbType.BigInt, visitId);
        await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
        if (!await reader.ReadAsync(cancellationToken)) return null;
        string S(int i) => reader.IsDBNull(i) ? "" : reader.GetString(i);
        return new CarryOver(reader.GetInt64(0), reader.GetString(1), reader.GetInt64(2), reader.GetString(3),
            reader.GetInt64(4), S(5), S(6), S(7), reader.GetInt64(8), S(9),
            S(10), S(11), S(12), S(13), S(14), S(15), S(16),
            reader.IsDBNull(17) ? null : reader.GetString(17),
            reader.IsDBNull(18) ? null : reader.GetInt64(18));
    }

    /// <summary>
    /// Creates the estimate for the visit's inquiry. An approved estimate is
    /// never edited: if one already exists in an approved state the caller is
    /// told to raise a revision through the estimate module's own workflow,
    /// which is the only place that rule lives.
    /// </summary>
    private static async Task<IResult> CreateEstimateAsync(
        long id, SqlConnectionFactory connections, CurrentUserService users, BusinessClock clock,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync(SiteVisitCore.PermVisitLink, cancellationToken);
        await users.DemandPermissionAsync("estimate.write", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        if (id <= 0) return Results.NotFound();

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            var carry = await LoadCarryOverAsync(connection, transaction, id, cancellationToken);
            if (carry is null) return Results.NotFound();

            long inquiryId;
            string inquiryNumber;
            string projectName;
            string projectType;
            long ownerId;
            DateOnly dueDate;
            long? estimateId;
            await using (var command = new SqlCommand("""
                SELECT TOP (1) i.id, i.inquiry_no, i.project_name, i.project_type, i.estimate_owner_id, i.due_date, i.estimate_id
                FROM dbo.site_visit_links l
                INNER JOIN dbo.inquiries i ON i.id = l.target_id AND i.deleted_at IS NULL
                WHERE l.source_type = @source_type AND l.source_id = @source_id AND l.target_type = N'Inquiry'
                ORDER BY l.created_at DESC, l.id DESC;
                """, connection, transaction))
            {
                command.Parameters.AddParameter("@source_type", SqlDbType.NVarChar, SiteVisitCore.EntityVisit, 30);
                command.Parameters.AddParameter("@source_id", SqlDbType.BigInt, id);
                await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
                if (!await reader.ReadAsync(cancellationToken))
                    throw new ApiException(StatusCodes.Status409Conflict, "inquiry_required",
                        "Create or link an inquiry first — an estimate always belongs to one.");
                inquiryId = reader.GetInt64(0);
                inquiryNumber = reader.GetString(1);
                projectName = reader.GetString(2);
                projectType = reader.GetString(3);
                ownerId = reader.GetInt64(4);
                dueDate = reader.GetFieldValue<DateOnly>(5);
                estimateId = reader.IsDBNull(6) ? null : reader.GetInt64(6);
            }

            if (estimateId is { } existingId)
            {
                // Already estimated. Link it rather than making a second one,
                // and say plainly why nothing was created.
                string existingStatus;
                string existingNumber;
                await using (var command = new SqlCommand(
                    "SELECT status, estimate_no FROM dbo.estimates WHERE id = @estimate_id AND deleted_at IS NULL;", connection, transaction))
                {
                    command.Parameters.AddParameter("@estimate_id", SqlDbType.BigInt, existingId);
                    await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
                    if (!await reader.ReadAsync(cancellationToken))
                        throw new ApiException(StatusCodes.Status409Conflict, "estimate_missing", "The linked estimate no longer exists.");
                    existingStatus = reader.GetString(0);
                    existingNumber = reader.GetString(1);
                }
                await InsertLinkAsync(connection, transaction, SiteVisitCore.EntityVisit, id, "Estimate", existingId,
                    existingNumber, "Related To", $"Existing estimate for {inquiryNumber}", actor.Id, cancellationToken);
                await InsertLinkAsync(connection, transaction, SiteVisitCore.EntityIntake, carry.IntakeId, "Estimate", existingId,
                    existingNumber, "Related To", $"Existing estimate for {inquiryNumber}", actor.Id, cancellationToken);
                await SiteVisitCore.AuditAsync(connection, transaction, actor.Id, SiteVisitCore.EntityVisit, id, carry.VisitNumber,
                    "Existing estimate linked", null, new { estimateId = existingId, existingNumber, existingStatus }, null, cancellationToken);
                await transaction.CommitAsync(cancellationToken);
                return Results.Ok(new
                {
                    visitId = id,
                    estimateId = existingId,
                    number = existingNumber,
                    status = existingStatus,
                    created = false,
                    message = existingStatus is "Approved" or "Locked"
                        ? $"{existingNumber} is {existingStatus.ToLowerInvariant()} and cannot be edited. Raise a revision in the Estimate Cost module."
                        : $"{existingNumber} already exists for {inquiryNumber} and has been linked to this visit.",
                });
            }

            var number = await InquiryEndpoints.IssueNumberAsync(connection, transaction, "EST", clock.Today, cancellationToken);
            long newEstimateId;
            await using (var command = new SqlCommand("""
                INSERT INTO dbo.estimates (
                    estimate_no, inquiry_id, customer_id, project_name, project_type, owner_id,
                    revision, created_date, due_date, status, progress, contingency_rate, created_by, updated_by)
                OUTPUT inserted.id
                VALUES (@number, @inquiry_id, @customer_id, @project_name, @project_type, @owner_id,
                    0, @today, @due_date, N'Draft', 0, 0, @actor, @actor);
                """, connection, transaction))
            {
                command.Parameters.AddParameter("@number", SqlDbType.NVarChar, number, 30);
                command.Parameters.AddParameter("@inquiry_id", SqlDbType.BigInt, inquiryId);
                command.Parameters.AddParameter("@customer_id", SqlDbType.BigInt, carry.CustomerId);
                command.Parameters.AddParameter("@project_name", SqlDbType.NVarChar, projectName, 300);
                command.Parameters.AddParameter("@project_type", SqlDbType.NVarChar, projectType, 100);
                command.Parameters.AddParameter("@owner_id", SqlDbType.BigInt, ownerId);
                command.Parameters.AddParameter("@today", SqlDbType.Date, clock.Today);
                command.Parameters.AddParameter("@due_date", SqlDbType.Date, dueDate);
                command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                newEstimateId = (long)(await command.ExecuteScalarAsync(cancellationToken))!;
            }

            await using (var command = new SqlCommand("""
                UPDATE dbo.inquiries
                   SET estimate_id = @estimate_id, status = N'Estimating', updated_by = @actor, updated_at = SYSUTCDATETIME()
                 WHERE id = @inquiry_id AND status = N'New' AND estimate_id IS NULL AND deleted_at IS NULL;
                """, connection, transaction))
            {
                command.Parameters.AddParameter("@estimate_id", SqlDbType.BigInt, newEstimateId);
                command.Parameters.AddParameter("@inquiry_id", SqlDbType.BigInt, inquiryId);
                command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                if (await command.ExecuteNonQueryAsync(cancellationToken) != 1)
                    throw new ApiException(StatusCodes.Status409Conflict, "inquiry_not_eligible",
                        "The inquiry can no longer be converted to an estimate.");
            }

            await InsertLinkAsync(connection, transaction, SiteVisitCore.EntityVisit, id, "Estimate", newEstimateId, number,
                "Derived From", $"Created from {carry.VisitNumber}", actor.Id, cancellationToken);
            await InsertLinkAsync(connection, transaction, SiteVisitCore.EntityIntake, carry.IntakeId, "Estimate", newEstimateId, number,
                "Derived From", $"Created from {carry.VisitNumber}", actor.Id, cancellationToken);
            await SiteVisitCore.AuditAsync(connection, transaction, actor.Id, SiteVisitCore.EntityVisit, id, carry.VisitNumber,
                "Estimate created from site visit", null, new { estimateId = newEstimateId, number, inquiryId }, null, cancellationToken);
            await SiteVisitCore.NotifyAsync(connection, transaction, [ownerId, carry.SalesOwnerId],
                "visit.estimate_created", $"{number} was created from {carry.VisitNumber}",
                "A site visit has been converted into an estimate.", SiteVisitCore.EntityVisit, id,
                $"visit.estimate_created:{SiteVisitCore.EntityVisit}:{id}:{newEstimateId}", cancellationToken);

            await transaction.CommitAsync(cancellationToken);
            return Results.Created($"/api/v1/estimates/{newEstimateId}",
                new { visitId = id, estimateId = newEstimateId, number, inquiryId, created = true });
        }
        catch
        {
            if (transaction.Connection is not null) await transaction.RollbackAsync(CancellationToken.None);
            throw;
        }
    }

    /* ===================================================================
       Calendar, pre-visit brief and My Assignments
       =================================================================== */

    private static async Task<IResult> CalendarAsync(
        DateOnly? from, DateOnly? to, long? engineerId, string? department,
        SqlConnectionFactory connections, CurrentUserService users, BusinessClock clock, CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync(SiteVisitCore.PermVisitRead, cancellationToken);
        InputValidation.OptionalText(department, 100, "Department");
        var start = from ?? clock.Today.AddDays(-7);
        var end = to ?? start.AddDays(42);
        if (end < start) throw Invalid("The calendar range is invalid.");
        if (end.DayNumber - start.DayNumber > 400) throw Invalid("A calendar range may not exceed 400 days.");
        var fromAt = new DateTimeOffset(start.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
        var toAt = new DateTimeOffset(end.AddDays(1).ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);

        await using var connection = await connections.OpenAsync(cancellationToken);
        var visits = new List<CalendarEntryRecord>();
        await using (var command = new SqlCommand("""
            SELECT v.id, v.visit_no, v.status, c.name, i.site_name, t.name_en,
                   v.scheduled_start, v.scheduled_end, v.travel_minutes_before, v.travel_minutes_after,
                   ISNULL(STUFF((SELECT N',' + CONVERT(nvarchar(20), a.engineer_id)
                        FROM dbo.site_visit_assignments a WHERE a.visit_id = v.id AND a.is_active = 1
                        FOR XML PATH(N''), TYPE).value(N'.', N'nvarchar(max)'), 1, 1, N''), N''),
                   ISNULL(STUFF((SELECT N', ' + u.name FROM dbo.site_visit_assignments a
                        INNER JOIN dbo.users u ON u.id = a.engineer_id
                        WHERE a.visit_id = v.id AND a.is_active = 1 ORDER BY a.assignment_role, u.name
                        FOR XML PATH(N''), TYPE).value(N'.', N'nvarchar(max)'), 1, 2, N''), N'')
            FROM dbo.site_visits v
            INNER JOIN dbo.sales_intakes i ON i.id = v.intake_id
            INNER JOIN dbo.customers c ON c.id = i.customer_id
            INNER JOIN dbo.visit_types t ON t.id = v.visit_type_id
            WHERE v.deleted_at IS NULL AND v.archived_at IS NULL
              AND v.scheduled_start IS NOT NULL
              AND v.scheduled_start < @to AND v.scheduled_end >= @from
              AND (@department IS NULL OR v.department = @department)
              AND (@engineer_id IS NULL OR EXISTS (
                    SELECT 1 FROM dbo.site_visit_assignments a
                    WHERE a.visit_id = v.id AND a.is_active = 1 AND a.engineer_id = @engineer_id))
            ORDER BY v.scheduled_start;
            """, connection))
        {
            command.Parameters.AddParameter("@from", SqlDbType.DateTimeOffset, fromAt);
            command.Parameters.AddParameter("@to", SqlDbType.DateTimeOffset, toAt);
            command.Parameters.AddParameter("@engineer_id", SqlDbType.BigInt, engineerId is > 0 ? engineerId : null);
            command.Parameters.AddParameter("@department", SqlDbType.NVarChar, string.IsNullOrWhiteSpace(department) ? null : department.Trim(), 100);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
                visits.Add(new CalendarEntryRecord(reader.GetInt64(0), reader.GetString(1), reader.GetString(2),
                    reader.GetString(3), reader.GetString(4), reader.GetString(5),
                    reader.GetFieldValue<DateTimeOffset>(6), reader.GetFieldValue<DateTimeOffset>(7),
                    reader.GetInt32(8), reader.GetInt32(9),
                    reader.GetString(10).Split(',', StringSplitOptions.RemoveEmptyEntries).Select(long.Parse).ToArray(),
                    reader.GetString(11)));
        }

        var unavailable = new List<CalendarUnavailableRecord>();
        await using (var command = new SqlCommand("""
            SELECT e.id, e.user_id, u.name, e.kind, e.reason, e.starts_at, e.ends_at
            FROM dbo.engineer_availability e
            INNER JOIN dbo.users u ON u.id = e.user_id
            WHERE e.deleted_at IS NULL AND e.starts_at < @to AND e.ends_at >= @from
              AND (@engineer_id IS NULL OR e.user_id = @engineer_id)
            ORDER BY e.starts_at;
            """, connection))
        {
            command.Parameters.AddParameter("@from", SqlDbType.DateTimeOffset, fromAt);
            command.Parameters.AddParameter("@to", SqlDbType.DateTimeOffset, toAt);
            command.Parameters.AddParameter("@engineer_id", SqlDbType.BigInt, engineerId is > 0 ? engineerId : null);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
                unavailable.Add(new CalendarUnavailableRecord(reader.GetInt64(0), reader.GetInt64(1), reader.GetString(2),
                    reader.GetString(3), reader.GetString(4), reader.GetFieldValue<DateTimeOffset>(5),
                    reader.GetFieldValue<DateTimeOffset>(6)));
        }

        return Results.Ok(new CalendarResult(fromAt, toAt, visits, unavailable));
    }

    private static async Task<IResult> BriefAsync(
        long id, SqlConnectionFactory connections, CurrentUserService users, BusinessClock clock, CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync(SiteVisitCore.PermVisitRead, cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        if (id <= 0) return Results.NotFound();

        await using var connection = await connections.OpenAsync(cancellationToken);
        var permissions = await SiteVisitCore.LoadPermissionsAsync(connection, actor.Role, cancellationToken);
        var visit = await LoadDetailAsync(connection, id, actor.Id, permissions, clock, cancellationToken);
        if (visit is null) return Results.NotFound();

        var intake = await SalesIntakeEndpoints.LoadDetailAsync(connection, visit.IntakeId, permissions, clock, cancellationToken);
        if (intake is null) return Results.NotFound();

        // Open questions are the readiness checks that never passed plus the
        // information the reviewer said was missing. The brief is where they
        // become somebody's problem before the engineer is at the gate.
        var openQuestions = intake.Readiness.Checks.Where(check => !check.Passed).Select(check => check.Label).ToList();
        foreach (var review in intake.Reviews.Where(review => review.MissingInformation.Length > 0).Take(1))
            openQuestions.AddRange(review.MissingInformation.Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));

        var previous = new List<PreviousVisitRecord>();
        await using (var command = new SqlCommand("""
            SELECT TOP (10) v.id, v.visit_no, t.name_en, v.status, v.scheduled_start,
                   ISNULL(STUFF((SELECT N', ' + u.name FROM dbo.site_visit_assignments a
                        INNER JOIN dbo.users u ON u.id = a.engineer_id
                        WHERE a.visit_id = v.id AND a.is_active = 1 ORDER BY u.name
                        FOR XML PATH(N''), TYPE).value(N'.', N'nvarchar(max)'), 1, 2, N''), N''),
                   r.status
            FROM dbo.site_visits v
            INNER JOIN dbo.sales_intakes i ON i.id = v.intake_id
            INNER JOIN dbo.visit_types t ON t.id = v.visit_type_id
            LEFT JOIN dbo.site_visit_reports r ON r.visit_id = v.id
            WHERE v.deleted_at IS NULL AND v.id <> @visit_id AND i.customer_id = @customer_id
            ORDER BY v.scheduled_start DESC, v.id DESC;
            """, connection))
        {
            command.Parameters.AddParameter("@visit_id", SqlDbType.BigInt, id);
            command.Parameters.AddParameter("@customer_id", SqlDbType.BigInt, visit.CustomerId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
                previous.Add(new PreviousVisitRecord(reader.GetInt64(0), reader.GetString(1), reader.GetString(2),
                    reader.GetString(3), reader.IsDBNull(4) ? null : reader.GetFieldValue<DateTimeOffset>(4),
                    reader.GetString(5), reader.IsDBNull(6) ? null : reader.GetString(6)));
        }

        var emergency = string.Join(" · ", new[]
        {
            intake.Contact.ContactName.Length > 0 ? $"{intake.Contact.ContactName} {intake.Contact.ContactPhone}".Trim() : "",
            $"Sales: {intake.SalesOwnerName}",
        }.Where(part => part.Length > 0));

        return Results.Ok(new PreVisitBriefRecord(visit, intake.Requirement, intake.Machine, intake.Purposes,
            intake.Attachments, openQuestions, previous, emergency));
    }

    private static async Task<IResult> MyAssignmentsAsync(
        bool? includeClosed, SqlConnectionFactory connections, CurrentUserService users, BusinessClock clock,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync(SiteVisitCore.PermVisitRead, cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var command = new SqlCommand("""
            SELECT v.id, v.visit_no, v.status, a.id, a.status, a.assignment_role,
                   c.name, i.site_name, i.site_address, i.subject, t.name_en,
                   v.scheduled_start, v.scheduled_end, i.contact_name, i.contact_phone,
                   v.checked_in_at, v.checked_out_at, v.report_due_at, r.status, r.submitted_at,
                   a.skill_match_percent, v.row_version, a.row_version
            FROM dbo.site_visit_assignments a
            INNER JOIN dbo.site_visits v ON v.id = a.visit_id
            INNER JOIN dbo.sales_intakes i ON i.id = v.intake_id
            INNER JOIN dbo.customers c ON c.id = i.customer_id
            INNER JOIN dbo.visit_types t ON t.id = v.visit_type_id
            LEFT JOIN dbo.site_visit_reports r ON r.visit_id = v.id
            WHERE a.engineer_id = @actor AND a.is_active = 1 AND v.deleted_at IS NULL AND v.archived_at IS NULL
              AND (@include_closed = 1 OR v.status NOT IN (N'Closed', N'Cancelled'))
            ORDER BY
                CASE WHEN v.scheduled_start IS NULL THEN 1 ELSE 0 END,
                v.scheduled_start, v.id;
            """, connection);
        command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
        command.Parameters.AddParameter("@include_closed", SqlDbType.Bit, includeClosed == true);

        var now = clock.UtcNow;
        var rows = new List<MyAssignmentRecord>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var reportDueAt = reader.IsDBNull(17) ? (DateTimeOffset?)null : reader.GetFieldValue<DateTimeOffset>(17);
            var reportStatus = reader.IsDBNull(18) ? null : reader.GetString(18);
            var submittedAt = reader.IsDBNull(19) ? (DateTimeOffset?)null : reader.GetFieldValue<DateTimeOffset>(19);
            rows.Add(new MyAssignmentRecord(
                reader.GetInt64(0), reader.GetString(1), reader.GetString(2), reader.GetInt64(3), reader.GetString(4),
                reader.GetString(5), reader.GetString(6), reader.GetString(7), reader.GetString(8), reader.GetString(9),
                reader.GetString(10),
                reader.IsDBNull(11) ? null : reader.GetFieldValue<DateTimeOffset>(11),
                reader.IsDBNull(12) ? null : reader.GetFieldValue<DateTimeOffset>(12),
                reader.GetString(13), reader.GetString(14),
                reader.IsDBNull(15) ? null : reader.GetFieldValue<DateTimeOffset>(15),
                reader.IsDBNull(16) ? null : reader.GetFieldValue<DateTimeOffset>(16),
                reportDueAt, SiteVisitCore.ReportSlaState(reportDueAt, now, reportStatus, submittedAt), reportStatus,
                reader.GetByte(20), reader.RowVersionString(21), reader.RowVersionString(22)));
        }
        return Results.Ok(rows);
    }

    /* ===================================================================
       Dashboards
       =================================================================== */

    private static async Task<IResult> EngineeringDashboardAsync(
        SqlConnectionFactory connections, CurrentUserService users, BusinessClock clock, CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync(SiteVisitCore.PermVisitRead, cancellationToken);
        await using var connection = await connections.OpenAsync(cancellationToken);

        long awaitingAssignment, awaitingConfirmation, today, thisWeek, conflicts, overdue;
        await using (var command = new SqlCommand("""
            SELECT
                (SELECT COUNT_BIG(*) FROM dbo.site_visits v
                  WHERE v.deleted_at IS NULL AND v.status NOT IN (N'Cancelled', N'Closed')
                    AND NOT EXISTS (SELECT 1 FROM dbo.site_visit_assignments a WHERE a.visit_id = v.id AND a.is_active = 1)),
                (SELECT COUNT_BIG(*) FROM dbo.site_visits
                  WHERE deleted_at IS NULL AND status IN (N'Pending Engineer Confirmation', N'Pending Customer Confirmation')),
                (SELECT COUNT_BIG(*) FROM dbo.site_visits
                  WHERE deleted_at IS NULL AND scheduled_start >= CONVERT(datetimeoffset, CONVERT(date, SYSUTCDATETIME()))
                    AND scheduled_start < DATEADD(DAY, 1, CONVERT(datetimeoffset, CONVERT(date, SYSUTCDATETIME())))
                    AND status NOT IN (N'Cancelled', N'Closed')),
                (SELECT COUNT_BIG(*) FROM dbo.site_visits
                  WHERE deleted_at IS NULL AND scheduled_start >= CONVERT(datetimeoffset, CONVERT(date, SYSUTCDATETIME()))
                    AND scheduled_start < DATEADD(DAY, 7, CONVERT(datetimeoffset, CONVERT(date, SYSUTCDATETIME())))
                    AND status NOT IN (N'Cancelled', N'Closed')),
                (SELECT COUNT_BIG(*) FROM dbo.site_visit_assignments WHERE is_active = 1 AND conflict_override = 1),
                (SELECT COUNT_BIG(*) FROM dbo.site_visits v
                  LEFT JOIN dbo.site_visit_reports r ON r.visit_id = v.id
                  WHERE v.deleted_at IS NULL AND v.report_due_at IS NOT NULL AND v.report_due_at < SYSUTCDATETIME()
                    AND (r.status IS NULL OR r.status IN (N'Draft', N'Revision Requested')));
            """, connection))
        {
            await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
            await reader.ReadAsync(cancellationToken);
            awaitingAssignment = reader.GetInt64(0); awaitingConfirmation = reader.GetInt64(1);
            today = reader.GetInt64(2); thisWeek = reader.GetInt64(3);
            conflicts = reader.GetInt64(4); overdue = reader.GetInt64(5);
        }

        var workload = new List<CountByLabel>();
        await using (var command = new SqlCommand("""
            SELECT TOP (20) u.name, COUNT_BIG(*)
            FROM dbo.site_visit_assignments a
            INNER JOIN dbo.users u ON u.id = a.engineer_id
            INNER JOIN dbo.site_visits v ON v.id = a.visit_id
            WHERE a.is_active = 1 AND v.deleted_at IS NULL AND v.status NOT IN (N'Cancelled', N'Closed')
            GROUP BY u.name ORDER BY COUNT_BIG(*) DESC, u.name;
            """, connection))
        {
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken)) workload.Add(new CountByLabel(reader.GetString(0), reader.GetInt64(1)));
        }

        var demand = new List<CountByLabel>();
        await using (var command = new SqlCommand("""
            SELECT TOP (20) k.name_en, COUNT_BIG(*)
            FROM dbo.sales_intake_skills s
            INNER JOIN dbo.visit_skills k ON k.id = s.skill_id
            INNER JOIN dbo.sales_intakes i ON i.id = s.intake_id
            WHERE i.deleted_at IS NULL AND i.status NOT IN (N'Cancelled', N'Closed')
            GROUP BY k.name_en ORDER BY COUNT_BIG(*) DESC, k.name_en;
            """, connection))
        {
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken)) demand.Add(new CountByLabel(reader.GetString(0), reader.GetInt64(1)));
        }

        var attention = new List<SiteVisitSummary>();
        await using (var command = new SqlCommand($"""
            SELECT TOP (12) {SummaryColumns}
            {SummaryFrom}
            WHERE v.deleted_at IS NULL AND v.archived_at IS NULL
              AND (v.status IN (N'Tentative', N'Reschedule Requested', N'Pending Engineer Confirmation')
                   OR (v.report_due_at IS NOT NULL AND v.report_due_at < SYSUTCDATETIME()
                       AND (r.status IS NULL OR r.status IN (N'Draft', N'Revision Requested'))))
            ORDER BY CASE WHEN v.report_due_at IS NOT NULL AND v.report_due_at < SYSUTCDATETIME() THEN 0 ELSE 1 END,
                     v.scheduled_start, v.id;
            """, connection))
        {
            var now = clock.UtcNow;
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken)) attention.Add(ReadSummary(reader, now));
        }

        return Results.Ok(new EngineeringVisitDashboard(awaitingAssignment, awaitingConfirmation, today, thisWeek,
            conflicts, overdue, workload, demand, attention));
    }

    private static async Task<IResult> ManagementDashboardAsync(
        SqlConnectionFactory connections, CurrentUserService users, CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("report.read", cancellationToken);
        await users.DemandPermissionAsync(SiteVisitCore.PermVisitRead, cancellationToken);
        await using var connection = await connections.OpenAsync(cancellationToken);

        long intakes, visits;
        decimal leadTime, completion, slaCompliance, toEstimate, toProject, cancelled, rescheduled, noShow;
        await using (var command = new SqlCommand("""
            DECLARE @intakes bigint = (SELECT COUNT_BIG(*) FROM dbo.sales_intakes WHERE deleted_at IS NULL);
            DECLARE @visits bigint = (SELECT COUNT_BIG(*) FROM dbo.site_visits WHERE deleted_at IS NULL);
            SELECT
                @intakes,
                @visits,
                -- Intake creation to a confirmed appointment, in days.
                ISNULL((SELECT AVG(CONVERT(decimal(18,2), DATEDIFF(HOUR, i.created_at, v.customer_confirmed_at)) / 24.0)
                        FROM dbo.site_visits v INNER JOIN dbo.sales_intakes i ON i.id = v.intake_id
                        WHERE v.deleted_at IS NULL AND v.customer_confirmed_at IS NOT NULL), 0),
                CASE WHEN @visits = 0 THEN 0 ELSE CONVERT(decimal(9,2),
                    (SELECT COUNT_BIG(*) FROM dbo.site_visits WHERE deleted_at IS NULL AND status IN (N'Completed', N'Closed'))
                    * 100.0 / @visits) END,
                -- Reports submitted before the deadline, over reports that had one.
                ISNULL((SELECT CONVERT(decimal(9,2), SUM(CASE WHEN r.submitted_at IS NOT NULL AND r.submitted_at <= r.due_at THEN 1.0 ELSE 0 END)
                            * 100.0 / NULLIF(COUNT_BIG(*), 0))
                        FROM dbo.site_visit_reports r WHERE r.due_at IS NOT NULL), 0),
                CASE WHEN @visits = 0 THEN 0 ELSE CONVERT(decimal(9,2),
                    (SELECT COUNT_BIG(DISTINCT source_id) FROM dbo.site_visit_links
                     WHERE source_type = N'SiteVisit' AND target_type = N'Estimate') * 100.0 / @visits) END,
                CASE WHEN @visits = 0 THEN 0 ELSE CONVERT(decimal(9,2),
                    (SELECT COUNT_BIG(DISTINCT source_id) FROM dbo.site_visit_links
                     WHERE source_type = N'SiteVisit' AND target_type = N'Project') * 100.0 / @visits) END,
                CASE WHEN @visits = 0 THEN 0 ELSE CONVERT(decimal(9,2),
                    (SELECT COUNT_BIG(*) FROM dbo.site_visits WHERE deleted_at IS NULL AND status = N'Cancelled') * 100.0 / @visits) END,
                CASE WHEN @visits = 0 THEN 0 ELSE CONVERT(decimal(9,2),
                    (SELECT COUNT_BIG(DISTINCT visit_id) FROM dbo.site_visit_schedule_history
                     WHERE previous_start IS NOT NULL) * 100.0 / @visits) END,
                CASE WHEN @visits = 0 THEN 0 ELSE CONVERT(decimal(9,2),
                    (SELECT COUNT_BIG(*) FROM dbo.site_visits WHERE deleted_at IS NULL AND status = N'Customer No-show') * 100.0 / @visits) END;
            """, connection))
        {
            await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
            await reader.ReadAsync(cancellationToken);
            intakes = reader.GetInt64(0); visits = reader.GetInt64(1);
            leadTime = reader.GetDecimal(2); completion = reader.GetDecimal(3); slaCompliance = reader.GetDecimal(4);
            toEstimate = reader.GetDecimal(5); toProject = reader.GetDecimal(6);
            cancelled = reader.GetDecimal(7); rescheduled = reader.GetDecimal(8); noShow = reader.GetDecimal(9);
        }

        async Task<List<CountByLabel>> GroupAsync(string sql)
        {
            var rows = new List<CountByLabel>();
            await using var command = new SqlCommand(sql, connection);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
                rows.Add(new CountByLabel(reader.IsDBNull(0) ? "—" : reader.GetString(0), reader.GetInt64(1)));
            return rows;
        }

        var byCustomer = await GroupAsync("""
            SELECT TOP (15) c.name, COUNT_BIG(*) FROM dbo.site_visits v
            INNER JOIN dbo.sales_intakes i ON i.id = v.intake_id
            INNER JOIN dbo.customers c ON c.id = i.customer_id
            WHERE v.deleted_at IS NULL GROUP BY c.name ORDER BY COUNT_BIG(*) DESC, c.name;
            """);
        var bySales = await GroupAsync("""
            SELECT TOP (15) u.name, COUNT_BIG(*) FROM dbo.sales_intakes i
            INNER JOIN dbo.users u ON u.id = i.sales_owner_id
            WHERE i.deleted_at IS NULL GROUP BY u.name ORDER BY COUNT_BIG(*) DESC, u.name;
            """);
        var byEngineer = await GroupAsync("""
            SELECT TOP (15) u.name, COUNT_BIG(*) FROM dbo.site_visit_assignments a
            INNER JOIN dbo.users u ON u.id = a.engineer_id
            INNER JOIN dbo.site_visits v ON v.id = a.visit_id
            WHERE a.is_active = 1 AND v.deleted_at IS NULL GROUP BY u.name ORDER BY COUNT_BIG(*) DESC, u.name;
            """);
        var byDepartment = await GroupAsync("""
            SELECT TOP (15) NULLIF(v.department, N''), COUNT_BIG(*) FROM dbo.site_visits v
            WHERE v.deleted_at IS NULL GROUP BY v.department ORDER BY COUNT_BIG(*) DESC;
            """);
        var byVisitType = await GroupAsync("""
            SELECT TOP (20) t.name_en, COUNT_BIG(*) FROM dbo.site_visits v
            INNER JOIN dbo.visit_types t ON t.id = v.visit_type_id
            WHERE v.deleted_at IS NULL GROUP BY t.name_en ORDER BY COUNT_BIG(*) DESC, t.name_en;
            """);

        return Results.Ok(new ManagementVisitDashboard(intakes, visits, leadTime, completion, slaCompliance,
            toEstimate, toProject, cancelled, rescheduled, noShow,
            byCustomer, bySales, byEngineer, byDepartment, byVisitType));
    }
}
